const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/static/app.js'), 'utf8').replace(/\r\n/g, '\n');
const code = source.slice(source.indexOf('function syncExportName()'), source.indexOf('function setupSettingsAndNav()'));

function ui(entries = []) {
  const nodes = new Map();
  const node = () => ({children: [], textContent: '', value: '', handlers: {}, attributes: {}, classList: {toggle() {}, add() {}, remove() {}}, blur() {}, pause() {this.paused = true;}, load() {this.loads = (this.loads || 0) + 1;}, removeAttribute(key) {delete this[key];},
    addEventListener(event, handler) {this.handlers[event] = handler;}, setAttribute(key, value) {this.attributes[key] = value;},
    replaceChildren() {this.children = [];}, append(...children) {this.children.push(...children);}});
  const ctx = {state: {reelName: ''}, window: {prompt: () => null}, messages: [], saved: 0, pauseVideo() {},
    document: {getElementById(id) {if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id);}, createElement: node},
    fetch: async () => ({ok: true, json: async () => entries})};
  ctx.showToast = message => ctx.messages.push(message);
  ctx.saveProjectState = () => ctx.saved++;
  vm.createContext(ctx); vm.runInContext(code, ctx); ctx.setupExportName();
  return {ctx, get: id => ctx.document.getElementById(id), name(value) {const input = nodes.get('input-reel-name'); input.value = value; input.handlers.change();}};
}

test('custom reel names edit inline and save only project state', () => {
  const e = ui(); e.name('  Cyberpunk Night.mp4  ');
  assert.equal(e.ctx.state.reelName, 'Cyberpunk Night');
  assert.equal(e.get('input-reel-name').value, 'Cyberpunk Night');
  assert.equal(e.get('input-reel-name').title, 'Export as Cyberpunk Night.mp4');
  assert.equal(e.ctx.saved, 1);
  const input = e.get('input-reel-name'); input.value = 'Unsaved name';
  input.handlers.keydown({key: 'Escape', preventDefault() {}});
  assert.equal(input.value, 'Cyberpunk Night');
  assert.equal(e.ctx.saved, 1);
  e.name(''); assert.equal(e.get('input-reel-name').value, '');
});

test('unsafe filenames do not replace the chosen reel name', () => {
  const e = ui(); e.name('Good name');
  for (const value of ['../outside', 'CON', 'bad:name', 'trailing.', 'a'.repeat(121)]) {
    e.name(value); assert.equal(e.ctx.state.reelName, 'Good name');
  }
  assert.equal(e.ctx.messages.length, 5);
});

test('history renders export identity, details and missing status safely', async () => {
  const e = ui([{display_name: '<img onerror=alert(1)>', file_name: 'Real reel.mp4', format: 'mp4', aspect_ratio: '9:16', duration_seconds: 79.8, created_at: '2026-10-16T12:00:00Z', available: true, size_bytes: 10485760, export_location: 'C:\\Vibe Editor\\exports\\Real reel.mp4'},
    {song: 'Song', export_location: 'C:\\Vibe Editor\\exports\\old_16x9_123.mp4', available: false}]);
  await e.ctx.loadExportHistory();
  const rows = e.get('export-history-list').children;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].children[0].textContent, '<img onerror=alert(1)>');
  assert.equal(rows[0].children[0].children[1].textContent, 'Real reel.mp4');
  assert.equal(rows[0].children[1].children[0].textContent, 'MP4 · 9:16');
  assert.equal(rows[0].children[1].children[1].textContent, '1:19');
  assert.equal(rows[0].children[2].children[0].textContent, 'Available · 10.0 MB');
  assert.equal(rows[1].children[0].children[0].textContent, 'old_16x9_123');
  assert.equal(rows[1].children[1].children[0].textContent, 'MP4 · 16:9');
  assert.equal(rows[1].children[2].children[0].textContent, 'File missing');
  assert.equal(rows[1].children[2].children.length, 2);
  assert.match(e.get('export-history-status').textContent, /1 available · 1 missing/);
});

test('search and file filters select exports without more requests', async () => {
  const e = ui([{display_name: 'Night reel', available: true}, {display_name: 'City reel', available: false}]);
  await e.ctx.loadExportHistory();
  e.get('export-history-search').value = 'night'; e.get('export-history-search').handlers.input();
  assert.equal(e.get('export-history-list').children.length, 1);
  e.get('export-history-filter').value = 'missing'; e.get('export-history-filter').handlers.change();
  assert.equal(e.get('export-history-list').children.length, 0);
  assert.match(e.get('export-history-status').textContent, /No matching exports/);
});

test('preview loads only the selected file and releases it on close', async () => {
  const entry = {display_name: 'Reel', file_name: 'A & B.mp4', export_location: 'C:\\Vibe Editor\\exports\\A & B.mp4', available: true};
  const e = ui([entry]); await e.ctx.loadExportHistory();
  const actions = e.get('export-history-list').children[0].children[2].children[1].children;
  assert.match(actions[1].href, /download\?path=C%3A%5CVibe%20Editor%5Cexports%5CA%20%26%20B.mp4$/);
  const video = e.get('history-preview-video'); assert.equal(video.src, undefined);
  actions[0].handlers.click();
  assert.match(video.src, /stream\?path=/); assert.equal(video.hidden, false);
  e.get('history-preview-close').handlers.click();
  assert.equal(video.src, undefined); assert.equal(video.hidden, true); assert.equal(video.paused, true);
});

