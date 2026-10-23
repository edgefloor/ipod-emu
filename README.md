<img src="assets/icon.svg" width="64" height="64" alt="">

# ipod-emu

A classic iPod simulator for the browser. Turn the wheel, browse music, play
Brick, or connect your Apple Music library. Built with plain HTML, CSS, and
TypeScript, with no runtime dependencies in demo mode.

**[Open the iPod](https://edgefloor.github.io/ipod-emu/)**

## Run locally

Requires Node.js 22.13 or newer and pnpm 11.9.0.

```sh
pnpm install --frozen-lockfile
pnpm start
```

Open `http://localhost:8123`. The server builds and serves only the public app
files. Restart it after edits. Use `PORT=8124 pnpm start` if the port is occupied.
Serve the built `dist/` directory over HTTP. The source HTML expects the compiled
ES module bundle; opening it directly from disk is not supported.

## Features

- Scroll wheel navigation, separate wheel and button sounds, and keyboard controls.
- Monochrome LCD with uneven backlighting, scan lines, and classic menu layouts.
- Songs, playlists, artists, albums, genres, and composers.
- Now Playing with track position, progress, volume, shuffle, and repeat.
- Clock and Brick with destructible bricks, lives, and successive boards.
- Optional Apple Music library and streaming through MusicKit v3.
- Local preferences for volume, clicker, shuffle, repeat, backlight, contrast, and startup volume.
- Separate backlight and sleep timer choice screens with firmware-derived ordering.

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
the paddle. Browser → Backlight toggles lighting immediately; Settings controls
the timeout. Clicker silences both wheel and button feedback.

## Apple Music

Open **Browser → Apple Music**, paste a developer JWT, choose **Use token**,
then **Connect Apple Music**. Apple handles listener sign-in and consent.

See [Apple Music setup](docs/apple-music.md) for the local token helper,
credentials, and browser requirements. Keep private `.p8` keys outside the
repository. This app has no token-signing backend.

The MusicKit integration has automated mock coverage. Live Apple authorization
and full DRM streaming have not yet been verified with a real account.

## Development and deployment

```sh
pnpm run verify   # Strict type checks, tests, and static build
pnpm test         # Behavior and MusicKit tests
pnpm run build    # Produce dist/ for any static host
```

GitHub Actions runs verification for pull requests and pushes to `main`.
Successful pushes to `main` publish `dist/` to GitHub Pages. In repository
Settings → Pages, the publishing source must be **GitHub Actions**. All assets
use relative paths so the site works under `/ipod-emu/`.

| File | Responsibility |
| --- | --- |
| `src/device.ts` | Navigation, settings effects, queues, backlight, and sleep scheduling |
| `src/screens/` | Menu selection, library browsing, settings, Now Playing, Clock, and Brick |
| `src/audio.ts` | Procedural demo playback and separate wheel/button feedback |
| `src/input.ts` | Pointer capture, wheel gestures, keyboard, and stable mobile sizing |
| `src/ui.ts`, `src/icons.ts` | LCD rendering, transitions, and original SVG icon approximations |
| `src/integrations/` | Typed MusicKit boundary, library API, playback adapter, and connection dialog |
| `src/settings.ts`, `src/types.ts` | Validated persistence and shared domain types |
| `src/data.ts` | Original demo library |
| `style.css` | Device artwork and LCD styling |
| `scripts/*.ts` | esbuild bundle, local preview, and local JWT generation |
| `tests/*.test.ts` | Node tests using direct module imports, DOM fixtures, and mocked MusicKit |

The build uses an explicit public-file list. Tests, tooling, credentials, and
repository metadata are not included in the deployed site. For debugging, the
device instance is available as `window.ipod`.

## Firmware evidence

The main menu and Settings now follow the decoded menu resources from the supplied
firmware image. Apple Music, additional music categories, Clock, Brick, Shuffle
Songs, and manual Backlight are under **Browser**. Conditional Audio Tour entries
are omitted because their activation rules have not been established.

[Evidence and implementation decisions](docs/firmware-findings.md) distinguish
verified labels, menu order, and navigation boundaries from browser approximations.
The app does not execute firmware. Sleep pauses playback once; contrast adjusts
LCD ink color; startup volume applies at page load. English is the only supported
language. These behaviors are useful browser choices, not recovered native semantics.

## Credits and scope

Inspired by Apple's iPod easter egg and original device interfaces. This is an
independent simulator, not an Apple product or a firmware emulator. No files
extracted from Apple's component are included. [Reference notes](docs/reference-notes.md)
record the initial web-component investigation. UI icons are original geometric
SVG approximations informed by the supplied firmware references. Extracted icons,
pixel grids, firmware, resource bundles, and diagnostic PNGs are not shipped.

The bundled [Chicago Kare](https://github.com/KingDuane/Chicago-Kare) font by
Duane King is MIT licensed; its [license](assets/fonts/LICENSE) ships with the
site. Source revision: `dca7a9e4f2b971e39cf3a5e8a3f9309d4293d56d`.
The project itself has no open-source license grant yet.
