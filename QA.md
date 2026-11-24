# Terminal QA

Automated: `npm test`, `npm run check`, `npm run test:integration`, `npm run test:terminal`. Ask tests cover choices, typed answers, cancellation/abort, non-TUI safety and Unicode widths. Real Ask PTY tests cover selection, Escape cancellation, Other text and resizing without model requests.

The node suite covers state restoration and legacy compatibility, input reset, actual native edit renderer reuse, Unicode and padding width matrices, usage-status layout, titles, output expansion and caching. RPC tests use an isolated configuration and exercise settings/reset/enable with actual Pi reloads. PTY smoke checks startup, Unicode typing, and resizing without model requests. These are not pixel-level visual or latency certification.

The reported duplicated assistant sentence occurs only on screen (saved content contains it once). Fullscreen settled redraw and `/ui redraw` are tested for lifecycle/operation and no message mutation. The original duplicate-row screen artifact has not been reproduced end-to-end; its resolution remains visually unverified.

Manual release checklist (not yet verified):
- Compare light/dark theme colors and change theme with existing tool history visible.
- Resize a long transcript with real images and large expanded diffs in regular/fullscreen modes.
- Restart and resume an on-disk session; inspect TODO and title restoration.
- Exercise the installed usage-status/router extensions together and confirm metrics update.
- Compare typing latency before/after enabling this extension under normal system load.
- Run /ui reset and /ui enable interactively; verify native editor/footer/tool backgrounds return.

No commits or publication are part of QA.
