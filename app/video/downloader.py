import os
import re
import sys
import json
import time
import shutil
import threading
import hashlib
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Callable

# Global download tasks registry
DOWNLOAD_TASKS: Dict[str, Dict[str, Any]] = {}

def get_downloads_dir() -> Path:
    """Returns the directory where downloaded YouTube videos are stored."""
    downloads_dir = Path(__file__).resolve().parent.parent.parent / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    return downloads_dir

PLAYER_CLIENT_STRATEGIES = [
    ['android', 'web'],
    ['android', 'ios'],
    ['mweb', 'android'],
    ['ios', 'mweb'],
]

def find_cookies_file() -> Optional[str]:
    """Finds a cookies.txt file in the workspace or config directory if present."""
    workspace_root = Path(__file__).resolve().parent.parent.parent
    cookie_candidates = [
        workspace_root / "cookies.txt",
        workspace_root / "youtube_cookies.txt",
        workspace_root / "cookies" / "cookies.txt",
        workspace_root / "downloads" / "cookies.txt",
    ]
    for c in cookie_candidates:
        if c.exists() and c.stat().st_size > 10:
            return str(c.resolve())
    return None

def format_yt_error(err: Any) -> str:
    """Provides clear, actionable guidance if YouTube blocks default client requests."""
    msg = str(err)
    if any(k in msg for k in ["Sign in to confirm you", "not a bot", "HTTP Error 429", "Sign in to confirm your age"]):
        return (
            "YouTube blocked this request with bot/sign-in verification. "
            "To bypass this, place an exported 'cookies.txt' file in your project folder, "
            "or use another video link / local MP4 file."
        )
    return msg

def sanitize_filename(name: str) -> str:
    """Replaces illegal Windows filename characters with underscores."""
    sanitized = re.sub(r'[\\/*?:"<>|]', "_", name).strip()
    return sanitized if sanitized else f"yt_video_{int(time.time())}"


def download_cache_stem(info: Dict[str, Any], url: str) -> str:
    """Keep distinct source videos separate even when their display titles match."""
    video_id = info.get("video_id")
    identity = f"{info.get('extractor') or 'youtube'}:{video_id}" if video_id else url.strip()
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
    return f"{sanitize_filename(info.get('title') or 'video')[:150]}_{digest}"

