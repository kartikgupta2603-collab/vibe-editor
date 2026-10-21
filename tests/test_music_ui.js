const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/music.js'), 'utf8');

async function editor(saved = null, trackDuration = 20, videoAudio = null) {
  const nodes = new Map();
  function node() {
    return {value: '', children: [], handlers: {}, paused: true, currentTime: 0, volume: 1, style: {}, attributes: {},
      classList: {add() {}, remove() {}, toggle() {}}, addEventListener(event, fn) {this.handlers[event] = fn;},
      setAttribute(key, value) {this.attributes[key] = value;}, setPointerCapture() {}, getBoundingClientRect() {return {width: 40};},
      replaceChildren() {this.children = [];}, append(...items) {this.children.push(...items);},
      replaceChild(next, previous) {const index = this.children.indexOf(previous); assert.notEqual(index, -1); this.children[index] = next;},
      focus() {this.focused = true;}, select() {this.selected = true;},
      pause() {this.paused = true;}, async play() {this.paused = false;}, getContext() {return null;}};
  }
  const document = {getElementById(id) {if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id);}, createElement: node};
  const audios = [];
  const requests = [];
  class Audio {
    constructor() {
      Object.assign(this, node(), {readyState: 4, seeking: false, rateWrites: 0, seekWrites: []});
      let rate = 1, time = 0;
      Object.defineProperty(this, 'playbackRate', {get: () => rate, set: value => {rate = value; this.rateWrites++;}});
      Object.defineProperty(this, 'currentTime', {get: () => time, set: value => {time = value; this.seekWrites.push(value);}});
      audios.push(this);
    }
  }
  const track = {id: 'a'.repeat(32), name: 'My track', title: 'Provider title', duration: trackDuration, file_url: '/track', saved_ranges: []};
  let tracks = [track];
  const state = {music: saved, videoAudio, startTime: 10, endTime: 14};
  const video = Object.assign(node(), {currentTime: 10, seeking: false, playbackRate: 1});
  const context = {document, state, el: {hiddenVideo: video, audioMasterPlayer: node()}, Audio,
    window: {}, console, setTimeout, clearTimeout, AbortController, saveProjectState() {}, timeToPx: time => time * 10, enhancedPlaybackReady: () => false,
    FormData: class {constructor() {this.fields = new Map();} append(key, value) {this.fields.set(key, value);} get(key) {return this.fields.get(key);}},
    fetch: async url => url === '/api/music' ? {ok: true, json: async () => ({tracks})} : {ok: false, arrayBuffer: async () => new ArrayBuffer(0)}};
  vm.createContext(context); vm.runInContext(source, context); await context.window.musicStudio.init();
  return {studio: context.window.musicStudio, state, video, soundtrack: audios[0], nodes, track,
    select() {nodes.get('music-library').children[0].children[0].handlers.click();}, setTracks(value) {tracks = value;},
    requests, respondWith(response) {context.fetch = async (url, options) => { requests.push({url, options}); return typeof response === 'function' ? response(url, options) : response; };},
    dialogs(prompt, confirm = () => true) {context.window.prompt = prompt; context.window.confirm = confirm;},
    element(id) {return document.getElementById(`music-${id}`);}};
}

test('choosing a saved track creates a mix while disabled music exports nothing', async () => {
  const e = await editor();
  assert.equal(e.studio.exportPayload(), null);
  e.select();
  assert.equal(e.studio.exportPayload().track_id, e.track.id);
  assert.equal(e.state.music.end, 4);
  assert.equal(e.studio.originalGain(1), 0);
  e.state.music.enabled = false;
  assert.equal(e.studio.exportPayload(), null);
  assert.equal(e.studio.originalGain(.8), .8);
});

test('video audio can be muted and adjusted without any added song', async () => {
  const e = await editor();
  assert.equal(e.studio.videoGain(), 1);
  e.element('original-volume').handlers.input({target: {value: 35}});
  assert.equal(e.video.volume, .35);
  assert.equal(e.studio.videoGain(), .35);
  e.element('video-enabled').handlers.change({target: {checked: false}});
  assert.equal(e.video.volume, 0);
  assert.equal(e.studio.videoGain(), 0);
  assert.equal(e.element('original-volume').disabled, true);
  e.element('video-enabled').handlers.change({target: {checked: true}});
  assert.equal(e.video.volume, .35);
  assert.equal(e.studio.exportPayload(), null);
});

