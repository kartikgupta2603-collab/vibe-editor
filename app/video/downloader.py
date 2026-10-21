import os
import re
import sys
import json
import logging
import time
import shutil
import threading
import hashlib
import subprocess
import urllib.request
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Global download tasks registry
DOWNLOAD_TASKS: Dict[str, Dict[str, Any]] = {}

def get_downloads_dir() -> Path:
    """Returns the directory where downloaded YouTube videos are stored."""
    downloads_dir = Path(__file__).resolve().parent.parent.parent / "downloads"
    downloads_dir.mkdir(parents=True, exist_ok=True)
    return downloads_dir

PLAYER_CLIENT_STRATEGIES = [
    ['default'],
    ['mweb'],
    ['web_safari'],
    ['web_embedded'],
    ['android', 'web'],
    ['android', 'ios'],
    ['mweb', 'android'],
    ['ios', 'mweb'],
]

# Download the source at the highest quality exposed by the provider. Browser
# compatibility is handled separately without changing the source resolution.
YOUTUBE_STUDIO_FORMAT = (
    "bestvideo+bestaudio/"
    "best"
)
DOWNLOAD_CONCURRENCY = 4
DOWNLOAD_RETRIES = 2
TWITTER_CACHE_PROFILE = "twitter_best_v2"
BGUTIL_PROVIDER_URL = "http://127.0.0.1:4416"
BGUTIL_SERVER_DIR = Path(__file__).resolve().parent.parent.parent / ".runtime" / "bgutil-ytdlp-pot-provider" / "server"


