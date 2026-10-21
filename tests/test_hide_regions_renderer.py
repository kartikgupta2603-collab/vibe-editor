"""Source-only canvas cutouts reveal the existing background, including blur."""

import base64
import copy
import io
import json
import subprocess

import pytest
from PIL import Image

from app.video import renderer as renderer_module
from app.video.renderer import ReelRenderer, _validated_hide_regions, _visible_rounded_mask


REGION = {"x": 0.4, "y": 0.4, "width": 0.15, "height": 0.2}
OVERLAP = {"x": 0.5, "y": 0.45, "width": 0.15, "height": 0.2}


@pytest.mark.parametrize("invalid", [
    None, {}, "area", [REGION] * 13, [None], [{}],
    [{**REGION, "x": -0.1}], [{**REGION, "x": 1}],
    [{**REGION, "y": 1.1}], [{**REGION, "width": 0}],
    [{**REGION, "height": -0.1}], [{**REGION, "width": 1.1}],
    [{**REGION, "x": True}], [{**REGION, "height": "0.2"}],
    [{**REGION, "x": float("nan")}], [{**REGION, "height": float("inf")}],
    [REGION, {**REGION, "height": 0}],
])
def test_invalid_hide_regions_are_rejected_as_a_whole(invalid):
    with pytest.raises(ValueError, match="Hide area"):
        _validated_hide_regions(invalid)


def test_regions_clip_to_canvas_edges_without_mutating_project():
    saved = [{"x": 0.9, "y": 0.8, "width": 0.5, "height": 0.4}]
    original = copy.deepcopy(saved)
    validated = _validated_hide_regions(saved)
    assert validated[0]["width"] == pytest.approx(0.1)
    assert validated[0]["height"] == pytest.approx(0.2)
    assert saved == original
    assert _validated_hide_regions([]) == []
    assert len(_validated_hide_regions([REGION] * 12)) == 12


def test_cutouts_use_canvas_coordinates_and_preserve_rounded_inset_and_overlap():
    regions = _validated_hide_regions([
        {"x": 0.25, "y": 0.25, "width": 0.2, "height": 0.2},
        {"x": 0.35, "y": 0.35, "width": 0.2, "height": 0.2},
    ])
    mask = _visible_rounded_mask(300, 300, -50, -50, 200, 200, 20, 10, hide_regions=regions)
    assert mask.getpixel((60, 60))[3] == 0  # Existing inset/curved corner.
    assert mask.getpixel((110, 110))[3] == 0  # First translated cutout.
    assert mask.getpixel((150, 150))[3] == 0  # Overlapping second cutout.
    assert mask.getpixel((140, 110))[3] == 255  # Outside union, not its bounding box.
    assert mask.getpixel((200, 200))[3] == 255


def test_empty_regions_leave_existing_mask_pixels_identical():
    before = _visible_rounded_mask(400, 200, -10, 20, 300, 300, 30, 12, circular=True)
    after = _visible_rounded_mask(400, 200, -10, 20, 300, 300, 30, 12, circular=True, hide_regions=[])
    assert before.tobytes() == after.tobytes()


def _run(command):
    return subprocess.run(command, check=True, capture_output=True, timeout=90).stdout


def _frame(path, dimensions):
    raw = _run(["ffmpeg", "-v", "error", "-i", str(path), "-frames:v", "1",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    return Image.frombytes("RGB", dimensions, raw)


def _sample(image, x, y):
    return image.getpixel((round(image.width * x), round(image.height * y)))


@pytest.mark.parametrize("aspect,dimensions,background,color_filter", [
    (aspect, dimensions, background, "original")
    for aspect, dimensions in (("16:9", (1920, 1080)), ("1:1", (1080, 1080)), ("9:16", (2160, 3840)))
    for background in ("black", "white", "blur")
] + [("9:16", (2160, 3840), "blur", "intel_custom")])
def test_real_export_reveals_background_preserves_foreground_and_app_text(tmp_path, monkeypatch, aspect, dimensions, background, color_filter):
    source = tmp_path / "source.mp4"
    # Audio exercises the mask input's position without assuming an audio stream
    # index. Other renderer regressions cover the generated-silence path.
    _run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=320x180:r=30:d=0.04",
          "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=0.04",
          "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(source)])
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    renderer = ReelRenderer()
    template = {
        "background": {"type": background, "brightness": -0.2},
        "video": {"scale": 1, "vertical_offset": 0, "border_shape": "straight"},
        "series_text": {"enabled": False},
    }
    background_output = tmp_path / "background.mp4"
    renderer.render_reel(
        str(source), str(background_output), 0, 1 / 30, "", "", "", "",
        {**copy.deepcopy(template), "hide_regions": [{"x": 0, "y": 0, "width": 1, "height": 1}]},
        aspect_ratio=aspect, show_lyrics=False, smart_loop=False, color_filter=color_filter, filter_intensity=300,
    )
    actual_background = _frame(background_output, dimensions)

    overlay = Image.new("RGBA", dimensions, (0, 0, 0, 0))
    width, height = dimensions
    overlay.paste((255, 0, 0, 255), (round(width * 0.53), round(height * 0.48), round(width * 0.57), round(height * 0.52)))
    encoded = io.BytesIO()
    overlay.save(encoded, "PNG")
    template["studio_text_overlay"] = "data:image/png;base64," + base64.b64encode(encoded.getvalue()).decode("ascii")
    template["hide_regions"] = [REGION, OVERLAP]
    output = tmp_path / "hidden.mp4"
    renderer.render_reel(
        str(source), str(output), 0, 1 / 30, "", "", "", "", template,
        aspect_ratio=aspect, show_lyrics=False, smart_loop=False, color_filter=color_filter, filter_intensity=300,
    )
    image = _frame(output, dimensions)
    for x, y in ((0.45, 0.5), (0.60, 0.55), (0.52, 0.55)):
        hidden, expected = _sample(image, x, y), _sample(actual_background, x, y)
        assert max(abs(a - b) for a, b in zip(hidden, expected)) <= 5, (aspect, background, hidden, expected)
    red, green, blue = _sample(image, 0.55, 0.5)
    assert red > 200 and green < 40 and blue < 40  # App overlay remains above the hole.
    red, green, blue = _sample(image, 0.75, 0.5)
    assert blue > 230 and red < 40 and green < 40  # Unselected source remains visible.
    streams = json.loads(_run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)]))["streams"]
    video = next(stream for stream in streams if stream["codec_type"] == "video")
    assert video["avg_frame_rate"] == "30/1"
    assert any(stream["codec_type"] == "audio" for stream in streams)
