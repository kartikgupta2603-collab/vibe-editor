import subprocess

import pytest
from PIL import Image

from app.video import renderer as renderer_module
from app.video.preview import render_preview_still
from app.video.renderer import ReelRenderer, _contain_geometry


@pytest.mark.parametrize("source", [(1920, 1080), (1000, 1000), (1080, 1920), (400, 1200), (662, 2000)])
def test_full_source_fits_centered_and_4k_matches_studio(source):
    width, height, x, y = _contain_geometry(*source)
    assert width <= 1080 and height <= 1920
    assert x == (1080 - width) / 2
    assert y == (1920 - height) / 2
    assert _contain_geometry(*source, 2160, 3840) == tuple(v * 2 for v in (width, height, x, y))
    assert abs(width / height - source[0] / source[1]) <= 0.002


def test_manual_zoom_and_offset_are_preserved_after_base_fit():
    width, height, x, y = _contain_geometry(400, 1200, scale=1.2, vertical_offset=25)
    assert (width, height) == (768, 2304)
    assert (x, y) == (156, -167)
    assert _contain_geometry(400, 1200, 2160, 3840, 1.2, 50) == (1536, 4608, 312, -334)


@pytest.mark.parametrize("source_size", [(320, 180), (240, 240), (180, 320), (120, 360)])
def test_real_preview_and_4k_export_have_matching_centered_full_frame(tmp_path, monkeypatch, source_size):
    source = tmp_path / "source.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
        f"color=white:s={source_size[0]}x{source_size[1]}:r=30:d=0.1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    template = {"background": {"type": "black"}, "video": {"border_shape": "straight"},
                "series_text": {"enabled": False}, "song_name": {"enabled": False},
                "anime_name": {"enabled": False}, "caption": {"enabled": False}}
    preview = tmp_path / "preview.png"
    render_preview_still(str(source), 0, "", "", "", "", template, str(preview))
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    export = tmp_path / "export.mp4"
    ReelRenderer().render_reel(
        str(source), str(export), 0, 0.1, "", "", "", "", template,
        show_lyrics=False, smart_loop=False,
    )
    exported_frame = tmp_path / "export.png"
    subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(export), "-frames:v", "1", str(exported_frame),
    ], check=True, capture_output=True, timeout=30)
    expected_w, expected_h, expected_x, expected_y = _contain_geometry(*source_size)
    expected = (expected_x, expected_y, expected_x + expected_w, expected_y + expected_h)
    for image_path, factor in ((preview, 1), (exported_frame, 2)):
        with Image.open(image_path) as frame:
            assert frame.size == (1080 * factor, 1920 * factor)
            bounds = frame.convert("L").point(lambda p: 255 if p > 150 else 0).getbbox()
        assert all(abs(actual - wanted * factor) <= 1 for actual, wanted in zip(bounds, expected))
