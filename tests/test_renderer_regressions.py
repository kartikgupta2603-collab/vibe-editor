import json
import base64
import io
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from app.video import renderer as renderer_module
from app.video.renderer import ReelRenderer, _visible_rounded_mask


def test_nvenc_detection_requires_a_successful_gpu_smoke_encode(monkeypatch):
    """A compiled-but-unusable NVENC build must not trigger a full failed render."""
    monkeypatch.setattr(renderer_module, "_gpu_cache", {})

    class Result:
        def __init__(self, stdout="", returncode=0):
            self.stdout = stdout
            self.returncode = returncode

    calls = []

    def fake_run(command, **_kwargs):
        calls.append(command)
        if command[-1] == "-encoders":
            return Result(stdout=" V....D h264_nvenc NVIDIA NVENC H.264 encoder")
        return Result(returncode=1)

    monkeypatch.setattr(renderer_module.subprocess, "run", fake_run)
    assert renderer_module._has_nvenc() is False
    assert len(calls) == 2
    assert calls[1][-4:] == ["h264_nvenc", "-f", "null", "-"]


def test_export_limits_source_frames_before_expensive_compositing():
    source = (Path(__file__).resolve().parents[1] / "app" / "video" / "renderer.py").read_text(encoding="utf-8")
    # Every direct, solid-background, and blur-background layout branch must
    # discard excess source frames before 4K scaling/compositing work begins.
    assert source.count("[0:v]fps=30") == 7


def test_export_applies_the_separate_song_window_border_gap():
    source = (Path(__file__).resolve().parents[1] / "app" / "video" / "renderer.py").read_text(encoding="utf-8")
    assert "MAX_SONG_WINDOW_SCALE = 1.40" in source
    assert 'raw_window_inset = float(vid_cfg.get("window_inset", 0) or 0)' in source
    assert "radius: int, inset: int = 0" in source
    assert "safe_inset = max(0, min(inset, min(canvas_w, canvas_h) // 2 - 1))" in source
    assert "(curved_border and c_radius > 0) or window_inset > 0" in source


def test_circular_border_mask_uses_an_aspect_ratio_ellipse():
    mask = _visible_rounded_mask(400, 200, 0, 0, 400, 200, radius=16, circular=True)
    assert mask.getpixel((0, 0))[3] == 0
    assert mask.getpixel((200, 100))[3] == 255
    assert mask.getpixel((0, 100))[3] == 255
    assert mask.getpixel((120, 0))[3] == 0


def test_viral_hook_overlay_preserves_case_and_uses_compact_creator_defaults(tmp_path):
    output = tmp_path / "hook.png"
    result = ReelRenderer().create_text_overlay_image(
        1080, 1920,
        "Anime fans: does this opening still hit? 👀", "", "", "",
        {"background": {"type": "black"}, "series_text": {
            "enabled": True, "x": 540, "y": 360, "size": 34,
            "font": "Segoe UI Semibold", "color": "#ffffff",
        }},
        str(output),
    )
    assert Path(result).exists()
    # The hook is fully rendered as a real transparent overlay, ready for export.
    assert output.stat().st_size > 0


def test_native_hook_overlay_preserves_manual_newlines(tmp_path):
    output = tmp_path / "multiline-hook.png"
    ReelRenderer().create_text_overlay_image(
        1080, 1920, "First line\nSecond line", "", "", "",
        {"background": {"type": "black"}, "series_text": {
            "enabled": True, "x": 540, "y": 360, "size": 38, "line_gap": 48,
            "font": "Segoe UI Semibold", "color": "#ffffff",
        }}, str(output),
    )
    rendered = Image.open(output).convert("RGBA")
    # Each deliberately separated line produces ink in its own vertical band.
    alpha = rendered.getchannel("A")
    occupied_rows = [y for y in range(300, 500) if any(alpha.getpixel((x, y)) for x in range(100, 980))]
    gaps = [b - a for a, b in zip(occupied_rows, occupied_rows[1:])]
    assert max(gaps) >= 45
    # Deliberate lines share their left edge, instead of centring each line.
    left_edges = []
    for start, end in ((300, 385), (430, 500)):
        pixels = [x for y in range(start, end) for x in range(100, 980) if alpha.getpixel((x, y))]
        if pixels:
            left_edges.append(min(pixels))
    assert len(left_edges) == 2
    assert abs(left_edges[0] - left_edges[1]) <= 2


