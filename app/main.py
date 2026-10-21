import os
import sys
import uuid
import asyncio
import threading
import time
import math
import stat
import logging
from contextlib import asynccontextmanager
from pathlib import Path, PureWindowsPath
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field, model_validator

import shutil
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from app.config.console import configure_console_utf8

configure_console_utf8()

from app.config.settings import get_settings, update_settings
from app.video.probe import probe_video
from app.video.renderer import renderer, watermark_font_path
from app.video.audio_enhance import render_audio_preview
from app.video.music_library import music_library, AUDIO_UPLOAD_EXTENSIONS, MAX_AUDIO_UPLOAD_BYTES
from app.video.preview import render_preview_still, extract_preview_frame
from app.video.downloader import InstagramDownloader, YouTubeDownloader, DOWNLOAD_TASKS, ensure_browser_compatible, validate_instagram_video_url, extract_twitter_videos
from app.video.image_downloader import download_post_images, validate_image_url, MAX_IMAGE_BYTES, FORMAT_EXTENSIONS
from app.video.media_detection import detect_url_media
from app.video.image_import import import_studio_image
from app.templates.template_manager import template_manager
from app.projects.project_manager import project_manager, atomic_write_json
from app.ai.gemini_client import gemini_client
from app.ai.gemini_transport import GeminiError
from app.scheduler import instagram_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler on boot and stop on shutdown cleanly."""
    instagram_scheduler.start_scheduler()
    yield
    instagram_scheduler.stop_scheduler()

app = FastAPI(title="Vibe Editor API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_header(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.endswith((".js", ".css", ".html")) or path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Active export tasks state
EXPORT_TASKS: Dict[str, Dict[str, Any]] = {}
APP_ROOT = Path(__file__).resolve().parent.parent
MEDIA_REGISTRY_FILE = APP_ROOT / "projects" / ".selected_media.json"
MEDIA_REGISTRY_LOCK = threading.Lock()
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm", ".m4v", ".avi"}


def _registered_media_paths() -> set[str]:
    import json
    if not MEDIA_REGISTRY_FILE.exists():
        return set()
    try:
        data = json.loads(MEDIA_REGISTRY_FILE.read_text(encoding="utf-8"))
        return set(data) if isinstance(data, list) and all(isinstance(p, str) for p in data) else set()
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read selected media registry: {exc}") from exc


def _register_selected_media(raw_path: str) -> Path:
    """Register an exact file approved by the native picker, never its parent folder."""
    path = Path(raw_path).resolve()
    if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise ValueError("Select a supported video file.")
    with MEDIA_REGISTRY_LOCK:
        registered = _registered_media_paths()
        registered.add(str(path))
        atomic_write_json(MEDIA_REGISTRY_FILE, sorted(registered))
    return path


def _export_name_stem(requested_name: str) -> str:
    """Keep readable custom names while constraining them to a Windows basename."""
    basename = PureWindowsPath(requested_name.strip()).name
    if basename.lower().endswith(".mp4"):
        basename = basename[:-4]
    stem = "".join("_" if ord(c) < 32 or c in '<>:"/\\|?*' else c for c in basename)
    stem = stem[:120].strip(" .") or "reel"
    device = stem.split(".", 1)[0].upper()
    reserved = {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$", "CLOCK$"}
    reserved.update(f"{prefix}{number}" for prefix in ("COM", "LPT") for number in "123456789¹²³")
    if device in reserved:
        stem = f"reel_{stem}"[:120].rstrip(" .")
    return stem


def _reserve_export_path(out_dir: Path, requested_name: str, *, preserve_name: bool = False) -> Path:
    """Allocate a distinct output even when an explicit filename is reused."""
    if preserve_name:
        stem = _export_name_stem(requested_name)
    else:
        basename = PureWindowsPath(requested_name).name
        stem = "".join(c if c.isalnum() or c in "_-" else "_" for c in Path(basename).stem)
        stem = stem[:120].strip("_") or "reel"
    for attempt in range(10):
        filename = f"{stem}.mp4" if preserve_name and attempt == 0 else f"{stem}_{uuid.uuid4().hex[:12]}.mp4"
        path = out_dir / filename
        try:
            with path.open("xb"):
                pass
            return path
        except FileExistsError:
            continue
    raise RuntimeError("Could not allocate a unique export filename; please retry.")

def _prune_task_dict(tasks: Dict[str, Dict[str, Any]], max_entries: int = 60) -> None:
    """Evicts completed/failed tasks when task dictionary exceeds max_entries to prevent memory leaks."""
    if len(tasks) > max_entries:
        finished = [k for k, v in tasks.items() if v.get("status") in ("completed", "error")]
        for k in finished[:len(tasks) - max_entries]:
            del tasks[k]

class ProbeRequest(BaseModel):
    file_path: str

class AnalyzeRequest(BaseModel):
    song_name: Optional[str] = ""
    anime_name: Optional[str] = ""
    duration: Optional[float] = 0.0
    video_title: Optional[str] = ""
    api_key: Optional[str] = None
    video_path: Optional[str] = ""

class RenderStillRequest(BaseModel):
    source_video: str
    timestamp: float
    series_text: str
    song_name: str
    anime_name: str
    caption: str
    template: Dict[str, Any]
    aspect_ratio: Optional[str] = "16:9"

class LyricsRequest(BaseModel):
    song_name: str
    anime_name: str
    start_time: float
    end_time: float
    video_title: Optional[str] = ""
    api_key: Optional[str] = None
    video_path: Optional[str] = ""

class FullSubtitlesRequest(BaseModel):
    video_path: str
    song_name: Optional[str] = ""
    anime_name: Optional[str] = ""
    video_title: Optional[str] = ""
    duration: Optional[float] = 0.0
    api_key: Optional[str] = None

class ViralHooksRequest(BaseModel):
    video_path: str = Field(min_length=1)
    start_time: float = Field(ge=0, allow_inf_nan=False)
    end_time: float = Field(gt=0, allow_inf_nan=False)
    song_name: Optional[str] = ""
    anime_name: Optional[str] = ""
    video_title: Optional[str] = ""
    mood: Optional[str] = "hype"
    moment_type: Optional[str] = ""
    moment_reason: Optional[str] = ""
    creator_instruction: Optional[str] = Field(default="", max_length=24000)
    api_key: Optional[str] = None


class InstagramCaptionRequest(BaseModel):
    song_name: Optional[str] = ""
    anime_name: Optional[str] = ""
    video_title: Optional[str] = ""
    hook: Optional[str] = ""
    moment_type: Optional[str] = ""
    creator_instruction: Optional[str] = Field(default="", max_length=24000)
    api_key: Optional[str] = None


class AudioMasterConfig(BaseModel):
    """Optional, mix-safe audio processing for the rendered reel."""
    enabled: bool = False


class AudioPreviewRequest(BaseModel):
    source_video: str
    start_time: float = Field(default=0, ge=0, allow_inf_nan=False)
    end_time: float = Field(gt=0, allow_inf_nan=False)
    audio_master: AudioMasterConfig = Field(default_factory=AudioMasterConfig)

    @model_validator(mode="after")
    def valid_selection(self):
        if not self.end_time > self.start_time:
            raise ValueError("Select an audio preview with a positive duration.")
        return self


class MusicMixConfig(BaseModel):
    track_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    start: float = Field(default=0, ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    volume: float = Field(default=1, ge=0, le=2, allow_inf_nan=False)
    original_volume: float = Field(default=0, ge=0, le=2, allow_inf_nan=False)
    fade_in: float = Field(default=0, ge=0, le=10, allow_inf_nan=False)
    fade_out: float = Field(default=0, ge=0, le=10, allow_inf_nan=False)
    loop: bool = False

    @model_validator(mode="after")
    def valid_range(self):
        if self.end <= self.start:
            raise ValueError("Music end must be after start.")
        return self


class ExportRequest(BaseModel):
    source_video: str
    output_name: Optional[str] = None
    start_time: float = 0.0
    end_time: float = 35.0
    series_text: Optional[str] = ""
    song_name: Optional[str] = ""
    anime_name: Optional[str] = ""
    day_number: Optional[int] = 1
    caption: Optional[str] = ""
    template: Optional[Dict[str, Any]] = None
    aspect_ratio: Optional[str] = "9:16"
    lyrics: Optional[list] = None
    show_lyrics: Optional[bool] = True
    subtitle_style: Optional[str] = "minimal"
    subtitle_animation: Optional[str] = "auto"
    smart_loop: Optional[bool] = True
    loop_mode: Optional[str] = "standard"
    loop_fade_duration: Optional[float] = 0.35
    fade_in: Optional[bool] = False
    fade_out: Optional[bool] = False
    fade_duration: Optional[float] = 0.50
    hook_fade_start: Optional[float] = 0.0
    watermark: Optional[Dict[str, Any]] = None
    creator_badge: Optional[Dict[str, Any]] = None
    subtitle_color: Optional[str] = None
    subtitle_color_en: Optional[str] = None
    subtitle_language: Optional[str] = "both"
    color_filter: Optional[str] = "original"
    filter_intensity: Optional[float] = 100.0
    color_adjustments: Optional[Dict[str, Any]] = None
    subtitle_y: Optional[int] = None
    subtitle_x: Optional[int] = None
    subtitle_font_size: Optional[int] = None
    subtitle_font: Optional[str] = "segoe"
    audio_master: Optional[AudioMasterConfig] = None
    music: Optional[MusicMixConfig] = None
    video_audio_volume: Optional[float] = Field(default=None, ge=0, le=1, allow_inf_nan=False)


RenderReelRequest = ExportRequest


class SaveProjectRequest(BaseModel):
    project_id: str
    state: Dict[str, Any]

class YouTubeDownloadRequest(BaseModel):
    url: str

class YouTubeInfoRequest(BaseModel):
    url: str

class ScheduleAddRequest(BaseModel):
    file_path: str
    scheduled_time: str
    caption: Optional[str] = ""
    hashtags: Optional[str] = ""
    cover_timestamp: Optional[float] = 1.0

class ScheduleUpdateRequest(BaseModel):
    caption: Optional[str] = None
    hashtags: Optional[str] = None
    scheduled_time: Optional[str] = None
    cover_timestamp: Optional[float] = None

# Settings endpoints
@app.get("/api/fonts/{font_key}")
def api_username_font(font_key: str):
    path = watermark_font_path(font_key)
    if path is None:
        raise HTTPException(status_code=404, detail="Choose one of the available username fonts.")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="This username font is not installed. Choose another font.")
    return FileResponse(path, media_type="font/ttf")


@app.get("/api/settings")
def api_get_settings():
    s = get_settings()
    # Mask API key for security
    masked_key = ""
    if s.gemini_api_key:
        masked_key = s.gemini_api_key[:4] + "..." + s.gemini_api_key[-4:] if len(s.gemini_api_key) > 8 else "***"
    return {
        "has_gemini_key": bool(s.gemini_api_key),
        "masked_key": masked_key,
        "default_export_dir": s.default_export_dir,
        "default_resolution": s.default_resolution,
        "default_fps": s.default_fps,
        "default_duration": s.default_duration,
        "default_template": s.default_template,
        "has_instagram_token": bool(s.instagram_access_token),
        "instagram_user_id": s.instagram_user_id,
        "instagram_video_base_url": s.instagram_video_base_url,
    }

@app.post("/api/settings")
def api_update_settings(payload: Dict[str, Any]):
    return update_settings(payload)

# Native desktop file dialog helper
@app.get("/api/system/browse-file")
def api_browse_file():
    """Opens native Windows file picker dialog and returns selected path."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        file_path = filedialog.askopenfilename(
            title="Select Anime Opening / Ending Video (MP4)",
            filetypes=[("MP4 Videos", "*.mp4"), ("All Video Files", "*.mp4;*.mkv;*.mov;*.webm"), ("All Files", "*.*")]
        )
        root.destroy()
        if file_path:
            return {"file_path": str(_register_selected_media(file_path))}
        return {"file_path": ""}
    except Exception as e:
        return {"error": str(e), "file_path": ""}

