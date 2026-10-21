from pathlib import Path

from fastapi.testclient import TestClient
import pytest

import app.main as main


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "APP_ROOT", tmp_path)
    monkeypatch.setattr(main, "DOWNLOAD_TASKS", {})
    return TestClient(main.app)


def test_image_job_returns_files_and_progress_without_importing_video(client, monkeypatch):
    files = [{"file_path": "photo.png", "filename": "photo.png", "width": 400, "height": 600}]
    def download(url, progress_callback):
        assert url == "https://example.com/photo.png"
        progress_callback(50, "Downloading image 1")
        return files
    monkeypatch.setattr(main, "download_post_images", download)
    response = client.post("/api/images/download", json={"url": "https://example.com/photo.png"})
    assert response.status_code == 200
    task = client.get(f"/api/images/status/{response.json()['task_id']}").json()
    assert task["status"] == "completed"
    assert task["progress"] == 100
    assert task["files"] == files
    assert task["media_type"] == "images"


def test_background_image_failure_is_visible(client, monkeypatch, caplog):
    def unavailable(*args, **kwargs):
        raise ValueError("This post requires sign-in. Use a direct image link.")
    monkeypatch.setattr(main, "download_post_images", unavailable)
    response = client.post("/api/images/download", json={"url": "https://example.com/photo.png"})
    task = client.get(f"/api/images/status/{response.json()['task_id']}").json()
    assert task["status"] == "error"
    assert "requires sign-in" in task["message"]
    assert "Image download failed" in caplog.text


@pytest.mark.parametrize("url", ["", "file:///C:/secret.png", "javascript:alert(1)", "https://user:pass@example.com/x.jpg"])
def test_invalid_image_url_is_rejected_before_queue(client, url):
    assert client.post("/api/images/download", json={"url": url}).status_code == 400
    assert not main.DOWNLOAD_TASKS


def test_video_task_is_not_exposed_as_image_task(client):
    main.DOWNLOAD_TASKS["video"] = {"status": "completed", "file_path": "video.mp4"}
    assert client.get("/api/images/status/video").status_code == 404


def test_image_import_queues_conversion_and_returns_a_studio_source(client, monkeypatch):
    def convert(path, duration, progress_callback):
        assert path == "photo.png"
        assert duration == 25
        progress_callback(50, "Preparing Studio image")
        return {"file_path": "still.mp4", "title": "Photo", "duration": duration}
    monkeypatch.setattr(main, "import_studio_image", convert)
    response = client.post("/api/images/import", json={"file_path": "photo.png", "duration": 25})
    assert response.status_code == 200
    task = client.get(f"/api/images/status/{response.json()['task_id']}").json()
    assert task["status"] == "completed"
    assert task["file_path"] == "still.mp4"
    assert task["duration"] == 25


def test_image_import_failure_is_actionable(client, monkeypatch, caplog):
    def invalid(*args, **kwargs):
        raise ValueError("Use a downloaded image from downloads/images.")
    monkeypatch.setattr(main, "import_studio_image", invalid)
    response = client.post("/api/images/import", json={"file_path": "C:/outside.png"})
    task = client.get(f"/api/images/status/{response.json()['task_id']}").json()
    assert task["status"] == "error"
    assert "downloaded image" in task["message"]
    assert "Studio image import failed" in caplog.text


def test_image_source_recovers_original_after_server_task_memory_is_cleared(client):
    import json
    original = main.APP_ROOT / "downloads/images/upload/photo.png"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"original")
    clip = main.APP_ROOT / "downloads/images/studio/clip.mp4"
    clip.parent.mkdir(parents=True)
    clip.write_bytes(b"source clip")
    clip.with_suffix(".image.json").write_text(json.dumps({"source_image_path": str(original), "duration": 12.5, "title": "Photo"}), encoding="utf-8")
    result = client.get("/api/images/source", params={"path": str(clip)})
    assert result.status_code == 200
    assert result.json() == {"source_image_path": str(original), "duration": 12.5, "title": "Photo"}
    assert not main.DOWNLOAD_TASKS


def test_image_source_rejects_ordinary_videos_and_unsafe_original_metadata(client):
    import json
    assert client.get("/api/images/source", params={"path": str(main.APP_ROOT / "downloads/video.mp4")}).status_code == 404
    clip = main.APP_ROOT / "downloads/images/studio/clip.mp4"
    clip.parent.mkdir(parents=True)
    clip.write_bytes(b"source clip")
    assert client.get("/api/images/source", params={"path": str(clip)}).status_code == 404
    outside = main.APP_ROOT / "projects/private.png"
    outside.parent.mkdir(parents=True)
    outside.write_bytes(b"outside")
    clip.with_suffix(".image.json").write_text(json.dumps({"source_image_path": str(outside), "duration": 10}), encoding="utf-8")
    assert client.get("/api/images/source", params={"path": str(clip)}).status_code == 400


def test_image_source_can_recover_a_pre_metadata_import_in_the_current_session(client):
    original = main.APP_ROOT / "downloads/images/photo.png"
    original.parent.mkdir(parents=True)
    original.write_bytes(b"original")
    clip = main.APP_ROOT / "downloads/images/studio/clip.mp4"
    clip.parent.mkdir(parents=True)
    clip.write_bytes(b"clip")
    main.DOWNLOAD_TASKS["old-import"] = {"status": "completed", "file_path": str(clip), "source_image_path": str(original), "duration": 10}
    response = client.get("/api/images/source", params={"path": str(clip)})
    assert response.status_code == 200
    assert response.json()["source_image_path"] == str(original)


@pytest.mark.parametrize("duration", [0, -1, 301, "NaN", "Infinity"])
def test_image_import_duration_is_bounded(client, duration):
    assert client.post("/api/images/import", json={"file_path": "photo.png", "duration": duration}).status_code == 422


def test_only_downloaded_images_are_served_and_download_keeps_filename(client):
    image = main.APP_ROOT / "downloads/images/test/photo.png"
    image.parent.mkdir(parents=True)
    content = b"original image bytes"
    image.write_bytes(content)
    response = client.get("/api/images/file", params={"path": str(image)})
    assert response.content == content
    assert response.headers["content-type"] == "image/png"
    assert 'attachment; filename="photo.png"' == response.headers["content-disposition"]
    preview = client.get("/api/images/file", params={"path": str(image), "download": "false"})
    assert preview.content == content
    assert "content-disposition" not in preview.headers
    assert client.head("/api/images/file", params={"path": str(image)}).status_code == 200
    assert client.get("/api/images/file", params={"path": str(image.with_name("missing.png"))}).status_code == 404
    assert client.get("/api/images/file", params={"path": str(image.with_suffix(".mp4"))}).status_code == 403
    assert client.get("/api/images/file", params={"path": str(main.APP_ROOT / "projects/photo.png")}).status_code == 403
    assert client.get("/api/media/stream", params={"path": str(image)}).status_code == 403
