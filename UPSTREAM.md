# Upstream log

Upstream is `zfdang/hongguo-open-player` (remote `upstream`). On 2026-11-19 this fork was rebuilt on top of
`upstream/main` (`f57df9c`): `main` now has upstream as an ancestor, and the fork adds only the TV edition files
listed in `AGENTS.md`. Earlier cherry-pick decisions are in git history of this file.

## Updating

1. `git fetch upstream && git merge upstream/main`. Conflicts can only be in the files the fork changes.
2. `npm install && npm test`, then `bash tv-app/build-assets.sh`.
3. If `src/client` changed, build the APK and test on a TV. Check the selectors in `tv-app/tv-player.js` and the
   D-pad focus on any new control.

## Carried patches (not in upstream main)

- Upstream PR #107 (`a3e6269`): v5 mobile signing for the player endpoint. Without it the endpoint returns an empty
  HTTP 200 (upstream #105, #102). When upstream merges it, drop our copy during the merge and delete this entry.
- `HOST` env var in `src/server/index.js` (LAN binding). Candidate for an upstream PR.

## Open

- New upstream UI (danmaku, device management, search history) was never tested with the D-pad or Chrome 66.
- `ci.yml` and `tv-apk.yml` use actions v4; upstream uses newer majors. Check they exist and bump.