test('PC audio uploads use multipart, save a custom name and select the imported song', async () => {
  const e = await editor();
  const file = {name: 'My local song.WAV', size: 100};
  const uploaded = {...e.track, name: 'Saved local song'};
  e.element('import-name').value = '  Saved local song  ';
  e.respondWith({ok: true, json: async () => ({task_id: 'upload-task', status: 'completed', track: uploaded, tracks: [uploaded]})});
  await e.element('file').handlers.change({target: {files: [file]}});
  const upload = e.requests.find(item => item.url === '/api/music/upload');
  assert.equal(upload.options.method, 'POST');
  assert.equal(upload.options.body.get('file'), file);
  assert.equal(upload.options.body.get('name'), 'Saved local song');
  assert.equal(upload.options.headers, undefined);
  assert.equal(e.state.music.track_id, uploaded.id);
  assert.equal(e.element('upload').disabled, false);
  assert.equal(e.element('import').disabled, false);
  assert.equal(e.element('file').value, '');
  assert.match(e.element('status').textContent, /Audio saved/);
});

test('invalid local music never uploads or changes the selected song', async () => {
  const e = await editor(); e.select();
  const selected = e.state.music;
  for (const file of [{name: 'video.mp4', size: 10}, {name: 'empty.mp3', size: 0}, {name: 'huge.wav', size: 256 * 1024 * 1024 + 1}]) {
    await e.element('file').handlers.change({target: {files: [file]}});
    assert.match(e.element('status').textContent, /Choose|empty/);
  }
  assert.equal(e.state.music, selected);
  assert.equal(e.requests.length, 0);
});

test('failed local upload shows the server error and allows retry', async () => {
  const e = await editor();
  e.respondWith({ok: false, status: 400, json: async () => ({detail: 'Cannot read this audio file'})});
  await e.element('file').handlers.change({target: {files: [{name: 'broken.mp3', size: 50}]}});
  assert.match(e.element('status').textContent, /Cannot read this audio file/);
  assert.equal(e.element('upload').disabled, false);
  assert.equal(e.element('import').disabled, false);
  assert.equal(e.state.music, null);
});

test('cancelling the local file picker does not start an import', async () => {
  const e = await editor();
  await e.element('file').handlers.change({target: {files: []}});
  assert.equal(e.requests.length, 0);
  assert.equal(e.state.music, null);
});

test('local upload action and audio-only file picker are available in the library', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  assert.match(html, /id="music-upload"[^>]*>Upload from PC/);
  assert.match(html, /id="music-file"[^>]*type="file"[^>]*accept="\.mp3,\.wav,\.m4a/);
});

test('simple music source tabs preserve the link and selected song when switching', async () => {
  const e = await editor(); e.select();
  const selected = e.state.music;
  e.element('url').value = 'https://example.test/song.mp3';
  e.element('tab-url').handlers.click();
  assert.equal(e.element('tab-url').attributes['aria-pressed'], 'true');
  assert.equal(e.element('tab-local').attributes['aria-pressed'], 'false');
  e.element('tab-local').handlers.click();
  assert.equal(e.element('tab-local').attributes['aria-pressed'], 'true');
  assert.equal(e.element('url').value, 'https://example.test/song.mp3');
  assert.equal(e.state.music, selected);
  assert.equal(e.requests.length, 0);
});

test('removing a song preserves video volume and its independent controls', async () => {
  const e = await editor(); e.select();
  e.element('original-volume').handlers.input({target: {value: 25}});
  e.element('remove').handlers.click();
  assert.equal(e.state.music, null);
  assert.equal(e.video.volume, .25);
  assert.equal(e.element('original-volume').value, 25);
  e.element('video-enabled').handlers.change({target: {checked: false}});
  assert.equal(e.video.volume, 0);
});

