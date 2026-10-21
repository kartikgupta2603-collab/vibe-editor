import io
import json
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
import pytest

import app.main as main
import app.video.media_detection as detection


def social_result(records):
    return SimpleNamespace(returncode=0, stdout=json.dumps(records), stderr="")


@pytest.mark.parametrize("records, expected", [
    ([[3, "https://cdn/photo", {"extension": "jpg", "type": "photo"}]], "images"),
    ([[3, "https://cdn/video", {"extension": "mp4", "type": "video"}]], "video"),
    ([[3, "https://cdn/photo", {"extension": "jpg"}], [3, "https://cdn/video", {"video_url": "x", "extension": "jpg"}]], "video"),
])
def test_social_inspects_real_media(records, expected):
    with patch.object(detection.subprocess, "run", return_value=social_result(records)):
        assert detection._social_media_type("https://x.com/user/status/123") == expected


def test_thumbnail_is_not_an_image():
    with patch.object(detection.subprocess, "run", return_value=social_result([[3, "thumbnail.jpg", {"extension": "jpg", "type": "preview"}]])):
        with pytest.raises(ValueError, match="No downloadable"):
            detection._social_media_type("https://x.com/user/status/123")


def test_explicit_photo_wins_in_mixed_post():
    records = [[3, "a", {"extension": "jpg"}], [3, "b", {"extension": "mp4"}]]
    with patch.object(detection.subprocess, "run", return_value=social_result(records)):
        assert detection._social_media_type("https://x.com/user/status/123/photo/1") == "images"


def test_x_videos_contract_omits_internal_info():
    videos = [{"index": 2, "url": "https://x.com/u/status/1/video/2", "title": "Video", "duration": 3, "thumbnail": "", "info": {"secret": 1}}]
    with patch.object(detection, "_social_media_type", return_value="video"), patch.object(detection, "extract_twitter_videos", return_value=videos):
        result = detection.detect_url_media("https://x.com/u/status/1")
    assert result["media_type"] == "video"
    assert result["videos"][0]["index"] == 2
    assert "info" not in result["videos"][0]


def test_extensionless_image_uses_bounded_actual_bytes():
    data = io.BytesIO()
    Image.new("RGB", (30, 20)).save(data, format="PNG")
    class Response(io.BytesIO):
        headers = {"Content-Type": "application/octet-stream"}
        def geturl(self):
            return "https://example.com/media?id=3"
        def read(self, size=-1):
            assert size == 65536
            return super().read(size)
    opener = SimpleNamespace(open=lambda *args, **kwargs: Response(data.getvalue()))
    with patch.object(detection, "_opener", return_value=opener):
        assert detection.detect_url_media("https://example.com/media?id=3") == {"media_type": "images"}


def test_youtube_remains_video_without_probe():
    with patch.object(detection, "_opener", side_effect=AssertionError("Unexpected request")):
        assert detection.detect_url_media("https://youtu.be/abc") == {"media_type": "video"}


@pytest.mark.parametrize("url", ["", "file:///secret.jpg", "javascript:x", "https://user:pass@example.com/a", "https://x.com/profile"])
def test_invalid_url_rejected(url):
    with pytest.raises(ValueError):
        detection.detect_url_media(url)


def test_detect_endpoint_contract_and_error():
    client = TestClient(main.app)
    with patch.object(main, "detect_url_media", return_value={"media_type": "images"}):
        response = client.post("/api/media/detect", json={"url": "https://example.com/a"})
        assert response.status_code == 200
        assert response.json() == {"media_type": "images"}
    with patch.object(main, "detect_url_media", side_effect=ValueError("Use a public post")):
        response = client.post("/api/media/detect", json={"url": "https://example.com/a"})
        assert response.status_code == 400
        assert response.json()["detail"] == "Use a public post"
    with patch.object(main, "detect_url_media", side_effect=RuntimeError("Provider unavailable")):
        response = client.post("/api/media/detect", json={"url": "https://example.com/a"})
        assert response.status_code == 400
        assert "Provider unavailable" in response.json()["detail"]
