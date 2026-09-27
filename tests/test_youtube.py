import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.video.downloader import parse_title_heuristics, sanitize_filename, DOWNLOAD_TASKS

class TestYouTubeFeature(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_heuristics(self):
        h1 = parse_title_heuristics("Chainsaw Man OP - KICK BACK")
        self.assertEqual(h1["anime_name"], "Chainsaw Man")
        self.assertEqual(h1["song_name"], "KICK BACK")

        h2 = parse_title_heuristics("YOASOBI - IDOL (Oshi no Ko Opening)")
        self.assertEqual(h2["anime_name"], "Oshi no Ko")

    def test_sanitize_filename(self):
        name = 'Video: "Anime" <Best> / [HD] | Test?*'
        cleaned = sanitize_filename(name)
        for char in ['"', '<', '>', '|', ':', '?', '*', '/', '\\']:
            self.assertNotIn(char, cleaned)

    def test_api_youtube_download_validation(self):
        # Empty url should fail with 400
        res = self.client.post("/api/youtube/download", json={"url": "   "})
        self.assertEqual(res.status_code, 400)

    def test_api_youtube_status_endpoint(self):
        fake_task_id = "test-task-123"
        DOWNLOAD_TASKS[fake_task_id] = {
            "id": fake_task_id,
            "status": "completed",
            "progress": 100.0,
            "message": "Ready",
            "file_path": "C:/reel/downloads/test.mp4"
        }
        res = self.client.get(f"/api/youtube/status/{fake_task_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["progress"], 100.0)

    def test_bot_bypass_and_error_handling(self):
        from app.video.downloader import format_yt_error, PLAYER_CLIENT_STRATEGIES, find_cookies_file
        # Verify default strategies include android client for bot bypass
        self.assertIn(['android', 'web'], PLAYER_CLIENT_STRATEGIES)
        
        # Verify bot error gets translated to actionable guidance
        bot_err = "ERROR: [youtube] WdXd6xznH1o: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies"
        formatted = format_yt_error(bot_err)
        self.assertIn("cookies.txt", formatted)
        self.assertIn("YouTube blocked this request", formatted)

        # find_cookies_file should run safely without throwing
        res = find_cookies_file()
        self.assertTrue(res is None or isinstance(res, str))

if __name__ == "__main__":
    unittest.main()
