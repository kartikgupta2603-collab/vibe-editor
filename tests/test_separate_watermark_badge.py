import os
import sys
import re
import collections
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.video.renderer import ReelRenderer

def test_html_ids():
    html_path = Path("app/static/index.html")
    content = html_path.read_text(encoding="utf-8")
    ids = re.findall(r'id="([^"]+)"', content)
    counts = collections.Counter(ids)
    
    expected_ids = [
        "check-watermark",
        "input-watermark-text",
        "watermark-input-group",
        "check-creator-badge",
        "input-creator-tag",
        "creator-badge-input-group",
        "check-elem-visible"
    ]
    for eid in expected_ids:
        assert counts[eid] == 1, f"Expected 1 of {eid}, found {counts[eid]}"
    print("[OK] HTML IDs verified uniquely present!")

def test_renderer_overlay():
    renderer = ReelRenderer()
    temp_dir = Path("temp")
    temp_dir.mkdir(exist_ok=True)
    out_png = temp_dir / "test_overlay_separate.png"
    
    # Test rendering with BOTH watermark and creator_badge active and separate
    template = {
        "video": {"video_width": 1920, "video_height": 1080},
        "background": {"type": "blur"}
    }
    
    watermark_cfg = {
        "enabled": True,
        "text": "@animesongs",
        "x": 80,
        "y": 100,
        "size": 28,
        "color": "#ffffff"
    }
    
    creator_badge_cfg = {
        "enabled": True,
        "text": "@Lap_Lac7",
        "x": 540,
        "y": 160,
        "size": 32,
        "color": "#ffffff"
    }
    
    result = renderer.create_text_overlay_image(
        canvas_width=1080,
        canvas_height=1920,
        series_text="POV: Testing separate watermark and badge",
        song_name="",
        anime_name="",
        caption="",
        template=template,
        output_png_path=str(out_png),
        watermark=watermark_cfg,
        creator_badge=creator_badge_cfg,
        bg_type="blur"
    )
    
    assert Path(result).exists(), "Output overlay png was not created!"
    assert Path(result).stat().st_size > 0, "Output overlay png is empty!"
    print(f"[OK] Overlay successfully created: {result} ({Path(result).stat().st_size} bytes)")

if __name__ == "__main__":
    test_html_ids()
    test_renderer_overlay()
    print("ALL TESTS PASSED!")
