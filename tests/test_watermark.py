import sys
import glob
from pathlib import Path
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.video.renderer import ReelRenderer

client = TestClient(app)

def test_watermark_overlay_creation():
    renderer = ReelRenderer()
    out_overlay = str(BASE_DIR / "temp" / "test_watermark_overlay.png")
    
    res = renderer.create_text_overlay_image(
        canvas_width=1080,
        canvas_height=1920,
        series_text="DAY 1 OF 365",
        song_name="TEST SONG",
        anime_name="TEST ANIME",
        caption="",
        template={
            "name": "cinematic",
            "background": {"type": "blur"},
            "video": {"scale": 1.0, "curved_border": True, "corner_radius": 16}
        },
        output_png_path=out_overlay,
        watermark={
            "enabled": True,
            "text": "@animecreator",
            "x": 140,
            "y": 90,
            "size": 28
        }
    )

    assert Path(res).exists()
    assert Path(res).stat().st_size > 0
    try:
        Path(res).unlink()
    except Exception:
        pass


def test_watermark_api_payload_validation():
    # Test that /api/export endpoint accepts watermark schema without 422 validation error
    payload = {
        "source_video": "dummy.mp4",
        "start_time": 0.0,
        "end_time": 10.0,
        "series_text": "DAY 1",
        "song_name": "SONG",
        "anime_name": "ANIME",
        "day_number": 1,
        "caption": "CAPTION",
        "template": {"name": "cinematic"},
        "aspect_ratio": "9:16",
        "watermark": {
            "enabled": True,
            "text": "@mychannel",
            "x": 140,
            "y": 90,
            "size": 28
        }
    }
    # Should validate the payload structure (it may fail with 500/task execution later because dummy.mp4 doesn't exist, but NOT 422 validation error)
    res = client.post("/api/export", json=payload)
    assert res.status_code != 422


def test_render_reel_with_watermark():
    komi_files = glob.glob(str(BASE_DIR / "downloads" / "Komi*"))
    if not komi_files:
        pytest.skip("Komi video file not found in downloads")

    komi_path = komi_files[0]
    renderer = ReelRenderer()
    out_path = str(BASE_DIR / "temp" / "test_watermark_reel_export.mp4")

    res = renderer.render_reel(
        source_video=komi_path,
        output_mp4=out_path,
        start_time=0.0,
        end_time=1.5,
        aspect_ratio="9:16",
        series_text="DAY 1 OF 365",
        song_name="CINDERELLA",
        anime_name="Komi Can't Communicate",
        caption="",
        template={
            "name": "cinematic",
            "background": {"type": "blur", "blur": 30, "brightness": -0.2},
            "video": {"scale": 1.0, "curved_border": True, "corner_radius": 16}
        },
        watermark={
            "enabled": True,
            "text": "@animereels",
            "x": 140,
            "y": 90,
            "size": 28
        }
    )

    assert Path(res).exists()
    assert Path(res).stat().st_size > 0
    try:
        Path(res).unlink()
    except Exception:
        pass
