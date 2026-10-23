import type { Track, Settings } from '../types';
import type { MusicKitInstance } from './musickit-types';
import { requireSDK } from './music-api';
/** The player only needs queue state and a chrome refresh, not the full UI controller. */
export interface PlaybackHost {
  settings: Settings;
  sequence: Track[];
  current: Track | null;
  position: number;
  readonly player: { readonly playing: boolean };
  ui: { syncChrome(): void };
}
export class AppleMusicPlayer {
  pending = false;
  closed = false;
  tail: Promise<unknown> = Promise.resolve();
  sync: () => void;
  error: () => void;
  constructor(public music: MusicKitInstance, public device: PlaybackHost, public report: (message: string) => void) {
    this.sync = () => {
      if (this.closed || this.pending || device.player !== this) return;
      const index = music.nowPlayingItemIndex;
      if (Number.isInteger(index) && device.sequence[index]) {
        device.position = index; device.current = device.sequence[index];
      }
      device.ui.syncChrome();
    };
    this.error = () => report('Playback failed. Check your subscription, authorization, and whether this song is available.');
    music.addEventListener('nowPlayingItemDidChange', this.sync);
    music.addEventListener('playbackStateDidChange', this.sync);
    music.addEventListener('mediaPlaybackError', this.error);
    this.setVolume(device.settings.volume);
  }
  get elapsed() { return Math.max(0, this.music.currentPlaybackTime || 0); }
  get duration() { return this.music.currentPlaybackDuration || this.device.current?.duration || 0; }
  get playing() { return this.music.isPlaying; }
  get volume() { return this.music.volume; }
  setVolume(value: number) { this.music.volume = Math.max(0, Math.min(1, value)); }
  modes() {
    const kit = requireSDK();
    this.music.repeatMode = kit.PlayerRepeatMode[({off:'none',song:'one',all:'all'} as const)[this.device.settings.repeat]];
    this.music.shuffleMode = kit.PlayerShuffleMode[this.device.settings.shuffle ? 'songs' : 'off'];
  }
  run(action: () => Promise<unknown>) {
    this.tail = this.tail.then(() => this.closed ? undefined : action()).catch(() => { if (!this.closed) this.error(); });
    return this.tail;
  }
  queue(tracks: Track[], index: number) {
    this.pending = true;
    return this.run(async () => {
      try {
        this.music.shuffleMode = requireSDK().PlayerShuffleMode.off;
        await this.music.setQueue({ items: tracks.map(t => { if (!t.musicKitItem) throw new Error("Not an Apple Music track"); return t.musicKitItem; }) });
        if (this.closed) return;
        await this.music.changeToMediaAtIndex(index);
        this.modes();
      } finally { this.pending = false; this.sync(); }
    });
  }
  toggle() { return this.run(() => this.playing ? this.music.pause() : this.music.play()); }
  step(dir: number) { return this.run(() => dir < 0 ? (this.elapsed > 3 ? this.music.seekToTime(0) : this.music.skipToPreviousItem()) : this.music.skipToNextItem()); }
  restart() { return this.run(() => this.music.seekToTime(0)); }
  async dispose() {
    this.closed = true;
    this.music.removeEventListener('nowPlayingItemDidChange', this.sync);
    this.music.removeEventListener('playbackStateDidChange', this.sync);
    this.music.removeEventListener('mediaPlaybackError', this.error);
    await this.tail;
    await this.music.stop();
  }
}