def ensure_po_token_provider() -> bool:
    """Start the local, official yt-dlp PO-token provider when it is installed."""
    try:
        with urllib.request.urlopen(f"{BGUTIL_PROVIDER_URL}/ping", timeout=0.5) as response:
            if response.status == 200:
                return True
    except Exception:
        pass

    server_script = BGUTIL_SERVER_DIR / "build" / "main.js"
    node_binary = shutil.which("node")
    if not node_binary or not server_script.is_file():
        return False
    try:
        creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.Popen(
            [node_binary, str(server_script)], cwd=str(BGUTIL_SERVER_DIR),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
        for _ in range(12):
            time.sleep(0.25)
            try:
                with urllib.request.urlopen(f"{BGUTIL_PROVIDER_URL}/ping", timeout=0.5) as response:
                    if response.status == 200:
                        return True
            except Exception:
                continue
    except Exception as exc:
        logger.warning("YouTube PO-token provider could not start: %s", exc)
    return False


def youtube_extractor_args(clients: list[str], po_provider_ready: bool) -> Dict[str, Dict[str, list[str]]]:
    args: Dict[str, Dict[str, list[str]]] = {"youtube": {"player_client": clients}}
    if po_provider_ready:
        args["youtubepot-bgutilhttp"] = {"base_url": [BGUTIL_PROVIDER_URL]}
    return args


def is_twitter_video_url(url: str) -> bool:
    """Recognize Twitter/X status links without matching unrelated hosts."""
    parsed = urlparse(url.strip())
    return (
        parsed.scheme in {"http", "https"}
        and (parsed.hostname or "").lower() in {
            "x.com", "www.x.com", "mobile.x.com",
            "twitter.com", "www.twitter.com", "mobile.twitter.com",
        }
        and re.fullmatch(r"/[^/]+/status/\d+(?:/video/\d+)?/?", parsed.path) is not None
    )


def extract_twitter_videos(url: str) -> list[Dict[str, Any]]:
    """Inspect post media without asking yt-dlp to select sibling formats."""
    if not is_twitter_video_url(url):
        raise ValueError("Paste a Twitter/X post URL.")
    import yt_dlp
    from yt_dlp.extractor.twitter import TwitterIE

    media_positions = {}

    class SelectionTwitterIE(TwitterIE):
        @classmethod
        def ie_key(cls):
            return TwitterIE.ie_key()

        def _extract_status(self, tweet_id):
            status = super()._extract_status(tweet_id)
            # /video/N addresses all media, including photos. Capture those
            # positions before TwitterIE filters photos from its playlist.
            media = (status.get("extended_entities") or {}).get("media") or []
            quoted = ((status.get("quoted_status") or {}).get("extended_entities") or {}).get("media") or []
            for index in range(max(len(media), len(quoted))):
                item = media[index] if index < len(media) else quoted[index]
                if item.get("type") == "video":
                    media_positions[str(item.get("id_str") or item.get("id"))] = index + 1
            return status

    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}
    cookies_file = find_cookies_file()
    if cookies_file:
        opts["cookiefile"] = cookies_file
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.add_info_extractor(SelectionTwitterIE(ydl))
        info = ydl.extract_info(url.strip(), download=False, process=False)
    entries = list(info.get("entries") or []) if info.get("_type") == "playlist" else [info]
    parsed = urlparse(url.strip())
    base_path = re.sub(r"/video/\d+/?$", "", parsed.path).rstrip("/")
    base_url = f"https://{parsed.hostname}{base_path}"
    explicit_index = re.search(r"/video/(\d+)/?$", parsed.path)
    videos = []
    for entry in entries:
        if not entry:
            continue
        index = media_positions.get(str(entry.get("id")))
        if explicit_index:
            index = int(explicit_index.group(1))
        if index is None:
            # Embedded cards use a different extractor and cannot be addressed
            # by Twitter's media index. A single card can use the original URL.
            if len(entries) != 1:
                raise ValueError("This post contains embedded videos that cannot be selected individually. Use a direct video link.")
            selected_url = url.strip()
            index = 1
        else:
            selected_url = f"{base_url}/video/{index}"
        thumbnails = entry.get("thumbnails") or []
        videos.append({
            "index": index, "title": entry.get("title") or "Twitter/X video",
            "duration": entry.get("duration") or 0,
            "thumbnail": entry.get("thumbnail") or (thumbnails[-1].get("url", "") if thumbnails else ""),
            "url": selected_url, "info": entry,
        })
    if not videos:
        raise ValueError("No video could be found in this Twitter/X post.")
    return videos

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
    lower = msg.lower()
    if any(token in lower for token in ("gvs po token", "only images are available", "requested format is not available")):
        return (
            "YouTube did not expose a downloadable video stream for this video. "
            "The Studio already tried its local playback-token provider and browser-compatible clients. "
            "Try the URL again in a few minutes or use another upload; YouTube is currently limiting this video."
        )
    if any(k in msg for k in ["Sign in to confirm you", "not a bot", "HTTP Error 429", "Sign in to confirm your age"]):
        return (
            "YouTube blocked this request with bot/sign-in verification. "
            "To bypass this, place an exported 'cookies.txt' file in your project folder, "
            "or use another video link / local MP4 file."
        )
    return msg


def validate_instagram_video_url(url: str) -> str:
    """Accept only public Instagram post, Reel, or TV video URLs."""
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""
    if host not in {"instagram.com", "www.instagram.com", "m.instagram.com"}:
        raise ValueError("Paste an Instagram Reel or video-post URL.")
    if not path.startswith(("/reel/", "/p/", "/tv/")):
        raise ValueError("Paste a public Instagram Reel or video-post URL.")
    return url.strip()


