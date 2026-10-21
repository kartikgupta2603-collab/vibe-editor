const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'app/static/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app/static/app.js'), 'utf8');

test('Studio offers selected font families for hook, username, and subtitles', () => {
  assert.match(page, /id="select-hook-font"[\s\S]*Impact — anime edit[\s\S]*Franklin Gothic Heavy — punchy[\s\S]*Haettenschweiler — ultra condensed/);
  assert.match(page, /id="select-watermark-font"[\s\S]*Bahnschrift — modern[\s\S]*Tw Cen MT Condensed — compact[\s\S]*Cooper Black — playful/);
  assert.match(page, /id="select-subtitle-font"[\s\S]*Segoe UI — clean[\s\S]*Franklin Gothic Heavy — punchy[\s\S]*Verdana — maximum clarity/);
});

test('selected fonts persist and the subtitle font is sent to export', () => {
  assert.match(app, /hookFont: state\.hookFont \|\| "impact"/);
  assert.match(app, /subtitleFont: state\.subtitleFont \|\| "segoe"/);
  assert.match(app, /subtitle_font: state\.subtitleFont \|\| "segoe"/);
  assert.match(app, /watermark\.font = FONT_STACKS\[watermarkFont\.value\]/);
});
