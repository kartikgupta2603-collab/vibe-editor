"""Backend regressions use temporary files and mocked Instagram transport only."""
import asyncio
import io
import json
import threading
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException, UploadFile

import app.main as main
import app.config.settings as config
from app.scheduler import instagram_scheduler as scheduler


@pytest.fixture
def isolated_media(tmp_path, monkeypatch):
    root = tmp_path / "workspace"
    root.mkdir()
    exports = root / "exports"
    exports.mkdir()
    monkeypatch.setattr(main, "__file__", str(root / "app" / "main.py"))
    monkeypatch.setattr(main, "MEDIA_REGISTRY_FILE", root / "projects" / ".selected_media.json")
    monkeypatch.setattr(main, "ALLOWED_MEDIA_DIRS", [root / "downloads", exports])
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(default_export_dir=str(exports)))
    return root


def test_upload_uses_unique_basename_without_overwriting(isolated_media):
    sentinel = isolated_media / "run.py"
    sentinel.write_text("preserve")
    uploads = []
    for name in ["../run.py", "../clip.mp4", r"C:\outside\clip.mp4", "clip.mp4"]:
        upload = UploadFile(file=io.BytesIO(b"new-video"), filename=name)
        if name.endswith(".py"):
            with pytest.raises(HTTPException) as err:
                asyncio.run(main.api_upload_video(upload))
            assert err.value.status_code == 400
            continue
        result = asyncio.run(main.api_upload_video(upload))
        output = Path(result["file_path"])
        assert output.parent == isolated_media / "downloads"
        assert output.read_bytes() == b"new-video"
        uploads.append(output)
    assert len(set(uploads)) == 3
    assert sentinel.read_text() == "preserve"


def test_registered_native_video_survives_reload_and_only_grants_one_file(isolated_media, tmp_path):
    video = tmp_path / "native.mp4"
    sibling = tmp_path / "other.mp4"
    video.write_bytes(b"video")
    sibling.write_bytes(b"other")
    with pytest.raises(HTTPException):
        main._validate_safe_media_path(str(video))
    main._register_selected_media(str(video))
    assert main._validate_safe_media_path(str(video)) == video.resolve()
    # Registration lives on disk, so a fresh lookup needs no in-memory cache.
    assert str(video.resolve()) in json.loads(main.MEDIA_REGISTRY_FILE.read_text())
    with pytest.raises(HTTPException) as err:
        main._validate_safe_media_path(str(sibling))
    assert err.value.status_code == 403


def test_media_guard_rejects_sibling_prefix_and_nonmedia(isolated_media):
    sibling = isolated_media / "exports_private"
    sibling.mkdir()
    outside = sibling / "clip.mp4"
    outside.write_bytes(b"private")
    secret = isolated_media / "exports" / "settings.json"
    secret.write_text("private")
    for candidate in (outside, secret):
        with pytest.raises(HTTPException) as err:
            main._validate_safe_media_path(str(candidate))
        assert err.value.status_code == 403


def test_configured_export_folder_is_streamable(isolated_media, tmp_path, monkeypatch):
    custom = tmp_path / "custom-exports"
    custom.mkdir()
    video = custom / "reel.mp4"
    video.write_bytes(b"export")
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(default_export_dir=str(custom)))
    assert main._validate_safe_media_path(str(video)) == video.resolve()


def test_compatibility_registers_only_output_of_authorized_source(isolated_media, tmp_path, monkeypatch):
    source = tmp_path / "native.mp4"
    compat = tmp_path / "native_h264.mp4"
    source.write_bytes(b"source")
    compat.write_bytes(b"converted")
    main._register_selected_media(str(source))
    monkeypatch.setattr(main, "ensure_browser_compatible", lambda *a, **kw: str(compat))
    main.api_ensure_compatible(main.CompatibleVideoRequest(file_path=str(source)))
    assert main._validate_safe_media_path(str(compat)) == compat.resolve()
    unselected = tmp_path / "other.mp4"
    unselected.write_bytes(b"unselected")
    with pytest.raises(HTTPException):
        main.api_ensure_compatible(main.CompatibleVideoRequest(file_path=str(unselected)))


def test_exports_are_unique_and_forward_subtitle_controls(isolated_media, monkeypatch):
    source = isolated_media / "source.mp4"
    source.write_bytes(b"source")
    original = isolated_media / "exports" / "chosen.mp4"
    original.write_bytes(b"old-export")
    calls = []
    def render(**kwargs):
        calls.append(kwargs)
        Path(kwargs["output_mp4"]).write_bytes(b"rendered")
        return kwargs["output_mp4"]
    monkeypatch.setattr(main.renderer, "render_reel", render)
    monkeypatch.setattr(main.project_manager, "add_history_entry", lambda **kw: kw)
    monkeypatch.setattr(main, "EXPORT_TASKS", {})
    request = main.ExportRequest(source_video=str(source), output_name="../chosen.mp4",
                                 template={"name": "test"}, subtitle_font_size=57, subtitle_x=321)
    for task_id in ("first", "second"):
        main.EXPORT_TASKS[task_id] = {}
        main._execute_export(task_id, request)
        assert main.EXPORT_TASKS[task_id]["status"] == "completed"
    assert calls[0]["output_mp4"] != calls[1]["output_mp4"]
    assert all(Path(call["output_mp4"]).parent == original.parent for call in calls)
    assert calls[0]["subtitle_font_size"] == 57
    assert calls[0]["subtitle_x"] == 321
    assert original.read_bytes() == b"old-export"


