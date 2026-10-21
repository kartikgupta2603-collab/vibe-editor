const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const moduleSource = fs.readFileSync('app/static/color-profiles.js', 'utf8');
const appSource = fs.readFileSync('app/static/app.js', 'utf8');
const shared = JSON.parse(fs.readFileSync('app/static/color-profiles.json', 'utf8'));

function setup(response = {ok: true, json: async () => shared}) {
  const nodes = [], calls = [];
  function element(tag) {
    const node = {tag, attributes: {}, children: [], style: {},
      setAttribute(name, value) {this.attributes[name] = value;},
      appendChild(child) {this.children.push(child); child.parent = this;},
      remove() {this.parent.children = this.parent.children.filter(child => child !== this);}};
    nodes.push(node);
    return node;
  }
  const body = element('body');
  const context = {window: {}, document: {body, createElementNS: (ns, tag) => element(tag)},
    fetch: async (...args) => {calls.push(args); return response;}};
  vm.createContext(context);
  vm.runInContext(moduleSource, context);
  return {context, api: context.window.VibeColorProfiles, calls, nodes};
}

test('configuration is fetched once and shared by concurrent initialization', async () => {
  const e = setup();
  const first = e.api.load();
  assert.equal(first, e.api.load());
  await first;
  assert.equal(e.calls.length, 1);
  assert.equal(e.calls[0][0], '/color-profiles.json');
  assert.equal(e.calls[0][1].cache, 'no-store');
  assert.equal(e.api.isAvailable('intel_custom'), true);
});

