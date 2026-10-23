import { Screen } from './base';

/** A fictional hardware fault. Library and persisted settings are untouched. */
export class DiskErrorScreen extends Screen {
  render() {
    this.device.ui.setStatusbar('Disk error');
    this.device.ui.clear();
    const panel = document.createElement('div');
    panel.className = 'disk-error';
    panel.setAttribute('role', 'alert');
    panel.innerHTML = '<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M8 2h25l7 7v29H8zM14 2v12h19V2M14 38V23h20v15"/><path d="m20 28 8 6m0-6-8 6"/></svg><strong>Hard drive corrupted.</strong><span>Easy on the hardware.</span><small>Press Select to recover</small>';
    this.device.ui.contentEl.append(panel);
  }
  onCenter() { this.device.pop(); }
  onBack() { this.device.pop(); }
}