def test_viral_hook_overlay_keeps_a_creator_selected_size(tmp_path):
    output = tmp_path / "custom-hook.png"
    result = ReelRenderer().create_text_overlay_image(
        1080, 1920, "A deliberate custom hook", "", "", "",
        {"background": {"type": "black"}, "series_text": {
            "enabled": True, "x": 540, "y": 360, "size": 72,
            "font": "Segoe UI Semibold", "color": "#ffffff", "_custom": True,
        }},
        str(output),
    )
    assert Path(result).exists()
    assert output.stat().st_size > 0
    source = Path(renderer_module.__file__).read_text(encoding="utf-8")
    assert 'max_hook_size = round((110 if s_cfg.get("_custom") else 42) * design_scale)' in source
    assert 'stroke_width=outline_width, stroke_fill="#080808"' in source


def test_export_uses_the_video_vertical_offset_from_the_template():
    source = Path(renderer_module.__file__).read_text(encoding="utf-8")
    assert 'raw_v_offset = vid_cfg.get("vertical_offset")' in source
    assert renderer_module._contain_geometry(1080, 1920, vertical_offset=37)[3] == 37


def test_subtitle_size_and_horizontal_position(tmp_path):
    path = tmp_path / "subs.ass"
    assert ReelRenderer().create_ass_subtitles(
        [{"start": 0, "end": 1, "text_jp": "歌", "text_en": "Song"}],
        0, 1, str(path), subtitle_font_size=76, subtitle_x=320,
    )
    content = path.read_text(encoding="utf-8")
    assert "Style: Japanese,Yu Gothic,72," in content
    # English lines intentionally use the monitor's 1.12 readability scale.
    assert "Style: English,Segoe UI,53.76," in content
    events = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    assert len(events) == 2
    assert all(r"\pos(320," in line for line in events)


def test_missing_source_is_not_replaced_by_another_download(tmp_path):
    with pytest.raises(FileNotFoundError):
        ReelRenderer().render_reel(
            str(tmp_path / "missing.mp4"), str(tmp_path / "out.mp4"),
            0, 1, "", "", "", "", {},
        )


def _studio_text_data_url(size=(2160, 3840), pixel=(255, 0, 0, 255)):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    for x in range(40, 72):
        for y in range(80, 112):
            image.putpixel((x, y), pixel)
    encoded = io.BytesIO()
    image.save(encoded, "PNG")
    return "data:image/png;base64," + base64.b64encode(encoded.getvalue()).decode("ascii")


def test_export_uses_studio_text_pixels_without_redrawing_hook_or_username(tmp_path):
    output = tmp_path / "studio-text.png"
    ReelRenderer().create_text_overlay_image(
        2160, 3840, "A different native hook", "", "", "",
        {"background": {"type": "black"}, "studio_text_overlay": _studio_text_data_url(),
         "series_text": {"enabled": True, "x": 1080, "y": 720, "size": 76},
         "watermark": {"enabled": True, "text": "@native", "x": 50, "y": 50}},
        str(output),
    )
    rendered = Image.open(output).convert("RGBA")
    assert rendered.getpixel((40, 80)) == (255, 0, 0, 255)
    # If native hook/watermark had also drawn, this source-only image would
    # contain additional opaque pixels beyond the supplied Studio bitmap.
    assert sum(pixel[3] > 0 for pixel in rendered.getdata()) == 32 * 32


@pytest.mark.parametrize("overlay", [
    "not-a-data-url",
    "data:image/png;base64,not-valid-base64",
    _studio_text_data_url((1080, 1920)),
])
def test_export_rejects_invalid_studio_text_overlay(tmp_path, overlay):
    with pytest.raises(ValueError, match="Studio text overlay"):
        ReelRenderer().create_text_overlay_image(
            2160, 3840, "", "", "", "", {"studio_text_overlay": overlay}, str(tmp_path / "invalid.png"),
        )


def test_real_export_composites_the_exact_studio_text_layer(tmp_path, monkeypatch):
    source = tmp_path / "white.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=160x90:r=30:d=0.1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "studio-text.mp4"
    ReelRenderer().render_reel(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=0.1,
        series_text="This native hook must not appear", song_name="", anime_name="", caption="",
        template={"background": {"type": "white"}, "video": {"scale": 1.0, "vertical_offset": 0},
                  "studio_text_overlay": _studio_text_data_url()},
        show_lyrics=False,
    )
    frame_path = tmp_path / "export-frame.png"
    subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1", "-update", "1", str(frame_path),
    ], check=True, capture_output=True, timeout=30)
    red, green, blue, _ = Image.open(frame_path).convert("RGBA").getpixel((56, 96))
    assert red > 180 and green < 90 and blue < 90


