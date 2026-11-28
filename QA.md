# Terminal QA

Automated: `npm test`, `npm run check` (syntax only), `npm run test:integration`, `npm run test:terminal`, `npm run test:installer`. Ask tests cover choices, typed answers, cancellation/abort, non-TUI safety and Unicode widths. Real Ask PTY tests cover selection, Escape cancellation, Other text and resizing without model requests.

The node suite covers state restoration and legacy compatibility, input reset, actual native edit renderer reuse, Unicode and padding width matrices, usage-status layout, titles, output expansion and caching. RPC tests use an isolated configuration and exercise settings/reset/enable with actual Pi reloads. PTY smoke checks startup, Unicode typing, and resizing without model requests. These are not pixel-level visual or latency certification.

The reported duplicated assistant sentence occurs only on screen (saved content contains it once). Fullscreen settled redraw and `/ui redraw` are tested for lifecycle/operation and no message mutation. The original duplicate-row screen artifact has not been reproduced end-to-end; its resolution remains visually unverified.

Token usage tests cover provider fields, missing/zero values, cache separation, shared parallel calls, nested live calls, active-branch restoration, no per-render session scans, and responsive border labels. A real Pi PTY fixture resumes two sibling tool calls and checks shared usage plus separate tool-model usage without contacting a provider. Live-provider accounting has not been independently audited.

TODO navigation regression tests cover four-row limits, every sequential completion transition for 0–50 items, active-over-pending priority, next-pending fallback, final completed page, clamping, manual pause/resume, unchanged task data, branch reset, hidden panels and narrow widths. The real Pi TODO fixture has completed and pending items without an active item to verify automatic next-pending follow on resume/reload. A real Pi PTY test verifies Up/Down prompt history after `/reload`, Alt+K/J scrolling (including while a draft is present), `/todos follow`, draft typing and 40-column resize on a resumed session (no provider calls).

Native autocomplete PTY coverage types a slash-command prefix and a file reference, verifies the single-result menu row remains visible, and accepts each with Tab while `promptSuggestions` is enabled. This protects against replacing Pi’s last autocomplete row with an editor border.

## Inline suggestions

`prompt-suggestions-test.mjs` covers bounded/recent history matching, case-insensitive prefixes, ineligible command/file contexts, Unicode ghost rendering, next-prompt final-line validation, opt-in/non-TUI behavior, aborts and session/run cleanup. It rejects suggestions inside code fences or from tool results. History completion uses saved context, not an AI request.

`prompt-suggestions-terminal-test.py` starts real Pi with a loopback HTTP mock provider. It verifies an empty-editor placeholder, Enter without accepting sends nothing, Tab preserves an unrelated draft, and Right Arrow acceptance does not send until Enter. It also types a lowercase prefix of a previous prompt, checks the visible ghost suffix, accepts it with Right Arrow, edits it, then verifies the exact submitted text. Request counts distinguish acceptance from submission. The mock does not contact a paid/external provider.

## Live working indicator

`activity-status-test.mjs` covers safe filename/title labels, generic shell-command fallback, parallel/nested leaf-tool counts, repeated-stream-update suppression and settlement/session cleanup. Character-counter tests cover default-off behavior, Unicode code points split across chunks and turn reset. The counter is not a token estimate or billing measurement.

`activity-status-terminal-test.py` uses a real Pi PTY and loopback mock provider with a tool call. It verifies the waiting label, an explicit tool title in the actual editor border (not merely in transcript arguments), the enabled reply character count, settlement and Escape cancellation back to idle. Titles arriving after the tool-start event are exercised. These mocks demonstrate integration behavior, not compatibility with every provider or extension that changes the working label.

## Command palette

Palette regressions check grouped/searchable syntax, descriptions, required-argument prefixes, empty/missing results, narrow layouts and plain-text fallback. A real Pi PTY runs `/ui help`, filters commands, inserts `/ui reset` without changing settings, appends a required argument to a draft, and verifies Escape after a 40-column resize. A command-handler fixture verifies an existing draft is not overwritten. Wrapping regressions assert complete description tails without ellipses at 40/80/120 columns, visibility of each selection while resizing, and PageUp/PageDown reachability of the first/last entries. Settings coverage checks every key against the defaults, validates all examples and enumerated choices, tests integer boundaries and invalid values, and verifies active versus default values and layouts across narrow/short terminals. The real Pi palette scenario also searches `promptStyle` and `promptLabel`, checks current/default/allowed values, inserts an example draft, and confirms selection/cancellation never writes configuration.

## Working tree changes

`changes-test.mjs` uses disposable Git worktrees to cover clean/non-Git projects, staged and unstaged content in the same file, renames, literal/special paths, untracked text/binary/symlinks, large-preview truncation, terminal-control sanitization and cancellation. It checks that previews do not change index bytes or invoke the configured external diff command. Syntax tests check native TypeScript colors, multiline tokens, cached/theme-invalidated rendering, ANSI-aware clipping/panning, unknown-language and binary fallbacks, and truncation-notice isolation. `changes-terminal-test.py` checks actual ANSI keyword coloring in an untracked TypeScript preview and opens `/ui changes` in real Pi, selects tracked and untracked previews, resizes to 40 columns, refreshes and returns to the editor without model requests.

## Reports and remaining manual checks

Dashboard tests cover status colors, exact counts, usage-only proportions, unknown/zero/partial metadata, Details/Overview, scrolling, Unicode/narrow layouts, cached rendering and plain-text fallback. A real Pi PTY test opens a saved-session report, toggles details, resizes to 40×24, scrolls, closes with Escape and exports the unchanged report (no provider calls). This is functional terminal coverage, not visual certification on every theme/terminal.

Task report tests cover boundary scope, parallel/shared-turn non-duplication, aggregated tool usage, missing fields, model attribution, explicit Workbench run filtering and private output permissions. A real saved-session Pi RPC test exercises start, reload, finish and export without model requests.

Manual release checklist (not yet verified):
- Compare light/dark theme colors and change theme with existing tool history visible.
- Resize a long transcript with real images and large expanded diffs in regular/fullscreen modes.
- Restart and resume an on-disk session; inspect TODO and title restoration.
- Exercise the installed usage-status/router extensions together and confirm metrics update.
- Compare typing latency before/after enabling this extension under normal system load.
- Run /ui reset and /ui enable interactively; verify native editor/footer/tool backgrounds return.
- With `/ui set promptSuggestions true`, compare ghost text/cursor contrast in light/dark themes; verify Right Arrow inserts and Enter sends, cursor movement/typing hides inappropriate suffixes, and native slash/file menus still take priority.
- Exercise suggestions with real session reload/resume, compaction and branch navigation; verify old AI next-prompt placeholders do not carry over and history matches only available current-branch prompts. If a long-running tab keeps old editor behavior, use `/quit` followed by `pi --continue` in the same project directory.
- Exercise `activityStatus` with actual tools and companion extensions, then test `activityChars` on/off during a streamed reply. Verify labels stay readable at narrow widths and the count is clearly characters, not tokens.
- Check Tab and other shortcuts through the user’s actual terminal/tmux setup. Automated PTYs do not certify every terminal protocol or multiplexer.

No commits or publication are part of QA.
