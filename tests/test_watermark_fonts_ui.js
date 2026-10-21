const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8');
const drawing = source.slice(source.indexOf('const FONT_STACKS ='), source.indexOf('function renderReel()'));

function studio(font, style = 'clean') {
  const draws = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, rotate() {}, setTransform() {},
    measureText() { return {width: 200}; },
    fillText(text) { draws.push({text, font: this.font, alpha: this.globalAlpha, composite: this.globalCompositeOperation}); },
  };
  const c = {
    state: {watermark: {enabled: true, font, style, text: 'My Username', rotation: 90}, showSeriesText: false,
      aspectRatio: '9:16', adjustments: {bgType: 'black'}, textElements: {watermark: {x: 100, y: 500, size: 60, color: '#fff'}}},
    el: {reelCanvas: {width: 540}}, document: {createElement: () => ({getContext: () => ctx, toDataURL: () => 'data:image/png;base64,test'})},
    isDarkColor: () => false, renderReel() {c.redraws++;}, redraws: 0, showToast(message) {c.error = message;},
  };
  vm.createContext(c); vm.runInContext(drawing, c);
  return {c, ctx, draws};
}

for (const [font, weight, family] of [
  ['bahnschrift', 800, 'Bahnschrift'], ['arial_black', 900, 'Arial Black'],
  ['segoe', 400, 'Segoe UI'], ['twcen_condensed', 400, 'Vibe Tw Cen'], ['cooper_black', 400, 'Cooper Black'],
  ['oswald', 600, 'Vibe Oswald'], ['georgia', 400, 'Georgia'], ['segoe_print', 400, 'Segoe Print'],
]) {
  test(`${font} uses its own family and weight for clean, blended and exported usernames`, () => {
    const clean = studio(font);
    clean.c.drawStudioText(clean.ctx, 'black', 140, 90, 1, true, false, true, 1);
    const exported = studio(font);
    exported.c.createStudioTextOverlay({includeHook: false});
    const blended = studio(font, 'scene_blend');
    blended.c.drawSceneBlendUsername(blended.ctx);
    for (const result of [clean, exported, blended]) {
      assert.equal(result.draws.length, 1);
      assert.match(result.draws[0].font, new RegExp(`^${weight} 60px `));
      assert.ok(result.draws[0].font.includes(family));
    }
  });
}

test('a selected web font finishes loading before the username redraw', async () => {
  const {c} = studio('twcen_condensed');
  let release;
  c.document.fonts = {load(font) {
    assert.match(font, /^400 28px 'Vibe Tw Cen'/);
    return new Promise(resolve => {release = resolve;});
  }};
  const loading = c.refreshWatermarkFont();
  assert.equal(c.redraws, 0);
  release([]); await loading;
  assert.equal(c.redraws, 1);
});

test('failed username font loads show an actionable message', async () => {
  const {c} = studio('twcen_condensed');
  c.document.fonts = {load: async () => {throw new Error('Font file unavailable');}};
  await c.refreshWatermarkFont();
  assert.match(c.error, /Username font could not load.*Refresh.*Font file unavailable/);
  assert.equal(c.redraws, 0);
});

test('export waits for the username font and project restoration reloads it', () => {
  assert.match(source, /await ensureWatermarkFontLoaded\(\);\s*if \(document\.fonts\) await document\.fonts\.ready/);
  assert.match(source, /watermarkFontControl\.value\); \}\s*void refreshWatermarkFont\(\)/);
});

test('username menu includes every hook font and preserves Tw Cen', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../app/static/index.html'), 'utf8');
  const menu = id => html.split(`<select id="${id}">`)[1].split('</select>')[0];
  const keys = id => [...menu(id).matchAll(/option value="([^"]+)"/g)].map(match => match[1]);
  const watermark = keys('select-watermark-font');
  for (const key of keys('select-hook-font')) assert.ok(watermark.includes(key), `missing username font: ${key}`);
  assert.ok(watermark.includes('twcen_condensed'));
});

test('Scene Blend preview uses 70 percent strength and export mask keeps full glyph alpha', () => {
  const preview = studio('segoe', 'scene_blend');
  preview.c.drawSceneBlendUsername(preview.ctx);
  assert.equal(preview.draws[0].alpha, 0.70);
  assert.equal(preview.draws[0].composite, 'overlay');
  const mask = studio('segoe', 'scene_blend');
  mask.c.createStudioTextOverlay({usernameSceneMask: true});
  assert.equal(mask.draws.length, 1);
  assert.equal(mask.draws[0].alpha, 1, 'strength must be applied exactly once by the video compositor');
  assert.equal(mask.draws[0].composite, 'source-over');
  assert.equal(mask.draws[0].font, preview.draws[0].font);
  assert.equal(mask.draws[0].text, preview.draws[0].text);
});
