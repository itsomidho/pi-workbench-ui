import type { ExtensionAPI, Theme } from '@earendil-works/pi-coding-agent';
import { Input, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type TUI, type KeybindingsManager } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

export type AskParams = { question: string; context?: string; options: string[] };
export type AskAnswer = { status: 'answered'; answer: string; custom: boolean; index: number | null } | { status: 'cancelled' | 'unavailable'; answer: null };
const safe = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');

export class AskBox {
  private selected = 0;
  private editing = false;
  private closed = false;
  private input = new Input();
  private isFocused = false;
  private cache?: string[];
  private width = -1;
  constructor(private params: AskParams, private tui: TUI, private theme: Theme, private keys: Pick<KeybindingsManager, 'matches'>, private done: (answer: AskAnswer) => void, private padding = 1) {
    this.input.onSubmit = value => {
      if (value.trim()) this.finish({ status: 'answered', answer: value.trim(), custom: true, index: null });
    };
  }
  get focused() { return this.isFocused; }
  set focused(value: boolean) { this.isFocused = value; this.input.focused = value && this.editing; this.invalidate(); }
  invalidate() { this.cache = undefined; this.input.invalidate(); }
  private refresh() { this.invalidate(); this.tui.requestRender(); }
  private finish(answer: AskAnswer) { if (!this.closed) { this.closed = true; this.done(answer); } }
  cancel() { this.finish({ status: 'cancelled', answer: null }); }
  handleInput(data: string) {
    if (this.closed) return;
    if (this.keys.matches(data, 'tui.select.cancel') || matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) { this.cancel(); return; }
    if (this.editing) { this.input.handleInput(data); this.refresh(); return; }
    if (this.keys.matches(data, 'tui.select.up')) this.selected = Math.max(0, this.selected - 1);
    else if (this.keys.matches(data, 'tui.select.down')) this.selected = Math.min(this.params.options.length, this.selected + 1);
    else if (this.keys.matches(data, 'tui.select.confirm')) {
      if (this.selected === this.params.options.length) { this.editing = true; this.input.focused = this.focused; }
      else this.finish({ status: 'answered', answer: this.params.options[this.selected], custom: false, index: this.selected });
    } else return;
    this.refresh();
  }
  render(width: number): string[] {
    if (this.cache && this.width === width) return this.cache;
    this.width = width;
    if (width <= 0) return this.cache = [''];
    const outer = Math.min(this.padding, Math.max(0, Math.floor((width - 5) / 2)));
    const boxWidth = width - outer * 2;
    const inner = Math.max(1, boxWidth - 4);
    const th = this.theme;
    const content: string[] = [];
    const wrapped = (text: string, color: any, max: number) => {
      const rows = wrapTextWithAnsi(safe(text), inner);
      for (const row of rows.slice(0, max)) content.push(th.fg(color, row));
      if (rows.length > max) content.push(th.fg('dim', '…'));
    };
    if (this.params.context) { wrapped(this.params.context, 'muted', 4); content.push(''); }
    wrapped(this.params.question, 'accent', 4);
    content.push('');
    const start = Math.max(0, this.selected - 3);
    const options = [...this.params.options, 'Other: type your own'];
    if (start) content.push(th.fg('dim', '↑ more choices'));
    options.slice(start, start + 5).forEach((text, i) => {
      const selected = start + i === this.selected;
      content.push(th.fg(selected ? 'accent' : 'muted', truncateToWidth(`${selected ? '▸' : ' '} ${selected ? '◉' : '○'}  ${safe(text)}`, inner)));
    });
    if (start + 5 < options.length) content.push(th.fg('dim', '↓ more choices'));
    if (this.editing) { content.push(''); content.push(...this.input.render(inner)); }
    content.push('', th.fg('dim', truncateToWidth(this.editing ? 'Enter submit · Esc cancel' : '↑↓ choose · Enter submit · Esc cancel', inner)));
    if (boxWidth < 5) return this.cache = content.map(line => truncateToWidth(line, width));
    const border = (left: string, label: string, right: string) => {
      const title = truncateToWidth(label, boxWidth - 2, '');
      return ' '.repeat(outer) + th.fg('borderMuted', left + title + '─'.repeat(Math.max(0, boxWidth - 2 - visibleWidth(title))) + right) + ' '.repeat(outer);
    };
    return this.cache = [border('╭', '── Ask ', '╮'),
      ...content.map(line => {
        const fitted = truncateToWidth(line, inner);
        return ' '.repeat(outer) + th.fg('borderMuted', '│') + ' ' + fitted + ' '.repeat(Math.max(0, inner - visibleWidth(fitted))) + ' ' + th.fg('borderMuted', '│') + ' '.repeat(outer);
      }),
      border('╰', '', '╯')];
  }
}

export function registerAsk(pi: ExtensionAPI, enabled: () => boolean, padding: () => number) {
  pi.registerTool({
    name: 'ask_user', label: 'Ask', executionMode: 'sequential',
    description: 'Ask the user a question with choices and an Other typed answer. Cancellation or unavailability is never approval; this tool performs no action beyond collecting an answer.',
    promptGuidelines: ['Use ask_user when clarification or an explicit user choice is needed. A cancelled or unavailable answer is not consent.'],
    parameters: Type.Object({ question: Type.String({ minLength: 1, maxLength: 1000 }), context: Type.Optional(Type.String({ maxLength: 4000 })), options: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 12 }) }),
    async execute(_id, params, signal, _update, ctx) {
      const result = (answer: AskAnswer) => ({ content: [{ type: 'text' as const, text: JSON.stringify(answer) }], details: { question: params.question, ...answer } });
      if (signal?.aborted) return result({ status: 'cancelled', answer: null });
      if (ctx.mode !== 'tui' || !enabled()) return result({ status: 'unavailable', answer: null });
      let cancel: (() => void) | undefined;
      const aborted = () => cancel?.();
      try {
        const answer = await ctx.ui.custom<AskAnswer>((tui, theme, keys, done) => {
          const box = new AskBox(params, tui, theme, keys, done, padding());
          cancel = () => box.cancel();
          signal?.addEventListener('abort', aborted, { once: true });
          if (signal?.aborted) box.cancel();
          return box;
        }, { blocked: { kind: 'question', message: params.question } });
        return result(signal?.aborted || !answer ? { status: 'cancelled', answer: null } : answer);
      } finally { signal?.removeEventListener('abort', aborted); cancel = undefined; }
    },
  });
}
