const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app/static/app.js'), 'utf8').replace(/\r\n/g, '\n');
const typography = source.slice(source.indexOf('const FONT_STACKS ='), source.indexOf('function renderReel()'));

function canvas(heartMetrics = null) {
  const calls = [], stack = [];
  return {calls, font: '900 68px Arial', textAlign: 'center', textBaseline: 'top', globalAlpha: 1,
    globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: 'transparent', filter: 'none',
    save() {stack.push({...this});}, restore() {Object.assign(this, stack.pop());},
    measureText(text) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      return {width: /😈|😬|☠/.test(text) ? 9000 : Array.from(text).length * size * .5 - (text.includes('AV') ? size * .1 : 0),
        ...(text === '❤️' && heartMetrics ? heartMetrics : {})};
    },
    drawImage(image, sx, sy, sw, sh, x, y, width, height) {calls.push({kind: 'image', image, sx, sy, sw, sh, x, y, width, height, alpha: this.globalAlpha, composite: this.globalCompositeOperation, shadow: this.shadowBlur, filter: this.filter});},
    fillText(text, x, y) {calls.push({kind: 'fill', text, x, y, font: this.font, alpha: this.globalAlpha, composite: this.globalCompositeOperation});},
    strokeText(text, x, y) {calls.push({kind: 'stroke', text, x, y, font: this.font});},
    fillRect(...args) {calls.push({kind: 'bar', args});}, rect(...args) {calls.push({kind: 'bar', args});},
    beginPath() {}, fill() {}, translate() {}, rotate() {}, setTransform(...args) {calls.push({kind: 'transform', args});},
  };
}

function environment(text = 'AV 😈 😬 ☠️', style = 'outlined', heartMetrics = null) {
  const images = [], overlays = [], messages = [];
  class Image {
    constructor() {images.push(this);}
    set src(value) {this.url = value;}
  }
  const state = {seriesFormat: text, dayNumber: 1, hookFont: 'arial_black', hookStyle: style,
    showSeriesText: true, hookFade: {start: 0}, textElements: {series: {x: 540, y: 360, size: 68, lineGap: 16, _custom: true}},
    watermark: {enabled: false}, adjustments: {}, aspectRatio: '9:16', _visualReelTop: 700};
  const c = {state, Image, console, el: {reelCanvas: {width: 540}}, isDarkColor: () => false,
    renderReel() {c.renders++;}, renders: 0, showToast(message) {messages.push(message);},
    document: {createElement(type) {assert.equal(type, 'canvas'); const context = canvas(heartMetrics); const element = {context, getContext: () => context, toDataURL: () => 'data:image/png;base64,test'}; overlays.push(element); return element;}}};
  vm.createContext(c); vm.runInContext(typography, c);
  return {c, state, images, overlays, messages, async ready() {const wait = c.ensureHookEmojiLoaded(); for (const image of images) image.onload(); await wait;}};
}

test('fixed emoji variants load the exact three artwork files once and keep Unicode editable', async () => {
  const e = environment('😈 😬 ☠ ☠️'); let loaded = false;
  const pending = e.c.ensureHookEmojiLoaded().then(() => {loaded = true;});
  await Promise.resolve(); assert.equal(loaded, false);
  assert.deepEqual(e.images.map(image => image.url), ['/emoji/whatsapp/1f608.png', '/emoji/whatsapp/1f62c.png', '/emoji/whatsapp/2620.png']);
  e.images.forEach(image => image.onload()); await pending;
  await e.c.ensureHookEmojiLoaded('☠️☠😈😬'); assert.equal(e.images.length, 3);
  assert.equal(e.state.seriesFormat, '😈 😬 ☠ ☠️');
  assert.deepEqual(Array.from(e.c.getHookEmojiRuns('☠️☠'), run => run.emoji), ['2620', '2620']);
});