test('SVG uses exact clamped 8-bit RGB tables then sRGB saturation, cached per strength', async () => {
  const e = setup(); await e.api.load();
  const css = e.api.filterCss('intel_custom', 100);
  assert.match(css, /^url\(#vibe-rgb-/);
  const count = e.nodes.length;
  assert.equal(e.api.filterCss('intel_custom', 100), css);
  assert.equal(e.nodes.length, count, 'playback must not rewrite SVG definitions each frame');
  const filter = e.nodes.find(node => node.tag === 'filter');
  assert.equal(filter.attributes['color-interpolation-filters'], 'sRGB');
  for (const [index, channel] of ['R', 'G', 'B'].entries()) {
    const row = e.nodes.find(node => node.tag === `feFunc${channel}`);
    assert.equal(row.attributes.type, 'discrete');
    const values = row.attributes.tableValues.split(' ').map(Number);
    assert.equal(values.length, 256);
    for (let value = 0; value < 256; value++) {
      const expected = Math.min(255, Math.max(0,
        Math.floor((shared.intel_custom.rgb_slope[index] * value / 255 + shared.intel_custom.rgb_offset[index]) * 255 + .5)));
      assert.equal(Math.floor(values[value] * 255 + 1e-9), expected);
      assert.ok(values[value] * 255 - expected < .011, 'only sub-byte precision padding is permitted');
    }
  }
  assert.equal(Number(e.nodes.find(node => node.tag === 'feColorMatrix').attributes.values.split(' ')[0]), 1.3935);
});

test('zero strength is identity; half strength interpolates the same RGB and saturation coefficients', async () => {
  const e = setup(); await e.api.load();
  assert.equal(e.api.filterCss('intel_custom', 0), 'none');
  assert.equal(e.nodes.length, 1, 'zero strength needs no SVG');
  e.api.filterCss('intel_custom', 50);
  assert.equal(Number(e.nodes.find(node => node.tag === 'feColorMatrix').attributes.values.split(' ')[0]), 1.19675);
  const red = e.nodes.find(node => node.tag === 'feFuncR').attributes.tableValues.split(' ').map(Number);
  const expected = Math.floor(((1 + .5 * (.92 - 1)) * 128 / 255 + .5 * -.04) * 255 + .5);
  assert.equal(Math.round(red[128] * 255), expected);
});

test('custom profile accepts 2x through 4x instead of clamping to 1x', async () => {
  const e = setup(); await e.api.load();
  const css = [100, 200, 300, 400].map(value => e.api.filterCss('intel_custom', value));
  assert.equal(new Set(css).size, 4);
  const matrices = e.nodes.filter(node => node.tag === 'feColorMatrix');
  assert.equal(Number(matrices.at(-1).attributes.values.split(' ')[0]), 2.574);
  assert.equal(e.api.filterCss('intel_custom', 900), css.at(-1));
});

test('strength presets and slider share state, selection, redraw and saved values', () => {
  const buttons = [50,100,200,300].map(value => ({dataset: {filterStrength: String(value)},
    setAttribute(key,value) {this[key] = value;}}));
  let saves = 0, renders = 0;
  const c = {state: {filterIntensity: 300}, el: {sliderFilterIntensity: {}, valFilterIntensity: {}},
    document: {querySelectorAll: () => buttons}, saveProjectState() {saves++;}, renderReel() {renders++;}};
  vm.createContext(c);
  vm.runInContext(appSource.slice(appSource.indexOf('function syncFilterStrengthUI()'), appSource.indexOf('function setupVideoFilters()')), c);
  c.syncFilterStrengthUI();
  assert.equal(c.el.sliderFilterIntensity.value, 300);
  assert.equal(buttons[3]['aria-pressed'], 'true');
  for (const value of [50,100,200,300,175]) {
    c.setFilterStrength(value);
    assert.equal(c.state.filterIntensity, value);
    assert.equal(c.el.sliderFilterIntensity.value, value);
    assert.equal(c.el.valFilterIntensity.textContent, `${value}%`);
    assert.equal(buttons.filter(button => button['aria-pressed'] === 'true').length, value === 175 ? 0 : 1);
  }
  assert.equal(saves, 5); assert.equal(renders, 5);
  const html = fs.readFileSync('app/static/index.html', 'utf8');
  assert.match(html, /id="slider-filter-intensity" min="0" max="400"/);
  for (const value of [50,100,200,300]) assert.match(html, new RegExp(`data-filter-strength="${value}"`));
  assert.doesNotMatch(html, /data-filter-strength="400"/);
});

test('failed or malformed settings remain unavailable and expose an actionable error', async () => {
  for (const response of [{ok: false, status: 503}, {ok: true, json: async () => ({intel_custom: {id: 'intel_custom'}})}]) {
    const e = setup(response);
    await assert.rejects(e.api.load(), /Custom RGB could not load/);
    assert.equal(e.api.isAvailable('intel_custom'), false);
    assert.match(e.api.error.message, /Refresh Vibe Editor/);
    assert.throws(() => e.api.filterCss('intel_custom'), /Custom RGB could not load/);
    await assert.rejects(e.api.load());
    assert.equal(e.calls.length, 1, 'failure must not repeatedly fetch during rendering');
  }
});

test('new preset keeps manual adjustments in one sRGB pipeline while other filters retain their behavior', async () => {
  const e = setup(); await e.api.load();
  e.context.state = {colorFilter: 'intel_custom', filterIntensity: 100,
    colorAdjustments: {brightness: 10, contrast: 110, saturation: 120, warmth: 0}};
  vm.runInContext(appSource.slice(appSource.indexOf('const VIDEO_FILTERS ='), appSource.indexOf('const ctx = el.reelCanvas')), e.context);
  assert.match(e.context.computeVideoFilterCss(), /^url\(#vibe-rgb-/);
  const filter = e.nodes.find(node => node.tag === 'filter');
  assert.deepEqual(filter.children.map(node => node.tag), ['feComponentTransfer', 'feComponentTransfer', 'feColorMatrix', 'feComponentTransfer', 'feColorMatrix']);
  const brightnessTable = filter.children[0].children[0].attributes.tableValues.split(' ').map(Number);
  const contrastTable = filter.children[1].children[0].attributes.tableValues.split(' ').map(Number);
  assert.equal(Math.round(brightnessTable[128] * 255), 141);
  assert.equal(Math.round(contrastTable[128] * 255), 128);
  e.context.state.filterIntensity = 0;
  assert.match(e.context.computeVideoFilterCss(), /^url\(#vibe-rgb-/);
  e.context.state.colorFilter = 'original';
  assert.equal(e.context.computeVideoFilterCss(), 'brightness(1.100) contrast(1.100) saturate(1.200)');
  e.context.state.colorFilter = 'clarendon'; e.context.state.filterIntensity = 100;
  assert.equal(e.context.computeVideoFilterCss(), 'brightness(1.150) contrast(1.320) saturate(1.500)');
});

test('manual warmth, saturation and strength each affect the cache and preserve backend stage order', async () => {
  const e = setup(); await e.api.load();
  const adjustments = {brightness: 10, contrast: 120, saturation: 110, warmth: 10};
  const css = e.api.filterCss('intel_custom', 50, adjustments);
  const filter = e.nodes.find(node => node.tag === 'filter');
  assert.deepEqual(filter.children.map(node => node.tag), [
    'feComponentTransfer', 'feComponentTransfer', 'feColorMatrix', 'feColorMatrix', 'feColorMatrix', 'feComponentTransfer', 'feColorMatrix'
  ]);
  assert.equal(e.api.filterCss('intel_custom', 50, {...adjustments}), css);
  assert.notEqual(e.api.filterCss('intel_custom', 50, {...adjustments, warmth: -10}), css);
  assert.notEqual(e.api.filterCss('intel_custom', 50, {...adjustments, saturation: 120}), css);
  assert.notEqual(e.api.filterCss('intel_custom', 100, adjustments), css);
  for (let value = 0; value < 70; value++) e.api.filterCss('intel_custom', 50, {...adjustments, brightness: value});
  assert.equal(e.nodes.find(node => node.tag === 'defs').children.length, 64, 'cache cannot accumulate SVG nodes indefinitely');
  assert.match(e.api.filterCss('intel_custom', 50, adjustments), /^url\(#vibe-rgb-/);
});

test('profile load completes before filter setup and saved project restoration; saved identifier is preserved', () => {
  const init = appSource.slice(appSource.indexOf('window.addEventListener("DOMContentLoaded"'));
  assert.ok(init.indexOf('await window.VibeColorProfiles.load()') < init.indexOf('setupVideoFilters()'));
  assert.ok(init.indexOf('await window.VibeColorProfiles.load()') < init.indexOf('await restoreProjectState()'));
  assert.match(appSource, /if \(project\.colorFilter\) \{\s*state\.colorFilter = project\.colorFilter;/);
  assert.match(init, /Your saved Custom RGB filter is unavailable/);
  assert.match(fs.readFileSync('app/static/index.html', 'utf8'), /color-profiles\.js[^\n]+\n\s*<script src="\/app\.js/);
});

test('failed custom profile prevents export before any upload or render starts', async () => {
  let toast = '';
  const elements = {};
  const c = {state: {colorFilter: 'intel_custom'}, window: {addEventListener() {}, VibeColorProfiles: {isAvailable: () => false}},
    el: new Proxy(elements, {get(target, key) {return target[key] ||= {addEventListener(event, handler) {this[event] = handler;}};}}),
    showToast: message => {toast = message;}};
  vm.createContext(c);
  const start = appSource.indexOf('function setupExport()');
  vm.runInContext(appSource.slice(start, appSource.indexOf('// SETTINGS & HISTORY', start)), c);
  c.setupExport(); await c.el.btnExportMain.click();
  assert.match(toast, /Custom RGB could not load.*before exporting/);
});
