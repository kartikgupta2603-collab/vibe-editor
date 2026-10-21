"""Hook grounding and real FFmpeg selection regressions; no external AI calls."""
import asyncio
import base64
import importlib
import json
import shutil
import subprocess
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

ai = importlib.import_module("app.ai.gemini_client")
copy = importlib.import_module("app.ai.reel_copy")
transport_module = importlib.import_module("app.ai.gemini_transport")


@pytest.mark.parametrize("with_audio", [True, False])
def test_real_clip_keeps_only_selected_visuals_and_optional_audio(tmp_path, with_audio):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg/FFprobe unavailable")
    source = tmp_path / "source.mp4"
    command = ["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i",
               "color=red:s=320x240:r=12:d=1", "-f", "lavfi", "-i", "color=blue:s=320x240:r=12:d=2"]
    if with_audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:duration=3"]
    command += ["-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]"]
    if with_audio:
        command += ["-map", "2:a", "-c:a", "aac"]
    command += ["-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", str(source)]
    subprocess.run(command, check=True, capture_output=True, timeout=30)
    clip = asyncio.run(ai.extract_hook_video(str(source), 1.25, 2.75))
    assert clip["part"]["videoMetadata"]["fps"] == 3
    output = tmp_path / "clip.mp4"
    output.write_bytes(base64.b64decode(clip["part"]["inlineData"]["data"]))
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)],
                           check=True, capture_output=True, timeout=15)
    info = json.loads(probe.stdout)
    assert float(info["format"]["duration"]) == pytest.approx(1.5, abs=0.2)
    assert clip["has_audio"] is with_audio
    assert any(s["codec_type"] == "audio" for s in info["streams"]) is with_audio
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"]) == (320, 240)  # do not upscale evidence
    assert video["avg_frame_rate"] == "12/1"
    frame = subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1", "-vf", "scale=1:1",
                            "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], check=True, capture_output=True, timeout=15)
    red, green, blue = frame.stdout
    assert blue > 200 and red < 40 and green < 40  # selected blue scene, never earlier red scene


def test_missing_key_fails_before_reading_or_uploading_media(monkeypatch):
    monkeypatch.setattr(copy, "get_settings", lambda: SimpleNamespace(gemini_api_key=""))
    extraction = AsyncMock()
    monkeypatch.setattr(ai, "extract_hook_video", extraction)
    with pytest.raises(RuntimeError, match="API key"):
        asyncio.run(ai.GeminiClient().generate_viral_hooks())
    extraction.assert_not_awaited()


@pytest.mark.parametrize("start,end", [(-1, 10), (5, 5), (10, 5), (0, 361), (float("nan"), 20), (0, float("inf"))])
def test_invalid_trim_never_invokes_media_tools(tmp_path, monkeypatch, start, end):
    source = tmp_path / "source.mp4"
    source.touch()
    monkeypatch.setattr(subprocess, "run", lambda *a, **kw: pytest.fail("Invalid range reached media tools"))
    with pytest.raises(ValueError, match="Select a reel"):
        asyncio.run(ai.extract_hook_video(str(source), start, end))


def grounded_response():
    lines = [
        "That smile arrives before the room changes",
        "Everyone rushes while she takes her time",
        "The empty chair makes this celebration complicated",
        "His hands hesitate before opening the door",
        "One quiet glance interrupts all that confidence",
        "Why does the crowd stop celebrating here",
    ]
    return {
        "reel_summary": "A smile, rushing crowd, empty chair, hesitant hands and sudden silence.",
        "observations": [{"timestamp": 1.0, "visual": "She smiles while the crowd rushes past an empty chair.",
                          "audio": "The music pauses."},
                         {"timestamp": 4.5, "visual": "His hands hesitate at the door before the crowd stops.",
                          "audio": "A soft note returns."}],
        "hooks": [{"hook": line, "category": "curiosity", "evidence_indices": [i % 2]}
                  for i, line in enumerate(lines)],
    }


def install_fake_model(monkeypatch, parsed, *, has_audio=True, duration=10, status=200, transport=False,
                       statuses=None, request_urls=None):
    captured = []
    body = {"candidates": [{"content": {"parts": [{"text": json.dumps(parsed)}]}}]}

    class Client:
        def __init__(self, **kwargs):
            assert kwargs["headers"] == {"x-goog-api-key": "test-key"}
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            captured.append(kwargs["json"])
            if request_urls is not None:
                request_urls.append(args[0])
            if transport:
                raise httpx.ReadTimeout("Timed out")
            if statuses is not None:
                return SimpleNamespace(status_code=statuses[len(captured) - 1], json=lambda: body)
            return SimpleNamespace(status_code=status, json=lambda: body)

    monkeypatch.setattr(transport_module, "GEMINI_MODELS", ["test-model"])
    monkeypatch.setattr(transport_module.httpx, "AsyncClient", Client)
    monkeypatch.setattr(transport_module.asyncio, "sleep", AsyncMock())
    monkeypatch.setattr(ai, "extract_hook_video", AsyncMock(return_value={
        "part": {"inlineData": {"mimeType": "video/mp4", "data": "video"},
                 "videoMetadata": {"fps": 3 if duration <= 90 else 1}},
        "duration": duration, "has_audio": has_audio,
    }))
    return captured


