import json
import os
import re
import base64
import subprocess
import asyncio
import tempfile
import httpx
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.config.settings import get_settings

# Active Google Gemini models verified for generateContent
GEMINI_MODELS = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.6-flash", "gemini-3-flash-preview"]
ANALYSIS_SAMPLE_SECONDS = 60.0


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

    Gemini can estimate phrase timestamps, but estimates must never be stretched or
    overlapped by the client: either behavior makes the displayed cue visibly late.
    """
    cues: List[Dict[str, Any]] = []
    for item in raw_lyrics:
        raw_s = parse_timestamp(item.get("start"), 0.0)
        raw_e = parse_timestamp(item.get("end"), raw_s)
        start = raw_s + timeline_start if timestamps_are_relative else raw_s
        end = raw_e + timeline_start if timestamps_are_relative else raw_e
        start = max(timeline_start, min(timeline_end, start))
        end = max(timeline_start, min(timeline_end, end))
        if end - start < 0.15:
            continue

        jp = str(item.get("text_jp", "")).strip()
        en = str(item.get("text_en", "")).strip()
        romaji = str(item.get("text_romaji", "")).strip()
        if not (jp or en):
            continue

        # Sung English is a transcript, not something to translate creatively.
        if jp and not re.search(r"[\u3040-\u30ff\u4e00-\u9fff]", jp):
            en = jp

        cues.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "text_jp": jp,
            "text_romaji": romaji,
            "text_en": en,
            # This is an audio-informed phrase estimate, never fabricated word alignment.
            "timing_source": "gemini_audio_estimate",
        })

    cues.sort(key=lambda cue: (cue["start"], cue["end"]))
    validated: List[Dict[str, Any]] = []
    for cue in cues:
        if validated and cue["start"] < validated[-1]["end"]:
            cue["start"] = validated[-1]["end"]
        if cue["end"] - cue["start"] >= 0.15:
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
        """Generates clearly labelled duration-based trim suggestions."""
        if duration <= 45.0:
            rec_start = 0.0
            rec_end = round(duration, 1)
            rec_type = f"Full Track ({int(round(duration))}s)"
        elif duration <= 95.0:
            # Standard 90s anime opening: generous full chorus and climax (e.g. 35s to 90s)
            rec_start = round(min(duration * 0.38, 35.0), 1)
            rec_end = round(duration, 1)
            rec_type = f"Later Section ({int(round(rec_end - rec_start))}s)"
        else:
            # Full-length track: full 45-65s complete chorus arc
            rec_len = min(duration, max(45.0, duration * 0.3))
            rec_start = round(min(duration * 0.35, max(0.0, duration - rec_len)), 1)
            rec_end = round(min(rec_start + rec_len, duration), 1)
            rec_type = f"Middle Section ({int(round(rec_end - rec_start))}s)"

        alt1_len = min(duration, max(25.0, duration * 0.4 if duration > 0 else 35.0))
        alt1_start = 0.0
        alt1_end = round(min(alt1_start + alt1_len, duration), 1)

        alt2_len = min(duration, max(30.0, duration * 0.45 if duration > 0 else 40.0))
        alt2_start = round(min(max(0.0, duration - alt2_len), max(rec_end - 15.0, duration * 0.55)), 1)
        alt2_end = round(min(alt2_start + alt2_len, duration), 1)

        fallback_song = cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song")
        fallback_anime = cleaned_anime or "Anime Series"

        return {
            "status": "fallback",
            "message": "Gemini API key not configured. Showing duration-based trim suggestions only.",
            "song_name": fallback_song,
            "anime_name": fallback_anime,
            "recommended_start": rec_start,
            "recommended_end": rec_end,
            "duration": round(rec_end - rec_start, 1),
            "clip_type": rec_type,
            "score": None,
            "reason": "Suggested from duration only; no audio analysis was performed.",
            "subtitle_style": "bold_lyrics",
            "subtitle_style_reason": "Default bold high-contrast styling.",
            "alternatives": [
                {
                    "start": alt1_start,
                    "end": alt1_end,
                    "duration": round(alt1_end - alt1_start, 1),
                    "clip_type": f"Opening Section ({int(round(alt1_end - alt1_start))}s)",
                    "score": None,
                    "reason": "Duration-based alternative; no audio analysis was performed."
                },
                {
                    "start": alt2_start,
                    "end": alt2_end,
                    "duration": round(alt2_end - alt2_start, 1),
                    "clip_type": f"Ending Section ({int(round(alt2_end - alt2_start))}s)",
                    "score": None,
                    "reason": "Duration-based alternative; no audio analysis was performed."
                }
            ]
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
        """Analyzes the song, identifies accurate song/anime names, finds the most replayed section, selects the best subtitle style, and generates vocal-synced subtitles."""
        api_key = api_key_override or get_settings().gemini_api_key

        cleaned_song = (song_name or "").strip()
        cleaned_anime = (anime_name or "").strip()

        if not api_key:
            return self._fallback_response(
                cleaned_song=cleaned_song,
                cleaned_anime=cleaned_anime,
                video_title=video_title,
                duration=duration
            )

        prompt = f"""You are an elite Japanese musicologist, anime song expert, and master audio editor.
Your task is to analyze this anime song, accurately identify the official song title and anime name, pinpoint the ABSOLUTE BEST, MOST ICONIC, and HIGHEST-RETENTION section of the song, and select the best visual subtitle preset and synchronized lyrics.

INPUT DATA:
- Song Name Hint: "{cleaned_song}"
- Anime Name Hint: "{cleaned_anime}"
- Video Title / Filename: "{video_title or ''}"
- Total Audio Duration: {duration:.1f} seconds.

AUDIO EVIDENCE:
- The audio track is attached. Listen to the entire performance from 0.0s to {duration:.1f}s.
- Base your recommendation on audible vocals, musical transitions, energy peaks, and natural phrase boundaries.

