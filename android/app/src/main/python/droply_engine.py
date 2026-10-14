"""
Droply - Embedded Android yt-dlp Engine
Executes media extraction, formatting, and downloads locally inside Android.
"""

import os
import sys
import json
import re
import shutil
from typing import Dict, Any, Callable, Optional
import yt_dlp

# Global cancellation flag for active Android download
_is_cancelled = False
_ffmpeg_binary_path = None


def cancel_active_download():
    global _is_cancelled
    _is_cancelled = True


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


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name).strip()
    return cleaned[:180] if len(cleaned) > 180 else cleaned


def format_bytes(b: Optional[int]) -> str:
    if not b or b <= 0:
        return "Unknown"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} GB"


def format_seconds(s: Optional[int]) -> str:
    if not s or s <= 0:
        return "00:00"
    m, sec = divmod(int(s), 60)
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
        ydl_opts['extractor_args'] = {
            'youtube': {
                'player_client': ['ios', 'android', 'web', 'mweb'],
            }
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                # Fallback to playlist extraction if single video failed on a playlist URL
                if not is_playlist and ("list=" in url or "playlist" in url):
                    ydl_opts['extract_flat'] = 'in_playlist'
                    ydl_opts.pop('noplaylist', None)
                    ydl_opts.pop('extractor_args', None)
                    with yt_dlp.YoutubeDL(ydl_opts) as p_ydl:
                        info = p_ydl.extract_info(url, download=False)
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
                    }
                ]

                audio_formats_list = [
                    {
                        "format_id": "bestaudio",
                        "ext": "m4a",
                        "resolution": "Audio Only",
                        "label": "M4A High Quality (Default)",
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

            # Single Video Extraction
            formats_dict = {}
            raw_formats = info.get("formats", [])
            duration = info.get("duration") or 0

            for f in raw_formats:
                height = f.get("height")
                has_video = f.get("vcodec") != "none" and bool(f.get("vcodec"))
                if has_video and height and height >= 144:
                    res_key = f"{height}p"
                    filesize = f.get("filesize") or f.get("filesize_approx")
                    if not filesize and duration > 0 and f.get("tbr"):
                        filesize = int((f.get("tbr") * 1024 / 8) * duration)

                    existing = formats_dict.get(height)
                    if not existing or (f.get("acodec") != "none" and existing.get("has_audio") is False):
                        formats_dict[height] = {
                            "format_id": f"{height}p",
                            "height": height,
                            "ext": f.get("ext", "mp4"),
                            "resolution": res_key,
                            "label": f"{res_key} HD" if height >= 720 else f"{res_key}",
                            "filesize_approx": filesize or 0,
                            "filesize_str": format_bytes(filesize) if filesize else "Standard",
                            "has_video": True,
                            "has_audio": f.get("acodec") != "none" and bool(f.get("acodec"))
                        }

            sorted_heights = sorted(formats_dict.keys(), reverse=True)
            formats_list = []

            formats_list.append({
                "format_id": "best",
                "height": 9999,
                "ext": "mp4",
                "resolution": "Best Auto",
                "label": "Best Available (Auto)",
                "filesize_approx": 0,
                "filesize_str": "Adaptive Full Quality",
                "has_video": True,
                "has_audio": True
            })

            for h in sorted_heights:
                formats_list.append(formats_dict[h])

            audio_formats_list = [
                {
                    "format_id": "bestaudio",
                    "ext": "m4a",
                    "resolution": "Audio Only",
                    "label": "M4A High Quality (Default)",
                    "filesize_approx": int((128 * 1024 / 8) * duration) if duration > 0 else 0,
                    "filesize_str": format_bytes(int((128 * 1024 / 8) * duration)) if duration > 0 else "High Quality",
                    "has_video": False,
                    "has_audio": True,
                    "is_audio_only": True
                },
                {
                    "format_id": "mp3",
                    "ext": "mp3",
                    "resolution": "Audio Only",
                    "label": "MP3 Universal Audio",
                    "filesize_approx": int((192 * 1024 / 8) * duration) if duration > 0 else 0,
                    "filesize_str": format_bytes(int((192 * 1024 / 8) * duration)) if duration > 0 else "HQ 320k",
                    "has_video": False,
                    "has_audio": True,
                    "is_audio_only": True
                },
                {
                    "format_id": "wav",
                    "ext": "wav",
                    "resolution": "Audio Only",
                    "label": "Lossless WAV Audio",
                    "filesize_approx": 0,
                    "filesize_str": "Uncompressed",
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
    out_tmpl = os.path.join(output_dir, '%(title)s.%(ext)s')

    downloaded_filepath = None

    def hook(d):
        nonlocal downloaded_filepath
        global _is_cancelled
        if _is_cancelled:
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

    ydl_opts = {
        'outtmpl': out_tmpl,
        'progress_hooks': [hook],
        'nocheckcertificate': True,
        'quiet': True,
        'no_warnings': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'android', 'web', 'mweb'],
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    }

    if ff_path:
        ydl_opts['ffmpeg_location'] = ff_path

    if is_audio:
        ydl_opts['format'] = 'bestaudio/best'
        if ffmpeg_available:
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format or 'mp3',
                'preferredquality': '320',
            }]
    else:
        # Video download format selection
        f_norm = (format_id or '').strip().lower()
        if not f_norm or f_norm in ('best', 'auto', 'default'):
            # Adaptive maximum quality (4K, 1440p, 1080p, etc.)
            if ffmpeg_available:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = 'bestvideo*+bestaudio/best[ext=mp4]/best'
        elif f_norm.endswith('p') and f_norm[:-1].isdigit():
            target_h = int(f_norm[:-1])
            if ffmpeg_available:
                ydl_opts['format'] = f"bestvideo[height<={target_h}]+bestaudio/best[height<={target_h}]/best"
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = f"bestvideo*[height<={target_h}]+bestaudio/best[height<={target_h}][ext=mp4]/best[height<={target_h}]/best"
        elif '+' in format_id or 'bestvideo' in format_id or 'bestaudio' in format_id:
            ydl_opts['format'] = format_id
            if ffmpeg_available:
                ydl_opts['merge_output_format'] = 'mp4'
        else:
            if ffmpeg_available:
                ydl_opts['format'] = f"{format_id}+bestaudio/bestvideo+bestaudio/best"
                ydl_opts['merge_output_format'] = 'mp4'
            else:
                ydl_opts['format'] = f"{format_id}+bestaudio/best[ext=mp4]/best"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.download([url])
            
            final_path = downloaded_filepath
            if is_audio and final_path:
                base, _ = os.path.splitext(final_path)
                for ext in [audio_format or 'mp3', 'mp3', 'm4a', 'opus', 'wav']:
                    if os.path.exists(f"{base}.{ext}"):
                        final_path = f"{base}.{ext}"
                        break
            
            if not final_path or not os.path.exists(final_path):
                # Search output_dir for newest file
                try:
                    candidates = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if os.path.isfile(os.path.join(output_dir, f))]
                    if candidates:
                        candidates.sort(key=os.path.getmtime, reverse=True)
                        final_path = candidates[0]
                except Exception:
                    pass

            if not final_path:
                final_path = output_dir

            if callback_obj:
                callback_obj.onComplete(json.dumps({
                    "status": "completed",
                    "code": res,
                    "title": title or (os.path.basename(final_path) if final_path != output_dir else "Downloaded Media"),
                    "file_path": final_path,
                    "percent": 100.0,
                    "progress_percent": 100.0
                }))
            return json.dumps({"status": "completed", "code": res, "file_path": final_path})
    except Exception as e:
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


