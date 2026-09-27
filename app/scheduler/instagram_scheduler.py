"""
Instagram Reel Scheduler — Queue Manager & Background Poster

Manages a persistent JSON-based queue of scheduled Instagram reel posts.
A background thread checks the queue every 30 seconds and posts reels
whose scheduled time has arrived via the Instagram Graph API.

Queue items are stored in projects/schedule_queue.json with no limit.
"""

import json
import time
import threading
import uuid
import os
import tempfile
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import httpx

logger = logging.getLogger("scheduler")

SCHEDULE_DIR = Path(__file__).resolve().parent.parent.parent / "projects"
SCHEDULE_FILE = SCHEDULE_DIR / "schedule_queue.json"
SCHEDULE_LOCK = threading.Lock()

# ── Queue Persistence ────────────────────────────────────────────

def _load_queue() -> List[Dict[str, Any]]:
    """Load the schedule queue from disk."""
    try:
        if SCHEDULE_FILE.exists():
            with open(SCHEDULE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning(f"Failed to load schedule queue: {e}")
    return []


def _save_queue(queue: List[Dict[str, Any]]) -> None:
    """Save the schedule queue to disk atomically."""
    SCHEDULE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=str(SCHEDULE_DIR), delete=False, encoding="utf-8") as tf:
        json.dump(queue, tf, indent=2, default=str)
        temp_path = tf.name
    try:
        os.replace(temp_path, str(SCHEDULE_FILE))
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise


# ── Public Queue API ─────────────────────────────────────────────

def list_scheduled() -> List[Dict[str, Any]]:
    """Return all scheduled items (pending, posting, posted, failed)."""
    with SCHEDULE_LOCK:
        return _load_queue()


def _parse_scheduled_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except (ValueError, TypeError) as exc:
        raise ValueError("Scheduled time must be a valid ISO 8601 date and time.") from exc
    if parsed.tzinfo is None:
        raise ValueError("Scheduled time must include a timezone offset.")
    return parsed.astimezone(timezone.utc)


def add_to_schedule(
    file_path: str,
    scheduled_time: str,
    caption: str = "",
    hashtags: str = "",
    cover_timestamp: float = 1.0,
) -> Dict[str, Any]:
    """
    Add a reel to the posting schedule.

    Args:
        file_path: Absolute path to the exported MP4 reel.
        scheduled_time: ISO 8601 datetime string (e.g., "2026-09-20T14:30:00+05:30").
        caption: Instagram post caption text.
        hashtags: Space-separated hashtags (e.g., "#anime #reel").
        cover_timestamp: Seconds into the video for cover frame.

    Returns:
        The created schedule entry dict.
    """
    _parse_scheduled_time(scheduled_time)
    p = Path(file_path).resolve()
    if not p.exists():
        raise FileNotFoundError(f"Reel file not found: {file_path}")
    if not p.suffix.lower() == ".mp4":
        raise ValueError("Only MP4 files can be scheduled for Instagram posting.")

    entry = {
        "id": f"sched_{uuid.uuid4().hex[:12]}",
        "file_path": str(p),
        "file_name": p.name,
        "file_size_mb": round(p.stat().st_size / (1024 * 1024), 2),
        "caption": caption.strip(),
        "hashtags": hashtags.strip(),
        "cover_timestamp": cover_timestamp,
        "scheduled_time": scheduled_time,
        "status": "pending",        # pending | posting | posted | failed | cancelled
        "error_message": "",
        "ig_media_id": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "posted_at": "",
    }

    with SCHEDULE_LOCK:
        queue = _load_queue()
        queue.append(entry)
        _save_queue(queue)

    logger.info(f"Scheduled reel: {entry['file_name']} for {scheduled_time}")
    return entry


