"""One bounded, structured Gemini request path for all Studio AI actions."""
from __future__ import annotations

import asyncio
import json
import logging
import re

import httpx

logger = logging.getLogger(__name__)
# Confirmed through Google's models endpoint with this installation's API key.
GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-2.5-flash"]
REQUEST_BUDGET_SECONDS = 180


class GeminiError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _error_message(response):
    try:
        error = response.json().get("error", {})
        return str(error.get("message", "")), error.get("details", [])
    except (ValueError, AttributeError, TypeError):
        return "", []


def _decode_response(body):
    if not isinstance(body, dict):
        raise GeminiError("Gemini returned an unreadable response. Please retry.")
    candidates = body.get("candidates") or []
    if not isinstance(candidates, list):
        raise GeminiError("Gemini returned an unreadable response. Please retry.")
    if not candidates:
        feedback = body.get("promptFeedback") or {}
        reason = feedback.get("blockReason") if isinstance(feedback, dict) else None
        if reason:
            raise GeminiError("Gemini could not process this content. Try another clip.", 422)
        raise GeminiError("Gemini returned no result. Please retry.")
    candidate = candidates[0]
    if not isinstance(candidate, dict):
        raise GeminiError("Gemini returned an unreadable response. Please retry.")
    finish = candidate.get("finishReason", "STOP")
    if finish == "MAX_TOKENS":
        raise GeminiError("Gemini's response was cut short. Try a shorter clip, or fewer requested results.")
    if finish not in {"STOP", "", None}:
        raise GeminiError(f"Gemini could not complete this content ({finish}). Try another clip.", 422)
    content = candidate.get("content") or {}
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise GeminiError("Gemini returned no readable text. Please retry.")
    text = "".join(p["text"] for p in parts if isinstance(p, dict) and isinstance(p.get("text"), str) and not p.get("thought"))
    text = re.sub(r"^```(?:json)?\s*", "", text.lstrip("\ufeff \r\n\t"), flags=re.I)
    text = re.sub(r"\s*```\s*$", "", text).strip()
    try:
        result = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise GeminiError("Gemini returned incomplete or invalid JSON. Please retry.") from exc
    if not isinstance(result, dict):
        raise GeminiError("Gemini returned an unexpected response format. Please retry.")
    return result


async def generate_json(parts, api_key, schema, *, temperature=0.2, max_output_tokens=8192, models=None):
    """Return (JSON object, model), without exposing keys or retrying exhausted quota."""
    key = (api_key or "").strip()
    if not key:
        raise GeminiError("Add your Gemini API key in Settings, then try again.", 503)
    choices = list(models or GEMINI_MODELS)
    if not choices:
        raise GeminiError("No Gemini model is configured. Restart Vibe Editor.", 503)
    payload = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {
        "temperature": temperature, "maxOutputTokens": max_output_tokens,
        "responseMimeType": "application/json", "responseSchema": schema}}
    last_error = GeminiError("Gemini is temporarily unavailable. Please retry shortly.", 503)
    try:
        async with asyncio.timeout(REQUEST_BUDGET_SECONDS):
            async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=15, write=30, pool=15),
                                         headers={"x-goog-api-key": key}) as client:
                for index, model in enumerate(choices):
                    # Fast failover on model capacity, one delayed retry on the last model.
                    attempts = 2 if index == len(choices) - 1 else 1
                    for attempt in range(attempts):
                        if attempt:
                            await asyncio.sleep(2)
                        try:
                            response = await client.post(
                                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                json=payload)
                        except (httpx.TimeoutException, httpx.TransportError) as exc:
                            logger.warning("Gemini %s connection failed (%s)", model, type(exc).__name__)
                            last_error = GeminiError("Could not reach Gemini. Check your connection and try again.", 503)
                            continue
                        if response.status_code == 200:
                            try:
                                return _decode_response(response.json()), model
                            except (ValueError, TypeError) as exc:
                                last_error = GeminiError("Gemini returned an unreadable response. Please retry.")
                                logger.warning("Gemini %s invalid response (%s)", model, type(exc).__name__)
                            except GeminiError as exc:
                                if exc.status_code == 422:
                                    raise
                                last_error = exc
                            continue
                        message, details = _error_message(response)
                        status = response.status_code
                        logger.warning("Gemini %s returned HTTP %s", model, status)
                        if status in {401, 403} or (status == 400 and "api key" in message.lower()):
                            raise GeminiError("Gemini rejected the API key or its access. Check the key in Settings.", 403)
                        if status == 429:
                            retry = ""
                            for detail in details if isinstance(details, list) else []:
                                if isinstance(detail, dict) and detail.get("retryDelay"):
                                    retry = f" Google suggests waiting {detail['retryDelay']}."
                            raise GeminiError("Gemini's quota or rate limit is reached. Wait and retry, or check your API quota." + retry, 429)
                        if status == 400:
                            raise GeminiError("Gemini could not accept this request. " + message[:400], 400)
                        if status in {404, 408, 500, 502, 503, 504}:
                            last_error = GeminiError("Gemini is temporarily busy or unavailable. Please try again shortly.", 503)
                            if status == 404:
                                break
                            continue
                        raise GeminiError(f"Gemini returned HTTP {status}. Please try again.")
    except TimeoutError as exc:
        raise GeminiError("Gemini took too long to respond. Please retry; your existing edits are preserved.", 504) from exc
    raise last_error