test('removing music clears highlight results outside the selected-song panel', async () => {
  const e = await editor();
  e.track.ai_highlights = {highlights: [{start: 1, end: 3, label: 'Chorus', reason: 'Strong vocals'}]};
  e.select();
  assert.equal(e.element('highlights').children.length, 1);
  e.element('analysis-status').textContent = '1 AI highlight marked';
  e.element('remove').handlers.click();
  assert.equal(e.element('highlights').children.length, 0);
  assert.equal(e.element('analysis-status').textContent, '');
});

test('removing a legacy song does not unexpectedly unmute the source', async () => {
  const e = await editor(); e.select();
  assert.equal(e.studio.videoGain(), 0);
  e.element('remove').handlers.click();
  assert.equal(e.studio.videoGain(), 0);
  e.element('video-enabled').handlers.change({target: {checked: true}});
  assert.equal(e.studio.videoGain(), 1);
});

test('restored independent audio settings survive song selection and removal', async () => {
  const e = await editor(null, 20, {enabled: false, volume: .6});
  assert.equal(e.video.volume, 0);
  assert.equal(e.element('original-volume').value, 60);
  e.select();
  assert.equal(e.studio.exportPayload().original_volume, 0);
  e.element('remove').handlers.click();
  e.element('video-enabled').handlers.change({target: {checked: true}});
  assert.equal(e.studio.videoGain(), .6);
});

test('video audio controls sit outside the selected-song panel and reach saved exports', () => {
  const app = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8');
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  const controls = html.indexOf('id="music-video-enabled"');
  assert.ok(controls > 0 && controls < html.indexOf('id="music-editor"'));
  assert.match(app, /videoAudio: state\.videoAudio \|\| null/);
  assert.match(app, /state\.videoAudio = project\.videoAudio \|\| null/);
  assert.match(app, /video_audio_volume:.*window\.musicStudio\.videoGain\(\)/);
});

test('saved song name edits in its row and Enter saves without selecting it', async () => {
  const e = await editor(); e.dialogs(() => {throw new Error('Rename must not open a browser prompt');});
  e.respondWith({ok: true, json: async () => ({tracks: [{...e.track, name: 'Renamed song'}]})});
  const row = e.element('library').children[0];
  row.children[1].handlers.click();
  const input = row.children[0];
  assert.equal(input.value, 'My track'); assert.equal(input.maxLength, 200);
  assert.equal(input.focused, true); assert.equal(input.selected, true);
  assert.equal(e.requests.length, 0);
  input.value = '  Renamed song  ';
  await input.handlers.keydown({key: 'Enter', preventDefault() {}});
  const patch = e.requests.find(item => item.options?.method === 'PATCH');
  assert.equal(JSON.parse(patch.options.body).name, 'Renamed song');
  assert.equal(e.element('library').children[0].children[0].children[0].textContent, 'Renamed song');
  assert.equal(e.state.music, null);
});

test('Escape cancels inline song rename without requests or changing selection', async () => {
  const e = await editor(); e.select();
  const selected = e.state.music, row = e.element('library').children[0], original = row.children[0];
  row.children[1].handlers.click(); const input = row.children[0]; input.value = 'Discard this';
  input.handlers.keydown({key: 'Escape', preventDefault() {}});
  await input.handlers.blur({});
  assert.equal(row.children[0], original);
  assert.equal(row.children[0].children[0].textContent, 'My track');
  assert.equal(e.requests.length, 0); assert.equal(e.state.music, selected);
});

test('empty inline song names show validation and can be corrected', async () => {
  const e = await editor(), row = e.element('library').children[0];
  row.children[1].handlers.click(); const input = row.children[0]; input.value = '   ';
  await input.handlers.blur({});
  assert.equal(input.attributes['aria-invalid'], 'true');
  assert.match(e.element('status').textContent, /between 1 and 200/);
  assert.equal(e.requests.length, 0); assert.equal(row.children[0], input);
  input.value = 'Corrected'; input.handlers.input();
  assert.equal(input.attributes['aria-invalid'], 'false');
  e.respondWith({ok: true, json: async () => ({tracks: [{...e.track, name: 'Corrected'}]})});
  await row.children[1].handlers.click();
  assert.equal(e.element('library').children[0].children[0].children[0].textContent, 'Corrected');
});

