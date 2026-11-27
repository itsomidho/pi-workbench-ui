import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

export const modalHeight = (terminalRows: number) => Math.max(1, Math.floor(terminalRows * .8));
export const modalInnerWidth = (width: number) => Math.max(1, width - 4);
export const centeredModalOptions = (columns: number) => ({
  width: Math.max(1, Math.min(120, Math.floor(columns * .92))), maxHeight: '85%' as const, anchor: 'center' as const,
});

export function renderModal(theme: Theme, width: number, height: number, title: string, rows: string[], position = ''): string[] {
  if (width <= 0) return [''];
  if (width < 5 || height < 5 || rows.length + 2 > height) return rows.slice(0, height).map(row => truncateToWidth(row, width));
  const inner = modalInnerWidth(width);
  const border = (a: string, b: string, text = '') => {
    const label = truncateToWidth(text, width - 2, '');
    return theme.fg('borderMuted', a + label + '─'.repeat(Math.max(0, width - 2 - visibleWidth(label))) + b);
  };
  const inside = (row: string) => {
    const text = truncateToWidth(row, inner);
    return theme.fg('borderMuted', '│') + ' ' + text + ' '.repeat(Math.max(0, inner - visibleWidth(text))) + ' ' + theme.fg('borderMuted', '│');
  };
  return [border('╭', '╮', `─ ${title} `), ...rows.map(inside), border('╰', '╯', position ? ` ${position} ` : '')];
}
