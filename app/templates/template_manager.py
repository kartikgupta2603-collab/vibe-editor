import json
import os
import tempfile
from pathlib import Path
from typing import Dict, Any, List

TEMPLATES_DIR = Path(__file__).resolve().parent.parent.parent / "templates"

DEFAULT_CINEMATIC_TEMPLATE = {
    "id": "cinematic",
    "name": "Cinematic",
    "background": {"type": "blur", "blur": 35, "brightness": -0.25},
    "video": {"scale": 1.0, "curved_border": True, "corner_radius": 16},
    "series_text": {"x": 540, "y": 320, "size": 38, "color": "#ffffff"},
    "song_title": {"x": 540, "y": 1250, "size": 54, "color": "#fbbf24"},
    "anime_name": {"x": 540, "y": 1304, "size": 32, "color": "#94a3b8"},
    "subtitles": {"color": "#ffffff", "color_en": "#38bdf8"}
}


class TemplateManager:
    def __init__(self, templates_dir: Path = TEMPLATES_DIR):
        self.templates_dir = templates_dir
        self.templates_dir.mkdir(parents=True, exist_ok=True)

    def list_templates(self) -> List[Dict[str, Any]]:
        templates = []
        for file in self.templates_dir.glob("*.json"):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if "id" not in data:
                        data["id"] = file.stem
                    templates.append(data)
            except Exception as e:
                print(f"[TemplateManager] Error loading template {file.name}: {e}")
        return templates

    def get_template(self, template_id: str) -> Dict[str, Any]:
        file_path = self.templates_dir / f"{template_id}.json"
        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[TemplateManager] Corrupt template file {file_path.name}: {e}")

        # Fallback to cinematic.json on disk
        fallback = self.templates_dir / "cinematic.json"
        if fallback.exists():
            try:
                with open(fallback, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        # In-memory guaranteed default
        return dict(DEFAULT_CINEMATIC_TEMPLATE)

    def save_template(self, template_id: str, data: Dict[str, Any]) -> None:
        data["id"] = template_id
        file_path = self.templates_dir / f"{template_id}.json"
        temp_dir = self.templates_dir
        with tempfile.NamedTemporaryFile("w", dir=str(temp_dir), delete=False, encoding="utf-8") as tf:
            json.dump(data, tf, indent=2)
            temp_path = tf.name
        try:
            os.replace(temp_path, str(file_path))
        except Exception:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            raise

template_manager = TemplateManager()