test('history stays bounded and displays empty/error status', async () => {
  const e = ui(Array.from({length: 130}, (_, i) => ({name: `Reel ${i}`})));
  await e.ctx.loadExportHistory(); assert.equal(e.get('export-history-list').children.length, 100);
  e.ctx.fetch = async () => ({ok: true, json: async () => []});
  await e.ctx.loadExportHistory(); assert.match(e.get('export-history-status').textContent, /No exported reels/);
  e.ctx.fetch = async () => ({ok: false, status: 500});
  await e.ctx.loadExportHistory(); assert.match(e.get('export-history-status').textContent, /500.*Refresh/);
});

test('history shows the saved hook safely, including multiline text on missing files', async () => {
  const hook = '<img onerror=alert(1)>\nThis is my hook';
  const e = ui([{id: 'old', hook_text: hook, display_name: 'My reel', available: false}]);
  await e.ctx.loadExportHistory();
  const identity = e.get('export-history-list').children[0].children[0];
  assert.equal(identity.children[3].children[0].textContent, 'Hook');
  assert.equal(identity.children[3].children[1].textContent, hook);
});

test('canceling video deletion does not send a request', async () => {
  const e = ui([{id: 'one', display_name: 'Keep me', available: true, export_location: 'C:/Vibe Editor/exports/keep.mp4'}]);
  await e.ctx.loadExportHistory();
  let requests = 0;
  e.ctx.fetch = async () => {requests++;};
  e.ctx.window.confirm = message => {assert.match(message, /History entry and saved hook text will stay/); return false;};
  const button = e.get('export-history-list').children[0].children[2].children[1].children[2];
  await button.handlers.click();
  assert.equal(requests, 0);
  assert.equal(e.get('export-history-list').children.length, 1);
});

test('deleting targets the history id, releases preview and keeps the hook record', async () => {
  const entry = {id: 'reel/1', display_name: 'My reel', hook_text: 'A saved hook', available: true, export_location: 'C:/Vibe Editor/exports/mine.mp4'};
  const e = ui([entry]); await e.ctx.loadExportHistory();
  e.ctx.window.confirm = () => true;
  const calls = [];
  e.ctx.fetch = async (url, options) => {
    calls.push([url, options]);
    return {ok: true, json: async () => options?.method === 'DELETE'
      ? {deleted: true, freed_bytes: 1048576} : [{...entry, available: false, size_bytes: null}]};
  };
  e.ctx.previewHistoryEntry(entry);
  const button = e.get('export-history-list').children[0].children[2].children[1].children[2];
  await button.handlers.click();
  assert.equal(calls[0][0], '/api/history/reel%2F1/file');
  assert.equal(calls[0][1].method, 'DELETE');
  assert.equal(e.get('history-preview-video').src, undefined);
  const row = e.get('export-history-list').children[0];
  assert.equal(row.children[2].children[0].textContent, 'File missing');
  assert.equal(row.children[0].children[3].children[1].textContent, 'A saved hook');
  assert.match(e.ctx.messages.at(-1), /1.0 MB freed.*History kept/);
});

test('failed deletion keeps record and exposes the backend error', async () => {
  const entry = {id: 'one', available: true, export_location: 'C:/Vibe Editor/exports/mine.mp4'};
  const e = ui([entry]); await e.ctx.loadExportHistory();
  e.ctx.window.confirm = () => true;
  e.ctx.fetch = async () => ({ok: false, status: 409, json: async () => ({detail: 'Close the video in other apps and retry.'})});
  const button = e.get('export-history-list').children[0].children[2].children[1].children[2];
  await button.handlers.click();
  assert.equal(button.disabled, false);
  assert.match(e.get('export-history-status').textContent, /Delete failed: Close the video/);
  assert.equal(e.get('export-history-list').children[0].children[2].children[0].textContent, 'Available');
});

test('custom name reaches export payload and survives project save/restore', () => {
  const e = ui();
  Object.assign(e.ctx.state, {reelName: 'Reel One', videoPath: 'source.mp4', seriesFormat: '', adjustments: {}, textElements: {}});
  e.ctx.musicPayload = null;
  e.ctx.getBorderShape = () => 'straight';
  const start = source.indexOf('    const payload = {');
  const end = source.indexOf('    try {\n      const res = await fetch("/api/export"', start);
  vm.runInContext(source.slice(start, end), e.ctx);
  assert.equal(vm.runInContext('payload.output_name', e.ctx), 'Reel One.mp4');
  assert.match(source, /reelName: state\.reelName \|\| ""/);
  assert.match(source, /state\.reelName = typeof project\.reelName === "string"/);
});
