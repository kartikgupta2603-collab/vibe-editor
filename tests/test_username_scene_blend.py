"""Browser username alpha is preserved and blended identically during export."""
import base64
import io
import subprocess

import pytest
from PIL import Image, ImageDraw

from app.video import renderer as renderer_module


def png_data(image):
    output = io.BytesIO()
    image.save(output, "PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


@pytest.fixture
def source(tmp_path):
    image = Image.new("RGB", (1920, 1080), (32, 64, 96))
    ImageDraw.Draw(image).rectangle((960, 0, 1919, 1079), fill=(160, 192, 224))
    picture = tmp_path / "source.png"
    image.save(picture)
    video = tmp_path / "source.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-loop", "1", "-i", str(picture), "-t", "0.1",
        "-r", "30", "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", str(video),
    ], check=True, capture_output=True, timeout=30)
    return video


def render(source, output, template, *, style="scene_blend", aspect="16:9"):
    return renderer_module.ReelRenderer().render_reel(
        str(source), str(output), 0, 0.1, "", "", "", "", template,
        aspect_ratio=aspect, show_lyrics=False,
        watermark={"enabled": True, "style": style, "font": "segoe", "text": "@Creator",
                   "size": 40, "x": 50, "y": 50},
    )


@pytest.mark.parametrize("mask", ["invalid", "data:image/png;base64,!!", png_data(Image.new("RGBA", (1080, 1920)))])
def test_invalid_browser_username_mask_is_rejected_before_export(source, tmp_path, mask):
    with pytest.raises(ValueError, match="Studio Scene Blend username mask"):
        render(source, tmp_path / "invalid.mp4", {"studio_username_scene_mask": mask}, aspect="9:16")


def test_browser_username_mask_accepts_full_4k_alpha_coverage():
    image = Image.new("RGBA", (2160, 3840), (255, 0, 0, 0))
    image.putpixel((75, 100), (0, 0, 0, 123))
    decoded = renderer_module._decode_studio_png(
        png_data(image), 2160, 3840, "Studio Scene Blend username mask",
    ).getchannel("A")
    assert decoded.getpixel((75, 100)) == 123
    assert decoded.getpixel((100, 75)) == 0


def test_real_export_uses_browser_alpha_and_matches_canvas_overlay(source, tmp_path, monkeypatch):
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    monkeypatch.setattr(renderer_module, "_scene_username_mask",
                        lambda *args: pytest.fail("Browser mask must replace native glyph drawing"))
    mask = Image.new("RGBA", (1920, 1080), (255, 255, 255, 0))
    draw = ImageDraw.Draw(mask)
    for offset in (0, 960):
        # Alpha controls glyph strength; black/red mask RGB must not affect it.
        draw.rectangle((offset, 0, offset + 299, 1079), fill=(0, 0, 0, 255))
        draw.rectangle((offset + 300, 0, offset + 599, 1079), fill=(255, 0, 0, 128))
    output = tmp_path / "blended.mp4"
    render(source, output, {"background": {"type": "black"}, "video": {"scale": 1.0},
                            "studio_username_scene_mask": png_data(mask)})
    frame = tmp_path / "blended.png"
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1", "-update", "1", str(frame)],
                   check=True, capture_output=True, timeout=30)
    with Image.open(frame) as image:
        image = image.convert("RGB")
        for offset in (0, 960):
            base = image.getpixel((offset + 800, 700))
            for x, alpha in ((150, 1.0), (450, 128 / 255)):
                actual = image.getpixel((offset + x, 700))
                expected = tuple(round(channel + .70 * alpha * (min(2 * channel, 255) - channel)) for channel in base)
                assert actual == pytest.approx(expected, abs=3), (base, actual, expected)


def test_clean_username_does_not_apply_scene_mask(source, tmp_path, monkeypatch):
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    monkeypatch.setattr(renderer_module, "_scene_username_filter",
                        lambda *args: pytest.fail("Clean usernames must not use Scene Blend"))
    # A stale Scene Blend mask in an older state is ignored for clean style.
    render(source, tmp_path / "clean.mp4", {"studio_username_scene_mask": "invalid"}, style="clean")


@pytest.mark.parametrize("template", [{}, {"studio_username_scene_mask": None}])
def test_missing_or_null_browser_mask_keeps_native_scene_fallback(source, tmp_path, monkeypatch, template):
    calls = []

    def native_mask(width, height, config):
        calls.append((width, height, config["font"]))
        return Image.new("L", (width, height), 0)

    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    monkeypatch.setattr(renderer_module, "_scene_username_mask", native_mask)
    render(source, tmp_path / "native-fallback.mp4", template)
    assert calls == [(1920, 1080, "segoe")]