CRITICAL DIRECTIVES FOR SELECTING THE BEST MOMENT (NO MATTER HOW LONG):
1. COMPLETE MUSICAL SECTIONS ONLY — NO CUTTING SHORT:
   - The user wants the COMPLETE, FULL-LENGTH BEST PART OF THE SONG, NO MATTER HOW LONG IT IS!
   - DO NOT provide short, clipped, or unfinished 10-20s snippets!
   - DO NOT truncate or cut off in the middle of a chorus, vocal sentence, melody, or phrase!
   - Whether the best part is 35s, 50s, 65s, 80s, or the ENTIRE 90-second anime opening, deliver the FULL, COMPLETE musical arc.
   - For a 90-second anime TV-size opening, the best part is almost always the FULL CHORUS AND CLIMAX (typically 40 to 60+ seconds long) or the ENTIRE continuous 90s opening if the whole song is iconic.

2. PRECISE MUSICAL BOUNDARIES:
   - START: Start cleanly right at the natural beginning of the musical section (e.g. the exact moment the chorus vocals/drop begin, or the iconic intro line). Never start mid-word or mid-syllable!
   - FINISH: End cleanly on the natural musical resolution where the vocal sentence, chorus cadence, or held note resolves completely. NEVER cut off mid-lyric, mid-sentence, or mid-breath!

3. ALTERNATIVE FULL-LENGTH MOMENTS:
   - Provide 1 or 2 alternative complete moments (e.g. Full Opening Riff + Verse 1, or Dramatic Bridge + Final Chorus). Each alternative must also be a complete, satisfying musical section.

4. RECOMMENDED SUBTITLE STYLE PRESET:
   Select the single best matching visual subtitle preset out of these 4 options based on the song's energy, genre, tempo, and anime visual aesthetic:
   - "bold_lyrics": High-energy anime rock, heavy drums, intense drive, hype shonen themes.
   - "anime": Cute, idol pop, magical, sparkling, dreamy aesthetic.
   - "jp_en": Classic anime opening/ending, nostalgic, balanced dual fansub with sky blue English translation.
   - "minimal": Elegant ballads, acoustic, emotional piano, clean modern aesthetic with soft shadow.

5. SYNCHRONIZED DUAL-LANGUAGE LYRICS & TRANSLATION RULES:
   - Provide sequential synchronized vocal lyric lines for the recommended clip:
     * "start": float seconds when vocal starts
     * "end": float seconds when vocal phrase ends
     * "text_jp": ORIGINAL VOCAL LYRICS AS SUNG. When sung in Japanese, write authentic Kanji/Kana. When sung in English or mixed Japanese + English (e.g. "Fly high!! 汗と涙で", "We are fighting dreamers"), KEEP SUNG ENGLISH WORDS EXACTLY IN ENGLISH! NEVER convert sung English into Katakana or Japanese translation! If a line is 100% English, "text_jp" must be the exact sung English text.
     * "text_romaji": Clean Romanized pronunciation of any Japanese words (English words remain in English).
     * "text_en": ACCURATE, NATURAL ENGLISH TRANSLATION. Translate faithfully and accurately based on the song's true context. DO NOT hallucinate poetic filler. For mixed Japanese + English lines, KEEP original English words intact and accurately translate the Japanese portion around them. For 100% English lines, "text_en" MUST BE IDENTICAL to the sung English text (no redundant re-translation). Each line must be a single short phrase (max 6-10 words / 12-18 characters).

