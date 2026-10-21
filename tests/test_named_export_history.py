"""Named exports reserve one output and store only small existing history metadata."""
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import app.main as main
from app.projects.project_manager import ProjectManager


def test_custom_name_preserves_spaces_unicode_and_mp4_extension(tmp_path):
    output = main._reserve_export_path(tmp_path, "My Reel गीत.mp4", preserve_name=True)
    assert output.name == "My Reel गीत.mp4"
    assert list(tmp_path.iterdir()) == [output]


def test_repeated_name_never_overwrites_existing_export(tmp_path):
    first = main._reserve_export_path(tmp_path, "My Reel", preserve_name=True)
    first.write_bytes(b"keep this export")
    second = main._reserve_export_path(tmp_path, "My Reel.mp4", preserve_name=True)
    assert second != first
    assert second.name.startswith("My Reel_")
    assert first.read_bytes() == b"keep this export"
    assert len(list(tmp_path.iterdir())) == 2


@pytest.mark.parametrize("requested", [
    "../outside.mp4", r"C:\outside\named.mp4", "CON.mp4", "lpt1.mp4", "NUL.clip",
    "bad:name?.mp4", "bad\x00name.mp4", "trailing...", "..", " ", "x" * 200,
])
def test_custom_names_are_safe_windows_basenames(tmp_path, requested):
    output = main._reserve_export_path(tmp_path, requested, preserve_name=True)
    assert output.parent == tmp_path
    assert len(output.stem) <= 120
    assert not any(c in output.name for c in '<>:"/\\|?*')
    assert not any(ord(c) < 32 for c in output.name)
    assert not output.stem.endswith((" ", "."))
    assert output.stem.split(".")[0].upper() not in {"CON", "NUL", "LPT1"}


def test_named_export_passes_filename_and_persists_history(tmp_path, monkeypatch):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"source")
    outputs = tmp_path / "exports"
    projects = tmp_path / "projects"
    manager = ProjectManager(projects)
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(default_export_dir=str(outputs)))
    monkeypatch.setattr(main, "project_manager", manager)
    monkeypatch.setattr(main, "EXPORT_TASKS", {"named": {}, "collision": {}})
    def render(**kwargs):
        Path(kwargs["output_mp4"]).write_bytes(b"rendered")
        return kwargs["output_mp4"]
    monkeypatch.setattr(main.renderer, "render_reel", render)
    monkeypatch.setattr(main, "probe_video", lambda _: SimpleNamespace(width=1080, height=1080, fps=30))
    request = main.ExportRequest(source_video=str(source), output_name="My Reel गीत.mp4",
                                 template={"name": "test"}, aspect_ratio="1:1",
                                 series_text="Actual hook 🔥\nKeep this second line!", caption="Different Instagram caption")
    for task_id in ("named", "collision"):
        main._execute_export(task_id, request)
        assert main.EXPORT_TASKS[task_id]["status"] == "completed"
    assert Path(main.EXPORT_TASKS["named"]["output_file"]).name == "My Reel गीत.mp4"
    assert len(list(outputs.iterdir())) == 2
    history = ProjectManager(projects).get_history()
    assert len(history) == 2
    assert all((entry["name"], entry["format"], entry["aspect_ratio"]) ==
               ("My Reel गीत", "mp4", "1:1") for entry in history)
    assert all(entry["resolution"] == "1080x1080" and entry["fps"] == 30 for entry in history)
    assert all(entry["created_at"].endswith("+00:00") for entry in history)
    assert history[0]["file_name"].startswith("My Reel गीत_")
    assert all(entry["hook_text"] == "Actual hook 🔥\nKeep this second line!" for entry in history)
    assert {p.name for p in projects.iterdir()} <= {"history.json", "history.json.bak"}


def test_history_keeps_old_records_and_caps_at_100_metadata_entries(tmp_path):
    legacy = {"id": "old", "song": "Previous", "export_location": "exports/old.mp4"}
    (tmp_path / "history.json").write_text(json.dumps([legacy]), encoding="utf-8")
    manager = ProjectManager(tmp_path)
    manager.add_history_entry(1, "Song", "Anime", 3, "Cinematic", "exports/next.mp4")
    assert manager.get_history()[1] == legacy
    for index in range(105):
        manager.add_history_entry(1, "Song", "Anime", 3, "Cinematic", f"exports/{index}.mp4",
                                  name=f"Reel {index}", format="mp4", aspect_ratio="9:16")
    history = ProjectManager(tmp_path).get_history()
    assert len(history) == 100
    assert history[0]["name"] == "Reel 104"
    assert history[-1]["name"] == "Reel 5"
    assert len(list(tmp_path.iterdir())) == 2


