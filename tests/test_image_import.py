import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from PIL import Image

from app.video import image_import as importer


class StudioImageImportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.downloads = self.root / "downloads"
        self.images = self.downloads / "images"
        self.images.mkdir(parents=True)
        self.source = self.images / "sample.png"
        Image.new("RGB", (37, 23), (20, 90, 170)).save(self.source)
        for name, value in (("get_downloads_dir", lambda: self.downloads),
                            ("TEMP_DIR", self.root / "temp")):
            stub = patch.object(importer, name, value)
            stub.start()
            self.addCleanup(stub.stop)

    def encode_stub(self, command, **kwargs):
        self.command = command
        self.options = kwargs
        self.normalized = Image.open(command[command.index("-i") + 1]).copy()
        Path(command[-1]).write_bytes(b"prepared mp4")
        return Mock(returncode=0, stderr="")

    def test_preserves_original_and_prepares_silent_high_quality_clip(self):
        original = self.source.read_bytes()
        progress = Mock()
        with patch.object(importer.subprocess, "run", side_effect=self.encode_stub):
            result = importer.import_studio_image(str(self.source), 12.5, progress)
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(result["duration"], 12.5)
        self.assertEqual(result["title"], "sample")
        metadata = json.loads(Path(result["file_path"]).with_suffix(".image.json").read_text(encoding="utf-8"))
        self.assertEqual(metadata["source_image_path"], str(self.source.resolve()))
        self.assertEqual(metadata["duration"], 12.5)
        self.assertTrue(Path(result["file_path"]).is_relative_to(self.images / "studio"))
        self.assertEqual(self.normalized.size, (37, 23))
        self.assertIn("-an", self.command)
        self.assertIn("yuv420p", self.command)
        self.assertIn("+faststart", self.command)
        self.assertEqual(self.command[self.command.index("-preset") + 1], "fast")
        self.assertEqual(self.options["timeout"], 600)
        self.assertEqual(list((self.root / "temp").iterdir()), [])
        self.assertEqual(progress.call_args.args[0], 100)

    def test_exif_orientation_is_applied_without_changing_original(self):
        source = self.images / "rotated.jpg"
        exif = Image.Exif()
        exif[274] = 6
        Image.new("RGB", (40, 20), "red").save(source, exif=exif)
        original = source.read_bytes()
        with patch.object(importer.subprocess, "run", side_effect=self.encode_stub):
            importer.import_studio_image(str(source))
        self.assertEqual(self.normalized.size, (20, 40))
        self.assertEqual(source.read_bytes(), original)

    def test_animation_imports_first_frame(self):
        source = self.images / "animation.gif"
        Image.new("RGB", (10, 10), "red").save(
            source, save_all=True, append_images=[Image.new("RGB", (10, 10), "blue")], duration=100, loop=0)
        with patch.object(importer.subprocess, "run", side_effect=self.encode_stub):
            importer.import_studio_image(str(source))
        self.assertEqual(self.normalized.getpixel((5, 5)), (255, 0, 0))

    def test_rejects_unsafe_paths_and_unreadable_files_before_encoder(self):
        outside = self.downloads / "outside.png"
        Image.new("RGB", (2, 2)).save(outside)
        bad = self.images / "not-an-image.jpg"
        bad.write_text("not an image")
        with patch.object(importer.subprocess, "run") as run:
            for source in (outside, self.images / "missing.png", self.images, bad):
                with self.subTest(source=source), self.assertRaises(ValueError):
                    importer.import_studio_image(str(source))
            run.assert_not_called()

    def test_rejects_invalid_duration(self):
        with patch.object(importer.subprocess, "run") as run:
            for duration in (0, -1, 301, float("nan"), float("inf"), "bad", None, True):
                with self.subTest(duration=duration), self.assertRaises(ValueError):
                    importer.import_studio_image(str(self.source), duration)
            run.assert_not_called()

    def test_encoder_failure_removes_partial_derivative_and_temp_only(self):
        original = self.source.read_bytes()

        def fail(command, **kwargs):
            Path(command[-1]).write_bytes(b"partial")
            return Mock(returncode=1, stderr="encoder failed")

        with patch.object(importer.subprocess, "run", side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, "Could not prepare"):
                importer.import_studio_image(str(self.source))
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(list((self.images / "studio").iterdir()), [])
        self.assertEqual(list((self.root / "temp").iterdir()), [])

    def test_timeout_is_actionable_and_cleans_up(self):
        with patch.object(importer.subprocess, "run", side_effect=subprocess.TimeoutExpired("ffmpeg", 600)):
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                importer.import_studio_image(str(self.source))
        self.assertEqual(list((self.root / "temp").iterdir()), [])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg and FFprobe are required")
    def test_real_encoder_preserves_odd_resolution_by_padding_and_has_no_audio(self):
        result = importer.import_studio_image(str(self.source), 1)
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json",
                                result["file_path"]], capture_output=True, text=True, check=True, timeout=30)
        info = json.loads(probe.stdout)
        self.assertEqual(len(info["streams"]), 1)
        video = info["streams"][0]
        self.assertEqual((video["width"], video["height"]), (38, 24))
        self.assertEqual(video["codec_name"], "h264")
        self.assertEqual(video["pix_fmt"], "yuv420p")
        self.assertEqual(video["r_frame_rate"], "30/1")
        self.assertAlmostEqual(float(info["format"]["duration"]), 1, places=1)


if __name__ == "__main__":
    unittest.main()
