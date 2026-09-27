import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"

if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

def _resolve_gemini_key() -> str:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key and os.name == "nt":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as reg:
                for k in ["GEMINI_API_KEY", "GOOGLE_API_KEY"]:
                    try:
                        val, _ = winreg.QueryValueEx(reg, k)
                        if val and val.strip():
                            return val.strip()
                    except FileNotFoundError:
                        pass
        except Exception:
            pass
    return (key or "").strip()

class AppSettings(BaseModel):
    gemini_api_key: str = _resolve_gemini_key()
    port: int = int(os.getenv("PORT", "8000"))
    host: str = os.getenv("HOST", "127.0.0.1")
    default_export_dir: str = os.getenv("DEFAULT_EXPORT_DIR", str(BASE_DIR / "exports"))
    default_resolution: str = os.getenv("DEFAULT_RESOLUTION", "1080x1920")
    default_fps: int = int(os.getenv("DEFAULT_FPS", "30"))
    default_duration: int = int(os.getenv("DEFAULT_DURATION", "35"))
    default_template: str = os.getenv("DEFAULT_TEMPLATE", "cinematic")
    # Instagram Scheduler settings
    instagram_access_token: str = os.getenv("INSTAGRAM_ACCESS_TOKEN", "")
    instagram_user_id: str = os.getenv("INSTAGRAM_USER_ID", "")
    instagram_video_base_url: str = os.getenv("INSTAGRAM_VIDEO_BASE_URL", "")

settings = AppSettings()

def get_settings() -> AppSettings:
    return settings

def update_settings(new_settings: dict) -> AppSettings:
    global settings
    for key, value in new_settings.items():
        if hasattr(settings, key):
            setattr(settings, key, value)
    
    # Save back to .env
    lines = []
    lines.append(f"GEMINI_API_KEY={settings.gemini_api_key}\n")
    lines.append(f"PORT={settings.port}\n")
    lines.append(f"HOST={settings.host}\n")
    lines.append(f"DEFAULT_EXPORT_DIR={settings.default_export_dir}\n")
    lines.append(f"DEFAULT_RESOLUTION={settings.default_resolution}\n")
    lines.append(f"DEFAULT_FPS={settings.default_fps}\n")
    lines.append(f"DEFAULT_DURATION={settings.default_duration}\n")
    lines.append(f"DEFAULT_TEMPLATE={settings.default_template}\n")
    lines.append(f"INSTAGRAM_ACCESS_TOKEN={settings.instagram_access_token}\n")
    lines.append(f"INSTAGRAM_USER_ID={settings.instagram_user_id}\n")
    lines.append(f"INSTAGRAM_VIDEO_BASE_URL={settings.instagram_video_base_url}\n")

    
    with open(ENV_FILE, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    return settings
