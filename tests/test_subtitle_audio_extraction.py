"""Real FFmpeg regression fixtures for audio aligned to the media timeline."""
import array
import base64
import io
import math
import shutil
import subprocess
import wave

import pytest

from app.ai.subtitle_alignment import _extract_audio
from app.ai import subtitle_alignment
from app.ai.subtitle_alignment import SubtitleAlignmentError


@pytest.fixture(scope="module")
def media(tmp_path_factory):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg and FFprobe are required for timeline extraction tests")
    directory = tmp_path_factory.mktemp("subtitle-audio-timelines")
    definitions = {
        "short_tail": (8, 3, 0, 0),
        "delayed": (8, 3, 3, 0),
        "shifted": (8, 8, 0, 5),
        "later": (100, 95, 0, 0),
    }
    paths = {}
    for name, (video_seconds, audio_seconds, audio_delay, timestamp_offset) in definitions.items():
        path = directory / f"{name}.mkv"
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                   "-f", "lavfi", "-i", f"color=c=black:s=32x32:r=1:d={video_seconds}"]
        if audio_delay:
            command += ["-itsoffset", str(audio_delay)]
        command += ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=16000:duration={audio_seconds}",
                    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast", "-c:a", "pcm_s16le"]
        if timestamp_offset:
            command += ["-output_ts_offset", str(timestamp_offset)]
        subprocess.run([*command, str(path)], capture_output=True, check=True, timeout=30)
        paths[name] = path
    return paths


@pytest.mark.parametrize("name,start,end,audible_seconds", [
    ("short_tail", 0, 8, {0, 1, 2}),
    ("short_tail", 4, 8, set()),
    ("delayed", 0, 8, {3, 4, 5}),
    ("delayed", 1, 8, {2, 3, 4}),
    ("delayed", 4, 8, {0, 1}),
    ("shifted", 0, 8, set(range(8))),
    ("shifted", 3, 8, set(range(5))),
    ("later", 90, 100, set(range(5))),
])
def test_audio_keeps_media_clock_and_only_pads_genuine_absence(media, name, start, end, audible_seconds):
    encoded, duration = _extract_audio(str(media[name]), start, end)
    assert duration == pytest.approx(end - start, abs=1 / 16000)
    with wave.open(io.BytesIO(base64.b64decode(encoded)), "rb") as audio:
        assert audio.getnchannels() == 1
        assert audio.getframerate() == 16000
        assert audio.getsampwidth() == 2
        samples = array.array("h", audio.readframes(audio.getnframes()))
    for second in range(int(duration)):
        window = samples[second * 16000:(second + 1) * 16000]
        rms = math.sqrt(sum(value * value for value in window) / len(window))
        if second in audible_seconds:
            assert rms > 2000, f"Valid audio was lost or shifted at relative second {second}"
        else:
            assert rms < 1, f"Audio shifted into a genuinely empty interval at relative second {second}"


def test_decode_failure_cannot_be_hidden_by_silence_padding(media, monkeypatch):
    real_run = subtitle_alignment.subprocess.run
    decode_error = b"Invalid PCM packet: corrupt audio frame"
    commands = []

    def fail_decode(command, *args, **kwargs):
        if command[0] == "ffmpeg":
            commands.append(command)
            raise subprocess.CalledProcessError(1, command, stderr=decode_error)
        return real_run(command, *args, **kwargs)

    monkeypatch.setattr(subtitle_alignment.subprocess, "run", fail_decode)
    with pytest.raises(SubtitleAlignmentError) as raised:
        _extract_audio(str(media["short_tail"]), 0, 8)
    assert "-xerror" in commands[0]
    assert isinstance(raised.value.__cause__, subprocess.CalledProcessError)
    assert raised.value.__cause__.stderr == decode_error
