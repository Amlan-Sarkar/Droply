"""
Droply - Settings Manager
Persists and manages user configurations in local config storage.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any
from .file_manager import get_default_download_dir


class SettingsManager:
    def __init__(self, config_dir: Path = None):
        if config_dir is None:
            self.config_dir = Path.home() / ".droply"
        else:
            self.config_dir = config_dir

        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.config_file = self.config_dir / "settings.json"
        self._settings = self._load()

    def get_defaults(self) -> Dict[str, Any]:
        return {
            "download_dir": get_default_download_dir(),
            "default_video_quality": "1080p",
            "default_audio_format": "mp3",
            "max_concurrent_downloads": 3,
            "auto_start_batch": True,
            "theme": "dark",
            "filename_template": "{title}",
            "notifications": True,
            "auto_open_folder_on_finish": False,
            "cookie_file": "",
            "cookie_browser": "none",
        }

    def _load(self) -> Dict[str, Any]:
        defaults = self.get_defaults()
        if not self.config_file.exists():
            self._save(defaults)
            return defaults
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                # merge with defaults for any new keys
                for k, v in defaults.items():
                    if k not in data:
                        data[k] = v
                return data
        except Exception as e:
            print(f"Error loading settings, resetting to defaults: {e}")
            return defaults

    def _save(self, data: Dict[str, Any]):
        try:
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving settings: {e}")

    def get_all(self) -> Dict[str, Any]:
        return self._settings.copy()

    def get(self, key: str, default=None):
        return self._settings.get(key, default)

    def update(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        self._settings.update(updates)
        self._save(self._settings)
        return self._settings.copy()


settings_manager = SettingsManager()
