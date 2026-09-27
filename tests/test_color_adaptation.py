import os
import pytest
from app.video.renderer import VideoRenderer, is_dark_hex

def test_is_dark_hex():
    # Pure dark
    assert is_dark_hex("#000000") is True
    assert is_dark_hex("#000") is True
    assert is_dark_hex("#0f172a") is True
    assert is_dark_hex("#0284c7") is True
    assert is_dark_hex("#1e293b") is True
    
    # Pure light
    assert is_dark_hex("#ffffff") is False
    assert is_dark_hex("#fff") is False
    assert is_dark_hex("#38bdf8") is False
    assert is_dark_hex("#e2e8f0") is False
    assert is_dark_hex("#94a3b8") is False
    
    # Empty / None
    assert is_dark_hex(None) is False
    assert is_dark_hex("") is False
    assert is_dark_hex("invalid") is False

def test_ass_subtitles_adaptation(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    sample_lyrics = [
        {"start": 0.0, "end": 2.0, "text": "テスト", "translation": "Test"}
    ]
    
    # Test 1: White background with light/white subtitle color
    white_ass = str(tmp_path / "sub_white.ass")
    renderer.create_ass_subtitles(
        lyrics=sample_lyrics,
        clip_start=0.0,
        clip_duration=2.0,
        output_ass_path=white_ass,
        bg_type="white",
        subtitle_color="#ffffff"
    )
    with open(white_ass, "r", encoding="utf-8") as f:
        content = f.read()
        # Should NOT have pure white text &H00FFFFFF as primary fill
        assert "&H002A170F" in content  # Dark slate #0f172a
        assert "&H00FFFFFF" in content  # White outline

    # Test 2: Black background with dark subtitle color
    black_ass = str(tmp_path / "sub_black.ass")
    renderer.create_ass_subtitles(
        lyrics=sample_lyrics,
        clip_start=0.0,
        clip_duration=2.0,
        output_ass_path=black_ass,
        bg_type="black",
        subtitle_color="#000000"
    )
    with open(black_ass, "r", encoding="utf-8") as f:
        content = f.read()
        # Should adapt to white text
        assert "&H00FFFFFF" in content  # White fill
