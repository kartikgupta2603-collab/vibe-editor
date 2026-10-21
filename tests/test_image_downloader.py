import io
import json
import subprocess
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch

from PIL import Image

from app.video import image_downloader as images


def png_bytes():
    output = io.BytesIO()
    Image.new("RGB", (37, 23), (20, 90, 170)).save(output, format="PNG")
    return output.getvalue()


class Response(io.BytesIO):
    def __init__(self, data, content_type="image/png", length=None):
        super().__init__(data)
        self.headers = {"Content-Type": content_type}
        if length is not None:
            self.headers["Content-Length"] = str(length)

    def geturl(self):
        return "https://images.example/original.png"


class ImageDownloaderTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.downloads = patch.object(images, "get_downloads_dir", return_value=self.root)
        self.downloads.start()
        self.addCleanup(self.downloads.stop)
        self.cookies = patch.object(images, "find_cookies_file", return_value=None)
        self.cookies.start()
        self.addCleanup(self.cookies.stop)

    def gallery(self, records, returncode=0):
        return patch.object(images.subprocess, "run", return_value=Mock(
            returncode=returncode, stdout=json.dumps(records), stderr=""))

    def test_rejects_invalid_schemes_credentials_and_profiles(self):
        for url in ("file:///C:/a.jpg", "ftp://example/a.png", "https://a:b@example/a.jpg",
                    "https://x.com/artist", "https://instagram.com/artist/", "https://example.com/a?b=x\ny"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                images.validate_image_url(url)

    def test_valid_single_posts_and_direct_images(self):
        for url in ("https://x.com/a/status/12/photo/2", "https://x.com/i/web/status/12",
                    "https://instagram.com/p/ABC_12/?img_index=1", "https://example.com/asset?id=2"):
            self.assertEqual(images.validate_image_url(url), url)

    def test_direct_download_preserves_exact_bytes_and_actual_format(self):
        payload = png_bytes()
        opener = Mock()
        opener.open.return_value = Response(payload)
        progress = Mock()
        with patch.object(images, "_opener", return_value=opener):
            files = images.download_post_images("https://example.com/wrong.jpg", progress)
        self.assertEqual(len(files), 1)
        file = files[0]
        self.assertEqual(Path(file["file_path"]).read_bytes(), payload)
        self.assertEqual((file["width"], file["height"]), (37, 23))
        self.assertTrue(file["filename"].endswith(".png"))
        self.assertEqual(progress.call_args.args[0], 100)

    def test_gallery_disables_video_previews_and_isolates_config(self):
        records = [[3, "https://cdn.example/photo.jpg", {"extension": "jpg", "type": "photo"}]]
        with self.gallery(records) as run:
            result = images._post_photo_urls("https://x.com/a/status/12")
        command = run.call_args.args[0]
        self.assertIn("--config-ignore", command)
        self.assertIn("extractor.twitter.previews=false", command)
        self.assertIn("extractor.instagram.videos=false", command)
        self.assertEqual(len(result), 1)

    def test_only_real_photo_records_not_thumbnails_videos_or_queue(self):
        records = [[2, {"extension": "jpg"}],
                   [6, "https://cdn.example/child.jpg", {"extension": "jpg"}],
                   [3, "https://cdn.example/video.mp4", {"extension": "mp4"}],
                   [3, "https://cdn.example/preview.jpg", {"extension": "jpg", "type": "preview"}],
                   [3, "https://cdn.example/video-poster.jpg", {"extension": "jpg", "video_url": "https://cdn/video.mp4"}],
                   [3, "https://cdn.example/photo.jpg", {"extension": "jpg", "type": "photo"}],
                   [3, "https://cdn.example/photo.jpg", {"extension": "jpg", "type": "photo"}]]
        with self.gallery(records):
            photos = images._post_photo_urls("https://x.com/a/status/12")
        self.assertEqual([p["url"] for p in photos], ["https://cdn.example/photo.jpg"])

    def test_error_record_is_failure_even_when_cli_returns_zero(self):
        with self.gallery([[-1, {"error": "AuthorizationError", "message": "Login required"}]]):
            with self.assertRaisesRegex(ValueError, "sign-in"):
                images._post_photo_urls("https://instagram.com/p/abc/")

    def test_no_photo_is_actionable(self):
        with self.gallery([]), self.assertRaisesRegex(ValueError, "No photos"):
            images._post_photo_urls("https://x.com/a/status/12")

    def test_extractor_timeout_is_actionable(self):
        with patch.object(images.subprocess, "run", side_effect=subprocess.TimeoutExpired("gallery-dl", 90)):
            with self.assertRaisesRegex(ValueError, "timed out"):
                images._post_photo_urls("https://x.com/a/status/12")

    def test_more_than_twenty_photos_fails_without_downloading(self):
        records = [[3, f"https://cdn.example/{index}.jpg", {"extension": "jpg"}] for index in range(21)]
        with self.gallery(records), self.assertRaisesRegex(ValueError, "more than 20"):
            images.download_post_images("https://x.com/a/status/12")
        self.assertFalse((self.root / "images").exists())

    def test_failed_download_removes_own_files_but_preserves_other_jobs(self):
        previous = self.root / "images" / "previous" / "image.png"
        previous.parent.mkdir(parents=True)
        previous.write_bytes(b"previous")
        opener = Mock()
        opener.open.side_effect = [Response(png_bytes()), Response(b"bad image")]
        photos = [{"url": "https://cdn.example/a.png"}, {"url": "https://cdn.example/b.png"}]
        with patch.object(images, "_post_photo_urls", return_value=photos), patch.object(images, "_opener", return_value=opener):
            with self.assertRaisesRegex(ValueError, "not a valid"):
                images.download_post_images("https://x.com/a/status/12")
        self.assertEqual(previous.read_bytes(), b"previous")
        self.assertEqual(list((self.root / "images").iterdir()), [previous.parent])

    def test_rejects_html_not_post_as_direct_image(self):
        opener = Mock()
        opener.open.return_value = Response(b"<html>not a photo</html>", "text/html")
        with patch.object(images, "_opener", return_value=opener), self.assertRaisesRegex(ValueError, "does not return an image"):
            images.download_post_images("https://example.com/post")
        self.assertEqual(list((self.root / "images").iterdir()), [])

    def test_rejects_oversized_content_length_before_reading(self):
        opener = Mock()
        opener.open.return_value = Response(png_bytes(), length=images.MAX_IMAGE_BYTES + 1)
        with patch.object(images, "_opener", return_value=opener), self.assertRaisesRegex(ValueError, "30 MB"):
            images.download_post_images("https://example.com/a.png")

    def test_streaming_limit_enforced_without_content_length(self):
        opener = Mock()
        opener.open.return_value = Response(png_bytes())
        with patch.object(images, "_opener", return_value=opener), patch.object(images, "MAX_IMAGE_BYTES", 10):
            with self.assertRaisesRegex(ValueError, "30 MB"):
                images.download_post_images("https://example.com/a.png")

    def test_multiple_photos_have_separate_files(self):
        opener = Mock()
        opener.open.side_effect = [Response(png_bytes()), Response(png_bytes())]
        photos = [{"url": "https://cdn.example/a.jpg"}, {"url": "https://cdn.example/a.jpg"}]
        with patch.object(images, "_post_photo_urls", return_value=photos), patch.object(images, "_opener", return_value=opener):
            files = images.download_post_images("https://x.com/a/status/12")
        self.assertNotEqual(files[0]["file_path"], files[1]["file_path"])
        self.assertTrue(all(Path(file["file_path"]).exists() for file in files))

    def test_blocked_provider_download_has_actionable_error(self):
        opener = Mock()
        opener.open.side_effect = urllib.error.HTTPError("https://example.com/a.png", 403, "Forbidden", {}, None)
        with patch.object(images, "_opener", return_value=opener), self.assertRaisesRegex(ValueError, "requires sign-in"):
            images.download_post_images("https://example.com/a.png")
        self.assertEqual(list((self.root / "images").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
