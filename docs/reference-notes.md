# Reference notes

These notes record the original investigation of Apple’s easter egg. They describe
the reference component, not the current simulator.

## Where the easter egg came from (what the analysis found)

The 404 page's HTML shell (`/us/jfdsalkfavsd` returns real 404 content rendered
client-side) lazy-loads `NotFoundPage~<hash>.js`, which renders the page into
`<div class="ipod-container">` and injects:

```html
<script type="module" id="web-music-ipod-script"
        src="/includes/ipod/web-music-ipod.esm.js"></script>
```

then waits up to 5 s on `customElements.whenDefined("web-music-ipod")`.
The easter egg is its own Stencil-sized web component: `<web-music-ipod>`.

Observed public API of the component (from its compiled bundle):

| Property | Meaning |
| --- | --- |
| `locale`, `i18n` | localization plumbing from the host page |
| `dragStepDegrees` | wheel physics: degrees of travel per click step (default 25) |
| `backlit`, `playback` | host-controlled overrides |
| `navigateToUrl` | host link-out |
| `iPodDataStore` | injected content store |

Observed behavior:

- Content loads from `/includes/ipod/data/{storefront}/{language}.json`
  (schema v3: `songs` / `artists` / `playlists`), falling back to `index.json`.
- Playback is plain `<audio>`-class playback of **30-second previews** with a
  WebAudio gain node for volume; settings (Shuffle / Repeat / Backlight /
  Clicker / volume) persist in `localStorage`.
- The wheel uses pointer capture with angular-delta tracking and a direction
  lock: the first decisive rotation locks direction, and each step commits
  after 25° of effective travel; attempts to reverse must pay back travel.
  The component dispatches `wheelscroll {step, degrees, speed}` plus
  `wheeldragstart` / `wheeldragend`.
- Screens: main menu (Playlists / Artists / Songs / Settings / Now Playing…),
  nested lists, Now Playing (progress, shuffle/repeat badges, **volume on the
  wheel while on that screen**), Settings (About / Shuffle / Repeat /
  Backlight timer / Clicker / Reset All), and the classic **Brick** game.
- A synthesized/fetched tick sound plays per wheel step (a "Clicker" toggle),
  and the display has a backlight dim timer (Off / 1 s / 2 s / 3 s / 5 s /
  Always On).
