"""Persistent, named audio assets and reusable selections for the Studio."""
from __future__ import annotations

import copy
import json
import logging
import math
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path, PureWindowsPath
from urllib.parse import urlparse

from app.projects.project_manager import atomic_write_json
from app.video.downloader import (find_cookies_file, ensure_po_token_provider,
                                  youtube_extractor_args, format_yt_error,
                                  PLAYER_CLIENT_STRATEGIES)
from app.video.probe import probe_video

logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
AUDIO_UPLOAD_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".wma", ".aiff", ".aif"}
MAX_AUDIO_UPLOAD_BYTES = 256 * 1024 * 1024


class MusicLibrary:
    def __init__(self, directory: Path = ROOT / "music_library"):
        self.directory = Path(directory)
        self.lock = threading.RLock()
        self.tasks: dict[str, dict] = {}

    def _load(self) -> list[dict]:
        index = self.directory / "index.json"
        if not index.exists():
            return []
        try:
            tracks = json.loads(index.read_text(encoding="utf-8"))
            if not isinstance(tracks, list) or not all(isinstance(t, dict) for t in tracks):
                raise ValueError("invalid track index")
            return tracks
        except (ValueError, OSError) as exc:
            raise RuntimeError(f"Cannot read music library. Existing files are preserved: {exc}") from exc

    def list_tracks(self, query: str = "") -> list[dict]:
        with self.lock:
            tracks = self._load()
        needle = query.strip().casefold()
        return copy.deepcopy([t for t in reversed(tracks)
                              if needle in f"{t.get('name', '')} {t.get('title', '')}".casefold()])

    @staticmethod
    def _id(track_id: str) -> str:
        if not re.fullmatch(r"[0-9a-f]{32}", track_id):
            raise KeyError("Music track not found.")
        return track_id

    def get_track(self, track_id: str) -> dict:
        self._id(track_id)
        with self.lock:
            track = next((t for t in self._load() if t.get("id") == track_id), None)
        if track is None:
            raise KeyError("Music track not found.")
        return copy.deepcopy(track)

    def resolve_file(self, track_id: str) -> Path:
        track = self.get_track(track_id)
        root = self.directory.resolve()
        audio_format = track.get("format", "m4a")
        if audio_format not in {"mp3", "m4a"}:
            raise RuntimeError("Saved audio has an unsupported format. Import the music again.")
        path = (root / f"{track_id}.{audio_format}").resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise FileNotFoundError("Saved audio is missing. Import the music again.")
        return path

    @staticmethod
    def _name(name: str) -> str:
        result = name.strip()
        if not result or len(result) > 200:
            raise ValueError("Enter a name between 1 and 200 characters.")
        return result

    def rename(self, track_id: str, name: str) -> dict:
        name = self._name(name)
        with self.lock:
            self.get_track(track_id)
            tracks = self._load()
            track = next(t for t in tracks if t["id"] == track_id)
            track["name"] = name
            atomic_write_json(self.directory / "index.json", tracks)
            return copy.deepcopy(track)

    def validate_range(self, track_id: str, start: float, end: float) -> dict:
        track = self.get_track(track_id)
        if not all(math.isfinite(v) for v in (start, end)) or not 0 <= start < end <= track["duration"]:
            raise ValueError("Choose a music range inside the track, with end after start.")
        return track

    def delete(self, track_id: str) -> None:
        """Delete one saved track and its metadata, preserving unrelated tracks."""
        with self.lock:
            track = self.get_track(track_id)
            audio_format = track.get("format", "m4a")
            if audio_format not in {"mp3", "m4a"}:
                raise ValueError("Saved audio has an unsupported format.")
            root = self.directory.resolve()
            path = root / f"{track_id}.{audio_format}"
            if not path.resolve().is_relative_to(root):
                raise ValueError("Saved audio is outside the music library.")
            tracks = self._load()
            atomic_write_json(self.directory / "index.json", [item for item in tracks if item.get("id") != track_id])
            try:
                path.unlink(missing_ok=True)
            except OSError:
                atomic_write_json(self.directory / "index.json", tracks)
                raise

    def save_range(self, track_id: str, name: str, start: float, end: float) -> dict:
        name = self._name(name)
        with self.lock:
            self.validate_range(track_id, start, end)
            tracks = self._load()
            track = next(t for t in tracks if t["id"] == track_id)
            track.setdefault("saved_ranges", []).append({
                "id": uuid.uuid4().hex, "name": name, "start": start, "end": end,
            })
            atomic_write_json(self.directory / "index.json", tracks)
            return copy.deepcopy(track)

    def save_highlights(self, track_id: str, result: dict) -> dict:
        """Update only AI metadata, retaining any edits made during analysis."""
        from app.ai.music_highlights import MusicHighlightsResult
        validated = MusicHighlightsResult.model_validate(result).model_dump()
        with self.lock:
            for item in validated["highlights"]:
                self.validate_range(track_id, item["start"], item["end"])
            tracks = self._load()
            track = next(t for t in tracks if t["id"] == track_id)
            track["ai_highlights"] = validated
            atomic_write_json(self.directory / "index.json", tracks)
            return copy.deepcopy(track)

    def start_import(self, url: str, name: str = "") -> str:
        url = url.strip()
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Paste a public HTTP or HTTPS audio, music, or video link.")
        if name.strip():
            self._name(name)
        task_id = self._new_task()
        threading.Thread(target=self._import, args=(task_id, url, name), daemon=True).start()
        return task_id

    def start_local_import(self, source: Path, original_filename: str, name: str = "") -> str:
        """Take ownership of an API-created temporary upload, never the user's original."""
        source = Path(source).resolve()
        upload_root = (ROOT / "temp" / "music_uploads").resolve()
        if not source.is_relative_to(upload_root) or not source.is_file():
            raise ValueError("The uploaded audio file is missing or outside the upload folder.")
        filename = PureWindowsPath(original_filename).name
        if Path(filename).suffix.lower() not in AUDIO_UPLOAD_EXTENSIONS:
            raise ValueError("Choose a supported audio file: MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, WMA or AIFF.")
        if name.strip():
            self._name(name)
        task_id = self._new_task()
        threading.Thread(target=self._import_local, args=(task_id, source, filename, name), daemon=True).start()
        return task_id

    def _new_task(self) -> str:
        task_id = uuid.uuid4().hex
        with self.lock:
            # Retain recent results without growing the in-memory task list forever.
            finished = [key for key, value in self.tasks.items() if value["status"] in {"completed", "error"}]
            for key in finished[:max(0, len(self.tasks) - 59)]:
                del self.tasks[key]
            self.tasks[task_id] = {"id": task_id, "status": "queued", "progress": 0,
                                   "message": "Queued for audio import"}
        return task_id

    def task(self, task_id: str) -> dict:
        with self.lock:
            if task_id not in self.tasks:
                raise KeyError("Music import task not found.")
            return copy.deepcopy(self.tasks[task_id])

    def _update(self, task_id: str, **values):
        with self.lock:
            self.tasks[task_id].update(values)

    def _download(self, url: str, scratch: Path, task_id: str) -> tuple[Path, dict]:
        try:
            import yt_dlp
        except ImportError as exc:
            raise RuntimeError("Music import needs yt-dlp. Install the project's dependencies.") from exc

        def progress(data):
            if data.get("status") == "downloading":
                total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
                percent = min(80, 5 + 75 * data.get("downloaded_bytes", 0) / total) if total else 5
                self._update(task_id, progress=round(percent, 1), message="Downloading audio")

        options = {"format": "bestaudio", "noplaylist": True, "quiet": True,
                   "no_warnings": True, "outtmpl": str(scratch / "source.%(ext)s"),
                   "progress_hooks": [progress], "socket_timeout": 30,
                   "retries": 2, "fragment_retries": 2}
        cookies = find_cookies_file()
        if cookies:
            options["cookiefile"] = cookies
        is_youtube = (urlparse(url).hostname or "").lower() in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
        provider_ready = ensure_po_token_provider() if is_youtube else False
        strategies = PLAYER_CLIENT_STRATEGIES if is_youtube else [None]
        if provider_ready:
            strategies = [["mweb"], *[clients for clients in strategies if clients != ["mweb"]]]
        if is_youtube:
            options.update({"js_runtimes": {"node": {}}, "remote_components": ["ejs:github"],
                            "extractor_args": youtube_extractor_args(strategies[0], provider_ready)})
        last_error = None
        for attempt, clients in enumerate(strategies):
            attempt_dir = scratch / f"attempt_{attempt}"
            attempt_dir.mkdir()
            attempt_options = {**options, "outtmpl": str(attempt_dir / "source.%(ext)s")}
            if clients is not None:
                attempt_options["extractor_args"] = youtube_extractor_args(clients, provider_ready)
            try:
                with yt_dlp.YoutubeDL(attempt_options) as ydl:
                    info = ydl.extract_info(url, download=True)
                    if not info or info.get("_type") == "playlist":
                        raise ValueError("Use a single music or audio link, rather than a playlist.")
                    candidate = Path(ydl.prepare_filename(info)).resolve()
                if not candidate.is_relative_to(attempt_dir.resolve()) or not candidate.is_file():
                    raise RuntimeError("The provider did not create an audio file. Try a direct audio link.")
                return candidate, info
            except yt_dlp.utils.DownloadError as exc:
                if not is_youtube:
                    raise
                last_error = exc
                logger.warning("YouTube audio connection %s failed: %s", clients, format_yt_error(exc))
                self._update(task_id, progress=5, message=f"Trying another YouTube audio connection ({attempt + 1}/{len(strategies)})")
        raise RuntimeError(
            "YouTube did not provide a downloadable audio-only stream after retrying its playback connections. "
            "Try another audio link or retry later. " + format_yt_error(last_error)
        ) from last_error

    def _save_audio(self, task_id: str, source: Path, scratch: Path, title: str,
                    name: str, source_url: str = "") -> dict:
        """Validate, convert and atomically register either a downloaded or uploaded song."""
        track_id = uuid.uuid4().hex
        destination = self.directory / f"{track_id}.mp3"
        committed = False
        try:
            probed = probe_video(str(source))
            if not probed.has_audio:
                raise ValueError("This file has no audio track. Choose a playable audio file.")
            if not math.isfinite(probed.duration) or probed.duration <= 0:
                raise ValueError("This audio has no playable duration. Choose another audio file.")
            self._update(task_id, status="processing", progress=85, message="Preparing music for playback")
            converted = scratch / "music.mp3"
            audio_index = probed.audio_stream.get("index")
            if audio_index is None:
                raise RuntimeError("Cannot identify the source audio stream.")
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                            "-map", f"0:{audio_index}", "-vn", "-c:a", "libmp3lame", "-b:a", "192k", str(converted)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", check=True, timeout=600)
            result = probe_video(str(converted))
            if not result.has_audio or not math.isfinite(result.duration) or result.duration <= 0:
                raise RuntimeError("The imported audio has no playable duration.")
            title = str(title).strip()[:200] or "Imported audio"
            track = {"id": track_id, "name": name.strip() or title, "title": title,
                     "source_url": source_url, "duration": result.duration, "format": "mp3",
                     "file_url": f"/api/music/{track_id}/file", "saved_ranges": [],
                     "created_at": datetime.now(timezone.utc).isoformat()}
            with self.lock:
                tracks = self._load()
                self.directory.mkdir(parents=True, exist_ok=True)
                shutil.move(str(converted), str(destination))
                atomic_write_json(self.directory / "index.json", [*tracks, track])
                committed = True
            return track
        finally:
            if not committed:
                destination.unlink(missing_ok=True)

    def _import_error(self, task_id: str, exc: Exception):
        logger.exception("Music import failed for task %s", task_id)
        if isinstance(exc, subprocess.CalledProcessError):
            error = f"Audio conversion failed: {(exc.stderr or str(exc)).strip()}"
        elif isinstance(exc, subprocess.TimeoutExpired):
            error = "Audio conversion took too long. Try a shorter audio file or link."
        elif isinstance(exc, FileNotFoundError) and exc.filename in {"ffmpeg", "ffprobe"}:
            error = f"Music import needs {exc.filename} installed and available on PATH."
        else:
            error = format_yt_error(exc)
        self._update(task_id, status="error", message=error, error=error)

    def _import(self, task_id: str, url: str, name: str):
        try:
            self._update(task_id, status="downloading", message="Fetching audio")
            scratch_root = ROOT / "temp"
            scratch_root.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix="music_", dir=scratch_root) as temp_name:
                scratch = Path(temp_name)
                source, info = self._download(url, scratch, task_id)
                track = self._save_audio(task_id, source, scratch, info.get("title") or "Imported audio", name, url)
                self._update(task_id, status="completed", progress=100, message="Music saved to your library", track=track)
        except Exception as exc:
            self._import_error(task_id, exc)

    def _import_local(self, task_id: str, source: Path, filename: str, name: str):
        try:
            self._update(task_id, status="processing", progress=5, message="Reading local audio")
            with tempfile.TemporaryDirectory(prefix="music_", dir=ROOT / "temp") as temp_name:
                track = self._save_audio(task_id, source, Path(temp_name), Path(filename).stem, name)
                self._update(task_id, status="completed", progress=100, message="Music saved to your library", track=track)
        except Exception as exc:
            self._import_error(task_id, exc)
        finally:
            source.unlink(missing_ok=True)


music_library = MusicLibrary()