def update_schedule_item(item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update fields of an existing schedule item. Returns the updated item or None."""
    if "scheduled_time" in updates:
        _parse_scheduled_time(updates["scheduled_time"])
    with SCHEDULE_LOCK:
        queue = _load_queue()
        for item in queue:
            if item["id"] == item_id:
                allowed_fields = {"caption", "hashtags", "scheduled_time", "cover_timestamp"}
                for key, value in updates.items():
                    if key in allowed_fields:
                        item[key] = value
                _save_queue(queue)
                return item
    return None


def cancel_schedule_item(item_id: str) -> Optional[Dict[str, Any]]:
    """Cancel a pending schedule item. Returns the cancelled item or None."""
    with SCHEDULE_LOCK:
        queue = _load_queue()
        for item in queue:
            if item["id"] == item_id and item["status"] in ("pending", "failed"):
                item["status"] = "cancelled"
                _save_queue(queue)
                return item
    return None


def delete_schedule_item(item_id: str) -> bool:
    """Permanently remove a schedule item from the queue."""
    with SCHEDULE_LOCK:
        queue = _load_queue()
        original_len = len(queue)
        queue = [item for item in queue if item["id"] != item_id]
        if len(queue) < original_len:
            _save_queue(queue)
            return True
    return False


def retry_schedule_item(item_id: str) -> Optional[Dict[str, Any]]:
    """Reset a failed/cancelled item back to pending so it gets retried."""
    with SCHEDULE_LOCK:
        queue = _load_queue()
        for item in queue:
            if item["id"] == item_id and item["status"] in ("failed", "cancelled"):
                if item.get("recovery_required"):
                    raise ValueError("Check Instagram before rescheduling this interrupted post; its previous publish result cannot be verified.")
                item["status"] = "pending"
                item["error_message"] = ""
                _save_queue(queue)
                return item
    return None


def get_queue_stats() -> Dict[str, int]:
    """Return counts by status."""
    queue = _load_queue()
    stats = {"pending": 0, "posting": 0, "posted": 0, "failed": 0, "cancelled": 0, "total": len(queue)}
    for item in queue:
        status = item.get("status", "pending")
        if status in stats:
            stats[status] += 1
    return stats


# ── Instagram Graph API Integration ──────────────────────────────

def _get_ig_credentials() -> tuple:
    """Get Instagram access token and user ID from settings."""
    from app.config.settings import get_settings
    s = get_settings()
    token = getattr(s, "instagram_access_token", "")
    user_id = getattr(s, "instagram_user_id", "")
    return token, user_id


def _persist_post_state(item_id: str, **updates) -> None:
    """Persist container identity before any publishing request can be sent."""
    with SCHEDULE_LOCK:
        queue = _load_queue()
        for item in queue:
            if item["id"] == item_id:
                item.update(updates)
                _save_queue(queue)
                return
    raise RuntimeError("Scheduled item was removed; publishing was stopped.")


def _post_reel_to_instagram(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post a reel to Instagram using the Instagram Graph API.

    Flow:
    1. Upload video to a public URL or use a container creation approach
    2. Create a media container (IG_CONTAINER)
    3. Wait for container to be ready
    4. Publish the container

    NOTE: The Instagram Graph API requires:
    - A Facebook Business Page linked to an Instagram Professional account
    - A valid long-lived access token with instagram_content_publish scope
    - The video must be accessible via a public URL

    For local files, we serve them via the app's /api/media/stream endpoint.
    """
    token, user_id = _get_ig_credentials()

    if not token or not user_id:
        raise ValueError(
            "Instagram credentials not configured. "
            "Please set your Instagram Access Token and User ID in Settings → Instagram."
        )

    file_path = item["file_path"]
    if not item.get("ig_container_id") and not Path(file_path).exists():
        raise FileNotFoundError(f"Reel file no longer exists: {file_path}")

    # Build caption with hashtags
    caption_parts = []
    if item.get("caption"):
        caption_parts.append(item["caption"])
    if item.get("hashtags"):
        caption_parts.append(item["hashtags"])
    full_caption = "\n\n".join(caption_parts)

    from app.config.settings import get_settings
    s = get_settings()
    host = s.host
    port = s.port
    # The file must be accessible publicly. For local dev, Instagram cannot reach localhost.
    # Users need to either:
    # 1. Use a tunnel service (ngrok, cloudflare tunnel) and set INSTAGRAM_VIDEO_BASE_URL
    # 2. Upload to a public host
    base_url = getattr(s, "instagram_video_base_url", "")
    if not item.get("ig_container_id") and not base_url:
        raise ValueError(
            "Instagram Video Base URL not configured. "
            "Instagram cannot access localhost videos. "
            "Please set up a tunnel (ngrok/cloudflare) and configure the public URL in Settings → Instagram."
        )

    # Build the video URL
    import urllib.parse
    video_url = f"{base_url.rstrip('/')}/api/media/stream?path={urllib.parse.quote(file_path)}"

    api_base = "https://graph.instagram.com/v21.0"

    with httpx.Client(timeout=120.0) as client:
        # Reuse the persisted container on every retry. Creating a new one after
        # an ambiguous publish response could publish the same reel twice.
        container_id = item.get("ig_container_id")
        if not container_id:
            container_resp = client.post(
                f"{api_base}/{user_id}/media",
                params={
                    "media_type": "REELS",
                    "video_url": video_url,
                    "caption": full_caption,
                    "access_token": token,
                    "share_to_feed": "true",
                }
            )
            container_data = container_resp.json()
            if "id" not in container_data:
                error_msg = container_data.get("error", {}).get("message", str(container_data))
                raise RuntimeError(f"Failed to create media container: {error_msg}")
            container_id = container_data["id"]
            _persist_post_state(item["id"], ig_container_id=container_id)
            item["ig_container_id"] = container_id
            logger.info(f"Created IG container: {container_id}")

        # Step 2: Wait for container to be ready (poll status)
        max_attempts = 30  # 30 * 10s = 5 minutes max
        for attempt in range(max_attempts):
            if attempt:
                time.sleep(10)
            status_resp = client.get(
                f"{api_base}/{container_id}",
                params={
                    "fields": "status_code,status",
                    "access_token": token,
                }
            )
            status_data = status_resp.json()
            status_code = status_data.get("status_code", "")

            if status_code == "PUBLISHED":
                return {"media_id": item.get("ig_media_id", ""), "recovered": True}
            if status_code == "FINISHED":
                logger.info(f"Container {container_id} ready for publishing")
                break
            elif status_code in ("ERROR", "EXPIRED"):
                error_detail = status_data.get("status", "Unknown error during processing")
                raise RuntimeError(f"Instagram video processing failed: {error_detail}")
            else:
                logger.debug(f"Container {container_id} status: {status_code} (attempt {attempt + 1})")
        else:
            raise RuntimeError("Instagram video processing timed out after 5 minutes")

        # Step 3: Publish the container
        if _scheduler_stop_event.is_set():
            raise RuntimeError("Scheduler stopped before publishing. Retry to resume the saved container.")
        _persist_post_state(item["id"], publish_started=True)
        publish_resp = client.post(
            f"{api_base}/{user_id}/media_publish",
            params={
                "creation_id": container_id,
                "access_token": token,
            }
        )
        publish_data = publish_resp.json()
        if "id" not in publish_data:
            error_msg = publish_data.get("error", {}).get("message", str(publish_data))
            raise RuntimeError(f"Failed to publish reel: {error_msg}")

        media_id = publish_data["id"]
        logger.info(f"Reel published successfully: {media_id}")
        return {"media_id": media_id}


# ── Background Scheduler Thread ──────────────────────────────────

_scheduler_running = False
_scheduler_thread: Optional[threading.Thread] = None
_scheduler_stop_event = threading.Event()


def _scheduler_loop():
    """Background loop that checks queue every 30 seconds and posts due reels."""
    global _scheduler_running
    logger.info("Instagram scheduler background thread started")
    try:
        _recover_interrupted_items()
    except Exception:
        logger.exception("Could not recover interrupted Instagram posts")
        _scheduler_running = False
        return

    while _scheduler_running:
        try:
            _process_due_items()
        except Exception as e:
            logger.error(f"Scheduler loop error: {e}")

        # Sleep in small increments so we can stop quickly
        for _ in range(30):
            if not _scheduler_running:
                break
            time.sleep(1)

    logger.info("Instagram scheduler background thread stopped")


def _process_due_items():
    """Find and post any items whose scheduled_time has passed."""
    now = datetime.now(timezone.utc)

    with SCHEDULE_LOCK:
        queue = _load_queue()
        items_to_post = []
        changed = False

        for item in queue:
            if item["status"] != "pending":
                continue

            try:
                sched_utc = _parse_scheduled_time(item["scheduled_time"])

                if sched_utc <= now:
                    items_to_post.append(item)
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid scheduled_time for {item['id']}: {e}")
                item["status"] = "failed"
                item["error_message"] = f"Invalid scheduled time format: {e}"
                changed = True

        if changed:
            _save_queue(queue)

    # Post items outside the lock to avoid blocking queue operations
    for item in items_to_post:
        if _scheduler_stop_event.is_set():
            break
        # Claim each item immediately before work so later items remain
        # cancellable while the current video's container is processing.
        with SCHEDULE_LOCK:
            queue = _load_queue()
            current = next((q for q in queue if q["id"] == item["id"]), None)
            if current is None or current["status"] != "pending":
                continue
            if _parse_scheduled_time(current["scheduled_time"]) > datetime.now(timezone.utc):
                continue
            current["status"] = "posting"
            _save_queue(queue)
            item = dict(current)
        _post_single_item(item)


def _recover_interrupted_items() -> None:
    """Resume known containers; leave ambiguous legacy posts for manual review."""
    with SCHEDULE_LOCK:
        queue = _load_queue()
        changed = False
        for item in queue:
            if item.get("status") != "posting":
                continue
            changed = True
            if item.get("ig_container_id"):
                item["status"] = "pending"
                item["error_message"] = "Checking interrupted Instagram container before resuming."
            else:
                item["status"] = "failed"
                item["recovery_required"] = True
                item["error_message"] = (
                    "Posting was interrupted without a saved Instagram container. "
                    "Check your Instagram account before creating a new schedule to avoid duplicates."
                )
        if changed:
            _save_queue(queue)


def _post_single_item(item: Dict[str, Any]):
    """Post a single reel to Instagram and update its status."""
    item_id = item["id"]
    logger.info(f"Posting scheduled reel: {item['file_name']} (ID: {item_id})")

    try:
        result = _post_reel_to_instagram(item)
        with SCHEDULE_LOCK:
            queue = _load_queue()
            for q_item in queue:
                if q_item["id"] == item_id:
                    q_item["status"] = "posted"
                    q_item["ig_media_id"] = result.get("media_id", "")
                    q_item["posted_at"] = datetime.now(timezone.utc).isoformat()
                    q_item["error_message"] = ""
                    break
            _save_queue(queue)
        logger.info(f"Successfully posted reel: {item['file_name']}")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to post reel {item['file_name']}: {error_msg}")
        with SCHEDULE_LOCK:
            queue = _load_queue()
            for q_item in queue:
                if q_item["id"] == item_id:
                    q_item["status"] = "failed"
                    q_item["error_message"] = error_msg
                    break
            _save_queue(queue)


def start_scheduler():
    """Start the background scheduler thread."""
    global _scheduler_running, _scheduler_thread

    if _scheduler_running:
        return
    if _scheduler_thread and _scheduler_thread.is_alive():
        raise RuntimeError("The previous Instagram operation is still finishing. Try again shortly.")

    _scheduler_running = True
    _scheduler_stop_event.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, daemon=True, name="ig-scheduler")
    _scheduler_thread.start()
    logger.info("Instagram scheduler started")


