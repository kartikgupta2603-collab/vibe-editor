import logging
import math
import os
import sys
import subprocess
import tempfile
import time
import threading
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from PIL import Image, ImageChops, ImageDraw, ImageFont

from app.video.probe import probe_video
from app.ai.gemini_client import compute_word_timings

logger = logging.getLogger(__name__)


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


# --- GPU acceleration detection (cached) ---
_gpu_cache: Dict[str, Optional[bool]] = {}

def _has_nvenc() -> bool:
    """Check if h264_nvenc encoder is available."""
    if "nvenc" not in _gpu_cache:
        try:
            r = subprocess.run(
                ["ffmpeg", "-hide_banner", "-encoders"],
                capture_output=True, text=True, timeout=5
            )
            _gpu_cache["nvenc"] = "h264_nvenc" in r.stdout
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
                if "bold" in clean or "black" in clean:
                    font_candidates.extend([fonts_dir / "segoeuib.ttf", fonts_dir / "seguisb.ttf"])
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
            if s_cfg.get("enabled", True) and series_text.strip():
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
            # 1. SERIES TEXT / VIRAL HOOK (Top)
            s_cfg = template.get("series_text", {})
            if s_cfg.get("enabled", True) and series_text.strip():
                s_font_name = s_cfg.get("font", "Arial-Bold").split("-")[0].lower()
                s_size = int(s_cfg.get("size", 34))
                s_has_emoji = any(c in '⚡🔥✨🌙' or ord(c) >= 0x1F000 for c in series_text)
                s_font = get_font(s_font_name, s_size, has_emoji=s_has_emoji)
                
                text_lines = series_text.upper().split("\n")
                line_height = s_size * 1.3
                total_h = len(text_lines) * line_height

                if "y" in s_cfg and s_cfg["y"] is not None:
                    start_y = int(s_cfg["y"])
                else:
                    s_y_percent = s_cfg.get("y_percent", 18) / 100.0
                    start_y = int(canvas_height * s_y_percent - total_h / 2)
                
                custom_x = s_cfg.get("x")
                
                for i, line in enumerate(text_lines):
                    bbox = draw.textbbox((0, 0), line, font=s_font)
                    w = bbox[2] - bbox[0]
                    if custom_x is not None:
                        x = int(custom_x - w // 2)
                    else:
                        x = (canvas_width - w) // 2
                    y = int(start_y + i * line_height)
                    if bg_type == "white":
                        s_color = s_cfg.get("color") if (s_cfg.get("color") and is_dark_hex(s_cfg.get("color"))) else "#0284c7"
                        line_color = s_color if i == 0 else "#0f172a"
                    else:
                        s_color = s_cfg.get("color") if (s_cfg.get("color") and not is_dark_hex(s_cfg.get("color"))) else "#38bdf8"
                        line_color = s_color if i == 0 else "#ffffff"
                    # Shadow
                    if bg_type != "white":
                        draw.text((x + 2, y + 2), line, font=s_font, fill=(0, 0, 0, 180))
                    draw.text((x, y), line, font=s_font, fill=line_color)

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
        v_offset = vid_cfg.get("vertical_offset", 0 if is_landscape else -40)
        fg_scale = vid_cfg.get("scale", 1.0)

        fg_x, fg_y = 0, 0
        if not is_landscape or fg_scale < 0.999:
            fg_w = int(canvas_width * fg_scale * (0.95 if canvas_width == canvas_height else 1.0))
            vid_w = vid_cfg.get("video_width") or 16
            vid_h = vid_cfg.get("video_height") or 9
            fg_h = int(round(fg_w * vid_h / vid_w))
            if fg_h % 2 != 0: fg_h += 1
            if fg_w % 2 != 0: fg_w += 1
            fg_x = (canvas_width - fg_w) // 2
            fg_y = (canvas_height - fg_h) // 2 + v_offset
            b_col = (0, 0, 0, 38) if bg_type == "white" else (255, 255, 255, 75)
            if c_radius > 0:
                eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
                draw.rounded_rectangle([fg_x, fg_y, fg_x + fg_w, fg_y + fg_h], radius=eff_rad, outline=b_col, width=2)
            else:
                draw.rectangle([fg_x, fg_y, fg_x + fg_w, fg_y + fg_h], outline=b_col, width=2)
        else:
            fg_x = 48
            fg_y = 36

        # 4. USERNAME WATERMARK (Clean text watermark)
        if isinstance(watermark, dict):
            wm_cfg = watermark
        elif watermark is True:
            wm_cfg = {"enabled": True, "text": "@animesongs"}
        else:
            wm_cfg = template.get("watermark", {}) or {}

        if wm_cfg and wm_cfg.get("enabled", False) and wm_cfg.get("text", "").strip():
            wm_text = wm_cfg.get("text", "").strip()
            wm_size = int(wm_cfg.get("size", 28))
            wm_font = get_font("arial-bold", wm_size)
            if bg_type == "white":
                wm_color = wm_cfg.get("color") if (wm_cfg.get("color") and is_dark_hex(wm_cfg.get("color"))) else "#0f172a"
            else:
                wm_color = wm_cfg.get("color") if (wm_cfg.get("color") and not is_dark_hex(wm_cfg.get("color"))) else "#ffffff"
            default_wm_x = fg_x + 35 if not is_landscape else 60
            default_wm_y = fg_y + 45 if not is_landscape else 50
            wm_x = int(wm_cfg["x"]) if ("x" in wm_cfg and wm_cfg["x"] is not None) else default_wm_x
            wm_y = int(wm_cfg["y"]) if ("y" in wm_cfg and wm_cfg["y"] is not None) else default_wm_y
            if bg_type != "white":
                draw.text((wm_x + 1, wm_y + 2), wm_text, font=wm_font, fill=(0, 0, 0, 180))
            draw.text((wm_x, wm_y), wm_text, font=wm_font, fill=wm_color)

        # 4b. CREATOR PROFILE HEADER (avatar above display name, handle, and follow CTA)
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
            follow_text = "Follow for more"
            handle_size = max(13, round(badge_size * 0.48))
            handle_font = get_font("arial-bold", handle_size)
            handle_line = f"{badge_text}  •  {follow_text}"
            handle_bbox = draw.textbbox((0, 0), handle_line, font=handle_font)
            handle_w = handle_bbox[2] - handle_bbox[0]
            total_w = max(avatar_d, display_w, handle_w)
            total_h = avatar_d + spacing + display_size + max(3, round(badge_size * 0.12)) + handle_size
            top_y = cb_y - total_h // 2

            # 1. Composite the circular Laplace avatar at the top.
            av_x = cb_x - avatar_d // 2
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

            # 2. Draw the display name and handle beneath the avatar.
            name_y = av_y + avatar_d + spacing
            handle_y = name_y + display_size + max(3, round(badge_size * 0.12))
            name_bbox = draw.textbbox((0, 0), display_name, font=display_font)
            handle_bbox = draw.textbbox((0, 0), handle_line, font=handle_font)
            name_x = cb_x - (name_bbox[2] - name_bbox[0]) // 2
            handle_x = cb_x - (handle_bbox[2] - handle_bbox[0]) // 2
            if bg_type != "white":
                draw.text((name_x + 1, name_y + 2), display_name, font=display_font, fill=(0, 0, 0, 200))
            draw.text((name_x, name_y), display_name, font=display_font, fill=badge_color)

            follow_color = "#475569" if bg_type == "white" else "#dbeafe"
            draw.text((handle_x, handle_y), handle_line, font=handle_font, fill=follow_color)

        img.save(output_png_path, "PNG")
        return output_png_path

    def create_ass_subtitles(
        self,
        lyrics: list,
        clip_start: float,
        clip_duration: float,
        output_ass_path: str,
        style_preset: str = "minimal",
        aspect_ratio: str = "9:16",
        subtitle_color: Optional[str] = None,
        subtitle_color_en: Optional[str] = None,
        bg_type: str = "blur",
        subtitle_language: str = "both",
        subtitle_y: Optional[int] = None,
        subtitle_font_size: Optional[float] = None,
        subtitle_x: Optional[float] = None
    ) -> bool:
        """Generates an Advanced SubStation Alpha (ASS) dual-language subtitle file with chosen visual preset and aspect ratio."""
        if not lyrics:
            return False

        sub_lang = (subtitle_language or "both").lower()

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
        else:
            if not subtitle_color or is_dark_hex(subtitle_color):
                sub_col = "&H00FFFFFF"
            else:
                sub_col = hex_to_ass_color(subtitle_color, default="&H00FFFFFF")
            outline_col = "&H00000000"
            shadow_col = "&H80000000"

        # Subtitle Presets (both Japanese & English subtitles always use the same color)
        if bg_type == "white":
            if style_preset == "minimal":
                jp_style = f"Style: Japanese,Yu Gothic,36,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,0.8,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,24,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.3,0,1,0.6,0.0,2,40,40,{en_v},1"
            elif style_preset == "bold_lyrics":
                jp_style = f"Style: Japanese,Yu Gothic,42,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.8,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,28,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.4,0.0,2,40,40,{en_v},1"
            elif style_preset in ("neon_glow", "retro_90s", "karaoke", "cinematic", "impact", "lofi_pastel"):
                jp_style = f"Style: Japanese,Yu Gothic,39,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.2,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.0,0.0,2,40,40,{en_v},1"
            elif style_preset == "anime":
                jp_style = f"Style: Japanese,Yu Gothic,39,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.2,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.0,0.0,2,40,40,{en_v},1"
            else:
                jp_style = f"Style: Japanese,Yu Gothic,38,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.8,0,1,1.2,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,{outline_col},{shadow_col},-1,0,0,0,100,100,0.5,0,1,1.0,0.0,2,40,40,{en_v},1"
        else:
            if style_preset == "minimal":
                jp_style = f"Style: Japanese,Yu Gothic,36,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,1.0,2.5,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,24,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.3,0,1,0.8,2.0,2,40,40,{en_v},1"
            elif style_preset == "bold_lyrics":
                jp_style = f"Style: Japanese,Yu Gothic,42,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,5.5,2.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,28,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,4.5,2.0,2,40,40,{en_v},1"
            elif style_preset == "neon_glow":
                neon_col = "&H00FFF000" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Yu Gothic,42,{neon_col},&H000000FF,&H001F1A00,&H70FFF000,-1,0,0,0,100,100,1.0,0,1,3.0,0.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{neon_col},&H000000FF,&H001F1A00,&H70FFF000,-1,0,0,0,100,100,0.5,0,1,2.0,0.0,2,40,40,{en_v},1"
            elif style_preset == "retro_90s":
                retro_col = "&H0000DEFF" if not custom_ass_color else sub_col
                jp_style = f"Style: Japanese,Arial,40,{retro_col},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.5,0,1,3.5,1.5,2,40,40,{jp_v},1"
                en_style = f"Style: English,Arial,26,{retro_col},&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0.3,0,1,2.5,1.0,2,40,40,{en_v},1"
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
                outline_anime = "&H00000000" if custom_ass_color else "&H00B672F4"
                jp_style = f"Style: Japanese,Yu Gothic,39,{sub_col},&H000000FF,{outline_anime},&H90000000,-1,0,0,0,100,100,0.8,0,1,4.0,3.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,3.0,1.5,2,40,40,{en_v},1"
            else:
                jp_style = f"Style: Japanese,Yu Gothic,38,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.8,0,1,4.5,2.0,2,40,40,{jp_v},1"
                en_style = f"Style: English,Segoe UI,26,{sub_col},&H000000FF,&H00000000,&H90000000,-1,0,0,0,100,100,0.5,0,1,3.0,1.5,2,40,40,{en_v},1"

        font_scale = max(0.1, min(10.0, float(subtitle_font_size) / 38.0)) if subtitle_font_size is not None else 1.0
        if font_scale != 1.0:
            def scale_style(style: str) -> str:
                fields = style.split(",")
                for index in (2, 12, 16, 17):
                    fields[index] = f"{float(fields[index]) * font_scale:g}"
                return ",".join(fields)
            jp_style = scale_style(jp_style)
            en_style = scale_style(en_style)

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
        is_already_relative = False
        if clip_start > 2.0 and lyrics:
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
                max_c = 22 if has_japanese else 42
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
            en_line_h = round((36 if aspect_ratio == "9:16" else 28) * font_scale)

            if formatted_jp and not formatted_en:
                dyn_jp_v = (jp_v + en_v) // 2
                dyn_en_v = en_v
            elif formatted_en and not formatted_jp:
                dyn_jp_v = jp_v
                dyn_en_v = (jp_v + en_v) // 2
            else:
                dyn_jp_v = en_v + (en_lines_count * en_line_h) + round(16 * font_scale)
                dyn_en_v = en_v

            jp_position = en_position = ""
            if subtitle_x is not None:
                center_x = max(0, min(res_x, float(subtitle_x)))
                jp_position = f"{{\\pos({center_x:g},{res_y - dyn_jp_v})}}"
                en_position = f"{{\\pos({center_x:g},{res_y - dyn_en_v})}}"

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
                            word_duration = float(item.get("end")) - float(item.get("start"))
                        except (TypeError, ValueError):
                            timings = []
                            break
                        if not word or word_duration <= 0:
                            timings = []
                            break
                        timings.append((word, word_duration))

                normalized_tokens = [token.lower() if not is_jp else token for token in tokens]
                normalized_timing_words = [word.lower() if not is_jp else word for word, _ in timings]
                if len(timings) == len(tokens) and normalized_timing_words == normalized_tokens:
                    weights = [duration for _, duration in timings]
                else:
                    # Phrase-level estimates cannot truthfully drive a word-level
                    # karaoke sweep. Keep the subtitle synchronized as one cue.
                    return text

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

            if formatted_jp:
                if style_preset == "karaoke":
                    trusted_jp_words = line.get("words_jp") if line.get("timing_source") == "audio_aligned" else None
                    k_jp = apply_ass_karaoke(formatted_jp, e - s, True, trusted_jp_words)
                    events.append(f"Dialogue: 1,{time_start},{time_end},Japanese,,0,0,{dyn_jp_v},,{jp_position}{k_jp}")
                else:
                    events.append(f"Dialogue: 1,{time_start},{time_end},Japanese,,0,0,{dyn_jp_v},,{jp_position}{{\\fad(220,150)}}{formatted_jp}")
            if formatted_en:
                display_en = formatted_en.upper() if style_preset == "bold_lyrics" else formatted_en
                if style_preset == "karaoke":
                    trusted_en_words = line.get("words_en") if line.get("timing_source") == "audio_aligned" else None
                    k_en = apply_ass_karaoke(display_en, e - s, False, trusted_en_words)
                    events.append(f"Dialogue: 2,{time_start},{time_end},English,,0,0,{dyn_en_v},,{en_position}{k_en}")
                else:
                    events.append(f"Dialogue: 2,{time_start},{time_end},English,,0,0,{dyn_en_v},,{en_position}{{\\fad(220,150)}}{display_en}")

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
        intensity = max(0.0, min(1.0, (filter_intensity if filter_intensity is not None else 100.0) / 100.0))
        f_name = (color_filter or "original").lower().strip()

        # Base adjustments
        b_adj = float(adj.get("brightness", 0)) / 100.0   # -0.5 to 0.5
        c_adj = float(adj.get("contrast", 100)) / 100.0   # 0.5 to 1.6
        s_adj = float(adj.get("saturation", 100)) / 100.0 # 0.0 to 2.0
        warmth = float(adj.get("warmth", 0))              # -50 to 50
        vignette_val = float(adj.get("vignette", 0))      # 0 to 100

        # Filter preset deltas
        f_contrast = 0.0
        f_saturate = 0.0
        f_brightness = 0.0
        f_grayscale = False
        cb_rs, cb_gs, cb_bs = 0.0, 0.0, 0.0

        if f_name == "clarendon":
            f_contrast, f_saturate, f_brightness = 0.20, 0.25, 0.03
            cb_rs, cb_bs = 0.05, 0.08
        elif f_name == "crema":
            f_contrast, f_saturate, f_brightness = 0.05, -0.10, 0.02
            cb_rs, cb_gs, cb_bs = 0.10, 0.05, -0.10
        elif f_name == "gingham":
            f_contrast, f_saturate, f_brightness = -0.08, -0.15, 0.05
            cb_rs, cb_bs = 0.05, -0.05
        elif f_name == "juno":
            f_contrast, f_saturate, f_brightness = 0.15, 0.35, 0.02
            cb_rs, cb_gs, cb_bs = 0.15, 0.05, -0.10
        elif f_name == "lark":
            f_contrast, f_saturate, f_brightness = 0.10, 0.15, 0.05
            cb_rs, cb_bs = -0.05, 0.10
        elif f_name == "ludwig":
            f_contrast, f_saturate, f_brightness = 0.12, 0.10, 0.02
            cb_rs, cb_gs, cb_bs = 0.10, 0.02, -0.08
        elif f_name == "moon":
            f_contrast, f_saturate, f_brightness = 0.25, -1.0, 0.03
            f_grayscale = True
        elif f_name == "perpetua":
            f_contrast, f_saturate, f_brightness = 0.08, 0.10, 0.03
            cb_gs, cb_bs, cb_rs = 0.08, 0.08, -0.05
        elif f_name == "reyes":
            f_contrast, f_saturate, f_brightness = -0.10, -0.15, 0.08
            cb_rs, cb_gs, cb_bs = 0.15, 0.10, -0.15
        elif f_name == "slumber":
            f_contrast, f_saturate, f_brightness = 0.05, -0.25, 0.02
            cb_rs, cb_gs, cb_bs = 0.18, 0.08, -0.18
        elif f_name == "aden":
            f_contrast, f_saturate, f_brightness = -0.05, 0.10, 0.05
            cb_rs, cb_bs, cb_gs = 0.12, 0.10, -0.05
        elif f_name == "anime_vivid":
            f_contrast, f_saturate, f_brightness = 0.22, 0.40, 0.03
        elif f_name == "cyberpunk":
            f_contrast, f_saturate, f_brightness = 0.28, 0.45, 0.02
            cb_rs, cb_bs, cb_gs = 0.20, 0.25, -0.10

        # Calculate final eq parameters
        final_c = max(0.1, round(c_adj * (1.0 + f_contrast * intensity), 3))
        final_b = round(b_adj + (f_brightness * intensity), 3)
        if f_grayscale and intensity > 0.9:
            final_s = 0.0
        else:
            final_s = max(0.0, round(s_adj * (1.0 + f_saturate * intensity), 3))

        if abs(final_c - 1.0) > 0.01 or abs(final_b) > 0.005 or abs(final_s - 1.0) > 0.01:
            filters.append(f"eq=contrast={final_c}:brightness={final_b}:saturation={final_s}")

        # Color balance (warmth + preset tint)
        w_factor = warmth / 100.0
        final_rs = round((cb_rs * intensity) + (w_factor * 0.2 if w_factor > 0 else 0), 3)
        final_gs = round((cb_gs * intensity) + (w_factor * 0.05 if w_factor > 0 else 0), 3)
        final_bs = round((cb_bs * intensity) - (w_factor * 0.25 if w_factor > 0 else -w_factor * 0.25), 3)

        if abs(final_rs) > 0.01 or abs(final_gs) > 0.01 or abs(final_bs) > 0.01:
            filters.append(f"colorbalance=rs={final_rs}:gs={final_gs}:bs={final_bs}:rm={final_rs*0.5:.3f}:bm={final_bs*0.5:.3f}")

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
        subtitle_language: Optional[str] = "both",
        smart_loop: bool = True,
        loop_mode: str = "standard",
        loop_fade_duration: float = 0.35,
        fade_in: bool = False,
        fade_out: bool = False,
        fade_duration: float = 0.50,
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
        subtitle_x: Optional[float] = None
    ) -> str:
        """Renders video in 16:9 Landscape, 9:16 Vertical, or 1:1 Square using FFmpeg."""
        source_path = Path(source_video).resolve()
        if str(source_video).startswith("blob:") or not source_path.is_file():
            raise FileNotFoundError(f"Source video file does not exist: {source_video}")

        info = probe_video(str(source_path))
        duration = end_time - start_time
        if duration <= 0:
            duration = min(35.0, info.duration)
            end_time = start_time + duration

        out_path = Path(output_mp4).resolve()
        if out_path.exists() and out_path.stat().st_size:
            raise FileExistsError(f"Output already exists: {out_path}. Choose a new filename.")
        out_path.parent.mkdir(parents=True, exist_ok=True)

        temp_dir = Path(__file__).resolve().parent.parent.parent / "temp"
        temp_dir.mkdir(parents=True, exist_ok=True)
        overlay_png = str(temp_dir / f"overlay_{int(time.time()*1000)}.png")

        # Resolve output resolution based on aspect_ratio
        if aspect_ratio == "16:9":
            canvas_w, canvas_h = 1920, 1080
        elif aspect_ratio == "1:1":
            canvas_w, canvas_h = 1080, 1080
        else:
            canvas_w, canvas_h = 1080, 1920

        # Pass actual video dimensions so text overlay border and positioning match exactly
        template.setdefault("video", {})["video_width"] = info.width
        template.setdefault("video", {})["video_height"] = info.height

        # Configure template parameters
        bg_cfg = template.get("background", {})
        bg_type = str(bg_cfg.get("type", "blur")).strip().lower()
        blur_val = bg_cfg.get("blur", 35)
        brightness = bg_cfg.get("brightness", -0.2)
        contrast = bg_cfg.get("contrast", 1.1)
        saturation = bg_cfg.get("saturation", 1.0)
        zoom = bg_cfg.get("zoom", 1.25)

        # 1. Create styled text overlay
        self.create_text_overlay_image(
            canvas_width=canvas_w,
            canvas_height=canvas_h,
            series_text=series_text,
            song_name=song_name,
            anime_name=anime_name,
            caption=caption,
            template=template,
            output_png_path=overlay_png,
            watermark=watermark,
            creator_badge=creator_badge,
            bg_type=bg_type
        )

        vid_cfg = template.get("video", {})
        raw_v_offset = vid_cfg.get("vertical_offset")
        if raw_v_offset is None:
            v_offset = 0 if aspect_ratio == "16:9" else -40
        else:
            try:
                v_offset = int(raw_v_offset)
            except Exception:
                v_offset = 0 if aspect_ratio == "16:9" else -40

        try:
            fg_scale = float(vid_cfg.get("scale", 1.0) or 1.0)
        except Exception:
            fg_scale = 1.0
        curved_border = vid_cfg.get("curved_border", True)
        try:
            c_radius = int(vid_cfg.get("corner_radius", 16) or 0) if curved_border else 0
        except Exception:
            c_radius = 16 if curved_border else 0
        mask_png = None
        grading_filters = self.build_color_grading_filter(color_filter, filter_intensity, color_adjustments)

        if aspect_ratio == "16:9":
            if fg_scale >= 0.999 and bg_type not in ("black", "white"):
                composite_filter = (
                    f"[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
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
                if bg_type in ("black", "white"):
                    bg_filter = f"color=c={bg_type}:s=1920x1080:d={duration}:r=30[bg];"
                    v_in_fg = "[0:v]"
                else:
                    bg_w, bg_h = _cover_scale(info.width or 1920, info.height or 1080, 1920, 1080, zoom)
                    blur_r = max(1, round(blur_val / 4))
                    bg_filter = (
                        f"[0:v]split=2[v_bg_in][v_fg_in];"
                        f"[v_bg_in]scale={bg_w}:{bg_h},"
                        f"crop=1920:1080,"
                        f"scale=480:270:flags=fast_bilinear,"
                        f"boxblur={blur_r}:{blur_r}:1,"
                        f"scale=1920:1080:flags=fast_bilinear,"
                        f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                    )
                    v_in_fg = "[v_fg_in]"
                if curved_border and c_radius > 0:
                    eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
                    mask_png = str(temp_dir / f"mask_{int(time.time()*1000)}.png")
                    mask_img = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
                    mask_draw = ImageDraw.Draw(mask_img)
                    mask_draw.rounded_rectangle([0, 0, fg_w, fg_h], radius=eff_rad, fill=(255, 255, 255, 255))
                    mask_img.save(mask_png, "PNG")
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
            if bg_type in ("black", "white"):
                bg_filter = f"color=c={bg_type}:s=1080x1080:d={duration}:r=30[bg];"
                v_in_fg = "[0:v]"
            else:
                bg_w, bg_h = _cover_scale(info.width or 1920, info.height or 1080, 1080, 1080, zoom)
                blur_r = max(1, round(blur_val / 4))
                bg_filter = (
                    f"[0:v]split=2[v_bg_in][v_fg_in];"
                    f"[v_bg_in]scale={bg_w}:{bg_h},"
                    f"crop=1080:1080,"
                    f"scale=270:270:flags=fast_bilinear,"
                    f"boxblur={blur_r}:{blur_r}:1,"
                    f"scale=1080:1080:flags=fast_bilinear,"
                    f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                )
                v_in_fg = "[v_fg_in]"
            if curved_border and c_radius > 0:
                eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
                mask_png = str(temp_dir / f"mask_{int(time.time()*1000)}.png")
                mask_img = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
                mask_draw = ImageDraw.Draw(mask_img)
                mask_draw.rounded_rectangle([0, 0, fg_w, fg_h], radius=eff_rad, fill=(255, 255, 255, 255))
                mask_img.save(mask_png, "PNG")
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
            fg_w = int(1080 * fg_scale)
            # Adapt frame height to actual natural video aspect ratio so the video is never cut and background fits cleanly
            vid_w = info.width or 1920
            vid_h = info.height or 1080
            fg_h = int(round(fg_w * vid_h / vid_w))
            if fg_h % 2 != 0: fg_h += 1
            if fg_w % 2 != 0: fg_w += 1
            fg_y = f"(1920-{fg_h})/2+({v_offset})"
            fg_x = f"(1080-{fg_w})/2"

            if bg_type in ("black", "white"):
                bg_filter = f"color=c={bg_type}:s=1080x1920:d={duration}:r=30[bg];"
                v_in_fg = "[0:v]"
            else:
                bg_w, bg_h = _cover_scale(info.width or 1920, info.height or 1080, 1080, 1920, zoom)
                blur_r = max(1, round(blur_val / 4))
                bg_filter = (
                    f"[0:v]split=2[v_bg_in][v_fg_in];"
                    f"[v_bg_in]scale={bg_w}:{bg_h},"
                    f"crop=1080:1920,"
                    f"scale=270:480:flags=fast_bilinear,"
                    f"boxblur={blur_r}:{blur_r}:1,"
                    f"scale=1080:1920:flags=fast_bilinear,"
                    f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                )
                v_in_fg = "[v_fg_in]"
            if curved_border and c_radius > 0:
                eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
                mask_png = str(temp_dir / f"mask_{int(time.time()*1000)}.png")
                mask_img = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
                mask_draw = ImageDraw.Draw(mask_img)
                mask_draw.rounded_rectangle([0, 0, fg_w, fg_h], radius=eff_rad, fill=(255, 255, 255, 255))
                mask_img.save(mask_png, "PNG")
                fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
            else:
                fg_filter = f"{v_in_fg}scale={fg_w}:{fg_h}{grading_filters}[fg];"
            composite_filter = (
                f"{bg_filter}{fg_filter}"
                f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
                f"[v_stage][1:v]overlay=0:0[vout]"
            )

        # Check if ASS subtitles should be burned
        ass_path = None
        v_out_tag = "[vout]"
        if show_lyrics and lyrics:
            temp_ass_full = str((temp_dir / f"sub_{int(time.time()*1000)}.ass").resolve())
            sub_col = subtitle_color or template.get("subtitles", {}).get("color")
            sub_col_en = subtitle_color_en or template.get("subtitles", {}).get("color_en")
            if self.create_ass_subtitles(lyrics, start_time, duration, temp_ass_full, style_preset=subtitle_style, aspect_ratio=aspect_ratio, subtitle_color=sub_col, subtitle_color_en=sub_col_en, bg_type=bg_type, subtitle_language=subtitle_language or "both", subtitle_y=subtitle_y, subtitle_font_size=subtitle_font_size, subtitle_x=subtitle_x):
                ass_path = temp_ass_full
                ass_escaped = temp_ass_full.replace("\\", "/").replace(":", r"\:")
                composite_filter += f";[vout]ass='{ass_escaped}'[vfinal]"
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

        use_nvenc = _has_nvenc()

        cmd = ["ffmpeg", "-y"]

        cmd.extend([
            "-ss", str(start_time),
            "-t", str(duration),
            "-i", str(source_path),
            "-i", overlay_png
        ])
        if mask_png:
            cmd.extend(["-i", mask_png])

        if not info.has_audio:
            cmd.extend([
                "-f", "lavfi",
                "-t", str(duration),
                "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"
            ])

        # The silent lavfi input follows the optional rounded-corner mask input.
        silent_audio_input = 3 if mask_png else 2

        a_out_tag = "0:a"
        if info.has_audio:
            if smart_loop and loop_mode != "none":
                fade_len = min(loop_fade_duration, duration / 4, 0.25)
                st_tail = max(0.0, duration - fade_len)
                loop_audio_filter = (
                    f"[0:a]afade=t=in:st=0:d={fade_len}:curve=qsin,afade=t=out:st={st_tail}:d={fade_len}:curve=qsin[a_loop]"
                )
                composite_filter += f";{loop_audio_filter}"
                a_out_tag = "[a_loop]"
            else:
                micro_out = max(0.0, duration - 0.02)
                clean_audio_filter = f"[0:a]afade=t=in:st=0:d=0.02:curve=qsin,afade=t=out:st={micro_out}:d=0.02:curve=qsin[a_clean]"
                composite_filter += f";{clean_audio_filter}"
                a_out_tag = "[a_clean]"

        cmd.extend([
            "-filter_complex", composite_filter,
            "-map", v_out_tag,
            "-r", "30"
        ])

        if info.has_audio:
            cmd.extend(["-map", a_out_tag, "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "44100"])
        else:
            cmd.extend(["-map", f"{silent_audio_input}:a", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100", "-shortest"])

        # Video encoder: NVENC GPU or CPU fallback
        if use_nvenc:
            cmd.extend([
                "-c:v", "h264_nvenc",
                "-preset", "p4",
                "-rc", "vbr",
                "-cq", "22",
                "-b:v", "8M",
                "-maxrate", "12M",
                "-bufsize", "16M",
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
                "-crf", "20",
                "-threads", "0",
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
                    if arg in ("-preset", "-rc", "-cq", "-b:v", "-maxrate", "-bufsize"):
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
            except Exception:
                pass

VideoRenderer = ReelRenderer
renderer = ReelRenderer()
