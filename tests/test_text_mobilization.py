import sys
from pathlib import Path
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.video.renderer import renderer
from app.templates.template_manager import template_manager

def test_custom_text_overlay():
    print("Testing custom text mobilization in renderer...")
    temp_dir = BASE_DIR / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    out_png = str(temp_dir / "test_custom_text_overlay.png")

    tpl = template_manager.get_template("cinematic")
    # Provide custom positions and sizes
    tpl["series_text"] = {"x": 540, "y": 250, "size": 42}
    tpl["song_title"] = {"x": 540, "y": 1400, "size": 60}
    tpl["anime_name"] = {"x": 540, "y": 1480, "size": 36}

    result = renderer.create_text_overlay_image(
        canvas_width=1080,
        canvas_height=1920,
        series_text="DAY 1 OF POSTING\nTHE BEST ANIME SONGS",
        song_name="CINDERELLA",
        anime_name="KOMI CAN'T COMMUNICATE",
        caption="",
        template=tpl,
        output_png_path=out_png
    )

    assert Path(result).exists(), "Overlay PNG was not created"
    img = Image.open(result)
    assert img.size == (1080, 1920), f"Expected 1080x1920, got {img.size}"
    print("  Custom text overlay 1080x1920 generated successfully!")

if __name__ == "__main__":
    test_custom_text_overlay()
