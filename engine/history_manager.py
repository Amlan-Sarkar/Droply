"""
Droply - History Manager
Maintains records of completed, failed, and past downloads locally.
"""

import json
import os
import time
from pathlib import Path
from typing import List, Dict, Any, Optional


class HistoryManager:
    def __init__(self, config_dir: Path = None):
        if config_dir is None:
            self.config_dir = Path.home() / ".droply"
        else:
            self.config_dir = config_dir

        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.history_file = self.config_dir / "history.json"
        self._history: List[Dict[str, Any]] = self._load()

    def _load(self) -> List[Dict[str, Any]]:
        if not self.history_file.exists():
            return []
        try:
            with open(self.history_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading download history: {e}")
            return []

    def _save(self):
        try:
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump(self._history, f, indent=2)
        except Exception as e:
            print(f"Error saving download history: {e}")

    def get_all(self) -> List[Dict[str, Any]]:
        return list(reversed(self._history))

    def add_entry(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add or update history record.
        """
        record = {
            "id": entry.get("id", str(int(time.time() * 1000))),
            "title": entry.get("title", "Untitled Media"),
            "url": entry.get("url", ""),
            "platform": entry.get("platform", "Unknown"),
            "filename": entry.get("filename", ""),
            "file_path": entry.get("file_path", ""),
            "file_size": entry.get("file_size", 0),
            "file_size_str": entry.get("file_size_str", ""),
            "format_label": entry.get("format_label", ""),
            "is_audio": entry.get("is_audio", False),
            "thumbnail": entry.get("thumbnail", ""),
            "status": entry.get("status", "completed"), # completed, failed
            "error": entry.get("error", None),
            "created_at": entry.get("created_at", int(time.time())),
            "created_at_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(entry.get("created_at", time.time()))),
        }

        # Check if record with this id already exists, update it
        existing_idx = next((i for i, item in enumerate(self._history) if item.get("id") == record["id"]), None)
        if existing_idx is not None:
            self._history[existing_idx] = record
        else:
            self._history.append(record)

        self._save()
        return record

    def remove_entry(self, entry_id: str, delete_file: bool = False) -> bool:
        """
        Remove record from history. If delete_file is True, also deletes the actual local file.
        """
        idx = next((i for i, item in enumerate(self._history) if item.get("id") == entry_id), None)
        if idx is not None:
            item = self._history.pop(idx)
            if delete_file:
                fp = item.get("file_path")
                if fp and os.path.exists(fp):
                    try:
                        os.remove(fp)
                    except Exception as e:
                        print(f"Error removing file {fp}: {e}")
            self._save()
            return True
        return False

    def clear_all(self):
        self._history = []
        self._save()


history_manager = HistoryManager()