def parse_title_heuristics(title: str) -> Dict[str, str]:
    """
    Attempts to guess anime name and song title from common YouTube anime OP/ED video titles.
    e.g.
    'Chainsaw Man Opening - KICK BACK' -> anime: Chainsaw Man, song: KICK BACK
    'KICK BACK - Kenshi Yonezu (Chainsaw Man OP)' -> song: KICK BACK, anime: Chainsaw Man
    'Oshi no Ko - Idol by YOASOBI' -> anime: Oshi no Ko, song: Idol
    '【LIVE映像】結束バンド「ギターと孤独と蒼い惑星」 / 「ぼっち・ざ・ろっく！」劇中曲' -> song: ギターと孤独と蒼い惑星, anime: ぼっち・ざ・ろっく！
    """
    cleaned = title.strip()

    # 1. Check for Japanese anime title quotes: e.g. 結束バンド「ギターと孤独と蒼い惑星」 / 「ぼっち・ざ・ろっく！」劇中曲
    jp_quotes = re.findall(r'「([^」]+)」', cleaned)
    if len(jp_quotes) >= 2:
        if re.search(r'「' + re.escape(jp_quotes[1]) + r'」\s*(?:劇中曲|主題歌|OP|ED|アニメ|挿入歌)', cleaned):
            return {
                "song_name": jp_quotes[0].strip(),
                "anime_name": jp_quotes[1].strip()
            }
        elif re.search(r'「' + re.escape(jp_quotes[0]) + r'」\s*(?:劇中曲|主題歌|OP|ED|アニメ|挿入歌)', cleaned):
            return {
                "song_name": jp_quotes[1].strip(),
                "anime_name": jp_quotes[0].strip()
            }
        else:
            return {
                "song_name": jp_quotes[0].strip(),
                "anime_name": jp_quotes[1].strip()
            }
    elif len(jp_quotes) == 1:
        song_candidate = jp_quotes[0].strip()
        rest = re.sub(r'【[^】]+】|「[^」]+」', '', cleaned).strip(" /|-")
        anime_candidate = re.sub(r'\b(LIVE|Official|MV|Full|HD|4K|Audio|Video|at\s+\w+)\b', '', rest, flags=re.IGNORECASE).strip(" /|-")
        return {
            "song_name": song_candidate,
            "anime_name": anime_candidate or "Anime"
        }

    # Remove meta brackets
    cleaned = re.sub(r'【[^】]+】', '', cleaned).strip()

    # 2. Check for standard brackets like (Anime Name OP) or [Anime Name]
    bracket_match = re.search(r'[\(\[]([^\)\]]+(?:OP|ED|Opening|Ending|OST|Theme)[^\)\]]*)[\)\]]', cleaned, re.IGNORECASE)
    anime_guess = ""
    song_guess = cleaned
    if bracket_match:
        tag = bracket_match.group(1)
        anime_guess = re.sub(r'\b(OP\d*|ED\d*|Opening\d*|Ending\d*|Theme|OST|Song|Full|HD|4K|Official|Video|Audio)\b', '', tag, flags=re.IGNORECASE).strip()
        cleaned = cleaned.replace(bracket_match.group(0), "").strip()

    # 3. Split by delimiter if present
    for delim in [" - ", " – ", " — ", " | ", " / "]:
        if delim in cleaned:
            parts = [p.strip() for p in cleaned.split(delim) if p.strip()]
            if len(parts) >= 2:
                if not anime_guess:
                    if any(k in parts[0].lower() for k in ["op", "ed", "opening", "ending"]):
                        anime_guess = re.sub(r'\b(OP\d*|ED\d*|Opening\d*|Ending\d*)\b', '', parts[0], flags=re.IGNORECASE).strip()
                        song_guess = parts[1]
                    else:
                        anime_guess = parts[0]
                        song_guess = parts[1]
                else:
                    song_guess = parts[0]
                break

    # Clean leftover keywords from guesses
    song_clean = re.sub(r'\b(OP\d*|ED\d*|Opening\d*|Ending\d*|Official Music Video|MV|Full Song|Lyrics|HD|4K)\b', '', song_guess, flags=re.IGNORECASE).strip(" -[]()_")
    anime_clean = re.sub(r'\b(OP\d*|ED\d*|Opening\d*|Ending\d*|Season \d+|Part \d+)\b', '', anime_guess, flags=re.IGNORECASE).strip(" -[]()_")

    return {
        "song_name": song_clean or song_guess,
        "anime_name": anime_clean or anime_guess
    }

