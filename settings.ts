import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export const defaults = { enabled: true, padding: 1, verticalPadding: 1, todos: true, tokenUsage: true, promptBorders: true, promptStyle: 'right', promptLabel: 'You', promptBorderColor: '#5F929B', footer: 'detailed', previewLines: 12, pendingColor: 'borderMuted', runningColor: 'warning', successColor: 'borderMuted', errorColor: 'error' };
export type UISettings = typeof defaults;
const colors = ['borderMuted', 'muted', 'dim', 'accent', 'warning', 'success', 'error'];
export function validateSetting(key: string, value: unknown) {
  if (['enabled', 'todos', 'tokenUsage', 'promptBorders'].includes(key)) return typeof value === 'boolean';
  if (['padding', 'verticalPadding'].includes(key)) return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
  if (key === 'previewLines') return Number.isInteger(value) && Number(value) >= 3 && Number(value) <= 100;
  if (key === 'promptLabel') return typeof value === 'string' && value.length <= 60 && !/[\x00-\x1f\x7f-\x9f]/.test(value);
  if (key === 'promptStyle') return value === 'right' || value === 'outline' || value === 'accent';
  if (key === 'footer') return ['compact', 'detailed'].includes(String(value));
  if (key === 'promptBorderColor') return typeof value === 'string' && (colors.includes(value) || /^#[0-9a-f]{6}$/i.test(value));
  if (key.endsWith('Color') && key in defaults) return colors.includes(String(value));
  return false;
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
