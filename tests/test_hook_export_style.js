const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../app/static/app.js'), 'utf8');
const drawing = source.slice(source.indexOf('const FONT_STACKS ='), source.indexOf('function renderReel()'));

function renderHook(style, fontKey, scale, text = 'Clear hook', size = 68, options = {}) {
  const draws = [];
  const rectangles = [];
  const canvas = {
    save() {}, restore() {}, setTransform() {}, beginPath() {}, rect(x, y, width, height) {rectangles.push({x, y, width, height});}, fill() {}, fillRect(x, y, width, height) {rectangles.push({x, y, width, height});},
    measureText(text) { return {width: text.length * Number(/(\d+)px/.exec(this.font)?.[1] || 68) * 0.55}; },
    strokeText(text, x, y) { draws.push({kind: 'stroke', text, x, y, font: this.font, width: this.lineWidth, blur: this.shadowBlur}); },
    fillText(text, x, y) { draws.push({kind: 'fill', text, x, y, font: this.font, blur: this.shadowBlur}); },
  };
  const context = {
    state: {aspectRatio: '9:16', hookStyle: style, hookFont: fontKey, showSeriesText: true,
      seriesFormat: text, dayNumber: 1, adjustments: {bgType: 'black'},
      textElements: {series: {x: options.x ?? 540, y: options.y ?? 360, size, _custom: true, lineGap: 16, color: '#fff'}},
      _visualReelTop: options.visualReelTop || 0,
      watermark: {enabled: false}},
    el: {reelCanvas: {width: 540}}, isDarkColor: () => false,
    document: {createElement: () => ({width: 0, height: 0, getContext: () => canvas, toDataURL: () => 'data:image/png;base64,test'})},
  };
  vm.createContext(context);
  vm.runInContext(drawing, context);
  if (scale === 4) context.createStudioTextOverlay({includeWatermark: false});
  else context.drawStudioText(canvas, 'black', 140, 90, 1, false, true, false, 1, options.visualReelTop || 0);
  draws.bounds = context.state._textBoxes.series;
  draws.rectangles = rectangles;
  draws.savedPlacement = context.state.textElements.series;
  return draws;
}

test('manual font increases grow into more lines without the three-line shrink', () => {
  const text = 'When you are watching the new trailer and suddenly hear the most beautiful soundtrack from the first season';
  const small = renderHook('outlined', 'arial_black', 1, text, 38).filter(draw => draw.kind === 'fill');
  const large = renderHook('outlined', 'arial_black', 1, text, 110).filter(draw => draw.kind === 'fill');
  assert.ok(large.length > 3);
  assert.ok(large.length > small.length);
  assert.ok(large.every(draw => draw.font.includes('110px')));
  assert.equal(large.map(draw => draw.text).join(' '), text);
  const tiny = renderHook('outlined', 'arial_black', 1, 'Small', 14);
  assert.ok(tiny.every(draw => draw.font.includes('14px')));
  const dragged = renderHook('outlined', 'arial_black', 1, 'Bigger', 120);
  assert.ok(dragged.every(draw => draw.font.includes('120px')));
});

test('hook gets a little more horizontal room before wrapping to a second line', () => {
  const text = 'THIS LINE GETS EXTRA SPACE';
  const oneLine = renderHook('outlined', 'arial_black', 1, text, 68).filter(draw => draw.kind === 'fill');
  assert.equal(oneLine.length, 1);
  assert.ok(text.length * 68 * 0.55 > 920, 'the previous width would wrap this line');
  const wrapped = renderHook('outlined', 'arial_black', 1, `${text} NOW`, 68).filter(draw => draw.kind === 'fill');
  assert.equal(wrapped.length, 2);
});

test('oversized unbroken hook words wrap instead of crossing the screen edges', () => {
  const text = 'W'.repeat(100);
  const draws = renderHook('outlined', 'arial_black', 1, text, 110).filter(draw => draw.kind === 'fill');
  assert.ok(draws.length > 1);
  assert.equal(draws.map(draw => draw.text).join(''), text);
  assert.ok(draws.every(draw => draw.text.length * 110 * 0.55 <= 980));
});

