const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/static/app.js', 'utf8');

function setup() {
  const button = {addEventListener(event, callback) {this[event] = callback;}};
  const c = {state: {adjustments: {scale: 1.2, verticalOffset: -40, windowInset: 12, blur: 35}},
    MAX_SONG_WINDOW_SCALE: 1.4, MAX_SONG_WINDOW_INSET: 180, renders: 0, saves: 0,
    el: {btnCenterFitVideo: button}, renderReel() {c.renders++;}, saveProjectState() {c.saves++;},
    syncAdjustmentSliders() {}, showToast() {}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function getSongWindowScale('), source.indexOf('async function recoverVideoPipeline(')), c);
  vm.runInContext(source.slice(source.indexOf('function setupFitView()'), source.indexOf('// REAL-TIME 9:16 VERTICAL REEL COMPOSITING ENGINE')), c);
  return c;
}

test('wide, square, portrait and unusually tall sources fit completely and center exactly', () => {
  const c = setup();
  for (const [w, h] of [[1920,1080], [1000,1000], [1080,1920], [500,2000], [331,1000], [999,1800], [193,343]]) {
    const g = c.getVideoFrameGeometry(w, h);
    assert.ok(g.width <= 1080 && g.height <= 1920, `${w}x${h} must fit completely`);
    assert.equal(g.x, 1080 - (g.x + g.width));
    assert.equal(g.y, 1920 - (g.y + g.height));
    assert.equal(g.width % 2, 0); assert.equal(g.height % 2, 0);
    assert.ok(Math.abs(g.width / g.height - w / h) < .005);
  }
  assert.deepEqual({...c.getVideoFrameGeometry(1000,1000)}, {width:1080,height:1080,x:0,y:420});
  assert.deepEqual({...c.getVideoFrameGeometry(500,2000)}, {width:480,height:1920,x:300,y:0});
});

test('explicit zoom and vertical movement remain available after auto fit', () => {
  const c = setup(), g = c.getVideoFrameGeometry(1000,1000,1080,1920,1.2,50);
  assert.deepEqual({...g}, {width:1296,height:1296,x:-108,y:362});
});

test('Center & Fit restores full-frame placement without changing the other style settings', () => {
  const c = setup(); c.setupFitView(); c.el.btnCenterFitVideo.click();
  assert.equal(c.state.adjustments.scale, 1);
  assert.equal(c.state.adjustments.verticalOffset, 0);
  assert.equal(c.state.adjustments.windowInset, 0);
  assert.equal(c.state.adjustments.blur, 35);
  assert.equal(c.renders, 1); assert.equal(c.saves, 1);
});
