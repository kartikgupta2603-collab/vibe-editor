const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/static/app.js'), 'utf8');
const code = source.slice(source.indexOf('function showDownloadedImages('), source.indexOf('// FILE SELECTION & PROBING'));

function element() {
  return {children: [], listeners: {}, disabled: false, value: '', textContent: '', style: {},
    classList: {hidden: true, add() {this.hidden = true;}, remove() {this.hidden = false;}, toggle(name, value) {this.hidden = value;}},
    append(...items) {this.children.push(...items);}, replaceChildren() {this.children = [];},
    addEventListener(name, fn) {this.listeners[name] = fn;}};
}
function setup(responses) {
  const nodes = new Map(), calls = [], toasts = [], loaded = [];
  const get = id => {if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id);};
  const el = Object.fromEntries(['inputYtUrl', 'btnYtDownload', 'btnYtText', 'urlMediaType', 'ytProgressBox', 'ytProgressBar', 'ytProgressPercent', 'ytProgressLabel'].map(id => [id, element()]));
  el.inputYtUrl.value = 'https://x.com/user/status/123'; el.urlMediaType.value = 'images';
  const c = {el, console, URL, Date, encodeURIComponent, setTimeout: fn => fn(), state: {sourceGeneration: 1},
    pauseVideo() {}, renderReel() {}, async loadFile(path, title) {loaded.push({path, title}); c.state.sourceGeneration++; c.state.videoPath = path;},
    document: {getElementById: get, createElement: () => element()},
    setupVideoUrlShortcuts() {}, saveProjectState() {}, localStorage: {getItem() {return null;}, setItem() {}, removeItem() {}},
    showToast: text => toasts.push(text),
    fetch: async (url, options) => {calls.push({url, options}); const next = responses.shift(); assert.ok(next, 'unexpected request'); return {ok: next.ok !== false, status: next.status || 200, json: async () => next.body};}};
  vm.createContext(c); vm.runInContext(code, c);
  return {c, el, nodes, calls, toasts, loaded};
}
const photo = {file_path: 'C:/Vibe Editor/downloads/images/id/a & b.png', filename: '<photo>.png', width: 800, height: 1200};

test('image selection downloads then loads the first photo through the existing Studio source pipeline', async () => {
  const e = setup([{body: {media_type: 'images'}}, {body: {task_id: 'job'}}, {body: {status: 'downloading', progress: 40}}, {body: {status: 'completed', progress: 100, files: [photo]}}, {body: {task_id: 'import'}}, {body: {status: 'completed', file_path: 'photo.mp4', title: 'Photo'}}]);
  e.c.setupYouTubeDownloader();
  await e.el.btnYtDownload.listeners.click();
  assert.deepEqual(e.calls.map(c => c.url), ['/api/media/detect', '/api/images/download', '/api/images/status/job', '/api/images/status/job', '/api/images/import', '/api/images/status/import']);
  assert.equal(JSON.parse(e.calls[0].options.body).url, e.el.inputYtUrl.value);
  assert.equal(e.el.btnYtDownload.disabled, false);
  assert.equal(e.el.urlMediaType.disabled, false);
  assert.deepEqual(e.loaded, [{path: 'photo.mp4', title: 'Photo'}]);
  assert.deepEqual(JSON.parse(e.calls[4].options.body), {file_path: photo.file_path, duration: 10});
  const link = e.nodes.get('image-download-results').children[1].children[0];
  assert.equal(link.href, `/api/images/file?path=${encodeURIComponent(photo.file_path)}`);
  assert.equal(link.download, photo.filename);
  assert.equal(link.children[1].textContent, '↓ <photo>.png · 800 × 1200');
  assert.equal(link.children[0].src, `${link.href}&download=false`);
});

test('failed post access and failed status requests restore controls and show the cause', async () => {
  for (const failure of [
    [{ok: false, body: {detail: 'Invalid image URL'}}],
    [{body: {task_id: 'job'}}, {body: {status: 'error', message: 'Post requires sign-in'}}],
    [{body: {task_id: 'job'}}, {ok: false, body: {detail: 'Image download task not found'}}],
    [{body: {task_id: 'job'}}, {body: {status: 'completed', files: []}}],
  ]) {
    const e = setup(failure);
    await e.c.downloadPostImages();
    assert.equal(e.el.btnYtDownload.disabled, false);
    assert.equal(e.el.urlMediaType.disabled, false);
    assert.match(e.el.ytProgressLabel.textContent, /^Error: /);
    assert.ok(e.toasts[0].startsWith('Image download failed: '));
  }
});

test('automatic detection failure restores the action and gives its cause', async () => {
  const e = setup([{ok: false, body: {detail: 'Post requires sign-in'}}]);
  e.c.setupYouTubeDownloader(); await e.el.btnYtDownload.listeners.click();
  assert.equal(e.el.btnYtDownload.disabled, false);
  assert.equal(e.el.btnYtText.textContent, '⚡ Download & Load');
  assert.match(e.el.ytProgressLabel.textContent, /Post requires sign-in/);
  assert.equal(e.calls.length, 1);
});

test('every new image URL uses ten seconds even after a previous image used 25', async () => {
  const e = setup([{body: {task_id: 'job'}}, {body: {status: 'completed', files: [photo]}}, {body: {task_id: 'import'}}, {body: {status: 'completed', file_path: 'photo.mp4'}}]);
  e.c.document.getElementById('input-image-duration').value = '25';
  await e.c.downloadPostImages();
  assert.equal(JSON.parse(e.calls[2].options.body).duration, 10);
  assert.equal(e.nodes.get('input-image-duration').value, '10');
  assert.equal(e.nodes.get('image-duration-row').classList.hidden, false);
});

