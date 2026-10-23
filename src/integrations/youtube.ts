import type { Ipod } from '../device';
import type { Track } from '../types';
import { NowPlayingScreen } from '../screens/now-playing';
import { YouTubeMetadataLoader } from './youtube-metadata';
import { YouTubePlaylistScreen } from '../screens/youtube-playlist';
import { fitDevice } from '../input';

export function playlistId(input: string): string {
  let value = input.trim();
  if (/^(https?:\/\/|www\.|music\.|youtube\.|youtu\.be)/i.test(value)) {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('Paste a YouTube playlist link.');
    value = url.searchParams.get('list') || '';
  }
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(value)) throw new Error('Paste a playlist URL containing list=, or its playlist ID.');
  return value;
}
interface Embed {
  playVideo(): void; playVideoAt(index: number): void; pauseVideo(): void; nextVideo(): void; previousVideo(): void;
  seekTo(time: number, allowSeekAhead: boolean): void;
  getPlayerState(): number; getCurrentTime(): number; getDuration(): number;
  getVolume(): number; setVolume(volume: number): void; mute(): void; unMute(): void; isMuted(): boolean;
  getPlaylist(): string[]; getPlaylistIndex(): number;
  setLoop(loop: boolean): void; setShuffle(shuffle: boolean): void; destroy(): void;
}
interface SDK {
  Player: new (element: HTMLElement, options: {
    width: string; height: string; playerVars: Record<string, string | number>;
    events: { onReady(event: { target: Embed }): void; onStateChange(event: { data: number }): void; onError(event: { data: number }): void; onAutoplayBlocked(): void };
  }) => Embed;
}
declare global { interface Window { YT?: SDK; onYouTubeIframeAPIReady?: () => void } }
let sdkPromise: Promise<SDK> | null = null;
function loadSDK(): Promise<SDK> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SDK>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(fail, 15000);
    function fail() { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error('YouTube could not load. Check your connection or content blocker and retry.')); }
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); if (window.YT?.Player) resolve(window.YT); else fail(); };
    script.onerror = fail;
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.append(script);
  });
  return sdkPromise;
}
export class YouTubePlayer {
  playlistName = 'YouTube playlist';
  private requestedVolume: number | null = null;
  private volumeRequestedAt = 0;
  readonly systemVolume = /iPad|iPhone|iPod/.test(window.navigator.userAgent) || (/Macintosh/.test(window.navigator.userAgent) && window.navigator.maxTouchPoints > 1);
  reveal: () => void = () => {};
  private tracks = new Map<string, Track>();
  private closed = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(public embed: Embed, private device: Ipod, private playlist = '', private metadata = new YouTubeMetadataLoader(), private changed: () => void = () => {}) {}
  start() {
    if (this.playlist) void this.metadata.load(`https://www.youtube.com/playlist?list=${this.playlist}`).then(data => {
      if (this.closed || !data) return;
      this.playlistName = data.title;
      for (const track of this.tracks.values()) track.albumName = data.title;
      this.refresh();
    });
    this.sync();
    // The embed can populate its playlist after onReady without another state event.
    this.timer = setInterval(() => this.sync(), 1000);
  }
  dispose() { this.closed = true; clearInterval(this.timer); this.metadata.dispose(); }
  private refresh() {
    if (this.closed || this.device.youtubePlayer !== this) return;
    const screen = this.device.top();
    if (screen instanceof YouTubePlaylistScreen || screen instanceof NowPlayingScreen) screen.render();
    this.changed();
  }
  private track(id: string): Track {
    const existing = this.tracks.get(id);
    if (existing) return existing;
    const track: Track = { id, trackName: 'Loading title…', artistName: 'YouTube', albumName: this.playlistName, duration: 0 };
    this.tracks.set(id, track);
    if (this.playlist) void this.metadata.load(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`).then(data => {
      if (this.closed) return;
      track.trackName = data?.title || 'Title unavailable';
      track.artistName = data?.author || 'YouTube';
      this.refresh();
    });
    return track;
  }
  get playing() { return this.embed.getPlayerState() === 1; }
  get elapsed() { return this.embed.getCurrentTime() || 0; }
  get duration() { return this.embed.getDuration() || 0; }
  get volume() {
    const actual = this.embed.isMuted() ? 0 : this.embed.getVolume() / 100;
    if (this.requestedVolume !== null && (Math.abs(actual - this.requestedVolume) < .005 || performance.now() - this.volumeRequestedAt > 2000)) this.requestedVolume = null;
    return this.requestedVolume ?? actual;
  }
  setVolume(value: number) {
    if (this.systemVolume || !Number.isFinite(value)) return;
    const percent = Math.round(Math.max(0, Math.min(100, value * 100)));
    this.requestedVolume = percent / 100;
    this.volumeRequestedAt = performance.now();
    this.embed.setVolume(percent);
    if (percent > 0) this.embed.unMute(); else this.embed.mute();
  }
  toggle() { if (this.playing) this.embed.pauseVideo(); else { this.reveal(); this.embed.playVideo(); } }
  step(dir: number) { this.reveal(); if (dir < 0) { if (this.elapsed > 3) this.restart(); else this.embed.previousVideo(); } else this.embed.nextVideo(); }
  restart() { this.embed.seekTo(0, true); }
  playAt(index: number) { this.reveal(); this.embed.playVideoAt(index); }
  playId(id: string) {
    const index = this.embed.getPlaylist().indexOf(id);
    if (index >= 0) this.playAt(index);
  }
  modes() { this.embed.setLoop(this.device.settings.repeat === 'all'); this.embed.setShuffle(this.device.settings.shuffle); }
  sync() {
    if (this.closed || this.device.youtubePlayer !== this) return;
    const ids = this.embed.getPlaylist() || [];
    const index = this.embed.getPlaylistIndex();
    if (ids[index]) this.track(ids[index]); // Prioritize the current title.
    const changed = ids.join(',') !== this.device.sequence.map(track => track.id).join(',') || index !== this.device.position;
    this.device.sequence = ids.map(id => this.track(id));
    this.device.position = this.embed.getPlaylistIndex();
    this.device.current = this.device.sequence[this.device.position] || null;
    if (this.device.current) this.device.current.duration = this.duration;
    this.device.ui.syncChrome();
    if (changed) this.refresh();
  }
}

export function setupYouTube(device: Ipod) {
  const dialog = document.getElementById('youtube-dialog') as HTMLDialogElement;
  const form = dialog.querySelector('form')!;
  const input = dialog.querySelector('input')!;
  const status = dialog.querySelector<HTMLElement>('[role=status]')!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type=submit]')!;
  const dock = document.getElementById('youtube-dock')!;
  const notice = dock.querySelector<HTMLElement>('[role=status]')!;
  const fold = dock.querySelector<HTMLButtonElement>('[data-action=fold]')!;
  const body = dock.querySelector<HTMLElement>('.youtube-body')!;
  let collapsed = false;
  function expand(open: boolean) {
    collapsed = !open;
    if (collapsed) embed?.pauseVideo();
    body.hidden = collapsed;
    fold.textContent = collapsed ? 'Show player' : 'Collapse';
    fold.setAttribute('aria-expanded', String(open));
    dock.classList.toggle('youtube-collapsed', collapsed);
    fitDevice(true);
  }
  fold.onclick = () => expand(collapsed);
  let generation = 0;
  let embed: Embed | null = null;
  let previous: { current: Track | null; sequence: Track[]; position: number } | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const resize = new ResizeObserver(() => { if (!dock.hidden) fitDevice(true); });
  resize.observe(dock);
  device.closeYouTube = () => {
    generation++;
    clearTimeout(readyTimer);
    device.youtubePlayer?.dispose();
    embed?.destroy(); embed = null;
    device.youtubePlayer = null;
    if (previous) Object.assign(device, previous);
    previous = null;
    dock.hidden = true;
    document.body.classList.remove('youtube-active');
    fitDevice(true);
    submit.disabled = false;
    device.top()?.render();
  };
  try { input.value = localStorage.getItem('ipod-youtube-playlist') || ''; } catch { /* Storage may be unavailable. */ }
  device.openYouTube = () => { dialog.showModal(); };
  dock.querySelector<HTMLButtonElement>('[data-action=playlist]')!.onclick = () => { if (device.youtubePlayer) device.push(new YouTubePlaylistScreen(device)); };
  dock.querySelector<HTMLButtonElement>('[data-action=change]')!.onclick = () => device.openYouTube();
  const cancelLoad = () => { if (submit.disabled && !embed) device.closeYouTube(); };
  dialog.addEventListener('cancel', cancelLoad);
  dialog.querySelector<HTMLButtonElement>('[data-action=close]')!.onclick = () => { cancelLoad(); dialog.close(); };
  dock.querySelector<HTMLButtonElement>('[data-action=stop]')!.onclick = () => device.closeYouTube();
  form.onsubmit = async event => {
    event.preventDefault();
    let id: string;
    try { id = playlistId(input.value); } catch (error) { status.textContent = (error as Error).message; return; }
    device.closeYouTube();
    const request = generation;
    submit.disabled = true;
    status.textContent = 'Loading YouTube…';
    try {
      const sdk = await loadSDK();
      if (request !== generation) return;
      previous = device.applePlayer
        ? { current: device.current, sequence: device.sequence, position: device.position }
        : { current: null, sequence: [], position: -1 };
      if (device.player.playing) device.player.toggle();
      device.audio.stop();
      dock.hidden = false;
      expand(true);
      document.body.classList.add('youtube-active');
      fitDevice(true);
      dialog.close();
      notice.textContent = 'Tap Play in the YouTube player to begin.';
      const mount = document.createElement('div');
      dock.querySelector('.youtube-video')!.replaceChildren(mount);
      readyTimer = setTimeout(() => { if (request === generation) notice.textContent = 'YouTube is taking longer to load. Check your connection, or stop and retry.'; }, 15000);
      embed = new sdk.Player(mount, {
        width: '100%', height: '200',
        playerVars: { listType: 'playlist', list: id, playsinline: 1, controls: 1, autoplay: 0, origin: location.origin },
        events: {
          onReady: event => {
            if (request !== generation) return;
            clearTimeout(readyTimer);
            const player = new YouTubePlayer(event.target, device, id, new YouTubeMetadataLoader(), () => {
              dock.querySelector<HTMLElement>('.youtube-heading span')!.textContent = player.playlistName;
              const title = device.current?.trackName;
              dock.querySelector<HTMLElement>('.youtube-track')!.textContent = title && title !== 'Loading title…'
                ? `${title} · ${device.current?.artistName}` : 'Loading track details…';
            });
            device.youtubePlayer = player;
            player.reveal = () => expand(true);
            player.setVolume(device.settings.volume); player.modes(); player.start();
            device.push(new YouTubePlaylistScreen(device));
            expand(false);
            try { localStorage.setItem('ipod-youtube-playlist', `https://www.youtube.com/playlist?list=${id}`); } catch { /* Optional convenience. */ }
          },
          onStateChange: event => {
            if (request !== generation || !device.youtubePlayer) return;
            const player = device.youtubePlayer;
            if (collapsed && (event.data === 1 || event.data === 3)) { player.embed.pauseVideo(); return; }
            player.sync();
            if (event.data === 1 && device.top() instanceof YouTubePlaylistScreen) device.push(new NowPlayingScreen(device));
            if (event.data === 0 && device.settings.repeat === 'song') { player.restart(); player.embed.playVideo(); }
            notice.textContent = event.data === 1 ? 'Playing' : event.data === 3 ? 'Buffering…' : event.data === 2 ? 'Paused' : 'Choose a track, or tap Play in the video.';
          },
          onError: event => {
            if (request !== generation) return;
            notice.textContent = [100, 101, 150].includes(event.data)
              ? 'This video is unavailable or cannot be embedded. Try Next or another playlist.'
              : 'YouTube could not play this playlist. Check that it is public or unlisted and allows embedding.';
          },
          onAutoplayBlocked: () => { if (request === generation) notice.textContent = 'Tap Play directly in the YouTube player to allow playback.'; }
        }
      });
      status.textContent = 'Playlist loaded. Paste another link to replace it.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not load YouTube.'; }
    finally { if (request === generation) submit.disabled = false; }
  };
}
