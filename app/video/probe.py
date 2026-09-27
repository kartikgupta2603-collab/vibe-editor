import json
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert FFprobe's optional / N/A numeric fields without failing a probe."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

class VideoInfo:
    def __init__(self, data: Dict[str, Any], file_path: str):
        self.file_path = file_path
        self.filename = Path(file_path).name
        self.format = data.get("format", {})
        self.streams = data.get("streams", [])
        
        # Exclude audio cover art / attached pictures from primary video stream
        self.video_stream = next((s for s in self.streams if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic", 0)), None)
        self.audio_stream = next((s for s in self.streams if s.get("codec_type") == "audio"), None)
        
        # Duration
        dur_str = self.format.get("duration") or (self.video_stream.get("duration") if self.video_stream else None)
        self.duration = _safe_float(dur_str)
        
        # Dimensions & Aspect Ratio
        self.width = _safe_int(self.video_stream.get("width")) if self.video_stream else 0
        self.height = _safe_int(self.video_stream.get("height")) if self.video_stream else 0
        
        if self.height > 0:
            ratio = self.width / self.height
            if abs(ratio - 16/9) < 0.05:
                self.aspect_ratio = "16:9"
            elif abs(ratio - 9/16) < 0.05:
                self.aspect_ratio = "9:16"
            elif abs(ratio - 1.0) < 0.05:
                self.aspect_ratio = "1:1"
            elif abs(ratio - 4/3) < 0.05:
                self.aspect_ratio = "4:3"
            else:
                self.aspect_ratio = f"{self.width}:{self.height}"
        else:
            self.aspect_ratio = "unknown"
            
        # FPS
        self.fps = 30.0
        if self.video_stream:
            r_frame_rate = self.video_stream.get("r_frame_rate", "30/1")
            if "/" in r_frame_rate:
                num, den = r_frame_rate.split("/")
                denominator = _safe_float(den)
                if denominator > 0:
                    self.fps = round(_safe_float(num) / denominator, 2)
            else:
                self.fps = _safe_float(r_frame_rate, 30.0)
                    
        # Video Codec
        self.video_codec = self.video_stream.get("codec_name", "none") if self.video_stream else "none"

        # Audio
        self.has_audio = self.audio_stream is not None
        self.audio_codec = self.audio_stream.get("codec_name", "none") if self.has_audio else "none"
        self.audio_channels = _safe_int(self.audio_stream.get("channels")) if self.has_audio else 0
        self.audio_sample_rate = _safe_int(self.audio_stream.get("sample_rate")) if self.has_audio else 0

        # Letterbox & Active Content Detection
        self.crop = detect_letterbox_crop(file_path, self.width, self.height, self.duration)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "filename": self.filename,
            "filepath": str(Path(self.file_path).resolve()),
            "duration": round(self.duration, 2),
            "width": self.width,
            "height": self.height,
            "resolution": f"{self.width}x{self.height}",
            "aspect_ratio": self.aspect_ratio,
            "fps": self.fps,
            "video_codec": self.video_codec,
            "has_audio": self.has_audio,
            "audio_codec": self.audio_codec,
            "audio_channels": self.audio_channels,
            "audio_sample_rate": self.audio_sample_rate,
            "crop_x": self.crop["crop_x"],
            "crop_y": self.crop["crop_y"],
            "crop_w": self.crop["crop_w"],
            "crop_h": self.crop["crop_h"],
            "has_letterbox": self.crop["has_letterbox"]
        }


def detect_letterbox_crop(file_path: str, width: int, height: int, duration: float) -> Dict[str, Any]:
    """Ensures video is always preserved in its full, proper length and dimensions without cropping."""
    return {"crop_x": 0, "crop_y": 0, "crop_w": width, "crop_h": height, "has_letterbox": False}



def probe_video(file_path: str) -> VideoInfo:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {file_path}")
        
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path)
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", errors="replace")
        data = json.loads(result.stdout)
        return VideoInfo(data, str(path))
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"FFprobe failed to inspect file: {e.stderr or e}")
    except json.JSONDecodeError:
        raise RuntimeError("Failed to parse FFprobe output.")
