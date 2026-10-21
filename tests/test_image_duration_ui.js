const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/app.js', 'utf8');
const code = source.slice(source.indexOf('function syncImageDurationInputs('), source.indexOf('async function loadDownloadedImage('));
const deferred = () => {let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve};};
function setup() {
  const fields = new Map();
  for (const id of ['input-image-duration', 'input-local-image-duration', 'local-image-status']) fields.set(id, {value: '10', textContent: '', listeners: {}, addEventListener(type, callback) {this.listeners[type] = callback;}});
  const calls = [], loads = [], tasks = [], timers = new Map(); let timerId = 0;
  const c = {console, encodeURIComponent, document: {getElementById: id => fields.get(id)}, el: {ytProgressLabel: {textContent: ''}, timeDuration: {textContent: ''}},
    state: {videoPath: 'image10.mp4', videoTitle: 'My photo', imageSourcePath: 'photo.png', imageDuration: 10, startTime: 0, endTime: 10, sourceGeneration: 1, seriesFormat: 'Keep hook', lyrics: [{text: 'Keep lyrics'}], music: {id: 'song'}},
    setTimeout(fn) {timers.set(++timerId, fn); return timerId;}, clearTimeout(id) {timers.delete(id);},
    async fetch(url, options) {calls.push({url, options}); return {ok: true, status: 200, json: async () => ({task_id: 'convert'})};},
    async waitForImageTask() {return tasks.length ? tasks.shift().promise : {file_path: 'updated.mp4', source_image_path: 'photo.png'};},
    async loadFile(path, title, file, options) {loads.push({path, options}); c.state.videoPath = path; c.state.sourceGeneration++;},
    updateTimelineUI() {}, updatePlayheadUI() {}, formatTime(value) {return `0:${String(value).padStart(2, "0")}`;},
    pauseVideo() {}, renderReel() {}, saveProjectState() {}, showToast() {}};
  vm.createContext(c); vm.runInContext(code, c); c.setupImageDurationControls();
  const change = (id, value, event = 'input') => {const input = fields.get(id); input.value = value; input.listeners[event]();};
  const flush = async () => {for (const [id, fn] of [...timers]) {timers.delete(id); fn();} await new Promise(setImmediate);};
  return {c, fields, calls, loads, tasks, change, flush};
}
test('local and URL duration edits update the loaded image and sync both controls', async () => {
  for (const id of ['input-image-duration', 'input-local-image-duration']) {
    const e = setup(); e.change(id, '25'); await e.flush();
    assert.deepEqual(JSON.parse(e.calls[0].options.body), {file_path: 'photo.png', duration: 25});
    assert.equal(e.loads[0].options.preserveEdits, true);
    assert.equal(e.fields.get('input-image-duration').value, '25');
    assert.equal(e.fields.get('input-local-image-duration').value, '25');
    assert.equal(e.c.state.imageDuration, 25);
    assert.equal(e.c.state.seriesFormat, 'Keep hook');
    assert.equal(e.c.state.lyrics[0].text, 'Keep lyrics');
    assert.equal(e.c.state.music.id, 'song');
  }
});
test('repeated typing converts once and invalid intermediate input never defaults to ten', async () => {
  const e = setup(); e.change('input-image-duration', '2'); e.change('input-image-duration', ''); await e.flush();
  assert.equal(e.calls.length, 0);
  e.change('input-image-duration', '30'); e.change('input-image-duration', '35', 'change'); await e.flush();
  assert.equal(e.calls.length, 1); assert.equal(JSON.parse(e.calls[0].options.body).duration, 35);
});
test('concurrent edits serialize conversion and only the final duration loads', async () => {
  const e = setup(), first = deferred(); e.tasks.push(first);
  e.change('input-image-duration', '20'); await e.flush();
  e.change('input-local-image-duration', '40'); await e.flush();
  assert.equal(e.calls.length, 1);
  first.resolve({file_path: 'stale20.mp4'}); await new Promise(setImmediate);
  assert.equal(e.calls.length, 2);
  assert.deepEqual(e.loads.map(x => x.path), ['updated.mp4']);
  assert.equal(e.c.state.imageDuration, 40);
});
test('an image conversion cannot replace a real video selected while it runs', async () => {
  const e = setup(), task = deferred(); e.tasks.push(task);
  e.change('input-image-duration', '20'); await e.flush();
  e.c.state.sourceGeneration++; e.c.state.videoPath = 'new-video.mp4'; e.c.state.imageSourcePath = '';
  task.resolve({file_path: 'stale.mp4'}); await new Promise(setImmediate);
  assert.equal(e.loads.length, 0); assert.equal(e.c.state.videoPath, 'new-video.mp4');
});
test('legacy image clips recover original image before changing duration', async () => {
  const e = setup(); e.c.state.imageSourcePath = '';
  const fetch = e.c.fetch;
  e.c.fetch = async (url, options) => url.startsWith('/api/images/source?')
    ? {ok: true, status: 200, json: async () => ({source_image_path: 'recovered.png', duration: 10})} : fetch(url, options);
  e.change('input-image-duration', '17'); await e.flush();
  assert.equal(JSON.parse(e.calls[0].options.body).file_path, 'recovered.png');
  assert.equal(e.c.state.imageDuration, 17);
});
test('ordinary video remains unchanged and failed conversions surface an actionable status', async () => {
  const e = setup(); e.c.state.imageSourcePath = '';
  e.c.fetch = async () => ({ok: false, status: 404});
  e.change('input-image-duration', '25'); await e.flush();
  assert.equal(e.loads.length, 0); assert.match(e.c.el.ytProgressLabel.textContent, /next image/);
  const fail = setup(); fail.c.fetch = async () => ({ok: false, status: 500, json: async () => ({detail: 'Image missing: upload it again'})});
  fail.change('input-local-image-duration', '22'); await fail.flush();
  assert.equal(fail.c.state._imageDurationError, true);
  assert.match(fail.fields.get('local-image-status').textContent, /Image missing/);
  assert.equal(fail.loads.length, 0);
});
test('a probe failure in its own reload stays visible and prevents stale export', async () => {
  const e = setup();
  e.c.loadFile = async path => {e.c.state.videoPath = path; e.c.state.sourceGeneration++; throw new Error('Could not load image preview');};
  e.change('input-image-duration', '19'); await e.flush();
  assert.equal(e.c.state._imageDurationError, true);
  assert.match(e.c.el.ytProgressLabel.textContent, /Could not load image preview/);
});
test('the actual source loader preserves existing edits while setting the full updated duration', async () => {
  const state = {sourceGeneration: 7, seriesFormat: 'Keep hook', songName: 'Keep song', animeName: 'Keep anime', lyrics: [{text: 'Keep lyric'}], aiAnalysis: {custom: true}, imageSourcePath: 'photo.png', clientCrop: {x: 30}};
  const generic = () => ({textContent: '', value: '', disabled: true, classList: {remove() {}}});
  const el = Object.fromEntries(['activeFileName', 'activeFilePill', 'btnExportQuick', 'btnExportMain', 'metaRes', 'metaAspect', 'metaFps', 'metaAudio', 'activeFileMeta', 'videoInfoCard', 'inputStartTime', 'inputEndTime'].map(key => [key, generic()]));
  el.hiddenVideo = {load() {}};
  const c = {state, el, console, encodeURIComponent, document: {getElementById() {return null;}}, isLoadedStudioImage() {return true;}, resetAudioAudition() {}, renderReel() {}, showToast() {}, saveProjectState() {}, updateTimelineUI() {}, updatePlayheadUI() {},
    fetch: async () => ({ok: true, json: async () => ({duration: 27, resolution: '1080x1920', fps: 30, has_audio: false})})};
  vm.createContext(c);
  const loadCode = source.slice(source.indexOf('async function loadFile('), source.indexOf('// METADATA & AI HOOK ANALYSIS'));
  vm.runInContext(loadCode, c);
  await c.loadFile('updated27.mp4', 'My photo', null, {preserveEdits: true});
  assert.equal(state.songName, 'Keep song'); assert.equal(state.animeName, 'Keep anime');
  assert.equal(state.seriesFormat, 'Keep hook'); assert.equal(state.lyrics[0].text, 'Keep lyric');
  assert.equal(state.aiAnalysis.custom, true); assert.equal(state.imageSourcePath, 'photo.png');
  assert.equal(state.clientCrop.x, 30);
  assert.equal(state.startTime, 0); assert.equal(state.endTime, 27); assert.equal(state.currentTime, 0);
});
test('typing updates duration label and real timeline metrics synchronously before any conversion', () => {
  for (const id of ['input-image-duration', 'input-local-image-duration']) {
    const e = setup();
    e.c.el.hiddenVideo = {duration: 10};
    e.c.el.timelineScrollContainer = {clientWidth: 600};
    vm.runInContext(source.slice(source.indexOf('function getTimelineMetrics('), source.indexOf('function timeToPx(')), e.c);
    e.change(id, '11');
    assert.equal(e.calls.length, 0);
    assert.equal(e.c.state.startTime, 0); assert.equal(e.c.state.endTime, 11);
    assert.equal(e.c.el.timeDuration.textContent, '0:11');
    assert.equal(e.c.getTimelineMetrics().dur, 11);
    assert.equal(e.c.state.imageDuration, 10, 'committed media duration stays untouched until conversion completes');
    assert.equal(e.c.state._imageDurationOriginalRange.endTime, 10);
  }
});
test('legacy Studio image file responds instantly without waiting for metadata recovery', () => {
  const e = setup(); e.c.state.imageSourcePath = '';
  e.c.state.videoPath = 'C:\\Vibe Editor\\downloads\\images\\studio\\photo.mp4';
  e.change('input-local-image-duration', '14');
  assert.equal(e.calls.length, 0); assert.equal(e.c.state.endTime, 14);
  assert.equal(e.c.el.timeDuration.textContent, '0:14');
});
test('failed background conversion rolls the preview back to committed timing', async () => {
  const e = setup(); e.c.fetch = async () => ({ok: false, status: 500, json: async () => ({detail: 'Disk is full'})});
  e.change('input-image-duration', '18'); assert.equal(e.c.state.endTime, 18);
  await e.flush();
  assert.equal(e.c.state.endTime, 10); assert.equal(e.c.state._imagePreviewDuration, null);
  assert.equal(e.c.el.timeDuration.textContent, '0:10'); assert.equal(e.c.state._imageDurationError, true);
});