def format_instagram_error(err: Any) -> str:
    """Turn common extractor failures into a useful Studio message."""
    message = str(err)
    lower = message.lower()
    if any(token in lower for token in ("login required", "private", "not available", "http error 404")):
        return "Instagram could not access this video. Use a public Reel/post URL, or download your own video and import the MP4."
    return message

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
        is_twitter = is_twitter_video_url(url)
        client_strategies = [None] if is_twitter else PLAYER_CLIENT_STRATEGIES

        if is_twitter:
            videos = extract_twitter_videos(url)
            if len(videos) > 1:
                raise ValueError("This Twitter/X post contains multiple videos. Choose one video before downloading.")
            selected = videos[0]
            info = selected["info"]
            title = selected["title"]
            heuristics = parse_title_heuristics(title)
            return {
                "video_id": info.get("id"), "extractor": "Twitter",
                "title": title, "duration": selected["duration"],
                "width": info.get("width"), "height": info.get("height"),
                "channel": info.get("uploader") or "Twitter/X",
                "song_name": heuristics["song_name"], "anime_name": heuristics["anime_name"],
                "thumbnail": selected["thumbnail"], "source_url": selected["url"],
            }

        po_provider_ready = ensure_po_token_provider()
        # 1. Try Python yt-dlp with the same quality and runtime options as download.
        try:
            import yt_dlp
            for clients in client_strategies:
                try:
                    ydl_opts = {
                        'quiet': True,
                        'no_warnings': True,
                        'skip_download': True,
                        'noplaylist': True,
                        'format': YOUTUBE_STUDIO_FORMAT,
                        'format_sort': ['res'],
                        'js_runtimes': {'node': {}},
                        'remote_components': ['ejs:github'],
                    }
                    if clients is not None:
                        ydl_opts['extractor_args'] = youtube_extractor_args(clients, po_provider_ready)
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
                            "width": info.get("width"), "height": info.get("height"),
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
        for clients in client_strategies:
            cmd = [
                sys.executable, "-m", "yt_dlp",
                "--dump-single-json",
                "--skip-download",
                "--no-warnings",
                "--no-playlist",
                "-f", YOUTUBE_STUDIO_FORMAT,
                "-S", "res",
                "--remote-components", "ejs:github",
                url
            ]
            if clients is not None:
                cmd.extend(["--extractor-args", f"youtube:player_client={','.join(clients)}",
                            "--js-runtimes", "node"])
            if cookies_file:
                cmd.extend(["--cookies", cookies_file])
            if po_provider_ready:
                cmd.extend(["--extractor-args", f"youtubepot-bgutilhttp:base_url={BGUTIL_PROVIDER_URL}"])
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
                    "width": info.get("width"), "height": info.get("height"),
                    "channel": channel,
                    "song_name": heuristics["song_name"],
                    "anime_name": heuristics["anime_name"],
                    "thumbnail": info.get('thumbnail', '')
                }
            except Exception as err:
                last_err = err
                continue

        error = str(last_err) if is_twitter else format_yt_error(last_err)
        raise RuntimeError(f"Could not retrieve video information: {error}")

    @staticmethod
    def download_video(
        url: str,
        task_id: str,
        progress_callback: Optional[Callable[[float, str], None]] = None
    ) -> Dict[str, Any]:
        """Downloads YouTube video as high quality MP4 to the downloads directory."""
        downloads_dir = get_downloads_dir()
        is_twitter = is_twitter_video_url(url)
        client_strategies = [None] if is_twitter else PLAYER_CLIENT_STRATEGIES
        
        # 1. Update task state
        DOWNLOAD_TASKS[task_id]["status"] = "fetching_info"
        DOWNLOAD_TASKS[task_id]["progress"] = 5.0
        DOWNLOAD_TASKS[task_id]["message"] = "Fetching video details..."
        if progress_callback:
            progress_callback(5.0, "Fetching video details...")

        # 2. Extract info
        info = YouTubeDownloader.get_video_info(url)
        url = info.get("source_url") or url
        safe_title = download_cache_stem(info, url)
        # Keep cache entries scoped to the selected download profile. Twitter
        # used a resolution-free cache name before this profile was introduced,
        # which could return a previously cached low-quality rendition.
        source_height = info.get("height") or 0
        if is_twitter:
            cache_suffix = (
                f"_{TWITTER_CACHE_PROFILE}_{source_height}p"
                if source_height > 0 else f"_{TWITTER_CACHE_PROFILE}"
            )
        else:
            cache_suffix = f"_studio_{source_height}p" if source_height > 0 else "_studio"
        target_template = str(downloads_dir / f"{safe_title}{cache_suffix}.%(ext)s")
        target_mp4 = str(downloads_dir / f"{safe_title}{cache_suffix}.mp4")

        DOWNLOAD_TASKS[task_id]["status"] = "downloading"
        DOWNLOAD_TASKS[task_id]["progress"] = 10.0
        DOWNLOAD_TASKS[task_id]["title"] = info.get("title")
        DOWNLOAD_TASKS[task_id]["song_name"] = info.get("song_name")
        DOWNLOAD_TASKS[task_id]["anime_name"] = info.get("anime_name")
        DOWNLOAD_TASKS[task_id]["duration"] = info.get("duration")

        # Check if already downloaded
        if Path(target_mp4).exists() and Path(target_mp4).stat().st_size > 100000:
            compat_file = ensure_browser_compatible(target_mp4, progress_callback, force=False)
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

        yt_format = YOUTUBE_STUDIO_FORMAT

        cookies_file = find_cookies_file()

        # 3. Try python yt_dlp first with a local PO-token provider and client fallbacks
        po_provider_ready = False if is_twitter else ensure_po_token_provider()
        has_python_yt = False
        try:
            import yt_dlp
            postprocessing_started = False

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

            def postprocessor_hook(d):
                """Expose yt-dlp's otherwise silent FFmpeg merge stage to the UI."""
                nonlocal postprocessing_started
                stage = d.get("postprocessor") or "video finalization"
                if d.get("status") == "started":
                    postprocessing_started = True
                    message = f"Finalizing video format ({stage})..."
                    DOWNLOAD_TASKS[task_id].update({"progress": 94.0, "message": message})
                    if progress_callback:
                        progress_callback(94.0, message)
                elif d.get("status") == "finished":
                    message = f"Finalizing video format ({stage}) complete..."
                    DOWNLOAD_TASKS[task_id].update({"progress": 97.0, "message": message})
                    if progress_callback:
                        progress_callback(97.0, message)

            for clients in client_strategies:
                try:
                    postprocessing_started = False
                    ydl_opts = {
                        'format': yt_format,
                        'format_sort': ['res'],
                        'noplaylist': True,
                        'outtmpl': target_template,
                        'merge_output_format': 'mp4',
                        'progress_hooks': [hook],
                        'postprocessor_hooks': [postprocessor_hook],
                        'concurrent_fragment_downloads': DOWNLOAD_CONCURRENCY,
                        'fragment_retries': DOWNLOAD_RETRIES,
                        'retries': DOWNLOAD_RETRIES,
                        'socket_timeout': 15,
                        'quiet': True,
                        'no_warnings': True,
                    }
                    if clients is not None:
                        # YouTube playback may require yt-dlp's official EJS solver.
                        ydl_opts['remote_components'] = ['ejs:github']
                        ydl_opts['js_runtimes'] = {'node': {}}
                        ydl_opts['extractor_args'] = youtube_extractor_args(clients, po_provider_ready)
                    if cookies_file:
                        ydl_opts['cookiefile'] = cookies_file

                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])
                    has_python_yt = True
                    break
                except Exception as e_dl:
                    logger.warning("YouTube download with %s failed: %s", clients, e_dl)
                    # Retrying with a different YouTube client cannot repair a failed
                    # local FFmpeg merge. Stop immediately so the task reports an
                    # actionable error instead of cycling forever at 92%.
                    if postprocessing_started:
                        raise RuntimeError(
                            "Video finalization failed. Check that FFmpeg is installed and try again. "
                            f"Details: {format_yt_error(e_dl)}"
                        ) from e_dl
                    continue

        except ImportError:
            has_python_yt = False

        if not has_python_yt:
            # Fall back to yt-dlp module CLI via subprocess
            DOWNLOAD_TASKS[task_id]["message"] = "Downloading via yt-dlp engine..."
            cli_success = False
            last_cli_err = None
            for clients in client_strategies:
                cmd = [
                    sys.executable, "-m", "yt_dlp",
                    "-f", yt_format,
                    "-S", "res",
                    "--merge-output-format", "mp4",
                    "--concurrent-fragments", str(DOWNLOAD_CONCURRENCY),
                    "--fragment-retries", str(DOWNLOAD_RETRIES),
                    "--retries", str(DOWNLOAD_RETRIES),
                    "--socket-timeout", "15",
                    "--newline",
                    "--no-playlist",
                    "-o", target_template,
                    url
                ]
                if clients is not None:
                    cmd.extend(["--remote-components", "ejs:github",
                                "--extractor-args", f"youtube:player_client={','.join(clients)}",
                                "--js-runtimes", "node"])
                if po_provider_ready:
                    cmd[cmd.index(url):cmd.index(url)] = [
                        "--extractor-args", f"youtubepot-bgutilhttp:base_url={BGUTIL_PROVIDER_URL}",
                    ]
                if cookies_file:
                    cmd.extend(["--cookies", cookies_file])

                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    env={**os.environ, "PYTHONIOENCODING": "utf-8:backslashreplace"},
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
                error = last_cli_err or "Download failed"
                raise RuntimeError(error if is_twitter else format_yt_error(error))

        # Check for actual output file (.mp4, or .mkv if fallback)
        final_file = None
        if Path(target_mp4).exists():
            final_file = target_mp4
        else:
            for f in downloads_dir.glob(f"{safe_title}{cache_suffix}.*"):
                if f.suffix.lower() in [".mp4", ".mkv", ".webm"]:
                    final_file = str(f.resolve())
                    break

        if not final_file:
            raise FileNotFoundError("Downloaded video file was not created.")

        # Ensure video is encoded with H.264/AAC for 100% browser HTML5 playback
        final_file = ensure_browser_compatible(
            final_file, progress_callback, force=False, replace_source=True
        )

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


