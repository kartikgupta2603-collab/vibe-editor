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


def test_ass_subtitles_respect_explicit_absolute_timeline_basis(tmp_path):
    """Early-song cues must never be rebased into a later selected clip."""
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / "absolute_basis.ass")
    lyrics = [{
        "start": 2.0,
        "end": 5.0,
        "text_jp": "冒頭の歌詞",
        "text_en": "An early lyric",
        "timeline_basis": "absolute",
    }]
    assert renderer.create_ass_subtitles(
        lyrics=lyrics,
        clip_start=40.0,
        clip_duration=20.0,
        output_ass_path=str(out_ass),
    ) is False

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


def test_bold_subtitles_default_to_soft_fade_without_scale_motion(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / "pop_bounce.ass")
    lyrics = [{"start": 0.0, "end": 2.5, "text_jp": "響け、今！", "text_en": "Make it hit"}]

    assert renderer.create_ass_subtitles(lyrics, 0.0, 3.0, out_ass, style_preset="pop_bounce") is True
    content = Path(out_ass).read_text(encoding="utf-8")
    assert "Style: Japanese,Yu Gothic,44" in content
    assert r"{\fad(120,130)}" in content
    assert r"\fscx116" not in content
    assert r"\move(" not in content


def test_manga_flash_ass_subtitles_keep_the_yellow_black_manga_treatment(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / "manga_flash.ass")
    lyrics = [{"start": 0.0, "end": 2.5, "text_jp": "限界突破！", "text_en": "Break the limit"}]

    assert renderer.create_ass_subtitles(lyrics, 0.0, 3.0, out_ass, style_preset="manga_flash") is True
    content = Path(out_ass).read_text(encoding="utf-8")
    assert "Style: Japanese,Yu Gothic,44,&H0000E6FF" in content
    assert r"{\fad(120,130)}" in content


@pytest.mark.parametrize("style", ["minimal", "pop_bounce", "manga_flash", "karaoke"])
def test_auto_fade_keeps_consecutive_cue_times_and_short_cues_readable(tmp_path, style):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    output = tmp_path / "soft-fade.ass"
    lyrics = [{"start": 0, "end": 1, "text_en": "First line"},
              {"start": 1, "end": 1.4, "text_en": "Next line"}]
    assert renderer.create_ass_subtitles(lyrics, 0, 2, str(output), style_preset=style)
    content = output.read_text(encoding="utf-8")
    assert "0:00:00.00,0:00:01.00" in content
    assert "0:00:01.00,0:00:01.40" in content
    assert r"\fad(120,130)" in content
    assert r"\fad(100,100)" in content
    assert r"\fscx116" not in content
    assert r"\move(" not in content


@pytest.mark.parametrize(
    ("animation", "expected"),
    [
        ("fade", r"{\fad(120,130)}"),
        ("pop", r"{\fscx116\fscy116\t(0,180,\fscx100\fscy100)\fad(100,150)}"),
        ("rise", r"{\move(540,"),
        ("slide", r"{\move(588,"),
        ("none", "Make it hit"),
    ],
)
def test_subtitle_animation_presets_export_with_the_expected_ass_motion(tmp_path, animation, expected):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / f"{animation}.ass")
    lyrics = [{"start": 0.0, "end": 2.5, "text_jp": "響け、今！", "text_en": "Make it hit"}]

    assert renderer.create_ass_subtitles(
        lyrics, 0.0, 3.0, out_ass, subtitle_animation=animation
    ) is True
    content = Path(out_ass).read_text(encoding="utf-8")
    assert expected in content
    if animation == "none":
        assert r"\fad(" not in content


def test_sanitize_lyric_cues_removes_overlap_and_preserves_sung_english():
    cues = sanitize_lyric_cues([
        {"start": 1.0, "end": 2.5, "text_jp": "We are fighting", "text_en": "We are battling"},
        {"start": 2.0, "end": 3.4, "text_jp": "dreamers", "text_en": "dreamers"},
    ], 0.0, 10.0)

    assert len(cues) == 2
    assert cues[0]["text_en"] == "We are fighting"
    assert cues[0]["end"] == 2.0
    assert cues[1]["start"] == 2.0
    assert cues[0]["timing_source"] == "gemini_audio_estimate"


def test_overlapping_long_estimate_does_not_erase_the_next_vocal_phrase():
    cues = sanitize_lyric_cues([
        {"start": 1.0, "end": 10.0, "text_en": "An earlier phrase"},
        {"start": 2.0, "end": 3.0, "text_en": "A following phrase"},
    ], 0.0, 12.0)
    assert len(cues) == 2
    assert [(cue["start"], cue["end"]) for cue in cues] == [(1.0, 2.0), (2.0, 3.0)]


