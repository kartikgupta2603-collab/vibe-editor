const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/app.js', 'utf8');
function setup({upload = null, saved = true} = {}) {
  const events = [], button = {disabled: false};
  const c = {state: {videoPath: upload ? 'blob:video' : 'C:/Vibe Editor/downloads/video.mp4', _uploadPromise: upload},
    document: {getElementById: () => button}, projectSaveTimer: 42,
    window: {clearTimeout: () => events.push('flush'), location: {reload: () => events.push('reload')}},
    ensureServerVideoPathForAnalysis: async () => {events.push('upload'); await upload;},
    persistProjectState: () => {events.push('save'); return saved;},
    showToast: message => events.push(message), console: {error() {}}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('async function reloadStudio()'), source.indexOf('function setupSettingsAndNav()')), c);
  return {c, events, button};
}
test('reload flushes pending edits before refreshing', async () => {
  const {c, events} = setup(); await c.reloadStudio();
  assert.deepEqual(events, ['flush', 'save', 'reload']);
});
test('reload waits for local video upload and ignores duplicate clicks', async () => {
  let finish; const upload = new Promise(resolve => {finish = resolve;});
  const {c, events} = setup({upload}); const pending = c.reloadStudio();
  await c.reloadStudio(); assert.deepEqual(events, ['upload']);
  finish(); await pending; assert.deepEqual(events, ['upload', 'flush', 'save', 'reload']);
});
test('save or upload failure keeps Studio open and permits retry', async () => {
  for (const options of [{saved: false}, {upload: Promise.reject(new Error('Upload failed'))}]) {
    const {c, events, button} = setup(options); await c.reloadStudio();
    assert.ok(!events.includes('reload')); assert.equal(button.disabled, false);
    assert.match(events.at(-1), /Could not reload Studio/);
  }
});
test('reload sits below Settings and is excluded from view navigation', () => {
  const html = fs.readFileSync('app/static/index.html', 'utf8');
  assert.ok(html.indexOf('id="btn-reload-studio"') > html.indexOf('data-view="settings"'));
  assert.match(source, /navTabs: document.querySelectorAll\("\.nav-tab\[data-view\]"\)/);
  assert.match(source, /getElementById\("btn-reload-studio"\)\?\.addEventListener\("click", reloadStudio\)/);
});
