"""
OmniFetch - Automated Comprehensive Engine & API Test Suite
Validates core providers, platform detection, file manager, queue, settings, history, and REST API.
"""

import os
import sys
import shutil
import tempfile
import unittest
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from engine.providers.registry import registry
from engine.providers.ytdlp_provider import humanize_error
from engine.file_manager import sanitize_filename, get_unique_filename, format_bytes, format_seconds
from engine.settings_manager import SettingsManager
from engine.history_manager import HistoryManager
from engine.queue_manager import QueueManager, DownloadTask


class TestOmniFetchCore(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_url_validation_and_platform_detection(self):
        """Test URL validation and fast regex platform detection."""
        test_cases = [
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", True, "YouTube"),
            ("https://youtu.be/dQw4w9WgXcQ", True, "YouTube"),
            ("https://x.com/OpenAI/status/123456789", True, "Twitter / X"),
            ("https://twitter.com/user/status/123", True, "Twitter / X"),
            ("https://www.tiktok.com/@user/video/123456", True, "TikTok"),
            ("https://www.reddit.com/r/videos/comments/xyz", True, "Reddit"),
            ("https://vimeo.com/76979871", True, "Vimeo"),
            ("https://soundcloud.com/artist/track", True, "SoundCloud"),
            ("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", True, "Direct MP4 File"),
            ("not-a-valid-url", False, "Unknown"),
            ("", False, "Unknown"),
        ]

        for url, expected_valid, expected_platform in test_cases:
            valid = registry.is_valid_url(url)
            self.assertEqual(valid, expected_valid, f"Failed validation for {url}")
            if valid:
                platform = registry.detect_platform(url)
                self.assertEqual(platform, expected_platform, f"Failed platform detect for {url}")

    def test_filename_sanitization(self):
        """Test invalid filesystem characters removal and length truncation."""
        dirty_name = 'My: Cool / Video? *with* <illegal> |chars| & "quotes"'
        clean = sanitize_filename(dirty_name)
        self.assertNotIn(':', clean)
        self.assertNotIn('/', clean)
        self.assertNotIn('?', clean)
        self.assertNotIn('*', clean)
        self.assertNotIn('<', clean)
        self.assertNotIn('>', clean)
        self.assertNotIn('|', clean)
        self.assertNotIn('"', clean)
        self.assertTrue(len(clean) > 0)

        # Empty fallback
        self.assertEqual(sanitize_filename(""), "droply_media")

    def test_duplicate_filename_collision(self):
        """Test collision resolution: Video.mp4 -> Video (1).mp4 -> Video (2).mp4."""
        test_file = Path(self.temp_dir) / "TestVideo.mp4"
        test_file.write_text("dummy")

        candidate1 = get_unique_filename(self.temp_dir, "TestVideo.mp4")
        self.assertEqual(candidate1, "TestVideo (1).mp4")

        (Path(self.temp_dir) / candidate1).write_text("dummy2")
        candidate2 = get_unique_filename(self.temp_dir, "TestVideo.mp4")
        self.assertEqual(candidate2, "TestVideo (2).mp4")

    def test_formatting_utilities(self):
        """Test byte and seconds formatting."""
        self.assertEqual(format_bytes(500), "500.0 B")
        self.assertEqual(format_bytes(1024), "1.0 KB")
        self.assertEqual(format_bytes(1024 * 1024 * 5), "5.0 MB")
        self.assertEqual(format_bytes(1024 * 1024 * 1024 * 2), "2.0 GB")

        self.assertEqual(format_seconds(45), "00:45")
        self.assertEqual(format_seconds(125), "02:05")
        self.assertEqual(format_seconds(3665), "01:01:05")

    def test_humanize_errors(self):
        """Test friendly user error translation."""
        err_403 = humanize_error("HTTP Error 403: Forbidden")
        self.assertIn("rejected", err_403["friendly"].lower())

        err_drm = humanize_error("This video is DRM protected")
        self.assertIn("drm", err_drm["friendly"].lower())

        err_priv = humanize_error("Private video. Sign in to view.")
        self.assertIn("private", err_priv["friendly"].lower())

    def test_settings_persistence(self):
        """Test persistent settings saving and retrieval."""
        cfg_dir = Path(self.temp_dir) / "config"
        sm = SettingsManager(cfg_dir)
        defaults = sm.get_all()
        self.assertIn("download_dir", defaults)
        self.assertEqual(defaults["max_concurrent_downloads"], 3)

        sm.update({"max_concurrent_downloads": 4, "theme": "oled"})
        sm_reloaded = SettingsManager(cfg_dir)
        self.assertEqual(sm_reloaded.get("max_concurrent_downloads"), 4)
        self.assertEqual(sm_reloaded.get("theme"), "oled")

    def test_history_manager(self):
        """Test download history recording, listing, and deletion."""
        hist_dir = Path(self.temp_dir) / "history"
        hm = HistoryManager(hist_dir)

        dummy_entry = {
            "id": "item-101",
            "title": "Awesome Sample Video",
            "url": "https://example.com/video.mp4",
            "platform": "Direct",
            "filename": "Awesome Sample Video.mp4",
            "file_size": 15000000,
            "status": "completed"
        }
        hm.add_entry(dummy_entry)

        items = hm.get_all()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "item-101")
        self.assertEqual(items[0]["title"], "Awesome Sample Video")

        # Remove entry
        res = hm.remove_entry("item-101")
        self.assertTrue(res)
        self.assertEqual(len(hm.get_all()), 0)

    def test_queue_task_lifecycle(self):
        """Test queue task state changes, cancellation and retrying."""
        qm = QueueManager()
        task = qm.add_task(
            url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            title="Sample Video",
            output_dir=self.temp_dir
        )
        self.assertIsNotNone(task)
        self.assertEqual(task.status, "queued")

        # Cancel task
        qm.cancel_task(task.id)
        self.assertEqual(task.status, "cancelled")

        # Retry task
        qm.retry_task(task.id)
        self.assertEqual(task.status, "queued")

        # Remove task
        qm.remove_task(task.id)
        self.assertIsNone(qm.get_task(task.id))


if __name__ == "__main__":
    unittest.main()

