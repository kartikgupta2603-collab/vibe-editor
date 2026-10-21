"""Dedicated audio transcription; independent of highlights, titles and visual styles."""
from __future__ import annotations

import asyncio
import math

from app.ai.gemini_transport import GeminiError, generate_json
from app.ai.subtitle_alignment import _extract_audio, _probe_audio, _validate_segments

CHUNK_SECONDS = 90.0
MAX_DURATION_SECONDS = 900.0
TRANSCRIPTION_SCHEMA = {"type": "OBJECT", "properties": {
    "language": {"type": "STRING"},
    "segments": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "start": {"type": "NUMBER"}, "end": {"type": "NUMBER"},
        "kind": {"type": "STRING", "enum": ["vocal", "instrumental", "unclear"]},
        "original": {"type": "STRING"}, "english": {"type": "STRING"}, "romanized": {"type": "STRING"}},
        "required": ["start", "end", "kind", "original", "english", "romanized"]}}},
    "required": ["language", "segments"]}


def _transcription_segments(data, duration):
    if not isinstance(data, dict) or not isinstance(data.get("language"), str) or not data["language"].strip():
        raise RuntimeError("Gemini did not identify the actual spoken language.")
    if not isinstance(data.get("segments"), list):
        raise RuntimeError("Gemini returned no readable transcription segments.")
    mapped = []
    for segment in data["segments"]:
        if not isinstance(segment, dict) or not all(isinstance(segment.get(key), str) for key in ("original", "english", "romanized")):
            raise RuntimeError("Gemini returned incomplete original or translated text.")
        mapped.append({"start": segment.get("start"), "end": segment.get("end"), "kind": segment.get("kind"),
                       "text_jp": segment["original"], "text_en": segment["english"], "text_romaji": segment["romanized"]})
    return _validate_segments({"segments": mapped}, duration)


def _prompt(duration):
    return f"""Transcribe only the attached audio ({duration:.3f} seconds).
The attachment clock starts at zero. Return numeric seconds relative to this attachment.
Cover its entire timeline with ordered segments. Classify every interval as vocal,
instrumental or unclear. Include instrumental gaps explicitly with empty text fields.
First identify the actual audible language; never assume it from the application or genre.
For vocals, copy the actual spoken/sung words into original, their accurate natural English
meaning into english, and a pronunciation into romanized only where relevant. If already
English, original and english must be identical English. Never convert English into Japanese.
Use short natural phrases, usually 1–4 seconds. Match audible onset and release; do not
invent lyrics from a title or known song. Leave original English words intact in mixed lyrics.
If vocals cannot be understood, mark unclear; never guess. Do not identify the song/anime,
choose highlights, suggest a style, assign scores, or discuss audience popularity.
Before returning JSON, check that segments cover 0 to {duration:.3f} with no missing
passages. Only genuinely non-vocal intervals may be marked instrumental.
Return {{"language":"actual audible language, or none if instrumental","segments":[
{{"start":0,"end":1,"kind":"vocal|instrumental|unclear",
"original":"actual words in their original script","english":"English meaning","romanized":""}}]}}.
"""


async def generate_subtitles(video_path, api_key, *, start_time=0.0, end_time=None):
    from app.ai.gemini_client import sanitize_lyric_cues

    if not (api_key or "").strip():
        raise GeminiError("Add your Gemini API key in Settings before generating subtitles.", 503)
    duration, _ = await asyncio.to_thread(_probe_audio, video_path)
    end = duration if end_time is None else end_time
    if not all(isinstance(t, (int, float)) and not isinstance(t, bool) and math.isfinite(t) for t in (start_time, end)):
        raise ValueError("Choose valid subtitle start and end times.")
    if not 0 <= start_time < end <= duration + .05:
        raise ValueError("The subtitle range is outside the source audio. Adjust it and retry.")
    end = min(end, duration)
    if end - start_time > MAX_DURATION_SECONDS:
        raise ValueError("Generate subtitles for up to 15 minutes at a time. Select a shorter source.")
    lyrics, models = [], []
    try:
        async with asyncio.timeout(780):
            chunk_start = start_time
            while chunk_start < end - .001:
                chunk_end = min(end, chunk_start + CHUNK_SECONDS)
                encoded, actual = await asyncio.to_thread(_extract_audio, video_path, chunk_start, chunk_end)
                parts = [{"inlineData": {"mimeType": "audio/wav", "data": encoded}}, {"text": _prompt(actual)}]
                result, model = await generate_json(parts, api_key, TRANSCRIPTION_SCHEMA, temperature=0.1, max_output_tokens=16384)
                # One repair for malformed timing, never a second unconditional transcription.
                try:
                    segments = _transcription_segments(result, actual)
                except RuntimeError as exc:
                    repair = {"text": "Correct the previous response: " + str(exc) +
                              ". Listen to the same audio again; return all ordered intervals within its duration."}
                    result, model = await generate_json([*parts, repair], api_key, TRANSCRIPTION_SCHEMA,
                                                        temperature=0.1, max_output_tokens=16384)
                    segments = _transcription_segments(result, actual)
                raw = [segment for segment in segments if segment["kind"] != "instrumental"]
                cues = sanitize_lyric_cues(raw, chunk_start, chunk_end, timestamps_are_relative=True)
                lyrics.extend(cues)
                models.append(model)
                chunk_start = chunk_end
    except TimeoutError as exc:
        raise GeminiError("Subtitle generation took too long. Try a shorter source; existing subtitles are preserved.", 504) from exc
    return {"status": "success" if lyrics else "no_vocals", "duration": duration,
            "lyrics": lyrics, "model_used": ", ".join(dict.fromkeys(models)),
            "message": "Subtitles generated from the supplied audio." if lyrics else "No vocals or speech were found in this audio."}
