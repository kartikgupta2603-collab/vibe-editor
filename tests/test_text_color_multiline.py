import sys
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.video.renderer import renderer
from app.templates.template_manager import template_manager

def test_text_overlay_multiline_and_colors():
    temp_dir = BASE_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    out_png = str(temp_dir / "test_multiline_color_overlay.png")

    tpl = template_manager.get_template("clean")
    tpl["series_text"] = {"x": 540, "y": 200, "size": 40, "color": "#ff0055"}
    tpl["song_title"] = {"x": 540, "y": 1300, "size": 50, "color": "#00ffff"}
    tpl["anime_name"] = {"x": 540, "y": 1450, "size": 32, "color": "#ffaa00"}

    watermark = {
        "enabled": True,
        "text": "@test_creator",
        "size": 26,
        "x": 60,
        "y": 60,
        "color": "#a855f7"
    }

    result = renderer.create_text_overlay_image(
        canvas_width=1080,
        canvas_height=1920,
        series_text="LINE 1 OF HEADER\nLINE 2 OF HEADER",
        song_name="MULTILINE SONG\nPART TWO",
        anime_name="ANIME NAME LINE 1\nANIME NAME LINE 2",
        caption="",
        template=tpl,
        output_png_path=out_png,
        watermark=watermark
    )

    assert Path(result).exists(), "Overlay PNG was not created"
    img = Image.open(result)
    assert img.size == (1080, 1920), f"Expected 1080x1920, got {img.size}"

def test_ass_subtitles_custom_color():
    temp_dir = BASE_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    out_ass = str(temp_dir / "test_custom_color_subtitles.ass")

    dummy_lyrics = [
        {"start": 1.0, "end": 3.0, "text": "Hello world", "translation": "Konnichiwa"}
    ]

    # Test with custom yellow color #ffff00 -> in ASS BGR format: &H0000FFFF
    success = renderer.create_ass_subtitles(
        lyrics=dummy_lyrics,
        clip_start=0.0,
        clip_duration=5.0,
        output_ass_path=out_ass,
        style_preset="bold_lyrics",
        subtitle_color="#ffff00"
    )

    assert success is True
    ass_content = Path(out_ass).read_text(encoding="utf-8")
    assert "&H0000FFFF" in ass_content, "Custom subtitle primary color was not found in ASS file"

def test_ass_subtitles_english_color_and_overlap_prevention():
    temp_dir = BASE_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    out_ass = str(temp_dir / "test_dual_color_and_overlap.ass")

    # Multi-line English subtitle and Japanese subtitle
    dummy_lyrics = [
        {
            "start": 1.0,
            "end": 4.0,
            "text_jp": "夢は安泰な暮らしたが\n刺激不足ゆえにタラタラ",
            "text_en": "My dream was a peaceful life,\nbut lacking excitement, I dilly-dally"
        }
    ]

    # Japanese and English both receive identical color (black #000000 -> &H00000000 on white background)
    success = renderer.create_ass_subtitles(
        lyrics=dummy_lyrics,
        clip_start=0.0,
        clip_duration=5.0,
        output_ass_path=out_ass,
        style_preset="minimal",
        subtitle_color="#000000",
        bg_type="white"
    )

    assert success is True
    ass_content = Path(out_ass).read_text(encoding="utf-8")
    # Japanese style has &H00000000
    assert "Style: Japanese,Yu Gothic,36,&H00000000" in ass_content
    # English style has &H00000000 (exact same color as Japanese)
    assert "Style: English,Segoe UI,24,&H00000000" in ass_content
    # English has 2 lines (due to \N), so Japanese vertical margin is raised above 240 (e.g. 195 + 2*36 + 16 = 283)
    assert ",0,0,283,," in ass_content, "Japanese dialogue was not lifted up to prevent multi-line English collision"

def test_ass_subtitles_english_inherits_primary_color():
    temp_dir = BASE_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    out_ass = str(temp_dir / "test_inherit_color.ass")

    dummy_lyrics = [
        {"start": 1.0, "end": 3.0, "text_jp": "日本語", "text_en": "English"}
    ]

    # When only subtitle_color is specified, English inherits it
    success = renderer.create_ass_subtitles(
        lyrics=dummy_lyrics,
        clip_start=0.0,
        clip_duration=5.0,
        output_ass_path=out_ass,
        style_preset="anime",
        subtitle_color="#38bdf8"  # cyan -> &H00F8BD38
    )

    assert success is True
    ass_content = Path(out_ass).read_text(encoding="utf-8")
    assert "Style: Japanese,Yu Gothic,39,&H00F8BD38" in ass_content
    assert "Style: English,Segoe UI,26,&H00F8BD38" in ass_content

def test_ass_subtitles_automatic_color_adaptation():
    temp_dir = BASE_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    out_ass_white = str(temp_dir / "test_adapt_white.ass")
    out_ass_blur = str(temp_dir / "test_adapt_blur.ass")

    dummy_lyrics = [
        {"start": 1.0, "end": 3.0, "text_jp": "テスト", "text_en": "Test"}
    ]

    # White bg adapts #ffffff to dark slate &H002A170F
    renderer.create_ass_subtitles(
        lyrics=dummy_lyrics,
        clip_start=0.0,
        clip_duration=5.0,
        output_ass_path=out_ass_white,
        style_preset="minimal",
        subtitle_color="#ffffff",
        bg_type="white"
    )
    content_white = Path(out_ass_white).read_text(encoding="utf-8")
    assert "&H002A170F" in content_white

    # Dark/blur bg adapts #000000 to white &H00FFFFFF
    renderer.create_ass_subtitles(
        lyrics=dummy_lyrics,
        clip_start=0.0,
        clip_duration=5.0,
        output_ass_path=out_ass_blur,
        style_preset="minimal",
        subtitle_color="#000000",
        bg_type="blur"
    )
    content_blur = Path(out_ass_blur).read_text(encoding="utf-8")
    assert "&H00FFFFFF" in content_blur
