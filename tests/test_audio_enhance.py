"""End-to-end regression coverage for the optional Reel audio master."""
from __future__ import annotations

import json
import math
import subprocess
import uuid
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.video.audio_enhance import render_audio_preview
from app.video import renderer as renderer_module
from app.video.renderer import ReelRenderer


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=60)


def _mixed_tone(path: Path, duration: float = 2.0) -> None:
    """Create bass + vocal-presence tones so EQ changes are measurable."""
    _run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"sine=frequency=110:sample_rate=44100:duration={duration}",
        "-f", "lavfi", "-i", f"sine=frequency=2800:sample_rate=44100:duration={duration}",
        "-filter_complex", "[0:a]volume=0.65[a];[1:a]volume=0.18[b];[a][b]amix=inputs=2:normalize=0",
        "-c:a", "pcm_s16le", str(path),
    ])


def _silence(path: Path, duration: float = 1.0) -> None:
    _run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=44100:d={duration}",
        "-c:a", "pcm_s16le", str(path),
    ])


def _steady_tone(path: Path, duration: float = 5.0) -> None:
    """Create a steady signal to catch audible level pumping regressions."""
    _run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=44100:duration={duration}",
        "-c:a", "pcm_s16le", str(path),
    ])


def _wav_samples(path: Path) -> tuple[int, list[int]]:
    with wave.open(str(path), "rb") as handle:
        assert handle.getsampwidth() == 2
        assert handle.getframerate() == 44100
        frames = handle.getnframes()
        data = handle.readframes(frames)
    samples = list(memoryview(data).cast("h"))
    return frames, samples


def _rms(samples: list[int]) -> float:
    return math.sqrt(math.fsum(sample * sample for sample in samples) / len(samples))


def _make_video(path: Path, *, audio: bool, duration: float = 1.0) -> None:
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=navy:s=320x180:r=24",
    ]
    if audio:
        command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"]
    command += ["-t", str(duration), "-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        command += ["-c:a", "aac", "-shortest"]
    command += [str(path)]
    _run(command)


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        check=True, capture_output=True, text=True, timeout=20,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def _tone_amplitude(samples: list[int], frequency: float) -> float:
    """Measure a known component independently of gain and filter phase."""
    mono = samples[::2][11025:-11025]
    angle = 2 * math.pi * frequency / 44100
    real = math.fsum(value * math.cos(angle * index) for index, value in enumerate(mono))
    imaginary = math.fsum(value * math.sin(angle * index) for index, value in enumerate(mono))
    return 2 * math.hypot(real, imaginary) / len(mono)


def test_master_adds_audible_presence_and_keeps_headroom(tmp_path):
    source = tmp_path / "mixed.wav"
    original = tmp_path / "original.wav"
    enhanced = tmp_path / "enhanced.wav"
    _mixed_tone(source)

    render_audio_preview(str(source), original, 0, 2, enabled=False)
    render_audio_preview(str(source), enhanced, 0, 2, enabled=True)

    original_frames, original_samples = _wav_samples(original)
    enhanced_frames, enhanced_samples = _wav_samples(enhanced)
    assert enhanced_frames == original_frames == 2 * 44100
    assert len(enhanced_samples) == len(original_samples)
    assert all(math.isfinite(float(sample)) for sample in enhanced_samples)
    assert max(abs(sample) for sample in enhanced_samples) < 32767
    assert max(abs(sample) for sample in enhanced_samples) <= int(32767 * 0.95)

    # Enhancement must do more than raise volume: presence becomes stronger
    # relative to bass, with a modest overall lift rather than a large jump.
    before_ratio = _tone_amplitude(original_samples, 2800) / _tone_amplitude(original_samples, 110)
    after_ratio = _tone_amplitude(enhanced_samples, 2800) / _tone_amplitude(enhanced_samples, 110)
    assert 1.25 < after_ratio / before_ratio < 1.8
    assert 1.05 < _rms(enhanced_samples) / _rms(original_samples) < 1.6


def test_master_reduces_rumble_and_mud_without_erasing_bass(tmp_path):
    source = tmp_path / "spectrum.wav"
    original = tmp_path / "spectrum_original.wav"
    enhanced = tmp_path / "spectrum_enhanced.wav"
    _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
          "aevalsrc=0.04*sin(2*PI*15*t)+0.04*sin(2*PI*110*t)+0.04*sin(2*PI*250*t)+0.04*sin(2*PI*3000*t):s=44100:d=3",
          "-c:a", "pcm_s16le", str(source)])
    render_audio_preview(str(source), original, 0, 3, enabled=False)
    render_audio_preview(str(source), enhanced, 0, 3, enabled=True)
    _, before = _wav_samples(original)
    _, after = _wav_samples(enhanced)
    gain = {frequency: _tone_amplitude(after, frequency) / _tone_amplitude(before, frequency)
            for frequency in (15, 110, 250, 3000)}
    assert gain[15] / gain[110] < 0.3
    assert 0.9 < gain[110] < 1.4
    assert gain[250] < gain[110]
    assert 1.4 < gain[3000] / gain[250] < 1.9


