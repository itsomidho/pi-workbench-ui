import type { ExtensionCommandContext, Theme } from '@earendil-works/pi-coding-agent';
import { Input, matchesKey, wrapTextWithAnsi, type KeybindingsManager, type TUI } from '@earendil-works/pi-tui';
import { centeredModalOptions, modalHeight, modalInnerWidth, renderModal } from './modal-frame.ts';
import { defaults, settingKeys, settingDefinitions, allowedSettingValues, settingExample, type UISettings } from './settings.ts';

type Group = 'UI' | 'TODOs' | 'Task usage' | 'Settings';
type Entry = { group: Group; command: string; description: string; setting?: keyof UISettings };
export const commandCatalog: readonly Entry[] = [
  { group: 'UI', command: '/ui help', description: 'Browse and search Workbench UI commands' },
  { group: 'UI', command: '/ui settings', description: 'Show current settings and the config path' },
  { group: 'UI', command: '/ui set <key> <value>', description: 'Save a setting and reload Pi; search a setting name below for values and examples' },
  { group: 'UI', command: '/ui changes', description: 'Inspect working tree changes and file diffs' },
  { group: 'UI', command: '/ui redraw', description: 'Repaint the terminal without changing messages' },
  { group: 'UI', command: '/ui reset', description: 'Disable the custom UI and reload Pi; saved settings are kept, not factory-reset' },
  { group: 'UI', command: '/ui enable', description: 'Restore the custom UI with saved settings' },
  { group: 'TODOs', command: '/todos', description: 'Toggle the TODO panel' },
  { group: 'TODOs', command: '/todos all', description: 'Show the full TODO list' },
  { group: 'TODOs', command: '/todos up', description: 'Scroll toward earlier tasks; shortcut Alt+K' },
  { group: 'TODOs', command: '/todos down', description: 'Scroll toward later tasks; shortcut Alt+J' },
  { group: 'TODOs', command: '/todos follow', description: 'Resume following active/next pending work, or the final completed items' },
  { group: 'Task usage', command: '/task-usage start <name>', description: 'Start tracking a named task' },
  { group: 'Task usage', command: '/task-usage finish', description: 'Close the active task boundary' },
  { group: 'Task usage', command: '/task-usage show', description: 'Inspect the latest task’s usage dashboard' },
  { group: 'Task usage', command: '/task-usage export', description: 'Write private JSON and Markdown usage reports' },
  { group: 'Task usage', command: '/task-usage workbench <absolute-task-directory> <run-id> [export]', description: 'Inspect a recorded Workbench run separately' },
  ...settingKeys.map(setting => ({ group: 'Settings' as const, command: settingExample(setting), description: settingDefinitions[setting].description, setting })),
];

export function commandDetails(entry: Entry, settings: UISettings = defaults): string[] {
  if (!entry.setting) return [entry.description];
  const key = entry.setting;
  return [entry.description, `Current: ${JSON.stringify(settings[key])} · Default: ${JSON.stringify(defaults[key])}`,
    `Allowed: ${allowedSettingValues(key)}`, `Example: ${entry.command}`];
}

export function searchCommands(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return commandCatalog.filter(entry => {
    const haystack = `${entry.group} ${entry.command} ${commandDetails(entry).join(' ')}`.toLowerCase();
    return words.every(word => haystack.includes(word));
  });
}

