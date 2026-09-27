---
name: reel-video-pipeline
description: Use when working on video/audio downloading, FFprobe media inspection, FFmpeg 9:16 vertical video rendering, subtitle burn-in, audio synchronization, letterbox/smart-crop filtering, or preview generation.
---

# Reel Video Pipeline Skill

This skill governs all media manipulation, inspection, and rendering tasks within the Anime Song Reel Creator.

## Architecture & Modules
- **`app/video/downloader.py`**: Stream downloading via `yt-dlp` and direct media fetchers.
- **`app/video/probe.py`**: Media probing via `ffprobe`. Returns duration, resolution, codecs, and stream layouts.
- **`app/video/preview.py`**: Fast, lightweight video previews for UI scrubbing (low bitrate, fast seek).
- **`app/video/renderer.py`**: Core FFmpeg export engine: handles 1080x1920 9:16 canvas, letterbox/smart crop, subtitle burn-in, audio ducking/mix, and MP4 generation.

## Media Processing Rules
1. **Dynamic Stream Indexing**: Never hardcode FFmpeg stream indices (e.g. `[0:v]`, `[1:a]`). Always calculate indices dynamically from the actual input list.
2. **Defensive Probe Parsing**: Treat FFprobe fields as optional. Handle missing audio tracks, variable frame rates, or unusual pixel formats gracefully.
3. **Format & Codec Standards**:
   - Final Export: `1080x1920` (9:16 vertical video), `30 FPS`, `-c:v libx264`, `-c:a aac -b:a 192k`, `-pix_fmt yuv420p`, `-movflags +faststart`.
   - Hardware / Fast Presets: Use `-preset fast` or platform hardware acceleration (`h264_nvenc` / `h264_qsv` when available).
4. **Preview vs. Export Separation**:
   - Keep browser preview generation lightweight for responsive scrubbing.
   - Do NOT lower final export bitrate, resolution, or quality to fix preview performance.
5. **Temporary Files & Cleanup**:
   - Scratch files, slices, and temporary clips must always reside in `temp/` and be cleaned up in a `finally` block.