def test_refined_master_adds_warmth_and_air_without_just_turning_up_volume(tmp_path):
    source = tmp_path / "warmth-air.wav"
    before = tmp_path / "before.wav"
    after = tmp_path / "after.wav"
    _run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
          "aevalsrc=0.02*sin(2*PI*110*t)+0.02*sin(2*PI*1000*t)+0.02*sin(2*PI*3000*t)+0.02*sin(2*PI*9000*t):s=44100:d=3",
          "-c:a", "pcm_s16le", str(source)])
    render_audio_preview(str(source), before, 0, 3, enabled=False)
    render_audio_preview(str(source), after, 0, 3, enabled=True)
    _, original = _wav_samples(before)
    _, enhanced = _wav_samples(after)
    gain = {frequency: _tone_amplitude(enhanced, frequency) / _tone_amplitude(original, frequency)
            for frequency in (110, 1000, 3000, 9000)}
    assert gain[110] > gain[1000], 'body gains warmth instead of flat volume gain'
    assert gain[3000] > gain[1000], 'presence remains clearer than the neutral midrange'
    assert gain[9000] > gain[1000], 'a small high-frequency lift adds air'
    assert max(abs(sample) for sample in enhanced) < 32767


def test_master_keeps_a_steady_source_at_a_steady_level(tmp_path):
    source = tmp_path / "steady.wav"
    enhanced = tmp_path / "steady_enhanced.wav"
    _steady_tone(source)

    render_audio_preview(str(source), enhanced, 0, 5, enabled=True)
    frames, samples = _wav_samples(enhanced)
    samples_per_second = (len(samples) // frames) * 44100
    # Ignore the first/last second, where a source decoder can start or end a
    # filter window.  Fixed processing should keep the inner seconds matched.
    second_rms = [_rms(samples[index * samples_per_second:(index + 1) * samples_per_second])
                  for index in range(1, 4)]
    assert max(second_rms) / min(second_rms) < 1.02


def test_master_handles_silence_without_amplifying_it(tmp_path):
    source = tmp_path / "silent.wav"
    output = tmp_path / "silent_preview.wav"
    _silence(source)

    render_audio_preview(str(source), output, 0, 1, enabled=True)

    frames, samples = _wav_samples(output)
    assert frames == 44100
    assert all(math.isfinite(float(sample)) for sample in samples)
    assert max(abs(sample) for sample in samples) == 0


def test_master_preserves_stereo_separation_and_impulse_timing(tmp_path):
    source = tmp_path / "stereo.wav"
    output = tmp_path / "stereo_enhanced.wav"
    # Separate channel markers prove that mastering does not crossfeed or
    # downmix, and that limiter lookahead does not move a sound on the clock.
    frames = bytearray(2 * 44100 * 4)
    samples = memoryview(frames).cast("h")
    samples[44100 * 2] = 12000
    samples[(44100 + 11025) * 2 + 1] = 12000
    with wave.open(str(source), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(44100)
        audio.writeframes(frames)
    render_audio_preview(str(source), output, 0, 2, enabled=True)
    frame_count, processed = _wav_samples(output)
    assert frame_count == 2 * 44100
    left, right = processed[::2], processed[1::2]
    assert abs(max(range(len(left)), key=lambda i: abs(left[i])) - 44100) <= 1
    assert abs(max(range(len(right)), key=lambda i: abs(right[i])) - 55125) <= 1
    assert max(abs(x) for x in right[:50000]) == 0
    assert max(abs(x) for x in left[55000:]) < 2


def test_master_gentle_dynamics_recovers_after_a_loud_hit(tmp_path):
    source = tmp_path / "transient.wav"
    output = tmp_path / "transient_enhanced.wav"
    _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
          "aevalsrc=(0.15+0.8*between(t\\,2\\,2.04))*sin(2*PI*440*t):s=44100:d=5",
          "-c:a", "pcm_s16le", str(source)])
    render_audio_preview(str(source), output, 0, 5, enabled=True)
    _, samples = _wav_samples(output)
    mono = samples[::2]
    before = _rms(mono[44100:66150])
    recovered = _rms(mono[4 * 44100:int(4.5 * 44100)])
    early_recovery = _rms(mono[int(2.1 * 44100):int(2.3 * 44100)])
    hit = _rms(mono[2 * 44100:int(2.04 * 44100)])
    assert recovered / before == pytest.approx(1, rel=0.02)
    assert early_recovery / before > 0.7  # no deep ducking/pump after a brief hit
    assert hit / before > 2  # preserve a useful transient contrast


