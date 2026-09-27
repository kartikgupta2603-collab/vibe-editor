import os
import sys
import webbrowser
import threading
import time
import uvicorn
from app.config.settings import get_settings

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
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    settings = get_settings()
    url = f"http://{settings.host}:{settings.port}"
    print("=" * 60)
    print("ANIME SONG REEL CREATOR - STUDIO MONITOR")
    print(f"UI running at: {url}")
    print("=" * 60)

    # Launch browser automatically
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
