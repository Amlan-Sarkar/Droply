"""
Droply - Embedded Android yt-dlp Engine
Executes media extraction, formatting, and downloads locally inside Android.
"""

import os
import sys
import json
import re
import shutil
from typing import Dict, Any, Callable, Optional, List, Union
import yt_dlp

# Global cancellation and pause flags for active Android download
_is_cancelled = False
_is_paused = False
_ffmpeg_binary_path = None


class DownloadPausedException(Exception):
    pass


def cancel_active_download():
    global _is_cancelled, _is_paused
    _is_cancelled = True
    _is_paused = False


def pause_active_download():
    global _is_paused
    _is_paused = True


def resume_active_download():
    global _is_paused, _is_cancelled
    _is_paused = False
    _is_cancelled = False


def set_ffmpeg_path(path: str):
    global _ffmpeg_binary_path
    if path and os.path.exists(path):
        _ffmpeg_binary_path = path


def get_ffmpeg_path() -> Optional[str]:
    global _ffmpeg_binary_path
    if _ffmpeg_binary_path and os.path.exists(_ffmpeg_binary_path):
        return _ffmpeg_binary_path

    # Check common Android and system locations
    candidates = [
        "/data/data/com.droply.app/files/ffmpeg",
        "/data/data/com.droply.app/lib/libffmpeg.so",
        "/data/user/0/com.droply.app/files/ffmpeg",
        "/data/user/0/com.droply.app/lib/libffmpeg.so",
        shutil.which('ffmpeg'),
        shutil.which('ffmpeg.exe'),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            try:
                if not os.access(c, os.X_OK):
                    os.chmod(c, 0o755)
            except Exception:
                pass
            _ffmpeg_binary_path = c
            return c
    return None


def has_ffmpeg() -> bool:
    return get_ffmpeg_path() is not None


def locate_cookie_file() -> Optional[str]:
    """Finds cookies.txt on Android in public Download folder or app storage."""
    candidates = [
        "/storage/emulated/0/Download/Droply/cookies.txt",
        "/storage/emulated/0/Download/cookies.txt",
        os.path.expanduser("~/Download/Droply/cookies.txt"),
        os.path.expanduser("~/Download/cookies.txt"),
        "/data/data/com.droply.app/files/cookies.txt",
        "/data/user/0/com.droply.app/files/cookies.txt"
    ]
    for c in candidates:
        if c and os.path.isfile(c) and os.path.getsize(c) > 0:
            return c
    return None


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return cleaned[:180] if len(cleaned) > 180 else cleaned


def format_bytes(b: Optional[Union[int, float]]) -> str:
    if not b or b <= 0:
        return "Unknown"
    num = float(b)
    if num >= 1024 ** 3:
        return f"{num / (1024 ** 3):.2f} GB"
    elif num >= 1024 ** 2:
        return f"{num / (1024 ** 2):.1f} MB"
    elif num >= 1024:
        return f"{num / 1024:.1f} KB"
    return f"{int(num)} B"


def format_seconds(s: Optional[Union[int, float]]) -> str:
    if not s or s <= 0:
        return "Clip"
    m, sec = divmod(int(round(s)), 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{sec:02d}" if h > 0 else f"{m:02d}:{sec:02d}"


def is_playlist_url(url: str) -> bool:
    if not url:
        return False
    if "list=" in url and ("/playlist" in url or "watch?v=" not in url):
        return True
    if any(tok in url.lower() for tok in ["/playlist", "/sets/", "/album/"]):
        return True
    return False


def extract_twitter_syndication(url: str) -> Optional[Dict[str, Any]]:
    """Fallback Twitter/X video extractor using syndication endpoint if standard yt-dlp fails."""
    import urllib.request
    clean_url = re.sub(r'\?.*$', '', url.strip())
    match = re.search(r'/status/(\d+)', clean_url)
    if not match:
        return None
    tweet_id = match.group(1)

    api_url = f"https://api.vxtwitter.com/i/status/{tweet_id}"
    req = urllib.request.Request(api_url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DroplyMediaEngine'
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            media_list = data.get('media_extended', [])
            video_media = [m for m in media_list if m.get('type') in ('video', 'gif')]
            if not video_media and data.get('mediaURLs'):
                video_media = [{'url': u, 'type': 'video'} for u in data.get('mediaURLs') if any(u.endswith(ext) for ext in ('.mp4', '.m3u8'))]

            if not video_media:
                return None

            v = video_media[0]
            v_url = v.get('url')
            if not v_url:
                return None

            raw_title = data.get('text', 'Twitter Video')
            title = raw_title.split('\n')[0][:80].strip() if raw_title else 'Twitter Video'
            uploader = data.get('user_name') or 'Twitter / X'
            duration_sec = int((v.get('duration_millis') or 0) / 1000)

            formats = [{
                'format_id': '1080p',
                'url': v_url,
                'ext': 'mp4',
                'height': 720,
                'width': 1280,
                'vcodec': 'h264',
                'acodec': 'aac',
                'tbr': 1500,
                'filesize': v.get('size') or 0
            }]

            return {
                'id': tweet_id,
                'title': title,
                'uploader': uploader,
                'duration': duration_sec,
                'duration_str': format_seconds(duration_sec),
                'thumbnail': v.get('thumbnail_url') or (data.get('mediaURLs') or [''])[0],
                'extractor_key': 'Twitter',
                'formats': formats,
                'webpage_url': url
            }
    except Exception:
        return None


def get_format_resolution(f: Dict[str, Any]) -> int:
    """Returns effective resolution dimension (shorter side for orientation neutrality)."""
    h = f.get('height')
    w = f.get('width')
    if h and w and h > 0 and w > 0:
        return min(int(h), int(w))
    return int(h) if (h and h > 0) else (int(w) if (w and w > 0) else 0)


def estimate_format_bytes(fmt: Dict[str, Any], duration: Optional[Union[int, float]]) -> Optional[int]:
    """Estimates byte size of a stream format from filesize, filesize_approx, or bitrate * duration."""
    size = fmt.get('filesize') or fmt.get('filesize_approx')
    if size and size > 0:
        return int(size)
    dur = duration or fmt.get('duration')
    if dur and dur > 0:
        tbr = fmt.get('tbr')
        vbr = fmt.get('vbr') or 0
        abr = fmt.get('abr') or 0
        bitrate_kbps = tbr if (tbr and tbr > 0) else (vbr + abr)
        if bitrate_kbps and bitrate_kbps > 0:
            return int((bitrate_kbps * 1000 / 8) * float(dur))
    return None


def analyze_url(url: str) -> str:
    """
    Extracts metadata, thumbnails, duration, and formats for a given URL.
    Returns JSON string for the Java bridge, supporting both single media and playlists.
    """
    is_playlist = is_playlist_url(url)
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist' if is_playlist else False,
        'skip_download': True,
        'nocheckcertificate': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    }
    if is_playlist:
        ydl_opts['extract_flat'] = 'in_playlist'
    else:
        ydl_opts['noplaylist'] = True

    cookie_file = locate_cookie_file()
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                # Fallback 1: playlist extraction if single video failed on a playlist URL
                if not is_playlist and ("list=" in url or "playlist" in url):
                    ydl_opts['extract_flat'] = 'in_playlist'
                    ydl_opts.pop('noplaylist', None)
                    with yt_dlp.YoutubeDL(ydl_opts) as p_ydl:
                        info = p_ydl.extract_info(url, download=False)
                # Fallback 2: Twitter / X syndication fallback
                elif "twitter.com" in url or "x.com" in url:
                    info = extract_twitter_syndication(url)
                    if not info:
                        raise e
                else:
                    raise e

            if not info:
                return json.dumps({"error": "No media information could be extracted."})

            # Check if extracted resource is a Playlist
            if info.get('_type') == 'playlist' or 'entries' in info:
                raw_entries = info.get('entries') or []
                entries = []
                total_duration = 0
                for idx, e in enumerate(raw_entries):
                    if not e:
                        continue
                    eid = str(e.get('id') or '')
                    e_title = e.get('title') or f"Track {idx + 1}"
                    e_url = e.get('url') or e.get('webpage_url') or ""
                    if not e_url.startswith("http"):
                        e_url = f"https://www.youtube.com/watch?v={eid}" if eid else ""
                    e_dur = int(e.get('duration') or 0)
                    total_duration += e_dur
                    entries.append({
                        "id": eid,
                        "title": e_title,
                        "url": e_url,
                        "duration": e_dur,
                        "duration_str": format_seconds(e_dur),
                        "thumbnail": e.get('thumbnail') or info.get('thumbnail', ''),
                        "uploader": e.get('uploader') or info.get('uploader', '')
                    })

                playlist_formats = [
                    {
                        "format_id": "best",
                        "height": 9999,
                        "ext": "mp4",
                        "resolution": "Best Auto",
                        "label": "Best Available (Auto)",
                        "filesize_approx": 0,
                        "filesize_str": "Adaptive Full Quality",
                        "has_video": True,
                        "has_audio": True
                    },
                    {
                        "format_id": "1440p",
                        "height": 1440,
                        "ext": "mp4",
                        "resolution": "1440p",
                        "label": "1440p 2K QHD",
                        "filesize_approx": 0,
                        "filesize_str": "2K Ultra HD",
                        "has_video": True,
                        "has_audio": True
                    },
                    {
                        "format_id": "1080p",
                        "height": 1080,
                        "ext": "mp4",
                        "resolution": "1080p",
                        "label": "1080p HD",
                        "filesize_approx": 0,
                        "filesize_str": "High Definition",
                        "has_video": True,
                        "has_audio": True
                    },
                    {
                        "format_id": "720p",
                        "height": 720,
                        "ext": "mp4",
                        "resolution": "720p",
                        "label": "720p HD",
                        "filesize_approx": 0,
                        "filesize_str": "Standard HD",
                        "has_video": True,
                        "has_audio": True
                    },
                    {
                        "format_id": "480p",
                        "height": 480,
                        "ext": "mp4",
                        "resolution": "480p",
                        "label": "480p SD",
                        "filesize_approx": 0,
                        "filesize_str": "Standard Definition",
                        "has_video": True,
                        "has_audio": True
                    }
                ]

                audio_formats_list = [
                    {
                        "format_id": "bestaudio",
                        "ext": "m4a",
                        "resolution": "Audio Only",
                        "label": "M4A High Quality",
                        "filesize_approx": 0,
                        "filesize_str": "High Quality",
                        "has_video": False,
                        "has_audio": True,
                        "is_audio_only": True
                    },
                    {
                        "format_id": "mp3",
                        "ext": "mp3",
                        "resolution": "Audio Only",
                        "label": "MP3 Universal Audio",
                        "filesize_approx": 0,
                        "filesize_str": "HQ 320k",
                        "has_video": False,
                        "has_audio": True,
                        "is_audio_only": True
                    }
                ]

                result = {
                    "id": str(info.get("id", "playlist")),
                    "url": url,
                    "title": info.get("title", "Untitled Playlist"),
                    "platform": info.get("extractor_key", "Playlist"),
                    "uploader": info.get("uploader", "Various Artists"),
                    "duration": total_duration,
                    "duration_str": format_seconds(total_duration),
                    "thumbnail": info.get("thumbnail") or (entries[0]["thumbnail"] if entries else ""),
                    "is_playlist": True,
                    "playlist_count": len(entries),
                    "playlist_entries": entries,
                    "formats": playlist_formats,
                    "audio_formats": audio_formats_list
                }
                return json.dumps(result)

            # Single Video Extraction (OmniDownloader-style Resolution Tiers)
            raw_formats = info.get("formats", [])
            duration = info.get("duration") or 0

            audio_formats = [f for f in raw_formats if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
            best_audio_size = 0
            if audio_formats:
                audio_formats.sort(key=lambda f: f.get('abr') or f.get('tbr') or 0, reverse=True)
                best_audio_size = estimate_format_bytes(audio_formats[0], duration) or 0
            elif duration and duration > 0:
                best_audio_size = int((128 * 1000 / 8) * float(duration))

            video_formats = [f for f in raw_formats if f.get('vcodec') != 'none']

            def get_best_video_size(target_dim: Optional[int]) -> Optional[int]:
                if not video_formats:
                    return None
                if target_dim is None:
                    matching = list(video_formats)
                else:
                    matching = [f for f in video_formats if get_format_resolution(f) <= target_dim]
                    if not matching:
                        matching = [f for f in video_formats if get_format_resolution(f) <= target_dim * 1.05]
                    if not matching:
                        return None

                def format_score(f: Dict[str, Any]) -> tuple:
                    res = get_format_resolution(f)
                    vc = (f.get('vcodec') or '').lower()
                    codec_rank = 3 if 'av01' in vc else (2 if 'vp9' in vc or 'vp09' in vc else (1 if 'avc' in vc or 'h264' in vc else 0))
                    size = f.get('filesize') or f.get('filesize_approx') or 0
                    bitrate = f.get('tbr') or f.get('vbr') or 0
                    return (res, codec_rank, size > 0, bitrate)

                matching.sort(key=format_score, reverse=True)
                chosen = matching[0]
                v_size = estimate_format_bytes(chosen, duration)
                if not v_size and duration and duration > 0:
                    target_res = target_dim or get_format_resolution(chosen) or 720
                    typical_kbps = {2160: 6000, 1440: 3800, 1080: 2500, 720: 1400, 480: 750, 360: 450}.get(target_res, 1200)
                    v_size = int((typical_kbps * 1000 / 8) * float(duration))

                if not v_size:
                    return None
                if chosen.get('acodec') == 'none' and best_audio_size:
                    return v_size + best_audio_size
                return v_size

            # Discover available resolutions
            resolutions = [get_format_resolution(f) for f in video_formats if get_format_resolution(f) > 0]
            max_res = max(resolutions) if resolutions else 0

            available_qualities: List[str] = []
            if any(r >= 2000 for r in resolutions):
                available_qualities.append("2160p")
            if any(1300 <= r < 2000 for r in resolutions):
                available_qualities.append("1440p")
            if any(900 <= r < 1300 for r in resolutions):
                available_qualities.append("1080p")
            if any(650 <= r < 900 for r in resolutions):
                available_qualities.append("720p")
            if any(400 <= r < 650 for r in resolutions):
                available_qualities.append("480p")
            if any(300 <= r < 400 for r in resolutions):
                available_qualities.append("360p")
            if any(200 <= r < 300 for r in resolutions):
                available_qualities.append("240p")
            if any(0 < r < 200 for r in resolutions):
                available_qualities.append("144p")

            # Fallback if no bins matched
            if not available_qualities:
                if max_res >= 2000:
                    available_qualities.append("2160p")
                elif max_res >= 1300:
                    available_qualities.append("1440p")
                elif max_res >= 900:
                    available_qualities.append("1080p")
                elif max_res >= 650:
                    available_qualities.append("720p")
                elif max_res >= 400:
                    available_qualities.append("480p")
                elif max_res > 0:
                    available_qualities.append("360p")
                else:
                    available_qualities.append("best")

            tier_labels = {
                "2160p": "4K / 2160p",
                "1440p": "2K / 1440p",
                "1080p": "FHD / 1080p",
                "720p": "720p",
                "480p": "480p",
                "360p": "360p",
                "240p": "240p",
                "144p": "144p",
                "best": "Best Quality"
            }
            tier_targets = {
                "2160p": 2160,
                "1440p": 1440,
                "1080p": 1080,
                "720p": 720,
                "480p": 480,
                "360p": 360,
                "240p": 240,
                "144p": 144,
            }

            formats_list = []
            for q_key in available_qualities:
                t_dim = tier_targets.get(q_key)
                q_size = get_best_video_size(t_dim) if t_dim else get_best_video_size(None)
                size_str = f"~{format_bytes(q_size)}" if q_size else "Adaptive"

                formats_list.append({
                    "format_id": q_key,
                    "height": t_dim or 9999,
                    "ext": "mp4",
                    "resolution": q_key if q_key != "best" else "Best",
                    "label": tier_labels.get(q_key, q_key.upper()),
                    "filesize_approx": q_size or 0,
                    "filesize_str": size_str,
                    "has_video": True,
                    "has_audio": True
                })

            mp3_size = best_audio_size or (int((192 * 1000 / 8) * float(duration)) if duration else 0)
            m4a_size = int(mp3_size * 0.75) if mp3_size else 0

            audio_formats_list = [
                {
                    "format_id": "audio_mp3",
                    "ext": "mp3",
                    "resolution": "Audio Only",
                    "label": "Audio Only (MP3)",
                    "filesize_approx": mp3_size,
                    "filesize_str": f"~{format_bytes(mp3_size)}" if mp3_size else "HQ 320k",
                    "has_video": False,
                    "has_audio": True,
                    "is_audio_only": True
                },
                {
                    "format_id": "audio_m4a",
                    "ext": "m4a",
                    "resolution": "Audio Only",
                    "label": "Audio Only (M4A AAC)",
                    "filesize_approx": m4a_size,
                    "filesize_str": f"~{format_bytes(m4a_size)}" if m4a_size else "High Quality",
                    "has_video": False,
                    "has_audio": True,
                    "is_audio_only": True
                }
            ]

            result = {
                "id": info.get("id", ""),
                "url": url,
                "title": info.get("title", "Untitled Media"),
                "platform": info.get("extractor_key", "Web Media"),
                "uploader": info.get("uploader", "Unknown Creator"),
                "duration": duration,
                "duration_str": format_seconds(duration),
                "thumbnail": info.get("thumbnail", ""),
                "is_playlist": False,
                "playlist_count": 0,
                "playlist_entries": [],
                "formats": formats_list,
                "audio_formats": audio_formats_list
            }
            return json.dumps(result)
    except Exception as e:
        return json.dumps({"error": str(e)})



def download_media(url: str, format_id: str, is_audio: bool, audio_format: str, output_dir: str, title: str, callback_obj=None, playlist_folder: str = "") -> str:
    """
    Executes download into output_dir and reports progress via callback_obj.
    Automatically places playlist items into a dedicated playlist subfolder if specified.
    """
    global _is_cancelled
    _is_cancelled = False

    if playlist_folder:
        clean_p = sanitize_filename(playlist_folder)
        output_dir = os.path.join(output_dir, clean_p)

    os.makedirs(output_dir, exist_ok=True)
    downloaded_filepath = None

    def hook(d):
        nonlocal downloaded_filepath
        global _is_cancelled, _is_paused
        if _is_paused:
            # DO NOT delete partial files! Keep .part file intact for resume
            raise DownloadPausedException("Download paused by user.")

        if _is_cancelled:
            # Clean up partial files immediately on cancel
            fn = d.get('filename')
            if fn and os.path.exists(fn):
                try: os.remove(fn)
                except Exception: pass
            if fn and os.path.exists(f"{fn}.part"):
                try: os.remove(f"{fn}.part")
                except Exception: pass
            raise Exception("Download cancelled by user.")

        st = d.get('status')
        if st == 'finished':
            fn = d.get('filename')
            if fn:
                downloaded_filepath = fn

        if callback_obj and st == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            speed = d.get('speed') or 0
            eta = d.get('eta') or 0
            pct = (downloaded / total * 100.0) if total > 0 else 0.0

            data = {
                "status": "downloading",
                "percent": round(pct, 1),
                "progress_percent": round(pct, 1),
                "downloaded_bytes": downloaded,
                "total_bytes": total,
                "downloaded_str": format_bytes(downloaded),
                "total_str": format_bytes(total),
                "speed_str": f"{format_bytes(int(speed))}/s" if speed else "0 B/s",
                "eta_str": format_seconds(eta)
            }
            try:
                callback_obj.onProgress(json.dumps(data))
            except Exception:
                pass

    ff_path = get_ffmpeg_path()
    ffmpeg_available = bool(ff_path)

    # Determine if requested as audio
    f_norm = (format_id or '').strip().lower()
    if is_audio or f_norm.startswith('audio') or f_norm in ('mp3', 'm4a', 'wav'):
        is_audio = True

    ydl_opts = {
        'progress_hooks': [hook],
        'nocheckcertificate': True,
        'quiet': True,
        'no_warnings': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    }

    if ff_path:
        ydl_opts['ffmpeg_location'] = ff_path

    cookie_file = locate_cookie_file()
    if cookie_file:
        ydl_opts['cookiefile'] = cookie_file

    if is_audio:
        # STRICT PURE AUDIO: NEVER fall back to /best which downloads a 360p video!
        audio_codec = audio_format or ('mp3' if 'mp3' in f_norm else 'm4a')
        if ffmpeg_available:
            ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio/bestaudio*'
            ydl_opts['outtmpl'] = os.path.join(output_dir, f'%(title)s.{audio_codec}')
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_codec,
                'preferredquality': '320',
            }]
        else:
            # Standalone Android without ffmpeg: extract direct M4A stream cleanly
            ydl_opts['format'] = 'bestaudio[ext=m4a]/bestaudio/best'
            ydl_opts['outtmpl'] = os.path.join(output_dir, '%(title)s.%(ext)s')
    else:
        ydl_opts['outtmpl'] = os.path.join(output_dir, '%(title)s.%(ext)s')
        if not f_norm or f_norm in ('best', 'auto', 'default'):
            if ffmpeg_available:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = 'best[ext=mp4]/best'
        elif f_norm.endswith('p') and f_norm[:-1].isdigit():
            target_h = int(f_norm[:-1])
            if ffmpeg_available:
                ydl_opts['format'] = f"bestvideo[height<={target_h}]+bestaudio/best[height<={target_h}]/best"
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = f"best[height<={target_h}][ext=mp4]/best[height<={target_h}]/best[ext=mp4]/best"
        elif '+' in format_id or 'bestvideo' in format_id or 'bestaudio' in format_id:
            if ffmpeg_available:
                ydl_opts['format'] = format_id
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = 'best[ext=mp4]/best'
        else:
            if ffmpeg_available:
                ydl_opts['format'] = f"{format_id}+bestaudio/bestvideo+bestaudio/best"
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = f"{format_id}[ext=mp4]/best[ext=mp4]/best"

    try:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res = ydl.download([url])
        except DownloadPausedException:
            return {
                "status": "paused",
                "message": "Download paused by user."
            }
        except Exception as dl_err:
            if isinstance(dl_err, DownloadPausedException) or "Download paused by user" in str(dl_err):
                return {
                    "status": "paused",
                    "message": "Download paused by user."
                }
            if ("twitter.com" in url or "x.com" in url):
                synd = extract_twitter_syndication(url)
                if synd and synd.get('formats'):
                    direct_v_url = synd['formats'][0].get('url')
                    if direct_v_url:
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            res = ydl.download([direct_v_url])
                    else:
                        raise dl_err
                else:
                    raise dl_err
            else:
                raise dl_err

        final_path = downloaded_filepath
        if is_audio and final_path:
            base, _ = os.path.splitext(final_path)
            target_ext = audio_format or ('mp3' if 'mp3' in f_norm else 'm4a')
            for ext in [target_ext, 'm4a', 'mp3', 'opus', 'wav']:
                if os.path.exists(f"{base}.{ext}"):
                    final_path = f"{base}.{ext}"
                    break

        if not final_path or not os.path.exists(final_path):
            try:
                candidates = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
                if candidates:
                    candidates.sort(key=os.path.getmtime, reverse=True)
                    final_path = candidates[0]
            except Exception:
                pass

        if not final_path:
            final_path = output_dir

        file_size_bytes = 0
        if final_path and os.path.isfile(final_path):
            try:
                file_size_bytes = os.path.getsize(final_path)
            except Exception:
                pass

        if callback_obj:
            callback_obj.onComplete(json.dumps({
                "status": "completed",
                "code": res,
                "title": title or (os.path.basename(final_path) if final_path != output_dir else "Downloaded Media"),
                "file_path": final_path,
                "file_size": file_size_bytes,
                "file_size_str": format_bytes(file_size_bytes),
                "is_audio": is_audio,
                "percent": 100.0,
                "progress_percent": 100.0
            }))
    except DownloadPausedException:
        if callback_obj:
            callback_obj.onProgress(json.dumps({
                "status": "paused",
                "percent": 0.0,
                "title": title
            }))
        return json.dumps({"status": "paused"})
    except Exception as e:
        global _is_paused
        if _is_paused or "paused" in str(e).lower():
            if callback_obj:
                callback_obj.onProgress(json.dumps({
                    "status": "paused",
                    "percent": 0.0,
                    "title": title
                }))
            return json.dumps({"status": "paused"})
        err_msg = str(e)
        if "cancelled" in err_msg.lower():
            err_msg = "Download cancelled by user."
        if callback_obj:
            callback_obj.onError(json.dumps({
                "status": "error",
                "error": err_msg,
                "error_friendly": err_msg
            }))
        return json.dumps({"status": "error", "error": err_msg})


def check_updates(installed_app_version: str = "v1.4.3") -> str:
    """
    Checks for updates for Droply and yt-dlp core.
    """
    current_app_version = installed_app_version or "v1.4.3"
    if not current_app_version.startswith("v"):
        current_app_version = f"v{current_app_version}"

    current_ytdlp_version = (
        getattr(yt_dlp, "__version__", None) or
        getattr(getattr(yt_dlp, "version", None), "__version__", None) or
        "unknown"
    )

    latest_app_version = current_app_version
    app_up_to_date = True
    release_url = "https://github.com/Amlon-Sarkar/Droply/releases"

    try:
        import urllib.request
        req = urllib.request.Request(
            "https://api.github.com/repos/Amlon-Sarkar/Droply/releases/latest",
            headers={"User-Agent": "Droply-App"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            tag = data.get("tag_name")
            if tag:
                latest_app_version = tag
                app_up_to_date = (tag.lstrip('v').strip() == current_app_version.lstrip('v').strip())
                release_url = data.get("html_url", release_url)
    except Exception:
        pass

    latest_ytdlp_version = current_ytdlp_version
    ytdlp_up_to_date = True
    try:
        import urllib.request
        req = urllib.request.Request(
            "https://pypi.org/pypi/yt-dlp/json",
            headers={"User-Agent": "Droply-App"}
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            ver = data.get("info", {}).get("version")
            if ver:
                latest_ytdlp_version = ver
                ytdlp_up_to_date = (ver.strip() == current_ytdlp_version.strip())
    except Exception:
        pass

    return json.dumps({
        "app_installed": current_app_version,
        "app_latest": latest_app_version,
        "app_up_to_date": app_up_to_date,
        "release_url": release_url,
        "ytdlp_installed": current_ytdlp_version,
        "ytdlp_latest": latest_ytdlp_version,
        "ytdlp_up_to_date": ytdlp_up_to_date
    })


def update_ytdlp_core() -> str:
    """
    Updates yt-dlp core package to latest release in 100% pure Python without subprocess/pip.
    Downloads official PyPI wheel and extracts yt_dlp directly into runtime path.
    """
    try:
        import urllib.request
        import zipfile
        import io
        import importlib

        req = urllib.request.Request(
            "https://pypi.org/pypi/yt-dlp/json",
            headers={"User-Agent": "Droply-Updater"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        latest_version = data.get("info", {}).get("version")
        urls = data.get("urls", [])

        # Find pure Python wheel
        whl_url = None
        for u in urls:
            fn = u.get("filename", "")
            if fn.endswith("-none-any.whl"):
                whl_url = u.get("url")
                break
        if not whl_url and urls:
            whl_url = urls[0].get("url")

        if not whl_url:
            return json.dumps({"status": "error", "message": "Could not locate wheel package on PyPI."})

        # Download wheel into memory
        with urllib.request.urlopen(whl_url, timeout=60) as resp:
            whl_bytes = resp.read()

        # Find writable target directory
        target_dir = None
        for p in sys.path:
            if ("files" in p or "app" in p or "site-packages" in p) and os.path.isdir(p) and os.access(p, os.W_OK):
                target_dir = p
                break

        if not target_dir:
            base_dir = os.environ.get("HOME") or "/data/data/com.droply.app/files"
            target_dir = os.path.join(base_dir, "site-packages")
            os.makedirs(target_dir, exist_ok=True)
            if target_dir not in sys.path:
                sys.path.insert(0, target_dir)

        # Unpack yt_dlp package
        with zipfile.ZipFile(io.BytesIO(whl_bytes)) as zf:
            for member in zf.namelist():
                if member.startswith("yt_dlp/"):
                    zf.extract(member, target_dir)

        if target_dir not in sys.path:
            sys.path.insert(0, target_dir)

        importlib.invalidate_caches()
        importlib.reload(yt_dlp)
        new_ver = getattr(yt_dlp, "__version__", latest_version or "updated")

        return json.dumps({
            "status": "success",
            "message": f"Successfully updated yt-dlp core to {new_ver}!",
            "version": new_ver
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})