def test_sanitizer_keeps_fast_adlibs_and_separate_repeated_phrases():
    cues = sanitize_lyric_cues([
        {"start": 1.0, "end": 1.12, "text_en": "Hey"},
        {"start": 2.0, "end": 3.2, "text_en": "Again"},
        {"start": 3.1, "end": 4.0, "text_en": "Again"},
    ], 0.0, 5.0)
    assert len(cues) == 3
    assert cues[0]["end"] == 1.12
    assert cues[2]["start"] == 3.1


def test_sanitizer_rejects_invalid_times_without_inventing_a_zero_onset():
    cues = sanitize_lyric_cues([
        {"end": 3.0, "text_en": "Missing start"},
        {"start": float("nan"), "end": 4.0, "text_en": "Bad time"},
        {"start": 5.0, "end": float("inf"), "text_en": "Bad end"},
        {"start": 6.0, "end": 7.0, "text_en": "Valid phrase"},
    ], 0.0, 8.0)
    assert [cue["text_en"] for cue in cues] == ["Valid phrase"]


@pytest.mark.parametrize("whole_video", [False, True])
@pytest.mark.parametrize("chunk_fails", [False, True])
def test_generation_uses_dedicated_audio_chunks_and_never_returns_partial_cues(
    tmp_path, monkeypatch, whole_video, chunk_fails,
):
    import asyncio
    import importlib
    from unittest.mock import AsyncMock

    ai = importlib.import_module("app.ai.gemini_client")
    subtitles = importlib.import_module("app.ai.subtitles")
    review_module = importlib.import_module("app.ai.subtitle_alignment")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"transport mocked; real extraction covered separately")
    extracts, posts = [], []
    monkeypatch.setattr(subtitles, "CHUNK_SECONDS", 10)
    monkeypatch.setattr(subtitles, "_probe_audio", lambda path: (30.0, 1))

    def extract(path, start, end):
        assert path == str(source)
        extracts.append((start, end))
        return f"audio-{start}", end - start

    def segment(start, end, kind, text=""):
        return {"start": start, "end": end, "kind": kind, "original": text,
                "english": text, "romanized": ""}

    async def generate(parts, key, schema, **kwargs):
        posts.append(parts)
        assert key == "test-key"
        assert schema is subtitles.TRANSCRIPTION_SCHEMA
        assert parts[0]["inlineData"]["mimeType"] == "audio/wav"
        assert parts[0]["inlineData"]["data"] == f"audio-{extracts[-1][0]}"
        if chunk_fails and extracts[-1][0] == 20:
            raise RuntimeError("chunk failed; no partial subtitles")
        return {"language": "English", "segments": [
            segment(0, 2.25, "instrumental"),
            segment(2.25, 3.2, "vocal", "A corrected phrase"),
            segment(3.2, 6, "instrumental"),
            segment(6, 7.9, "vocal", "A recovered phrase"),
            segment(7.9, 10, "instrumental"),
        ]}, "test-model"

    monkeypatch.setattr(subtitles, "_extract_audio", extract)
    monkeypatch.setattr(subtitles, "generate_json", generate)
    review = AsyncMock(side_effect=AssertionError("No unconditional second transcription"))
    monkeypatch.setattr(review_module, "refine_subtitles_from_audio", review)
    client = ai.GeminiClient()
    request = (client.generate_full_video_subtitles(str(source), duration=12, api_key_override="test-key")
               if whole_video else client.generate_lyrics("Song", "Anime", 10, 30,
                                                          video_path=str(source), api_key_override="test-key"))
    if chunk_fails:
        with pytest.raises(RuntimeError, match="chunk failed; no partial subtitles"):
            asyncio.run(request)
    else:
        result = asyncio.run(request)
        starts = (0, 10, 20) if whole_video else (10, 20)
        expected = [(offset + start, offset + end)
                    for offset in starts for start, end in [(2.25, 3.2), (6.0, 7.9)]]
        assert [(cue["start"], cue["end"]) for cue in result["lyrics"]] == expected
        assert all(cue["timeline_basis"] == "absolute" for cue in result["lyrics"])
        assert all(cue["timing_source"] == "gemini_audio_estimate" for cue in result["lyrics"])
        assert all(cue["text_jp"] == cue["text_en"] for cue in result["lyrics"])
        assert result["duration"] == 30  # Whole-source probing wins over stale caller duration.
    review.assert_not_awaited()
    expected_extracts = [(0, 10), (10, 20), (20, 30)] if whole_video else [(10, 20), (20, 30)]
    assert extracts == expected_extracts
    assert len(posts) == len(expected_extracts)  # No redundant review call after valid coverage.


