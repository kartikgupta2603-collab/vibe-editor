const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/static/app.js'), 'utf8').replace(/\r\n/g, '\n');

function pickerContext(fetch) {
  function element() {
    return { value: '', disabled: false, children: [], style: {}, classList: { add() {}, remove() {} },
      addEventListener(name, callback) { this[name] = callback; },
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      dispatchEvent(event) { if (this[event.type]) this[event.type]({target: this, type: event.type}); },
      click() { return this['click-handler'] ? this['click-handler']() : this.clickCallback(); }
    };
  }
  const picker = element();
  const elements = new Proxy({}, {get(target, key) { return target[key] ||= element(); }});
  elements.btnYtDownload.addEventListener = function(name, callback) { this['click-handler'] = callback; };
  elements.inputYtUrl.value = 'https://x.com/creator/status/123';
  const context = { el: elements, document: { getElementById: () => picker, createElement: element },
    fetch, URL, Event, state: {sourceGeneration: 1}, localStorage: {setItem() {}, removeItem() {}}, saveProjectState() {},
    showToast() {}, setInterval() {}, clearInterval() {}, setTimeout() {} };
  vm.createContext(context);
  const start = source.indexOf('  // YouTube URL input auto-save');
  const end = source.indexOf('\n}\n', start);
  vm.runInContext(source.slice(start, end), context);
  return { context, picker, elements };
}

test('multi-video post waits for choice and downloads only the chosen URL', async () => {
  const calls = [];
  const videos = [1, 2].map(index => ({index, title: `Video ${index}`, duration: index * 30,
    url: `https://x.com/creator/status/123/video/${index}`}));
  const c = pickerContext(async (url, options) => {
    calls.push({url, body: JSON.parse(options.body)});
    return {ok: true, json: async () => url === '/api/media/detect' ? {media_type: 'video', videos} : {task_id: 'selected'}};
  });
  await c.elements.btnYtDownload.click();
  assert.equal(calls.length, 1);
  assert.equal(c.picker.children.length, 3);
  assert.equal(c.picker.children[2].children[0].textContent, 'Download video 2 · 1:00');
  // Choice buttons store the DOM listener under click; call it directly.
  c.picker.children[2].click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, '/api/youtube/download');
  assert.equal(calls[2].body.url, videos[1].url);
  assert.equal(c.elements.inputYtUrl.value, videos[1].url);
});

test('late video list cannot replace a newly pasted post', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const c = pickerContext(() => response);
  const pending = c.elements.btnYtDownload.click();
  c.elements.inputYtUrl.value = 'https://x.com/other/status/456';
  release({ok: true, json: async () => ({videos: [{index: 1}, {index: 2}]})});
  await pending;
  assert.equal(c.picker.children.length, 0);
  assert.equal(c.elements.btnYtDownload.disabled, false);
});
