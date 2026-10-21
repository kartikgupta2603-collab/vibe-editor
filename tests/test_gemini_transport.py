"""Bounded Gemini transport, provider response parsing and safe failure messages."""
import asyncio
import json

import httpx
import pytest

from app.ai import gemini_transport as transport


SCHEMA = {"type": "OBJECT", "properties": {"ok": {"type": "BOOLEAN"}}, "required": ["ok"]}
EVIDENCE = [{"inlineData": {"mimeType": "audio/mpeg", "data": "supplied-audio"}}, {"text": "Listen to this."}]


def successful_body(value=None, **candidate_fields):
    return {"candidates": [{"finishReason": "STOP", "content": {
        "parts": [{"text": json.dumps(value if value is not None else {"ok": True})}]
    }, **candidate_fields}]}


def response(status=200, body=None):
    return httpx.Response(status, json=successful_body() if body is None else body)


@pytest.fixture
def provider(monkeypatch):
    queue, calls, clients, delays = [], [], [], []

    class FakeClient:
        def __init__(self, **kwargs):
            clients.append(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            assert queue, "Unexpected extra Gemini request"
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            if callable(item):
                return await item()
            return item

    async def fake_sleep(seconds):
        delays.append(seconds)

    monkeypatch.setattr(transport.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(transport.asyncio, "sleep", fake_sleep)
    return queue, calls, clients, delays


def generate(models=None, key=" secret-key ", **kwargs):
    return asyncio.run(transport.generate_json(EVIDENCE, key, SCHEMA, models=models or ["model-one", "model-two"], **kwargs))


def test_audio_schema_and_key_are_sent_without_key_in_url(provider):
    queue, calls, clients, _ = provider
    queue.append(response())
    result, model = generate(temperature=0.15, max_output_tokens=4096)
    assert result == {"ok": True}
    assert model == "model-one"
    assert clients[0]["headers"] == {"x-goog-api-key": "secret-key"}
    assert "secret-key" not in calls[0][0]
    assert "?key=" not in calls[0][0]
    assert clients[0]["timeout"].read == 120
    payload = calls[0][1]["json"]
    assert payload["contents"][0]["parts"] == EVIDENCE
    assert payload["generationConfig"] == {
        "responseMimeType": "application/json", "responseSchema": SCHEMA,
        "temperature": 0.15, "maxOutputTokens": 4096,
    }


def test_multipart_text_ignores_thought_and_joins_only_answer():
    body = {"candidates": [{"finishReason": "STOP", "content": {"parts": [
        {"text": "private reasoning, not JSON", "thought": True},
        {"text": '\ufeff```json\n{"ok":'}, {"text": "true}\n```"},
        {"inlineData": {"mimeType": "audio/mpeg", "data": "not-text"}},
    ]}}]}
    assert transport._decode_response(body) == {"ok": True}


@pytest.mark.parametrize("key", [None, "", " \n "])
def test_missing_key_does_not_contact_provider(provider, key):
    _, calls, clients, _ = provider
    with pytest.raises(transport.GeminiError, match="Settings") as error:
        generate(key=key)
    assert error.value.status_code == 503
    assert calls == [] and clients == []


@pytest.mark.parametrize("status,body,expected", [
    (401, {"error": {"message": "Unauthenticated"}}, 403),
    (403, {"error": {"message": "Permission denied"}}, 403),
    (400, {"error": {"message": "API key not valid"}}, 403),
    (400, {"error": {"message": "Invalid audio MIME type"}}, 400),
    (429, {"error": {"message": "Quota exceeded", "details": [{"retryDelay": "30s"}]}}, 429),
])
def test_permanent_errors_stop_without_trying_more_models(provider, status, body, expected):
    queue, calls, _, delays = provider
    queue.append(response(status, body))
    with pytest.raises(transport.GeminiError) as error:
        generate()
    assert error.value.status_code == expected
    assert len(calls) == 1
    assert delays == []
    assert "secret-key" not in str(error.value)
    if status == 429:
        assert "30s" in str(error.value)


@pytest.mark.parametrize("body", [
    {"promptFeedback": {"blockReason": "SAFETY"}},
    {"candidates": [{"finishReason": "SAFETY"}]},
    {"candidates": [{"finishReason": "RECITATION"}]},
])
def test_content_block_is_actionable_without_model_fallback(provider, body):
    queue, calls, _, _ = provider
    queue.append(response(body=body))
    with pytest.raises(transport.GeminiError, match="another clip") as error:
        generate()
    assert error.value.status_code == 422
    assert len(calls) == 1


@pytest.mark.parametrize("body", [
    {}, {"candidates": []},
    {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": '{"ok":'}]}}]},
    {"candidates": [{"content": {"parts": [{"text": '{"ok":'}]}}]},
    successful_body(["wrong-json-shape"]),
    {"candidates": [None]},
    {"candidates": [{"content": None}]},
    {"candidates": [{"content": {"parts": None}}]},
    {"candidates": [{"content": {"parts": [{"text": None}]}}]},
    {"promptFeedback": None},
])
def test_unusable_response_falls_back_with_same_audio(provider, body):
    queue, calls, _, _ = provider
    queue.extend([response(body=body), response()])
    result, model = generate()
    assert result == {"ok": True}
    assert model == "model-two"
    assert len(calls) == 2
    assert calls[0][1]["json"]["contents"] == calls[1][1]["json"]["contents"]


@pytest.mark.parametrize("problem", [
    response(503), response(404), response(408), response(500), response(502), response(504),
    httpx.ConnectError("DNS unavailable"), httpx.ReadTimeout("Read timed out"),
])
def test_model_capacity_network_and_missing_model_failover(provider, problem):
    queue, calls, _, delays = provider
    queue.extend([problem, response()])
    assert generate() == ({"ok": True}, "model-two")
    assert len(calls) == 2
    assert delays == []


def test_last_model_retries_once_then_reports_provider_failure(provider):
    queue, calls, _, delays = provider
    queue.extend([response(503), response(503), response(503)])
    with pytest.raises(transport.GeminiError, match="busy or unavailable") as error:
        generate()
    assert error.value.status_code == 503
    assert len(calls) == 3
    assert delays == [2]


def test_missing_last_model_is_not_retried(provider):
    queue, calls, _, delays = provider
    queue.extend([response(404), response(404)])
    with pytest.raises(transport.GeminiError):
        generate()
    assert len(calls) == 2
    assert delays == []


def test_total_budget_cancels_request_and_preserves_actionable_error(provider, monkeypatch):
    queue, calls, _, _ = provider

    async def stalled_provider():
        await asyncio.Event().wait()

    queue.append(stalled_provider)
    monkeypatch.setattr(transport, "REQUEST_BUDGET_SECONDS", 0.01)
    with pytest.raises(transport.GeminiError, match="existing edits are preserved") as error:
        generate()
    assert error.value.status_code == 504
    assert len(calls) == 1


@pytest.mark.parametrize("body,message", [
    ({}, "no result"),
    (successful_body(finishReason="MAX_TOKENS"), "cut short"),
    ({"candidates": [{"content": {"parts": [{"text": "{"}]}}]}, "invalid JSON"),
])
def test_final_unusable_result_keeps_specific_error(provider, body, message):
    queue, calls, _, _ = provider
    queue.extend([response(body=body), response(body=body)])
    with pytest.raises(transport.GeminiError, match=message):
        generate(models=["only-model"])
    assert len(calls) == 2
