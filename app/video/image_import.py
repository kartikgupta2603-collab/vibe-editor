"""Turn a downloaded photo into an editable, silent Studio source clip."""
from __future__ import annotations

import logging
import json
import math
import subprocess
import tempfile
import uuid
import warnings
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config.settings import BASE_DIR
from app.video.downloader import get_downloads_dir

logger = logging.getLogger(__name__)
TEMP_DIR = BASE_DIR / "temp"
IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "AVIF", "BMP", "TIFF"}


def import_studio_image(file_path: str, duration: float = 10, progress_callback=None) -> dict:
    """Preserve the downloaded original and prepare its first frame for Studio."""
    try:
        seconds = float(duration)
    except (TypeError, ValueError) as exc:
        raise ValueError("Image duration must be between 1 and 300 seconds.") from exc
    if isinstance(duration, bool) or not math.isfinite(seconds) or not 1 <= seconds <= 300:
        raise ValueError("Image duration must be between 1 and 300 seconds.")

    image_root = (get_downloads_dir() / "images").resolve()
    source = Path(file_path).resolve()
    if not source.is_relative_to(image_root) or not source.is_file():
        raise ValueError("Choose an image downloaded in Studio's Images section.")
    output_dir = image_root / "studio"
    # Resolve before creating anything, so an existing symlink cannot escape downloads.
    if not output_dir.resolve().is_relative_to(image_root):
        raise ValueError("The Studio image output folder is outside the downloads folder.")
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{uuid.uuid4().hex}.mp4"
    metadata_path = target.with_suffix(".image.json")
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    notify = progress_callback or (lambda percent, message: None)
    notify(10, "Preparing image for Studio…")
    try:
        with tempfile.TemporaryDirectory(prefix="studio-image-", dir=TEMP_DIR) as scratch:
            normalized = Path(scratch) / "frame.png"
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(source) as image:
                        if image.format not in IMAGE_FORMATS:
                            raise ValueError("This image format is not supported in Studio.")
                        image.seek(0)
                        frame = ImageOps.exif_transpose(image).convert("RGBA")
                        # Transparent pixels use the same black background as a silent clip.
                        background = Image.new("RGB", frame.size, "black")
                        background.paste(frame, mask=frame.getchannel("A"))
                        background.save(normalized, format="PNG")
            except (OSError, UnidentifiedImageError, Image.DecompressionBombError,
                    Image.DecompressionBombWarning) as exc:
                logger.warning("Cannot prepare Studio image %s: %s", source, exc)
                raise ValueError("This downloaded file is not a readable image. Download it again or choose another image.") from exc

            notify(35, "Loading image into Studio…")
            command = [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
                "-loop", "1", "-framerate", "30", "-i", str(normalized),
                "-t", str(seconds), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0,setsar=1",
                "-an", "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage",
                "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
            ]
            try:
                result = subprocess.run(
                    command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                    timeout=600, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
            except FileNotFoundError as exc:
                raise RuntimeError("FFmpeg is missing. Install FFmpeg and restart Studio to load images.") from exc
            except subprocess.TimeoutExpired as exc:
                logger.warning("Studio image preparation timed out: %s", source)
                raise RuntimeError("Preparing this image timed out. Try a shorter image duration or another image.") from exc
            if result.returncode or not target.is_file() or target.stat().st_size == 0:
                logger.error("Studio image preparation failed for %s: %s", source, result.stderr[-2000:])
                raise RuntimeError("Could not prepare this image for Studio. Try another image or check the FFmpeg error in the server log.")
        # Keep the original photo linked to this source after server/project reloads.
        with metadata_path.open("x", encoding="utf-8") as metadata:
            json.dump({"source_image_path": str(source), "duration": seconds,
                       "title": source.stem}, metadata, ensure_ascii=False)
        notify(100, "Image ready in Studio.")
        return {"file_path": str(target), "title": source.stem, "duration": seconds,
                "source_image_path": str(source)}
    except BaseException:
        # Only the unique derivative belongs to this import; never remove its original.
        target.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        raise
