import os
import pytest
from app.video.renderer import VideoRenderer
from app.main import ExportRequest, RenderReelRequest

def test_ass_subtitles_language_selection(tmp_path):
    renderer = VideoRenderer(output_dir=str(tmp_path))
    sample_lyrics = [
        {
            "start": 0.0,
            "end": 2.5,
            "text_jp": "光るなら",
            "text_en": "If it shines",
            "text": "光るなら"
        },
        {
            "start": 3.0,
            "end": 5.5,
            "text_jp": "君だよ君なんだよ",
            "text_en": "It's you, it's really you",
            "text": "君だよ君なんだよ"
        }
    ]

    # 1. Both Japanese & English
    both_ass = str(tmp_path / "subs_both.ass")
    res_both = renderer.create_ass_subtitles(
        lyrics=sample_lyrics,
        clip_start=0.0,
        clip_duration=6.0,
        output_ass_path=both_ass,
        subtitle_language="both"
    )
    assert res_both is True
    with open(both_ass, "r", encoding="utf-8") as f:
        content_both = f.read()
        assert "Style: Japanese" in content_both
        assert "Style: English" in content_both
        assert "光るなら" in content_both
        assert "If it shines" in content_both

    # 2. Japanese Only
    jp_ass = str(tmp_path / "subs_jp.ass")
    res_jp = renderer.create_ass_subtitles(
        lyrics=sample_lyrics,
        clip_start=0.0,
        clip_duration=6.0,
        output_ass_path=jp_ass,
        subtitle_language="jp"
    )
    assert res_jp is True
    with open(jp_ass, "r", encoding="utf-8") as f:
        content_jp = f.read()
        assert "光るなら" in content_jp
        assert "君だよ君なんだよ" in content_jp
        assert "If it shines" not in content_jp
        assert "It's you, it's really you" not in content_jp
        # Dialogue events should be Japanese style only
        dialogue_lines = [l for l in content_jp.splitlines() if l.startswith("Dialogue:")]
        assert len(dialogue_lines) == 2
        for d in dialogue_lines:
            assert ",Japanese,," in d
            assert ",English,," not in d

    # 3. English Only
    en_ass = str(tmp_path / "subs_en.ass")
    res_en = renderer.create_ass_subtitles(
        lyrics=sample_lyrics,
        clip_start=0.0,
        clip_duration=6.0,
        output_ass_path=en_ass,
        subtitle_language="en"
    )
    assert res_en is True
    with open(en_ass, "r", encoding="utf-8") as f:
        content_en = f.read()
        assert "If it shines" in content_en
        assert "It's you, it's really you" in content_en
        assert "光るなら" not in content_en
        assert "君だよ君なんだよ" not in content_en
        dialogue_lines = [l for l in content_en.splitlines() if l.startswith("Dialogue:")]
        assert len(dialogue_lines) == 2
        for d in dialogue_lines:
            assert ",English,," in d
            assert ",Japanese,," not in d

def test_api_schema_subtitle_language():
    req = ExportRequest(
        source_video="dummy.mp4",
        series_text="DAY 1",
        song_name="Song",
        anime_name="Anime",
        day_number=1,
        caption="Caption",
        start_time=0.0,
        end_time=5.0,
        template={"name": "Cinematic"},
        subtitle_language="jp"
    )
    assert req.subtitle_language == "jp"
    
    # Aliased schema
    req2 = RenderReelRequest(
        source_video="dummy.mp4",
        series_text="DAY 1",
        song_name="Song",
        anime_name="Anime",
        day_number=1,
        caption="Caption",
        start_time=0.0,
        end_time=5.0,
        template={"name": "Cinematic"},
        subtitle_language="en"
    )
    assert req2.subtitle_language == "en"