test('changing the link during detection never imports the old result', async () => {
  const e = setup([{body: {media_type: 'images'}}]);
  const fetch = e.c.fetch;
  e.c.fetch = async (...args) => {const r = await fetch(...args); e.el.inputYtUrl.value = 'https://example.com/new'; return r;};
  e.c.setupYouTubeDownloader(); await e.el.btnYtDownload.listeners.click();
  assert.equal(e.calls.length, 1); assert.equal(e.loaded.length, 0);
  assert.equal(e.el.btnYtDownload.disabled, false);
});

test('the manual media type selector is removed', () => {
  const html = fs.readFileSync(path.join(__dirname, '../app/static/index.html'), 'utf8');
  assert.doesNotMatch(html, /id="url-media-type"/);
  assert.doesNotMatch(source, /reel_url_media_type/);
});

test('Use in Studio selects another downloaded image using the chosen duration', async () => {
  const second = {...photo, file_path: 'second.png', filename: 'Second'};
  const e = setup([{body: {task_id: 'import2'}}, {body: {status: 'completed', file_path: 'second.mp4'}}]);
  e.c.showDownloadedImages([photo, second]);
  e.nodes.get('input-image-duration') ?? e.c.document.getElementById('input-image-duration');
  e.nodes.get('input-image-duration').value = '25';
  const button = e.nodes.get('image-download-results').children[2].children[1];
  await button.listeners.click();
  assert.deepEqual(JSON.parse(e.calls[0].options.body), {file_path: 'second.png', duration: 25});
  assert.deepEqual(e.loaded, [{path: 'second.mp4', title: 'Second'}]);
  assert.equal(button.disabled, false);
});

test('an import failure keeps downloaded results and restores the controls', async () => {
  const e = setup([{body: {task_id: 'job'}}, {body: {status: 'completed', files: [photo]}}, {body: {task_id: 'import'}}, {body: {status: 'error', message: 'FFmpeg could not prepare the image'}}]);
  await e.c.downloadPostImages();
  assert.equal(e.loaded.length, 0);
  assert.equal(e.nodes.get('image-download-results').children.length, 2);
  assert.equal(e.el.btnYtDownload.disabled, false);
  assert.equal(e.el.urlMediaType.disabled, false);
  assert.match(e.toasts.at(-1), /Image import failed: FFmpeg/);
});

test('a prepared image never replaces a newer source chosen during its conversion', async () => {
  const e = setup([{body: {task_id: 'import'}}, {body: {status: 'completed', file_path: 'photo.mp4'}}]);
  const fetch = e.c.fetch;
  e.c.fetch = async (...args) => {const response = await fetch(...args); if (args[0].includes('/status/')) e.c.state.sourceGeneration++; return response;};
  await e.c.loadDownloadedImage(photo);
  assert.equal(e.loaded.length, 0);
  assert.match(e.el.ytProgressLabel.textContent, /Use in Studio/);
});

test('an outdated running backend gives a clear restart instruction instead of Method Not Allowed', async () => {
  for (const status of [404, 405]) {
    const e = setup([{ok: false, status, body: {detail: 'Method Not Allowed'}}]);
    await assert.rejects(e.c.loadDownloadedImage(photo), /Close the Vibe Editor server, start it again, then refresh Studio/);
    assert.equal(e.loaded.length, 0);
  }
});

test('detected video follows the existing video download and Studio loading path', async () => {
  const e = setup([{body: {media_type: 'video'}}, {body: {task_id: 'video'}}, {body: {status: 'completed', progress: 100, file_path: 'video.mp4', title: 'Video'}}]);
  e.el.inputYtUrl.value = 'https://youtu.be/example';
  let poll;
  e.c.setInterval = fn => {poll = fn; return 1;}; e.c.clearInterval = () => {};
  e.c.setupYouTubeDownloader(); await e.el.btnYtDownload.listeners.click(); await poll();
  assert.deepEqual(e.calls.map(c => c.url), ['/api/media/detect', '/api/youtube/download', '/api/youtube/status/video']);
  assert.deepEqual(e.loaded, [{path: 'video.mp4', title: 'Video'}]);
  assert.equal(e.el.btnYtDownload.disabled, false);
});

test('X detection supplies the existing multi-video picker without a second lookup', async () => {
  const e = setup([{body: {media_type: 'video', videos: [{index: 1, url: 'https://x.com/user/status/123/video/1'}, {index: 3, url: 'https://x.com/user/status/123/video/3'}]}}]);
  e.c.setupYouTubeDownloader(); await e.el.btnYtDownload.listeners.click();
  assert.equal(e.calls.length, 1);
  assert.equal(e.nodes.get('x-video-picker').children.length, 3);
  assert.equal(e.el.btnYtDownload.disabled, false);
});

test('image download completion cannot replace a source selected while downloading', async () => {
  const e = setup([{body: {task_id: 'job'}}, {body: {status: 'completed', files: [photo]}}]);
  const fetch = e.c.fetch;
  e.c.fetch = async (...args) => {const r = await fetch(...args); if (args[0].includes('/status/')) e.c.state.sourceGeneration++; return r;};
  await e.c.downloadPostImages();
  assert.equal(e.calls.length, 2); assert.equal(e.loaded.length, 0);
  assert.equal(e.el.btnYtDownload.disabled, false);
});
