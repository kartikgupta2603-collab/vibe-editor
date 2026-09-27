const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8').replace(/\r\n/g, '\n');
function section(start, end) {
  const begin = source.indexOf(start);
  assert.ok(begin >= 0, start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(finish > begin, end);
  return source.slice(begin, finish);
}
function context() {
  const elements = new Proxy({}, { get(target, key) {
    if (!target[key]) target[key] = {classList: {add() {}, remove() {}, toggle() {}, contains() {return false;}}, load() {}, addEventListener(name, callback) {this[name] = callback;}, textContent: '', value: ''};
    return target[key];
  }});
  const ctx = {state: {sourceGeneration: 0, songName: '', videoPath: '', textElements: {}, adjustments: {}}, el: elements,
    console, fetch: async () => ({ok: false}), saveProjectState() {}, renderReel() {}, showToast() {},
    initDynamicClipForVideo() {}, URL: {createObjectURL: file => `blob:${file.name}`}, FormData: class {append() {}}};
  vm.createContext(ctx);
  vm.runInContext(section('async function ensureServerVideoPathForAnalysis()', 'function extractSongMetaFromTitle'), ctx);
  vm.runInContext(section('function extractSongMetaFromTitle(', 'function initDynamicClipForVideo('), ctx);
  vm.runInContext(section('async function loadFile(', 'function applyAIClip('), ctx);
  vm.runInContext(section('function getDefaultAIAnalysis(', 'function renderAIResults('), ctx);
  return ctx;
}
test('selecting B clears the completed upload from A', async () => {
  const c=context();
  c.state._uploadPromise=Promise.resolve('A.mp4');
  await c.loadFile('B.mp4');
  assert.equal(await c.ensureServerVideoPathForAnalysis(), 'B.mp4');
  assert.equal(c.state._uploadPromise, null);
});
test('analysis waiting on an upload rejects a changed source', async () => {
  const c=context();
  let resolve;
  c.state._uploadPromise=new Promise(done => {resolve=done;});
  const wait=c.ensureServerVideoPathForAnalysis();
  await c.loadFile('B.mp4');
  resolve('A.mp4');
  await assert.rejects(wait, /selected video changed/);
  assert.equal(c.state.videoPath, 'B.mp4');
});
test('late probe from A cannot replace B metadata or start A conversion', async () => {
  const c=context(); let resolve;
  c.fetch=() => new Promise(done => {resolve=done;});
  const a=c.loadFile('A.mp4'); const finishA=resolve;
  c.fetch=async () => ({ok:false});
  await c.loadFile('B.mp4');
  finishA({ok:true,json:async()=>({duration:180,resolution:'A'})});
  await a;
  assert.equal(c.state.videoPath,'B.mp4');
  assert.equal(c.state.videoMeta,null);
});
test('default trim suggestions do not claim Gemini analysis or fabricate scores', () => {
  const c=context();
  for (const duration of [30,90,180]) {
    const result=c.getDefaultAIAnalysis(duration);
    assert.equal(result.score,null);
    assert.equal(result.isDefaultSuggestion,true);
    assert.doesNotMatch(result.model_used,/Gemini/);
    assert.doesNotMatch(result.clip_type,/Chorus|Bridge|Climax/);
    assert.ok(result.alternatives.every(alt => alt.score === null));
  }
});
test('hidden series is omitted from preview and encoded in export and persistence', () => {
  const c=context(); let draws=0;
  c.state.showSeriesText=false; c.state._textBoxes={series:{}};
  c.ctx={fillText(){draws++;}};
  vm.runInContext(section('  if (state.showSeriesText !== false) {', '  // Omit Song Name'),c);
  assert.equal(draws,0); assert.equal(c.state._textBoxes.series,undefined);
  c.state.seriesFormat='Day {day}'; c.state.dayNumber=7; c.state.adjustments={};
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.template.series_text.enabled',c),false);
  let saved;
  c.localStorage={setItem(key,value){saved=JSON.parse(value);}};
  vm.runInContext(section('function saveProjectState()', 'async function restoreProjectState()'),c);
  c.saveProjectState(); assert.equal(saved.showSeriesText,false);
});
test('subtitle size and X affect actual canvas drawing and export payload', () => {
  const c=context(); const draws=[];
  c.state.textElements.subtitles={size:76,x:310,y:1000,color:'#ffffff'};
  c.state._textBoxes={};
  c.isDarkColor=()=>false; c.getSubtitleLines=text=>[text];
  c.getOrComputeWordTimings=()=>[];
  const canvas={font:'',measureText:()=>({width:80}),translate(x,y){draws.push({x,y,font:this.font});}};
  c.ctx=new Proxy(canvas,{get(target,key){return key in target ? target[key] : ()=>{};}});
  vm.runInContext(section('function renderDualSubtitles(', 'function renderReel('),c);
  c.renderDualSubtitles(c.ctx,'Hello','',0,10,'minimal',1080,1920);
  assert.equal(draws[0].x,310); assert.match(draws[0].font,/76px/);
  c.state.seriesFormat='Day {day}'; c.state.dayNumber=1;
  vm.runInContext(section('    const payload = {','    try {\n      const res = await fetch("/api/export"'),c);
  assert.equal(vm.runInContext('payload.subtitle_x',c),310);
  assert.equal(vm.runInContext('payload.subtitle_font_size',c),76);
});

 test('a completed upload cannot overwrite a source selected while it was in flight', async () => {
  const c=context(); let finishUpload;
  c.fetch=async url => {
    if (url === '/api/video/upload') return new Promise(done => {finishUpload=done;});
    return {ok:false};
  };
  vm.runInContext(section('function setupFileHandling()', 'async function ensureServerVideoPathForAnalysis()'),c);
  c.setupFileHandling();
  c.el.inputNativeFile.change({target:{files:[{name:'A.mp4'}]}});
  const upload=c.state._uploadPromise;
  assert.ok(upload);
  await c.loadFile('B.mp4');
  finishUpload({ok:true,json:async()=>({file_path:'A.mp4'})});
  await upload;
  assert.equal(c.state.videoPath,'B.mp4');
});
