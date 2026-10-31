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

## Open

- Revisit #30 (intro preview) when there is time to make the popup D-pad friendly.
- The `ci.yml` and `tv-apk.yml` actions are on v4; upstream moved to newer majors in #39. Check they exist and bump.
