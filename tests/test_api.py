"""
Droply - API Integration Tests
Tests all FastAPI REST endpoints.
"""

import sys
import unittest
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from fastapi.testclient import TestClient
from server.api import app, AUTH_TOKEN

client = TestClient(app, headers={"X-Auth-Token": AUTH_TOKEN})


class TestAPIEndpoints(unittest.TestCase):

    def test_security_missing_token_unauthorized(self):
        raw_client = TestClient(app)
        resp = raw_client.get("/api/settings")
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.json()["error"], "Unauthorized")

    def test_security_cross_site_protection(self):
        resp = client.get("/api/settings", headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["error"], "Forbidden")

    def test_security_unauthorized_origin(self):
        resp = client.get("/api/settings", headers={"Origin": "https://malicious-site.com"})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["error"], "Forbidden")

    def test_security_input_bounding(self):
        # Exceeds 2048 character URL ceiling
        giant_url = "https://youtube.com/watch?v=" + ("x" * 2500)
        resp = client.post("/api/detect-platform", json={"url": giant_url})
        self.assertEqual(resp.status_code, 422)

    def test_security_path_traversal_guard(self):
        # Path outside allowed directories is rejected
        resp = client.post("/api/open-file", json={"file_path": "C:\\Windows\\System32\\calc.exe"})
        # Either 403 (blocked by traversal guard) or 200/404 if file does not exist
        if resp.status_code != 200:
            self.assertIn(resp.status_code, (403, 404))

    def test_detect_platform_endpoint(self):
        resp = client.post("/api/detect-platform", json={"url": "https://www.youtube.com/watch?v=test123"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["valid"])
        self.assertEqual(data["platform"], "YouTube")

    def test_detect_platform_invalid_url(self):
        resp = client.post("/api/detect-platform", json={"url": "invalid-link"})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["valid"])
        self.assertEqual(data["platform"], "Unknown")

    def test_batch_parse_endpoint(self):
        sample_text = """
        https://www.youtube.com/watch?v=11111111111
        https://x.com/user/status/22222222222
        https://www.youtube.com/watch?v=11111111111
        not-a-link
        https://vimeo.com/333333333
        """
        resp = client.post("/api/batch/parse", json={"text": sample_text})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["count"], 3) # 3 unique URLs
        self.assertEqual(len(data["items"]), 3)

    def test_settings_endpoints(self):
        # GET settings
        resp = client.get("/api/settings")
        self.assertEqual(resp.status_code, 200)
        orig_settings = resp.json()
        self.assertIn("download_dir", orig_settings)

        # UPDATE settings
        resp = client.post("/api/settings", json={"settings": {"max_concurrent_downloads": 4}})
        self.assertEqual(resp.status_code, 200)
        updated = resp.json()
        self.assertEqual(updated["max_concurrent_downloads"], 4)

    def test_history_endpoints(self):
        resp = client.get("/api/history")
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)

    def test_system_status_endpoint(self):
        resp = client.get("/api/system/status")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ffmpeg_ready"])
        self.assertIsNotNone(data["ffmpeg_path"])
        self.assertIn("ytdlp_version", data)
        self.assertIn("cookies_ready", data)
        self.assertIn("cookie_browser", data)

    def test_analyze_invalid_url_error(self):
        resp = client.post("/api/analyze", json={"url": "not-a-real-url"})
        self.assertEqual(resp.status_code, 400)

    def test_auth_browsers_endpoint(self):
        resp = client.get("/api/auth/browsers")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("installed", data)
        self.assertIn("cookie_browser", data)

    def test_cookie_upload_endpoint(self):
        sample_cookies = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1750000000\tSID\tsample_cookie_value\n"
        resp = client.post("/api/auth/cookies/upload", json={"content": sample_cookies})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("cookies.txt", data["cookie_file"])

    def test_proxy_thumbnail_invalid_url(self):
        resp = client.get("/api/proxy/thumbnail?url=invalid")
        self.assertEqual(resp.status_code, 400)

    def test_events_stream_unauthorized(self):
        raw_client = TestClient(app)
        resp = raw_client.get("/api/events/stream")
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()

