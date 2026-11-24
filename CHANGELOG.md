# Changelog

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
