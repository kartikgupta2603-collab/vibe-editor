import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_api():
    print("Testing API endpoints...")

    # 1. Settings
    res = client.get("/api/settings")
    assert res.status_code == 200, f"Settings error: {res.text}"
    print("  GET /api/settings OK")

    # 2. Templates
    res = client.get("/api/templates")
    assert res.status_code == 200
    tpls = res.json()
    assert len(tpls) >= 6
    print(f"  GET /api/templates OK ({len(tpls)} templates)")

    # 3. Probe
    test_video = str(BASE_DIR / "temp" / "test_16_9_with_audio.mp4")
    res = client.post("/api/video/probe", json={"file_path": test_video})
    assert res.status_code == 200, f"Probe error: {res.text}"
    data = res.json()
    assert data["resolution"] == "1920x1080"
    print("  POST /api/video/probe OK")

    # 4. AI analysis refuses to label a text-only request as audio analysis.
    res = client.post("/api/ai/analyze", json={
        "song_name": "KICK BACK",
        "anime_name": "Chainsaw Man",
        "duration": 90.0
    })
    assert res.status_code == 500
    assert "loaded video with readable audio" in res.json()["detail"]
    print("  POST /api/ai/analyze correctly rejects missing audio evidence")

    # 5. History
    res = client.get("/api/history")
    assert res.status_code == 200
    print("  GET /api/history OK")

    # 5b. AI Lyrics Endpoint
    res = client.post("/api/ai/lyrics", json={
        "song_name": "Guitar, Loneliness and Blue Planet",
        "anime_name": "Bocchi the Rock!",
        "start_time": 54.0,
        "end_time": 85.0
    })
    assert res.status_code == 500
    assert "readable source audio" in res.json()["detail"]
    print("  POST /api/ai/lyrics correctly rejects missing audio evidence")


    # 6. Export API with 16:9 Aspect Ratio
    tpl = client.get("/api/templates/cinematic").json()
    res = client.post("/api/export", json={
        "source_video": test_video,
        "start_time": 0.0,
        "end_time": 2.0,
        "series_text": "DAY 1 OF POSTING",
        "song_name": "KICK BACK",
        "anime_name": "Chainsaw Man",
        "day_number": 1,
        "caption": "Testing 16:9",
        "template": tpl,
        "aspect_ratio": "16:9"
    })
    assert res.status_code == 200
    task_id = res.json()["task_id"]
    status_res = client.get(f"/api/export/status/{task_id}")
    assert status_res.status_code == 200
    print("  POST /api/export (16:9) OK")

    # 6b. Download & Media endpoints
    res = client.get(f"/api/media/download?path={test_video}")
    assert res.status_code == 200
    print("  GET /api/media/download OK")

    # 6c. Open folder endpoint
    res = client.post("/api/system/open-folder", json={"path": test_video})
    assert res.status_code == 200
    print("  POST /api/system/open-folder OK")

    # 7. Static files
    res = client.get("/")
    assert res.status_code == 200
    assert "REEL" in res.text
    print("  GET / (Static HTML UI) OK")

    print("\n=== ALL API ENDPOINTS VERIFIED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_api()