Return ONLY a valid JSON object matching this exact structure:
{{
  "song_name": "<Clean standardized Song Title in Latin/English, e.g. 'Guitar, Loneliness and Blue Planet'>",
  "anime_name": "<Official Anime Series Title, e.g. 'Bocchi the Rock!'>",
  "recommended_start": <float seconds or "MM:SS", e.g. 42.5>,
  "recommended_end": <float seconds or "MM:SS", e.g. 90.0>,
  "clip_type": "<e.g. 'Full Chorus & Climax (48s)', 'Complete Climax Section (55s)', 'Full Anime Opening (90s)'>",
  "score": <integer 90-99>,
  "reason": "<one compelling sentence explaining why fans love and replay this exact complete part of the song>",
  "subtitle_style": "<'bold_lyrics' | 'anime' | 'jp_en' | 'minimal'>",
  "subtitle_style_reason": "<one short sentence explaining why this subtitle style fits this song's aesthetic>",
  "lyrics": [
    {{
      "start": <float seconds>,
      "end": <float seconds>,
      "text_jp": "<Japanese lyrics>",
      "text_romaji": "<Romanized Japanese>",
      "text_en": "<English translation>"
    }}
  ],
  "alternatives": [
    {{
      "start": <float seconds or "MM:SS">,
      "end": <float seconds or "MM:SS">,
      "clip_type": "<e.g. 'Full Intro & Verse 1 (35s)', 'Extended Bridge & Drop (42s)'>",
      "score": <integer 80-95>,
      "reason": "<why fans replay this alternative complete moment>"
    }}
  ]
}}
DO NOT include markdown formatting or backticks outside the JSON. Return raw JSON.
"""

        def parse_time_value(val: Any, default: float) -> float:
            if val is None:
                return default
            if isinstance(val, (int, float)):
                return float(val)
            if isinstance(val, str):
                val = val.strip().strip('"\'')
                if ":" in val:
                    parts = val.split(":")
                    if len(parts) == 2:
                        try:
                            return float(parts[0]) * 60.0 + float(parts[1])
                        except ValueError:
                            pass
                    elif len(parts) == 3:
                        try:
                            return float(parts[0]) * 3600.0 + float(parts[1]) * 60.0 + float(parts[2])
                        except ValueError:
                            pass
                try:
                    return float(val)
                except ValueError:
                    pass
            return default

        # Prioritize Google's most reliable and responsive models first
        models_to_try = GEMINI_MODELS

        content_parts = [{"text": prompt}]
        content_parts.extend(await extract_timed_audio_samples(video_path or "", duration))
        if not any("inlineData" in part for part in content_parts):
            raise RuntimeError("Audio analysis requires readable source audio. Re-import the video and check that FFmpeg can extract its audio.")
        payload = {
            "contents": [{"parts": content_parts}],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 12288,
                "responseMimeType": "application/json"
            }
        }

        async with httpx.AsyncClient(timeout=35.0) as client:
            last_err = None
            for model_name in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                try:
                    response = await client.post(url, json=payload)
                    if response.status_code == 200:
                        res_data = response.json()
                        candidates = res_data.get("candidates", [])
                        if not candidates:
                            continue
                        text = candidates[0]["content"]["parts"][0]["text"]
                        parsed_data = parse_gemini_json(text)
                        data_dict, raw_lyrics_data = normalize_lyrics_payload(parsed_data)
                        # A root list is a valid lyric response; normalize it into the
                        # object shape used by the hook-analysis response below.
                        data = dict(data_dict)
                        if raw_lyrics_data:
                            data["lyrics"] = raw_lyrics_data
                        
                        # Sanitize and parse times (supports float, int, and MM:SS)
                        rec_start = parse_time_value(data_dict.get("recommended_start"), 35.0 if duration <= 95.0 else 45.0)
                        rec_end = parse_time_value(data_dict.get("recommended_end"), duration if duration <= 95.0 else rec_start + 45.0)
                        
                        rec_start = max(0.0, min(max(0.0, duration - 0.1), rec_start))
                        if rec_end <= rec_start:
                            rec_end = min(duration, rec_start + (45.0 if duration > 50.0 else duration))
                        else:
                            rec_end = min(duration, rec_end)

                        clip_duration = round(rec_end - rec_start, 1)
                        clip_type = data.get("clip_type") or f"Full Section ({int(clip_duration)}s)"

                        # Normalize score (0-10 -> 0-100)
                        raw_score = data.get("score", 75)
                        if isinstance(raw_score, (int, float)):
                            score_val = int(round(raw_score * 10.0)) if raw_score <= 10.0 else int(round(raw_score))
                        else:
                            score_val = 75
                        score_val = max(0, min(100, score_val))

                        # Sanitize alternatives
                        alts = []
                        if "alternatives" in data and isinstance(data["alternatives"], list):
                            for alt in data["alternatives"]:
                                if not isinstance(alt, dict):
                                    continue
                                a_start = parse_time_value(alt.get("start"), max(0.0, rec_start - 30.0))
                                a_end = parse_time_value(alt.get("end"), a_start + 35.0)
                                a_score = alt.get("score", 90)
                                if isinstance(a_score, (int, float)):
                                    a_score = int(round(a_score * 10.0)) if a_score <= 10.0 else int(round(a_score))
                                else:
                                    a_score = 70
                                a_score = max(0, min(100, a_score))
                                a_start = max(0.0, min(duration, a_start))
                                a_end = max(a_start + 1.0, min(duration, a_end))
                                a_dur = round(a_end - a_start, 1)
                                alts.append({
                                    "start": a_start,
                                    "end": a_end,
                                    "duration": a_dur,
                                    "clip_type": alt.get("clip_type") or f"Full Section ({int(a_dur)}s)",
                                    "score": a_score,
                                    "reason": alt.get("reason", "Secondary complete moment.")
                                })

                        if len(alts) == 0:
                            alt1_len = min(duration, max(25.0, duration * 0.4 if duration > 0 else 35.0))
                            alt1_start = 0.0
                            alt1_end = round(min(alt1_start + alt1_len, duration), 1)
                            alts.append({
                                "start": alt1_start,
                                "end": alt1_end,
                                "duration": round(alt1_end - alt1_start, 1),
                                "clip_type": f"Opening Build & Hook ({int(round(alt1_end - alt1_start))}s)",
                                "score": 89,
                                "reason": "Complete opening section and introductory hook."
                            })

                        if len(alts) == 1:
                            alt2_len = min(duration, max(30.0, duration * 0.45 if duration > 0 else 40.0))
                            alt2_start = round(min(max(0.0, duration - alt2_len), max(rec_end - 15.0, duration * 0.55)), 1)
                            alt2_end = round(min(alt2_start + alt2_len, duration), 1)
                            alts.append({
                                "start": alt2_start,
                                "end": alt2_end,
                                "duration": round(alt2_end - alt2_start, 1),
                                "clip_type": f"Bridge & Climax Finish ({int(round(alt2_end - alt2_start))}s)",
                                "score": 87,
                                "reason": "Emotional peak vocal build and climax cadence."
                            })

                        identified_song = (data.get("song_name") or cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song")).strip()
                        identified_anime = (data.get("anime_name") or cleaned_anime or "Anime Series").strip()
                        data["song_name"] = identified_song
                        data["anime_name"] = identified_anime

                        # Sanitize and validate recommended subtitle style preset
                        allowed_styles = ["bold_lyrics", "anime", "jp_en", "minimal"]
                        raw_sub_style = str(data.get("subtitle_style", "bold_lyrics")).strip().lower()
                        chosen_sub_style = raw_sub_style if raw_sub_style in allowed_styles else "bold_lyrics"
                        sub_style_reason = data.get("subtitle_style_reason") or f"Optimal '{chosen_sub_style}' typography selected for '{identified_song}'."
                        data["subtitle_style"] = chosen_sub_style
                        data["subtitle_style_reason"] = sub_style_reason

                        # Parse initial synchronized dual-language lyrics from audio/text analysis
                        lyrics_list = sanitize_lyric_cues(raw_lyrics_data or [], 0.0, duration)

                        # AUTOMATICALLY GENERATE VOCAL-SYNCHRONIZED FULL-VIDEO SUBTITLES
                        # Subtitles cover the whole video so clips don't need re-generating per clip
                        try:
                            full_sub_res = None if lyrics_list and duration <= 360.0 else await self.generate_full_video_subtitles(
                                video_path=video_path,
                                song_name=identified_song,
                                anime_name=identified_anime,
                                video_title=video_title,
                                duration=duration,
                                api_key_override=api_key
                            )
                            if full_sub_res and isinstance(full_sub_res, dict):
                                gen_lyrics = full_sub_res.get("lyrics", [])
                                if gen_lyrics and len(gen_lyrics) > 0:
                                    lyrics_list = gen_lyrics
                                if full_sub_res.get("subtitle_style") in allowed_styles:
                                    data["subtitle_style"] = full_sub_res["subtitle_style"]
                                if full_sub_res.get("subtitle_style_reason"):
                                    data["subtitle_style_reason"] = full_sub_res["subtitle_style_reason"]
                        except Exception as e_full:
                            print(f"[Analyze Song] Full subtitles generation note: {e_full}")

                        # Refine boundaries against synchronized lyrics so it never cuts off mid-lyric or mid-sentence
                        rec_start, rec_end = refine_moment_boundaries(rec_start, rec_end, duration, lyrics_list)
                        if duration >= 45.0 and (rec_end - rec_start) < 25.0:
                            # If model returned a short clipped fragment, expand to include the full chorus
                            rec_end = min(duration, max(rec_start + 35.0, rec_end))
                            rec_start, rec_end = refine_moment_boundaries(rec_start, rec_end, duration, lyrics_list)

                        # Refine alternatives
                        for a in alts:
                            a_s, a_e = refine_moment_boundaries(a["start"], a["end"], duration, lyrics_list)
                            a["start"] = a_s
                            a["end"] = a_e
                            a["duration"] = round(a_e - a_s, 1)

                        clip_duration = round(rec_end - rec_start, 1)
                        data["lyrics"] = lyrics_list
                        data["recommended_start"] = round(rec_start, 1)
                        data["recommended_end"] = round(rec_end, 1)
                        data["duration"] = clip_duration
                        data["clip_type"] = clip_type
                        data["score"] = score_val
                        data["alternatives"] = alts
                        data["status"] = "success"
                        data["model_used"] = model_name
                        return data
                    else:
                        last_err = f"{model_name} returned {response.status_code}: {response.text[:100]}"
                except Exception as ex:
                    last_err = str(ex)
                    continue

            # If all models failed, fall back with dynamic times calculated from actual video duration
            if duration <= 45.0:
                rec_start = 0.0
                rec_end = round(duration, 1)
                rec_type = f"Full Track ({int(round(duration))}s)"
            elif duration <= 95.0:
                # Standard 90s anime opening: full chorus and climax
                rec_start = round(min(duration * 0.38, 35.0), 1)
                rec_end = round(duration, 1)
                rec_type = f"Later Section ({int(round(rec_end - rec_start))}s)"
            else:
                # Full-length track: full 45-65s complete chorus arc
                rec_len = min(duration, max(45.0, duration * 0.3))
                rec_start = round(min(duration * 0.35, max(0.0, duration - rec_len)), 1)
                rec_end = round(min(rec_start + rec_len, duration), 1)
                rec_type = f"Middle Section ({int(round(rec_end - rec_start))}s)"

            alt1_len = min(duration, max(25.0, duration * 0.4 if duration > 0 else 35.0))
            alt1_start = 0.0
            alt1_end = round(min(alt1_start + alt1_len, duration), 1)

            alt2_len = min(duration, max(30.0, duration * 0.45 if duration > 0 else 40.0))
            alt2_start = round(min(max(0.0, duration - alt2_len), max(rec_end - 15.0, duration * 0.55)), 1)
            alt2_end = round(min(alt2_start + alt2_len, duration), 1)

            fallback_song = cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song")
            fallback_anime = cleaned_anime or "Anime Series"

            return {
                "status": "fallback",
                "message": "Audio analysis did not return a usable result. Showing duration-based trim suggestions only.",
                "song_name": fallback_song,
                "anime_name": fallback_anime,
                "recommended_start": rec_start,
                "recommended_end": rec_end,
                "duration": round(rec_end - rec_start, 1),
                "clip_type": rec_type,
                "score": None,
                "reason": "Suggested from duration only; no audio analysis result is available.",
                "subtitle_style": "bold_lyrics",
                "subtitle_style_reason": "High-retention bold typography preset.",
                "alternatives": [
                    {
                        "start": alt1_start,
                        "end": alt1_end,
                        "duration": round(alt1_end - alt1_start, 1),
                        "clip_type": f"Opening Section ({int(round(alt1_end - alt1_start))}s)",
                        "score": None,
                        "reason": "Duration-based alternative; no audio analysis result is available."
                    },
                    {
                        "start": alt2_start,
                        "end": alt2_end,
                        "duration": round(alt2_end - alt2_start, 1),
                        "clip_type": f"Ending Section ({int(round(alt2_end - alt2_start))}s)",
                        "score": None,
                        "reason": "Duration-based alternative; no audio analysis result is available."
                    }
                ],
                "lyrics": [],
                "captions": DEFAULT_FALLBACK_CAPTIONS
            }

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
        """Generates accurately synchronized dual-language Japanese + English lyrics and optimal style for any selected clip range."""
        api_key = api_key_override or get_settings().gemini_api_key
        default_style = preferred_style or "bold_lyrics"
        if not api_key:
            return {"lyrics": [], "subtitle_style": default_style, "style_reason": ""}

        prompt = f"""You are an elite Japanese musicologist, anime translator, and lyric timing synchronizer.
