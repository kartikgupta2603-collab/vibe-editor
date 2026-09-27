---
name: reel-gemini-analyzer
description: Use when working on song hook detection, lyrics transcription, subtitle timing alignment, Gemini API integration, prompt templates, or AI fallback handling.
---

# Reel Gemini Analyzer Skill

This skill governs all AI-driven audio intelligence, song hook analysis, and lyrics transcription within `app/ai/gemini_client.py`.

## Core Responsibilities
- **Audio Hook Detection**: Identifies optimal 15s - 60s reel segments based on song structure (chorus, drop, build-up, emotional peak).
- **Lyrics Transcription & Alignment**: Transcribes lyrics with precise millisecond timestamps for word-by-word or phrase-by-phrase subtitle sync.
- **Visual Style Recommendation**: Analyzes song mood/tempo to suggest matching visual subtitle presets (e.g., `bold`, `energetic`, `cinematic`).

## Non-Negotiable AI Rules
1. **Honest AI Behaviour**:
   - Audio analysis must evaluate the supplied audio data or acoustic features.
   - Never invent song titles, artists, fake confidence scores, or simulated trend analytics.
   - Clearly label fallback outputs when AI analysis is not performed.
2. **Documented Model IDs Only**:
   - Use official Gemini model identifiers (e.g. `gemini-2.5-flash` or `gemini-2.5-pro`).
   - Store model fallback sequences in a single shared configuration constant.
3. **Async Event Loop Safety**:
   - Never run blocking API calls or synchronous HTTP inside `async def` route handlers.
   - Wrap long-running CPU or file I/O operations in `await asyncio.to_thread(...)`.
4. **Structured JSON Output**:
   - Enforce strict JSON output schemas using Gemini structured outputs (`response_mime_type="application/json"`, Pydantic response models).
   - Validate JSON parsing defensively with explicit error catching.