test('hooks and their black bars remain visible when enlarged near an edge', () => {
  const text = 'A larger hook near the edge should stay entirely visible';
  for (const style of ['outlined', 'white_on_black', 'scene_blend']) {
    for (const x of [50, 1030]) {
      const options = {x, y: 1880};
      const preview = renderHook(style, 'arial_black', 1, text, 110, options);
      const exported = renderHook(style, 'arial_black', 4, text, 110, options);
      assert.ok(preview.bounds.x >= 0);
      assert.ok(preview.bounds.x + preview.bounds.width <= 1080);
      assert.ok(preview.bounds.y + preview.bounds.height <= 1920);
      assert.deepEqual({...exported.bounds}, {...preview.bounds});
      assert.equal(preview.savedPlacement.x, x, 'saved position is preserved');
      assert.equal(preview.savedPlacement.y, 1880);
      if (style === 'white_on_black') {
        assert.ok(preview.rectangles.every(rect => rect.y >= 0 && rect.y + rect.height <= 1920));
      }
    }
  }
});

test('a long white-banner hook fits above the footage while preserving every word', () => {
  const text = 'A long hook that grows into several lines and must stay above the video instead of overlapping it';
  const draws = renderHook('black_on_white', 'arial_black', 1, text, 110, {visualReelTop: 500});
  assert.ok(draws.bounds.y >= 0);
  assert.ok(draws.bounds.y + draws.bounds.height <= 500);
  assert.equal(draws.filter(draw => draw.kind === 'fill').map(draw => draw.text).join(' '), text);
});

test('very long hooks keep their wrapped lines within the reel height', () => {
  const draws = renderHook('outlined', 'arial_black', 1, 'Many words '.repeat(500).trim(), 110, {y: 1880});
  assert.ok(draws.bounds.y + draws.bounds.height <= 1920);
  assert.ok(draws.bounds.width <= 1080);
  assert.equal(draws.filter(draw => draw.kind === 'fill').map(draw => draw.text).join(' '), 'Many words '.repeat(500).trim());
});

for (const font of ['arial_black', 'segoe', 'bahnschrift', 'oswald', 'cooper_black', 'georgia', 'segoe_print']) {
  test(`export preserves ${font} font and outline while scaling the hook shadow`, () => {
    const preview = renderHook('outlined', font, 1);
    const exported = renderHook('outlined', font, 4);
    assert.ok(preview.some(draw => draw.kind === 'stroke'));
    assert.equal(exported.length, preview.length);
    for (let i = 0; i < preview.length; i++) {
      assert.equal(exported[i].blur / 4, preview[i].blur);
      assert.deepEqual({...exported[i], blur: 0}, {...preview[i], blur: 0});
    }
  });
}

test('black hook on a white banner remains shadow-free during export', () => {
  for (const scale of [1, 4]) {
    const draws = renderHook('black_on_white', 'segoe', scale);
    assert.ok(draws.length);
    assert.ok(draws.every(draw => draw.kind === 'fill' && draw.blur === 0));
  }
});

for (const style of ['outlined', 'white_on_black', 'black_on_white', 'scene_blend']) {
  test(`resized ${style} hooks wrap inside mobile margins in preview and export`, () => {
    const text = 'When you watch the new trailer and hear that beautiful soundtrack again';
    const preview = renderHook(style, 'arial_black', 1, text, 110).filter(draw => draw.kind === 'fill');
    const exported = renderHook(style, 'arial_black', 4, text, 110).filter(draw => draw.kind === 'fill');
    const lines = [...new Set(preview.map(draw => draw.text))];
    assert.ok(lines.length > 1, 'large text must wrap before reaching the edges');
    assert.equal(lines.join(' '), text, 'wrapping preserves every word');
    for (const draw of preview) {
      const size = Number(/(\d+)px/.exec(draw.font)[1]);
      const width = draw.text.length * size * 0.55;
      assert.ok(draw.x - width / 2 >= 50, 'left margin stays inside safe area');
      assert.ok(draw.x + width / 2 <= 1030, 'right margin stays inside safe area');
    }
    assert.deepEqual(exported.map(draw => ({...draw, blur: 0})), preview.map(draw => ({...draw, blur: 0})));
  });
}
