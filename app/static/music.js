/* Persistent music library and synchronized soundtrack preview. */
(() => {
  const get = id => document.getElementById(`music-${id}`);
  const soundtrack = window.BufferedMusicPlayer ? new window.BufferedMusicPlayer() : new Audio();
  soundtrack.preload = 'auto';
  let tracks = [], selected = null, peaks = null, waveformRequest = 0, auditionPart = false;
  let playbackPending = false, previewError = false, slipDrag = null, highlightRequest = 0;
  let videoBuffering = false, rateCorrection = 0, musicCycle = null, repositionPending = false;
  let rateOwner = null, baseVideoRate = 1, appliedVideoRate = null, followBias = 0, followClock = null;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const active = () => !!(state.music?.enabled && selected && state.music.track_id === selected.id);
  const reelDuration = () => Math.max(0.05, finite(state.endTime) - finite(state.startTime));
  const maxOffset = () => Math.max(0, finite(selected?.duration) - reelDuration());
  function restoreVideoRate() {
    if (rateOwner && appliedVideoRate !== null && rateOwner.playbackRate === appliedVideoRate) rateOwner.playbackRate = baseVideoRate;
    appliedVideoRate = null; followClock = null;
  }
  function followMusicClock(video, drift) {
    if (rateOwner !== video) {
      rateOwner = video; baseVideoRate = video.playbackRate; followBias = 0; followClock = null;
    }
    const now = soundtrack.context?.currentTime ?? Date.now() / 1000;
    const elapsed = followClock === null ? 0 : clamp(now - followClock, 0, .25);
    followClock = now;
    followBias = clamp(followBias - drift * elapsed * .04, -.08, .08);
    const correction = clamp(followBias - drift * .15, -.1, .1);
    const rate = Math.round(baseVideoRate * (1 + correction) * 400) / 400;
    appliedVideoRate = rate;
    if (video.playbackRate !== rate) video.playbackRate = rate;
  }
  function status(message) { if (get('status')) get('status').textContent = message; }
  async function request(url, options = {}) {
    const response = await fetch(url, options);
    if (response.status === 405) {
      throw new Error('The running Studio server has not loaded the music feature. Restart Studio, refresh this page, and try again.');
    }
    const data = await response.json().catch(() => { throw new Error(`The server returned an unreadable response (${response.status}). Please try again.`); });
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : data.error || `Request failed (${response.status})`);
    return data;
  }
  const json = body => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  function commit(reposition = false) { saveProjectState(); syncPreview(reposition); }
  function renderLibrary() {
    const library = get('library');
    if (!library) return;
    library.replaceChildren();
    const query = (get('search')?.value || '').trim().toLowerCase();
    const matches = tracks.filter(track => `${track.name} ${track.title}`.toLowerCase().includes(query));
    for (const track of matches) {
      const row = document.createElement('div'); row.className = 'music-track-row';
      const button = document.createElement('button');
      button.type = 'button'; button.className = `music-track${selected?.id === track.id ? ' active' : ''}`;
      const name = document.createElement('span'); name.textContent = track.name;
      const length = document.createElement('span'); length.textContent = `${finite(track.duration).toFixed(1)}s`;
      button.append(name, length); button.addEventListener('click', () => selectTrack(track));
      const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'music-track-action';
      const renameIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
      rename.innerHTML = renameIcon;
      rename.title = `Rename ${track.name}`; rename.setAttribute('aria-label', `Rename ${track.name}`);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'music-track-action';
      let input = null, saving = false;
      function cancelRename() {
        if (!input || saving) return;
        const previous = input; input = null;
        row.replaceChild(button, previous);
        rename.innerHTML = renameIcon;
        rename.title = `Rename ${track.name}`; rename.setAttribute('aria-label', `Rename ${track.name}`);
      }
      async function saveRename() {
        if (!input || saving) return;
        const value = input.value.trim();
        if (!value || value.length > 200) {
          input.setAttribute('aria-invalid', 'true'); status('Enter a song name between 1 and 200 characters.'); return;
        }
        if (value === track.name) { cancelRename(); return; }
        saving = true; input.disabled = true; rename.disabled = true; remove.disabled = true;
        try {
          await request(`/api/music/${encodeURIComponent(track.id)}`, {...json({name: value}), method: 'PATCH'});
          await refresh(); status('Song name saved.');
        } catch (error) { status(`Could not rename song: ${error.message}`); }
        finally { saving = false; input.disabled = false; rename.disabled = false; remove.disabled = false; }
      }
      rename.addEventListener('pointerdown', event => { if (input) event.preventDefault(); });
      rename.addEventListener('click', () => {
        if (input) return saveRename();
        input = document.createElement('input'); input.type = 'text'; input.className = 'form-input music-track-name-input';
        input.value = track.name; input.maxLength = 200; input.setAttribute('aria-label', 'Song name');
        input.addEventListener('input', () => input?.setAttribute('aria-invalid', 'false'));
        input.addEventListener('keydown', event => {
          if (event.key === 'Enter') { event.preventDefault(); return saveRename(); }
          if (event.key === 'Escape') { event.preventDefault(); cancelRename(); rename.focus(); }
        });
        input.addEventListener('blur', event => event.relatedTarget === remove ? cancelRename() : saveRename());
        row.replaceChild(input, button);
        rename.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
        rename.title = 'Save song name'; rename.setAttribute('aria-label', 'Save song name'); input.focus(); input.select();
      });
      remove.title = `Delete ${track.name}`; remove.setAttribute('aria-label', `Delete ${track.name}`);
      remove.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${track.name}" from your saved music? Its saved parts and highlights will also be removed.`)) return;
        remove.disabled = true;
        try {
          await request(`/api/music/${encodeURIComponent(track.id)}`, {method: 'DELETE'});
          if (state.music?.track_id === track.id) detachMusic();
          await refresh(); status('Song deleted from your saved music.');
        } catch (error) { status(`Could not delete song: ${error.message}`); }
        finally { remove.disabled = false; }
      });
      row.append(button, rename, remove); library.append(row);
    }
    if (!matches.length) {
      const empty = document.createElement('p'); empty.className = 'music-hint';
      empty.textContent = tracks.length ? 'No matching tracks.' : 'Your saved music will appear here.'; library.append(empty);
    }
  }
  function detachMusic() {
    if (!state.videoAudio) state.videoAudio = {enabled: videoGain() > 0, volume: videoGain() || 1};
    restoreVideoRate(); rateOwner = null;
    highlightRequest++; state.music = null; selected = null; soundtrack.pause(); get('audition')?.pause(); get('editor')?.classList.add('hidden');
    applyOriginalVolume();
    if (get('analysis-status')) get('analysis-status').textContent = '';
    renderHighlights();
    renderLibrary(); syncTimeline(); saveProjectState();
  }
  function renderRanges() {
    const container = get('ranges'); if (!container) return;
    container.replaceChildren();
    for (const range of selected?.saved_ranges || []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-sm';
      button.textContent = `${range.name} · ${range.start.toFixed(1)}–${range.end.toFixed(1)}s`;
      button.addEventListener('click', () => {
        setOffset(range.start);
        status(`Selected saved part: ${range.name}`);
      }); container.append(button);
    }
  }
  function updateEditor() {
    if (!selected || !state.music) return;
    const music = state.music, duration = finite(selected.duration);
    music.start = clamp(finite(music.start), 0, Math.max(0, duration - 0.05));
    music.end = clamp(finite(music.end, duration), music.start + 0.05, duration);
    if (get('loop')) get('loop').checked = music.loop === true;
    for (const [id, key, factor] of [['volume', 'volume', 100], ['fade-in', 'fade_in', 1], ['fade-out', 'fade_out', 1]]) {
      if (get(id)) get(id).value = finite(music[key]) * factor;
      if (get(`${id}-value`)) get(`${id}-value`).textContent = `${Math.round(finite(music[key]) * factor)}%`;
    }
    syncTimeline();
  }
  function setOffset(value) {
    if (!selected || !state.music) return;
    state.music.fit_to_video = true;
    state.music.start = clamp(finite(value), 0, maxOffset());
    state.music.end = Math.min(selected.duration, state.music.start + reelDuration());
    updateEditor(); commit(true);
  }
  function syncTimeline() {
    const visible = !!(selected && state.music);
    updateVideoAudioControls();
    get('volume-control')?.classList.toggle('hidden', !visible);
    const root = document.getElementById('capcut-timeline-root');
    if (root) root.classList.toggle('has-music', visible);
    get('timeline-row')?.classList.toggle('hidden', !visible);
    get('editor')?.classList.toggle('hidden', !state.music);
    if (!visible) return;
    const music = state.music;
    if (music.fit_to_video) {
      music.start = clamp(finite(music.start), 0, maxOffset());
      music.end = Math.min(selected.duration, music.start + reelDuration());
    }
    const clip = get('clip');
    if (clip) {
      const left = typeof timeToPx === 'function' ? timeToPx(state.startTime) : 0;
      const right = typeof timeToPx === 'function' ? timeToPx(state.endTime) : 600;
      clip.style.left = `${left}px`; clip.style.width = `${Math.max(1, right - left)}px`;
      clip.setAttribute('aria-valuemin', '0'); clip.setAttribute('aria-valuemax', maxOffset().toFixed(2));
      clip.setAttribute('aria-valuenow', music.start.toFixed(2));
      clip.setAttribute('aria-valuetext', `Song starts at ${music.start.toFixed(2)} seconds, ${reelDuration().toFixed(2)} second reel`);
      clip.classList.toggle('is-muted', !music.enabled);
    }
    if (get('clip-label')) get('clip-label').textContent = `${selected.name} · ${music.start.toFixed(1)}s`;
    drawWaveform();
  }
  function selectTrack(track, restoring = false) {
    restoreVideoRate(); rateOwner = null;
    highlightRequest++;
    if (get('analyze')) get('analyze').disabled = false;
    if (get('analysis-status')) get('analysis-status').textContent = '';
    get('audition')?.pause(); soundtrack.pause(); previewError = false;
    selected = track; peaks = null;
    musicCycle = null; rateCorrection = 0; repositionPending = true;
    if (!restoring) state.music = {track_id: track.id, enabled: true, start: 0, end: Math.min(track.duration, reelDuration()), volume: 1, original_volume: 0, fade_in: 0, fade_out: 0, loop: false, fit_to_video: true};
    soundtrack.src = track.file_url;
    if (get('audition')) get('audition').src = track.file_url;
    if (get('name')) get('name').value = track.name;
    get('editor')?.classList.remove('hidden');
    updateEditor(); renderLibrary(); renderRanges(); renderHighlights(); void loadWaveform(track);
    if (!restoring) { commit(); status(''); }
  }
  async function loadWaveform(track) {
    const generation = ++waveformRequest;
    // Avoid decoding very large files in the browser; trimming remains available.
    if (track.duration > 900) return;
    let context;
    try {
      const response = await fetch(track.file_url);
      if (!response.ok) throw new Error('Audio waveform unavailable');
      const bytes = await response.arrayBuffer();
      if (generation !== waveformRequest || bytes.byteLength > 40 * 1024 * 1024) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      context = new AudioContextClass();
      const decoded = await context.decodeAudioData(bytes);
      if (generation !== waveformRequest) return;
      if (typeof soundtrack.setBuffer === 'function') await soundtrack.setBuffer(decoded);
      if (generation !== waveformRequest) return;
      const channel = decoded.getChannelData(0), count = Math.min(6000, Math.max(300, Math.ceil(track.duration * 30))), stride = Math.max(1, Math.floor(channel.length / count));
      peaks = Array.from({length: count}, (_, index) => {
        let peak = 0;
        for (let i = index * stride; i < Math.min(channel.length, (index + 1) * stride); i++) peak = Math.max(peak, Math.abs(channel[i]));
        return peak;
      }); drawWaveform();
    } catch (error) { console.warn('Music waveform:', error.message); }
    finally { if (context) await context.close(); }
  }
  function drawWaveform() {
    const canvas = get('waveform'); if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    if (!selected || !state.music) return;
    const music = state.music, length = music.end - music.start;
    ctx.fillStyle = '#191919'; ctx.fillRect(0, 0, width, height);
    const highlights = selected.ai_highlights?.highlights || [];
    if (!music.loop) for (const highlight of highlights) {
      const left = clamp((highlight.start - music.start) / reelDuration(), 0, 1) * width;
      const right = clamp((Math.min(highlight.end, music.end) - music.start) / reelDuration(), 0, 1) * width;
      if (right <= left) continue;
      ctx.fillStyle = '#484848'; ctx.fillRect(left, 0, right - left, height);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(left, 0, right - left, 3);
    }
    if (peaks) {
      const visibleWidth = canvas.getBoundingClientRect().width || width;
      const count = Math.max(8, Math.floor(visibleWidth / 7));
      const bars = Array.from({length: count}, (_, bar) => {
        const elapsed = (bar + .5) / count * reelDuration();
        if (!music.loop && elapsed >= length) return null;
        const position = music.start + (music.loop ? elapsed % length : elapsed);
        const index = clamp(Math.floor(position / selected.duration * peaks.length), 0, peaks.length - 1);
        return {peak: peaks[index], highlighted: highlights.some(item => position >= item.start && position <= item.end)};
      });
      const maximum = Math.max(.001, ...bars.map(bar => bar?.peak || 0));
      bars.forEach((bar, index) => {
        if (!bar) return;
        const barHeight = bar.peak > .0001 ? Math.max(height * .16, Math.pow(bar.peak / maximum, .65) * height * .88) : 3;
        ctx.fillStyle = bar.highlighted ? '#ffffff' : '#c5c5c5';
        ctx.fillRect(index / count * width, (height - barHeight) / 2, width / count * .58, barHeight);
      });
    }
    else { ctx.fillStyle = '#cccccc'; ctx.font = '12px sans-serif'; ctx.fillText('Drag to choose a music section', 12, height / 2 + 5); }
  }
  function renderHighlights() {
    const container = get('highlights');
    if (!container) return;
    container.replaceChildren();
    for (const highlight of selected?.ai_highlights?.highlights || []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'music-highlight';
      button.textContent = `${highlight.label} · ${highlight.start.toFixed(1)}–${highlight.end.toFixed(1)}s`;
      button.title = highlight.reason;
      button.addEventListener('click', () => {
        setOffset(highlight.start);
        for (const child of container.children) child.classList.remove('active');
        button.classList.add('active');
      });
      container.append(button);
    }
    drawWaveform();
  }
  async function analyzeHighlights() {
    if (!selected || get('analyze')?.disabled) return;
    const trackId = selected.id, requestId = ++highlightRequest;
    const current = () => requestId === highlightRequest && selected?.id === trackId;
    const button = get('analyze'), label = get('analysis-status');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4 * 60 * 1000);
    if (button) button.disabled = true;
    if (label) label.textContent = 'Gemini is listening for hooks and standout sections…';
    try {
      const result = await request(`/api/music/${encodeURIComponent(trackId)}/highlights`, {...json({duration: Math.min(60, reelDuration())}), signal: controller.signal});
      if (!current()) return;
      if (result.basis !== 'audio_analysis' || !Array.isArray(result.highlights) || !result.highlights.length) throw new Error('No audio-based highlights were returned. Try again.');
      if (result.highlights.some(item => !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start < 0 || item.end <= item.start || item.end > selected.duration)) throw new Error('Gemini returned an invalid highlight range. Try again.');
      selected.ai_highlights = result;
      renderHighlights();
      if (label) label.textContent = `${result.highlights.length} AI highlights marked. Click one to use it.`;
    } catch (error) {
      if (current() && label) label.textContent = controller.signal.aborted ? 'Gemini took too long to respond. Your previous highlights were kept. Please try again.' : error.message;
    } finally { clearTimeout(timer); if (current() && button) button.disabled = false; }
  }
  async function refresh() {
    const data = await request('/api/music'); tracks = data.tracks || [];
    const track = tracks.find(item => item.id === state.music?.track_id);
    if (track && selected?.id !== track.id) selectTrack(track, true);
    else if (track) { selected = track; updateEditor(); renderRanges(); renderHighlights(); }
    else if (state.music?.track_id) {
      selected = null; soundtrack.pause(); get('audition')?.pause(); get('editor')?.classList.add('hidden');
      if (get('analysis-status')) get('analysis-status').textContent = '';
      renderHighlights();
      status('The saved soundtrack is unavailable. Import it again or select another track.');
    }
    renderLibrary(); syncTimeline();
  }
  let importing = false;
  function importBusy(busy) {
    importing = busy;
    for (const id of ['import', 'upload']) if (get(id)) get(id).disabled = busy;
    const progress = get('progress');
    if (progress) { progress.classList.toggle('hidden', !busy); progress.value = 0; }
  }
  async function completeImport(taskId) {
    for (;;) {
      const result = await request(`/api/music/tasks/${encodeURIComponent(taskId)}`);
      status(result.message || result.status); if (get('progress')) get('progress').value = finite(result.progress);
      if (result.status === 'error') throw new Error(result.error || result.message || 'Audio import failed.');
      if (result.status === 'completed') { await refresh(); selectTrack(result.track); status('Audio saved.'); return; }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  }
  async function importTrack() {
    if (importing) return;
    const url = get('url')?.value.trim(); if (!url) { status('Paste a music or audio link first.'); return; }
    importBusy(true); status('Connecting to the audio link…');
    try {
      const task = await request('/api/music/import', json({url, name: get('import-name')?.value.trim() || undefined}));
      await completeImport(task.task_id);
    } catch (error) { status(error.message); }
    finally { importBusy(false); }
  }
  async function uploadTrack(file) {
    if (!file || importing) return;
    try {
      if (!/\.(mp3|wav|m4a|aac|flac|ogg|opus|wma|aiff|aif)$/i.test(file.name)) throw new Error('Choose an audio file such as MP3, WAV, M4A or FLAC.');
      if (!file.size) throw new Error('This audio file is empty. Choose another file.');
      if (file.size > 256 * 1024 * 1024) throw new Error('Choose an audio file smaller than 256 MB.');
      importBusy(true); status(`Uploading ${file.name}…`);
      const body = new FormData(); body.append('file', file);
      const name = get('import-name')?.value.trim(); if (name) body.append('name', name);
      const task = await request('/api/music/upload', {method: 'POST', body});
      await completeImport(task.task_id);
    } catch (error) { status(error.message); }
    finally { importBusy(false); if (get('file')) get('file').value = ''; }
  }
  function videoGain() {
    if (state.videoAudio) return state.videoAudio.enabled === false ? 0 : clamp(finite(state.videoAudio.volume, 1), 0, 1);
    return active() ? clamp(finite(state.music.original_volume), 0, 1) : 1;
  }
  function updateVideoAudioControls() {
    const enabled = state.videoAudio ? state.videoAudio.enabled !== false : videoGain() > 0;
    const volume = state.videoAudio ? clamp(finite(state.videoAudio.volume, 1), 0, 1) : videoGain();
    if (get('video-enabled')) get('video-enabled').checked = enabled;
    if (get('original-volume')) { get('original-volume').value = Math.round(volume * 100); get('original-volume').disabled = !enabled; }
    if (get('original-volume-value')) get('original-volume-value').textContent = enabled ? `${Math.round(volume * 100)}%` : 'Muted';
  }
  function originalGain(value) { return clamp(finite(value), 0, 1) * videoGain(); }
  function applyOriginalVolume() {
    const enhanced = typeof enhancedPlaybackReady === 'function' && enhancedPlaybackReady();
    if (el.hiddenVideo && !enhanced) {
      const elapsed = el.hiddenVideo.currentTime - state.startTime, remaining = state.endTime - el.hiddenVideo.currentTime;
      let base = 1;
      if (state.smartLoop && state.isLooping) {
        if (remaining > 0 && remaining < 0.22) base = Math.max(0.12, remaining / 0.22);
        else if (elapsed >= 0 && elapsed < 0.22) base = Math.min(1, Math.max(0.12, elapsed / 0.22));
      }
      el.hiddenVideo.volume = originalGain(base);
    }
    if (el.audioMasterPlayer && enhanced) el.audioMasterPlayer.volume = originalGain(1);
  }
  function syncPreview(force = false) {
    applyOriginalVolume();
    if (!active() || !el.hiddenVideo) { soundtrack.pause(); restoreVideoRate(); rateOwner = null; return; }
    if (force) repositionPending = true;
    const video = el.hiddenVideo, music = state.music;
    const elapsed = Math.max(0, video.currentTime - state.startTime);
    const audioEnd = soundtrack.buffered ? Math.min(music.end, soundtrack.duration) : music.end;
    const length = audioEnd - music.start;
    if (length <= 0) { soundtrack.pause(); restoreVideoRate(); return; }
    const clipDuration = Math.max(0, state.endTime - state.startTime);
    if (video.paused || video.seeking || videoBuffering || video.readyState < 3 || video.currentTime < state.startTime || elapsed >= clipDuration || (!music.loop && elapsed >= length)) {
      if (!soundtrack.paused) soundtrack.pause();
      restoreVideoRate();
      return;
    }
    const expected = music.start + (music.loop ? elapsed % length : elapsed);
    if (typeof soundtrack.setLoop === 'function') soundtrack.setLoop(music.start, audioEnd, music.loop === true);
    const cycle = music.loop ? Math.floor(elapsed / length) : 0;
    const cycleChanged = musicCycle !== null && cycle !== musicCycle;
    musicCycle = cycle;
    let drift = expected - soundtrack.currentTime;
    if (music.loop && length > 0) drift = ((drift + length / 2) % length + length) % length - length / 2;
    // Reposition only for deliberate timeline changes or a music loop boundary.
    // Decoder/clock jitter during ordinary playback must never replay fragments.
    if (cycleChanged && !soundtrack.buffered) repositionPending = true;
    if (repositionPending) {
      rateCorrection = 0;
      followClock = null;
      if (soundtrack.readyState > 0 && !soundtrack.seeking) {
        if (Math.abs(drift) > .02) soundtrack.currentTime = expected;
        repositionPending = false;
      }
    } else if (!soundtrack.seeking) {
      if (Math.abs(drift) > .12) rateCorrection = Math.sign(drift);
      else if (Math.abs(drift) < .04) rateCorrection = 0;
    }
    if (soundtrack.buffered) followMusicClock(video, repositionPending || force ? 0 : drift);
    const audibleDuration = music.loop ? clipDuration : Math.min(clipDuration, length);
    const fadeIn = Math.min(music.fade_in, audibleDuration / 2), fadeOut = Math.min(music.fade_out, audibleDuration / 2);
    const envelope = Math.min(1, fadeIn > 0 ? elapsed / fadeIn : 1, fadeOut > 0 ? Math.max(0, audibleDuration - elapsed) / fadeOut : 1);
    soundtrack.volume = clamp(music.volume * envelope, 0, 1);
    // Leave the running audio decoder alone when the playback rate is unchanged.
    // Buffered music is the master clock. Correct video timing gently instead
    // of changing music pitch or repeatedly restarting an MP3 decoder.
    const playbackRate = soundtrack.buffered ? baseVideoRate : video.playbackRate * (1 + rateCorrection * .02);
    if (soundtrack.playbackRate !== playbackRate) soundtrack.playbackRate = playbackRate;
    if (soundtrack.paused && !playbackPending && !previewError) {
      get('audition')?.pause(); playbackPending = true;
      soundtrack.play().then(() => {
        // The first MP3 decode may start later than video playback. Align once
        // when audio actually starts, rather than seeking repeatedly afterwards.
        if (!soundtrack.buffered && active() && !soundtrack.paused && !video.paused && !videoBuffering) syncPreview(true);
      }).catch(error => {
        if (error.name === 'AbortError') return; // A pause, seek or buffer wait cancelled this start.
        previewError = true; status(`Music preview could not play: ${error.message}. Press Studio Play again.`);
      }).finally(() => { playbackPending = false; });
    }
  }
  function exportPayload() {
    if (!state.music?.enabled) return null;
    if (!active()) throw new Error('Selected music is unavailable. Choose a saved track or turn off music before exporting.');
    const {track_id, start, end, volume, fade_in, fade_out, loop} = state.music;
    return {track_id, start, end, volume, original_volume: videoGain(), fade_in, fade_out, loop};
  }
  async function init() {
    if (!get('library')) return;
    const bind = (id, event, callback) => get(id)?.addEventListener(event, callback);
    const selectSource = source => {
      for (const key of ['local', 'url']) {
        const active = key === source;
        get(`tab-${key}`)?.classList.toggle('active', active);
        get(`tab-${key}`)?.setAttribute('aria-pressed', String(active));
        get(`panel-${key}`)?.classList.toggle('hidden', !active);
      }
    };
    bind('tab-local', 'click', () => selectSource('local'));
    bind('tab-url', 'click', () => selectSource('url'));
    updateVideoAudioControls(); applyOriginalVolume();
    bind('video-enabled', 'change', event => {
      state.videoAudio = {enabled: event.target.checked, volume: state.videoAudio ? clamp(finite(state.videoAudio.volume, 1), 0, 1) : (videoGain() || 1)};
      updateVideoAudioControls(); commit();
    });
    bind('original-volume', 'input', event => {
      state.videoAudio = {enabled: true, volume: clamp(finite(event.target.value), 0, 100) / 100};
      updateVideoAudioControls(); commit();
    });
    bind('import', 'click', importTrack); bind('search', 'input', renderLibrary);
    bind('upload', 'click', () => get('file')?.click());
    bind('file', 'change', event => uploadTrack(event.target.files?.[0]));
    bind('analyze', 'click', analyzeHighlights);
    bind('remove', 'click', () => {
      detachMusic(); status('Music removed from this reel. Your saved audio is still in the library.');
    });
    bind('refresh', 'click', () => refresh().catch(error => status(error.message)));
    bind('clip', 'pointerdown', event => {
      if (!selected || !state.music || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation();
      const clip = get('clip'), width = clip.getBoundingClientRect().width;
      slipDrag = {id: event.pointerId, x: event.clientX, start: state.music.start, pixelsPerSecond: Math.max(1, width) / reelDuration()};
      clip.setPointerCapture(event.pointerId); clip.classList.add('dragging');
    });
    bind('clip', 'pointermove', event => {
      if (!slipDrag || event.pointerId !== slipDrag.id) return;
      event.preventDefault(); event.stopPropagation();
      setOffset(slipDrag.start - (event.clientX - slipDrag.x) / slipDrag.pixelsPerSecond);
    });
    const finishSlip = event => {
      if (!slipDrag || event.pointerId !== slipDrag.id) return;
      slipDrag = null; get('clip')?.classList.remove('dragging');
    };
    bind('clip', 'pointerup', finishSlip); bind('clip', 'pointercancel', finishSlip); bind('clip', 'lostpointercapture', finishSlip);
    bind('clip', 'keydown', event => {
      let offset;
      if (event.key === 'ArrowRight') offset = state.music?.start + (event.shiftKey ? 1 : 0.1);
      else if (event.key === 'ArrowLeft') offset = state.music?.start - (event.shiftKey ? 1 : 0.1);
      else if (event.key === 'Home') offset = 0;
      else if (event.key === 'End') offset = maxOffset();
      else return;
      event.preventDefault(); event.stopPropagation(); setOffset(offset);
    });
    for (const [id, key, max, factor] of [['volume', 'volume', 100, 100], ['fade-in', 'fade_in', 10, 1], ['fade-out', 'fade_out', 10, 1]]) bind(id, id.includes('volume') ? 'input' : 'change', event => {
      if (!state.music) return;
      if (id.includes('volume')) state.music.enabled = true;
      state.music[key] = clamp(finite(event.target.value), 0, max) / factor; updateEditor(); commit();
    });
    bind('loop', 'change', event => { if (state.music) { state.music.loop = event.target.checked; updateEditor(); commit(); } });
    bind('preview-part', 'click', async () => {
      const player = get('audition'); if (!player || !state.music) return;
      el.hiddenVideo?.pause(); el.audioMasterPlayer?.pause(); soundtrack.pause(); auditionPart = true; player.currentTime = state.music.start;
      try { await player.play(); } catch (error) { status(`Audio could not play: ${error.message}`); }
    });
    bind('audition', 'play', () => { el.hiddenVideo?.pause(); el.audioMasterPlayer?.pause(); soundtrack.pause(); });
    bind('audition', 'seeking', () => { if (get('audition').currentTime < state.music?.start || get('audition').currentTime >= state.music?.end) auditionPart = false; });
    bind('audition', 'timeupdate', () => { if (auditionPart && state.music && get('audition').currentTime >= state.music.end) { get('audition').pause(); auditionPart = false; } });
    bind('rename', 'click', async () => {
      if (!selected) return;
      const name = get('name')?.value.trim(); if (!name) { status('Enter a name for this track.'); return; }
      try { await request(`/api/music/${encodeURIComponent(selected.id)}`, {...json({name}), method: 'PATCH'}); await refresh(); status('Track name saved.'); }
      catch (error) { status(error.message); }
    });
    bind('save-range', 'click', async () => {
      if (!selected || !state.music) return;
      const name = get('range-name')?.value.trim(); if (!name) { status('Name your favorite part first.'); return; }
      try { await request(`/api/music/${encodeURIComponent(selected.id)}/ranges`, json({name, start: state.music.start, end: state.music.end})); await refresh(); status('Favorite part saved for future reels.'); }
      catch (error) { status(error.message); }
    });
    for (const event of ['waiting', 'stalled']) el.hiddenVideo?.addEventListener(event, () => {
      if (event === 'stalled' && el.hiddenVideo.readyState >= 3) return;
      videoBuffering = true;
      if (!soundtrack.paused) soundtrack.pause();
    });
    for (const event of ['playing', 'canplay', 'seeked']) el.hiddenVideo?.addEventListener(event, () => {
      if (el.hiddenVideo.readyState < 3) return;
      videoBuffering = false; syncPreview(true);
    });
    el.hiddenVideo?.addEventListener('ratechange', () => {
      const video = el.hiddenVideo;
      if (rateOwner === video && (appliedVideoRate === video.playbackRate || (appliedVideoRate === null && baseVideoRate === video.playbackRate))) return;
      if (rateOwner === video) { baseVideoRate = video.playbackRate; followBias = 0; followClock = null; }
      syncPreview(false);
    });
    for (const event of ['play', 'timeupdate', 'pause', 'ended']) el.hiddenVideo?.addEventListener(event, () => { if (event === 'play') previewError = false; syncPreview(event !== 'timeupdate'); });
    soundtrack.addEventListener('loadedmetadata', () => syncPreview(true));
    soundtrack.addEventListener('error', () => { previewError = true; status('Saved audio could not load. Refresh the library or import it again.'); });
    try { await refresh(); } catch (error) { status(`Could not load music library: ${error.message}`); }
  }
  window.musicStudio = {init, exportPayload, syncPreview, originalGain, videoGain, syncTimeline};
})();
