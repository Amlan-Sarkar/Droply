"""
Droply - File Manager
Handles filesystem sanitization, duplicate name resolution, opening explorer windows,
and disk space checks safely.
"""

import os
import re
import sys
import shutil
import subprocess
from pathlib import Path
from typing import Tuple, Optional


def sanitize_filename(name: str, max_length: int = 200) -> str:
    """
    Sanitize string into a safe, valid filesystem filename for Windows/macOS/Linux.
    Removes reserved characters: < > : " / \\ | ? * and control chars.
    """
    if not name:
        return "droply_media"

    # Replace invalid Windows chars
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # Remove leading/trailing spaces and dots
    sanitized = sanitized.strip(' .')
    # Collapse multiple whitespaces
    sanitized = re.sub(r'\s+', ' ', sanitized)

    if not sanitized:
        sanitized = "downloaded_media"

    # Truncate to max_length while avoiding cutting in bad spots
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length].rstrip(' .')

    return sanitized


def get_unique_filename(directory: str, filename: str) -> str:
    """
    If filename exists in directory, appends ' (1)', ' (2)' before extension.
    Example: 'Video.mp4' -> 'Video (1).mp4'
    """
    dir_path = Path(directory)
    dir_path.mkdir(parents=True, exist_ok=True)

    target_path = dir_path / filename
    if not target_path.exists():
        return filename

    stem = target_path.stem
    suffix = target_path.suffix

    # Check if stem already ends with (N)
    match = re.search(r'^(.*)\s*\((\d+)\)$', stem)
    base_name = stem
    counter = 1
    if match:
        base_name = match.group(1).rstrip()
        counter = int(match.group(2)) + 1

    while True:
        candidate_name = f"{base_name} ({counter}){suffix}"
        if not (dir_path / candidate_name).exists():
            return candidate_name
        counter += 1


def format_bytes(size_bytes: int) -> str:
    """Format bytes into clean human readable string (KB, MB, GB)."""
    if size_bytes is None or size_bytes < 0:
        return "Unknown"
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0
    val = float(size_bytes)
    while val >= 1024.0 and unit_index < len(units) - 1:
        val /= 1024.0
        unit_index += 1
    return f"{val:.1f} {units[unit_index]}"


def format_seconds(seconds: int) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    if not seconds or seconds < 0:
        return "--:--"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _normalize_name(name: str) -> str:
    return name.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"').strip()


def resolve_existing_path(file_path: str) -> Optional[str]:
    """Finds actual path on disk even if unicode apostrophes or quotes differ."""
    if not file_path:
        return None
    p = os.path.abspath(file_path)
    if os.path.exists(p):
        return p
    parent = os.path.dirname(p)
    if not os.path.isdir(parent):
        return None
    target_norm = _normalize_name(os.path.basename(p)).lower()
    try:
        for fname in os.listdir(parent):
            if _normalize_name(fname).lower() == target_norm:
                cand = os.path.join(parent, fname)
                if os.path.isfile(cand):
                    return cand
    except Exception:
        pass
    return None


def open_folder(directory_path: str) -> bool:
    """Open folder in Windows Explorer or default file manager."""
    try:
        path = os.path.abspath(directory_path)
        if not os.path.exists(path):
            os.makedirs(path, exist_ok=True)

        if sys.platform == "win32":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
        return True
    except Exception as e:
        print(f"Failed to open folder: {e}")
        return False


def open_in_folder(file_path: str) -> bool:
    """Reveal file in Windows Explorer or file manager."""
    try:
        real_path = resolve_existing_path(file_path)
        if real_path:
            if sys.platform == "win32":
                subprocess.Popen(f'explorer.exe /select,"{real_path}"')
                return True
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", real_path])
                return True
            else:
                subprocess.Popen(["xdg-open", os.path.dirname(real_path)])
                return True

        # Fallback to containing folder
        parent = os.path.dirname(os.path.abspath(file_path)) if file_path else None
        if parent and os.path.isdir(parent):
            return open_folder(parent)
        return False
    except Exception as e:
        print(f"Failed to reveal file: {e}")
        return False


def open_file(file_path: str) -> bool:
    """Launch/play downloaded file with system default player."""
    try:
        real_path = resolve_existing_path(file_path)
        if not real_path:
            return False

        if sys.platform == "win32":
            os.startfile(real_path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", real_path])
        else:
            subprocess.Popen(["xdg-open", real_path])
        return True
    except Exception as e:
        print(f"Failed to open file: {e}")
        return False


def get_default_download_dir() -> str:
    """Return default user Downloads/Droply folder."""
    home = Path.home()
    default_dir = home / "Downloads" / "Droply"
    default_dir.mkdir(parents=True, exist_ok=True)
    return str(default_dir)


def get_disk_free_space(dir_path: str) -> int:
    """Return free disk space in bytes for given directory."""
    try:
        p = os.path.abspath(dir_path)
        if not os.path.exists(p):
            p = os.path.dirname(p)
        total, used, free = shutil.disk_usage(p)
        return free
    except Exception:
        return 0
