"""Original video gain works independently of an attached soundtrack."""
import math
import subprocess
import sys
import types
import wave

import pytest
from pydantic import ValidationError

from app.main import ExportRequest
from app.video import renderer as renderer_module
from app.video.renderer import ReelRenderer


def _run(command):
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=60)


def _source(path, audio=True):
    command = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
               "color=c=black:s=160x90:r=30"]
    if audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"]
    _run(command + ["-t", "0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)])


def _rms(path):
    decoded = path.with_suffix(".wav")
    _run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-vn", "-c:a", "pcm_s16le", str(decoded)])
    with wave.open(str(decoded), "rb") as audio:
        audio.setpos(round(.15 * audio.getframerate()))
        samples = memoryview(audio.readframes(round(.15 * audio.getframerate()))).cast("h")
    return math.sqrt(sum(value * value for value in samples) / len(samples))


@pytest.mark.parametrize("added_music", [False, True])
def test_real_export_original_gain_is_applied_once_with_or_without_music(tmp_path, monkeypatch, added_music):
    source = tmp_path / "source.mp4"
    _source(source)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    library = types.SimpleNamespace(
        get_track=lambda _: {"duration": .5},
        resolve_file=lambda _: source,
        validate_range=lambda *args: {"duration": .5},
    )
    monkeypatch.setitem(sys.modules, "app.video.music_library", types.SimpleNamespace(music_library=library))
    music = {"track_id": "test", "start": 0, "end": .4, "volume": 0, "original_volume": .5} if added_music else None
    levels = {}
    for gain in (0, .25, 1):
        output = tmp_path / f"export-{gain}.mp4"
        ReelRenderer().render_reel(
            str(source), str(output), 0, .4, "", "", "", "",
            {"background": {"type": "black"}}, aspect_ratio="1:1",
            show_lyrics=False, smart_loop=False, music=music, video_audio_volume=gain,
        )
        levels[gain] = _rms(output)
    assert levels[0] < 1
    assert levels[1] > 1000
    assert .23 < levels[.25] / levels[1] < .27
    if added_music:
        assert music["original_volume"] == .5  # Caller state remains untouched.


def test_muted_export_accepts_source_without_audio(tmp_path, monkeypatch):
    source, output = tmp_path / "silent.mp4", tmp_path / "export.mp4"
    _source(source, audio=False)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    ReelRenderer().render_reel(
        str(source), str(output), 0, .4, "", "", "", "",
        {"background": {"type": "black"}}, aspect_ratio="1:1",
        show_lyrics=False, smart_loop=False, video_audio_volume=0,
    )
    assert _rms(output) < 1


@pytest.mark.parametrize("value", [-.01, 1.01, float("nan"), float("inf"), -float("inf")])
def test_video_gain_rejects_invalid_values_at_api_and_renderer(value):
    with pytest.raises(ValidationError):
        ExportRequest(source_video="source.mp4", video_audio_volume=value)
    with pytest.raises(ValueError, match="Video audio volume"):
        ReelRenderer().render_reel("missing.mp4", "unused.mp4", 0, 1, "", "", "", "", {},
                                   video_audio_volume=value)


def test_video_gain_schema_preserves_legacy_default_and_accepts_boundaries():
    assert ExportRequest(source_video="source.mp4").video_audio_volume is None
    for value in (0, .25, 1):
        assert ExportRequest(source_video="source.mp4", video_audio_volume=value).video_audio_volume == value
