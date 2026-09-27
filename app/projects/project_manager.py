import json
import os
import shutil
import tempfile
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

PROJECTS_DIR = Path(__file__).resolve().parent.parent.parent / "projects"
HISTORY_FILE = PROJECTS_DIR / "history.json"


def atomic_write_json(file_path: Path, data: Any, indent: int = 2) -> None:
    """Safely and atomically writes JSON to disk using a temporary file and atomic replace."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = file_path.parent
    with tempfile.NamedTemporaryFile("w", dir=str(temp_dir), delete=False, encoding="utf-8") as tf:
        json.dump(data, tf, indent=indent, default=str)
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


class ProjectManager:
    def __init__(self, base_dir: Path = PROJECTS_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.history_file = self.base_dir / "history.json"
        if not self.history_file.exists():
            self._save_history([])

    def _load_history(self) -> List[Dict[str, Any]]:
        if not self.history_file.exists():
            return []
        try:
            with open(self.history_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
        except Exception as e:
            bak = self.history_file.with_suffix(".json.bak")
            if bak.exists():
                try:
                    with open(bak, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            return data
                except Exception:
                    pass
            print(f"[ProjectManager] Warning: could not parse history.json ({e}). Preserving existing file.")
            return []

    def _save_history(self, history: List[Dict[str, Any]]) -> None:
        # Create backup of prior valid history before writing
        if self.history_file.exists() and self.history_file.stat().st_size > 2:
            try:
                shutil.copy2(self.history_file, self.history_file.with_suffix(".json.bak"))
            except Exception:
                pass
        atomic_write_json(self.history_file, history)

    def get_history(self) -> List[Dict[str, Any]]:
        return self._load_history()

    def add_history_entry(
        self,
        day: int,
        song: str,
        anime: str,
        duration: float,
        template: str,
        export_path: str
    ) -> Dict[str, Any]:
        history = self._load_history()
        entry = {
            "id": f"hist_{int(time.time()*1000)}",
            "day": day,
            "song": song,
            "anime": anime,
            "duration": f"{round(duration, 1)}s",
            "template": template,
            "created_date": time.strftime("%Y-%m-%d %H:%M"),
            "export_location": export_path
        }
        history.insert(0, entry)
        self._save_history(history[:100]) # keep latest 100
        return entry

    def save_project(self, project_id: str, state: Dict[str, Any]) -> str:
        safe_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in project_id).lower()
        proj_dir = self.base_dir / safe_id
        proj_dir.mkdir(parents=True, exist_ok=True)
        
        proj_file = proj_dir / "project.json"
        atomic_write_json(proj_file, state)
        return str(proj_file)

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        safe_id = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in project_id).lower()
        proj_file = self.base_dir / safe_id / "project.json"
        if proj_file.exists():
            try:
                with open(proj_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    data["_id"] = safe_id
                    return data
            except Exception as e:
                print(f"[ProjectManager] Failed to read {proj_file}: {e}")
        return None

    def list_projects(self) -> List[Dict[str, Any]]:
        projects = []
        for p_dir in self.base_dir.iterdir():
            if p_dir.is_dir():
                p_file = p_dir / "project.json"
                if p_file.exists():
                    try:
                        with open(p_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            data["_id"] = p_dir.name
                            projects.append(data)
                    except Exception:
                        pass
        return projects

project_manager = ProjectManager()
