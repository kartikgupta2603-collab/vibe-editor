import json
import os
import re
import base64
import math
import subprocess
import asyncio
import tempfile
import unicodedata
from difflib import SequenceMatcher
import httpx
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.config.settings import get_settings

from app.ai.gemini_transport import GEMINI_MODELS
FULL_SUBTITLE_MODELS = GEMINI_MODELS
ANALYSIS_SAMPLE_SECONDS = 60.0
TRANSIENT_GEMINI_STATUS_CODES = {408, 429, 500, 502, 503, 504}
# Match the Gemini SDK's four retry policy.  A full subtitle request can be
# expensive, and three quick retries were not enough when the service was busy.
GEMINI_MAX_RETRIES = 4


async def post_gemini_with_retry(
    client: httpx.AsyncClient,
    url: str,
    payload: Dict[str, Any],
    model_name: str,
    max_retries: int = GEMINI_MAX_RETRIES,
):
    """Retry temporary Gemini capacity/network failures without blocking FastAPI.

    The app uses the REST endpoint directly, so it must provide the transient
    retry behaviour that Google's SDK supplies automatically.
    """
    last_response = None
    retry_limit = max(0, int(max_retries))
    for attempt in range(retry_limit + 1):
        try:
            response = await client.post(url, json=payload)
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == retry_limit:
                raise
            delay = float(2 ** attempt)
            print(f"[Gemini] {model_name} network busy; retrying in {delay:.0f}s")
            await asyncio.sleep(delay)
            continue

        last_response = response
        # A 429 may be a free-tier quota limit, not a brief capacity blip.
        # Do not turn one user click into repeated requests that make that
        # limit worse; let the caller show the honest wait message instead.
        if response.status_code == 429:
            return response
        if response.status_code not in TRANSIENT_GEMINI_STATUS_CODES or attempt == retry_limit:
            return response

        delay = float(2 ** attempt)
        print(f"[Gemini] {model_name} returned HTTP {response.status_code}; retrying in {delay:.0f}s")
        await asyncio.sleep(delay)

    return last_response


def parse_timestamp(value: Any, default: float) -> float:
    """Parse Gemini timestamp values without discarding an otherwise valid response."""
    if value is None:
        return default
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        value = value.strip().strip('"\'')
        if ":" in value:
            parts = value.split(":")
            try:
                if len(parts) == 2:
                    return float(parts[0]) * 60.0 + float(parts[1])
                if len(parts) == 3:
                    return float(parts[0]) * 3600.0 + float(parts[1]) * 60.0 + float(parts[2])
            except ValueError:
                return default
        try:
            return float(value)
        except ValueError:
            pass
    return default


