import pytest
from app.video.renderer import ReelRenderer
from app.main import ExportRequest

def test_default_filter_is_empty():
    res = ReelRenderer.build_color_grading_filter("original", 100.0, None)
    assert res == "", f"Expected empty grading string for original, got '{res}'"

def test_moon_bw_filter():
    res = ReelRenderer.build_color_grading_filter("moon", 100.0, None)
    assert "saturation=0.0" in res, f"Expected B&W saturation=0.0 in '{res}'"
    assert "contrast=" in res, f"Expected contrast adjustment in '{res}'"

def test_presets_generate_filters():
    presets = [
        "clarendon", "crema", "gingham", "juno", "lark", "ludwig",
        "perpetua", "reyes", "slumber", "aden", "anime_vivid", "cyberpunk"
    ]
    for preset in presets:
        res = ReelRenderer.build_color_grading_filter(preset, 100.0, None)
        assert res.startswith(","), f"Filter {preset} should start with a comma separator, got '{res}'"
        assert len(res) > 3, f"Filter {preset} generated empty result"

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
    assert "colorbalance=" in res
    assert "vignette=angle=" in res

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
    test_presets_generate_filters()
    test_adjustments_warmth_and_vignette()
    test_export_request_model()
    print("ALL TESTS PASSED SUCCESSFULLY!")
