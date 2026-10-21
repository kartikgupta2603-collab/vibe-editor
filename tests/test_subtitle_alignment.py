import asyncio
import json
import math
import shutil
import subprocess
import tempfile
import unittest
import wave
import base64
import io
from pathlib import Path
from unittest.mock import patch

import httpx

from app.ai import subtitle_alignment as alignment


def segment(start, end, text="line", kind="vocal"):
    return {"start": start, "end": end, "kind": kind, "text_jp": text, "text_en": text, "text_romaji": ""}


def response(segments, finish="STOP", status=200):
    return httpx.Response(status, json={"candidates": [{"finishReason": finish, "content": {
        "parts": [{"text": json.dumps({"segments": segments})}]}}]})


class ReviewValidationTests(unittest.TestCase):
    def test_missing_tail_or_gap_rejected(self):
        for segments in ([segment(0, 3)], [segment(0, 3), segment(4, 8)], [segment(1, 8)]):
            with self.subTest(segments=segments), self.assertRaises(alignment.SubtitleAlignmentError):
                alignment._validate_segments({"segments": segments}, 8)

    def test_invalid_timestamps_rejected(self):
        for start, end in [(math.nan, 8), (0, math.inf), (-1, 8), (0, 9), (True, 8), (0, 0)]:
            with self.subTest(start=start, end=end), self.assertRaises(alignment.SubtitleAlignmentError):
                alignment._validate_segments({"segments": [segment(start, end)]}, 8)

    def test_silence_and_unclear_are_distinct(self):
        data = alignment._validate_segments({"segments": [segment(0, 4, "", "instrumental"),
                                                            segment(4, 8, "", "unclear")]}, 8)
        self.assertEqual(data[0]["text_en"], "")
        self.assertEqual(data[1]["text_en"], "[unclear vocals]")
        with self.assertRaises(alignment.SubtitleAlignmentError):
            alignment._validate_segments({"segments": [segment(0, 8, "")]}, 8)

    def test_transition_tolerance_and_long_phrase(self):
        data = alignment._validate_segments({"segments": [segment(0.2, 6), segment(6.3, 8)]}, 8)
        self.assertEqual(data[0]["end"], 6)

    def test_vocal_requires_original_and_translation_instrumental_has_no_text(self):
        for changed in ({"text_en": ""}, {"text_jp": ""}, {"kind": "instrumental"}):
            with self.subTest(changed=changed), self.assertRaises(alignment.SubtitleAlignmentError):
                alignment._validate_segments({"segments": [{**segment(0, 8), **changed}]}, 8)
        unclear = alignment._validate_segments({"segments": [segment(0, 8, "", "unclear") | {"text_jp": "audible [unclear]"}]}, 8)
        self.assertEqual(unclear[0]["text_jp"], "audible [unclear]")
        self.assertEqual(unclear[0]["text_en"], "[unclear vocals]")

    def test_hint_clock_is_attachment_relative(self):
        prompt = alignment._review_prompt(50, 10, [segment(52, 56), segment(2, 4)])
        self.assertIn('"start": 2.0', prompt)
        self.assertIn('"end": 6.0', prompt)
        self.assertIn("UNVERIFIED", prompt)


class AudioReviewTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.requests = []
        self.replies = []
        async def handler(request):
            self.requests.append(request)
            return self.replies.pop(0)
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_fallback_rejects_truncated_or_incomplete_output(self):
        self.replies = [response([segment(0, 8)], finish="MAX_TOKENS"), response([segment(0, 2)]),
                        response([segment(0, 8)])]
        result = await alignment._request_review(self.client, "YWJj", 8, "listen", "secret", ["one", "two", "three"])
        self.assertEqual(result[0]["end"], 8)
        self.assertEqual(len(self.requests), 3)
        payload = json.loads(self.requests[0].content)
        self.assertEqual(payload["contents"][0]["parts"][0]["inlineData"]["mimeType"], "audio/wav")
        self.assertEqual(self.requests[0].headers["x-goog-api-key"], "secret")
        self.assertNotIn("secret", str(self.requests[0].url))

    async def test_quota_does_not_retry_or_return_partial(self):
        self.replies = [response([], status=429)]
        with self.assertRaisesRegex(alignment.SubtitleAlignmentError, "quota"):
            await alignment._request_review(self.client, "YWJj", 8, "listen", "secret", ["one", "two"])
        self.assertEqual(len(self.requests), 1)

    async def test_invalid_response_body_falls_back(self):
        self.replies = [httpx.Response(200, text="not-json"), httpx.Response(200, json=[]),
                        httpx.Response(200, json={"candidates": [None]}), response([segment(0, 8)])]
        result = await alignment._request_review(self.client, "YWJj", 8, "listen", "secret", ["a", "b", "c", "d"])
        self.assertEqual(result[0]["text_en"], "line")
        self.assertEqual(len(self.requests), 4)

    async def test_overlapping_context_owned_once_repeated_lines_preserved(self):
        slices = []
        def extraction(path, start, end):
            slices.append((start, end))
            return "YWJj", end - start
        async def review(client, data, duration, prompt, key, models):
            if len(slices) == 1:
                return [segment(0, 28, "", "instrumental"), segment(28, 32, "chorus"),
                        segment(32, 34, "", "instrumental")]
            return [segment(0, 2, "", "instrumental"), segment(2, 6, "chorus"),
                    segment(6, 8, "", "instrumental"), segment(8, 12, "chorus"),
                    segment(12, 34, "", "instrumental")]
        with patch.object(alignment, "_probe_audio", return_value=(100, 2)), \
             patch.object(alignment, "_extract_audio", side_effect=extraction), \
             patch.object(alignment, "_request_review", side_effect=review):
            result = await alignment.refine_subtitles_from_audio("video", 10, 70, [], "key", ["model"])
        self.assertEqual(slices, [(10, 44), (36, 70)])
        self.assertEqual([(c["start"], c["end"]) for c in result], [(38, 42), (44, 48)])
        self.assertEqual([c["text_en"] for c in result], ["chorus", "chorus"])

    async def test_failed_second_chunk_never_returns_first_chunk(self):
        async def review(*args):
            if review.count:
                raise alignment.SubtitleAlignmentError("unreviewed chunk")
            review.count += 1
            return [segment(0, 34)]
        review.count = 0
        with patch.object(alignment, "_probe_audio", return_value=(60, 1)), \
             patch.object(alignment, "_extract_audio", side_effect=lambda p, s, e: ("YWJj", e-s)), \
             patch.object(alignment, "_request_review", side_effect=review):
            with self.assertRaisesRegex(alignment.SubtitleAlignmentError, "unreviewed chunk"):
                await alignment.refine_subtitles_from_audio("video", 0, 60, [], "key", ["model"])

    async def test_duration_tolerance_clamps_small_overrun_only(self):
        async def review(*args):
            return [segment(0, 10)]
        with patch.object(alignment, "_probe_audio", return_value=(10, 1)), \
             patch.object(alignment, "_extract_audio", return_value=("YWJj", 10)), \
             patch.object(alignment, "_request_review", side_effect=review):
            result = await alignment.refine_subtitles_from_audio("video", 0, 10.2, [], "key", ["model"])
            self.assertEqual(result[0]["end"], 10)
            with self.assertRaisesRegex(alignment.SubtitleAlignmentError, "exceeds"):
                await alignment.refine_subtitles_from_audio("video", 0, 10.3, [], "key", ["model"])


class RealAudioExtractionTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg/FFprobe required")
    def test_real_stream_mapping_and_nonzero_offset(self):
        alignment.TEMP_ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=alignment.TEMP_ROOT) as folder:
            source = Path(folder) / "selected-stream.mkv"
            # Video occupies stream 0; audio stream 1 starts silent, then a tone.
            subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i",
                            "color=c=black:s=16x16:d=3", "-f", "lavfi", "-i",
                            "sine=frequency=600:sample_rate=16000:duration=2", "-filter:a", "adelay=1000|1000",
                            "-map", "0:v", "-map", "1:a", "-c:v", "ffv1", "-c:a", "pcm_s16le", str(source)],
                           capture_output=True, check=True, timeout=30)
            duration, stream = alignment._probe_audio(source)
            self.assertEqual(stream, 1)
            self.assertAlmostEqual(duration, 3, places=1)
            first, _ = alignment._extract_audio(source, 0, 0.5)
            tone, extracted_duration = alignment._extract_audio(source, 1.2, 2.2)
            with wave.open(io.BytesIO(base64.b64decode(first)), "rb") as wav:
                silence = wav.readframes(wav.getnframes())
            with wave.open(io.BytesIO(base64.b64decode(tone)), "rb") as wav:
                self.assertEqual(wav.getframerate(), 16000)
                self.assertEqual(wav.getnchannels(), 1)
                audible = wav.readframes(wav.getnframes())
            self.assertEqual(set(silence), {0})
            self.assertGreater(len(set(audible)), 10)
            self.assertAlmostEqual(extracted_duration, 1, places=2)

    def test_missing_audio_source_actionable(self):
        with self.assertRaisesRegex(alignment.SubtitleAlignmentError, "missing"):
            alignment._probe_audio("definitely-missing-audio-source.mp4")

    def test_no_audio_track_is_actionable(self):
        with patch.object(Path, "is_file", return_value=True), \
             patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps({
                 "format": {"duration": "5"}, "streams": [{"index": 0, "codec_type": "video"}]}))):
            with self.assertRaisesRegex(alignment.SubtitleAlignmentError, "no audio track"):
                alignment._probe_audio("silent.mp4")


if __name__ == "__main__":
    unittest.main()
