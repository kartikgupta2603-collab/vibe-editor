// Focused production-function regressions, with no browser or AI requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/static/app.js'), 'utf8').replace(/\r\n/g, '\n');
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end);
}
const context = { console, state: { startTime: 0, endTime: 20 }, el: {}, renderReel() {}, formatTime: String };
vm.createContext(context);
vm.runInContext('let subtitleCueCache = {source:null,cues:[]}; let lastActiveSubtitleListIndex = -1;' +
  ['findActiveSubtitleCue', 'mergeOrphanSubtitleFragments', 'renderLyricsList'].map(functionSource).join('\n'), context);

const cues = [{start:0,end:1,text:'If'}, {start:1,end:3,text:'you leave', words_en:[{word:'you',start:1,end:2}],
  _cachedWordsEn:[{}], timing_source:'audio_aligned'}];
context.findActiveSubtitleCue(cues, 0.5); // build the old timestamp/index cache
context.mergeOrphanSubtitleFragments(cues);
assert.equal(cues.length, 1);
assert.equal(cues[0].text, 'If you leave');
assert.equal(cues[0].start, 0);
assert.equal(cues[0].words_en, undefined);
assert.equal(cues[0]._cachedWordsEn, undefined);
assert.equal(cues[0].timing_source, undefined);
assert.equal(context.findActiveSubtitleCue(cues, 0.5).cue, cues[0]);
assert.equal(context.findActiveSubtitleCue(cues, 1.5).index, 0);

const bilingual = [{start:0,end:1,text_jp:'And',text_en:'And',text_romaji:'And'},
  {start:1,end:3,text_jp:'we sing',text_en:'we sing',text_romaji:'we sing'}];
context.mergeOrphanSubtitleFragments(bilingual);
for (const field of ['text_jp','text_en','text_romaji']) assert.equal(bilingual[0][field], 'And we sing');

const overlap = [{start:0,end:10,text:'held vocal'}, {start:1,end:2,text:'short harmony'}];
assert.equal(context.findActiveSubtitleCue(overlap, 1.5).cue, overlap[1]);
assert.equal(context.findActiveSubtitleCue(overlap, 3).cue, overlap[0]);
assert.equal(context.findActiveSubtitleCue(overlap, 11), null);

const changed = [{start:3,end:4,text:'later'}, {start:0,end:2,text:'earlier'}];
context.findActiveSubtitleCue(changed, 1);
changed[1].start = 5;
changed[1].end = 6;
context.renderLyricsList(changed);
assert.equal(context.findActiveSubtitleCue(changed, 1), null);
assert.equal(context.findActiveSubtitleCue(changed, 5.5).index, 1);

async function testStaleResponse(change) {
  let listener;
  const existing = [{start:0,end:2,text:'User edited line'}];
  const state = {videoPath:'first.mp4',sourceGeneration:1,videoMeta:{duration:20},lyrics:existing,fullLyrics:existing};
  const ctx = {state, el:{btnSyncFullLyrics:{addEventListener(_event, callback) {listener=callback;}},
    btnSyncFullText:{textContent:''}}, showToast() {}, console, AbortController, setTimeout, clearTimeout, document:{getElementById(){return null;}},
    fetch: async () => ({ok:true,json:async () => {
      change(state);
      return {lyrics:[{start:0,end:2,text:'Old video transcript'}],song_name:'Wrong song'};
    }})};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function setStudioAIStatus('), source.indexOf('function setupMetadataAndAI()')), ctx);
  const start = source.indexOf('  if (el.btnSyncFullLyrics) {', source.indexOf('// Generate vocal-synchronized subtitles'));
  const end = source.indexOf('\n  }\n', start) + 5;
  vm.runInContext(source.slice(start, end), ctx);
  await listener();
  assert.equal(state.lyrics, existing);
  assert.equal(state.fullLyrics, existing);
  assert.equal(state.songName, undefined);
}
(async () => {
  await testStaleResponse(state => {state.sourceGeneration += 1;});
  await testStaleResponse(state => {state.videoPath = 'second.mp4';});
  console.log('Subtitle playback regressions passed.');
})().catch(error => {console.error(error); process.exitCode=1;});
