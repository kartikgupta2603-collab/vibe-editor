import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

import pytest
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

def test_gemini_fallback_duration_is_complete():
    # Test for standard 90s TV-size anime opening
    fb_90 = gemini_client._fallback_response(
        song="Gurenge",
        anime="Demon Slayer",
        video_title="Gurenge OP.mp4",
        duration=90.0,
        cleaned_song="Gurenge",
        cleaned_anime="Demon Slayer"
    )
    rec_dur_90 = fb_90["recommended_end"] - fb_90["recommended_start"]
    # Must NOT be a short 15-30s snippet; must be full chorus/climax (>= 45s)
    assert rec_dur_90 >= 45.0
    assert fb_90["recommended_end"] == 90.0

    # Test for short video (<= 60s)
    fb_45 = gemini_client._fallback_response(
        song="Short OP",
        anime="Anime",
        video_title="Short.mp4",
        duration=45.0,
        cleaned_song="Short OP",
        cleaned_anime="Anime"
    )
    rec_dur_45 = fb_45["recommended_end"] - fb_45["recommended_start"]
    assert rec_dur_45 == 45.0
    assert fb_45["recommended_start"] == 0.0
    assert fb_45["recommended_end"] == 45.0
