# Changelog

## 0.11.0

- Expand `/ui help` with searchable guidance for all 18 UI settings: purpose, current/default values, allowed values and draft-only examples.
- Wrap long command descriptions instead of clipping them; keep multiline selection and page navigation visible across terminal sizes.
- Share accepted-value metadata between settings validation and help; clarify keyboard navigation, device-local preferences and `/ui reset` behavior.
- Automatically follow the next pending TODO when no task is active, and show the final four items when a plan is completed; preserve paused manual browsing.
- Replace OS-conflicting Ctrl+Alt+Up/Down TODO shortcuts with Alt+K (up) / Alt+J (down); update the panel hint and searchable command help.
- Update archive installer defaults and installation examples to v0.11.0.

## 0.10.0

- Use Right Arrow instead of Tab to accept inline ghost text; preserve Tab for native autocomplete.
- Use native language syntax highlighting for untracked code previews in `/ui changes`; preserve tracked diff colors and plain-text fallback.
- Add `/ui help`, a searchable, grouped command palette with descriptions, argument hints and draft-only insertion.
- Add `/ui changes`, a read-only working-tree browser for staged, unstaged, untracked and conflicted paths, with bounded per-file previews.
- Validate all four Changes/help runtime modules before replacing an older archive install.

## 0.9.1

- Document inline suggestion and activity-status implementation, settings, lifecycle behavior and runtime module ownership.
- Expand QA documentation for native autocomplete, mock-provider streaming tests and remaining manual checks.
- Clarify that streaming tests use local loopback mock providers without external model API calls. Runtime behavior is unchanged.

## 0.9.0

- Add opt-in inline completion from recent prompts on the current branch. Tab inserts the visible suggestion’s suffix without a model request or automatic submission.
- Preserve native slash-command and file autocomplete rows when drawing the editor’s bottom border.
- Show live model and tool activity in Pi’s existing working indicator, including short tool titles and parallel tool counts.
- Add an optional live reply character counter, clearly labeled as characters rather than tokens.
- Add opt-in contextual next-prompt suggestions as dim text inside the empty editor. Tab inserts the suggestion as an editable draft without sending it or making an additional model request.
- Validate both new runtime modules before replacing an older archive install.

## 0.8.1

- Give the task usage dashboard more breathing room, an aligned token chart with muted end caps, and a summary that stacks on narrow terminals.
- Restore saved prompt history for Up/Down navigation when Workbench recreates the editor after `/reload`.

## 0.8.0

- Replace interactive task usage Markdown notifications with a responsive dashboard: status bar, highlighted cost, recorded-token share bars, model breakdowns and scrollable details; keep exports and non-TUI output unchanged.

- Limit the TODO panel to four items with keyboard/command scrolling and explicit auto-follow recovery; fix hidden first items in short plans.

- Add named session task usage with explicit boundaries, model breakdowns, unknown/partial metadata, and private JSON/Markdown exports.
- Read an explicit Workbench run ledger as a separate source without merging counts.

## 0.7.0

- Add provider-reported shared-turn usage to tool boxes and latest-turn footer status; keep any tool-reported model usage separate.
- Color input/output counts independently while preserving border status colors and the muted footer.
- Preserve cache distinctions and unknown values; rebuild usage labels from the active branch without extra render-time session scans.
- Add real session-resume coverage and handle multiple buffered RPC response/status lines reliably.

## 0.6.0

- Default to Pi’s native submitted-prompt panel with a thick right-side bar and inline `You:` label. Existing explicit settings are preserved.

## 0.5.0

- Add a switchable solid accent-panel prompt style with a configurable inline `You:`/custom-name label and aligned continuations; system usernames are not exposed automatically.
- Keep outlined prompt backgrounds inside the border, eliminating the blue halo.
- Add coverage for custom/hidden labels, clipping, continuation alignment, solid fill and lifecycle restoration. Existing outline style remains the default; select the new style with `/ui set promptStyle accent`.

## 0.4.1

- Let the same curl installer update older archive installs with a backup, rollback on failed replacement where possible, and no Pi re-registration.

## 0.4.0

- Add configurable muted-cyan submitted-prompt borders, preserving native backgrounds, Markdown and terminal zones, with compact vertical spacing and aligned sides.
- Keep the prompt cursor aligned when Pi reapplies its editor padding.
- Reset ANSI styles before frame/gutter padding so diff backgrounds cannot color the border.
- Align Ask choices with fixed-width radio markers.
- Repaint fullscreen output once a response settles and add `/ui redraw` for manual recovery without message mutation. Recovery is tested; the reported duplicate-screen-row scenario has not been reproduced end-to-end.

## 0.3.0

- Add a no-Git release-archive installer with overwrite protection and optional Pi registration.
- Document curl installation, archive updates and migration; add offline installer checks to CI.
- Resolve test dependencies through Pi's package resolver to support hoisted installations.

## 0.2.0

- Add an interactive Ask box with context, choices, and an Other typed answer through `ask_user`.
- Handle Escape/Ctrl+C, abort and unavailable UI explicitly; cancellation never authorizes an action.
- Add keyboard, Unicode, resize, and real Pi Ask-screen integration tests.
- Document Ask usage and terminal coverage.

## 0.1.1

- Document a dedicated `~/.pi-workbench-ui` installation, safe fast-forward updates, migration and removal.
- Explain the difference between a dedicated checkout and Pi-managed Git packages.

## 0.1.0

- Initial standalone release: task panel, tool frames, prompt indicator and integrated footer.
- Persistent UI configuration, explicit tool titles and reset/enable controls.
- Regression, performance, RPC and PTY smoke tests.
