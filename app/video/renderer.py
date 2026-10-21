import logging
import math
import re
import os
import sys
import copy
import base64
import binascii
import io
import subprocess
import tempfile
import time
import threading
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.video.probe import probe_video
from app.video.audio_enhance import enhancement_filters
from app.video.color_profiles import custom_rgb_filters
from app.ai.gemini_client import compute_word_timings

logger = logging.getLogger(__name__)

# One visible, smooth default that matches the Studio preview.
HOOK_FADE_DURATION = 0.60
MAX_SONG_WINDOW_SCALE = 1.40
MAX_SONG_WINDOW_INSET = 180
USERNAME_SCENE_BLEND_STRENGTH = 0.70


def _music_audio_filter(input_index: int, music: Dict[str, Any], duration: float,
                        original_audio: Optional[str] = None) -> str:
    """Play the chosen soundtrack interval on the reel's zero-based clock."""
    selected_duration = float(music["end"]) - float(music["start"])
    filters = [
        "aresample=44100", "aformat=channel_layouts=stereo",
        f"atrim=duration={selected_duration:.6f}", "asetpts=PTS-STARTPTS",
    ]
    if music.get("loop") and selected_duration < duration:
        # Loop the selected samples, never the entire imported song.
        filters.append(f"aloop=loop=-1:size={max(1, round(selected_duration * 44100))}")
    filters.extend([
        f"apad=whole_dur={duration:.6f}", f"atrim=duration={duration:.6f}",
        f"volume={float(music.get('volume', 1)):.6f}",
    ])
    audible_duration = duration if music.get("loop") else min(selected_duration, duration)
    for kind in ("in", "out"):
        fade = min(max(0.0, float(music.get(f"fade_{kind}", 0))), audible_duration / 2)
        if fade > 0:
            start = 0 if kind == "in" else max(0, audible_duration - fade)
            filters.append(f"afade=t={kind}:st={start:.6f}:d={fade:.6f}")
    chain = f"[{input_index}:a]{','.join(filters)}[a_music]"
    if original_audio is None:
        return chain + ";[a_music]alimiter=limit=0.95:level=0:latency=1[a_mix]"
    return (
        chain + f";{original_audio}volume={float(music.get('original_volume', 0)):.6f},"
        f"apad=whole_dur={duration:.6f},atrim=duration={duration:.6f}[a_original];"
        "[a_original][a_music]amix=inputs=2:duration=longest:normalize=0,"
        "alimiter=limit=0.95:level=0:latency=1[a_mix]"
    )


def _cover_scale(src_w: int, src_h: int, target_w: int, target_h: int, zoom: float = 1.0) -> tuple:
    """Compute integer (w, h) that covers target_w x target_h while preserving aspect ratio.
    
    Equivalent to CSS object-fit: cover — scale the source so both dimensions
    are >= target, then crop. The zoom factor enlarges the result further.
    """
    if src_w <= 0 or src_h <= 0:
        return (target_w, target_h)
    scale_w = target_w / src_w
    scale_h = target_h / src_h
    scale = max(scale_w, scale_h) * zoom
    w = math.ceil(src_w * scale)
    h = math.ceil(src_h * scale)
    # Ensure even dimensions for FFmpeg
    if w % 2 != 0:
        w += 1
    if h % 2 != 0:
        h += 1
    return (w, h)


def _contain_geometry(src_w: int, src_h: int, canvas_w: int = 1080,
                      canvas_h: int = 1920, scale: float = 1.0,
                      vertical_offset: float = 0) -> tuple:
    """Fit the full source using Studio's logical coordinates before export scaling."""
    aspect = max(1, src_w) / max(1, src_h)
    factor = canvas_w / 1080.0
    logical_h = canvas_h / factor
    fit_width = min(1080, logical_h * aspect)
    width = max(2, math.floor(fit_width * scale / 2 + 0.5) * 2)
    height = max(2, math.floor(fit_width / aspect * scale / 2 + 0.5) * 2)
    width, height = round(width * factor), round(height * factor)
    return (width, height, (canvas_w - width) / 2,
            (canvas_h - height) / 2 + vertical_offset)


def _validated_hide_regions(value: Any) -> list[dict[str, float]]:
    """Validate canvas-normalized source cutouts before creating export files."""
    if not isinstance(value, list) or len(value) > 12:
        raise ValueError("Hide areas must be a list containing no more than 12 rectangles.")
    regions = []
    for index, region in enumerate(value):
        if not isinstance(region, dict):
            raise ValueError(f"Hide area {index + 1} must contain x, y, width and height.")
        numbers = {}
        for key in ("x", "y", "width", "height"):
            number = region.get(key)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
                raise ValueError(f"Hide area {index + 1}: {key} must be a finite number.")
            numbers[key] = float(number)
        x, y, width, height = (numbers[key] for key in ("x", "y", "width", "height"))
        if not (0 <= x < 1 and 0 <= y < 1 and 0 < width <= 1 and 0 < height <= 1):
            raise ValueError(f"Hide area {index + 1} must be within the canvas and have positive width and height.")
        # A rectangle dragged to the edge may extend beyond it; retain its
        # visible intersection, never modify the saved project object.
        regions.append({"x": x, "y": y, "width": min(width, 1 - x), "height": min(height, 1 - y)})
    return regions


