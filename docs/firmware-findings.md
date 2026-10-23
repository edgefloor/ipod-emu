# Firmware evidence and implementation decisions

This migration uses the supplied `FINDINGS.md` from the completed static analysis.
It is not a runtime observation of an iPod. The retail firmware version and device
generation remain unconfirmed. Evidence labels F01–F09 refer to that handoff.

Original image SHA-256:
`7b5e3f25b0d7f1f0ddd2693b58544a16688dd25dbc370b31c28156d99a50a4ed`.
Original size: 2,495,488 bytes. Analysis used Ghidra 12.1.4, ARM:LE:32:v4t.

## Applied evidence

| Finding | Evidence | Application |
| --- | --- | --- |
| F03 | Menu `0x2512`, main address `0x132dd8` | Flat Playlists, Artists, Songs, Settings, About, conditional Now Playing. Browser additions are grouped in a separate Browser menu. |
| F04 | Menu `0x278f`, main address `0x132ffc`; script `0x38b` | Settings order: Shuffle, Repeat, Backlight Timer, Contrast, Clicker, Sleep Timer, Startup Volume, Language, Reset All Settings. |
| F05 | Menu `-38` at `0x1335d4` | Backlight choices: Off, 1 Sec, 2 Sec, 3 Sec, 5 Sec, Always On. Opening a choice screen selects the current value; committing returns to Settings. |
| F05 | Menu `-48` at `0x1334f8` | Sleep choices: Off, 5 Minutes, 10 Minutes, 15 Minutes, 30 Minutes, 60 Minutes. |
| F06 | Menu `-57` at `0x1334ac` | Reset All Settings opens a two-row Cancel / Reset menu, initially selecting Cancel. |
| F07 | Decoded BMap resources | Small pixel patterns transcribed into `src/icons.ts` and rendered as current-color SVG pixels. |

The included icon references are repeat `0x2560`, repeat-one `0x2561`, shuffle
`0x2564`, chevron `0x2565`, five battery stages `0x2573..0x2577`, pause/play
`0x3314..0x3315`, and speakers `0x3318..0x3319`. All retain the recovered bitmap
width, height, padding, and pixel values. Gray strengths use a provisional linear
mapping, not a claim about the physical LCD's gamma. Battery segments have equal
width and spacing; the displayed full battery remains a simulated indicator.

## Browser behavior retained or chosen

- The conditional Audio Tour predicates are unresolved. Neither row is shown.
  Now Playing remains visible while a track is selected, as in the earlier app.
- Factory defaults were not recovered. Existing defaults remain; new contrast
  defaults to the existing ink color, startup volume defaults to last volume,
  and sleep is initially off.
- Sleep uses a wall-clock deadline and pauses the active player once. It does
  not unload a queue, power off the device, or survive a reload. A backgrounded
  page may only process expiry when the browser resumes it.
- Contrast adjusts ink colors without a CSS filter, preserving crisp mobile
  rendering. Startup volume offers Last Volume and 0/25/50/75/100%, applied at
  page initialization. Those options and behaviors are browser choices.
- Language offers English only. Other locale databases exist, but their mapping
  and complete coverage are unverified; no untranslated languages are advertised.
- Reset clears browser preferences, including the new preferences, and cancels
  sleep. It does not disconnect Apple Music or clear its authorization. This is
  the simulator's reset policy, not recovered native reset coverage.
- About reports actual library counts, playback source, and app version. Invented
  hardware capacity and free-space values were removed.
- Wheel thresholds, wrapping, Now Playing controls, volume-overlay timing, game
  physics, and desktop transition timing retain the prior browser behavior.
- Mobile transitions remain immediate to avoid WebKit compositing flashes.
  The click-wheel capture-transfer fix and persistent silent audio output are retained.

## Geometry and typography limits

F08 supports a 160 × 128 logical display interpretation, but the constraint axes,
menu row metrics, font glyphs, and scrollbar geometry are not fully established.
The existing six-row layout, scrollbar spacing, and Chicago Kare font remain.
No whole-screen grid rescale is claimed as a firmware accuracy fix.

## Analysis provenance corrections

F01 supersedes the earlier candidate slice offsets/hashes in the local firmware
inspection artifacts. Subtract `0x800` from the stored image offsets:

| Payload | File start | Length | Exclusive end | Additive checksum |
| --- | --- | --- | --- | --- |
| Main | `0x4200` | `0x14e850` | `0x152a50` | `0x07f7e90e` |
| Updater | `0x157400` | `0x105efc` | `0x25d2fc` | `0x0e98f686` |

Main SHA-256: `76728400d18a925e675307cec60859b637bd63d65142e402705300dba80bc8e2`.
Updater SHA-256: `478c8bdb281b827e157702d8942d6549b7b8fdfc0fae0a7aff497ab35783dee6`.
Main addresses map to file offsets by adding `0x4200`, except relocated data.
Main bytes `0x13f364..0x143358` are copied to runtime `0x211300`.

F02 identifies a checked resource database at main `0x12bdd0`, length `0xfe00`,
SHA-256 `10d82eee63aba7888c2fcdfecefbf8375de34ce55320fcf0f2ff434035aaa135`.
All 370 payloads fit: 36 BMap, 1 LDTm, 8 Menu, 204 Str, 1 TCmd, 54 Type, 66 View.
The TCmd package has 213 procedures; it was not fully decompiled.

Raw firmware, Ghidra projects, diagnostic images, and full resource exports stay
outside the public build. Only selected small UI patterns are application code.
