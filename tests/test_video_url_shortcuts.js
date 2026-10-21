const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8');
const code = source.slice(source.indexOf('function setupUrlShortcuts('), source.indexOf('function setupYouTubeDownloader()'));

function ui(readText, kind = 'video') {
  const node = () => ({value: 'https://x.com/old', handlers: {}, focused: false,
    addEventListener(name, handler) {(this.handlers[name] ||= []).push(handler);},
    dispatchEvent(event) {for (const handler of this.handlers[event.type] || []) handler(event);},
    focus() {this.focused = true;}});
  const input = node(), clear = node(), messages = [];
  let changes = 0;
  input.addEventListener('input', () => {changes++;});
  const ctx = {el: {inputYtUrl: kind === 'video' ? input : null, inputSeriesText: kind === 'hook' ? input : null}, navigator: {clipboard: readText ? {readText} : undefined},
    document: {getElementById: id => id === (kind === 'hook' ? 'btn-clear-hook-text' : `btn-clear-${kind}-url`) ? clear : kind === 'music' && id === 'music-url' ? input : null}, Event: class {constructor(type) {this.type = type;}}, URL,
    showToast(message) {messages.push(message);}};
  vm.createContext(ctx); vm.runInContext(code, ctx); ctx.setupVideoUrlShortcuts();
  const rightClick = async (shiftKey = false) => {
    let prevented = false;
    await input.handlers.contextmenu[0]({shiftKey, preventDefault() {prevented = true;}});
    return prevented;
  };
  return {input, clear: () => clear.handlers.click[0](), rightClick, messages, changes: () => changes};
}

test('round clear control empties the field and dispatches its normal save event', () => {
  const e = ui(); e.clear();
  assert.equal(e.input.value, ''); assert.equal(e.changes(), 1); assert.equal(e.input.focused, true);
});

test('right-click pastes a copied web URL without starting a download', async () => {
  const e = ui(async () => '  https://x.com/anime/status/123  ');
  assert.equal(await e.rightClick(), true);
  assert.equal(e.input.value, 'https://x.com/anime/status/123'); assert.equal(e.changes(), 1);
});

test('Shift-right-click and browsers without clipboard reading retain their normal menu', async () => {
  const e = ui(async () => assert.fail('Clipboard must not be read'));
  assert.equal(await e.rightClick(true), false);
  assert.equal(await ui().rightClick(), false);
});

test('denied clipboard access keeps the link and restores the browser menu on next click', async () => {
  let calls = 0;
  const e = ui(async () => {calls++; throw new Error('Permission denied');});
  assert.equal(await e.rightClick(), true);
  assert.equal(e.input.value, 'https://x.com/old');
  assert.match(e.messages[0], /Right-click again.*Ctrl\+V/);
  assert.equal(await e.rightClick(), false); assert.equal(calls, 1);
});

test('empty or non-URL clipboard text never replaces the existing URL', async () => {
  for (const text of ['', 'my notes', 'javascript:alert(1)']) {
    const e = ui(async () => text); await e.rightClick();
    assert.equal(e.input.value, 'https://x.com/old'); assert.equal(e.changes(), 0);
    assert.equal(e.messages.length, 1);
  }
});

test('pending clipboard read cannot refill a URL that was just cleared', async () => {
  let finish;
  const e = ui(() => new Promise(resolve => {finish = resolve;}));
  const pasting = e.rightClick(); e.clear(); finish('https://youtube.com/watch?v=old'); await pasting;
  assert.equal(e.input.value, ''); assert.equal(e.changes(), 1);
});

test('pending clipboard read cannot overwrite a newly typed link', async () => {
  let finish;
  const e = ui(() => new Promise(resolve => {finish = resolve;}));
  const pasting = e.rightClick(); e.input.value = 'https://youtu.be/new';
  e.input.dispatchEvent({type: 'input'}); finish('https://youtu.be/old'); await pasting;
  assert.equal(e.input.value, 'https://youtu.be/new');
});

test('music URL uses the same right-click paste and clear controls', async () => {
  const e = ui(async () => 'https://soundcloud.com/artist/song', 'music');
  assert.equal(await e.rightClick(), true);
  assert.equal(e.input.value, 'https://soundcloud.com/artist/song');
  e.clear(); assert.equal(e.input.value, ''); assert.equal(e.changes(), 2);
});

test('invalid music clipboard text gives a music-specific message', async () => {
  const e = ui(async () => 'not a link', 'music'); await e.rightClick();
  assert.match(e.messages[0], /Copy a music URL first/);
});

test('hook paste preserves multiline Unicode text without URL validation', async () => {
  const text = 'First line 🔥\n第二行\n  Keep this spacing';
  const e = ui(async () => text, 'hook');
  assert.equal(await e.rightClick(), true);
  assert.equal(e.input.value, text); assert.equal(e.changes(), 1);
  e.clear(); assert.equal(e.input.value, ''); assert.equal(e.changes(), 2);
});

test('empty hook clipboard preserves the current hook and gives a text-specific message', async () => {
  const e = ui(async () => '\n  ', 'hook'); e.input.value = 'Keep my hook';
  await e.rightClick(); assert.equal(e.input.value, 'Keep my hook');
  assert.match(e.messages[0], /Copy hook text first/);
});
