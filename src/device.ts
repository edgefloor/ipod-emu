import { AudioEngine } from './audio';
import { IpodUI } from './ui';
import { DEMO_LIBRARY } from './data';
import { $ } from './dom';
import { TRACK_SECONDS, REPEAT, BACKLIGHT_ALWAYS, REPEAT_ORDER } from './constants';
import { loadSettings, persist, DEFAULTS, SETTINGS_KEY } from './settings';
import type { Settings, Track, Library, Playlist } from './types';
import type { YouTubePlayer } from './integrations/youtube';
import type { AppleMusicPlayer } from './integrations/music-player';
import { MainMenuScreen, SongsScreen } from './screens/library';
import { NowPlayingScreen } from './screens/now-playing';
import type { Screen } from './screens/base';
export class Ipod {
  settings: Settings;
  audio: AudioEngine;
  ui: IpodUI;
  deck: Library;
  stack: Screen[] = [];
  sequence: Track[] = [];
  current: Track | null = null;
  position = -1;
  volumeVisibleUntil = 0;
  sleepMinutes = -1;
  sleepDeadline: number | null = null;
  dimTimer: ReturnType<typeof setTimeout> | undefined;
  youtubePlayer: YouTubePlayer | null = null;
  openYouTube: () => void = () => {};
  closeYouTube: () => void = () => {};
  applePlayer: AppleMusicPlayer | null = null;
  openAppleMusic: () => void = () => {};
  loadApplePlaylist: (playlist: Playlist) => void = () => {};
  constructor() {
    this.settings = loadSettings();
    if (this.settings.startupVolume !== "last") this.settings.volume = this.settings.startupVolume;
    this.audio = new AudioEngine(this.settings);
    this.audio.onstate = () => this.ui?.syncChrome();

    this.deck = DEMO_LIBRARY;
    this.ui = new IpodUI(this);

    this.push(new MainMenuScreen(this));
    this.wake();
    this.applyContrast();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  /* ---- audio state ---- */
  get player() { return this.youtubePlayer || this.applePlayer || this.audio; }
  get duration() { return this.youtubePlayer?.duration ?? (this.applePlayer ? this.applePlayer.duration : TRACK_SECONDS); }
  get elapsed() { return this.current ? Math.min(this.player.elapsed, this.duration) : 0; }

  useLibrary(deck: Library) {
    this.closeYouTube();
    this.deck = deck;
    this.current = null;
    this.sequence = [];
    this.position = -1;
    this.stack = [];
    this.push(new MainMenuScreen(this));
  }

  showAppleSongs(songs: Track[], title: string) { this.push(new SongsScreen(this, songs, title)); }

  /* ---- navigation ---- */
  push(screen: Screen) {
    this.stack.push(screen);
    this.ui.slide("push", () => screen.render());
  }

  pop() {
    if (this.stack.length <= 1) return;
    this.stack.pop();
    this.ui.slide("pop", () => this.top()?.render());
  }

  top() {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /* ---- hardware buttons ---- */
  menu() {
    this.audio.buttonPress();
    this.wake();
    this.top()?.onBack();
  }

  select() {
    this.audio.buttonPress();
    if (this.top()?.wakeOnSelect !== false) this.wake();
    this.top()?.onCenter();
  }

  next() {
    this.audio.buttonPress();
    this.wake();
    this.top()?.onNext();
  }

  previous() {
    this.audio.buttonPress();
    this.wake();
    this.top()?.onPrevious();
  }

  playPause() {
    this.audio.buttonPress();
    this.wake();
    this.top()?.onPlay();
  }

  wheelStepBy(step: number) {
    this.audio.wheelTick();
    this.wake();
    this.top()?.onWheel(step);
  }

  /* ---- settings helpers ---- */
  get repeatLabel() {
    return { [REPEAT.OFF]: "Off", [REPEAT.SONG]: "One", [REPEAT.ALL]: "All" }[this.settings.repeat];
  }

  get backlightLabel() {
    const b = this.settings.backlight;
    if (b === BACKLIGHT_ALWAYS) return "Always On";
    if (b === 0) return "Off";
    return `${b} Sec`;
  }

  toggleSetting(key: "shuffle" | "clicker") {
    if (key === "shuffle") {
      this.settings.shuffle = !this.settings.shuffle;
      if (this.youtubePlayer) this.youtubePlayer.modes();
      else if (this.applePlayer) this.applePlayer.modes();
      else this.setSequence(this.sourceOfCurrent(), this.current);
    } else if (key === "clicker") {
      this.settings.clicker = !this.settings.clicker;
      this.audio.clicker = this.settings.clicker;
    }
    persist(this.settings);
    this.top()?.render();
  }

  cycleRepeat() {
    this.settings.repeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(this.settings.repeat) + 1) % REPEAT_ORDER.length];
    (this.youtubePlayer || this.applePlayer)?.modes();
    persist(this.settings);
    this.top()?.render();
  }

