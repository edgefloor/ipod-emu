/* ipod-emu — an original, dependency-free emulator.
 *
 * Behavioral reference: the <web-music-ipod> web component on Apple Music's
 * 404 page (documented in README). None of that component's code, fonts,
 * sounds, artwork or data is reproduced here — this is a from-scratch
 * implementation of the behavior observed in the evidence:
 *
 *  - click wheel: pointer capture within the ring, angular delta tracking,
 *    a direction lock that requires minimum travel, then committing one
 *    "step" per WHEEL_STEP_DEGREES, plus drag-start/drag-end boundary events,
 *  - WebAudio click layer with a persisted Clicker setting,
 *  - settings persisted to localStorage: shuffle, repeat, backlight timer,
 *    clicker (and volume),
 *  - backlight dims after the configured idle time (Off / 1 / 2 / 3 / 5 s /
 *    Always On),
 *  - screens: main menu (Playlists / Artists / Songs / Now Playing /
 *    Settings), nested lists, Now Playing with progress + volume-on-wheel
 *    on that screen, settings incl. About / Shuffle / Repeat / Backlight /
 *    Clicker / Reset All, and the classic Brick game.
 */

const WHEEL_STEP_DEGREES = 25; // observed default of dragStepDegrees
const WHEEL_ENGAGE_DEGREES = 8; // travel before a press becomes a drag
const TRACK_SECONDS = 30; // preview-like duration
const LIST_ROWS = 6;

const REPEAT = { OFF: "off", SONG: "song", ALL: "all" };
const BACKLIGHT_ALWAYS = -1;
const BACKLIGHT_ORDER = [BACKLIGHT_ALWAYS, 1, 2, 3, 5, 0];
const REPEAT_ORDER = [REPEAT.OFF, REPEAT.SONG, REPEAT.ALL];

const DEFAULTS = Object.freeze({
  shuffle: false,
  repeat: REPEAT.OFF,
  backlight: BACKLIGHT_ALWAYS,
  clicker: true,
  volume: 0.8
});

const SETTINGS_KEY = "ipod-emu:settings";

const $ = (id) => document.getElementById(id);

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable (private mode, opaque origin) — settings stay in memory */
  }
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- audio -- */

