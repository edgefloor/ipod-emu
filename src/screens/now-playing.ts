import { icon } from "../icons";
import type { Ipod } from '../device';
import { Screen } from './base';
import { persist } from '../settings';
import { REPEAT } from '../constants';
import { fmtTime } from '../dom';
export class NowPlayingScreen extends Screen {
  lastPaint = 0;
  private titleId: string | number | null = null;
  private titleSince = 0;
  constructor(device: Ipod) {
    super(device);
  }

  onWheel(step: number) {
    if (this.device.youtubePlayer?.systemVolume) {
      this.device.volumeVisibleUntil = Date.now() + 1800;
      this.render();
      return;
    }
    this.device.player.setVolume(this.device.player.volume + step / 32);
    this.device.settings.volume = this.device.player.volume;
    persist(this.device.settings);
    this.device.volumeVisibleUntil = Date.now() + 1800;
    this.render();
  }

  onCenter() {
    this.device.player.toggle();
    this.render();
  }

  onNext() {
    this.device.stepTrack(1);
  }

  onPrevious() {
    this.device.stepTrack(-1);
  }

  onPlay() {
    this.device.player.toggle();
    this.render();
  }

  onFrame() {
    if (this !== this.device.top() || this.device.ui.sliding) return;
    const now = performance.now();
    if (now - (this.lastPaint ?? 0) < 150) return; // ~7 fps is plenty for the LCD
    this.lastPaint = now;
    this.render();
  }

  render() {
    const device = this.device;
    const song = device.current;
    device.ui.setStatusbar("Now Playing");
    device.ui.clear();
    if (!song) {
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.textContent = "Not playing";
      device.ui.contentEl.appendChild(msg);
      return;
    }
    const np = document.createElement("div");
    np.className = "np";

    const pos = document.createElement("div");
    pos.className = "np__position";
    const idx = document.createElement("span");
    idx.textContent = `${device.position + 1} of ${device.sequence.length}`;
    pos.appendChild(idx);
    const mods = document.createElement("span");
    mods.className = "np__modifiers";
    if (device.settings.shuffle) mods.append(icon('shuffle', 'Shuffle songs'));
    if (device.settings.repeat === REPEAT.SONG) mods.append(icon('repeatOne', 'Repeat one'));
    else if (device.settings.repeat === REPEAT.ALL) mods.append(icon('repeat', 'Repeat all'));
    pos.appendChild(mods);
    np.appendChild(pos);

    const meta = document.createElement("div");
    meta.className = "np__meta";
    for (const [cls, text] of [
      ["title", song.trackName],
      ["artist", song.artistName],
      ["album", song.albumName]
    ] as const) {
      if (!text) continue;
      const div = document.createElement("div");
      div.className = cls;
      div.textContent = text;
      meta.appendChild(div);
    }
    np.appendChild(meta);

    if (volumeOverlayVisible(device)) {
      // volume bar takes over the scrubber zone, like the real UI
      const vol = document.createElement("div");
      vol.className = "np__progress np__volume";
      if (device.youtubePlayer?.systemVolume) {
        vol.classList.add('np__system-volume');
        vol.textContent = 'Use phone volume buttons';
      } else vol.append(icon('speaker'), volumeBar(device), icon('speakerLoud'));
      np.appendChild(vol);
    } else {
      np.appendChild(progressRow(device.elapsed, device.duration));
    }

    device.ui.contentEl.appendChild(np);
    if (song.id !== this.titleId) { this.titleId = song.id; this.titleSince = performance.now(); }
    const title = meta.querySelector<HTMLElement>('.title');
    if (title && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && title.scrollWidth > title.clientWidth) {
      const overflow = title.scrollWidth - title.clientWidth;
      const travel = overflow / 20 * 1000;
      const phase = (performance.now() - this.titleSince) % (travel * 2 + 3000);
      const offset = phase < 1500 ? 0 : phase < 1500 + travel ? (phase - 1500) / travel * overflow
        : phase < 3000 + travel ? overflow : overflow - (phase - 3000 - travel) / travel * overflow;
      title.classList.add('title--scroll');
      title.style.textAlign = 'left';
      const text = document.createElement('span');
      text.textContent = song.trackName;
      text.style.transform = `translateX(-${Math.round(offset)}px)`;
      title.replaceChildren(text);
    }
  }
}

function volumeOverlayVisible(device: Ipod) {
  return device.volumeVisibleUntil > Date.now() && device.top() instanceof NowPlayingScreen;
}

function volumeBar(device: Ipod) {
  const bar = document.createElement("span");
  bar.className = "np__bar";
  bar.style.margin = "0 2px";
  const fill = document.createElement("span");
  fill.className = "np__bar-fill";
  fill.style.width = `${Math.round(device.player.volume * 100)}%`;
  bar.appendChild(fill);
  return bar;
}

function progressRow(elapsed: number, total: number) {
  const row = document.createElement("div");
  row.className = "np__progress";
  const left = document.createElement("span");
  left.className = "np__time";
  left.textContent = fmtTime(elapsed);
  const bar = document.createElement("div");
  bar.className = "np__bar";
  const fill = document.createElement("span");
  fill.className = "np__bar-fill";
  fill.style.width = `${Math.round(total > 0 ? Math.min(elapsed / total, 1) * 100 : 0)}%`;
  fill.setAttribute("data-testid", "np-progress");
  bar.appendChild(fill);
  const right = document.createElement("span");
  right.className = "np__time np__time--remaining";
  right.textContent = `-${fmtTime(Math.max(total - elapsed, 0))}`;
  row.append(bar, left, right);
  return row;
}