def test_missing_source_fails_without_guessing_another_video(isolated_media, monkeypatch):
    monkeypatch.setattr(main, "EXPORT_TASKS", {"test": {}})
    monkeypatch.setattr(main.renderer, "render_reel", lambda **kw: pytest.fail("Must not render guessed source"))
    main._execute_export("test", main.ExportRequest(source_video=str(isolated_media / "missing.mp4")))
    assert main.EXPORT_TASKS["test"]["status"] == "error"
    assert "re-select" in main.EXPORT_TASKS["test"]["message"]


@pytest.fixture
def isolated_schedule(tmp_path, monkeypatch):
    monkeypatch.setattr(scheduler, "SCHEDULE_DIR", tmp_path)
    monkeypatch.setattr(scheduler, "SCHEDULE_FILE", tmp_path / "queue.json")
    monkeypatch.setattr(scheduler, "_scheduler_stop_event", threading.Event())
    monkeypatch.setattr(scheduler, "_get_ig_credentials", lambda: ("test-token", "test-user"))
    monkeypatch.setattr(config, "get_settings", lambda: SimpleNamespace(host="localhost", port=8000,
                            instagram_video_base_url="https://example.invalid"))
    monkeypatch.setattr(scheduler.time, "sleep", lambda seconds: None)
    return tmp_path


def test_invalid_saved_timestamp_is_persisted_as_failed(isolated_schedule):
    scheduler._save_queue([{"id": "invalid", "status": "pending", "scheduled_time": "nonsense"}])
    scheduler._process_due_items()
    item = scheduler.list_scheduled()[0]
    assert item["status"] == "failed"
    assert "Invalid scheduled time" in item["error_message"]


def test_schedule_rejects_invalid_or_timezone_free_times(isolated_schedule):
    video = isolated_schedule / "reel.mp4"
    video.write_bytes(b"video")
    for timestamp in ("invalid", "2030-01-01T12:00:00"):
        with pytest.raises(ValueError):
            scheduler.add_to_schedule(str(video), timestamp)
        with pytest.raises(ValueError):
            scheduler.update_schedule_item("unknown", {"scheduled_time": timestamp})
    assert scheduler.list_scheduled() == []


def test_interrupted_legacy_post_requires_manual_review(isolated_schedule):
    scheduler._save_queue([{"id": "legacy", "status": "posting"}])
    scheduler._recover_interrupted_items()
    item = scheduler.list_scheduled()[0]
    assert item["status"] == "failed"
    assert item["recovery_required"] is True
    with pytest.raises(ValueError):
        scheduler.retry_schedule_item("legacy")


def test_recovered_published_container_is_not_published_again(isolated_schedule, monkeypatch):
    item = {"id": "recover", "status": "posting", "ig_container_id": "container-1",
            "file_path": str(isolated_schedule / "missing.mp4"), "file_name": "reel.mp4",
            "scheduled_time": "2020-01-01T00:00:00Z"}
    scheduler._save_queue([item])
    scheduler._recover_interrupted_items()
    requests = []
    def respond(request):
        requests.append(request)
        assert request.method == "GET"
        assert request.url.path.endswith("container-1")
        return httpx.Response(200, json={"status_code": "PUBLISHED"})
    client_type = httpx.Client
    monkeypatch.setattr(scheduler.httpx, "Client", lambda **kw: client_type(transport=httpx.MockTransport(respond)))
    scheduler._process_due_items()
    assert scheduler.list_scheduled()[0]["status"] == "posted"
    assert len(requests) == 1


def test_ambiguous_publish_retry_reuses_container(isolated_schedule, monkeypatch):
    video = isolated_schedule / "reel.mp4"
    video.write_bytes(b"video")
    item = scheduler.add_to_schedule(str(video), "2020-01-01T00:00:00Z")
    requests = []
    published = False
    def respond(request):
        nonlocal published
        requests.append((request.method, request.url.path))
        if request.url.path.endswith("/media"):
            return httpx.Response(200, json={"id": "saved-container"})
        if request.method == "GET":
            return httpx.Response(200, json={"status_code": "PUBLISHED" if published else "FINISHED"})
        assert scheduler.list_scheduled()[0]["ig_container_id"] == "saved-container"
        assert scheduler.list_scheduled()[0]["publish_started"] is True
        published = True
        raise httpx.ReadTimeout("Connection lost after publishing", request=request)
    client_type = httpx.Client
    monkeypatch.setattr(scheduler.httpx, "Client", lambda **kw: client_type(transport=httpx.MockTransport(respond)))
    scheduler._process_due_items()
    assert scheduler.list_scheduled()[0]["status"] == "failed"
    scheduler.retry_schedule_item(item["id"])
    scheduler._process_due_items()
    assert scheduler.list_scheduled()[0]["status"] == "posted"
    assert sum(method == "POST" and path.endswith("/media") for method, path in requests) == 1
    assert sum(path.endswith("/media_publish") for _, path in requests) == 1
