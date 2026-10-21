"""Audio evidence, honest provider errors, strict timestamps and saved highlights."""
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.ai import music_highlights as ai
from app.video.music_library import MusicLibrary


def valid_payload():
    return {"highlights": [{"start": 12.5, "end": 32.5, "label": "Chorus lift",
                             "reason": "A drum pickup opens into stronger vocals and resolves on a downbeat."}]}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    library = MusicLibrary(tmp_path / "library")
    library.directory.mkdir()
    track_id = "b" * 32
    track = {"id": track_id, "name": "Saved music", "title": "Saved music", "duration": 90,
             "saved_ranges": [{"id": "verse", "name": "Verse", "start": 1, "end": 5}],
             "file_url": f"/api/music/{track_id}/file"}
    (library.directory / "index.json").write_text(json.dumps([track]), encoding="utf-8")
    path = library.directory / f"{track_id}.m4a"
    path.write_bytes(b"fixture")
    monkeypatch.setattr(main, "music_library", library)
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(gemini_api_key="test-key"))
    monkeypatch.setattr(ai, "probe_video", lambda _: SimpleNamespace(has_audio=True, duration=90.0))
    calls = []

    async def extract(file_path, duration, full_coverage=False):
        calls.append((file_path, duration, full_coverage))
        return [{"text": "source 0 to 90"}, {"inlineData": {"mimeType": "audio/mpeg", "data": "audio-evidence"}}]

    monkeypatch.setattr(ai, "extract_timed_audio_samples", extract)
    return library, track_id, path, calls


def test_endpoint_uses_registered_full_audio_key_and_persists_other_edits(setup, monkeypatch):
    library, track_id, path, calls = setup

    async def generate(parts, api_key, schema, **kwargs):
        assert api_key == "test-key"
        assert parts[1]["inlineData"]["data"] == "audio-evidence"
        assert schema["required"] == ["highlights"]
        assert "NO listening statistics" in parts[-1]["text"]
        library.rename(track_id, "Edited while analyzing")
        library.save_range(track_id, "Another", 40, 50)
        return valid_payload(), "test-model"

    monkeypatch.setattr(ai, "generate_json", generate)
    client = TestClient(main.app)
    result = client.post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 200, result.text
    assert result.json()["basis"] == "audio_analysis"
    assert result.json()["model_used"] == "test-model"
    assert calls == [(str(path.resolve()), 90.0, True)]
    saved = MusicLibrary(library.directory).get_track(track_id)
    assert saved["ai_highlights"] == result.json()
    assert saved["name"] == "Edited while analyzing"
    assert len(saved["saved_ranges"]) == 2
    assert client.get("/api/music").json()["tracks"][0]["ai_highlights"] == result.json()


@pytest.mark.parametrize("item", [
    {"start": -1, "end": 10}, {"start": 20, "end": 20}, {"start": 80, "end": 95},
    {"start": 1, "end": 50}, {"start": float("nan"), "end": 20},
    {"start": True, "end": 20}, {"start": "12.5", "end": 20},
    {"start": 1, "end": 20, "reason": "This is the most-replayed part"},
])
def test_invalid_model_ranges_and_fake_analytics_are_rejected_without_save(setup, monkeypatch, item):
    library, track_id, _, _ = setup
    payload = valid_payload()
    payload["highlights"][0].update(item)

    async def generate(*args, **kwargs):
        return payload, "test-model"

    monkeypatch.setattr(ai, "generate_json", generate)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 502
    assert "ai_highlights" not in library.get_track(track_id)


@pytest.mark.parametrize("status,message", [
    (429, "Gemini quota reached. Wait and retry."),
    (503, "Gemini rejected your API key. Update Settings."),
    (502, "Gemini is unavailable. Try again shortly."),
])
def test_provider_failures_are_actionable_and_never_fabricate_highlights(setup, monkeypatch, status, message):
    library, track_id, _, _ = setup
    requests = []

    async def generate(*args, **kwargs):
        requests.append(args)
        error = RuntimeError(message)
        error.status_code = status
        raise error

    monkeypatch.setattr(ai, "generate_json", generate)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == status
    assert result.json()["detail"] == message
    assert len(requests) == 1
    assert "ai_highlights" not in library.get_track(track_id)


