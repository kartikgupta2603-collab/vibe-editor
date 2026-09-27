# Graph Report - reel  (2026-09-26)

## Corpus Check
- 101 files · ~336,875 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2496 nodes · 5345 edges · 146 communities (93 shown, 45 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 307 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- app.js
- bt
- At
- .constructor
- three.min.js
- Wn
- Lt
- .setAttribute
- vt
- sn
- St
- .distanceTo
- copy
- Ne
- Lc
- jc
- Tasks: [FEATURE NAME]
- instagram_scheduler.py
- gt
- get_settings
- _cover_scale
- ReelRenderer
- se
- .download_video
- nl
- yc
- main.py
- xc
- .multiplyScalar
- tn
- pt
- ol
- Ce
- e
- yt
- parseObject
- post
- ml
- ls
- nc
- mi
- re
- bl
- jt
- gemini_client.py
- renderer.py
- .constructor
- .agents/skills/speckit-analyze/SKILL.md
- no
- constructor
- api_toggle_scheduler
- fo
- yo
- _validate_safe_media_path
- .fromJSON
- .toJSON
- uo
- tc
- ia
- update
- ws
- .fromArray
- updateMatrixWorld
- ._update
- ct
- AGENTS.md — Anime Song Reel Creator (Studio Monitor)
- .subVectors
- Yl
- fs
- GEMINI.md
- test_text_color_multiline.py
- .gemini/skills/speckit-analyze/SKILL.md
- fl
- Execution Steps
- Execution Steps
- Et
- en
- ProjectManager
- n
- common.ps1
- .applyMatrix4
- ec
- Kn
- Feature Specification: [FEATURE NAME]
- ic
- .agents/skills/speckit-plan/SKILL.md
- el
- Na
- pl
- .agents/skills/speckit-specify/SKILL.md
- .removeEventListener
- .agents/skills/speckit-tasks/SKILL.md
- rules/graphify.md
- api_delete_schedule
- workflows/graphify.md
- .gemini/skills/speckit-plan/SKILL.md
- .getAttribute
- .gemini/skills/speckit-specify/SKILL.md
- .gemini/skills/speckit-tasks/SKILL.md
- fix_subtitles.py
- remove_wave_floating.py
- Core Principles
- Core Principles
- Implementation Plan: [FEATURE]
- CLI Commands Reference
- .agents/skills/speckit-checklist/SKILL.md
- CLI Commands Reference
- .gemini/skills/speckit-checklist/SKILL.md
- .agents/skills/speckit-clarify/SKILL.md
- .agents/skills/speckit-implement/SKILL.md
- .gemini/skills/speckit-clarify/SKILL.md
- .gemini/skills/speckit-implement/SKILL.md
- .agents/skills/speckit-constitution/SKILL.md
- Xe
- .gemini/skills/speckit-constitution/SKILL.md
- create-new-feature.ps1
- .agents/skills/speckit-taskstoissues/SKILL.md
- mc
- .gemini/skills/speckit-taskstoissues/SKILL.md
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- Reel Gemini Analyzer Skill
- Reel Studio Monitor Skill
- Reel Test & Verification Skill
- Reel Video Pipeline Skill
- .create_ass_subtitles
- Reel Gemini Analyzer Skill
- Reel Studio Monitor Skill
- Reel Test & Verification Skill
- Reel Video Pipeline Skill
- Implementer Specialist Instructions
- Investigator Specialist Instructions
- Reviewer Specialist Instructions
- Verifier Specialist Instructions
- rc
- qo
- bind
- $c
- Zc

## God Nodes (most connected - your core abstractions)
1. `Lt` - 135 edges
2. `copy()` - 130 edges
3. `vt` - 90 edges
4. `ws()` - 69 edges
5. `tn` - 65 edges
6. `St` - 60 edges
7. `Ce` - 59 edges
8. `sn` - 53 edges
9. `se` - 49 edges
10. `constructor()` - 45 edges

## Surprising Connections (you probably didn't know these)
- `test_export_request_model()` --calls--> `ExportRequest`  [EXTRACTED]
  tests/test_color_filters.py → app/main.py
- `test_model_lyrics_skip_malformed_entries_without_losing_valid_cues()` --calls--> `normalize_lyrics_payload()`  [EXTRACTED]
  tests/test_subtitle_sync.py → app/ai/gemini_client.py
- `test_refine_moment_boundaries_prevents_mid_lyric_cutoff()` --calls--> `refine_moment_boundaries()`  [EXTRACTED]
  tests/test_gemini_moments.py → app/ai/gemini_client.py
- `test_compute_word_timings_mixed_lyrics()` --calls--> `compute_word_timings()`  [EXTRACTED]
  tests/test_mixed_subtitles.py → app/ai/gemini_client.py
- `test_compute_word_timings_pure_english()` --calls--> `compute_word_timings()`  [EXTRACTED]
  tests/test_mixed_subtitles.py → app/ai/gemini_client.py

## Import Cycles
- None detected.

## Communities (146 total, 45 thin omitted)

### Community 0 - "app.js"
Cohesion: 0.06
Nodes (91): adaptTextColorsForBackground(), applyAIClip(), applySubtitleStyle(), cachePreviewFrame(), computeVideoFilterCss(), _creatorAvatarImg, ctx, drawRulerCanvas() (+83 more)

### Community 1 - "bt"
Cohesion: 0.10
Nodes (8): bt, ei, ii, li(), parseTextures(), rt, Tt, Mt()

### Community 2 - "At"
Cohesion: 0.06
Nodes (3): At, fe, ge

### Community 3 - ".constructor"
Cohesion: 0.09
Nodes (39): MapControls, OrbitControls, dollyIn(), dollyOut(), getZoomScale(), handleKeyDown(), handleMouseDownDolly(), handleMouseDownPan() (+31 more)

### Community 4 - "three.min.js"
Cohesion: 0.03
Nodes (34): bi(), br(), bs, fi(), Hi(), hr(), ir(), ji() (+26 more)

### Community 5 - "Wn"
Cohesion: 0.11
Nodes (23): _allocateTargets(), _applyPMREM(), _blur(), _cleanup(), compileCubemapShader(), compileEquirectangularShader(), _compileMaterial(), fromCubemap() (+15 more)

### Community 7 - ".setAttribute"
Cohesion: 0.14
Nodes (10): ca, ci, Da, gn(), o(), v(), mn, i() (+2 more)

### Community 9 - "sn"
Cohesion: 0.05
Nodes (11): an, cn, dn, fn, hn, ln, on, pn (+3 more)

### Community 12 - "copy"
Cohesion: 0.09
Nodes (5): Aa, copy(), S(), sc, b()

### Community 13 - "Ne"
Cohesion: 0.09
Nodes (3): ai, ht(), Ne

### Community 14 - "Lc"
Cohesion: 0.08
Nodes (4): bc, getInput(), getOutput(), Lc

### Community 16 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 17 - "instagram_scheduler.py"
Cohesion: 0.12
Nodes (32): add_to_schedule(), cancel_schedule_item(), delete_schedule_item(), _get_ig_credentials(), get_queue_stats(), list_exported_reels(), list_scheduled(), _load_queue() (+24 more)

### Community 18 - "gt"
Cohesion: 0.14
Nodes (28): ds(), F(), G(), k(), V(), z(), s(), F() (+20 more)

### Community 19 - "get_settings"
Cohesion: 0.13
Nodes (13): AppSettings, get_settings(), BaseModel, update_settings(), api_start_export(), api_start_youtube_download(), _execute_export(), ExportRequest (+5 more)

### Community 20 - "_cover_scale"
Cohesion: 0.14
Nodes (19): _cover_scale(), Compute integer (w, h) that covers target_w x target_h while preserving aspect…, Focused tests for the 9:16 vertical reel background coverage. Verifies that…, 1920x1080 source covering 1080x1920 vertical canvas., A 1080x1920 portrait source covering 1080x1920 — should be 1:1 scale * zoom., 1080x1080 square source covering 1080x1920 vertical., 3840x2160 (4K 16:9) source covering 1080x1920., 2560x1080 ultrawide source covering 1080x1920. (+11 more)

### Community 21 - "ReelRenderer"
Cohesion: 0.10
Nodes (18): _has_nvenc(), Any, Generates a high-res RGBA transparent image containing styled typography and…, Check if h264_nvenc encoder is available., Builds comma-separated FFmpeg video filters for color grading and adjustments., Renders video in 16:9 Landscape, 9:16 Vertical, or 1:1 Square using FFmpeg., ReelRenderer, _execute_ffmpeg() (+10 more)

### Community 23 - ".download_video"
Cohesion: 0.11
Nodes (21): api_youtube_info(), _execute_yt_download(), ensure_browser_compatible(), find_cookies_file(), format_yt_error(), get_downloads_dir(), parse_title_heuristics(), Any (+13 more)

### Community 26 - "main.py"
Cohesion: 0.07
Nodes (40): add_no_cache_header(), AnalyzeRequest, api_add_schedule(), api_analyze_song(), api_ensure_compatible(), api_generate_full_subtitles(), api_generate_lyrics(), api_generate_viral_hooks() (+32 more)

### Community 28 - ".multiplyScalar"
Cohesion: 0.13
Nodes (3): as(), A(), setFromCamera()

### Community 29 - "tn"
Cohesion: 0.05
Nodes (9): bo, dt(), $e(), is(), ms(), Qe(), ss(), tn (+1 more)

### Community 31 - "ol"
Cohesion: 0.10
Nodes (9): hl, oc, ol, parseGeometries(), parseImages(), sl, uc, ul (+1 more)

### Community 32 - "Ce"
Cohesion: 0.08
Nodes (5): Ce, Ql, qn, sh, Wl

### Community 33 - "e"
Cohesion: 0.26
Nodes (7): cl, i(), il(), load(), parse(), e(), o()

### Community 34 - "yt"
Cohesion: 0.09
Nodes (3): vi(), h(), yt

### Community 35 - "parseObject"
Cohesion: 0.11
Nodes (15): Ah, fa, fh, hh, ho(), io(), ja(), $l (+7 more)

### Community 36 - "post"
Cohesion: 0.14
Nodes (18): api_browse_file(), api_cancel_schedule(), api_open_folder(), api_render_preview(), api_retry_schedule(), api_save_template(), api_update_settings(), api_upload_video() (+10 more)

### Community 40 - "mi"
Cohesion: 0.22
Nodes (5): v(), mi(), g(), y(), x()

### Community 44 - "gemini_client.py"
Cohesion: 0.09
Nodes (30): compute_word_timings(), extract_timed_audio_samples(), GeminiClient, normalize_lyrics_payload(), parse_gemini_json(), parse_timestamp(), Any, Return continuous or high-fidelity audio evidence covering the song. For songs… (+22 more)

### Community 45 - "renderer.py"
Cohesion: 0.13
Nodes (22): extract_preview_frame(), Any, Generates a composite still frame representing the exact video appearance., render_preview_still(), detect_letterbox_crop(), probe_video(), Any, Ensures video is always preserved in its full, proper length and dimensions… (+14 more)

### Community 46 - ".constructor"
Cohesion: 0.14
Nodes (5): gs, ts(), v(), y(), ys

### Community 47 - ".agents/skills/speckit-analyze/SKILL.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 48 - "no"
Cohesion: 0.12
Nodes (8): ao(), eo(), go, no(), oo(), pc, ro(), so()

### Community 49 - "constructor"
Cohesion: 0.24
Nodes (19): constructor(), d(), u(), y(), gi(), i(), a(), ka() (+11 more)

### Community 50 - "api_toggle_scheduler"
Cohesion: 0.20
Nodes (11): api_toggle_scheduler(), lifespan(), Start background scheduler on boot and stop on shutdown cleanly., Start or stop the background scheduler., is_scheduler_running(), Start the background scheduler thread., Stop the background scheduler thread., Check if the scheduler background thread is active. (+3 more)

### Community 51 - "fo"
Cohesion: 0.24
Nodes (4): fo(), mo(), l(), po

### Community 53 - "_validate_safe_media_path"
Cohesion: 0.67
Nodes (4): api_route, api_download_media(), api_stream_media(), _validate_safe_media_path()

### Community 54 - ".fromJSON"
Cohesion: 0.19
Nodes (3): n(), parseShapes(), zl

### Community 55 - ".toJSON"
Cohesion: 0.14
Nodes (3): ac, Al, r()

### Community 59 - "update"
Cohesion: 0.10
Nodes (10): clone(), kl, pi(), p(), update(), us(), b(), M() (+2 more)

### Community 60 - "ws"
Cohesion: 0.19
Nodes (12): C(), f(), m(), ws(), At(), Ct(), Dt(), It() (+4 more)

### Community 62 - "updateMatrixWorld"
Cohesion: 0.13
Nodes (3): _s(), n(), updateMatrixWorld()

### Community 63 - "._update"
Cohesion: 0.12
Nodes (3): jo, wo, xo

### Community 64 - "ct"
Cohesion: 0.16
Nodes (3): ct(), es(), ns()

### Community 65 - "AGENTS.md — Anime Song Reel Creator (Studio Monitor)"
Cohesion: 0.17
Nodes (11): 1. Launch the Studio Monitor, 2. Environment Variables (`.env`), AGENTS.md — Anime Song Reel Creator (Studio Monitor), 🧠 Engram Persistent Memory — On-Demand Policy, ⚠️ Important Coding & Safety Rules, ⚡ Operating Directives for AI Agents, 🏗️ Project Overview & Tech Stack, 🛡️ Reliability Gate — Required for Every Change (+3 more)

### Community 69 - "GEMINI.md"
Cohesion: 0.25
Nodes (7): Engram Persistent Memory — On-Demand Policy, Minimum Verification Matrix, Project Reliability Rules — Must Follow, Project Skills & Tooling Extensions, Specialist Subagents, Task Intake & Execution Protocol (Elaborate, Understand, Plan, Present & Proceed), Working Style — Pragmatic & Direct

### Community 70 - "test_text_color_multiline.py"
Cohesion: 0.14
Nodes (3): Any, Path, TemplateManager

### Community 72 - ".gemini/skills/speckit-analyze/SKILL.md"
Cohesion: 0.08
Nodes (25): 1. Initialize Analysis Context, 2. Load Artifacts (Progressive Disclosure), 3. Build Semantic Models, 4. Detection Passes (Token-Efficient Analysis), 5. Severity Assignment, 6. Produce Compact Analysis Report, 7. Provide Next Actions, 8. Offer Remediation (+17 more)

### Community 75 - "Execution Steps"
Cohesion: 0.12
Nodes (15): 1. Initialize Convergence Context, 2. Load Artifacts (Progressive Disclosure), 3. Build the Intent Inventory, 4. Assess the Codebase and Classify Findings, 5. Assign Severity, 6. Present the In-Session Findings Summary, 7. Append Convergence Tasks (or report converged), 8. Provide Next Actions (Handoff) (+7 more)

### Community 76 - "Execution Steps"
Cohesion: 0.12
Nodes (15): 1. Initialize Convergence Context, 2. Load Artifacts (Progressive Disclosure), 3. Build the Intent Inventory, 4. Assess the Codebase and Classify Findings, 5. Assign Severity, 6. Present the In-Session Findings Summary, 7. Append Convergence Tasks (or report converged), 8. Provide Next Actions (Handoff) (+7 more)

### Community 78 - "en"
Cohesion: 0.16
Nodes (3): en, Si(), ti

### Community 79 - "ProjectManager"
Cohesion: 0.30
Nodes (5): atomic_write_json(), ProjectManager, Any, Path, Safely and atomically writes JSON to disk using a temporary file and atomic…

### Community 80 - "n"
Cohesion: 0.19
Nodes (8): bindSkeletons(), t(), er(), oi(), r(), parseSkeletons(), n(), xi()

### Community 81 - "common.ps1"
Cohesion: 0.23
Nodes (13): Find-SpecifyRoot(), Format-SpecKitCommand(), Get-CurrentBranch(), Get-FeaturePathsEnv(), Get-InvokeSeparator(), Get-NormalizedPriority(), Get-Python3Command(), Get-RepoRoot() (+5 more)

### Community 85 - "Kn"
Cohesion: 0.13
Nodes (3): Jl, Kn, vl()

### Community 86 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 89 - ".agents/skills/speckit-plan/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, Key rules, Mandatory Post-Execution Hooks, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases (+2 more)

### Community 92 - "Na"
Cohesion: 0.20
Nodes (5): Ba, Ko, Na, _o, to()

### Community 95 - ".agents/skills/speckit-specify/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, For AI Generation, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements (+2 more)

### Community 96 - ".removeEventListener"
Cohesion: 0.15
Nodes (9): dispose(), s(), l(), o(), ni, U(), Tt(), yi() (+1 more)

### Community 98 - ".agents/skills/speckit-tasks/SKILL.md"
Cohesion: 0.18
Nodes (10): Checklist Format (REQUIRED), Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules (+2 more)

### Community 101 - "api_delete_schedule"
Cohesion: 0.67
Nodes (3): api_delete_schedule(), Permanently delete a schedule item., delete

### Community 103 - ".gemini/skills/speckit-plan/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, Key rules, Mandatory Post-Execution Hooks, Outline, Phase 0: Outline & Research, Phase 1: Design & Contracts, Phases (+2 more)

### Community 106 - ".gemini/skills/speckit-specify/SKILL.md"
Cohesion: 0.18
Nodes (10): Completion Report, Done When, For AI Generation, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, Quick Guidelines, Section Requirements (+2 more)

### Community 107 - ".gemini/skills/speckit-tasks/SKILL.md"
Cohesion: 0.18
Nodes (10): Checklist Format (REQUIRED), Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Phase Structure, Pre-Execution Checks, Task Generation Rules (+2 more)

### Community 112 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 113 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 114 - "Implementation Plan: [FEATURE]"
Cohesion: 0.22
Nodes (8): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: [FEATURE], Project Structure, Source Code (repository root), Summary, Technical Context

### Community 115 - "CLI Commands Reference"
Cohesion: 0.25
Nodes (7): 1. Navigation & Inspection, 2. Interaction, 3. Visual Verification, 4. Session Teardown, Agent Browser Skill (Vercel Labs), CLI Commands Reference, MCP Mode

### Community 116 - ".agents/skills/speckit-checklist/SKILL.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 118 - "CLI Commands Reference"
Cohesion: 0.25
Nodes (7): 1. Navigation & Inspection, 2. Interaction, 3. Visual Verification, 4. Session Teardown, Agent Browser Skill (Vercel Labs), CLI Commands Reference, MCP Mode

### Community 119 - ".gemini/skills/speckit-checklist/SKILL.md"
Cohesion: 0.25
Nodes (7): Anti-Examples: What NOT To Do, Checklist Purpose: "Unit Tests for English", Example Checklist Types & Sample Items, Execution Steps, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 120 - ".agents/skills/speckit-clarify/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 121 - ".agents/skills/speckit-implement/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 123 - ".gemini/skills/speckit-clarify/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 124 - ".gemini/skills/speckit-implement/SKILL.md"
Cohesion: 0.29
Nodes (6): Completion Report, Done When, Mandatory Post-Execution Hooks, Outline, Pre-Execution Checks, User Input

### Community 125 - ".agents/skills/speckit-constitution/SKILL.md"
Cohesion: 0.33
Nodes (5): Outline, Post-Execution Checks, Pre-Execution Checks, Scope Guard, User Input

### Community 126 - "Xe"
Cohesion: 0.09
Nodes (9): _a, cs, Do, hs, Rs, w(), Vs, Xe() (+1 more)

### Community 128 - ".gemini/skills/speckit-constitution/SKILL.md"
Cohesion: 0.33
Nodes (5): Outline, Post-Execution Checks, Pre-Execution Checks, Scope Guard, User Input

### Community 130 - ".agents/skills/speckit-taskstoissues/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 132 - ".gemini/skills/speckit-taskstoissues/SKILL.md"
Cohesion: 0.40
Nodes (4): Outline, Post-Execution Checks, Pre-Execution Checks, User Input

### Community 133 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 134 - "Reel Gemini Analyzer Skill"
Cohesion: 0.50
Nodes (3): Core Responsibilities, Non-Negotiable AI Rules, Reel Gemini Analyzer Skill

### Community 135 - "Reel Studio Monitor Skill"
Cohesion: 0.50
Nodes (3): Architecture, Reel Studio Monitor Skill, UI & State Engineering Rules

### Community 136 - "Reel Test & Verification Skill"
Cohesion: 0.50
Nodes (3): Reel Test & Verification Skill, Rules for Claiming Done, Verification Matrix

### Community 137 - "Reel Video Pipeline Skill"
Cohesion: 0.50
Nodes (3): Architecture & Modules, Media Processing Rules, Reel Video Pipeline Skill

### Community 139 - ".create_ass_subtitles"
Cohesion: 0.20
Nodes (4): is_dark_hex(), Generates an Advanced SubStation Alpha (ASS) dual-language subtitle file with…, apply_ass_karaoke(), test_is_dark_hex()

### Community 140 - "Reel Gemini Analyzer Skill"
Cohesion: 0.50
Nodes (3): Core Responsibilities, Non-Negotiable AI Rules, Reel Gemini Analyzer Skill

### Community 141 - "Reel Studio Monitor Skill"
Cohesion: 0.50
Nodes (3): Architecture, Reel Studio Monitor Skill, UI & State Engineering Rules

### Community 142 - "Reel Test & Verification Skill"
Cohesion: 0.50
Nodes (3): Reel Test & Verification Skill, Rules for Claiming Done, Verification Matrix

### Community 143 - "Reel Video Pipeline Skill"
Cohesion: 0.50
Nodes (3): Architecture & Modules, Media Processing Rules, Reel Video Pipeline Skill

### Community 159 - "bind"
Cohesion: 0.36
Nodes (4): bind(), getValue(), setValue(), uh()

### Community 160 - "$c"
Cohesion: 0.83
Nodes (4): $c(), intersectObject(), intersectObjects(), Kc()

## Knowledge Gaps
- **287 isolated node(s):** `state`, `el`, `_creatorAvatarImg`, `VIDEO_FILTERS`, `ctx` (+282 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 935 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **45 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vt` connect `vt` to `three.min.js`, `Wn`, `Lt`, `.setAttribute`, `sn`, `nl`, `.multiplyScalar`, `tn`, `pt`, `Ce`, `ls`, `mi`, `bl`, `jt`, `.constructor`, `no`, `constructor`, `fo`, `update`, `ws`, `.fromArray`, `ct`, `.subVectors`, `Yl`, `fl`, `Xe`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `Lt` connect `Lt` to `At`, `three.min.js`, `.setAttribute`, `sn`, `.distanceTo`, `Ne`, `gt`, `.multiplyScalar`, `tn`, `pt`, `Ce`, `ls`, `mi`, `re`, `jt`, `.constructor`, `constructor`, `update`, `ws`, `.fromArray`, `updateMatrixWorld`, `.subVectors`, `Yl`, `en`, `.applyMatrix4`, `ec`, `.getAttribute`, `Xe`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `sn` connect `sn` to `parseObject`, `three.min.js`, `ls`, `.setAttribute`, `.distanceTo`, `copy`, `.constructor`, `n`, `constructor`, `.toJSON`, `update`, `.fromArray`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `ws()` (e.g. with `d()` and `u()`) actually correct?**
  _`ws()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **What connects `state`, `el`, `_creatorAvatarImg` to the rest of the system?**
  _287 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06143488323164317 - nodes in this community are weakly interconnected._
- **Should `bt` be split into smaller, more focused modules?**
  _Cohesion score 0.09666666666666666 - nodes in this community are weakly interconnected._