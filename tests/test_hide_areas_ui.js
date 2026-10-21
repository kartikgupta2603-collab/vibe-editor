const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8');
function setup() {
  function element() { return {events: {}, children: [], classList: {toggle() {}},
    setAttribute() {}, addEventListener(name, callback) { this.events[name] = callback; },
    appendChild(child) { this.children.push(child); },
    set innerHTML(value) { this.children = []; }}; }
  const elements = Object.fromEntries(['btn-draw-hide-area', 'btn-clear-hide-areas', 'hide-area-list', 'hide-area-status'].map(id => [id, element()]));
  const canvas = element();
  canvas.getBoundingClientRect = () => ({left: 10, top: 20, width: 100, height: 200});
  canvas.setPointerCapture = () => {};
  const document = element();
  document.getElementById = id => elements[id];
  document.createElement = element;
  const c = {state: {videoPath: 'source.mp4', hideRegions: []}, el: {reelCanvas: canvas}, document,
    saved: 0, paused: 0, renderReel() {}, showToast() {},
    saveProjectState() { c.saved++; }, pauseVideo() { c.paused++; }, _textDragState: null};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('const MAX_HIDE_AREAS ='), source.indexOf('function setupTextCanvasInteraction()')), c);
  c.setupHideAreas();
  c.buttons = elements;
  c.pointer = (type, x, y) => canvas.events[type]({clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault() {}});
  c.draw = () => elements['btn-draw-hide-area'].events.click();
  return c;
}
test('reverse drag is normalized, saved, and stops drawing', () => {
  const c = setup(); c.draw();
  c.pointer('pointerdown', 90, 180); c.pointer('pointermove', 30, 60); c.pointer('pointerup', 30, 60);
  const r = c.state.hideRegions[0];
  assert.equal(r.x, .2); assert.equal(r.y, .2);
  assert.ok(Math.abs(r.width - .6) < 1e-10); assert.ok(Math.abs(r.height - .6) < 1e-10);
  assert.equal(c.saved, 1); assert.equal(c.paused, 1); assert.equal(c.state.hideAreaDrawing, false);
});
test('drag outside canvas clamps to bounds', () => {
  const c = setup(); c.draw(); c.pointer('pointerdown', 0, 0); c.pointer('pointerup', 200, 400);
  assert.equal(JSON.stringify(c.state.hideRegions), '[{"x":0,"y":0,"width":1,"height":1}]');
});
test('tiny click and Escape do not commit an area', () => {
  const c = setup(); c.draw(); c.pointer('pointerdown', 30, 60); c.pointer('pointerup', 30.01, 60.01);
  assert.equal(c.state.hideRegions.length, 0); assert.equal(c.state.hideAreaDrawing, true);
  c.document.events.keydown({key: 'Escape', preventDefault() {}});
  assert.equal(c.state.hideAreaDrawing, false); assert.equal(c.saved, 0);
});
test('remove and clear update saved areas', () => {
  const c = setup(); c.state.hideRegions = [{x: 0, y: 0, width: .2, height: .2}, {x: .5, y: .5, width: .2, height: .2}];
  c.syncHideAreaControls(); c.buttons['hide-area-list'].children[0].events.click();
  assert.equal(c.state.hideRegions.length, 1); assert.equal(c.state.hideRegions[0].x, .5);
  c.buttons['btn-clear-hide-areas'].events.click();
  assert.equal(c.state.hideRegions.length, 0); assert.equal(c.saved, 2);
});
test('limit and missing source prevent drawing', () => {
  const c = setup(); c.state.videoPath = ''; c.draw(); assert.equal(c.paused, 0);
  c.state.videoPath = 'source.mp4'; c.state.hideRegions = Array.from({length: 12}, () => ({x: 0, y: 0, width: .2, height: .2}));
  c.syncHideAreaControls(); c.draw(); assert.equal(c.buttons['btn-draw-hide-area'].disabled, true); assert.equal(c.paused, 0);
});
test('overlapping hidden regions clip separately, and no masks leave fast path untouched', () => {
  const c = setup(); const calls = [];
  const context = {beginPath() {calls.push('begin');}, rect(...args) {calls.push(args);}, clip(rule) {calls.push(rule);}};
  c.applyHideAreaClips(context, 1080, 1920); assert.equal(calls.length, 0);
  c.state.hideRegions = [{x: 0, y: 0, width: .5, height: .5}, {x: .2, y: .2, width: .5, height: .5}];
  c.applyHideAreaClips(context, 1080, 1920);
  assert.equal(calls.filter(call => call === 'evenodd').length, 2);
  assert.deepEqual(calls[2], [0, 0, 540, 960]);
});