def test_transcription_provider_contract_is_language_neutral_and_preserves_english(monkeypatch):
    import asyncio
    from app.ai import subtitles

    monkeypatch.setattr(subtitles, "_probe_audio", lambda path: (2, 0))
    monkeypatch.setattr(subtitles, "_extract_audio", lambda *args: ("supplied-audio", 2))

    async def generate(parts, key, schema, **kwargs):
        fields = schema["properties"]["segments"]["items"]["properties"]
        assert set(fields) == {"start", "end", "kind", "original", "english", "romanized"}
        assert "language" in schema["required"]
        assert "Never convert English into Japanese" in parts[-1]["text"]
        return {"language": "English", "segments": [{
            "start": 0, "end": 2, "kind": "vocal", "original": "Stay here with me",
            "english": "Stay here with me", "romanized": "",
        }]}, "test-model"

    monkeypatch.setattr(subtitles, "generate_json", generate)
    result = asyncio.run(subtitles.generate_subtitles("source", "key"))
    assert result["lyrics"][0]["text_jp"] == "Stay here with me"
    assert result["lyrics"][0]["text_en"] == "Stay here with me"
    assert set(result) == {"status", "duration", "lyrics", "model_used", "message"}


def test_sanitize_lyric_cues_preserves_meaning_first_english_adaptation():
    """The renderer must retain a contextual English subtitle without rewriting it."""
    cues = sanitize_lyric_cues([
        {
            "start": 4.0,
            "end": 6.0,
            "text_jp": "胸の奥で隠した勇気",
            "text_en": "The courage I keep hidden inside",
        },
    ], 0.0, 10.0)

    assert cues[0]["text_en"] == "The courage I keep hidden inside"
    assert cues[0]["timeline_basis"] == "absolute"


def test_sanitize_lyric_cues_merges_a_lone_english_connective_with_its_phrase():
    cues = sanitize_lyric_cues([
        {"start": 4.0, "end": 4.4, "text_jp": "If", "text_en": "If"},
        {"start": 4.5, "end": 6.8, "text_jp": "everyone is not special", "text_en": "everyone is not special"},
    ], 0.0, 10.0)

    assert len(cues) == 1
    assert cues[0]["start"] == 4.0
    assert cues[0]["text_jp"] == "If everyone is not special"
    assert cues[0]["text_en"] == "If everyone is not special"


def test_ass_subtitles_keep_normal_dual_language_phrases_compact(tmp_path):
    """A normal phrase must stay as one Japanese row and one English row."""
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / "compact_phrase.ass")
    lyrics = [{
        "start": 0.0,
        "end": 2.5,
        "text_jp": "パッと見てできないことばっかだけどベリーハッピー",
        "text_en": "At first glance, there is so much I cannot do, but I am very happy",
    }]
    assert renderer.create_ass_subtitles(lyrics, 0.0, 3.0, str(out_ass), subtitle_language="both") is True
    content = Path(out_ass).read_text(encoding="utf-8")
    assert "パッと見てできないことばっかだけどベリーハッピー" in content
    assert "At first glance, there is so much I cannot do, but I am very happy" in content
    assert r"\N" not in content
    assert "Style: English,Segoe UI,26.88" in content


def test_ass_subtitles_compact_an_unusually_tall_cue(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    out_ass = str(tmp_path / "compact_tall_phrase.ass")
    lyrics = [{
        "start": 0.0,
        "end": 3.0,
        "text_jp": "このとても長い歌詞は画面を占領しないように読みやすいサイズへ自動的に収める必要があります",
        "text_en": "This unusually long lyric should automatically stay compact and readable on a phone screen",
    }]
    assert renderer.create_ass_subtitles(lyrics, 0.0, 4.0, str(out_ass), subtitle_language="both") is True
    assert r"\fscx" in Path(out_ass).read_text(encoding="utf-8")


def test_ass_karaoke_uses_a_phrase_sweep_when_word_timing_is_unavailable(tmp_path):
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
    content = Path(out_ass).read_text(encoding="utf-8")
    assert r"{\k" in content
    assert "We " in content
    assert "are" in content


def test_selected_english_subtitle_font_is_written_to_ass(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    output = tmp_path / "subtitle_font.ass"
    assert renderer.create_ass_subtitles(
        [{"start": 0, "end": 2, "text_jp": "聞いて", "text_en": "Listen up"}],
        clip_start=0, clip_duration=2, output_ass_path=str(output), subtitle_font="bahnschrift",
    )
    assert "Style: English,Bahnschrift," in output.read_text(encoding="utf-8")


def test_white_on_black_subtitles_use_opaque_black_boxes_with_white_text(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    output = tmp_path / "white_on_black.ass"
    assert renderer.create_ass_subtitles(
        [{"start": 0, "end": 2, "text_jp": "聞いて", "text_en": "Listen up"}],
        clip_start=0, clip_duration=2, output_ass_path=str(output), style_preset="white_on_black",
    )
    content = output.read_text(encoding="utf-8")
    assert "Style: Japanese,Yu Mincho,40,&H00FFFFFF" in content
    assert "Style: English,Georgia," in content
    assert "&H00FFFFFF,&H000000FF,&H00000000,&H00000000" in content
    assert ",3,10,0,2," in content
