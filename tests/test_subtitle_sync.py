import os
import pytest
from pathlib import Path
from app.video.renderer import VideoRenderer
from app.ai.gemini_client import (
    compute_word_timings,
    normalize_lyrics_payload,
    parse_gemini_json,
    parse_timestamp,
    refine_moment_boundaries,
    sanitize_lyric_cues,
)

def test_ass_subtitles_absolute_timeline_alignment(tmp_path):
    """Verifies absolute timestamps (e.g., 35.0s to 38.0s) align to clip_start (30.0s) as 5.0s in exported ASS."""
    renderer = VideoRenderer(output_dir=str(tmp_path))
    lyrics = [
        {
            "start": 35.0,
            "end": 38.0,
            "text_jp": "君の声をずっと探してた",
            "text_en": "I was always searching for your voice"
        }
    ]
    out_ass = str(tmp_path / "sync_test.ass")
    res = renderer.create_ass_subtitles(
        lyrics=lyrics,
        clip_start=30.0,
        clip_duration=30.0,
        output_ass_path=out_ass,
        subtitle_language="both"
    )
    assert res is True
    with open(out_ass, "r", encoding="utf-8") as f:
        content = f.read()

    # In ASS format: Dialogue: Layer, Start, End, Style, ...
    # Start for 35.0 - 30.0 = 5.00s -> 0:00:05.00
    # End for 38.0 - 30.0 = 8.00s -> 0:00:08.00
    assert "0:00:05.00,0:00:08.00" in content
    assert "君の声をずっと探してた" in content
    assert "I was always searching for your voice" in content

def test_ass_subtitles_relative_timestamp_protection(tmp_path):
    """Verifies that if lyrics timestamps are already relative (e.g. 2.0s to 5.0s for a clip at 40.0s), they are not dropped."""
    renderer = VideoRenderer(output_dir=str(tmp_path))
    lyrics = [
        {
            "start": 2.0,
            "end": 5.0,
            "text_jp": "走り出した思い",
            "text_en": "These feelings started racing"
        }
    ]
    out_ass = str(tmp_path / "sync_rel_test.ass")
    res = renderer.create_ass_subtitles(
        lyrics=lyrics,
        clip_start=40.0,
        clip_duration=30.0,
        output_ass_path=out_ass,
        subtitle_language="both"
    )
    assert res is True
    with open(out_ass, "r", encoding="utf-8") as f:
        content = f.read()

    # Should remain 0:00:02.00,0:00:05.00 and NOT be dropped as negative (2 - 40 = -38)
    assert "0:00:02.00,0:00:05.00" in content
    assert "走り出した思い" in content

def test_compute_word_timings_accuracy():
    """Verifies word timing computation maintains full coverage from vocal onset to offset."""
    # Mixed Japanese + English
    mixed = "Fly high!! 汗と涙で"
    words = compute_word_timings(mixed, 10.0, 14.0, is_japanese=True)
    assert len(words) > 0
    assert words[0]["start"] == 10.0
    assert words[-1]["end"] == 14.0

    # Pure English
    en = "Just let it out"
    words_en = compute_word_timings(en, 1.25, 3.75, is_japanese=False)
    assert len(words_en) == 4
    assert words_en[0]["start"] == 1.25
    assert words_en[-1]["end"] == 3.75


def test_model_json_root_array_and_markdown_fence_are_accepted():
    data = parse_gemini_json("\n```JSON\n[{\"start\": \"0:01.25\", \"end\": 3.5, \"text_en\": \"Hello\"}]\n```\n")
    metadata, lyrics = normalize_lyrics_payload(data)

    assert metadata == {}
    assert len(lyrics) == 1
    assert parse_timestamp(lyrics[0]["start"], 0.0) == 1.25


def test_model_lyrics_skip_malformed_entries_without_losing_valid_cues():
    _, lyrics = normalize_lyrics_payload([
        {"start": 0.0, "end": 2.0, "text_en": "Valid line"},
        "not a subtitle object",
        None,
    ])
    assert lyrics == [{"start": 0.0, "end": 2.0, "text_en": "Valid line"}]


def test_ass_karaoke_uses_supplied_word_durations(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    lyrics = [{
        "start": 0.0,
        "end": 3.0,
        "text_jp": "We are",
        "text_en": "We are",
        "words_en": [
            {"word": "We", "start": 0.0, "end": 1.0},
            {"word": "are", "start": 1.0, "end": 3.0},
        ],
        "timing_source": "audio_aligned",
    }]
    out_ass = str(tmp_path / "karaoke.ass")
    assert renderer.create_ass_subtitles(
        lyrics=lyrics,
        clip_start=0.0,
        clip_duration=4.0,
        output_ass_path=out_ass,
        style_preset="karaoke",
        subtitle_language="both",
    ) is True

    content = Path(out_ass).read_text(encoding="utf-8")
    assert r"{\k100}We {\k200}are" in content


def test_sanitize_lyric_cues_removes_overlap_and_preserves_sung_english():
    cues = sanitize_lyric_cues([
        {"start": 1.0, "end": 2.5, "text_jp": "We are fighting", "text_en": "We are battling"},
        {"start": 2.0, "end": 3.4, "text_jp": "dreamers", "text_en": "dreamers"},
    ], 0.0, 10.0)

    assert len(cues) == 2
    assert cues[0]["text_en"] == "We are fighting"
    assert cues[1]["start"] == 2.5
    assert cues[0]["timing_source"] == "gemini_audio_estimate"


def test_ass_karaoke_skips_untrusted_generated_word_sweep(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / "untrusted_karaoke.ass")
    assert renderer.create_ass_subtitles(
        lyrics=[{
            "start": 0.0,
            "end": 2.0,
            "text_jp": "We are",
            "text_en": "We are",
            "words_en": [
                {"word": "We", "start": 0.0, "end": 1.0},
                {"word": "are", "start": 1.0, "end": 2.0},
            ],
            "timing_source": "gemini_audio_estimate",
        }],
        clip_start=0.0,
        clip_duration=3.0,
        output_ass_path=out_ass,
        style_preset="karaoke",
    ) is True
    assert r"{\k" not in Path(out_ass).read_text(encoding="utf-8")
