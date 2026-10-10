"""
Droply - Embedded Android yt-dlp Engine
Executes media extraction, formatting, and downloads locally inside Android.
"""

import os
import sys
import json
import re
from typing import Dict, Any, Callable, Optional
import yt_dlp


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


def analyze_url(url: str) -> str:
    """
    Extracts metadata, thumbnails, duration, and formats for a given URL.
    Returns JSON string for the Java bridge.
    """
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'nocheckcertificate': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return json.dumps({"error": "No media information could be extracted."})

            formats_list = []
            audio_formats_list = []
            raw_formats = info.get("formats", [])

            # Video formats
            seen_res = set()
            for f in raw_formats:
                height = f.get("height")
                has_video = f.get("vcodec") != "none" and bool(f.get("vcodec"))
                if has_video and height:
                    res_key = f"{height}p"
                    if res_key not in seen_res:
                        seen_res.add(res_key)
                        formats_list.append({
                            "format_id": f.get("format_id"),
                            "ext": f.get("ext", "mp4"),
                            "resolution": res_key,
                            "label": f"{res_key} HD" if height >= 720 else f"{res_key}",
                            "filesize_approx": f.get("filesize") or f.get("filesize_approx") or 0,
                            "filesize_str": format_bytes(f.get("filesize") or f.get("filesize_approx")),
                            "has_video": True,
                            "has_audio": f.get("acodec") != "none"
                        })

            # Preset audio formats
            audio_presets = [
                {"id": "mp3", "label": "MP3 High Quality (320k)", "ext": "mp3"},
                {"id": "m4a", "label": "Apple AAC (M4A)", "ext": "m4a"},
                {"id": "wav", "label": "Lossless Audio (WAV)", "ext": "wav"}
            ]
            for ap in audio_presets:
                audio_formats_list.append({
                    "format_id": ap["id"],
                    "ext": ap["ext"],
                    "resolution": "Audio Only",
                    "label": ap["label"],
                    "filesize_approx": 0,
                    "filesize_str": "Dynamic",
                    "has_video": False,
                    "has_audio": True,
                    "is_audio_only": True
                })

            result = {
                "id": info.get("id", ""),
                "url": url,
                "title": info.get("title", "Untitled Media"),
                "platform": info.get("extractor_key", "Web Media"),
                "uploader": info.get("uploader", "Unknown Creator"),
                "duration": info.get("duration", 0),
                "duration_str": format_seconds(info.get("duration", 0)),
                "thumbnail": info.get("thumbnail", ""),
                "formats": formats_list,
                "audio_formats": audio_formats_list
            }
            return json.dumps(result)
    except Exception as e:
        return json.dumps({"error": str(e)})


def download_media(url: str, format_id: str, is_audio: bool, audio_format: str, output_dir: str, title: str, callback_obj=None) -> str:
    """
    Executes download into output_dir and reports progress via callback_obj.
    """
    os.makedirs(output_dir, exist_ok=True)
    out_tmpl = os.path.join(output_dir, '%(title)s.%(ext)s')

    def hook(d):
        if callback_obj and d.get('status') == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            speed = d.get('speed') or 0
            eta = d.get('eta') or 0
            pct = (downloaded / total * 100.0) if total > 0 else 0.0

            data = {
                "status": "downloading",
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
    }

    if is_audio:
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': audio_format or 'mp3',
            'preferredquality': '320',
        }]
    else:
        if format_id and format_id != "bestvideo+bestaudio/best":
            ydl_opts['format'] = f"{format_id}+bestaudio/best"
        else:
            ydl_opts['format'] = 'bestvideo+bestaudio/best'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.download([url])
            if callback_obj:
                callback_obj.onComplete(json.dumps({"status": "completed", "code": res}))
            return json.dumps({"status": "completed", "code": res})
    except Exception as e:
        if callback_obj:
            callback_obj.onError(json.dumps({"status": "error", "error": str(e)}))
        return json.dumps({"status": "error", "error": str(e)})
