const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const page = fs.readFileSync('app/static/index.html', 'utf8');
const brush = fs.readFileSync('app/static/canvas-animation.html', 'utf8');
const script = fs.readFileSync('app/static/app.js', 'utf8');
const css = fs.readFileSync('app/static/style.css', 'utf8');

test('both app pages declare the approved browser and installed-app icons', () => {
  for (const html of [page, brush]) {
    assert.match(html, /<title>Vibe Editor(?: — Brush Animator)?<\/title>/);
    assert.match(html, /rel="icon"[^>]+sizes="192x192"[^>]+vibe-editor-icon-192\.png/);
    assert.match(html, /rel="shortcut icon"[^>]+\/favicon\.ico/);
    assert.match(html, /rel="apple-touch-icon"[^>]+sizes="180x180"[^>]+apple-touch-icon\.png/);
    assert.match(html, /rel="manifest"[^>]+\/site\.webmanifest/);
    assert.match(html, /name="application-name" content="Vibe Editor"/);
  }
});

test('Studio, Settings and Brush Animator use shared branding without replacing navigation', () => {
  assert.match(page, /data-view="studio"[\s\S]*?class="nav-brand-icon"[^>]+vibe-editor-icon-192\.png/);
  assert.match(page, /id="studio-welcome"[\s\S]*?vibe-editor-logo\.png/);
  assert.match(page, /id="view-settings"[\s\S]*?vibe-editor-logo\.png/);
  assert.match(brush, /class="brand-icon"[^>]+vibe-editor-logo\.png/);
  assert.equal((page.match(/class="nav-tab(?: active)?"/g) || []).length, 4);
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'no duplicate HTML IDs');
});

test('welcome follows source loading and restoration without changing project data', () => {
  const start = script.indexOf('  const vid = el.hiddenVideo;', script.indexOf('function renderReel()'));
  const end = script.indexOf('  const w = 1080;', start);
  const code = script.slice(start, end);
  function check(videoPath, ready, hasWelcome = true) {
    const welcome = hasWelcome ? {hidden: false} : null;
    const context = {state: {videoPath}, el: {studioWelcome: welcome,
      hiddenVideo: {readyState: ready ? 2 : 0, videoWidth: ready ? 1920 : 0}},
      lastPreviewFrame: {width: 0}, cachePreviewFrame() {}};
    vm.runInNewContext(code, context);
    assert.equal(context.state.videoPath, videoPath);
    return welcome?.hidden;
  }
  assert.equal(check('', false), false);
  assert.equal(check('downloads/new.mp4', false), true, 'hide while a selected source loads');
  assert.equal(check('downloads/restored.mp4', true), true, 'hide for a restored project');
  assert.equal(check('', true), true, 'hide for an available native video');
  assert.equal(check('', false, false), undefined, 'optional markup is null-safe');
});

test('welcome is an inert UI layer and branding is never painted onto exported reels', () => {
  assert.match(css, /\.studio-welcome\s*\{[^}]*pointer-events: none;/);
  assert.match(css, /\.studio-welcome\[hidden\]\s*\{\s*display: none;/);
  assert.doesNotMatch(script, /branding\/|vibe-editor-logo\.png|ANIME FOOTAGE/);
  assert.match(script, /studioWelcome: document\.getElementById\("studio-welcome"\)/);
});
