import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import pytest
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import app.ai.gemini_client as ai
import app.ai.song_analysis as song_analysis
from app.ai.gemini_client import refine_moment_boundaries, gemini_client

def test_refine_moment_boundaries_prevents_mid_lyric_cutoff():
    sample_lyrics = [
        {"start": 35.2, "end": 38.5, "text_jp": "君の声をずっと探してた", "text_en": "I was always searching for your voice"},
        {"start": 39.0, "end": 43.4, "text_jp": "迷い込んだ夜の向こう側で", "text_en": "Beyond the night I lost my way into"},
        {"start": 44.0, "end": 48.0, "text_jp": "強く手を握りしめて", "text_en": "Holding tightly onto your hand"},
        {"start": 48.5, "end": 52.8, "text_jp": "未来へと駆け出してゆく", "text_en": "Running forward into the future"},
    ]
    duration = 90.0

    # Test 1: If recommended start is slightly before lyrics (e.g. 34.0s), snaps to vocal onset
    refined_s, refined_e = refine_moment_boundaries(34.2, 50.0, duration, sample_lyrics)
    assert refined_s == 35.2
    # And end was mid-lyric (50.0 is inside 48.5 -> 52.8), should extend to line end (52.8)
    assert refined_e >= 52.8

    # Test 2: If recommended end cuts off 1 second before the final resolving line ends (e.g. 51.5s)
    refined_s2, refined_e2 = refine_moment_boundaries(35.2, 51.5, duration, sample_lyrics)
    assert refined_e2 >= 52.8

def test_gemini_fallback_never_invents_a_duration_based_moment():
    fallback = gemini_client._fallback_response(
        cleaned_song="Gurenge", cleaned_anime="Demon Slayer",
        video_title="Gurenge OP.mp4", duration=90.0,
    )
    assert fallback["status"] == "unavailable"
    assert fallback["recommended_start"] is None
    assert fallback["recommended_end"] is None
    assert fallback["alternatives"] == []


def test_moment_requires_audio_anchors_and_does_not_expand_to_a_fixed_length(monkeypatch, tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media is mocked")
    moment = {
        "start": 11.2, "end": 19.6, "clip_type": "Pickup to resolved refrain",
        "start_anchor": "A clean drum pickup begins.", "payoff_time": 15.1,
        "payoff_anchor": "The vocal refrain opens over the full band.",
        "end_anchor": "The held note releases into a brief decay.",
        "reason": "The pickup promises the refrain, which resolves before the next section.",
    }
    alternative = {"start": 25.0, "end": 34.0, "clip_type": "Bridge release",
            "start_anchor": "The arrangement drops to a single vocal.", "payoff_time": 29.0,
            "payoff_anchor": "The guitars return beneath the refrain.",
            "end_anchor": "The cadence resolves before the next verse.", "reason": "A quieter contrast with a clear release."}
    request = AsyncMock(return_value=({"moments": [moment, alternative]}, "test-model"))
    evidence = AsyncMock(return_value=[{"inlineData": {"mimeType": "audio/mpeg", "data": "audio"}}])
    monkeypatch.setattr(song_analysis, "generate_json", request)
    monkeypatch.setattr(ai, "extract_timed_audio_samples", evidence)
    monkeypatch.setattr(song_analysis, "probe_video", lambda path: SimpleNamespace(duration=40.0, has_audio=True))

    result = asyncio.run(ai.GeminiClient().analyze_song(video_path=str(source), api_key_override="key"))
    assert (result["recommended_start"], result["recommended_end"]) == (11.2, 19.6)
    assert result["duration"] == pytest.approx(8.4)
    assert result["payoff_time"] == 15.1
    assert result["end_anchor"] == moment["end_anchor"]
    assert result["alternatives"][0]["start"] == 25.0
    assert result["score"] is None  # no fabricated popularity/confidence score
    assert "subtitle_style" not in result and "lyrics" not in result
    evidence.assert_awaited_once_with(str(source), 40.0, full_coverage=True)
    request.assert_awaited_once()
    parts, key, schema = request.call_args.args
    assert parts[0]["inlineData"]["mimeType"] == "audio/mpeg"
    assert key == "key" and schema == song_analysis.SCHEMA


def test_moment_without_audible_anchors_is_rejected(monkeypatch, tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"media is mocked")
    bad = {
        "start": 20.0, "end": 45.0, "payoff_time": 30,
        "clip_type": "A musical section", "reason": "Generic later section",
        "start_anchor": "", "payoff_anchor": "", "end_anchor": "",
    }
    request = AsyncMock(return_value=({"moments": [bad]}, "test-model"))
    evidence = AsyncMock(return_value=[{"inlineData": {"mimeType": "audio/mpeg", "data": "audio"}}])
    monkeypatch.setattr(song_analysis, "generate_json", request)
    monkeypatch.setattr(ai, "extract_timed_audio_samples", evidence)
    monkeypatch.setattr(song_analysis, "probe_video", lambda path: SimpleNamespace(duration=90.0, has_audio=True))
    with pytest.raises(ValueError, match="audible events"):
        asyncio.run(ai.GeminiClient().analyze_song(video_path=str(source), api_key_override="key"))
    assert request.await_count == 2  # one bounded correction, then an honest failure
    evidence.assert_awaited_once()
