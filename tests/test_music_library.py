"""Music persistence, import, serving and request boundary regressions."""
import json
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from app.video.music_library import MusicLibrary
from app.video import music_library as music_module


@pytest.fixture
def library(tmp_path, monkeypatch):
    library = MusicLibrary(tmp_path / "library")
    monkeypatch.setattr(main, "music_library", library)
    return library


def seed(library):
    library.directory.mkdir()
    track = {"id": "a" * 32, "name": "Song", "title": "Song", "duration": 10,
             "saved_ranges": [], "file_url": f"/api/music/{'a' * 32}/file"}
    (library.directory / "index.json").write_text(json.dumps([track]), encoding="utf-8")
    (library.directory / f"{track['id']}.m4a").write_bytes(b"music")
    return track


def test_names_and_ranges_survive_restart_and_search(library):
    track = seed(library)
    library.rename(track["id"], "  My opening  ")
    library.save_range(track["id"], "Chorus", 2.5, 8)
    restarted = MusicLibrary(library.directory)
    saved = restarted.list_tracks("OPENING")[0]
    assert saved["name"] == "My opening"
    assert saved["saved_ranges"][0]["start"] == 2.5
    assert restarted.resolve_file(track["id"]).is_file()


@pytest.mark.parametrize("audio_format", ["m4a", "mp3"])
def test_delete_removes_only_chosen_song_and_file(library, audio_format):
    track = seed(library)
    if audio_format == "mp3":
        (library.directory / f"{track['id']}.m4a").rename(library.directory / f"{track['id']}.mp3")
        track["format"] = "mp3"
    other = {**track, "id": "b" * 32, "name": "Keep me"}
    index = library.directory / "index.json"
    index.write_text(json.dumps([track, other]), encoding="utf-8")
    (library.directory / f"{other['id']}.{audio_format}").write_bytes(b"keep")
    response = TestClient(main.app).delete(f"/api/music/{track['id']}")
    assert response.status_code == 200
    assert not (library.directory / f"{track['id']}.{audio_format}").exists()
    assert library.list_tracks() == [other]
    assert library.resolve_file(other["id"]).read_bytes() == b"keep"
    assert TestClient(main.app).delete(f"/api/music/{track['id']}").status_code == 404


def test_failed_file_deletion_preserves_saved_song(library, monkeypatch):
    track = seed(library)
    path = library.resolve_file(track["id"])
    unlink = Path.unlink

    def blocked(target, *args, **kwargs):
        if target == path:
            raise PermissionError("Close the audio file and try again.")
        return unlink(target, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", blocked)
    with pytest.raises(PermissionError):
        library.delete(track["id"])
    assert library.get_track(track["id"]) == track
    assert path.read_bytes() == b"music"


@pytest.mark.parametrize("start,end", [(4, 4), (-1, 3), (0, 11), (float("nan"), 3)])
def test_invalid_selections_do_not_modify_saved_data(library, start, end):
    track = seed(library)
    with pytest.raises(ValueError):
        library.save_range(track["id"], "Bad", start, end)
    assert library.get_track(track["id"])["saved_ranges"] == []


def test_paths_cannot_escape_and_corrupt_index_is_preserved(library):
    seed(library)
    with pytest.raises(KeyError):
        library.resolve_file("../secret")
    index = library.directory / "index.json"
    index.write_text("broken", encoding="utf-8")
    with pytest.raises(RuntimeError, match="preserved"):
        library.rename("a" * 32, "New")
    assert index.read_text() == "broken"


def test_concurrent_saved_ranges_are_not_lost(library):
    track = seed(library)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda index: library.save_range(track["id"], f"Part {index}", 1, 3), range(8)))
    assert len(results) == 8
    assert len(MusicLibrary(library.directory).get_track(track["id"])["saved_ranges"]) == 8


