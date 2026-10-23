/* MusicKit owns streaming and authorization; the emulator owns its menus and UI sounds. */
(() => {
  let sdkPromise;
  function loadSDK() {
    if (window.MusicKit) return Promise.resolve(window.MusicKit);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const finish = (error) => {
        clearTimeout(timer);
        document.removeEventListener('musickitloaded', ready);
        if (error) { script.remove(); sdkPromise = null; reject(error); }
        else resolve(window.MusicKit);
      };
      const ready = () => finish();
      const timer = setTimeout(() => finish(new Error('MusicKit did not load. Check your connection and try again.')), 20000);
      document.addEventListener('musickitloaded', ready, { once: true });
      script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      script.onerror = () => finish(new Error('MusicKit could not load. Check your connection and try again.'));
      document.head.append(script);
    });
    return sdkPromise;
  }

  function validateToken(token) {
    try {
      const parts = token.split('.');
      const decode = part => JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      const header = decode(parts[0]), payload = decode(parts[1]);
      if (parts.length !== 3 || !parts[2] || header.alg !== 'ES256' || !header.kid || !payload.iss || !Number.isFinite(payload.exp)) throw 0;
      if (payload.exp * 1000 <= Date.now()) throw new Error('This developer token has expired. Generate a new one.');
    } catch (error) {
      throw new Error(error?.message?.startsWith('This developer') ? error.message : 'Paste a valid Apple Music developer JWT, not a private .p8 key.');
    }
  }

  function song(resource) {
    const a = resource.attributes || {};
    return { id: resource.id, trackName: a.name || 'Unknown song', artistName: a.artistName || 'Unknown artist',
      albumName: a.albumName || '', genre: a.genreNames?.[0] || '', composer: a.composerName || '',
      duration: (a.durationInMillis || 0) / 1000, musicKitItem: resource };
  }

  async function pages(music, path) {
    const result = [], visited = new Set();
    while (path) {
      // Only follow Apple library paths; never send credentials to an arbitrary next URL.
      path = path.replace(/^\//, '');
      if (!path.startsWith('v1/me/library/') || visited.has(path)) throw new Error('Invalid library pagination.');
      visited.add(path);
      const { data } = await music.api.music(path);
      result.push(...(data.data || []));
      path = data.next;
    }
    return result;
  }

  class AppleMusicPlayer {
    constructor(music, device, report) {
      this.music = music; this.device = device; this.report = report;
      this.pending = false; this.closed = false;
      this.tail = Promise.resolve();
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
    setVolume(value) { this.music.volume = Math.max(0, Math.min(1, value)); }
    modes() {
      const kit = window.MusicKit;
      this.music.repeatMode = kit.PlayerRepeatMode[{off:'none',song:'one',all:'all'}[this.device.settings.repeat]];
      this.music.shuffleMode = kit.PlayerShuffleMode[this.device.settings.shuffle ? 'songs' : 'off'];
    }
    run(action) {
      this.tail = this.tail.then(() => this.closed ? undefined : action()).catch(() => { if (!this.closed) this.error(); });
      return this.tail;
    }
    queue(tracks, index) {
      this.pending = true;
      return this.run(async () => {
        try {
          this.music.shuffleMode = window.MusicKit.PlayerShuffleMode.off;
          await this.music.setQueue({ items: tracks.map(t => t.musicKitItem) });
          if (this.closed) return;
          await this.music.changeToMediaAtIndex(index);
          this.modes();
        } finally { this.pending = false; this.sync(); }
      });
    }
    toggle() { return this.run(() => this.playing ? this.music.pause() : this.music.play()); }
    step(dir) { return this.run(() => dir < 0 ? (this.elapsed > 3 ? this.music.seekToTime(0) : this.music.skipToPreviousItem()) : this.music.skipToNextItem()); }
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

  function setup(device) {
    const dialog = document.getElementById('apple-music');
    const token = dialog.querySelector('textarea');
    const status = dialog.querySelector('[role=status]');
    const use = dialog.querySelector('[data-action=token]');
    const connect = dialog.querySelector('[data-action=connect]');
    const refresh = dialog.querySelector('[data-action=refresh]');
    const disconnect = dialog.querySelector('[data-action=disconnect]');
    let music, busy = false;
    function report(message) { status.textContent = message; }
    function controls() {
      use.disabled = busy || !!device.applePlayer;
      token.disabled = busy || !!device.applePlayer;
      connect.disabled = busy || !music || !!device.applePlayer;
      refresh.disabled = busy || !device.applePlayer;
      disconnect.disabled = busy || !music;
    }
    async function task(action, failure) {
      if (busy) return;
      busy = true; controls();
      try { await action(); } catch { report(failure); }
      finally { busy = false; controls(); }
    }
    device.openAppleMusic = () => { dialog.showModal(); controls(); };
    dialog.querySelector('[data-action=close]').onclick = () => dialog.close();
    use.onclick = () => {
      const value = token.value.trim();
      try { validateToken(value); } catch (e) { report(e.message); return; }
      task(async () => {
        report('Loading MusicKit…');
        const kit = await loadSDK();
        await kit.configure({developerToken: value, app:{name:'iPod emulator',build:'1.0.0'}});
        music = kit.getInstance(); token.value = '';
        report('Token configured for this session. Connect to sign in with Apple.');
      }, 'Could not configure MusicKit. Check your token, its expiry and origin, and your connection.');
    };
    async function library() {
      report('Loading your library…');
      const [songs, playlists] = await Promise.all([pages(music, 'v1/me/library/songs'), pages(music, 'v1/me/library/playlists')]);
      if (device.applePlayer) await device.applePlayer.dispose();
      device.applePlayer = null;
      device.audio.stop();
      device.applePlayer = new AppleMusicPlayer(music, device, message => { report(message); if (!dialog.open) dialog.showModal(); });
      device.useLibrary({ songs: songs.map(song), playlists: playlists.map(p => ({id:p.id,name:p.attributes?.name || 'Playlist',apple:true})), artists: [] });
      report(`Connected. ${songs.length} songs and ${playlists.length} playlists loaded. Close this panel to browse Music.`);
    }
    connect.onclick = () => task(async () => {
      // authorize is invoked before the first await, preserving the click gesture.
      const authorization = music.authorize();
      report('Complete sign-in in Apple’s window…');
      await authorization;
      await library();
    }, 'Connection or library loading failed. Sign-in may have been cancelled. Check your token and Apple Music account, then retry.');
    refresh.onclick = () => task(library, 'Could not refresh your library. Your previous library is still available.');
    disconnect.onclick = () => task(async () => {
      if (device.applePlayer) await device.applePlayer.dispose();
      device.applePlayer = null;
      device.useLibrary(window.IPOD_DATA);
      await music.unauthorize();
      music = null; token.value = '';
      report('Disconnected. Demo music is active.');
    }, 'Could not finish signing out of Apple. Try Disconnect again.');
    device.loadApplePlaylist = async playlist => {
      if (busy) return;
      const owner = device.applePlayer, screen = device.top();
      await task(async () => {
        const tracks = await pages(music, `v1/me/library/playlists/${encodeURIComponent(playlist.id)}/tracks`);
        if (device.applePlayer === owner && device.top() === screen) device.showAppleSongs(tracks.filter(t => /songs$/.test(t.type)).map(song), playlist.name);
      }, 'Could not load this playlist. Check your connection and try again.');
      if (status.textContent.startsWith('Could not') && !dialog.open) dialog.showModal();
    };
    controls();
  }
  window.AppleMusic = { setup, validateToken, pages, song, AppleMusicPlayer };
})();
