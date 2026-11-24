import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { stripVTControlCharacters } from 'node:util';
import { resolvePiRoot } from './test-support.mjs';
const root = resolvePiRoot(), require = createRequire(root + '/package.json');
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-coding-agent': root + '/dist/index.js', '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui') } });
const { registerPromptBorders } = await jiti.import('./prompt-borders.ts');
const { defaults, validateSetting } = await jiti.import('./settings.ts');
const { UserMessageComponent } = await import(root + '/dist/index.js');
const { visibleWidth } = await import(require.resolve('@earendil-works/pi-tui'));
const { setTheme, stopThemeWatcher, theme } = await import(root + '/dist/modes/interactive/theme/theme.js');
assert.equal(setTheme('dark', false).success, true); stopThemeWatcher();
const native = UserMessageComponent.prototype.render;
const events = {};
let settings = { ...defaults };
registerPromptBorders({ on: (event, fn) => { events[event] = fn; } }, () => settings);
const context = { mode: 'tui', ui: { theme } };
events.session_start({}, context);
assert.notStrictEqual(UserMessageComponent.prototype.render, native);
for (const padding of [0, 1, 2, 3]) {
 settings.padding = padding;
 const component = new UserMessageComponent('Sample prompt 日本語\n\n**Important text**');
 for (const width of [10, 40, 80, 120]) {
  const lines = component.render(width);
  assert.ok(lines.some(line => line.includes('╭')));
  assert.ok(lines.some(line => line.includes('╰')));
  for (const line of lines) assert.ok(visibleWidth(line) <= width, `overflow ${width}`);
  if (width >= 40) {
   const top = stripVTControlCharacters(lines.find(line => line.includes('╭')));
   assert.equal(top.indexOf('╭'), padding);
   assert.equal(top.indexOf('╮'), width - padding - 1);
  }
  assert.strictEqual(component.render(width), lines);
 }
 const output = component.render(80).join('\n');
 assert.ok(stripVTControlCharacters(output).includes('Sample prompt 日本語'));
 assert.ok(output.includes('\x1b[38;2;95;146;155m'));
 assert.ok(output.includes('\x1b[48;'), 'native user background lost');
 assert.ok(output.includes('\x1b]133;A'), 'native message zone lost');
}
// The native user background must cover both inner margins and the blank
// rows up to the cyan border, while outside gutters remain unfilled.
settings.padding = 1;
const spacingLines = new UserMessageComponent('X', undefined, 1).render(80);
const plain = spacingLines.map(stripVTControlCharacters);
const textIndex = plain.findIndex(line => line.includes('X'));
const topIndex = plain.findIndex(line => line.includes('╭'));
const bottomIndex = plain.findIndex(line => line.includes('╰'));
assert.equal(textIndex - topIndex - 1, 0, 'no full blank row above the message');
assert.equal(bottomIndex - textIndex - 1, 0, 'no full blank row below the message');
assert.equal(spacingLines.length, 3, 'single-line prompt has only border/content/border rows');
assert.ok(spacingLines[0].includes('\x1b]133;A\x07'));
assert.ok(spacingLines.at(-1).includes('\x1b]133;B\x07'));
assert.ok(spacingLines.at(-1).includes('\x1b]133;C\x07'));
const paragraphLines = new UserMessageComponent('First\n\nSecond').render(80).map(stripVTControlCharacters);
const firstIndex = paragraphLines.findIndex(line => line.includes('First'));
const secondIndex = paragraphLines.findIndex(line => line.includes('Second'));
assert.ok(secondIndex - firstIndex > 1, 'preserve intentional spacing within the message');
assert.equal(topIndex, 0, 'no extra outer row above outline');
assert.equal(plain.length - bottomIndex - 1, 0, 'no extra outer row below outline');
assert.equal(plain[topIndex].indexOf('╭'), 1, 'left border aligns with the shared one-column gutter');
assert.equal(plain[topIndex].indexOf('╮'), 78, 'right border aligns with other panels');
assert.equal(plain[textIndex].indexOf('X') - plain[textIndex].indexOf('│') - 1, 2, 'two inner columns');
// Check actual background state at every ASCII cell, including border glyphs.
// A horizontal glyph only covers part of its cell, so its background must be
// blue too; testing only the body padding missed the visible dark rim.
function backgroundCells(line) {
 const cells = [];
 let background = false;
 const text = line.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '');
 for (const match of text.matchAll(/\x1b\[([0-9;]*)m|([^\x1b])/gu)) {
  if (match[1] !== undefined) {
   const first = Number((match[1] || '0').split(';')[0]);
   if (first === 0 || first === 49) background = false;
   if (first === 48 || (first >= 40 && first <= 47) || (first >= 100 && first <= 107)) background = true;
  } else cells.push({ text: match[2], background });
 }
 return cells;
}
for (const line of spacingLines) {
 const cells = backgroundCells(line);
 assert.equal(cells.length, 80);
 assert.equal(cells[0].background, false, 'left outer gutter must stay unfilled');
 assert.equal(cells.at(-1).background, false, 'right outer gutter must stay unfilled');
 assert.ok(cells.slice(1, -1).every(cell => cell.background), 'message fill must reach every border cell without a dark gap');
}
const component = new UserMessageComponent('test');
settings.promptBorders = false;
assert.ok(!component.render(80).some(line => line.includes('╭')));
settings.promptBorders = true;
settings.promptBorderColor = '#ABCDEF';
assert.ok(component.render(80).some(line => line.includes('\x1b[38;2;171;205;239m')));
settings.promptBorderColor = 'accent';
assert.ok(component.render(80).some(line => line.includes('╭')));
assert.equal(validateSetting('promptBorders', false), true);
assert.equal(validateSetting('promptBorderColor', '#ABCDEF'), true);
assert.equal(validateSetting('promptBorderColor', 'not-a-color'), false);
events.session_shutdown();
assert.strictEqual(UserMessageComponent.prototype.render, native);
settings.enabled = false;
events.session_start({}, context);
assert.strictEqual(UserMessageComponent.prototype.render, native);
settings.enabled = true;
events.session_start({}, { ...context, mode: 'rpc' });
assert.strictEqual(UserMessageComponent.prototype.render, native);
// Repeated replacement/reload must never stack borders.
for (let i = 0; i < 3; i++) {
 events.session_start({}, context);
 assert.equal(new UserMessageComponent('text').render(80).filter(line => line.includes('╭')).length, 1);
 events.session_shutdown();
 assert.strictEqual(UserMessageComponent.prototype.render, native);
}
console.log('PASS: prompt borders preserve background/Markdown/Unicode/zones, width/cache, settings and reset/reload lifecycle');
