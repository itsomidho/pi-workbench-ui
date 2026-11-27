import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolvePiRoot } from './test-support.mjs';
const root = resolvePiRoot(), require = createRequire(root + '/package.json');
const jiti = require('jiti').createJiti(import.meta.url, { alias: { '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui') } });
const { commandCatalog, searchCommands, commandDraft, commandHelpText, uiCommandCompletions, CommandPalette, openCommandHelp } = await jiti.import('./command-help.ts');
const { visibleWidth } = await import(require.resolve('@earendil-works/pi-tui'));
assert.equal(new Set(commandCatalog.map(entry => entry.command)).size, commandCatalog.length);
assert.deepEqual([...new Set(commandCatalog.map(entry => entry.group))], ['UI', 'TODOs', 'Task usage']);
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
console.log('PASS: command search/groups, argument-safe draft prefixes, keyboard controls, wrapped widths, draft preservation and plain-text fallback');
