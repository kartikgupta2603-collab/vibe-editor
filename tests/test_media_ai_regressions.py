"""Dependency-free regressions: execute production functions with isolated I/O."""
import ast
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from types import SimpleNamespace
import typing
import unittest
from unittest.mock import AsyncMock, patch


ROOT = Path(__file__).resolve().parents[1]


def load_definitions(relative_path, names):
    tree = ast.parse((ROOT / relative_path).read_text(encoding="utf-8"))
    selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name in names]
    namespace = dict(vars(typing))
    namespace.update(globals())
    namespace["__file__"] = str(ROOT / relative_path)
    namespace.update(get_settings=lambda: SimpleNamespace(gemini_api_key="test-key"), GEMINI_MODELS=["test-model"])
    exec(compile(ast.Module(body=selected, type_ignores=[]), relative_path, "exec"), namespace)
    return namespace


class MediaAIRegressions(unittest.TestCase):
    def setUp(self):
        self.ai = load_definitions("app/ai/gemini_client.py", {
            "refine_moment_boundaries", "extract_timed_audio_samples", "GeminiClient",
        })

    def test_boundary_extension_stops_after_next_phrase(self):
        lyrics = [{"start": s, "end": s + 3.5} for s in range(0, 120, 4)]
        self.assertEqual(self.ai["refine_moment_boundaries"](0, 10, 120, lyrics), (0.0, 15.9))

    def test_boundary_does_not_chain_across_adjacent_lyrics(self):
        lyrics = [{"start": s, "end": s + 2} for s in range(0, 10, 2)]
        self.assertEqual(self.ai["refine_moment_boundaries"](0, 1, 120, lyrics), (0.0, 2.4))

    def test_short_clip_never_extends_past_source(self):
        self.assertEqual(self.ai["refine_moment_boundaries"](0, 1, 1), (0.0, 1.0))

    def test_same_title_different_video_ids_have_distinct_cache_paths(self):
        ns = load_definitions("app/video/downloader.py", {"sanitize_filename", "download_cache_stem"})
        stem = ns["download_cache_stem"]
        first = {"title": "Same title", "video_id": "aaa"}
        second = {"title": "Same title", "video_id": "bbb"}
        self.assertNotEqual(stem(first, "url1"), stem(second, "url2"))
        self.assertEqual(stem(first, "url1"), stem(first, "alternate-url1"))
        self.assertNotEqual(stem({"title": "Same"}, "url1"), stem({"title": "Same"}, "url2"))

    def test_full_transcription_covers_every_second(self):
        intervals = []
        def fake_run(command, **kwargs):
            start = float(command[command.index("-ss") + 1])
            duration = float(command[command.index("-t") + 1])
            intervals.append((start, start + duration))
            Path(command[-1]).write_bytes(b"audio" * 50)
            return SimpleNamespace(returncode=0)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.mp4"
            source.touch()
            with patch.object(subprocess, "run", side_effect=fake_run):
                result = asyncio.run(self.ai["extract_timed_audio_samples"](str(source), 900, full_coverage=True))
        self.assertEqual(len(result), 20)
        self.assertEqual(intervals, [(float(s), float(s + 90)) for s in range(0, 900, 90)])

    def test_failed_passage_rejects_partial_full_transcription(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.mp4"
            source.touch()
            with patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=1)):
                with self.assertRaisesRegex(RuntimeError, "every audio passage"):
                    asyncio.run(self.ai["extract_timed_audio_samples"](str(source), 900, full_coverage=True))

    def test_analysis_without_audio_never_contacts_model(self):
        self.ai["extract_timed_audio_samples"] = AsyncMock(return_value=[])
        self.ai["httpx"] = SimpleNamespace(AsyncClient=lambda **kwargs: self.fail("Model called without evidence"))
        client = self.ai["GeminiClient"]()
        with self.assertRaisesRegex(RuntimeError, "readable source audio"):
            asyncio.run(client.analyze_song(video_path="missing.mp4", api_key_override="test"))

    def test_keyless_fallback_is_explicitly_unanalyzed(self):
        self.ai["get_settings"] = lambda: SimpleNamespace(gemini_api_key="")
        result = asyncio.run(self.ai["GeminiClient"]().analyze_song(duration=90))
        self.assertEqual(result["status"], "fallback")
        self.assertIsNone(result["score"])
        self.assertIn("no audio analysis", result["reason"].lower())

    def test_subtitle_methods_without_source_never_contact_model(self):
        self.ai["httpx"] = SimpleNamespace(AsyncClient=lambda **kwargs: self.fail("Model called without evidence"))
        client = self.ai["GeminiClient"]()
        with self.assertRaisesRegex(RuntimeError, "readable source audio"):
            asyncio.run(client.generate_full_video_subtitles(video_path="", api_key_override="test"))
        with self.assertRaisesRegex(RuntimeError, "readable source audio"):
            asyncio.run(client.generate_lyrics("Song", "Anime", 0, 30, video_path="", api_key_override="test"))

    def test_square_source_retains_shape_in_preview_filters(self):
        ns = load_definitions("app/video/preview.py", {"render_preview_still"})
        ns["probe_video"] = lambda source: SimpleNamespace(width=100, height=100)
        ns["renderer"] = SimpleNamespace(create_text_overlay_image=lambda **kwargs: None)
        with tempfile.TemporaryDirectory() as directory:
            for aspect, size in [("16:9", 960), ("1:1", 514)]:
                with self.subTest(aspect=aspect), patch.object(subprocess, "run") as run:
                    ns["render_preview_still"](
                        str(Path(directory) / "source.mp4"), 0, "", "", "", "",
                        {"background": {"type": "black"}, "video": {"scale": 0.5, "curved_border": False}},
                        str(Path(directory) / "preview.jpg"), aspect_ratio=aspect,
                    )
                    command = run.call_args.args[0]
                    graph = command[command.index("-filter_complex") + 1]
                    self.assertIn(f"[0:v]scale={size}:{size}[fg]", graph)


if __name__ == "__main__":
    unittest.main()
