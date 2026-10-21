"""Username fonts match the Studio picker in native and scene-blend exports."""
import asyncio
from pathlib import Path

import httpx
import pytest
from PIL import Image

import app.main as main
from app.video import renderer as renderer_module


@pytest.mark.parametrize("key,filename", [
    ("bahnschrift", "bahnschrift.ttf"), ("arial_black", "ariblk.ttf"),
    ("segoe", "segoeui.ttf"), ("twcen_condensed", "TCCEB.TTF"),
    ("cooper_black", "COOPBL.TTF"),
    ("oswald", "Oswald.ttf"), ("georgia", "georgia.ttf"),
    ("segoe_print", "segoepr.ttf"),
])
def test_selected_username_font_uses_the_expected_installed_face(monkeypatch, key, filename):
    loaded = []

    class Font:
        def get_variation_axes(self):
            return [{"name": b"Weight", "minimum": 300, "default": 400, "maximum": 700},
                    {"name": b"Width", "minimum": 75, "default": 100, "maximum": 100}]

        def set_variation_by_axes(self, values):
            self.variations = values

    chosen = Font()

    def load(path, size):
        loaded.append((path, size))
        return chosen

    monkeypatch.setattr(renderer_module.ImageFont, "truetype", load)
    assert renderer_module._watermark_font(key, 48) is chosen
    assert Path(loaded[0][0]).name == filename
    assert loaded[0][1] == 48
    if key == "bahnschrift":
        assert chosen.variations == [700, 100]
    elif key == "oswald":
        assert chosen.variations == [600, 100]


def test_unknown_username_font_uses_the_same_bahnschrift_default(monkeypatch):
    paths = []
    fallback = object()

    # Avoid varying a surrogate DejaVu font: exercise the fallback after the
    # known default file is unavailable rather than pretending it is variable.
    def unavailable_primary(path, size):
        paths.append(path)
        if str(path).lower().endswith("bahnschrift.ttf"):
            raise OSError("not installed")
        return fallback

    monkeypatch.setattr(renderer_module.ImageFont, "truetype", unavailable_primary)
    assert renderer_module._watermark_font("../../private.ttf", 30) is fallback
    assert Path(paths[0]).name == "bahnschrift.ttf"
    assert all("private" not in str(path) for path in paths)


def test_oswald_resolves_the_bundled_face_independently_of_windows_fonts(tmp_path, monkeypatch):
    monkeypatch.setenv("WINDIR", str(tmp_path))
    expected = Path(renderer_module.__file__).resolve().parent.parent / "static" / "fonts" / "Oswald.ttf"
    assert renderer_module.watermark_font_path("oswald") == expected


@pytest.mark.parametrize("style", ["clean", "scene_blend"])
def test_installed_username_fonts_produce_distinct_export_glyphs(tmp_path, style):
    keys = tuple(renderer_module._WATERMARK_FONT_FILES)
    if not all(renderer_module.watermark_font_path(key).is_file() for key in keys):
        pytest.skip("The Windows and bundled username font faces are not installed")
    masks = []
    for key in keys:
        cfg = {"enabled": True, "text": "@ReelMusic", "font": key, "size": 64,
               "x": 250, "y": 200, "style": style}
        if style == "scene_blend":
            mask = renderer_module._scene_username_mask(1080, 1080, cfg)
        else:
            output = tmp_path / f"{key}.png"
            renderer_module.ReelRenderer().create_text_overlay_image(
                1080, 1080, "", "", "", "",
                {"series_text": {"enabled": False}}, str(output), watermark=cfg,
            )
            with Image.open(output) as image:
                mask = image.getchannel("A")
        assert mask.getbbox() is not None
        masks.append(mask.tobytes())
    assert len(set(masks)) == len(keys)


def test_scene_username_keeps_its_rotated_orientation():
    cfg = {"text": "@REELMUSIC", "font": "segoe", "size": 40, "x": 300, "y": 200}
    horizontal = renderer_module._scene_username_mask(900, 900, cfg).getbbox()
    vertical = renderer_module._scene_username_mask(900, 900, {**cfg, "rotation": 90}).getbbox()
    assert horizontal and vertical
    assert horizontal[2] - horizontal[0] > horizontal[3] - horizontal[1]
    assert vertical[3] - vertical[1] > vertical[2] - vertical[0]


def test_username_font_route_serves_only_known_installed_files(tmp_path, monkeypatch):
    fonts = tmp_path / "Fonts"
    fonts.mkdir()
    (fonts / "TCCEB.TTF").write_bytes(b"font-fixture")
    monkeypatch.setenv("WINDIR", str(tmp_path))
    async def check_route():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
            response = await client.get("/api/fonts/twcen_condensed")
            assert response.status_code == 200
            assert response.headers["content-type"] == "font/ttf"
            assert response.content == b"font-fixture"
            for key in ("unknown", "segoe", "..%5Cprivate.ttf", "C:%5Cprivate.ttf"):
                response = await client.get(f"/api/fonts/{key}")
                assert response.status_code == 404
    asyncio.run(check_route())
    assert renderer_module.watermark_font_path("../private.ttf") is None
