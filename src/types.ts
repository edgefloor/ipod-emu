import type { MusicResource } from './integrations/musickit-types';

export type Repeat = 'off' | 'song' | 'all';
export interface Settings {
  shuffle: boolean;
  repeat: Repeat;
  backlight: number;
  clicker: boolean;
  volume: number;
  contrast: number;
  startupVolume: number | 'last';
  language: 'English';
}
export interface Track {
  id: string | number;
  trackName: string;
  artistName: string;
  albumName?: string;
  genre?: string;
  composer?: string;
  playlist?: string;
  melodySeed?: number;
  duration: number;
  musicKitItem?: MusicResource;
}
export interface Playlist {
  id?: string;
  name: string;
  songIds?: Array<Track['id']>;
  apple?: boolean;
}
export interface Library {
  schemaVersion?: number;
  storefront?: string;
  language?: string;
  songs: Track[];
  artists: Array<{ name: string; songIds: Array<Track['id']> }>;
  playlists: Playlist[];
}
export interface MenuRow {
  title: string;
  value?: () => string;
  chevron?: boolean;
  onSelect?: () => void;
  visible?: () => boolean;
  wake?: boolean;
}
export interface DisplayRow { label: string; value?: string; chevron?: boolean }
