const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/app.js', 'utf8');

function setup(name = 'Previous reel') {
  const node = () => ({value: '', textContent: '', style: {}, listeners: {}, focused: false,
    classList: {add() {}, remove() {}, toggle() {}, contains() {return false;}},
    addEventListener(event, handler) {this.listeners[event] = handler;},
    focus() {this.focused = true;}, select() {this.selected = true;}, load() {}});
  const input = node(); input.value = name;
  const el = new Proxy({}, {get(target, key) {return target[key] ||= node();}});
  const messages = [], exports = [];
  const c = {state: {reelName: name, videoPath: 'old.mp4', sourceGeneration: 1}, el, console,
    document: {getElementById: id => id === 'input-reel-name' ? input : null},
    window: {addEventListener() {}}, imageDurationTimer: null, imageDurationRequest: null, imageDurationRunning: false,
    resetAudioAudition() {}, saveProjectState() {}, renderReel() {}, updateTimelineUI() {}, updatePlayheadUI() {},
    extractSongMetaFromTitle: () => ({song: 'Source', anime: ''}), initDynamicClipForVideo() {},
    showToast: message => messages.push(message),
    ensureWatermarkFontLoaded: async () => {exports.push('started'); throw new Error('Stop before real export');},
    fetch: async () => ({ok: true, json: async () => ({duration: 10, resolution: '100x100', fps: 30, has_audio: false})})};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function isLoadedStudioImage()'), source.indexOf('function previewImageDuration(')), c);
  vm.runInContext(source.slice(source.indexOf('function syncExportName()'), source.indexOf('function setupExportName()')), c);
  vm.runInContext(source.slice(source.indexOf('async function loadFile('), source.indexOf('// METADATA & AI HOOK ANALYSIS')), c);
  vm.runInContext(source.slice(source.indexOf('function setupExport()'), source.indexOf('// SETTINGS & HISTORY')), c);
  c.setupExport();
  return {c, input, messages, exports};
}

test('loading a new video or image clears the previous reel name in state and the field', async () => {
  for (const path of ['new-video.mp4', 'C:/Vibe Editor/downloads/images/studio/new-photo.mp4']) {
    const e = setup();
    e.c.state.adjustments = {scale: 1.2, verticalOffset: 70, windowInset: 12, blur: 35};
    await e.c.loadFile(path);
    assert.equal(e.c.state.reelName, '');
    assert.equal(e.input.value, '');
    assert.equal(e.c.state.adjustments.scale, 1);
    assert.equal(e.c.state.adjustments.verticalOffset, 0);
    assert.equal(e.c.state.adjustments.windowInset, 0);
    assert.equal(e.c.state.adjustments.blur, 35);
  }
});

test('refresh restoration and a same-image duration update preserve the reel name', async () => {
  for (const options of [{preserveReelName: true}, {preserveEdits: true}]) {
    const e = setup();
    e.c.state.adjustments = {scale: 1.2, verticalOffset: 70, windowInset: 12};
    await e.c.loadFile('same-photo.mp4', 'Photo', null, options);
    assert.equal(e.c.state.reelName, 'Previous reel');
    assert.equal(e.input.value, 'Previous reel');
    assert.equal(e.c.state.adjustments.scale, 1.2);
    assert.equal(e.c.state.adjustments.verticalOffset, 70);
  }
  assert.match(source, /loadFile\(project\.videoPath, project\.videoTitle, null, \{preserveReelName: true\}\)/);
});

test('both export buttons remind and focus the name field before starting an unnamed export', async () => {
  for (const key of ['btnExportQuick', 'btnExportMain']) {
    const e = setup(''); e.input.value = '   ';
    await e.c.el[key].listeners.click();
    assert.equal(e.exports.length, 0);
    assert.equal(e.c.state.reelName, '');
    assert.equal(e.input.focused, true);
    assert.equal(e.input.selected, true);
    assert.match(e.messages.at(-1), /enter a reel name before exporting/);
  }
});

test('export commits a name still being typed and preserves filename validation', async () => {
  const e = setup(''); e.input.value = '  My new reel.mp4  ';
  await e.c.el.btnExportQuick.listeners.click();
  assert.equal(e.c.state.reelName, 'My new reel');
  assert.equal(e.exports.length, 1);
  const invalid = setup('Existing'); invalid.input.value = 'bad/name';
  await invalid.c.el.btnExportQuick.listeners.click();
  assert.equal(invalid.exports.length, 0);
  assert.equal(invalid.c.state.reelName, 'Existing');
});