def check_updates() -> str:
    """
    Checks for updates for Droply and yt-dlp core.
    """
    current_app_version = "v1.2.4"
    current_ytdlp_version = getattr(yt_dlp, "__version__", "unknown")

    latest_app_version = current_app_version
    app_up_to_date = True
    release_url = "https://github.com/Amlan-Sarkar/Droply/releases"

    try:
        import urllib.request
        req = urllib.request.Request(
            "https://api.github.com/repos/Amlan-Sarkar/Droply/releases/latest",
            headers={"User-Agent": "Droply-App"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            tag = data.get("tag_name")
            if tag:
                latest_app_version = tag
                app_up_to_date = (tag.lstrip('v') == current_app_version.lstrip('v'))
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
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            ver = data.get("info", {}).get("version")
            if ver:
                latest_ytdlp_version = ver
                ytdlp_up_to_date = (ver == current_ytdlp_version)
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
    Attempts to update yt-dlp package to latest release.
    """
    try:
        import subprocess
        cmd = [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if proc.returncode == 0:
            import importlib
            importlib.reload(yt_dlp)
            new_ver = getattr(yt_dlp, "__version__", "updated")
            return json.dumps({"status": "success", "message": f"Successfully updated yt-dlp core to {new_ver}!", "version": new_ver})
        else:
            return json.dumps({"status": "error", "message": proc.stderr or proc.stdout or "Update command failed."})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})

