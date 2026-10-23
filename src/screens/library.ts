import type { Ipod } from '../device';
import type { Library, Track } from '../types';
import { MenuScreen, ListScreen } from './base';
import { SettingsScreen, AboutScreen } from './settings';
import { NowPlayingScreen } from './now-playing';
import { ClockScreen } from './clock';
import { BrickScreen } from './brick';
function songsForIds(deck: Library, ids: Array<Track["id"]> = []) {
  return ids.map((id) => deck.songs.find((song) => song.id === id)) .filter((song): song is Track => !!song);
}

function playlistRows(device: Ipod) {
  const rows = device.deck.playlists.map((playlist) => ({
    title: playlist.name,
    chevron: true,
    onSelect: () => {
      if (playlist.apple) { device.loadApplePlaylist(playlist); return; }
      device.push(new SongsScreen(device, songsForIds(device.deck, playlist.songIds), playlist.name));
    }
  }));
  if (device.youtubePlayer) rows.unshift({
    title: "YouTube playlist", chevron: true,
    onSelect: () => device.push(new ListScreen(device, "YouTube", device.sequence.map((track, index) => ({
      title: track.trackName,
      onSelect: () => { device.youtubePlayer?.playAt(index); device.push(new NowPlayingScreen(device)); }
    }))))
  });
  return rows;
}

export class MainMenuScreen extends MenuScreen {
  constructor(device: Ipod) {
    super(device, "iPod", [
      { title: "Playlists", chevron: true, onSelect: () => device.push(new ListScreen(device, "Playlists", playlistRows(device))) },
      { title: "Artists", chevron: true, onSelect: () => device.push(musicGroups(device, device.deck.songs, "artistName", "Artists")) },
      { title: "Songs", chevron: true, onSelect: () => device.push(new SongsScreen(device, device.deck.songs, "Songs")) },
      { title: "Settings", chevron: true, onSelect: () => device.push(new SettingsScreen(device)) },
      { title: "About", chevron: true, onSelect: () => device.push(new AboutScreen(device)) },
      { title: "Now Playing", chevron: true, visible: () => !!device.current, onSelect: () => device.push(new NowPlayingScreen(device)) },
      { title: "Browser", chevron: true, onSelect: () => device.push(new BrowserScreen(device)) }
    ], "clamp");
  }
}

/** Integrations and conveniences outside the recovered firmware menu. */
export class BrowserScreen extends MenuScreen {
  constructor(device: Ipod) {
    super(device, "Browser", [
      { title: "Apple Music", chevron: true, onSelect: () => device.openAppleMusic() },
      { title: "Music", chevron: true, onSelect: () => device.push(new MusicScreen(device)) },
      { title: "Extras", chevron: true, onSelect: () => device.push(new ExtrasScreen(device)) },
      { title: "Shuffle Songs", onSelect: () => device.shuffleSongs() },
      { title: "Backlight", wake: false, onSelect: () => device.toggleBacklight() },
      { title: "YouTube", chevron: true, onSelect: () => device.openYouTube() }
    ]);
  }
}

/** Group actual library metadata, keeping each group's playback queue scoped. */
export function musicGroups(device: Ipod, songs: Track[], key: "artistName" | "albumName" | "genre" | "composer", title: string): ListScreen {
  const groups = new Map<string, Track[]>();
  for (const song of songs) {
    const name = song[key] || "Unknown";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(song);
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

export class MusicScreen extends MenuScreen {
  constructor(device: Ipod) {
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

export class ExtrasScreen extends MenuScreen {
  constructor(device: Ipod) {
    super(device, "Extras", [
      { title: "Clock", chevron: true, onSelect: () => device.push(new ClockScreen(device)) },
      { title: "Games", chevron: true, onSelect: () => device.push(new ListScreen(device, "Games", [
        { title: "Brick", chevron: true, onSelect: () => device.push(new BrickScreen(device)) }
      ])) }
    ]);
  }
}

export class SongsScreen extends ListScreen {
  constructor(device: Ipod, songs: Track[], title: string) {
    super(device, title, songs.map((song, i) => ({ title: song.trackName, onSelect: () => device.play(songs, i) })));
  }

  onPlay() { this.onCenter(); }
}

