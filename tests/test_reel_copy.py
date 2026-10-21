"""Rebuilt reel writing uses supplied evidence and never substitutes stock copy."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ai import reel_copy as copy


def response():
    return {
        "reel_summary": "A calm smile contrasts with a panicked crowd.",
        "observations": [
            {"timestamp": 1, "visual": "A person smiles while others run.", "audio": "A low note holds."},
            {"timestamp": 8, "visual": "The smile fades when the door opens.", "audio": "The music stops."},
        ],
        "hooks": [
            {"hook": "That smile has suspiciously good timing", "category": "curiosity", "evidence_indices": [0, 1]},
            {"hook": "Everyone runs except the calmest person", "category": "contrast", "evidence_indices": [0]},
        ],
    }


def test_hook_schema_avoids_provider_rejected_200_item_decoding_bound():
    # Live isolation: otherwise identical schema is accepted with maxItems 20
    # and rejected with maxItems 200, even for a text-only request.
    assert "maxItems" not in copy.HOOK_SCHEMA["properties"]["hooks"]
    too_many = response()
    too_many["hooks"] = too_many["hooks"][:1] * 201
    with pytest.raises(RuntimeError, match="grounded hooks"):
        copy._validate_hooks(too_many, duration=10, has_audio=True, limit=200)


@pytest.fixture
def model(monkeypatch):
    monkeypatch.setattr(copy, "get_settings", lambda: SimpleNamespace(gemini_api_key="test-key"))
    evidence = AsyncMock(return_value={"part": {"inlineData": {"mimeType": "video/mp4", "data": "fixture"}},
                                      "duration": 10, "has_audio": True})
    request = AsyncMock(return_value=(response(), "test-model"))
    monkeypatch.setattr(copy, "_extract_video", evidence)
    monkeypatch.setattr(copy, "_generate_json", request)
    return evidence, request


def hooks(**kwargs):
    return asyncio.run(copy.generate_viral_hooks(video_path="selected.mp4", start_time=20, end_time=30, **kwargs))


def caption(**kwargs):
    return asyncio.run(copy.generate_instagram_caption(**kwargs))


def test_hooks_upload_actual_selected_media_once_and_keep_evidence(model):
    evidence, request = model
    result = hooks(creator_instruction="Give me 2 emotional hooks", anime_name="A hint")
    evidence.assert_awaited_once_with("selected.mp4", 20, 30)
    request.assert_awaited_once()
    parts, key, schema = request.call_args.args
    assert key == "test-key" and schema == copy.HOOK_SCHEMA
    assert parts[0] == evidence.return_value["part"]
    assert "from 20.00s to 30.00s" in parts[1]["text"]
    assert "up to 2 genuinely distinct hooks" in parts[1]["text"]
    assert "Give me 2 emotional hooks" in parts[1]["text"]
    assert "A person smiles" in result[0]["evidence"]
    assert "The music stops" in result[0]["evidence"]
    assert all(set(row) == {"hook", "category", "evidence"} for row in result)


@pytest.mark.parametrize("instruction,count", [("", 20), ("Write 1 hook", 1), ("Give 200 hooks", 200),
                                                ("Give 999 different hooks", 200), ("give 3 short options", 3)])
def test_requested_batch_is_bounded_and_small_requests_work(instruction, count):
    assert copy._requested_hook_count(instruction) == count


def test_simple_clip_can_return_one_good_hook_without_artificial_minimum(model):
    data = response()
    data["hooks"] = data["hooks"][:1]
    model[1].return_value = data, "test-model"
    assert len(hooks()) == 1


def test_one_bad_hook_does_not_discard_valid_candidates(model, caplog):
    data = response()
    duplicate = deepcopy(data["hooks"][0])
    invalid_index = {**duplicate, "evidence_indices": [-1]}
    generic = {**duplicate, "hook": "This anime scene really hits different"}
    data["hooks"] += [duplicate, invalid_index, generic, "invalid"]
    model[1].return_value = data, "test-model"
    assert len(hooks()) == 2
    assert "discarded 4" in caplog.text


@pytest.mark.parametrize("indices", [[], [-1], [2], [True], [1.5], "0", [1]])
def test_hooks_without_valid_opening_evidence_are_removed(model, indices):
    data = response()
    data["hooks"][0]["evidence_indices"] = indices
    model[1].return_value = data, "test-model"
    result = hooks()
    assert len(result) == 1
    assert result[0]["hook"] == data["hooks"][1]["hook"]


@pytest.mark.parametrize("timestamp", [-1, 11, float("nan"), float("inf"), True, "1"])
def test_invalid_observation_timestamps_fail_honestly(model, timestamp):
    data = response()
    data["observations"][0]["timestamp"] = timestamp
    model[1].return_value = data, "test-model"
    with pytest.raises(RuntimeError, match="unsupported"):
        hooks()


def test_silent_media_cannot_claim_audio(model):
    model[0].return_value["has_audio"] = False
    with pytest.raises(RuntimeError, match="unsupported"):
        hooks()
    data = response()
    for observation in data["observations"]:
        observation["audio"] = ""
    model[1].return_value = data, "test-model"
    assert len(hooks()) == 2


@pytest.mark.parametrize("data", [{}, {"reel_summary": "Unclear", "observations": [], "hooks": []},
                                  {**response(), "hooks": []}])
def test_unusable_response_never_produces_stock_hooks(model, data):
    model[1].return_value = data, "test-model"
    with pytest.raises(RuntimeError, match="Gemini"):
        hooks()


@pytest.mark.parametrize("kind", ["hooks", "caption"])
def test_missing_key_stops_before_media_or_model(model, monkeypatch, kind):
    monkeypatch.setattr(copy, "get_settings", lambda: SimpleNamespace(gemini_api_key=""))
    with pytest.raises(RuntimeError, match="API key"):
        hooks() if kind == "hooks" else caption(video_title="A reel")
    model[0].assert_not_awaited()
    model[1].assert_not_awaited()


@pytest.mark.parametrize("kind", ["hooks", "caption"])
def test_transport_failure_propagates_without_fake_output_or_extra_request(model, kind):
    model[1].side_effect = RuntimeError("Gemini quota is exhausted")
    with pytest.raises(RuntimeError, match="quota"):
        hooks() if kind == "hooks" else caption(video_title="A reel")
    model[1].assert_awaited_once()


def test_caption_is_context_grounded_and_honors_creator_request(model):
    model[1].return_value = {"caption": "A quiet pause before the door opens.\n\n#Anime"}, "test-model"
    result = caption(anime_name="Creator-supplied title", song_name="https://example.com/track", hook="A quiet pause",
                     creator_instruction="Keep it short with no emojis", api_key_override="override")
    parts, key, schema = model[1].call_args.args
    prompt = parts[0]["text"]
    assert key == "override" and schema == copy.CAPTION_SCHEMA
    assert "Creator-supplied title" in prompt and "A quiet pause" in prompt
    assert "https://example.com/track" not in prompt
    assert "Keep it short with no emojis" in prompt
    assert "You have not watched this video" in prompt
    assert "unless those\nfacts are explicitly supplied" in prompt
    assert result == {"caption": "A quiet pause before the door opens.\n\n#Anime", "source": "gemini"}
    model[0].assert_not_awaited()


@pytest.mark.parametrize("data", [{}, {"caption": 123}, {"caption": "   "}, {"caption": "x" * 24001},
                                  {"caption": "\n".join("line" for _ in range(201))}])
def test_caption_rejects_empty_wrong_type_or_excessive_output(model, data):
    model[1].return_value = data, "test-model"
    with pytest.raises(RuntimeError, match="caption"):
        caption(hook="A meaningful detail")


def test_caption_requires_some_actual_context_before_model(model):
    with pytest.raises(RuntimeError, match="Add a reel"):
        caption(song_name="https://example.com/track", creator_instruction="Write a caption")
    model[1].assert_not_awaited()
