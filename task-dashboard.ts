import type { Theme } from '@earendil-works/pi-coding-agent';
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type TUI, type KeybindingsManager } from '@earendil-works/pi-tui';
import type { Report } from './task-usage.ts';

const safe = (text: string) => text.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const number = (value: number | null) => value === null ? 'unknown' : value.toLocaleString('en-US');
const money = (value: number | null) => value === null ? 'unknown' : `$${value > 0 && value < 0.000001 ? value.toPrecision(3) : value.toFixed(6)}`;
export function elapsed(ms: number | null): string {
  if (ms === null) return 'unknown time';
  const seconds = Math.floor(ms / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

// This component presents a snapshot. It never scans session history, changes a
// task boundary, or infers completion/progress from the amount of usage.
export class TaskDashboard {
  private details = false;
  private offset = 0;
  private pageSize = 1;
  private closed = false;
  private cache?: string[];
  private cacheKey = '';
  constructor(private report: Report, private tui: TUI, private theme: Theme, private keys: Pick<KeybindingsManager, 'matches'>, private done: () => void) {}
  invalidate() { this.cache = undefined; }
  handleInput(data: string) {
    if (this.closed) return;
    if (this.keys.matches(data, 'tui.select.cancel') || matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c') || data === 'q') {
      this.closed = true; this.done(); return;
    }
    if (data === 'd' || data === 'D') { this.details = !this.details; this.offset = 0; }
    else if (this.keys.matches(data, 'tui.select.up')) this.offset = Math.max(0, this.offset - 1);
    else if (this.keys.matches(data, 'tui.select.down')) this.offset++;
    else if (this.keys.matches(data, 'tui.select.pageUp')) this.offset = Math.max(0, this.offset - this.pageSize);
    else if (this.keys.matches(data, 'tui.select.pageDown')) this.offset += this.pageSize;
    else if (matchesKey(data, 'home')) this.offset = 0;
    else if (matchesKey(data, 'end')) this.offset = Number.MAX_SAFE_INTEGER;
    else return;
    this.invalidate(); this.tui.requestRender();
  }
  render(width: number): string[] {
    const height = Math.max(1, Math.floor(this.tui.terminal.rows * 0.8));
    const key = `${width}:${height}:${this.offset}:${this.details}`;
    if (this.cache && key === this.cacheKey) return this.cache;
    this.cacheKey = key;
    if (width <= 0) return this.cache = [''];
    const th = this.theme, r = this.report;
    const inset = width >= 32 ? 2 : 1;
    const inner = Math.max(1, width - 2 - inset * 2);
    const spacious = height >= 18;
    const gap = ' '.repeat(inset);
    const rows: string[] = [];
    const line = (text: string, color: Parameters<Theme['fg']>[0] = 'muted') => {
      for (const part of wrapTextWithAnsi(safe(text), inner)) rows.push(th.fg(color, part));
    };
    if (this.details) {
      line('Details', 'accent');
      line(`Source: ${r.source}`);
      line(`ID: ${r.id}`);
      line(`Started: ${r.startedAt ?? 'unknown'}`);
      line(`Finished: ${r.finishedAt ?? (r.status === 'active' ? 'not finished' : 'unknown')}`);
      line(''); line('Notes', 'accent');
      for (const warning of r.warnings) line(`• ${warning}`, 'warning');
      line('Reported cost is not an independently audited bill. Unknown fields are never estimated.');
      line('Elapsed time includes idle time. Tool calls are assistant-requested top-level calls only.');
      line('Snapshot at opening; reopen the report to refresh.');
      line('Export JSON/Markdown with /task-usage export (or the Workbench command with export).');
    } else {
      const partialCost = r.warnings.some(w => w.startsWith('Incomplete recorded fields:') && w.split(';')[0].includes('cost'));
      const cost = `Reported cost${partialCost ? ' (partial)' : ''}  ${money(r.totals.cost)}`;
      const activity = [`Model turns ${number(r.turns)}`, `Tool calls ${number(r.toolCalls)}`];
      const summary = [cost, ...activity].join('   ·   ');
      if (visibleWidth(summary) <= inner) {
        rows.push(th.fg('accent', cost) + th.fg('muted', `   ·   ${activity.join('   ·   ')}`));
      } else {
        line(cost, 'accent');
        for (const metric of activity) line(metric);
      }
      if (r.warnings.length) line(`${r.warnings.length} data notes · d for details (totals may be partial)`, 'warning');
      line('');
      const tokenKeys = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
      const complete = tokenKeys.every(key => r.totals[key] !== null) && !r.warnings.some(w => w.startsWith('Incomplete recorded fields:') && tokenKeys.some(key => w.split(';')[0].includes(key)));
      const sum = tokenKeys.reduce((sum, key) => sum + (r.totals[key] ?? 0), 0);
      line(complete ? 'Recorded token mix · not task progress' : 'Token counts · incomplete data', 'accent');
      const labels = ['Input', 'Output', 'Cache read', 'Cache write'];
      const colors = ['accent', 'success', 'muted', 'dim'] as const;
      const counts = tokenKeys.map(key => number(r.totals[key]));
      const countWidth = Math.max(...counts.map(count => count.length));
      const chartWidth = inner - (12 + 2 + countWidth + 2 + 2 + 6);
      const grid = inner >= 52 && chartWidth >= 8;
      const capped = grid ? chartWidth >= 10 : inner >= 24;
      const cap = capped ? th.fg('borderMuted', '│') : '';
      const barSize = grid ? Math.min(32, chartWidth - (capped ? 2 : 0)) : Math.max(0, Math.min(24, inner - (capped ? 12 : 10)));
      tokenKeys.forEach((key, i) => {
        const value = r.totals[key];
        const share = complete && sum > 0 && value !== null ? value / sum : undefined;
        const percent = share === undefined ? '' : `${(share * 100).toFixed(1)}%`;
        const filled = share === undefined ? 0 : Math.round(share * barSize);
        const bar = share === undefined || barSize < 4 ? '' : cap + th.fg(colors[i], '█'.repeat(filled) + '░'.repeat(barSize - filled)) + cap;
        if (grid) {
          const metric = `${labels[i].padEnd(12)}  ${counts[i].padStart(countWidth)}`;
          rows.push(th.fg(colors[i], metric) + (bar ? `  ${bar}  ${th.fg('muted', percent.padStart(6))}` : ''));
        } else {
          line(`${labels[i]}  ${counts[i]}`, colors[i]);
          if (percent) rows.push(`  ${bar ? `${bar}  ` : ''}${th.fg('muted', percent)}`);
        }
      });
      if (!complete) line('Usage-share bars unavailable for incomplete token fields.', 'dim');
      else if (sum === 0) line('No recorded tokens; usage shares are undefined.', 'dim');
      line(''); line('Models', 'accent');
      if (!r.byModel.length) line('No model usage recorded.');
      for (const [i, model] of r.byModel.entries()) {
        if (i && spacious) line('');
        line(`${model.provider}/${model.model}`, 'accent');
        line(`  ${number(model.turns)} turns · ${money(model.totals.cost)} reported`);
        line(`  Input ${number(model.totals.input)} · Output ${number(model.totals.output)}`);
        line(`  Cache read ${number(model.totals.cacheRead)} · write ${number(model.totals.cacheWrite)}`);
      }
    }
    if (spacious) rows.unshift('');
    this.pageSize = Math.max(1, height - 4 - Number(spacious));
    this.offset = Math.max(0, Math.min(this.offset, Math.max(0, rows.length - this.pageSize)));
    const controls = `Esc close · d ${this.details ? 'overview' : 'details'} · ${inner < 50 ? '↑↓ scroll' : '↑↓/PgUp/PgDn scroll'}`;
    const status = `${r.status.toUpperCase()}${r.warnings.length ? ` · ${r.warnings.length} notes` : ''} · ${elapsed(r.elapsedMs)} · snapshot`;
    const inside = (text: string) => {
      const fitted = truncateToWidth(text, inner);
      return th.fg('borderMuted', '│') + gap + fitted + ' '.repeat(Math.max(0, inner - visibleWidth(fitted))) + gap + th.fg('borderMuted', '│');
    };
    const border = (left: string, label: string, right: string) => {
      const title = truncateToWidth(label, Math.max(0, width - 2), '');
      return th.fg('borderMuted', left + title + '─'.repeat(Math.max(0, width - 2 - visibleWidth(title))) + right);
    };
    const window = rows.slice(this.offset, this.offset + this.pageSize);
    const position = rows.length > this.pageSize ? ` ${this.offset + 1}–${this.offset + window.length}/${rows.length} ` : '';
    const result = [border('╭', `─ Task usage · ${safe(r.task)} `, '╮'),
      inside(th.fg(r.status === 'finished' ? 'success' : r.status === 'active' ? 'accent' : 'muted', status)),
      ...window.map(inside), ...(spacious ? [inside(th.fg('borderMuted', '─'.repeat(inner)))] : []),
      inside(th.fg('dim', controls)), border('╰', position, '╯')];
    // Degrade safely on tiny terminals; all navigation remains available.
    return this.cache = (width < 5 || height < 5 ? [status, ...window, controls].slice(0, height) : result).map(row => truncateToWidth(row, width));
  }
}