class YouTubeDownloader:
    """Manages YouTube video downloading with progress tracking."""

    @staticmethod
    def get_video_info(url: str) -> Dict[str, Any]:
        """Extracts title, duration, author without downloading."""
        url = url.strip()
        cookies_file = find_cookies_file()
        last_err = None

        # 1. Try python yt_dlp with robust player_client fallbacks (bypasses bot blocks)
        try:
            import yt_dlp
            for clients in PLAYER_CLIENT_STRATEGIES:
                try:
                    ydl_opts = {
                        'quiet': True,
                        'no_warnings': True,
                        'skip_download': True,
                        'extractor_args': {'youtube': {'player_client': clients}}
                    }
                    if cookies_file:
                        ydl_opts['cookiefile'] = cookies_file
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                        title = info.get('title', 'Unknown Title')
                        duration = info.get('duration', 0)
                        channel = info.get('uploader', info.get('channel', 'Unknown'))
                        heuristics = parse_title_heuristics(title)
                        return {
                            "video_id": info.get("id"),
                            "extractor": info.get("extractor_key") or info.get("extractor"),
                            "title": title,
                            "duration": duration,
                            "channel": channel,
                            "song_name": heuristics["song_name"],
                            "anime_name": heuristics["anime_name"],
                            "thumbnail": info.get('thumbnail', '')
                        }
                except Exception as e:
                    last_err = e
                    continue
        except ImportError:
            pass

        # 2. Try python module CLI fallback with player_client strategies
        for clients in PLAYER_CLIENT_STRATEGIES:
            client_str = ",".join(clients)
            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--dump-single-json",
                "--skip-download",
                "--no-warnings",
                "--extractor-args", f"youtube:player_client={client_str}",
                "--js-runtimes", "node",
                url
            ]
            if cookies_file:
                cmd.extend(["--cookies", cookies_file])
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding="utf-8", errors="replace")
                info = json.loads(res.stdout)
                title = info.get('title', 'Unknown Title')
                duration = info.get('duration', 0)
                channel = info.get('uploader', info.get('channel', 'Unknown'))
                heuristics = parse_title_heuristics(title)
                return {
                    "video_id": info.get("id"),
                    "extractor": info.get("extractor_key") or info.get("extractor"),
                    "title": title,
                    "duration": duration,
                    "channel": channel,
                    "song_name": heuristics["song_name"],
                    "anime_name": heuristics["anime_name"],
                    "thumbnail": info.get('thumbnail', '')
                }
            except Exception as err:
                last_err = err
                continue

        raise RuntimeError(f"Could not retrieve video information: {format_yt_error(last_err)}")

    @staticmethod
    def download_video(
        url: str,
        task_id: str,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Any]:
        """Downloads YouTube video as high quality MP4 to the downloads directory."""
        downloads_dir = get_downloads_dir()
        
        # 1. Update task state
        DOWNLOAD_TASKS[task_id]["status"] = "fetching_info"
        DOWNLOAD_TASKS[task_id]["progress"] = 5.0
        DOWNLOAD_TASKS[task_id]["message"] = "Fetching video details..."
        if progress_callback:
            progress_callback(5.0, "Fetching video details...")

        # 2. Extract info
        info = YouTubeDownloader.get_video_info(url)
        safe_title = download_cache_stem(info, url)
        target_template = str(downloads_dir / f"{safe_title}.%(ext)s")
        target_mp4 = str(downloads_dir / f"{safe_title}.mp4")

        DOWNLOAD_TASKS[task_id]["status"] = "downloading"
        DOWNLOAD_TASKS[task_id]["progress"] = 10.0
        DOWNLOAD_TASKS[task_id]["title"] = info.get("title")
        DOWNLOAD_TASKS[task_id]["song_name"] = info.get("song_name")
        DOWNLOAD_TASKS[task_id]["anime_name"] = info.get("anime_name")
        DOWNLOAD_TASKS[task_id]["duration"] = info.get("duration")

        # Check if already downloaded
        if Path(target_mp4).exists() and Path(target_mp4).stat().st_size > 100000:
            compat_file = ensure_browser_compatible(target_mp4, progress_callback, force=True)
            DOWNLOAD_TASKS[task_id]["status"] = "completed"
            DOWNLOAD_TASKS[task_id]["progress"] = 100.0
            DOWNLOAD_TASKS[task_id]["message"] = "Video ready from cache!"
            DOWNLOAD_TASKS[task_id]["file_path"] = compat_file
            if progress_callback:
                progress_callback(100.0, "Video ready!")
            return {
                "file_path": compat_file,
                "title": info.get("title"),
                "song_name": info.get("song_name"),
                "anime_name": info.get("anime_name"),
                "duration": info.get("duration")
            }

        # Prefer 1080p H.264/AAC for 100% browser HTML5 and canvas compatibility
        yt_format = (
            "bestvideo[height<=1080][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/"
            "bestvideo[height<=1080][vcodec^=avc1]+bestaudio/"
            "bestvideo[height<=1080]+bestaudio/"
            "best[height<=1080][ext=mp4]/"
            "best"
        )

        cookies_file = find_cookies_file()

        # 3. Try python yt_dlp first with player client fallbacks
        has_python_yt = False
        try:
            import yt_dlp
            def hook(d):
                if d['status'] == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    downloaded = d.get('downloaded_bytes') or 0
                    if total > 0:
                        pct = min(90.0, 10.0 + (downloaded / total) * 80.0)
                        speed = d.get('speed', 0)
                        speed_mb = (speed / (1024 * 1024)) if speed else 0.0
                        msg = f"Downloading: {pct:.1f}% ({speed_mb:.1f} MB/s)"
                        DOWNLOAD_TASKS[task_id]["progress"] = pct
                        DOWNLOAD_TASKS[task_id]["message"] = msg
                        if progress_callback:
                            progress_callback(pct, msg)
                elif d['status'] == 'finished':
                    DOWNLOAD_TASKS[task_id]["progress"] = 92.0
                    DOWNLOAD_TASKS[task_id]["message"] = "Processing video format..."
                    if progress_callback:
                        progress_callback(92.0, "Processing video...")

            for clients in PLAYER_CLIENT_STRATEGIES:
                try:
                    ydl_opts = {
                        'format': yt_format,
                        'outtmpl': target_template,
                        'merge_output_format': 'mp4',
                        'progress_hooks': [hook],
                        'quiet': True,
                        'no_warnings': True,
                        'extractor_args': {'youtube': {'player_client': clients}}
                    }
                    if cookies_file:
                        ydl_opts['cookiefile'] = cookies_file

                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])
                    has_python_yt = True
                    break
                except Exception as e_dl:
                    print(f"[YouTubeDownloader] Download with {clients} failed: {e_dl}")
                    continue

        except ImportError:
            has_python_yt = False

        if not has_python_yt:
            # Fall back to yt-dlp module CLI via subprocess
            DOWNLOAD_TASKS[task_id]["message"] = "Downloading via yt-dlp engine..."
            cli_success = False
            last_cli_err = None
            for clients in PLAYER_CLIENT_STRATEGIES:
                client_str = ",".join(clients)
                cmd = [
                    sys.executable, "-m", "yt_dlp",
                    "-f", yt_format,
                    "--merge-output-format", "mp4",
                    "--newline",
                    "--extractor-args", f"youtube:player_client={client_str}",
                    "--js-runtimes", "node",
                    "-o", target_template,
                    url
                ]
                if cookies_file:
                    cmd.extend(["--cookies", cookies_file])

                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1
                )

                err_lines = []
                for line in process.stdout:
                    line_str = line.strip()
                    err_lines.append(line_str)
                    pct_match = re.search(r'\[download\]\s+([\d\.]+)%', line_str)
                    if pct_match:
                        p = float(pct_match.group(1))
                        mapped_p = min(90.0, 10.0 + (p / 100.0) * 80.0)
                        DOWNLOAD_TASKS[task_id]["progress"] = mapped_p
                        DOWNLOAD_TASKS[task_id]["message"] = f"Downloading: {p:.1f}%"
                        if progress_callback:
                            progress_callback(mapped_p, f"Downloading: {p:.1f}%")

                process.wait()
                if process.returncode == 0:
                    cli_success = True
                    break
                else:
                    last_cli_err = "\n".join(err_lines[-5:])

            if not cli_success:
                raise RuntimeError(format_yt_error(last_cli_err or "Download failed"))

        # Check for actual output file (.mp4, or .mkv if fallback)
        final_file = None
        if Path(target_mp4).exists():
            final_file = target_mp4
        else:
            for f in downloads_dir.glob(f"{safe_title}.*"):
                if f.suffix.lower() in [".mp4", ".mkv", ".webm"]:
                    final_file = str(f.resolve())
                    break

        if not final_file:
            raise FileNotFoundError("Downloaded video file was not created.")

        # Ensure video is encoded with H.264/AAC for 100% browser HTML5 playback
        final_file = ensure_browser_compatible(final_file, progress_callback, force=True)

        DOWNLOAD_TASKS[task_id]["status"] = "completed"
        DOWNLOAD_TASKS[task_id]["progress"] = 100.0
        DOWNLOAD_TASKS[task_id]["message"] = "Download Complete!"
        DOWNLOAD_TASKS[task_id]["file_path"] = final_file
        if progress_callback:
            progress_callback(100.0, "Download Complete!")

        return {
            "file_path": final_file,
            "title": info.get("title"),
            "song_name": info.get("song_name"),
            "anime_name": info.get("anime_name"),
            "duration": info.get("duration")
        }

