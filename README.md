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
- YouTube playlist loading with a visible embedded player and iPod playback controls.
- Optional Apple Music library and streaming through MusicKit v3.
- Local preferences for volume, clicker, shuffle, repeat, backlight, contrast, and startup volume.
- Separate backlight and sleep timer choice screens with firmware-derived ordering.

Demo tracks are original 30-second synthesized melodies. The battery is a
visual indicator, not a reading of your computer's battery.

## Controls

Choose **Tap to wake** once after loading the page. This activates audio before
wheel controls become available, including on mobile Safari. Sound synthesis and
feedback levels are unchanged.

For motion effects, check **Enable motion effects** before waking and allow the
browser's motion permission if prompted. Three strong alternating movements in
under a second reveal a simulated disk error. Select or Menu recovers the previous
screen; settings and music data are never deleted. Denying motion permission leaves
the player fully usable. Motion readings stay in the browser.


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

## Music-reactive background

Open **Background → MilkDrop → Enable music reaction** in desktop Chrome or Edge.
In the browser sharing prompt, select this player's tab and enable **Share tab audio**.
The shared audio drives the selected visual style through Butterchurn.
Choose Aurora, Nebula, Serpentine, Liquid, or Cubist under **Style**. Changes
blend into the next effect without restarting tab sharing. Aurora and Nebula
are credited community presets; the ribbon, fluid-line, and spectrum-bar
effects are original presets inspired by the variety of classic visualizers.
These are not the proprietary G-Force or Aeon plugins. The capture stays in
this browser; it is not recorded, uploaded, or replayed. The browser also requires
a video track for tab sharing, but the visualizer only processes audio.

Missing audio and cancelled requests can be retried. **Stop sharing audio**, switching
to CRT or Off, leaving the page, or ending browser sharing releases the capture.
Safari and mobile browsers without tab-audio capture can use ambient MilkDrop only.
A browser exposing screen capture does not necessarily support audio; the app checks
the returned stream before connecting it.

Only one background renderer runs at a time. MilkDrop loads on demand, renders at
at most 24 fps with a maximum 960-pixel drawing dimension, and pauses when the tab
is hidden or reduced motion is requested. **Pause background** freezes visuals
without stopping music or the sharing session.

## YouTube playlists

Open **Browser → YouTube**, paste a playlist link or ID, and choose **Load playlist**.
Use a public or embeddable unlisted playlist. No API key is required. The visible
YouTube player handles streaming; tap its Play button if your browser blocks a
start from the iPod controls. Private, age-restricted, region-blocked, or
embedding-disabled videos may not play.

Play/Pause, Next, Previous, shuffle, and repeat control the YouTube player.
Wheel volume accumulates locally while the iframe acknowledges changes and unmutes
when raised. On iPhone/iPad, use the device's volume buttons for YouTube video;
the LCD shows that instruction instead of a simulated volume adjustment.

The video plays in a silver, early-2000s-style portable CRT television. Its compact
view keeps the actual video viewport at 200 × 200 pixels, surrounded by a recessed
bezel and speaker grilles. **Expand** reveals a larger screen and track details;
**Minimize** returns to the small TV without interrupting playback. Playlist and
Input buttons browse tracks and change sources, and the power button stops and
closes the TV. The casing never overlays or filters YouTube's picture or controls.

The expanded TV includes **Reload player** and **Next video**. Reload recreates
the embed while keeping the queue order, current video, volume and playback
position. Press Play to continue. Use it after a stalled load or after changing
your YouTube session or browser permissions; it does not grant cookie access.
Load timeouts expand the TV to show recovery controls.

For ad-free playback, sign in to a YouTube Premium account on YouTube in the same
browser. The playlist dialog links there. The embed can only use the session that
YouTube and the browser make available; the app cannot import account cookies,
force Premium recognition, or turn ads off. A free signed-in account still has ads.
Import opens a browsable playlist with its real name, video titles, and channel
names fetched directly from YouTube's oEmbed endpoint. Select or Play starts the
highlighted entry. The dock's **Playlist** button returns to that list, and
**Input** opens the link field. Long titles scroll in Now Playing unless
reduced motion is enabled. Metadata loads progressively, with at most four
requests at once; unavailable metadata is labelled rather than invented.

The TV’s **power button** ends the YouTube session. Selecting a demo or Apple Music song
also switches away. The last successfully loaded playlist link is remembered
locally for the next visit, but no YouTube requests run until you load it. Background and locked-screen playback are not
guaranteed by the embedded player.

The integration uses the [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference).
YouTube is contacted only after submitting a playlist. The embed stays visible
at a minimum of 200 pixels high, following YouTube's player requirements.

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

## Device-specific audio diagnostics

Append `?audio-debug=1` to the site URL to show an optional audio trace panel.
On a fresh load, turn the wheel twice before tapping a device button, then use
**Copy audio trace**. The report contains browser identification, input events,
audio-context state, clock readings, and feedback requests. It stays in page
memory and is not sent to a server. The normal URL does not enable diagnostics.

## Interface and background

The welcome panel and connection dialogs share the devices' silver casing and
LCD colors. The YouTube dialog explains that Safari's Prevent Cross-Site Tracking
can prevent Premium recognition and cause ads in the embedded player.

The background uses the supplied React Bits CRTWarp component, mounted separately
from the TypeScript player. It runs at up to 24 fps and 1× pixel density, with
reduced-motion support, a pause button, and a CSS fallback when WebGL is unavailable.
The canvas never intercepts device gestures. Third-party notices ship in
`THIRD_PARTY_NOTICES.txt`.
