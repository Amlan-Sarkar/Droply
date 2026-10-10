"""
droply - Real Local Media Download Integration Test
Performs actual download of sample media to ensure stream extraction,
progress callback, filesystem writing, and completion hooks work 100%.
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
from engine.providers.direct_provider import DirectProvider


class TestRealDownload(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_direct_provider_real_download(self):
        sample_url = "https://filesamples.com/samples/video/mp4/sample_640x360.mp4"
        provider = registry.get_provider_for_url(sample_url)
        self.assertIsInstance(provider, DirectProvider)

        meta = provider.get_metadata(sample_url)
        self.assertTrue(len(meta.title) > 0)
        self.assertEqual(meta.platform, "Direct MP4 Stream")

        progress_events = []
        def on_progress(p):
            progress_events.append(p)

        res = provider.download(
            url=sample_url,
            format_id="direct_original",
            output_dir=self.temp_dir,
            filename_template="{title}",
            is_audio=False,
            audio_format="mp3",
            on_progress=on_progress,
            cancel_check=lambda: False
        )

        saved_path = res["file_path"]
        self.assertTrue(os.path.exists(saved_path))
        self.assertTrue(os.path.getsize(saved_path) > 1000)
        self.assertTrue(len(progress_events) > 0)
        final_event = progress_events[-1]
        self.assertEqual(final_event["status"], "finished")
        self.assertEqual(final_event["percent"], 100.0)


if __name__ == "__main__":
    unittest.main()

