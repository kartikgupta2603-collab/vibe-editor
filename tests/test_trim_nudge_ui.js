const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/app.js', 'utf8');
function setup() {
  const group = edge => ({style: {}, listeners: {}, buttons: [-1, 1].map(direction => ({dataset: {edge, direction: String(direction)}, listeners: {}, addEventListener(event, fn) {this.listeners[event] = fn;}})),
    addEventListener(event, fn) {this.listeners[event] = fn;}, querySelectorAll() {return this.buttons;}});
  const calls = [];
  const c = {state: {videoPath: 'clip.mp4', startTime: 2, endTime: 8}, el: {trimNudgeStart: group('start'), trimNudgeEnd: group('end')},
    getTimelineMetrics: () => ({dur: 10}), pauseVideo: () => calls.push('pause'), updateTimelineUI: () => calls.push('timeline'),
    updatePlayheadUI: time => calls.push(['playhead', time]), renderReel: () => calls.push('render'), saveProjectState: () => calls.push('save')};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function updateTrimNudgeControls('), source.indexOf('function setupTimeline(')), c);
  c.setupTrimNudgeControls((...args) => calls.push(['seek', ...args]));
  return {c, calls};
}

test('each arrow changes only its own trim edge by half a second and seeks/saves immediately', () => {
  for (const edge of ['start', 'end']) for (const direction of [-1, 1]) {
    const {c, calls} = setup();
    const group = edge === 'start' ? c.el.trimNudgeStart : c.el.trimNudgeEnd;
    group.buttons[direction === -1 ? 0 : 1].listeners.click();
    const expected = (edge === 'start' ? 2 : 8) + direction * .5;
    assert.equal(c.state[edge === 'start' ? 'startTime' : 'endTime'], expected);
    assert.equal(c.state[edge === 'start' ? 'endTime' : 'startTime'], edge === 'start' ? 8 : 2);
    assert.equal(c.state.currentTime, expected); assert.equal(c.state.playbackStartPos, expected);
    assert.deepEqual(calls, ['pause', ['seek', expected, true], 'timeline', ['playhead', expected], 'render', 'save']);
  }
});

test('arrows clamp to source limits and preserve the same minimum clip length as dragging', () => {
  for (const [start, end, edge, direction, expected] of [[.2,8,'start',-1,0],[2,9.8,'end',1,10],[7.9,8,'start',1,7.95],[2,2.1,'end',-1,2.05]]) {
    const {c} = setup(); c.state.startTime=start; c.state.endTime=end;
    c.nudgeTimelineTrim(edge,direction,()=>{});
    assert.equal(c.state[edge==='start'?'startTime':'endTime'],expected);
  }
  const {c,calls} = setup(); c.state.videoPath=''; c.nudgeTimelineTrim('start',1,()=>{}); assert.equal(calls.length,0);
});

test('arrow pairs stay centered on each white bar, including near track edges', () => {
  for (const [start,end] of [[0,600],[100,500],[200,202],[599,600]]) {
    const {c} = setup(); c.updateTrimNudgeControls(start,end,600);
    const x = parseFloat(c.el.trimNudgeStart.style.left), y = parseFloat(c.el.trimNudgeEnd.style.left);
    assert.equal(x+18,start+3);
    assert.equal(y+18,end-3);
    assert.equal(c.el.trimNudgeEnd.style.top, end-start-6<38 ? '43px' : '23px');
  }
});

test('boundary arrows disable at limits and button gestures cannot start track dragging', () => {
  const {c} = setup(); c.state.startTime=0; c.state.endTime=10;
  c.updateTrimNudgeControls(0,600,600);
  assert.equal(c.el.trimNudgeStart.buttons[0].disabled,true);
  assert.equal(c.el.trimNudgeEnd.buttons[1].disabled,true);
  let stopped=0;
  for (const group of [c.el.trimNudgeStart,c.el.trimNudgeEnd]) {
    group.listeners.pointerdown({stopPropagation(){stopped++;}});
    group.listeners.click({stopPropagation(){stopped++;}});
  }
  assert.equal(stopped,4);
});
