# Development and testing

## Setup

Install Node.js 22.13+ and Pi 1.6.0 (the tested version):

```sh
npm install --global @earendil-works/pi-coding-agent@1.6.0
git clone https://github.com/itsomidho/pi-workbench-ui.git
cd pi-workbench-ui
```

Runtime imports are supplied by Pi. No production dependencies are bundled. Test tooling discovers a local or global Pi installation; override its package directory with `PI_INSTALL_ROOT`.

## Checks

- `npm test`: state/renderer/settings regressions and synthetic performance checks.
- `npm run check`: TypeScript syntax checking (not a full type check).
- `npm run test:integration`: actual Pi RPC loading and settings/reset/enable through reload.
- `npm run test:terminal`: Unix PTY startup, Unicode typing and 40/80/120-column resizing.

Python tests require Python 3 and a `pi` executable on PATH. Tests use temporary configuration and do not call a model API. They do not edit your settings or session.

Regression coverage includes legacy TODO state, input reset, native edit renderer reuse, padding/width matrices, footer routing and metrics, call descriptions, output previews, and cache invalidation. Performance tests check reuse and count expensive operations; printed timings are machine-dependent and are not a live typing-latency claim.

See [QA.md](../QA.md) for unverified/manual coverage: real session restart/resume, light/dark visual comparison, images, fullscreen mode, and live companion-extension interaction.

## Files

- `index.ts`: extension, UI components, tool presentation and session state.
- `settings.ts`: validated persistent settings.
- `test.mjs`: regression and performance suite.
- `test-support.mjs`: portable Pi installation discovery.
- `integration.py`, `terminal-test.py`: isolated runtime smoke tests.

Do not commit credentials, personal settings, session logs, generated reports, or private screenshots.
