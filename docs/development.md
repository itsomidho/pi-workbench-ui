# Development and testing

## Setup

Install Node.js 22.13+ and Pi 1.6.0 (the tested version):

```sh
npm install --global @earendil-works/pi-coding-agent@1.6.0
git clone https://github.com/itsomidho/pi-workbench-ui.git
cd pi-workbench-ui
```

Runtime imports are supplied by Pi. No production dependencies are bundled. Test tooling discovers a local or global Pi installation; override its package directory with `PI_INSTALL_ROOT`.

## Installer development

`install.sh` installs a tagged GitHub archive without Git. Run `npm run test:installer` for Bash syntax and offline tests using mocked downloads and Pi registration, with real tar/Node/file moves. Tests cover fresh/default/custom installs, spaces in paths, existing directories/symlinks, bad options, failed downloads, corrupt archives, wrong package metadata and registration failure. They do not modify the real installation.

## Checks

- `npm test`: state/renderer/settings regressions, suggestion parsing/history matching, activity transitions and synthetic performance checks.
- `npm run check`: TypeScript syntax checking (not a full type check).
- `npm run test:integration`: actual Pi RPC loading, settings/reset/enable through reload, and saved task boundaries/exports.
- `npm run test:terminal`: Unix PTY startup, native slash/file completion, Unicode typing/resizing, Ask interactions, prompt history after reload, TODO scrolling, usage metadata/dashboard, inline suggestion acceptance and live activity labels.
- `npm run test:installer`: Bash syntax and archive-install/upgrade safety tests.

Python tests require Python 3 and a `pi` executable on PATH. Tests use temporary configuration/session fixtures rather than editing your saved preferences or sessions. Suggestion and activity PTY tests run local loopback HTTP mock providers to exercise real streaming and tool execution. They do not contact external model APIs or require paid credentials. Other PTY fixtures run without model requests.

Regression coverage includes legacy TODO state, input reset, native edit renderer reuse, padding/width matrices, footer routing and metrics, call descriptions, output previews, and cache invalidation. Performance tests check reuse and count expensive operations; printed timings are machine-dependent and are not a live typing-latency claim.

See [QA.md](../QA.md) for unverified/manual coverage: real session restart/resume, light/dark visual comparison, images, fullscreen mode, and live companion-extension interaction.

## Suggestions and activity implementation

All three settings are validated in `settings.ts`; `/ui set <key> <value>` saves them and reloads Pi:

| Setting | Default | Purpose |
| --- | --- | --- |
| `promptSuggestions` | `false` | History-based inline completion and optional next-prompt placeholders |
| `activityStatus` | `true` | Event-driven labels in Pi’s existing working indicator |
| `activityChars` | `false` | Throttled streamed reply character counts; requires `activityStatus` |

`PromptHistory` in `prompt-suggestions.ts` retains at most 100 eligible recent single-line prompts, up to 500 characters each. `index.ts` seeds it from the active branch’s `buildContextEntries()` projection and updates it on user-message completion. It is cleared/rebuilt on session or tree changes; compacted-away prompts are not guaranteed to be available. Prefix matching is case-insensitive and starts after three non-whitespace characters. No extra model request is made for history matching.

The Workbench editor renders the suffix as dim ghost text only at the end of a single visible input line, while idle and focused. Tab accepts a currently rendered matching suffix into the draft; Enter remains the separate send action. Native autocomplete takes priority, and command, shell and file-reference contexts are excluded. Up/Down remains native prompt history. Render borders through the editor’s border hooks: Pi appends completion menu rows **after** the bottom border, so replacing the final rendered row hides suggestions.

When enabled in TUI mode, `registerPromptSuggestions` also adds guidance asking the model to optionally end its regular reply with `Suggested next prompt: <text>`. Only a valid final assistant line outside code fences becomes an empty-editor placeholder; the line remains in the transcript. Publication waits for `agent_settled`, and aborts/new runs/session changes clear it. This does not make a separate request, execute the suggestion or replace another extension’s editor. If a long-running tab retains old editor behavior after `/reload`, restart with `/quit` and `pi --continue` in the same project directory.

`activity-status.ts` uses Pi’s `setWorkingMessage()` rather than another spinner or panel. Model streaming drives waiting/thinking/writing labels; tool events drive short action labels and concurrent leaf-tool counts. Tool titles can arrive after `tool_execution_start`, so `index.ts` forwards them through `updateTitle`. Shell commands fall back to a generic label unless given an explicit title or leading title comment; full command bodies and tool outputs are not used. Do not put secrets in titles or comments. Settlement, cancellation and session changes clear tracked activity. Other extensions can also set the native working label; disable `activityStatus` if they conflict.

The optional counter counts Unicode code points in streamed reply text, including spaces and Markdown, not thinking, tool output or billed tokens. It resets on each model turn and limits count-label updates to roughly once per 125 ms; it is a live display, not a final accounting ledger.

## Files

- `index.ts`: extension, UI components, tool presentation and session state.
- `ask.ts`, `ask-test.mjs`, `ask-terminal-test.py`: Ask component/tool and keyboard/runtime tests.
- `settings.ts`: validated persistent settings.
- `prompt-suggestions.ts`, `prompt-suggestions-test.mjs`, `prompt-suggestions-terminal-test.py`: bounded history matching, ghost-text rendering, final-response parsing/lifecycle tests and a real Pi loopback-provider acceptance test.
- `activity-status.ts`, `activity-status-test.mjs`, `activity-status-terminal-test.py`: native working labels, optional reply character counting, parallel/nested tool state and a real Pi loopback-provider cancellation test.
- `task-usage.ts`, `task-dashboard.ts`, task usage/dashboard unit and RPC/PTY tests: branch-scoped accounting, run-ledger provenance, private export and interactive snapshot dashboard.
- `todo-terminal-test.py`: real four-item viewport scrolling and editor isolation.
- `token-usage.ts`, `token-usage-test.mjs`, `token-usage-terminal-test.py`: usage provenance index, parallel/restoration/render tests, and a real Pi on-disk resume fixture without model requests.
- `prompt-borders.ts`, `prompt-borders-test.mjs`: message decoration, native rendering and lifecycle regressions.
- `test.mjs`: regression and performance suite.
- `test-support.mjs`: portable Pi installation discovery.
- `integration.py`, `terminal-test.py`: isolated RPC reload tests and PTY slash/file completion, typing and resize checks.

Do not commit credentials, personal settings, session logs, generated reports, or private screenshots.
