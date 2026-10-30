# CLAUDE.md

## Planned work

Planned work lives in `TODO.md`: **Up next** is what's been decided on, **Ideas** is everything else, grouped by area. Finished items live in `DONE.md`.

- Work on one TODO item per session unless asked otherwise.
- When an item is finished and verified, tick it off (`- [x]`) and move it to the top of `DONE.md`.
- If you come up with an idea that's out of scope for the current task, add it under the matching area in **Ideas** in `TODO.md` instead of doing it. Tag it 🎨 (taste-driven), 📋 (needs a plan) or 💬 (asked for by players) where that fits.
- For taste-driven items (visual cleanup, menu polish, player faces), ask questions or propose options before writing code. "Polish the menu systems" has no details yet, so always ask first.
- For larger items (performance, global chat), propose a plan before making edits.

## Commands

- `npm run dev:all` — run the game server and the Vite client together
- `npm run build` — type-check and build
- `npm test` — run tests (Vitest)
- `npm run bench` / `npm run bench:compare` — render benchmark; run before and after performance changes and compare
- `npm run bench:load` — load-hitch probe: frame gaps, shader compiles and long tasks from page load through joining and the first look around (`--phone`, `--online`, `--night`); set `BENCH_ROOT` to a checkout of main for a before/after
- `npm run bench:ab -- <before> <after>` — alternating A/B benchmark of two commits (~10 min); use this to prove a performance change, since single runs drift
- `npm run smoke` — end-to-end smoke test in headless Chrome with its own server (~1.5 min); run before merging gameplay or scene changes
- `npm run screenshots` — regenerate the README screenshots in `docs/images/` and the casino poster image `src/assets/images/casino-preview.jpg` (~1 min); re-run after visible changes and check the images before committing
- `npm run trailer` — re-record the ~10 s README gameplay clip into `docs/images/gameplay.mp4` and `.gif` (~3 min, needs ffmpeg); only re-run for notable visual changes, since each re-record adds ~10 MB to git history
