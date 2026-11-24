# Configuration

Run `/ui settings` to inspect active settings and their file path. Settings changes save atomically and reload Pi. Invalid configuration disables custom UI while leaving `/ui reset` available to repair it.

| Key | Default | Values |
| --- | --- | --- |
| enabled | true | true / false |
| padding | 1 | Integer 0–3 |
| verticalPadding | 1 | Integer 0–3 |
| todos | true | true / false |
| promptBorders | true | true / false |
| promptBorderColor | #5F929B | Theme color below or six-digit hexadecimal color |
| footer | detailed | compact / detailed |
| previewLines | 12 | Integer 3–100 |
| pendingColor | borderMuted | Theme color below |
| runningColor | warning | Theme color below |
| successColor | borderMuted | Theme color below |
| errorColor | error | Theme color below |

Submitted prompts retain the active theme background and native Markdown rendering. Their outer terminal gutter uses the shared `padding` setting. The outline aligns with the shared panel gutter. No extra rows or columns are added outside the border; the border cells retain the message background to provide a thin blue rim. Pi's single top/bottom padding rows are removed, while side spacing and intentional blank lines inside messages remain unchanged. Exact pixel equality depends on the terminal font and cannot be guaranteed with whole character cells. `/ui reset` removes the decorator on reload; `/ui enable` restores it. `promptBorderColor` accepts colors such as `#5F929B` (muted cyan). The feature decorates Pi's exported user-message component; other extensions modifying the same renderer may conflict.

Colors: `borderMuted`, `muted`, `dim`, `accent`, `warning`, `success`, `error`. These use the active theme rather than fixed RGB values.

`padding` controls custom horizontal gutters and tool content padding. When Workbench owns the prompt editor, it also controls the prompt input padding so its cursor stays aligned with the inset borders, regardless of Pi's `editorPaddingX` value. Other extensions' custom editors are left untouched. `verticalPadding` controls blank rows in tool frames. Native transcript padding remains controlled by Pi's own `outputPad` setting.

Collapsed previews apply an additional line limit after native rendering. Expand a tool for its native expanded output. Error results are not additionally clipped by this extension. Generated shell timer lines are suppressed in favor of border timing; command output that happens to match a timer line is retained.

The footer uses cumulative session statistics, including recorded compaction/summary/nested-tool usage. Routing metadata comes from the active branch's latest assistant message; missing metadata is displayed as unknown.

TODO and explicit tool-title history live in the Pi session. Visibility toggled with `/todos` is session-local; use `/ui set todos false` for a persistent preference.