Generate accurately synchronized dual-language lyrics for the chosen clip segment of this anime song:
Song: "{song_name}"
Anime: "{anime_name}"
Video Context: "{video_title or ''}"
Clip Range: {start_time:.1f}s to {end_time:.1f}s (duration: {end_time - start_time:.1f}s).

CRITICAL INSTRUCTIONS FOR PERFECT VOCAL FIT & TIMING:
1. LISTEN TO THE AUDIO TRACK CAREFULLY:
   - DO NOT snap the first line to {start_time:.1f}s! Most anime clips have an instrumental guitar riff, drum count-in, or spoken pause before vocals begin.
   - Detect the EXACT SECOND when the singer starts singing the first word. If vocals start at {start_time + 2.0:.1f}s, the first line MUST start at {start_time + 2.0:.1f}s, NOT {start_time:.1f}s!
   - Mark the end timestamp right when the vocal phrase ends. During pauses between vocal phrases, leave empty space.
2. SHORT, SINGLE-BREATH PHRASES ONLY (1.5s to 3.5s per line, MAX 4-8 WORDS / 8-16 CHARACTERS PER LINE):
   - Every single vocal breath or short musical phrase MUST be its own separate line!
   - NEVER combine multiple sentences, clauses, or long lines together!
   - When the singer breathes, pauses, or changes pitch between phrases, split into a new line immediately!
   - Tight phrase-level vocal synchronization is strictly required: subtitles must advance in real-time as the singer speaks/sings.
