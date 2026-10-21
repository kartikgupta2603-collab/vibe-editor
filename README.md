# Vibe Editor

Vibe Editor is for those who take existing content, make simple edits and post it as Instagram reels. Add hooks, music, subtitles and watermarks without complicated editing.

Built around my posting workflow on [@lap_lac7](https://www.instagram.com/lap_lac7/), where my reels reached **4 million views in 30 days**.

## Features

- Local files and supported media URLs, including still images with adjustable duration.
- A saved music library, soundtrack trimming, and separate video and music volume controls.
- Hook text, username watermarks, emoji, and manually styled subtitles.
- Optional Gemini-powered hook suggestions, audio analysis, and subtitle generation.
- Filters, background styles, movable video framing, and rectangles that hide unwanted source areas.
- Audio enhancement with original/enhanced comparison.
- Named exports and lightweight export history.

## Run locally

On the creator's Windows PC, the project folder is `C:\Vibe Editor`. Quote this path in terminal commands because it contains a space.

The project is developed on Windows with Python 3.14. Install Python, Node.js for the frontend tests, and FFmpeg with FFprobe available on your PATH.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python run.py
```

Studio opens at `http://127.0.0.1:8000`. Add your own Gemini API key to `.env` if you want AI features. Manual editing does not require a Gemini key. API usage is billed by the provider where applicable.

Downloads, saved projects, music, and exports are local runtime data and are excluded from Git. Keep `.env`, cookies, and access tokens private.

## Development checks

```powershell
python -m pip install -r requirements-dev.txt
node --check app/static/app.js
node --test tests/test_frontend_regressions.js tests/test_hide_areas_ui.js
python -m pytest tests/test_hide_regions_renderer.py -q
```

Media tests require FFmpeg and FFprobe. Some integration tests also require external services or local fixtures.

## Contributing

Issues and focused pull requests are welcome. Describe the problem, explain the change, and include relevant verification. Never commit credentials, personal media, or generated exports.

## License

Original project source code is available under the [MIT License](LICENSE). Third-party libraries, fonts, emoji artwork, creator avatars, and other external media retain their respective rights and licenses; they are not relicensed by this project. See [third-party notices](THIRD_PARTY_NOTICES.md). Only import and publish media you have permission to use.
