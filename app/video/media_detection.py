"""Inspect URL media without downloading or importing its content."""
from __future__ import annotations

import io
import json
import logging
import os
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

from PIL import Image, UnidentifiedImageError

from app.video.downloader import extract_twitter_videos, find_cookies_file
from app.video.image_downloader import IMAGE_EXTENSIONS, SOCIAL_HOSTS, _opener, validate_image_url

logger = logging.getLogger(__name__)
VIDEO_EXTENSIONS = {"mp4", "webm", "mov", "m4v", "mkv", "ts", "m3u8"}
VIDEO_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be", "vimeo.com", "www.vimeo.com"}


def _social_media_type(url: str) -> str:
    command = [sys.executable, "-m", "gallery_dl", "--config-ignore", "--no-input", "--no-colors",
               "--no-postprocessors", "--http-timeout", "15", "--retries", "1", "--range", "1-21", "-j"]
    for option in ("extractor.twitter.videos=true", "extractor.twitter.previews=false",
                   "extractor.twitter.quoted=false", "extractor.twitter.ratelimit=abort",
                   "extractor.instagram.videos=true", "extractor.instagram.previews=false",
                   "extractor.instagram.audio=false", "extractor.retries=1"):
        command.extend(["-o", option])
    if cookies := find_cookies_file():
        command.extend(["--cookies", cookies])
    command.extend(["--", url])
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                timeout=90, env=dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1"),
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Reading this post timed out. Try again or upload the image/video from your PC.") from exc
    if result.returncode:
        logger.warning("Media detection failed: %s", result.stderr[-1000:])
        if "No module named gallery_dl" in result.stderr:
            raise ValueError("Automatic post detection needs gallery-dl. Install the application requirements and restart Studio.")
        raise ValueError("Could not read this post. Use a public post, supply exported cookies.txt, or upload its image/video from your PC.")
    try:
        records = json.loads(result.stdout)
    except (ValueError, TypeError) as exc:
        raise ValueError("The post provider returned an unreadable response. Try again later.") from exc
    if not isinstance(records, list):
        raise ValueError("The post provider returned an unreadable response.")
    images = videos = False
    for record in records:
        if not isinstance(record, list) or not record:
            continue
        if record[0] == -1:
            logger.warning("Post detection provider error: %s", str(record[-1])[:1000])
            raise ValueError("This post could not be read. It may require sign-in. Use a public post or supply exported cookies.txt.")
        if record[0] != 3 or len(record) < 3 or not isinstance(record[2], dict):
            continue
        metadata = record[2]
        media_type = metadata.get("type")
        extension = str(metadata.get("extension", "")).lower()
        if media_type == "preview":
            continue
        if media_type in {"video", "animated_gif"} or metadata.get("video_url") or extension in VIDEO_EXTENSIONS:
            videos = True
        elif not metadata.get("audio_url") and extension in IMAGE_EXTENSIONS:
            images = True
    if images and "/photo/" in urlparse(url).path:
        return "images"
    if videos:
        return "video"
    if images:
        return "images"
    raise ValueError("No downloadable image or video was found in this post. Video thumbnails are not imported as images.")


def detect_url_media(url: str) -> dict:
    """Classify originals only; normal download handlers retain validation/quality."""
    url = validate_image_url(url)
    parsed = urlparse(url)
    host = parsed.hostname.lower()
    if host in SOCIAL_HOSTS:
        media_type = _social_media_type(url)
        result = {"media_type": media_type}
        if media_type == "video" and "instagram" not in host:
            result["videos"] = [{key: value for key, value in item.items() if key != "info"}
                                for item in extract_twitter_videos(url)]
        return result
    if host in VIDEO_HOSTS:
        return {"media_type": "video"}
    # A short GET also works for providers that reject HEAD and extensionless
    # image CDN URLs. Never download a complete video to inspect it.
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Range": "bytes=0-65535"})
    try:
        with _opener().open(request, timeout=20) as response:
            validate_image_url(response.geturl())
            mime = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
            if mime.startswith("video/") or mime in {"application/vnd.apple.mpegurl", "application/x-mpegurl"}:
                return {"media_type": "video"}
            prefix = response.read(65536)
            try:
                with Image.open(io.BytesIO(prefix)) as image:
                    if image.format:
                        return {"media_type": "images"}
            except (UnidentifiedImageError, OSError, ValueError):
                pass
            if mime.startswith("image/"):
                raise ValueError("This image link did not return a supported image. Try a fresh link or upload it from your PC.")
            if mime.startswith("audio/"):
                raise ValueError("This URL contains audio. Add it through the Music & Audio Library.")
            # Other supported video websites are handled by yt-dlp. HTML alone
            # is never used as evidence that a page's thumbnail is its media.
            return {"media_type": "video"}
    except urllib.error.HTTPError as exc:
        code = exc.code
        exc.close()
        raise ValueError(f"The media provider returned HTTP {code}. Try a public link or upload the file from your PC.") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ValueError("Could not reach this media link. Check the URL and connection, then try again.") from exc
