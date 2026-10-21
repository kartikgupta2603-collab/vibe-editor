"""Local photos keep their original bytes and enter the existing image import flow."""
import asyncio
import io
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app import main


@pytest.fixture
def image_upload(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "APP_ROOT", tmp_path)
    return TestClient(main.app), tmp_path


def image_bytes(image_format="PNG"):
    output = io.BytesIO()
    Image.new("RGB", (32, 24), "purple").save(output, format=image_format)
    return output.getvalue()


@pytest.mark.parametrize("image_format,extension", [
    ("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp"), ("GIF", "gif"),
    ("AVIF", "avif"), ("BMP", "bmp"), ("TIFF", "tiff"),
])
def test_supported_image_original_bytes_and_serving(image_upload, image_format, extension):
    client, root = image_upload
    content = image_bytes(image_format)
    response = client.post("/api/images/upload", files={"file": ("My photo.html", content, "text/html")})
    assert response.status_code == 200, response.text
    result = response.json()
    target = Path(result["file_path"])
    assert target.is_relative_to(root / "downloads" / "images")
    assert result == {"file_path": str(target), "filename": f"My photo.{extension}", "width": 32, "height": 24}
    assert target.read_bytes() == content
    assert client.get("/api/images/file", params={"path": str(target)}).content == content
    assert list(target.parent.iterdir()) == [target]


@pytest.mark.parametrize("filename", ["../../outside.exe", r"C:\Users\person\outside.exe", r"..\..\outside.exe"])
def test_filename_cannot_escape_and_extension_comes_from_image(image_upload, filename):
    client, root = image_upload
    result = client.post("/api/images/upload", files={"file": (filename, image_bytes())}).json()
    target = Path(result["file_path"])
    assert target.name == "outside.png"
    assert target.is_relative_to(root / "downloads" / "images")


@pytest.mark.parametrize("content", [b"", b"<html>not an image</html>", b"\x89PNG\r\n\x1a\ntruncated"])
def test_invalid_content_is_rejected_and_cleaned(image_upload, content):
    client, root = image_upload
    response = client.post("/api/images/upload", files={"file": ("photo.png", content, "image/png")})
    assert response.status_code == 400
    assert not list((root / "downloads" / "images").iterdir())


def test_oversize_is_rejected_and_cleaned(image_upload, monkeypatch):
    client, root = image_upload
    monkeypatch.setattr(main, "MAX_IMAGE_BYTES", 10)
    response = client.post("/api/images/upload", files={"file": ("photo.png", image_bytes())})
    assert response.status_code == 413
    assert not list((root / "downloads" / "images").iterdir())


def test_same_filename_never_overwrites_a_previous_upload(image_upload):
    client, _ = image_upload
    paths = [client.post("/api/images/upload", files={"file": ("photo.png", image_bytes())}).json()["file_path"] for _ in range(2)]
    assert paths[0] != paths[1]
    assert all(Path(path).is_file() for path in paths)


def test_read_failure_closes_upload_and_cleans_partial_file(image_upload):
    _, root = image_upload

    class BrokenUpload:
        closed = False

        async def read(self, size):
            raise OSError("test disk/read failure")

        async def close(self):
            self.closed = True

    upload = BrokenUpload()
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.api_upload_image(upload))
    assert error.value.status_code == 500
    assert upload.closed
    assert not list((root / "downloads" / "images").iterdir())
