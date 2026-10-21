/* Use the decoded soundtrack's audio clock; retain native playback until decoded. */
(() => {
  class BufferedMusicPlayer extends EventTarget {
    constructor() {
      super();
      this.native = new Audio();
      this.buffer = null;
      this.context = null;
      this.gain = null;
      this.source = null;
      this.position = 0;
      this.anchor = 0;
      this.rate = 1;
      this.level = 1;
      this.stopped = true;
      this.loopRange = null;
      this.generation = 0;
      for (const name of ['loadedmetadata', 'error', 'play', 'playing', 'pause', 'ended', 'seeking', 'seeked']) {
        this.native.addEventListener(name, () => {
          if (!this.buffer) this.dispatchEvent(new Event(name));
        });
      }
    }
    get src() { return this.native.src; }
    set src(value) {
      this.generation++;
      this._stop();
      this.native.pause();
      this.buffer = null;
      this.position = 0;
      this.stopped = true;
      this.loopRange = null;
      this.native.src = value;
    }
    get preload() { return this.native.preload; }
    set preload(value) { this.native.preload = value; }
    get readyState() { return this.buffer ? 4 : this.native.readyState; }
    get buffered() { return !!this.buffer; }
    get seeking() { return this.buffer ? false : this.native.seeking; }
    get paused() { return this.buffer ? this.stopped : this.native.paused; }
    get duration() { return this.buffer ? this.buffer.duration : this.native.duration; }
    get currentTime() {
      if (!this.buffer) return this.native.currentTime;
      let position = this.position + (this.stopped ? 0 : (this.context.currentTime - this.anchor) * this.rate);
      const range = this.loopRange;
      if (range && position >= range.end) position = range.start + (position - range.start) % (range.end - range.start);
      return Math.max(0, Math.min(this.buffer.duration, position));
    }
    set currentTime(value) {
      if (!this.buffer) { this.native.currentTime = value; return; }
      if (!Number.isFinite(value)) throw new TypeError('Audio position must be finite.');
      const running = !this.stopped;
      this.position = Math.max(0, Math.min(this.buffer.duration, value));
      this.anchor = this.context.currentTime;
      this._stop();
      if (running) this._start();
      this.dispatchEvent(new Event('seeked'));
    }
    get playbackRate() { return this.buffer ? this.rate : this.native.playbackRate; }
    set playbackRate(value) {
      if (!Number.isFinite(value) || value <= 0) throw new TypeError('Audio rate must be positive.');
      if (this.buffer) {
        this.position = this.currentTime;
        this.anchor = this.context.currentTime;
        if (this.source) this.source.playbackRate.setValueAtTime(value, this.context.currentTime);
      }
      this.rate = value;
      this.native.playbackRate = value;
    }
    get volume() { return this.level; }
    set volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Audio volume must be between 0 and 1.');
      if (this.level === value) return;
      this.level = value;
      this.native.volume = value;
      if (this.gain) this.gain.gain.setValueAtTime(value, this.context.currentTime);
    }
    _stop() {
      if (!this.source) return;
      this.source.onended = null;
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    _start() {
      if (this.position >= this.buffer.duration) { this.stopped = true; return; }
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.playbackRate.setValueAtTime(this.rate, this.context.currentTime);
      if (this.loopRange) {
        source.loop = true;
        source.loopStart = this.loopRange.start;
        source.loopEnd = this.loopRange.end;
      }
      source.connect(this.gain);
      this.source = source;
      this.anchor = this.context.currentTime;
      this.stopped = false;
      source.onended = () => {
        if (this.source !== source) return;
        source.disconnect();
        this.source = null;
        this.position = this.buffer.duration;
        this.stopped = true;
        this.dispatchEvent(new Event('ended'));
      };
      source.start(0, this.position);
    }
    async play() {
      if (!this.buffer) return this.native.play();
      if (!this.stopped) return;
      const generation = this.generation;
      await this.context.resume();
      if (generation !== this.generation || !this.buffer || !this.stopped) return;
      this._start();
      if (!this.stopped) {
        this.dispatchEvent(new Event('play'));
        this.dispatchEvent(new Event('playing'));
      }
    }
    pause() {
      this.generation++;
      if (!this.buffer) { this.native.pause(); return; }
      if (this.stopped) return;
      this.position = this.currentTime;
      this.stopped = true;
      this._stop();
      this.dispatchEvent(new Event('pause'));
    }
    setLoop(start, end, enabled) {
      if (enabled && this.loopRange?.start === start && this.loopRange?.end === end) return;
      if (!enabled && !this.loopRange) return;
      const position = this.currentTime;
      const valid = enabled && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && (!this.buffer || end <= this.buffer.duration);
      this.loopRange = valid ? {start, end} : null;
      if (this.buffer) { this.position = position; this.anchor = this.context.currentTime; }
      if (this.source) {
        this.source.loop = !!this.loopRange;
        if (this.loopRange) { this.source.loopStart = start; this.source.loopEnd = end; }
      }
    }
    async setBuffer(buffer) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      const position = this.currentTime, running = !this.paused;
      this.generation++;
      this._stop();
      this.native.pause();
      if (!this.context) {
        this.context = new Context();
        this.gain = this.context.createGain();
        this.gain.connect(this.context.destination);
      }
      this.buffer = buffer;
      this.position = Math.max(0, Math.min(buffer.duration, position));
      this.anchor = this.context.currentTime;
      this.stopped = true;
      this.gain.gain.setValueAtTime(this.level, this.context.currentTime);
      this.dispatchEvent(new Event('loadedmetadata'));
      if (running) {
        try { await this.play(); }
        catch (error) { this.dispatchEvent(new Event('error')); throw error; }
      }
      return true;
    }
  }
  window.BufferedMusicPlayer = BufferedMusicPlayer;
})();
