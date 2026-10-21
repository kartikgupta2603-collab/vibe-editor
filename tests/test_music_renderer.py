"""Verify selected music, fades, looping, and real export input mappings."""
import json
import math
import subprocess
import sys
import types
import wave

import pytest

from app.video import renderer as renderer_module
from app.video.renderer import ReelRenderer, _music_audio_filter


def _run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60)


def _tone(path, duration=2, leading_silence=0):
    command = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
               f"sine=frequency=880:sample_rate=44100:duration={duration}"]
    if leading_silence:
        command.extend(["-af", f"adelay={round(leading_silence * 1000)}:all=1,atrim=duration={duration}"])
    _run(command + [str(path)])


def _rms_at(path, start, length=.1):
    with wave.open(str(path), "rb") as audio:
        audio.setpos(round(start * audio.getframerate()))
        data = audio.readframes(round(length * audio.getframerate()))
    samples = memoryview(data).cast("h")
    return math.sqrt(sum(x*x for x in samples) / len(samples))


@pytest.mark.parametrize("loop", [False, True])
def test_selected_interval_pads_or_loops_without_extending_reel(tmp_path, loop):
    source, output = tmp_path / "source.wav", tmp_path / "mix.wav"
    _tone(source, leading_silence=.5)
    music = {"start": .5, "end": 1, "volume": 1, "loop": loop}
    filters = _music_audio_filter(0, music, 1)
    _run(["ffmpeg", "-v", "error", "-y", "-ss", "0.5", "-t", "0.5", "-i", str(source),
          "-filter_complex", filters, "-map", "[a_mix]", "-c:a", "pcm_s16le", str(output)])
    with wave.open(str(output), "rb") as audio:
        assert audio.getnframes() == 44100
    assert _rms_at(output, .1) > 1000
    assert (_rms_at(output, .8) > 1000) if loop else (_rms_at(output, .8) < 1)


def test_original_audio_gain_matches_the_requested_mix(tmp_path):
    source = tmp_path / "source.wav"
    _tone(source)
    levels = []
    for gain in (.25, .5):
        output = tmp_path / f"mix-{gain}.wav"
        filters = _music_audio_filter(1, {"start": 0, "end": 1, "volume": 0,
                                         "original_volume": gain}, 1, "[0:a]")
        _run(["ffmpeg", "-v", "error", "-y", "-i", str(source), "-i", str(source),
              "-filter_complex", filters, "-map", "[a_mix]", "-c:a", "pcm_s16le", str(output)])
        levels.append(_rms_at(output, .4))
    assert 1.95 < levels[1] / levels[0] < 2.05


def test_fades_follow_audible_selection_and_original_can_be_muted(tmp_path):
    source, output = tmp_path / "source.wav", tmp_path / "mix.wav"
    _tone(source)
    music = {"start": 0, "end": .6, "volume": 1, "original_volume": 0,
             "fade_in": 10, "fade_out": 10}
    filters = _music_audio_filter(1, music, 1, "[0:a]")
    _run(["ffmpeg", "-v", "error", "-y", "-i", str(source), "-i", str(source),
          "-filter_complex", filters, "-map", "[a_mix]", "-c:a", "pcm_s16le", str(output)])
    assert _rms_at(output, .25, .05) > _rms_at(output, 0, .05) * 3
    assert _rms_at(output, .25, .05) > _rms_at(output, .55, .05) * 3
    assert _rms_at(output, .8) < 1


@pytest.mark.parametrize("source_audio", [False, True])
def test_real_music_export_handles_silent_source_and_optional_image_inputs(tmp_path, monkeypatch, source_audio):
    source, track, output = tmp_path / "video.mp4", tmp_path / "music.wav", tmp_path / "export.mp4"
    command = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=navy:s=320x180:r=30"]
    if source_audio:
        command.extend(["-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100"])
    command.extend(["-t", "0.7", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(source)])
    _run(command)
    _tone(track)
    library = types.SimpleNamespace(
        get_track=lambda track_id: {"duration": 2},
        resolve_file=lambda track_id: track,
        validate_range=lambda *args: {"duration": 2},
    )
    monkeypatch.setitem(sys.modules, "app.video.music_library", types.SimpleNamespace(music_library=library))
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)
    template = {"background": {"type": "black"}, "video": {"curved_border": True, "corner_radius": 24}}
    ReelRenderer().render_reel(
        str(source), str(output), 0, .6, "", "", "", "", template,
        aspect_ratio="1:1", show_lyrics=False, smart_loop=False,
        music={"track_id": "saved-track", "start": .3, "end": .55,
               "loop": True, "volume": .7, "original_volume": 0},
    )
    probe = json.loads(_run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)]).stdout)
    assert .58 <= float(probe["format"]["duration"]) <= .7
    assert any(stream["codec_type"] == "audio" for stream in probe["streams"])
    assert any(stream.get("width") == 1080 and stream.get("height") == 1080 for stream in probe["streams"])
    decoded = tmp_path / "decoded.wav"
    _run(["ffmpeg", "-v", "error", "-y", "-i", str(output), "-vn", "-c:a", "pcm_s16le", str(decoded)])
    assert _rms_at(decoded, .35) > 500
