import json
import subprocess
from pathlib import Path

import pytest

from app.video import renderer as renderer_module
from app.video.renderer import ReelRenderer


def test_subtitle_size_and_horizontal_position(tmp_path):
    path = tmp_path / "subs.ass"
    assert ReelRenderer().create_ass_subtitles(
        [{"start": 0, "end": 1, "text_jp": "歌", "text_en": "Song"}],
        0, 1, str(path), subtitle_font_size=76, subtitle_x=320,
    )
    content = path.read_text(encoding="utf-8")
    assert "Style: Japanese,Yu Gothic,72," in content
    assert "Style: English,Segoe UI,48," in content
    events = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    assert len(events) == 2
    assert all(r"\pos(320," in line for line in events)


def test_missing_source_is_not_replaced_by_another_download(tmp_path):
    with pytest.raises(FileNotFoundError):
        ReelRenderer().render_reel(
            str(tmp_path / "missing.mp4"), str(tmp_path / "out.mp4"),
            0, 1, "", "", "", "", {},
        )


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
    assert (video["width"], video["height"]) == (1080, 1920)
    assert video["avg_frame_rate"] == "30/1"
    assert any(stream["codec_type"] == "audio" for stream in streams)
    original = output.read_bytes()
    with pytest.raises(FileExistsError):
        renderer.render_reel(**kwargs)
    assert output.read_bytes() == original
