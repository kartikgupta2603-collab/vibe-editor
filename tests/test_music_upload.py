"""Local audio uses the same durable MP3 library as linked songs."""
import io
import math
import shutil
import struct
import time
import wave
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.video import music_library as music_module
from app.video.music_library import MusicLibrary


@pytest.fixture
def uploaded_library(tmp_path, monkeypatch):
    library = MusicLibrary(tmp_path / "library")
    monkeypatch.setattr(main, "music_library", library)
    monkeypatch.setattr(main, "APP_ROOT", tmp_path)
    monkeypatch.setattr(music_module, "ROOT", tmp_path)
    return library, TestClient(main.app), tmp_path


def wav_bytes():
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(22050)
        audio.writeframes(b"".join(struct.pack("<h", int(10000 * math.sin(index * .2))) for index in range(4410)))
    return output.getvalue()


def await_task(library, task_id, root):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        task = library.task(task_id)
        if task["status"] in {"error", "completed"} and not list((root / "temp" / "music_uploads").iterdir()):
            return task
        time.sleep(.01)
    pytest.fail(f"Import or cleanup did not finish: {library.task(task_id)}")


@pytest.mark.parametrize("name,expected", [("", "Favorite song"), ("  My chorus  ", "My chorus")])
def test_upload_real_wav_persists_mp3_and_preserves_original(uploaded_library, name, expected):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg and FFprobe are required")
    library, client, root = uploaded_library
    source = root / "Favorite song.wav"
    content = wav_bytes()
    source.write_bytes(content)
    response = client.post("/api/music/upload", files={"file": (source.name, content, "audio/wav")}, data={"name": name})
    assert response.status_code == 200, response.text
    task = await_task(library, response.json()["task_id"], root)
    assert task["status"] == "completed", task
    track = task["track"]
    assert track["name"] == expected
    assert track["title"] == "Favorite song"
    assert track["source_url"] == ""
    assert track["format"] == "mp3"
    assert .15 < track["duration"] < .3
    assert MusicLibrary(library.directory).get_track(track["id"]) == track
    assert library.resolve_file(track["id"]).suffix == ".mp3"
    assert client.get(track["file_url"]).headers["content-type"] == "audio/mpeg"
    assert source.read_bytes() == content


@pytest.mark.parametrize("filename,content,code", [("video.mp4", b"video", 400), ("song.wav", b"", 400)])
def test_rejected_upload_is_clean(uploaded_library, filename, content, code):
    library, client, root = uploaded_library
    response = client.post("/api/music/upload", files={"file": (filename, content)})
    assert response.status_code == code
    assert library.list_tracks() == []
    assert not list((root / "temp").rglob("*.*"))


def test_oversized_upload_is_rejected_without_saving(uploaded_library, monkeypatch):
    library, client, root = uploaded_library
    monkeypatch.setattr(main, "MAX_AUDIO_UPLOAD_BYTES", 10)
    response = client.post("/api/music/upload", files={"file": ("song.wav", b"x" * 11)})
    assert response.status_code == 413
    assert "256 MB" in response.json()["detail"]
    assert library.list_tracks() == []
    assert not list((root / "temp").rglob("*.*"))


def test_invalid_audio_fails_task_and_removes_upload(uploaded_library):
    library, client, root = uploaded_library
    response = client.post("/api/music/upload", files={"file": ("fake.mp3", b"not audio")})
    assert response.status_code == 200
    task = await_task(library, response.json()["task_id"], root)
    assert task["status"] == "error"
    assert "inspect" in task["error"].lower()
    assert library.list_tracks() == []
    assert not library.directory.exists()


@pytest.mark.parametrize("probe", [SimpleNamespace(has_audio=False), SimpleNamespace(has_audio=True, duration=float("nan"))])
def test_missing_audio_or_duration_does_not_commit(uploaded_library, monkeypatch, probe):
    library, client, root = uploaded_library
    monkeypatch.setattr(music_module, "probe_video", lambda _: probe)
    response = client.post("/api/music/upload", files={"file": ("invalid.wav", b"bytes")})
    task = await_task(library, response.json()["task_id"], root)
    assert task["status"] == "error"
    assert "audio" in task["error"].lower()
    assert library.list_tracks() == []


def test_upload_filename_never_controls_disk_path(uploaded_library, monkeypatch):
    library, client, root = uploaded_library
    seen = []

    def consume(path, filename, name):
        seen.append((path, filename))
        assert path.parent == root / "temp" / "music_uploads"
        assert len(path.stem) == 32
        assert path.read_bytes() == b"content"
        path.unlink()
        return "test-task"

    monkeypatch.setattr(library, "start_local_import", consume)
    response = client.post("/api/music/upload", files={"file": ("../../outside.wav", b"content")})
    assert response.status_code == 200
    assert seen[0][1] == "outside.wav"
    outside = root / "original.wav"
    outside.write_bytes(b"preserve")
    with pytest.raises(ValueError, match="outside"):
        MusicLibrary(root / "other-library").start_local_import(outside, outside.name)
    assert outside.read_bytes() == b"preserve"


def test_upload_invalid_name_does_not_create_task(uploaded_library):
    library, client, root = uploaded_library
    response = client.post("/api/music/upload", files={"file": ("song.wav", b"audio")}, data={"name": "x" * 201})
    assert response.status_code == 400
    assert library.tasks == {}
    assert not list((root / "temp").rglob("*.*"))
