"""Twitter selection uses original media positions and never downloads siblings."""
from unittest.mock import patch
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from yt_dlp.extractor.twitter import TwitterIE

from app.main import app
from app.video.downloader import YouTubeDownloader, extract_twitter_videos

POST = "https://x.com/example/status/1234567890?s=20"


def media(identifier, kind="video"):
    return {
        "id": int(identifier), "id_str": str(identifier), "type": kind,
        "media_url_https": f"https://pbs.twimg.com/{identifier}.jpg",
        "video_info": {"duration_millis": 12000, "variants": []},
    }


@pytest.fixture
def twitter_status(monkeypatch):
    status = {
        "full_text": "Sample video post", "user": {"name": "Example"},
        "extended_entities": {"media": [media(11), media(12)]},
    }
    monkeypatch.setattr(TwitterIE, "_extract_status", lambda self, tweet_id: status)
    return status


def test_lists_all_videos_without_processing_formats(twitter_status):
    videos = extract_twitter_videos(POST)
    assert [v["index"] for v in videos] == [1, 2]
    assert videos[1]["url"].endswith("/video/2")
    assert videos[0]["duration"] == 12
    assert videos[0]["thumbnail"].startswith("https://pbs.twimg.com/11.jpg")
    # Both entries intentionally have no formats. Listing still succeeds.
    assert videos[1]["info"]["formats"] == []


def test_photo_preserves_original_video_position(twitter_status):
    twitter_status["extended_entities"]["media"].insert(0, media(10, "photo"))
    videos = extract_twitter_videos(POST)
    assert [v["index"] for v in videos] == [2, 3]
    assert [v["url"].rsplit("/", 1)[-1] for v in videos] == ["2", "3"]


def test_explicit_selection_returns_only_requested_video(twitter_status):
    videos = extract_twitter_videos(POST.split("?")[0] + "/video/2")
    assert len(videos) == 1
    assert videos[0]["info"]["id"] == "12"
    assert videos[0]["index"] == 2


def test_plain_multiple_video_post_requires_choice(twitter_status):
    with pytest.raises(ValueError, match="Choose one video"):
        YouTubeDownloader.get_video_info(POST)


def test_metadata_matches_selected_video(twitter_status):
    info = YouTubeDownloader.get_video_info(POST.split("?")[0] + "/video/2")
    assert info["video_id"] == "12"
    assert info["source_url"].endswith("/video/2")


def test_single_video_after_photo_uses_correct_url(twitter_status):
    twitter_status["extended_entities"]["media"] = [media(10, "photo"), media(12)]
    info = YouTubeDownloader.get_video_info(POST)
    assert info["source_url"].endswith("/video/2")


def test_download_engine_uses_selected_metadata_url(tmp_path):
    from app.video import downloader as module

    requested = []
    options_used = []

    class FakeYDL:
        def __init__(self, opts):
            assert opts["noplaylist"] is True
            options_used.append(opts)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def download(self, urls):
            requested.extend(urls)
            Path(options_used[0]["outtmpl"].replace("%(ext)s", "mp4")).write_bytes(b"video")

    info = {
        "title": "Selected", "video_id": "12",
        "source_url": POST.split("?")[0] + "/video/2",
    }
    module.DOWNLOAD_TASKS["choice-test"] = {}
    try:
        (tmp_path / "selected_studio.mp4").write_bytes(b"old-quality" * 20000)
        with patch.object(YouTubeDownloader, "get_video_info", return_value=info), \
             patch.object(module, "get_downloads_dir", return_value=tmp_path), \
             patch.object(module, "download_cache_stem", return_value="selected"), \
             patch.object(module, "ensure_browser_compatible", side_effect=lambda path, *args, **kwargs: path), \
             patch("yt_dlp.YoutubeDL", FakeYDL):
            YouTubeDownloader.download_video(POST, "choice-test")
        assert requested == [info["source_url"]]
        assert options_used[0]["outtmpl"].endswith("_twitter_best_v2.%(ext)s")
    finally:
        module.DOWNLOAD_TASKS.pop("choice-test", None)


def test_listing_api_returns_public_selection_fields(twitter_status):
    response = TestClient(app).post("/api/twitter/videos", json={"url": POST})
    assert response.status_code == 200
    assert len(response.json()["videos"]) == 2
    assert set(response.json()["videos"][0]) == {"index", "title", "duration", "thumbnail", "url"}


def test_listing_api_rejects_other_sites():
    response = TestClient(app).post("/api/twitter/videos", json={"url": "https://youtube.com/watch?v=123"})
    assert response.status_code == 400
    assert "Twitter/X" in response.json()["detail"]
