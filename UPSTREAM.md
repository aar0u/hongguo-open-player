# Upstream review log

Upstream is `zfdang/hongguo-open-player` (remote `upstream`). This fork takes only what is useful; see `AGENTS.md`
for the workflow. This file records what was decided, so nobody reviews the same commit twice.

How to review the next batch:

1. `git fetch upstream` and `git log --reverse --format='%h %s' main..upstream/main`.
2. Decide each commit, cherry-pick what is useful, run `npm run test:unit`, rebuild the APK and test on a TV if
   `src/client` changed.
3. Record the decisions below.
4. Mark the batch as reviewed with `git merge -s ours upstream/main`. It keeps this repo's files exactly as they are
   and makes `main..upstream/main` list only new commits. A skipped commit can still be taken later with
   `git cherry-pick <sha>`.

## Reviewed up to `de2e0f9` (2026-10-31)

| Commit | What it does | Decision | Reason |
|---|---|---|---|
| `0276d8b` #29 | Moves the episode-list toggle button and changes its icons | Skip | Changes page structure that `tv-app/tv-player.js` relies on (`aria-controls="episode-sidebar"`, sidebar visibility) |
| `7da219a` #30 | Sidebar header: heart favourite button, drama intro preview, plot popup | Skip for now | Large UI change (433 CSS lines) that also moves the favourite button the D-pad code targets. The intro preview is attractive; revisit on its own |
| `df2aab6` #31 | Refreshes README screenshots | Skip | Desktop documentation |
| `60cd894` #32 | README and docs wording, disclaimer | Skip | Documentation only |
| `4a4a112` #35, `c4d79db` #36 | Issue feedback form | Skip | Upstream's issue process |
| `fed7c40` #34 | Allows Fake-IP and trusted CDN addresses in the web media guard | Taken | A backend behind Clash or a rewriting router would otherwise fail playback. Server only, with tests |
| `dffe976` #37 | Header menu and help entry (shortcut guide, logs, about) | Skip | Desktop features; the TV header is already full |
| `fcfed72` #38 | Windows CI hang fix plus device self-heal on empty auth response | Partly taken | Took only the self-heal (`app-source.js`, `playback-device.js`, test). The Windows CI and open-log changes belong to #37 |
| `7caf68e` #39 | Bumps GitHub Actions versions | Skip | The changed workflows were removed; `ci.yml` and `tv-apk.yml` are still on v4 actions (revisit when GitHub retires Node 20 actions) |
| `8f61e40` #40 | Fixes the log-directory buttons from #37 | Skip | Depends on #37 |
| `3aef0b5` #41 | Stream errors carry a code; the page explains "device registration blocked" | Taken | Shows the backend's reason on screen. Needed a TV change: ExoPlayer's bad HTTP status maps to media error 4 so the page probes the stream |
| `34f4a8e` #42, `de2e0f9` #43 | Automatic release versioning | Skip | Desktop release workflow, removed in this fork |

## Reviewed up to `7bea080` (2026-11-05)

| Commit | What it does | Decision | Reason |
|---|---|---|---|
| `c32799f` #47 | Signs video model requests | Taken | Server only |
| `6d51332` #58 | Playback controls and prefetch | Partly taken | Took the server and test parts; the client part depends on danmaku |
| `c9234ca` #60 | Rapid episode changes (stream service), macOS README | Taken | Server fix |
| `60e1150` #48, `e17129f` #51 | Version display, playback control layout | Skip | Client UI changes |
| `52e44f4` #49, `61d9d36` #53, `d8f269d` #54 | Timed danmaku | Skip | Large client change; untested on Chrome 66 and the native video surface |
| `a8ea3b7` #55, `7bea080` #61 | Recent search history | Skip for now | Client UI; needs D-pad handling |
| `48cfa4f` #57 | Playback continuity and startup, removes review docs | Skip | Mixed with client danmaku and Electron changes |
| `eae938f` #52, `cd7f39a` #56 | Release action, README screenshots | Skip | Removed workflow / desktop docs |

## Reviewed up to `567b490` (2026-11-12)

| Commit | Decision | Reason |
|---|---|---|
| `1d17d88`, `6c50c79` | Partly taken | Playback retries and batching; near-end prefetch UI depends on omitted client features |
| `43b5e7a`, `963a56d`, `3f687c5` | Taken | Playback request format, device persistence and signing |
| `b384260` | Partly taken | Device migration only; sidebar and resolution UI depend on omitted changes |
| `567b490` | Partly taken | Retain playback plans across seeks without ByteVC2 code |
| `ff975f3`, `2e6bf2b`, `7ea8118`, `f5210f5`, `d8cdc86` | Skip | Danmaku is not included in this fork |
| `fd9734a`, `c2d4700`, `897b3d9`, `81831d8` | Skip for now | ByteVC2 transcoding and clear-source support need a separate TV playback and build review |
| `ec9b095`, `33ed623` | Skip for now | Large UI and device-management changes need D-pad integration and TV testing |
| `ebedd74`, `4fee1ca` | Skip | Upstream reverted the persistence change and replaced it in `963a56d` |
| `0796543`, `5c199e3`, `6ac87cb`, `36316dc` | Skip | Documentation or desktop build changes |

The unit tests for omitted upstream client features remain skipped. TV asset generation passed, but the APK build and
device test were not run: the Android toolchain and a connected TV were unavailable.

## Open

- Revisit #30 (intro preview) when there is time to make the popup D-pad friendly.
- The `ci.yml` and `tv-apk.yml` actions are on v4; upstream moved to newer majors in #39. Check they exist and bump.
