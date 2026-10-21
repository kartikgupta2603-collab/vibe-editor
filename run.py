import os
import sys
import webbrowser
import threading
import time
import uvicorn
from app.config.settings import get_settings
from app.config.console import configure_console_utf8

def open_browser(url: str):
    time.sleep(1.2)
    try:
        if sys.platform == "win32":
            os.startfile(url)
        else:
            webbrowser.open(url)
    except Exception:
        pass

if __name__ == "__main__":
    configure_console_utf8()

    settings = get_settings()
    url = f"http://{settings.host}:{settings.port}"
    print("=" * 60)
    print("Vibe Editor")
    print(f"UI running at: {url}")
    print("=" * 60)

    # Launch browser automatically
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    # This is the creator's desktop Studio, not a development server. Watching
    # the whole workspace also watches large 4K downloads and exports, which
    # consumes a CPU core and makes the monitor/UI feel laggy.
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