@app.post("/api/video/upload")
async def api_upload_video(file: UploadFile = File(...)):
    """Uploads a dropped or locally picked video file into downloads/ so backend can process it."""
    try:
        downloads_dir = Path(__file__).resolve().parent.parent / "downloads"
        downloads_dir.mkdir(parents=True, exist_ok=True)
        original_name = PureWindowsPath(file.filename or "upload.mp4").name
        suffix = Path(original_name).suffix.lower()
        if suffix not in VIDEO_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Upload a supported video file.")
        filename = f"upload_{uuid.uuid4().hex}{suffix}"
        out_path = downloads_dir / filename
        with open(out_path, "xb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {"file_path": str(out_path.resolve()), "filename": filename}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/system/open-folder")
def api_open_folder(payload: Dict[str, Any]):
    """Opens Windows Explorer with the specified file or folder selected."""
    import subprocess
    try:
        path_str = payload.get("path", "")
        if not path_str:
            settings = get_settings()
            path_str = settings.default_export_dir
        p = Path(path_str).resolve()
        if p.is_file():
            subprocess.run(["explorer", f"/select,{str(p)}"])
        else:
            p.mkdir(parents=True, exist_ok=True)
            subprocess.run(["explorer", str(p)])
        return {"status": "opened", "path": str(p)}
    except Exception as e:
        return {"error": str(e)}