def test_grounded_hooks_use_media_first_and_derive_evidence(monkeypatch):
    parsed = grounded_response()
    captured = install_fake_model(monkeypatch, parsed)
    result = asyncio.run(ai.GeminiClient().generate_viral_hooks(
        api_key_override="test-key", video_path="source.mp4", start_time=20, end_time=30))
    assert [item["hook"] for item in result] == [item["hook"] for item in parsed["hooks"]]
    assert parsed["observations"][0]["visual"] in result[0]["evidence"]
    assert parsed["observations"][0]["audio"] in result[0]["evidence"]
    parts = captured[0]["contents"][0]["parts"]
    assert parts[0]["inlineData"]["mimeType"] == "video/mp4"
    assert parts[0]["videoMetadata"]["fps"] == 3
    assert "text" in parts[1]


def test_long_silent_selection_uses_visual_evidence_and_lower_sampling_rate(monkeypatch):
    parsed = grounded_response()
    for observation in parsed["observations"]:
        observation["audio"] = ""
    captured = install_fake_model(monkeypatch, parsed, has_audio=False, duration=120)
    result = asyncio.run(ai.GeminiClient().generate_viral_hooks(
        api_key_override="test-key", video_path="source.mp4", end_time=120))
    assert len(result) == 6
    assert parsed["observations"][0]["visual"] in result[0]["evidence"]
    assert captured[0]["contents"][0]["parts"][0]["videoMetadata"]["fps"] == 1


def test_hooks_use_one_grounded_model_request(monkeypatch):
    draft = grounded_response()
    captured = install_fake_model(monkeypatch, draft)
    result = asyncio.run(ai.GeminiClient().generate_viral_hooks(
        api_key_override="test-key", video_path="source.mp4", end_time=10))
    assert len(captured) == 1
    assert result[0]["hook"] == draft["hooks"][0]["hook"]
    assert draft["observations"][0]["visual"] in result[0]["evidence"]


def test_hook_quota_never_retries_analysis(monkeypatch):
    statuses = [429]
    captured = install_fake_model(monkeypatch, grounded_response(), statuses=statuses)
    monkeypatch.setattr(transport_module, "GEMINI_MODELS", ["test-model", "unused-fallback"])
    sleep = AsyncMock()
    monkeypatch.setattr(transport_module.asyncio, "sleep", sleep)
    with pytest.raises(RuntimeError, match="quota"):
        asyncio.run(ai.GeminiClient().generate_viral_hooks(
            api_key_override="test-key", video_path="source.mp4", end_time=10))
    assert len(captured) == len(statuses)
    sleep.assert_not_awaited()


@pytest.mark.parametrize("kind", ["duplicate", "near_duplicate", "no_evidence", "partial",
                                 "invalid_index", "negative_index", "noninteger_index", "generic"])
def test_bad_candidates_are_filtered_without_losing_good_hooks(monkeypatch, kind):
    parsed = grounded_response()
    hooks = parsed["hooks"]
    if kind == "duplicate":
        hooks[1] = hooks[0]
    if kind == "near_duplicate":
        hooks[1]["hook"] = "That smile arrives before the room shifts"
    if kind == "no_evidence":
        hooks[0]["evidence_indices"] = []
    if kind == "partial":
        hooks.pop()
    if kind == "invalid_index":
        hooks[0]["evidence_indices"] = [2]
    if kind == "negative_index":
        hooks[0]["evidence_indices"] = [-1]
    if kind == "noninteger_index":
        hooks[0]["evidence_indices"] = [True]
    if kind == "generic":
        hooks[0]["hook"] = "This anime opening really hits different today"
    captured = install_fake_model(monkeypatch, parsed)
    result = asyncio.run(ai.GeminiClient().generate_viral_hooks(
        api_key_override="test-key", video_path="source.mp4", end_time=10))
    assert len(result) == 5
    assert len({item["hook"] for item in result}) == 5
    assert all(item["evidence"] for item in result)
    assert len(captured) == 1  # no repeat upload to repair one discarded row


@pytest.mark.parametrize("kind", ["malformed", "quota", "transport",
                                 "negative_timestamp", "late_timestamp", "nonfinite_timestamp", "missing_visual",
                                 "empty_observations", "silent_audio"])
def test_ai_failures_never_return_stock_hooks(monkeypatch, kind):
    parsed = grounded_response()
    if kind == "negative_timestamp":
        parsed["observations"][0]["timestamp"] = -1
    if kind == "late_timestamp":
        parsed["observations"][0]["timestamp"] = 11
    if kind == "nonfinite_timestamp":
        parsed["observations"][0]["timestamp"] = float("nan")
    if kind == "missing_visual":
        parsed["observations"][0]["visual"] = ""
    if kind == "empty_observations":
        parsed["observations"] = []
    if kind == "malformed":
        parsed = {"reel_summary": "A smile", "hooks": "not an array"}
    install_fake_model(monkeypatch, parsed, has_audio=kind != "silent_audio",
                       status=429 if kind == "quota" else 200, transport=kind == "transport")
    with pytest.raises(RuntimeError, match="Gemini"):
        asyncio.run(ai.GeminiClient().generate_viral_hooks(api_key_override="test-key", video_path="source.mp4", end_time=10))


def test_high_resolution_hook_evidence_keeps_small_visual_details(tmp_path):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg/FFprobe unavailable")
    source = tmp_path / "detail.mp4"
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=1280x720:r=12:d=1", "-c:v", "libx264", "-preset", "fast", str(source)],
                   check=True, capture_output=True, timeout=30)
    clip = asyncio.run(ai.extract_hook_video(str(source), 0, 1))
    output = tmp_path / "evidence.mp4"
    output.write_bytes(base64.b64decode(clip["part"]["inlineData"]["data"]))
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)],
                           check=True, capture_output=True, timeout=15)
    stream = next(s for s in json.loads(probe.stdout)["streams"] if s["codec_type"] == "video")
    assert (stream["width"], stream["height"]) == (768, 432)
    assert stream["avg_frame_rate"] == "12/1"
