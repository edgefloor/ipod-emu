# Apple Music setup

1. Run `pnpm start` from the repository, and
   open `http://localhost:8123`. Use HTTPS for a deployed site.
2. Open **Browser → Apple Music** on the iPod.
3. Paste a valid developer JWT and choose **Use token**. The app loads Apple's
   MusicKit v3 SDK at this point. Token format and expiry are checked locally;
   Apple validates the signature and permissions.
4. Choose **Connect Apple Music** and complete Apple's sign-in and consent flow.
5. Close the panel and browse **Playlists**, **Artists**, or **Songs**. Songs and playlist listings load across
   all pages; individual playlist tracks load when opened.

MusicKit supplies streaming, elapsed time, duration, queue progression, shuffle,
repeat, and playback state. UI clicks still use the local audio engine. Full
streaming depends on the account's subscription, content availability, and the
browser's DRM support. If an embedded preview cannot complete authorization or
playback, open the app in a regular supported browser.

**Refresh library** reloads the library and stops the current queue. **Disconnect
& use demo** stops streaming, asks MusicKit to sign out, and restores the demo.
The app does not save your developer token in localStorage or send it to an app
backend. It remains in MusicKit's memory for the page session; reload to discard
it. MusicKit manages the listener's Music User Token and its own authorization
storage. Only emulator preferences are saved by this app.

### Generate a token locally

Keep the private `.p8` key outside this project and outside the directory being
served. The helper uses Node's built-in crypto library, with no network calls:

```sh
pnpm token \
  --key /private/path/AuthKey_KEYID.p8 \
  --team TEAM_ID --key-id KEY_ID \
  --origin http://localhost:8123 --days 30
```

Copy the printed JWT into the setup panel. The helper defaults to 30 days and
caps expiry at 180 days. Set `--origin` to the exact deployed origin when hosting
elsewhere. Never paste or upload the signing key to the app.

Implementation: `src/integrations/music-api.ts` handles SDK loading, token
preflight, pagination, and metadata mapping. `music-player.ts` serializes playback
commands; `music-dialog.ts` owns the connection form. `src/device.ts` routes
playback to the active source. Tests use an SDK mock; they do not prove live Apple authorization or DRM
streaming. Those require a valid developer token and an Apple Music account.

References: [MusicKit Web documentation](https://js-cdn.music.apple.com/musickit/v3/docs/index.html),
[developer tokens](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens),
and [user authentication](https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit).

For the GitHub Pages site, use `https://edgefloor.github.io` as the token origin.
An origin includes the scheme and host, not the `/ipod-emu/` path.
