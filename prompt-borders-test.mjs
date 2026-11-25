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
let hostPadding = 1;
registerPromptBorders({ on: (event, fn) => { events[event] = fn; }, getSettings: () => ({ outputPad: hostPadding }) }, () => settings);
const context = { mode: 'tui', ui: { theme } };
events.session_start({}, context);
assert.equal(settings.promptStyle, 'right');
const rightPrompt = new UserMessageComponent('Sample 日本語\n\nSecond paragraph');
for (const width of [8, 12, 40, 80]) {
 const rows = rightPrompt.render(width).map(stripVTControlCharacters);
 assert.ok(rows.every(line => line.endsWith('▉') && visibleWidth(line) === width));
 assert.ok(!rows.some(line => /[╭╰]/.test(line)));
 if (width >= 40) assert.ok(rows.some(line => line.includes('You: Sample 日本語')));
}
assert.equal(rightPrompt.render(80).length, native.call(rightPrompt, 74).length);
settings.promptStyle = 'outline';
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
// Check actual background state: blue belongs only to the interior, never
// to border cells or outer gutters. Otherwise a blue halo surrounds the line.
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
for (const [row, line] of spacingLines.entries()) {
 const cells = backgroundCells(line);
 assert.equal(cells.length, 80);
 assert.equal(cells[0].background, false, 'left outer gutter must stay unfilled');
 assert.equal(cells.at(-1).background, false, 'right outer gutter must stay unfilled');
 assert.equal(cells[1].background, false, 'left border must not carry blue background');
 assert.equal(cells.at(-2).background, false, 'right border must not carry blue background');
 if (row === 0 || row === spacingLines.length - 1) {
  assert.ok(cells.every(cell => !cell.background), 'horizontal border must not carry blue background');
 } else {
  assert.ok(cells.slice(2, -2).every(cell => cell.background), 'interior must retain original background');
 }
}
settings.promptStyle = 'accent';
const panel = new UserMessageComponent('Accent preview 日本語');
for (const width of [10, 40, 80, 120]) {
 const rows = panel.render(width);
 assert.ok(rows.every(line => line.includes('▎')));
 assert.ok(rows.every(line => !/[╭╮╰╯│]/u.test(stripVTControlCharacters(line))));
 assert.strictEqual(panel.render(width), rows);
 for (const row of rows) assert.ok(visibleWidth(row) <= width);
}
const panelRows = new UserMessageComponent('X').render(80);
assert.equal(panelRows.length, 3);
const panelText = panelRows.map(stripVTControlCharacters);
assert.ok(!panelText[0].includes('You'), 'no separate label row');
assert.ok(panelText[1].includes('You: X'), 'label and text appear on one line');
const identityPanel = new UserMessageComponent('Message content');
const originalIdentityRows = identityPanel.render(80);
settings.promptLabel = 'Jane Doe';
const namedRows = identityPanel.render(80);
assert.notStrictEqual(namedRows, originalIdentityRows);
assert.ok(stripVTControlCharacters(namedRows[1]).includes('Jane Doe: Message content'));
assert.equal(namedRows.length, 3, 'inline label must not add a header row');
settings.promptLabel = '';
assert.ok(!identityPanel.render(80).join('').includes('Jane Doe'));
assert.ok(stripVTControlCharacters(identityPanel.render(80)[1]).includes('Message content'));
settings.promptLabel = '名前'.repeat(20);
for (const width of [10, 40, 80]) for (const row of identityPanel.render(width)) assert.ok(visibleWidth(row) <= width);
settings.promptLabel = 'You';
hostPadding = 0;
const zeroPadText = new UserMessageComponent('X', undefined, 0).render(80).map(stripVTControlCharacters);
assert.ok(zeroPadText[1].includes('You: X'));
const wrapped = new UserMessageComponent(Array(30).fill('word').join(' ')).render(40).map(stripVTControlCharacters);
const firstWrapped = wrapped.find(line => line.includes('You:'));
const textStart = firstWrapped.indexOf('word');
for (const row of wrapped.filter(line => line.includes('word'))) assert.equal(row.indexOf('word'), textStart, 'wrapped prompt text must align');
assert.equal(wrapped.filter(row => row.includes('You:')).length, 1, 'show the label once');
hostPadding = 1;
assert.equal(validateSetting('promptLabel', ''), true);
assert.equal(validateSetting('promptLabel', 'Jane Doe'), true);
assert.equal(validateSetting('promptLabel', '\x1b[31mName'), false);
assert.equal(validateSetting('promptLabel', 'a'.repeat(61)), false);
for (const line of panelRows) {
 const cells = backgroundCells(line);
 assert.equal(cells.length, 80);
 assert.ok(cells.slice(1, -1).every(cell => cell.background), 'solid panel must be filled, including accent cell');
 assert.equal(cells[0].background, false);
 assert.equal(cells.at(-1).background, false);
}
assert.ok(panelRows.join('').includes('\x1b]133;A'));
assert.equal(validateSetting('promptStyle', 'accent'), true);
assert.equal(validateSetting('promptStyle', 'invalid'), false);
settings.promptStyle = 'outline';
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
