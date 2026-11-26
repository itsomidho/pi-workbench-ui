import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { CURSOR_MARKER, renderFakeCursor, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

const unsafeChar = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function promptText(content: unknown): string {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('') : '';
}

export class PromptHistory {
  private entries: string[] = [];
  clear() { this.entries = []; }
  remember(text: string) {
    const value = text.trim();
    if (!value || value.length > 500 || /^[!/@]/.test(value) || unsafeChar.test(value)) return;
    this.entries = [value, ...this.entries.filter(entry => entry !== value)].slice(0, 100);
  }
  suffix(draft: string): string | undefined {
    // Don't compete with Pi's command menus, shell mode, or pending file completion.
    if (draft.trim().length < 3 || /^[\s]*[!/@]/.test(draft) || unsafeChar.test(draft) || /(?:^|\s)(?:@(?:"[^"]*|\S*)|(?:\.{1,2}|~)?[\\/]\S*)$/.test(draft)) return;
    const prefix = draft.toLowerCase();
    return this.entries.find(entry => entry.length > draft.length && entry.slice(0, draft.length).toLowerCase() === prefix)?.slice(draft.length);
  }
}

export function renderHistoryGhost(row: string, suffix: string, width: number, inset: number, dim: (text: string) => string): string | undefined {
  const cursor = row.indexOf(CURSOR_MARKER + renderFakeCursor(' '));
  if (cursor < 0) return;
  const before = row.slice(0, cursor);
  const room = width - inset - visibleWidth(before);
  const first = graphemes.segment(suffix)[Symbol.iterator]().next().value?.segment;
  if (!first || visibleWidth(first) <= 0 || visibleWidth(first) > room) return;
  // Keep at least the first real grapheme, even if an ellipsis won't fit.
  const fitted = truncateToWidth(suffix, room);
  const preview = fitted.startsWith(first) ? fitted : first;
  return before + CURSOR_MARKER + dim(renderFakeCursor(first) + preview.slice(first.length)) + ' '.repeat(width - visibleWidth(before) - visibleWidth(preview));
}

const prefix = 'Suggested next prompt: ';
const guidance = `If there is a concrete, useful next step for the user, optionally end your final response with one standalone line in this exact format: ${prefix}<a short prompt written from the user's perspective>. Keep it below 180 characters, outside code fences, and omit it if no useful next step remains or you are waiting for an answer or approval. Use plain text, not a shell or slash command. Do not call a tool or start any additional work to generate this line.`;

/** Recognize only an explicit final assistant line, never a tool result or example inside a code fence. */
export function parseSuggestion(text: string): string | undefined {
  const lines = text.trimEnd().split(/\r?\n/);
  const last = lines.pop();
  if (!last?.startsWith(prefix)) return;
  let fence: string | undefined;
  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const [, delimiter, tail] = match;
    if (!fence && (delimiter[0] !== '`' || !tail.includes('`'))) fence = delimiter;
    else if (fence && delimiter[0] === fence[0] && delimiter.length >= fence.length && !tail.trim()) fence = undefined;
  }
  const suggestion = last.slice(prefix.length).trim();
  if (!fence && suggestion && suggestion.length <= 180 && !/^[/!]/.test(suggestion) && !unsafeChar.test(suggestion)) return suggestion;
}

export function registerPromptSuggestions(pi: ExtensionAPI, enabled: () => boolean, redraw: () => void) {
  const active = (ctx: ExtensionContext) => ctx.mode === 'tui' && enabled();
  let armed = false;
  let candidate: string | undefined;
  let shown: string | undefined;
  const show = (value?: string) => {
    if (value === shown) return;
    shown = value;
    redraw();
  };
  const reset = () => { armed = false; candidate = undefined; show(); };
  pi.on('session_start', reset);
  pi.on('session_tree', reset);
  pi.on('session_shutdown', reset);
  pi.on('before_agent_start', (event, ctx) => {
    reset();
    if (event.messageType !== 'user' || !active(ctx)) return;
    armed = true;
    (event.systemPromptOptions.promptGuidelines ??= []).push(guidance);
  });
  pi.on('agent_start', () => { candidate = undefined; show(); });
  pi.on('message_end', (event, ctx) => {
    if (!armed || !active(ctx) || event.message.role !== 'assistant') return;
    const { content, stopReason } = event.message;
    candidate = stopReason === 'stop' && content.at(-1)?.type === 'text' && !content.some(block => block.type === 'toolCall')
      ? parseSuggestion(content.filter(block => block.type === 'text').map(block => block.text).join('\n')) : undefined;
  });
  pi.on('agent_settled', (event, ctx) => {
    show(armed && active(ctx) && !event.aborted ? candidate : undefined);
    armed = false;
    candidate = undefined;
  });
  return {
    current: () => enabled() ? shown : undefined,
    clear: () => show(),
  };
}
