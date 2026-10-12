"""
OmniFetch - Base Provider Definition
Defines the standard provider abstraction for media extraction and downloads.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Callable, Dict, Any


@dataclass
class MediaFormat:
    format_id: str
    ext: str
    resolution: str          # e.g., "1920x1080", "1280x720", "audio-only"
    label: str               # e.g., "1080p (MP4)", "720p (WEBM)", "320 kbps (MP3)"
    filesize_approx: int = 0 # in bytes, 0 if unknown
    filesize_str: str = ""   # e.g., "~145.2 MB"
    vcodec: str = ""
    acodec: str = ""
    fps: Optional[int] = None
    has_video: bool = True
    has_audio: bool = True
    is_audio_only: bool = False
    raw_info: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MediaMetadata:
    id: str
    url: str
    title: str
    platform: str            # e.g. "YouTube", "Twitter / X", "Vimeo", "Direct File"
    uploader: str = "Unknown"
    uploader_url: str = ""
    duration: int = 0        # in seconds
    duration_str: str = ""   # e.g. "04:12"
    thumbnail: str = ""
    description: str = ""
    formats: List[MediaFormat] = field(default_factory=list)
    audio_formats: List[MediaFormat] = field(default_factory=list)
    webpage_url: str = ""
    original_url: str = ""
    is_playlist: bool = False
    playlist_count: int = 0
    playlist_entries: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ProviderCapabilities:
    name: str
    can_extract_metadata: bool = True
    can_stream_download: bool = True
    supports_quality_selection: bool = True
    supports_audio_extraction: bool = True
    supported_audio_codecs: List[str] = field(default_factory=lambda: ["mp3", "m4a", "wav", "aac"])


class BaseProvider(ABC):
    """
    Abstract base class for all OmniFetch media providers.
    """

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """Return True if this provider can process the given URL."""
        pass

    @abstractmethod
    def detect_platform(self, url: str) -> str:
        """Return the friendly platform name (e.g. YouTube, TikTok, Reddit, Direct)."""
        pass

    @abstractmethod
    def get_metadata(self, url: str) -> MediaMetadata:
        """Retrieve media metadata, thumbnails, title, duration and formats."""
        pass

    @abstractmethod
    def get_formats(self, url: str) -> List[MediaFormat]:
        """Retrieve available video and audio formats."""
        pass

    @abstractmethod
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
        """
        Execute local download.
        Calls on_progress with dict:
          {
            "percent": float,
            "downloaded_bytes": int,
            "total_bytes": int,
            "speed_str": str,
            "eta_str": str,
            "status": str
          }
        Returns dict with final saved filepath, filename, size, etc.
        """
        pass

    @abstractmethod
    def capabilities(self) -> ProviderCapabilities:
        """Return provider capabilities."""
        pass
