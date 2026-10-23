import type { Settings, Track } from "./types";
import { TRACK_SECONDS } from "./constants";
export class AudioEngine {
  ctx: AudioContext | null = null;
  clicker: boolean;
  volume: number;
  buffersBySeed = new Map<number, AudioBuffer>();
  source: AudioBufferSourceNode | null = null;
  gain: GainNode | null = null;
  startedAt = 0;
  onstate: (() => void) | null = null;
  outputPrimer: AudioBufferSourceNode | null = null;
  pendingFeedback: { buffer: AudioBuffer; volume: number; pan: number; requestedAt: number } | null = null;
  nextClickAt = 0;
  private _tick: AudioBuffer | null = null;
  private _button: AudioBuffer | null = null;
  private requestId = 0;
  private pending = false;
  private buffer: AudioBuffer | null = null;
  private pausedAt: number | null = null;
  constructor(settings: Settings) {
    this.clicker = settings.clicker;
    this.volume = settings.volume;
  }

  ensureContext(resume = true) {
    if (!this.ctx) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      this.ctx = AC ? new AC() : null;
    }
    if (resume && this.ctx && ["suspended", "interrupted"].includes(this.ctx.state)) this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Start and resume output synchronously inside a native input gesture. */
  unlock() {
    // On supporting mobile browsers, route this music player through media audio.
    try {
      if (window.navigator?.audioSession) window.navigator.audioSession.type = "playback";
    } catch { /* Older browsers retain their default audio session. */ }
    const ctx = this.ensureContext(false);
    if (!ctx) return;
    if (this.outputPrimer && ctx.state === "running") return;
    // A source started outside an accepted gesture is not proof of activation.
    // Retry source.start() in this gesture rather than retaining a blocked primer.
    this.outputPrimer?.stop();
    this.outputPrimer?.disconnect();
    // Keep WebKit’s output active between millisecond-long feedback sounds.
    // This buffer is silent and independent of the music source and queue.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate), ctx.sampleRate);
    source.loop = true;
    source.connect(ctx.destination);
    source.start();
    this.outputPrimer = source;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  }

  releaseOutput() {
    if (!this.outputPrimer) return;
    this.outputPrimer.stop();
    this.outputPrimer.disconnect();
    this.outputPrimer = null;
    this.pendingFeedback = null;
    this.nextClickAt = 0;
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

  playFeedback(buffer: AudioBuffer | null, volume: number, pan: number, at?: number) {
    const ctx = this.ctx;
    if (!ctx || !buffer) return;
    if (ctx.state !== "running") {
      // Keep only the latest detent while activation is pending, never a burst of old clicks.
      const pending = { buffer, volume, pan, requestedAt: performance.now() };
      this.pendingFeedback = pending;
      ctx.resume().then(() => {
        if (this.pendingFeedback !== pending) return;
        this.pendingFeedback = null;
        if (ctx.state === "running" && performance.now() - pending.requestedAt < 250) {
          this.playFeedback(buffer, volume, pan);
        }
      }).catch(() => {});
      return;
    }
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
    if (ctx.state !== "running") {
      // The audio clock is frozen: retain the newest detent, not scheduled time.
      this.nextClickAt = 0;
      this.playFeedback(this.tickBuffer(), 0.28, -0.2);
      return;
    }
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

  blip(freq: number, ms = 60, type: OscillatorType = "square") {
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
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + ms / 1000 + 0.01);
  }

  /** Deterministic pentatonic noodle from an integer seed. */
  melody(seed: number) {
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
  requestBuffer(seed: number, whenReady?: (buffer: AudioBuffer) => void) {
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

  boot(track: Track) {
    this.stop();
    const ctx = this.ensureContext();
    if (!ctx) return;
    const request = this.requestId;
    this.pending = true;
    const start = (buffer: AudioBuffer) => {
      if (request !== this.requestId || !this.pending) return;
      this.pending = false;
      this.buffer = buffer;
      this.startAt(0);
    };
    const whenReady = (buffer: AudioBuffer) => {
      if (ctx.state === "running") start(buffer);
      else ctx.resume().then(() => start(buffer)).catch(() => {});
    };
    const buffer = this.requestBuffer(track.melodySeed ?? 1, whenReady);
    if (buffer) whenReady(buffer);
  }

  startAt(offset: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.buffer = this.buffer;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
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

  setVolume(v: number) {
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
      this.gain?.disconnect();
      this.gain = null;
      this.source = null;
    } else if (this.buffer && this.pausedAt !== null) {
      this.startAt(this.pausedAt);
    }
    this.onstate?.();
    return this.playing;
  }

  stop() {
    this.requestId = this.requestId + 1;
    this.pending = false;
    this.buffer = null;
    this.pausedAt = null;
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.gain?.disconnect();
      this.gain = null;
      this.source = null;
    }
  }

}

