# Terminal QA

Automated: `npm test`, `npm run check`, `npm run test:integration`, `npm run test:terminal`. Ask tests cover choices, typed answers, cancellation/abort, non-TUI safety and Unicode widths. Real Ask PTY tests cover selection, Escape cancellation, Other text and resizing without model requests.

The node suite covers state restoration and legacy compatibility, input reset, actual native edit renderer reuse, Unicode and padding width matrices, usage-status layout, titles, output expansion and caching. RPC tests use an isolated configuration and exercise settings/reset/enable with actual Pi reloads. PTY smoke checks startup, Unicode typing, and resizing without model requests. These are not pixel-level visual or latency certification.

The reported duplicated assistant sentence occurs only on screen (saved content contains it once). Fullscreen settled redraw and `/ui redraw` are tested for lifecycle/operation and no message mutation. The original duplicate-row screen artifact has not been reproduced end-to-end; its resolution remains visually unverified.

Token usage tests cover provider fields, missing/zero values, cache separation, shared parallel calls, nested live calls, active-branch restoration, no per-render session scans, and responsive border labels. A real Pi PTY fixture resumes two sibling tool calls and checks shared usage plus separate tool-model usage without contacting a provider. Live-provider accounting has not been independently audited.

TODO navigation regression tests cover four-row limits, 0–50 items, clamping, paused/follow mode, branch reset, hidden panels and narrow widths. A real Pi PTY test verifies Ctrl+Alt+arrows, `/todos follow`, draft typing and 40-column resize on a resumed session (no provider calls).

Dashboard tests cover status colors, exact counts, usage-only proportions, unknown/zero/partial metadata, Details/Overview, scrolling, Unicode/narrow layouts, cached rendering and plain-text fallback. A real Pi PTY test opens a saved-session report, toggles details, resizes to 40×24, scrolls, closes with Escape and exports the unchanged report (no provider calls). This is functional terminal coverage, not visual certification on every theme/terminal.

Task report tests cover boundary scope, parallel/shared-turn non-duplication, aggregated tool usage, missing fields, model attribution, explicit Workbench run filtering and private output permissions. A real saved-session Pi RPC test exercises start, reload, finish and export without model requests.

Manual release checklist (not yet verified):
- Compare light/dark theme colors and change theme with existing tool history visible.
- Resize a long transcript with real images and large expanded diffs in regular/fullscreen modes.
- Restart and resume an on-disk session; inspect TODO and title restoration.
- Exercise the installed usage-status/router extensions together and confirm metrics update.
- Compare typing latency before/after enabling this extension under normal system load.
- Run /ui reset and /ui enable interactively; verify native editor/footer/tool backgrounds return.

No commits or publication are part of QA.
