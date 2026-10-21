"""Selected-reel hook API contracts, without model calls or user media changes."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import app.main as main


@pytest.fixture
def hook_media(tmp_path, monkeypatch):
    root = tmp_path / "workspace"
    downloads = root / "downloads"
    downloads.mkdir(parents=True)
    exports = root / "exports"
    exports.mkdir()
    monkeypatch.setattr(main, "MEDIA_REGISTRY_FILE", root / "projects" / ".selected_media.json")
    monkeypatch.setattr(main, "ALLOWED_MEDIA_DIRS", [downloads, exports])
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(default_export_dir=str(exports)))
    video = downloads / "reel.mp4"
    video.write_bytes(b"mock video; model transport is replaced")
    return video


@pytest.mark.parametrize("field,value", [
    ("start_time", -1), ("end_time", 0), ("end_time", -1),
    ("start_time", float("nan")), ("end_time", float("nan")),
    ("start_time", float("inf")), ("end_time", float("inf")),
    ("start_time", float("-inf")), ("end_time", float("-inf")),
    ("video_path", ""),
])
def test_hook_request_rejects_invalid_fields(field, value):
    payload = {"video_path": "reel.mp4", "start_time": 10, "end_time": 30}
    payload[field] = value
    with pytest.raises(ValidationError):
        main.ViralHooksRequest(**payload)


@pytest.mark.parametrize("missing", ["video_path", "start_time", "end_time"])
def test_hook_request_requires_actual_selected_media(missing):
    payload = {"video_path": "reel.mp4", "start_time": 10, "end_time": 30}
    del payload[missing]
    with pytest.raises(ValidationError):
        main.ViralHooksRequest(**payload)


@pytest.mark.parametrize("start,end", [(30, 30), (30, 20), (0, 361)])
def test_hook_route_rejects_invalid_selection_without_model(hook_media, monkeypatch, start, end):
    monkeypatch.setattr(main.gemini_client, "generate_viral_hooks", lambda **kw: pytest.fail("Must not call AI"))
    request = main.ViralHooksRequest(video_path=str(hook_media), start_time=start, end_time=end)
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.api_generate_viral_hooks(request))
    assert error.value.status_code == 400


def test_hook_route_passes_authorized_media_and_selected_trim(hook_media, monkeypatch):
    received = {}
    hooks = [{"hook": "This smile disappears before the chorus", "category": "contrast", "evidence": "Smile at 0:01"}]

    async def generate(**kwargs):
        received.update(kwargs)
        return hooks

    monkeypatch.setattr(main.gemini_client, "generate_viral_hooks", generate)
    request = main.ViralHooksRequest(video_path=str(hook_media), start_time=12.5,
                                    end_time=37.25, song_name="Song", anime_name="Anime", video_title="Title",
                                    creator_instruction="Make it emotional and avoid emojis")
    result = asyncio.run(main.api_generate_viral_hooks(request))
    assert result == {"hooks": hooks}
    assert received["video_path"] == str(hook_media.resolve())
    assert received["start_time"] == 12.5
    assert received["end_time"] == 37.25
    assert received["song_name"] == "Song"
    assert received["anime_name"] == "Anime"
    assert received["video_title"] == "Title"
    assert received["creator_instruction"] == "Make it emotional and avoid emojis"


def test_caption_route_passes_creator_direction(monkeypatch):
    received = {}

    async def generate(**kwargs):
        received.update(kwargs)
        return {"caption": "A ready caption", "source": "gemini"}

    monkeypatch.setattr(main.gemini_client, "generate_instagram_caption", generate)
    result = asyncio.run(main.api_generate_instagram_caption(main.InstagramCaptionRequest(
        anime_name="Anime", hook="The hook", creator_instruction="Keep it heartfelt and concise"
    )))
    assert result["caption"] == "A ready caption"
    assert received["creator_instruction"] == "Keep it heartfelt and concise"


def test_creator_direction_allows_a_long_multiline_brief():
    brief = "\n".join(f"Direction {number}: keep this exact preference." for number in range(100))
    assert len(brief) > 1_000
    request = main.ViralHooksRequest(video_path="reel.mp4", start_time=0, end_time=30,
                                     creator_instruction=brief)
    assert request.creator_instruction == brief


def test_hook_route_rejects_unselected_external_media_before_model(hook_media, tmp_path, monkeypatch):
    outside = tmp_path / "private.mp4"
    outside.write_bytes(b"private media")
    monkeypatch.setattr(main.gemini_client, "generate_viral_hooks", lambda **kw: pytest.fail("Must not call AI"))
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.api_generate_viral_hooks(main.ViralHooksRequest(
            video_path=str(outside), start_time=0, end_time=30)))
    assert error.value.status_code == 403


def test_hook_route_surfaces_model_failure_without_stock_hooks(hook_media, monkeypatch):
    async def generate(**kwargs):
        raise RuntimeError("Could not understand the selected reel")

    monkeypatch.setattr(main.gemini_client, "generate_viral_hooks", generate)
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.api_generate_viral_hooks(main.ViralHooksRequest(
            video_path=str(hook_media), start_time=0, end_time=30)))
    assert error.value.status_code == 502
    assert "Could not understand the selected reel" in error.value.detail


@pytest.mark.parametrize("status,message", [(429, "Gemini quota reached"), (403, "Gemini rejected the API key"),
                                            (504, "Gemini took too long")])
def test_hook_route_preserves_actionable_gemini_error_status(hook_media, monkeypatch, status, message):
    from app.ai.gemini_transport import GeminiError

    async def generate(**kwargs):
        raise GeminiError(message, status)

    monkeypatch.setattr(main.gemini_client, "generate_viral_hooks", generate)
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.api_generate_viral_hooks(main.ViralHooksRequest(
            video_path=str(hook_media), start_time=0, end_time=30)))
    assert error.value.status_code == status
    assert error.value.detail == message
