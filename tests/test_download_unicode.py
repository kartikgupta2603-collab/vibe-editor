"""Unicode diagnostics must never interrupt YouTube download retries."""
import io
import logging
from pathlib import Path

import pytest
import yt_dlp

from app.video import downloader


TITLE = "Anime \u0623\u063a\u0646\u064a\u0629 \U0001f525"
FILE_ERROR = f"[WinError 32] The process cannot access the file because it is being used by another process: '{TITLE}.part'"


@pytest.fixture
def download_setup(tmp_path, monkeypatch):
    monkeypatch.setattr(downloader, "get_downloads_dir", lambda: tmp_path)
    monkeypatch.setattr(downloader, "find_cookies_file", lambda: None)
    monkeypatch.setattr(downloader, "ensure_po_token_provider", lambda: False)
    monkeypatch.setattr(downloader, "PLAYER_CLIENT_STRATEGIES", [["default"], ["mweb"]])
    monkeypatch.setattr(downloader.YouTubeDownloader, "get_video_info", lambda _: {
        "title": TITLE, "song_name": TITLE, "anime_name": "Anime", "duration": 12, "height": 1080,
    })
    monkeypatch.setattr(downloader, "ensure_browser_compatible", lambda path, *args, **kwargs: path)
    task_id = "unicode-test"
    monkeypatch.setitem(downloader.DOWNLOAD_TASKS, task_id, {})
    return task_id


def test_unicode_download_error_does_not_interrupt_client_retry(download_setup, monkeypatch, caplog):
    attempts = []

    class FakeDownloader:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def download(self, urls):
            attempts.append(self.options)
            if len(attempts) == 1:
                raise OSError(FILE_ERROR)
            Path(self.options["outtmpl"].replace("%(ext)s", "mp4")).write_bytes(b"video")

    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeDownloader)
    output = io.BytesIO()
    strict_console = io.TextIOWrapper(output, encoding="cp1252", errors="strict")
    monkeypatch.setattr(downloader.sys, "stdout", strict_console)
    with caplog.at_level(logging.WARNING):
        result = downloader.YouTubeDownloader.download_video("https://youtu.be/example", download_setup)
    assert len(attempts) == 2
    assert result["title"] == TITLE
    assert result["song_name"] == TITLE
    assert TITLE in Path(result["file_path"]).name
    assert downloader.DOWNLOAD_TASKS[download_setup]["status"] == "completed"
    assert FILE_ERROR in caplog.text


def test_unicode_finalization_error_keeps_original_cause(download_setup, monkeypatch):
    class FakeDownloader:
        def __init__(self, options):
            self.options = options

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def download(self, urls):
            self.options["postprocessor_hooks"][0]({"status": "started", "postprocessor": "Merger"})
            raise OSError(FILE_ERROR)

    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeDownloader)
    strict_console = io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="strict")
    monkeypatch.setattr(downloader.sys, "stdout", strict_console)
    with pytest.raises(RuntimeError, match="finalization") as failure:
        downloader.YouTubeDownloader.download_video("https://youtu.be/example", download_setup)
    assert isinstance(failure.value.__cause__, OSError)
    assert FILE_ERROR in str(failure.value.__cause__)
    assert "WinError 32" in str(failure.value)


def test_cli_fallback_uses_utf8_and_preserves_unicode_title(download_setup, monkeypatch):
    attempts = []
    cli_calls = []

    class FailedPythonDownloader:
        def __init__(self, options):
            attempts.append(options)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def download(self, urls):
            raise OSError(FILE_ERROR)

    class SuccessfulCli:
        returncode = 0
        stdout = []

        def __init__(self, command, **options):
            cli_calls.append(options)
            Path(command[command.index("-o") + 1].replace("%(ext)s", "mp4")).write_bytes(b"video")

        def wait(self):
            return 0

    monkeypatch.setattr(yt_dlp, "YoutubeDL", FailedPythonDownloader)
    monkeypatch.setattr(downloader.subprocess, "Popen", SuccessfulCli)
    monkeypatch.setattr(downloader.sys, "stdout", io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="strict"))
    result = downloader.YouTubeDownloader.download_video("https://youtu.be/example", download_setup)
    assert len(attempts) == 2
    assert len(cli_calls) == 1
    assert cli_calls[0]["env"]["PYTHONIOENCODING"] == "utf-8:backslashreplace"
    assert cli_calls[0]["encoding"] == "utf-8"
    assert result["title"] == TITLE
    assert TITLE in Path(result["file_path"]).name