/** WebAudio layer: synthesized click + procedural per-song preview buffers. */
class AudioEngine {
  constructor(settings) {
    this.ctx = null;
    this.clicker = settings.clicker;
    this.volume = settings.volume;
    this.buffersBySeed = new Map();
    this.source = null;
    this.gain = null;
    this.startedAt = 0;
    this.onstate = null; // set by the device; fired when playback state settles
  }

  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      this.ctx = AC ? new AC() : null;
    }
    if (this.ctx && ["suspended", "interrupted"].includes(this.ctx.state)) this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Run inside a tap/release gesture; pointerdown alone does not unlock iOS audio. */
  unlock() {
    // On supporting mobile browsers, route this music player through media audio.
    try {
      if (window.navigator?.audioSession) window.navigator.audioSession.type = "playback";
    } catch { /* Older browsers retain their default audio session. */ }
    const ctx = this.ensureContext();
    if (!ctx) return;
    // A silent source primes the output on WebKit without changing the feedback sounds.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.onended = () => source.disconnect();
    source.start();
  }

  /** A hard detent with the original fast decay and less high-frequency ring. */
  tickBuffer() {
    if (this._tick) return this._tick;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.004), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 22222, previous = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296) * 2 - 1;
      const edge = noise - previous;
      previous = noise;
      data[i] = (0.55 * edge + 0.2 * Math.sin(2 * Math.PI * 11000 * t)) * Math.exp(-t / 0.00075);
    }
    this._tick = buffer;
    return buffer;
  }

  /** One dry switch snap. Short housing resonance, no chatter or release echo. */
  buttonBuffer() {
    if (this._button) return this._button;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.014), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const lowpass = 1 - Math.exp(-2 * Math.PI * 1600 / ctx.sampleRate);
    const highpass = 1 - Math.exp(-2 * Math.PI * 500 / ctx.sampleRate);
    let seed = 8147, low = 0, slow = 0, filtered = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      low += lowpass * ((seed / 4294967296) * 2 - 1 - low);
      slow += highpass * (low - slow);
      const snap = (low - slow) * Math.exp(-t / 0.0012);
      const shell = Math.sin(2 * Math.PI * 1250 * t) * Math.exp(-t / 0.0008);
      const sample = (0.85 * snap + 0.15 * shell) * Math.min(1, t / 0.00008);
      filtered += lowpass * (sample - filtered);
      data[i] = filtered * (1 - i / data.length);
    }
    this._button = buffer;
    return buffer;
  }

  playFeedback(buffer, volume, pan, at) {
    const ctx = this.ctx;
    if (!ctx || !buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const stereo = ctx.createStereoPanner();
    source.buffer = buffer;
    gain.gain.value = volume;
    stereo.pan.value = pan;
    source.connect(gain).connect(stereo).connect(ctx.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); stereo.disconnect(); };
    source.start(at ?? ctx.currentTime);
  }

  wheelTick() {
    if (!this.clicker) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Preserve the detent cadence during quick turns, with a bounded tail.
    const at = Math.max(ctx.currentTime, this.nextClickAt ?? 0);
    if (at - ctx.currentTime >= 0.1) return;
    this.playFeedback(this.tickBuffer(), 0.28, -0.2, at);
    this.nextClickAt = at + 0.05;
  }

  buttonPress() {
    if (!this.clicker) return;
    this.ensureContext();
    this.playFeedback(this.buttonBuffer(), 0.22, 0);
  }

  blip(freq, ms = 60, type = "square") {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.01);
  }

  /** Deterministic pentatonic noodle from an integer seed. */
  melody(seed) {
    const base = [220, 247, 277, 330, 370, 440, 494, 554];
    let s = (seed >>> 0) || 1;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const notes = [];
    const count = Math.floor(TRACK_SECONDS / 0.25);
    for (let i = 0; i < count; i++) {
      if (rand() < 0.12) notes.push(null);
      else notes.push(base[Math.floor(rand() * base.length)]);
    }
    return notes;
  }

  /** Render a TRACK_SECONDS melody into a one-shot AudioBuffer, cached. */
  requestBuffer(seed, whenReady) {
    if (this.buffersBySeed.has(seed)) return this.buffersBySeed.get(seed) ?? null;
    const ctx = this.ensureContext();
    if (!ctx) return null;
    const OfflineAC = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
    if (!OfflineAC) return null;
    const rate = 22050;
    const offline = new OfflineAC(1, rate * TRACK_SECONDS, rate);
    // gentle lowpass takes the buzzy edge off the square-wave melody
    const filter = offline.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    filter.Q.value = 0.4;
    filter.connect(offline.destination);
    const step = 0.25;
    let t = 0.05;
    for (const n of this.melody(seed)) {
      if (n === null) {
        t += step;
        continue;
      }
      const o = offline.createOscillator();
      const g = offline.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(n, t);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + step * 0.9);
      o.connect(g).connect(filter);
      o.start(t);
      o.stop(t + step * 0.92);
      t += step;
    }
    // bass root
    const bass = offline.createOscillator();
    const bg = offline.createGain();
    bass.type = "triangle";
    bass.frequency.value = 110;
    bg.gain.setValueAtTime(0.12, 0);
    bg.gain.setValueAtTime(0.0001, TRACK_SECONDS);
    bass.connect(bg).connect(filter);
    bass.start(0);
    bass.stop(TRACK_SECONDS);

    offline
      .startRendering()
      .then((buf) => {
        this.buffersBySeed.set(seed, buf);
        if (whenReady) whenReady(buf);
      })
      .catch(() => this.buffersBySeed.delete(seed));
    return null; // will arrive via whenReady
  }

  boot(track) {
    this.stop();
    const ctx = this.ensureContext();
    if (!ctx) return;
    const request = this.requestId;
    this.pending = true;
    const start = (buffer) => {
      if (request !== this.requestId || !this.pending) return;
      this.pending = false;
      this.buffer = buffer;
      this.startAt(0);
    };
    const whenReady = (buffer) => {
      if (ctx.state === "running") start(buffer);
      else ctx.resume().then(() => start(buffer)).catch(() => {});
    };
    const buffer = this.requestBuffer(track.melodySeed, whenReady);
    if (buffer) whenReady(buffer);
  }

  startAt(offset) {
    const ctx = this.ensureContext();
    if (!ctx || !this.buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.buffer = this.buffer;
    source.connect(gain).connect(ctx.destination);
    source.start(0, offset);
    this.source = source;
    this.gain = gain;
    this.startedAt = ctx.currentTime - offset;
    this.pausedAt = null;
    this.onstate?.();
  }

  get elapsed() {
    if (this.pausedAt !== null && this.pausedAt !== undefined) return this.pausedAt;
    if (!this.ctx || !this.source) return 0;
    return Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  get playing() {
    return !!this.source && this.ctx?.state === "running";
  }

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  toggle() {
    if (this.pending) {
      this.stop();
    } else if (this.source) {
      this.pausedAt = Math.min(this.elapsed, TRACK_SECONDS - 0.001);
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    } else if (this.buffer && this.pausedAt !== null) {
      this.startAt(this.pausedAt);
    }
    this.onstate?.();
    return this.playing;
  }

  stop() {
    this.requestId = (this.requestId ?? 0) + 1;
    this.pending = false;
    this.buffer = null;
    this.pausedAt = null;
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
  }

}

/* ------------------------------------------------------------ playback -- */

/* ----------------------------------------------------------------- view -- */

class IpodUI {
  constructor(device) {
    this.device = device;
    this.statusbarEl = $("statusbar-title");
    this.playEl = $("statusbar-play");
    this.contentEl = $("content");
  }

  setStatusbar(text) {
    this.statusbarEl.classList.remove("statusbar__title--game");
    this.statusbarEl.textContent = text;
    this.syncChrome();
  }

  /** Title-bar chrome that mirrors playback state (classic ▶ / ❚❚ indicator). */
  syncChrome() {
    if (!this.playEl) return;
    const { player: audio, current } = this.device;
    this.playEl.classList.toggle("playing", audio.playing);
    this.playEl.classList.toggle("paused", !audio.playing && !!current);
  }

  clear() {
    this.flushTransition?.();
    this.contentEl.replaceChildren();
  }

  /**
   * Screen push animation (observed: 240 ms ease-in-out sine, full-width
   * slide). direction "push": new screen enters from the right; "pop": from
   * the left. renderFn draws the incoming screen synchronously.
   */
  slide(direction, renderFn) {
    this.flushTransition?.();
    this.flushTransition = null;
    const oldPane = document.createElement("div");
    while (this.contentEl.firstChild) oldPane.appendChild(this.contentEl.firstChild);
    if (!oldPane.hasChildNodes()) {
      renderFn();
      return;
    }
    renderFn();
    const newPane = document.createElement("div");
    while (this.contentEl.firstChild) newPane.appendChild(this.contentEl.firstChild);
    const sign = direction === "push" ? 1 : -1;
    for (const [pane, from] of [
      [oldPane, "0%"],
      [newPane, `${sign * 100}%`]
    ]) {
      pane.className = "pane";
      pane.style.transform = `translateX(${from})`;
      this.contentEl.appendChild(pane);
    }
    void this.contentEl.offsetWidth; // force reflow so the transition runs
    for (const [pane, to] of [
      [oldPane, `${-sign * 100}%`],
      [newPane, "0%"]
    ]) {
      pane.style.transition = "transform 240ms cubic-bezier(0.37, 0, 0.63, 1)";
      pane.style.transform = `translateX(${to})`;
    }
    this.sliding = true;
    this.flushTransition = () => {
      clearTimeout(timer);
      while (newPane.firstChild) this.contentEl.appendChild(newPane.firstChild);
      oldPane.remove();
      newPane.remove();
      this.sliding = false;
      this.flushTransition = null;
    };
    newPane.addEventListener("transitionend", () => this.flushTransition?.(), { once: true });
    // transitionend is not guaranteed (hidden tab pauses transitions)
    const timer = setTimeout(() => this.flushTransition?.(), 260);
  }

  /** Standard inverted-selection menu rows. Passes rows already windowed. */
  drawList(title, rows, selIndex, scroll) {
    this.setStatusbar(title);
    this.clear();
    const ul = document.createElement("div");
    ul.className = "menu";
    rows.forEach((row, i) => {
      const div = document.createElement("div");
      div.className = "menu__row";
      div.appendChild(labelFor(row.label));
      if (i === selIndex) {
        div.classList.add("menu__row--selected");
        div.setAttribute("data-testid", "menu-selected");
      }
      if (row.value !== undefined) {
        const val = document.createElement("span");
        val.className = "set__value";
        val.textContent = row.value;
        div.appendChild(val);
      } else if (row.chevron) {
        const chev = document.createElement("span");
        chev.className = "chev";
        div.appendChild(chev);
      }
      ul.appendChild(div);
    });
    if (scroll && scroll.total > 0 && scroll.total > rows.length) {
      ul.classList.add("menu--scroll");
      const track = document.createElement("div");
      track.className = "menu-scroll";
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", `Items ${scroll.top + 1}–${scroll.top + rows.length} of ${scroll.total}`);
      const rail = document.createElement("div");
      rail.className = "menu-scroll__rail";
      const thumb = document.createElement("div");
      thumb.className = "menu-scroll__thumb";
      // Its size conveys how much of this folder is visible, not selection progress.
      thumb.style.height = `${(rows.length / scroll.total) * 100}%`;
      thumb.style.top = `${(scroll.top / scroll.total) * 100}%`;
      rail.appendChild(thumb);
      track.appendChild(rail);
      ul.appendChild(track);
    }
    this.contentEl.appendChild(ul);
  }
}

function labelFor(text) {
  const span = document.createElement("span");
  span.className = "label";
  span.textContent = text;
  return span;
}

/* ---------------------------------------------------------------- device -- */

class Ipod {
  constructor() {
    this.settings = loadSettings();
    this.audio = new AudioEngine(this.settings);
    this.audio.onstate = () => this.ui?.syncChrome();

    const json = window.IPOD_DATA ?? { schemaVersion: 3, songs: [], artists: [], playlists: [] };
    this.deck = json;

    this.stack = [];
    this.sequence = [];
    this.current = null;
    this.volumeVisibleUntil = 0;

    this.dimTimer = null;
    this.ui = new IpodUI(this);

    this.push(new MainMenuScreen(this));
    this.wake();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  /* ---- audio state ---- */
  get player() { return this.applePlayer || this.audio; }
  get duration() { return this.applePlayer ? this.applePlayer.duration : TRACK_SECONDS; }
  get elapsed() { return this.current ? Math.min(this.player.elapsed, this.duration) : 0; }

  useLibrary(deck) {
    this.deck = deck;
    this.current = null;
    this.sequence = [];
    this.position = -1;
    this.stack = [];
    this.push(new MainMenuScreen(this));
  }

  showAppleSongs(songs, title) { this.push(new SongsScreen(this, songs, title)); }

  /* ---- navigation ---- */
  push(screen) {
    this.stack.push(screen);
    this.ui.slide("push", () => screen.render());
  }

  pop() {
    if (this.stack.length <= 1) return;
    this.stack.pop();
    this.ui.slide("pop", () => this.top().render());
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

  wheelStepBy(step) {
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
    return `${b} s`;
  }

  toggleSetting(key) {
    if (key === "shuffle") {
      this.settings.shuffle = !this.settings.shuffle;
      if (this.applePlayer) this.applePlayer.modes();
      else this.setSequence(this.sourceOfCurrent(), this.current);
    } else if (key === "clicker") {
      this.settings.clicker = !this.settings.clicker;
      this.audio.clicker = this.settings.clicker;
    }
    persist(this.settings);
    this.top()?.render();
  }

  cycleSetting(key) {
    const order = { repeat: REPEAT_ORDER, backlight: BACKLIGHT_ORDER }[key];
    if (!order) return;
    this.settings[key] = order[(order.indexOf(this.settings[key]) + 1) % order.length];
    if (key === "backlight") this.wake();
    if (key === "repeat") this.applePlayer?.modes();
    persist(this.settings);
    this.top()?.render();
  }

  resetSettings() {
    this.settings = { ...DEFAULTS };
    this.audio.clicker = this.settings.clicker;
    this.player.setVolume(this.settings.volume);
    this.applePlayer?.modes();
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      /* storage unavailable */
    }
    this.wake();
  }

  /* ---- track operations ---- */
  setSequence(tracks, keepThis) {
    const order = tracks.slice();
    if (this.settings.shuffle) {
      shuffleOrder(order, keepThis);
    }
    this.sequence = order;
    if (keepThis) this.position = Math.max(0, order.indexOf(keepThis));
  }

  play(tracks, index) {
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

  stepTrack(dir) {
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
    if (!this.applePlayer && this.current && this.elapsed >= TRACK_SECONDS) {
      this.audio.stop();
      this.endTrack();
    }
    this.top()?.onFrame?.();
    requestAnimationFrame(this.frame);
  }
}

function shuffleOrder(order, first) {
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

/* --------------------------------------------------------------- screens -- */

class Screen {
  constructor(device) {
    this.device = device;
  }
  onWheel() {}
  onCenter() {}
  onNext() {}
  onPrevious() {}
  onPlay() {}
  onFrame() {}
  onBack() {
    this.device.pop();
  }
}

class MenuScreen extends Screen {
  constructor(device, title, rows) {
    super(device);
    this.title = title;
    this.rows = rows;
    this.sel = 0;
    this.scrollTop = 0;
  }

  /** Rows currently shown (rows may declare a `visible` predicate). */
  get visibleRows() {
    return this.rows.filter((row) => !row.visible || row.visible());
  }

  get wakeOnSelect() {
    return this.visibleRows[this.sel]?.wake !== false;
  }

  /** First row index of the visible window, following the selection. */
  get visibleRange() {
    const rows = this.visibleRows;
    const start = Math.max(0, Math.min(this.scrollTop, Math.max(rows.length - LIST_ROWS, 0)));
    if (this.sel < start) return this.sel;
    if (this.sel >= start + LIST_ROWS) return this.sel - LIST_ROWS + 1;
    return start;
  }

  onWheel(step) {
    this.moveSel(step);
  }

  onCenter() {
    const rows = this.visibleRows;
    if (!rows.length) return;
    rows[this.sel]?.onSelect?.();
  }

  onNext() {
    this.device.stepTrack(1);
  }

  onPrevious() {
    this.device.stepTrack(-1);
  }

  moveSel(step) {
    const rows = this.visibleRows;
    if (!rows.length) return;
    this.sel = (this.sel + step) % rows.length;
    if (this.sel < 0) this.sel += rows.length;
    this.scrollTop = this.visibleRange;
    this.render();
  }

  onPlay() {
    if (this.device.current) {
      this.device.player.toggle();
      this.render();
    } else if (this.device.deck.songs.length) {
      this.device.play(this.device.deck.songs, 0);
    }
  }

  render() {
    this.renderList();
  }

  renderList() {
    const rows = this.visibleRows;
    this.sel = Math.min(this.sel, Math.max(rows.length - 1, 0));
    this.scrollTop = this.visibleRange;
    const seen = [];
    for (let i = this.scrollTop; i < Math.min(this.scrollTop + LIST_ROWS, rows.length); i++) {
      const row = rows[i];
      seen.push({ label: row.title, value: row.value?.(), chevron: row.chevron });
    }
    this.device.ui.drawList(this.title, seen, this.sel - this.scrollTop, {
      top: this.scrollTop,
      total: rows.length
    });
  }
}

function songsForIds(deck, ids) {
  return ids.map((id) => deck.songs.find((song) => song.id === id)).filter(Boolean);
}

function playlistRows(device) {
  return device.deck.playlists.map((playlist) => ({
    title: playlist.name,
    chevron: true,
    onSelect: () => {
      if (playlist.apple) { device.loadApplePlaylist(playlist); return; }
      device.push(new SongsScreen(device, songsForIds(device.deck, playlist.songIds), playlist.name));
    }
  }));
}

class MainMenuScreen extends MenuScreen {
  constructor(device) {
    super(device, "iPod", [
      { title: "Music", chevron: true, onSelect: () => device.push(new MusicScreen(device)) },
      { title: "Extras", chevron: true, onSelect: () => device.push(new ExtrasScreen(device)) },
      { title: "Settings", chevron: true, onSelect: () => device.push(new SettingsScreen(device)) },
      { title: "Shuffle Songs", onSelect: () => device.shuffleSongs() },
      { title: "Backlight", wake: false, onSelect: () => device.toggleBacklight() },
      { title: "Now Playing", chevron: true, visible: () => !!device.current,
        onSelect: () => device.push(new NowPlayingScreen(device)) }
    ]);
  }
}

/** Group actual library metadata, keeping each group's playback queue scoped. */
function musicGroups(device, songs, key, title) {
  const groups = new Map();
  for (const song of songs) {
    const name = song[key] || "Unknown";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(song);
  }
  const rows = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, tracks]) => ({
    title: name, chevron: true,
    onSelect: () => device.push(key === "genre"
      ? musicGroups(device, tracks, "artistName", name)
      : key === "artistName" || key === "composer"
        ? musicGroups(device, tracks, "albumName", name)
        : new SongsScreen(device, tracks, name))
  }));
  if (songs.length) rows.unshift({ title: "All", chevron: true,
    onSelect: () => device.push(new SongsScreen(device, songs, title)) });
  return new ListScreen(device, title, rows);
}

class MusicScreen extends MenuScreen {
  constructor(device) {
    super(device, "Music", [
      { title: "Playlists", chevron: true, onSelect: () => device.push(new ListScreen(device, "Playlists", playlistRows(device))) },
      { title: "Artists", chevron: true, onSelect: () => device.push(musicGroups(device, device.deck.songs, "artistName", "Artists")) },
      { title: "Albums", chevron: true, onSelect: () => device.push(musicGroups(device, device.deck.songs, "albumName", "Albums")) },
      { title: "Songs", chevron: true, onSelect: () => device.push(new SongsScreen(device, device.deck.songs, "Songs")) },
      { title: "Genres", chevron: true, onSelect: () => device.push(musicGroups(device, device.deck.songs, "genre", "Genres")) },
      { title: "Composers", chevron: true, onSelect: () => device.push(musicGroups(device, device.deck.songs, "composer", "Composers")) }
    ]);
  }
}

class ExtrasScreen extends MenuScreen {
  constructor(device) {
    super(device, "Extras", [
      { title: "Clock", chevron: true, onSelect: () => device.push(new ClockScreen(device)) },
      { title: "Games", chevron: true, onSelect: () => device.push(new ListScreen(device, "Games", [
        { title: "Brick", chevron: true, onSelect: () => device.push(new BrickScreen(device)) }
      ])) }
    ]);
  }
}

class ClockScreen extends Screen {
  render() {
    this.device.ui.setStatusbar("Clock");
    this.device.ui.clear();
    const clock = document.createElement("div");
    clock.className = "clock";
    this.timeEl = document.createElement("time");
    this.timeEl.className = "clock__time";
    this.dateEl = document.createElement("div");
    this.dateEl.className = "clock__date";
    clock.append(this.timeEl, this.dateEl);
    this.device.ui.contentEl.appendChild(clock);
    this.update(new Date());
  }

  update(date) {
    this.second = Math.floor(date.getTime() / 1000);
    this.timeEl.dateTime = date.toISOString();
    this.timeEl.textContent = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
    this.dateEl.textContent = `${date.getDate()} ${date.toLocaleString("en-GB", { month: "long" })} ${date.getFullYear()}`;
  }

  onFrame() {
    if (this.device.ui.sliding) return;
    const now = new Date();
    if (Math.floor(now.getTime() / 1000) !== this.second) this.update(now);
  }
}

class ListScreen extends MenuScreen {
  constructor(device, title, rows) {
    super(device, title, rows.length ? rows : [{ title: "(empty)" }]);
  }
}

class SongsScreen extends ListScreen {
  constructor(device, songs, title) {
    super(device, title, songs.map((song, i) => ({ title: song.trackName, onSelect: () => device.play(songs, i) })));
  }

  onPlay() { this.onCenter(); }
}

class NowPlayingScreen extends Screen {
  constructor(device) {
    super(device);
  }

  onWheel(step) {
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
    const flagText = [];
    if (device.settings.shuffle) flagText.push("shuffle");
    if (device.settings.repeat === REPEAT.SONG) flagText.push("repeat 1");
    else if (device.settings.repeat === REPEAT.ALL) flagText.push("repeat");
    mods.textContent = flagText.join(" ");
    pos.appendChild(mods);
    np.appendChild(pos);

    const meta = document.createElement("div");
    meta.className = "np__meta";
    for (const [cls, text] of [
      ["title", song.trackName],
      ["artist", song.artistName],
      ["album", song.albumName]
    ]) {
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
      vol.append("\u2212", volumeBar(device), "+");
      np.appendChild(vol);
    } else {
      np.appendChild(progressRow(device.elapsed, device.duration));
    }

    device.ui.contentEl.appendChild(np);
  }
}

function volumeOverlayVisible(device) {
  return device.volumeVisibleUntil > Date.now() && device.top() instanceof NowPlayingScreen;
}

function volumeBar(device) {
  const bar = document.createElement("span");
  bar.className = "np__bar";
  bar.style.margin = "0 2px";
  const fill = document.createElement("span");
  fill.className = "np__bar-fill";
  fill.style.width = `${Math.round(device.player.volume * 100)}%`;
  bar.appendChild(fill);
  return bar;
}

function progressRow(elapsed, total) {
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

/* settings ----------------------------------------------------------------- */

class SettingsScreen extends MenuScreen {
  constructor(device) {
    super(device, "Settings", [
      { title: "Apple Music", chevron: true, onSelect: () => device.openAppleMusic() },
      { title: "About", chevron: true, onSelect: () => device.push(new AboutScreen(device)) },
      {
        title: "Shuffle",
        value: () => (device.settings.shuffle ? "Songs" : "Off"),
        onSelect: () => device.toggleSetting("shuffle")
      },
      {
        title: "Repeat",
        value: () => device.repeatLabel,
        onSelect: () => device.cycleSetting("repeat")
      },
      {
        title: "Backlight",
        value: () => device.backlightLabel,
        onSelect: () => device.cycleSetting("backlight")
      },
      {
        title: "Clicker",
        value: () => (device.settings.clicker ? "On" : "Off"),
        onSelect: () => device.toggleSetting("clicker")
      },
      { title: "Reset All", chevron: true, onSelect: () => device.push(new ConfirmScreen(device)) }
    ]);
  }
}

class AboutScreen extends Screen {
  render() {
    const device = this.device;
    device.ui.setStatusbar("About");
    device.ui.clear();
    const div = document.createElement("div");
    div.className = "about";
    const dl = document.createElement("dl");
    const addTerm = (t, v) => {
      const dt = document.createElement("dt");
      dt.textContent = t;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    };
    addTerm("Songs", device.deck.songs.length);
    addTerm("Artists", device.deck.artists.length);
    addTerm("Playlists", device.deck.playlists.length);
    addTerm("Capacity", "3.5 GB");
    addTerm("Available", "0.5 GB");
    addTerm("Version", "ipod-emu 1.0");
    addTerm("Storefront", device.deck.storefront);
    div.appendChild(dl);
    device.ui.contentEl.appendChild(div);
  }

  onCenter() {
    this.device.pop();
  }

  onNext() {
    this.device.pop();
  }

  onPrevious() {
    this.device.pop();
  }
}

class ConfirmScreen extends Screen {
  constructor(device) {
    super(device);
    this.sel = 0; // Cancel
  }

  onWheel(step) {
    this.sel = (this.sel + step + 2) % 2;
    this.render();
  }

  onCenter() {
    if (this.sel === 1) this.device.resetSettings();
    this.device.pop();
  }

  onNext() {
    this.sel = 1;
    this.render();
  }

  onPrevious() {
    this.sel = 0;
    this.render();
  }

  onPlay() {
    this.device.pop();
  }

  render() {
    const device = this.device;
    device.ui.setStatusbar("Reset");
    device.ui.clear();
    const box = document.createElement("div");
    box.className = "confirm";
    const p = document.createElement("p");
    p.textContent = "Reset all settings?";
    const btns = document.createElement("div");
    btns.className = "btns";
    ["Cancel", "Reset"].forEach((label, i) => {
      const b = document.createElement("span");
      b.className = "btn" + (i === this.sel ? " btn--sel" : "");
      b.textContent = label;
      btns.appendChild(b);
    });
    box.append(p, btns);
    device.ui.contentEl.appendChild(box);
  }
}

/* brick -------------------------------------------------------------------- */

class BrickScreen extends Screen {
  constructor(device) {
    super(device);
    this.reset();
  }

  reset() {
    this.paddle = 43;
    this.lives = 3;
    this.score = 0;
    this.level = 1;
    this.over = false;
    this.paused = false;
    this.makeBricks();
    this.readyBall();
  }

  makeBricks() {
    this.bricks = Array.from({ length: 36 }, (_, i) => ({
      x: 2 + (i % 12) * 8, y: 4 + Math.floor(i / 12) * 7,
      width: 6.5, height: 3.5, alive: true
    }));
  }

  readyBall() {
    this.launched = false;
    this.lastTick = null;
    this.ball = { x: this.paddle + 7, y: 92, dx: 27, dy: -48 };
  }

  onWheel(step) {
    if (this.over || this.paused) return;
    this.paddle = Math.max(0, Math.min(86, this.paddle + step * 4));
    if (!this.launched) this.ball.x = this.paddle + 7;
    this.render();
  }

  onCenter() {
    if (this.over) this.reset();
    this.launched = true;
    this.paused = false;
    this.lastTick = performance.now();
    this.render();
  }

  onPlay() {
    if (!this.launched || this.over) return this.onCenter();
    this.paused = !this.paused;
    this.lastTick = null;
    this.render();
  }

  onNext() { this.onWheel(1); }
  onPrevious() { this.onWheel(-1); }

  onFrame() {
    if (!this.launched || this.over || this.paused || this.device.ui.sliding) {
      this.lastTick = null;
      return;
    }
    const now = performance.now();
    const elapsed = this.lastTick === null ? 0 : Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;
    this.advance(elapsed);
    this.render();
  }

  /** Small time steps prevent the ball skipping a brick on a slow frame. */
  advance(seconds) {
    while (seconds > 0 && this.launched && !this.over && !this.paused) {
      const dt = Math.min(seconds, 1 / 240);
      seconds -= dt;
      const b = this.ball;
      const previous = { x: b.x, y: b.y };
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      if (b.x < 1) { b.x = 1; b.dx = Math.abs(b.dx); }
      if (b.x > 99) { b.x = 99; b.dx = -Math.abs(b.dx); }
      if (b.y < 1) { b.y = 1; b.dy = Math.abs(b.dy); }
      for (const brick of this.bricks) {
        if (!brick.alive || b.x + 1 < brick.x || b.x - 1 > brick.x + brick.width ||
            b.y + 1 < brick.y || b.y - 1 > brick.y + brick.height) continue;
        brick.alive = false;
        this.score += 1;
        if (previous.y + 1 <= brick.y || previous.y - 1 >= brick.y + brick.height) b.dy *= -1;
        else b.dx *= -1;
        this.device.audio.blip(600 + this.score * 5, 35);
        break;
      }
      // Paddle top is at 96; the ball has a radius of one field unit.
      if (b.dy > 0 && previous.y < 95 && b.y >= 95 && b.x >= this.paddle - 1 && b.x <= this.paddle + 15) {
        b.y = 95;
        const angle = (b.x - this.paddle - 7) / 7;
        b.dx = angle * 42;
        b.dy = -Math.sqrt(58 * 58 - b.dx * b.dx);
        this.device.audio.blip(450, 25);
      }
      if (b.y > 102) {
        this.lives -= 1;
        this.over = this.lives === 0;
        this.readyBall();
      } else if (this.bricks.every(brick => !brick.alive)) {
        this.level += 1;
        this.makeBricks();
        this.readyBall();
      }
    }
  }

  render() {
    const ui = this.device.ui;
    ui.setStatusbar("");
    ui.statusbarEl.classList.add("statusbar__title--game");
    const lives = document.createElement("span");
    lives.textContent = this.lives;
    lives.setAttribute("aria-label", `${this.lives} lives`);
    const score = document.createElement("span");
    score.textContent = this.score;
    score.setAttribute("aria-label", `Score ${this.score}`);
    ui.statusbarEl.replaceChildren(lives, score);
    ui.clear();
    const field = document.createElement("div");
    field.className = "brick-field";
    field.setAttribute("data-testid", "brick-field");
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const el = document.createElement("span");
      el.className = "brick-block";
      Object.assign(el.style, { left: `${brick.x}%`, top: `${brick.y}%`, width: `${brick.width}%`, height: `${brick.height}%` });
      field.appendChild(el);
    }
    const pad = document.createElement("span");
    pad.className = "brick-paddle";
    pad.style.left = `${this.paddle}%`;
    const ball = document.createElement("span");
    ball.className = "brick-ball";
    ball.style.left = `${this.ball.x}%`;
    ball.style.top = `${this.ball.y}%`;
    field.append(pad, ball);
    if (!this.launched || this.paused || this.over) {
      const info = document.createElement("div");
      info.className = "brick-message";
      info.textContent = this.over ? "Game Over. Center to restart." : this.paused ? "Paused" : "Center to launch";
      field.appendChild(info);
    }
    ui.contentEl.appendChild(field);
  }
}

/* ------------------------------------------------- input: wheel + buttons -- */

function attachWheel(device) {
  const wheel = $("wheel");
  let pointer = null;
  let lastAngle = null;
  let lockedDir = null;
  let lockedTravel = 0;
  let engaged = false;
  let suppressClick = false;

  const metrics = (event) => {
    const r = wheel.getBoundingClientRect();
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      r: r.width / 2
    };
  };

  const angleOf = (event, cx, cy) => Math.atan2(event.clientY - cy, event.clientX - cx);

  wheel.addEventListener("pointerdown", (event) => {
    if (event.button || pointer !== null || event.isPrimary === false) return;
    suppressClick = false;
    device.audio.ensureContext();
    pointer = event.pointerId;
    const { cx, cy } = metrics(event);
    lastAngle = angleOf(event, cx, cy);
    lockedDir = null;
    lockedTravel = 0;
    engaged = false;
    // no pointer capture yet: a plain press must still click the pie buttons
  });

  wheel.addEventListener("pointermove", (event) => {
    if (pointer !== event.pointerId || lastAngle === null) return;
    const { cx, cy, r } = metrics(event);
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    if (Math.hypot(dx, dy) < r * 0.3) return; // hub dead zone
    const angle = angleOf(event, cx, cy);

    let delta = angle - lastAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const degrees = Math.abs(delta * (180 / Math.PI));
    if (degrees < 1.5) return; // accumulate small movements from the last accepted angle
    lastAngle = angle;

    // engage the drag only after real travel; before that the press may
    // still turn out to be a button click
    if (!engaged) {
      lockedTravel += degrees;
      if (lockedTravel < WHEEL_ENGAGE_DEGREES) return;
      lockedTravel = 0;
      engaged = true;
      suppressClick = true;
      try {
        wheel.setPointerCapture(pointer);
      } catch {
        /* synthetic or already-released pointer — drag still works without capture */
      }
      wheel.classList.add("dragging");
      return;
    }

    if (event.cancelable) event.preventDefault();
    const dir = delta > 0 ? 1 : -1;
    if (lockedDir === null) {
      lockedDir = dir; // first decisive direction locks, like real hardware
    } else if (dir !== lockedDir) {
      lockedTravel -= degrees; // reversals pay back travel before re-engaging
      if (lockedTravel < 0) {
        lockedDir = dir;
        lockedTravel = -lockedTravel;
      }
      return;
    }
    lockedTravel += degrees;
    while (lockedTravel >= WHEEL_STEP_DEGREES) {
      lockedTravel -= WHEEL_STEP_DEGREES;
      wheel.dispatchEvent(
        new CustomEvent("wheelscroll", { detail: { step: lockedDir, degrees: WHEEL_STEP_DEGREES, speed: 1 } })
      );
    }
  });

  const endDrag = (event) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    lastAngle = null;
    lockedDir = null;
    lockedTravel = 0;
    engaged = false;
    wheel.classList.remove("dragging");
  };

  // A completed touch drag may still synthesize a click on its starting button.
  wheel.addEventListener("click", event => {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
  wheel.addEventListener("pointerup", endDrag);
  wheel.addEventListener("pointercancel", endDrag);
  wheel.addEventListener("lostpointercapture", event => {
    // Touch implicitly captures the starting button. Its capture-loss event bubbles
    // when we transfer capture to the wheel; that transfer is not the end of a drag.
    if (event.target === wheel) endDrag(event);
  });
  wheel.addEventListener("wheelscroll", (event) => {
    const { step } = event.detail ?? {};
    device.wheelStepBy(step || 0);
  });
}

function attachButtons(device) {
  const wire = (id, action) =>
    $(id).addEventListener("click", (event) => {
      action();
      event.currentTarget.blur(); // keep later Enter/Space for the device, not the button
    });
  wire("btn-menu", () => device.menu());
  wire("btn-select", () => device.select());
  wire("btn-prev", () => device.previous());
  wire("btn-next", () => device.next());
  wire("btn-play", () => device.playPause());
}

function attachKeyboard(device) {
  document.addEventListener("keydown", (event) => {
    if (event.isComposing || document.querySelector("dialog[open]") || event.target.closest?.("input, textarea, select, [contenteditable=true]")) return;
    switch (event.key) {
      case " ":
        event.preventDefault();
        device.playPause();
        break;
      case "ArrowUp":
        event.preventDefault();
        device.wheelStepBy(-1);
        break;
      case "ArrowDown":
        event.preventDefault();
        device.wheelStepBy(1);
        break;
      case "ArrowLeft":
        device.previous();
        break;
      case "ArrowRight":
        device.next();
        break;
      case "Enter":
        device.select();
        break;
      case "Escape":
        device.menu();
        break;
      default:
        break;
    }
  });
}

/* Keep mobile geometry fixed while browser chrome or the keyboard changes height. */
let mobileViewport = null;
function fitDevice() {
  const width = window.innerWidth;
  const mobile = width < 640 || window.matchMedia("(pointer: coarse)").matches;
  if (mobile && mobileViewport?.width === width) return;
  const height = mobile
    ? document.querySelector("#viewport-size")?.getBoundingClientRect().height || window.innerHeight
    : window.innerHeight;
  mobileViewport = mobile ? { width, height } : null;
  const stage = document.querySelector(".stage");
  const padding = stage ? window.getComputedStyle(stage) : null;
  const horizontal = padding ? parseFloat(padding.paddingLeft) + parseFloat(padding.paddingRight) + 8 : 40;
  const vertical = padding ? parseFloat(padding.paddingTop) + parseFloat(padding.paddingBottom) : 40;
  const reserve = mobile ? vertical + 44 : width >= 640 && height >= 850 ? 220 : 96;
  const scale = Math.max(0.2, Math.min(1, (width - horizontal) / 415, (height - reserve) / 692));
  document.documentElement.style.setProperty("--layout-height", mobile ? `${height}px` : "100svh");
  document.documentElement.style.setProperty("--device-scale", String(scale));
}

/* ------------------------------------------------------------------ boot -- */

document.addEventListener("DOMContentLoaded", () => {
  fitDevice();
  window.addEventListener("resize", fitDevice);
  const device = new Ipod();
  attachWheel(device);
  attachButtons(device);
  attachKeyboard(device);
  window.AppleMusic?.setup(device);
  window.ipod = device; // console/test hook

  // Retry on activation gestures and after interruptions, not only the first press.
  const unlock = () => device.audio.unlock();
  for (const type of ["touchstart", "touchend", "pointerup", "click", "keydown"]) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }
});
