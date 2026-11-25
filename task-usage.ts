import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { existsSync, mkdirSync, readFileSync, realpathSync, lstatSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TaskDashboard } from './task-dashboard.ts';

type Boundary = { action: 'start' | 'finish'; id: string; name: string; at: string };
type Counts = { input: number | null; output: number | null; cacheRead: number | null; cacheWrite: number | null; cost: number | null };
export type Report = { schemaVersion: 1; source: string; task: string; id: string; status: string; startedAt: string | null; finishedAt: string | null; elapsedMs: number | null; turns: number | null; toolCalls: number | null; totals: Counts; byModel: Array<{ provider: string; model: string; turns: number; totals: Counts }>; warnings: string[] };
const fields = ['input', 'output', 'cacheRead', 'cacheWrite', 'cost'] as const;
const blank = (): Counts => ({ input: null, output: null, cacheRead: null, cacheWrite: null, cost: null });
const numeric = (x: unknown, integer = false): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0 && (!integer || Number.isSafeInteger(x));
const safe = (s: string) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim().slice(0, 160);
const boundary = (entry: any): Boundary | undefined => {
  const b = entry?.type === 'custom' && entry.customType === 'workbench-task-usage' ? entry.data : undefined;
  return b && ['start', 'finish'].includes(b.action) && typeof b.id === 'string' && typeof b.name === 'string' && typeof b.at === 'string' ? b : undefined;
};
export function activeTask(entries: readonly any[]): Boundary | undefined {
  let active: Boundary | undefined;
  for (const entry of entries) {
    const b = boundary(entry);
    if (b?.action === 'start') active = b;
    else if (b?.action === 'finish' && b.id === active?.id) active = undefined;
  }
  return active;
}
export function aggregate(records: any[], metadata: Omit<Report, 'totals' | 'byModel' | 'warnings'>, extraWarnings: string[] = []): Report {
  const totals = blank(), incomplete = new Set<string>(), warnings = [...extraWarnings];
  const models = new Map<string, { provider: string; model: string; turns: number; totals: Counts; missing: Set<string> }>();
  let usageRecords = 0;
  const add = (target: Counts, usage: any, missing: Set<string>) => {
    for (const field of fields) {
      const value = field === 'cost' ? usage?.cost?.total : usage?.[field];
      if (!numeric(value, field !== 'cost')) { missing.add(field); continue; }
      const total = (target[field] ?? 0) + value;
      if (!numeric(total, field !== 'cost')) { missing.add(field); continue; }
      target[field] = total;
    }
  };
  for (const record of records) {
    const usage = record.usage;
    if (!usage || typeof usage !== 'object') { for (const f of fields) incomplete.add(f); }
    else { usageRecords++; add(totals, usage, incomplete); }
    const provider = typeof record.provider === 'string' && record.provider && record.provider !== 'router' ? safe(record.provider) : 'unknown';
    const model = provider !== 'unknown' && typeof record.model === 'string' && record.model ? safe(record.model) : 'unknown';
    const key = JSON.stringify([provider, model]);
    let group = models.get(key);
    if (!group) { group = { provider, model, turns: 0, totals: blank(), missing: new Set() }; models.set(key, group); }
    if (record.assistant) group.turns++;
    if (!usage || typeof usage !== 'object') for (const f of fields) group.missing.add(f);
    else add(group.totals, usage, group.missing);
  }
  if (!records.length || !usageRecords) warnings.push('No usage was recorded; totals are unknown.');
  if (incomplete.size) warnings.push(`Incomplete recorded fields: ${[...incomplete].join(', ')}; totals are partial.`);
  if ([...models.values()].some(group => group.provider === 'unknown' || group.model === 'unknown')) warnings.push('Some usage lacks physical model/provider attribution.');
  const byModel = [...models.values()].map(({ missing, ...group }) => {
    if (missing.size) warnings.push(`Model ${group.provider}/${group.model}: partial ${[...missing].join(', ')}.`);
    return group;
  });
  return { ...metadata, totals, byModel, warnings };
}
export function sessionReport(entries: readonly any[], now = new Date().toISOString()): Report {
  let start = -1, finish = -1;
  for (let i = 0; i < entries.length; i++) {
    const b = boundary(entries[i]);
    if (b?.action === 'start') { start = i; finish = -1; }
    else if (b?.action === 'finish' && start >= 0 && b.id === boundary(entries[start])?.id) finish = i;
  }
  if (start < 0) throw new Error('No task in this session branch. Start one with /task-usage start <name>.');
  const begin = boundary(entries[start])!, end = finish >= 0 ? boundary(entries[finish])! : undefined;
  const selected = entries.slice(start + 1, finish >= 0 ? finish : entries.length);
  let turns = 0, toolCalls = 0;
  const records: any[] = [];
  for (const e of selected) {
    if (e.type === 'message' && e.message?.role === 'assistant') {
      turns++;
      toolCalls += (e.message.content ?? []).filter((c: any) => c.type === 'toolCall').length;
      records.push({ usage: e.message.usage, provider: e.message.provider, model: e.message.model, assistant: true });
    } else if (e.type === 'message' && e.message?.role === 'toolResult' && e.message.usage) {
      // Pi aggregates nested tool usage into the top-level result; never sum nestedCalls.
      records.push({ usage: e.message.usage, provider: undefined, model: undefined });
    } else if (['usage', 'compaction', 'branch_summary'].includes(e.type) && e.usage) {
      records.push({ usage: e.usage, provider: e.provider, model: e.model });
    }
  }
  const endAt = end?.at ?? now, elapsed = Date.parse(endAt) - Date.parse(begin.at);
  return aggregate(records, { schemaVersion: 1, source: 'session active branch', task: safe(begin.name), id: begin.id, status: end ? 'finished' : 'active', startedAt: begin.at, finishedAt: end?.at ?? null, elapsedMs: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null, turns, toolCalls });
}
export function workbenchReport(taskDir: string, runId: string, tasksRoot: string): Report {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) throw new Error('Provide an explicit valid Workbench run ID.');
  const root = realpathSync(tasksRoot), dir = realpathSync(taskDir), rel = relative(root, dir);
  if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Task directory must be inside the Workbench task workspace.');
  const file = join(dir, 'artifacts', 'usage.jsonl');
  const artifacts = join(dir, 'artifacts');
  if (lstatSync(artifacts).isSymbolicLink() || lstatSync(file).isSymbolicLink()) throw new Error('Symlinked Workbench artifacts are not allowed.');
  const info = lstatSync(file);
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Usage ledger is not a regular file or exceeds 4 MiB.');
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, i) => {
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Not an object');
      return row;
    } catch { throw new Error(`Invalid usage ledger record at line ${i + 1}.`); }
  });
  const filtered = rows.filter(row => row.runId === runId);
  if (!filtered.length) throw new Error('No usage records found for that exact run ID.');
  const records = filtered.map(row => ({ usage: row.usage, provider: row.provider, model: row.model, assistant: true }));
  return aggregate(records, { schemaVersion: 1, source: 'workbench usage.jsonl (assistant responses only)', task: safe(basename(dir)), id: runId, status: 'recorded run', startedAt: null, finishedAt: null, elapsedMs: null, turns: filtered.length, toolCalls: null }, ['Workbench ledger contains recorded assistant responses only; tool-result and other usage may be absent. Task boundaries, elapsed time and tool calls are unknown.', 'Ledger rows have no event IDs; duplicate records cannot be independently identified.']);
}
const countText = (counts: Counts) => `input ${counts.input ?? 'unknown'} · output ${counts.output ?? 'unknown'} · cache read ${counts.cacheRead ?? 'unknown'} · cache write ${counts.cacheWrite ?? 'unknown'} · cost ${counts.cost === null ? 'unknown' : '$' + counts.cost.toFixed(6)}`;
export function markdown(report: Report): string {
  const literal = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[\\`*_{}\[\]()<>#+.!|]/g, '\\$&');
  return [`# Task usage: ${literal(report.task)}`, '', `- Source: ${report.source}`, `- ID: ${literal(report.id)}`, `- Status: ${report.status}`, `- Started: ${report.startedAt ?? 'unknown'}`, `- Finished: ${report.finishedAt ?? 'unknown'}`, `- Elapsed: ${report.elapsedMs === null ? 'unknown' : (report.elapsedMs / 1000).toFixed(1) + 's'}`, `- Model turns: ${report.turns ?? 'unknown'} · top-level tool calls: ${report.toolCalls ?? 'unknown'}`, `- Total: ${countText(report.totals)}`, '', '## Models', ...(report.byModel.length ? report.byModel.map(model => `- ${literal(model.provider)}/${literal(model.model)} (${model.turns} turns): ${countText(model.totals)}`) : ['- No model usage recorded.']), '', '## Notes', ...report.warnings.map(w => `- ${literal(w)}`), '- Reported cost is not an independently audited bill. Unknown fields are never estimated.', '- Elapsed time, when available, is wall time including idle time; tool calls are assistant-requested top-level calls only.', ''].join('\n');
}
export function exportReport(report: Report, directory: string): string[] {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink()) throw new Error('Export directory cannot be a symlink.');
  const dir = realpathSync(directory);
  const name = `task-usage-${Date.now()}-${randomUUID()}`;
  const paths = [join(dir, name + '.json'), join(dir, name + '.md')];
  // O_EXCL and private modes avoid overwriting files or following final symlinks.
  writeFileSync(paths[0], JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  writeFileSync(paths[1], markdown(report), { mode: 0o600, flag: 'wx' });
  return paths;
}
export function registerTaskUsage(pi: ExtensionAPI, enabled: () => boolean = () => true) {
  const read = (ctx: ExtensionContext) => ctx.sessionManager.getBranch();
  const stateHome = () => isAbsolute(process.env.XDG_STATE_HOME || '') ? process.env.XDG_STATE_HOME! : join(homedir(), '.local/state');
  const reportDir = () => join(stateHome(), 'pi-workbench-ui', 'usage-reports');
  const taskRoot = () => {
    const override = process.env.PI_TASKS_DIR;
    if (override) return resolve(override === '~' ? homedir() : override.startsWith('~/') ? join(homedir(), override.slice(2)) : override);
    const preferred = join(stateHome(), 'pi-workbench/tasks'), legacy = join(homedir(), '.pi/tasks');
    return !existsSync(preferred) && existsSync(legacy) ? legacy : preferred;
  };
  pi.registerCommand('task-usage', {
    description: 'start <name> | finish | show | export | workbench <task-directory> <run-id> [export]',
    handler: async (args, ctx) => {
      try {
        const [command, ...rest] = args.trim().split(/\s+/);
        if (['start', 'finish'].includes(command) && !ctx.isIdle()) throw new Error('Wait for the agent to finish before changing task boundaries.');
        if (['finish', 'show', 'export'].includes(command) && rest.length) throw new Error('Unexpected arguments.');
        if (command === 'start') {
          const name = safe(rest.join(' '));
          if (!name) throw new Error('Provide a task name.');
          if (activeTask(read(ctx))) throw new Error('A task is already active on this branch; finish it first.');
          if (!ctx.sessionManager.getSessionFile()) throw new Error('A saved Pi session is required for durable task reports.');
          pi.appendEntry('workbench-task-usage', { action: 'start', id: randomUUID(), name, at: new Date().toISOString() });
          ctx.ui.notify(`Started usage tracking: ${name}`, 'info'); return;
        }
        if (command === 'finish') {
          const current = activeTask(read(ctx));
          if (!current) throw new Error('No active task on this branch.');
          pi.appendEntry('workbench-task-usage', { ...current, action: 'finish', at: new Date().toISOString() });
          ctx.ui.notify(`Finished usage tracking: ${current.name}. Use /task-usage show or export.`, 'info'); return;
        }
        let report: Report;
        let exportWorkbench = false;
        if (command === 'workbench') {
          const match = args.trim().match(/^workbench\s+(.+?)\s+([A-Za-z0-9_-]{1,128})(?:\s+(export))?$/);
          if (!match || !isAbsolute(match[1])) throw new Error('Usage: /task-usage workbench <absolute-task-directory> <run-id> [export]');
          exportWorkbench = match[3] === 'export';
          report = workbenchReport(match[1], match[2], taskRoot());
        } else if (command === 'show' || command === 'export') report = sessionReport(read(ctx));
        else throw new Error('Usage: /task-usage start <name> | finish | show | export | workbench <absolute-task-directory> <run-id>');
        if (command === 'export' || exportWorkbench) ctx.ui.notify(`Private reports written:\n${exportReport(report, reportDir()).join('\n')}`, 'info');
        else if (ctx.mode === 'tui' && enabled()) {
          let columns = () => 100;
          await ctx.ui.custom<void>((tui, theme, keys, done) => {
            columns = () => tui.terminal.columns;
            return new TaskDashboard(report, tui, theme, keys, () => done());
          }, {
            overlay: true,
            overlayOptions: () => ({ width: Math.max(1, Math.min(100, Math.floor(columns() * 0.9))), maxHeight: '85%', anchor: 'center' }),
          });
        } else ctx.ui.notify(markdown(report), 'info');
      } catch (error: any) { ctx.ui.notify(error?.message ?? 'Task usage report failed', 'error'); }
    },
  });
}
