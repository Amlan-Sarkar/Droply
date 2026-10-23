"""
Droply - Queue & Download Manager
Coordinates concurrent download jobs, batch queues, status tracking,
cancellation, retries, and WebSocket event broadcasts.
"""

import os
import time
import uuid
import threading
import asyncio
from typing import Dict, Any, List, Optional, Callable
from concurrent.futures import ThreadPoolExecutor

from .providers.registry import registry
from .settings_manager import settings_manager
from .history_manager import history_manager
from .file_manager import format_bytes, get_default_download_dir


class DownloadPausedException(Exception):
    """Raised when a download task is paused by user to gracefully halt execution while keeping partial files intact."""
    pass


class DownloadTask:
    def __init__(
        self,
        url: str,
        title: str = "Analyzing...",
        platform: str = "Unknown",
        thumbnail: str = "",
        format_id: str = "",
        format_label: str = "Best Quality",
        is_audio: bool = False,
        audio_format: str = "mp3",
        output_dir: str = "",
        task_id: str = None,
        expected_size_str: str = "",
        expected_bytes: int = 0
    ):
        self.id = task_id or str(uuid.uuid4())
        self.url = url
        self.title = title
        self.platform = platform
        self.thumbnail = thumbnail
        self.format_id = format_id
        self.format_label = format_label
        self.is_audio = is_audio
        self.audio_format = audio_format
        self.output_dir = output_dir or settings_manager.get("download_dir", get_default_download_dir())
        self.expected_size_str = expected_size_str
        self.expected_bytes = expected_bytes

        self.status = "queued" # queued, downloading, processing, completed, failed, cancelled, paused
        self.percent = 0.0
        self.downloaded_bytes = 0
        self.total_bytes = 0
        self.speed_str = "-- KB/s"
        self.eta_str = "--:--"
        self.error_friendly = None
        self.error_suggestion = None
        self.error_technical = None
        self.file_path = None
        self.filename = None
        self.file_size = 0
        self.file_size_str = ""
        self.created_at = time.time()
        self.completed_at = None

        self._cancelled = False
        self._paused = False

    def cancel(self):
        self._cancelled = True
        self.status = "cancelled"

    def is_cancelled(self) -> bool:
        return self._cancelled

    def pause(self):
        self._paused = True
        self.status = "paused"

    def resume(self):
        self._paused = False
        self._cancelled = False
        self.status = "queued"

    def is_paused(self) -> bool:
        return self._paused

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "platform": self.platform,
            "thumbnail": self.thumbnail,
            "format_id": self.format_id,
            "format_label": self.format_label,
            "is_audio": self.is_audio,
            "audio_format": self.audio_format,
            "output_dir": self.output_dir,
            "status": self.status,
            "percent": self.percent,
            "downloaded_bytes": self.downloaded_bytes,
            "downloaded_str": format_bytes(self.downloaded_bytes),
            "total_bytes": self.total_bytes,
            "total_str": format_bytes(self.total_bytes) if self.total_bytes > 0 else "Unknown",
            "expected_size_str": self.expected_size_str,
            "expected_bytes": self.expected_bytes,
            "speed_str": self.speed_str,
            "eta_str": self.eta_str,
            "error_friendly": self.error_friendly,
            "error_suggestion": self.error_suggestion,
            "error_technical": self.error_technical,
            "file_path": self.file_path,
            "filename": self.filename,
            "file_size": self.file_size,
            "file_size_str": self.file_size_str,
            "created_at": self.created_at,
        }