  applyContrast() {
    // Browser approximation: adjust ink color without rasterizing the LCD.
    const offset = Math.round((0.5 - this.settings.contrast) * 100);
    $("screen").style.setProperty("--ink-unlit", `rgb(${72 + offset} ${70 + offset} ${71 + offset})`);
    $("screen").style.setProperty("--ink-lit", `rgb(${119 + offset} ${113 + offset} ${124 + offset})`);
  }

  setSleepTimer(minutes: number) {
    this.sleepMinutes = minutes;
    this.sleepDeadline = minutes < 0 ? null : Date.now() + minutes * 60_000;
  }

  checkSleepTimer(now = Date.now()) {
    if (this.sleepDeadline === null || now < this.sleepDeadline) return;
    this.setSleepTimer(-1);
    if (this.player.playing) this.player.toggle();
  }

  resetSettings() {
    this.settings = { ...DEFAULTS };
    this.setSleepTimer(-1);
    this.applyContrast();
    this.audio.clicker = this.settings.clicker;
    this.player.setVolume(this.settings.volume);
    (this.youtubePlayer || this.applePlayer)?.modes();
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      /* storage unavailable */
    }
    this.wake();
  }

  /* ---- track operations ---- */
  setSequence(tracks: Track[], keepThis: Track | null) {
    const order = tracks.slice();
    if (this.settings.shuffle) {
      shuffleOrder(order, keepThis);
    }
    this.sequence = order;
    if (keepThis) this.position = Math.max(0, order.indexOf(keepThis));
  }

  play(tracks: Track[], index: number) {
    this.closeYouTube();
    const selected = tracks[index];
    if (!selected) return;
    if (this.applePlayer) {
      if (this.applePlayer.pending) return;
      this.sequence = tracks.slice();
      this.position = index;
      this.current = selected;
      this.applePlayer.queue(this.sequence, index);
      this.wake();
      this.push(new NowPlayingScreen(this));
      return;
    }
    this.setSequence(tracks, selected);
    this.current = selected;
    this.audio.ensureContext();
    this.audio.boot(this.current);
    this.wake();
    this.push(new NowPlayingScreen(this));
  }

  stepTrack(dir: number) {
    if (this.youtubePlayer) { this.youtubePlayer.step(dir); return; }
    if (this.applePlayer) { this.applePlayer.step(dir); return; }
    if (!this.current || !this.sequence.length) return;
    if (dir < 0 && this.audio.elapsed > 3) {
      this.restart();
      return;
    }
    let at = this.position + dir;
    if (at < 0 || at >= this.sequence.length) {
      if (this.settings.repeat === REPEAT.OFF) {
        this.audio.stop();
        this.current = null;
        this.position = -1;
        this.top()?.render();
        return;
      }
      at = (at + this.sequence.length) % this.sequence.length;
    }
    this.position = at;
    this.current = this.sequence[at];
    this.audio.boot(this.current);
    this.top()?.render();
  }

  restart() {
    if (this.youtubePlayer) { this.youtubePlayer.restart(); return; }
    if (this.applePlayer) { this.applePlayer.restart(); return; }
    if (!this.current) return;
    this.audio.boot(this.current);
    this.top()?.render();
  }

  sourceOfCurrent() {
    return this.sequence.length ? this.sequence : this.deck.songs;
  }

  /** Called from audio end-of-track; honors repeat. */
  endTrack() {
    if (this.settings.repeat === REPEAT.SONG) this.restart();
    else this.stepTrack(1);
  }

  /* ---- backlight ---- */
  /** Light the LCD and restart the backlight dim timer. */
  wake() {
    clearTimeout(this.dimTimer);
    const screen = $("screen");
    const b = this.settings.backlight;
    screen.classList.toggle("backlit", b !== 0);
    if (b === BACKLIGHT_ALWAYS || b === 0) return;
    this.dimTimer = setTimeout(() => screen.classList.remove("backlit"), b * 1000);
  }

  toggleBacklight() {
    clearTimeout(this.dimTimer);
    $("screen").classList.toggle("backlit");
  }

  shuffleSongs() {
    if (!this.deck.songs.length) return;
    this.settings.shuffle = true;
    persist(this.settings);
    this.play(this.deck.songs, Math.floor(Math.random() * this.deck.songs.length));
  }

  /* ---- render frame ---- */
  frame() {
    this.checkSleepTimer();
    if (!this.youtubePlayer && !this.applePlayer && this.current && this.elapsed >= TRACK_SECONDS) {
      this.audio.stop();
      this.endTrack();
    }
    this.top()?.onFrame?.();
    requestAnimationFrame(this.frame);
  }
}

export function shuffleOrder<T>(order: T[], first?: T | null) {
  let i = order.length;
  while (i > 1) {
    const j = Math.floor(Math.random() * i);
    i -= 1;
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (first !== undefined && first !== null) {
    const at = order.indexOf(first);
    if (at > 0) {
      order.splice(at, 1);
      order.unshift(first);
    }
  }
}