def test_history_api_enriches_actual_files_without_probing_or_rewriting(tmp_path, monkeypatch):
    exports = tmp_path / "exports"
    exports.mkdir()
    custom = exports / "My Actual Reel_a1b2.mp4"
    old = exports / "song_DAY_01_cinematic_9x16_abcdef.mp4"
    custom.write_bytes(b"custom video")
    old.write_bytes(b"legacy video")
    raw_history = [
        {"id": "custom", "name": "My Actual Reel", "export_location": str(custom),
         "duration": "12.5s", "created_at": "2026-10-16T12:00:00+00:00", "aspect_ratio": "9:16"},
        {"id": "legacy", "song": "Song", "export_location": str(old),
         "duration": "3s", "created_date": "2026-10-16 16:00"},
        {"id": "missing", "song": "Song", "export_location": str(exports / "Removed Reel.mp4")},
    ]
    manager = ProjectManager(tmp_path / "projects")
    manager._save_history(raw_history)
    before = manager.history_file.read_bytes()
    monkeypatch.setattr(main, "project_manager", manager)
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(default_export_dir=str(exports)))
    monkeypatch.setattr(main, "probe_video", lambda _: pytest.fail("History must not probe each video"))
    history = main.api_get_history()
    assert len(history) == 3
    assert history[0]["display_name"] == "My Actual Reel"
    assert history[0]["file_name"] == custom.name
    assert history[0]["available"] is True
    assert history[0]["size_bytes"] == len(b"custom video")
    assert history[0]["duration_seconds"] == 12.5
    assert history[0]["aspect_ratio"] == "9:16"
    assert history[1]["display_name"] == old.stem
    assert history[1]["display_name"] != "Song"
    assert history[1]["created_at"] == "2026-10-16 16:00"
    assert history[1]["format"] == "mp4"
    assert history[2]["display_name"] == "Removed Reel"
    assert history[2]["available"] is False and history[2]["size_bytes"] is None
    assert manager.history_file.read_bytes() == before
    assert manager.get_history() == raw_history


def test_history_availability_only_allows_export_files_and_preserves_missing_entries(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "APP_ROOT", tmp_path)
    exports = tmp_path / "exports"
    exports.mkdir()
    private = tmp_path / "exports_private"
    private.mkdir()
    outside = private / "private.mp4"
    outside.write_bytes(b"private")
    (exports / "not-video.json").write_text("{}")
    (exports / "folder.mp4").mkdir()
    relative = exports / "relative.mp4"
    relative.write_bytes(b"relative video")
    rows = [
        {"export_location": str(outside)},
        {"export_location": str(exports / "not-video.json")},
        {"export_location": str(exports / "folder.mp4")},
        {"export_location": "exports/relative.mp4"},
        {"export_location": str(exports / "deleted.mp4"), "duration": "nan"},
    ]
    enriched = [main._history_details(row, [exports.resolve()]) for row in rows]
    assert [row["available"] for row in enriched] == [False, False, False, True, False]
    assert enriched[-1]["duration_seconds"] is None
    assert all(enriched[index]["size_bytes"] is None for index in (0, 1, 2, 4))


def test_history_symlink_cannot_reveal_file_size_outside_exports(tmp_path):
    exports = tmp_path / "exports"
    exports.mkdir()
    private = tmp_path / "private.mp4"
    private.write_bytes(b"private video")
    link = exports / "linked.mp4"
    try:
        link.symlink_to(private)
    except OSError as exc:
        pytest.skip(f"Symlinks unavailable: {exc}")
    row = main._history_details({"export_location": str(link)}, [exports.resolve()])
    assert row["available"] is False
    assert row["size_bytes"] is None


@pytest.fixture
def deletable_history(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "APP_ROOT", tmp_path)
    exports = tmp_path / "exports"
    exports.mkdir()
    video = exports / "Named Reel.mp4"
    video.write_bytes(b"exported video bytes")
    manager = ProjectManager(tmp_path / "projects")
    entry = manager.add_history_entry(1, "Song", "Anime", 3, "Cinematic", str(video),
                                      name="Named Reel", hook_text="Full hook 🔥\nA second line.")
    monkeypatch.setattr(main, "project_manager", manager)
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(default_export_dir=str(exports)))
    monkeypatch.setattr(main, "EXPORT_TASKS", {})
    return exports, video, manager, entry


def test_delete_export_frees_file_but_preserves_history_hook_and_is_idempotent(deletable_history):
    exports, video, manager, entry = deletable_history
    before = manager.history_file.read_bytes()
    size = video.stat().st_size
    response = main.api_delete_history_file(entry["id"])
    assert response == {"deleted": True, "freed_bytes": size}
    assert not video.exists()
    assert main.api_delete_history_file(entry["id"]) == {"deleted": False, "freed_bytes": 0}
    assert manager.history_file.read_bytes() == before
    restored = ProjectManager(manager.base_dir).get_history()
    assert restored[0]["hook_text"] == "Full hook 🔥\nA second line."
    assert restored[0] == entry
    assert main.api_get_history()[0]["available"] is False
    assert list(exports.iterdir()) == []


