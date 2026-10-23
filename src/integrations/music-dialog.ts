import type { Ipod } from '../device';
import { DEMO_LIBRARY } from '../data';
import type { MusicKitInstance } from './musickit-types';
import { loadSDK, validateToken, pages, song } from './music-api';
import { AppleMusicPlayer } from './music-player';
function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing integration element: ${selector}`);
  return element;
}
export function setup(device: Ipod) {
  const dialog = required<HTMLDialogElement>(document, '#apple-music');
  const token = required<HTMLTextAreaElement>(dialog, 'textarea');
  const status = required<HTMLElement>(dialog, '[role=status]');
  const use = required<HTMLButtonElement>(dialog, '[data-action=token]');
  const connect = required<HTMLButtonElement>(dialog, '[data-action=connect]');
  const refresh = required<HTMLButtonElement>(dialog, '[data-action=refresh]');
  const disconnect = required<HTMLButtonElement>(dialog, '[data-action=disconnect]');
  let music: MusicKitInstance | null = null, busy = false;
  const connectedMusic = () => { if (!music) throw new Error("MusicKit is not configured"); return music; };
  function report(message: string) { status.textContent = message; }
  function controls() {
    use.disabled = busy || !!device.applePlayer;
    token.disabled = busy || !!device.applePlayer;
    connect.disabled = busy || !music || !!device.applePlayer;
    refresh.disabled = busy || !device.applePlayer;
    disconnect.disabled = busy || !music;
  }
  async function task(action: () => Promise<void>, failure: string) {
    if (busy) return;
    busy = true; controls();
    try { await action(); } catch { report(failure); }
    finally { busy = false; controls(); }
  }
  device.openAppleMusic = () => { dialog.showModal(); controls(); };
  required<HTMLButtonElement>(dialog, '[data-action=close]').onclick = () => dialog.close();
  use.onclick = () => {
    const value = token.value.trim();
    try { validateToken(value); } catch (e) { report(e instanceof Error ? e.message : "Invalid developer token"); return; }
    task(async () => {
      report('Loading MusicKit…');
      const kit = await loadSDK();
      await kit.configure({developerToken: value, app:{name:'iPod emulator',build:'0.2.0'}});
      music = kit.getInstance(); token.value = '';
      report('Token configured for this session. Connect to sign in with Apple.');
    }, 'Could not configure MusicKit. Check your token, its expiry and origin, and your connection.');
  };
  async function library() {
    report('Loading your library…');
    const [songs, playlists] = await Promise.all([pages(connectedMusic(), 'v1/me/library/songs'), pages(connectedMusic(), 'v1/me/library/playlists')]);
    if (device.applePlayer) await device.applePlayer.dispose();
    device.applePlayer = null;
    device.audio.stop();
    device.applePlayer = new AppleMusicPlayer(connectedMusic(), device, message => { report(message); if (!dialog.open) dialog.showModal(); });
    device.useLibrary({ songs: songs.map(song), playlists: playlists.map(p => ({id:p.id,name:p.attributes?.name || 'Playlist',apple:true})), artists: [] });
    report(`Connected. ${songs.length} songs and ${playlists.length} playlists loaded. Close this panel to browse Playlists, Artists, or Songs.`);
  }
  connect.onclick = () => task(async () => {
    // authorize is invoked before the first await, preserving the click gesture.
    const authorization = connectedMusic().authorize();
    report('Complete sign-in in Apple’s window…');
    await authorization;
    await library();
  }, 'Connection or library loading failed. Sign-in may have been cancelled. Check your token and Apple Music account, then retry.');
  refresh.onclick = () => task(library, 'Could not refresh your library. Your previous library is still available.');
  disconnect.onclick = () => task(async () => {
    if (device.applePlayer) await device.applePlayer.dispose();
    device.applePlayer = null;
    device.useLibrary(DEMO_LIBRARY);
    await connectedMusic().unauthorize();
    music = null; token.value = '';
    report('Disconnected. Demo music is active.');
  }, 'Could not finish signing out of Apple. Try Disconnect again.');
  device.loadApplePlaylist = async playlist => {
    if (busy) return;
    const owner = device.applePlayer, screen = device.top();
    await task(async () => {
      const tracks = await pages(connectedMusic(), `v1/me/library/playlists/${encodeURIComponent(playlist.id ?? "")}/tracks`);
      if (device.applePlayer === owner && device.top() === screen) device.showAppleSongs(tracks.filter(t => /songs$/.test(t.type ?? "")).map(song), playlist.name);
    }, 'Could not load this playlist. Check your connection and try again.');
    if (status.textContent.startsWith('Could not') && !dialog.open) dialog.showModal();
  };
  controls();
}