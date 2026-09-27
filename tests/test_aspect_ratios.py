import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.video.probe import probe_video
from app.video.renderer import renderer
from app.video.preview import render_preview_still
from app.templates.template_manager import template_manager
from PIL import Image

def test_16_9_rendering():
    print("Testing 16:9 Landscape Rendering...")
    src = str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4")
    out = str(BASE_DIR / "exports" / "test_16_9_landscape.mp4")
    tpl = template_manager.get_template("cinematic")

    rendered = renderer.render_reel(
        source_video=src,
        output_mp4=out,
        start_time=1.0,
        end_time=3.0,
        series_text="DAY 1 OF POSTING\nTHE BEST ANIME SONGS",
        song_name="KICK BACK",
        anime_name="Chainsaw Man",
        caption="Desktop 16:9 widescreen format",
        template=tpl,
        aspect_ratio="16:9"
    )
    assert Path(rendered).exists(), "16:9 export does not exist"
    info = probe_video(rendered)
    print(f"  16:9 Exported resolution: {info.width}x{info.height}")
    assert info.width == 1920 and info.height == 1080, f"Expected 1920x1080, got {info.width}x{info.height}"
    print("  16:9 Landscape export OK!")

def test_1_1_rendering():
    print("Testing 1:1 Square Rendering...")
    src = str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4")
    out = str(BASE_DIR / "exports" / "test_1_1_square.mp4")
    tpl = template_manager.get_template("cinematic")

    rendered = renderer.render_reel(
        source_video=src,
        output_mp4=out,
        start_time=1.0,
        end_time=3.0,
        series_text="DAY 1 OF POSTING\nTHE BEST ANIME SONGS",
        song_name="KICK BACK",
        anime_name="Chainsaw Man",
        caption="Square 1:1 format",
        template=tpl,
        aspect_ratio="1:1"
    )
    assert Path(rendered).exists(), "1:1 export does not exist"
    info = probe_video(rendered)
    print(f"  1:1 Exported resolution: {info.width}x{info.height}")
    assert info.width == 1080 and info.height == 1080, f"Expected 1080x1080, got {info.width}x{info.height}"
    print("  1:1 Square export OK!")

def test_16_9_preview_still():
    print("Testing 16:9 Preview Still...")
    src = str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4")
    out = str(BASE_DIR / "temp" / "test_preview_16_9.jpg")
    tpl = template_manager.get_template("cinematic")

    rendered = render_preview_still(
        source_video=src,
        timestamp=1.5,
        series_text="DAY 1 OF POSTING",
        song_name="KICK BACK",
        anime_name="Chainsaw Man",
        caption="Still Preview",
        template=tpl,
        output_image_path=out,
        aspect_ratio="16:9"
    )
    assert Path(rendered).exists(), "Preview still does not exist"
    with Image.open(rendered) as img:
        print(f"  Preview still size: {img.width}x{img.height}")
        assert img.width == 1920 and img.height == 1080
    print("  16:9 Preview still OK!")

if __name__ == "__main__":
    test_16_9_rendering()
    test_1_1_rendering()
    test_16_9_preview_still()
    print("\n=== ALL ASPECT RATIO TESTS PASSED SUCCESSFULLY! ===")
