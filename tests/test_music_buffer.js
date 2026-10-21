const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class NativeAudio extends EventTarget {
  constructor() {
    super(); this.src = ''; this.paused = true; this.currentTime = 0;
    this.playbackRate = 1; this.volume = 1; this.readyState = 4; this.seeking = false;
  }
  async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
}
class Param {
  setValueAtTime(value) { this.value = value; }
}
class Context {
  constructor() { this.currentTime = 0; this.sources = []; this.destination = {}; }
  async resume() { if (this.failResume) throw new Error('resume rejected'); }
  createGain() { return {gain: new Param(), connect() {}}; }
  createBufferSource() {
    const source = {
      playbackRate: new Param(), loop: false, stopped: false,
      connect() {}, disconnect() {},
      start(when, offset) { this.offset = offset; },
      stop() { this.stopped = true; if (this.onended) this.onended(); },
    };
    this.sources.push(source); return source;
  }
}
const window = {AudioContext: Context};
vm.runInNewContext(fs.readFileSync('app/static/music-buffer.js', 'utf8'), {window, Audio: NativeAudio, EventTarget, Event});
const Player = window.BufferedMusicPlayer;

async function run() {
  const player = new Player();
  player.src = '/saved.mp3'; player.preload = 'auto';
  player.currentTime = 4; player.volume = .6; player.playbackRate = 1.1;
  await player.play();
  assert.equal(player.native.paused, false);
  assert.equal(player.buffered, false);
  assert.equal(player.currentTime, 4);
  assert.equal(player.native.volume, .6);
  await player.setBuffer({duration: 20});
  assert.equal(player.native.paused, true, 'native audio stops before decoded playback');
  assert.equal(player.buffered, true);
  assert.equal(player.readyState, 4);
  assert.equal(player.paused, false);
  player.context.currentTime = 5;
  assert.equal(player.currentTime, 9.5, 'decoded clock progresses without native decoder clock');
  assert.equal(player.native.currentTime, 4, 'native clock no longer drives decoded playback');
  player.playbackRate = 2;
  player.context.currentTime = 6;
  assert.equal(player.currentTime, 11.5);
  assert.equal(player.context.sources.length, 1, 'rate change never restarts source');
  player.volume = .25;
  assert.equal(player.gain.gain.value, .25);
  player.pause();
  player.context.currentTime = 10;
  assert.equal(player.currentTime, 11.5, 'paused clock remains fixed');
  assert.equal(player.paused, true);
  await player.play();
  assert.equal(player.source.offset, 11.5);
  player.currentTime = 3;
  assert.equal(player.source.offset, 3, 'explicit seek replaces source at requested offset');
  player.setLoop(3, 5, true);
  assert.equal(player.source.loop, true);
  assert.equal(player.source.loopStart, 3);
  assert.equal(player.source.loopEnd, 5);
  const loopSource = player.source;
  player.context.currentTime = 12.25;
  assert.equal(player.currentTime, 3.5, 'selected range loops on the audio clock');
  player.setLoop(3, 5, true);
  assert.equal(player.source, loopSource, 'unchanged loop does not restart source');
  player.setLoop(3, 5, false);
  assert.equal(player.source.loop, false);
  player.context.currentTime = 13.25;
  assert.equal(player.currentTime, 5.5);
  player.src = '/other.mp3';
  assert.equal(loopSource.stopped, true);
  assert.equal(player.buffered, false);
  assert.equal(player.paused, true);
  assert.equal(player.loopRange, null);

  const ended = new Player();
  await ended.setBuffer({duration: 3});
  let endedEvents = 0;
  ended.addEventListener('ended', () => endedEvents++);
  await ended.play();
  ended.source.onended();
  assert.equal(ended.paused, true);
  assert.equal(ended.currentTime, 3);
  assert.equal(endedEvents, 1);

  const racing = new Player();
  await racing.setBuffer({duration: 10});
  let resume;
  racing.context.resume = () => new Promise(resolve => { resume = resolve; });
  const pending = racing.play();
  racing.pause(); resume(); await pending;
  assert.equal(racing.paused, true, 'pause cancels an in-flight context resume');
  assert.equal(racing.source, null);

  const denied = new Player();
  await denied.setBuffer({duration: 10});
  denied.context.failResume = true;
  await assert.rejects(denied.play(), /resume rejected/);
  assert.equal(denied.paused, true);
  assert.equal(denied.source, null);

  const replaced = new Player();
  await replaced.setBuffer({duration: 10});
  let resumeReplaced;
  replaced.context.resume = () => new Promise(resolve => { resumeReplaced = resolve; });
  const pendingReplaced = replaced.play();
  replaced.src = '/replacement.mp3'; resumeReplaced(); await pendingReplaced;
  assert.equal(replaced.buffered, false);
  assert.equal(replaced.source, null, 'source change cancels pending decoded playback');

  window.AudioContext = undefined;
  const fallback = new Player();
  let metadataEvents = 0;
  fallback.addEventListener('loadedmetadata', () => metadataEvents++);
  fallback.native.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(metadataEvents, 1, 'native metadata events are forwarded');
  await fallback.play();
  assert.equal(await fallback.setBuffer({duration: 10}), false);
  assert.equal(fallback.paused, false, 'missing Web Audio retains running native fallback');
  console.log('Buffered music playback: native fallback, decoded clock, seek, pause, rate, gain, selected loop, cleanup, end, and resume cancellation passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
