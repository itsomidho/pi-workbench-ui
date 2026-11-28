import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export const defaults = { enabled: true, padding: 1, verticalPadding: 1, todos: true, tokenUsage: true, activityStatus: true, activityChars: false, promptSuggestions: false, promptBorders: true, promptStyle: 'right', promptLabel: 'You', promptBorderColor: '#5F929B', footer: 'detailed', previewLines: 12, pendingColor: 'borderMuted', runningColor: 'warning', successColor: 'borderMuted', errorColor: 'error' };
export type UISettings = typeof defaults;
const colors = ['borderMuted', 'muted', 'dim', 'accent', 'warning', 'success', 'error'];
type SettingDefinition = { description: string; example: string | number | boolean } & (
  { kind: 'boolean' } | { kind: 'integer'; min: number; max: number } |
  { kind: 'enum'; values: string[] } | { kind: 'label'; maxLength: number } |
  { kind: 'color'; hex?: boolean }
);
export const settingDefinitions: Record<keyof UISettings, SettingDefinition> = {
  enabled: { kind: 'boolean', description: 'Enable custom UI; false restores native surfaces.', example: true },
  padding: { kind: 'integer', min: 0, max: 3, description: 'Horizontal gutters, tool padding and owned editor inset.', example: 1 },
  verticalPadding: { kind: 'integer', min: 0, max: 3, description: 'Blank rows inside tool frames.', example: 1 },
  todos: { kind: 'boolean', description: 'Persistently show or hide the TODO panel.', example: true },
  tokenUsage: { kind: 'boolean', description: 'Show token usage in tool frames and footer.', example: true },
  activityStatus: { kind: 'boolean', description: 'Show live model and tool activity in the working indicator.', example: true },
  activityChars: { kind: 'boolean', description: 'Show streamed reply character count; requires activityStatus.', example: true },
  promptSuggestions: { kind: 'boolean', description: 'Inline prompt suggestions; Right Arrow accepts, Enter sends, Tab autocompletes.', example: true },
  promptBorders: { kind: 'boolean', description: 'Decorate submitted prompts; false uses native rendering.', example: true },
  promptStyle: { kind: 'enum', values: ['right', 'outline', 'accent'], description: 'Submitted prompt: right = right bar, outline = full border, accent = left bar. Requires promptBorders.', example: 'accent' },
  promptLabel: { kind: 'label', maxLength: 60, description: 'Inline prompt name; empty string hides it. Used by right/accent styles.', example: '' },
  promptBorderColor: { kind: 'color', hex: true, description: 'Submitted prompt border/accent color.', example: '#5F929B' },
  footer: { kind: 'enum', values: ['compact', 'detailed'], description: 'Footer detail level; detailed includes location.', example: 'compact' },
  previewLines: { kind: 'integer', min: 3, max: 100, description: 'Extra line limit for collapsed tool previews; expand for full output.', example: 12 },
  pendingColor: { kind: 'color', description: 'Tool frame color before execution.', example: 'borderMuted' },
  runningColor: { kind: 'color', description: 'Tool frame color during execution.', example: 'warning' },
  successColor: { kind: 'color', description: 'Tool frame color after successful execution.', example: 'success' },
  errorColor: { kind: 'color', description: 'Tool frame color after failed execution.', example: 'error' },
};
export const settingKeys = Object.keys(settingDefinitions) as (keyof UISettings)[];
export function allowedSettingValues(key: keyof UISettings): string {
  const definition = settingDefinitions[key];
  switch (definition.kind) {
    case 'boolean': return 'true / false';
    case 'integer': return `Integer ${definition.min}–${definition.max}`;
    case 'enum': return definition.values.join(' / ');
    case 'label': return `Text up to ${definition.maxLength} characters, no control characters; "" hides label`;
    case 'color': return colors.join(' / ') + (definition.hex ? ' / #RRGGBB' : '');
  }
}
export const settingExample = (key: keyof UISettings) => {
  const value = settingDefinitions[key].example;
  return `/ui set ${key} ${typeof value === 'string' ? JSON.stringify(value) : value}`;
};
export function validateSetting(key: string, value: unknown) {
  if (!Object.hasOwn(settingDefinitions, key)) return false;
  const definition = settingDefinitions[key as keyof UISettings];
  switch (definition.kind) {
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return Number.isInteger(value) && Number(value) >= definition.min && Number(value) <= definition.max;
    // Preserve the existing footer/color coercion behavior for saved configurations.
    case 'enum': return definition.values.includes((key === 'footer' ? String(value) : value) as string);
    case 'label': return typeof value === 'string' && value.length <= definition.maxLength && !/[\x00-\x1f\x7f-\x9f]/.test(value);
    case 'color': return definition.hex
      ? typeof value === 'string' && (colors.includes(value) || /^#[0-9a-f]{6}$/i.test(value))
      : colors.includes(String(value));
  }
}
export const settingsPath = () => process.env.PI_WORKBENCH_UI_CONFIG || join(homedir(), '.config/pi-workbench/ui.json');
export function loadSettings(): UISettings {
  let raw: any;
  try { raw = JSON.parse(readFileSync(settingsPath(), 'utf8')); }
  catch (error: any) { if (error.code === 'ENOENT') return { ...defaults }; throw new Error(`Cannot read UI settings: ${error.message}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('UI settings must be an object');
  for (const [key, value] of Object.entries(raw)) if (!validateSetting(key, value)) throw new Error(`Invalid UI setting: ${key}`);
  return { ...defaults, ...raw };
}
export function saveSetting(settings: UISettings, key: string, value: unknown) {
  if (!validateSetting(key, value)) throw new Error(`Invalid UI setting: ${key}`);
  const next = { ...settings, [key]: value };
  const path = settingsPath(), temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
  return next;
}