def test_missing_key_or_missing_track_never_calls_extraction(setup, monkeypatch):
    _, track_id, _, calls = setup
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(gemini_api_key=""))
    client = TestClient(main.app)
    assert client.post(f"/api/music/{track_id}/highlights", json={"duration": 35}).status_code == 503
    assert client.post(f"/api/music/{'c' * 32}/highlights", json={"duration": 35}).status_code == 404
    assert calls == []


def test_gemini_invalid_api_key_response_is_actionable(setup, monkeypatch):
    _, track_id, _, _ = setup

    async def generate(*args, **kwargs):
        error = RuntimeError("Gemini rejected your API key. Update Settings and retry.")
        error.status_code = 503
        raise error

    monkeypatch.setattr(ai, "generate_json", generate)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 503
    assert "Settings" in result.json()["detail"]


@pytest.mark.parametrize("duration", [0, -1, 901, "NaN", "Infinity"])
def test_invalid_request_duration(setup, duration):
    _, track_id, _, calls = setup
    assert TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": duration}).status_code == 422
    assert calls == []


def test_long_or_missing_audio_rejected_before_provider(setup, monkeypatch):
    _, track_id, _, calls = setup
    monkeypatch.setattr(ai, "probe_video", lambda _: SimpleNamespace(has_audio=True, duration=901))
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 400
    assert "15 minutes" in result.json()["detail"]
    assert calls == []


def test_no_extracted_evidence_never_calls_provider(setup, monkeypatch):
    _, track_id, _, _ = setup

    async def extract(*args, **kwargs):
        return [{"text": "No audio"}]

    monkeypatch.setattr(ai, "extract_timed_audio_samples", extract)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 400


def test_persistence_validates_bounds_and_preserves_previous_results(setup):
    library, track_id, _, _ = setup
    result = {**valid_payload(), "basis": "audio_analysis", "model_used": "test-model"}
    library.save_highlights(track_id, result)
    invalid = {**valid_payload(), "basis": "audio_analysis", "model_used": "test-model"}
    invalid["highlights"][0]["end"] = 91
    with pytest.raises(ValueError):
        library.save_highlights(track_id, invalid)
    assert library.get_track(track_id)["ai_highlights"] == result


def test_invalid_highlights_get_one_audio_grounded_repair(setup, monkeypatch):
    _, track_id, _, _ = setup
    prompts = []

    async def generate(parts, *args, **kwargs):
        prompts.append(parts)
        payload = valid_payload()
        if len(prompts) == 1:
            payload["highlights"][0]["end"] = 95
        return payload, "test-model"

    monkeypatch.setattr(ai, "generate_json", generate)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 200, result.text
    assert len(prompts) == 2
    assert prompts[0][1] == prompts[1][1]  # Still listens; repair is never a text-only guess.
    assert "previous response failed validation" in prompts[1][-1]["text"]


def test_duplicate_sections_are_rejected_without_overwriting_saved_results(setup, monkeypatch):
    library, track_id, _, _ = setup
    original = {**valid_payload(), "basis": "audio_analysis", "model_used": "previous-model"}
    library.save_highlights(track_id, original)
    calls = []

    async def generate(*args, **kwargs):
        calls.append(args)
        payload = valid_payload()
        payload["highlights"] *= 2
        return payload, "test-model"

    monkeypatch.setattr(ai, "generate_json", generate)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 502
    assert len(calls) == 2
    assert library.get_track(track_id)["ai_highlights"] == original


def test_short_track_uses_track_length_and_accepts_single_section(setup, monkeypatch):
    _, track_id, _, _ = setup
    monkeypatch.setattr(ai, "probe_video", lambda _: SimpleNamespace(has_audio=True, duration=8.5))

    async def generate(parts, *args, **kwargs):
        assert "Aim for 8.500000 seconds" in parts[-1]["text"]
        return {"highlights": [{"start": 0, "end": 8.5, "label": "Melodic hook",
                               "reason": "The opening melody rises and resolves over the drums."}]}, "test-model"

    monkeypatch.setattr(ai, "generate_json", generate)
    result = TestClient(main.app).post(f"/api/music/{track_id}/highlights", json={"duration": 35})
    assert result.status_code == 200, result.text
    assert result.json()["highlights"][0]["end"] == 8.5
