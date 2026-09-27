---
name: reel-studio-monitor
description: Use when working on the web dashboard UI, HTML templates, CSS styles, JavaScript frontend interactions, Three.js 3D/preview viewport, WebSocket/SSE communication, or project state restore.
---

# Reel Studio Monitor Skill

This skill governs the frontend web dashboard, real-time UI interactions, Three.js preview viewport, and project state synchronization.

## Architecture
- **Dashboard UI**: `app/static/index.html`, `app/static/style.css`, `app/static/app.js`
- **Real-Time Streaming**: WebSocket and SSE endpoints in `app/main.py`
- **Project Persistence**: `app/projects/project_manager.py` saving into `projects/<project_id>/`

## UI & State Engineering Rules
1. **Trace the Full Path**:
   - Trace HTML `id` → JavaScript `getElementById` → Event listener → API `fetch`/WebSocket → FastAPI handler → UI response update.
   - Verify keys in JSON payloads match between frontend and Pydantic schemas.
2. **Defensive, Null-Safe DOM Bindings**:
   - Every element lookup must be guarded:
     ```javascript
     const element = document.getElementById('my-element');
     if (element) {
         element.addEventListener('click', handleEvent);
     }
     ```
   - Never assume an optional or tab-dependent element is present in the DOM on initial load.
3. **Preserve User Project State on Restore**:
   - When loading saved projects, default loaders may initialize standard parameters, but saved user customizations (hook start/end trims, subtitle style overrides, edited lyrics, source paths) must be restored after default initialization.
   - Never silently overwrite or wipe saved project data.
4. **Clean Real-Time Status Updates**:
   - Surface actionable error messages and progress percentages to the UI during long operations (downloads, Gemini hook analysis, FFmpeg exports).
