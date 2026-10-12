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


def cancel_active_download():
    global _is_cancelled
    _is_cancelled = True


def has_ffmpeg() -> bool:
    return shutil.which('ffmpeg') is not None


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
                'player_client': ['android', 'web', 'mweb'],
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
                            "format_id": f.get("format_id"),
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

    def hook(d):
        global _is_cancelled
        if _is_cancelled:
            raise Exception("Download cancelled by user.")

        if callback_obj and d.get('status') == 'downloading':
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

    ydl_opts = {
        'outtmpl': out_tmpl,
        'progress_hooks': [hook],
        'nocheckcertificate': True,
        'quiet': True,
        'no_warnings': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web', 'mweb'],
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        }
    }

    ffmpeg_available = has_ffmpeg()

    if is_audio:
        ydl_opts['format'] = 'bestaudio/best'
        if ffmpeg_available:
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_format or 'mp3',
                'preferredquality': '320',
            }]
    else:
        # Video download
        if not format_id or format_id == "best":
            # Adaptive best format: prioritize single merged stream if ffmpeg not available
            if ffmpeg_available:
                ydl_opts['format'] = 'bestvideo+bestaudio/best'
            else:
                ydl_opts['format'] = 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio/best'
        else:
            if ffmpeg_available:
                ydl_opts['format'] = f"{format_id}+bestaudio/best"
            else:
                # Without ffmpeg, attempt best single stream for requested quality or best available
                ydl_opts['format'] = f"{format_id}[acodec!=none]/best[height<={format_id}]/best"

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.download([url])
            if callback_obj:
                callback_obj.onComplete(json.dumps({
                    "status": "completed",
                    "code": res,
                    "title": title or "Downloaded Media",
                    "file_path": output_dir,
                    "percent": 100.0,
                    "progress_percent": 100.0
                }))
            return json.dumps({"status": "completed", "code": res})
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
