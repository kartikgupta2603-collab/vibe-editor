import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("entry", [
    "from app.config.console import configure_console_utf8; configure_console_utf8()",
    "import app.main",
])
def test_server_accepts_unicode_titles_with_a_windows_legacy_console(entry):
    env = dict(os.environ, PYTHONIOENCODING="cp1252:strict")
    message = "Arabic: " + chr(0x0623) + " emoji: " + chr(0x1F92F)
    code = f"{entry}; import sys; print({message!r}); print({message!r}, file=sys.stderr)"
    result = subprocess.run([sys.executable, "-c", code], cwd=Path(__file__).resolve().parents[1],
                            env=env, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr.decode("utf-8", errors="replace")
    assert message in result.stdout.decode("utf-8")
    assert message in result.stderr.decode("utf-8")


def test_console_setup_tolerates_capture_streams(monkeypatch):
    from app.config.console import configure_console_utf8
    import app.config.console as console

    class Capture:
        def reconfigure(self, **kwargs):
            raise ValueError("Captured stream cannot be changed")

    monkeypatch.setattr(console.sys, "stdout", Capture())
    monkeypatch.setattr(console.sys, "stderr", object())
    configure_console_utf8()