def _visible_rounded_mask(frame_w: int, frame_h: int, frame_x: int, frame_y: int,
                          canvas_w: int, canvas_h: int, radius: int, inset: int = 0,
                          circular: bool = False, hide_regions: Optional[list] = None) -> Image.Image:
    """Mask the visible frame and cut source-only holes in canvas coordinates."""
    mask = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
    safe_inset = max(0, min(inset, min(canvas_w, canvas_h) // 2 - 1))
    left = max(safe_inset, frame_x)
    top = max(safe_inset, frame_y)
    right = min(canvas_w - safe_inset, frame_x + frame_w)
    bottom = min(canvas_h - safe_inset, frame_y + frame_h)
    visible_w = right - left
    visible_h = bottom - top
    if visible_w <= 0 or visible_h <= 0:
        return mask
    local_left = left - frame_x
    local_top = top - frame_y
    draw = ImageDraw.Draw(mask)
    bounds = [local_left, local_top, local_left + visible_w, local_top + visible_h]
    if circular:
        draw.ellipse(bounds, fill=(255, 255, 255, 255))
    else:
        effective_radius = max(0, min(radius, visible_w // 2, visible_h // 2))
        draw.rounded_rectangle(bounds, radius=effective_radius, fill=(255, 255, 255, 255))
    for region in hide_regions or []:
        cut_left = max(0, math.floor(region["x"] * canvas_w - frame_x))
        cut_top = max(0, math.floor(region["y"] * canvas_h - frame_y))
        cut_right = min(frame_w, math.ceil((region["x"] + region["width"]) * canvas_w - frame_x))
        cut_bottom = min(frame_h, math.ceil((region["y"] + region["height"]) * canvas_h - frame_y))
        if cut_right > cut_left and cut_bottom > cut_top:
            mask.paste((0, 0, 0, 0), (cut_left, cut_top, cut_right, cut_bottom))
    return mask


def _scale_reel_layout(value: Any, factor: float) -> Any:
    """Scale saved 1080-wide Studio coordinates for a higher-resolution render."""
    if factor == 1.0:
        return copy.deepcopy(value)
    if isinstance(value, dict):
        return {
            key: (round(float(item) * factor) if key in {"x", "y", "size", "vertical_offset", "corner_radius"}
                  and isinstance(item, (int, float)) else _scale_reel_layout(item, factor))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_scale_reel_layout(item, factor) for item in value]
    return copy.deepcopy(value)


def _decode_studio_png(encoded: Any, canvas_width: int, canvas_height: int, label: str) -> Image.Image:
    """Decode a strictly sized Studio PNG data URL for a renderer overlay."""
    prefix = "data:image/png;base64,"
    if not isinstance(encoded, str) or not encoded.startswith(prefix):
        raise ValueError(f"{label} must be a PNG image. Refresh Studio and export again.")
    if len(encoded) > 8 * 1024 * 1024:
        raise ValueError(f"{label} exceeds the 8 MB limit. Reduce text and export again.")
    try:
        raw = base64.b64decode(encoded[len(prefix):], validate=True)
        with Image.open(io.BytesIO(raw)) as supplied:
            if supplied.format != "PNG" or supplied.size != (canvas_width, canvas_height):
                raise ValueError(f"{label} dimensions or format do not match the export. Refresh Studio and export again.")
            supplied.load()
            return supplied.convert("RGBA")
    except (binascii.Error, OSError, Image.DecompressionBombError) as exc:
        raise ValueError(f"{label} could not be read. Refresh Studio and export again.") from exc


_WATERMARK_FONT_FILES = {
    "bahnschrift": ("bahnschrift.ttf", "arialbd.ttf"),
    "arial_black": ("ariblk.ttf", "arialbd.ttf"),
    "segoe": ("segoeui.ttf", "arial.ttf"),
    "twcen_condensed": ("TCCEB.TTF", "arialnb.ttf", "arialbd.ttf"),
    "cooper_black": ("COOPBL.TTF", "ariblk.ttf", "arialbd.ttf"),
    "oswald": ("Oswald.ttf", "arialnb.ttf", "arialbd.ttf"),
    "georgia": ("georgia.ttf", "times.ttf"),
    "segoe_print": ("segoepr.ttf", "segoeui.ttf", "arial.ttf"),
}


def watermark_font_path(font_key: str) -> Optional[Path]:
    """Resolve only a known username font, never a caller-supplied file path."""
    if font_key not in _WATERMARK_FONT_FILES:
        return None
    if font_key == "oswald":
        return Path(__file__).resolve().parent.parent / "static" / "fonts" / "Oswald.ttf"
    return Path(os.environ.get("WINDIR", "C:\\Windows")) / "Fonts" / _WATERMARK_FONT_FILES[font_key][0]


def _watermark_font(font_key: Any, size: int) -> ImageFont.FreeTypeFont:
    """Use the same installed family and weight as the Studio username picker."""
    key = font_key if isinstance(font_key, str) and font_key in _WATERMARK_FONT_FILES else "bahnschrift"
    fonts_dir = Path(os.environ.get("WINDIR", "C:\\Windows")) / "Fonts"
    candidates = [watermark_font_path(key)]
    candidates.extend(fonts_dir / name for name in _WATERMARK_FONT_FILES[key][1:])
    candidates.append("DejaVuSerif.ttf" if key == "georgia" else (
        "DejaVuSans.ttf" if key in {"segoe", "segoe_print"} else "DejaVuSans-Bold.ttf"
    ))
    for candidate in candidates:
        try:
            font = ImageFont.truetype(str(candidate), max(1, int(size)))
        except OSError:
            continue
        variable_weight = {"bahnschrift": 800, "oswald": 600}.get(key)
        if variable_weight and Path(candidate).name.lower() == _WATERMARK_FONT_FILES[key][0].lower():
            # Match the browser's requested variable weight within the face's
            # supported range (Bahnschrift clamps 800 to its maximum of 700).
            axes = font.get_variation_axes()
            font.set_variation_by_axes([
                min(axis["maximum"], max(axis["minimum"], variable_weight))
                if axis["name"] == b"Weight" else axis["default"]
                for axis in axes
            ])
        return font
    logger.warning("Username font %r and its fallback fonts could not be loaded", key)
    return ImageFont.load_default(size=max(1, int(size)))


def _scene_username_mask(width: int, height: int, watermark: Dict[str, Any]) -> Image.Image:
    """White glyph coverage; scene colors are blended per frame, never baked into PNG."""
    mask = Image.new("L", (width, height), 0)
    size = max(1, int(watermark.get("size", 28)))
    font = _watermark_font(watermark.get("font"), size)
    text = str(watermark.get("text", "")).strip().upper()
    x = float(watermark.get("x") if watermark.get("x") is not None else 35)
    y = float(watermark.get("y") if watermark.get("y") is not None else 45)
    draw = ImageDraw.Draw(mask)
    if watermark.get("rotation", 0) == 90:
        # Draw around the origin of a small tile, then rotate clockwise about (x,y).
        bounds = draw.textbbox((0, 0), text, font=font, anchor="lm")
        glyph = Image.new("L", (max(1, bounds[2] - bounds[0]), max(1, bounds[3] - bounds[1])), 0)
        ImageDraw.Draw(glyph).text((-bounds[0], -bounds[1]), text, font=font, fill=255, anchor="lm")
        glyph = glyph.transpose(Image.Transpose.ROTATE_270)
        mask.paste(glyph, (round(x - bounds[3]), round(y + bounds[0])))
    else:
        draw.text((x, y), text, font=font, fill=255, anchor="lm")
    return mask


def _scene_username_filter(stage: str, mask_input: int) -> str:
    """Match Canvas white overlay at the shared username blend strength."""
    return (
        f"{stage}format=gbrp,split=2[wm_base][wm_bright_in];"
        "[wm_bright_in]lutrgb=r='min(255,val*2)':g='min(255,val*2)':b='min(255,val*2)'[wm_bright];"
        f"[{mask_input}:v]format=gray,lut=y='val*{USERNAME_SCENE_BLEND_STRENGTH:.2f}',format=gbrp[wm_mask];"
        "[wm_base][wm_bright][wm_mask]maskedmerge[wm_scene]"
    )


def _scene_hook_filter(stage: str, mask_stream: str) -> str:
    """A readable frame-aware hook with 80% scene-blend strength."""
    return (
        f"{stage}format=gbrp,split=2[hook_scene_base][hook_scene_bright_in];"
        "[hook_scene_bright_in]lutrgb=r='min(255,val*4+64)':g='min(255,val*4+64)':b='min(255,val*4+64)'[hook_scene_bright];"
        f"{mask_stream}format=rgba,alphaextract,lut=y='val*0.80',format=gbrp[hook_scene_mask];"
        "[hook_scene_base][hook_scene_bright][hook_scene_mask]maskedmerge[hook_scene]"
    )


# --- GPU acceleration detection (cached) ---
_gpu_cache: Dict[str, Optional[bool]] = {}

def _has_nvenc() -> bool:
    """Return true only when the NVIDIA encoder can complete a real encode."""
    if "nvenc" not in _gpu_cache:
        try:
            available = subprocess.run(
                ["ffmpeg", "-hide_banner", "-encoders"],
                capture_output=True, text=True, timeout=5
            )
            if "h264_nvenc" not in available.stdout:
                _gpu_cache["nvenc"] = False
            else:
                # FFmpeg can be compiled with NVENC even when the installed
                # driver cannot use it. Verify the actual GPU once, then cache
                # the result so a failed encoder never wastes a full 4K render.
                smoke_test = subprocess.run(
                    [
                        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30:d=0.1",
                        "-frames:v", "1", "-c:v", "h264_nvenc", "-f", "null", "-",
                    ],
                    capture_output=True, text=True, timeout=15,
                )
                _gpu_cache["nvenc"] = smoke_test.returncode == 0
        except Exception:
            _gpu_cache["nvenc"] = False
    return _gpu_cache["nvenc"]

def _has_cuvid() -> bool:
    """Check if h264_cuvid decoder is available."""
    if "cuvid" not in _gpu_cache:
        try:
            r = subprocess.run(
                ["ffmpeg", "-hide_banner", "-decoders"],
                capture_output=True, text=True, timeout=5
            )
            _gpu_cache["cuvid"] = "h264_cuvid" in r.stdout
        except Exception:
            _gpu_cache["cuvid"] = False
    return _gpu_cache["cuvid"]


def is_dark_hex(hex_str: Optional[str]) -> bool:
    if not hex_str:
        return False
    c = str(hex_str).strip().lstrip("#")
    if len(c) == 3:
        c = "".join([x * 2 for x in c])
    if len(c) != 6:
        return False
    try:
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        return (0.299 * r + 0.587 * g + 0.114 * b) < 130
    except ValueError:
        return False


class ReelRenderer:
    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = output_dir

    def create_text_overlay_image(
        self,
        canvas_width: int,
        canvas_height: int,
        series_text: str,
        song_name: str,
        anime_name: str,
        caption: str,
        template: Dict[str, Any],
        output_png_path: str,
        watermark: Optional[Dict[str, Any]] = None,
        creator_badge: Optional[Dict[str, Any]] = None,
        bg_type: Optional[str] = None
    ) -> str:
        """Generates a high-res RGBA transparent image containing styled typography and badges."""
        img = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        studio_text = None
        if "studio_text_overlay" in template:
            studio_text = _decode_studio_png(
                template["studio_text_overlay"], canvas_width, canvas_height, "Studio text overlay"
            )

        # Helper to load system font or fallback
        def get_font(font_name: str, size: int, has_emoji: bool = False):
            # Windows font paths
            windir = os.environ.get("WINDIR", "C:\\Windows")
            fonts_dir = Path(windir) / "Fonts"
            clean = font_name.lower().replace("-", "").replace("_", "").strip()
            font_candidates = []
            if has_emoji:
                font_candidates.append(fonts_dir / "seguiemj.ttf")
            if "arial" in clean:
                if "bold" in clean or "black" in clean:
                    font_candidates.extend([fonts_dir / "arialbd.ttf", fonts_dir / "arial.ttf"])
                else:
                    font_candidates.extend([fonts_dir / "arial.ttf", fonts_dir / "arialbd.ttf"])
            elif "segoe" in clean:
                if "bold" in clean or "black" in clean or "semibold" in clean:
                    font_candidates.extend([fonts_dir / "seguisb.ttf", fonts_dir / "segoeuib.ttf", fonts_dir / "segoeui.ttf"])
                else:
                    font_candidates.extend([fonts_dir / "segoeui.ttf"])
            elif "bold" in clean or "black" in clean:
                font_candidates.extend([
                    fonts_dir / "arialbd.ttf",
                    fonts_dir / "segoeuib.ttf",
                ])
            font_candidates.extend([
                fonts_dir / f"{font_name}.ttf",
                fonts_dir / f"{font_name}.otf",
                fonts_dir / "arialbd.ttf",
                fonts_dir / "arial.ttf",
                fonts_dir / "segoeuib.ttf",
                fonts_dir / "segoeui.ttf",
                fonts_dir / "seguiemj.ttf",
                fonts_dir / "impact.ttf"
            ])
            for c in font_candidates:
                if c.exists():
                    try:
                        return ImageFont.truetype(str(c), size)
                    except Exception:
                        continue
            return ImageFont.load_default()

        is_landscape = canvas_width >= canvas_height
        if bg_type is None:
            bg_type = str(template.get("background", {}).get("type", "blur")).strip().lower()

        if is_landscape:
            # -------------------------------------------------------------
            # 16:9 LANDSCAPE BROADCAST OVERLAY
            # -------------------------------------------------------------
            # 1. SERIES TEXT (Top-Left Broadcast Badge)
            s_cfg = template.get("series_text", {})
            if studio_text is None and s_cfg.get("enabled", True) and series_text.strip():
                s_font_name = s_cfg.get("font", "Arial-Bold").split("-")[0].lower()
                s_font = get_font(s_font_name, 22)
                badge_text = series_text.replace("\n", " · ").upper()
                bbox = draw.textbbox((0, 0), badge_text, font=s_font)
                tw = bbox[2] - bbox[0]
                th = bbox[3] - bbox[1]
                bx, by = 48, 36
                draw.rounded_rectangle([bx, by, bx + tw + 36, by + th + 18], radius=8, fill=(14, 19, 34, 210), outline=(6, 182, 212, 130), width=1)
                draw.text((bx + 18, by + 9), badge_text, font=s_font, fill="#38bdf8")

            # 2. LOWER THIRD - SONG TITLE & ANIME
            t_cfg = template.get("song_title", {})
            if song_name.strip():
                t_font_name = t_cfg.get("font", "Arial-Bold").split("-")[0].lower()
                t_font = get_font(t_font_name, 46)
                t_text = song_name.upper() if t_cfg.get("text_transform") == "uppercase" else song_name
                tx, ty = 48, canvas_height - 130
                draw.text((tx + 2, ty + 2), t_text, font=t_font, fill=(0, 0, 0, 200))
                draw.text((tx, ty), t_text, font=t_font, fill="#ffffff")

            a_cfg = template.get("anime_name", {})
            if anime_name.strip():
                a_font_name = a_cfg.get("font", "Arial").split("-")[0].lower()
                a_font = get_font(a_font_name, 24)
                a_text = anime_name.upper() if a_cfg.get("text_transform") == "uppercase" else anime_name
                ax, ay = 48, canvas_height - 75
                draw.text((ax + 1, ay + 1), a_text, font=a_font, fill=(0, 0, 0, 180))
                draw.text((ax, ay), a_text, font=a_font, fill="#38bdf8")

        else:
            # -------------------------------------------------------------
            # 9:16 VERTICAL / PORTRAIT OVERLAY
            # -------------------------------------------------------------
            design_scale = canvas_width / 1080.0
            # 1. SERIES TEXT / VIRAL HOOK (Top)
            s_cfg = template.get("series_text", {})
            if studio_text is None and s_cfg.get("enabled", True) and series_text.strip():
                # Match the popular anime-edit hook style: bold white text
                # with a clean black outline directly over the footage.
                s_font_name = s_cfg.get("font", "Segoe UI Semibold").lower()
                requested_size = int(s_cfg.get("size", 38))
                line_gap = max(0, int(s_cfg.get("line_gap", 12)))
                s_has_emoji = any(c in '⚡🔥✨🌙' or ord(c) >= 0x1F000 for c in series_text)
                # Newlines in the Studio textarea are deliberate hook lines.
                # Preserve them for browser-less/native overlay exports too.
                hook_paragraphs = [line.strip() for line in series_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
                has_manual_line_break = len(hook_paragraphs) > 1
                hook_text = "\n".join(hook_paragraphs).strip()
                max_hook_width = min(round(920 * design_scale), canvas_width - round(120 * design_scale))
                text_lines = []
                s_font = None
                max_hook_size = round((110 if s_cfg.get("_custom") else 42) * design_scale)
                min_hook_size = round(18 * design_scale)
                s_size = min(max_hook_size, max(min_hook_size, requested_size))
                for candidate_size in range(s_size, max(12, round(13 * design_scale)) - 1, -1):
                    candidate_font = get_font(s_font_name, candidate_size, has_emoji=s_has_emoji)
                    candidate_lines = []
                    for paragraph in hook_paragraphs:
                        words = paragraph.split() if paragraph else []
                        if not words:
                            candidate_lines.append("")
                            continue
                        line = ""
                        for word in words:
                            proposed = f"{line} {word}".strip()
                            if not line or draw.textlength(proposed, font=candidate_font) <= max_hook_width:
                                line = proposed
                            else:
                                candidate_lines.append(line)
                                line = word
                        if line:
                            candidate_lines.append(line)
                    if len(candidate_lines) <= max(3, len(hook_paragraphs)):
                        text_lines = candidate_lines
                        s_font = candidate_font
                        s_size = candidate_size
                        break
                if s_font is None:
                    # Keep even an unusually long custom hook visible rather
                    # than silently dropping words.
                    s_font = get_font(s_font_name, min_hook_size, has_emoji=s_has_emoji)
                    s_size = min_hook_size
                    text_lines = hook_paragraphs

                line_height = round(s_size * 1.22) + line_gap
                total_h = len(text_lines) * line_height

                if "y" in s_cfg and s_cfg["y"] is not None:
                    start_y = int(s_cfg["y"])
                else:
                    s_y_percent = s_cfg.get("y_percent", 18) / 100.0
                    start_y = int(canvas_height * s_y_percent - total_h / 2)
                
                custom_x = s_cfg.get("x")
                # A creator-entered second line is a single left-aligned hook
                # block. Automatic wrapping continues to centre each line.
                manual_block_width = max(
                    (draw.textbbox((0, 0), line, font=s_font)[2] - draw.textbbox((0, 0), line, font=s_font)[0]
                     for line in text_lines),
                    default=0,
                )
                manual_block_x = int((custom_x if custom_x is not None else canvas_width / 2) - manual_block_width / 2)
                
                for i, line in enumerate(text_lines):
                    bbox = draw.textbbox((0, 0), line, font=s_font)
                    w = bbox[2] - bbox[0]
                    if has_manual_line_break:
                        x = manual_block_x
                    elif custom_x is not None:
                        x = int(custom_x - w // 2)
                    else:
                        x = (canvas_width - w) // 2
                    y = int(start_y + i * line_height)
                    if bg_type == "white":
                        line_color = s_cfg.get("color") if (s_cfg.get("color") and is_dark_hex(s_cfg.get("color"))) else "#0f172a"
                    else:
                        line_color = s_cfg.get("color") if (s_cfg.get("color") and not is_dark_hex(s_cfg.get("color"))) else "#ffffff"
                    outline_width = max(2, round(s_size * 0.11))
                    draw.text((x, y), line, font=s_font, fill=line_color,
                              stroke_width=outline_width, stroke_fill="#080808")

            # 2. SONG TITLE (Below Video - Multiline support)
            t_cfg = template.get("song_title", {})
            if t_cfg.get("enabled", True) and song_name.strip():
                t_font_name = t_cfg.get("font", "Arial-Bold").split("-")[0].lower()
                t_size = int(t_cfg.get("size", 52))
                t_font = get_font(t_font_name, t_size)
                if bg_type == "white":
                    t_color = t_cfg.get("color") if (t_cfg.get("color") and is_dark_hex(t_cfg.get("color"))) else "#0f172a"
                else:
                    t_color = t_cfg.get("color") if (t_cfg.get("color") and not is_dark_hex(t_cfg.get("color"))) else "#ffffff"
                t_text = song_name.upper() if t_cfg.get("text_transform") == "uppercase" else song_name
                song_lines = t_text.split("\n")
                line_height = t_size * 1.25

                if "y" in t_cfg and t_cfg["y"] is not None:
                    start_y = int(t_cfg["y"])
                else:
                    t_y_percent = t_cfg.get("y_percent", 68) / 100.0
                    start_y = int(canvas_height * t_y_percent)

                custom_x = t_cfg.get("x")
                for i, line in enumerate(song_lines):
                    bbox = draw.textbbox((0, 0), line, font=t_font)
                    w = bbox[2] - bbox[0]
                    x = int(custom_x - w // 2) if custom_x is not None else (canvas_width - w) // 2
                    y = int(start_y + i * line_height)
                    if bg_type != "white":
                        for offset in [(0, 3), (2, 2), (-2, 2), (0, -2)]:
                            draw.text((x + offset[0], y + offset[1]), line, font=t_font, fill=(0, 0, 0, 160))
                    draw.text((x, y), line, font=t_font, fill=t_color)

            # 3. ANIME NAME (Sub-title - Multiline support)
            a_cfg = template.get("anime_name", {})
            if a_cfg.get("enabled", True) and anime_name.strip():
                a_font_name = a_cfg.get("font", "Arial").split("-")[0].lower()
                a_size = int(a_cfg.get("size", 30))
                a_font = get_font(a_font_name, a_size)
                if bg_type == "white":
                    a_color = a_cfg.get("color") if (a_cfg.get("color") and is_dark_hex(a_cfg.get("color"))) else "#0284c7"
                else:
                    a_color = a_cfg.get("color") if (a_cfg.get("color") and not is_dark_hex(a_cfg.get("color"))) else "#38bdf8"
                a_text = anime_name.upper() if a_cfg.get("text_transform") == "uppercase" else anime_name
                anime_lines = a_text.split("\n")
                line_height = a_size * 1.25

                if "y" in a_cfg and a_cfg["y"] is not None:
                    start_y = int(a_cfg["y"])
                else:
                    a_y_percent = a_cfg.get("y_percent", 74) / 100.0
                    start_y = int(canvas_height * a_y_percent)

                custom_x = a_cfg.get("x")
                for i, line in enumerate(anime_lines):
                    bbox = draw.textbbox((0, 0), line, font=a_font)
                    w = bbox[2] - bbox[0]
                    x = int(custom_x - w // 2) if custom_x is not None else (canvas_width - w) // 2
                    y = int(start_y + i * line_height)
                    if bg_type != "white":
                        draw.text((x + 1, y + 2), line, font=a_font, fill=(0, 0, 0, 180))
                    draw.text((x, y), line, font=a_font, fill=a_color)

            # 4. TRACK SOUND PILL / AUDIO CREDIT (Modern Spotify / Reels Creator Style)
            tp_cfg = template.get("track_pill", {})
            track_text = tp_cfg.get("text", "") or caption or (f"♫ {song_name} · {anime_name}" if (song_name and anime_name) else (f"♫ {song_name}" if song_name else ""))
            if tp_cfg.get("enabled", False) and track_text.strip():
                tp_size = int(tp_cfg.get("size", 26))
                tp_has_emoji = any(c in '⚡🔥✨🌙' or ord(c) >= 0x1F000 for c in track_text)
                tp_font = get_font("arial-bold", tp_size, has_emoji=tp_has_emoji)
                tp_bbox = draw.textbbox((0, 0), track_text, font=tp_font)
                tp_w = tp_bbox[2] - tp_bbox[0]
                tp_h = tp_bbox[3] - tp_bbox[1]
                tp_pad_x = 26
                tp_pad_y = 12
                tp_y_pct = tp_cfg.get("y_percent", 68) / 100.0
                tp_y = int(tp_cfg["y"]) if "y" in tp_cfg and tp_cfg["y"] is not None else int(canvas_height * tp_y_pct)
                tp_x = (canvas_width - (tp_w + tp_pad_x * 2)) // 2
                draw.rounded_rectangle(
                    [tp_x, tp_y, tp_x + tp_w + tp_pad_x * 2, tp_y + tp_h + tp_pad_y * 2],
                    radius=18,
                    fill=(15, 23, 42, 220) if bg_type != "white" else (241, 245, 249, 230),
                    outline=(255, 255, 255, 60) if bg_type != "white" else (0, 0, 0, 40),
                    width=1
                )
                tp_color = tp_cfg.get("color", "#f8fafc" if bg_type != "white" else "#0f172a")
                draw.text((tp_x + tp_pad_x, tp_y + tp_pad_y), track_text, font=tp_font, fill=tp_color)

        # Video frame border outline
        vid_cfg = template.get("video", {})
        curved_border = vid_cfg.get("curved_border", True)
        c_radius = int(vid_cfg.get("corner_radius", 16)) if curved_border else 0
        v_offset = vid_cfg.get("vertical_offset", 0)
        fg_scale = vid_cfg.get("scale", 1.0)

        fg_x, fg_y = 0, 0
        if not is_landscape or fg_scale < 0.999:
            vid_w = vid_cfg.get("video_width") or 16
            vid_h = vid_cfg.get("video_height") or 9
            if canvas_height > canvas_width:
                fg_w, fg_h, fg_x, fg_y = _contain_geometry(
                    vid_w, vid_h, canvas_width, canvas_height, fg_scale, v_offset)
            else:
                fg_w = int(canvas_width * fg_scale * (0.95 if canvas_width == canvas_height else 1.0))
                fg_h = int(round(fg_w * vid_h / vid_w))
                if fg_h % 2 != 0: fg_h += 1
                if fg_w % 2 != 0: fg_w += 1
                fg_x = (canvas_width - fg_w) // 2
                fg_y = (canvas_height - fg_h) // 2 + v_offset
        else:
            fg_x = 48
            fg_y = 36

        # 4. USERNAME WATERMARK (optional clean creator mark)
        if isinstance(watermark, dict):
            wm_cfg = watermark
        elif watermark is True:
            wm_cfg = {"enabled": True, "text": "@animesongs"}
        else:
            wm_cfg = template.get("watermark", {}) or {}

        if studio_text is None and wm_cfg and wm_cfg.get("style") != "scene_blend" and wm_cfg.get("enabled", False) and wm_cfg.get("text", "").strip():
            wm_text = wm_cfg.get("text", "").strip()
            wm_size = int(wm_cfg.get("size", 28))
            wm_font = _watermark_font(wm_cfg.get("font"), wm_size)
            if bg_type == "white":
                wm_color = wm_cfg.get("color") if (wm_cfg.get("color") and is_dark_hex(wm_cfg.get("color"))) else "#0f172a"
            else:
                wm_color = wm_cfg.get("color") if (wm_cfg.get("color") and not is_dark_hex(wm_cfg.get("color"))) else "#ffffff"
            default_wm_x = fg_x + 35 if not is_landscape else 60
            default_wm_y = fg_y + 45 if not is_landscape else 50
            wm_x = int(wm_cfg["x"]) if ("x" in wm_cfg and wm_cfg["x"] is not None) else default_wm_x
            wm_y = int(wm_cfg["y"]) if ("y" in wm_cfg and wm_cfg["y"] is not None) else default_wm_y
            if bg_type == "white":
                shadow_color = (255, 255, 255, 150)
                shadow_offset = (1, 1)
            else:
                shadow_color = (0, 0, 0, 210)
                shadow_offset = (1, 2)
            draw.text(
                (wm_x + shadow_offset[0], wm_y + shadow_offset[1]),
                wm_text,
                font=wm_font,
                fill=shadow_color,
            )
            draw.text((wm_x, wm_y), wm_text, font=wm_font, fill=wm_color)

        if studio_text is not None:
            # Preserve browser glyphs, antialiasing and translucent shadow edges.
            img.alpha_composite(studio_text)

        # 4b. CREATOR PROFILE HEADER (reference-style avatar left, name and handle right)
        if isinstance(creator_badge, dict):
            cb_cfg = creator_badge
        else:
            cb_cfg = template.get("creator_badge", {}) or {}

        if cb_cfg and cb_cfg.get("enabled", False):
            badge_text = cb_cfg.get("text", "@Lap_lac7").strip()
            if not badge_text:
                badge_text = "@Lap_lac7"
            if badge_text.lower() == "@lap_lac7":
                badge_text = "@Lap_lac7"
            badge_size = int(cb_cfg.get("size", 28))
            badge_font = get_font("arial-bold", badge_size)
            if bg_type == "white":
                badge_color = cb_cfg.get("color") if (cb_cfg.get("color") and is_dark_hex(cb_cfg.get("color"))) else "#0f172a"
            else:
                badge_color = cb_cfg.get("color") if (cb_cfg.get("color") and not is_dark_hex(cb_cfg.get("color"))) else "#ffffff"

            cb_x = int(cb_cfg["x"]) if ("x" in cb_cfg and cb_cfg["x"] is not None) else 540
            cb_y = int(cb_cfg["y"]) if ("y" in cb_cfg and cb_cfg["y"] is not None) else 160

            # Check avatar image
            avatar_path = None
            for candidate in [
                Path(__file__).parent / "creator_avatar_laplace.png",
                Path(__file__).resolve().parent.parent / "static" / "creator_avatar_laplace.png"
            ]:
                if candidate.exists():
                    avatar_path = candidate
                    break

            avatar_d = int(badge_size * 2.3)
            spacing = max(6, int(badge_size * 0.34))
            display_name = "Lap_lac7"
            display_size = max(16, round(badge_size * 0.75))
            display_font = get_font("arial-bold", display_size)
            display_bbox = draw.textbbox((0, 0), display_name, font=display_font)
            display_w = display_bbox[2] - display_bbox[0]
            handle_size = max(13, round(badge_size * 0.48))
            handle_font = get_font("arial-bold", handle_size)
            handle_line = badge_text
            handle_bbox = draw.textbbox((0, 0), handle_line, font=handle_font)
            handle_w = handle_bbox[2] - handle_bbox[0]
            text_gap = max(3, round(badge_size * 0.12))
            text_w = max(display_w, handle_w)
            total_w = avatar_d + spacing + text_w
            total_h = max(avatar_d, display_size + text_gap + handle_size)
            top_y = cb_y - total_h // 2

            # 1. Composite the unchanged circular Laplace avatar on the left.
            av_x = cb_x - total_w // 2
            av_y = top_y
            if avatar_path:
                try:
                    av_img = Image.open(avatar_path).convert("RGBA").resize((avatar_d, avatar_d), Image.Resampling.LANCZOS)
                    circle_mask = Image.new("L", (avatar_d, avatar_d), 0)
                    ImageDraw.Draw(circle_mask).ellipse((0, 0, avatar_d, avatar_d), fill=255)
                    av_img.putalpha(ImageChops.multiply(av_img.getchannel("A"), circle_mask))
                    img.alpha_composite(av_img, (av_x, av_y))
                    draw = ImageDraw.Draw(img)
                    ring_col = (0, 0, 0, 40) if bg_type == "white" else (255, 255, 255, 120)
                    draw.ellipse((av_x, av_y, av_x + avatar_d, av_y + avatar_d), outline=ring_col, width=2)
                except Exception:
                    pass

            # 2. Place the name and handle beside the photo, matching the profile reference.
            text_x = av_x + avatar_d + spacing
            text_top = top_y + (avatar_d - display_size - text_gap - handle_size) // 2
            name_y = text_top
            handle_y = name_y + display_size + text_gap
            if bg_type != "white":
                draw.text((text_x + 1, name_y + 2), display_name, font=display_font, fill=(0, 0, 0, 200))
            draw.text((text_x, name_y), display_name, font=display_font, fill=badge_color)

            follow_color = "#475569" if bg_type == "white" else "#dbeafe"
            draw.text((text_x, handle_y), handle_line, font=handle_font, fill=follow_color)

        img.save(output_png_path, "PNG")
        return output_png_path

    def create_ass_subtitles(
        self,
        lyrics: list,
        clip_start: float,
        clip_duration: float,
        output_ass_path: str,
        style_preset: str = "minimal",
        subtitle_animation: str = "auto",
        aspect_ratio: str = "9:16",
        subtitle_color: Optional[str] = None,
        subtitle_color_en: Optional[str] = None,
        bg_type: str = "blur",
        subtitle_language: str = "both",
        subtitle_y: Optional[int] = None,
        subtitle_font_size: Optional[float] = None,
        subtitle_x: Optional[float] = None,
        subtitle_font: str = "segoe"
    ) -> bool:
        """Generates an Advanced SubStation Alpha (ASS) dual-language subtitle file with chosen visual preset and aspect ratio."""
        if not lyrics:
            return False

        sub_lang = (subtitle_language or "both").lower()
        animation_request = (subtitle_animation or "auto").lower()
        if animation_request not in {"auto", "fade", "pop", "rise", "slide", "none"}:
            animation_request = "auto"
        subtitle_animation = "fade" if animation_request == "auto" else animation_request

        def hex_to_ass_color(hex_str: Optional[str], default: str = "") -> str:
            if not hex_str:
                return default
            c = str(hex_str).strip().lstrip("#")
            if len(c) == 6:
                r, g, b = c[0:2], c[2:4], c[4:6]
                return f"&H00{b}{g}{r}".upper()
            elif len(c) == 3:
                r, g, b = c[0]*2, c[1]*2, c[2]*2
                return f"&H00{b}{g}{r}".upper()
            return default

        def format_ass_time(seconds: float) -> str:
            total_cs = max(0, int(round(seconds * 100)))
            cs = total_cs % 100
            total_s = total_cs // 100
            s = total_s % 60
            total_m = total_s // 60
            m = total_m % 60
            h = total_m // 60
            return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

        # Resolve resolution and vertical subtitle margins based on aspect ratio
        if aspect_ratio == "16:9":
            res_x, res_y = 1920, 1080
            jp_v, en_v = 135, 95
        elif aspect_ratio == "1:1":
            res_x, res_y = 1080, 1080
            jp_v, en_v = 145, 105
        else:
            res_x, res_y = 1080, 1920
            jp_v, en_v = 240, 195

        # If custom subtitle_y was supplied by the frontend editor, dynamically calculate vertical margin
        if subtitle_y is not None and subtitle_y > 0:
            # MarginV in ASS is distance from bottom (alignment 2: bottom-center)
            # subtitle_y in canvas is distance from top
            jp_v = max(30, min(res_y - 60, res_y - int(subtitle_y)))
            en_v = max(20, jp_v - 45)

        custom_ass_color = hex_to_ass_color(subtitle_color, default="")

        if bg_type == "white":
            if not subtitle_color or not is_dark_hex(subtitle_color):
                sub_col = "&H002A170F"  # #0f172a in ASS &H00BBGGRR format
            else:
                sub_col = hex_to_ass_color(subtitle_color, default="&H002A170F")
            outline_col = "&H00FFFFFF"
            shadow_col = "&H00000000"
            en_col = hex_to_ass_color(subtitle_color_en, default=sub_col) if subtitle_color_en and is_dark_hex(subtitle_color_en) else sub_col
        else:
            if not subtitle_color or is_dark_hex(subtitle_color):
                sub_col = "&H00FFFFFF"
            else:
                sub_col = hex_to_ass_color(subtitle_color, default="&H00FFFFFF")
            outline_col = "&H00000000"
            shadow_col = "&H80000000"
            en_col = hex_to_ass_color(subtitle_color_en, default=sub_col) if subtitle_color_en and not is_dark_hex(subtitle_color_en) else sub_col

        # Subtitle Presets (both Japanese & English subtitles always use the same color)
        if bg_type == "white":
            if style_preset == "white_on_black":
                jp_style = f"Style: Japanese,Yu Mincho,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.5,0,3,10,0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Georgia,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.3,0,3,8,0,2,40,40,{en_v},1"
            elif style_preset == "minimal":
                jp_style = f"Style: Japanese,Yu Gothic,36,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,0.8,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,24,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.3,0,1,0.6,0.0,2,40,40,{en_v},1"
            elif style_preset == "bold_lyrics":
                jp_style = f"Style: Japanese,Yu Gothic,42,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.8,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,28,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.4,0.0,2,40,40,{en_v},1"
            elif style_preset == "pop_bounce":
                jp_style = f"Style: Japanese,Yu Gothic,44,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.8,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,29,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.4,0.0,2,40,40,{en_v},1"
            elif style_preset == "neon_glow":
                jp_style = f"Style: Japanese,Yu Gothic,42,&H00FFF000,&H000000FF,&H006B4A00,&H6000F0FF,-1,0,0,0,100,100,1.0,0,1,2.5,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,&H00FFF000,&H000000FF,&H006B4A00,&H6000F0FF,-1,0,0,0,100,100,0.5,0,1,1.8,0.0,2,40,40,{en_v},1"
            elif style_preset == "retro_90s":
                jp_style = f"Style: Japanese,Arial,40,&H0000DEFF,&H000000FF,&H002A170F,&H00000000,-1,0,0,0,100,100,0.5,0,1,2.5,1.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Arial,26,&H0000DEFF,&H000000FF,&H002A170F,&H00000000,-1,0,0,0,100,100,0.3,0,1,1.8,0.8,2,40,40,{en_v},1"
            elif style_preset == "manga_flash":
                manga_col = sub_col if custom_ass_color else "&H0000E6FF"
                jp_style = f"Style: Japanese,Yu Gothic,44,{manga_col},&H000000FF,&H002A170F,&H00000000,-1,0,0,0,100,100,0.5,0,1,2.8,1.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,27,{manga_col},&H000000FF,&H002A170F,&H00000000,-1,0,0,0,100,100,0.3,0,1,2.0,0.8,2,40,40,{en_v},1"
            elif style_preset == "karaoke":
                jp_style = f"Style: Japanese,Yu Gothic,42,&H0000E6FF,&H00A0A0A0,&H002A170F,&H70000000,-1,0,0,0,100,100,0.8,0,1,2.5,1.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,&H0000E6FF,&H00A0A0A0,&H002A170F,&H70000000,-1,0,0,0,100,100,0.5,0,1,1.8,0.8,2,40,40,{en_v},1"
            elif style_preset == "cinematic":
                jp_style = f"Style: Japanese,Yu Gothic,36,{sub_col},&H000000FF,{outline_col},{shadow_col},0,1,0,0,100,100,3.0,0,1,0.5,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,22,{sub_col},&H000000FF,{outline_col},{shadow_col},0,1,0,0,100,100,2.0,0,1,0.3,0.0,2,40,40,{en_v},1"
            elif style_preset == "impact":
                jp_style = f"Style: Japanese,Yu Gothic,48,&H0000E6FF,&H000000FF,&H002A170F,&H00000000,-1,0,0,0,100,100,0.0,0,1,4.0,2.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Arial,32,&H0000E6FF,&H000000FF,&H002A170F,&H00000000,-1,0,0,0,100,100,0.0,0,1,3.0,1.5,2,40,40,{en_v},1"
            elif style_preset == "lofi_pastel":
                jp_style = f"Style: Japanese,Yu Gothic,36,&H00DCF5F5,&H000000FF,&H00000000,&H80261A3A,0,0,0,0,100,100,1.5,0,3,0.0,6.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,24,&H00FFB0E0,&H000000FF,&H00000000,&H80261A3A,0,0,0,0,100,100,1.0,0,3,0.0,5.0,2,40,40,{en_v},1"
            elif style_preset == "jp_en":
                jp_style = f"Style: Japanese,Yu Gothic,42,{sub_col},&H000000FF,&H002A170F,{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.8,0.8,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,25,{en_col},&H000000FF,&H002A170F,{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.2,0.6,2,40,40,{en_v},1"
            elif style_preset == "anime":
                anime_jp_col = sub_col if custom_ass_color else "&H00D4A8F9"
                anime_en_col = en_col if (subtitle_color_en or custom_ass_color) else "&H00FCD37D"
                jp_style = f"Style: Japanese,Yu Gothic,40,{anime_jp_col},&H000000FF,&H00B672F4,&H709D4EDD,-1,0,0,0,100,100,0.8,0,1,2.0,1.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{anime_en_col},&H000000FF,&H00B672F4,&H709D4EDD,-1,0,0,0,100,100,0.5,0,1,1.5,0.8,2,40,40,{en_v},1"
            else:
                jp_style = f"Style: Japanese,Yu Gothic,38,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.2,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.0,0.0,2,40,40,{en_v},1"
        else:
            if style_preset == "white_on_black":
                jp_style = f"Style: Japanese,Yu Mincho,40,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.5,0,3,10,0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Georgia,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.3,0,3,8,0,2,40,40,{en_v},1"
            elif style_preset == "minimal":
                jp_style = f"Style: Japanese,Yu Gothic,36,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,1.0,2.5,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,24,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.3,0,1,0.8,2.0,2,40,40,{en_v},1"
            elif style_preset == "bold_lyrics":
                jp_style = f"Style: Japanese,Yu Gothic,42,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,5.5,2.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,28,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,4.5,2.0,2,40,40,{en_v},1"
            elif style_preset == "pop_bounce":
                jp_style = f"Style: Japanese,Yu Gothic,44,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,5.8,2.2,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,29,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,4.8,2.0,2,40,40,{en_v},1"
            elif style_preset == "neon_glow":
                neon_col = "&H00FFF000" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Yu Gothic,42,{neon_col},&H000000FF,&H001F1A00,&H70FFF000,-1,0,0,0,100,100,1.0,0,1,3.0,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{neon_col},&H000000FF,&H001F1A00,&H70FFF000,-1,0,0,0,100,100,0.5,0,1,2.0,0.0,2,40,40,{en_v},1"
            elif style_preset == "retro_90s":
                retro_col = "&H0000DEFF" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Arial,40,{retro_col},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.5,0,1,3.5,1.5,2,40,40,{jp_v},1"
                en_style = f"Style: English,Arial,26,{retro_col},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.3,0,1,2.5,1.0,2,40,40,{en_v},1"
            elif style_preset == "manga_flash":
                manga_col = "&H0000E6FF" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Yu Gothic,44,{manga_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,6.2,2.4,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,27,{manga_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.3,0,1,4.8,1.8,2,40,40,{en_v},1"
            elif style_preset == "karaoke":
                karaoke_unsung = "&H00A0A0A0"
                karaoke_sung = "&H0000E6FF" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Yu Gothic,42,{karaoke_sung},{karaoke_unsung},&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,4.5,2.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{karaoke_sung},{karaoke_unsung},&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,3.5,1.5,2,40,40,{en_v},1"
            elif style_preset == "cinematic":
                jp_style = f"Style: Japanese,Yu Gothic,36,{sub_col},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,4.0,0,1,0.5,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,22,{sub_col},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,3.0,0,1,0.3,0.0,2,40,40,{en_v},1"
            elif style_preset == "impact":
                impact_col = "&H0000E6FF" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Yu Gothic,48,{impact_col},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.0,0,1,7.0,3.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Arial,32,{impact_col},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.0,0,1,5.5,2.5,2,40,40,{en_v},1"
            elif style_preset == "lofi_pastel":
                lofi_col = "&H00DCF5F5" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Yu Gothic,36,{lofi_col},&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,1.5,0,3,0.0,8.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,24,&H00FFB0E0,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,1.0,0,3,0.0,6.0,2,40,40,{en_v},1"
            elif style_preset == "anime":
                anime_jp_col = sub_col if custom_ass_color else "&H00D4A8F9"
                anime_en_col = en_col if (subtitle_color_en or custom_ass_color) else "&H00FCD37D"
                jp_style = f"Style: Japanese,Yu Gothic,39,{anime_jp_col},&H000000FF,&H00B672F4,&H709D4EDD,-1,0,0,0,100,100,0.8,0,1,4.0,3.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{anime_en_col},&H000000FF,&H00B672F4,&H709D4EDD,-1,0,0,0,100,100,0.5,0,1,3.0,1.5,2,40,40,{en_v},1"
            elif style_preset == "jp_en":
                jp_style = f"Style: Japanese,Yu Gothic,42,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,5.0,2.2,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,25,{en_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,3.2,1.4,2,40,40,{en_v},1"
            else:
                jp_style = f"Style: Japanese,Yu Gothic,38,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,4.5,2.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,3.0,1.5,2,40,40,{en_v},1"

        english_font = {
            "impact": "Impact",
            "arial_black": "Arial Black",
            "bahnschrift": "Bahnschrift",
            "segoe": "Segoe UI",
            "franklin_heavy": "Franklin Gothic Heavy",
            "oswald": "Oswald",
            "cooper_black": "Cooper Black",
            "twcen_condensed": "Tw Cen MT Condensed Extra Bold",
            "verdana": "Verdana",
            "georgia": "Georgia",
            "segoe_print": "Segoe Print",
        }.get((subtitle_font or "segoe").lower(), "Segoe UI")
        if style_preset == "white_on_black":
            # This preset is the classic serif reference look, not the creator's
            # general subtitle font choice.
            english_font = "Georgia"
        en_fields = en_style.split(",")
        en_fields[1] = english_font
        en_style = ",".join(en_fields)

        font_scale = max(0.1, min(10.0, float(subtitle_font_size) / 38.0)) if subtitle_font_size is not None else 1.0
        english_subtitle_scale = 1.12
        if font_scale != 1.0 or english_subtitle_scale != 1.0:
            def scale_style(style: str, scale: float) -> str:
                fields = style.split(",")
                for index in (2, 12, 16, 17):
                    fields[index] = f"{float(fields[index]) * scale:g}"
                return ",".join(fields)
            jp_style = scale_style(jp_style, font_scale)
            en_style = scale_style(en_style, font_scale * english_subtitle_scale)

        ass_header = f"""[Script Info]
Title: Anime Reel Dual Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: {res_x}
PlayResY: {res_y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{jp_style}
{en_style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        # Detect whether lyrics timestamps are already relative to the clip start (0.0 to clip_duration)
        # or absolute timeline timestamps matching the source video
        explicit_bases = {
            str(line.get("timeline_basis", "")).strip().lower()
            for line in lyrics
            if str(line.get("timeline_basis", "")).strip().lower() in {"absolute", "relative"}
        }
        is_already_relative = explicit_bases == {"relative"}
        if not explicit_bases and clip_start > 2.0 and lyrics:
            valid_starts = [float(l.get("start", 0)) for l in lyrics if l.get("start") is not None]
            valid_ends = [float(l.get("end", 0)) for l in lyrics if l.get("end") is not None]
            if valid_starts and max(valid_starts) < clip_start and valid_ends and max(valid_ends) <= (clip_duration + 5.0):
                is_already_relative = True

        events = []
        for line in lyrics:
            raw_s = float(line.get("start", 0))
            raw_e = float(line.get("end", 0))
            s = raw_s if is_already_relative else (raw_s - clip_start)
            e = raw_e if is_already_relative else (raw_e - clip_start)
            if e <= 0 or s >= clip_duration:
                continue
            s = max(0.0, s)
            e = min(clip_duration, e)
            if e - s < 0.2:
                continue

            time_start = format_ass_time(s)
            time_end = format_ass_time(e)
            raw_jp = str(line.get("text_jp", "")).strip()
            raw_en = str(line.get("text_en", "")).strip()
            raw_romaji = str(line.get("text_romaji", "")).strip()
            fallback_text = str(line.get("text", "")).strip()

            has_jp = any('\u3040' <= c <= '\u30ff' or '\u4e00' <= c <= '\u9fff' for c in (raw_jp or fallback_text or raw_en))

            if sub_lang == "en":
                jp = ""
                en = raw_en or (raw_jp if not has_jp else (raw_romaji or raw_jp or fallback_text))
            elif sub_lang == "jp":
                jp = raw_jp or fallback_text or raw_en
                en = ""
            else:
                # both
                jp = raw_jp or (fallback_text if has_jp else "")
                en = raw_en or (raw_jp if not has_jp else (raw_romaji if not has_jp else ""))
                if not jp and not en:
                    if has_jp:
                        jp = fallback_text
                    else:
                        en = fallback_text

            def wrap_ass_text(text: str, is_en: bool) -> str:
                if not text:
                    return ""
                text = text.replace("\r", "").strip()
                if "\n" in text:
                    return r"\N".join(part.strip() for part in text.split("\n") if part.strip())
                has_japanese = any('\u3040' <= c <= '\u30ff' or '\u4e00' <= c <= '\u9fff' for c in text)
                # Prefer one readable Japanese line plus one English line.  The
                # cue itself is scaled below if it still needs extra rows.
                max_c = 34 if has_japanese else 68
                if len(text) > max_c:
                    if not has_japanese or is_en:
                        words = text.split()
                        mid = (len(words) + 1) // 2
                        return " ".join(words[:mid]) + r"\N" + " ".join(words[mid:])
                    else:
                        for punc in ["、", " ", "。"]:
                            if punc in text:
                                parts = text.split(punc, 1)
                                return parts[0] + (punc if punc != " " else "") + r"\N" + parts[1]
                        mid = len(text) // 2
                        return text[:mid] + r"\N" + text[mid:]
                return text

            formatted_jp = wrap_ass_text(jp, False)
            formatted_en = wrap_ass_text(en, True)

            # If both lines are identical (vocal was sung purely in English),
            # render cleanly once using English subtitle style rather than stacking duplicate text!
            if formatted_jp and formatted_en and formatted_jp.strip().lower() == formatted_en.strip().lower():
                if sub_lang == "jp":
                    formatted_en = ""
                else:
                    formatted_jp = ""

            en_lines_count = len(formatted_en.split(r"\N")) if formatted_en else 0
            jp_lines_count = len(formatted_jp.split(r"\N")) if formatted_jp else 0
            layout_line_count = jp_lines_count + en_lines_count
            compact_scale = max(0.72, 1 - (layout_line_count - 2) * 0.12) if layout_line_count > 2 else 1.0
            compact_tag = "" if compact_scale == 1.0 else f"{{\\fscx{compact_scale * 100:g}\\fscy{compact_scale * 100:g}}}"
            en_line_h = round((36 if aspect_ratio == "9:16" else 28) * font_scale * english_subtitle_scale)

            if formatted_jp and not formatted_en:
                dyn_jp_v = (jp_v + en_v) // 2
                dyn_en_v = en_v
            elif formatted_en and not formatted_jp:
                dyn_jp_v = jp_v
                dyn_en_v = (jp_v + en_v) // 2
            else:
                dyn_jp_v = en_v + (en_lines_count * en_line_h) + round(16 * font_scale)
                dyn_en_v = en_v

            center_x = max(0, min(res_x, float(subtitle_x))) if subtitle_x is not None else res_x / 2
            jp_y = res_y - dyn_jp_v
            en_y = res_y - dyn_en_v
            jp_position = en_position = ""
            if subtitle_animation == "rise":
                jp_position = f"{{\\move({center_x:g},{jp_y + 28:g},{center_x:g},{jp_y:g},0,180)}}"
                en_position = f"{{\\move({center_x:g},{en_y + 28:g},{center_x:g},{en_y:g},0,180)}}"
            elif subtitle_animation == "slide":
                jp_position = f"{{\\move({center_x + 48:g},{jp_y:g},{center_x:g},{jp_y:g},0,180)}}"
                en_position = f"{{\\move({center_x + 48:g},{en_y:g},{center_x:g},{en_y:g},0,180)}}"
            elif subtitle_x is not None:
                jp_position = f"{{\\pos({center_x:g},{jp_y:g})}}"
                en_position = f"{{\\pos({center_x:g},{en_y:g})}}"
            jp_position += compact_tag
            en_position += compact_tag

            def apply_ass_karaoke(text: str, total_duration_s: float, is_jp: bool, word_list: Optional[list] = None) -> str:
                if not text or total_duration_s <= 0:
                    return text
                def tokenize(chunk: str) -> list:
                    if is_jp:
                        import re
                        return re.findall(r'[a-zA-Z0-9]+|[\u4e00-\u9faf]+|[ぁ-ん]+|[ァ-ヴー]+|[^\s\w]', chunk) or list(chunk)
                    return chunk.split()

                # Retain explicit ASS line breaks while comparing timing words
                # against the same token sequence the viewer will see.
                chunks = text.split(r"\N")
                token_groups = [tokenize(chunk) for chunk in chunks]
                tokens = [token for group in token_groups for token in group]
                if not tokens:
                    return text

                total_cs = max(1, int(round(total_duration_s * 100)))
                timings = []
                if isinstance(word_list, list):
                    for item in word_list:
                        if not isinstance(item, dict):
                            timings = []
                            break
                        try:
                            word = str(item.get("word", "")).strip()
                            word_start = float(item.get("start"))
                            word_end = float(item.get("end"))
                        except (TypeError, ValueError):
                            timings = []
                            break
                        if (not word or not math.isfinite(word_start) or not math.isfinite(word_end)
                                or word_end <= word_start or (timings and word_start < timings[-1][2])):
                            timings = []
                            break
                        timings.append((word, word_start, word_end))

                normalized_tokens = [token.lower() if not is_jp else token for token in tokens]
                normalized_timing_words = [word.lower() if not is_jp else word for word, _, _ in timings]
                if len(timings) == len(tokens) and normalized_timing_words == normalized_tokens:
                    # Word bounds use the same source clock as the cue. ASS
                    # karaoke advances sequentially, so retain rests as timed
                    # zero-width syllables instead of stretching vocal words.
                    event_origin = s if is_already_relative else clip_start + s
                    cursor_cs = 0
                    index = 0
                    formatted_groups = []
                    for group in token_groups:
                        parts = []
                        for token in group:
                            _, word_start, word_end = timings[index]
                            start_cs = max(0, min(total_cs, round((word_start - event_origin) * 100)))
                            end_cs = max(start_cs, min(total_cs, round((word_end - event_origin) * 100)))
                            rest = f"{{\\k{start_cs - cursor_cs}}}\u200b" if start_cs > cursor_cs else ""
                            parts.append(rest + f"{{\\k{max(0, end_cs - max(cursor_cs, start_cs))}}}{token}")
                            cursor_cs = max(cursor_cs, end_cs)
                            index += 1
                        formatted_groups.append(("" if is_jp else " ").join(parts))
                    if cursor_cs < total_cs:
                        formatted_groups[-1] += f"{{\\k{total_cs - cursor_cs}}}\u200b"
                    return r"\N".join(formatted_groups)
                else:
                    # The cue bounds come from the audio. When individual word
                    # bounds are unavailable, create a smooth visual sweep across
                    # the phrase so Karaoke does not degrade into static yellow text.
                    weights = [max(1, len(token)) for token in tokens]

                total_weight = sum(weights) or 1
                durations = [max(1, int(round(total_cs * (weight / total_weight)))) for weight in weights]
                # ASS karaoke durations must exactly span the dialogue event.
                remainder = total_cs - sum(durations)
                if remainder >= 0:
                    durations[-1] += remainder
                else:
                    for position in range(len(durations) - 1, -1, -1):
                        removable = durations[position] - 1
                        adjustment = min(removable, -remainder)
                        durations[position] -= adjustment
                        remainder += adjustment
                        if remainder == 0:
                            break

                index = 0
                formatted_groups = []
                for group in token_groups:
                    parts = []
                    for token in group:
                        parts.append(f"{{\\k{durations[index]}}}{token}")
                        index += 1
                    formatted_groups.append(("" if is_jp else " ").join(parts))
                return r"\N".join(formatted_groups)

            if subtitle_animation == "none":
                entry_tag = ""
            elif subtitle_animation == "pop":
                entry_tag = r"{\fscx116\fscy116\t(0,180,\fscx100\fscy100)\fad(100,150)}"
            else:
                fade_in_ms = min(120, round((e - s) * 250))
                fade_out_ms = min(130, round((e - s) * 250))
                entry_tag = f"{{\\fad({fade_in_ms},{fade_out_ms})}}"

            if formatted_jp:
                if style_preset == "karaoke":
                    trusted_jp_words = line.get("words_jp") if line.get("timing_source") == "audio_aligned" else None
                    k_jp = apply_ass_karaoke(formatted_jp, e - s, True, trusted_jp_words)
                    events.append(f"Dialogue: 1,{time_start},{time_end},Japanese,,0,0,{dyn_jp_v},,{jp_position}{entry_tag}{k_jp}")
                else:
                    events.append(f"Dialogue: 1,{time_start},{time_end},Japanese,,0,0,{dyn_jp_v},,{jp_position}{entry_tag}{formatted_jp}")
            if formatted_en:
                display_en = formatted_en.upper() if style_preset in ("bold_lyrics", "pop_bounce", "manga_flash") else formatted_en
                if style_preset == "karaoke":
                    trusted_en_words = line.get("words_en") if line.get("timing_source") == "audio_aligned" else None
                    k_en = apply_ass_karaoke(display_en, e - s, False, trusted_en_words)
                    events.append(f"Dialogue: 2,{time_start},{time_end},English,,0,0,{dyn_en_v},,{en_position}{entry_tag}{k_en}")
                else:
                    events.append(f"Dialogue: 2,{time_start},{time_end},English,,0,0,{dyn_en_v},,{en_position}{entry_tag}{display_en}")

        if not events:
            return False

        with open(output_ass_path, "w", encoding="utf-8") as f:
            f.write(ass_header + "\n".join(events) + "\n")
        return True

    @staticmethod
    def build_color_grading_filter(
        color_filter: Optional[str] = "original",
        filter_intensity: Optional[float] = 100.0,
        color_adjustments: Optional[Dict[str, Any]] = None
    ) -> str:
        """Builds comma-separated FFmpeg video filters for color grading and adjustments."""
        filters = []
        adj = color_adjustments or {}
        intensity = max(0.0, min(4.0, (filter_intensity if filter_intensity is not None else 100.0) / 100.0))
        f_name = (color_filter or "original").lower().strip()

        if f_name == "intel_custom":
            return custom_rgb_filters(intensity, adj)

        # Base adjustments
        b_adj = float(adj.get("brightness", 0)) / 100.0   # -0.5 to 0.5
        c_adj = float(adj.get("contrast", 100)) / 100.0   # 0.5 to 1.6
        s_adj = float(adj.get("saturation", 100)) / 100.0 # 0.0 to 2.0
        warmth = float(adj.get("warmth", 0))              # -50 to 50
        vignette_val = float(adj.get("vignette", 0))      # 0 to 100

        # Keep export grading in lockstep with the CSS preview catalog in app.js.
        # The old export-only colorbalance tints did not exist in the preview and
        # gave skin tones a purple cast, especially with Cyberpunk.
        preset_values = {
            "clarendon": (0.20, 0.25, 0.05, 0.0, 0.00, 0.0),
            "crema": (0.05, -0.10, 0.03, 0.0, 0.20, -10.0),
            "gingham": (-0.08, -0.15, 0.08, 0.0, 0.08, 0.0),
            "juno": (0.15, 0.35, 0.03, 0.0, 0.00, -8.0),
            "lark": (0.10, 0.15, 0.08, 0.0, 0.00, 5.0),
            "ludwig": (0.12, 0.10, 0.03, 0.0, 0.12, 0.0),
            "moon": (0.25, -1.00, 0.05, 1.0, 0.00, 0.0),
            "perpetua": (0.08, 0.10, 0.04, 0.0, 0.00, 15.0),
            "reyes": (-0.10, -0.15, 0.12, 0.0, 0.25, 0.0),
            "slumber": (0.05, -0.25, 0.03, 0.0, 0.30, 0.0),
            "aden": (-0.05, 0.10, 0.08, 0.0, 0.00, -15.0),
            "anime_vivid": (0.22, 0.40, 0.04, 0.0, 0.00, 0.0),
            "cyberpunk": (0.28, 0.45, 0.02, 0.0, 0.00, -20.0),
        }
        f_contrast, f_saturate, f_brightness, f_grayscale, f_sepia, f_hue = preset_values.get(
            f_name, (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        )

        # Calculate final eq parameters
        final_c = max(0.1, round(c_adj * (1.0 + f_contrast * intensity), 3))
        final_b = round(b_adj + (f_brightness * intensity), 3)
        final_s = max(0.0, round(
            s_adj * (1.0 + f_saturate * intensity) * (1.0 - f_grayscale * intensity), 3
        ))

        if abs(final_c - 1.0) > 0.01 or abs(final_b) > 0.005 or abs(final_s - 1.0) > 0.01:
            filters.append(f"eq=contrast={final_c}:brightness={final_b}:saturation={final_s}")

        # CSS applies sepia and hue rotation after contrast/saturation. Use the
        # same operations in FFmpeg rather than an unrelated RGB color balance.
        final_sepia = max(0.0, min(1.0, f_sepia * intensity + (warmth / 100.0) * 0.25 if warmth > 0 else f_sepia * intensity))
        final_hue = f_hue * intensity
        if warmth != 0:
            final_hue += -warmth * (0.15 if warmth > 0 else 0.25)
        if final_sepia > 0.01:
            # Linear interpolation between the identity and CSS's sepia matrix.
            inv = 1.0 - final_sepia
            filters.append(
                "colorchannelmixer="
                f"rr={inv + 0.393 * final_sepia:.6f}:rg={0.769 * final_sepia:.6f}:rb={0.189 * final_sepia:.6f}:"
                f"gr={0.349 * final_sepia:.6f}:gg={inv + 0.686 * final_sepia:.6f}:gb={0.168 * final_sepia:.6f}:"
                f"br={0.272 * final_sepia:.6f}:bg={0.534 * final_sepia:.6f}:bb={inv + 0.131 * final_sepia:.6f}"
            )
        if abs(final_hue) > 0.1:
            # CSS hue-rotate() is a luminance-preserving RGB matrix, not an HSV
            # hue shift. FFmpeg's hue filter therefore changed skin tones even
            # after the old purple colorbalance was removed. Reproduce the CSS
            # matrix exactly so preview and export have the same color response.
            angle = math.radians(final_hue)
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            filters.append(
                "colorchannelmixer="
                f"rr={0.213 + cos_a * 0.787 - sin_a * 0.213:.6f}:"
                f"rg={0.715 - cos_a * 0.715 - sin_a * 0.715:.6f}:"
                f"rb={0.072 - cos_a * 0.072 + sin_a * 0.928:.6f}:"
                f"gr={0.213 - cos_a * 0.213 + sin_a * 0.143:.6f}:"
                f"gg={0.715 + cos_a * 0.285 + sin_a * 0.140:.6f}:"
                f"gb={0.072 - cos_a * 0.072 - sin_a * 0.283:.6f}:"
                f"br={0.213 - cos_a * 0.213 - sin_a * 0.787:.6f}:"
                f"bg={0.715 - cos_a * 0.715 + sin_a * 0.715:.6f}:"
                f"bb={0.072 + cos_a * 0.928 + sin_a * 0.072:.6f}"
            )

        # Vignette
        if vignette_val > 0.5:
            angle = round(0.2 + (vignette_val / 100.0) * 0.65, 3)
            filters.append(f"vignette=angle={angle}")

        if not filters:
            return ""
        return "," + ",".join(filters)


    def render_reel(
        self,
        source_video: str,
        output_mp4: str,
        start_time: float,
        end_time: float,
        series_text: str,
        song_name: str,
        anime_name: str,
        caption: str,
        template: Dict[str, Any],
        aspect_ratio: str = "9:16",
        lyrics: Optional[list] = None,
        show_lyrics: bool = True,
        subtitle_style: str = "minimal",
        subtitle_animation: str = "auto",
        subtitle_language: Optional[str] = "both",
        smart_loop: bool = True,
        loop_mode: str = "standard",
        loop_fade_duration: float = 0.35,
        fade_in: bool = False,
        fade_out: bool = False,
        fade_duration: float = 0.50,
        hook_fade_start: float = 0.0,
        watermark: Optional[Dict[str, Any]] = None,
        creator_badge: Optional[Dict[str, Any]] = None,
        subtitle_color: Optional[str] = None,
        subtitle_color_en: Optional[str] = None,
        color_filter: Optional[str] = "original",
        filter_intensity: Optional[float] = 100.0,
        color_adjustments: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable[[float, str], None]] = None,
        subtitle_y: Optional[int] = None,
        subtitle_font_size: Optional[float] = None,
        subtitle_x: Optional[float] = None,
        subtitle_font: str = "segoe",
        audio_master: Optional[Dict[str, Any]] = None,
        music: Optional[Dict[str, Any]] = None,
        video_audio_volume: Optional[float] = None,
    ) -> str:
        """Renders video in 16:9 Landscape, 9:16 Vertical, or 1:1 Square using FFmpeg."""
        hide_regions = _validated_hide_regions(template.get("hide_regions", []))
        if video_audio_volume is not None:
            video_audio_volume = float(video_audio_volume)
            if not math.isfinite(video_audio_volume) or not 0 <= video_audio_volume <= 1:
                raise ValueError("Video audio volume must be a finite number between 0 and 1.")
        source_path = Path(source_video).resolve()
        if str(source_video).startswith("blob:") or not source_path.is_file():
            raise FileNotFoundError(f"Source video file does not exist: {source_video}")

        info = probe_video(str(source_path))
        duration = end_time - start_time
        if duration <= 0:
            duration = min(35.0, info.duration)
            end_time = start_time + duration

        music_path = None
        if music and music.get("track_id"):
            from app.video.music_library import music_library
            music = dict(music)
            track = music_library.get_track(music["track_id"])
            music["start"] = float(music.get("start", 0))
            music["end"] = float(music.get("end") or track["duration"])
            music_library.validate_range(music["track_id"], music["start"], music["end"])
            music_path = str(music_library.resolve_file(music["track_id"]))
            for field, maximum in (("volume", 2), ("original_volume", 1),
                                   ("fade_in", duration), ("fade_out", duration)):
                value = float(music.get(field, 1 if field == "volume" else 0))
                if not math.isfinite(value):
                    raise ValueError(f"Music {field} must be a finite number.")
                music[field] = max(0.0, min(maximum, value))
            if video_audio_volume is not None:
                music["original_volume"] = video_audio_volume

        out_path = Path(output_mp4).resolve()
        if out_path.exists() and out_path.stat().st_size:
            raise FileExistsError(f"Output already exists: {out_path}. Choose a new filename.")
        out_path.parent.mkdir(parents=True, exist_ok=True)

        master_filters = []
        if info.has_audio and audio_master and audio_master.get("enabled"):
            if progress_callback:
                progress_callback(5.0, "Measuring and enhancing the selected song audio...")
            master_filters = enhancement_filters(str(source_path), start_time, duration)

        temp_dir = Path(__file__).resolve().parent.parent.parent / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        overlay_png = str(temp_dir / f"overlay_{int(time.time()*1000)}.png")
        hook_overlay_png = None
        hook_scene_mask_png = None
        try:
            requested_hook_start = max(0.0, float(hook_fade_start))
        except (TypeError, ValueError):
            requested_hook_start = 0.0
        hook_fade_active = requested_hook_start > 0 and requested_hook_start < duration
        hook_overlay_input_duration = duration
        hook_scene_mask_input_duration = duration

        # Reels render at true 4K vertical. Studio coordinates stay based on
        # a 1080-wide design canvas and are scaled only for the final render.
        if aspect_ratio == "16:9":
            canvas_w, canvas_h = 1920, 1080
        elif aspect_ratio == "1:1":
            canvas_w, canvas_h = 1080, 1080
        else:
            canvas_w, canvas_h = 2160, 3840

        # Pass actual video dimensions so text overlay border and positioning match exactly
        template.setdefault("video", {})["video_width"] = info.width
        template.setdefault("video", {})["video_height"] = info.height

        # Configure template parameters
        bg_cfg = template.get("background", {})
        bg_type = str(bg_cfg.get("type", "black")).strip().lower()
        blur_val = bg_cfg.get("blur", 35)
        brightness = bg_cfg.get("brightness", -0.2)
        contrast = bg_cfg.get("contrast", 1.1)
        saturation = bg_cfg.get("saturation", 1.0)
        zoom = bg_cfg.get("zoom", 1.25)

        # 1. Create styled text overlay
        overlay_scale = canvas_w / 1080.0 if aspect_ratio == "9:16" else 1.0
        overlay_template = _scale_reel_layout(template, overlay_scale)
        overlay_watermark = _scale_reel_layout(watermark, overlay_scale) if watermark else watermark
        overlay_creator_badge = _scale_reel_layout(creator_badge, overlay_scale) if creator_badge else creator_badge
        scene_username_png = None
        username_cfg = overlay_watermark if isinstance(overlay_watermark, dict) else overlay_template.get("watermark", {})
        if username_cfg and username_cfg.get("enabled") and username_cfg.get("style") == "scene_blend" and str(username_cfg.get("text", "")).strip():
            scene_username_png = str(temp_dir / f"username_{time.time_ns()}.png")
            if template.get("studio_username_scene_mask") is not None:
                username_mask = _decode_studio_png(
                    template["studio_username_scene_mask"], canvas_w, canvas_h,
                    "Studio Scene Blend username mask",
                ).getchannel("A")
            else:
                username_mask = _scene_username_mask(canvas_w, canvas_h, username_cfg)
            username_mask.save(scene_username_png, "PNG")
        # The hook may be sent as a separate Studio-drawn layer so it can fade
        # independently without dimming the username or subtitle overlays.
        if template.get("studio_hook_overlay"):
            hook_overlay_png = str(temp_dir / f"hook_overlay_{time.time_ns()}.png")
            _decode_studio_png(
                template["studio_hook_overlay"], canvas_w, canvas_h, "Studio hook overlay"
            ).save(hook_overlay_png, "PNG")
            if hook_fade_active:
                hook_overlay_input_duration = min(
                    duration,
                    requested_hook_start + HOOK_FADE_DURATION + (1 / 30),
                )
        if template.get("studio_hook_scene_mask"):
            hook_scene_mask_png = str(temp_dir / f"hook_scene_mask_{time.time_ns()}.png")
            _decode_studio_png(
                template["studio_hook_scene_mask"], canvas_w, canvas_h, "Studio Scene Blend hook mask"
            ).save(hook_scene_mask_png, "PNG")
            if hook_fade_active:
                hook_scene_mask_input_duration = min(
                    duration,
                    requested_hook_start + HOOK_FADE_DURATION + (1 / 30),
                )

        self.create_text_overlay_image(
            canvas_width=canvas_w,
            canvas_height=canvas_h,
            series_text=series_text,
            song_name=song_name,
            anime_name=anime_name,
            caption=caption,
            template=overlay_template,
            output_png_path=overlay_png,
            watermark=overlay_watermark,
            creator_badge=overlay_creator_badge,
            bg_type=bg_type
        )

        vid_cfg = template.get("video", {})
        raw_v_offset = vid_cfg.get("vertical_offset")
        if raw_v_offset is None:
            v_offset = 0
        else:
            try:
                v_offset = int(raw_v_offset)
            except Exception:
                v_offset = 0
        if aspect_ratio == "9:16":
            v_offset = round(v_offset * overlay_scale)

        try:
            fg_scale = float(vid_cfg.get("scale", 1.0) or 1.0)
        except Exception:
            fg_scale = 1.0
        fg_scale = min(MAX_SONG_WINDOW_SCALE, max(0.10, fg_scale))
        try:
            raw_window_inset = float(vid_cfg.get("window_inset", 0) or 0)
        except Exception:
            raw_window_inset = 0
        window_inset = min(MAX_SONG_WINDOW_INSET, max(0, raw_window_inset)) * (canvas_w / 1080.0)
        border_shape = str(vid_cfg.get("border_shape", "")).lower()
        if border_shape not in {"curved", "circular", "straight"}:
            border_shape = "straight" if vid_cfg.get("curved_border", True) is False else "curved"
        curved_border = border_shape != "straight"
        circular_border = border_shape == "circular"
        try:
            c_radius = int(vid_cfg.get("corner_radius", 16) or 0) if curved_border else 0
        except Exception:
            c_radius = 16 if curved_border else 0
        if aspect_ratio == "9:16":
            c_radius = round(c_radius * overlay_scale)
        mask_png = None
        grading_filters = self.build_color_grading_filter(color_filter, filter_intensity, color_adjustments)

        if aspect_ratio == "16:9":
            if fg_scale >= 0.999 and bg_type not in ("black", "white") and not curved_border and not hide_regions:
                composite_filter = (
                    f"[0:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,"
                    f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2{grading_filters}[v_base];"
                    f"[v_base][1:v]overlay=0:0[vout]"
                )
            else:
                fg_w = int(1920 * fg_scale)
                src_aspect = (info.width / info.height) if (info.width and info.height and info.height > 0) else (16 / 9)
                fg_h = int(round(fg_w / src_aspect))
                if fg_h % 2 != 0: fg_h += 1
                if fg_w % 2 != 0: fg_w += 1
                fg_x = f"(1920-{fg_w})/2"
                fg_y = f"(1080-{fg_h})/2+({v_offset})"
                fg_x_px = (1920 - fg_w) // 2
                fg_y_px = (1080 - fg_h) // 2 + v_offset
                if bg_type in ("black", "white"):
                    bg_filter = f"color=c={bg_type}:s=1920x1080:d={duration}:r=30[bg];"
                    bg_filter = "[0:v]fps=30[vsrc];" + bg_filter
                    v_in_fg = "[vsrc]"
                else:
                    bg_w, bg_h = _cover_scale(info.width or 1920, info.height or 1080, 1920, 1080, zoom)
                    blur_r = max(1, round(blur_val / 4))
                    bg_filter = (
                        f"[0:v]fps=30,split=2[v_bg_in][v_fg_in];"
                        f"[v_bg_in]scale={bg_w}:{bg_h},"
                        f"crop=1920:1080,"
                        f"scale=480:270:flags=fast_bilinear,"
                        f"boxblur={blur_r}:{blur_r}:1,"
                        f"scale=1920:1080:flags=fast_bilinear,"
                        f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                    )
                    v_in_fg = "[v_fg_in]"
                if circular_border or (curved_border and c_radius > 0) or hide_regions:
                    mask_png = str(temp_dir / f"mask_{int(time.time()*1000)}.png")
                    _visible_rounded_mask(fg_w, fg_h, fg_x_px, fg_y_px, 1920, 1080, c_radius, circular=circular_border, hide_regions=hide_regions).save(mask_png, "PNG")
                    fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
                else:
                    fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg];"
                composite_filter = (
                    f"{bg_filter}{fg_filter}"
                    f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
                    f"[v_stage][1:v]overlay=0:0[vout]"
                )
        elif aspect_ratio == "1:1":
            fg_w = int(1080 * fg_scale * 0.95)
            src_aspect = (info.width / info.height) if (info.width and info.height and info.height > 0) else (16 / 9)
            fg_h = int(round(fg_w / src_aspect))
            if fg_h % 2 != 0: fg_h += 1
            if fg_w % 2 != 0: fg_w += 1
            fg_x = f"(1080-{fg_w})/2"
            fg_y = f"(1080-{fg_h})/2"
            fg_x_px = (1080 - fg_w) // 2
            fg_y_px = (1080 - fg_h) // 2
            if bg_type in ("black", "white"):
                bg_filter = f"color=c={bg_type}:s=1080x1080:d={duration}:r=30[bg];"
                bg_filter = "[0:v]fps=30[vsrc];" + bg_filter
                v_in_fg = "[vsrc]"
            else:
                bg_w, bg_h = _cover_scale(info.width or 1920, info.height or 1080, 1080, 1080, zoom)
                blur_r = max(1, round(blur_val / 4))
                bg_filter = (
                    f"[0:v]fps=30,split=2[v_bg_in][v_fg_in];"
                    f"[v_bg_in]scale={bg_w}:{bg_h},"
                    f"crop=1080:1080,"
                    f"scale=270:270:flags=fast_bilinear,"
                    f"boxblur={blur_r}:{blur_r}:1,"
                    f"scale=1080:1080:flags=fast_bilinear,"
                    f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                )
                v_in_fg = "[v_fg_in]"
            if circular_border or (curved_border and c_radius > 0) or hide_regions:
                mask_png = str(temp_dir / f"mask_{int(time.time()*1000)}.png")
                _visible_rounded_mask(fg_w, fg_h, fg_x_px, fg_y_px, 1080, 1080, c_radius, circular=circular_border, hide_regions=hide_regions).save(mask_png, "PNG")
                fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
            else:
                fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg];"
            composite_filter = (
                f"{bg_filter}{fg_filter}"
                f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
                f"[v_stage][1:v]overlay=0:0[vout]"
            )
        else:
            # 9:16 vertical
            vid_w = info.width or 1920
            vid_h = info.height or 1080
            fg_w, fg_h, fg_x_px, fg_y_px = _contain_geometry(
                vid_w, vid_h, canvas_w, canvas_h, fg_scale, v_offset)
            fg_x, fg_y = str(fg_x_px), str(fg_y_px)

            if bg_type in ("black", "white"):
                bg_filter = f"color=c={bg_type}:s={canvas_w}x{canvas_h}:d={duration}:r=30[bg];"
                bg_filter = "[0:v]fps=30[vsrc];" + bg_filter
                v_in_fg = "[vsrc]"
            else:
                bg_w, bg_h = _cover_scale(info.width or 1920, info.height or 1080, canvas_w, canvas_h, zoom)
                blur_r = max(1, round(blur_val / 4))
                blur_w, blur_h = canvas_w // 4, canvas_h // 4
                bg_filter = (
                    f"[0:v]fps=30,split=2[v_bg_in][v_fg_in];"
                    f"[v_bg_in]scale={bg_w}:{bg_h},"
                    f"crop={canvas_w}:{canvas_h},"
                    f"scale={blur_w}:{blur_h}:flags=fast_bilinear,"
                    f"boxblur={blur_r}:{blur_r}:1,"
                    f"scale={canvas_w}:{canvas_h}:flags=fast_bilinear,"
                    f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                )
                v_in_fg = "[v_fg_in]"
            if circular_border or (curved_border and c_radius > 0) or window_inset > 0 or hide_regions:
                mask_png = str(temp_dir / f"mask_{int(time.time()*1000)}.png")
                _visible_rounded_mask(
                    fg_w, fg_h, fg_x_px, fg_y_px, canvas_w, canvas_h,
                    c_radius if curved_border else 0, round(window_inset), circular=circular_border, hide_regions=hide_regions
                ).save(mask_png, "PNG")
                fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
            else:
                fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg];"
            composite_filter = (
                f"{bg_filter}{fg_filter}"
                f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
                f"[v_stage][1:v]overlay=0:0[vout]"
            )

        # The username belongs above the scene and below the normal titles/subtitles.
        input_paths = [str(source_path), overlay_png]
        if mask_png:
            input_paths.append(mask_png)
        if scene_username_png:
            username_input = len(input_paths)
            input_paths.append(scene_username_png)
            stage = "[v_base]" if "[v_base][1:v]overlay" in composite_filter else "[v_stage]"
            composite_filter = composite_filter.replace(
                f"{stage}[1:v]overlay=0:0[vout]",
                _scene_username_filter(stage, username_input) + ";[wm_scene][1:v]overlay=0:0[vout]",
            )

        # Scene Blend hooks use their transparent Studio text layer as an
        # alpha mask, then brighten the actual footage beneath it per frame.
        # This keeps the hook colourful and visible instead of baking white
        # letters into the export.
        if hook_scene_mask_png:
            hook_scene_input = len(input_paths)
            input_paths.append(hook_scene_mask_png)
            stage = "[wm_scene]" if scene_username_png else ("[v_base]" if "[v_base][1:v]overlay" in composite_filter else "[v_stage]")
            mask_stream = f"[{hook_scene_input}:v]"
            if hook_fade_active:
                actual_hook_duration = min(HOOK_FADE_DURATION, max(0.05, duration - requested_hook_start))
                composite_filter += (
                    f";{mask_stream}loop=loop=-1:size=1:start=0,setpts=N/(30*TB),"
                    f"trim=duration={hook_scene_mask_input_duration:.3f},format=rgba,"
                    f"fade=t=out:st={requested_hook_start:.3f}:d={actual_hook_duration:.3f}:alpha=1[hook_scene_fade]"
                )
                mask_stream = "[hook_scene_fade]"
            composite_filter = composite_filter.replace(
                f"{stage}[1:v]overlay=0:0[vout]",
                _scene_hook_filter(stage, mask_stream) + ";[hook_scene][1:v]overlay=0:0[vout]",
            )

        # Put the separately-rendered hook above the base Studio layer. It is
        # static when its requested fade starts after this clip, preserving the
        # useful "keep it until the end" behavior on a shorter trim.
        v_out_tag = "[vout]"
        if hook_overlay_png:
            hook_input = len(input_paths)
            input_paths.append(hook_overlay_png)
            if hook_fade_active:
                actual_hook_duration = min(HOOK_FADE_DURATION, max(0.05, duration - requested_hook_start))
                composite_filter += (
                    f";[{hook_input}:v]loop=loop=-1:size=1:start=0,setpts=N/(30*TB),"
                    f"trim=duration={hook_overlay_input_duration:.3f},format=rgba,"
                    f"fade=t=out:st={requested_hook_start:.3f}:d={actual_hook_duration:.3f}:alpha=1[hook_fade];"
                    f"{v_out_tag}[hook_fade]overlay=0:0:eof_action=pass[vhook]"
                )
            else:
                composite_filter += f";{v_out_tag}[{hook_input}:v]overlay=0:0[vhook]"
            v_out_tag = "[vhook]"

        # Check if ASS subtitles should be burned
        ass_path = None
        if show_lyrics and lyrics:
            temp_ass_full = str((temp_dir / f"sub_{int(time.time()*1000)}.ass").resolve())
            sub_col = subtitle_color or template.get("subtitles", {}).get("color")
            sub_col_en = subtitle_color_en or template.get("subtitles", {}).get("color_en")
            if self.create_ass_subtitles(lyrics, start_time, duration, temp_ass_full, style_preset=subtitle_style, subtitle_animation=subtitle_animation, aspect_ratio=aspect_ratio, subtitle_color=sub_col, subtitle_color_en=sub_col_en, bg_type=bg_type, subtitle_language=subtitle_language or "both", subtitle_y=subtitle_y, subtitle_font_size=subtitle_font_size, subtitle_x=subtitle_x, subtitle_font=subtitle_font):
                ass_path = temp_ass_full
                ass_escaped = temp_ass_full.replace("\\", "/").replace(":", r"\:")
                composite_filter += f";{v_out_tag}ass='{ass_escaped}'[vfinal]"
                v_out_tag = "[vfinal]"

        # Video Fade In / Fade Out (Black Screen Transition)
        fade_filters = []
        if fade_in and fade_duration > 0:
            actual_in_d = round(min(fade_duration, duration / 2), 2)
            fade_filters.append(f"fade=t=in:st=0:d={actual_in_d}")
        if fade_out and fade_duration > 0:
            actual_out_d = round(min(fade_duration, duration / 2), 2)
            st_out = round(max(0.0, duration - actual_out_d), 2)
            fade_filters.append(f"fade=t=out:st={st_out}:d={actual_out_d}")

        if fade_filters:
            fade_chain = ",".join(fade_filters)
            composite_filter += f";{v_out_tag}{fade_chain}[vfaded]"
            v_out_tag = "[vfaded]"

        if (color_filter or "").strip().lower() == "intel_custom":
            # Keep the new RGB look in RGB through every overlay. The overlay
            # filter defaults to YUV/BT.601, which would change the graded RGB
            # values before they are finally labelled BT.709.
            composite_filter = re.sub(
                r"overlay=([^;\[]+)",
                lambda match: "overlay=" + match.group(1) + ":format=rgb",
                composite_filter,
            )

        # PNG overlays and the canvas-style composite do not reliably retain
        # source colour metadata. Set it on the final video stream itself,
        # rather than only on the encoder, so x264 writes the complete BT.709
        # VUI tags that mobile players use for brightness and saturation.
        composite_filter += (
            f";{v_out_tag}scale=in_range=auto:out_range=tv:out_color_matrix=bt709,"
            "format=yuv420p,setparams=range=limited:color_primaries=bt709:"
            "color_trc=bt709:colorspace=bt709[vcolor]"
        )
        v_out_tag = "[vcolor]"

        use_nvenc = _has_nvenc()

        cmd = ["ffmpeg", "-y"]

        cmd.extend([
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", input_paths[0],
        ])
        for image_input in input_paths[1:]:
            # Decode each 4K PNG once. Static overlays hold their last frame;
            # fading hooks repeat that decoded frame in a bounded loop filter.
            # Looping the input instead would decode the PNG 30 times a second.
            if image_input == hook_overlay_png or image_input == hook_scene_mask_png:
                cmd.extend(["-framerate", "30", "-i", image_input])
            else:
                cmd.extend(["-i", image_input])

        music_input = len(input_paths)
        if music_path:
            cmd.extend(["-ss", str(music["start"]), "-t", str(music["end"] - music["start"]),
                        "-i", music_path])

        if not info.has_audio and not music_path:
            cmd.extend([
                "-f", "lavfi",
                "-t", str(duration),
                "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"
            ])

        # The silent lavfi input follows the optional rounded-corner mask input.
        silent_audio_input = len(input_paths)

        a_out_tag = "0:a"
        if info.has_audio:
            audio_filters = list(master_filters)
            if video_audio_volume is not None and not music_path:
                audio_filters.append(f"volume={video_audio_volume:.6f}")
            if smart_loop and loop_mode != "none":
                fade_len = min(loop_fade_duration, duration / 4, 0.25)
                st_tail = max(0.0, duration - fade_len)
                audio_filters.extend([
                    f"afade=t=in:st=0:d={fade_len}:curve=qsin",
                    f"afade=t=out:st={st_tail}:d={fade_len}:curve=qsin",
                ])
            else:
                micro_out = max(0.0, duration - 0.02)
                audio_filters.extend([
                    "afade=t=in:st=0:d=0.02:curve=qsin",
                    f"afade=t=out:st={micro_out}:d=0.02:curve=qsin",
                ])

            audio_label = "a_master" if audio_master and audio_master.get("enabled") else "a_clean"
            composite_filter += f";[0:a]{','.join(audio_filters)}[{audio_label}]"
            a_out_tag = f"[{audio_label}]"

        if music_path:
            composite_filter += ";" + _music_audio_filter(
                music_input, music, duration, a_out_tag if info.has_audio else None
            )
            a_out_tag = "[a_mix]"

        cmd.extend([
            "-filter_complex", composite_filter,
            "-map", v_out_tag,
            # `-t` before the source input limits only that input. A looping
            # hook overlay can otherwise keep the filter graph alive after the
            # selected clip ends when the source contains audio. Apply the
            # selected duration to the output as the final boundary.
            "-t", f"{duration:.3f}",
            "-r", "30"
        ])

        if info.has_audio or music_path:
            cmd.extend(["-map", a_out_tag, "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "44100"])
        else:
            cmd.extend(["-map", f"{silent_audio_input}:a", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100", "-shortest"])

        # Video encoder: use the RTX GPU when its one-time smoke test succeeds.
        # p2 and single-pass keep 4K exports responsive while CQ 19 and the
        # existing 20–30 Mbps bitrate envelope retain the intended quality.
        if use_nvenc:
            cmd.extend([
                "-c:v", "h264_nvenc",
                "-gpu", "0",
                "-preset", "p2",
                "-multipass", "disabled",
                "-rc", "vbr",
                "-cq", "19",
                "-b:v", "20M",
                "-maxrate", "30M",
                "-bufsize", "40M",
                # The browser monitor displays the source as sRGB/BT.709.
                # Explicitly tag the composited H.264 output the same way so
                # players do not guess a different transfer curve or range.
                "-color_range", "tv",
                "-colorspace", "bt709",
                "-color_primaries", "bt709",
                "-color_trc", "bt709",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-progress", "pipe:1",
                "-nostats",
                str(out_path)
            ])
        else:
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "18",
                "-threads", "0",
                "-color_range", "tv",
                "-colorspace", "bt709",
                "-color_primaries", "bt709",
                "-color_trc", "bt709",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-progress", "pipe:1",
                "-nostats",
                str(out_path)
            ])

        if progress_callback:
            progress_callback(10.0, "Starting FFmpeg render...")

        # Run FFmpeg process with CPU fallback and guaranteed cleanup
        try:
            logger.info("FFmpeg filter_complex:\n%s", composite_filter)
            logger.info("FFmpeg command: %s", ' '.join(cmd))

            def _execute_ffmpeg(run_cmd: list) -> tuple[int, str]:
                proc = subprocess.Popen(
                    run_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True,
                    encoding="utf-8",
                    errors="replace"
                )
                err_lines = []
                def _read_err():
                    try:
                        for l in proc.stderr:
                            err_lines.append(l)
                    except Exception:
                        pass
                t = threading.Thread(target=_read_err, daemon=True)
                t.start()

                last_p = 10.0
                last_t = 0.0
                if proc.stdout:
                    for l in proc.stdout:
                        l = l.strip()
                        if l.startswith("out_time_us="):
                            try:
                                curr_sec = int(l.split("=", 1)[1]) / 1_000_000.0
                                p = 10.0 + (min(1.0, curr_sec / duration) * 88.0) if duration > 0 else 50.0
                                now = time.time()
                                if (now - last_t >= 0.25 or p - last_p >= 1.0) and progress_callback:
                                    last_p = p
                                    last_t = now
                                    progress_callback(round(p, 1), f"Rendering reel: {curr_sec:.1f}s / {duration:.1f}s ({p:.0f}%)")
                            except Exception:
                                pass
                        elif l == "progress=end" and progress_callback:
                            progress_callback(99.0, "Finalizing reel export...")
                proc.wait()
                t.join(timeout=3.0)
                return proc.returncode, "".join(err_lines)

            code, stderr = _execute_ffmpeg(cmd)

            # If NVENC failed, automatically retry with CPU libx264
            if code != 0 and use_nvenc:
                logger.warning("NVENC GPU encoding failed. Automatically falling back to CPU libx264...")
                cpu_cmd = []
                skip = False
                for i, arg in enumerate(cmd):
                    if skip:
                        skip = False
                        continue
                    if arg == "-hwaccel":
                        skip = True
                        continue
                    if arg == "-c:v" and i + 1 < len(cmd) and cmd[i+1] == "h264_nvenc":
                        cpu_cmd.extend(["-c:v", "libx264", "-preset", "fast", "-crf", "20", "-threads", "0"])
                        skip = True
                        continue
                    if arg in ("-gpu", "-preset", "-multipass", "-rc", "-cq", "-b:v", "-maxrate", "-bufsize"):
                        skip = True
                        continue
                    cpu_cmd.append(arg)

                if progress_callback:
                    progress_callback(12.0, "NVENC failed, switching to fast CPU encoder...")
                code, stderr = _execute_ffmpeg(cpu_cmd)

            if code != 0:
                raise RuntimeError(f"FFmpeg rendering failed: {stderr[-1000:] if stderr else 'Unknown error'}")

            if progress_callback:
                progress_callback(100.0, "Export completed successfully!")

            return str(out_path)

        finally:
            try:
                if os.path.exists(overlay_png):
                    os.remove(overlay_png)
                if ass_path and os.path.exists(ass_path):
                    os.remove(ass_path)
                if mask_png and os.path.exists(mask_png):
                    os.remove(mask_png)
                if scene_username_png and os.path.exists(scene_username_png):
                    os.remove(scene_username_png)
                if hook_overlay_png and os.path.exists(hook_overlay_png):
                    os.remove(hook_overlay_png)
                if hook_scene_mask_png and os.path.exists(hook_scene_mask_png):
                    os.remove(hook_scene_mask_png)
            except Exception:
                pass

VideoRenderer = ReelRenderer
renderer = ReelRenderer()
