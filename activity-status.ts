import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { truncateToWidth } from '@earendil-works/pi-tui';
import { stripVTControlCharacters } from 'node:util';

const waiting = 'Waiting for model';
const writing = 'Writing reply';
const label = (value: string) => truncateToWidth(stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim(), 64);

export function activityToolLabel(name: string, args: unknown, title?: string): string {
  if (title) {
    const fitted = label(title);
    if (fitted) return fitted;
  }
  const data = args && typeof args === 'object' ? args as Record<string, unknown> : {};
  if (name === 'bash' || name === 'powershell') {
    // The optional leading comment is the same title convention as the tool frame.
    // Never print the command body, arguments or output in the spinner.
    const first = typeof data.command === 'string' ? data.command.trimStart().split(/\r?\n/, 1)[0] : '';
    const comment = first.startsWith('#') && !first.startsWith('#!') ? label(first.replace(/^#+\s*/, '')) : '';
    return comment || 'Running shell command';
  }
  const verbs = { read: 'Reading', edit: 'Editing', write: 'Writing' } as const;
  if (name === 'read' || name === 'edit' || name === 'write') {
    const path = data.path ?? data.file_path;
    const basename = typeof path === 'string' ? path.split(/[\\/]/).filter(Boolean).at(-1) : undefined;
    return label(`${verbs[name]} ${basename || 'file'}`);
  }
  if (name === 'grep' || name === 'find') return 'Searching files';
  if (name === 'ls') return 'Listing files';
  if (name === 'codemode') return 'Running tools';
  return label(`Running ${name.replace(/[_-]+/g, ' ')}`) || 'Running tool';
}

export function registerActivityStatus(pi: ExtensionAPI, enabled: () => boolean, toolTitle: (id: string) => string | undefined, showChars: () => boolean = () => false) {
  let running = false;
  let phase = waiting;
  let chars = 0, lastCountUpdate = -Infinity, pendingHighSurrogate = false;
  const resetCount = () => { chars = 0; lastCountUpdate = -Infinity; pendingHighSurrogate = false; };
  let shown: string | undefined;
  const tools = new Map<string, { label: string; parent?: string }>();
  const active = (ctx: ExtensionContext) => ctx.mode === 'tui' && enabled();
  const publish = (ctx: ExtensionContext, value?: string) => {
    if (value === shown) return;
    shown = value;
    if (ctx.mode === 'tui') ctx.ui.setWorkingMessage(value);
  };
  const refresh = (ctx: ExtensionContext) => {
    if (!running || !active(ctx)) return;
    const parents = new Set([...tools.values()].map(tool => tool.parent));
    const leaves = [...tools].filter(([id]) => !parents.has(id));
    publish(ctx, leaves.length > 1 ? `Running ${leaves.length} tools` : leaves[0]?.[1].label ?? phase);
  };
  const reset = (ctx: ExtensionContext) => { running = false; phase = waiting; resetCount(); tools.clear(); publish(ctx); };
  const setPhase = (ctx: ExtensionContext, next: string) => {
    if (next === phase) return;
    phase = next;
    refresh(ctx);
  };
  pi.on('agent_start', (_event, ctx) => {
    running = active(ctx); phase = waiting; resetCount(); tools.clear();
    if (running) refresh(ctx);
  });
  pi.on('turn_start', (_event, ctx) => {
    resetCount();
    if (running && !tools.size) setPhase(ctx, waiting);
  });
  pi.on('message_update', (event, ctx) => {
    if (!running || event.message.role !== 'assistant') return;
    const update = event.assistantMessageEvent;
    if (update.type === 'text_start') pendingHighSurrogate = false;
    if (update.type === 'thinking_delta') setPhase(ctx, 'Thinking');
    if (update.type !== 'text_delta') return;
    if (!showChars()) { setPhase(ctx, writing); return; }
    if (!update.delta) return;
    // Count Unicode code points in the reply stream, never reasoning or tokens.
    // A provider can split a surrogate pair between chunks of one text block.
    const first = update.delta.charCodeAt(0);
    if (pendingHighSurrogate && first >= 0xdc00 && first <= 0xdfff) chars--;
    for (const _ of update.delta) chars++;
    const last = update.delta.charCodeAt(update.delta.length - 1);
    pendingHighSurrogate = last >= 0xd800 && last <= 0xdbff;
    const now = performance.now();
    if (!phase.startsWith(writing) || now - lastCountUpdate >= 125) {
      lastCountUpdate = now;
      setPhase(ctx, `${writing} · ${chars.toLocaleString('en-US')} ${chars === 1 ? 'char' : 'chars'}`);
    }
  });
  pi.on('message_end', (event, ctx) => {
    if (running && event.message.role === 'assistant' && event.message.stopReason === 'toolUse') setPhase(ctx, 'Preparing tools');
  });
  pi.on('tool_execution_start', (event, ctx) => {
    if (!running) return;
    tools.set(event.toolCallId, { label: activityToolLabel(event.toolName, event.args, toolTitle(event.toolCallId)), parent: event.parentToolCallId });
    refresh(ctx);
  });
  pi.on('tool_execution_end', (event, ctx) => {
    if (!tools.delete(event.toolCallId)) return;
    phase = waiting;
    refresh(ctx);
  });
  pi.on('agent_settled', (_event, ctx) => reset(ctx));
  pi.on('session_start', (_event, ctx) => reset(ctx));
  pi.on('session_tree', (_event, ctx) => reset(ctx));
  pi.on('session_shutdown', (_event, ctx) => reset(ctx));
  return {
    updateTitle(ctx: ExtensionContext, id: string, title: string) {
      const tool = tools.get(id), fitted = label(title);
      if (!tool || !fitted || fitted === tool.label) return;
      tool.label = fitted;
      refresh(ctx);
    },
  };
}
