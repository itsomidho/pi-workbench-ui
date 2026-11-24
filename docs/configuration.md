# Configuration

Run `/ui settings` to inspect active settings and their file path. Settings changes save atomically and reload Pi. Invalid configuration disables custom UI while leaving `/ui reset` available to repair it.

| Key | Default | Values |
| --- | --- | --- |
| enabled | true | true / false |
| padding | 1 | Integer 0–3 |
| verticalPadding | 1 | Integer 0–3 |
| todos | true | true / false |
| footer | detailed | compact / detailed |
| previewLines | 12 | Integer 3–100 |
| pendingColor | borderMuted | Theme color below |
| runningColor | warning | Theme color below |
| successColor | borderMuted | Theme color below |
| errorColor | error | Theme color below |

Colors: `borderMuted`, `muted`, `dim`, `accent`, `warning`, `success`, `error`. These use the active theme rather than fixed RGB values.

`padding` controls custom horizontal gutters and tool content padding. `verticalPadding` controls blank rows in tool frames. Native transcript padding remains controlled by Pi's own `outputPad` setting.

Collapsed previews apply an additional line limit after native rendering. Expand a tool for its native expanded output. Error results are not additionally clipped by this extension. Generated shell timer lines are suppressed in favor of border timing; command output that happens to match a timer line is retained.

The footer uses cumulative session statistics, including recorded compaction/summary/nested-tool usage. Routing metadata comes from the active branch's latest assistant message; missing metadata is displayed as unknown.

TODO and explicit tool-title history live in the Pi session. Visibility toggled with `/todos` is session-local; use `/ui set todos false` for a persistent preference.
