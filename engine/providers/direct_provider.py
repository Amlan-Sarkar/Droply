"""
OmniFetch - Direct Media Provider
Handles direct HTTP/HTTPS media URLs (mp4, webm, mp3, m4a, wav, mkv, flac, etc.)
"""

import os
import re
import time
import requests
from urllib.parse import urlparse, unquote
from typing import List, Dict, Any, Callable
from .base import BaseProvider, MediaMetadata, MediaFormat, ProviderCapabilities
from ..file_manager import sanitize_filename, get_unique_filename, format_bytes


DIRECT_MEDIA_EXTENSIONS = {
    ".mp4", ".webm", ".mkv", ".mov", ".avi", ".flv",
    ".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus"
}

AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus"}


DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Encoding": "identity",
}

class DirectProvider(BaseProvider):
    def can_handle(self, url: str) -> bool:
        try:
            parsed = urlparse(url)
            path = parsed.path.lower()
            return any(path.endswith(ext) for ext in DIRECT_MEDIA_EXTENSIONS)
        except Exception:
            return False

    def detect_platform(self, url: str) -> str:
        parsed = urlparse(url)
        path = parsed.path.lower()
        ext = os.path.splitext(path)[1].upper().replace('.', '')
        return f"Direct {ext} Stream"

    def get_metadata(self, url: str) -> MediaMetadata:
        parsed = urlparse(url)
        raw_name = os.path.basename(parsed.path)
        name = unquote(raw_name)
        title = os.path.splitext(name)[0] or "Direct Stream"
        ext = os.path.splitext(name)[1].lower().replace('.', '') or "mp4"

        # Probe HEAD request to get file size
        filesize = 0
        try:
            resp = requests.head(url, headers=DEFAULT_HEADERS, allow_redirects=True, timeout=5)
            if resp.status_code == 200:
                filesize = int(resp.headers.get("content-length", 0))
        except Exception:
            pass

        is_audio = f".{ext}" in AUDIO_EXTENSIONS
        format_entry = MediaFormat(
            format_id="direct_original",
            ext=ext,
            resolution="audio-only" if is_audio else "Source Resolution",
            label=f"Direct Stream ({ext.upper()})",
            filesize_approx=filesize,
            filesize_str=format_bytes(filesize) if filesize > 0 else "Direct",
            has_video=not is_audio,
            has_audio=True,
            is_audio_only=is_audio
        )

        return MediaMetadata(
            id=f"direct_{hash(url)}",
            url=url,
            title=title,
            platform=self.detect_platform(url),
            uploader=parsed.netloc or "Direct Link",
            uploader_url=f"{parsed.scheme}://{parsed.netloc}",
            duration=0,
            duration_str="Direct File",
            thumbnail="", # no thumbnail for raw files
            description=f"Direct downloadable media link from {parsed.netloc}",
            formats=[format_entry] if not is_audio else [],
            audio_formats=[format_entry] if is_audio else [],
            webpage_url=url,
            original_url=url
        )

    def get_formats(self, url: str) -> List[MediaFormat]:
        meta = self.get_metadata(url)
        return meta.formats or meta.audio_formats

    def download(
        self,
        url: str,
        format_id: str,
        output_dir: str,
        filename_template: str,
        is_audio: bool,
        audio_format: str,
        on_progress: Callable[[Dict[str, Any]], None],
        cancel_check: Callable[[], bool],
        title: str = ""
    ) -> Dict[str, Any]:
        parsed = urlparse(url)
        raw_name = os.path.basename(parsed.path)
        name = unquote(raw_name)
        stem = os.path.splitext(name)[0] or "media"
        ext = os.path.splitext(name)[1] or (".mp3" if is_audio else ".mp4")

        safe_title = sanitize_filename(stem)
        target_filename = get_unique_filename(output_dir, f"{safe_title}{ext}")
        final_path = os.path.join(output_dir, target_filename)

        start_time = time.time()
        last_update_time = 0.0

        with requests.get(url, headers=DEFAULT_HEADERS, stream=True, timeout=15) as r:
            r.raise_for_status()
            total_bytes = int(r.headers.get('content-length', 0))
            downloaded_bytes = 0

            with open(final_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=65536):
                    if cancel_check():
                        f.close()
                        if os.path.exists(final_path):
                            os.remove(final_path)
                        raise Exception("Download cancelled by user.")

                    if chunk:
                        f.write(chunk)
                        downloaded_bytes += len(chunk)

                        now = time.time()
                        if now - last_update_time >= 0.25:
                            last_update_time = now
                            elapsed = max(now - start_time, 0.001)
                            speed = downloaded_bytes / elapsed
                            speed_str = f"{format_bytes(int(speed))}/s"

                            eta_str = "--:--"
                            percent = 0.0
                            if total_bytes > 0:
                                percent = round((downloaded_bytes / total_bytes) * 100, 1)
                                remaining = max(total_bytes - downloaded_bytes, 0)
                                if speed > 0:
                                    eta_sec = int(remaining / speed)
                                    m, s = divmod(eta_sec, 60)
                                    eta_str = f"{m:02d}:{s:02d}"

                            on_progress({
                                "status": "downloading",
                                "percent": percent,
                                "downloaded_bytes": downloaded_bytes,
                                "total_bytes": total_bytes,
                                "speed_str": speed_str,
                                "eta_str": eta_str
                            })

        # Final progress
        on_progress({
            "status": "finished",
            "percent": 100.0,
            "downloaded_bytes": downloaded_bytes,
            "total_bytes": downloaded_bytes,
            "speed_str": "Completed",
            "eta_str": "00:00"
        })

        return {
            "file_path": final_path,
            "filename": target_filename,
            "file_size": downloaded_bytes,
            "file_size_str": format_bytes(downloaded_bytes)
        }

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name="Direct Stream Provider",
            can_extract_metadata=True,
            can_stream_download=True,
            supports_quality_selection=False,
            supports_audio_extraction=False
        )
