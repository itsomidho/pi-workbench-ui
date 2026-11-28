import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const sandbox = mkdtempSync(tmpdir() + '/workbench-ui-test-');
process.env.PI_WORKBENCH_UI_CONFIG = sandbox + '/ui.json';
process.on('exit', () => rmSync(sandbox, { recursive: true, force: true }));
import { createRequire } from 'node:module';
import { resolvePiRoot } from './test-support.mjs';
const root = resolvePiRoot();
const require = createRequire(root + '/package.json');
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': root + '/dist/index.js',
  '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui'),
  'typebox': require.resolve('typebox'),
} });
const { default: extension, frame, validPlan, gutterLine, footerStats, toolTitle, preview, TodoViewport } = await jiti.import('./index.ts');
const { visibleWidth, Text, CURSOR_MARKER } = await import(require.resolve('@earendil-works/pi-tui'));
const events = {}, commands = {}, shortcuts = {}, entries = [], tools = [], notifications = [];
let resolver, widget, footerFactory, editorFactory;
const pi = {
 on(name, fn) { events[name] = fn; }, registerCommand(name, def) { commands[name] = def; }, registerShortcut(key, def) { shortcuts[key] = def; },
 registerTool(def) { if (def.name === 'todo_plan') tools.unshift(def); else tools.push(def); }, registerToolRenderer(fn) { resolver = fn; },
 appendEntry(customType, data) { entries.push({ type: 'custom', customType, data: structuredClone(data) }); },
 getThinkingLevel() { return 'high'; },
};
extension(pi);
const theme = { fg: (_color, s) => s };
const ctx = { mode: 'tui', cwd: '/tmp/test', model: { id: 'test' },
 sessionManager: { getBranch: () => entries, getEntries: () => entries, buildContextEntries: () => entries, getSessionName: () => 'UI session', getLeafId: () => String(entries.length) },
 getContextUsage: () => ({ percent: 10 }),
 ui: { theme, setWidget: (_key, factory) => { widget = factory; }, getEditorComponent: () => undefined,
 setEditorComponent: f => { editorFactory = f; }, setFooter: f => { footerFactory = f; }, notify(text) { notifications.push(text); } },
};
await events.session_start({}, ctx);
assert.ok(editorFactory);
const plan = { title: 'Build', items: [{ text: '日本語 task', status: 'in_progress' }] };
assert.ok(validPlan(plan));
assert.equal(validPlan({ ...plan, items: [...plan.items, ...plan.items] }), false);
await tools[0].execute('1', plan, undefined, undefined, ctx);
assert.equal(entries.length, 1);
const tui = { requestRender() {} };
assert.match(widget(tui, theme).render(80).join('\n'), /▸  日本語 task/);
const todoLines = widget(tui, theme).render(80);
assert.equal(todoLines[0].trim(), '');
assert.equal(todoLines.at(-1).trim(), '');
assert.match(todoLines[1], /TODO/);
// Reject invalid/cancelled updates without changing durable state.
const savedCount = entries.length;
await assert.rejects(tools[0].execute('bad', { ...plan, items: [...plan.items, ...plan.items] }, undefined, undefined, ctx), /Invalid plan/);
await assert.rejects(tools[0].execute('abort', plan, AbortSignal.abort(), undefined, ctx), /Cancelled/);
assert.equal(entries.length, savedCount);
for (const bad of [null, {}, { title: 'x', items: [{ text: '', status: 'pending' }] }, { title: 'x', items: [{ text: 'x', status: 'wrong' }] }, { title: 'x', items: Array(51).fill({ text: 'x', status: 'pending' }) }]) assert.equal(validPlan(bad), false);
// Completion, full-list command and visibility controls.
const completed = { title: 'Build', items: [{ text: '日本語 task', status: 'completed' }] };
await tools[0].execute('done', completed, undefined, undefined, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /1\/1/);
assert.match(widget(tui, theme).render(80).join('\n'), /✓  日本語/);
await commands['todos'].handler('all', ctx);
assert.match(notifications.at(-1), /completed.*日本語/);
await commands['todos'].handler('', ctx);
assert.equal(widget, undefined);
await commands['todos'].handler('', ctx);
assert.ok(widget);
// Long plans keep the active task visible and expose hidden items.
const long = { title: 'Long plan', items: Array.from({ length: 15 }, (_, i) => ({ text: `Step ${i}`, status: i === 12 ? 'in_progress' : 'pending' })) };
await tools[0].execute('long', long, undefined, undefined, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /▸  Step 12/);
assert.match(widget(tui, theme).render(80).join('\n'), /11–14 of 15/);
// Four items never hide the first item, including when the fourth is active.
const four = { title: 'Four', items: Array.from({ length: 4 }, (_, i) => ({ text: `Row ${i}`, status: i === 3 ? 'in_progress' : 'completed' })) };
await tools[0].execute('four', four, undefined, undefined, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /Row 0/);
assert.equal(widget(tui, theme).render(80).filter(line => /Row \d/.test(line)).length, 4);
assert.doesNotMatch(widget(tui, theme).render(80).join('\n'), /of 4|Alt\+[KJ]/);
// Dedicated shortcuts and commands scroll without appending plan entries.
await tools[0].execute('long-again', long, undefined, undefined, ctx);
const scrollEntries = entries.length;
assert.ok(shortcuts['alt+k'] && shortcuts['alt+j']);
assert.equal(shortcuts['ctrl+alt+up'], undefined);
assert.equal(shortcuts['ctrl+alt+down'], undefined);
assert.match(widget(tui, theme).render(100).join('\n'), /Alt\+K ↑ \/ Alt\+J ↓/);
await shortcuts['alt+k'].handler(ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /10–13 of 15/);
assert.match(widget(tui, theme).render(80).join('\n'), /\/todos follow/);
const advanced = { ...long, items: long.items.map((item, i) => ({ ...item, status: i === 14 ? 'in_progress' : 'pending' })) };
await tools[0].execute('advance', advanced, undefined, undefined, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /10–13 of 15/);
await commands.todos.handler('down', ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /11–14 of 15/);
await shortcuts['alt+j'].handler(ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /12–15 of 15/);
await shortcuts['alt+j'].handler(ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /12–15 of 15/);
assert.equal(entries.length, scrollEntries + 1);
await commands.todos.handler('follow', ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /following/);
await commands.todos.handler('up', ctx);
await events.session_tree({}, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /12–15 of 15.*following/);
await commands.todos.handler('typo', ctx);
assert.match(notifications.at(-1), /Usage:/);
assert.ok(widget);
// Hidden panels ignore scroll shortcuts; commands make the panel visible.
await commands.todos.handler('', ctx);
await shortcuts['alt+k'].handler(ctx);
assert.equal(widget, undefined);
await commands.todos.handler('up', ctx);
assert.ok(widget);
assert.match(widget(tui, theme).render(80).join('\n'), /11–14 of 15/);
const viewport = new TodoViewport();
assert.equal(viewport.start([]), 0);
const fifty = Array.from({ length: 50 }, (_, i) => ({ text: `Item ${i}`, status: i === 49 ? 'in_progress' : 'pending' }));
assert.equal(viewport.start(fifty), 46);
viewport.scroll(-100, fifty); assert.equal(viewport.start(fifty), 0);
viewport.scroll(100, fifty); assert.equal(viewport.start(fifty), 46);
assert.equal(viewport.start(fifty.slice(0, 5)), 1);
assert.equal(viewport.start(fifty), 1); // Shrink clamps the manual offset, not just the rendered position.
viewport.reset(); assert.equal(viewport.start(fifty), 46);
for (const width of [0, 1, 2, 10, 40, 80]) for (const line of widget(tui, theme).render(width)) assert.ok(visibleWidth(line) <= width);
// Completion-only updates must follow pending work without mutating task data.
for (let count = 0; count <= 50; count++) {
 const v = new TodoViewport();
 for (let done = 0; done <= count; done++) {
  const items = Array.from({ length: count }, (_, i) => ({ text: 'Task ' + i, status: i < done ? 'completed' : 'pending' }));
  const before = structuredClone(items), start = v.start(items), last = Math.max(0, count - 4);
  assert.equal(start, done === count ? last : Math.min(last, Math.max(0, done - 2)));
  if (done < count) assert.ok(start <= done && done < start + v.size);
  assert.deepEqual(items, before);
 }
}
const pendingTail = Array.from({ length: 12 }, (_, i) => ({ text: 'Next ' + i, status: i < 8 ? 'completed' : 'pending' }));
const automatic = new TodoViewport();
assert.equal(automatic.start(pendingTail), 6);
const activeAfterPending = pendingTail.map((item, i) => ({ ...item, status: i === 11 ? 'in_progress' : item.status }));
assert.equal(automatic.start(activeAfterPending), 8, 'active takes priority over earlier pending');
automatic.scroll(-100, pendingTail);
const finishedTail = pendingTail.map(item => ({ ...item, status: 'completed' }));
assert.equal(automatic.start(finishedTail), 0, 'manual browsing pauses follow even on completion');
automatic.reset(); assert.equal(automatic.start(finishedTail), 8);
const completionPlan = { title: 'Completion only', items: pendingTail };
await tools[0].execute('pending-follow', completionPlan, undefined, undefined, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /7–10 of 12.*following/);
assert.match(widget(tui, theme).render(80).join('\n'), /□  Next 8/);
await commands.todos.handler('up', ctx);
await tools[0].execute('finished-follow', { ...completionPlan, items: finishedTail }, undefined, undefined, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /6–9 of 12.*\/todos follow/);
const beforeResume = entries.length;
await commands.todos.handler('follow', ctx);
assert.equal(entries.length, beforeResume, 'following changes presentation only');
assert.match(widget(tui, theme).render(80).join('\n'), /9–12 of 12.*following/);
assert.match(widget(tui, theme).render(80).join('\n'), /✓  Next 11/);
console.log('PASS: TODO active/next-pending/completed auto-follow, 0–50-item completion transitions, manual pause/resume, tree restoration and separate shortcuts');
await tools[0].execute('reset', plan, undefined, undefined, ctx);
for (const width of [1, 2, 3, 4, 10, 40, 80]) {
 const component = frame(new Text('日本語 wide text\nsecond', 0, 0), 'done · 1.20s', 'bottom', s => s);
 for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width, `overflow at ${width}`);
 for (const line of widget(tui, theme).render(width)) assert.ok(visibleWidth(line) <= width);
}
let disposed = false;
const footer = footerFactory(tui, theme, { onBranchChange: () => () => { disposed = true; }, getGitBranch: () => 'main', getExtensionStatuses: () => new Map([['usage', 'quota 50%'], ['router', 'think']]) });
assert.match(footer.render(100).join('\n'), /quota 50% · think/);
footer.dispose(); assert.ok(disposed);
const mutedFooter = footerFactory(tui, { fg: (color, text) => `${color}:${text}` }, {
 onBranchChange: () => () => {}, getGitBranch: () => 'main',
 getExtensionStatuses: () => new Map([['usage', '\x1b[32mquota 50%\x1b[0m']]),
});
const mutedLines = mutedFooter.render(200);
assert.ok(mutedLines.every(line => line.startsWith(' muted:')));
assert.ok(!mutedLines.join('').includes('\x1b[32m'));
assert.match(mutedLines.join(''), /quota 50%/);
mutedFooter.dispose();
const singleIndicatorFooter = footerFactory(tui, theme, {
 onBranchChange: () => () => {}, getGitBranch: () => 'main',
 getExtensionStatuses: () => new Map([['usage-limits', 'CPU: 20%' + '\u00a0'.repeat(200) + 'Thinking']]),
});
assert.match(singleIndicatorFooter.render(80).join('\n'), /CPU: 20%/);
assert.ok(!singleIndicatorFooter.render(80).join('\n').includes('Thinking'));
singleIndicatorFooter.dispose();
const editor = editorFactory({ ...tui, terminal: { rows: 40, columns: 80 } }, { borderColor: s => s }, { matches: () => false });
assert.equal(editor.embedWorkingStatus, true);
// Pi sets the host's padding on a custom editor after construction. Its
// default zero must not move our input/cursor left of the inset borders.
for (const hostPadding of [0, 3, 0]) {
 editor.setPaddingX(hostPadding);
 assert.equal(editor.getPaddingX(), 1);
}
editor.focused = true;
for (const width of [10, 40, 80]) {
 const lines = editor.render(width);
 const cursorLine = lines.find(line => line.includes(CURSOR_MARKER));
 assert.ok(cursorLine, 'editor must expose its hardware cursor marker');
 assert.equal(visibleWidth(cursorLine.split(CURSOR_MARKER)[0]), 1, 'cursor must share border inset');
 assert.ok(lines[0].startsWith(' '));
 assert.ok(lines.at(-1).startsWith(' '));
}
editor.setWorkingStatusIndicator({ renderInBorder: () => '● Working', renderSpinnerInBorder: () => '●' });
for (const width of [10, 40, 80]) {
 const top = editor.renderTopBorder(width, 0);
 assert.equal(visibleWidth(top), width);
 assert.ok(top.startsWith(' ') && top.endsWith(' '));
 if (width >= 40) assert.match(top, /Working/);
}
entries.length = 0;
await events.session_tree({}, ctx);
assert.match(widget(tui, theme).render(100).join('\n'), /No tasks/);
entries.push({ type: 'custom', customType: 'omp-plan', data: plan });
await events.session_start({}, ctx);
assert.match(widget(tui, theme).render(100).join('\n'), /日本語/);
const original = { renderCall: () => new Text('command', 0, 0), renderResult: () => new Text('full output', 0, 0) };
const renderers = resolver('bash', () => original);
assert.equal(renderers.execute, undefined);
const call = renderers.renderCall({}, theme, {});
assert.match(call.render(50).join('\n'), /╭── bash/);
assert.ok(call.render(50)[2].startsWith(' │ command'));
assert.ok(call.render(50)[2].endsWith(' │ '));
assert.match(call.render(50)[1], /^ │\s+│ $/);
assert.match(call.render(50).at(-1), /^ │\s+│ $/);
for (const width of [0, 1, 2, 3, 4, 10, 80]) {
 const line = gutterLine('日本語 long text', width);
 assert.equal(visibleWidth(line), width);
 if (width >= 3) assert.ok(line.startsWith(' ') && line.endsWith(' '));
 for (const row of call.render(width)) assert.ok(visibleWidth(row) <= width);
}
const result = renderers.renderResult({}, { isPartial: false }, theme, { durationMs: 1200, isError: true });
assert.match(result.render(50).join('\n'), /error · ◷ 1.20s/);
assert.match(result.render(50).join('\n'), /full output/);
assert.match(result.render(50).join('\n'), /├── Output /);
assert.equal(toolTitle('bash', { command: '# Verify installed packages\nnpm list' }), 'Verify installed packages');
assert.equal(toolTitle('bash', { command: 'npm list' }, 'Unrelated task'), 'bash · npm list');
assert.equal(toolTitle('bash', { command: 'npm list' }), 'bash · npm list');
assert.equal(toolTitle('read', { path: 'example.ts' }), 'read · example.ts');
const timed = renderers.renderResult({}, { isPartial: false }, theme, { state: {}, args: { timeout: 50 }, durationMs: 14000 });
assert.match(timed.render(80).join('\n'), /◷ 14.00s\/50.0s/);
const running = renderers.renderResult({}, { isPartial: true }, theme, { state: { startedAt: Date.now() - 1000 }, args: { timeout: 30 } });
assert.match(running.render(80).join('\n'), /running · ◷ 1\.\d+s\/30.0s/);
for (const width of [0, 1, 2, 3, 4, 10, 80]) {
 for (const line of timed.render(width)) assert.ok(visibleWidth(line) <= width);
}
for (const text of ['', '  \n\n', '(no output)\n\nTook 0.2s', '\nElapsed 1.2s']) {
 const emptyResult = frame(new Text(text, 0, 0), 'done', 'bottom', s => s, true);
 const lines = emptyResult.render(80);
 assert.equal(lines.length, 1);
 assert.ok(!lines.join('').includes('Output'));
 assert.match(lines[0], /╰── done/);
}
const realOutput = frame(new Text('hello\nTook 0.2s', 0, 0), 'done', 'bottom', s => s, true);
assert.match(realOutput.render(80).join('\n'), /├── Output/);
assert.match(realOutput.render(80).join('\n'), /hello/);
// Native diff highlighting may end a line without resetting the background.
// Simulate terminal SGR state rather than just looking for escape sequences.
function paintedCells(line) {
 let background = false;
 const cells = [];
 for (const match of line.matchAll(/\x1b\[([0-9;]*)m|([^\x1b])/gu)) {
  if (match[1] !== undefined) {
   const values = (match[1] || '0').split(';').map(Number);
   if (values[0] === 48 || (values[0] >= 40 && values[0] <= 47) || (values[0] >= 100 && values[0] <= 107)) background = true;
   if (values.includes(0) && values[0] !== 48 || values.includes(49)) background = false;
  } else cells.push({ text: match[2], background });
 }
 return cells;
}
const diffBg = '\x1b[48;2;60;120;90m';
const borderFg = text => '\x1b[90m' + text + '\x1b[39m';
for (const padding of [0, 1, 2, 3]) for (const width of [5, 10, 40, 80]) {
 const child = { invalidate() {}, render(w) { return [diffBg + 'x'.repeat(w) + '\x1b[39m']; } };
 const framed = frame(child, 'diff', 'top', borderFg, false, { ...defaultsForAnsi(), padding });
 for (const line of framed.render(width)) {
  assert.equal(visibleWidth(line), width);
  for (const cell of paintedCells(line)) {
   if (cell.text === '│' || cell.text === ' ') assert.equal(cell.background, false, 'highlight leaked into padding/border');
   if (cell.text === 'x') assert.equal(cell.background, true, 'content highlight was stripped');
  }
 }
}
function defaultsForAnsi() { return { padding: 1, verticalPadding: 1 }; }
for (const width of [4, 8, 40]) {
 const cells = paintedCells(gutterLine(diffBg + 'xx', width));
 assert.equal(cells[0].background, false);
 assert.equal(cells.at(-1).background, false);
 assert.ok(cells.filter(cell => cell.text === 'x').every(cell => cell.background));
}
// Both halves follow the shared tool state, including completion without timing.
for (const [partial, error, expected] of [[true, false, 'warning'], [false, false, 'borderMuted'], [false, true, 'error']]) {
 const colors = [];
 const coloredTheme = { fg: (color, s) => { if (/[│╭╮╰╯├┤─]/.test(s)) colors.push(color); return s; } };
 const context = { state: {}, executionStarted: true, isError: error };
 const top = renderers.renderCall({}, coloredTheme, context);
 const bottom = renderers.renderResult({}, { isPartial: partial }, coloredTheme, context);
 colors.length = 0;
 top.render(50); bottom.render(50);
 assert.ok(colors.length > 0 && colors.every(color => color === expected));
}
for (const [started, expected] of [[false, 'borderMuted'], [true, 'warning']]) {
 const colors = [];
 renderers.renderCall({}, { fg: (color, s) => { colors.push(color); return s; } }, { state: {}, executionStarted: started }).render(50);
 assert.ok(colors.every(color => color === expected));
}
assert.equal(resolver('custom', () => ({ renderShell: 'self' })).renderCall, undefined);
// Built-in edit uses a self-rendered Box: frame it without its old fill.
const { editRenderers } = await import(root + '/dist/core/tools/renderers/edit.js');
const framedEdit = resolver('edit', () => ({ ...editRenderers, renderShell: 'self' }));
const editTheme = Object.assign(Object.create({ bold: s => s, fg: (_color, s) => s }), { bg: (_color, s) => `UNWANTED_FILL:${s}` });
const editContext = { state: {}, cwd: '/tmp', outputPad: 1, argsComplete: false, isPartial: true, expanded: false, executionStarted: true, invalidate() {} };
const editArgs = { path: '/tmp/example.ts', edits: [{ oldText: 'a', newText: 'b' }] };
let editCall = framedEdit.renderCall(editArgs, editTheme, editContext);
editCall = framedEdit.renderCall(editArgs, editTheme, { ...editContext, lastComponent: editCall });
const editLines = editCall.render(80);
assert.match(editLines.join('\n'), /╭── edit/);
assert.ok(!editLines.join('\n').includes('UNWANTED_FILL'));
const editResult = framedEdit.renderResult({ content: [{ type: 'text', text: 'Applied' }], details: {} }, { isPartial: false, expanded: false }, editTheme, { ...editContext, args: editArgs, isError: false, durationMs: 100 });
assert.match(editResult.render(80).join('\n'), /╰── done/);
assert.ok(!editResult.render(80).join('\n').includes('Output'));
for (const line of [...editLines, ...editResult.render(80)]) assert.equal(visibleWidth(line), 80);
// Regression: native renderers reuse concrete Text/Container instances.
const reusable = {
 renderCall(_args, _theme, context) {
  const text = context.lastComponent ?? new Text('', 0, 0);
  text.setText('native command');
  return text;
 },
 renderResult(_result, _options, _theme, context) {
  const text = context.lastComponent ?? new Text('', 0, 0);
  text.setText('native output');
  return text;
 },
};
const reuseRenderers = resolver('bash', () => reusable);
const reuseContext = { state: {}, executionStarted: true };
let lastCall, lastResult;
for (let i = 0; i < 4; i++) {
 lastCall = reuseRenderers.renderCall({}, theme, { ...reuseContext, lastComponent: lastCall });
 lastResult = reuseRenderers.renderResult({}, { isPartial: false }, theme, { ...reuseContext, lastComponent: lastResult });
 assert.match(lastCall.render(60).join('\n'), /╭── bash/);
 assert.match(lastResult.render(60).join('\n'), /╰── done/);
}
// Completed plans remain visible until the next real prompt.
await tools[0].execute('complete-reset-test', completed, undefined, undefined, ctx);
await events.session_start({}, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /1\/1/);
for (const input of [
 { source: 'extension', text: 'Internal follow-up' },
 { source: 'interactive', text: '  ' },
 { source: 'interactive', text: '/todos' },
 { source: 'interactive', text: '/skill:think topic' },
 { source: 'interactive', text: '/router-status' },
]) {
 const count = entries.length;
 await events.input(input, ctx);
 assert.equal(entries.length, count);
 assert.match(widget(tui, theme).render(80).join('\n'), /1\/1/);
}
await events.input({ source: 'interactive', text: 'Next task' }, ctx);
assert.equal(entries.at(-1).data.items.length, 0);
assert.match(widget(tui, theme).render(80).join('\n'), /No tasks/);
await events.session_start({}, ctx);
assert.match(widget(tui, theme).render(80).join('\n'), /No tasks/);
const emptyCount = entries.length;
await events.input({ source: 'interactive', text: 'Another prompt' }, ctx);
assert.equal(entries.length, emptyCount);
// Incomplete tasks survive both human and API prompts.
await tools[0].execute('unfinished', plan, undefined, undefined, ctx);
for (const source of ['interactive', 'rpc']) {
 const count = entries.length;
 await events.input({ source, text: 'Continue' }, ctx);
 assert.equal(entries.length, count);
 assert.match(widget(tui, theme).render(80).join('\n'), /▸  日本語/);
}
for (const input of [
 { source: 'rpc', text: 'Next API task' },
 { source: 'interactive', text: '', images: [{ type: 'image' }] },
 { source: 'interactive', text: '/tmp/pi-clipboard-example.png, please adjust this' },
 { source: 'interactive', text: '  /home/example/screenshot.png' },
]) {
 await tools[0].execute('finished', completed, undefined, undefined, ctx);
 await events.input(input, ctx);
 assert.match(widget(tui, theme).render(80).join('\n'), /No tasks/);
}
// Integrated footer: totals follow native Pi accounting across all entries,
// while physical model metadata comes only from the active branch.
const response = { type: 'message', message: { role: 'assistant', provider: 'test-provider', model: 'actual-model', thinkingLevel: 'high', usage: { input: 100, output: 20, cacheRead: 900, cacheWrite: 0, cost: { total: 0.1 } } } };
const history = [response,
 { type: 'usage', usage: { input: 10, cost: { total: 0.2 } } },
 { type: 'compaction', usage: { output: 5, cost: { total: 0.3 } } },
 { type: 'branch_summary', usage: { cacheWrite: 40 } },
 { type: 'message', message: { role: 'toolResult', usage: { output: 3, cost: { total: 0.4 } } } },
];
const summary = footerStats(history, [response]);
assert.deepEqual(summary.totals, { input: 110, output: 28, cacheRead: 900, cacheWrite: 40, cost: 1 });
assert.equal(summary.cacheHit, 90);
assert.equal(footerStats(history, []).last, undefined);
const integrationCtx = { ...ctx, model: { provider: 'router', id: 'auto', contextWindow: 500000 },
 getContextUsage: () => ({ percent: 23.6, contextWindow: 500000 }),
 sessionManager: { ...ctx.sessionManager, getEntries: () => history, getBranch: () => [response] } };
await events.session_start({}, integrationCtx);
const integrated = footerFactory(tui, theme, { onBranchChange: () => () => {}, getGitBranch: () => 'main', getExtensionStatuses: () => new Map([['usage-limits', 'CPU: 25% · RAM: 8GB'], ['other', 'custom status']]) });
const wide = integrated.render(240);
assert.equal(wide.length, 3);
assert.match(wide[0], /main.*UI session/);
assert.match(wide[1], /↑110 ↓28 R900 W40 CH90.0% \$1.000 ctx 23.6%\/500.0k/);
assert.match(wide[1], /router\/auto · high → test-provider\/actual-model · high/);
assert.match(wide[2], /CPU: 25%.*custom status/);
for (const width of [0, 1, 2, 3, 10, 40, 80]) {
 const lines = integrated.render(width);
 for (const line of lines) assert.ok(visibleWidth(line) <= width, `footer overflow ${width}`);
 if (width >= 40) assert.ok(lines.join('').includes('actual-model'));
}
integrationCtx.sessionManager.getBranch = () => [];
integrationCtx.sessionManager.getLeafId = () => 'new-branch';
integrated.invalidate();
assert.match(integrated.render(240).join('\n'), /→ unknown/);
integrated.dispose();
// Performance regression: no session scan or context projection per keystroke.
let scans = 0, projections = 0;
const perfCtx = { ...integrationCtx,
 getContextUsage: () => { projections++; return { percent: 20, contextWindow: 500000 }; },
 sessionManager: { ...integrationCtx.sessionManager, getEntries: () => { scans++; return history; } },
};
await events.session_start({}, perfCtx);
const perfFooter = footerFactory(tui, theme, { onBranchChange: () => () => {}, getGitBranch: () => 'main', getExtensionStatuses: () => new Map() });
const scanStart = scans;
perfFooter.render(160);
for (let i = 0; i < 1000; i++) { perfFooter.invalidate(); perfFooter.render(160); }
assert.equal(scans - scanStart, 1);
assert.equal(projections, 1);
perfCtx.sessionManager.getLeafId = () => 'updated-leaf';
perfFooter.render(160);
assert.equal(projections, 2);
perfFooter.dispose();
const stableChild = new Text(Array.from({length: 2000}, (_, i) => `line ${i}: 日本語 output`).join('\n'), 0, 0);
const cachedFrame = frame(stableChild, 'test', 'bottom', s => s);
const coldStart = performance.now();
const coldLines = cachedFrame.render(120);
const coldMs = performance.now() - coldStart;
const warmStart = performance.now();
for (let i = 0; i < 1000; i++) assert.strictEqual(cachedFrame.render(120), coldLines);
const warmMs = performance.now() - warmStart;
assert.ok(warmMs < Math.max(100, coldMs * 10), 'cached redraw performance budget exceeded');
cachedFrame.invalidate();
assert.notStrictEqual(cachedFrame.render(120), coldLines);
assert.notStrictEqual(cachedFrame.render(80), coldLines);
console.log(`PERF: 2000-line frame cold ${coldMs.toFixed(2)}ms; 1000 cached draws ${warmMs.toFixed(2)}ms; 1001 footer draws use one session scan/context projection`);
const { defaults, loadSettings, saveSetting, validateSetting } = await jiti.import('./settings.ts');
assert.equal(validateSetting('padding', 4), false);
assert.equal(validateSetting('runningColor', 'bad-color'), false);
assert.equal(validateSetting('footer', 'compact'), true);
let reloads = 0;
const commandCtx = { ...ctx, reload: async () => { reloads++; } };
await commands.ui.handler('set padding 2', commandCtx);
assert.equal(loadSettings().padding, 2);
await commands.ui.handler('reset', commandCtx);
assert.equal(loadSettings().enabled, false);
assert.strictEqual(resolver('bash', () => original), original);
await commands.ui.handler('enable', commandCtx);
assert.equal(loadSettings().enabled, true);
assert.equal(reloads, 3);
await commands.ui.handler('set padding 99', commandCtx);
assert.equal(reloads, 3);
assert.equal(loadSettings().padding, 2);
for (const padding of [0, 1, 2, 3]) {
 await commands.ui.handler(`set padding ${padding}`, commandCtx);
 const aligned = editorFactory({ ...tui, terminal: { rows: 40, columns: 80 } }, { borderColor: s => s }, { matches: () => false });
 aligned.setPaddingX(padding === 0 ? 3 : 0);
 assert.equal(aligned.getPaddingX(), padding);
 aligned.focused = true;
 const lines = aligned.render(80);
 const cursor = lines.find(line => line.includes(CURSOR_MARKER));
 assert.equal(visibleWidth(cursor.split(CURSOR_MARKER)[0]), padding);
 assert.equal(visibleWidth(lines[0].match(/^ */)[0]), padding);
 assert.equal(visibleWidth(lines.at(-1).match(/^ */)[0]), padding);
}
await tools.find(tool => tool.name === 'ui_title').execute('title', { tool: 'bash', description: 'Verify packages' });
events.tool_call({ toolName: 'bash', toolCallId: 'described' });
const titled = resolver('bash', () => original).renderCall({}, theme, { state: {}, toolCallId: 'described' });
assert.match(titled.render(80).join('\n'), /Verify packages/);
for (const padding of [0, 1, 2, 3]) for (const verticalPadding of [0, 1, 3]) for (const width of [1, 3, 10, 40, 80]) {
 const component = frame(new Text('日本語 output', 0, 0), 'title', 'top', s => s, false, { ...defaults, padding, verticalPadding });
 for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
}
const previewChild = new Text(Array.from({ length: 50 }, (_, i) => `output ${i}`).join('\n'), 0, 0);
assert.equal(preview(previewChild, 5, false).render(80).length, 6);
assert.equal(preview(previewChild, 5, true).render(80).length, 50);
assert.equal(preview(new Text('hello\nTook 1.0s', 0, 0), 10, false, 'hello', true).render(80).length, 1);
assert.equal(preview(new Text('Took 1.0s', 0, 0), 10, false, 'Took 1.0s', true).render(80).length, 1);
assert.match(frame(new Text('Took 1.0s', 0, 0), 'done', 'bottom', s => s, true, defaults, true).render(80).join('\n'), /Took 1.0s/);
const historyStart = performance.now();
assert.equal(footerStats(Array(20000).fill(response), [response]).totals.input, 2000000);
console.log(`PERF: 20000-entry statistics scan ${(performance.now() - historyStart).toFixed(2)}ms`);
// A stale fullscreen screen row must be cleared without changing history.
const redraws = [];
const redrawData = { onBranchChange: () => () => {}, getGitBranch: () => undefined, getExtensionStatuses: () => new Map() };
const screen = { mode: 'fullscreen', requestRender: force => redraws.push(force) };
const redrawFooter = footerFactory(screen, theme, redrawData);
const entrySnapshot = JSON.stringify(entries);
events.agent_settled();
assert.deepEqual(redraws, [true]);
assert.equal(JSON.stringify(entries), entrySnapshot);
await commands.ui.handler('redraw', commandCtx);
assert.deepEqual(redraws, [true, true]);
redrawFooter.dispose();
events.agent_settled();
assert.equal(redraws.length, 2);
const regularFooter = footerFactory({ ...screen, mode: 'regular' }, theme, redrawData);
events.agent_settled();
assert.equal(redraws.length, 2, 'regular-mode scrollback must not be forcibly redrawn on settle');
regularFooter.dispose();
console.log('PASS: fullscreen redraw recovery without message mutation');
console.log('PASS: settings/recovery/explicit titles/preview/padding matrix');
console.log('PASS: integrated footer totals/routing/responsive layout, completed-plan reset and persistence, native component reuse, loading, plan validation, persistence/tree reset/reload, Unicode widths, footer statuses/disposal, tool frames/timing/errors and execution isolation');
