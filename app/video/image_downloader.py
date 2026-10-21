"""Download original post photos without passing them through video encoding."""
from __future__ import annotations

import http.cookiejar
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import warnings
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, UnidentifiedImageError

from app.video.downloader import find_cookies_file, get_downloads_dir

logger = logging.getLogger(__name__)
MAX_IMAGES = 20
MAX_IMAGE_BYTES = 30 * 1024 * 1024
MAX_TOTAL_BYTES = 200 * 1024 * 1024
REQUEST_TIMEOUT = 20
JOB_TIMEOUT = 180
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "tif", "tiff"}
FORMAT_EXTENSIONS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp", "GIF": "gif",
                     "AVIF": "avif", "BMP": "bmp", "TIFF": "tiff"}
SOCIAL_HOSTS = {"x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com",
                "instagram.com", "www.instagram.com", "m.instagram.com"}


def validate_image_url(url: str) -> str:
    url = (url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Paste an HTTP or HTTPS image or post URL without a username/password in the link.")
    if any(ord(char) < 32 for char in url):
        raise ValueError("The image URL contains invalid characters.")
    host = parsed.hostname.lower()
    if host in SOCIAL_HOSTS:
        if "instagram" in host:
            matched = re.fullmatch(r"/(?:p|reel|tv)/[A-Za-z0-9_-]+/?", parsed.path)
        else:
            matched = re.fullmatch(r"/(?:[^/]+/status|i/web/status)/\d+(?:/(?:photo|video)/\d+)?/?", parsed.path)
        if not matched:
            raise ValueError("Paste a single post URL, rather than a profile or feed URL.")
    return url


def _post_photo_urls(url: str) -> list[dict]:
    # CLI isolation avoids changing gallery-dl's process-global configuration
    # while multiple Studio jobs run. Never read the user's default config.
    command = [sys.executable, "-m", "gallery_dl", "--config-ignore", "--no-input", "--no-colors",
               "--no-postprocessors", "--http-timeout", "15", "--retries", "1", "--range", "1-21", "-j"]
    for option in ("extractor.twitter.videos=false", "extractor.twitter.previews=false",
                   "extractor.twitter.quoted=false", "extractor.twitter.ratelimit=abort",
                   "extractor.instagram.videos=false", "extractor.instagram.previews=false",
                   "extractor.instagram.audio=false", "extractor.retries=1"):
        command.extend(["-o", option])
    cookies = find_cookies_file()
    if cookies:
        command.extend(["--cookies", cookies])
    command.extend(["--", url])
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                                timeout=90, env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as exc:
        raise ValueError("Reading photos from this post timed out. Try again or paste a direct image URL.") from exc
    if result.returncode:
        logger.warning("Post photo extraction failed: %s", result.stderr[-1000:])
        if "No module named gallery_dl" in result.stderr:
            raise ValueError("Photo downloads need gallery-dl. Install the application requirements and restart Studio.")
        raise ValueError("Could not read this post's photos. It may be private, restricted, or require sign-in. "
                         "Try a public post or a direct image URL.")
    try:
        records = json.loads(result.stdout)
    except (ValueError, TypeError) as exc:
        logger.warning("Photo extractor returned invalid JSON: %s", result.stderr[-500:])
        raise ValueError("The photo provider returned an unreadable response. Try again later.") from exc
    if not isinstance(records, list):
        raise ValueError("The photo provider returned an unreadable response.")
    photos = []
    seen = set()
    for record in records:
        if not isinstance(record, list) or not record:
            continue
        if record[0] == -1:
            error = record[-1] if isinstance(record[-1], dict) else {}
            logger.warning("Post photo extraction error: %s", str(error)[:1000])
            raise ValueError("Could not read this post's photos. The post may require sign-in or be restricted. "
                             "Use a public post or supply your exported cookies.txt in the app folder.")
        # gallery-dl Message.Url = 3. Directory/queue metadata is not media.
        if record[0] != 3 or len(record) < 3 or not isinstance(record[2], dict):
            continue
        image_url, metadata = record[1], record[2]
        if not isinstance(image_url, str):
            continue
        extension = str(metadata.get("extension", "")).lower()
        media_type = metadata.get("type")
        if extension not in IMAGE_EXTENSIONS or media_type in {"video", "animated_gif", "preview"}:
            continue
        if metadata.get("video_url") or metadata.get("audio_url"):
            continue
        validate_image_url(image_url)
        if image_url not in seen:
            photos.append({"url": image_url, "filename": metadata.get("filename", "")})
            seen.add(image_url)
    if len(photos) > MAX_IMAGES:
        raise ValueError(f"This post has more than {MAX_IMAGES} photos. Use a direct image URL for the photos you need.")
    if not photos:
        raise ValueError("No photos were found in this post. Video thumbnails are not downloaded as photos.")
    return photos


def _opener():
    cookies = http.cookiejar.MozillaCookieJar()
    cookies_file = find_cookies_file()
    if cookies_file:
        try:
            cookies.load(cookies_file, ignore_discard=True, ignore_expires=False)
        except (OSError, http.cookiejar.LoadError) as exc:
            logger.warning("Could not load image-download cookies: %s", exc)
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))


