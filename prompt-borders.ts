import { UserMessageComponent, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { visibleWidth, truncateToWidth, sliceByColumn } from '@earendil-works/pi-tui';
import { stripVTControlCharacters } from 'node:util';
import type { UISettings } from './settings.ts';

// Pi exposes the component but currently has no user-message renderer hook.
// Decorate only its render method; preserve native Markdown, zones and text.
export function registerPromptBorders(pi: ExtensionAPI, getSettings: () => UISettings) {
  let restore: (() => void) | undefined;
  const install = (ctx: ExtensionContext) => {
    restore?.(); restore = undefined;
    const settings = getSettings();
    if (ctx.mode !== 'tui' || !settings.enabled || !settings.promptBorders) return;
    const original = UserMessageComponent.prototype.render;
    const cache = new WeakMap<object, { source: string[]; key: string; lines: string[] }>();
    const reset = '\x1b[0m';
    const paint = (text: string) => {
      const color = getSettings().promptBorderColor;
      if (/^#[0-9a-f]{6}$/i.test(color)) {
        const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
        return `${reset}\x1b[38;2;${channels.join(';')}m${text}${reset}`;
      }
      // Border cells must use the terminal background. Filling these cells
      // colors the outer half of each glyph too, creating a visible blue halo.
      return reset + ctx.ui.theme.fg(color as any, text) + reset;
    };
    function bordered(this: UserMessageComponent, width: number): string[] {
      const current = getSettings();
      if (!current.enabled || !current.promptBorders || width < 8) return original.call(this, width);
      if (current.promptStyle === 'right') {
        const label = truncateToWidth(current.promptLabel, Math.max(0, width - 11));
        const prefixWidth = label ? visibleWidth(label) + 2 : 0;
        const nativeWidth = width - 1 - prefixWidth;
        const source = original.call(this, nativeWidth);
        if (!source.length) return source;
        const fill = (text: string) => ctx.ui.theme.bg('userMessageBg', text);
        const bar = fill(paint('▉').slice(reset.length));
        const indent = Math.min(pi.getSettings?.().outputPad ?? 1, nativeWidth);
        const key = `right:${width}:${indent}:${label}:${bar}`;
        const previous = cache.get(this);
        if (previous?.source === source && previous.key === key) return previous.lines;
        const first = source.findIndex(line => stripVTControlCharacters(line).trim() !== '');
        const lines = source.map((nativeLine, index) => {
          // A normal first text row carries no zone marker (Pi puts those on its padding rows).
          const line = label && index === first
            ? fill(' '.repeat(indent) + label + ': ') + sliceByColumn(nativeLine, indent, nativeWidth - indent)
            : (prefixWidth ? fill(' '.repeat(prefixWidth)) : '') + nativeLine;
          return line + reset + fill(' '.repeat(Math.max(0, width - 1 - visibleWidth(line)))) + bar;
        });
        cache.set(this, { source, key, lines });
        return lines;
      }
      const pad = Math.min(current.padding, Math.max(0, Math.floor((width - 6) / 2)));
      const panelWidth = width - pad * 2;
      // Keep the thin outline aligned with the shared panel gutter.
      const inner = panelWidth - 2;
      // Keep the approved side spacing: one native column plus one filled
      // column. Remove only Pi's single outer padding row at each end below.
      const extra = inner >= 6 ? 1 : 0;
      const available = inner - extra * 2;
      const labelRoom = current.promptStyle === 'accent' ? Math.max(0, available - 10) : 0;
      const label = labelRoom ? truncateToWidth(current.promptLabel, labelRoom) : '';
      const prefixWidth = label ? visibleWidth(label) + 2 : 0;
      const source = original.call(this, available - prefixWidth);
      if (!source.length) return source;
      const key = `${width}:${pad}:${current.promptStyle}:${current.promptLabel}:${paint('│')}:${ctx.ui.theme.bg('userMessageBg', ' ')}`;
      const previous = cache.get(this);
      if (previous?.source === source && previous.key === key) return previous.lines;
      const gutter = ' '.repeat(pad);
      const fill = (length: number) => ctx.ui.theme.bg('userMessageBg', ' '.repeat(length));
      if (current.promptStyle === 'accent') {
        const accent = paint(ctx.ui.theme.bg('userMessageBg', '▎'));
        // Reserve label columns before native wrapping, then prefix only the
        // first text row. Continuations align under the text, not the name.
        const nativeWidth = available - prefixWidth;
        const indent = Math.min(pi.getSettings?.().outputPad ?? 1, nativeWidth);
        const firstText = source.findIndex(line => stripVTControlCharacters(line).trim() !== '');
        const lines = source.map((nativeLine, index) => {
          let line = prefixWidth ? fill(prefixWidth) + nativeLine : nativeLine;
          if (label && index === firstText) {
            line = fill(indent) + paint(ctx.ui.theme.bg('userMessageBg', label + ': ')) + sliceByColumn(nativeLine, indent, Math.max(0, nativeWidth - indent));
          }
          return gutter + accent + fill(extra) + line + reset + fill(Math.max(0, panelWidth - 1 - extra - visibleWidth(line))) + gutter;
        });
        cache.set(this, { source, key, lines });
        return lines;
      }
      let start = 0, end = source.length;
      const blank = (line: string) => stripVTControlCharacters(line).trim() === '';
      if (end > 1 && blank(source[0])) start++;
      if (end - start > 1 && blank(source[end - 1])) end--;
      // Preserve Pi's shell-integration zones when their padding rows disappear.
      const zones = (rows: string[]) => rows.join('').match(/\x1b\]133;[ABC](?:\x07|\x1b\\)/g)?.join('') ?? '';
      const before = zones(source.slice(0, start));
      const after = zones(source.slice(end));
      const top = before + gutter + paint('╭' + '─'.repeat(inner) + '╮') + gutter;
      const bottom = gutter + paint('╰' + '─'.repeat(inner) + '╯') + gutter + after;
      const lines = [top, ...source.slice(start, end).map(line => gutter + paint('│') + fill(extra) + line + reset + fill(Math.max(0, inner - extra - visibleWidth(line))) + paint('│') + gutter), bottom];
      cache.set(this, { source, key, lines });
      return lines;
    }
    UserMessageComponent.prototype.render = bordered;
    restore = () => {
      // Do not overwrite a newer renderer installed by another extension.
      if (UserMessageComponent.prototype.render === bordered) UserMessageComponent.prototype.render = original;
    };
  };
  pi.on('session_start', (_event, ctx) => install(ctx));
  pi.on('session_shutdown', () => { restore?.(); restore = undefined; });
}
