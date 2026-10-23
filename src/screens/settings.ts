import type { Ipod } from '../device';
import { Screen, MenuScreen } from './base';
import { BACKLIGHT_ORDER } from '../constants';
import { persist } from '../settings';

/** A selected value is committed once, then navigation returns to its parent. */
export class ChoiceScreen<T> extends MenuScreen {
  constructor(device: Ipod, title: string, choices: ReadonlyArray<{ label: string; value: T }>, selected: T, commit: (value: T) => void) {
    super(device, title, choices.map(choice => ({
      title: choice.label,
      onSelect: () => { commit(choice.value); device.pop(); }
    })));
    this.sel = Math.max(0, choices.findIndex(choice => choice.value === selected));
  }
}

export const BACKLIGHT_CHOICES = BACKLIGHT_ORDER.map(value => ({
  value, label: value === 0 ? 'Off' : value === -1 ? 'Always On' : `${value} Sec`
}));
export const SLEEP_CHOICES = [-1, 5, 10, 15, 30, 60].map(value => ({
  value, label: value === -1 ? 'Off' : `${value} Minutes`
}));

export class SettingsScreen extends MenuScreen {
  constructor(device: Ipod) {
    super(device, 'Settings', [
      { title: 'Shuffle', value: () => device.settings.shuffle ? 'Songs' : 'Off', onSelect: () => device.toggleSetting('shuffle') },
      { title: 'Repeat', value: () => device.repeatLabel, onSelect: () => device.cycleRepeat() },
      { title: 'Backlight Timer', chevron: true, onSelect: () => device.push(new ChoiceScreen(device, 'Backlight Timer', BACKLIGHT_CHOICES, device.settings.backlight, value => {
        device.settings.backlight = value; persist(device.settings); device.wake();
      })) },
      { title: 'Contrast', chevron: true, onSelect: () => device.push(new AdjustmentScreen(device, 'Contrast', () => device.settings.contrast, value => {
        device.settings.contrast = value; device.applyContrast(); persist(device.settings);
      })) },
      { title: 'Clicker', value: () => device.settings.clicker ? 'On' : 'Off', onSelect: () => device.toggleSetting('clicker') },
      { title: 'Sleep Timer', chevron: true, onSelect: () => device.push(new ChoiceScreen(device, 'Sleep Timer', SLEEP_CHOICES, device.sleepMinutes, value => device.setSleepTimer(value))) },
      { title: 'Startup Volume', chevron: true, onSelect: () => device.push(new ChoiceScreen<number | 'last'>(device, 'Startup Volume', [
        { label: 'Last Volume', value: 'last' }, ...[0, .25, .5, .75, 1].map(value => ({ label: `${value * 100}%`, value }))
      ], device.settings.startupVolume, value => { device.settings.startupVolume = value; persist(device.settings); })) },
      { title: 'Language', value: () => device.settings.language, onSelect: () => device.push(new ChoiceScreen(device, 'Language', [{ label: 'English', value: 'English' }], device.settings.language, () => {})) },
      { title: 'Reset All Settings', chevron: true, onSelect: () => device.push(new ConfirmScreen(device)) }
    ]);
  }
}

export class AdjustmentScreen extends Screen {
  constructor(device: Ipod, private title: string, private read: () => number, private write: (value: number) => void) { super(device); }
  onWheel(step: number) { this.write(Math.max(0, Math.min(1, this.read() + step / 16))); this.render(); }
  onCenter() { this.device.pop(); }
  render() {
    this.device.ui.setStatusbar(this.title);
    this.device.ui.clear();
    const box = document.createElement('div'); box.className = 'adjustment';
    const meter = document.createElement('div'); meter.className = 'np__bar';
    meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', this.title);
    meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '100');
    meter.setAttribute('aria-valuenow', String(Math.round(this.read() * 100)));
    const fill = document.createElement('span'); fill.className = 'np__bar-fill'; fill.style.width = `${this.read() * 100}%`;
    meter.append(fill); box.append(meter); this.device.ui.contentEl.append(box);
  }
}

export class AboutScreen extends Screen {
  render() {
    const device = this.device;
    device.ui.setStatusbar('About'); device.ui.clear();
    const div = document.createElement('div'); div.className = 'about';
    const dl = document.createElement('dl');
    for (const [term, value] of [
      ['Songs', device.deck.songs.length],
      ['Artists', new Set(device.deck.songs.map(song => song.artistName)).size],
      ['Playlists', device.deck.playlists.length],
      ['Source', device.applePlayer ? 'Apple Music' : 'Demo Library'],
      ['Version', 'ipod-emu 0.2']
    ] as const) {
      const dt = document.createElement('dt'); dt.textContent = term;
      const dd = document.createElement('dd'); dd.textContent = String(value); dl.append(dt, dd);
    }
    div.append(dl); device.ui.contentEl.append(div);
  }
  onCenter() { this.device.pop(); }
  onNext() { this.device.pop(); }
  onPrevious() { this.device.pop(); }
}

export class ConfirmScreen extends MenuScreen {
  constructor(device: Ipod) {
    super(device, 'Reset All Settings', [
      { title: 'Cancel', onSelect: () => device.pop() },
      { title: 'Reset', onSelect: () => { device.resetSettings(); device.pop(); } }
    ]);
  }
  onPlay() { this.device.pop(); }
  onNext() { this.sel = 1; this.render(); }
  onPrevious() { this.sel = 0; this.render(); }
}
