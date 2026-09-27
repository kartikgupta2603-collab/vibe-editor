import os
import sys
import uuid
import asyncio
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path, PureWindowsPath
from typing import Dict, Any, Optional
from pydantic import BaseModel

import shutil
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

from app.config.settings import get_settings, update_settings
from app.video.probe import probe_video
from app.video.renderer import renderer
from app.video.preview import render_preview_still, extract_preview_frame
from app.video.downloader import YouTubeDownloader, DOWNLOAD_TASKS, ensure_browser_compatible
from app.templates.template_manager import template_manager
from app.projects.project_manager import project_manager, atomic_write_json
from app.ai.gemini_client import gemini_client
from app.scheduler import instagram_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler on boot and stop on shutdown cleanly."""
    instagram_scheduler.start_scheduler()
    yield
    instagram_scheduler.stop_scheduler()

app = FastAPI(title="Anime Song Reel Creator API", version="1.0.0", lifespan=lifespan)

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


def _reserve_export_path(out_dir: Path, requested_name: str) -> Path:
    """Allocate a distinct output even when an explicit filename is reused."""
    basename = PureWindowsPath(requested_name).name
    stem = "".join(c if c.isalnum() or c in "_-" else "_" for c in Path(basename).stem)
    stem = stem[:120].strip("_") or "reel"
    for _ in range(10):
        path = out_dir / f"{stem}_{uuid.uuid4().hex[:12]}.mp4"
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
    song_name: Optional[str] = ""
    anime_name: Optional[str] = ""
    video_title: Optional[str] = ""
    mood: Optional[str] = "hype"
    api_key: Optional[str] = None

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
    smart_loop: Optional[bool] = True
    loop_mode: Optional[str] = "standard"
    loop_fade_duration: Optional[float] = 0.35
    fade_in: Optional[bool] = False
    fade_out: Optional[bool] = False
    fade_duration: Optional[float] = 0.50
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
    force: bool = True

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

# YouTube Video Downloader endpoints
def _execute_yt_download(task_id: str, url: str):
    try:
        _prune_task_dict(DOWNLOAD_TASKS)
        dl_res = YouTubeDownloader.download_video(url=url, task_id=task_id)
        file_path = dl_res.get("file_path") if isinstance(dl_res, dict) else DOWNLOAD_TASKS[task_id].get("file_path")
        title = dl_res.get("title") if isinstance(dl_res, dict) else ""
        song_name = dl_res.get("song_name") if isinstance(dl_res, dict) else ""
        anime_name = dl_res.get("anime_name") if isinstance(dl_res, dict) else ""
        duration = float(dl_res.get("duration") or 0.0) if isinstance(dl_res, dict) else 0.0

        ai_failed = False
        if file_path:
            DOWNLOAD_TASKS[task_id]["status"] = "analyzing"
            DOWNLOAD_TASKS[task_id]["progress"] = 92.0
            DOWNLOAD_TASKS[task_id]["message"] = "✨ Gemini AI: Listening to vocals & generating full-video subtitles..."
            try:
                ai_data = asyncio.run(gemini_client.generate_full_video_subtitles(
                    video_path=file_path,
                    song_name=song_name or "",
                    anime_name=anime_name or "",
                    video_title=title or "",
                    duration=duration
                ))
                if ai_data:
                    DOWNLOAD_TASKS[task_id]["song_name"] = ai_data.get("song_name") or song_name
                    DOWNLOAD_TASKS[task_id]["anime_name"] = ai_data.get("anime_name") or anime_name
                    DOWNLOAD_TASKS[task_id]["lyrics"] = ai_data.get("lyrics", [])
                    DOWNLOAD_TASKS[task_id]["subtitle_style"] = ai_data.get("subtitle_style", "bold_lyrics")
                    DOWNLOAD_TASKS[task_id]["subtitle_style_reason"] = ai_data.get("subtitle_style_reason", "")
                    DOWNLOAD_TASKS[task_id]["ai_analysis"] = ai_data
            except Exception as e_ai:
                print(f"[YouTube Download] AI full-subtitle generation note: {e_ai}")
                DOWNLOAD_TASKS[task_id]["lyrics"] = []
                ai_failed = True

        DOWNLOAD_TASKS[task_id]["status"] = "completed"
        DOWNLOAD_TASKS[task_id]["progress"] = 100.0
        DOWNLOAD_TASKS[task_id]["message"] = "Download Complete!" if not ai_failed else "Download Complete (AI subtitles skipped)."
    except Exception as e:
        DOWNLOAD_TASKS[task_id]["status"] = "error"
        DOWNLOAD_TASKS[task_id]["message"] = str(e)

@app.post("/api/youtube/info")
def api_youtube_info(req: YouTubeInfoRequest):
    try:
        return YouTubeDownloader.get_video_info(req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
                "subtitle_style": data.get("subtitle_style", "bold_lyrics"),
                "style_reason": data.get("style_reason", "")
            }
        return {"lyrics": data, "subtitle_style": "bold_lyrics", "style_reason": ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/viral-hooks")
async def api_generate_viral_hooks(req: ViralHooksRequest):
    try:
        hooks = await gemini_client.generate_viral_hooks(
            song_name=req.song_name or "",
            anime_name=req.anime_name or "",
            video_title=req.video_title or "",
            mood=req.mood or "hype",
            api_key_override=req.api_key
        )
        return {"hooks": hooks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        filename = req.output_name or f"{safe_song}_DAY_{day_num:02d}_{tpl_name}_{aspect_slug}.mp4"
        out_file = str(_reserve_export_path(out_dir, filename))

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
            subtitle_language=req.subtitle_language or "both",
            smart_loop=req.smart_loop if req.smart_loop is not None else True,
            loop_mode=req.loop_mode or "standard",
            loop_fade_duration=req.loop_fade_duration or 0.35,
            fade_in=bool(req.fade_in),
            fade_out=bool(req.fade_out),
            fade_duration=req.fade_duration if req.fade_duration is not None else 0.50,
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
            progress_callback=on_progress
        )

        duration = (req.end_time or 35.0) - (req.start_time or 0.0)
        # Record into history
        hist_entry = project_manager.add_history_entry(
            day=req.day_number if req.day_number is not None else 1,
            song=req.song_name or "Song",
            anime=req.anime_name or "Anime",
            duration=duration,
            template=tpl.get("name", "Custom"),
            export_path=final_path
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
    return project_manager.get_history()

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
