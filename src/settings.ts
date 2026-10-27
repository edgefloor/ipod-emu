import type { Settings } from './types';
import { BACKLIGHT_ORDER, REPEAT_ORDER } from './constants';

export const SETTINGS_KEY = 'ipod-emu:settings';
// Browser defaults, not recovered factory defaults.
export const DEFAULTS: Readonly<Settings> = Object.freeze({
  shuffle: false, repeat: 'off', backlight: 2, clicker: true, volume: 0.8,
  contrast: 0.5, startupVolume: 'last', language: 'English'
});
const unit = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export function normalizeSettings(raw: unknown): Settings {
  const settings = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return settings;
  const value = raw as Record<string, unknown>;
  if (typeof value.shuffle === 'boolean') settings.shuffle = value.shuffle;
  if (typeof value.clicker === 'boolean') settings.clicker = value.clicker;
  if (REPEAT_ORDER.some(mode => mode === value.repeat)) settings.repeat = value.repeat as Settings['repeat'];
  if (typeof value.backlight === 'number' && BACKLIGHT_ORDER.includes(value.backlight)) settings.backlight = value.backlight;
  if (unit(value.volume)) settings.volume = value.volume;
  if (unit(value.contrast)) settings.contrast = value.contrast;
  if (unit(value.startupVolume) || value.startupVolume === 'last') settings.startupVolume = value.startupVolume;
  return settings;
}
export function loadSettings(): Settings {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); }
  catch { return { ...DEFAULTS }; }
}
export function persist(settings: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* Private browsing may disable storage. Keep preferences in memory. */ }
}