def test_real_export_fades_only_the_separate_studio_hook_layer(tmp_path, monkeypatch):
    source = tmp_path / "white.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=white:s=160x90:r=30:d=0.4",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "faded-hook.mp4"
    ReelRenderer().render_reel(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=0.4,
        series_text="", song_name="", anime_name="", caption="",
        template={"background": {"type": "white"}, "video": {"scale": 1.0, "vertical_offset": 0},
                  "studio_text_overlay": _studio_text_data_url(pixel=(0, 0, 0, 0)),
                  "studio_hook_overlay": _studio_text_data_url()},
        show_lyrics=False, hook_fade_start=0.04,
    )
    first = tmp_path / "first.png"
    late = tmp_path / "late.png"
    for seek, frame in (("0.01", first), ("0.34", late)):
        subprocess.run([
            "ffmpeg", "-v", "error", "-ss", seek, "-i", str(output), "-frames:v", "1", "-update", "1", str(frame),
        ], check=True, capture_output=True, timeout=30)
    early_r, early_g, early_b, _ = Image.open(first).convert("RGBA").getpixel((56, 96))
    late_r, late_g, late_b, _ = Image.open(late).convert("RGBA").getpixel((56, 96))
    assert early_r > 180 and early_g < 90 and early_b < 90
    assert late_r > 180 and late_g > 150 and late_b > 150


def test_scene_blend_hook_remains_visible_over_black_footage(tmp_path, monkeypatch):
    source = tmp_path / "black.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=black:s=160x90:r=30:d=0.1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "scene-hook.mp4"
    ReelRenderer().render_reel(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=0.1,
        series_text="", song_name="", anime_name="", caption="",
        template={"background": {"type": "black"}, "video": {"scale": 1.0, "vertical_offset": 0},
                  "studio_text_overlay": _studio_text_data_url(size=(1920, 1080), pixel=(0, 0, 0, 0)),
                  "studio_hook_scene_mask": _studio_text_data_url(size=(1920, 1080))},
        aspect_ratio="16:9", show_lyrics=False,
    )
    frame = tmp_path / "scene-hook.png"
    subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1", "-update", "1", str(frame),
    ], check=True, capture_output=True, timeout=30)
    red, green, blue, _ = Image.open(frame).convert("RGBA").getpixel((56, 96))
    assert min(red, green, blue) > 30


def test_oversized_curved_window_rounds_the_visible_export_edge(tmp_path, monkeypatch):
    source = tmp_path / "blue.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=blue:s=160x90:r=30:d=0.1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "oversized-curved.mp4"
    ReelRenderer().render_reel(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=0.1,
        series_text="", song_name="", anime_name="", caption="",
        template={"background": {"type": "black"},
                  "video": {"scale": 1.5, "vertical_offset": 0, "curved_border": True, "corner_radius": 200},
                  "studio_text_overlay": _studio_text_data_url(size=(1920, 1080), pixel=(0, 0, 0, 0))},
        aspect_ratio="16:9", show_lyrics=False,
    )
    frame = tmp_path / "oversized-curved.png"
    subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1", "-update", "1", str(frame),
    ], check=True, capture_output=True, timeout=30)
    corner = Image.open(frame).convert("RGB").getpixel((0, 0))
    centre = Image.open(frame).convert("RGB").getpixel((960, 540))
    assert max(corner) < 35
    assert centre[2] > 80


def test_hook_fade_export_with_audio_stops_at_selected_clip_end(tmp_path, monkeypatch):
    """A looped hook image must not extend an audio-backed reel forever."""
    source = tmp_path / "source-with-audio.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=white:s=160x90:r=30:d=0.4",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:d=0.4",
        "-shortest", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "bounded-hook.mp4"
    ReelRenderer().render_reel(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=0.4,
        series_text="", song_name="", anime_name="", caption="",
        template={"background": {"type": "white"}, "video": {"scale": 1.0, "vertical_offset": 0},
                  "studio_text_overlay": _studio_text_data_url(size=(1920, 1080)),
                  "studio_hook_overlay": _studio_text_data_url(size=(1920, 1080), pixel=(255, 0, 0, 255))},
        aspect_ratio="16:9", show_lyrics=False, hook_fade_start=0.1,
    )
    data = json.loads(subprocess.run([
        "ffprobe", "-v", "error", "-show_format", "-of", "json", str(output),
    ], check=True, capture_output=True, text=True, timeout=10).stdout)
    exported_duration = float(data["format"]["duration"])
    assert 0.35 <= exported_duration <= 0.5