# Video probe endpoint
@app.post("/api/video/probe")
def api_probe_video(req: ProbeRequest):
    try:
        info = probe_video(req.file_path)
        return info.to_dict()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class CompatibleVideoRequest(BaseModel):
    file_path: str
    force: bool = False

@app.post("/api/video/ensure-compatible")
def api_ensure_compatible(req: CompatibleVideoRequest):
    try:
        source = _validate_safe_media_path(req.file_path)
        compat_path = ensure_browser_compatible(req.file_path, force=req.force)
        if Path(compat_path).resolve() != source:
            _register_selected_media(compat_path)
        return {"file_path": compat_path, "status": "ready"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Original images stay available separately from the Studio's still-video source.
@app.post("/api/images/upload")
async def api_upload_image(file: UploadFile = File(...)):
    """Keep a validated local image unchanged for the existing Studio import flow."""
    import re
    import warnings
    from PIL import Image, UnidentifiedImageError

    destination = None
    target = None
    completed = False
    try:
        image_root = (APP_ROOT / "downloads" / "images").resolve()
        if not image_root.is_relative_to(APP_ROOT.resolve()):
            raise HTTPException(status_code=400, detail="The image upload folder is outside the application folder.")
        image_root.mkdir(parents=True, exist_ok=True)
        destination = image_root / f"upload_{uuid.uuid4().hex}"
        destination.mkdir()
        target = destination / "original.part"
        size = 0
        with target.open("xb") as output:
            while chunk := await file.read(64 * 1024):
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=413, detail="Choose an image smaller than 30 MB.")
                output.write(chunk)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(target) as image:
                    extension = FORMAT_EXTENSIONS.get(image.format)
                    width, height = image.size
                    if not extension:
                        raise HTTPException(status_code=400, detail="Choose a JPEG, PNG, WebP, GIF, AVIF, BMP or TIFF image.")
                    image.verify()
        except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError,
                Image.DecompressionBombWarning) as exc:
            raise HTTPException(status_code=400, detail="This file is not a valid supported image. Choose another image.") from exc
        original_name = PureWindowsPath(file.filename or "image").name
        stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", Path(original_name).stem).strip(" .")[:120] or "image"
        if stem.upper().split(".", 1)[0] in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
            stem = f"image_{stem}"
        saved = destination / f"{stem}.{extension}"
        target.rename(saved)
        target = saved
        completed = True
        return {"file_path": str(saved.resolve()), "filename": saved.name, "width": width, "height": height}
    except HTTPException:
        raise
    except Exception as exc:
        logging.getLogger(__name__).exception("Local image upload failed")
        raise HTTPException(status_code=500, detail="Could not save this image. Check available disk space and try again.") from exc
    finally:
        await file.close()
        if not completed and destination is not None:
            try:
                if target is not None:
                    target.unlink(missing_ok=True)
                destination.rmdir()
            except OSError:
                logging.getLogger(__name__).exception("Could not clean up incomplete image upload %s", destination)


class ImageImportRequest(BaseModel):
    file_path: str
    duration: float = Field(default=10.0, ge=1, le=300, allow_inf_nan=False)


def _execute_image_import(task_id: str, req: ImageImportRequest):
    try:
        def progress(percent: float, message: str):
            DOWNLOAD_TASKS[task_id].update({"status": "importing", "progress": percent, "message": message})
        result = import_studio_image(req.file_path, req.duration, progress_callback=progress)
        DOWNLOAD_TASKS[task_id].update({**result, "status": "completed", "progress": 100.0,
                                       "message": "Image ready in Studio."})
    except Exception as exc:
        logging.getLogger(__name__).exception("Studio image import failed for task %s", task_id)
        DOWNLOAD_TASKS[task_id].update({"status": "error", "message": str(exc)})


@app.post("/api/images/import")
def api_import_image(req: ImageImportRequest, background_tasks: BackgroundTasks):
    _prune_task_dict(DOWNLOAD_TASKS)
    task_id = str(uuid.uuid4())
    DOWNLOAD_TASKS[task_id] = {"id": task_id, "media_type": "images", "status": "queued",
                               "progress": 0.0, "message": "Preparing image for Studio…"}
    background_tasks.add_task(_execute_image_import, task_id, req)
    return {"task_id": task_id}


@app.get("/api/images/source")
def api_image_source(path: str = Query(...)):
    """Recover the original photo for an existing image-based Studio clip."""
    import json
    clip = Path(path).resolve()
    image_root = (APP_ROOT / "downloads" / "images").resolve()
    studio_root = (image_root / "studio").resolve()
    if not clip.is_relative_to(studio_root) or clip.suffix.lower() != ".mp4" or not clip.is_file():
        raise HTTPException(status_code=404, detail="This source is not a Studio image clip")
    metadata_path = clip.with_suffix(".image.json")
    try:
        if metadata_path.is_file():
            data = json.loads(metadata_path.read_text(encoding="utf-8"))
        else:
            # Existing imports in this server session predate persistent metadata.
            data = next((task for task in DOWNLOAD_TASKS.values()
                         if task.get("status") == "completed" and task.get("source_image_path")
                         and Path(task.get("file_path", "")).resolve() == clip), None)
            if not data:
                raise HTTPException(status_code=404, detail="Re-upload this image once to enable live duration changes")
        source = Path(data["source_image_path"]).resolve()
        duration = float(data["duration"])
        if not source.is_relative_to(image_root) or not source.is_file() or not math.isfinite(duration) or not 1 <= duration <= 300:
            raise ValueError("Invalid image source metadata")
        return {"source_image_path": str(source), "duration": duration,
                "title": str(data.get("title") or source.stem)}
    except HTTPException:
        raise
    except (OSError, ValueError, KeyError, TypeError) as exc:
        logging.getLogger(__name__).warning("Cannot restore Studio image source for %s: %s", clip, exc)
        raise HTTPException(status_code=400, detail="Could not restore the original image. Re-upload it to change its duration.") from exc


