import type { ExtensionCommandContext, Theme } from '@earendil-works/pi-coding-agent';
import { Input, matchesKey, visibleWidth, wrapTextWithAnsi, type KeybindingsManager, type TUI } from '@earendil-works/pi-tui';
import { centeredModalOptions, modalHeight, modalInnerWidth, renderModal } from './modal-frame.ts';

type Group = 'UI' | 'TODOs' | 'Task usage';
type Entry = { group: Group; command: string; description: string };
export const commandCatalog: readonly Entry[] = [
  { group: 'UI', command: '/ui help', description: 'Browse and search Workbench UI commands' },
  { group: 'UI', command: '/ui settings', description: 'Show current settings and the config path' },
  { group: 'UI', command: '/ui set <key> <value>', description: 'Save a setting and reload Pi' },
  { group: 'UI', command: '/ui changes', description: 'Inspect working tree changes and file diffs' },
  { group: 'UI', command: '/ui redraw', description: 'Repaint the terminal without changing messages' },
  { group: 'UI', command: '/ui reset', description: 'Disable the custom UI and reload Pi' },
  { group: 'UI', command: '/ui enable', description: 'Restore the custom UI with saved settings' },
  { group: 'TODOs', command: '/todos', description: 'Toggle the TODO panel' },
  { group: 'TODOs', command: '/todos all', description: 'Show the full TODO list' },
  { group: 'TODOs', command: '/todos up', description: 'Scroll toward earlier tasks' },
  { group: 'TODOs', command: '/todos down', description: 'Scroll toward later tasks' },
  { group: 'TODOs', command: '/todos follow', description: 'Resume following the active task' },
  { group: 'Task usage', command: '/task-usage start <name>', description: 'Start tracking a named task' },
  { group: 'Task usage', command: '/task-usage finish', description: 'Close the active task boundary' },
  { group: 'Task usage', command: '/task-usage show', description: 'Inspect the latest task’s usage dashboard' },
  { group: 'Task usage', command: '/task-usage export', description: 'Write private JSON and Markdown usage reports' },
  { group: 'Task usage', command: '/task-usage workbench <absolute-task-directory> <run-id> [export]', description: 'Inspect a recorded Workbench run separately' },
];

export function searchCommands(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return commandCatalog.filter(entry => {
    const haystack = `${entry.group} ${entry.command} ${entry.description}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}

// Placeholder notation is documentation, not text to execute or copy.
export const commandDraft = (entry: Entry) => entry.command.replace(/ (?:<|\[).*$/, ' ');
export const uiCommandCompletions = (prefix: string) => commandCatalog.filter(entry => entry.group === 'UI').flatMap(entry => {
  const action = entry.command.split(' ')[1];
  return action.startsWith(prefix) ? [{ value: action, label: action, description: entry.description }] : [];
});
export const commandHelpText = () => ['Workbench UI commands', ...commandCatalog.map(entry => `${entry.group} · ${entry.command} — ${entry.description}`)].join('\n');

type Row = { group: Group } | { entry: Entry; index: number };
export class CommandPalette {
  private input: Input;
  private matching = searchCommands('');
  private selected = 0;
  private offset = 0;
  private page = 1;
  private closed = false;
  constructor(private tui: TUI, private theme: Theme, private keys: Pick<KeybindingsManager, 'matches'>, private done: (draft?: string) => void) {
    this.input = new Input({ prompt: 'Search: ', placeholder: 'Type to filter commands', placeholderStyle: text => theme.fg('dim', text) });
  }
  get focused() { return this.input.focused; }
  set focused(value: boolean) { this.input.focused = value; }
  invalidate() { this.input.invalidate(); }
  private finish(draft?: string) {
    if (this.closed) return;
    this.closed = true;
    this.done(draft);
  }
  handleInput(data: string) {
    if (this.closed) return;
    if (this.keys.matches(data, 'tui.select.cancel') || matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) { this.finish(); return; }
    if (this.keys.matches(data, 'tui.select.confirm')) {
      const entry = this.matching[this.selected];
      if (entry) this.finish(commandDraft(entry));
      return;
    }
    const step = this.keys.matches(data, 'tui.select.up') ? -1 : this.keys.matches(data, 'tui.select.down') ? 1
      : this.keys.matches(data, 'tui.select.pageUp') ? -this.page : this.keys.matches(data, 'tui.select.pageDown') ? this.page : 0;
    if (step) this.selected = Math.max(0, Math.min(this.selected + step, this.matching.length - 1));
    else {
      const before = this.input.getValue();
      this.input.handleInput(data);
      if (this.input.getValue() !== before) {
        this.matching = searchCommands(this.input.getValue());
        this.selected = 0;
        this.offset = 0;
      }
    }
    this.tui.requestRender();
  }
  render(width: number): string[] {
    if (width <= 0) return [''];
    const th = this.theme, height = modalHeight(this.tui.terminal.rows), inner = modalInnerWidth(width);
    const wide = inner >= 75;
    const rows: Row[] = [];
    let lastGroup: Group | undefined;
    for (const [index, entry] of this.matching.entries()) {
      if (entry.group !== lastGroup) { rows.push({ group: entry.group }); lastGroup = entry.group; }
      rows.push({ entry, index });
    }
    const selected = this.matching[this.selected];
    const needsDetail = selected && (!wide || visibleWidth(`${selected.command}  —  ${selected.description}`) + 2 > inner);
    const description = needsDetail && height >= 7
      ? wrapTextWithAnsi(`${!wide ? `${selected.command} — ` : ''}${selected.description}`, inner).slice(0, Math.min(3, height - 6)).map(row => th.fg('muted', row)) : [];
    this.page = Math.max(1, height - 4 - description.length);
    const active = rows.findIndex(row => 'index' in row && row.index === this.selected);
    if (active < this.offset) this.offset = Math.max(0, active);
    else if (active >= this.offset + this.page) this.offset = active - this.page + 1;
    this.offset = Math.min(this.offset, Math.max(0, rows.length - this.page));
    const items = rows.slice(this.offset, this.offset + this.page).map(row => {
      if ('group' in row) return th.fg('accent', row.group);
      const picked = row.index === this.selected;
      return th.fg(picked ? 'accent' : 'text', `${picked ? '▸' : ' '} ${row.entry.command}`) + (wide ? th.fg('muted', `  —  ${row.entry.description}`) : '');
    });
    const controls = th.fg('muted', inner < 42 ? 'Esc close · ↑↓ · Enter insert' : 'Esc close · ↑↓ select · Enter insert draft');
    return renderModal(th, width, height, 'Workbench UI commands', [
      ...this.input.render(inner),
      ...(items.length ? items : [th.fg('muted', 'No matching commands.')]),
      ...description, controls,
    ], rows.length > this.page ? `${this.selected + 1}/${this.matching.length}` : '');
  }
}

export async function openCommandHelp(ctx: ExtensionCommandContext, customUI: boolean) {
  if (ctx.mode !== 'tui' || !customUI) { ctx.ui.notify(commandHelpText(), 'info'); return; }
  let columns = () => 100;
  const draft = await ctx.ui.custom<string | undefined>((tui, theme, keys, done) => {
    columns = () => tui.terminal.columns;
    return new CommandPalette(tui, theme, keys, done);
  }, { overlay: true, overlayOptions: () => centeredModalOptions(columns()) });
  if (draft === undefined) return;
  if (ctx.ui.getEditorText().length) { ctx.ui.notify('Your existing draft wasn’t replaced. Clear it to insert a command.', 'info'); return; }
  ctx.ui.setEditorText(draft);
}
