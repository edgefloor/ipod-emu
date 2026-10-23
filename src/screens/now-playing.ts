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
  private root: HTMLElement | null = null;
  private signature = '';
  private titleText: HTMLElement | null = null;
  private overflow = 0;
  private measuredWidth = 0;
  private playbackState: boolean | null = null;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    const signature = JSON.stringify([song?.id, song?.trackName, song?.artistName, song?.albumName,
      device.position, device.sequence.length, device.settings.shuffle, device.settings.repeat,
      volumeOverlayVisible(device), device.youtubePlayer?.systemVolume]);
    if (this.root?.parentElement === device.ui.contentEl && this.signature === signature) {
      this.update();
      return;
    }
    this.signature = signature;
    this.titleText = null;
    device.ui.setStatusbar("Now Playing");
    device.ui.clear();
    if (!song) {
      const msg = document.createElement("div");
      msg.className = "msg";
      msg.textContent = "Not playing";
      this.root = msg;
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

    this.root = np;
    device.ui.contentEl.appendChild(np);
    if (song.id !== this.titleId) { this.titleId = song.id; this.titleSince = performance.now(); }
    this.update();
  }

  private update() {
    const device = this.device;
    if (this.playbackState !== device.player.playing) {
      this.playbackState = device.player.playing;
      device.ui.syncChrome();
    }
    if (!device.current || !this.root) return;
    const fill = this.root.querySelector<HTMLElement>('.np__bar-fill');
    const volume = volumeOverlayVisible(device);
    if (fill) {
      const width = `${Math.round(volume ? device.player.volume * 100 : device.duration > 0 ? Math.min(device.elapsed / device.duration, 1) * 100 : 0)}%`;
      if (fill.style.width !== width) fill.style.width = width;
    }
    const times = this.root.querySelectorAll('.np__time');
    const values = [fmtTime(device.elapsed), `-${fmtTime(Math.max(device.duration - device.elapsed, 0))}`];
    times.forEach((node, i) => { if (node.textContent !== values[i]) node.textContent = values[i]; });
    const title = this.root.querySelector<HTMLElement>('.title');
    if (!title) return;
    if (!this.titleText || this.measuredWidth !== window.innerWidth) {
      title.classList.remove('title--scroll');
      title.style.textAlign = '';
      title.textContent = device.current.trackName;
      this.measuredWidth = window.innerWidth;
      this.overflow = Math.max(0, title.scrollWidth - title.clientWidth);
      this.titleText = document.createElement('span');
      this.titleText.textContent = device.current.trackName;
      title.replaceChildren(this.titleText);
    }
    const reduced = this.reducedMotion.matches;
    if (this.overflow <= 0 || reduced) {
      if (this.titleText.style.transform) this.titleText.style.transform = '';
      if (title.classList.contains('title--scroll')) title.classList.remove('title--scroll');
      if (title.style.textAlign) title.style.textAlign = '';
      return;
    }
    const travel = this.overflow / 20 * 1000;
    const phase = (performance.now() - this.titleSince) % (travel * 2 + 3000);
    const offset = phase < 1500 ? 0 : phase < 1500 + travel ? (phase - 1500) / travel * this.overflow
      : phase < 3000 + travel ? this.overflow : this.overflow - (phase - 3000 - travel) / travel * this.overflow;
    title.classList.add('title--scroll');
    title.style.textAlign = 'left';
    const transform = `translateX(-${Math.round(offset)}px)`;
    if (this.titleText.style.transform !== transform) this.titleText.style.transform = transform;
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