test('failed inline rename keeps the draft for retry and prevents duplicate blur saves', async () => {
  const e = await editor(); e.select();
  const selected = e.state.music, row = e.element('library').children[0];
  row.children[1].handlers.click(); const input = row.children[0]; input.value = 'Try again';
  let finish;
  e.respondWith(() => new Promise(resolve => {finish = resolve;}));
  const pending = input.handlers.blur({});
  await row.children[1].handlers.click();
  assert.equal(e.requests.length, 1);
  finish({ok: false, status: 500, json: async () => ({detail: 'Library is busy'})}); await pending;
  assert.match(e.element('status').textContent, /Could not rename song: Library is busy/);
  assert.equal(input.value, 'Try again'); assert.equal(input.disabled, false);
  assert.equal(row.children[1].disabled, false); assert.equal(e.state.music, selected);
  e.respondWith({ok: true, json: async () => ({tracks: [{...e.track, name: 'Try again'}]})});
  await row.children[1].handlers.click();
  assert.equal(e.element('library').children[0].children[0].children[0].textContent, 'Try again');
  assert.equal(e.state.music, selected);
});

test('deleting the selected saved song detaches it from the reel', async () => {
  const e = await editor(); e.select(); e.dialogs(() => null);
  e.respondWith({ok: true, json: async () => ({tracks: []})});
  await e.element('library').children[0].children[2].handlers.click();
  assert.equal(e.state.music, null);
  assert.equal(e.soundtrack.paused, true);
  assert.equal(e.studio.exportPayload(), null);
  assert.match(e.element('status').textContent, /Song deleted/);
});

test('cancelling saved-song deletion preserves the current reel', async () => {
  const e = await editor(); e.select(); e.dialogs(() => null, () => false);
  await e.element('library').children[0].children[2].handlers.click();
  assert.equal(e.state.music.track_id, e.track.id);
});

test('old Studio server gives actionable restart guidance on music import', async () => {
  const e = await editor();
  e.element('url').value = 'https://example.test/music';
  e.respondWith({ok: false, status: 405, json: async () => ({detail: 'Method Not Allowed'})});
  await e.nodes.get('music-import').handlers.click();
  assert.match(e.nodes.get('music-status').textContent, /Restart Studio, refresh this page/);
  assert.equal(e.nodes.get('music-import').disabled, false);
});

test('restoring a project preserves custom track trim, mix, and fades', async () => {
  const music = {enabled: true, track_id: 'a'.repeat(32), start: 5, end: 12, volume: .4, original_volume: .3, fade_in: 1, fade_out: .5, loop: true};
  const e = await editor({...music});
  assert.deepEqual(e.state.music, music);
  assert.equal(e.studio.originalGain(.5), .15);
});

test('soundtrack follows the video trim offset, pauses, and loops within its selection', async () => {
  const e = await editor(); e.select();
  Object.assign(e.state.music, {start: 3, end: 5, loop: true});
  e.video.paused = false; e.video.currentTime = 12.5;
  e.studio.syncPreview(true);
  assert.equal(e.soundtrack.currentTime, 3.5);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.soundtrack.paused, false);
  e.video.paused = true; e.studio.syncPreview();
  assert.equal(e.soundtrack.paused, true);
  e.video.paused = false; e.video.currentTime = 9; e.studio.syncPreview();
  assert.equal(e.soundtrack.paused, true);
});

test('oversized fades clamp to the audible half-duration to match export', async () => {
  const e = await editor(); e.select();
  Object.assign(e.state.music, {start: 0, end: 2, fade_in: 10, fade_out: 10});
  e.video.paused = false; e.video.currentTime = 11;
  e.studio.syncPreview(true);
  assert.equal(e.soundtrack.volume, 1);
});

