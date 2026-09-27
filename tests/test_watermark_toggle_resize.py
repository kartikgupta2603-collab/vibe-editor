import re
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.video.renderer import ReelRenderer

def test_javascript_watermark_logic():
    js_path = Path("app/static/app.js")
    js = js_path.read_text(encoding="utf-8")

    # 1. Verify text measurement occurs BEFORE ctx.restore() in watermark draw
    # Pattern: measureText followed by restore() within watermark block
    wm_block = re.search(r"// 6b\. USERNAME WATERMARK.*?(?=// 6c\. CREATOR AVATAR)", js, re.DOTALL)
    assert wm_block, "Could not find watermark block in app.js"
    wm_code = wm_block.group(0)
    measure_pos = wm_code.find("ctx.measureText(wmText)")
    restore_pos = wm_code.find("ctx.restore()")
    assert measure_pos != -1, "measureText(wmText) not found in watermark block"
    assert restore_pos != -1, "ctx.restore() not found in watermark block"
    assert measure_pos < restore_pos, "measureText MUST run before ctx.restore() to use wmFont"
    print("[OK] Verified text measurement runs before ctx.restore() with accurate font!")

    # 2. Verify handlePointerMove and handlePointerUp call renderReel()
    move_block = re.search(r"const handlePointerMove = \(e\) => \{.*?(?=const handlePointerUp)", js, re.DOTALL)
    assert move_block, "Could not find handlePointerMove in app.js"
    assert "renderReel();" in move_block.group(0), "handlePointerMove must call renderReel() for live drag/resize"
    
    up_block = re.search(r"const handlePointerUp = \(\) => \{.*?(?=canvas\.addEventListener)", js, re.DOTALL)
    assert up_block, "Could not find handlePointerUp in app.js"
    assert "renderReel();" in up_block.group(0), "handlePointerUp must call renderReel()"
    print("[OK] Verified live renderReel() repainting on canvas drag and resize!")

    # 3. Verify selectTextElement does NOT force auto-enable
    select_block = re.search(r"function selectTextElement\(elemKey\) \{.*?(?=const elem = state\.textElements)", js, re.DOTALL)
    assert select_block, "Could not find selectTextElement in app.js"
    assert "state.watermark.enabled = true" not in select_block.group(0), "selectTextElement must NOT force-enable watermark"
    assert "state.creatorBadge.enabled = true" not in select_block.group(0), "selectTextElement must NOT force-enable creatorBadge"
    print("[OK] Verified selectTextElement does not hijack or force-enable toggles!")

    # 4. Verify sliderTextSize handles auto-enabling if hidden and repaints
    slider_block = re.search(r"if \(el\.sliderTextSize\) \{.*?(?=if \(el\.sliderTextY\))", js, re.DOTALL)
    assert slider_block, "Could not find sliderTextSize block in app.js"
    assert "renderReel();" in slider_block.group(0), "sliderTextSize must call renderReel()"
    print("[OK] Verified sliderTextSize calls renderReel() and updates sizes!")

def test_renderer_sizes():
    renderer = ReelRenderer()
    temp_dir = Path("temp")
    temp_dir.mkdir(exist_ok=True)
    
    template = {
        "video": {"video_width": 1920, "video_height": 1080},
        "background": {"type": "blur"}
    }
    
    for size in [16, 28, 54, 80]:
        out_png = temp_dir / f"test_overlay_size_{size}.png"
        wm_cfg = {
            "enabled": True,
            "text": "lap_lac7",
            "x": 60,
            "y": 70,
            "size": size,
            "color": "#ffffff"
        }
        res = renderer.create_text_overlay_image(
            canvas_width=1080,
            canvas_height=1920,
            series_text="Testing Watermark Sizing",
            song_name="",
            anime_name="",
            caption="",
            template=template,
            output_png_path=str(out_png),
            watermark=wm_cfg,
            bg_type="blur"
        )
        assert Path(res).exists() and Path(res).stat().st_size > 0
        print(f"[OK] Rendered watermark size {size}px: {res} ({Path(res).stat().st_size} bytes)")

if __name__ == "__main__":
    test_javascript_watermark_logic()
    test_renderer_sizes()
    print("ALL TESTS PASSED COMPLETELY!")
