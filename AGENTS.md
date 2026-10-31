# Agent guide: Android TV port

This repo is the TV edition of `zfdang/hongguo-open-player` (Electron + Express + Vue): it keeps the desktop app and
adds an Android TV app (`tv-app/`) that shows the same web UI. Read this before changing anything under `tv-app/`.

## Branches and upstream

- Remotes: `origin` is this fork (`aar0u/hongguo-open-player`), `upstream` is `zfdang/hongguo-open-player`.
- Work happens on `main`. This fork does not track upstream wholesale: check upstream now and then and take only what
  is useful.
- Review upstream: `git fetch upstream` and `git log --oneline main..upstream/main`. Take a commit with
  `git cherry-pick <sha>` (or merge a range), and skip the rest.
- After taking upstream changes to `src/client`, rebuild and test on a TV. The TV build transpiles `src/client`, so
  upstream UI changes flow in automatically but can break selectors used in `tv-app/tv-player.js` (for example a
  new header control or a renamed class).
- Do not run `git push --tags` or push `v*` tags: `build-release.yml` builds Electron installers on `v*` tags, and
  `git fetch upstream` brings upstream's tags into the local repo.
- Commit locally with conventional messages. The owner pushes.
- Files outside `tv-app/` that this edition changes: `src/server/index.js` (`HOST` env var, default `127.0.0.1`),
  `.gitignore`, `start-lan.sh`, `.github/workflows/tv-apk.yml`. Keep that list short so cherry-picks stay clean.

## Architecture

```
Termux phone (or any host)            Android TV
  node src/server/index.js     <-----  tv-app APK: WebView + ExoPlayer
  HOST=0.0.0.0 PORT=8899                loads http://<host>:8899/
```

- The backend does the API signing and the CENC decryption proxy. The APK is only a shell. Start the backend with
  `bash start-lan.sh`. With a non-loopback `HOST` the server skips its Host header check but still checks Origin.
- Default server address is baked into the APK (`-PserverUrl`, default `http://192.168.31.217:8899/`) and can be changed
  at runtime from the Menu panel ("服务地址").
- The test TV (`OBE_C3Air`, a projector) runs Android 9 with the system WebView at Chrome 66, 32-bit ARM. It cannot
  update the WebView. Another test TV has a newer WebView; support both.
- Every stream is HEVC. Chrome 66 cannot decode it, so `tv-app/tv-player.js` shims the page's `<video>` onto a
  Media3 ExoPlayer surface under a transparent WebView (`NativePlayer.java`). The TV has the hardware HEVC decoder.

## Files in tv-app

| File | Purpose |
|---|---|
| `build-assets.sh` | Transpiles `src/client` for Chrome 66 into `app/src/main/assets/` (generated, git-ignored) |
| `legacy-banner.js` | Prepended to `app.js`: fetch credentials, referrer meta, template `?.` rewrite, fullscreen emulation |
| `tv-player.js` | Appended to `app.js`: video shim, TV CSS, Menu panel, control bar, focus handling |
| `transform-css.js` | Strips `:fullscreen` selectors and adds a `:focus` twin for every `:hover` selector |
| `app/.../MainActivity.java` | WebView host, asset interception for `/js/app.js` and `/css/app.css`, key handling |
| `app/.../NativePlayer.java` | JS bridge `NP` to ExoPlayer, sizes the surface to the page's video element |

After editing `tv-player.js`, `legacy-banner.js` or `transform-css.js`, run `bash tv-app/build-assets.sh` again. Gradle
does not do it.

## Build

Toolchain: JDK 17, Gradle 8.9, Android SDK platform 34 and build-tools 34.0.0. A previous session installed them under
`/home/node/scratch/tmp/tc` (scratch space, may be gone; reinstall from Temurin, services.gradle.org and the Android
command-line tools).

