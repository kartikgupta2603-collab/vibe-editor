"""Dependency-free regressions: execute production functions with isolated I/O."""
import ast
import asyncio
import base64
import hashlib
import json
import math
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

import app.ai.gemini_client as actual_ai
import app.ai.gemini_transport as transport
import app.ai.reel_copy as reel_copy
import app.ai.song_analysis as song_analysis
import app.ai.subtitles as subtitles

ROOT = Path(__file__).resolve().parents[1]


def load_definitions(relative_path, names):
    tree = ast.parse((ROOT / relative_path).read_text(encoding="utf-8"))
    selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name in names]
    namespace = dict(vars(typing))
    namespace.update(globals())
    namespace["__file__"] = str(ROOT / relative_path)
    namespace.update(
        get_settings=lambda: SimpleNamespace(gemini_api_key="test-key"),
        GEMINI_MODELS=["test-model"],
        FULL_SUBTITLE_MODELS=["test-model"],
        TRANSIENT_GEMINI_STATUS_CODES={408, 429, 500, 502, 503, 504},
        GEMINI_MAX_RETRIES=4,
    )
    exec(compile(ast.Module(body=selected, type_ignores=[]), relative_path, "exec"), namespace)
    return namespace


class MediaAIRegressions(unittest.TestCase):
    def setUp(self):
        network_guard = patch("httpx.AsyncClient", side_effect=AssertionError("Unexpected real Gemini request"))
        network_guard.start()
        self.addCleanup(network_guard.stop)
        self.ai = load_definitions("app/ai/gemini_client.py", {
            "parse_gemini_json", "refine_moment_boundaries", "extract_timed_audio_samples", "post_gemini_with_retry", "GeminiClient",
        })

    def test_gemini_503_retries_before_the_next_model_is_tried(self):
        client = SimpleNamespace(post=AsyncMock(side_effect=[
            SimpleNamespace(status_code=503),
            SimpleNamespace(status_code=200),
        ]))
        with patch.object(asyncio, "sleep", new=AsyncMock()) as sleep:
            response = asyncio.run(self.ai["post_gemini_with_retry"](client, "https://example.test", {}, "test-model"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.post.await_count, 2)
        sleep.assert_awaited_once_with(1.0)

    def test_gemini_503_uses_all_four_backoff_retries_before_failing(self):
        client = SimpleNamespace(post=AsyncMock(side_effect=[
            SimpleNamespace(status_code=503),
            SimpleNamespace(status_code=503),
            SimpleNamespace(status_code=503),
            SimpleNamespace(status_code=503),
            SimpleNamespace(status_code=200),
        ]))
        with patch.object(asyncio, "sleep", new=AsyncMock()) as sleep:
            response = asyncio.run(self.ai["post_gemini_with_retry"](client, "https://example.test", {}, "test-model"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.post.await_count, 5)
        self.assertEqual([call.args[0] for call in sleep.await_args_list], [1.0, 2.0, 4.0, 8.0])

    def test_gemini_429_stops_without_spending_extra_quota_retries(self):
        client = SimpleNamespace(post=AsyncMock(return_value=SimpleNamespace(status_code=429)))
        with patch.object(asyncio, "sleep", new=AsyncMock()) as sleep:
            response = asyncio.run(self.ai["post_gemini_with_retry"](client, "https://example.test", {}, "test-model"))
        self.assertEqual(response.status_code, 429)
        self.assertEqual(client.post.await_count, 1)
        sleep.assert_not_awaited()

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
        with patch.object(song_analysis, "probe_video", return_value=SimpleNamespace(duration=20, has_audio=False)), \
                patch.object(song_analysis, "generate_json", new=AsyncMock()) as request:
            with self.assertRaisesRegex(ValueError, "readable audio"):
                asyncio.run(actual_ai.GeminiClient().analyze_song(video_path="silent.mp4", api_key_override="test"))
            request.assert_not_awaited()

    def test_keyless_fallback_is_explicitly_unanalyzed(self):
        with patch("app.config.settings.get_settings", return_value=SimpleNamespace(gemini_api_key="")), \
                patch.object(song_analysis, "generate_json", new=AsyncMock()) as request:
            with self.assertRaisesRegex(transport.GeminiError, "API key"):
                asyncio.run(actual_ai.GeminiClient().analyze_song(duration=90))
            request.assert_not_awaited()
        # Legacy callers still receive an explicitly unavailable result if they
        # ask for the compatibility helper; it never invents a timestamp.
        result = actual_ai.GeminiClient()._fallback_response("", "", "", 90)
        self.assertEqual(result["status"], "unavailable")
        self.assertIsNone(result["recommended_start"])

    def test_moment_analysis_never_starts_a_hidden_full_subtitle_request(self):
        data = {"moments": [{"start": 1, "end": 7, "payoff_time": 4, "clip_type": "Build to release",
                            "reason": "The held note resolves.", "start_anchor": "A drum pickup",
                            "payoff_anchor": "The full arrangement enters", "end_anchor": "The vocal releases"}]}
        with patch.object(song_analysis, "probe_video", return_value=SimpleNamespace(duration=10, has_audio=True)), \
                patch.object(actual_ai, "extract_timed_audio_samples", new=AsyncMock(return_value=[
                    {"inlineData": {"mimeType": "audio/mpeg", "data": "evidence"}}])) as extraction, \
                patch.object(song_analysis, "generate_json", new=AsyncMock(return_value=(data, "mock-model"))) as request, \
                patch.object(subtitles, "generate_subtitles", new=AsyncMock()) as hidden_subtitles:
            result = asyncio.run(actual_ai.GeminiClient().analyze_song(video_path="source.mp4", api_key_override="test"))
        extraction.assert_awaited_once_with("source.mp4", 10, full_coverage=True)
        request.assert_awaited_once()
        hidden_subtitles.assert_not_awaited()
        self.assertEqual(result["recommended_start"], 1)
        self.assertNotIn("lyrics", result)
        self.assertNotIn("subtitle_style", result)

    def test_gemini_fallback_models_are_pinned_versions(self):
        self.assertTrue(transport.GEMINI_MODELS)
        self.assertTrue(all(re.fullmatch(r"gemini-\d+\.\d+-(?:flash|pro)", model) for model in transport.GEMINI_MODELS))
        self.assertEqual(actual_ai.GEMINI_MODELS, transport.GEMINI_MODELS)

    def test_full_subtitles_fail_over_quickly_when_a_busy_model_returns_503(self):
        busy = SimpleNamespace(status_code=503, json=lambda: {"error": {"message": "Busy"}})
        success = SimpleNamespace(status_code=200, json=lambda: {"candidates": [{"content": {"parts": [
            {"text": '{"segments": []}'}]}}]})
        client = SimpleNamespace(post=AsyncMock(side_effect=[busy, success]))
        class Context:
            async def __aenter__(self): return client
            async def __aexit__(self, *args): return False
        with patch.object(transport.httpx, "AsyncClient", return_value=Context()), \
                patch.object(asyncio, "sleep", new=AsyncMock()) as sleep:
            result, model = asyncio.run(transport.generate_json([{"text": "Transcribe"}], "test", {}, models=["first", "second"]))
        self.assertEqual(result, {"segments": []})
        self.assertEqual(model, "second")
        self.assertIn("/first:", client.post.await_args_list[0].args[0])
        self.assertIn("/second:", client.post.await_args_list[1].args[0])
        sleep.assert_not_awaited()

    def test_full_subtitle_fallback_order_starts_with_the_reliable_audio_model(self):
        # Both paths now use the same proven transport, instead of independent
        # model lists that drift or repeatedly hit an unavailable model.
        self.assertIs(subtitles.generate_json, transport.generate_json)
        self.assertIs(song_analysis.generate_json, transport.generate_json)

    def test_viral_hooks_use_saved_key_and_request_json(self):
        lines = ["That smile arrives before the room changes",
                 "Everyone rushes while she takes her time",
                 "The empty chair makes this celebration complicated",
                 "His hands hesitate before opening the door",
                 "One quiet glance interrupts all that confidence",
                 "Why does the crowd stop celebrating here"]
        hooks = [{"hook": line, "category": "curiosity", "evidence_indices": [0]} for line in lines]
        observations = [{"timestamp": 1.0, "visual": "A smile, crowd, empty chair and hesitant hands.",
                         "audio": "The music pauses."}]
        class Response:
            status_code = 200
            def json(self):
                return {"candidates": [{"content": {"parts": [{"text": json.dumps({
                    "reel_summary": "A smile contrasts with a musical change", "observations": observations, "hooks": hooks
                })}]}}]}

        class Client:
            def __init__(self): self.requests = []
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return False
            async def post(self, url, json):
                self.requests.append((url, json))
                return Response()

        fake_client = Client()
        evidence_part = {"inlineData": {"mimeType": "video/mp4", "data": "evidence"}, "videoMetadata": {"fps": 3}}
        with patch.object(actual_ai, "extract_hook_video", new=AsyncMock(return_value={
                "part": evidence_part, "has_audio": True, "duration": 20})) as extraction, \
                patch.object(reel_copy, "get_settings", return_value=SimpleNamespace(gemini_api_key="saved-key")), \
                patch.object(transport.httpx, "AsyncClient", return_value=fake_client) as factory:
            result = asyncio.run(actual_ai.GeminiClient().generate_viral_hooks(
                song_name="Song", anime_name="Anime", video_path="selected.mp4", start_time=12, end_time=32,
            ))
        extraction.assert_awaited_once_with("selected.mp4", 12, 32)
        self.assertEqual(factory.call_args.kwargs["headers"], {"x-goog-api-key": "saved-key"})
        self.assertEqual(len(fake_client.requests), 1)
        for url, payload in fake_client.requests:
            self.assertNotIn("saved-key", url)
            self.assertEqual(payload["generationConfig"]["responseMimeType"], "application/json")
            self.assertIn("responseSchema", payload["generationConfig"])
        self.assertEqual(len(result), 6)
        parts = fake_client.requests[0][1]["contents"][0]["parts"]
        self.assertEqual(parts[0], evidence_part)
        self.assertIn("text", parts[1])
        self.assertIn(observations[0]["visual"], result[0]["evidence"])

    def test_instagram_caption_uses_json_and_keeps_fact_safety_rules(self):
        class Response:
            status_code = 200
            def json(self):
                return {"candidates": [{"content": {"parts": [{"text": json.dumps({
                    "caption": "A quiet moment in Mashle.\n\n#Mashle #Anime"
                })}]}}]}

        class Client:
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return False
            async def post(self, url, json):
                self.payload = json
                return Response()

        fake_client = Client()
        with patch.object(reel_copy, "get_settings", return_value=SimpleNamespace(gemini_api_key="saved-key")), \
                patch.object(transport.httpx, "AsyncClient", return_value=fake_client):
            result = asyncio.run(actual_ai.GeminiClient().generate_instagram_caption(anime_name="Mashle"))
        self.assertEqual(result["source"], "gemini")
        self.assertEqual(fake_client.payload["generationConfig"]["responseMimeType"], "application/json")
        prompt = fake_client.payload["contents"][0]["parts"][0]["text"]
        self.assertIn("Never add Japanese titles", prompt)
        self.assertIn("Only the supplied context is available", prompt)
        self.assertIn("Honor shorter requests", prompt)

    def test_subtitle_methods_without_source_never_contact_model(self):
        client = actual_ai.GeminiClient()
        with patch.object(subtitles, "generate_json", new=AsyncMock()) as request:
            with self.assertRaisesRegex((ValueError, RuntimeError), "(?i)(source|file|audio)"):
                asyncio.run(client.generate_full_video_subtitles(video_path="", api_key_override="test"))
            with self.assertRaisesRegex((ValueError, RuntimeError), "(?i)(source|file|audio)"):
                asyncio.run(client.generate_lyrics("Song", "Anime", 0, 30, video_path="", api_key_override="test"))
            request.assert_not_awaited()

    def test_subtitle_prompts_require_contextual_meaning_adaptations(self):
        prompt = subtitles._prompt(15)
        self.assertIn("accurate natural English meaning", prompt)
        self.assertIn("If already English, keep text_en identical", prompt)
        self.assertIn("never guess", prompt)
        self.assertIn("do not\ninvent lyrics from a title", prompt)
        self.assertIn("Classify every interval", prompt)

    def test_full_subtitle_failures_are_reported_instead_of_being_returned_as_empty_cues(self):
        with patch.object(subtitles, "_probe_audio", return_value=(5, None)), \
                patch.object(subtitles, "_extract_audio", return_value=("audio", 5)), \
                patch.object(subtitles, "generate_json", new=AsyncMock(side_effect=transport.GeminiError("Quota reached", 429))) as request:
            with self.assertRaisesRegex(transport.GeminiError, "Quota reached") as failure:
                asyncio.run(actual_ai.GeminiClient().generate_full_video_subtitles("source.mp4", api_key_override="test"))
        self.assertEqual(failure.exception.status_code, 429)
        request.assert_awaited_once()  # no expensive full-track retry after quota failure

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
