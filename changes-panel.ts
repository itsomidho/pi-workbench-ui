import { getLanguageFromPath, highlightCode, type ExtensionCommandContext, type Theme } from '@earendil-works/pi-coding-agent';
import { matchesKey, sliceByColumn, truncateToWidth, visibleWidth, type KeybindingsManager, type TUI } from '@earendil-works/pi-tui';
import { readChangePreview, readWorkingTree, terminalText, type Change, type WorkingTree } from './working-tree.ts';
import { centeredModalOptions, modalHeight, modalInnerWidth, renderModal } from './modal-frame.ts';

const fit = (value: number, max: number) => Math.max(0, Math.min(value, Math.max(0, max)));
const fileName = (change: Change) => terminalText(change.from ? `${change.from} → ${change.path}` : change.path);
const badge = (change: Change) => change.conflict ? 'Conflict' : change.untracked ? 'Untracked' : change.staged && change.unstaged ? 'Staged+Unstaged' : change.staged ? 'Staged' : 'Unstaged';
const diffColor = (row: string) => row.startsWith('── ') || row.startsWith('@@') ? 'accent' : row.startsWith('+++ ') || row.startsWith('--- ') ? 'muted' : row.startsWith('+') ? 'success' : row.startsWith('-') ? 'error' : row.startsWith('…') ? 'warning' : 'text';

