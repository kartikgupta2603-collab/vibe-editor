"""Decoded pixels, rather than filter-string claims, for the Custom RGB look."""

import json
import math
import subprocess
import base64
import io

import pytest
from PIL import Image

from app.video.color_profiles import custom_rgb_profile, saturation_filter
from app.video.renderer import ReelRenderer
import app.video.renderer as renderer_module


PALETTE = [(16, 16, 16), (64, 64, 64), (128, 128, 128), (220, 220, 220),
           (180, 70, 45), (60, 180, 85), (40, 90, 200), (240, 20, 90)]


def _run(command):
    return subprocess.run(command, check=True, capture_output=True, timeout=90).stdout


def _palette(path):
    image = Image.new("RGB", (256, 32))
    for index, color in enumerate(PALETTE):
        image.paste(color, (index * 32, 0, (index + 1) * 32, 32))
    image.save(path)


def _expected(rgb, strength):
    profile = custom_rgb_profile()
    corrected = [max(0, min(255, math.floor(
        value * (1 + (slope - 1) * strength) + offset * 255 * strength + 0.5
    ))) for value, slope, offset in zip(rgb, profile["rgb_slope"], profile["rgb_offset"])]
    amount = 1 + (profile["saturation"] - 1) * strength
    luminance = sum(value * weight for value, weight in zip(corrected, (0.213, 0.715, 0.072)))
    return [max(0, min(255, round(luminance + amount * (value - luminance)))) for value in corrected]


def _clip_round(value):
    return max(0, min(255, math.floor(value + 0.5)))


def _matrix_pixels(rgb, rows):
    return [_clip_round(sum(value * coefficient for value, coefficient in zip(rgb, row))) for row in rows]


def _expected_manual(rgb, strength):
    # Independent analytical evaluation of the visible manual controls, in the
    # same order as CSS: brightness, contrast, saturation, sepia, then hue.
    rgb = [_clip_round(value * 1.1) for value in rgb]
    rgb = [_clip_round(value * 1.2 - 0.1 * 255) for value in rgb]
    rgb = _matrix_pixels(rgb, [
        [weight * (1 - 1.1) + (1.1 if row == column else 0)
         for column, weight in enumerate((0.213, 0.715, 0.072))] for row in range(3)
    ])
    sepia = 25 / 100 * 0.25
    rgb = _matrix_pixels(rgb, [
        [(1 - sepia if row == column else 0) + value * sepia
         for column, value in enumerate(values)] for row, values in enumerate([
            [0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131],
        ])
    ])
    cosine, sine = math.cos(math.radians(-3.75)), math.sin(math.radians(-3.75))
    rgb = _matrix_pixels(rgb, [
        [0.213 + cosine * 0.787 - sine * 0.213, 0.715 - cosine * 0.715 - sine * 0.715, 0.072 - cosine * 0.072 + sine * 0.928],
        [0.213 - cosine * 0.213 + sine * 0.143, 0.715 + cosine * 0.285 + sine * 0.140, 0.072 - cosine * 0.072 - sine * 0.283],
        [0.213 - cosine * 0.213 - sine * 0.787, 0.715 - cosine * 0.715 + sine * 0.715, 0.072 + cosine * 0.928 + sine * 0.072],
    ])
    return _expected(rgb, strength)