def _download_photo(opener, url: str, target: Path, deadline: float, remaining: int, referer: str) -> tuple[str, int, int, int]:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": referer,
                                                  "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"})
    size = 0
    try:
        with opener.open(request, timeout=REQUEST_TIMEOUT) as response, target.open("wb") as output:
            validate_image_url(response.geturl())
            media_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
            if media_type.startswith("text/") or media_type.startswith("video/") or media_type.startswith("audio/"):
                raise ValueError("This URL does not return an image. Paste a direct image URL or an X/Instagram post link.")
            content_length = response.headers.get("Content-Length")
            if content_length and content_length.isdigit() and int(content_length) > min(MAX_IMAGE_BYTES, remaining):
                raise ValueError("The image exceeds the 30 MB per-image or 200 MB per-post limit.")
            while chunk := response.read(64 * 1024):
                if time.monotonic() > deadline:
                    raise ValueError("Photo download timed out. Try downloading fewer photos.")
                size += len(chunk)
                if size > min(MAX_IMAGE_BYTES, remaining):
                    raise ValueError("The image exceeds the 30 MB per-image or 200 MB per-post limit.")
                output.write(chunk)
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(target) as image:
                width, height = image.size
                extension = FORMAT_EXTENSIONS.get(image.format)
                if not extension:
                    raise ValueError("This image format is not supported. Use JPEG, PNG, WebP, GIF, AVIF, BMP or TIFF.")
                image.verify()
        return extension, width, height, size
    except urllib.error.HTTPError as exc:
        logger.warning("Photo provider rejected download with HTTP %s", exc.code)
        exc.close()
        if exc.code in {401, 403}:
            raise ValueError("The photo provider blocked this download or requires sign-in. Try a public post or a fresh direct image URL.") from exc
        if exc.code == 429:
            raise ValueError("The photo provider is limiting downloads. Wait a few minutes and try again.") from exc
        raise ValueError(f"The photo provider returned HTTP {exc.code}. Check the link and try again.") from exc
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("The downloaded file is not a valid supported image, or the provider blocked the download.") from exc


def download_post_images(url: str, progress_callback=None) -> list[dict]:
    """Return original validated files; failures remove only this request's directory."""
    url = validate_image_url(url)
    deadline = time.monotonic() + JOB_TIMEOUT
    notify = progress_callback or (lambda percent, message: None)
    notify(5, "Reading images…")
    photos = _post_photo_urls(url) if urlparse(url).hostname.lower() in SOCIAL_HOSTS else [{"url": url, "filename": ""}]
    destination = get_downloads_dir() / "images" / uuid.uuid4().hex
    destination.mkdir(parents=True)
    completed = False
    try:
        opener = _opener()
        files = []
        total = 0
        for index, photo in enumerate(photos, 1):
            if time.monotonic() > deadline:
                raise ValueError("Photo download timed out. Try again or use a direct image URL.")
            notify(10 + int(80 * (index - 1) / len(photos)), f"Downloading image {index} of {len(photos)}…")
            partial = destination / f"image_{index:02d}.part"
            extension, width, height, size = _download_photo(opener, photo["url"], partial, deadline,
                                                           MAX_TOTAL_BYTES - total, url)
            total += size
            stem = photo.get("filename") or Path(unquote(urlparse(photo["url"]).path)).stem or "image"
            stem = re.sub(r"[^\w .()-]", "_", str(stem), flags=re.UNICODE).strip(" ._")[:80] or "image"
            filename = f"{index:02d}_{stem}.{extension}"
            saved = partial.with_name(filename)
            partial.rename(saved)
            files.append({"file_path": str(saved.resolve()), "filename": filename, "width": width, "height": height})
        notify(100, f"Downloaded {len(files)} image{'s' if len(files) != 1 else ''}.")
        completed = True
        return files
    finally:
        if not completed:
            shutil.rmtree(destination)
