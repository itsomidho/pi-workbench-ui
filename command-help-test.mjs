import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolvePiRoot } from './test-support.mjs';
const root = resolvePiRoot(), require = createRequire(root + '/package.json');
const jiti = require('jiti').createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui') } });
const { commandCatalog, searchCommands, commandDraft, commandHelpText, uiCommandCompletions, commandDetails, CommandPalette, openCommandHelp } = await jiti.import('./command-help.ts');
const { visibleWidth } = await import(require.resolve('@earendil-works/pi-tui'));
assert.equal(new Set(commandCatalog.map(entry => entry.command)).size, commandCatalog.length);
assert.deepEqual([...new Set(commandCatalog.map(entry => entry.group))], ['UI', 'TODOs', 'Task usage', 'Settings']);
assert.deepEqual(searchCommands('todos earlier').map(entry => entry.command), ['/todos up']);
assert.deepEqual(searchCommands('WORKING TREE DIFFS').map(entry => entry.command), ['/ui changes']);
assert.equal(searchCommands('no-matches').length, 0);
assert.equal(commandDraft(searchCommands('/ui set <key>')[0]), '/ui set ');
assert.equal(commandDraft(searchCommands('<run-id>')[0]), '/task-usage workbench ');
assert.deepEqual(uiCommandCompletions('he').map(item => item.value), ['help']);
assert.equal(uiCommandCompletions('x').length, 0);
assert.match(commandHelpText(), /Task usage · \/task-usage start <name>/);
const tui = { terminal: { rows: 40, columns: 100 }, requestRender() {} };
const theme = { fg: (_color, text) => text };
const keys = { matches: (data, action) => data === action };
let accepted = [];
const palette = new CommandPalette(tui, theme, keys, value => accepted.push(value));
assert.match(palette.render(100).join('\n'), /Workbench UI commands.*\n.*Search: /);
assert.match(palette.render(100).join('\n'), /TODOs.*\n.*\/todos/);
for (const key of 'nonesuch') palette.handleInput(key);
assert.match(palette.render(100).join('\n'), /No matching commands/);
palette.handleInput('tui.select.confirm'); assert.deepEqual(accepted, []);
palette.handleInput('\x1b'); palette.handleInput('\x1b'); assert.deepEqual(accepted, [undefined]);
const filter = new CommandPalette(tui, theme, keys, value => accepted.push(value));
for (const key of 'task-usage start') filter.handleInput(key);
assert.match(filter.render(80).join('\n'), /\/task-usage start <name>/);
filter.handleInput('tui.select.confirm'); assert.deepEqual(accepted, [undefined, '/task-usage start ']);
const layout = new CommandPalette(tui, theme, keys, () => {});
for (const cols of [0, 1, 4, 18, 40, 80, 120]) for (const rows of [3, 8, 15, 30]) {
  tui.terminal.rows = rows;
  layout.handleInput('tui.select.pageDown');
  const lines = layout.render(cols);
  assert.ok(lines.length <= Math.max(1, Math.floor(rows * .8)), 'height ' + rows);
  assert.ok(lines.every(row => visibleWidth(row) <= cols), 'width ' + cols);
}
const scroll = new CommandPalette(tui, theme, keys, value => accepted.push(value));
scroll.handleInput('tui.select.down'); scroll.handleInput('tui.select.confirm'); assert.equal(accepted.at(-1), '/ui settings');
let draft = '', picked = '/ui reset', notifications = [], overlay = 0, insertions = 0;
const ctx = { mode: 'tui', ui: {
  getEditorText: () => draft,
  setEditorText: value => { draft = value; insertions++; },
  notify: message => notifications.push(message),
  custom: async (_factory, options) => { assert.equal(options.overlay, true); overlay++; return picked; },
} };
await openCommandHelp(ctx, true); assert.equal(draft, '/ui reset'); assert.equal(insertions, 1);
draft = 'keep my text'; picked = '/ui enable'; await openCommandHelp(ctx, true);
assert.equal(draft, 'keep my text'); assert.equal(insertions, 1); assert.match(notifications.at(-1), /wasn’t replaced/);
picked = undefined; await openCommandHelp(ctx, true); assert.equal(insertions, 1);
await openCommandHelp({ ...ctx, mode: 'rpc' }, true); assert.match(notifications.at(-1), /\/ui settings/); assert.equal(overlay, 3);
await openCommandHelp(ctx, false); assert.match(notifications.at(-1), /\/ui help/); assert.equal(overlay, 3);
const { defaults, settingDefinitions, settingKeys, validateSetting, allowedSettingValues } = await jiti.import('./settings.ts');
assert.deepEqual([...settingKeys].sort(), Object.keys(defaults).sort());
for (const key of settingKeys) {
  const entries = searchCommands(key).filter(entry => entry.setting === key);
  assert.equal(entries.length, 1, key);
  const entry = entries[0], definition = settingDefinitions[key];
  assert.ok(validateSetting(key, defaults[key]), key + ' default');
  assert.ok(validateSetting(key, definition.example), key + ' example');
  assert.ok(allowedSettingValues(key).length);
  assert.ok(commandDetails(entry).some(line => line.startsWith('Allowed:')));
  assert.ok(commandDetails(entry).some(line => line.startsWith('Current:')));
  const value = JSON.parse(commandDraft(entry).slice(('/ui set ' + key + ' ').length));
  assert.ok(validateSetting(key, value), key + ' draft parses');
}
for (const [key, values] of Object.entries({
  enabled: ['true', 1, null], padding: [-1, 4, 1.5, '1'], previewLines: [2, 101],
  promptStyle: ['native', false], promptLabel: ['x'.repeat(61), '\u001b'],
  promptBorderColor: ['#fff', '#gggggg'], footer: ['full'], successColor: ['#ffffff'],
  missing: [true], toString: ['x'],
})) for (const value of values) assert.equal(validateSetting(key, value), false, key);
assert.equal(validateSetting('__proto__', 'x'), false);
for (const key of settingKeys) {
  const definition = settingDefinitions[key];
  if (definition.kind === 'enum') for (const value of definition.values) assert.ok(validateSetting(key, value));
  if (definition.kind === 'integer') {
    assert.ok(validateSetting(key, definition.min));
    assert.ok(validateSetting(key, definition.max));
    assert.equal(validateSetting(key, definition.min - 1), false);
    assert.equal(validateSetting(key, definition.max + 1), false);
  }
  if (definition.kind === 'boolean') {
    assert.ok(validateSetting(key, true));
    assert.ok(validateSetting(key, false));
  }
  if (definition.kind === 'color') for (const color of ['borderMuted', 'muted', 'dim', 'accent', 'warning', 'success', 'error']) assert.ok(validateSetting(key, color));
}
assert.ok(validateSetting('footer', ['compact']), 'preserve saved footer coercion');
assert.ok(validateSetting('successColor', ['success']), 'preserve saved color coercion');
assert.ok(validateSetting('promptLabel', ''));
assert.ok(validateSetting('promptLabel', 'نام من'));
assert.ok(validateSetting('promptBorderColor', '#aBc123'));
assert.equal(commandDraft(searchCommands('promptLabel')[0]), '/ui set promptLabel ""');
assert.ok(searchCommands('outline').some(entry => entry.setting === 'promptStyle'));
assert.match(commandHelpText({ ...defaults, promptStyle: 'accent' }), /Current: "accent" · Default: "right"/);
assert.match(commandHelpText(), /saved settings are kept, not factory-reset/);
assert.match(commandHelpText(), /PageUp\/PageDown/);
assert.equal(searchCommands('Alt+K')[0].command, '/todos up');
assert.equal(searchCommands('Alt+J')[0].command, '/todos down');
const settingsPalette = new CommandPalette(tui, theme, keys, value => accepted.push(value), { ...defaults, promptStyle: 'outline' });
for (const key of 'promptStyle') settingsPalette.handleInput(key);
tui.terminal.rows = 40;
const reference = settingsPalette.render(100).join('\n');
assert.match(reference, /Current: "outline" · Default: "right"/);
assert.match(reference, /Allowed: right \/ outline \/ accent/);
settingsPalette.handleInput('tui.select.confirm');
assert.equal(accepted.at(-1), '/ui set promptStyle "accent"');
for (const key of settingKeys) {
  const p = new CommandPalette(tui, theme, keys, () => {});
  for (const char of key) p.handleInput(char);
  for (const cols of [18, 40, 80, 120]) for (const rows of [3, 8, 15, 30]) {
    tui.terminal.rows = rows;
    const lines = p.render(cols);
    assert.ok(lines.length <= Math.max(1, Math.floor(rows * .8)), key + ' height');
    assert.ok(lines.every(line => visibleWidth(line) <= cols), key + ' width');
  }
}
picked = '/ui set promptStyle "accent"'; draft = '';
await openCommandHelp(ctx, true, { ...defaults, promptStyle: 'right' });
assert.equal(draft, picked);
assert.equal(insertions, 2);
// These descriptions were clipped in the reported screenshot. Verify the
// rendered list itself includes the tail, not a duplicate in the detail area.
const compactText = lines => lines.map(line => line.replace(/^[│ ]+|[│ ]+$/g, '')).join('').replace(/\s/g, '');
for (const entry of commandCatalog) {
  for (const cols of [40, 80, 120]) {
    tui.terminal.rows = 40;
    const p = new CommandPalette(tui, theme, keys, () => {});
    const query = entry.setting ?? entry.command;
    for (const char of query) p.handleInput(char);
    const lines = p.render(cols);
    assert.ok(compactText(lines).includes(entry.description.replace(/\s/g, '')), entry.command + ' complete description at ' + cols);
    assert.ok(!lines.some(line => line.includes('…')), entry.command + ' no clipping at ' + cols);
  }
}
tui.terminal.rows = 24;
const wrapping = new CommandPalette(tui, theme, keys, value => accepted.push(value));
for (let index = 0; index < commandCatalog.length; index++) {
  if (index) wrapping.handleInput('tui.select.down');
  const lines = wrapping.render(index % 2 ? 40 : 120);
  assert.ok(lines.some(line => line.includes('▸ ')), 'selected entry visible ' + index);
  assert.ok(lines.length <= Math.floor(tui.terminal.rows * .8));
}
wrapping.handleInput('tui.select.confirm');
assert.equal(accepted.at(-1), commandDraft(commandCatalog.at(-1)));
const paging = new CommandPalette(tui, theme, keys, value => accepted.push(value));
paging.render(80);
for (let i = 0; i < 50; i++) { paging.handleInput('tui.select.pageDown'); paging.render(80); }
paging.handleInput('tui.select.confirm');
assert.equal(accepted.at(-1), commandDraft(commandCatalog.at(-1)));
const back = new CommandPalette(tui, theme, keys, value => accepted.push(value));
for (let i = 0; i < 50; i++) { back.handleInput('tui.select.pageDown'); back.render(40); }
for (let i = 0; i < 50; i++) { back.handleInput('tui.select.pageUp'); back.render(40); }
back.handleInput('tui.select.confirm');
assert.equal(accepted.at(-1), '/ui help');
console.log('PASS: command/settings search, validation, wrapped description tails, multiline selection/page navigation, responsive bounds and safe drafts');
