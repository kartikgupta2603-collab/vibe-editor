import sys
import glob
from pathlib import Path
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.video.probe import probe_video, detect_letterbox_crop
from app.video.renderer import ReelRenderer


def test_letterbox_detection_komi():
    komi_files = glob.glob(str(BASE_DIR / "downloads" / "Komi*"))
    if not komi_files:
        pytest.skip("Komi video file not found in downloads")
    
    komi_path = komi_files[0]
    info = probe_video(komi_path)
    data = info.to_dict()

    assert data["width"] == 1920
    assert data["height"] == 1080
    assert data["has_letterbox"] is False
    assert data["crop_w"] == 1920
    assert data["crop_h"] == 1080
    assert data["crop_y"] == 0


def test_no_letterbox_zoo():
    zoo_path = BASE_DIR / "downloads" / "Me at the zoo.mp4"
    if not zoo_path.exists():
        pytest.skip("Zoo video file not found in downloads")

    info = probe_video(str(zoo_path))
    data = info.to_dict()

    assert data["width"] == 320
    assert data["height"] == 240
    assert data["has_letterbox"] is False
    assert data["crop_w"] == 320
    assert data["crop_h"] == 240


def test_render_with_letterbox():
    komi_files = glob.glob(str(BASE_DIR / "downloads" / "Komi*"))
    if not komi_files:
        pytest.skip("Komi video file not found in downloads")

    komi_path = komi_files[0]
    renderer = ReelRenderer()
    out_path = str(BASE_DIR / "temp" / "test_komi_crop_export.mp4")

    res = renderer.render_reel(
        source_video=komi_path,
        output_mp4=out_path,
        start_time=0.0,
        end_time=2.0,
        aspect_ratio="9:16",
        series_text="DAY 1 OF 365",
        song_name="CINDERELLA",
        anime_name="Komi Can't Communicate",
        caption="",
        template={
            "name": "cinematic",
            "background": {"type": "blur", "blur": 30, "brightness": -0.2},
            "video": {"scale": 1.0, "curved_border": True, "corner_radius": 16}
        }
    )

    assert Path(res).exists()
    assert Path(res).stat().st_size > 0
    # Clean up test output
    try:
        Path(res).unlink()
    except Exception:
        pass