// Placeholder notation is documentation, not text to execute or copy.
export const commandDraft = (entry: Entry) => entry.command.replace(/ (?:<|\[).*$/, ' ');
export const uiCommandCompletions = (prefix: string) => commandCatalog.filter(entry => entry.group === 'UI').flatMap(entry => {
  const action = entry.command.split(' ')[1];
  return action.startsWith(prefix) ? [{ value: action, label: action, description: entry.description }] : [];
});
export const commandHelpText = (settings: UISettings = defaults) => ['Workbench UI commands',
  'Type to search · ↑/↓ select · PageUp/PageDown scroll · Enter inserts draft only · Esc closes',
  'Edit the inserted draft, then submit it to apply. Settings save locally and reload Pi.',
  ...commandCatalog.map(entry => `${entry.group} · ${entry.command} — ${commandDetails(entry, settings).join('\n  ')}`)].join('\n');

type Row = { text: string; index?: number };
export class CommandPalette {
  private input: Input;
  private matching = searchCommands('');
  private selected = 0;
  private offset = 0;
  private page = 1;
  private closed = false;
  constructor(private tui: TUI, private theme: Theme, private keys: Pick<KeybindingsManager, 'matches'>, private done: (draft?: string) => void, private settings: UISettings = defaults) {
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
    const rows: Row[] = [];
    let lastGroup: Group | undefined;
    for (const [index, entry] of this.matching.entries()) {
      if (entry.group !== lastGroup) { rows.push({ text: th.fg('accent', entry.group) }); lastGroup = entry.group; }
      const picked = index === this.selected;
      const text = th.fg(picked ? 'accent' : 'text', entry.command) + th.fg('muted', ` — ${entry.description}`);
      const wrapped = wrapTextWithAnsi(text, Math.max(1, inner - 2));
      wrapped.forEach((line, part) => rows.push({
        text: th.fg(picked ? 'accent' : 'text', part === 0 && picked ? '▸ ' : '  ') + line, index,
      }));
    }
    const selected = this.matching[this.selected];
    const active = rows.findIndex(row => row.index === this.selected);
    const lastActive = rows.findLastIndex(row => row.index === this.selected);
    const entryHeight = Math.max(1, lastActive - active + 1);
    // Budget by physical lines, not commands. Leave room for the selected entry
    // before allocating its reference details; tiny terminals may show a prefix.
    const listMinimum = Math.min(entryHeight, Math.max(1, Math.floor((height - 4) / 2)));
    const description = selected?.setting && height >= 7
      ? commandDetails(selected, this.settings).slice(1).flatMap(line => wrapTextWithAnsi(line, inner))
        .slice(0, Math.max(0, height - 4 - listMinimum)).map(row => th.fg('muted', row)) : [];
    const listHeight = Math.max(1, height - 4 - description.length);
    if (entryHeight > listHeight || active < this.offset) this.offset = Math.max(0, active);
    else if (lastActive >= this.offset + listHeight) this.offset = lastActive - listHeight + 1;
    this.offset = Math.min(this.offset, Math.max(0, rows.length - listHeight));
    const visibleRows = rows.slice(this.offset, this.offset + listHeight);
    // Page keys advance by the number of entries on screen, not wrapped lines.
    this.page = Math.max(1, new Set(visibleRows.flatMap(row => row.index === undefined ? [] : [row.index])).size);
    const items = visibleRows.map(row => row.text);
    const controls = th.fg('muted', inner < 42 ? 'Esc close · ↑↓ · Enter insert' : 'Type search · ↑↓ / PgUp/PgDn · Enter insert draft · Esc close');
    return renderModal(th, width, height, 'Workbench UI commands', [
      ...this.input.render(inner),
      ...(items.length ? items : [th.fg('muted', 'No matching commands.')]),
      ...description, controls,
    ], rows.length > listHeight ? `${this.selected + 1}/${this.matching.length}` : '');
  }
}

export async function openCommandHelp(ctx: ExtensionCommandContext, customUI: boolean, settings: UISettings = defaults) {
  if (ctx.mode !== 'tui' || !customUI) { ctx.ui.notify(commandHelpText(settings), 'info'); return; }
  let columns = () => 100;
  const draft = await ctx.ui.custom<string | undefined>((tui, theme, keys, done) => {
    columns = () => tui.terminal.columns;
    return new CommandPalette(tui, theme, keys, done, settings);
  }, { overlay: true, overlayOptions: () => centeredModalOptions(columns()) });
  if (draft === undefined) return;
  if (ctx.ui.getEditorText().length) { ctx.ui.notify('Your existing draft wasn’t replaced. Clear it to insert a command.', 'info'); return; }
  ctx.ui.setEditorText(draft);
}
