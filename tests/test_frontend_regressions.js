const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
function section(start, end) {
  const begin = source.indexOf(start);
  assert.ok(begin >= 0, start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(finish > begin, end);
  return source.slice(begin, finish);
}
function context() {
  const elements = new Proxy({}, { get(target, key) {
    if (!target[key]) target[key] = {classList: {add() {}, remove() {}, toggle() {}, contains() {return false;}}, pause() {}, play: async () => {}, removeAttribute() {}, load() {}, addEventListener(name, callback) {this[name] = callback;}, textContent: '', value: ''};
    return target[key];
  }});
  const ctx = {musicPayload: null, state: {sourceGeneration: 0, songName: '', videoPath: '', textElements: {}, adjustments: {}}, el: elements,
    console, setTimeout, clearTimeout, fetch: async () => ({ok: false}), saveProjectState() {}, renderReel() {}, showToast() {},
    pauseVideo() {}, AbortController, initDynamicClipForVideo() {}, URL: {createObjectURL: file => `blob:${file.name}`, revokeObjectURL() {}}, FormData: class {append() {}}};
  vm.createContext(ctx);
  vm.runInContext(section('const SUBTITLE_ANIMATION_OPTIONS =', 'function renderDualSubtitles('), ctx);
  vm.runInContext(section('function isLoadedStudioImage()', 'function previewImageDuration('), ctx);
  vm.runInContext(section('function getBorderShape()', 'function syncBorderShapeControls()'), ctx);
  vm.runInContext(section('const audioAudition =', 'async function ensureServerVideoPathForAnalysis()'), ctx);
  vm.runInContext(section('async function ensureServerVideoPathForAnalysis()', 'function extractSongMetaFromTitle'), ctx);
  vm.runInContext(section('function extractSongMetaFromTitle(', 'function initDynamicClipForVideo('), ctx);
  vm.runInContext(section('async function loadFile(', 'function applyAIClip('), ctx);
  vm.runInContext(section('function getDefaultAIAnalysis(', 'function renderAIResults('), ctx);
  return ctx;
}
test('selecting B clears the completed upload from A', async () => {
  const c=context();
  c.state.fullLyrics=[{text_jp:'old source'}];
  c.state._uploadPromise=Promise.resolve('A.mp4');
  await c.loadFile('B.mp4');
  assert.equal(await c.ensureServerVideoPathForAnalysis(), 'B.mp4');
  assert.equal(c.state._uploadPromise, null);
  assert.equal(c.state.fullLyrics.length, 0);
});

test('hook generator shows the server error instead of pretending hooks were generated', () => {
  const hookUi=section('// AI Viral Hook Generator Button', '// Username Watermark Toggle');
  assert.match(hookUi, /if \(!res\.ok\)/);
  assert.match(hookUi, /Hook generation failed/);
});

function hookContext() {
  const c = context();
  Object.assign(c.state, {videoPath: 'reel.mp4', startTime: 12, endTime: 32,
    songName: 'Song', animeName: 'Anime', videoTitle: 'Reel', seriesFormat: 'Current hook',
    aiAnalysis: {clip_type: 'Wrong earlier moment', reason: 'Stale reason'}});
  c.messages = [];
  c.showToast = message => c.messages.push(message);
  const container = c.el.aiHooksContainer;
  container.children = [];
  Object.defineProperty(container, 'innerHTML', {set() {this.children = [];}});
  container.appendChild = button => container.children.push(button);
  c.document = {getElementById() {return null;}, createElement() {return {style: {}, addEventListener(name, callback) {this[name] = callback;}};}};
  c.fetch = async () => ({ok: true, json: async () => ({hooks: [
    {hook: 'That quiet goodbye hits harder', evidence: 'A character waves goodbye.'}
  ]})});
  vm.runInContext(section('function setStudioAIStatus(', 'function setupMetadataAndAI()'), c);
  vm.runInContext(section('// AI Viral Hook Generator Button', '// AI Instagram Caption Generator'), c);
  return c;
}

test('hooks wait for upload and send the actual selected reel without stale analysis hints', async () => {
  const c = hookContext();
  let finishUpload;
  let request;
  c.state.videoPath = 'blob:upload';
  c.state._uploadPromise = new Promise(resolve => {finishUpload = resolve;});
  c.fetch = async (url, options) => {
    request = {url, body: JSON.parse(options.body)};
    return {ok: true, json: async () => ({hooks: [{hook: 'A grounded hook', evidence: 'A visible scene'}]})};
  };
  const pending = c.el.btnGenerateAiHooks.click();
  assert.equal(request, undefined);
  finishUpload('uploaded.mp4');
  await pending;
  assert.deepEqual(request, {url: '/api/ai/viral-hooks', body: {
    video_path: 'uploaded.mp4', start_time: 12, end_time: 32,
    song_name: 'Song', anime_name: 'Anime', video_title: 'Reel'
  }});
  assert.match(c.el.aiHooksContainer.children[0].title, /A visible scene/);
});

test('hooks reject a response for a changed source or selected trim', async () => {
  for (const change of [c => c.state.sourceGeneration++, c => c.state.startTime++]) {
    const c = hookContext();
    let finish;
    c.fetch = async () => ({ok: true, json: () => new Promise(resolve => {finish = resolve;})});
    const pending = c.el.btnGenerateAiHooks.click();
    await new Promise(resolve => setImmediate(resolve));
    change(c);
    finish({hooks: [{hook: 'Obsolete hook'}]});
    await pending;
    assert.equal(c.el.aiHooksContainer.children.length, 0);
    assert.match(c.messages.at(-1), /selected reel changed/);
    assert.equal(c.el.btnGenerateAiHooks.disabled, false);
  }
});

test('previous hook suggestions cannot be applied after the reel changes', async () => {
  const c = hookContext();
  await c.el.btnGenerateAiHooks.click();
  const button = c.el.aiHooksContainer.children[0];
  c.state.endTime++;
  button.click();
  assert.equal(c.state.seriesFormat, 'Current hook');
  assert.equal(c.el.aiHooksContainer.children.length, 0);
  assert.match(c.messages.at(-1), /selected reel changed/);
});

test('hook generation clears old suggestions and reports media failures without fallback hooks', async () => {
  const c = hookContext();
  await c.el.btnGenerateAiHooks.click();
  assert.equal(c.el.aiHooksContainer.children.length, 1);
  c.fetch = async () => ({ok: false, json: async () => ({detail: 'Could not read reel audio'})});
  await c.el.btnGenerateAiHooks.click();
  assert.equal(c.el.aiHooksContainer.children.length, 0);
  assert.match(c.messages.at(-1), /Could not read reel audio/);
  assert.equal(c.state.seriesFormat, 'Current hook');
});

test('hooks reject missing media and selections longer than six minutes before requesting AI', async () => {
  for (const change of [c => {c.state.videoPath = '';}, c => {c.state.endTime = 373;}]) {
    const c = hookContext();
    change(c);
    let calls = 0;
    c.fetch = async () => {calls++;};
    await c.el.btnGenerateAiHooks.click();
    assert.equal(calls, 0);
    assert.match(c.messages.at(-1), /upload did not finish|6 minutes or less/);
  }
});

test('viral hook buttons show the complete hook instead of clipping it to one line', () => {
  const hookUi=section('// AI Viral Hook Generator Button', '// Username Watermark Toggle');
  assert.match(hookUi, /flex:1 1 100%/);
  assert.match(hookUi, /white-space:normal/);
  assert.doesNotMatch(hookUi, /text-overflow:ellipsis/);
});

test('source UI uses one equal-width Paste Any URL choice instead of separate URL tabs', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  const sourceTabs = pageText.slice(pageText.indexOf('<div class="source-tabs">'), pageText.indexOf('</div>', pageText.indexOf('<div class="source-tabs">')));
  assert.match(sourceTabs, /id="tab-src-local"/);
  assert.match(sourceTabs, /id="tab-src-yt"[^>]*>🔗 Paste Any URL/);
  assert.doesNotMatch(sourceTabs, /tab-src-ig|Instagram URL|YouTube \/ X URL/);
  assert.match(pageText, /placeholder="Paste a video, image or post URL"/);
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(cssText, /\.source-tab-btn \{[\s\S]*?flex: 1;/);
});

test('URL downloads load only the video and leave Gemini actions manual', () => {
  const youtubeDownload = section('function setupYouTubeDownloader()', '// FILE SELECTION & PROBING');
  const instagramDownload = section('function setupInstagramDownloader()', 'setupInstagramDownloader();');
  for (const downloadUi of [youtubeDownload, instagramDownload]) {
    assert.doesNotMatch(downloadUi, /ai_analysis/);
    assert.doesNotMatch(downloadUi, /task\.lyrics/);
    assert.doesNotMatch(downloadUi, /Generate Full Subtitles/);
  }
  assert.match(source, /fetch\("\/api\/ai\/analyze"/);
  assert.match(source, /fetch\("\/api\/ai\/full-subtitles"/);
});

test('URL download pollers settle one completed task exactly once', () => {
  const youtubeDownload = section('function setupYouTubeDownloader()', '// FILE SELECTION & PROBING');
  const instagramDownload = section('function setupInstagramDownloader()', 'setupInstagramDownloader();');
  for (const downloadUi of [youtubeDownload, instagramDownload]) {
    assert.match(downloadUi, /let pollFinished = false;/);
    assert.match(downloadUi, /if \(pollFinished\) return;/);
    assert.match(downloadUi, /task\.status === "completed"\) \{\s*pollFinished = true;/);
  }
});

test('Viral Hook takes the full row after the unused Day Number control is removed', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  const appText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'),'utf8');
  assert.doesNotMatch(pageText, /input-day-number/);
  assert.match(pageText, /class="form-group flex-1">\s*<div style="display:flex; justify-content:space-between/);
  assert.match(appText, /if \(el\.btnDayDec && el\.btnDayInc && el\.inputDay\)/);
});

test('viral hook uses bold white anime-edit lettering with a black outline', () => {
  const hookCode=section('function getViralHookLayout(', 'function renderReel()') +
    section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  assert.match(hookCode, /split\("\\n"\)/);
  assert.match(hookCode, /Math\.max\(3, requiredLineCount\)/);
  assert.match(hookCode, /600 \$\{sSize\}px \$\{HOOK_FONT_STACK\}/);
  assert.match(hookCode, /allowCustomSize \? 120 : 72/);
  assert.match(hookCode, /ctx\.strokeStyle = "#080808"/);
  assert.match(hookCode, /ctx\.strokeText\(line/);
  assert.match(hookCode, /!!seriesCfg\._custom/);
  assert.match(hookCode, /ctx\.textBaseline = "top"/);
  assert.doesNotMatch(hookCode, /seriesText\.toUpperCase\(\)/);
  assert.doesNotMatch(hookCode, /800 \$\{sSize\}px/);
});

test('viral hook preserves Enter as a deliberate Studio line break', () => {
  const c = context();
  c.HOOK_FONT_STACK = "'Segoe UI', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  const measured = [];
  const canvas = {font: '', measureText(text) { measured.push(text); return {width: text.length * 12}; }};
  c.ctx = canvas;
  vm.runInContext(section('function getViralHookLayout(', 'const EDIT_RENDER_INTERVAL'), c);
  const layout = c.getViralHookLayout(canvas, 'First take\nSecond take', 38);
  assert.deepEqual(Array.from(layout.lines), ['First take', 'Second take']);
  assert.ok(measured.includes('First take'));
  assert.ok(measured.includes('Second take'));
  assert.doesNotMatch(source, /String\(rawText \|\| ""\)\.replace\(\/\\s\+\/g, " "\)/);
});

test('hook font menu excludes retired Impact and Franklin Gothic Heavy choices', () => {
  const hookFontMenu = html.slice(html.indexOf('<select id="select-hook-font">'), html.indexOf('</select>', html.indexOf('<select id="select-hook-font">')));
  assert.doesNotMatch(hookFontMenu, /value="impact"|Impact — anime edit/);
  assert.doesNotMatch(hookFontMenu, /value="franklin_heavy"|Franklin Gothic Heavy/);
  assert.match(source, /const DEFAULT_HOOK_FONT = "arial_black";/);
  assert.match(source, /AVAILABLE_HOOK_FONTS\.includes\(savedHookFont\) \? savedHookFont : DEFAULT_HOOK_FONT/);
});

test('each hook font menu option previews its own typeface', () => {
  const hookFontUi = section('function applyHookFontOptionPreviews(', 'function getViralHookLayout(');
  assert.match(hookFontUi, /option\.style\.fontFamily = getFontStack\(option\.value, DEFAULT_HOOK_FONT\)/);
  assert.match(hookFontUi, /option\.style\.fontWeight = String\(getHookFontWeight\(option\.value\)\)/);
  assert.match(source, /applyHookFontOptionPreviews\(el\.selectHookFont\)/);
});

test('hook font menu includes the clean thin Segoe UI reference style', () => {
  const hookFontMenu = html.slice(html.indexOf('<select id="select-hook-font">'), html.indexOf('</select>', html.indexOf('<select id="select-hook-font">')));
  assert.match(hookFontMenu, /value="segoe">Segoe UI — clean thin/);
  assert.match(source, /segoe: 400/);
  assert.match(source, /"arial_black", "segoe", "bahnschrift"/);
});

test('viral hooks ignore a trailing blank textarea line without adding a black bar', () => {
  const c = context();
  c.HOOK_FONT_STACK = "Impact, sans-serif";
  const canvas = {font: '', measureText(text) { return {width: text.length * 12}; }};
  c.ctx = canvas;
  vm.runInContext(section('function getViralHookLayout(', 'const EDIT_RENDER_INTERVAL'), c);
  const layout = c.getViralHookLayout(canvas, 'First line\nSecond line\n', 38);
  assert.deepEqual(Array.from(layout.lines), ['First line', 'Second line']);
  assert.match(source, /while \(hardLines\.length > 1 && !hardLines\[hardLines\.length - 1\]\.trim\(\)\) hardLines\.pop\(\)/);
});

test('hook layout keeps repeated, leading and trailing spaces visible in the measured text', () => {
  const c = context(); c.HOOK_FONT_STACK = 'sans-serif';
  const canvas = {font: '', measureText(text) {return {width: text.length * 12};}};
  c.ctx = canvas;
  vm.runInContext(section('function getViralHookLayout(', 'const EDIT_RENDER_INTERVAL'), c);
  for (const text of ['First   second', '   Indented', 'Trailing   ', 'A  ❤️   B', 'A\n   B', 'A\n\nB']) {
    const layout = c.getViralHookLayout(canvas, text, 38, 1000);
    assert.deepEqual(Array.from(layout.lines), text.split('\n'));
  }
  const single = c.getViralHookLayout(canvas, 'A B', 38, 1000);
  const multiple = c.getViralHookLayout(canvas, 'A    B', 38, 1000);
  assert.ok(c.measureHookLine(canvas, multiple.lines[0], multiple.size) > c.measureHookLine(canvas, single.lines[0], single.size));
  const wrapped = c.getViralHookLayout(canvas, 'First   second', 38, 100);
  assert.ok(wrapped.lines.length > 1);
  for (const line of wrapped.lines) assert.ok(canvas.measureText(line).width <= 100);
});

test('manual hook lines share a left edge and respect the creator line gap', () => {
  const c = context();
  c.HOOK_FONT_STACK = "'Segoe UI', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  const strokes = [];
  const canvas = {
    font: '', textAlign: '', textBaseline: '',
    save() {}, restore() {},
    measureText(text) { return {width: text.length * 12}; },
    strokeText(text, x, y) { strokes.push({text, x, y}); }, fillText() {},
  };
  c.ctx = canvas;
  c.el = {inputWatermarkText: {value: ''}};
  c.isDarkColor = () => false;
  c.state = {
    showSeriesText: true,
    seriesFormat: 'First line\nSecond', dayNumber: 1,
    textElements: {series: {x: 540, y: 360, size: 38, lineGap: 28, color: '#ffffff'}},
    watermark: {enabled: false}, _textBoxes: {},
  };
  vm.runInContext(section('function getViralHookLayout(', 'function renderReel()'), c);
  c.drawStudioText(canvas, 'black');
  assert.equal(strokes.length, 2);
  assert.equal(strokes[0].x, strokes[1].x);
  assert.equal(strokes[1].y - strokes[0].y, Math.round(38 * 1.22) + 28);
  const compact = c.getViralHookLayout(canvas, 'A\nB', 38, 920, false, 0);
  const spaced = c.getViralHookLayout(canvas, 'A\nB', 38, 920, false, 60);
  assert.equal(spaced.lineHeight - compact.lineHeight, 60);
});

test('Studio exposes a saved hook line-gap control and sends it to export', () => {
  const pageText = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  assert.match(pageText, /id="slider-hook-line-gap"/);
  assert.match(source, /hookLineGapRow: document\.getElementById\("hook-line-gap-row"\)/);
  assert.match(source, /line_gap: state\.textElements && state\.textElements\.series/);
  assert.match(source, /state\.textElements\.series\.lineGap = gap/);
});

test('viral hook supports emoji typed or inserted at the cursor', () => {
  const pageText = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  const cssText = fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'), 'utf8');
  assert.match(pageText, /data-hook-emoji="⚡"/);
  assert.match(pageText, /data-hook-emoji="👀"/);
  assert.match(pageText, /data-hook-emoji="❤️"/);
  assert.match(pageText, /data-hook-emoji="💔"/);
  assert.match(pageText, /data-hook-emoji="❌"/);
  assert.match(pageText, /data-hook-emoji="✅"/);
  assert.match(cssText, /\.hook-emoji-row\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(cssText, /\.hook-emoji-button\s*\{[^}]*flex:\s*0 0 26px;/s);
  assert.match(cssText, /'Segoe UI Emoji'/);
  assert.match(source, /const HOOK_FONT_STACK = "'Segoe UI', 'Segoe UI Emoji'/);
  assert.match(source, /hookEmojiButtons: document\.querySelectorAll\("\[data-hook-emoji\]"\)/);
  assert.match(source, /input\.value = input\.value\.slice\(0, start\) \+ emoji \+ input\.value\.slice\(end\)/);
});

test('studio monitor uses a lighter preview canvas while keeping export-matched hook geometry', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  const hookCode=section('function getViralHookLayout(', 'function renderReel()') +
    section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  assert.match(pageText, /id="reel-canvas" width="540" height="960"/);
  assert.match(source, /const w = 1080;/);
  assert.match(source, /const h = 1920;/);
  assert.match(hookCode, /600 \$\{size\}px \$\{HOOK_FONT_STACK\}/);
});

test('AI caption UI requests a copy-ready Instagram caption and saves it with the project', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.match(pageText, /id="btn-generate-ai-caption"/);
  assert.match(pageText, /id="ai-caption-output"/);
  assert.match(pageText, /id="input-ai-instruction"/);
  assert.match(pageText, /Used by both buttons · up to 200 lines/);
  assert.match(pageText, /maxlength="24000"/);
  const captionUi=section('// AI Instagram Caption Generator', '// Username Watermark Toggle');
  assert.match(captionUi, /fetch\("\/api\/ai\/instagram-caption"/);
  assert.match(captionUi, /creator_instruction: state\.aiInstruction\.trim\(\)/);
  assert.match(captionUi, /state\.caption = caption/);
  assert.match(captionUi, /navigator\.clipboard\.writeText/);
  assert.match(source, /caption: state\.caption \|\| ""/);
  assert.match(source, /creator_instruction: state\.aiInstruction\.trim\(\)/);
  assert.match(source, /aiInstruction: state\.aiInstruction \|\| ""/);
  assert.match(source, /project\.hookInstruction, project\.captionInstruction/);
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(cssText, /\.ai-direction-input \{[\s\S]*?min-height: 64px;[\s\S]*?overflow: auto;/);
  assert.match(source, /e\.target\.value\.slice\(0, 24000\)/);
});

test('phone preview is right aligned with a compact phone-width frame', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.doesNotMatch(pageText, /STUDIO MONITOR|monitor-hud|hud-dot/);
  assert.match(cssText, /\.studio-stage-wrapper \{[\s\S]*?justify-content: flex-end;[\s\S]*?padding: 0 20px 0 12px;/);
  assert.match(cssText, /\.studio-monitor \{[\s\S]*?height: min\(100%, 860px\);/);
  assert.doesNotMatch(cssText, /\.monitor-hud|\.hud-dot|@keyframes pulseDot/);
});

test('loaded-file status stays available while the top application header is hidden', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(pageText, /id="active-file-pill"/);
  assert.doesNotMatch(pageText, /REEL<span class="gradient-text">FORGE<\/span>|class="header-right"/);
  assert.match(cssText, /\.app-header \{\s*display: none;/);
  assert.match(pageText, /class="timeline-actions"[\s\S]*?id="btn-reset-session"[\s\S]*?id="btn-export-quick"/);
});

test('Studio keeps source controls left, editing panels center, and the phone preview right', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(pageText, /id="workspace-filter-slot"/);
  assert.match(pageText, /id="workspace-reel-style-slot"/);
  assert.match(pageText, /id="reel-style-stage-dock"/);
  assert.match(pageText, /id="reel-style-card"/);
  assert.match(cssText, /\.sidebar-nav \{\s*order: 1;/);
  assert.match(cssText, /\.inspector-panel \{\s*order: 2;/);
  assert.match(cssText, /\.viewport-stage \{\s*order: 3;/);
  assert.match(cssText, /\.studio-stage-wrapper \{[\s\S]*?grid-row: 1 \/ span 2;/);
  assert.match(cssText, /\.studio-edit-workspace \{[\s\S]*?grid-template-rows: 96px minmax\(250px, 1fr\);/);
  assert.match(cssText, /\.stage-reel-style-dock \{\s*display: none;/);
  assert.match(source, /function placeStudioPanels\(\)/);
  assert.match(source, /el\.workspaceFilterSlot\.appendChild\(el\.dockFilters\)/);
  assert.match(source, /el\.workspaceReelStyleSlot\.appendChild\(el\.reelStyleCard\)/);
  assert.match(source, /el\.studioEditWorkspace\.classList\.toggle\("hidden", targetView !== "studio"\)/);
  assert.doesNotMatch(pageText, /btn-song-window-up|btn-song-window-down/);
});

test('white-on-black hooks use a joined stepped background that follows each line', () => {
  const hookCode = section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  assert.match(hookCode, /const barPadX = Math\.max\(16, Math\.round\(sSize \* 0\.22\)\)/);
  assert.match(hookCode, /const barPadY = Math\.max\(7, Math\.round\(sSize \* 0\.12\)\)/);
  assert.match(hookCode, /const barHeight = Math\.round\(sSize \* 0\.96\) \+ barPadY \* 2/);
  assert.match(hookCode, /const hookBars = seriesLines\.map/);
  assert.match(hookCode, /const textLeft = isManualMultiline \? hookTextX - maxSeriesW \/ 2 : hookTextX - lineW \/ 2/);
  assert.match(hookCode, /const connectorLeft = Math\.max\(current\.left, next\.left\)/);
  assert.match(hookCode, /ctx\.rect\(connectorLeft, connectorTop, connectorRight - connectorLeft, connectorHeight\)/);
  assert.match(hookCode, /ctx\.fill\(\)/);
  assert.doesNotMatch(hookCode, /maxSeriesW \+ barPadX \* 2, blockHeight/);
});

test('large hooks wrap before the mobile-safe side margins', () => {
  const hookCode = section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  assert.match(hookCode, /const hookSafeWidth = 980/);
  assert.match(hookCode, /Math\.max\(50 \+ maxSeriesW \/ 2, Math\.min\(1030 - maxSeriesW \/ 2, hookTextX\)\)/);
  assert.match(hookCode, /hookSafeWidth, !!seriesCfg\._custom/);
});

test('black-on-white hooks use a full-width top banner above the reel', () => {
  const hookCode = section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  assert.match(hookCode, /const isWhiteHookBanner = state\.hookStyle === "black_on_white"/);
  assert.match(hookCode, /const hookSafeWidth = 980/);
  assert.match(hookCode, /let hookTextX = isWhiteHookBanner \? 540 : seriesCfg\.x/);
  assert.match(hookCode, /const whiteBannerTop = isWhiteHookBanner \? Math\.max\(0, visualReelTop - whiteBannerHeight\) : 0/);
  assert.match(hookCode, /whiteBannerTop \+ whiteBannerPadding/);
  assert.match(hookCode, /ctx\.fillRect\(0, whiteBannerTop, 1080, whiteBannerHeight\)/);
  assert.match(source, /state\.hookStyle === "black_on_white" \? "arial_black" : "georgia"/);
  assert.match(source, /state\._visualReelTop = visibleFrameY/);
  assert.match(source, /null, fgY\);/);
});

test('white-on-black appearance is available for both hooks and subtitles', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  const hookCode = section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  const subtitleCode = section('function renderDualSubtitles(', 'function renderReel(');
  assert.match(html, /id="select-hook-style"/);
  assert.match(html, /value="black_on_white">Black on white bar/);
  assert.match(html, /value="georgia">Georgia — classic serif/);
  assert.match(html, /data-style="white_on_black"/);
  assert.match(hookCode, /const hookUsesBar = state\.hookStyle === "white_on_black" \|\| state\.hookStyle === "black_on_white"/);
  assert.match(hookCode, /const hookBarColor = state\.hookStyle === "black_on_white" \? "#ffffff" : "#000000"/);
  assert.match(hookCode, /if \(state\.hookStyle === "black_on_white"\) \{\n      ctx\.shadowColor = "transparent";\n      ctx\.shadowBlur = 0;/);
  assert.match(source, /\["white_on_black", "black_on_white"\]\.includes\(state\.hookStyle\)/);
  assert.match(subtitleCode, /stylePreset === "white_on_black"/);
  assert.match(subtitleCode, /ctx\.fillRect\(-lineW \/ 2 - barPadX/);
  assert.match(subtitleCode, /stylePreset === "white_on_black"\n    \? getFontStack\("georgia", "segoe"\)/);
});

test('Scene Blend hook uses a strong frame-aware mask in preview and export', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  const hookCode = section('// 4. SERIES HEADER TEXT / VIRAL HOOK', '// Omit Song Name');
  const rendererSource = fs.readFileSync(require('node:path').join(__dirname, '../app/video/renderer.py'), 'utf8');
  assert.match(html, /value="scene_blend">Scene Blend — strong/);
  assert.match(hookCode, /const isSceneBlendHook = state\.hookStyle === "scene_blend"/);
  assert.match(hookCode, /ctx\.globalCompositeOperation = hookSceneBlendMask \? "source-over" : "overlay"/);
  assert.match(hookCode, /visibleHookOpacity \* 0\.80/);
  assert.match(hookCode, /visibleHookOpacity \* 0\.20/);
  assert.match(source, /studio_hook_scene_mask: typeof studioHookSceneMask === "string" \? studioHookSceneMask : null/);
  assert.match(rendererSource, /def _scene_hook_filter\(/);
  assert.match(rendererSource, /lut=y='val\*0\.80'/);
  assert.match(rendererSource, /val\*4\+64/);
  assert.match(rendererSource, /val\*0\.80/);
});

test('Reel Style keeps direct visual controls and removes the unused preset shortcut buttons', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.doesNotMatch(pageText, /id="template-quick-grid"|class="tpl-btn"|data-tpl="(?:cinematic|viral_creator|energetic|bold|clean|dark|minimal)"/);
  assert.match(pageText, /id="bg-mode-grid"/);
  assert.match(pageText, /id="border-mode-grid"/);
});

test('Filters use a compact no-scroll grid in the center workspace', () => {
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(cssText, /\.studio-edit-workspace \{[\s\S]*?grid-template-rows: 96px minmax\(250px, 1fr\);/);
  assert.match(cssText, /\.workspace-filter-slot \.dock-grid-scroll \{[\s\S]*?grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);[\s\S]*?grid-template-rows: minmax\(0, 1fr\);[\s\S]*?overflow-y: hidden;/);
  assert.match(cssText, /\.workspace-filter-slot \.filter-thumb \{[\s\S]*?height: 24px;/);
  const filterCatalog = section('const VIDEO_FILTERS = {', 'function computeVideoFilterCss()');
  for (const removedFilter of ['crema', 'gingham', 'juno', 'lark', 'ludwig', 'perpetua', 'reyes', 'slumber']) {
    assert.doesNotMatch(filterCatalog, new RegExp(`\\b${removedFilter}:`));
  }
  assert.match(source, /if \(!VIDEO_FILTERS\[state\.colorFilter\]\) state\.colorFilter = "original";/);
});

test('collapsing Filters gives its workspace height to Reel Style while keeping the reopen control', () => {
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(cssText, /\.studio-edit-workspace\.filter-dock-collapsed \{\s*grid-template-rows: 44px minmax\(250px, 1fr\);/);
  assert.match(cssText, /\.workspace-filter-slot \.stage-dock\.collapsed \{\s*height: 44px;/);
  assert.match(cssText, /\.stage-dock\.collapsed \{\s*width: 112px;/);
  assert.match(cssText, /\.stage-dock\.collapsed \.dock-icon \{\s*display: inline-flex;/);
  assert.match(cssText, /\.stage-dock\.collapsed \.dock-title \{\s*display: block !important;/);
  assert.match(source, /el\.studioEditWorkspace\.classList\.toggle\("filter-dock-collapsed", isCollapsed\)/);
  assert.match(source, /setAttribute\("aria-label", isCollapsed \? "Expand Filters" : "Collapse Filters"\)/);
});

test('Studio navigation exposes the lightweight export History screen', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.match(pageText, /data-view="history"/);
  assert.match(pageText, /id="view-history"/);
  assert.match(pageText, /id="export-history-list"/);
});

test('Studio navigation does not expose the retired Styles template screen', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.doesNotMatch(pageText, /data-view="templates"|id="view-templates"|Reel Style Templates|id="templates-catalog"/);
  assert.doesNotMatch(source, /targetView === "templates"/);
});

test('CapCut-style timeline keeps project actions beneath it while the preview fills the right', () => {
  const cssText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'),'utf8');
  assert.match(cssText, /\.viewport-stage \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(330px, 430px\);/);
  assert.match(cssText, /\.studio-stage-wrapper \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1 \/ span 2;/);
  assert.match(cssText, /\.timeline-bar\.capcut-timeline-root \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 2;[\s\S]*?height: 120px;[\s\S]*?flex-direction: column;/);
  assert.match(cssText, /\.timeline-track-row \{[\s\S]*?height: 74px;/);
  assert.match(cssText, /\.timeline-actions \{[\s\S]*?height: 46px;/);
  assert.match(cssText, /\.timeline-actions \.btn \{[\s\S]*?flex: 1 1 0;/);
  assert.match(cssText, /\.inspector-panel \{[\s\S]*?padding-top: 0;/);
});

test('Song Window Y slider updates preview, project state, and export without movement buttons', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.match(pageText, /id="slider-song-window-y"/);
  assert.match(pageText, /id="val-song-window-y"/);
  assert.doesNotMatch(pageText, /btn-song-window-up|btn-song-window-down|btn-song-window-center/);
  assert.match(source, /sliderSongWindowY: document\.getElementById\("slider-song-window-y"\)/);
  assert.match(source, /state\.adjustments\.verticalOffset = Number\.isFinite\(verticalOffset\)/);
  assert.match(source, /vertical_offset: Number\.isFinite\(Number\(state\.adjustments\.verticalOffset\)\)/);
});

test('Song Window size and its separate Border Gap control persist to preview and export', () => {
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.match(pageText, /id="slider-scale" min="0\.40" max="1\.40"/);
  assert.match(pageText, /id="slider-window-inset" min="0" max="180" step="2" value="0"/);
  assert.match(source, /sliderWindowInset: document\.getElementById\("slider-window-inset"\)/);
  assert.match(source, /const fgScale = getSongWindowScale\(state\.adjustments\.scale\);/);
  assert.match(source, /const visibleInset = Math\.min\(getSongWindowInset\(state\.adjustments\.windowInset\)/);
  assert.match(source, /window_inset: Math\.min\(180, Math\.max\(0, Number\(state\.adjustments\.windowInset\) \|\| 0\)\),/);
});

test('Analyze Song cannot overwrite absolute whole-video subtitles with moment-only cues', () => {
  const analysisUi=section('// AI Hook Analysis', 'function handleApplyRecommended()');
  assert.doesNotMatch(analysisUi, /state\.lyrics = data\.lyrics/);
  assert.match(analysisUi, /applyAIClip\(data\.recommended_start, data\.recommended_end, "rec"\)/);
  const applyClip=section('function applyAIClip(', 'function getDefaultAIAnalysis(');
  assert.match(applyClip, /state\.lyrics = \[\]/);
  assert.match(applyClip, /timeline_basis: cue\.timeline_basis \|\| "absolute"/);
});

test('subtitle visibility toggle redraws the Studio preview before saving', () => {
  const controls=section('if (el.checkSubtitles)', 'const allStyleCards');
  assert.match(controls, /state\.showLyrics = e\.target\.checked;/);
  assert.match(controls, /state\.showLyrics = e\.target\.checked;\s*renderReel\(\);\s*saveProjectState\(\);/);
});

test('whole-video subtitles become visible and survive changing the chosen moment', () => {
  const subtitleUi=section('// Generate vocal-synchronized subtitles for the ENTIRE video', 'if (el.checkSubtitles)');
  assert.match(subtitleUi, /state\.showLyrics = true;/);
  assert.match(source, /if \(el\.checkSubtitles\) el\.checkSubtitles\.checked = true;/);
  const restoreUi=section('// 7. Live Dual Subtitles', '// 8. Smart Seamless Loop');
  assert.match(restoreUi, /state\.fullLyrics = state\.lyrics;/);
  assert.match(restoreUi, /lyricsByMoment = \{ .*full: state\.lyrics \}/);
});

test('manual subtitle generation turns visibility on for the live monitor', () => {
  const manualGeneration=source.slice(source.indexOf('// Generate vocal-synchronized subtitles for the ENTIRE video'));
  assert.match(manualGeneration, /state\.showLyrics = true;\s*if \(el\.checkSubtitles\) el\.checkSubtitles\.checked = true;/);
});

test('playback uses a cached active subtitle lookup and avoids idle monitor redraws', () => {
  const renderLoop=section('function startRenderLoop()', '// -------------------------------------------------------------\n// VOCAL-SYNCHRONIZED');
  const reel=section('function renderReel()', 'function formatTime');
  assert.match(renderLoop, /if \(state\.isPlaying && now - lastDraw >= previewFrameInterval\)/);
  assert.match(source, /function findActiveSubtitleCue\(cues, currentTime\)/);
  assert.match(reel, /const activeCue = findActiveSubtitleCue\(state\.lyrics, curTime\);/);
  assert.doesNotMatch(reel, /state\.lyrics\.filter\(l =>/);
  assert.match(reel, /vid\.paused \|\| vid\.seeking/);
});

test('preview restarts the selected clip at native EOF even after the browser pause event', () => {
  let plays = 0, pauses = 0;
  const c = {state: {isLooping: true, isPlaying: false, startTime: 2, currentTime: 7},
    el: {hiddenVideo: {src: 'source.mp4'}},
    playVideo() {plays++;}, pauseVideo() {pauses++;}};
  vm.createContext(c);
  vm.runInContext(section('function handlePreviewEnded()', 'function pauseVideo()'), c);
  for (let loop = 0; loop < 3; loop++) c.handlePreviewEnded();
  assert.equal(plays, 3); assert.equal(pauses, 0);
  assert.equal(c.state.currentTime, 2); assert.equal(c.state.playbackStartPos, 2);
  c.state.isLooping = false; c.handlePreviewEnded();
  assert.equal(plays, 3); assert.equal(pauses, 1);
  c.state.isLooping = true; c.el.hiddenVideo.src = ''; c.handlePreviewEnded();
  assert.equal(plays, 3); assert.equal(pauses, 2);
  assert.match(source, /vid\.addEventListener\("ended", handlePreviewEnded\)/);
  assert.match(source, /isLooping: true/);
  assert.match(source.slice(source.indexOf('async function restoreProjectState()')), /state\.isLooping = true;/);
});

test('loop seek resumes a native EOF pause but never overrides a user pause', () => {
  let plays = 0;
  const c = {state: {startTime: 1.5}, playRequestId: 4,
    el: {hiddenVideo: {paused: true}}, playVideo() {plays++;}};
  vm.createContext(c);
  vm.runInContext(section('function resumePreviewAfterLoopSeek(', 'function pauseVideo()'), c);
  c.resumePreviewAfterLoopSeek(4);
  assert.equal(plays, 1); assert.equal(c.state.currentTime, 1.5);
  c.playRequestId = 5; c.resumePreviewAfterLoopSeek(4);
  assert.equal(plays, 1, 'an explicit Pause cancels a pending loop resume');
  c.el.hiddenVideo.paused = false; c.resumePreviewAfterLoopSeek(5);
  assert.equal(plays, 1, 'playing loops do not need another play request');
  assert.match(source, /resumePreviewAfterLoopSeek\(loopRequestId\)/);
});

test('optional username watermark remains a clean, readable normal label', () => {
  const sourceText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'),'utf8');
  const pageText=fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'),'utf8');
  assert.doesNotMatch(sourceText, /ctx\.getImageData\(Math\.round\(wmCfg\.x\)/);
  assert.match(sourceText, /ctx\.fillText\(wmText, wmCfg\.x, wmCfg\.y\)/);
  assert.match(sourceText, /rgba\(0, 0, 0, 0\.82\)/);
  assert.match(pageText, /Username Watermark/);
});

test('small horizontal and vertical watermark centers drag while their handles still resize', () => {
  for (const box of [{x:100,y:100,width:140,height:40}, {x:100,y:100,width:40,height:140}]) {
    const canvasEvents = {}, windowEvents = {};
    const canvas = {style: {}, getBoundingClientRect: () => ({left:0,top:0,width:1080,height:1920}),
      addEventListener: (name, callback) => {canvasEvents[name] = callback;}, contains: () => true};
    const element = {x:100,y:100,size:28}; let saves = 0;
    const c = {state: {selectedTextElem:'watermark',isTextElementSelected:true,
      _textBoxes: {watermark:box},textElements:{watermark:element}}, el:{reelCanvas:canvas}, _textDragState:null,
      window:{addEventListener:(name,callback)=>{windowEvents[name]=callback;}},document:{addEventListener(){}},
      selectTextElement(){},syncTextSliders(){},renderReel(){},saveProjectState(){saves++;}};
    vm.createContext(c);
    vm.runInContext(section('function setupTextCanvasInteraction()', 'function setStudioAIStatus('), c);
    c.setupTextCanvasInteraction();
    const event=(x,y)=>({type:'mousedown',button:0,clientX:x,clientY:y,preventDefault(){}});
    const cx=box.x+box.width/2, cy=box.y+box.height/2;
    canvasEvents.mousedown(event(cx,cy));
    assert.equal(c._textDragState.mode,'move');
    windowEvents.mousemove(event(cx+30,cy+40));windowEvents.mouseup();
    assert.equal(element.x,130);assert.equal(element.y,140);assert.equal(element.size,28);assert.equal(saves,1);
    canvasEvents.mousedown(event(box.x+box.width,box.y+box.height));
    assert.equal(c._textDragState.mode,'resize');
    windowEvents.mousemove(event(box.x+box.width+30,box.y+box.height+40));windowEvents.mouseup();
    assert.ok(element.size>28);assert.equal(saves,2);
  }
});

test('timeline thumbnail extraction and drawing use one complete timestamp plan', () => {
  const c=context();
  c.getTimelineMetrics=()=>({contentW:1248,dur:124});
  vm.runInContext(section('function getTimelineThumbnailPlan()', 'async function generateThumbnailStrip()'),c);
  const plan=vm.runInContext('getTimelineThumbnailPlan()',c);
  assert.equal(plan.times.length,13);
  assert.equal(plan.times[0],0);
  assert.ok(plan.times.at(-1) < 124);
  const strip=section('async function generateThumbnailStrip()', '// -------------------------------------------------------------\n// AUDIO WAVEFORM');
  assert.match(strip, /getTimelineThumbnailPlan\(\)/);
  assert.match(strip, /for \(const t of loaded \? plan\.times : \[\]\)/);
  assert.match(strip, /img\.addEventListener\("load", drawThumbnailStrip/);
});
test('analysis waiting on an upload rejects a changed source', async () => {
  const c=context();
  let resolve;
  c.state._uploadPromise=new Promise(done => {resolve=done;});
  const wait=c.ensureServerVideoPathForAnalysis();
  await c.loadFile('B.mp4');
  resolve('A.mp4');
  await assert.rejects(wait, /selected video changed/);
  assert.equal(c.state.videoPath, 'B.mp4');
});
test('late probe from A cannot replace B metadata or start A conversion', async () => {
  const c=context(); let resolve;
  c.fetch=() => new Promise(done => {resolve=done;});
  const a=c.loadFile('A.mp4'); const finishA=resolve;
  c.fetch=async () => ({ok:false});
  await c.loadFile('B.mp4');
  finishA({ok:true,json:async()=>({duration:180,resolution:'A'})});
  await a;
  assert.equal(c.state.videoPath,'B.mp4');
  assert.equal(c.state.videoMeta,null);
});
test('default analysis state does not invent a trim when Gemini has no audio result', () => {
  const c=context();
  for (const duration of [30,90,180]) {
    const result=c.getDefaultAIAnalysis(duration);
    assert.equal(result.score,null);
    assert.equal(result.status,'unavailable');
    assert.equal(result.recommended_start,null);
    assert.equal(result.recommended_end,null);
    assert.doesNotMatch(result.model_used,/Gemini/);
    assert.equal(result.alternatives.length,0);
  }
});
test('hidden series is omitted from preview and encoded in export and persistence', () => {
  const c=context(); let draws=0;
  c.state.showSeriesText=false; c.state._textBoxes={series:{}};
  c.ctx={fillText(){draws++;}};
  vm.runInContext(section('  if (state.showSeriesText !== false) {', '  // Omit Song Name'),c);
  assert.equal(draws,0); assert.equal(c.state._textBoxes.series,undefined);
  c.state.seriesFormat='Day {day}'; c.state.dayNumber=7; c.state.adjustments={};
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.template.series_text.enabled',c),false);
  let saved;
  c.localStorage={setItem(key,value){saved=JSON.parse(value);}};
  vm.runInContext(section('function saveProjectState()', 'async function restoreProjectState()'),c);
  c.saveProjectState(); assert.equal(saved.showSeriesText,false);
});
test('subtitle size and X affect actual canvas drawing and export payload', () => {
  const c=context(); const draws=[];
  c.state.textElements.subtitles={size:76,x:310,y:1000,color:'#ffffff'};
  c.state._textBoxes={};
  c.isDarkColor=()=>false; c.getSubtitleLines=text=>[text];
  c.getOrComputeWordTimings=()=>[];
  const canvas={font:'',measureText:()=>({width:80}),translate(x,y){draws.push({x,y,font:this.font});}};
  c.ctx=new Proxy(canvas,{get(target,key){return key in target ? target[key] : ()=>{};}});
  vm.runInContext(section('function renderDualSubtitles(', 'function renderReel('),c);
  c.renderDualSubtitles(c.ctx,'Hello','',0,10,'minimal',1080,1920);
  assert.equal(draws[0].x,310); assert.match(draws[0].font,/76px/);
  c.state.seriesFormat='Day {day}'; c.state.dayNumber=1;
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.subtitle_x',c),310);
  assert.equal(vm.runInContext('payload.subtitle_font_size',c),76);
});

test('subtitle preview keeps normal phrases compact and scales only tall cue blocks', () => {
  const subtitleCode=section('function getSubtitleLines(', 'function isDarkColor(') +
    section('function renderDualSubtitles(', 'function renderReel(');
  assert.match(subtitleCode, /const maxChars = hasJpChars \? 34 : 68/);
  assert.match(subtitleCode, /const compactScale = layoutLineCount > 2/);
  assert.match(subtitleCode, /Math\.max\(0\.68, \(canvasWidth - 100\) \/ lineW\)/);
});

test('subtitle preset selection restores a visibly distinct preset color', () => {
  const styleCode=section('const SUBTITLE_STYLE_DEFAULT_COLORS', 'function getSubtitleLines(');
  assert.match(styleCode, /neon_glow: "#00f0ff"/);
  assert.match(styleCode, /retro_90s: "#ffde00"/);
  assert.match(styleCode, /anime: "#f9a8d4"/);
  assert.match(styleCode, /state\.textElements\.subtitles\.color = SUBTITLE_STYLE_DEFAULT_COLORS\[targetStyle\]/);
});

test('Karaoke preview sweeps across every timed phrase instead of becoming static yellow text', () => {
  const subtitleCode=section('function renderDualSubtitles(', 'function renderReel(');
  assert.match(subtitleCode, /const karaokeProgress = stylePreset === "karaoke"/);
  assert.doesNotMatch(subtitleCode, /activeLine && activeLine\.timing_source === "audio_aligned"/);
});

test('audio master setting is included in export payload and project persistence', () => {
  const c=context();
  c.state.seriesFormat='Day {day}'; c.state.dayNumber=1;
  c.state.audioMaster={enabled:true,preset:'phone',noise_cleanup:true};
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.audio_master.enabled',c),true);
  assert.equal(vm.runInContext('Object.keys(payload.audio_master).join()',c),'enabled');
  let saved;
  c.localStorage={setItem(key,value){saved=JSON.parse(value);}};
  vm.runInContext(section('function saveProjectState()', 'async function restoreProjectState()'),c);
  c.saveProjectState();
  assert.deepEqual(saved.audioMaster,{enabled:true});
});
test('Studio color grade, intensity, and adjustment sliders are included in export', () => {
  const c=context();
  Object.assign(c.state, {
    seriesFormat:'Day {day}', dayNumber:1,
    colorFilter:'cyberpunk', filterIntensity:72,
    colorAdjustments:{brightness:8,contrast:118,saturation:126,warmth:14,vignette:24}
  });
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.color_filter',c),'cyberpunk');
  assert.equal(vm.runInContext('payload.filter_intensity',c),72);
  assert.deepEqual(vm.runInContext('payload.color_adjustments',c),{
    brightness:8,contrast:118,saturation:126,warmth:14,vignette:24
  });
});

test('hook fade controls persist, animate preview opacity, and reach export', () => {
  assert.match(html, /class="hook-fade-controls"[\s\S]*Fade hook after[\s\S]*id="val-hook-fade-start"[\s\S]*id="slider-hook-fade-start"/);
  assert.doesNotMatch(html, /slider-hook-fade-duration|val-hook-fade-duration|Fade duration/);
  const css = fs.readFileSync(require('node:path').join(__dirname, '../app/static/style.css'), 'utf8');
  assert.match(css, /\.hook-fade-control-header[\s\S]*justify-content: space-between/);
  assert.match(css, /\.hook-fade-value[\s\S]*white-space: nowrap/);
  const c=context();
  c.state.hookFade={start:3}; c.state.startTime=10;
  vm.runInContext(section('function getHookFadeOpacity(', 'function drawStudioText('),c);
  assert.equal(c.getHookFadeOpacity(12.9),1);
  assert.ok(Math.abs(c.getHookFadeOpacity(13.3) - 0.5) < 1e-9);
  assert.equal(c.getHookFadeOpacity(13.7),0);
  c.state.isPlaying=true; c.el.hiddenVideo.currentTime=13.3;
  assert.ok(Math.abs(c.getHookFadeOpacity(10) - 0.5) < 1e-9);
  c.state.isPlaying=false;
  c.state.seriesFormat='Day {day}'; c.state.dayNumber=1; c.state.adjustments={};
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.hook_fade_start',c),3);
  let saved;
  c.localStorage={setItem(key,value){saved=JSON.parse(value);}};
  vm.runInContext(section('function saveProjectState()', 'async function restoreProjectState()'),c);
  c.saveProjectState();
  assert.deepEqual(saved.hookFade,{start:3});
});

test('export sends the Studio-drawn username and hook layer at its final size', () => {
  const exportCode = section('function createStudioTextOverlay()', 'function setupExport()') +
    section('function setupExport()', 'function loadTemplatesCatalog()');
  assert.match(exportCode, /canvas\.width = 2160/);
  assert.match(exportCode, /canvas\.height = 3840/);
  assert.match(exportCode, /await document\.fonts\.ready/);
  assert.match(exportCode, /studio_text_overlay: typeof studioTextOverlay === "string"/);
  assert.match(exportCode, /_custom: !!\(state\.textElements && state\.textElements\.series && state\.textElements\.series\._custom\)/);
  assert.match(exportCode, /drawStudioText\(textContext/);
});

test('enhanced playback prepares selected trim and changes the video audio choice', async () => {
  const c=context(); const requests=[]; const revoked=[];
  Object.assign(c.state,{videoPath:'song.mp4',startTime:5,endTime:25});
  c.URL.revokeObjectURL=url=>revoked.push(url);
  c.fetch=async (url,options)=>{
    requests.push({url,body:JSON.parse(options.body)});
    return {ok:true,blob:async()=>({name:`preview${requests.length}`})};
  };
  await c.selectPlaybackAudio('enhanced');
  assert.deepEqual(requests[0],{url:'/api/audio/preview',body:{source_video:'song.mp4',start_time:5,end_time:25,audio_master:{enabled:true}}});
  assert.equal(c.state.audioMaster.enabled,true);
  assert.equal(c.state.playbackAudio,'enhanced');
  assert.equal(c.el.audioMasterPlayer.src,'blob:preview1');
  await c.selectPlaybackAudio('original');
  assert.equal(c.state.playbackAudio,'original');
  await c.selectPlaybackAudio('enhanced');
  assert.equal(c.state.playbackAudio,'enhanced');
  assert.equal(requests.length,1,'switching back reuses the prepared audio');
  assert.equal(c.el.audioMasterPlayer.src,'blob:preview1');
  assert.deepEqual(revoked,[]);
});

test('A/B comparison keeps video playing at the same position and reuses one prepared clip', async () => {
  const c=context(); let calls=0, videoPauses=0, enhancedPlays=0;
  Object.assign(c.state,{videoPath:'song.mp4',startTime:5,endTime:25,isPlaying:true});
  Object.assign(c.el.hiddenVideo,{paused:false,currentTime:12.5});
  c.pauseVideo=()=>{videoPauses++;};
  c.el.audioMasterPlayer.play=async()=>{enhancedPlays++;};
  c.fetch=async()=>{calls++;return {ok:true,blob:async()=>({name:'cached'})};};
  await c.selectPlaybackAudio('enhanced');
  await c.selectPlaybackAudio('original');
  assert.equal(c.el.hiddenVideo.muted,false);
  await c.selectPlaybackAudio('enhanced');
  assert.equal(c.el.hiddenVideo.muted,true);
  assert.equal(c.el.hiddenVideo.currentTime,12.5);
  assert.equal(c.el.audioMasterPlayer.currentTime,7.5);
  assert.equal(videoPauses,0); assert.equal(enhancedPlays,2); assert.equal(calls,1);
});

test('Original does not discard an in-flight enhancement or switch back unexpectedly', async () => {
  const c=context(); let finish,calls=0;
  Object.assign(c.state,{videoPath:'song.mp4',startTime:0,endTime:10});
  c.fetch=async()=>{calls++;return {ok:true,blob:()=>new Promise(resolve=>{finish=resolve;})};};
  const first=c.selectPlaybackAudio('enhanced');
  await new Promise(resolve=>setImmediate(resolve));
  const duplicate=c.selectPlaybackAudio('enhanced');
  await c.selectPlaybackAudio('original');
  finish({name:'background-cache'});await first;await duplicate;
  assert.equal(c.state.playbackAudio,'original');
  await c.selectPlaybackAudio('enhanced');
  assert.equal(c.state.playbackAudio,'enhanced');assert.equal(calls,1);
});

test('rapid Original to Enhanced switching shares the pending preparation and honors the latest choice', async () => {
  const c=context(); let finish,calls=0;
  Object.assign(c.state,{videoPath:'song.mp4',startTime:0,endTime:10});
  c.fetch=async()=>{calls++;return {ok:true,blob:()=>new Promise(resolve=>{finish=resolve;})};};
  const first=c.selectPlaybackAudio('enhanced');
  await new Promise(resolve=>setImmediate(resolve));
  await c.selectPlaybackAudio('original');
  const back=c.selectPlaybackAudio('enhanced');
  finish({name:'one-request'});await first;await back;
  assert.equal(c.state.playbackAudio,'enhanced');assert.equal(calls,1);
});

test('enhanced playback never installs a response for an obsolete trim', async () => {
  const c=context(); let finish;
  Object.assign(c.state,{videoPath:'song.mp4',startTime:5,endTime:25});
  c.fetch=async ()=>({ok:true,blob:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=c.selectPlaybackAudio('enhanced');
  await new Promise(resolve=>setImmediate(resolve));
  c.state.startTime=6;
  finish({name:'stale'});
  await pending;
  assert.equal(c.el.audioMasterPlayer.src,undefined);
});

test('enhanced playback accepts clips beyond 90 seconds', async () => {
  const c=context(); let calls=0;
  Object.assign(c.state,{videoPath:'song.mp4',startTime:0,endTime:91});
  c.fetch=async()=>{calls++; return {ok:true,blob:async()=>({name:'long-preview'})};};
  await c.selectPlaybackAudio('enhanced');
  assert.equal(calls,1);
  assert.equal(c.state.playbackAudio,'enhanced');
});

test('enhanced playback shows API validation details instead of a generic shorter-clip message', async () => {
  const c=context();
  Object.assign(c.state,{videoPath:'song.mp4',startTime:0,endTime:91});
  c.fetch=async()=>({ok:false,status:422,json:async()=>({detail:[{msg:'Select an audio preview with a positive duration.'}]})});
  await c.selectPlaybackAudio('enhanced');
  assert.match(c.el.audioMasterStatus.textContent,/positive duration/);
  assert.doesNotMatch(c.el.audioMasterStatus.textContent,/shorter clip/);
});

test('enhanced audio stays aligned with the video playhead', () => {
  const c=context();
  Object.assign(c.state,{sourceGeneration:1,startTime:5,endTime:25,playbackAudio:'enhanced'});
  vm.runInContext("audioAudition.selection='1:5:25'; audioAudition.url='blob:enhanced';",c);
  c.el.hiddenVideo.currentTime=12.5;
  c.el.audioMasterPlayer.currentTime=0;
  c.syncEnhancedAudioToVideo(true);
  assert.equal(c.el.audioMasterPlayer.currentTime,7.5);
});

test('enhanced-audio fallback restores audible original-video volume', () => {
  const c=context();
  Object.assign(c.state,{startTime:5,currentTime:5,isLooping:false,smartLoop:false});
  c.el.hiddenVideo.currentTime=5;
  c.el.hiddenVideo.muted=true;
  c.el.hiddenVideo.volume=0;
  vm.runInContext(section('function restoreOriginalPreviewAudio()', 'function syncEnhancedAudioToVideo('),c);
  c.restoreOriginalPreviewAudio();
  assert.equal(c.el.hiddenVideo.muted,false);
  assert.equal(c.el.hiddenVideo.volume,1);
});

 test('a completed upload cannot overwrite a source selected while it was in flight', async () => {
  const c=context(); let finishUpload;
  c.fetch=async url => {
    if (url === '/api/video/upload') return new Promise(done => {finishUpload=done;});
    return {ok:false};
  };
  vm.runInContext(section('function setupFileHandling()', 'const audioAudition ='),c);
  c.setupFileHandling();
  c.el.inputNativeFile.change({target:{files:[{name:'A.mp4'}]}});
  const upload=c.state._uploadPromise;
  assert.ok(upload);
  await c.loadFile('B.mp4');
  finishUpload({ok:true,json:async()=>({file_path:'A.mp4'})});
  await upload;
 assert.equal(c.state.videoPath,'B.mp4');
});

test('regenerating subtitles keeps the creator selected subtitle style', () => {
  const fullSubtitleUi = section('if (el.btnSyncFullLyrics)', 'if (el.checkSubtitles)');
  assert.ok(!fullSubtitleUi.includes('applySubtitleStyle(data.subtitle_style, data.subtitle_style_reason)'));
});

test('whole-video subtitles require a real uploaded video path before requesting audio analysis', () => {
  const fullSubtitleUi = section('if (el.btnSyncFullLyrics)', 'if (el.checkSubtitles)');
  assert.ok(fullSubtitleUi.includes('!state.videoPath || String(state.videoPath).startsWith("blob:")'));
  assert.ok(fullSubtitleUi.includes('Please wait for the video to finish loading'));
});

test('saved one-word subtitle fragments are merged before the monitor draws them', () => {
  assert.ok(source.includes('function mergeOrphanSubtitleFragments(lyrics)'));
  assert.ok(source.includes('mergeOrphanSubtitleFragments(lyrics);'));
});

test('blur background uses the actual video colours without a blue-purple wash', () => {
  assert.ok(source.includes('contrast(1.1) saturate(1)'));
  assert.ok(!source.includes('Vibrant anime color wash gradient overlay'));
  assert.ok(!source.includes('rgba(139, 92, 246, 0.15)'));
});

test('new projects use the fast black background unless Blur Video is explicitly selected', () => {
  const rendererSource = fs.readFileSync(require('node:path').join(__dirname, '../app/video/renderer.py'), 'utf8');
  assert.match(source, /bgType: "black"/);
  assert.match(source, /bgType\) \|\| "black"/);
  assert.match(source, /type: \(state\.adjustments && state\.adjustments\.bgType\) \|\| "black"/);
  assert.match(rendererSource, /bg_cfg\.get\("type", "black"\)/);
});

test('blurred monitor background is cached at a lighter preview rate without changing export', () => {
  assert.ok(source.includes('const PREVIEW_BLUR_SCALE = 0.20;'));
  assert.ok(source.includes('const previewFrameInterval = 1000 / 30;'));
  assert.ok(source.includes('function refreshBlurPreviewBackground('));
  assert.ok(source.includes('blurPreviewCtx.filter = `blur(${scaledBlurPx}px)'));
  assert.ok(source.includes('ctx.drawImage(blurPreviewCanvas, 0, 0, w, h);'));
});

test('Studio coalesces rapid edit redraws and project saves to keep controls responsive', () => {
  assert.ok(source.includes('const EDIT_RENDER_INTERVAL = 1000 / 30;'));
  assert.ok(source.includes('if (!state.isPlaying && renderNow - lastEditRenderAt < EDIT_RENDER_INTERVAL)'));
  assert.ok(source.includes('let projectSaveTimer = null;'));
  assert.ok(source.includes('projectSaveTimer = window.setTimeout(() => {'));
  assert.ok(source.includes('}, 220);'));
  assert.ok(source.includes('window.addEventListener("pagehide"'));
});

test('English subtitle line is slightly larger for mobile readability', () => {
  assert.ok(source.includes('const englishSubtitleScale = 1.12;'));
  assert.ok(source.includes('appliedSubtitleScale * englishSubtitleScale'));
});

test('Gemini subtitle style suggestions are removed while manual presets remain', () => {
  assert.doesNotMatch(html, /subtitle-style-recommendation|btn-try-recommended-style/);
  assert.doesNotMatch(source, /setSubtitleStyleRecommendation|subtitleRecommendation/);
  assert.match(source, /applySubtitleStyle\(btn.dataset.style/);
  assert.match(html, /Choose Subtitle Style Preset/);
});

test('subtitle library includes a pop animation and a manga-style option', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  assert.ok(html.includes('data-style="pop_bounce"'));
  assert.ok(html.includes('data-style="manga_flash"'));
  assert.ok(source.includes('stylePreset === "pop_bounce"'));
  assert.ok(source.includes('const subtitleEntryScale = animationPreset === "pop"'));
  assert.ok(source.includes('stylePreset === "manga_flash"'));
});

test('subtitle animation uses its automatic default without exposing a separate selector', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  assert.doesNotMatch(html, /id="subtitle-animation-grid"|class="subtitle-animation-btn"|data-animation="(?:auto|fade|pop|rise|slide|none)"/);
  assert.ok(source.includes('function resolveSubtitleAnimation(stylePreset, requestedAnimation = "auto")'));
  assert.ok(source.includes('subtitle_animation: state.subtitleAnimation || "auto"'));
  assert.ok(source.includes('subtitleAnimation: state.subtitleAnimation || "auto"'));
  assert.ok(source.includes('renderDualSubtitles(ctx, jpText, enText, elapsed, totalDur, stylePreset, w, h, activeLine, state.subtitleAnimation || "auto")'));
});

test('subtitle automatic animation is a full soft fade for every style including restored projects', () => {
  const c = {state: {subtitleAnimation: 'pop'}};
  vm.createContext(c);
  vm.runInContext(section('const SUBTITLE_ANIMATION_OPTIONS =', 'function renderDualSubtitles('), c);
  for (const style of ['minimal', 'pop_bounce', 'manga_flash', 'karaoke']) assert.equal(c.resolveSubtitleAnimation(style), 'fade');
  c.syncSubtitleAnimation(); assert.equal(c.state.subtitleAnimation, 'auto');
  assert.equal(c.subtitleFadeOpacity(0, 2), 0);
  assert.equal(c.subtitleFadeOpacity(.06, 2), .5);
  assert.equal(c.subtitleFadeOpacity(.12, 2), 1);
  assert.equal(c.subtitleFadeOpacity(1, 2), 1);
  assert.ok(Math.abs(c.subtitleFadeOpacity(1.935, 2) - .5) < .001);
  assert.equal(c.subtitleFadeOpacity(2, 2), 0);
  assert.equal(c.subtitleFadeOpacity(0, 2, false), 1, 'paused editing stays readable');
  assert.equal(c.subtitleFadeOpacity(.1, .2), 1, 'short cues retain a readable hold');
  assert.equal(c.subtitleFadeOpacity(.2, .2), 0);
});

test('Video Border Shape offers Curved and Straight, with a safe fallback for retired Circular', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  assert.match(html, /data-border="curved"/);
  assert.doesNotMatch(html, /data-border="circular"/);
  assert.match(html, /data-border="straight"/);
  assert.match(source, /function getBorderShape\(\)/);
  assert.match(source, /border_shape: getBorderShape\(\)/);
  const c = context();
  c.state.adjustments = {borderShape: 'circular', curvedBorder: true};
  assert.equal(c.getBorderShape(), 'curved');
  c.state.adjustments.borderShape = 'straight';
  assert.equal(c.getBorderShape(), 'straight');
});

test('oversized reel windows round the visible frame edge and respect the Border Gap viewport', () => {
  const drawCode = section('// 2. FOREGROUND VIDEO FRAME', '// Radial Vignette Overlay');
  assert.match(drawCode, /const visibleInset = Math\.min\(getSongWindowInset\(state\.adjustments\.windowInset\)/);
  assert.match(drawCode, /const visibleFrameX = Math\.max\(visibleInset, fgX\)/);
  assert.match(drawCode, /const visibleFrameWidth = Math\.max\(0, visibleFrameRight - visibleFrameX\)/);
  assert.match(drawCode, /ctx\.roundRect\(visibleFrameX, visibleFrameY, visibleFrameWidth, visibleFrameHeight, radius\)/);
  const rendererSource = fs.readFileSync(require('node:path').join(__dirname, '../app/video/renderer.py'), 'utf8');
  assert.match(rendererSource, /def _visible_rounded_mask\(/);
});