test('steady playback does not repeatedly reset audio rate or seek on animation frames', async () => {
  const e = await editor(); e.select(); e.video.paused = false;
  for (let frame = 0; frame < 300; frame++) e.studio.syncPreview();
  assert.equal(e.soundtrack.rateWrites, 0);
  assert.equal(e.soundtrack.seekWrites.length, 0);
  e.video.playbackRate = 1.25;
  for (let frame = 0; frame < 300; frame++) e.studio.syncPreview();
  assert.equal(e.soundtrack.rateWrites, 1);
  assert.equal(e.soundtrack.playbackRate, 1.25);
});

test('audio sync waits for an active seek and skips redundant forced seeks', async () => {
  const e = await editor(); e.select(); e.video.paused = false; e.video.currentTime = 11;
  e.soundtrack.seeking = true;
  e.studio.syncPreview(true);
  assert.equal(e.soundtrack.seekWrites.length, 0);
  e.soundtrack.seeking = false;
  e.studio.syncPreview(true);
  assert.equal(e.soundtrack.currentTime, 1);
  e.studio.syncPreview(true);
  assert.equal(e.soundtrack.seekWrites.length, 1);
});

test('the latest deliberate seek is applied after a previous audio seek finishes', async () => {
  const e = await editor(); e.select(); e.video.paused = false; e.video.currentTime = 12;
  e.soundtrack.seeking = true; e.studio.syncPreview(true);
  e.soundtrack.seeking = false; e.studio.syncPreview();
  assert.equal(e.soundtrack.currentTime, 2);
});

test('ordinary playback corrects clock drift gently without replaying audio fragments', async () => {
  const e = await editor(); e.select(); e.video.paused = false;
  e.studio.syncPreview();
  e.video.currentTime = 10.2;
  for (let frame = 0; frame < 120; frame++) e.studio.syncPreview();
  assert.equal(e.soundtrack.seekWrites.length, 0);
  assert.equal(e.soundtrack.playbackRate, 1.02);
  e.video.currentTime = 11; e.soundtrack.readyState = 2;
  e.studio.syncPreview();
  assert.equal(e.soundtrack.seekWrites.length, 0);
  e.soundtrack.readyState = 4; e.studio.syncPreview();
  assert.equal(e.soundtrack.seekWrites.length, 0);
  assert.equal(e.soundtrack.playbackRate, 1.02);
});

test('buffered music keeps its pitch while video follows the audio clock without seeking', async () => {
  const e = await editor(); e.select();
  e.soundtrack.buffered = true; e.soundtrack.duration = 20;
  e.soundtrack.context = {currentTime: 0};
  e.video.paused = false; e.studio.syncPreview(true);
  e.video.currentTime = 10.2; e.soundtrack.context.currentTime = .2;
  e.studio.syncPreview();
  assert.equal(e.soundtrack.seekWrites.length, 0);
  assert.equal(e.soundtrack.playbackRate, 1);
  assert.ok(e.video.playbackRate < 1);
  e.video.handlers.ratechange();
  assert.equal(e.soundtrack.seekWrites.length, 0);
  e.video.paused = true; e.studio.syncPreview();
  assert.equal(e.video.playbackRate, 1);
});

test('different audio-device and video clocks converge without restarting music', async () => {
  for (const audioClockSpeed of [.95, 1.03]) {
    const e = await editor(); e.select(); e.state.endTime = 40; e.state.music.end = 20;
    e.soundtrack.buffered = true; e.soundtrack.duration = 20;
    e.soundtrack.context = {currentTime: 0}; e.video.paused = false; e.studio.syncPreview(true);
    for (let frame = 0; frame < 300; frame++) {
      e.video.currentTime += e.video.playbackRate * .05;
      e.soundtrack.currentTime += audioClockSpeed * .05;
      e.soundtrack.context.currentTime += audioClockSpeed * .05;
      const writes = e.soundtrack.seekWrites.length;
      e.studio.syncPreview();
      assert.equal(e.soundtrack.seekWrites.length, writes);
      assert.equal(e.soundtrack.playbackRate, 1);
    }
    assert.ok(Math.abs(e.video.currentTime - e.state.startTime - e.soundtrack.currentTime) < .12);
  }
});