export class ChangesPanel {
  private selected = 0;
  private listStart = 0;
  private file?: Change;
  private diff: string[] = [];
  private untrackedCode?: { rows: string[]; language?: string; highlighted?: readonly string[] };
  private diffStart = 0;
  private x = 0;
  private maxColumns = 0;
  private inner = 1;
  private page = 1;
  private pending?: AbortController;
  private closed = false;
  private error?: string;
  private counts = '';
  constructor(private tree: WorkingTree, private tui: TUI, private theme: Theme, private keys: Pick<KeybindingsManager, 'matches'>, private done: () => void) {
    this.updateCounts();
  }
  invalidate() { if (this.untrackedCode) this.untrackedCode.highlighted = undefined; }
  dispose() { this.closed = true; this.pending?.abort(); this.pending = undefined; }
  private updateCounts() {
    const changes = this.tree.changes;
    this.counts = changes.length || this.tree.omitted
      ? `${changes.filter(c => c.staged).length} staged · ${changes.filter(c => c.unstaged).length} unstaged · ${changes.filter(c => c.untracked).length} untracked · ${changes.filter(c => c.conflict).length} conflicts${this.tree.omitted ? ` · ${this.tree.omitted} omitted` : ''}`
      : 'Working tree clean';
  }
  private redraw() { if (!this.closed) this.tui.requestRender(); }
  private back() {
    this.pending?.abort(); this.pending = undefined;
    this.file = undefined; this.diff = []; this.untrackedCode = undefined; this.error = undefined; this.redraw();
  }
  private async preview(file: Change) {
    if (this.pending) return;
    this.file = file; this.diff = []; this.untrackedCode = undefined; this.error = undefined;
    this.diffStart = 0; this.x = 0; this.maxColumns = 0;
    const request = this.pending = new AbortController(); this.redraw();
    try {
      let codeRows: string[] | undefined;
      const rows = await readChangePreview(this.tree.root, file, request.signal, body => { codeRows = body; return body; });
      if (this.pending !== request) return;
      this.diff = rows;
      if (codeRows) this.untrackedCode = { rows: codeRows, language: getLanguageFromPath(file.path) };
      this.maxColumns = Math.max(0, ...rows.map(visibleWidth));
    } catch (error) {
      if (this.pending === request) this.error = error instanceof Error ? error.message : 'Unable to load preview.';
    } finally {
      if (this.pending === request) { this.pending = undefined; this.redraw(); }
    }
  }
  private async refresh() {
    if (this.pending) return;
    const request = this.pending = new AbortController(); this.error = undefined; this.redraw();
    try {
      const tree = await readWorkingTree(this.tree.root, request.signal);
      if (this.pending !== request) return;
      const selected = this.tree.changes[this.selected]?.path;
      this.tree = tree; this.updateCounts(); this.listStart = 0;
      this.selected = Math.max(0, tree.changes.findIndex(file => file.path === selected));
    } catch (error) {
      if (this.pending === request) this.error = error instanceof Error ? error.message : 'Unable to refresh.';
    } finally {
      if (this.pending === request) { this.pending = undefined; this.redraw(); }
    }
  }
  handleInput(data: string) {
    if (this.closed) return;
    if (data === 'q' || matchesKey(data, 'ctrl+c')) { this.dispose(); this.done(); return; }
    if (matchesKey(data, 'escape') || this.keys.matches(data, 'tui.select.cancel') || (this.file && matchesKey(data, 'backspace'))) {
      if (this.file) this.back(); else { this.dispose(); this.done(); }
      return;
    }
    if (!this.file && data.toLowerCase() === 'r') { void this.refresh(); return; }
    if (!this.file && this.keys.matches(data, 'tui.select.confirm')) {
      const file = this.tree.changes[this.selected];
      if (file) void this.preview(file);
      return;
    }
    if (this.file && (matchesKey(data, 'left') || matchesKey(data, 'right'))) {
      this.x = fit(this.x + (matchesKey(data, 'left') ? -8 : 8), this.maxColumns - this.inner);
      this.redraw(); return;
    }
    const move = this.keys.matches(data, 'tui.select.up') ? -1 : this.keys.matches(data, 'tui.select.down') ? 1
      : this.keys.matches(data, 'tui.select.pageUp') ? -this.page : this.keys.matches(data, 'tui.select.pageDown') ? this.page
      : matchesKey(data, 'home') ? -Infinity : matchesKey(data, 'end') ? Infinity : 0;
    if (!move) return;
    if (this.file) this.diffStart = fit(this.diffStart + move, this.diff.length - this.page);
    else this.selected = fit(this.selected + move, this.tree.changes.length - 1);
    this.redraw();
  }
  render(width: number): string[] {
    if (width <= 0) return [''];
    const height = modalHeight(this.tui.terminal.rows);
    const th = this.theme;
    this.inner = modalInnerWidth(width);
    this.page = Math.max(1, height - 4 - Number(!!this.error));
    const name = this.file ? fileName(this.file) : this.counts;
    const header = th.fg('accent', name);
    let body: string[], position = '';
    if (this.file) {
      this.diffStart = fit(this.diffStart, this.diff.length - this.page);
      this.x = fit(this.x, this.maxColumns - this.inner);
      const code = this.untrackedCode;
      if (code && !code.highlighted) {
        // Highlight the bounded, sanitized code together so multiline tokens work.
        // Notices never enter the highlighter. Reuse colors during scrolling.
        try { code.highlighted = code.language ? highlightCode(code.rows.join('\n'), code.language) : code.rows; }
        catch { code.highlighted = code.rows; }
      }
      body = this.pending ? [th.fg('muted', 'Loading file preview…')] : this.diff.slice(this.diffStart, this.diffStart + this.page).map((row, index) => {
        const codeIndex = this.diffStart + index - 1;
        const codeLine = !!code && codeIndex >= 0 && codeIndex < code.rows.length;
        const source = codeLine ? code!.highlighted?.[codeIndex] ?? row : row;
        const segment = this.x ? sliceByColumn(source, this.x, this.inner) : truncateToWidth(source, this.inner);
        return codeLine && code?.language ? segment : th.fg(codeLine ? 'text' : diffColor(row), segment);
      });
      if (this.diff.length > this.page || this.x) position = `${this.diffStart + 1}–${this.diffStart + body.length}/${this.diff.length}${this.x ? ` · col ${this.x + 1}` : ''}`;
    } else {
      if (this.selected < this.listStart) this.listStart = this.selected;
      else if (this.selected >= this.listStart + this.page) this.listStart = this.selected - this.page + 1;
      this.listStart = fit(this.listStart, this.tree.changes.length - this.page);
      body = this.tree.changes.slice(this.listStart, this.listStart + this.page).map((change, index) => {
        const active = index + this.listStart === this.selected;
        const kind = this.inner >= 54 ? `${badge(change).padEnd(15)} ` : `[${change.code}] `;
        return th.fg(active ? 'accent' : change.conflict ? 'warning' : 'text', `${active ? '▸' : ' '} ${kind}${fileName(change)}`);
      });
      if (this.tree.changes.length > this.page) position = `${this.selected + 1}/${this.tree.changes.length}`;
      if (this.pending) position = 'Refreshing…';
      if (!body.length) body = [th.fg('muted', 'No staged, unstaged, or untracked files.')];
    }
    const controls = th.fg('muted', this.inner < 46
      ? this.file ? 'Esc back · ↑↓ scroll · ←→ pan' : 'Esc close · Enter view · ↑↓ · r'
      : this.file ? 'Esc back · ↑↓ scroll · ←→ pan · q close' : 'Esc close · ↑↓ select · Enter preview · r refresh');
    const rows = [header, ...(this.error ? [th.fg('error', terminalText(this.error))] : []), ...body, controls];
    return renderModal(th, width, height, 'Working tree changes · read-only', rows, position);
  }
}

export async function openChangesPanel(ctx: ExtensionCommandContext) {
  if (ctx.mode !== 'tui') { ctx.ui.notify('The Changes panel is available in the interactive terminal.', 'info'); return; }
  const tree = await readWorkingTree(ctx.cwd);
  let columns = () => 100;
  await ctx.ui.custom<void>((tui, theme, keys, done) => {
    columns = () => tui.terminal.columns;
    return new ChangesPanel(tree, tui, theme, keys, () => done());
  }, { overlay: true, overlayOptions: () => centeredModalOptions(columns()) });
}
