import type { Ipod } from '../device';
import type { Track } from '../types';
import { NowPlayingScreen } from '../screens/now-playing';
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
  getVolume(): number; setVolume(volume: number): void;
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
  constructor(public embed: Embed, private device: Ipod) {}
  get playing() { return this.embed.getPlayerState() === 1; }
  get elapsed() { return this.embed.getCurrentTime() || 0; }
  get duration() { return this.embed.getDuration() || 0; }
  get volume() { return this.embed.getVolume() / 100; }
  setVolume(value: number) { this.embed.setVolume(Math.max(0, Math.min(100, value * 100))); }
  toggle() { if (this.playing) this.embed.pauseVideo(); else this.embed.playVideo(); }
  step(dir: number) { if (dir < 0) { if (this.elapsed > 3) this.restart(); else this.embed.previousVideo(); } else this.embed.nextVideo(); }
  restart() { this.embed.seekTo(0, true); }
  playAt(index: number) { this.embed.playVideoAt(index); }
  modes() { this.embed.setLoop(this.device.settings.repeat === 'all'); this.embed.setShuffle(this.device.settings.shuffle); }
  sync() {
    const ids = this.embed.getPlaylist() || [];
    this.device.sequence = ids.map((id, i): Track => ({ id, trackName: `Video ${i + 1}`, artistName: 'YouTube', albumName: 'Playlist', duration: 0 }));
    this.device.position = this.embed.getPlaylistIndex();
    this.device.current = this.device.sequence[this.device.position] || null;
    this.device.ui.syncChrome();
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
  let generation = 0;
  let embed: Embed | null = null;
  let previous: { current: Track | null; sequence: Track[]; position: number } | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  device.closeYouTube = () => {
    generation++;
    clearTimeout(readyTimer);
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
  device.openYouTube = () => { dialog.showModal(); };
  const cancelLoad = () => { if (submit.disabled && !embed) device.closeYouTube(); };
  dialog.addEventListener('cancel', cancelLoad);
  dialog.querySelector<HTMLButtonElement>('[data-action=close]')!.onclick = () => { cancelLoad(); dialog.close(); };
  dock.querySelector<HTMLButtonElement>('button')!.onclick = () => device.closeYouTube();
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
            const player = new YouTubePlayer(event.target, device);
            device.youtubePlayer = player;
            player.setVolume(device.settings.volume); player.modes(); player.sync();
            device.push(new NowPlayingScreen(device));
          },
          onStateChange: event => {
            if (request !== generation || !device.youtubePlayer) return;
            const player = device.youtubePlayer;
            player.sync();
            if (event.data === 0 && device.settings.repeat === 'song') { player.restart(); player.embed.playVideo(); }
            notice.textContent = event.data === 1 ? 'YouTube · Use the iPod controls or the video player.' : 'YouTube · Tap Play to listen.';
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
