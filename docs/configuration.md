# Configuration

Run `/ui settings` to inspect active settings and their file path. Settings changes save atomically and reload Pi. Invalid configuration disables custom UI while leaving `/ui reset` available to repair it.

| Key | Default | Values |
| --- | --- | --- |
| enabled | true | true / false |
| padding | 1 | Integer 0–3 |
| verticalPadding | 1 | Integer 0–3 |
| todos | true | true / false |
| tokenUsage | true | Show shared-turn/tool-model labels and latest-turn footer status |
| promptBorders | true | true / false |
| promptStyle | right | right / outline / accent |
| promptLabel | You | Text up to 60 characters; empty string hides it |
| promptBorderColor | #5F929B | Theme color below or six-digit hexadecimal color |
| footer | detailed | compact / detailed |
| previewLines | 12 | Integer 3–100 |
| pendingColor | borderMuted | Theme color below |
| runningColor | warning | Theme color below |
| successColor | borderMuted | Theme color below |
| errorColor | error | Theme color below |

Submitted prompts default to `right`: Pi’s native panel with a thick right-side bar and inline `You:` label. Use `/ui set promptStyle accent` for a thin left accent or `/ui set promptStyle outline` for a full outline. Both retain the active theme background and native Markdown rendering. Run `/ui set promptBorders false` to return to Pi’s native rendering. An existing explicit setting is preserved. Right and accent panels show an inline label (`You: message`) on the first text row; wrapped lines align under the message, without repeating the label. On very narrow terminals the label is hidden to leave room for message content. `/ui set promptLabel Omid` sets an explicit name, and `/ui set promptLabel ""` hides it. The default is `You`; no system username is read. Labels are plain text, clipped to the available width, and do not change stored prompts. Their outer terminal gutter uses the shared `padding` setting. The outline aligns with the shared panel gutter. No extra rows or columns are added outside the border. Border cells use the terminal background, while the original message background is confined to the interior, preventing a blue halo outside the outline. Pi's single top/bottom padding rows are removed, while side spacing and intentional blank lines inside messages remain unchanged. Exact pixel equality depends on the terminal font and cannot be guaranteed with whole character cells. `/ui reset` removes the decorator on reload; `/ui enable` restores it only when `promptBorders` is enabled. `promptBorderColor` accepts colors such as `#5F929B` (muted cyan). The feature decorates Pi's exported user-message component; other extensions modifying the same renderer may conflict.

Colors: `borderMuted`, `muted`, `dim`, `accent`, `warning`, `success`, `error`. These use the active theme rather than fixed RGB values.

`padding` controls custom horizontal gutters and tool content padding. When Workbench owns the prompt editor, it also controls the prompt input padding so its cursor stays aligned with the inset borders, regardless of Pi's `editorPaddingX` value. Other extensions' custom editors are left untouched. `verticalPadding` controls blank rows in tool frames. Native transcript padding remains controlled by Pi's own `outputPad` setting.

Collapsed previews apply an additional line limit after native rendering. Expand a tool for its native expanded output. Error results are not additionally clipped by this extension. Generated shell timer lines are suppressed in favor of border timing; command output that happens to match a timer line is retained.

The footer uses cumulative session statistics, including recorded compaction/summary/nested-tool usage. Routing metadata comes from the active branch's latest assistant message; missing metadata is displayed as unknown.

TODO and explicit tool-title history live in the Pi session. Visibility toggled with `/todos` is session-local; use `/ui set todos false` for a persistent preference.
