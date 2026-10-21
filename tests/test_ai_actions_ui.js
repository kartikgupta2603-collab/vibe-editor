const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8');
function section(start, end) {const a=source.indexOf(start); const b=source.indexOf(end,a+start.length); assert.ok(a>=0&&b>a); return source.slice(a,b);}
function studio(action) {
  const nodes = new Map();
  const node = () => ({disabled:false, textContent:'Original button', value:'', classList:{add(){},remove(){}}, handlers:{}, addEventListener(name,fn){this.handlers[name]=fn;}, querySelector(){return null;}});
  const state = {sourceGeneration:1, videoPath:'clip.mp4', videoTitle:'My clip', videoMeta:{duration:20}, startTime:2, endTime:12,
    songName:'My song',animeName:'My anime',caption:'Original caption',seriesFormat:'Original hook',aiInstruction:'',
    lyrics:[{start:0,end:2,text_en:'Original words',timeline_basis:'absolute'}],subtitleStyle:'cinematic',subtitleFont:'georgia',showLyrics:false};
  state.fullLyrics=state.lyrics;
  const names=['btnGenerateAiHooks','btnGenerateAiCaption','aiCaptionStatus','aiCaptionBox','aiCaptionOutput','schedCaption','btnAnalyzeAI','aiLoading','aiResults','btnSyncFullLyrics','btnSyncFullText','lyricsLoading','checkSubtitles','inputSongName','inputAnimeName'];
  const el=Object.fromEntries(names.map(key=>[key,node()]));
  el.hiddenVideo={duration:20};
  const calls=[],messages=[];
  const c={state,el,AbortController,setTimeout,clearTimeout,console:{error(){}},
    document:{getElementById(id){if(!nodes.has(id)) nodes.set(id,node());return nodes.get(id);}},
    fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body),signal:options.signal});return{ok:true,json:async()=>c.response};},
    ensureServerVideoPathForAnalysis:async()=>{if(state._uploadPromise) await state._uploadPromise; if(!state.videoPath)throw new Error('Load a video first'); return state.videoPath;},
    renderLyricsList(){},renderReel(){},saveProjectState(){c.saved=true;},showToast(message){messages.push(message);},
    renderAIResults(data){state.aiAnalysis=data;},applyAIClip(start,end){state.startTime=start;state.endTime=end;}};
  vm.createContext(c);
  vm.runInContext(section('function setStudioAIStatus(', 'function setupMetadataAndAI()'),c);
  const blocks={subtitles:['  // Generate vocal-synchronized subtitles for the ENTIRE video','\n  if (el.checkSubtitles) {'],caption:['  // AI Instagram Caption Generator','\n  if (el.aiCaptionOutput) {'],analyze:['  // AI Hook Analysis','  function handleApplyRecommended()']};
  vm.runInContext(section(...blocks[action]),c);
  const button=el[{subtitles:'btnSyncFullLyrics',caption:'btnGenerateAiCaption',analyze:'btnAnalyzeAI'}[action]];
  const statusId={subtitles:'subtitle-generation-status',caption:'ai-caption-status',analyze:'ai-analysis-status'}[action];
  return Object.assign(c,{calls,messages,run:()=>button.handlers.click(),button,status:()=>nodes.get(statusId)?.textContent||el.aiCaptionStatus.textContent});
}
const cue={start:3,end:5,text_jp:'こんにちは',text_en:'Hello'};
test('subtitles commit actual timed words and keep the manual style, font and metadata',async()=>{
 const e=studio('subtitles');e.response={status:'success',lyrics:[cue],subtitle_style:'neon_glow',song_name:'Guess'};await e.run();
 assert.equal(e.state.lyrics[0].text_en,'Hello');assert.equal(e.state.lyrics[0].timeline_basis,'absolute');assert.equal(e.state.showLyrics,true);
 assert.equal(e.state.subtitleStyle,'cinematic');assert.equal(e.state.subtitleFont,'georgia');assert.equal(e.state.songName,'My song');
 assert.equal(e.calls[0].body.video_path,'clip.mp4');assert.equal(e.calls[0].body.duration,20);assert.equal(e.calls[0].signal.aborted,false);assert.match(e.status(),/1 timed subtitles ready/);assert.equal(e.button.disabled,false);
});
test('subtitles do not erase existing words for a silent or invalid AI result',async()=>{
 for(const response of [{status:'success',lyrics:[]},{lyrics:[{...cue,end:99}]},{lyrics:[{...cue,start:5,end:3}]},{lyrics:'broken'}]){
  const e=studio('subtitles');const old=JSON.stringify(e.state.lyrics);e.response=response;await e.run();assert.equal(JSON.stringify(e.state.lyrics),old);assert.equal(e.state.showLyrics,false);assert.equal(e.button.disabled,false);assert.equal(e.saved,undefined);
 }
});
test('subtitle request locks before upload and repeated clicks do not start duplicate Gemini calls',async()=>{
 const e=studio('subtitles');let finish;e.state._uploadPromise=new Promise(done=>finish=done);e.response={lyrics:[cue]};
 const first=e.run();assert.equal(e.button.disabled,true);await e.run();assert.equal(e.calls.length,0);finish();await first;assert.equal(e.calls.length,1);assert.equal(e.button.disabled,false);
});
test('subtitles retain newer manual edits and reject a result from an old video',async()=>{
 for(const change of [e=>{e.state.lyrics=[{start:0,end:1,text_en:'My edit'}];},e=>{e.state.sourceGeneration++;e.state.videoPath='new.mp4';}]){
  const e=studio('subtitles');let finish;e.response=new Promise(done=>finish=done);const pending=e.run();await new Promise(done=>setImmediate(done));change(e);const expected=JSON.stringify(e.state.lyrics);finish({lyrics:[cue]});await pending;assert.equal(JSON.stringify(e.state.lyrics),expected);assert.equal(e.saved,undefined);assert.match(e.status(),/edited|video changed/);
 }
});
test('subtitle API errors show the useful server cause and allow a successful retry',async()=>{
 const e=studio('subtitles');const fetch=e.fetch;
 e.fetch=async(url,options)=>{e.calls.push({url});return {ok:false,status:401,json:async()=>({detail:'Gemini API key is invalid. Update it in Settings.'})};};
 await e.run();assert.match(e.status(),/API key is invalid/);assert.equal(e.state.lyrics[0].text_en,'Original words');assert.equal(e.button.disabled,false);
 e.fetch=fetch;e.response={lyrics:[cue]};await e.run();assert.equal(e.state.lyrics[0].text_en,'Hello');assert.equal(e.calls.length,2);
});
test('Analyze Song rejects a late response after the user moves a trim edge',async()=>{
 const e=studio('analyze');let finish;e.response=new Promise(done=>finish=done);const pending=e.run();await new Promise(done=>setImmediate(done));e.state.startTime=4;finish({status:'success',recommended_start:6,recommended_end:16});await pending;assert.equal(e.state.startTime,4);assert.equal(e.state.endTime,12);assert.match(e.status(),/selection was kept/);assert.equal(e.state.aiAnalysis,undefined);
});
test('Analyze Song validates the returned range before changing the selected clip',async()=>{
 const e=studio('analyze');e.response={status:'success',recommended_start:2,recommended_end:25};await e.run();assert.equal(e.state.startTime,2);assert.equal(e.state.endTime,12);assert.equal(e.state.aiAnalysis,undefined);assert.match(e.status(),/valid audio-based moment/);
});
test('Analyze Song uses the real loaded media and accepts an audio-based moment',async()=>{
 const e=studio('analyze');e.response={status:'success',recommended_start:5,recommended_end:15,alternatives:[{start:-1,end:5},{start:1,end:8}]};await e.run();assert.equal(e.state.startTime,5);assert.equal(e.state.endTime,15);assert.equal(e.state.aiAnalysis.alternatives.length,1);assert.equal(e.calls[0].body.video_path,'clip.mp4');assert.equal(e.state.lyrics[0].text_en,'Original words');
});
test('caption generation preserves user edits and rejects stale reel details',async()=>{
 for(const change of [e=>e.state.caption='My edit',e=>e.state.sourceGeneration++,e=>e.state.seriesFormat='New hook']){
  const e=studio('caption');let finish;e.response=new Promise(done=>finish=done);const pending=e.run();await new Promise(done=>setImmediate(done));await e.run();assert.equal(e.calls.length,1);change(e);const expected=e.state.caption;finish({caption:'Old AI caption'});await pending;assert.equal(e.state.caption,expected);assert.match(e.el.aiCaptionStatus.textContent,/edits were kept/);assert.equal(e.button.disabled,false);
 }
});
test('caption success updates the copy box and saved scheduling caption',async()=>{
 const e=studio('caption');e.response={caption:'A useful caption',source:'gemini'};await e.run();assert.equal(e.state.caption,'A useful caption');assert.equal(e.el.aiCaptionOutput.value,'A useful caption');assert.equal(e.el.schedCaption.value,'A useful caption');assert.equal(e.saved,true);
});
test('request timeout aborts and releases the action with an actionable message',()=>{
 let expire;const c={AbortController,setTimeout(fn){expire=fn;return 7;},clearTimeout(id){assert.equal(id,7);},document:{getElementById(){return null;}}};vm.createContext(c);vm.runInContext(section('function setStudioAIStatus(', 'function setupMetadataAndAI()'),c);const button={disabled:false};const request=c.beginStudioAI(button,'status','Working',100);assert.equal(c.beginStudioAI(button,'status','Working'),null);expire();assert.equal(request.signal.aborted,true);assert.match(request.error(new Error('AbortError')),/took too long/);request.finish();assert.equal(button.disabled,false);
});
