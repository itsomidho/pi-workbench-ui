# Pi Workbench UI

A configurable terminal interface for [Pi](https://github.com/earendil-works/pi): a session TODO panel, framed tool output, and an integrated model/usage footer.

This is a standalone Pi extension, not a Pi fork. [Pi Workbench](https://github.com/itsomidho/pi-workbench) and [pi-usage-status](https://github.com/itsomidho/pi-usage-status) are optional companions.

## Features

- **Ask box:** context, selectable answers, Other text input, keyboard submission and explicit cancellation.
- **Task panel:** accent-colored heading, active/completed states, branch-aware persistence, and automatic reset of completed plans on the next prompt.
- **Tool frames:** descriptive titles, padded command/output sections, expandable previews, elapsed/timeout labels, and status colors.
- **Quiet defaults:** muted success borders, yellow running borders, red errors.
- **Turn usage:** provider-reported input/output and cache tokens on tool boxes, with shared-turn and tool-reported usage clearly separated.
- **Integrated footer:** directory, branch, session, token/cache/cost statistics, context usage, selected/last physical model, and extension statuses.
- **Prompt presentation:** working status in the editor border. Submitted prompts keep Pi’s native background and spacing, adding an inline `You:` label and a thick right-side bar. Native, outline, and left-accent styles are also available.
- **Recovery:** disable custom surfaces without uninstalling the extension.
- **Cached rendering:** avoid repeating session scans and context projections while typing.

## Requirements

- Pi with the current extension renderer APIs. Tested against **Pi 1.6.0**.
- Node.js **22.13+**.
- Python 3 only for development integration tests.

Extensions execute with your user permissions. Review code before installation.

## Install

### Without Git (recommended for a standalone installation)

```sh
curl -fsSL https://raw.githubusercontent.com/itsomidho/pi-workbench-ui/main/install.sh | bash
```

This downloads the tagged **v0.7.0** archive into `~/.pi-workbench-ui` and registers the local directory with Pi. It requires Bash, curl, tar, Node.js 22.13+, GNU mv, and an installed `pi` command. On repeat runs it safely updates recognized older archive installs and backs up the previous copy; it refuses Git checkouts, symlinks, unrelated directories, and downgrades. Review remote scripts before running them; see [Installation and updates](docs/installation.md) for download-first instructions, options and archive updates.

Alternatively, let Pi manage a Git package:

```sh
pi install git:github.com/itsomidho/pi-workbench-ui
```

### Dedicated installation directory

To install a separate checkout like Pi Workbench, instead of Pi's managed Git package:

```sh
git clone https://github.com/itsomidho/pi-workbench-ui.git ~/.pi-workbench-ui
pi install ~/.pi-workbench-ui
pi list
```

If the directory already exists, inspect it before cloning or replacing it. When migrating from a development checkout or managed Git source, first use `pi list`, then remove the exact old source with `pi remove <old-source>`. Do not load both copies at once.

### Update

For an **archive installation**, rerun the same curl command above. No `git pull` or manual directory move is needed. The installer leaves your Pi registration, settings, and session history unchanged.

For a **Git checkout**, inspect local changes, then fast-forward only:

```sh
git -C ~/.pi-workbench-ui status --short
git -C ~/.pi-workbench-ui pull --ff-only
```

If the checkout has local changes or cannot fast-forward, resolve them before updating; do not overwrite them. For a Pi-managed Git package, use `pi update --extensions` instead. Run `/reload` in an existing Pi session after installation or update. See [Installation and updates](docs/installation.md).

## Commands

| Command | Purpose |
| --- | --- |
| `/todos` | Toggle the TODO panel for this session |
| `/todos all` | Show all tasks |
| `/ui settings` | Show configuration and its file path |
| `/ui set <key> <value>` | Save a setting and reload |
| `/ui reset` | Disable custom UI and reload |
| `/ui redraw` | Force a clean terminal repaint without changing messages |
| `/ui enable` | Restore custom UI using saved settings |

For multi-step work, ask Pi to maintain the task panel. The `todo_plan` tool replaces the full plan; at most one task can be active. Completed tasks remain until the next user prompt. Unfinished tasks survive follow-ups. Commands and internal extension follow-ups do not reset them.

The empty-panel hint suggests `/think`, which is provided by Pi Workbench—not this package. Without Workbench, ask Pi directly to create a plan.

The `ui_title` tool gives the next call of a named tool an explicit task description. Shell commands can also begin with a descriptive `# comment`. Titles do not borrow unrelated TODO text.

## Ask box

Ask Pi to clarify a decision using `ask_user`. It opens a framed question with optional context, 1–12 choices and an **Other** typed answer. Use arrows to choose, Enter to submit and Escape (or Ctrl+C) to cancel. Empty typed answers are not submitted.

Results contain `status: answered`, the selected text and zero-based index (or `custom: true` for typed answers). Cancellation returns `status: cancelled` and `answer: null`; it must never count as approval. The tool performs no action beyond collecting an answer. Non-TUI modes and disabled custom UI return `unavailable` with no answer. Pi reports a question-blocked state while waiting. Keep questions and context concise: long text is bounded on screen.

## Per-turn token usage

Tool boxes show `shared turn: ↑1.2k ↓320 R4.0k W200`. These are the provider-reported counts from the assistant turn that called the tool—not the token cost of executing that individual tool. Sibling/parallel calls intentionally show the same turn counts; do not add these labels together. The normal session totals remain unchanged.

`tool model: ↑20 ↓8` appears separately when a tool result reports model usage (including any nested usage aggregated by Pi). Ordinary read/edit/bash tools do not call a model and have no separate billed usage to display. Missing values show `—`; reported zeros remain zero. `↑` is the reported uncached input field, `↓` output, `R` cache reads, and `W` cache writes. No tool argument/result token estimates are invented. Tool-box input counts use the theme accent, output counts use success green, cache counts/labels are muted, and unavailable counts are dim. These colors do not change border status colors; the footer remains muted.

The footer's `turn:` status shows the latest model turn, including text-only turns. Usage restores from the active session branch on resume/tree navigation. Nested calls inherit their parent's shared turn; individual nested tool usage that Pi does not persist separately cannot be reconstructed. Wide tool boxes place counts at bottom-right; narrow boxes wrap them above the bottom border. Tools that retain their own self-rendered UI are not decorated.

Use `/ui set tokenUsage false` to hide these labels and the latest-turn status.

## Configure

```text
/ui set padding 2
/ui set verticalPadding 1
/ui set previewLines 12
/ui set footer compact
/ui set todos false
/ui set successColor borderMuted
/ui set promptBorders true
/ui set promptStyle right
/ui set promptLabel You
/ui set promptBorderColor "#5F929B"
```

Settings live at `~/.config/pi-workbench/ui.json`; `PI_WORKBENCH_UI_CONFIG` overrides the path. See [Configuration](docs/configuration.md) for defaults and limits.

## Compatibility and limitations

- The extension replaces the footer and wraps native tool rendering; other extensions replacing the same surfaces can conflict.
- Submitted-message borders decorate Pi's exported user-message renderer because Pi has no dedicated hook for it. Tested with Pi 1.6.0; other extensions wrapping that method may conflict. Return to native rendering with `/ui set promptBorders false`.
- Existing custom editors are left alone. `/ui reset` restores native surfaces plus any other installed extensions.
- The built-in edit tool gets matching frames; other self-rendering tools retain their own UI.
- The physical-model label describes the latest recorded assistant response, not the next routing decision.
- Usage-status metrics appear only when that companion extension supplies them.
- Legacy TODO history remains readable.
- Automated tests do not establish pixel-perfect appearance, real typing latency, or compatibility with every terminal.

## Development

```sh
npm test
npm run check
npm run test:integration
npm run test:terminal
npm run test:installer
```

A globally installed Pi is discovered automatically; `PI_INSTALL_ROOT` can point at another installation. See [Development and testing](docs/development.md) and the [manual QA checklist](QA.md).

## Remove

```sh
# Dedicated checkout registration
pi remove ~/.pi-workbench-ui
# Or, for a Pi-managed Git package:
pi remove git:github.com/itsomidho/pi-workbench-ui
```

Use the exact source listed by `pi list`. Removing the registration does not delete the checkout, session history, or settings.

## License

[MIT](LICENSE).