def test_api_validation_and_serving(library):
    track = seed(library)
    client = TestClient(main.app)
    assert client.get("/api/music?q=song").json()["tracks"][0]["id"] == track["id"]
    assert client.patch(f"/api/music/{track['id']}", json={"name": "Renamed"}).json()["name"] == "Renamed"
    assert client.post(f"/api/music/{track['id']}/ranges", json={"name": "Verse", "start": 1, "end": 4}).status_code == 200
    assert client.post(f"/api/music/{track['id']}/ranges", json={"name": "Bad", "start": 1, "end": 11}).status_code == 400
    assert client.get(track["file_url"]).content == b"music"
    assert client.get("/api/music/tasks/missing").status_code == 404
    assert client.post("/api/music/import", json={"url": "file:///secret"}).status_code == 400
    request = {"source_video": "unused.mp4", "music": {"track_id": track["id"], "start": 0, "end": 11}}
    assert client.post("/api/export", json=request).status_code == 400
    request["music"]["volume"] = 9
    assert client.post("/api/export", json=request).status_code == 422


def test_import_converts_audio_and_commits_after_probe(library, tmp_path, monkeypatch):
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg and FFprobe are required")
    source = tmp_path / "tone.wav"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                    "-i", "sine=frequency=440:duration=1", str(source)], check=True, capture_output=True, timeout=30)
    monkeypatch.setattr(library, "_download", lambda *args: (source, {"title": "Provider song"}))
    library.tasks["test"] = {"status": "queued"}
    library._import("test", "https://example.test/music", "Saved song")
    task = library.task("test")
    assert task["status"] == "completed", task
    saved = task["track"]
    assert saved["name"] == "Saved song"
    assert 0.9 <= saved["duration"] <= 1.1
    assert library.resolve_file(saved["id"]).suffix == ".mp3"
    assert saved["format"] == "mp3"


def test_failed_import_does_not_create_track(library, monkeypatch):
    def fail(*args):
        raise RuntimeError("Provider requires sign in")
    monkeypatch.setattr(library, "_download", fail)
    library.tasks["test"] = {"status": "queued"}
    library._import("test", "https://example.test/music", "Name")
    assert library.task("test")["status"] == "error"
    assert "sign in" in library.task("test")["error"]
    assert library.list_tracks() == []


def test_youtube_audio_retries_blocked_connection_without_video_fallback(library, tmp_path, monkeypatch):
    import yt_dlp
    attempts = []
    monkeypatch.setattr(music_module, "ensure_po_token_provider", lambda: True)
    monkeypatch.setattr(music_module, "find_cookies_file", lambda: None)
    library.tasks["test"] = {"status": "downloading"}

    class FakeDownloader:
        def __init__(self, options):
            self.options = options
            attempts.append(options)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def extract_info(self, url, download):
            assert download is True
            if len(attempts) == 1:
                Path(self.options["outtmpl"].replace("%(ext)s", "webm.part")).write_bytes(b"partial")
                raise yt_dlp.utils.DownloadError("HTTP Error 403: Forbidden")
            self.path = Path(self.options["outtmpl"].replace("%(ext)s", "webm"))
            self.path.write_bytes(b"audio only")
            return {"title": "Music", "vcodec": "none", "acodec": "opus"}

        def prepare_filename(self, info):
            return str(self.path)

    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeDownloader)
    source, info = library._download("https://youtu.be/FKIT6G_lw7c", tmp_path, "test")
    assert source.read_bytes() == b"audio only"
    assert info["vcodec"] == "none"
    assert len(attempts) == 2
    assert all(options["format"] == "bestaudio" for options in attempts)
    assert attempts[0]["extractor_args"]["youtube"]["player_client"] == ["mweb"]
    assert attempts[1]["extractor_args"]["youtube"]["player_client"] == ["default"]
    assert attempts[0]["outtmpl"] != attempts[1]["outtmpl"]
    assert attempts[1]["js_runtimes"] == {"node": {}}


def test_mp3_track_is_served_with_audio_mpeg_type(library):
    track = seed(library)
    track["format"] = "mp3"
    (library.directory / "index.json").write_text(json.dumps([track]), encoding="utf-8")
    (library.directory / f"{track['id']}.mp3").write_bytes(b"mp3 audio")
    response = TestClient(main.app).get(track["file_url"])
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"mp3 audio"
