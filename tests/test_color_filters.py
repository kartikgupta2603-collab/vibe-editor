import pytest
import subprocess
from app.video.renderer import ReelRenderer
from app.main import ExportRequest

def test_default_filter_is_empty():
    res = ReelRenderer.build_color_grading_filter("original", 100.0, None)
    assert res == "", f"Expected empty grading string for original, got '{res}'"

def test_moon_bw_filter():
    res = ReelRenderer.build_color_grading_filter("moon", 100.0, None)
    assert "saturation=0.0" in res, f"Expected B&W saturation=0.0 in '{res}'"
    assert "contrast=" in res, f"Expected contrast adjustment in '{res}'"

def test_cyberpunk_export_uses_preview_hue_without_rgb_tint():
    res = ReelRenderer.build_color_grading_filter("cyberpunk", 100.0, None)
    assert "colorchannelmixer=" in res
    assert "hue=h=" not in res
    assert "colorbalance=" not in res

def test_sepia_presets_use_the_css_sepia_equivalent():
    res = ReelRenderer.build_color_grading_filter("crema", 100.0, None)
    assert "colorchannelmixer=" in res
    assert res.count("colorchannelmixer=") == 2

def test_presets_generate_filters():
    presets = [
        "clarendon", "crema", "gingham", "juno", "lark", "ludwig",
        "perpetua", "reyes", "slumber", "aden", "anime_vivid", "cyberpunk"
    ]
    for preset in presets:
        res = ReelRenderer.build_color_grading_filter(preset, 100.0, None)
        assert res.startswith(","), f"Filter {preset} should start with a comma separator, got '{res}'"
        assert len(res) > 3, f"Filter {preset} generated empty result"
        assert "colorbalance=" not in res, f"Filter {preset} must match the preview without an export-only RGB tint"

def test_adjustments_warmth_and_vignette():
    adj = {
        "brightness": 10,
        "contrast": 120,
        "saturation": 110,
        "warmth": 25,
        "vignette": 50
    }
    res = ReelRenderer.build_color_grading_filter("original", 100.0, adj)
    assert "eq=" in res
    assert "colorchannelmixer=" in res
    assert "hue=h=" not in res
    assert "vignette=angle=" in res


@pytest.mark.parametrize("intensity,contrast,saturation,brightness", [
    (200, 1.4, 1.5, 0.1), (400, 1.8, 2.0, 0.2),
])
def test_filter_strength_above_one_is_exported(intensity, contrast, saturation, brightness):
    res = ReelRenderer.build_color_grading_filter("clarendon", intensity)
    assert f"contrast={contrast}" in res
    assert f"saturation={saturation}" in res
    assert f"brightness={brightness}" in res
    assert res != ReelRenderer.build_color_grading_filter("clarendon", 100)


def test_filter_strength_has_four_times_upper_limit():
    assert ReelRenderer.build_color_grading_filter("clarendon", 800) == ReelRenderer.build_color_grading_filter("clarendon", 400)


@pytest.mark.parametrize("preset", ["original", "clarendon", "moon", "aden", "anime_vivid", "cyberpunk"])
def test_visible_filters_accept_four_times_strength_in_ffmpeg(preset):
    grading = ReelRenderer.build_color_grading_filter(preset, 400)
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=32x32:duration=0.04",
        "-vf", "null" + grading, "-frames:v", "1", "-f", "null", "-",
    ], check=True, capture_output=True, timeout=15)

def test_export_request_model():
    req_data = {
        "source_video": "dummy.mp4",
        "start_time": 0.0,
        "end_time": 15.0,
        "series_text": "DAY 1",
        "song_name": "Test Song",
        "anime_name": "Test Anime",
        "day_number": 1,
        "caption": "Reel Caption",
        "template": {"name": "cinematic"},
        "color_filter": "anime_vivid",
        "filter_intensity": 80.0,
        "color_adjustments": {
            "brightness": 5,
            "contrast": 110,
            "saturation": 120,
            "warmth": 10,
            "vignette": 30
        }
    }
    req = ExportRequest(**req_data)
    assert req.color_filter == "anime_vivid"
    assert req.filter_intensity == 80.0
    assert req.color_adjustments["vignette"] == 30

if __name__ == "__main__":
    test_default_filter_is_empty()
    test_moon_bw_filter()
    test_cyberpunk_export_uses_preview_hue_without_rgb_tint()
    test_sepia_presets_use_the_css_sepia_equivalent()
    test_presets_generate_filters()
    test_adjustments_warmth_and_vignette()
    test_export_request_model()
    print("ALL TESTS PASSED SUCCESSFULLY!")
