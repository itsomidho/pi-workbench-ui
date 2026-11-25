import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';

type Counts = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
type CallUsage = { shared?: Counts; own?: Counts };
const keys = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
export function reportedCounts(value: unknown): Counts | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const result: Counts = {};
  for (const key of keys) {
    const n = source[key];
    if (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) result[key] = n;
  }
  return Object.keys(result).length ? result : undefined;
}
const format = (n: number | undefined) => n === undefined ? '—' : n >= 1000000 ? `${(n / 1000000).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
export function formatUsage(usage?: Counts, theme?: Pick<Theme, 'fg'>): string {
  const paint = (color: 'accent' | 'success' | 'muted' | 'dim', text: string) => theme ? theme.fg(color, text) : text;
  if (!usage) return paint('dim', '—');
  return [paint(usage.input === undefined ? 'dim' : 'accent', `↑${format(usage.input)}`),
    paint(usage.output === undefined ? 'dim' : 'success', `↓${format(usage.output)}`),
    ...(usage.cacheRead ? [paint('muted', `R${format(usage.cacheRead)}`)] : []),
    ...(usage.cacheWrite ? [paint('muted', `W${format(usage.cacheWrite)}`)] : [])].join(' ');
}

// This is a presentation index, not a second accounting ledger. The same
// provider turn is deliberately shared by sibling calls and is never summed.
export class TokenUsageIndex {
  private calls = new Map<string, CallUsage>();
  latest?: Counts;
  hasTurn = false;
  reset() { this.calls.clear(); this.latest = undefined; this.hasTurn = false; }
  assistant(message: any) {
    if (message?.role !== 'assistant') return;
    const shared = reportedCounts(message.usage);
    this.latest = shared; this.hasTurn = true;
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block.type === 'toolCall' && typeof block.id === 'string') this.calls.set(block.id, { shared });
    }
  }
  result(id: string, usage: unknown) {
    const own = reportedCounts(usage);
    if (own) this.calls.set(id, { ...this.calls.get(id), own });
  }
  nested(id: string, parent: string) {
    this.calls.set(id, { shared: this.calls.get(parent)?.shared });
  }
  restore(entries: readonly any[]) {
    this.reset();
    for (const entry of entries) {
      if (entry.type !== 'message') continue;
      const message = entry.message;
      if (message?.role === 'assistant') this.assistant(message);
      if (message?.role === 'toolResult' && typeof message.toolCallId === 'string') this.result(message.toolCallId, message.usage);
    }
  }
  label(id: string, theme?: Pick<Theme, 'fg'>) {
    const usage = this.calls.get(id);
    const muted = (text: string) => theme ? theme.fg('muted', text) : text;
    return `${muted('shared turn:')} ${formatUsage(usage?.shared, theme)}${usage?.own ? `${muted(' · tool model:')} ${formatUsage(usage.own, theme)}` : ''}`;
  }
}

export function registerTokenUsage(pi: ExtensionAPI, enabled: () => boolean, redraw: () => void) {
  const index = new TokenUsageIndex();
  const publish = (ctx: ExtensionContext) => {
    if (ctx.hasUI) ctx.ui.setStatus('workbench-turn-usage', enabled() && index.hasTurn ? `turn: ${formatUsage(index.latest)}` : undefined);
    redraw();
  };
  const restore = (ctx: ExtensionContext) => { index.restore(ctx.sessionManager.getBranch()); publish(ctx); };
  pi.on('session_start', (_event, ctx) => restore(ctx));
  pi.on('session_tree', (_event, ctx) => restore(ctx));
  pi.on('message_end', (event, ctx) => {
    if (event.message.role === 'assistant') { index.assistant(event.message); publish(ctx); }
    else if (event.message.role === 'toolResult') { index.result(event.message.toolCallId, event.message.usage); redraw(); }
  });
  pi.on('tool_execution_start', event => {
    if (event.parentToolCallId) index.nested(event.toolCallId, event.parentToolCallId);
  });
  pi.on('tool_execution_end', event => { index.result(event.toolCallId, event.result?.usage); redraw(); });
  pi.on('session_shutdown', () => index.reset());
  return index;
}
