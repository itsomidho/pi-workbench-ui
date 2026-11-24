# Changelog

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