```
bash tv-app/build-assets.sh
cd tv-app && JAVA_HOME=... ANDROID_HOME=... gradle --no-daemon -q assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

CI (`.github/workflows/tv-apk.yml`) runs the same two steps on pushes to `main` that touch `tv-app/` or `src/client/`
and publishes the APK to the public
prerelease `tv-latest` (downloadable without login, unlike artifacts). Debug signing keys differ between CI and a local
machine, so `adb install -r` fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`; `adb uninstall org.hongguo.tv` first.

## Test loop (adb)

- `adb connect <tv>:5555`, then `adb install -r`, `adb shell am force-stop org.hongguo.tv`, launch with
  `adb shell monkey -p org.hongguo.tv -c android.intent.category.LEANBACK_LAUNCHER 1`. If adb says `unauthorized`,
  accept the prompt on the TV. After the TV reboots, retry `adb connect`; a stale connection shows `device` but shell
  commands fail with `error: closed`.
- Remote keys: `adb shell input keyevent KEYCODE_DPAD_DOWN|CENTER|BACK|MENU`. Wait about 1.5 s between keys.
- `adb shell screencap -p /sdcard/s.png` then `adb pull`. It includes the native video.
- WebView console: `adb logcat -d | grep CONSOLE`.
- DevTools over adb: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` (pid from
  `adb shell pidof org.hongguo.tv`), read `http://localhost:9222/json` for `webSocketDebuggerUrl`, then send
  `Runtime.evaluate` with `awaitPromise` over the websocket (`uv run --with websockets`). Useful to open a drama
  without keys (`document.querySelectorAll('.drama-card')[1].click()`) and to read `document.activeElement`.
- A keypress test that crosses the end of an episode is noisy: the page auto-advances and refocuses the player.

## Remote control design

- Windowed playback: arrows move focus natively. Right from the player goes to the current episode. OK on the player
  enters fullscreen. Back leaves one layer at a time.
- Fullscreen: Up opens the Menu panel, Down shows the control bar (Left/Right pick, OK triggers), Left/Right seek 5 s,
  OK pauses. The page hides the bar after 2.5 s idle.
- The Menu key opens the same panel. Some remotes have no Menu key, hence Up in fullscreen.
- Focus looks like the page's `:hover` style (see `transform-css.js`). The player frame and the Menu panel use a thin
  yellow outline.

## Chrome 66 and WebView pitfalls (all hit already)

- No `?.` or `??`: esbuild lowers `app.js`, and a banner rewrites `?.` inside the in-DOM Vue template.
- `fetch()` defaults to `credentials: 'omit'` (session cookie missing, 401), and `keepalive` JSON POSTs fail on
  preflight. Same-origin POSTs send `Origin: null` under the server's `Referrer-Policy: no-referrer`; a
  `<meta name="referrer" content="same-origin">` fixes it.
- One unknown selector (`:fullscreen`) invalidates a whole rule list, so those rules were silently dropped.
- Flex `gap` is ignored; use margins. `.ctrl-btn` fixes 32x32 px, so wide buttons overflow.
- `<input type="range">` keeps the arrow keys for itself and traps focus. The volume and seek inputs are disabled.
- The page re-focuses `.player-container` on every play, click and focus change. `tv-player.js` ignores that while
  focus is in the panel, header, episode list or control bar, and hides those `focusin` events from the page.
- The session cookie is HttpOnly + SameSite=Strict, so `CookieManager.getCookie` returns nothing. `NativePlayer`
  fetches `/` itself and reuses the `Set-Cookie` values.
- A newer WebView draws a grey default poster over a `<video>` with no frame, and its real Fullscreen API swaps the
  WebView for a custom view that hides the native surface. The video element is kept at `opacity:0` and fullscreen
  is emulated on every WebView.
- Keep the screen on while playing (`NativePlayer` sets `keepScreenOn`), or the screensaver starts.

## Open items

- The fullscreen fix for the newer WebView (commit `f8a13b3`) is not verified on that TV.
- ExoPlayer logs a HEVC level warning (`hvc1.1.6.L186`); playback works.
- No seek or volume control by arrow keys in windowed mode (use fullscreen Left/Right and the system volume keys).
