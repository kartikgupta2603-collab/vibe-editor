const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/static/app.js'), 'utf8');
const code = source.slice(source.indexOf('async function uploadLocalImage('), source.indexOf('const audioAudition ='));

function element() {
  return {value: '', disabled: false, textContent: '', listeners: {}, clicks: 0,
    addEventListener(name, fn) {this.listeners[name] = fn;}, click() {this.clicks++;},
    classList: {add() {}, remove() {}}};
}
function setup() {
  const nodes = new Map(), requests = [], loaded = [], toasts = [];
  const get = id => {if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);};
  const el = {btnYtDownload: element(), urlMediaType: element(), ytProgressLabel: element(),
    btnBrowse: element(), inputNativeFile: element(), dropzone: element(),
    btnLocalImage: get('btn-upload-local-image'), inputLocalImage: get('input-local-image')};
  get('input-local-image-duration').value = '12';
  class FormData {constructor() {this.items = [];} append(...args) {this.items.push(args);}}
  const c = {el, state: {sourceGeneration: 3}, document: {getElementById: get}, FormData, console,
    showToast: message => toasts.push(message),
    async loadDownloadedImage(file, duration) {loaded.push({file, duration}); el.ytProgressLabel.textContent = `Image loaded in Studio · ${duration}s`;},
    fetch: async (url, options) => {requests.push({url, options}); return {ok: true, status: 200, json: async () => ({file_path: 'image.png', filename: 'My image.png'})};}};
  vm.createContext(c); vm.runInContext(code, c);
  return {c, el, nodes, requests, loaded, toasts};
}
const file = {name: 'My image.png', type: 'image/png', size: 100};

test('local image uploads original file then uses the shared Studio image pipeline and chosen duration', async () => {
  const e = setup(); await e.c.uploadLocalImage(file);
  assert.equal(e.requests.length, 1);
  assert.equal(e.requests[0].url, '/api/images/upload');
  assert.equal(e.requests[0].options.method, 'POST');
  assert.deepEqual(e.requests[0].options.body.items, [['file', file]]);
  assert.equal(e.loaded[0].file.file_path, 'image.png');
  assert.equal(e.loaded[0].duration, 12);
  assert.equal(e.nodes.get('local-image-status').textContent, 'Image loaded in Studio · 12s');
  assert.equal(e.nodes.get('input-local-image').value, '');
  assert.equal(e.el.btnYtDownload.disabled, false);
  assert.equal(e.el.btnLocalImage.disabled, false);
});

test('invalid durations and oversized images fail before uploading', async () => {
  for (const [duration, size] of [['0', 10], ['301', 10], ['NaN', 10], ['10', 31 * 1024 * 1024]]) {
    const e = setup(); e.nodes.get('input-local-image-duration').value = duration;
    await e.c.uploadLocalImage({...file, size});
    assert.equal(e.requests.length, 0);
    assert.equal(e.loaded.length, 0);
    assert.equal(e.toasts.length, 1);
  }
});

test('upload errors restore controls and preserve the current Studio source', async () => {
  for (const status of [400, 405, 413, 500]) {
    const e = setup(); e.c.fetch = async () => ({ok: false, status, json: async () => ({detail: 'Bad image'})});
    await e.c.uploadLocalImage(file);
    assert.equal(e.loaded.length, 0);
    assert.equal(e.el.btnLocalImage.disabled, false);
    assert.equal(e.el.btnYtDownload.disabled, false);
    assert.equal(e.el.urlMediaType.disabled, false);
    assert.match(e.nodes.get('local-image-status').textContent, /^Error:/);
  }
});

test('a late upload cannot replace a new Studio source', async () => {
  const e = setup();
  e.c.fetch = async () => {e.c.state.sourceGeneration++; return {ok: true, status: 200, json: async () => ({file_path: 'photo.png'})};};
  await e.c.uploadLocalImage(file);
  assert.equal(e.loaded.length, 0);
  assert.match(e.nodes.get('local-image-status').textContent, /source changed/);
});

test('Upload Image opens the local image picker and selection loads through upload', async () => {
  const e = setup(); e.c.setupFileHandling();
  e.el.btnLocalImage.listeners.click();
  assert.equal(e.el.inputLocalImage.clicks, 1);
  await e.el.inputLocalImage.listeners.change({target: {files: [file]}});
  assert.equal(e.loaded.length, 1);
});

test('dropping an image routes it to image upload instead of the video blob path', async () => {
  const e = setup(); e.c.setupFileHandling();
  e.el.dropzone.listeners.drop({preventDefault() {}, dataTransfer: {files: [file]}});
  for (let i = 0; i < 6; i++) await Promise.resolve();
  assert.equal(e.requests[0].url, '/api/images/upload');
  assert.equal(e.loaded.length, 1);
});
