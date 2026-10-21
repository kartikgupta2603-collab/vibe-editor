import sys
import unittest
import subprocess
import tempfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.video.downloader import parse_title_heuristics, sanitize_filename, validate_instagram_video_url, DOWNLOAD_TASKS

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

    def test_instagram_video_url_validation(self):
        self.assertEqual(
            validate_instagram_video_url("https://www.instagram.com/reel/Example123/"),
            "https://www.instagram.com/reel/Example123/",
        )
        with self.assertRaises(ValueError):
            validate_instagram_video_url("https://example.com/reel/not-instagram")
        res = self.client.post("/api/instagram/download", json={"url": "   "})
        self.assertEqual(res.status_code, 400)

    def test_api_youtube_status_endpoint(self):
        fake_task_id = "test-task-123"
        DOWNLOAD_TASKS[fake_task_id] = {
            "id": fake_task_id,
            "status": "completed",
            "progress": 100.0,
            "message": "Ready",
            "file_path": "C:/Vibe Editor/downloads/test.mp4"
        }
        res = self.client.get(f"/api/youtube/status/{fake_task_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["progress"], 100.0)

    def test_bot_bypass_and_error_handling(self):
        from app.video.downloader import (
            format_yt_error, PLAYER_CLIENT_STRATEGIES, find_cookies_file,
            YOUTUBE_STUDIO_FORMAT, BGUTIL_PROVIDER_URL,
            youtube_extractor_args, DOWNLOAD_CONCURRENCY, DOWNLOAD_RETRIES,
        )
        # Verify default strategies include android client for bot bypass
        self.assertIn(['android', 'web'], PLAYER_CLIENT_STRATEGIES)
        self.assertEqual(PLAYER_CLIENT_STRATEGIES[0], ['default'])
        
        # Verify bot error gets translated to actionable guidance
        bot_err = "ERROR: [youtube] WdXd6xznH1o: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies"
        formatted = format_yt_error(bot_err)
        self.assertIn("cookies.txt", formatted)
        self.assertIn("YouTube blocked this request", formatted)

        po_error = format_yt_error("mweb client https formats require a GVS PO Token which was not provided. Only images are available")
        self.assertIn("did not expose a downloadable video stream", po_error)
        self.assertIn("local playback-token provider", po_error)

        # find_cookies_file should run safely without throwing
        res = find_cookies_file()
        self.assertTrue(res is None or isinstance(res, str))

        # Studio downloads the highest source quality available without a cap.
        self.assertEqual(YOUTUBE_STUDIO_FORMAT, "bestvideo+bestaudio/best")
        self.assertEqual(DOWNLOAD_CONCURRENCY, 4)
        self.assertEqual(DOWNLOAD_RETRIES, 2)

        source = (BASE_DIR / "app" / "video" / "downloader.py").read_text(encoding="utf-8")
        self.assertIn("ydl_opts['remote_components'] = ['ejs:github']", source)
        self.assertIn('"--remote-components", "ejs:github"', source)
        self.assertIn("BGUTIL_PROVIDER_URL", source)
        self.assertEqual(
            youtube_extractor_args(["mweb"], True)["youtubepot-bgutilhttp"]["base_url"],
            [BGUTIL_PROVIDER_URL],
        )

    def test_download_selects_highest_available_resolution_without_a_cap(self):
        import yt_dlp
        from app.video.downloader import YOUTUBE_STUDIO_FORMAT

        for heights, expected in [([144, 360], 360), ([360, 480], 480),
                                  ([720, 1080, 1440], 1440),
                                  ([1080, 2160, 4320], 4320)]:
            with self.subTest(heights=heights):
                formats = [{
                    "format_id": str(height), "url": f"https://example.com/{height}.mp4",
                    "ext": "mp4", "height": height, "width": height * 16 // 9,
                    "vcodec": "avc1", "acodec": "none", "fps": 30,
                } for height in heights]
                formats.append({"format_id": "audio", "url": "https://example.com/audio.m4a",
                                "ext": "m4a", "vcodec": "none", "acodec": "aac"})
                with yt_dlp.YoutubeDL({"format": YOUTUBE_STUDIO_FORMAT,
                                       "format_sort": ["res"], "quiet": True}) as ydl:
                    result = ydl.process_ie_result({"id": "test", "title": "test",
                                                   "formats": formats}, download=False)
                self.assertEqual(result["height"], expected)

    def test_cached_low_resolution_video_is_accepted(self):
        from unittest.mock import patch
        from app.video.downloader import YouTubeDownloader, download_cache_stem

        info = {"title": "Low resolution", "video_id": "low", "duration": 10}
        url = "https://www.youtube.com/watch?v=low"
        with tempfile.TemporaryDirectory() as directory:
            cached = Path(directory) / f"{download_cache_stem(info, url)}_studio.mp4"
            cached.write_bytes(b"0" * 100001)
            with patch("app.video.downloader.get_downloads_dir", return_value=Path(directory)), \
                 patch.object(YouTubeDownloader, "get_video_info", return_value=info), \
                 patch("app.video.downloader.ensure_browser_compatible", return_value=str(cached)), \
                 patch("app.video.probe.probe_video") as probe:
                task_id = "test-low-resolution"
                DOWNLOAD_TASKS[task_id] = {}
                try:
                    result = YouTubeDownloader.download_video(url, task_id)
                    self.assertEqual(result["file_path"], str(cached))
                    self.assertEqual(DOWNLOAD_TASKS[task_id]["status"], "completed")
                    probe.assert_not_called()
                finally:
                    DOWNLOAD_TASKS.pop(task_id, None)

    def test_youtube_metadata_inspects_highest_quality_with_node_runtime(self):
        from unittest.mock import patch
        from app.video.downloader import YouTubeDownloader, YOUTUBE_STUDIO_FORMAT

        with patch("yt_dlp.YoutubeDL") as downloader, \
             patch("app.video.downloader.find_cookies_file", return_value=None):
            downloader.return_value.__enter__.return_value.extract_info.return_value = {
                "id": "4k-video", "title": "4K clip", "width": 3840, "height": 2160,
                "duration": 10,
            }
            result = YouTubeDownloader.get_video_info("https://youtu.be/4k-video")
            self.assertEqual((result["width"], result["height"]), (3840, 2160))
            options = downloader.call_args.args[0]
            self.assertEqual(options["format"], YOUTUBE_STUDIO_FORMAT)
            self.assertEqual(options["format_sort"], ["res"])
            self.assertEqual(options["js_runtimes"], {"node": {}})
            self.assertEqual(options["remote_components"], ["ejs:github"])
            self.assertEqual(options["extractor_args"]["youtube"]["player_client"], ["default"])

    def test_studio_cache_uses_the_selected_download_profile(self):
        from unittest.mock import patch
        from app.video.downloader import YouTubeDownloader, download_cache_stem

        url = "https://youtu.be/4k-video"
        info = {"title": "4K clip", "video_id": "4k-video", "duration": 10,
                "width": 3840, "height": 2160}
        task_id = "test-upgrade-4k-cache"
        with tempfile.TemporaryDirectory() as directory:
            stem = download_cache_stem(info, url)
            old_cached = Path(directory) / f"{stem}_studio.mp4"
            old_cached.write_bytes(b"old360p" * 15000)
            expected = Path(directory) / f"{stem}_studio_2160p.mp4"

            def save_download(options):
                Path(options["outtmpl"].replace("%(ext)s", "mp4")).write_bytes(b"new4k")
                return 0

            with patch("yt_dlp.YoutubeDL") as downloader, \
                 patch("app.video.downloader.get_downloads_dir", return_value=Path(directory)), \
                 patch.object(YouTubeDownloader, "get_video_info", return_value=info), \
                 patch("app.video.downloader.find_cookies_file", return_value=None), \
                 patch("app.video.downloader.ensure_po_token_provider", return_value=True), \
                 patch("app.video.downloader.ensure_browser_compatible", side_effect=lambda path, *args, **kwargs: path):
                downloader.side_effect = lambda options: self._fake_video_downloader(options, save_download)
                DOWNLOAD_TASKS[task_id] = {}
                try:
                    result = YouTubeDownloader.download_video(url, task_id)
                    self.assertEqual(Path(result["file_path"]), expected)
                    self.assertEqual(expected.read_bytes(), b"new4k")
                    self.assertEqual(old_cached.read_bytes(), b"old360p" * 15000)
                    self.assertEqual(DOWNLOAD_TASKS[task_id]["status"], "completed")
                    downloader.assert_called_once()
                    options = downloader.call_args.args[0]
                    self.assertEqual(options["js_runtimes"], {"node": {}})
                    self.assertEqual(options["extractor_args"]["youtube"]["player_client"], ["default"])
                    self.assertIn("postprocessor_hooks", options)
                finally:
                    DOWNLOAD_TASKS.pop(task_id, None)

    def test_postprocessing_failure_does_not_retry_every_youtube_client(self):
        from unittest.mock import patch
        from app.video.downloader import YouTubeDownloader

        url = "https://youtu.be/finalization-failure"
        task_id = "test-finalization-failure"
        info = {"title": "Finalization failure", "video_id": "failure", "duration": 10}

        def fail_during_finalization(options):
            options["postprocessor_hooks"][0]({"status": "started", "postprocessor": "Merger"})
            raise RuntimeError("ffmpeg merge failed")

        with tempfile.TemporaryDirectory() as directory, \
             patch("yt_dlp.YoutubeDL") as downloader, \
             patch("app.video.downloader.get_downloads_dir", return_value=Path(directory)), \
             patch.object(YouTubeDownloader, "get_video_info", return_value=info), \
             patch("app.video.downloader.find_cookies_file", return_value=None), \
             patch("app.video.downloader.ensure_po_token_provider", return_value=True):
            downloader.side_effect = lambda options: self._fake_video_downloader(options, fail_during_finalization)
            DOWNLOAD_TASKS[task_id] = {}
            try:
                with self.assertRaisesRegex(RuntimeError, "Video finalization failed"):
                    YouTubeDownloader.download_video(url, task_id)
                self.assertEqual(downloader.call_count, 1)
                self.assertEqual(DOWNLOAD_TASKS[task_id]["progress"], 94.0)
            finally:
                DOWNLOAD_TASKS.pop(task_id, None)

    def test_twitter_video_url_detection(self):
        from app.video.downloader import is_twitter_video_url

        for host in ["twitter.com", "x.com", "www.twitter.com", "mobile.twitter.com", "www.x.com"]:
            with self.subTest(host=host):
                self.assertTrue(is_twitter_video_url(f"https://{host}/creator/status/123456789?s=20"))
        for url in ["https://example.com/creator/status/123", "https://x.com.example.com/user/status/123",
                    "https://x.com/creator", "https://x.com/creator/status/not-a-number"]:
            with self.subTest(url=url):
                self.assertFalse(is_twitter_video_url(url))

    def test_twitter_metadata_uses_generic_extractor(self):
        from unittest.mock import patch
        from app.video.downloader import YouTubeDownloader

        url = "https://x.com/creator/status/123456789"
        with patch("yt_dlp.YoutubeDL") as downloader, \
             patch("app.video.downloader.find_cookies_file", return_value=None), \
             patch("app.video.downloader.ensure_po_token_provider") as provider:
            downloader.return_value.__enter__.return_value.extract_info.return_value = {
                "id": "123456789", "title": "Twitter clip", "extractor_key": "Twitter",
                "duration": 10, "height": 360, "uploader": "creator",
            }
            result = YouTubeDownloader.get_video_info(url)
            self.assertEqual(result["extractor"], "Twitter")
            self.assertEqual(result["video_id"], "123456789")
            self.assertNotIn("extractor_args", downloader.call_args.args[0])
            downloader.assert_called_once()
            provider.assert_not_called()

    def test_twitter_download_skips_youtube_clients_and_accepts_low_resolution(self):
        from unittest.mock import patch
        from app.video.downloader import YouTubeDownloader, YOUTUBE_STUDIO_FORMAT

        url = "https://twitter.com/creator/status/123456789"
        task_id = "test-twitter-download"
        info = {"video_id": "123456789", "title": "Twitter clip", "extractor": "Twitter",
                "duration": 10, "height": 360}
        with tempfile.TemporaryDirectory() as directory:
            def download_video(options):
                Path(options["outtmpl"].replace("%(ext)s", "mp4")).write_bytes(b"video")
                return 0

            with patch("yt_dlp.YoutubeDL") as downloader, \
                 patch("app.video.downloader.get_downloads_dir", return_value=Path(directory)), \
                 patch.object(YouTubeDownloader, "get_video_info", return_value=info), \
                 patch("app.video.downloader.find_cookies_file", return_value=None), \
                 patch("app.video.downloader.ensure_po_token_provider") as provider, \
                 patch("app.video.downloader.ensure_browser_compatible", side_effect=lambda path, *args, **kwargs: path):
                downloader.side_effect = lambda options: self._fake_video_downloader(options, download_video)
                DOWNLOAD_TASKS[task_id] = {}
                try:
                    result = YouTubeDownloader.download_video(url, task_id)
                    self.assertTrue(Path(result["file_path"]).exists())
                    self.assertEqual(DOWNLOAD_TASKS[task_id]["status"], "completed")
                    downloader.assert_called_once()
                    options = downloader.call_args.args[0]
                    self.assertEqual(options["format"], YOUTUBE_STUDIO_FORMAT)
                    self.assertEqual(options["format_sort"], ["res"])
                    self.assertNotIn("extractor_args", options)
                    self.assertNotIn("remote_components", options)
                    provider.assert_not_called()
                finally:
                    DOWNLOAD_TASKS.pop(task_id, None)

    @staticmethod
    def _fake_video_downloader(options, download_video):
        from unittest.mock import MagicMock
        context = MagicMock()
        context.__enter__.return_value.download.side_effect = lambda urls: download_video(options)
        return context

    def test_browser_compatibility_never_upscales_a_low_resolution_source(self):
        from app.video.downloader import ensure_browser_compatible
        from app.video.probe import probe_video
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "low_source.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=blue:s=640x360:r=24:d=0.2",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
            ], check=True, capture_output=True, timeout=30)
            compat = ensure_browser_compatible(str(source), force=True)
            info = probe_video(compat)
            self.assertEqual((info.width, info.height), (640, 360))
            single_file = ensure_browser_compatible(str(source), force=True, replace_source=True)
            self.assertEqual(Path(single_file), source)
            self.assertFalse((Path(temp_dir) / "low_source_h264.mp4").exists())

if __name__ == "__main__":
    unittest.main()