test('video buffering cannot repeatedly seek music backward while its clock is frozen', async () => {
  const e = await editor(); e.select(); e.video.paused = false; e.video.currentTime = 11;
  e.studio.syncPreview(true); await new Promise(resolve => setImmediate(resolve));
  const writes = e.soundtrack.seekWrites.length;
  e.video.handlers.waiting();
  assert.equal(e.soundtrack.paused, true);
  e.soundtrack.currentTime = 1.5;
  for (let frame = 0; frame < 300; frame++) e.studio.syncPreview();
  assert.equal(e.soundtrack.seekWrites.length, writes + 1); // test clock assignment only
  assert.equal(e.soundtrack.paused, true);
  e.video.currentTime = 12;
  e.video.handlers.playing();
  assert.equal(e.soundtrack.currentTime, 2);
  const resumedWrites = e.soundtrack.seekWrites.length;
  for (let frame = 0; frame < 300; frame++) e.studio.syncPreview();
  assert.equal(e.soundtrack.seekWrites.length, resumedWrites);
});

test('network stalled event does not interrupt video that still has buffered frames', async () => {
  const e = await editor(); e.select(); e.video.paused = false; e.video.readyState = 4;
  e.studio.syncPreview(); await new Promise(resolve => setImmediate(resolve));
  e.video.handlers.stalled();
  assert.equal(e.soundtrack.paused, false);
});

