import { CustomEditor, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Text, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { stripVTControlCharacters } from 'node:util';
import { defaults, loadSettings, saveSetting, settingsPath } from './settings.ts';
import { registerAsk } from './ask.ts';

type Item = { text: string; status: 'pending' | 'in_progress' | 'completed' };
type Plan = { title: string; items: Item[] };
const empty = (): Plan => ({ title: 'Tasks', items: [] });
const clean = (s: string) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export function gutterLine(line: string, width: number, padding = 1): string {
  const pad = Math.min(padding, Math.max(0, Math.floor((width - 1) / 2)));
  const inner = Math.max(0, width - pad * 2);
  const text = truncateToWidth(line, inner);
  return ' '.repeat(pad) + text + ' '.repeat(Math.max(0, inner - visibleWidth(text)) + pad);
}

function gutter(child: Component, padding = 1): Component {
  let previous: string[] | undefined;
  let cached: string[] = [];
  let cachedWidth = -1;
  return {
    invalidate() { child.invalidate(); },
    render(width) {
      const pad = Math.min(padding, Math.max(0, Math.floor((width - 1) / 2)));
      const lines = child.render(Math.max(0, width - pad * 2));
      if (lines === previous && width === cachedWidth) return cached;
      previous = lines; cachedWidth = width;
      return cached = lines.map(line => gutterLine(line, width, padding));
    },
  };
}

// Keep the native renderers: syntax highlighting, diffs, images, and expansion
// still belong to Pi. Only add a thin frame; never intercept execution.
export function frame(child: Component, label: string | (() => string), edge: 'top' | 'bottom', color: (s: string) => string, outputHeading = false, layout = defaults, literalOutput = false): Component {
  let previous: string[] | undefined;
  let cached: string[] = [];
  let cacheKey = '';
  return {
    invalidate() { child.invalidate(); },
    render(width) {
      if (width < 4) return child.render(width).map(line => truncateToWidth(line, width));
      const inner = width - 2;
      const lead = '─'.repeat(Math.min(2, inner));
      const title = truncateToWidth(` ${typeof label === 'function' ? label() : label} `, inner - visibleWidth(lead), '');
      const rule = color((edge === 'top' ? '╭' : '╰') + lead + title + '─'.repeat(Math.max(0, inner - visibleWidth(lead) - visibleWidth(title))) + (edge === 'top' ? '╮' : '╯'));
      const padding = Math.min(layout.padding, Math.max(0, Math.floor((inner - 1) / 2)));
      const contentWidth = inner - padding * 2;
      const lines = child.render(contentWidth);
      const side = color('│');
      const key = `${width}:${rule}:${side}`;
      if (lines === previous && key === cacheKey) return cached;
      previous = lines; cacheKey = key;
      const hasOutput = lines.some(line => {
        const text = stripVTControlCharacters(line).trim();
        return text && (literalOutput || (text !== '(no output)' && !/^(?:Took|Elapsed) \d+(?:\.\d+)?(?:ms|s|m|h)(?:\s+\d+(?:\.\d+)?[smh])*$/.test(text)));
      });
      const body = (outputHeading && !hasOutput ? [] : lines).map(line => side + ' '.repeat(padding) + line + ' '.repeat(Math.max(0, contentWidth - visibleWidth(line)) + padding) + side);
      const heading = truncateToWidth(' Output ', inner - visibleWidth(lead), '');
      const separator = color('├' + lead + heading + '─'.repeat(Math.max(0, inner - visibleWidth(lead) - visibleWidth(heading))) + '┤');
      const blank = side + ' '.repeat(inner) + side;
      const space = Array(layout.verticalPadding).fill(blank);
      return cached = edge === 'top' ? [rule, ...space, ...body, ...space] : [...(outputHeading && hasOutput ? [separator, ...space] : []), ...body, ...(hasOutput ? space : []), rule];
    },
  };
}

export function toolTitle(name: string, args: any, activeTask?: string): string {
  if (name === 'bash' || name === 'powershell') {
    const first = typeof args?.command === 'string' ? args.command.split('\n').find((line: string) => line.trim())?.trim() : undefined;
    if (first?.startsWith('#') && !first.startsWith('#!')) return clean(first.replace(/^#+\s*/, ''));
    // Never borrow unrelated TODO text for concurrent tool calls.
    return first ? `${name} · ${clean(first)}` : name;
  }
  const path = args?.path ?? args?.file_path;
  return typeof path === 'string' ? `${name} · ${clean(path)}` : name;
}

export function preview(child: Component, limit: number, expanded: boolean, rawText = '', shell = false): Component {
  let previous: string[] | undefined, cached: string[] = [], cachedWidth = -1;
  return {
    invalidate() { child.invalidate(); previous = undefined; },
    render(width) {
      const source = child.render(width);
      if (source === previous && cachedWidth === width) return cached;
      previous = source; cachedWidth = width;
      let lines = source;
      const last = stripVTControlCharacters(source.at(-1) ?? '').trim();
      if (shell && /^(?:Took|Elapsed) \d/.test(last) && !rawText.split('\n').some(line => line.trim() === last)) lines = source.slice(0, -1);
      if (!expanded && lines.length > limit) return cached = [...lines.slice(0, limit), truncateToWidth(`… ${lines.length - limit} more lines · expand tool to view`, width)];
      return cached = lines;
    },
  };
}

export function validPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Plan;
  return typeof p.title === 'string' && p.title.length <= 120 && Array.isArray(p.items) && p.items.length <= 50 &&
    p.items.every(i => i && typeof i.text === 'string' && i.text.length > 0 && i.text.length <= 500 && ['pending', 'in_progress', 'completed'].includes(i.status)) &&
    p.items.filter(i => i.status === 'in_progress').length <= 1;
}

export function footerStats(entries: any[], branch: any[]) {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  let cacheHit: number | undefined;
  for (const entry of entries) {
    const message = entry.type === 'message' ? entry.message : undefined;
    const usage = message && ['assistant', 'toolResult'].includes(message.role) ? message.usage :
      ['usage', 'compaction', 'branch_summary'].includes(entry.type) ? entry.usage : undefined;
    if (!usage) continue;
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) totals[key] += number(usage[key]);
    totals.cost += number(usage.cost?.total);
    if (message?.role === 'assistant') {
      const prompt = number(usage.input) + number(usage.cacheRead) + number(usage.cacheWrite);
      cacheHit = prompt > 0 ? number(usage.cacheRead) / prompt * 100 : undefined;
    }
  }
  const last = branch.findLast(entry => entry.type === 'message' && entry.message.role === 'assistant')?.message;
  return { totals, cacheHit, last };
}

const formatTokens = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export default function (pi: ExtensionAPI) {
  let settings = { ...defaults };
  let settingsError: string | undefined;
  try { settings = loadSettings(); } catch (error: any) { settings.enabled = false; settingsError = error.message; }
  registerAsk(pi, () => settings.enabled, () => settings.padding);
  const pendingTitles = new Map<string, string>();
  const titles = new Map<string, string>();
  pi.registerTool({
    name: 'ui_title', label: 'Display title', executionMode: 'sequential',
    description: 'Set a short display description for the next call of a named tool. Does not execute that tool.',
    promptGuidelines: ['Use ui_title before a tool call to describe its task, or start shell commands with a descriptive # comment.'],
    parameters: Type.Object({ tool: Type.String({ minLength: 1, maxLength: 120 }), description: Type.String({ minLength: 1, maxLength: 120 }) }),
    async execute(_id, args) {
      pendingTitles.set(args.tool, clean(args.description));
      return { content: [{ type: 'text', text: 'Title set' }], details: undefined };
    },
  });
  pi.on('tool_call', event => {
    const title = pendingTitles.get(event.toolName);
    if (title) { titles.set(event.toolCallId, title); pendingTitles.delete(event.toolName); pi.appendEntry('workbench-title', { id: event.toolCallId, title }); }
  });
  pi.on('agent_settled', () => pendingTitles.clear());
  pi.registerCommand('ui', {
    description: 'reset | enable | settings | set <key> <value>',
    handler: async (args, ctx) => {
      const [action, key, ...parts] = args.trim().split(/\s+/);
      try {
        if (action === 'reset' || action === 'enable') settings = saveSetting(settings, 'enabled', action === 'enable');
        else if (action === 'set') {
          let value: unknown; try { value = JSON.parse(parts.join(' ')); } catch { value = parts.join(' '); }
          settings = saveSetting(settings, key, value);
        } else { ctx.ui.notify(settingsPath() + '\n' + JSON.stringify(settings, null, 2), 'info'); return; }
        await ctx.reload();
      } catch (error: any) { ctx.ui.notify(error.message, 'error'); }
    },
  });
  let plan = empty();
  let visible = true;
  const refresh = (ctx: ExtensionContext) => {
    if (ctx.mode !== 'tui') return;
    ctx.ui.setWidget('todos', settings.enabled && settings.todos && visible ? (_tui, theme) => ({
      invalidate() {},
      render(width: number) {
        const done = plan.items.filter(i => i.status === 'completed').length;
        const active = plan.items.findIndex(i => i.status === 'in_progress');
        const start = Math.max(0, active - 2);
        const shown = plan.items.slice(start, start + 7);
        return ['', theme.fg('accent', `TODO · ${clean(plan.title)} · ${done}/${plan.items.length}`),
          ...(start ? [theme.fg('dim', `  … ${start} earlier`)] : []),
          ...(shown.length ? shown.map(i => theme.fg(i.status === 'in_progress' ? 'accent' : i.status === 'completed' ? 'success' : 'dim',
            `  ${i.status === 'completed' ? '✓' : i.status === 'in_progress' ? '▸' : '□'}  ${clean(i.text)}`)) : [theme.fg('dim', '  No tasks yet · use /think to discuss and plan your task')]),
          ...(start + shown.length < plan.items.length ? [theme.fg('dim', '  … /todos all for full list')] : []),
          '',
        ].map(line => gutterLine(line, width, settings.padding));
      },
    }) : undefined);
  };
  const restore = (ctx: ExtensionContext) => {
    plan = empty();
    titles.clear(); pendingTitles.clear();
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === 'custom' && e.customType === 'workbench-title' && typeof (e.data as any)?.id === 'string' && typeof (e.data as any)?.title === 'string') titles.set((e.data as any).id, (e.data as any).title);
      if (e.type === 'custom' && ['workbench-plan', 'omp-plan'].includes(e.customType) && validPlan(e.data)) plan = structuredClone(e.data);
    }
    refresh(ctx);
  };
  pi.on('input', (event, ctx) => {
    // Only new human/API prompts start a fresh completed plan. Internal
    // follow-ups, commands and empty inputs must not discard the display.
    const isCommand = /^\/[\w-]+(?::[\w-]+)?(?:\s|$)/.test(event.text.trimStart());
    if (event.source === 'extension' || (!event.text.trim() && !event.images?.length) || isCommand) return;
    if (plan.items.length === 0 || !plan.items.every(item => item.status === 'completed')) return;
    plan = empty();
    pi.appendEntry('workbench-plan', plan);
    refresh(ctx);
  });
  pi.registerTool({
    name: 'todo_plan', label: 'TODO',
    description: 'Replace the session TODO plan. Send the complete list, keeping completed steps. At most one step may be in_progress.',
    promptSnippet: 'Maintain the visible session TODO panel',
    promptGuidelines: ['Use todo_plan for multi-step implementation work after approval, and update it as each step starts or completes. Do not mark unchecked work completed.'],
    executionMode: 'sequential',
    parameters: Type.Object({ title: Type.String({ maxLength: 120 }), items: Type.Array(Type.Object({ text: Type.String({ minLength: 1, maxLength: 500 }), status: Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed')]) }), { maxItems: 50 }) }),
    async execute(_id, params, signal, _update, ctx) {
      if (signal?.aborted) throw new Error('Cancelled');
      if (!validPlan(params)) throw new Error('Invalid plan: at most one active step is allowed');
      plan = structuredClone(params);
      // Custom entries also persist when invoked from codemode (nested tool
      // results are not separate transcript entries).
      pi.appendEntry('workbench-plan', plan);
      refresh(ctx);
      return { content: [{ type: 'text', text: `${plan.title}: ${plan.items.filter(i => i.status === 'completed').length}/${plan.items.length} completed` }], details: structuredClone(plan) };
    },
  });
  pi.registerCommand('todos', {
    description: 'Toggle TODO panel; use all to show the full plan',
    handler: async (args, ctx) => {
      if (args.trim() === 'all') {
        ctx.ui.notify(plan.items.map(i => `[${i.status}] ${i.text}`).join('\n') || 'No tasks', 'info');
      } else { visible = !visible; refresh(ctx); }
    },
  });
  pi.on('session_tree', (_event, ctx) => restore(ctx));
  pi.on('session_start', (_event, ctx) => {
    if (settingsError && ctx.hasUI) ctx.ui.notify(`${settingsError}. UI disabled; use /ui reset to repair settings.`, 'error');
    restore(ctx);
    if (ctx.mode !== 'tui' || !settings.enabled) return;
    // Do not replace an editor already owned by another extension.
    if (!ctx.ui.getEditorComponent()) {
      ctx.ui.setEditorComponent((tui, theme, keys) => {
        class WorkbenchEditor extends CustomEditor {
          protected renderTopBorder(width: number, hiddenLineCount: number): string {
            const inset = Math.min(settings.padding, Math.max(0, Math.floor((width - 1) / 2)));
            return ' '.repeat(inset) + super.renderTopBorder(Math.max(0, width - inset * 2), hiddenLineCount) + ' '.repeat(inset);
          }
          render(width: number) {
            this.borderColor = text => ctx.ui.theme.fg('borderMuted', text);
            const lines = [...super.render(width)];
            if (lines.length >= 2) {
              const inset = Math.min(settings.padding, Math.max(0, Math.floor((width - 1) / 2)));
              const border = ' '.repeat(inset) + ctx.ui.theme.fg('borderMuted', '─'.repeat(Math.max(0, width - inset * 2))) + ' '.repeat(inset);
              lines[lines.length - 1] = border;
            }
            return lines;
          }
        }
        return new WorkbenchEditor(tui, theme, keys, { paddingX: settings.padding, embedWorkingStatus: true });
      });
    }
    ctx.ui.setFooter((tui, theme, data) => {
      const unsubscribe = data.onBranchChange(() => tui.requestRender());
      let leaf: string | null | undefined;
      let stats = footerStats([], []);
      let cachedUsage: ReturnType<ExtensionContext['getContextUsage']>;
      let usageModel: unknown;
      return {
        dispose: unsubscribe,
        // Theme invalidation must not rebuild session projections on each key.
        invalidate() {},
        render(width) {
          const current = ctx.sessionManager.getLeafId();
          const changed = leaf !== current;
          if (changed) {
            leaf = current;
            stats = footerStats(ctx.sessionManager.getEntries(), ctx.sessionManager.getBranch());
          }
          if (changed || usageModel !== ctx.model) {
            usageModel = ctx.model;
            cachedUsage = ctx.getContextUsage();
          }
          const usage = cachedUsage;
          const branch = data.getGitBranch();
          const cwd = process.env.HOME && ctx.cwd.startsWith(process.env.HOME + '/') ? '~' + ctx.cwd.slice(process.env.HOME.length) : ctx.cwd;
          const sessionName = ctx.sessionManager.getSessionName();
          const location = clean(`${cwd}${branch ? ` (${branch})` : ''}${sessionName ? ` · ${sessionName}` : ''}`);
          const { totals, cacheHit, last } = stats;
          const window = usage?.contextWindow ?? ctx.model?.contextWindow;
          const usageLine = [
            `↑${formatTokens(totals.input)}`, `↓${formatTokens(totals.output)}`,
            ...(totals.cacheRead ? [`R${formatTokens(totals.cacheRead)}`] : []),
            ...(totals.cacheWrite ? [`W${formatTokens(totals.cacheWrite)}`] : []),
            ...(cacheHit != null && (totals.cacheRead || totals.cacheWrite) ? [`CH${cacheHit.toFixed(1)}%`] : []),
            `$${totals.cost.toFixed(3)}`,
            `ctx ${usage?.percent != null ? usage.percent.toFixed(1) + '%' : '?'}${window ? '/' + formatTokens(window) : ''}`,
          ].join(' ');
          const selected = ctx.model ? `${ctx.model.provider ? ctx.model.provider + '/' : ''}${ctx.model.id}` : 'no model';
          const physical = last?.provider && last?.model && last.provider !== 'router' ? `${last.provider}/${last.model}` : undefined;
          const routed = ctx.model?.provider === 'router';
          const modelLine = clean(`${selected} · ${pi.getThinkingLevel()}${routed ? ` → ${physical ?? 'unknown'}${physical && last.thinkingLevel ? ` · ${last.thinkingLevel}` : ''}` : physical && physical !== selected ? ` · last: ${physical}` : ''}`);
          // Preserve ALL setStatus entries, including pi-usage-status and router.
          const statuses = [...data.getExtensionStatuses().entries()].map(([key, value]) => {
            if (key !== 'usage-limits') return value;
            // This extension right-aligns its duplicate phase using NBSPs
            // against the full terminal width. Our gutter reduces that width.
            return stripVTControlCharacters(value).replace(/\u00a0+(?:Thinking|Running tools)\s*$/, '').trimEnd();
          }).filter(Boolean).join(' · ');
          const inner = Math.max(0, width - Math.min(settings.padding, Math.max(0, Math.floor((width - 1) / 2))) * 2);
          if (inner === 0) return [''];
          const rows = settings.footer === 'compact' ? [] : [location];
          if (visibleWidth(usageLine) + visibleWidth(modelLine) + 2 <= inner) {
            rows.push(usageLine + ' '.repeat(inner - visibleWidth(usageLine) - visibleWidth(modelLine)) + modelLine);
          } else {
            // Keep the model visible instead of clipping it after usage stats.
            rows.push(modelLine, usageLine);
          }
          if (statuses) rows.push(stripVTControlCharacters(statuses).replace(/[\r\n]/g, ' '));
          return rows.flatMap(row => wrapTextWithAnsi(row, inner)).map(line => gutterLine(theme.fg('muted', line), width, settings.padding));
        },
      };
    });
  });
  // Pi passes our outer wrapper back as lastComponent. Native renderers
  // expect their own Text/Container instance, not that wrapper.
  const nativeComponents = new WeakMap<Component, Component>();
  const nativeContext = (context: any) => ({
    ...context,
    lastComponent: context.lastComponent ? nativeComponents.get(context.lastComponent) : undefined,
  });
  const remember = (wrapped: Component, child: Component) => {
    nativeComponents.set(wrapped, child);
    return wrapped;
  };
  pi.registerToolRenderer((_name, next) => {
    const original = next();
    // The built-in edit tool owns a plain Box, which is safe to frame.
    // Leave other self-rendered tools (possibly interactive) untouched.
    if (!settings.enabled || !original || (original.renderShell === 'self' && _name !== 'edit')) return original;
    const childTheme = (theme: any) => _name === 'edit' ? Object.assign(Object.create(theme), {
      bg: (color: any, text: string) => ['toolPendingBg', 'toolSuccessBg', 'toolErrorBg'].includes(color) ? text : theme.bg(color, text),
    }) : theme;
    const childContext = (context: any) => ({ ...nativeContext(context), ...(_name === 'edit' ? { outputPad: 0 } : {}) });
    return {
      ...original, renderShell: 'self',
      renderCall(args, theme, context) {
        const child = original.renderCall?.(args, childTheme(theme), childContext(context)) ?? new Text(_name, 0, 0);
        const state = context.state ??= {};
        return remember(gutter(frame(child, titles.get(context.toolCallId) ?? toolTitle(_name, args), 'top', s => theme.fg(
          state.workbenchBorderStatus ?? (context.isError ? settings.errorColor : context.durationMs != null ? settings.successColor : context.executionStarted ? settings.runningColor : settings.pendingColor), s), false, settings), settings.padding), child);
      },
      renderResult(result, options, theme, context) {
        const child = original.renderResult?.(result, options, childTheme(theme), childContext(context)) ?? new Text(result.content.map(c => c.type === 'text' ? c.text : '[image]').join('\n'), 0, 0);
        const state = context.state ??= {};
        const label = () => {
          const elapsed = context.durationMs ?? (options.isPartial && state.startedAt != null ? Date.now() - state.startedAt : undefined);
          const timeout = context.args?.timeout;
          const timing = elapsed == null ? '' : ` · ◷ ${(elapsed / 1000).toFixed(2)}s${typeof timeout === 'number' && timeout > 0 ? `/${timeout.toFixed(1)}s` : ''}`;
          return `${options.isPartial ? 'running' : context.isError ? 'error' : 'done'}${timing}`;
        };
        state.workbenchBorderStatus = options.isPartial ? settings.runningColor : context.isError ? settings.errorColor : settings.successColor;
        return remember(gutter(frame(preview(child, settings.previewLines, options.expanded || context.isError, result.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') ?? '', ['bash', 'powershell'].includes(_name)), label, 'bottom', s => theme.fg(state.workbenchBorderStatus, s), true, settings, result.content?.some((c: any) => c.type === 'text' && c.text?.trim() && c.text.trim() !== '(no output)')), settings.padding), child);
      },
    };
  });
}