3. DUAL-LANGUAGE TRANSLATION RULES (CRITICAL FOR ACCURACY & MIXED VOCALS):
   - "start": exact float timestamp (seconds in full video) where vocal starts
   - "end": exact float timestamp (seconds in full video) where vocal phrase finishes
   - "text_jp": ORIGINAL VOCAL LYRICS AS SUNG.
     * When sung in Japanese: authentic Japanese with correct Kanji & Kana.
     * When sung in English or mixed Japanese + English (e.g. "Fly high!! 汗と涙で", "We are fighting dreamers 高みを目指して", "Kick back! 努力 未来 A BEAUTIFUL STAR"):
       KEEP THE SUNG ENGLISH WORDS EXACTLY IN ENGLISH! NEVER convert sung English into Katakana or Japanese translation!
     * If a line is sung 100% in English: "text_jp" must be the exact English words as sung.
   - "text_romaji": Clean, accurate Hepburn Romanization of any Japanese words (English words remain in English).
   - "text_en": ACCURATE, NATURAL ENGLISH TRANSLATION.
     * Translate the Japanese meaning FAITHFULLY and ACCURATELY based on the true context, emotion, and storyline of the anime song.
     * DO NOT hallucinate overly poetic, loose, or flowery filler phrases that deviate from what is actually sung. Keep it punchy, meaningful, and emotionally true.
     * Treat the supplied audio as the only lyric evidence. If a word or meaning is not audible enough to transcribe faithfully, OMIT that cue rather than inventing lyrics or a translation.
     * For mixed Japanese + English lines: KEEP the original English words intact and translate the Japanese portions seamlessly around them (e.g., "Fly high!! With wings shining in sweat, blood, and tears").
     * For 100% English lines: "text_en" MUST BE IDENTICAL to the sung English text (do not create redundant, bizarre re-translations of English lyrics!).
     * Ensure 1-to-1 sentence correspondence: each "text_en" line must translate the exact meaning of that specific "text_jp" line, never bleeding into adjacent lines.
4. If there is an instrumental section (e.g. guitar solo / drop), you may add a line with text_jp: "♪ [Guitar Solo]" and text_en: "♪ [Guitar Solo]".
5. RECOMMENDED SUBTITLE STYLE PRESET:
   Select the best matching visual subtitle preset out of these 4 options based on the audio track:
   - "bold_lyrics": High-energy anime rock, heavy drums, intense drive, hype shonen themes (bold black outline with vibrant hot-pink accent).
   - "anime": Cute, idol pop, magical, sparkling, dreamy aesthetic (radiant neon-pink glow aura).
   - "jp_en": Classic anime opening/ending, nostalgic, balanced dual fansub with sky blue English translation.
   - "minimal": Elegant ballads, acoustic, emotional piano, clean modern aesthetic with soft shadow.

