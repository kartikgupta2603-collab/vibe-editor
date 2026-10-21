import shutil
import subprocess

import pytest
from PIL import Image

from app.video.renderer import ReelRenderer, _scene_username_filter, _scene_username_mask
from app.video import renderer as renderer_module
from app.video.probe import probe_video


def test_scene_username_rotation_and_uppercase():
    config = {"text": "@Creator", "size": 32, "x": 80, "y": 80}
    normal = _scene_username_mask(300, 300, config)
    upper = _scene_username_mask(300, 300, {**config, "text": "@CREATOR"})
    assert normal.tobytes() == upper.tobytes()
    rotated = _scene_username_mask(300, 300, {**config, "rotation": 90})
    x0, y0, x1, y1 = rotated.getbbox()
    assert y1 - y0 > x1 - x0
    assert y0 >= 80 and x0 < 80 < x1


def test_scene_username_tracks_frames_without_changing_background(tmp_path):
    if not shutil.which("ffmpeg"):
        pytest.skip("FFmpeg is required for the blend reproduction")
    width, height = 160, 100
    mask = _scene_username_mask(width, height, {"text": "TEST", "size": 25, "x": 40, "y": 45})
    mask_path = tmp_path / "mask.png"
    mask.save(mask_path)
    colors = [(40, 90, 180), (160, 45, 75)]
    frames = b"".join(Image.new("RGB", (width, height), color).tobytes() for color in colors)
    result = subprocess.run([
        "ffmpeg", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24",
        "-video_size", f"{width}x{height}", "-framerate", "1", "-i", "pipe:0",
        "-i", str(mask_path), "-filter_complex", _scene_username_filter("[0:v]", 1),
        "-map", "[wm_scene]", "-frames:v", "2", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ], input=frames, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr.decode()
    assert len(result.stdout) == width * height * 3 * 2
    inside = next((x, y) for y in range(height) for x in range(width) if mask.getpixel((x, y)) == 255)
    for frame_index, color in enumerate(colors):
        start = frame_index * width * height * 3
        image = Image.frombytes("RGB", (width, height), result.stdout[start:start + width * height * 3])
        for y in range(height):
            for x in range(width):
                if mask.getpixel((x, y)) == 0:
                    assert image.getpixel((x, y)) == color
        expected = tuple(round(channel + .65 * (min(255, channel * 2) - channel)) for channel in color)
        assert all(abs(actual - wanted) <= 2 for actual, wanted in zip(image.getpixel(inside), expected))


def test_scene_username_excluded_from_static_overlay_and_clean_preserved(tmp_path):
    renderer = ReelRenderer()
    config = {"enabled": True, "style": "scene_blend", "text": "TEST", "x": 40, "y": 45, "size": 25}
    template = {"background": {"type": "black"}, "video": {"curved_border": False}}
    def overlay(name, watermark):
        output = tmp_path / name
        renderer.create_text_overlay_image(160, 100, "", "", "", "", template, str(output), watermark=watermark)
        return Image.open(output).getchannel("A").tobytes()
    disabled = overlay("disabled.png", {**config, "enabled": False})
    assert overlay("scene.png", config) == disabled
    assert overlay("clean.png", {**config, "style": "clean"}) != disabled


@pytest.mark.parametrize("aspect,dimensions", [("16:9", (1920, 1080)), ("1:1", (1080, 1080)), ("9:16", (2160, 3840))])
@pytest.mark.parametrize("has_audio", [False, True])
def test_scene_username_export_graph_and_audio(tmp_path, monkeypatch, aspect, dimensions, has_audio):
    if not shutil.which("ffmpeg"):
        pytest.skip("FFmpeg is required for the export reproduction")
    source = tmp_path / "source.mkv"
    command = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x285ab4:s=160x90:r=30"]
    if has_audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"]
    command += ["-t", "0.1", "-c:v", "ffv1", str(source)]
    generated = subprocess.run(command, capture_output=True, timeout=30)
    assert generated.returncode == 0, generated.stderr.decode()
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "export.mp4"
    ReelRenderer().render_reel(
        str(source), str(output), 0, .1, "", "", "", "",
        {"background": {"type": "blur", "blur": 4}, "video": {"scale": .8 if has_audio else 1, "curved_border": has_audio}},
        aspect_ratio=aspect, show_lyrics=False,
        watermark={"enabled": True, "style": "scene_blend", "rotation": 90, "text": "TEST", "size": 40, "x": 300, "y": 300},
    )
    exported = probe_video(str(output))
    assert (exported.width, exported.height) == dimensions
    assert exported.has_audio