def stop_scheduler():
    """Stop the background scheduler thread."""
    global _scheduler_running, _scheduler_thread

    _scheduler_running = False
    _scheduler_stop_event.set()
    if _scheduler_thread and _scheduler_thread.is_alive():
        _scheduler_thread.join(timeout=5)
    if not _scheduler_thread or not _scheduler_thread.is_alive():
        _scheduler_thread = None
    logger.info("Instagram scheduler stopped")


def is_scheduler_running() -> bool:
    """Check if the scheduler background thread is active."""
    return _scheduler_running and _scheduler_thread is not None and _scheduler_thread.is_alive()


# ── List Exported Reels ──────────────────────────────────────────

def list_exported_reels() -> List[Dict[str, Any]]:
    """Scan the exports directory for available MP4 reels."""
    from app.config.settings import get_settings
    s = get_settings()
    exports_dir = Path(s.default_export_dir)

    if not exports_dir.exists():
        return []

    reels = []
    for mp4 in sorted(exports_dir.glob("*.mp4"), key=lambda f: f.stat().st_mtime, reverse=True):
        stat = mp4.stat()
        reels.append({
            "file_path": str(mp4.resolve()),
            "file_name": mp4.name,
            "file_size_mb": round(stat.st_size / (1024 * 1024), 2),
            "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
        })

    return reels
