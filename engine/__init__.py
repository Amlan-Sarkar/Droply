"""
OmniFetch Core Engine
"""
from .providers.registry import registry
from .settings_manager import settings_manager
from .history_manager import history_manager
from .queue_manager import queue_manager
from .file_manager import (
    sanitize_filename,
    get_unique_filename,
    format_bytes,
    format_seconds,
    open_folder,
    open_in_folder,
    open_file,
    get_default_download_dir
)

__all__ = [
    "registry",
    "settings_manager",
    "history_manager",
    "queue_manager",
    "sanitize_filename",
    "get_unique_filename",
    "format_bytes",
    "format_seconds",
    "open_folder",
    "open_in_folder",
    "open_file",
    "get_default_download_dir"
]
