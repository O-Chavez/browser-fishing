# Lakeside map rework: the three options (2026-11-05)

Three reworked layouts of the main lakeside map, produced by mockup agents and judged over three rounds. Oscar picked the Harbour crescent hybrid, and it is built: `HANDOFF.md` has the build plan and the findings from the greybox and the town placement (2026-11-08). `review.html` is the review page (open it in a browser); `JUDGING.md` has the scores and notes per round; `BRIEF.md` is the brief the agents worked to.

- `harbour.json` / `.md` / `.png` — Harbour crescent, hybrid with Boardwalk's hub (37/40, recommended; rounds 4-5 of 2026-11-08)
- `boardwalk.json` / `.md` / `.png` — Boardwalk and hillside (35/40)
- `point.json` / `.md` / `.png` — The point (34/40)
- `current.json` / `.png` — today's map in the same format, for comparison

Each JSON is a layout in the engine's own terms: `shore` (radius by angle, as `innerRadius` in `src/game/env.ts`), `pad`, `docks` (as `DOCK_RECTS`), and `spots`/`houses`/`npcs`/`props` with `x, z, facing` as in `src/data/maps.ts`.

Re-render a plan: `node docs/map-rework/plan.mjs docs/map-rework/harbour.json out.svg --metrics` then `node docs/map-rework/svg2png.mjs out.svg out.png` (headless Chrome, needs `puppeteer-core` from node_modules).
