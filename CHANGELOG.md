# Changelog

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