def test_delete_history_unknown_id_never_accepts_an_arbitrary_path(deletable_history):
    _, video, _, _ = deletable_history
    with pytest.raises(HTTPException) as error:
        main.api_delete_history_file(str(video))
    assert error.value.status_code == 404
    assert video.exists()


def test_delete_history_rejects_ambiguous_legacy_ids_without_deleting_either_file(deletable_history):
    exports, video, manager, entry = deletable_history
    second = exports / "Another Reel.mp4"
    second.write_bytes(b"another export")
    duplicate = {**entry, "export_location": str(second)}
    manager._save_history([entry, duplicate])
    before = manager.history_file.read_bytes()
    with pytest.raises(HTTPException) as error:
        main.api_delete_history_file(entry["id"])
    assert error.value.status_code == 409
    assert "multiple" in error.value.detail
    assert video.exists() and second.exists()
    assert manager.history_file.read_bytes() == before


def test_new_history_ids_are_unique_even_in_same_millisecond(tmp_path, monkeypatch):
    manager = ProjectManager(tmp_path)
    monkeypatch.setattr("app.projects.project_manager.time.time", lambda: 1000)
    first = manager.add_history_entry(1, "Song", "Anime", 3, "Cinematic", "exports/one.mp4")
    second = manager.add_history_entry(1, "Song", "Anime", 3, "Cinematic", "exports/two.mp4")
    assert first["id"] != second["id"]


@pytest.mark.parametrize("kind", ["outside", "sibling", "nonvideo", "directory", "no-path"])
def test_delete_history_rejects_unsafe_targets_without_modifying_history(deletable_history, tmp_path, kind):
    exports, video, manager, entry = deletable_history
    if kind == "no-path":
        entry.pop("export_location")
        target = None
    else:
        targets = {"outside": tmp_path / "private.mp4", "sibling": tmp_path / "exports_private" / "private.mp4",
                   "nonvideo": exports / "private.json", "directory": exports / "folder.mp4"}
        target = targets[kind]
        target.parent.mkdir(exist_ok=True)
        if kind == "directory":
            target.mkdir()
        else:
            target.write_bytes(b"preserve me")
        entry["export_location"] = str(target)
    manager._save_history([entry])
    before = manager.history_file.read_bytes()
    with pytest.raises(HTTPException) as error:
        main.api_delete_history_file(entry["id"])
    assert error.value.status_code in (400, 403)
    assert video.exists()
    if target is not None:
        assert target.exists()
    assert manager.history_file.read_bytes() == before


def test_delete_history_rejects_symlink_outside_exports(deletable_history, tmp_path):
    exports, _, manager, entry = deletable_history
    private = tmp_path / "private.mp4"
    private.write_bytes(b"must remain")
    link = exports / "linked.mp4"
    try:
        link.symlink_to(private)
    except OSError as exc:
        pytest.skip(f"Symlinks unavailable: {exc}")
    entry["export_location"] = str(link)
    manager._save_history([entry])
    with pytest.raises(HTTPException) as error:
        main.api_delete_history_file(entry["id"])
    assert error.value.status_code == 403
    assert private.read_bytes() == b"must remain"
    assert link.is_symlink()


def test_delete_history_rejects_video_currently_exporting(deletable_history, monkeypatch):
    _, video, _, entry = deletable_history
    monkeypatch.setattr(main, "EXPORT_TASKS", {"active": {"status": "rendering", "output_file": str(video)}})
    with pytest.raises(HTTPException) as error:
        main.api_delete_history_file(entry["id"])
    assert error.value.status_code == 409
    assert video.exists()


@pytest.mark.parametrize(("failure", "status_code"), [(PermissionError("File busy"), 409), (OSError("Disk error"), 500)])
def test_delete_history_surfaces_io_failures_and_keeps_record(deletable_history, monkeypatch, failure, status_code):
    _, video, manager, entry = deletable_history
    before = manager.history_file.read_bytes()
    original_unlink = Path.unlink
    def fail_video_unlink(path, *args, **kwargs):
        if path == video:
            raise failure
        return original_unlink(path, *args, **kwargs)
    monkeypatch.setattr(Path, "unlink", fail_video_unlink)
    with pytest.raises(HTTPException) as error:
        main.api_delete_history_file(entry["id"])
    assert error.value.status_code == status_code
    assert "delete" in error.value.detail.lower()
    assert video.exists()
    assert manager.history_file.read_bytes() == before