@pytest.mark.parametrize("overlay_key", ["studio_hook_overlay", "studio_hook_scene_mask"])
@pytest.mark.parametrize("fade_start", [0, 0.1, 1])
def test_cached_hook_images_keep_fades_static_lifetime_and_clip_end(tmp_path, monkeypatch, overlay_key, fade_start):
    source = tmp_path / "source.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=0x404040:s=320x180:r=30:d=0.4",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", "-shortest",
        "-c:v", "libx264", "-preset", "fast", "-c:a", "aac", "-pix_fmt", "yuv420p", str(source),
    ], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    real_popen = renderer_module.subprocess.Popen
    commands = []

    def capture(command, **kwargs):
        commands.append(command)
        return real_popen(command, **kwargs)

    monkeypatch.setattr(renderer_module.subprocess, "Popen", capture)
    output = tmp_path / "cached-hook.mp4"
    ReelRenderer().render_reel(
        str(source), str(output), 0, 0.4, "", "", "", "",
        {"background": {"type": "black"}, "video": {"scale": 1, "curved_border": False},
         "series_text": {"enabled": False},
         "studio_text_overlay": _studio_text_data_url(size=(1920, 1080), pixel=(0, 0, 0, 0)),
         overlay_key: _studio_text_data_url(size=(1920, 1080))},
        aspect_ratio="16:9", show_lyrics=False, hook_fade_start=fade_start,
    )
    command = commands[-1]
    assert "-loop" not in command  # A 4K PNG is decoded once, never once per frame.
    graph = command[command.index("-filter_complex") + 1]
    active_fade = 0 < fade_start < 0.4
    assert ("loop=loop=-1:size=1:start=0,setpts=N/(30*TB),trim=duration=" in graph) is active_fade
    info = json.loads(subprocess.run([
        "ffprobe", "-v", "error", "-show_format", "-of", "json", str(output),
    ], check=True, capture_output=True, text=True, timeout=10).stdout)
    assert 0.35 <= float(info["format"]["duration"]) <= 0.5
    pixels = []
    for index, seek in enumerate((0.01, 0.34)):
        frame = tmp_path / f"frame-{index}.png"
        subprocess.run([
            "ffmpeg", "-v", "error", "-ss", str(seek), "-i", str(output),
            "-frames:v", "1", "-update", "1", str(frame),
        ], check=True, capture_output=True, timeout=30)
        with Image.open(frame) as image:
            pixels.append(image.convert("RGB").getpixel((56, 96)))
    if active_fade:
        assert pixels[0][0] > pixels[1][0] + 25
    else:
        assert pixels[0] == pytest.approx(pixels[1], abs=4)
        assert pixels[0][0] > 110


@pytest.mark.parametrize("has_audio", [False, True])
def test_real_vertical_export_preserves_files_and_uses_30fps(tmp_path, monkeypatch, has_audio):
    source = tmp_path / "source.mp4"
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
               "-i", "color=c=blue:s=320x180:r=24"]
    if has_audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"]
    command += ["-t", "0.3", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source)]
    subprocess.run(command, check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    output = tmp_path / "out.mp4"
    renderer = ReelRenderer()
    kwargs = dict(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=0.3,
        series_text="Hidden", song_name="", anime_name="", caption="",
        template={"background": {"type": "black"}, "series_text": {"enabled": False}},
        lyrics=[{"start": 0, "end": 0.3, "text_en": "Test"}], show_lyrics=True,
        subtitle_font_size=38, subtitle_x=540,
    )
    renderer.render_reel(**kwargs)
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)],
        capture_output=True, text=True, check=True, timeout=10,
    )
    streams = json.loads(result.stdout)["streams"]
    video = next(stream for stream in streams if stream["codec_type"] == "video")
    assert (video["width"], video["height"]) == (2160, 3840)
    assert video["avg_frame_rate"] == "30/1"
    # Keep the same limited-range BT.709 interpretation that browsers use for
    # the Studio source preview; otherwise players can show a dull export.
    assert video["color_range"] == "tv"
    assert video["color_space"] == "bt709"
    assert video["color_transfer"] == "bt709"
    assert video["color_primaries"] == "bt709"
    assert any(stream["codec_type"] == "audio" for stream in streams)
    # Compare decoded frames with an otherwise identical export. This proves
    # the ASS subtitle path is burned into the final reel, not merely written
    # to a sidecar file.
    without_subtitles = tmp_path / "out_without_subtitles.mp4"
    renderer.render_reel(**{**kwargs, "output_mp4": str(without_subtitles), "show_lyrics": False})
    def decoded_frame_hashes(path):
        hashes = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-f", "framemd5", "-"],
            capture_output=True, text=True, check=True, timeout=30,
        )
        return hashes.stdout
    assert decoded_frame_hashes(output) != decoded_frame_hashes(without_subtitles)
    original = output.read_bytes()
    with pytest.raises(FileExistsError):
        renderer.render_reel(**kwargs)
    assert output.read_bytes() == original