test('all fifteen picker emoji use their matching image asset and a common visible height', async () => {
  const picker = [
    ['⚡', '26a1'], ['🔥', '1f525'], ['👀', '1f440'], ['😭', '1f62d'], ['✨', '2728'],
    ['❤️', '2764'], ['❤️‍🔥', '2764-fe0f-200d-1f525'], ['🖤', '1f5a4'], ['💔', '1f494'], ['❌', '274c'], ['✅', '2705'],
    ['😈', '1f608'], ['😬', '1f62c'], ['☠️', '2620'], ['🥀', '1f940'],
  ];
  const text = picker.map(([emoji]) => emoji).join(''), e = environment(text); await e.ready();
  assert.deepEqual(e.images.map(image => image.url), picker.map(([, key]) => key === '1f940' ? '/emoji/apple/1f940.png' : `/emoji/whatsapp/${key}.png`));
  const runs = Array.from(e.c.getHookEmojiRuns(text));
  assert.equal(runs.length, 15);
  assert.deepEqual(runs.map(run => run.emoji), picker.map(([, key]) => key));
  assert.equal(runs.map(run => run.text).join(''), text);
  const ctx = canvas(); assert.ok(e.c.measureHookLine(ctx, text, 68) >= 15 * 68);
  e.c.drawStudioText(ctx, 'black', 140, 90, 1, false, true, false, 1);
  const artwork = ctx.calls.filter(call => call.kind === 'image');
  assert.equal(artwork.length, 15); assert.deepEqual(artwork.map(call => call.image), e.images);
  assert.ok(artwork.every(call => call.height === 59 && Math.abs(call.width / call.height - call.sw / call.sh) < 1e-8));
  assert.equal(e.state.seriesFormat, text);
});

test('adjacent supported variants preserve selectors and surrounding text or other emoji', () => {
  const e = environment(), text = 'before⚡️✨️❤️❌️✅️🔥👀😭🖤💔😈😬☠️💥after';
  const runs = Array.from(e.c.getHookEmojiRuns(text));
  assert.equal(runs.filter(run => run.emoji).length, 13);
  assert.deepEqual(runs.filter(run => !run.emoji).map(run => run.text), ['before', '💥after']);
  assert.equal(runs.map(run => run.text).join(''), text);
  assert.ok(runs.every(run => run.text !== '\uFE0F'));
  const ctx = canvas(); ctx.font = '900 100px Arial';
  assert.equal(e.c.measureHookLine(ctx, 'AV❤️⚡️🖤', 100), 390);
  assert.equal(e.c.measureHookLine(ctx, '💥', 100), ctx.measureText('💥').width);
  for (const variant of ['❤', '❤️', '⚡', '⚡️', '✨', '✨️', '❌', '❌️', '✅', '✅️', '☠', '☠️']) {
    assert.equal(e.c.getHookEmojiRuns(variant).length, 1); assert.ok(e.c.measureHookLine(ctx, variant, 100) >= 100);
  }
});

test('wrapping measures emoji as one font-sized image and preserves skull variation selectors', () => {
  const e = environment(), ctx = canvas(); ctx.font = '900 100px Arial';
  assert.equal(e.c.measureHookLine(ctx, 'AV😈', 100), 190);
  assert.equal(e.c.measureHookLine(ctx, '☠️☠', 100), 200);
  const layout = e.c.getViralHookLayout(ctx, '😈😬☠️\nAV 😈', 100, 200, true, 16, 'Arial', 900);
  assert.equal(layout.size, 100);
  assert.deepEqual(Array.from(layout.lines), ['😈😬', '☠️', 'AV', '😈']);
  assert.equal(layout.lineHeight, 138);
  for (const line of layout.lines) assert.ok(e.c.measureHookLine(ctx, line, 100) <= 200);
});

test('normal hooks stroke text only and draw original artwork without shadows or tint', async () => {
  const e = environment('AV😈😬☠️'); await e.ready();
  const ctx = canvas(); e.c.drawStudioText(ctx, 'black', 140, 90, 1, false, true, false, .6);
  const artwork = ctx.calls.filter(call => call.kind === 'image');
  assert.equal(artwork.length, 3);
  assert.deepEqual(artwork.map(call => call.image), e.images);
  assert.ok(artwork.every(call => call.height === 59 && call.alpha === .6 && call.composite === 'source-over' && call.shadow === 0 && call.filter === 'none'));
  assert.deepEqual(ctx.calls.filter(call => call.kind === 'stroke').map(call => call.text), ['AV']);
  assert.deepEqual(ctx.calls.filter(call => call.kind === 'fill').map(call => call.text), ['AV']);
  assert.ok(Math.abs(artwork[1].x - artwork[0].x - 68 - (artwork[0].width - artwork[1].width) / 2) < 1e-8);
  assert.equal(e.state.seriesFormat, 'AV😈😬☠️');
});

