<!-- BEGIN ENGRAM MEMORY PROTOCOL — managed by engram setup -->

## Engram Persistent Memory — On-Demand Policy
Engram memory is configured in lightweight, on-demand mode.

### Task Intake & Execution Protocol (Elaborate, Understand, Plan, Present & Proceed)
When given a task:
1. **Elaborate & Understand**: Break down and elaborate the request to ensure complete comprehension of the user's intent, requirements, and edge cases.
2. **Plan**: Formulate a concise, actionable step-by-step plan and list every file you expect to touch.
3. **Present**: Present your understanding and implementation plan clearly to the user before editing code.
4. **Proceed**: Proceed with the changes cleanly and efficiently according to the plan without asking the user.

## Working Style — Pragmatic & Direct
- Before editing, state a short plan and list every file you expect to touch. Do not re-read a file immediately after editing it unless a tool call errors — trust the edit succeeded.
- Be concise and communicative. Avoid mandatory robotic pre/post tool call commentary when it slows down progress.
- Never run long-running or interactive commands without non-blocking flags.

## Specialist Subagents
Use specialized subagents to isolate context and prevent context rot:
- **`investigator`**: Read-only codebase explorer for tracing bugs, inspecting callers, and analyzing code paths without editing files.
- **`implementer`**: Focused code modifier for applying planned patches cleanly.
- **`reviewer`**: UI/API contract reviewer verifying null-safe event bindings, DOM selector consistency, and Pydantic schemas.
- **`verifier`**: Test and release agent executing Python compilation, JavaScript syntax validation, and test suites.

## Project Skills & Tooling Extensions
- **Skills (`.agents/skills/` & `.gemini/skills/`)**:
  - `reel-video-pipeline`: FFmpeg 1080x1920 9:16 rendering, dynamic stream indexing, letterboxing/smart crop, H.264/AAC encoding, fast scrubbing preview generation.
  - `reel-gemini-analyzer`: Audio hook detection, lyrics transcription/timestamp alignment, honest AI evidence handling, structured JSON outputs.
  - `reel-studio-monitor`: Dashboard UI, Three.js preview canvas, WebSocket/SSE real-time sync, null-safe DOM bindings, project state preservation.
  - `reel-test-verify`: Minimum verification matrix (`py_compile`, `node --check`, pytest, API contract check).
  - `agent-browser`: Token-efficient browser automation using accessibility-tree snapshots (`agent-browser snapshot -i`) and deterministic element refs (`@e1`, `@e2`).
- **MCP Servers**:
  - `context7`: Real-time, versioned library documentation to avoid API hallucinations.
  - `serena`: Semantic code navigation, symbol lookup, and reference tracking via Language Server Protocol (LSP).
  - `agent-browser`: Fast headless browser automation for verified UI checks.
  - `engram`: Persistent project memory.
- **Spec Kit**:
  - Structured spec-driven development workflow via `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, and `/speckit-converge`.

## Project Reliability Rules — Must Follow
1. Read `AGENTS.md` before editing. Use its file map; do not make broad, blind rewrites.
2. Before changing code, state the user-visible bug, exact root cause, every file to edit, and how the fix will be checked.
3. For UI changes, verify the full chain: HTML `id` → JS lookup → event binding → request → FastAPI endpoint → response handling. Every optional UI element must have a null-safe event binding.
4. For video changes, preserve the distinction between lightweight browser preview and 1080×1920 FFmpeg export. Do not lower final-export quality to solve preview performance.
5. For FFmpeg, calculate stream indexes dynamically from actual inputs. Never hardcode stream indices.
6. For Gemini, use only documented model IDs. Keep model fallbacks in one shared constant, use timeouts, and do not block `async def` with `subprocess.run`; use `await asyncio.to_thread(...)`.
7. Never overwrite saved project state during restore. Saved names, trims, styles, lyrics, and source paths must be preserved and reapplied.
8. Run the smallest relevant checks after every change: `python -m py_compile` for Python and `node --check` for browser JavaScript. If a project dependency is unavailable, report it instead of pretending the test passed.
9. Do not claim success based only on code reading. Include the actual check performed and its result in the final response.

## Minimum Verification Matrix
| Change type | Required check |
|---|---|
| Python | `python -m py_compile` for every edited module |
| Browser JavaScript | `node --check` for every edited script |
| HTML UI | Confirm each changed `id` has at most one element and every event binding is null-safe |
| API contract | Check frontend request keys against FastAPI request model/endpoint |
| FFmpeg/media | Test both audio and silent-video stream layouts, including optional overlay/mask inputs |
| Gemini integration | Validate JSON parsing, timeout/fallback handling, and a no-key fallback without claiming AI success |
| UI/Browser | Use `agent-browser snapshot -i` or screenshot for deterministic DOM verification |
