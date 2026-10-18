"""
Droply - Provider Registry
Manages registered providers and handles instant platform detection.
"""

import re
from urllib.parse import urlparse
from typing import List, Optional
from .base import BaseProvider
from .direct_provider import DirectProvider
from .ytdlp_provider import YtDlpProvider, PLATFORM_PATTERNS


class ProviderRegistry:
    def __init__(self):
        self._providers: List[BaseProvider] = [
            DirectProvider(),
            YtDlpProvider(),
        ]

    def register_provider(self, provider: BaseProvider):
        self._providers.insert(0, provider)

    def is_valid_url(self, url: str) -> bool:
        if not url or not isinstance(url, str):
            return False
        url = url.strip()
        try:
            parsed = urlparse(url)
            return bool(parsed.scheme in ("http", "https") and parsed.netloc and "." in parsed.netloc)
        except Exception:
            return False

    def detect_platform(self, url: str) -> str:
        """
        Fast regex/heuristic platform detection that returns immediately without network calls.
        """
        if not self.is_valid_url(url):
            return "Unknown"

        # Check direct media extensions
        url_lower = url.lower()
        for ext in ('.mp4', '.webm', '.mkv', '.mov', '.mp3', '.m4a', '.wav', '.flac'):
            if ext in url_lower:
                return f"Direct {ext[1:].upper()} File"

        # Check known platforms
        for pattern, name in PLATFORM_PATTERNS:
            if re.search(pattern, url, re.IGNORECASE):
                return name

        try:
            parsed = urlparse(url)
            domain = parsed.netloc.replace("www.", "").split(".")[0]
            return domain.capitalize() if domain else "Online Media"
        except Exception:
            return "Online Media"

    def get_provider_for_url(self, url: str) -> BaseProvider:
        for p in self._providers:
            if p.can_handle(url):
                return p
        # Default fallback is YtDlpProvider
        return self._providers[-1]


registry = ProviderRegistry()