test('all artwork matches the painted native heart height and top instead of its padded TextMetrics', async () => {
  const metrics = {actualBoundingBoxAscent: 6.53125, actualBoundingBoxDescent: 61.46875};
  const e = environment('⚡🔥👀😭✨❤️🖤💔❌✅😈😬☠️', 'outlined', metrics); await e.ready();
  const preview = canvas(metrics); e.c.drawStudioText(preview, 'black', 140, 90, 1, false, true, false, 1);
  const artwork = preview.calls.filter(call => call.kind === 'image'); assert.equal(artwork.length, 13);
  for (const image of artwork) {
    assert.equal(image.height, 59); assert.equal(image.y, 361);
    assert.ok(Math.abs(image.width / image.height - image.sw / image.sh) < 1e-8);
    assert.ok(e.state._textBoxes.series.y <= image.y);
  }
  const grimace = artwork[11];
  assert.deepEqual([grimace.sx, grimace.sy, grimace.sw, grimace.sh], [4, 4, 152, 153]);
  assert.ok(Math.abs(grimace.width - 59 * 152 / 153) < 1e-8);
  const eye = artwork[2]; assert.ok(eye.width > 68);
  e.c.createStudioTextOverlay({includeWatermark: false});
  const geometry = calls => calls.filter(call => call.kind === 'image').map(({sx, sy, sw, sh, x, y, width, height}) => ({sx, sy, sw, sh, x, y, width, height}));
  assert.deepEqual(geometry(e.overlays[0].context.calls), geometry(preview.calls));
  e.state.textElements.series.y = 0;
  const edge = canvas(metrics); e.c.drawStudioText(edge, 'black', 140, 90, 1, false, true, false, 1);
  assert.ok(edge.calls.filter(call => call.kind === 'image').every(image => image.y >= 40));
  assert.equal(e.state.textElements.series.y, 0);
});

test('preview and 4K overlays use the same emoji geometry including manual lines and edge clamping', async () => {
  const e = environment('First 😈\n😬 ☠️'); e.state.textElements.series.x = 50; e.state.textElements.series.y = 1880;
  await e.ready(); const preview = canvas();
  e.c.drawStudioText(preview, 'black', 140, 90, 1, false, true, false, 1, 700);
  const placement = structuredClone(e.state.textElements.series);
  e.c.createStudioTextOverlay({includeWatermark: false});
  const overlay = e.overlays[0]; assert.equal(overlay.width, 2160); assert.equal(overlay.height, 3840);
  assert.deepEqual(overlay.context.calls.find(call => call.kind === 'transform').args, [2, 0, 0, 2, 0, 0]);
  const geometry = ctx => ctx.calls.filter(call => call.kind === 'image').map(({x, y, width, height}) => ({x, y, width, height}));
  assert.deepEqual(geometry(overlay.context), geometry(preview));
  assert.ok(geometry(preview).every(image => image.x >= 0 && image.x + image.width <= 1080 && image.y + image.height <= 1920));
  assert.deepEqual(e.state.textElements.series, placement);
});

test('scene blend tints text only, mask omits artwork, and emoji-only overlay omits text and bars', async () => {
  const e = environment('AV 😈 😬 ☠️', 'scene_blend'); await e.ready();
  const preview = canvas(); e.c.drawStudioText(preview, 'black', 140, 90, 1, false, true, false, .4);
  assert.equal(preview.calls.filter(call => call.kind === 'image').length, 3);
  assert.ok(preview.calls.filter(call => call.kind === 'image').every(call => call.alpha === .4 && call.composite === 'source-over'));
  e.c.createStudioTextOverlay({includeWatermark: false, hookSceneBlendMask: true});
  assert.equal(e.overlays[0].context.calls.filter(call => call.kind === 'image').length, 0);
  assert.ok(e.overlays[0].context.calls.some(call => call.kind === 'fill'));
  e.c.createStudioTextOverlay({includeWatermark: false, hookEmojiOnly: true});
  const only = e.overlays[1].context.calls;
  assert.equal(only.filter(call => call.kind === 'image').length, 3);
  assert.equal(only.filter(call => ['fill', 'stroke', 'bar'].includes(call.kind)).length, 0);
});

test('white and black hook bars include emoji width without changing the image colours', async () => {
  for (const style of ['white_on_black', 'black_on_white']) {
    const e = environment('😈', style); await e.ready(); const ctx = canvas();
    e.c.drawStudioText(ctx, 'black', 140, 90, 1, false, true, false, 1, 700);
    assert.equal(ctx.calls.filter(call => call.kind === 'image').length, 1);
    assert.ok(ctx.calls.some(call => call.kind === 'bar'));
    assert.equal(ctx.calls.filter(call => call.kind === 'stroke').length, 0);
    assert.ok(e.state._textBoxes.series.width >= 68);
  }
});

