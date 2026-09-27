import os
import time
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from PIL import Image, ImageDraw
from app.video.renderer import renderer
from app.video.probe import probe_video
from app.video.renderer import _cover_scale

def extract_preview_frame(video_path: str, timestamp: float, output_image_path: str) -> str:
    path = Path(video_path).resolve()
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")
        
    out_p = Path(output_image_path).resolve()
    out_p.parent.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(timestamp),
        "-i", str(path),
        "-vframes", "1",
        "-q:v", "2",
        str(out_p)
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return str(out_p)

def render_preview_still(
    source_video: str,
    timestamp: float,
    series_text: str,
    song_name: str,
    anime_name: str,
    caption: str,
    template: Dict[str, Any],
    output_image_path: str,
    aspect_ratio: str = "9:16"
) -> str:
    """Generates a composite still frame representing the exact video appearance."""
    source_path = Path(source_video).resolve()
    out_p = Path(output_image_path).resolve()
    out_p.parent.mkdir(parents=True, exist_ok=True)
    
    temp_dir = Path(__file__).resolve().parent.parent.parent / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    overlay_png = str(temp_dir / f"preview_overlay_{int(time.time()*1000)}.png")

    if aspect_ratio == "16:9":
        canvas_w, canvas_h = 1920, 1080
    elif aspect_ratio == "1:1":
        canvas_w, canvas_h = 1080, 1080
    else:
        canvas_w, canvas_h = 1080, 1920

    try:
        info = probe_video(source_video)
        vid_w = info.width or 1920
        vid_h = info.height or 1080
    except Exception:
        vid_w, vid_h = 1920, 1080

    template.setdefault("video", {})["video_width"] = vid_w
    template.setdefault("video", {})["video_height"] = vid_h

    renderer.create_text_overlay_image(
        canvas_width=canvas_w,
        canvas_height=canvas_h,
        series_text=series_text,
        song_name=song_name,
        anime_name=anime_name,
        caption=caption,
        template=template,
        output_png_path=overlay_png
    )
    
    bg_cfg = template.get("background", {})
    bg_type = str(bg_cfg.get("type", "blur")).strip().lower()
    blur_val = bg_cfg.get("blur", 35)
    brightness = bg_cfg.get("brightness", -0.2)
    contrast = bg_cfg.get("contrast", 1.1)
    saturation = bg_cfg.get("saturation", 1.0)
    zoom = bg_cfg.get("zoom", 1.25)

    vid_cfg = template.get("video", {})
    v_offset = vid_cfg.get("vertical_offset", 0 if aspect_ratio == "16:9" else -40)
    fg_scale = vid_cfg.get("scale", 1.0)
    curved_border = vid_cfg.get("curved_border", True)
    c_radius = int(vid_cfg.get("corner_radius", 16)) if curved_border else 0
    mask_png = None

    if aspect_ratio == "16:9":
        if fg_scale >= 0.999 and bg_type not in ("black", "white"):
            composite_filter = (
                f"[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
                f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v_base];"
                f"[v_base][1:v]overlay=0:0[vout]"
            )
        else:
            fg_w = int(1920 * fg_scale)
            fg_h = int(round(fg_w * vid_h / vid_w))
            if fg_h % 2 != 0: fg_h += 1
            if fg_w % 2 != 0: fg_w += 1
            fg_x = f"(1920-{fg_w})/2"
            fg_y = f"(1080-{fg_h})/2+({v_offset})"
            if bg_type in ("black", "white"):
                bg_filter = f"color=c={bg_type}:s=1920x1080:d=1:r=30[bg];"
            else:
                bg_w, bg_h = _cover_scale(vid_w, vid_h, 1920, 1080, zoom)
                blur_r = max(1, round(blur_val / 4))
                bg_filter = (
                    f"[0:v]scale={bg_w}:{bg_h},"
                    f"crop=1920:1080,"
                    f"scale=480:270:flags=fast_bilinear,"
                    f"boxblur={blur_r}:{blur_r}:1,"
                    f"scale=1920:1080:flags=fast_bilinear,"
                    f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
                )
            if curved_border and c_radius > 0:
                eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
                mask_png = str(temp_dir / f"preview_mask_{int(time.time()*1000)}.png")
                mask_img = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
                mask_draw = ImageDraw.Draw(mask_img)
                mask_draw.rounded_rectangle([0, 0, fg_w, fg_h], radius=eff_rad, fill=(255, 255, 255, 255))
                mask_img.save(mask_png, "PNG")
                fg_filter = f"[0:v]scale={fg_w}:{fg_h}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
            else:
                fg_filter = f"[0:v]scale={fg_w}:{fg_h}[fg];"
            composite_filter = (
                f"{bg_filter}{fg_filter}"
                f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
                f"[v_stage][1:v]overlay=0:0[vout]"
            )
    elif aspect_ratio == "1:1":
        fg_w = int(1080 * fg_scale * 0.95)
        fg_h = int(round(fg_w * vid_h / vid_w))
        if fg_h % 2 != 0: fg_h += 1
        if fg_w % 2 != 0: fg_w += 1
        fg_x = f"(1080-{fg_w})/2"
        fg_y = f"(1080-{fg_h})/2"
        if bg_type in ("black", "white"):
            bg_filter = f"color=c={bg_type}:s=1080x1080:d=1:r=30[bg];"
        else:
            bg_w, bg_h = _cover_scale(vid_w, vid_h, 1080, 1080, zoom)
            blur_r = max(1, round(blur_val / 4))
            bg_filter = (
                f"[0:v]scale={bg_w}:{bg_h},"
                f"crop=1080:1080,"
                f"scale=270:270:flags=fast_bilinear,"
                f"boxblur={blur_r}:{blur_r}:1,"
                f"scale=1080:1080:flags=fast_bilinear,"
                f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
            )
        if curved_border and c_radius > 0:
            eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
            mask_png = str(temp_dir / f"preview_mask_{int(time.time()*1000)}.png")
            mask_img = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
            mask_draw = ImageDraw.Draw(mask_img)
            mask_draw.rounded_rectangle([0, 0, fg_w, fg_h], radius=eff_rad, fill=(255, 255, 255, 255))
            mask_img.save(mask_png, "PNG")
            fg_filter = f"[0:v]scale={fg_w}:{fg_h}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
        else:
            fg_filter = f"[0:v]scale={fg_w}:{fg_h}[fg];"
        composite_filter = (
            f"{bg_filter}{fg_filter}"
            f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
            f"[v_stage][1:v]overlay=0:0[vout]"
        )
    else:
        # 9:16 vertical
        fg_w = int(1080 * fg_scale)
        fg_h = int(round(fg_w * vid_h / vid_w))
        if fg_h % 2 != 0: fg_h += 1
        if fg_w % 2 != 0: fg_w += 1
        fg_x = f"(1080-{fg_w})/2"
        fg_y = f"(1920-{fg_h})/2+({v_offset})"
        if bg_type in ("black", "white"):
            bg_filter = f"color=c={bg_type}:s=1080x1920:d=1:r=30[bg];"
        else:
            bg_w, bg_h = _cover_scale(vid_w, vid_h, 1080, 1920, zoom)
            blur_r = max(1, round(blur_val / 4))
            bg_filter = (
                f"[0:v]scale={bg_w}:{bg_h},"
                f"crop=1080:1920,"
                f"scale=270:480:flags=fast_bilinear,"
                f"boxblur={blur_r}:{blur_r}:1,"
                f"scale=1080:1920:flags=fast_bilinear,"
                f"eq=brightness={brightness}:contrast={contrast}:saturation={saturation}[bg];"
            )
        if curved_border and c_radius > 0:
            eff_rad = min(c_radius, fg_w // 2, fg_h // 2)
            mask_png = str(temp_dir / f"preview_mask_{int(time.time()*1000)}.png")
            mask_img = Image.new("RGBA", (fg_w, fg_h), (0, 0, 0, 0))
            mask_draw = ImageDraw.Draw(mask_img)
            mask_draw.rounded_rectangle([0, 0, fg_w, fg_h], radius=eff_rad, fill=(255, 255, 255, 255))
            mask_img.save(mask_png, "PNG")
            fg_filter = f"[0:v]scale={fg_w}:{fg_h}[fg_raw];[2:v]scale={fg_w}:{fg_h}[fg_mask];[fg_raw][fg_mask]alphamerge[fg];"
        else:
            fg_filter = f"[0:v]scale={fg_w}:{fg_h}[fg];"
        composite_filter = (
            f"{bg_filter}{fg_filter}"
            f"[bg][fg]overlay={fg_x}:{fg_y}[v_stage];"
            f"[v_stage][1:v]overlay=0:0[vout]"
        )

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(timestamp),
        "-i", str(source_path),
        "-i", overlay_png
    ]
    if mask_png:
        cmd.extend(["-i", mask_png])
    cmd.extend([
        "-filter_complex", composite_filter,
        "-map", "[vout]",
        "-vframes", "1",
        "-q:v", "2",
        str(out_p)
    ])
    try:
        subprocess.run(cmd, capture_output=True, check=True)
    finally:
        if mask_png and os.path.exists(mask_png):
            try:
                os.remove(mask_png)
            except Exception:
                pass
        if os.path.exists(overlay_png):
            try:
                os.remove(overlay_png)
            except Exception:
                pass
    return str(out_p)
