"""ASS karaoke preserves supplied vocal boundaries, including clipped words and rests."""
from app.video.renderer import ReelRenderer


def dialogue(tmp_path, *, start=10, duration=4, basis="absolute", trusted=True, word_start=11, word_end=13.5):
    output = tmp_path / "lyrics.ass"
    cue = {"start": 10 if basis == "absolute" else 0,
           "end": 14 if basis == "absolute" else 4,
           "text_en": "Hello world", "timeline_basis": basis,
           "timing_source": "audio_aligned" if trusted else "estimated",
           "words_en": [{"word": "Hello", "start": word_start, "end": word_start + .5},
                        {"word": "world", "start": word_end - .5, "end": word_end}]}
    assert ReelRenderer().create_ass_subtitles([cue], start, duration, str(output),
        style_preset="karaoke", subtitle_animation="none", subtitle_language="en")
    return next(line for line in output.read_text(encoding="utf8").splitlines() if line.startswith("Dialogue:"))


def test_aligned_words_keep_lead_in_internal_pause_and_trailing_rest(tmp_path):
    line = dialogue(tmp_path)
    assert "{\\k100}\u200b{\\k50}Hello {\\k150}\u200b{\\k50}world{\\k50}\u200b" in line
    assert ",0:00:00.00,0:00:04.00," in line


def test_clip_start_inside_word_keeps_remaining_vocal_and_pause(tmp_path):
    line = dialogue(tmp_path, start=11.25, duration=2.75)
    assert "{\\k25}Hello {\\k150}\u200b{\\k50}world{\\k50}\u200b" in line


def test_clip_end_inside_word_truncates_its_karaoke_duration(tmp_path):
    line = dialogue(tmp_path, duration=3.25)
    assert "{\\k150}\u200b{\\k25}world" in line
    assert ",0:00:00.00,0:00:03.25," in line


def test_explicit_relative_word_clock_is_not_shifted_twice(tmp_path):
    line = dialogue(tmp_path, basis="relative", word_start=1, word_end=3.5)
    assert "{\\k100}\u200b{\\k50}Hello {\\k150}\u200b{\\k50}world" in line


def test_untrusted_word_times_keep_visual_phrase_fallback(tmp_path):
    line = dialogue(tmp_path, trusted=False)
    assert "{\\k200}Hello {\\k200}world" in line
    assert "\u200b" not in line
