import type { Library } from './types';
/* ipod-emu — original demo dataset in the schema observed on the live component
 * (schemaVersion 3, songs / artists / playlists). All metadata, melodies and
 * artwork seeds here are invented for local playback; there are no third-party
 * assets. `previewUrl` is intentionally null: the emulator synthesizes each
 * song's audio procedurally from `melodySeed`.
 */

export const DEMO_LIBRARY: Library = {
  schemaVersion: 3,
  storefront: "us",
  language: "index",
  songs: [
    { id: 1, trackName: "Starlit Loading", artistName: "Fern Voltage", playlist: "X's And Ohs", melodySeed: 11, duration: 30 },
    { id: 2, trackName: "Pocket Ghosts", artistName: "Fern Voltage", playlist: "X's And Ohs", melodySeed: 29, duration: 30 },
    { id: 3, trackName: "Turning Gears", artistName: "Halcyon Diner", playlist: "X's And Ohs", melodySeed: 47, duration: 30 },
    { id: 4, trackName: "Neon Kitchen", artistName: "Halcyon Diner", playlist: "Nobody's Coolest", melodySeed: 61, duration: 30 },
    { id: 5, trackName: "Cassette Sunrise", artistName: "Maru & The Signal", playlist: "Nobody's Coolest", melodySeed: 83, duration: 30 },
    { id: 6, trackName: "Longer Downtown", artistName: "Maru & The Signal", playlist: "Nobody's Coolest", melodySeed: 97, duration: 30 },
    { id: 7, trackName: "Cheap Arcade Romance", artistName: "Juno Stencil", playlist: "Deep Cover", melodySeed: 101, duration: 30 },
    { id: 8, trackName: "Static \u00d7 Static", artistName: "Juno Stencil", playlist: "Deep Cover", melodySeed: 127, duration: 30 },
    { id: 9, trackName: "Half A Yen", artistName: "Juno Stencil", playlist: "X's And Ohs", melodySeed: 149, duration: 30 },
    { id: 10, trackName: "Solar Puffs", artistName: "Wave Parade", playlist: "Deep Cover", melodySeed: 173, duration: 30 }
  ],
  artists: [
    { name: "Fern Voltage", songIds: [1, 2] },
    { name: "Halcyon Diner", songIds: [3, 4] },
    { name: "Juno Stencil", songIds: [7, 8, 9] },
    { name: "Maru & The Signal", songIds: [5, 6] },
    { name: "Wave Parade", songIds: [10] }
  ],
  playlists: [
    { name: "X's And Ohs", songIds: [1, 2, 3, 9] },
    { name: "Nobody's Coolest", songIds: [4, 5, 6] },
    { name: "Deep Cover", songIds: [7, 8, 10] }
  ]
};

// Original demo library metadata for the device's album, genre and composer browsers.
const demoAlbums: Record<string, string> = {
  "Fern Voltage": "Night Bus",
  "Halcyon Diner": "After Hours",
  "Maru & The Signal": "Tape Loops",
  "Juno Stencil": "Arcade Summer",
  "Wave Parade": "Solar Radio"
};
for (const song of DEMO_LIBRARY.songs) {
  song.albumName = demoAlbums[song.artistName];
  song.genre = song.artistName === "Juno Stencil" ? "Chiptune" : "Electronic";
  song.composer = song.artistName;
}