def parse_gemini_json(text: str) -> Any:
    """Decode JSON responses even when a model wraps it in a Markdown fence."""
    normalized = (text or "").lstrip("\ufeff \t\r\n")
    normalized = re.sub(r"^```(?:json)?\s*", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s*```\s*$", "", normalized).strip()
    return json.loads(normalized)


def normalize_lyrics_payload(data: Any) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Accept object and root-array model payloads while skipping malformed cues."""
    data_dict = data if isinstance(data, dict) else {}
    raw_lyrics = data if isinstance(data, list) else data_dict.get("lyrics", [])
    if not isinstance(raw_lyrics, list):
        raw_lyrics = []
    return data_dict, [item for item in raw_lyrics if isinstance(item, dict)]


def sanitize_lyric_cues(
    raw_lyrics: List[Dict[str, Any]],
    timeline_start: float,
    timeline_end: float,
    timestamps_are_relative: bool = False,
) -> List[Dict[str, Any]]:
    """Keep only ordered, non-overlapping vocal cues from an audio-analysis response.

    Preserve vocal onsets. Resolve overlaps by ending the previous cue sooner,
    rather than shifting later cues forward or silently losing them.
    """
    cues: List[Dict[str, Any]] = []
    for item in raw_lyrics:
        raw_s = parse_timestamp(item.get("start"), float("nan"))
        raw_e = parse_timestamp(item.get("end"), float("nan"))
        if not math.isfinite(raw_s) or not math.isfinite(raw_e) or raw_e <= raw_s:
            continue
        start = raw_s + timeline_start if timestamps_are_relative else raw_s
        end = raw_e + timeline_start if timestamps_are_relative else raw_e
        start = max(timeline_start, min(timeline_end, start))
        end = max(timeline_start, min(timeline_end, end))
        if end - start < 0.04:
            continue

        jp = str(item.get("text_jp") or item.get("text") or "").strip()
        en = str(item.get("text_en") or "").strip()
        romaji = str(item.get("text_romaji") or "").strip()
        if not (jp or en):
            continue

        # Sung English is a transcript, not something to translate creatively.
        if jp and all(not char.isalpha() or "LATIN" in unicodedata.name(char, "") for char in jp):
            en = jp

        cues.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "text_jp": jp,
            "text_romaji": romaji,
            "text_en": en,
            # Sanitization converts any clip-relative model response onto the
            # source-video clock. Preview and export must not guess otherwise.
            "timeline_basis": "absolute",
            # This is an audio-informed phrase estimate, never fabricated word alignment.
            "timing_source": "gemini_audio_estimate",
        })

    cues.sort(key=lambda cue: (cue["start"], cue["end"]))

    # Some model responses isolate a connective such as "If" or "But" into
    # its own flash-frame. That is not a readable lyric subtitle, so attach it
    # to the following uninterrupted phrase without changing its timing gap.
    def is_orphan_fragment(cue: Dict[str, Any]) -> bool:
        text = (cue.get("text_jp") or cue.get("text_en") or "").strip().lower()
        words = re.findall(r"[a-z]+", text)
        return len(words) == 1 and words[0] in {"if", "and", "but", "or", "so", "yet", "then", "that", "the", "a", "an", "to"}

    def join_phrase(prefix: str, phrase: str) -> str:
        prefix, phrase = prefix.strip(), phrase.strip()
        if not prefix:
            return phrase
        if not phrase or phrase.lower().startswith(prefix.lower() + " "):
            return phrase or prefix
        return f"{prefix} {phrase}"

    merged: List[Dict[str, Any]] = []
    index = 0
    while index < len(cues):
        cue = cues[index]
        following = cues[index + 1] if index + 1 < len(cues) else None
        if following and is_orphan_fragment(cue) and following["start"] - cue["end"] <= 0.35:
            following["start"] = cue["start"]
            for field in ("text_jp", "text_en", "text_romaji"):
                following[field] = join_phrase(str(cue.get(field, "")), str(following.get(field, "")))
            index += 1
            continue
        merged.append(cue)
        index += 1

    validated: List[Dict[str, Any]] = []
    for cue in merged:
        if validated and cue["start"] < validated[-1]["end"]:
            previous = validated[-1]
            # Duplicate overlap-context transcriptions are the same occurrence,
            # while a repeated chorus later in the song must remain a new cue.
            same_text = all(previous[field] == cue[field] for field in ("text_jp", "text_en"))
            if same_text and abs(previous["start"] - cue["start"]) <= 0.35:
                previous["end"] = max(previous["end"], cue["end"])
                continue
            if cue["start"] == previous["start"]:
                for field in ("text_jp", "text_en", "text_romaji"):
                    parts = [value for value in (previous[field], cue[field]) if value]
                    previous[field] = " / ".join(dict.fromkeys(parts))
                previous["end"] = max(previous["end"], cue["end"])
                continue
            previous["end"] = cue["start"]
        if cue["end"] - cue["start"] >= 0.04:
            validated.append(cue)
    return validated


def refine_moment_boundaries(start_s: float, end_s: float, max_dur: float, lyrics_items: Optional[List[Dict[str, Any]]] = None) -> tuple:
    """Snaps start and end times to clean vocal phrase boundaries and ensures completeness.
    
    Prevents short, cut-off fragments:
    - Never ends in the middle of a singing vocal line.
    - If a finishing line starts within 1.5s, extends to complete the musical sentence.
    - If start cut is within 1.2s before or after vocals began, snaps to clean vocal onset.
    """
    max_dur = max(0.0, float(max_dur))
    s = max(0.0, min(max_dur, float(start_s)))
    e = min(max_dur, max(s + 2.0, float(end_s)))

    if not lyrics_items:
        return round(s, 2), round(e, 2)

    # 1. Snap start cleanly to vocal onset if start is near vocal line beginning
    for item in lyrics_items:
        try:
            l_s = float(item.get("start", 0))
            l_e = float(item.get("end", 0))
        except (ValueError, TypeError):
            continue
        # If start is within 1.2s before or after vocal onset, snap cleanly to vocal onset
        if abs(s - l_s) <= 1.2 or (l_s <= s < l_s + 1.5):
            s = l_s
            break

    # 2. Never cut off the single lyric line that contained the originally
    # requested end.  Keep the original endpoint fixed while selecting it:
    # mutating ``e`` in this loop used to make every following line eligible.
    requested_end = e
    containing_line_end = None
    for item in lyrics_items:
        try:
            l_s = float(item.get("start", 0))
            l_e = float(item.get("end", 0))
        except (ValueError, TypeError):
            continue
        if l_s < requested_end <= l_e + 0.35:
            containing_line_end = l_e
            
            break
    if containing_line_end is not None:
        e = min(max_dur, containing_line_end + 0.4)
    # 3. If the immediately following line starts within 1.5s and finishes within 6s, extend to include it
    for item in lyrics_items:
        try:
            l_s = float(item.get("start", 0))
            l_e = float(item.get("end", 0))
        except (ValueError, TypeError):
            continue
        if e < l_s <= e + 1.5 and (l_e - e) < 6.0:
            e = min(max_dur, l_e + 0.4)
            break

    return round(s, 2), round(e, 2)


async def extract_timed_audio_samples(video_path: str, duration: float, full_coverage: bool = False) -> List[Dict[str, Any]]:
    """Return continuous or high-fidelity audio evidence covering the song.

    For songs and anime opening/ending videos up to 360s (6 minutes), extracts
    the FULL CONTINUOUS audio track so Gemini listens to the unbroken performance
    from 0.0s to end, hearing entire chorus sections, build-ups, and natural musical
    resolutions without any artificial sample boundaries.
    """
    if not video_path or not os.path.isfile(video_path) or duration <= 0:
        return []

    # If duration <= 360s (6 minutes), provide the entire uninterrupted audio track
    if duration <= 360.0:
        tmp_path = ""
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_audio:
                tmp_path = tmp_audio.name
            command = [
                "ffmpeg", "-y", "-i", video_path, "-ss", "0.0", "-t", str(duration),
                "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", tmp_path
            ]
            result = await asyncio.to_thread(subprocess.run, command, capture_output=True, timeout=90)
            if result.returncode == 0 and os.path.getsize(tmp_path) > 100:
                with open(tmp_path, "rb") as audio_file:
                    encoded = base64.b64encode(audio_file.read()).decode("utf-8")
                return [
                    {
                        "text": (
                            f"FULL UNBROKEN AUDIO TRACK — from 0.0s to {duration:.1f}s. "
                            f"Listen to the complete performance from start to finish. "
                            f"Identify the complete, uncut best section (no matter how long)."
                        )
                    },
                    {"inlineData": {"mimeType": "audio/mpeg", "data": encoded}},
                ]
        except Exception as exc:
            print(f"[Song Analysis] Full audio track extraction error: {exc}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    # For longer media (>6 minutes), extract long overlapping 90s passages
    clip_length = 90.0
    latest_start = max(0.0, duration - clip_length)
    starts = sorted({round(latest_start * fraction, 2) for fraction in (0.0, 0.25, 0.5, 0.75, 1.0)})
    if full_coverage:
        starts = [float(start) for start in range(0, int(duration + clip_length - 1), int(clip_length)) if start < duration]

    parts: List[Dict[str, Any]] = []
    for start in starts:
        tmp_path = ""
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_audio:
                tmp_path = tmp_audio.name
            command = [
                "ffmpeg", "-y", "-ss", str(start), "-t", str(clip_length),
                "-i", video_path, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k", tmp_path
            ]
            result = await asyncio.to_thread(subprocess.run, command, capture_output=True, timeout=60)
            if result.returncode == 0 and os.path.getsize(tmp_path) > 100:
                with open(tmp_path, "rb") as audio_file:
                    encoded = base64.b64encode(audio_file.read()).decode("utf-8")
                end = min(duration, start + clip_length)
                parts.extend([
                    {"text": f"AUDIO EVIDENCE — source timeline {start:.1f}s to {end:.1f}s."},
                    {"inlineData": {"mimeType": "audio/mpeg", "data": encoded}},
                ])
        except Exception as exc:
            print(f"[Song Analysis] Audio sample at {start:.1f}s unavailable: {exc}")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
    if full_coverage and len(parts) != len(starts) * 2:
        raise RuntimeError("Could not extract every audio passage for full subtitles. Check the source audio and FFmpeg, then retry.")
    return parts

async def extract_hook_video(video_path: str, start_time: float, end_time: float) -> Dict[str, Any]:
    """Prepare only the selected reel as bounded audiovisual evidence off the event loop."""
    if not video_path or not os.path.isfile(video_path):
        raise ValueError("Load a readable video before generating hooks.")
    if not all(math.isfinite(t) for t in (start_time, end_time)) or start_time < 0 or not 0 < end_time - start_time <= 360:
        raise ValueError("Select a reel section between 0 and 360 seconds long.")

    def prepare():
        probe = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=index,codec_type",
            "-of", "json", video_path,
        ], capture_output=True, text=True, timeout=30)
        if probe.returncode:
            raise RuntimeError("Cannot inspect the selected video: " + probe.stderr[-400:])
        info = json.loads(probe.stdout)
        duration = float(info.get("format", {}).get("duration", 0))
        if not math.isfinite(duration) or start_time >= duration or end_time > duration + 0.25:
            raise ValueError("The selected range is outside this video. Adjust the trim and retry.")
        streams = info.get("streams", [])
        video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
        audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
        if video_stream is None:
            raise ValueError("The selected file has no video stream to analyze.")
        stream_maps = ["-map", f"0:{video_stream['index']}"]
        if audio_stream is not None:
            stream_maps += ["-map", f"0:{audio_stream['index']}"]
        temp_root = Path(__file__).resolve().parents[2] / "temp"
        temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="reel-hooks-", dir=temp_root) as directory:
            output = Path(directory) / "selected-reel.mp4"
            clip_duration = min(end_time, duration) - start_time
            # Spend more detail on short reels, while keeping six-minute clips
            # below the inline request limit (including audio/base64 overhead).
            video_bitrate = min(900_000, int(12_000_000 * 8 / clip_duration) - 96_000)
            command = [
                "ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", str(start_time), "-i", video_path,
                "-t", str(min(end_time, duration) - start_time), *stream_maps,
                "-vf", "scale=w='min(768,iw)':h='min(768,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=12",
                "-c:v", "libx264", "-preset", "fast", "-b:v", str(video_bitrate),
                "-maxrate", str(video_bitrate), "-bufsize", str(video_bitrate * 2),
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "1", "-movflags", "+faststart",
                str(output),
            ]
            result = subprocess.run(command, capture_output=True, text=True, timeout=120)
            if result.returncode or not output.exists() or output.stat().st_size < 100:
                raise RuntimeError("Could not prepare the selected reel for AI: " + result.stderr[-400:])
            # Leave space for base64 expansion and the prompt under a 20 MB request.
            if output.stat().st_size > 14_000_000:
                raise ValueError("The selected reel is too large for hook analysis. Select a shorter section.")
            return {
                "part": {"inlineData": {"mimeType": "video/mp4", "data": base64.b64encode(output.read_bytes()).decode("ascii")},
                         "videoMetadata": {"fps": 3 if clip_duration <= 90 else 1}},
                "has_audio": audio_stream is not None,
                "duration": clip_duration,
            }

    try:
        return await asyncio.to_thread(prepare)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("Could not prepare the reel. Check FFmpeg/FFprobe and try a shorter selection.") from exc


DEFAULT_FALLBACK_CAPTIONS = [
    "This song just hits different.",
    "Some songs never get old.",
    "You already know this one hits.",
    "This opening is unforgettable.",
    "One of the hardest anime songs ever.",
    "Tell me this doesn't give you chills."
]

def compute_word_timings(text: str, start_time: float, end_time: float, is_japanese: bool = False) -> List[Dict[str, Any]]:
    """Creates visual-only proportional word timings when no audio alignment exists."""
    if not text:
        return []
    clean_text = str(text).strip()
    if not clean_text:
        return []

    # Tokenize words/chunks - handles pure Japanese, pure English, and mixed English + Japanese
    has_japanese = any('\u3040' <= c <= '\u30ff' or '\u4e00' <= c <= '\u9fff' for c in clean_text)
    if has_japanese:
        tokens = re.findall(r"[a-zA-Z0-9]+(?:['’\-][a-zA-Z0-9]+)*|[\u4e00-\u9faf]+|[ぁ-ん]+|[ァ-ヴー]+|[^\s\w]", clean_text)
        if not tokens:
            tokens = [t for t in clean_text.split() if t] or [clean_text]
    else:
        tokens = [t for t in clean_text.split() if t]
        if not tokens:
            tokens = [clean_text]

    duration = max(0.2, end_time - start_time)
    weights = [max(1, len(t)) for t in tokens]
    total_weight = sum(weights) or 1

    words = []
    current_time = start_time
    for token, weight in zip(tokens, weights):
        word_dur = duration * (weight / total_weight)
        word_end = current_time + word_dur
        words.append({
            "word": token,
            "start": round(current_time, 2),
            "end": round(word_end, 2)
        })
        current_time = word_end

    return words

class GeminiClient:
    def __init__(self):
        pass

    def _fallback_response(
        self,
        cleaned_song: str = "",
        cleaned_anime: str = "",
        video_title: str = "",
        duration: float = 90.0,
        **kwargs: Any
    ) -> Dict[str, Any]:
        fallback_song = cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song")
        fallback_anime = cleaned_anime or "Anime Series"

        return {
            "status": "unavailable",
            "message": "Gemini analysis is unavailable. No moment was selected from duration alone.",
            "song_name": fallback_song,
            "anime_name": fallback_anime,
            "recommended_start": None,
            "recommended_end": None,
            "duration": 0.0,
            "clip_type": "No analyzed moment",
            "score": None,
            "reason": "No audio analysis was performed.",
            "alternatives": []
        }

    async def analyze_song(
        self,
        song_name: Optional[str] = "",
        anime_name: Optional[str] = "",
        duration: float = 90.0,
        video_title: Optional[str] = "",
        api_key_override: Optional[str] = None,
        video_path: Optional[str] = ""
    ) -> Dict[str, Any]:
        from app.ai.song_analysis import analyze_song as run
        return await run(song_name=song_name, anime_name=anime_name, duration=duration, video_title=video_title, api_key_override=api_key_override, video_path=video_path)

    async def generate_lyrics(
        self,
        song_name: str,
        anime_name: str,
        start_time: float,
        end_time: float,
        video_title: Optional[str] = "",
        api_key_override: Optional[str] = None,
        video_path: Optional[str] = "",
        preferred_style: Optional[str] = ""
    ) -> Dict[str, Any]:
        from app.ai.subtitles import generate_subtitles as run
        return await run(video_path, api_key_override or get_settings().gemini_api_key, start_time=start_time, end_time=end_time)

    async def generate_full_video_subtitles(
        self,
        video_path: str,
        song_name: Optional[str] = "",
        anime_name: Optional[str] = "",
        video_title: Optional[str] = "",
        duration: float = 0.0,
        api_key_override: Optional[str] = None
    ) -> Dict[str, Any]:
        from app.ai.subtitles import generate_subtitles as run
        return await run(video_path, api_key_override or get_settings().gemini_api_key)


    async def generate_viral_hooks(
        self,
        song_name: str = "",
        anime_name: str = "",
        video_title: str = "",
        mood: str = "",
        moment_type: str = "",
        moment_reason: str = "",
        creator_instruction: str = "",
        api_key_override: Optional[str] = None,
        video_path: str = "",
        start_time: float = 0.0,
        end_time: float = 0.0,
    ) -> List[Dict[str, str]]:
        from app.ai.reel_copy import generate_viral_hooks as run
        return await run(song_name=song_name, anime_name=anime_name, video_title=video_title, mood=mood, moment_type=moment_type, moment_reason=moment_reason, creator_instruction=creator_instruction, api_key_override=api_key_override, video_path=video_path, start_time=start_time, end_time=end_time)

    async def generate_instagram_caption(
        self,
        song_name: str = "",
        anime_name: str = "",
        video_title: str = "",
        hook: str = "",
        moment_type: str = "",
        creator_instruction: str = "",
        api_key_override: Optional[str] = None,
    ) -> Dict[str, str]:
        from app.ai.reel_copy import generate_instagram_caption as run
        return await run(song_name=song_name, anime_name=anime_name, video_title=video_title, hook=hook, moment_type=moment_type, creator_instruction=creator_instruction, api_key_override=api_key_override)

gemini_client = GeminiClient()