def _execute_image_download(task_id: str, url: str):
    try:
        def progress(percent: float, message: str):
            DOWNLOAD_TASKS[task_id].update({"status": "downloading", "progress": percent, "message": message})
        files = download_post_images(url, progress_callback=progress)
        if not files:
            raise ValueError("No downloadable images were found in this post.")
        DOWNLOAD_TASKS[task_id].update({
            "status": "completed", "progress": 100.0, "files": files,
            "message": f"{len(files)} image(s) downloaded at source quality.",
        })
    except Exception as exc:
        logging.getLogger(__name__).exception("Image download failed for task %s", task_id)
        DOWNLOAD_TASKS[task_id].update({"status": "error", "message": str(exc)})


@app.post("/api/images/download")
@app.post("/api/images/download/")
def api_start_image_download(req: YouTubeDownloadRequest, background_tasks: BackgroundTasks):
    try:
        url = validate_image_url(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _prune_task_dict(DOWNLOAD_TASKS)
    task_id = str(uuid.uuid4())
    DOWNLOAD_TASKS[task_id] = {
        "id": task_id, "media_type": "images", "status": "queued",
        "progress": 0.0, "message": "Finding images…", "files": [],
    }
    background_tasks.add_task(_execute_image_download, task_id, url)
    return {"task_id": task_id}


@app.get("/api/images/status/{task_id}")
def api_get_image_status(task_id: str):
    task = DOWNLOAD_TASKS.get(task_id)
    if not task or task.get("media_type") != "images":
        raise HTTPException(status_code=404, detail="Image download task not found")
    return task


@app.api_route("/api/images/file", methods=["GET", "HEAD"])
def api_download_image(path: str = Query(...), download: bool = True):
    image_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                   ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
                   ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff"}
    image_path = Path(path).resolve()
    image_root = (APP_ROOT / "downloads" / "images").resolve()
    if not image_path.is_relative_to(image_root) or image_path.suffix.lower() not in image_types:
        raise HTTPException(status_code=403, detail="Access denied: only downloaded images may be served")
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Downloaded image not found")
    return FileResponse(str(image_path), media_type=image_types[image_path.suffix.lower()],
                        filename=image_path.name if download else None)


# YouTube Video Downloader endpoints
def _execute_yt_download(task_id: str, url: str):
    try:
        _prune_task_dict(DOWNLOAD_TASKS)
        dl_res = YouTubeDownloader.download_video(url=url, task_id=task_id)
        file_path = dl_res.get("file_path") if isinstance(dl_res, dict) else DOWNLOAD_TASKS[task_id].get("file_path")
        title = dl_res.get("title") if isinstance(dl_res, dict) else ""
        DOWNLOAD_TASKS[task_id].update({
            "file_path": file_path,
            "title": title,
            "status": "completed",
            "progress": 100.0,
            "message": "Video downloaded. Generate subtitles or find a moment when you choose.",
        })
    except Exception as e:
        DOWNLOAD_TASKS[task_id]["status"] = "error"
        DOWNLOAD_TASKS[task_id]["message"] = str(e)
        logging.getLogger(__name__).exception("Video download failed for task %s", task_id)


def _execute_instagram_download(task_id: str, url: str):
    try:
        _prune_task_dict(DOWNLOAD_TASKS)
        dl_res = InstagramDownloader.download_video(url=url, task_id=task_id)
        file_path = dl_res.get("file_path") if isinstance(dl_res, dict) else None
        title = dl_res.get("title") if isinstance(dl_res, dict) else ""
        DOWNLOAD_TASKS[task_id].update({
            "file_path": file_path,
            "title": title,
            "status": "completed",
            "progress": 100.0,
            "message": "Video downloaded. Generate subtitles or find a moment when you choose.",
        })
    except Exception as exc:
        DOWNLOAD_TASKS[task_id].update({"status": "error", "message": str(exc)})

@app.post("/api/youtube/info")
def api_youtube_info(req: YouTubeInfoRequest):
    try:
        return YouTubeDownloader.get_video_info(req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/twitter/videos")
def api_twitter_videos(req: YouTubeInfoRequest):
    try:
        return {"videos": [{key: value for key, value in video.items() if key != "info"}
                           for video in extract_twitter_videos(req.url)]}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/media/detect")
def api_detect_media(req: YouTubeInfoRequest):
    try:
        return detect_url_media(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logging.getLogger(__name__).exception("URL media detection failed")
        raise HTTPException(status_code=400, detail=f"Could not detect this link's media: {exc}") from exc

@app.post("/api/youtube/download")
@app.post("/api/youtube/download/")
def api_start_youtube_download(req: YouTubeDownloadRequest, background_tasks: BackgroundTasks):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="YouTube URL is required")
    task_id = str(uuid.uuid4())
    DOWNLOAD_TASKS[task_id] = {
        "id": task_id,
        "status": "queued",
        "progress": 0.0,
        "message": "Queued for download...",
        "file_path": None
    }
    background_tasks.add_task(_execute_yt_download, task_id, url)
    return {"task_id": task_id}

@app.get("/api/youtube/status/{task_id}")
@app.get("/api/youtube/status/{task_id}/")
def api_get_youtube_status(task_id: str):
    task = DOWNLOAD_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/api/instagram/download")
@app.post("/api/instagram/download/")
def api_start_instagram_download(req: YouTubeDownloadRequest, background_tasks: BackgroundTasks):
    try:
        url = validate_instagram_video_url(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    task_id = str(uuid.uuid4())
    DOWNLOAD_TASKS[task_id] = {
        "id": task_id, "status": "queued", "progress": 0.0,
        "message": "Queued for Instagram download...", "file_path": None,
    }
    background_tasks.add_task(_execute_instagram_download, task_id, url)
    return {"task_id": task_id}


@app.get("/api/instagram/status/{task_id}")
@app.get("/api/instagram/status/{task_id}/")
def api_get_instagram_status(task_id: str):
    task = DOWNLOAD_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

# AI analysis endpoint
@app.post("/api/ai/analyze")
async def api_analyze_song(req: AnalyzeRequest):
    try:
        data = await gemini_client.analyze_song(
            song_name=req.song_name or "",
            anime_name=req.anime_name or "",
            duration=req.duration,
            video_title=req.video_title or "",
            api_key_override=req.api_key,
            video_path=req.video_path or ""
        )
        return data
    except Exception as e:
        logging.getLogger(__name__).warning("Song analysis failed: %s", e)
        raise HTTPException(status_code=getattr(e, "status_code", 400 if isinstance(e, ValueError) else 502), detail=str(e)) from e

@app.post("/api/ai/lyrics")
async def api_generate_lyrics(req: LyricsRequest):
    try:
        data = await gemini_client.generate_lyrics(
            song_name=req.song_name,
            anime_name=req.anime_name,
            start_time=req.start_time,
            end_time=req.end_time,
            video_title=req.video_title or "",
            api_key_override=req.api_key,
            video_path=req.video_path or ""
        )
        if isinstance(data, dict):
            return {
                "lyrics": data.get("lyrics", []),
                "status": data.get("status", "success"),
                "message": data.get("message", ""),
            }
        return {"lyrics": data}
    except Exception as e:
        logging.getLogger(__name__).warning("Subtitle generation failed: %s", e)
        raise HTTPException(status_code=getattr(e, "status_code", 400 if isinstance(e, ValueError) else 502), detail=str(e)) from e

@app.post("/api/ai/full-subtitles")
async def api_generate_full_subtitles(req: FullSubtitlesRequest):
    try:
        data = await gemini_client.generate_full_video_subtitles(
            video_path=req.video_path,
            song_name=req.song_name or "",
            anime_name=req.anime_name or "",
            video_title=req.video_title or "",
            duration=req.duration or 0.0,
            api_key_override=req.api_key
        )
        return data
    except Exception as e:
        logging.getLogger(__name__).warning("Full subtitle generation failed: %s", e)
        raise HTTPException(status_code=getattr(e, "status_code", 400 if isinstance(e, ValueError) else 502), detail=str(e)) from e

@app.post("/api/ai/viral-hooks")
async def api_generate_viral_hooks(req: ViralHooksRequest):
    video_path = _validate_safe_media_path(req.video_path)
    if not 0 < req.end_time - req.start_time <= 360:
        raise HTTPException(status_code=400, detail="Select a reel section between 0 and 360 seconds long.")
    try:
        hooks = await gemini_client.generate_viral_hooks(
            video_path=str(video_path),
            start_time=req.start_time,
            end_time=req.end_time,
            song_name=req.song_name or "",
            anime_name=req.anime_name or "",
            video_title=req.video_title or "",
            mood=req.mood or "hype",
            moment_type=req.moment_type or "",
            moment_reason=req.moment_reason or "",
            creator_instruction=req.creator_instruction or "",
            api_key_override=req.api_key
        )
        return {"hooks": hooks}
    except Exception as e:
        logging.getLogger(__name__).warning("Hook generation failed: %s", e)
        raise HTTPException(status_code=getattr(e, "status_code", 400 if isinstance(e, ValueError) else 502), detail=str(e)) from e


@app.post("/api/ai/instagram-caption")
async def api_generate_instagram_caption(req: InstagramCaptionRequest):
    try:
        return await gemini_client.generate_instagram_caption(
            song_name=req.song_name or "",
            anime_name=req.anime_name or "",
            video_title=req.video_title or "",
            hook=req.hook or "",
            moment_type=req.moment_type or "",
            creator_instruction=req.creator_instruction or "",
            api_key_override=req.api_key,
        )
    except Exception as e:
        logging.getLogger(__name__).warning("Caption generation failed: %s", e)
        raise HTTPException(status_code=getattr(e, "status_code", 400 if isinstance(e, ValueError) else 502), detail=str(e)) from e

# Templates endpoints
@app.get("/api/templates")
def api_list_templates():
    return template_manager.list_templates()

@app.get("/api/templates/{template_id}")
def api_get_template(template_id: str):
    try:
        return template_manager.get_template(template_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/templates/{template_id}")
def api_save_template(template_id: str, template_data: Dict[str, Any]):
    template_manager.save_template(template_id, template_data)
    return {"status": "saved", "id": template_id}

# Still preview endpoint
@app.post("/api/video/render-preview")
def api_render_preview(req: RenderStillRequest):
    try:
        temp_dir = Path(__file__).resolve().parent.parent / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        preview_out = str(temp_dir / f"preview_{int(time.time() * 1000)}.jpg")
        
        render_preview_still(
            source_video=req.source_video,
            timestamp=req.timestamp,
            series_text=req.series_text,
            song_name=req.song_name,
            anime_name=req.anime_name,
            caption=req.caption,
            template=req.template,
            output_image_path=preview_out,
            aspect_ratio=req.aspect_ratio or "16:9"
        )
        return FileResponse(preview_out, media_type="image/jpeg", background=BackgroundTask(os.unlink, preview_out))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audio/preview")
def api_audio_preview(req: AudioPreviewRequest):
    source = _validate_safe_media_path(req.source_video)
    info = probe_video(str(source))
    if not info.has_audio:
        raise HTTPException(status_code=400, detail="This video has no audio track.")
    if req.start_time >= info.duration or req.end_time > info.duration + 0.1:
        raise HTTPException(status_code=400, detail="The selection extends beyond this video.")
    temp_dir = APP_ROOT / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    output = temp_dir / f"audio_preview_{uuid.uuid4().hex}.wav"
    try:
        render_audio_preview(str(source), output, req.start_time,
                             req.end_time - req.start_time, req.audio_master.enabled)
        return FileResponse(output, media_type="audio/wav",
                            background=BackgroundTask(output.unlink, missing_ok=True))
    except Exception as exc:
        output.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Cannot prepare audio preview: {exc}") from exc


class MusicImportRequest(BaseModel):
    url: str = Field(min_length=1, max_length=8192)
    name: str = Field(default="", max_length=200)


class MusicNameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class MusicRangeRequest(MusicNameRequest):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)


class MusicHighlightsRequest(BaseModel):
    duration: float = Field(default=35, gt=0, le=900, allow_inf_nan=False)


def _music_error(exc: Exception):
    status = 404 if isinstance(exc, (KeyError, FileNotFoundError)) else 400 if isinstance(exc, ValueError) else 500
    raise HTTPException(status_code=status, detail=str(exc).strip("'")) from exc


@app.get("/api/music")
def api_list_music(q: str = Query(default="", max_length=200)):
    try:
        return {"tracks": music_library.list_tracks(q)}
    except (RuntimeError, OSError) as exc:
        _music_error(exc)


@app.post("/api/music/import")
def api_import_music(req: MusicImportRequest):
    try:
        return {"task_id": music_library.start_import(req.url, req.name)}
    except (ValueError, RuntimeError, OSError) as exc:
        _music_error(exc)


@app.post("/api/music/upload")
def api_upload_music(file: UploadFile = File(...), name: str = Form(default="")):
    """Copy a local audio upload in bounded chunks, then prepare it off the request thread."""
    temporary = None
    handed_off = False
    try:
        filename = PureWindowsPath(file.filename or "").name
        suffix = Path(filename).suffix.lower()
        if suffix not in AUDIO_UPLOAD_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Choose a supported audio file: MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, WMA or AIFF.")
        if name.strip():
            music_library._name(name)
        if file.size is not None and file.size > MAX_AUDIO_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Audio files must be 256 MB or smaller.")
        upload_dir = APP_ROOT / "temp" / "music_uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        temporary = upload_dir / f"{uuid.uuid4().hex}{suffix}"
        size = 0
        with temporary.open("xb") as output:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_AUDIO_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Audio files must be 256 MB or smaller.")
                output.write(chunk)
        if not size:
            raise HTTPException(status_code=400, detail="The audio file is empty. Choose a playable audio file.")
        task_id = music_library.start_local_import(temporary, filename, name)
        handed_off = True
        return {"task_id": task_id}
    except (ValueError, RuntimeError, OSError) as exc:
        _music_error(exc)
    finally:
        file.file.close()
        if temporary is not None and not handed_off:
            temporary.unlink(missing_ok=True)


@app.get("/api/music/tasks/{task_id}")
def api_music_task(task_id: str):
    try:
        return music_library.task(task_id)
    except KeyError as exc:
        _music_error(exc)


@app.patch("/api/music/{track_id}")
def api_rename_music(track_id: str, req: MusicNameRequest):
    try:
        return music_library.rename(track_id, req.name)
    except (KeyError, ValueError, RuntimeError, OSError) as exc:
        _music_error(exc)


@app.post("/api/music/{track_id}/ranges")
def api_save_music_range(track_id: str, req: MusicRangeRequest):
    try:
        return music_library.save_range(track_id, req.name, req.start, req.end)
    except (KeyError, ValueError, RuntimeError, OSError) as exc:
        _music_error(exc)


@app.delete("/api/music/{track_id}")
def api_delete_music(track_id: str):
    try:
        music_library.delete(track_id)
        return {"deleted": track_id}
    except (KeyError, ValueError, RuntimeError, OSError) as exc:
        _music_error(exc)


@app.post("/api/music/{track_id}/highlights")
async def api_music_highlights(track_id: str, req: MusicHighlightsRequest):
    from app.ai.music_highlights import find_music_highlights, HighlightError
    try:
        source = await asyncio.to_thread(music_library.resolve_file, track_id)
        result = await find_music_highlights(source, req.duration, get_settings().gemini_api_key)
        await asyncio.to_thread(music_library.save_highlights, track_id, result)
        return result
    except HighlightError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except (KeyError, ValueError, FileNotFoundError, RuntimeError, OSError) as exc:
        _music_error(exc)


@app.api_route("/api/music/{track_id}/file", methods=["GET", "HEAD"])
def api_music_file(track_id: str):
    try:
        path = music_library.resolve_file(track_id)
        return FileResponse(path, media_type="audio/mpeg" if path.suffix == ".mp3" else "audio/mp4")
    except (KeyError, FileNotFoundError, RuntimeError, OSError) as exc:
        _music_error(exc)


# Reel Export Execution
def _execute_export(task_id: str, req: ExportRequest):
    try:
        _prune_task_dict(EXPORT_TASKS)
        EXPORT_TASKS[task_id]["status"] = "rendering"
        EXPORT_TASKS[task_id]["progress"] = 15.0
        EXPORT_TASKS[task_id]["message"] = "Initializing FFmpeg pipeline..."

        settings = get_settings()
        out_dir = Path(settings.default_export_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        # Fallback to default template if omitted
        tpl = req.template or template_manager.get_template("cinematic")

        # A missing source must never silently select a different user's clip.
        source_path = Path(req.source_video).resolve()
        if req.music:
            music_library.validate_range(req.music.track_id, req.music.start, req.music.end)
            music_library.resolve_file(req.music.track_id)
        resolved_src = str(source_path)
        if not source_path.is_file() or req.source_video.startswith("blob:"):
            raise FileNotFoundError(
                f"Source video '{req.source_video}' could not be resolved on server. "
                "Please re-select or re-upload the video file before exporting."
            )

        # Generate output filename
        safe_song = "".join(c if c.isalnum() else "_" for c in (req.song_name or "song")).strip("_") or "song"
        tpl_name = tpl.get("name", "custom").lower()
        aspect_slug = "16x9" if req.aspect_ratio == "16:9" else ("1x1" if req.aspect_ratio == "1:1" else "9x16")
        day_num = req.day_number if req.day_number is not None else 1
        custom_name = _export_name_stem(req.output_name) if req.output_name and req.output_name.strip() else None
        filename = req.output_name if custom_name else f"{safe_song}_DAY_{day_num:02d}_{tpl_name}_{aspect_slug}.mp4"
        out_file = str(_reserve_export_path(out_dir, filename, preserve_name=custom_name is not None))
        EXPORT_TASKS[task_id]["output_file"] = out_file

        def on_progress(p: float, msg: str):
            EXPORT_TASKS[task_id]["progress"] = p
            EXPORT_TASKS[task_id]["message"] = msg

        final_path = renderer.render_reel(
            source_video=resolved_src,
            output_mp4=out_file,
            start_time=req.start_time,
            end_time=req.end_time,
            series_text=req.series_text,
            song_name=req.song_name,
            anime_name=req.anime_name,
            caption=req.caption or "",
            template=tpl,
            aspect_ratio=req.aspect_ratio or "9:16",
            lyrics=req.lyrics,
            show_lyrics=req.show_lyrics if req.show_lyrics is not None else True,
            subtitle_style=req.subtitle_style or "minimal",
            subtitle_animation=req.subtitle_animation or "auto",
            subtitle_language=req.subtitle_language or "both",
            smart_loop=req.smart_loop if req.smart_loop is not None else True,
            loop_mode=req.loop_mode or "standard",
            loop_fade_duration=req.loop_fade_duration or 0.35,
            fade_in=bool(req.fade_in),
            fade_out=bool(req.fade_out),
            fade_duration=req.fade_duration if req.fade_duration is not None else 0.50,
            hook_fade_start=req.hook_fade_start if req.hook_fade_start is not None else 0.0,
            watermark=req.watermark,
            creator_badge=req.creator_badge,
            subtitle_color=req.subtitle_color,
            subtitle_color_en=req.subtitle_color_en,
            color_filter=req.color_filter,
            filter_intensity=req.filter_intensity,
            color_adjustments=req.color_adjustments,
            subtitle_y=req.subtitle_y,
            subtitle_x=req.subtitle_x,
            subtitle_font_size=req.subtitle_font_size,
            subtitle_font=req.subtitle_font or "segoe",
            audio_master=req.audio_master.model_dump() if req.audio_master else None,
            music=req.music.model_dump() if req.music else None,
            video_audio_volume=req.video_audio_volume,
            progress_callback=on_progress
        )

        duration = (req.end_time or 35.0) - (req.start_time or 0.0)
        resolution = None
        fps = None
        try:
            exported_info = probe_video(final_path)
            if exported_info.width > 0 and exported_info.height > 0:
                resolution = f"{exported_info.width}x{exported_info.height}"
            if exported_info.fps > 0:
                fps = exported_info.fps
        except (OSError, RuntimeError, ValueError) as exc:
            print(f"[History] Could not read exported video metadata for {final_path}: {exc}")
        # Record into history
        hist_entry = project_manager.add_history_entry(
            day=req.day_number if req.day_number is not None else 1,
            song=req.song_name or "Song",
            anime=req.anime_name or "Anime",
            duration=duration,
            template=tpl.get("name", "Custom"),
            export_path=final_path,
            name=custom_name or Path(final_path).stem,
            format="mp4",
            aspect_ratio=req.aspect_ratio or "9:16",
            resolution=resolution,
            fps=fps,
            hook_text=req.series_text or "",
        )

        EXPORT_TASKS[task_id]["status"] = "completed"
        EXPORT_TASKS[task_id]["progress"] = 100.0
        EXPORT_TASKS[task_id]["message"] = "Render completed!"
        EXPORT_TASKS[task_id]["output_file"] = final_path
        EXPORT_TASKS[task_id]["history"] = hist_entry

    except Exception as e:
        EXPORT_TASKS[task_id]["status"] = "error"
        EXPORT_TASKS[task_id]["message"] = str(e)

@app.post("/api/export")
@app.post("/api/render-reel")
def api_start_export(req: ExportRequest, background_tasks: BackgroundTasks):
    if req.music:
        try:
            music_library.validate_range(req.music.track_id, req.music.start, req.music.end)
            music_library.resolve_file(req.music.track_id)
        except (KeyError, ValueError, FileNotFoundError, RuntimeError, OSError) as exc:
            _music_error(exc)
    task_id = str(uuid.uuid4())
    EXPORT_TASKS[task_id] = {
        "id": task_id,
        "status": "queued",
        "progress": 0.0,
        "message": "Queued for export...",
        "output_file": None
    }
    background_tasks.add_task(_execute_export, task_id, req)
    return {"task_id": task_id}

@app.get("/api/export/status/{task_id}")
def api_get_export_status(task_id: str):
    task = EXPORT_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

# History & Projects endpoints
@app.get("/api/history")
def api_get_history():
    export_roots = [
        (APP_ROOT / "exports").resolve(),
        Path(get_settings().default_export_dir).resolve(),
    ]
    return [_history_details(entry, export_roots) for entry in project_manager.get_history()]


@app.delete("/api/history/{history_id}/file")
def api_delete_history_file(history_id: str):
    """Delete an exported video selected by history ID, retaining its metadata."""
    matches = [row for row in project_manager.get_history() if row.get("id") == history_id]
    if not matches:
        raise HTTPException(status_code=404, detail="Export history entry not found.")
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="This older history ID matches multiple exports. Delete the intended file from its export folder instead.")
    entry = matches[0]
    raw_path = entry.get("export_location")
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise HTTPException(status_code=400, detail="This history entry has no exported video path.")
    try:
        roots = [(APP_ROOT / "exports").resolve(), Path(get_settings().default_export_dir).resolve()]
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = APP_ROOT / candidate
        path = candidate.resolve()
        if path.suffix.lower() not in VIDEO_EXTENSIONS or not any(path.is_relative_to(root) for root in roots):
            raise HTTPException(status_code=403, detail="Only videos inside the export folder can be deleted.")
        if candidate.is_symlink():
            raise HTTPException(status_code=403, detail="Linked files cannot be deleted from History. Manage the link on your PC.")
        for task in list(EXPORT_TASKS.values()):
            active_output = task.get("output_file")
            if task.get("status") not in ("queued", "rendering") or not active_output:
                continue
            active_path = Path(active_output)
            if not active_path.is_absolute():
                active_path = APP_ROOT / active_path
            if active_path.resolve() == path:
                raise HTTPException(status_code=409, detail="This video is still exporting. Wait until the export finishes.")
        file_stat = path.stat()
        if not stat.S_ISREG(file_stat.st_mode):
            raise HTTPException(status_code=400, detail="This history entry does not point to a video file.")
        path.unlink()
        return {"deleted": True, "freed_bytes": file_stat.st_size}
    except FileNotFoundError:
        return {"deleted": False, "freed_bytes": 0}
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail="Cannot delete this video. Close any app using it, check file permissions, and try again.") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Could not delete exported video: {exc}") from exc


def _history_details(entry: Dict[str, Any], export_roots: list[Path]) -> Dict[str, Any]:
    """Enrich old records cheaply without probing videos or rewriting user history."""
    result = dict(entry)
    raw_path = entry.get("export_location") or ""
    file_name = PureWindowsPath(str(raw_path)).name or entry.get("file_name") or ""
    saved_name = entry.get("name")
    result["file_name"] = file_name
    result["display_name"] = (
        saved_name.strip() if isinstance(saved_name, str) and saved_name.strip()
        else PureWindowsPath(file_name).stem or "Unnamed reel"
    )
    result["format"] = entry.get("format") or PureWindowsPath(file_name).suffix.lstrip(".").lower() or "mp4"
    result["created_at"] = entry.get("created_at") or entry.get("created_date")
    result["available"] = False
    result["size_bytes"] = None
    if raw_path:
        try:
            path = Path(str(raw_path))
            if not path.is_absolute():
                path = APP_ROOT / path
            path = path.resolve()
            if path.suffix.lower() in VIDEO_EXTENSIONS and any(path.is_relative_to(root) for root in export_roots):
                file_stat = path.stat()
                if stat.S_ISREG(file_stat.st_mode):
                    result["available"] = True
                    result["size_bytes"] = file_stat.st_size
        except (OSError, ValueError):
            # Missing or inaccessible files are a valid history state.
            pass
    duration = entry.get("duration_seconds", entry.get("duration"))
    try:
        seconds = float(str(duration).rstrip("s"))
        result["duration_seconds"] = seconds if math.isfinite(seconds) and seconds >= 0 else None
    except (TypeError, ValueError):
        result["duration_seconds"] = None
    return result

@app.get("/api/projects")
def api_get_projects():
    return project_manager.list_projects()

@app.get("/api/projects/{project_id}")
def api_get_project(project_id: str):
    proj = project_manager.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj

@app.post("/api/projects")
def api_save_project(req: SaveProjectRequest):
    path = project_manager.save_project(req.project_id, req.state)
    return {"status": "saved", "path": path}

# Safe Media Whitelist Directory Guard
ALLOWED_MEDIA_DIRS = [
    (Path(__file__).resolve().parent.parent / "downloads").resolve(),
    (Path(__file__).resolve().parent.parent / "exports").resolve(),
    (Path(__file__).resolve().parent.parent / "temp").resolve(),
    (Path(__file__).resolve().parent.parent / "projects").resolve(),
]

def _validate_safe_media_path(raw_path: str) -> Path:
    p = Path(raw_path).resolve()
    allowed_dirs = [*ALLOWED_MEDIA_DIRS, Path(get_settings().default_export_dir).resolve()]
    with MEDIA_REGISTRY_LOCK:
        selected = p in {Path(path) for path in _registered_media_paths()}
    if not selected and not any(p.is_relative_to(allowed) for allowed in allowed_dirs):
        raise HTTPException(status_code=403, detail="Access denied: path is outside allowed media directories")
    if p.suffix.lower() not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=403, detail="Access denied: only video media may be served")
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return p

# Serve media directly for local preview
@app.api_route("/api/media/stream", methods=["GET", "HEAD"])
def api_stream_media(path: str = Query(...)):
    p = _validate_safe_media_path(path)
    return FileResponse(str(p), media_type="video/mp4")

@app.api_route("/api/media/download", methods=["GET", "HEAD"])
def api_download_media(path: str = Query(...)):
    p = _validate_safe_media_path(path)
    return FileResponse(str(p), media_type="video/mp4", filename=p.name)

# ── Instagram Schedule API ─────────────────────────────────────

@app.get("/api/schedule")
def api_list_schedule():
    """List all scheduled items."""
    return instagram_scheduler.list_scheduled()

@app.get("/api/schedule/stats")
def api_schedule_stats():
    """Get queue statistics."""
    stats = instagram_scheduler.get_queue_stats()
    stats["scheduler_running"] = instagram_scheduler.is_scheduler_running()
    return stats

@app.get("/api/schedule/exports")
def api_list_exports():
    """List available exported reels for scheduling."""
    return instagram_scheduler.list_exported_reels()

@app.post("/api/schedule")
def api_add_schedule(req: ScheduleAddRequest):
    """Add a reel to the posting schedule."""
    try:
        entry = instagram_scheduler.add_to_schedule(
            file_path=req.file_path,
            scheduled_time=req.scheduled_time,
            caption=req.caption or "",
            hashtags=req.hashtags or "",
            cover_timestamp=req.cover_timestamp or 1.0,
        )
        return entry
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/schedule/{item_id}")
def api_update_schedule(item_id: str, req: ScheduleUpdateRequest):
    """Update a scheduled item."""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    try:
        item = instagram_scheduler.update_schedule_item(item_id, updates)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Schedule item not found or cannot be updated")
    return item

@app.post("/api/schedule/{item_id}/cancel")
def api_cancel_schedule(item_id: str):
    """Cancel a pending/failed scheduled item."""
    item = instagram_scheduler.cancel_schedule_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or already posted")
    return item

@app.post("/api/schedule/{item_id}/retry")
def api_retry_schedule(item_id: str):
    """Retry a failed/cancelled scheduled item."""
    try:
        item = instagram_scheduler.retry_schedule_item(item_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or not in failed/cancelled state")
    return item

@app.delete("/api/schedule/{item_id}")
def api_delete_schedule(item_id: str):
    """Permanently delete a schedule item."""
    ok = instagram_scheduler.delete_schedule_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Schedule item not found")
    return {"status": "deleted", "id": item_id}

@app.post("/api/schedule/toggle")
def api_toggle_scheduler():
    """Start or stop the background scheduler."""
    if instagram_scheduler.is_scheduler_running():
        instagram_scheduler.stop_scheduler()
        return {"status": "stopped", "running": False}
    else:
        try:
            instagram_scheduler.start_scheduler()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "started", "running": True}

# Static files for UI
static_dir = Path(__file__).resolve().parent / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