def _true_peak(path: Path) -> float:
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-vn", "-af",
        "loudnorm=I=-16:TP=-1:print_format=json", "-f", "null", "-",
    ], check=True, capture_output=True, text=True, timeout=30)
    measurements, _ = json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind("{"):])
    return float(measurements["input_tp"])


def test_master_leaves_true_peak_headroom_after_aac_encoding(tmp_path):
    source = tmp_path / "loud_treble.wav"
    output = tmp_path / "limited.wav"
    encoded = tmp_path / "limited.m4a"
    _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
          "aevalsrc=0.95*sin(2*PI*10000*t):s=44100:d=3", "-c:a", "pcm_s16le", str(source)])
    render_audio_preview(str(source), output, 0, 3, enabled=True)
    _run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(output),
          "-c:a", "aac", "-b:a", "192k", str(encoded)])
    assert _true_peak(output) <= -0.8
    assert _true_peak(encoded) <= -0.2


@pytest.mark.parametrize("start_time,end_time", [(1, 1), (-0.1, 1)])
def test_audio_preview_rejects_invalid_ranges(start_time, end_time):
    client = TestClient(main.app)
    response = client.post("/api/audio/preview", json={
        "source_video": "C:/Vibe Editor/temp/not-needed.mp4",
        "start_time": start_time,
        "end_time": end_time,
    })
    assert response.status_code == 422


def test_audio_preview_accepts_ranges_longer_than_ninety_seconds():
    request = main.AudioPreviewRequest(
        source_video="C:/Vibe Editor/temp/long-video.mp4", start_time=0, end_time=901,
    )
    assert request.end_time - request.start_time == 901


def test_audio_preview_rejects_silent_source_and_cleans_completed_preview():
    temp_dir = main.APP_ROOT / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    token = uuid.uuid4().hex
    audio_source = temp_dir / f"pytest_audio_{token}.mp4"
    silent_source = temp_dir / f"pytest_silent_{token}.mp4"
    _make_video(audio_source, audio=True, duration=1.0)
    _make_video(silent_source, audio=False, duration=1.0)
    client = TestClient(main.app)
    try:
        silent = client.post("/api/audio/preview", json={
            "source_video": str(silent_source), "start_time": 0, "end_time": 0.5,
        })
        assert silent.status_code == 400
        assert "no audio track" in silent.json()["detail"].lower()

        before = set(temp_dir.glob("audio_preview_*.wav"))
        preview = client.post("/api/audio/preview", json={
            "source_video": str(audio_source), "start_time": 0, "end_time": 0.75,
            "audio_master": {"enabled": True},
        })
        assert preview.status_code == 200, preview.text
        assert preview.headers["content-type"].startswith("audio/wav")
        assert len(preview.content) > 44
        assert set(temp_dir.glob("audio_preview_*.wav")) == before
    finally:
        audio_source.unlink(missing_ok=True)
        silent_source.unlink(missing_ok=True)


@pytest.mark.parametrize("has_audio", [False, True])
def test_renderer_audio_master_keeps_duration_and_audio_stream(tmp_path, monkeypatch, has_audio):
    source = tmp_path / ("with_audio.mp4" if has_audio else "silent.mp4")
    output = tmp_path / "reel.mp4"
    _make_video(source, audio=has_audio, duration=1.0)
    monkeypatch.setattr(renderer_module, "_has_nvenc", lambda: False)

    ReelRenderer().render_reel(
        source_video=str(source), output_mp4=str(output), start_time=0, end_time=1,
        series_text="", song_name="", anime_name="", caption="",
        template={"background": {"type": "black"}, "series_text": {"enabled": False}},
        show_lyrics=False, audio_master={"enabled": True},
    )

    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)],
        check=True, capture_output=True, text=True, timeout=20,
    )
    streams = json.loads(result.stdout)["streams"]
    assert any(stream["codec_type"] == "audio" for stream in streams)
    assert _probe_duration(output) == pytest.approx(1.0, abs=0.08)
