"""Keep Unicode media titles safe in Windows consoles and redirected logs."""
import sys


def configure_console_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="backslashreplace")
            except (OSError, ValueError):
                # Embedded hosts and test capture streams may forbid changes.
                continue
