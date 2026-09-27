---
name: agent-browser
description: Use when validating web UI changes, testing browser behavior, checking Studio Monitor dashboard layout, inspecting interactive elements with accessibility snapshots, or capturing UI screenshots.
---

# Agent Browser Skill (Vercel Labs)

This skill provides deterministic, token-efficient browser automation and verification using accessibility-tree snapshots instead of bloated raw HTML.

## CLI Commands Reference

All commands can be invoked directly via shell:
`agent-browser <command>` (Windows wrapper at `C:\Users\niceg\AppData\Roaming\npm\agent-browser.cmd`).

### 1. Navigation & Inspection
- **Open Page**:
  ```powershell
  agent-browser open http://127.0.0.1:8000
  ```
- **Accessibility Snapshot (Interactive elements only)**:
  ```powershell
  agent-browser snapshot -i
  ```
  Returns a compact accessibility tree with numbered element references (e.g. `[ref=e1]`, `[ref=e2]`).

- **Full Accessibility Tree**:
  ```powershell
  agent-browser snapshot
  ```

### 2. Interaction
- **Click**:
  ```powershell
  agent-browser click @e2
  ```
- **Fill Input / Textarea**:
  ```powershell
  agent-browser fill @e3 "My Song Title"
  ```
- **Get Element Text / Value**:
  ```powershell
  agent-browser get text @e1
  ```

### 3. Visual Verification
- **Standard Screenshot**:
  ```powershell
  agent-browser screenshot
  ```
- **Annotated Screenshot** (overlays reference numbers on elements):
  ```powershell
  agent-browser screenshot --annotate
  ```

### 4. Session Teardown
- **Close Browser**:
  ```powershell
  agent-browser close
  ```

## MCP Mode
`agent-browser` also operates as a stdio MCP server configured in `~/.gemini/config/mcp_config.json`:
- Command: `agent-browser`
- Args: `["mcp"]`
