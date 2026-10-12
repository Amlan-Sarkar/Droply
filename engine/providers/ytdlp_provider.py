"""
OmniFetch - Universal yt-dlp Provider
Harnesses yt-dlp and local FFmpeg to extract metadata, detect qualities,
merge video/audio streams, and convert audio formats across hundreds of platforms.
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Any, Callable, Optional
from urllib.parse import urlparse

import yt_dlp
import imageio_ffmpeg

from .base import BaseProvider, MediaMetadata, MediaFormat, ProviderCapabilities
from ..file_manager import sanitize_filename, get_unique_filename, format_bytes, format_seconds


PLATFORM_PATTERNS = [
    (r'(?:youtube\.com|youtu\.be)', 'YouTube'),
    (r'(?:twitter\.com|x\.com)', 'Twitter / X'),
    (r'tiktok\.com', 'TikTok'),
    (r'reddit\.com', 'Reddit'),
    (r'instagram\.com', 'Instagram'),
    (r'vimeo\.com', 'Vimeo'),
    (r'soundcloud\.com', 'SoundCloud'),
    (r'twitch\.tv', 'Twitch'),
    (r'facebook\.com|fb\.watch', 'Facebook'),
    (r'dailymotion\.com', 'Dailymotion'),
    (r'pinterest\.com', 'Pinterest'),
    (r'bandcamp\.com', 'Bandcamp'),
    (r'bilibili\.com', 'Bilibili'),
    (r'threads\.net', 'Threads'),
    (r'bluesky\.app|bsky\.app', 'Bluesky'),
]


def humanize_error(raw_err: str) -> Dict[str, str]:
    """
    Transforms raw yt-dlp error into a friendly message plus technical details.
    """
    err = str(raw_err).lower()
    
    if "drm" in err or "protected" in err:
        return {
            "friendly": "This media is protected by DRM (Digital Rights Management) and cannot be downloaded.",
            "technical": str(raw_err)
        }
    if "private video" in err or "sign in" in err or "login" in err:
        return {
            "friendly": "This media is private or requires account login to view.",
            "technical": str(raw_err)
        }
    if "403" in err or "forbidden" in err:
        return {
            "friendly": "Download unavailable. The source server rejected the request.",
            "technical": str(raw_err)
        }
    if "404" in err or "not found" in err or "deleted" in err:
        return {
            "friendly": "Media not found. The content may have been deleted or the link is incorrect.",
            "technical": str(raw_err)
        }
    if "geo" in err or "country" in err:
        return {
            "friendly": "This media is geo-restricted and not available in your region.",
            "technical": str(raw_err)
        }
    if "unreachable" in err or "connection" in err or "timed out" in err:
        return {
            "friendly": "Network connection error. Please check your internet connection.",
            "technical": str(raw_err)
        }
    if "unsupported url" in err:
        return {
            "friendly": "This URL is not recognized or not currently supported.",
            "technical": str(raw_err)
        }
    
    return {
        "friendly": "An error occurred while accessing the media resource.",
        "technical": str(raw_err)
    }


class YtDlpProvider(BaseProvider):
    def __init__(self):
        base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent.parent))
        binary_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        bundled = base_dir / "bin" / binary_name
        if bundled.exists():
            self.ffmpeg_path = str(bundled)
        else:
            try:
                self.ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            except Exception:
                self.ffmpeg_path = None

    def can_handle(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            return bool(parsed.scheme in ("http", "https") and parsed.netloc)
        except Exception:
            return False

    def detect_platform(self, url: str) -> str:
        for pattern, name in PLATFORM_PATTERNS:
            if re.search(pattern, url, re.IGNORECASE):
                return name
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "").capitalize() if parsed.netloc else "Web Media"

    def is_playlist_url(self, url: str) -> bool:
        if not url:
            return False
        # YouTube playlist indicators
        if "list=" in url and ("/playlist" in url or "watch?v=" not in url):
            return True
        if "/playlist" in url or "/sets/" in url or "/album/" in url:
            return True
        return False

    def _get_ydl_opts(self, is_playlist: bool = False) -> Dict[str, Any]:
        opts: Dict[str, Any] = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist' if is_playlist else False,
            'skip_download': True,
        }
        if not is_playlist:
            opts['noplaylist'] = True
        if self.ffmpeg_path and os.path.exists(self.ffmpeg_path):
            opts['ffmpeg_location'] = self.ffmpeg_path
        return opts

    def get_metadata(self, url: str) -> MediaMetadata:
        is_playlist = self.is_playlist_url(url)
        opts = self._get_ydl_opts(is_playlist=is_playlist)
        with yt_dlp.YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                # If single video extraction failed on a playlist URL, try playlist extraction fallback
                if not is_playlist and ("list=" in url or "playlist" in url):
                    try:
                        p_opts = self._get_ydl_opts(is_playlist=True)
                        with yt_dlp.YoutubeDL(p_opts) as p_ydl:
                            info = p_ydl.extract_info(url, download=False)
                    except Exception:
                        err_dict = humanize_error(str(e))
                        raise ValueError(f"{err_dict['friendly']}|SPLIT|{err_dict['technical']}")
                else:
                    err_dict = humanize_error(str(e))
                    raise ValueError(f"{err_dict['friendly']}|SPLIT|{err_dict['technical']}")

        if not info:
            raise ValueError("No media information could be extracted from this URL.")

        # Check if the extracted resource is a Playlist
        if info.get('_type') == 'playlist' or 'entries' in info:
            raw_entries = info.get('entries') or []
            entries = []
            total_duration = 0
            for idx, entry in enumerate(raw_entries):
                if not entry:
                    continue
                eid = str(entry.get('id') or '')
                e_title = entry.get('title') or f"Track {idx + 1}"
                e_url = entry.get('url') or entry.get('webpage_url') or ""
                if not e_url.startswith("http"):
                    e_url = f"https://www.youtube.com/watch?v={eid}" if eid else ""
                e_dur = int(entry.get('duration') or 0)
                total_duration += e_dur
                e_thumb = entry.get('thumbnail') or ""
                entries.append({
                    "id": eid,
                    "title": e_title,
                    "url": e_url,
                    "duration": e_dur,
                    "duration_str": format_seconds(e_dur),
                    "thumbnail": e_thumb,
                    "uploader": entry.get('uploader') or info.get('uploader') or ""
                })

            playlist_thumb = info.get('thumbnail') or (entries[0]['thumbnail'] if entries else "")
            title = info.get('title') or "Untitled Playlist"
            uploader = info.get('uploader') or info.get('channel') or info.get('creator') or "Unknown Creator"

            playlist_video_formats = [
                MediaFormat(format_id="best", ext="mp4", resolution="Best Quality (Auto)", label="Best Video (Up to 4K / 1080p)", has_video=True, has_audio=True),
                MediaFormat(format_id="1080p", ext="mp4", resolution="1080p FHD", label="1080p Full HD", has_video=True, has_audio=True),
                MediaFormat(format_id="720p", ext="mp4", resolution="720p HD", label="720p HD", has_video=True, has_audio=True),
                MediaFormat(format_id="480p", ext="mp4", resolution="480p SD", label="480p Standard", has_video=True, has_audio=True),
            ]
            playlist_audio_formats = [
                MediaFormat(format_id="mp3", ext="mp3", resolution="Audio Only", label="MP3 Universal Audio (320 kbps)", has_video=False, has_audio=True, is_audio_only=True),
                MediaFormat(format_id="m4a", ext="m4a", resolution="Audio Only", label="M4A AAC High Quality", has_video=False, has_audio=True, is_audio_only=True),
                MediaFormat(format_id="wav", ext="wav", resolution="Audio Only", label="Lossless WAV Audio", has_video=False, has_audio=True, is_audio_only=True),
            ]

            return MediaMetadata(
                id=str(info.get('id', 'playlist')),
                url=url,
                title=title,
                platform=self.detect_platform(url),
                uploader=uploader,
                uploader_url=info.get('uploader_url') or "",
                duration=total_duration,
                duration_str=format_seconds(total_duration),
                thumbnail=playlist_thumb,
                description=f"Playlist with {len(entries)} items.",
                formats=playlist_video_formats,
                audio_formats=playlist_audio_formats,
                webpage_url=info.get('webpage_url', url),
                original_url=url,
                is_playlist=True,
                playlist_count=len(entries),
                playlist_entries=entries
            )

        # Single Media Extraction
        title = info.get('title') or "Untitled Media"
        uploader = info.get('uploader') or info.get('channel') or info.get('creator') or "Unknown Creator"
        uploader_url = info.get('uploader_url') or ""
        duration = int(info.get('duration') or 0)
        duration_str = format_seconds(duration)
        thumbnail = info.get('thumbnail') or ""
        description = info.get('description') or ""
        if len(description) > 300:
            description = description[:300] + "..."

        raw_formats = info.get('formats') or []
        parsed_video_formats = self._parse_video_formats(raw_formats, duration)
        parsed_audio_formats = self._parse_audio_formats(raw_formats, duration)

        return MediaMetadata(
            id=str(info.get('id', 'media')),
            url=url,
            title=title,
            platform=self.detect_platform(url),
            uploader=uploader,
            uploader_url=uploader_url,
            duration=duration,
            duration_str=duration_str,
            thumbnail=thumbnail,
            description=description,
            formats=parsed_video_formats,
            audio_formats=parsed_audio_formats,
            webpage_url=info.get('webpage_url', url),
            original_url=url,
            is_playlist=False,
            playlist_count=0,
            playlist_entries=[]
        )


    def _parse_video_formats(self, raw_formats: List[Dict[str, Any]], duration: int) -> List[MediaFormat]:
        """
        Groups and deduplicates formats into clean, user-selectable resolutions:
        4K (2160p), 1440p, 1080p, 720p, 480p, 360p, and Best.
        Only includes qualities that actually exist in the source stream.
        """
        resolutions_found = {} # height -> best format object or spec
        has_any_video = False

        for f in raw_formats:
            vcodec = f.get('vcodec') or ''
            if vcodec == 'none':
                continue # audio only
            has_any_video = True
            h = f.get('height')
            if not h or not isinstance(h, (int, float)):
                continue
            h = int(h)
            if h <= 0:
                continue

            # Check if this format is better than existing for this height
            filesize = f.get('filesize') or f.get('filesize_approx') or 0
            tbr = f.get('tbr') or 0
            if filesize == 0 and duration > 0 and tbr > 0:
                filesize = int(tbr * 1024 * duration / 8)

            ext = f.get('ext', 'mp4')
            if h not in resolutions_found or (ext == 'mp4' and resolutions_found[h].get('ext') != 'mp4'):
                resolutions_found[h] = {
                    'format_id': f.get('format_id'),
                    'height': h,
                    'width': f.get('width', 0),
                    'ext': 'mp4', # standard container target
                    'filesize': filesize,
                    'fps': f.get('fps'),
                    'vcodec': vcodec,
                    'acodec': f.get('acodec', ''),
                }

        video_formats: List[MediaFormat] = []

        # Target standard bucket heights in descending order
        standard_targets = [2160, 1440, 1080, 720, 480, 360, 240]
        used_heights = set()

        for target_h in standard_targets:
            # find closest available height within +/- 15%
            matched_h = None
            for h in sorted(resolutions_found.keys(), reverse=True):
                if h in used_heights:
                    continue
                if abs(h - target_h) <= (target_h * 0.15):
                    matched_h = h
                    break

            if matched_h is not None:
                used_heights.add(matched_h)
                item = resolutions_found[matched_h]
                tag = f"{target_h}p"
                if target_h >= 2160:
                    tag = "4K UHD (2160p)"
                elif target_h >= 1440:
                    tag = "2K QHD (1440p)"
                elif target_h >= 1080:
                    tag = "1080p FHD"
                elif target_h >= 720:
                    tag = "720p HD"

                fs = item['filesize']
                fs_str = format_bytes(fs) if fs > 0 else "Best Quality"

                # Selector instructs yt-dlp to grab best video up to this height + best audio
                selector = f"bestvideo[height<={matched_h}]+bestaudio/best[height<={matched_h}]/best"

                video_formats.append(MediaFormat(
                    format_id=selector,
                    ext="mp4",
                    resolution=f"{item.get('width', matched_h*16//9)}x{matched_h}",
                    label=f"{tag} • MP4",
                    filesize_approx=fs,
                    filesize_str=fs_str,
                    vcodec=item.get('vcodec', ''),
                    acodec=item.get('acodec', ''),
                    fps=item.get('fps'),
                    has_video=True,
                    has_audio=True,
                    is_audio_only=False,
                    raw_info=item
                ))

        # Add remaining unique heights if any
        for h in sorted(resolutions_found.keys(), reverse=True):
            if h not in used_heights and h >= 144:
                item = resolutions_found[h]
                fs = item['filesize']
                selector = f"bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
                video_formats.append(MediaFormat(
                    format_id=selector,
                    ext="mp4",
                    resolution=f"{item.get('width', 0)}x{h}",
                    label=f"{h}p • MP4",
                    filesize_approx=fs,
                    filesize_str=format_bytes(fs) if fs > 0 else "Adaptive",
                    has_video=True,
                    has_audio=True,
                    is_audio_only=False,
                    raw_info=item
                ))

        # Always add a Best Quality option at top if formats exist or if source has video
        if video_formats:
            video_formats.insert(0, MediaFormat(
                format_id="bestvideo+bestaudio/best",
                ext="mp4",
                resolution="Maximum Quality",
                label="Best Available Quality (Recommended)",
                filesize_approx=video_formats[0].filesize_approx,
                filesize_str=video_formats[0].filesize_str,
                has_video=True,
                has_audio=True,
                is_audio_only=False
            ))
        elif has_any_video:
            video_formats.append(MediaFormat(
                format_id="best",
                ext="mp4",
                resolution="Source",
                label="Best Quality • MP4",
                filesize_approx=0,
                filesize_str="Direct Stream",
                has_video=True,
                has_audio=True,
                is_audio_only=False
            ))

        return video_formats

    def _parse_audio_formats(self, raw_formats: List[Dict[str, Any]], duration: int) -> List[MediaFormat]:
        """
        Creates audio download format options: MP3, M4A, WAV, AAC.
        """
        audio_options = [
            ("mp3", "MP3 Audio (320 kbps High Quality)", "320 kbps"),
            ("m4a", "M4A Audio (Apple / AAC Quality)", "Source Audio"),
            ("wav", "WAV Audio (Uncompressed Lossless)", "Lossless PCM"),
            ("opus", "Opus Audio (Best Web Codec)", "Source Bitrate"),
        ]

        result = []
        for codec, label, note in audio_options:
            result.append(MediaFormat(
                format_id=f"audio_{codec}",
                ext=codec,
                resolution="Audio",
                label=label,
                filesize_approx=0,
                filesize_str=note,
                has_video=False,
                has_audio=True,
                is_audio_only=True
            ))
        return result

    def get_formats(self, url: str) -> List[MediaFormat]:
        meta = self.get_metadata(url)
        return meta.formats

    def download(
        self,
        url: str,
        format_id: str,
        output_dir: str,
        filename_template: str,
        is_audio: bool,
        audio_format: str,
        on_progress: Callable[[Dict[str, Any]], None],
        cancel_check: Callable[[], bool]
    ) -> Dict[str, Any]:
        os.makedirs(output_dir, exist_ok=True)
        final_file_info = {}

        def ytdl_hook(d):
            if cancel_check():
                raise Exception("Download cancelled by user.")

            status = d.get('status')
            if status == 'downloading':
                downloaded = d.get('downloaded_bytes') or 0
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                speed = d.get('speed') or 0
                eta = d.get('eta') or 0

                percent = 0.0
                if total > 0:
                    percent = round((downloaded / total) * 100, 1)

                speed_str = f"{format_bytes(int(speed))}/s" if speed > 0 else "-- KB/s"
                eta_str = format_seconds(int(eta)) if eta > 0 else "--:--"

                on_progress({
                    "status": "downloading",
                    "percent": percent,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total,
                    "speed_str": speed_str,
                    "eta_str": eta_str
                })
            elif status == 'finished':
                fn = d.get('filename')
                if fn:
                    final_file_info['finished_path'] = fn
                on_progress({
                    "status": "processing",
                    "percent": 99.0,
                    "downloaded_bytes": d.get('total_bytes', 0),
                    "total_bytes": d.get('total_bytes', 0),
                    "speed_str": "Merging / Finalizing",
                    "eta_str": "A few seconds"
                })

        # Base YDL options
        outtmpl = os.path.join(output_dir, '%(title).150s.%(ext)s')
        ydl_opts: Dict[str, Any] = {
            'outtmpl': outtmpl,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'progress_hooks': [ytdl_hook],
                        'restrictfilenames': False
        }
        if sys.platform == 'win32':
            ydl_opts['windowsfilenames'] = True

        if self.ffmpeg_path and os.path.exists(self.ffmpeg_path):
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path

        if is_audio:
            target_codec = audio_format.lower() if audio_format else "mp3"
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': target_codec,
                'preferredquality': '320',
            }]
        else:
            # Video mode
            ydl_opts['format'] = format_id if format_id else 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except Exception as e:
            if cancel_check():
                raise Exception("Download cancelled by user.")
            err_dict = humanize_error(str(e))
            raise ValueError(f"{err_dict['friendly']}|SPLIT|{err_dict['technical']}")

        # Determine output file path
        saved_file = None
        if 'finished_path' in final_file_info and os.path.exists(final_file_info['finished_path']):
            saved_file = final_file_info['finished_path']
        elif info:
            # Check requested_downloads or default prepared filename
            if 'requested_downloads' in info and len(info['requested_downloads']) > 0:
                saved_file = info['requested_downloads'][0].get('filepath')
            if not saved_file or not os.path.exists(saved_file):
                expected = ydl.prepare_filename(info)
                if is_audio:
                    base, _ = os.path.splitext(expected)
                    expected = f"{base}.{audio_format.lower()}"
                if os.path.exists(expected):
                    saved_file = expected

        if not saved_file or not os.path.exists(saved_file):
            # Scan directory for the most recently modified file in output_dir
            files = [os.path.join(output_dir, f) for f in os.listdir(output_dir) if not f.endswith('.part')]
            if files:
                saved_file = max(files, key=os.path.getmtime)

        if not saved_file or not os.path.exists(saved_file):
            raise Exception("Download completed but destination file could not be located.")

        final_size = os.path.getsize(saved_file)
        filename = os.path.basename(saved_file)

        on_progress({
            "status": "completed",
            "percent": 100.0,
            "downloaded_bytes": final_size,
            "total_bytes": final_size,
            "speed_str": "Finished",
            "eta_str": "00:00"
        })

        return {
            "file_path": saved_file,
            "filename": filename,
            "file_size": final_size,
            "file_size_str": format_bytes(final_size)
        }

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="yt-dlp Universal Engine",
            can_extract_metadata=True,
            can_stream_download=True,
            supports_quality_selection=True,
            supports_audio_extraction=True,
            supported_audio_codecs=["mp3", "m4a", "wav", "opus"]
        )






