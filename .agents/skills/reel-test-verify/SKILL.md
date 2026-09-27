---
name: reel-test-verify
description: Use when validating changes, running unit/integration tests, performing syntax checks (python py_compile, node --check), checking API schemas, verifying media exports, or gating releases.
---

# Reel Test & Verification Skill

This skill enforces the project reliability gate and defines the verification requirements before any task can be marked complete.

## Verification Matrix

| Layer | Verification Command / Check |
|---|---|
| **Python Backend** | `python -m py_compile <path_to_file>` |
| **JavaScript Frontend** | `node --check <path_to_file>` |
| **HTML UI** | Verify zero duplicate `id` attributes and all bindings are null-guarded |
| **API Endpoints** | Validate request/response JSON schema against Pydantic models |
| **Automated Tests** | `pytest tests/ -k <test_target>` |
| **Media Pipeline** | Test both audio+video and silent video inputs; verify 1080x1920 MP4 container |

## Rules for Claiming Done
1. **Verify Before Claiming**:
   - Never report a bug as resolved without executing the corresponding check.
   - Run compilation checks (`py_compile`) for all modified Python files.
   - Run syntax check (`node --check`) for all modified JavaScript scripts.
2. **Transparent Reporting**:
   - Explicitly state the exact command executed and its result in the report.
   - If a test cannot be executed (e.g. missing external hardware encoder), state the limitation clearly rather than pretending it passed.
3. **Regression Safety**:
   - Run the relevant regression tests under `tests/` to guarantee existing features remain intact.