test('image failures are actionable and export waits for artwork before creating overlays', async () => {
  const e = environment('😈'); const wait = e.c.ensureHookEmojiLoaded();
  e.images[0].onerror(); await assert.rejects(wait, /Could not load.*Refresh Studio/);
  await assert.rejects(e.c.ensureHookEmojiLoaded(), /Could not load/);
  const exportCode = source.slice(source.indexOf('function setupExport()'), source.indexOf('function loadTemplatesCatalog()'));
  const waitIndex = exportCode.indexOf('await ensureHookEmojiLoaded()');
  assert.ok(waitIndex >= 0 && waitIndex < exportCode.indexOf('studioTextOverlay = createStudioTextOverlay'));
  assert.match(exportCode, /sceneBlendHook && hasFixedHookEmoji\(state.seriesFormat\)[\s\S]*hookEmojiOnly: true/);
});

test('ordinary text needs no image API and missing artwork support fails clearly', async () => {
  const e = environment('ordinary hook'); delete e.c.Image;
  await e.c.ensureHookEmojiLoaded(); assert.equal(e.images.length, 0);
  await assert.rejects(e.c.ensureHookEmojiLoaded('😈'), /Emoji artwork is unavailable/);
});

test('the export action waits for images and refuses to export an artwork load failure', async () => {
  for (const fail of [false, true]) {
    const e = environment('😈', 'scene_blend'), requests = [];
    e.state.videoPath = 'source.mp4';
    e.state.reelName = 'Emoji test';
    e.c.document.getElementById = () => null;
    e.c.commitExportName = value => {e.state.reelName = value; return true;};
    Object.assign(e.c, {imageDurationTimer: null, imageDurationRequest: null, imageDurationRunning: false});
    const node = () => ({classList: {add() {}, remove() {}}, style: {}, addEventListener(name, handler) {this[name] = handler;}});
    for (const key of ['exportModal', 'exportCompleteBox', 'exportProgressBar', 'exportPercentage', 'exportStatusLabel', 'btnExportQuick']) e.c.el[key] = node();
    e.c.window = {addEventListener() {}}; e.c.getBorderShape = () => 'straight';
    e.c.fetch = async (url, options) => {requests.push({url, options}); return {ok: false, json: async () => ({detail: 'Test request received'})};};
    const code = source.slice(source.indexOf('function setupExport()'), source.indexOf('// SETTINGS & HISTORY'));
    vm.runInContext(code, e.c); e.c.setupExport();
    const exporting = e.c.el.btnExportQuick.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(e.images.length, 1); assert.equal(e.overlays.length, 0); assert.equal(requests.length, 0);
    if (fail) e.images[0].onerror(); else e.images[0].onload();
    await exporting;
    if (fail) {
      assert.equal(e.overlays.length, 0); assert.equal(requests.length, 0);
      assert.match(e.c.el.exportStatusLabel.textContent, /Export failed: Could not load/);
    } else {
      assert.equal(e.overlays.length, 3); assert.equal(requests.length, 1);
      const payload = JSON.parse(requests[0].options.body);
      assert.equal(payload.template.studio_hook_overlay, 'data:image/png;base64,test');
      assert.equal(payload.template.studio_hook_scene_mask, 'data:image/png;base64,test');
    }
  }
});

test('burning heart is one complete emoji with matching preview and export artwork', async () => {
  const e = environment('❤️‍🔥❤‍🔥❤️🔥'); await e.ready();
  assert.deepEqual(Array.from(e.c.getHookEmojiRuns(e.state.seriesFormat), run => run.emoji),
    ['2764-fe0f-200d-1f525','2764-fe0f-200d-1f525','2764','1f525']);
  assert.equal(e.images.length,3);
  const ctx = canvas(); e.c.drawStudioText(ctx,'black',140,90,1,false,true,false,1);
  const artwork = ctx.calls.filter(call => call.kind==='image');
  assert.equal(artwork.length,4);
  assert.equal(artwork[0].image,artwork[1].image);
  assert.deepEqual([artwork[0].sx,artwork[0].sy,artwork[0].sw,artwork[0].sh],[5,13,151,138]);
  assert.equal(artwork[0].height,59);
  e.c.createStudioTextOverlay({includeWatermark:false});
  const geometry = calls => calls.filter(c=>c.kind==='image').map(({sx,sy,sw,sh,x,y,width,height})=>({sx,sy,sw,sh,x,y,width,height}));
  assert.deepEqual(geometry(e.overlays[0].context.calls),geometry(ctx.calls));
  const html=fs.readFileSync(path.join(__dirname,'../app/static/index.html'),'utf8');
  assert.match(html,/data-hook-emoji="❤️‍🔥"/);
});
