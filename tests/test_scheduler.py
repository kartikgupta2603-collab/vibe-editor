import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_scheduler_api():
    print("Testing Instagram Scheduler API...")

    # 1. Stats endpoint
    res = client.get("/api/schedule/stats")
    assert res.status_code == 200, f"Stats error: {res.text}"
    stats = res.json()
    assert "pending" in stats
    assert "posted" in stats
    assert "scheduler_running" in stats
    print(f"  GET /api/schedule/stats OK (running={stats['scheduler_running']})")

    # 2. Exports listing
    res = client.get("/api/schedule/exports")
    assert res.status_code == 200, f"Exports error: {res.text}"
    exports = res.json()
    assert isinstance(exports, list)
    print(f"  GET /api/schedule/exports OK ({len(exports)} exported reels found)")

    # 3. Add to schedule
    test_video = str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4")
    future_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    add_payload = {
        "file_path": test_video,
        "scheduled_time": future_time,
        "caption": "Test anime reel caption #anime #reels",
        "hashtags": "#anime #amv",
        "cover_timestamp": 1.5
    }
    res = client.post("/api/schedule", json=add_payload)
    assert res.status_code == 200, f"Add schedule error: {res.text}"
    item = res.json()
    assert item["id"].startswith("sched_")
    assert item["status"] == "pending"
    assert item["caption"] == "Test anime reel caption #anime #reels"
    item_id = item["id"]
    print(f"  POST /api/schedule OK (created item ID: {item_id})")

    # 4. List schedule
    res = client.get("/api/schedule")
    assert res.status_code == 200
    queue = res.json()
    assert any(q["id"] == item_id for q in queue)
    print(f"  GET /api/schedule OK ({len(queue)} items in queue)")

    # 5. Update schedule item
    new_future_time = (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat()
    res = client.put(f"/api/schedule/{item_id}", json={
        "caption": "Updated caption for anime reel",
        "scheduled_time": new_future_time
    })
    assert res.status_code == 200, f"Update error: {res.text}"
    updated = res.json()
    assert updated["caption"] == "Updated caption for anime reel"
    print("  PUT /api/schedule/{id} OK")

    # 6. Cancel schedule item
    res = client.post(f"/api/schedule/{item_id}/cancel")
    assert res.status_code == 200, f"Cancel error: {res.text}"
    cancelled = res.json()
    assert cancelled["status"] == "cancelled"
    print("  POST /api/schedule/{id}/cancel OK")

    # 7. Retry schedule item
    res = client.post(f"/api/schedule/{item_id}/retry")
    assert res.status_code == 200, f"Retry error: {res.text}"
    retried = res.json()
    assert retried["status"] == "pending"
    print("  POST /api/schedule/{id}/retry OK")

    # 8. Delete schedule item
    res = client.delete(f"/api/schedule/{item_id}")
    assert res.status_code == 200, f"Delete error: {res.text}"
    deleted = res.json()
    assert deleted["status"] == "deleted"
    print("  DELETE /api/schedule/{id} OK")

    # Verify deletion
    res = client.get("/api/schedule")
    queue_after = res.json()
    assert not any(q["id"] == item_id for q in queue_after)
    print("  Queue item successfully removed from disk")

    print("\nALL INSTAGRAM SCHEDULER TESTS PASSED!")

if __name__ == "__main__":
    test_scheduler_api()