Return ONLY a valid JSON object matching:
{{
  "subtitle_style": "<'bold_lyrics' | 'anime' | 'jp_en' | 'minimal'>",
  "style_reason": "<short sentence on why this subtitle style fits the music>",
  "lyrics": [
    {{
      "start": <float seconds>,
      "end": <float seconds>,
      "text_jp": "<Japanese lyrics>",
      "text_romaji": "<Romanized Japanese>",
      "text_en": "<English translation>"
    }}
  ]
}}
DO NOT include markdown formatting outside the JSON. Return raw JSON.
"""
        models_to_try = GEMINI_MODELS

        # Auto-resolve video_path if missing or blob URL
        resolved_video_path = video_path

        # Build request parts — include audio from video if available for accurate vocal timing
        content_parts = [{"text": prompt}]
        if resolved_video_path and os.path.isfile(resolved_video_path):
            tmp_audio_path = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_audio:
                    tmp_audio_path = tmp_audio.name
                total_dur = end_time - start_time
                clip_duration = min(total_dur, 600.0) if total_dur > 0 else 120.0
                extract_cmd = [
                    "ffmpeg", "-y",
                    "-i", resolved_video_path,
                    "-ss", str(start_time),
                    "-t", str(clip_duration),
                    "-vn", "-ac", "1", "-ar", "44100", "-b:a", "128k",
                    tmp_audio_path
                ]
                result = await asyncio.to_thread(subprocess.run, extract_cmd, capture_output=True, timeout=30)
                if result.returncode == 0 and os.path.getsize(tmp_audio_path) > 100:
                    with open(tmp_audio_path, "rb") as af:
                        audio_b64 = base64.b64encode(af.read()).decode("utf-8")
                    content_parts.insert(0, {
                        "inlineData": {
                            "mimeType": "audio/mp3",
                            "data": audio_b64
                        }
                    })
            except Exception as exc:
                print(f"[Lyrics] Audio extraction failed: {exc}")
            finally:
                if tmp_audio_path and os.path.exists(tmp_audio_path):
                    try:
                        os.unlink(tmp_audio_path)
                    except OSError:
                        pass

        if not any("inlineData" in part for part in content_parts):
            raise RuntimeError("Synchronized lyrics require readable source audio. Re-import the video and check its audio track.")

        payload = {
            "contents": [{"parts": content_parts}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }
        async with httpx.AsyncClient(timeout=45.0) as client:
            for model_name in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                try:
                    response = await client.post(url, json=payload)
                    if response.status_code == 200:
                        res_data = response.json()
                        text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                        data = parse_gemini_json(text)
                        data_dict, raw_lyrics = normalize_lyrics_payload(data)
                        raw_sub_style = str(data_dict.get("subtitle_style", default_style)).strip().lower()
                        allowed_styles = ["bold_lyrics", "anime", "jp_en", "minimal"]
                        chosen_sub_style = raw_sub_style if raw_sub_style in allowed_styles else default_style
                        style_reason = data_dict.get("style_reason") or f"Selected {chosen_sub_style} preset for this song."

                        # Determine if Gemini returned slice-relative timestamps (starting at 0)
                        # or absolute timeline timestamps (matching the video's start_time)
                        is_slice_relative = False
                        if raw_lyrics and start_time > 1.5:
                            first_s = parse_timestamp(raw_lyrics[0].get("start"), 0.0)
                            if first_s < (start_time - 1.0):
                                is_slice_relative = True

                        sanitized = sanitize_lyric_cues(
                            raw_lyrics,
                            start_time,
                            end_time,
                            timestamps_are_relative=is_slice_relative,
                        )

                        return {
                            "lyrics": sanitized,
                            "subtitle_style": chosen_sub_style,
                            "style_reason": style_reason
                        }
                except Exception:
                    continue
        return {
            "lyrics": [],
            "subtitle_style": default_style,
            "style_reason": ""
        }

    async def generate_full_video_subtitles(
        self,
        video_path: str,
        song_name: Optional[str] = "",
        anime_name: Optional[str] = "",
        video_title: Optional[str] = "",
        duration: float = 0.0,
        api_key_override: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Multimodal audio analysis of the entire video.
        Extracts the full audio track, listens to the vocal performance across the entire duration,
        and generates accurately synchronized dual-language Japanese + English subtitles covering
        the entire video from start to finish.
        Also selects the best visual subtitle style preset and identifies the most loved viral hook moment.
        """
        api_key = api_key_override or get_settings().gemini_api_key
        default_style = "bold_lyrics"
        cleaned_song = (song_name or "").strip()
        cleaned_anime = (anime_name or "").strip()

        # If duration is missing or zero, try to probe video duration
        if duration <= 0.0 and video_path and os.path.isfile(video_path):
            try:
                from app.video.probe import probe_video
                info = await asyncio.to_thread(probe_video, video_path)
                duration = info.duration
            except Exception:
                duration = 90.0

        if not duration or duration <= 0:
            duration = 90.0

        if not api_key:
            return {
                "song_name": cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song"),
                "anime_name": cleaned_anime or "Anime Series",
                "duration": duration,
                "recommended_start": 0.0,
                "recommended_end": min(duration, 30.0),
                "clip_type": "Opening Section",
                "score": None,
                "reason": "Audio analysis is unavailable; no music moment was identified.",
                "subtitle_style": default_style,
                "subtitle_style_reason": "Default bold preset.",
                "lyrics": [],
                "alternatives": []
            }

        # Resolve video path
        resolved_video_path = video_path

        prompt = f"""You are an elite Japanese musicologist, anime translator, and lyric timing synchronizer.
Your task is to analyze the COMPLETE audio track of this anime song from 0.0s to {duration:.1f}s, accurately identify the song title and anime name, generate perfectly vocal-synchronized dual-language subtitles covering the ENTIRE VIDEO from start to finish, select the optimal visual subtitle style preset, and pinpoint the best viral hook section.

INPUT METADATA:
- Song Name Hint: "{cleaned_song}"
- Anime Name Hint: "{cleaned_anime}"
- Video Title / Filename: "{video_title or ''}"
- Total Video Duration: {duration:.1f} seconds.

CRITICAL INSTRUCTIONS FOR FULL-VIDEO VOCAL SYNCHRONIZATION:
1. COVER THE ENTIRE VIDEO FROM START TO FINISH (0.0s to {duration:.1f}s):
   - Listen to the audio from beginning to end.
   - Transcribe and timestamp EVERY vocal section across the entire song: intro vocals, verse 1, pre-chorus, chorus, verse 2, bridge, climax, and outro.
   - DO NOT stop after just the first verse or chorus. Provide lyrics across the full {duration:.1f}s timeline.

2. PERFECT VOCAL ONSET & OFFSET TIMING:
   - Base timestamps strictly on audible singing vocals in the audio waveform.
   - The "start" timestamp MUST be the EXACT second (e.g. 1.25) the singer sings the very first consonant or vowel of the line.
   - DO NOT start lines prematurely during instrumental guitar riffs, drum builds, or count-ins.
   - The "end" timestamp must be when the vocal phrase ends and the singer releases the final note or breath.
   - During musical interludes, guitar solos, or instrumental breaks, leave gap space between lines — NEVER linger over non-vocal audio.

3. SHORT, SINGLE-BREATH PHRASES ONLY (1.5s to 3.5s per line, MAX 4-8 WORDS / 8-16 JP CHARACTERS):
   - Every single vocal breath or short musical phrase MUST be its own separate line!
   - NEVER combine multiple sentences, verses, or clauses into one line!
   - When the singer breathes, pauses, or changes pitch between phrases, split into a new line immediately!
   - Tight phrase-level vocal synchronization is strictly required: subtitles must advance in real-time as the singer speaks/sings.

4. DUAL-LANGUAGE TRANSLATION RULES (CRITICAL FOR ACCURACY & MIXED VOCALS):
   - "text_jp": ORIGINAL VOCAL LYRICS AS SUNG.
     * When sung in Japanese: authentic Japanese with correct Kanji & Kana.
     * When sung in English or mixed Japanese + English (e.g. "Fly high!! 汗と涙で", "We are fighting dreamers 高みを目指して", "Cry baby, cry baby"):
       KEEP THE SUNG ENGLISH WORDS EXACTLY IN ENGLISH! NEVER convert sung English into Katakana or Japanese translation!
     * If a line is sung 100% in English: "text_jp" must be the exact English words as sung.
   - "text_romaji": Clean, accurate Romanized pronunciation of any Japanese words (English words remain in English).
   - "text_en": ACCURATE, NATURAL ENGLISH TRANSLATION.
     * Translate the Japanese meaning FAITHFULLY and ACCURATELY based on the true context, emotion, and storyline of the anime song.
     * DO NOT hallucinate overly poetic, loose, or flowery filler phrases that deviate from what is actually sung.
     * Treat the supplied audio as the only lyric evidence. If a word or meaning is not audible enough to transcribe faithfully, OMIT that cue rather than inventing lyrics or a translation.
     * For mixed Japanese + English lines: KEEP the original English words intact and translate the Japanese portions seamlessly around them.
     * For 100% English lines: "text_en" MUST BE IDENTICAL to the sung English text (no redundant or awkward re-translation).
     * Ensure 1-to-1 sentence correspondence: each "text_en" line must translate the exact meaning of that specific "text_jp" line.

5. RECOMMENDED VISUAL SUBTITLE PRESET:
   Select the best matching visual subtitle style preset out of these 4 options:
   - "bold_lyrics": High-energy anime rock, heavy drums, intense drive, hype shonen themes (bold black outline with vibrant hot-pink accent).
   - "anime": Cute, idol pop, magical, sparkling, dreamy aesthetic (radiant neon-pink glow aura).
   - "jp_en": Classic anime opening/ending, nostalgic, balanced dual fansub with sky blue English translation.
   - "minimal": Elegant ballads, acoustic, emotional piano, clean modern aesthetic with soft shadow.

6. ABSOLUTE BEST REPLAY MOMENT (NO MATTER HOW LONG — COMPLETE MUSICAL SECTIONS ONLY):
   - Identify the single best, most iconic, and most replayable complete musical section of this song (recommended_start, recommended_end, clip_type, score, reason).
   - CRITICAL REQUIREMENT: The user wants the FULL, COMPLETE BEST PART OF THE SONG, NO MATTER HOW LONG IT IS!
   - DO NOT provide short, clipped, or unfinished 10-25s snippets!
   - DO NOT cut off in the middle of a chorus, vocal phrase, sentence, melody, or held note!
   - Whether the best part is 35s, 45s, 60s, 75s, or the FULL 90-second anime opening, deliver the entire satisfying musical arc.
   - For a standard anime TV-size opening (~90s), the best part is almost always the FULL CHORUS & CLIMAX (typically 40 to 60+ seconds long) or the ENTIRE continuous 90s opening if the whole song is iconic.
   - Ensure "recommended_start" begins cleanly right at the natural start of the section, and "recommended_end" resolves completely on the final musical cadence/vocal breath.
   - Provide 1 or 2 alternative complete moments (e.g. Full Opening Riff + Verse 1, or Dramatic Bridge + Climax Finish). Each alternative must also be a complete musical section.

Return ONLY a valid JSON object matching this structure:
{{
  "song_name": "<Clean standardized Song Title in Latin/English, e.g. 'Guitar, Loneliness and Blue Planet'>",
  "anime_name": "<Official Anime Series Title, e.g. 'Bocchi the Rock!'>",
  "recommended_start": <float seconds>,
  "recommended_end": <float seconds>,
  "clip_type": "<e.g. 'Full Chorus & Climax (48s)', 'Complete Climax Section (55s)', 'Full Anime Opening (90s)'>",
  "score": <integer 90-99>,
  "reason": "<compelling sentence explaining why fans love and replay this exact complete part of the song>",
  "subtitle_style": "<'bold_lyrics' | 'anime' | 'jp_en' | 'minimal'>",
  "subtitle_style_reason": "<short sentence explaining why this subtitle style fits the song's energy>",
  "lyrics": [
    {{
      "start": <float seconds>,
      "end": <float seconds>,
      "text_jp": "<Japanese lyrics>",
      "text_romaji": "<Romanized Japanese>",
      "text_en": "<English translation>"
    }}
  ],
  "alternatives": [
    {{
      "start": <float seconds>,
      "end": <float seconds>,
      "clip_type": "<e.g. 'Full Intro & Verse 1 (35s)', 'Extended Bridge & Drop (42s)'>",
      "score": <integer 85-92>,
      "reason": "<why fans replay this alternative complete moment>"
    }}
  ]
}}
DO NOT include markdown formatting or backticks outside the JSON. Return raw JSON.
"""
        models_to_try = GEMINI_MODELS

        content_parts = [{"text": prompt}]
        if resolved_video_path and os.path.isfile(resolved_video_path):
            # Use the same full-track/offset-labelled sampling policy as song
            # analysis.  This avoids silently analyzing only the first six
            # minutes when the user explicitly requests whole-video subtitles.
            audio_evidence = await extract_timed_audio_samples(resolved_video_path, duration, full_coverage=True)
            if audio_evidence:
                content_parts = audio_evidence + content_parts

        if not any("inlineData" in part for part in content_parts):
            raise RuntimeError("Full subtitles require readable source audio. Re-import the video and check that FFmpeg can extract its audio.")

        payload = {
            "contents": [{"parts": content_parts}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json"
            }
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            for model_name in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                try:
                    response = await client.post(url, json=payload)
                    print(f"[Full Subtitles] Model {model_name} response status: {response.status_code}")
                    if response.status_code == 200:
                        res_data = response.json()
                        text = res_data["candidates"][0]["content"]["parts"][0]["text"]
                        data = parse_gemini_json(text)
                        data_dict, raw_lyrics = normalize_lyrics_payload(data)
                        raw_sub_style = str(data_dict.get("subtitle_style", default_style)).strip().lower()
                        allowed_styles = ["bold_lyrics", "anime", "jp_en", "minimal"]
                        chosen_sub_style = raw_sub_style if raw_sub_style in allowed_styles else default_style
                        style_reason = data_dict.get("subtitle_style_reason") or data_dict.get("style_reason") or f"Selected {chosen_sub_style} preset for this song."

                        sanitized = sanitize_lyric_cues(raw_lyrics, 0.0, duration)

                        # For short to standard anime videos (<= 95s), default to full chorus/climax
                        default_fallback_start = min(35.0, duration * 0.35) if duration > 35.0 else 0.0
                        default_fallback_end = duration if duration <= 95.0 else min(duration, default_fallback_start + 50.0)

                        rec_s = parse_timestamp(data_dict.get("recommended_start"), default_fallback_start)
                        rec_e = parse_timestamp(data_dict.get("recommended_end"), default_fallback_end)
                        rec_s = max(0.0, min(duration - 5.0, rec_s))
                        if rec_e <= rec_s:
                            rec_e = min(duration, rec_s + (duration - rec_s if duration <= 95.0 else 50.0))

                        # Refine recommended moment boundaries against synchronized lyrics so lines never cut off mid-vocal/sentence
                        rec_s, rec_e = refine_moment_boundaries(rec_s, rec_e, duration, sanitized)

                        # Clean up alternatives and ensure they also resolve naturally
                        clean_alts = []
                        for alt in data_dict.get("alternatives", []):
                            if not isinstance(alt, dict):
                                continue
                            a_s = parse_timestamp(alt.get("start"), 0.0)
                            a_e = parse_timestamp(alt.get("end"), min(duration, a_s + 40.0))
                            a_s, a_e = refine_moment_boundaries(a_s, a_e, duration, sanitized)
                            clean_alts.append({
                                "start": round(a_s, 1),
                                "end": round(a_e, 1),
                                "duration": round(a_e - a_s, 1),
                                "clip_type": alt.get("clip_type") or f"Alternative Section ({int(round(a_e - a_s))}s)",
                                "score": int(alt.get("score", 88)),
                                "reason": alt.get("reason", "Alternative replay moment.")
                            })

                        identified_song = (data_dict.get("song_name") or cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song")).strip()
                        identified_anime = (data_dict.get("anime_name") or cleaned_anime or "Anime Series").strip()

                        clip_label = data_dict.get("clip_type") or f"Complete Musical Section ({int(round(rec_e - rec_s))}s)"

                        return {
                            "status": "success",
                            "song_name": identified_song,
                            "anime_name": identified_anime,
                            "duration": duration,
                            "recommended_start": round(rec_s, 1),
                            "recommended_end": round(rec_e, 1),
                            "clip_type": clip_label,
                            "score": int(data_dict.get("score", 95)),
                            "reason": data_dict.get("reason", "Fan-favorite replay moment."),
                            "subtitle_style": chosen_sub_style,
                            "subtitle_style_reason": style_reason,
                            "lyrics": sanitized,
                            "alternatives": clean_alts,
                            "model_used": model_name
                        }
                except Exception:
                    continue

        fb_s = 0.0 if duration <= 60.0 else min(35.0, duration * 0.35)
        fb_e = duration if duration <= 95.0 else min(duration, fb_s + 50.0)
        return {
            "status": "fallback",
            "song_name": cleaned_song or (video_title.split(".")[0] if video_title else "Anime Song"),
            "anime_name": cleaned_anime or "Anime Series",
            "duration": duration,
            "recommended_start": round(fb_s, 1),
            "recommended_end": round(fb_e, 1),
            "clip_type": f"Suggested Section ({int(round(fb_e - fb_s))}s)",
            "score": None,
            "reason": "No usable audio analysis result is available.",
            "subtitle_style": default_style,
            "subtitle_style_reason": "Default bold preset.",
            "lyrics": [],
            "alternatives": []
        }

    async def generate_viral_hooks(
        self,
        song_name: str = "",
        anime_name: str = "",
        video_title: str = "",
        mood: str = "hype",
        api_key_override: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """Generates viral, high-retention Instagram Reels / TikTok hooks tailored to the anime and song."""
        api_key = (api_key_override or self.api_key or "").strip()
        cleaned_song = song_name.strip()
        cleaned_anime = anime_name.strip()
        title_context = f"{cleaned_song} from {cleaned_anime}" if (cleaned_song and cleaned_anime) else (video_title or "this iconic anime song")

        fallback_hooks = [
            {"hook": f"POV: That one {cleaned_anime or 'anime'} song you can NEVER skip ⚡", "category": "retention"},
            {"hook": f"When the animation budget goes ALL into the chorus 🔥", "category": "hype"},
            {"hook": f"Tell me you remember this scene without crying 😭", "category": "nostalgia"},
            {"hook": f"This drop changed the entire anime season forever 🌌", "category": "climax"},
            {"hook": f"Nobody warned me this song would hit this hard ✨", "category": "curiosity"}
        ]

        if not api_key:
            return fallback_hooks

        prompt = f"""You are an elite Instagram Reels & TikTok viral content creator specializing in anime edits and music reels.
Generate 5 punchy, high-retention viral video hooks for an anime song reel.

Song: "{cleaned_song or 'Unknown'}"
Anime: "{cleaned_anime or 'Unknown'}"
Context: "{title_context}"
Mood: {mood}

Rules for viral hooks:
1. MAX 12 words per hook. Extremely punchy, relatable, and scroll-stopping.
2. Perfect for Instagram Reels text-overlay (POV, curiosity gap, emotional resonance, hype).
3. Include 1 relevant emoji per hook.
4. Capitalize or format cleanly for instant readability.

Return ONLY a valid JSON array of objects with this structure:
[
  {{"hook": "...", "category": "hype|emotional|curiosity|relatable"}}
]
"""
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 600}
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            for model_name in GEMINI_MODELS:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                try:
                    resp = await client.post(url, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data["candidates"][0]["content"]["parts"][0]["text"]
                        parsed = parse_gemini_json(text)
                        if isinstance(parsed, list) and len(parsed) > 0:
                            sanitized = []
                            for item in parsed:
                                if isinstance(item, dict) and item.get("hook"):
                                    sanitized.append({
                                        "hook": str(item["hook"]).strip(),
                                        "category": str(item.get("category", "viral")).strip()
                                    })
                            if sanitized:
                                return sanitized
                except Exception:
                    continue

        return fallback_hooks

gemini_client = GeminiClient()