class InstagramDownloader:
    """Downloads a public Instagram Reel or video post through yt-dlp."""

    @staticmethod
    def get_video_info(url: str) -> Dict[str, Any]:
        url = validate_instagram_video_url(url)
        try:
            import yt_dlp
            opts = {
                "quiet": True,
                "no_warnings": True,
                "skip_download": True,
                "noplaylist": True,
                "extractor_args": {"instagram": {"app_id": "web"}},
            }
            cookies_file = find_cookies_file()
            if cookies_file:
                opts["cookiefile"] = cookies_file
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except ImportError as exc:
            raise RuntimeError("Instagram downloading needs yt-dlp to be installed.") from exc
        except Exception as exc:
            raise RuntimeError(format_instagram_error(exc)) from exc

        title = info.get("title") or info.get("id") or "Instagram Reel"
        heuristics = parse_title_heuristics(title)
        return {
            "video_id": info.get("id"),
            "extractor": info.get("extractor_key") or info.get("extractor"),
            "title": title,
            "duration": info.get("duration", 0),
            "channel": info.get("uploader") or info.get("channel") or "Instagram",
            "song_name": heuristics["song_name"],
            "anime_name": heuristics["anime_name"],
            "thumbnail": info.get("thumbnail", ""),
        }

    @staticmethod
    def download_video(
        url: str,
        task_id: str,
        progress_callback: Optional[Callable[[float, str], None]] = None,
    ) -> Dict[str, Any]:
        url = validate_instagram_video_url(url)
        downloads_dir = get_downloads_dir()
        DOWNLOAD_TASKS[task_id].update({
            "status": "fetching_info", "progress": 5.0,
            "message": "Fetching Instagram Reel details...",
        })
        info = InstagramDownloader.get_video_info(url)
        safe_title = download_cache_stem(info, url)
        target_template = str(downloads_dir / f"{safe_title}.%(ext)s")
        target_mp4 = str(downloads_dir / f"{safe_title}.mp4")
        DOWNLOAD_TASKS[task_id].update({
            "status": "downloading", "progress": 10.0,
            "title": info.get("title"), "song_name": info.get("song_name"),
            "anime_name": info.get("anime_name"), "duration": info.get("duration"),
        })

        if Path(target_mp4).exists() and Path(target_mp4).stat().st_size > 100000:
            final_file = ensure_browser_compatible(
                target_mp4, progress_callback, force=False, replace_source=True
            )
        else:
            try:
                import yt_dlp

                def hook(data: Dict[str, Any]) -> None:
                    if data.get("status") == "downloading":
                        total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
                        downloaded = data.get("downloaded_bytes") or 0
                        if total:
                            percent = min(90.0, 10.0 + (downloaded / total) * 80.0)
                            message = f"Downloading Instagram video: {percent:.1f}%"
                            DOWNLOAD_TASKS[task_id].update({"progress": percent, "message": message})
                            if progress_callback:
                                progress_callback(percent, message)
                    elif data.get("status") == "finished":
                        DOWNLOAD_TASKS[task_id].update({"progress": 92.0, "message": "Preparing video for Studio..."})

                opts = {
                    "format": "best[ext=mp4]/best",
                    "outtmpl": target_template,
                    "merge_output_format": "mp4",
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "progress_hooks": [hook],
                    "extractor_args": {"instagram": {"app_id": "web"}},
                }
                cookies_file = find_cookies_file()
                if cookies_file:
                    opts["cookiefile"] = cookies_file
                with yt_dlp.YoutubeDL(opts) as ydl:
                    ydl.download([url])
            except ImportError as exc:
                raise RuntimeError("Instagram downloading needs yt-dlp to be installed.") from exc
            except Exception as exc:
                raise RuntimeError(format_instagram_error(exc)) from exc

            final_file = next((str(path.resolve()) for path in downloads_dir.glob(f"{safe_title}.*")
                               if path.suffix.lower() in {".mp4", ".mkv", ".webm"}), None)
            if not final_file:
                raise FileNotFoundError("Instagram video was not created.")
            final_file = ensure_browser_compatible(
                final_file, progress_callback, force=False, replace_source=True
            )

        DOWNLOAD_TASKS[task_id].update({
            "status": "completed", "progress": 100.0,
            "message": "Instagram video ready!", "file_path": final_file,
        })
        return {
            "file_path": final_file, "title": info.get("title"),
            "song_name": info.get("song_name"), "anime_name": info.get("anime_name"),
            "duration": info.get("duration"),
        }

def ensure_browser_compatible(
    file_path: str,
    progress_callback: Optional[Callable[[float, str], None]] = None,
    force: bool = False,
    replace_source: bool = False,
) -> str:
    """
    Ensures video is H.264 (AVC) with AAC audio, closed GOP (keyframe every 30 frames),
    faststart headers, without changing the source resolution, so HTML5
    <video> and canvas can reliably play while downloads retain their quality.
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

        if not force and is_h264 and is_aac:
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
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                str(out_tmp)
            ]
            subprocess.run(cpu_cmd, capture_output=True, check=True)
            success = True

        if success and out_tmp.exists() and out_tmp.stat().st_size > 100000:
            # Downloader-owned MP4s should remain one file in downloads/. For
            # user-selected non-MP4 media, retain the original and return the
            # compatibility copy instead.
            if replace_source and src.suffix.lower() == ".mp4":
                if out_compat.exists():
                    out_compat.unlink()
                os.replace(out_tmp, src)
                return str(src)
            if out_compat.exists():
                out_compat.unlink(missing_ok=True)
            out_tmp.rename(out_compat)
            return str(out_compat)
    except Exception as e:
        logger.warning("Browser compatibility check could not complete: %s", e)
    return str(src)

downloader = YouTubeDownloader()