class QueueManager:
    def __init__(self):
        self.tasks: Dict[str, DownloadTask] = {}
        self.task_order: List[str] = []
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=5, thread_name_prefix="droply_worker")
        self._listeners: List[Callable[[Dict[str, Any]], None]] = []
        self._running = True

        # Background worker loop thread
        self._worker_thread = threading.Thread(target=self._process_queue_loop, daemon=True)
        self._worker_thread.start()

    def add_listener(self, callback: Callable[[Dict[str, Any]], None]):
        self._listeners.append(callback)

    def remove_listener(self, callback: Callable[[Dict[str, Any]], None]):
        if callback in self._listeners:
            self._listeners.remove(callback)

    def _broadcast(self, event_type: str, task: DownloadTask):
        data = {
            "event": event_type,
            "task": task.to_dict()
        }
        for listener in list(self._listeners):
            try:
                listener(data)
            except Exception:
                pass

    def _broadcast_event(self, event_type: str, payload: Dict[str, Any]):
        data = {
            "event": event_type,
            **payload
        }
        for listener in list(self._listeners):
            try:
                listener(data)
            except Exception:
                pass

    def add_task(
        self,
        url: str,
        title: str = "",
        platform: str = "",
        thumbnail: str = "",
        format_id: str = "",
        format_label: str = "Best Quality",
        is_audio: bool = False,
        audio_format: str = "mp3",
        output_dir: str = "",
        expected_size_str: str = "",
        expected_bytes: int = 0
    ) -> DownloadTask:
        with self._lock:
            if not platform:
                platform = registry.detect_platform(url)
            if not title:
                title = f"{platform} Media"

            task = DownloadTask(
                url=url,
                title=title,
                platform=platform,
                thumbnail=thumbnail,
                format_id=format_id,
                format_label=format_label,
                is_audio=is_audio,
                audio_format=audio_format,
                output_dir=output_dir,
                expected_size_str=expected_size_str,
                expected_bytes=expected_bytes
            )
            self.tasks[task.id] = task
            self.task_order.insert(0, task.id)
            self._broadcast("task_added", task)
            return task

    def get_task(self, task_id: str) -> Optional[DownloadTask]:
        return self.tasks.get(task_id)

    def get_all_tasks(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [self.tasks[tid].to_dict() for tid in self.task_order if tid in self.tasks]

    def _cleanup_partial_files(self, task: DownloadTask):
        try:
            if task.output_dir and os.path.isdir(task.output_dir):
                for fn in os.listdir(task.output_dir):
                    if fn.endswith('.part') or '.temp' in fn:
                        fp = os.path.join(task.output_dir, fn)
                        if os.path.isfile(fp):
                            os.remove(fp)
        except Exception:
            pass

    def cancel_task(self, task_id: str) -> bool:
        with self._lock:
            task = self.tasks.get(task_id)
            if task:
                task.cancel()
                self._cleanup_partial_files(task)
                self._broadcast("task_updated", task)
                return True
        return False

    def pause_task(self, task_id: str) -> bool:
        with self._lock:
            task = self.tasks.get(task_id)
            if task and task.status in ("downloading", "processing", "queued"):
                task.pause()
                self._broadcast("task_updated", task)
                return True
        return False

    def resume_task(self, task_id: str) -> bool:
        with self._lock:
            task = self.tasks.get(task_id)
            if task and task.status == "paused":
                task.resume()
                self._broadcast("task_updated", task)
                return True
        return False

    def retry_task(self, task_id: str) -> bool:
        with self._lock:
            task = self.tasks.get(task_id)
            if task and task.status in ("failed", "cancelled"):
                self._cleanup_partial_files(task)
                task.status = "queued"
                task._cancelled = False
                task.percent = 0.0
                task.downloaded_bytes = 0
                task.error_friendly = None
                task.error_suggestion = None
                task.error_technical = None
                self._broadcast("task_updated", task)
                return True
        return False

    def remove_task(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                if task.status == "downloading":
                    task.cancel()
                del self.tasks[task_id]
                if task_id in self.task_order:
                    self.task_order.remove(task_id)
                self._broadcast("task_removed", task)
                return True
        return False

    def clear_finished(self):
        with self._lock:
            to_remove = [tid for tid, t in self.tasks.items() if t.status in ("completed", "failed", "cancelled")]
            for tid in to_remove:
                del self.tasks[tid]
                if tid in self.task_order:
                    self.task_order.remove(tid)
        self._broadcast_event("queue_cleared", {"cleared_count": len(to_remove)})

    def _process_queue_loop(self):
        """Monitors queue and submits queued tasks up to max_concurrent_downloads."""
        while self._running:
            time.sleep(0.3)
            max_concurrent = int(settings_manager.get("max_concurrent_downloads", 3))

            active_count = sum(1 for t in self.tasks.values() if t.status in ("downloading", "processing"))
            if active_count >= max_concurrent:
                continue

            # Find next queued task
            task_to_run = None
            with self._lock:
                for tid in reversed(self.task_order):
                    t = self.tasks[tid]
                    if t.status == "queued":
                        task_to_run = t
                        t.status = "downloading"
                        break

            if task_to_run:
                self._broadcast("task_updated", task_to_run)
                self._executor.submit(self._execute_task, task_to_run)

    def _execute_task(self, task: DownloadTask):
        try:
            provider = registry.get_provider_for_url(task.url)

            # If task metadata wasn't extracted yet (e.g., from quick batch paste)
            if task.title == "Analyzing..." or not task.thumbnail:
                try:
                    meta = provider.get_metadata(task.url)
                    task.title = meta.title
                    task.platform = meta.platform
                    task.thumbnail = meta.thumbnail
                    self._broadcast("task_updated", task)
                except Exception as meta_e:
                    # Proceed with url if metadata probe fails
                    pass

            last_progress_emit = [0.0]
            last_percent = [-1.0]

            def progress_callback(info: Dict[str, Any]):
                task.status = info.get("status", "downloading")
                task.percent = info.get("percent", task.percent)
                task.downloaded_bytes = info.get("downloaded_bytes", task.downloaded_bytes)
                task.total_bytes = info.get("total_bytes", task.total_bytes)
                task.speed_str = info.get("speed_str", task.speed_str)
                task.eta_str = info.get("eta_str", task.eta_str)

                now = time.time()
                pct = task.percent
                if (now - last_progress_emit[0] >= 0.1) or (abs(pct - last_percent[0]) >= 0.5) or pct >= 100.0:
                    last_progress_emit[0] = now
                    last_percent[0] = pct
                    self._broadcast("task_progress", task)

            def check_stop():
                if task.is_paused():
                    raise DownloadPausedException("Download paused by user.")
                return task.is_cancelled()

            res = provider.download(
                url=task.url,
                format_id=task.format_id,
                output_dir=task.output_dir,
                filename_template=settings_manager.get("filename_template", "{title}"),
                is_audio=task.is_audio,
                audio_format=task.audio_format,
                on_progress=progress_callback,
                cancel_check=check_stop,
                title=task.title
            )

            task.status = "completed"
            task.percent = 100.0
            task.file_path = res.get("file_path")
            task.filename = res.get("filename")
            task.file_size = res.get("file_size", 0)
            task.file_size_str = res.get("file_size_str", "")
            task.completed_at = time.time()
            self._broadcast("task_completed", task)

            # Record in history
            history_manager.add_entry({
                "id": task.id,
                "title": task.title,
                "url": task.url,
                "platform": task.platform,
                "filename": task.filename,
                "file_path": task.file_path,
                "file_size": task.file_size,
                "file_size_str": task.file_size_str,
                "format_label": task.format_label,
                "is_audio": task.is_audio,
                "thumbnail": task.thumbnail,
                "status": "completed",
            })

        except DownloadPausedException:
            task.status = "paused"
            self._broadcast("task_updated", task)
            return

        except Exception as e:
            if task.is_paused():
                task.status = "paused"
                self._broadcast("task_updated", task)
                return
            if task.is_cancelled():
                task.status = "cancelled"
                self._broadcast("task_updated", task)
                return

            err_str = str(e)
            friendly = "Download failed."
            suggestion = ""
            technical = err_str
            if "|SPLIT|" in err_str:
                parts = err_str.split("|SPLIT|")
                friendly = parts[0]
                if len(parts) >= 3:
                    suggestion = parts[1]
                    technical = parts[2]
                else:
                    technical = parts[1]
            else:
                friendly = err_str

            self._cleanup_partial_files(task)
            task.status = "failed"
            task.error_friendly = friendly
            task.error_suggestion = suggestion
            task.error_technical = technical
            self._broadcast("task_failed", task)


queue_manager = QueueManager()