@pytest.mark.parametrize("intensity", [0, 50, 100, 200, 300, 400])
def test_custom_rgb_decoded_pixels_match_shared_tables(tmp_path, intensity):
    source = tmp_path / "palette.png"
    _palette(source)
    grading = ReelRenderer.build_color_grading_filter("intel_custom", intensity)
    assert ",eq=" not in grading
    assert "geq=" not in grading
    raw = _run(["ffmpeg", "-v", "error", "-i", str(source), "-vf", grading.lstrip(","),
                "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    image = Image.frombytes("RGB", (256, 32), raw)
    for index, color in enumerate(PALETTE):
        actual = image.getpixel((index * 32 + 16, 16))
        expected = _expected(color, intensity / 100)
        assert max(abs(a - b) for a, b in zip(actual, expected)) <= 2, (color, actual, expected)


@pytest.mark.parametrize("saturation", [2.5, 3.0])
def test_fast_strong_matrix_preserves_reference_pixels(tmp_path, saturation):
    source = tmp_path / "matrix-colors.png"
    image = Image.new("RGB", (64, 64))
    image.putdata([
        ((x * 37 + y * 17) % 256, (x * 11 + y * 47) % 256, (x * 53 + y * 7) % 256)
        for y in range(64) for x in range(64)
    ])
    image.save(source)
    rows = [
        [weight * (1 - saturation) + (saturation if row == column else 0)
         for column, weight in enumerate((0.213, 0.715, 0.072))] for row in range(3)
    ]
    # The old, slow GEQ expression remains only as an independent test oracle.
    reference = "geq=" + ":".join(
        f"{channel}='floor(clip(" + "+".join(
            f"({coefficient:.9f})*{component}(X,Y)"
            for component, coefficient in zip("rgb", row)
        ) + ",0,255)+0.5)'" for channel, row in zip("rgb", rows)
    )
    fast = saturation_filter(saturation)
    assert "geq=" not in fast
    assert "format=gbrp16le" in fast
    decoded = [_run([
        "ffmpeg", "-v", "error", "-i", str(source), "-vf", "format=gbrp," + grading,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]) for grading in (reference, fast)]
    assert max(abs(a - b) for a, b in zip(*decoded)) <= 1


def test_custom_rgb_manual_controls_use_rgb_operations():
    grading = ReelRenderer.build_color_grading_filter("intel_custom", 100, {
        "brightness": 10, "contrast": 120, "saturation": 110, "warmth": 25,
    })
    assert "eq=" not in grading
    assert grading.count("lutrgb=") == 3
    assert grading.count("colorchannelmixer=") == 4


@pytest.mark.parametrize("intensity", [0, 50, 100, 200, 400])
def test_custom_rgb_manual_controls_match_analytical_pixels(tmp_path, intensity):
    source = tmp_path / "manual.png"
    _palette(source)
    grading = ReelRenderer.build_color_grading_filter("intel_custom", intensity, {
        "brightness": 10, "contrast": 120, "saturation": 110, "warmth": 25,
    })
    raw = _run(["ffmpeg", "-v", "error", "-i", str(source), "-vf", grading.lstrip(","),
                "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    image = Image.frombytes("RGB", (256, 32), raw)
    for index, color in enumerate(PALETTE):
        actual = image.getpixel((index * 32 + 16, 16))
        expected = _expected_manual(color, intensity / 100)
        # Earlier 8-bit RGB matrix rounding is amplified by the final saturation
        # gain. At 4x its gain is 3, allowing up to six levels after all stages.
        tolerance = max(4, math.ceil(2 * (1 + 0.5 * intensity / 100)))
        assert max(abs(a - b) for a, b in zip(actual, expected)) <= tolerance, (color, actual, expected)


@pytest.mark.parametrize("special_overlays,aspect_ratio,intensity", [
    (False, "16:9", 100), (True, "16:9", 100), (False, "9:16", 100),
    (False, "16:9", 200), (False, "16:9", 400),
    (False, "16:9", 300),
])
def test_custom_rgb_rendered_mp4_preserves_rgb_and_709_tags(tmp_path, monkeypatch, special_overlays, aspect_ratio, intensity):
    source_image = tmp_path / "palette.png"
    _palette(source_image)
    source_video = tmp_path / "source.mp4"
    _run(["ffmpeg", "-v", "error", "-loop", "1", "-i", str(source_image),
          "-t", "0.1", "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p",
          "-c:v", "libx264", "-crf", "0", "-color_range", "tv", "-colorspace", "bt709",
          "-color_trc", "bt709", "-color_primaries", "bt709", str(source_video)])
    source_raw = _run(["ffmpeg", "-v", "error", "-i", str(source_video), "-frames:v", "1",
                       "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    source_decoded = Image.frombytes("RGB", (256, 32), source_raw)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "custom.mp4"
    template = {"background": {"type": "black"}, "series_text": {"enabled": False},
                "video": {"scale": 1, "vertical_offset": 0, "border_shape": "straight"}}
    if special_overlays:
        overlay = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
        overlay.paste((255, 0, 0, 255), (40, 80, 72, 112))
        buffer = io.BytesIO()
        overlay.save(buffer, "PNG")
        bitmap = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        template.update({
            "studio_hook_overlay": bitmap, "studio_hook_scene_mask": bitmap,
            "studio_username_scene_mask": bitmap,
            "watermark": {"enabled": True, "style": "scene_blend", "text": "@vibe"},
        })
    ReelRenderer().render_reel(
        str(source_video), str(output), 0, 0.1, "", "", "", "",
        template,
        aspect_ratio=aspect_ratio, show_lyrics=False, smart_loop=False,
        color_filter="intel_custom", filter_intensity=intensity, hook_fade_start=0,
    )
    video = json.loads(_run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)]))["streams"][0]
    assert video["color_range"] == "tv"
    assert video["color_space"] == video["color_primaries"] == video["color_transfer"] == "bt709"
    raw = _run(["ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    dimensions = (1920, 1080) if aspect_ratio == "16:9" else (2160, 3840)
    assert (video["width"], video["height"]) == dimensions
    image = Image.frombytes("RGB", dimensions, raw)
    if special_overlays:
        red, green, blue = image.getpixel((56, 96))
        assert red > 180 and green < 90 and blue < 90
    for index in range(len(PALETTE)):
        original = source_decoded.getpixel((index * 32 + 16, 16))
        patch_width = dimensions[0] // len(PALETTE)
        actual = image.getpixel((index * patch_width + patch_width // 2, dimensions[1] // 2))
        expected = _expected(original, intensity / 100)
        assert max(abs(a - b) for a, b in zip(actual, expected)) <= 6, (original, actual, expected)
