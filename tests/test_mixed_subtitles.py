import pytest
from app.ai.gemini_client import compute_word_timings
from app.video.renderer import VideoRenderer

def test_compute_word_timings_mixed_lyrics():
    # Mixed English and Japanese
    text_mixed = "Fly high!! 汗と血と涙で"
    timings = compute_word_timings(text_mixed, 0.0, 3.0, is_japanese=True)
    assert len(timings) >= 3
    # Check that English words are intact and Japanese is segmented
    words = [t["word"] for t in timings]
    assert "Fly" in words
    assert "high" in words

def test_compute_word_timings_pure_english():
    text_en = "We are fighting dreamers"
    timings = compute_word_timings(text_en, 0.0, 2.5, is_japanese=False)
    assert len(timings) == 4
    words = [t["word"] for t in timings]
    assert words == ["We", "are", "fighting", "dreamers"]

def test_ass_subtitles_mixed_and_pure_english_deduplication(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    sample_lyrics = [
        {
            "start": 0.0,
            "end": 2.5,
            "text_jp": "Fly high!! 汗と血と涙で",
            "text_en": "Fly high!! With sweat, blood, and tears"
        },
        {
            # Line where vocal is pure English - both fields have the same English text
            "start": 3.0,
            "end": 5.0,
            "text_jp": "We are fighting dreamers",
            "text_en": "We are fighting dreamers"
        }
    ]

    ass_path = str(tmp_path / "mixed_subs.ass")
    success = renderer.create_ass_subtitles(
        lyrics=sample_lyrics,
        clip_start=0.0,
        clip_duration=6.0,
        output_ass_path=ass_path,
        subtitle_language="both"
    )
    assert success is True
    with open(ass_path, "r", encoding="utf-8") as f:
        content = f.read()

    lines = [l for l in content.splitlines() if l.startswith("Dialogue:")]
    # Line 1 should have 2 dialogue lines (Japanese + English)
    # Line 2 should have 1 dialogue line (deduplicated, no duplicate English stacking)
    assert len(lines) == 3
    assert "Fly high!! 汗と血と涙で" in lines[0]
    assert "Fly high!! With sweat, blood, and tears" in lines[1]
    assert "We are fighting dreamers" in lines[2]