test('a buffering-cancelled start can resume without a false fatal playback error', async () => {
  const e = await editor(); e.select(); e.video.paused = false;
  let starts = 0;
  e.soundtrack.play = async () => {
    if (starts++ === 0) throw {name: 'AbortError', message: 'Interrupted by pause'};
    e.soundtrack.paused = false;
  };
  e.studio.syncPreview(); await new Promise(resolve => setImmediate(resolve));
  e.studio.syncPreview(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(starts, 2);
  assert.equal(e.soundtrack.paused, false);
  assert.doesNotMatch(e.element('status').textContent || '', /could not play/);
});

test('changing volume during playback does not reposition correctly synchronized music', async () => {
  const e = await editor(); e.select(); e.video.paused = false;
  e.element('volume').handlers.input({target: {value: 55}});
  e.element('original-volume').handlers.input({target: {value: 25}});
  assert.equal(e.soundtrack.seekWrites.length, 0);
  assert.equal(e.soundtrack.volume, .55);
});

test('refresh rejects a missing saved track instead of exporting a stale selection', async () => {
  const e = await editor(); e.select(); e.setTracks([]);
  await e.nodes.get('music-refresh').handlers.click();
  // The UI handler starts refresh asynchronously.
  await new Promise(resolve => setImmediate(resolve));
  assert.throws(() => e.studio.exportPayload(), /unavailable/);
});

const gesture = values => ({preventDefault() {}, stopPropagation() {}, ...values});

test('dragging the music waveform slips its source while keeping video alignment and duration', async () => {
  const e = await editor(); e.select();
  const clip = e.element('clip');
  assert.equal(clip.style.left, '100px'); assert.equal(clip.style.width, '40px');
  clip.handlers.pointerdown(gesture({button: 0, pointerId: 1, clientX: 100}));
  clip.handlers.pointermove(gesture({pointerId: 1, clientX: 80}));
  clip.handlers.pointerup(gesture({pointerId: 1}));
  assert.equal(e.state.music.start, 2); assert.equal(e.state.music.end, 6);
  assert.equal(clip.style.left, '100px'); assert.equal(clip.style.width, '40px');
  assert.equal(e.state.startTime, 10); assert.equal(e.state.endTime, 14);
  assert.equal(e.studio.exportPayload().start, 2);
});

test('waveform keyboard stops at source boundaries', async () => {
  const e = await editor(); e.select();
  e.element('clip').handlers.keydown(gesture({key: 'End'}));
  assert.equal(e.state.music.start, 16); assert.equal(e.state.music.end, 20);
  e.element('clip').handlers.keydown(gesture({key: 'Home'}));
  assert.equal(e.state.music.start, 0); assert.equal(e.state.music.end, 4);
  e.element('clip').handlers.keydown(gesture({key: 'ArrowRight', shiftKey: true}));
  assert.equal(e.state.music.start, 1); assert.equal(e.state.music.end, 5);
});

test('music follows video trim changes without exceeding the source track', async () => {
  const e = await editor(); e.select();
  e.element('clip').handlers.keydown(gesture({key: 'End'}));
  e.state.endTime = 20; e.studio.syncTimeline();
  assert.equal(e.state.music.start, 10); assert.equal(e.state.music.end, 20);
  assert.equal(e.element('clip').style.width, '100px');
});

test('short songs keep a full reel-width lane and expose the silence or loop choice', async () => {
  const e = await editor(null, 2); e.select();
  assert.equal(e.state.music.end, 2);
  assert.equal(e.element('clip').style.width, '40px');
  e.element('clip').handlers.keydown(gesture({key: 'End'}));
  assert.equal(e.state.music.start, 0);
  e.element('loop').handlers.change({target: {checked: true}});
  assert.equal(e.studio.exportPayload().loop, true);
});

test('both visible volume sliders immediately update the live mix and exported gains', async () => {
  const e = await editor(); e.select();
  e.element('original-volume').handlers.input({target: {value: 35}});
  e.element('volume').handlers.input({target: {value: 60}});
  assert.equal(e.video.volume, .35);
  assert.equal(e.studio.exportPayload().original_volume, .35);
  assert.equal(e.studio.exportPayload().volume, .6);
  assert.equal(e.element('original-volume-value').textContent, '35%');
  assert.equal(e.element('volume-value').textContent, '60%');
  e.element('original-volume').handlers.input({target: {value: 0}});
  assert.equal(e.video.volume, 0);
});

test('Gemini highlights are marked and clicking one chooses its audio section', async () => {
  const e = await editor(); e.select();
  e.respondWith({ok: true, json: async () => ({basis: 'audio_analysis', model_used: 'verified-model',
    highlights: [{start: 5, end: 9, label: 'Chorus', reason: 'The chorus enters with a strong melody.'}]})});
  await e.element('analyze').handlers.click();
  assert.equal(e.element('highlights').children.length, 1);
  e.element('highlights').children[0].handlers.click();
  assert.equal(e.state.music.start, 5); assert.equal(e.state.music.end, 9);
  assert.match(e.element('analysis-status').textContent, /1 AI highlights marked/);
});

test('analysis failures stay actionable and never create guessed highlight markers', async () => {
  const e = await editor(); e.select();
  e.respondWith({ok: false, status: 503, json: async () => ({detail: 'Add your Gemini API key in Settings.'})});
  await e.element('analyze').handlers.click();
  assert.match(e.element('analysis-status').textContent, /API key in Settings/);
  assert.equal(e.element('highlights').children.length, 0);
  assert.equal(e.element('analyze').disabled, false);
});

test('late analysis results cannot overwrite a removed soundtrack', async () => {
  const e = await editor(); e.select();
  let finish;
  e.respondWith({ok: true, json: () => new Promise(resolve => {finish = resolve;})});
  const pending = e.element('analyze').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  e.element('remove').handlers.click();
  finish({basis: 'audio_analysis', highlights: [{start: 5, end: 9, label: 'Chorus', reason: 'Audible chorus'}]});
  await pending;
  assert.equal(e.state.music, null);
  assert.equal(e.element('highlights').children.length, 0);
});

test('repeated AI Highlights clicks issue only one request and preserve existing markers on failure', async () => {
  const e = await editor(); e.select();
  e.track.ai_highlights = {highlights: [{start: 1, end: 3, label: 'Existing chorus', reason: 'Audible vocals'}]};
  let finish;
  e.respondWith({ok: true, json: () => new Promise(done => {finish = done;})});
  const first = e.element('analyze').handlers.click();
  await new Promise(done => setImmediate(done));
  await e.element('analyze').handlers.click();
  assert.equal(e.requests.length, 1);
  finish({basis: 'audio_analysis', highlights: []}); await first;
  assert.equal(e.track.ai_highlights.highlights[0].label, 'Existing chorus');
  assert.equal(e.element('analyze').disabled, false);
  assert.match(e.element('analysis-status').textContent, /No audio-based highlights/);
});