def ensure_browser_compatible(file_path: str, progress_callback: Optional[Callable[[float, str], None]] = None, force: bool = False) -> str:
    """
    Ensures video is H.264 (AVC) with AAC audio, closed GOP (keyframe every 30 frames),
    faststart headers, and <=1080p so HTML5 <video> and canvas can reliably play,
    scrub, and seek without decoder pipeline crashes on Windows browsers.
    """
    from app.video.probe import probe_video
    src = Path(file_path).resolve()
    if not src.exists():
        return str(src)

    # Already an optimized file
    if src.stem.endswith("_h264"):
        return str(src)

    out_compat = src.parent / f"{src.stem}_h264.mp4"

    # Check if an already converted file exists and is valid
    if out_compat.exists() and out_compat.stat().st_size > 100000:
        try:
            compat_info = probe_video(str(out_compat))
            compat_audio_ok = not compat_info.has_audio or compat_info.audio_codec.lower() in ["aac", "mp4a"]
            if compat_info.video_codec.lower() in ["h264", "avc1"] and compat_audio_ok and compat_info.duration > 0:
                return str(out_compat)
        except Exception:
            out_compat.unlink(missing_ok=True)

    try:
        info = probe_video(str(src))
        is_h264 = info.video_codec.lower() in ["h264", "avc1"]
        is_aac = not info.has_audio or info.audio_codec.lower() in ["aac", "mp4a"]
        is_res_ok = info.height <= 1080 and info.width <= 1920

        if not force and is_h264 and is_aac and is_res_ok:
            return str(src)

        if progress_callback:
            progress_callback(95.0, "Optimizing video codec for browser playback...")

        out_tmp = src.parent / f"{src.stem}_h264.tmp.mp4"
        out_tmp.unlink(missing_ok=True)

        # Prefer NVENC hardware acceleration on NVIDIA GPUs, fallback to ultrafast libx264
        # Force closed GOP keyframes (-g 30 -keyint_min 3) for buttery-smooth instant scrubbing
        nvenc_cmd = [
            "ffmpeg", "-y",
            "-i", str(src),
            "-c:v", "h264_nvenc",
            "-preset", "p4",
            "-cq", "23",
            "-pix_fmt", "yuv420p",
            "-g", "30",
            "-keyint_min", "3",
            "-vf", "scale=-2:1080:force_original_aspect_ratio=decrease",
            "-c:a", "aac",
            "-b:a", "192k",
            "-movflags", "+faststart",
            str(out_tmp)
        ]

        success = False
        try:
            subprocess.run(nvenc_cmd, capture_output=True, check=True)
            success = True
        except Exception:
            cpu_cmd = [
                "ffmpeg", "-y",
                "-i", str(src),
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "22",
                "-pix_fmt", "yuv420p",
                "-g", "30",
                "-keyint_min", "3",
                "-vf", "scale=-2:1080:force_original_aspect_ratio=decrease",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                str(out_tmp)
            ]
            subprocess.run(cpu_cmd, capture_output=True, check=True)
            success = True

        if success and out_tmp.exists() and out_tmp.stat().st_size > 100000:
            if out_compat.exists():
                out_compat.unlink(missing_ok=True)
            out_tmp.rename(out_compat)
            return str(out_compat)
    except Exception as e:
        print(f"[Browser Compatibility Check] Note: {e}")
    return str(src)

downloader = YouTubeDownloader()
