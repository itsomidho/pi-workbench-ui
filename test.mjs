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
  '@earendil-works/pi-tui': root + '/node_modules/@earendil-works/pi-tui/dist/index.js',
  'typebox': require.resolve('typebox'),
} });
const { default: extension, frame, validPlan, gutterLine, footerStats, toolTitle, preview } = await jiti.import('./index.ts');
const { visibleWidth, Text } = await import(root + '/node_modules/@earendil-works/pi-tui/dist/index.js');
const events = {}, commands = {}, entries = [], tools = [], notifications = [];
let resolver, widget, footerFactory, editorFactory;
const pi = {
 on(name, fn) { events[name] = fn; }, registerCommand(name, def) { commands[name] = def; },
 registerTool(def) { if (def.name === 'todo_plan') tools.unshift(def); else tools.push(def); }, registerToolRenderer(fn) { resolver = fn; },
 appendEntry(customType, data) { entries.push({ type: 'custom', customType, data: structuredClone(data) }); },
 getThinkingLevel() { return 'high'; },
};
extension(pi);
const theme = { fg: (_color, s) => s };
const ctx = { mode: 'tui', cwd: '/tmp/test', model: { id: 'test' },
 sessionManager: { getBranch: () => entries, getEntries: () => entries, getSessionName: () => 'UI session', getLeafId: () => String(entries.length) },
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
assert.match(widget(tui, theme).render(80).join('\n'), /earlier/);
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
// Both halves follow the shared tool state, including completion without timing.
for (const [partial, error, expected] of [[true, false, 'warning'], [false, false, 'borderMuted'], [false, true, 'error']]) {
 const colors = [];
 const coloredTheme = { fg: (color, s) => { colors.push(color); return s; } };
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
console.log('PASS: settings/recovery/explicit titles/preview/padding matrix');
console.log('PASS: integrated footer totals/routing/responsive layout, completed-plan reset and persistence, native component reuse, loading, plan validation, persistence/tree reset/reload, Unicode widths, footer statuses/disposal, tool frames/timing/errors and execution isolation');
