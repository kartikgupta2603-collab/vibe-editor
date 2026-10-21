"""A restrained clarity master shared by Studio audition and export.

Broad EQ and gentle linked compression make the option audible without
per-window loudness chasing. This cannot restore already clipped audio.
"""
import subprocess
from pathlib import Path


def tone_filters() -> list[str]:
    """Reduce rumble/mud, lift presence, and protect stereo peaks without drift."""
    return [
        "aformat=sample_fmts=fltp:channel_layouts=stereo",
        "highpass=f=35:p=2",
        "equalizer=f=110:t=q:w=0.7:g=1.3",
        "equalizer=f=250:t=q:w=0.8:g=-1.5",
        "equalizer=f=3000:t=q:w=0.7:g=3.5",
        "equalizer=f=9000:t=q:w=0.8:g=0.7",
        # A soft knee, mild ratio and slow release preserve musical attacks.
        # Linked gain reduction keeps the stereo image from wandering.
        "acompressor=threshold=0.3:ratio=1.4:attack=25:release=250:makeup=1.25:knee=2.828:link=maximum:detection=rms",
        # Oversample before limiting to catch peaks between source samples.
        # Compensate lookahead latency and leave headroom for AAC encoding.
        "aresample=192000",
        "alimiter=limit=0.89:attack=5:release=100:level=false:latency=true",
        "aresample=44100",
    ]


def run_audio(command: list[str], timeout_seconds: float = 180) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Audio processing timed out before completing.") from exc
    if result.returncode:
        raise RuntimeError(f"Audio processing failed: {result.stderr[-1600:]}")
    return result


def enhancement_filters(source: str, start: float, duration: float) -> list[str]:
    # Fixed processing gives the same timbre and gain at every audition point
    # and in export; it does not normalize quiet passages independently.
    del source, start, duration
    return tone_filters()


def render_audio_preview(source: str, output: Path, start: float, duration: float,
                         enabled: bool) -> None:
    filters = enhancement_filters(source, start, duration) if enabled else ["anull"]
    # Long selections are supported. Scale the watchdog with the selected
    # duration so it only catches a genuinely stalled FFmpeg process.
    timeout_seconds = max(180.0, duration * 2.0 + 60.0)
    run_audio([
        "ffmpeg", "-hide_banner", "-nostdin", "-y", "-ss", str(start), "-t", str(duration),
        "-i", source, "-vn", "-sn", "-af", ",".join(filters),
        "-c:a", "pcm_s16le", "-ac", "2", "-ar", "44100", str(output),
    ], timeout_seconds=timeout_seconds)
