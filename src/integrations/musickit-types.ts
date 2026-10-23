/** Only the MusicKit Web contract used by this application. SDK data stays at this boundary. */
export interface MusicResource {
  id: string;
  type?: string;
  attributes?: {
    name?: string; artistName?: string; albumName?: string;
    genreNames?: string[]; composerName?: string; durationInMillis?: number;
  };
}
export interface LibraryAPI {
  music(path: string): Promise<{ data: { data?: MusicResource[]; next?: string } }>;
}
export interface MusicKitInstance {
  api: LibraryAPI;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  nowPlayingItemIndex: number;
  isPlaying: boolean;
  volume: number;
  repeatMode: number;
  shuffleMode: number;
  addEventListener(name: string, callback: () => void): void;
  removeEventListener(name: string, callback: () => void): void;
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(queue: { items: MusicResource[] }): Promise<unknown>;
  changeToMediaAtIndex(index: number): Promise<unknown>;
  play(): Promise<unknown>;
  pause(): Promise<unknown>;
  stop(): Promise<unknown>;
  seekToTime(time: number): Promise<unknown>;
  skipToNextItem(): Promise<unknown>;
  skipToPreviousItem(): Promise<unknown>;
}
export interface MusicKitSDK {
  configure(options: { developerToken: string; app: { name: string; build: string } }): Promise<unknown>;
  getInstance(): MusicKitInstance;
  PlayerRepeatMode: { none: number; one: number; all: number };
  PlayerShuffleMode: { off: number; songs: number };
}
