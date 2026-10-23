<img src="assets/icon.svg" width="64" height="64" alt="">

# ipod-emu

A classic iPod simulator for the browser. Turn the wheel, browse music, play
Brick, or connect your Apple Music library. Built with plain HTML, CSS, and
JavaScript, with no runtime dependencies in demo mode.

**[Open the iPod](https://edgefloor.github.io/ipod-emu/)**

## Run locally

Requires Node.js 22.13 or newer and pnpm 11.9.0. No packages need downloading to run the app.

```sh
pnpm start
```

Open `http://localhost:8123`. The server builds and serves only the public app
files. Restart it after edits. Use `PORT=8124 pnpm start` if the port is occupied.
You can also open `index.html` directly for the demo; Apple Music needs localhost
or HTTPS.

## Features

- Scroll wheel navigation, separate wheel and button sounds, and keyboard controls.
- Monochrome LCD with uneven backlighting, scan lines, and classic menu layouts.
- Songs, playlists, artists, albums, genres, and composers.
- Now Playing with track position, progress, volume, shuffle, and repeat.
- Clock and Brick with destructible bricks, lives, and successive boards.
- Optional Apple Music library and streaming through MusicKit v3.
- Local preferences for volume, clicker, shuffle, repeat, and backlight.

Demo tracks are original 30-second synthesized melodies. The battery is a
visual indicator, not a reading of your computer's battery.

## Controls

| Control | Action |
| --- | --- |
| Drag wheel / Up and Down | Move selection; adjust volume in Now Playing |
| Select / Enter | Open the selected item or play a song |
| Menu / Escape | Go back |
| Play/Pause / Space | Play the highlighted song in Songs; otherwise toggle playback |
| Previous / Left | Previous track, or restart after three seconds |
| Next / Right | Next track |

In Brick, Select launches or restarts, Play/Pause pauses, and Left/Right move
the paddle. The Backlight item toggles lighting immediately; Settings controls
the timeout. Clicker silences both wheel and button feedback.

## Apple Music

Open **Settings → Apple Music**, paste a developer JWT, choose **Use token**,
then **Connect Apple Music**. Apple handles listener sign-in and consent.

See [Apple Music setup](docs/apple-music.md) for the local token helper,
credentials, and browser requirements. Keep private `.p8` keys outside the
repository. This app has no token-signing backend.

The MusicKit integration has automated mock coverage. Live Apple authorization
and full DRM streaming have not yet been verified with a real account.

## Development and deployment

```sh
pnpm run verify   # Syntax checks, tests, and static build
pnpm test         # Behavior and MusicKit tests
pnpm run build    # Produce dist/ for any static host
```

GitHub Actions runs verification for pull requests and pushes to `main`.
Successful pushes to `main` publish `dist/` to GitHub Pages. In repository
Settings → Pages, the publishing source must be **GitHub Actions**. All assets
use relative paths so the site works under `/ipod-emu/`.

| File | Responsibility |
| --- | --- |
| `ipod.js` | Device controls, menus, demo audio, clock, and Brick |
| `apple-music.js` | MusicKit setup, library mapping, and streaming adapter |
| `data.js` | Original demo library |
| `style.css` | Device artwork and LCD styling |
| `scripts/` | Static build, local preview, and local JWT generation |
| `tests/` | Node test runner checks, including mocked MusicKit |

The build uses an explicit public-file list. Tests, tooling, credentials, and
repository metadata are not included in the deployed site. For debugging, the
device instance is available as `window.ipod`.

## Credits and scope

Inspired by Apple's iPod easter egg and original device interfaces. This is an
independent simulator, not an Apple product or a firmware emulator. No files
extracted from Apple's component are included. [Reference notes](docs/reference-notes.md)
record the initial investigation.

The bundled [Chicago Kare](https://github.com/KingDuane/Chicago-Kare) font by
Duane King is MIT licensed; its [license](assets/fonts/LICENSE) ships with the
site. Source revision: `dca7a9e4f2b971e39cf3a5e8a3f9309d4293d56d`.
The project itself has no open-source license grant yet.
