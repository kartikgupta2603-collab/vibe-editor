# AGENTS.md — Anime Song Reel Creator (Studio Monitor)

## ⚡ Operating Directives for AI Agents
- **Task Intake Protocol (Elaborate, Understand, Plan, Present & Proceed)**: When given a task, elaborate on it first, ensure full understanding of the user's intent and technical requirements, devise a clear step-by-step plan (listing every file to touch), present your understanding and plan, and then proceed with execution without asking the user .
- **Fast, Pragmatic & Direct**: Work quickly. Inspect target files directly without performing repository-wide scans (`find_by_name` across root or global grep).
- **Never Rescan the Repo**: All folder structures, file purposes, and key endpoints are fully documented in this file. Assume you know the architecture from turn 1.
- **Concise & Action-Oriented**: Skip robotic pre/post commentary. Make direct, clean code changes and verify efficiently.
- **Planned Edits & No Redundant Re-Reading**: Before editing, state a short plan and list every file you expect to touch. Do not re-read a file immediately after editing it unless a tool call errors — trust the edit succeeded.
- **Clarification & MCQ Protocol**: When asked to do something, first check if you have enough details to do it exactly how the user wants. If NO — stop, don't guess, and ask using simple Multiple Choice options (A, B, C, D, and E: None of these, let me explain) and wait for an answer. If YES (request is small and clear) — just do it directly without asking.
- **Windows Environment**: Paths use Windows backslashes (`\`) or normalized forward slashes. Subprocesses and shell commands run in PowerShell. Never run long-running or interactive commands without non-blocking flags.
- **Graphify Knowledge Graph**: For complex architectural or multi-file relationship queries, use the `graphify` skill (`/graphify`).

---

## 🧠 Engram Persistent Memory — On-Demand Policy
Engram memory is configured in lightweight, on-demand mode.

---

## 🏗️ Project Overview & Tech Stack
An automated studio workflow to generate 9:16 vertical anime song reels with AI hook analysis, karaoke/styled subtitles, audio-video synchronization, and a real-time web studio monitor.

- **Backend**: Python 3.14+, FastAPI, Uvicorn
- **AI Engine**: Google Gemini API (`app/ai/gemini_client.py`) for song hook analysis and caption generation
- **Video & Audio Pipeline**: FFmpeg & FFprobe (`app/video/`)
- **Frontend / UI**: HTML5, Vanilla JavaScript, CSS, Three.js (`app/static/`)
- **Output Target**: 1080x1920 (9:16 vertical video) at 30 FPS

---

## 📁 Repository Directory Map

```
C:\reel\
├── run.py                     # Primary entry point: launches FastAPI on 127.0.0.1:8000 and auto-opens browser
├── .env / .env.example        # Environment configuration (GEMINI_API_KEY, PORT, HOST, DEFAULT_FPS, etc.)
│
├── app/                       # Main application package
│   ├── main.py                # FastAPI app instance, API routers, static file mounting, WebSocket/SSE endpoints
│   ├── ai/
│   │   └── gemini_client.py   # Gemini API integration: audio hook detection, lyrics transcription, caption generation
│   ├── config/
│   │   └── settings.py        # Pydantic / dataclass settings loader from .env
│   ├── projects/
│   │   └── project_manager.py # Manages reel project lifecycle, configurations, and metadata persistence
│   ├── templates/
│   │   └── template_manager.py# Loads and applies subtitle/video visual templates from /templates/
│   ├── video/
│   │   ├── downloader.py      # Video and audio download handler (e.g., yt-dlp / stream fetchers)
│   │   ├── probe.py           # FFprobe utility for inspecting media duration, resolution, audio streams
│   │   ├── preview.py         # Generates lightweight video previews for UI scrubbing
│   │   └── renderer.py        # Core FFmpeg rendering engine: subtitles, text effects, audio mix, 1080x1920 9:16 export
│   └── static/                # Studio Monitor web dashboard (HTML, CSS, JS, Three.js vendor scripts)
│
├── templates/                 # Subtitle & visual style presets (JSON format)
│   ├── bold.json              # Bold impact subtitle style
│   ├── cinematic.json         # Cinematic letterbox & elegant typography
│   ├── clean.json             # Minimalist clean typography
│   ├── dark.json              # High contrast dark mood style
│   ├── energetic.json         # High-energy pop/neon styling
│   └── minimal.json           # Subtle lower-third style
│
├── projects/                  # User project folders & saved project states (JSON + media metadata)
├── downloads/                 # Downloaded source audio/video files
├── exports/                   # Final rendered 9:16 MP4 reel exports
├── tests/                     # Unit and integration test scripts
└── temp/                      # Scratch files, audio slices, and temporary clips
```

---

## 🚀 Running & Developing

### 1. Launch the Studio Monitor
```powershell
python run.py
```
Starts Uvicorn at `http://127.0.0.1:8000` and automatically opens the dashboard in the default browser.

### 2. Environment Variables (`.env`)
- `GEMINI_API_KEY`: API key for Gemini hook detection & captions
- `PORT`: Default `8000`
- `HOST`: Default `127.0.0.1`
- `DEFAULT_EXPORT_DIR`: Default `exports`
- `DEFAULT_RESOLUTION`: Default `1080x1920`
- `DEFAULT_FPS`: Default `30`

---
## Rule
use subagents for doing long and time taking task for complex task with intteligence 

---

## ⚠️ Important Coding & Safety Rules
1. **Non-blocking Execution**: Server commands or background tools must never block the CLI shell.
2. **Preserve User Projects**: Never delete or overwrite contents in `projects/` or `exports/` unless explicitly requested.
3. **FFmpeg Encoding**: Always ensure hardware acceleration or fast presets (`-preset fast`, `-c:v libx264`, `-pix_fmt yuv420p`) to maintain fast export speeds on Windows.

## 🛡️ Reliability Gate — Required for Every Change
1. **Verify before claiming**: Never report a defect as fixed until the changed code has passed a relevant syntax check, unit test, or focused reproduction. State any unavailable test dependency plainly.
2. **No invented APIs**: Do not guess model IDs, package APIs, HTML element IDs, or FFmpeg stream indexes. Check the official documentation or the actual source first.
3. **Trace the whole path**: For UI work, inspect the HTML element, JavaScript event binding, API route, and backend handler before changing behaviour. For media work, inspect probe → compatibility conversion → browser preview → export.
4. **Keep existing projects safe**: Session restoration must preserve saved values after any file-loading defaults run. Never silently clear stored project data.
5. **Change minimally and test immediately**: Make the smallest complete patch. Run Python compilation for Python edits and a JavaScript syntax check for browser-script edits; add a focused regression test when practical.
6. **Do not hide failures**: Do not swallow broad exceptions without logging a useful cause. Surface actionable error messages in both the task status and UI.
7. **Agent definition of done**: A task is complete only after inspection of the direct call chain, a minimal causal patch, and the relevant verification. Never make multiple speculative fixes and call them complete.
8. **Gemini-specific honesty**: Audio analysis must use supplied audio evidence when available. Do not represent filename guesses, duration heuristics, or fallback captions as model analysis.
