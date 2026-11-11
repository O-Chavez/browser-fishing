# Map rework: hand-off for the build session

Written 2026-11-08 at the end of the planning sessions. Read this first, then `harbour.md`, then the code files it points at.

## What was decided

Oscar picked **Harbour crescent, hybrid, round 5** as the new lakeside map (judge's score 37/40; the other two options, Boardwalk and The point, are kept here for reference only). It is a plan, not code: nothing in `src/` has changed yet.

In one paragraph: the town wraps a small cove framed by two pine-topped headlands. A timber quay runs across the cove's back; the pier runs out of its middle to a T end, with a short jetty either side of the pier's root (bench on the east one, the rowboat moored by the west one). Marlow's and the Smokehouse stand behind the quay's middle facing the water, with Top Anglers and Thanks on the deck beside the Smokehouse. The quay's west end is Captain Reed's corner: a 2.4 m lane runs past the worm patch down to his beach, with the Furthest Out board at the top of the lane; the seaplane floats in the cove in view from the pier. The mirror is at the quay's east end. Up the main path the well square is a junction: lanes run west past Wren's Cottage down to the worm patch and east past the Net Mender down to the campfire on the east headland, so the village is a ring. Three more houses stagger up to the casino gate. A three-rock islet 30 m past the T end is the eye's target.

## Where everything is

Branch `map-rework`, worktree `../agent-test-game-map-rework` (node_modules symlinked from the main checkout). Work on this branch; don't start a new one. Folder `docs/map-rework/`:

- `harbour.json`: the layout in the engine's terms. `shore.points` are `[thetaDegrees, radius]` samples of the shoreline radius (theta = atan2(x, z) as in `innerRadius`), cosine-interpolated and periodic (see `makeInner` in `plan.mjs` for the exact rule to port); `pad` replaces `MAPS[0].pad`; `docks` replace `DOCK_RECTS` (5 rectangles); `spots` have `x, z, facing` with facing 0 = +z as in `maps.ts`; `props`, `paths`, `houses`, `npcs` (with walks) and `bottles` say where everything goes. `harbour.md`: the summary, every round's changes, hero views, build notes (boards and mirror stand on the deck at 0.7; the quay's rear edge meets the pad bank flush at the centre and stands a 0.2 m kerb proud of the sand at the ends).
- `current.json`: today's map in the same schema, for diffing.
- `plan.mjs` renders a layout and, with `--metrics`, prints walks, prop counts, each spot's ground height and WATER warnings, and dock corner wetness. Use it to check any change before building it: `node docs/map-rework/plan.mjs docs/map-rework/harbour.json out.svg --metrics`, then `node docs/map-rework/svg2png.mjs out.svg out.png`.
- `BRIEF.md` (requirements, engine rules, rubric), `JUDGING.md` (every round's scores and notes), `review.html` (the review page Oscar saw).

## Code the build touches

- `src/game/env.ts`: `innerRadius(theta)` (the shoreline), `DOCK_RECTS`, `DOCK_TOP`, the pad blend (`PAD_BLEND`, `BANK_SLOPE`), `isWater`, `standHeight`. `nightglow.ts` reads `DOCK_RECTS` for the water glow.
- `src/data/maps.ts`: `MAPS[0]` ('pond'): `pad`, every `Spot` (shop, smokehouse, gate, boards, mirror, campfire, worms, spawn), `npcs` with their walks, and `HARBOUR` (Reed, plane, sign, dive landing and the Furthest Out board, all placed from `fromReed`).
- `src/game/world.ts`: `buildTerrain`, `buildDock`, `buildRowboat`, `buildForest`, `buildClutter`, `buildMountains` (its rock cones are a starting point for the islet). `src/game/hub.ts` and `town.ts` build the stalls, boards, lamps, houses, square and gate from the spots.
- Tests that pin geometry: `src/game/harbour.test.ts` (Reed's beach, the board, the plane afloat) and `src/game/npcwalk.test.ts` (walks stay on dry ground). Expect to update their expectations with the new positions, not to loosen them.
- `scripts/screenshots.ts` shows the headless staging API: `window.__game` with `G.teleport(x, z)`, `G.look(yaw, pitch)`, `G.day(t)`; the memory `headless-visual-repro` has the gotchas.

## The plan for the build

1. Add the item to `TODO.md` **Up next** (one line, pointing here), as 🚧 on this branch, since it spans sessions.
2. **Greybox first**: shore, pad, dock rectangles, islet rocks, headland pines; everything else left where it is or hidden. Stage the hero views from `harbour.md` headlessly (desktop and `--phone`-sized viewports, day and dusk) and send Oscar the shots before placing the town. The questions only the greybox answers: how the cove reads at a phone's field of view; whether the quay feels crowded once the stalls, boards, crates and lanterns are on it; whether Reed's corner and the plane read from the pier; the headland pines at dusk. Treat `harbour.json` as the starting point, not scripture: the plan renderer cannot see eye height.
3. Then place the town from the spots, the ring lanes, props, NPC walks and bottles; update `HARBOUR` so Reed, sign, landing, plane and the Furthest Out board match the plan.
4. Finish: `npm test`, `npm run build`, `npm run smoke` (this is a scene change), `npm run bench:compare` against main (same mesh kinds and 8 point lights, so the budget should hold), `npm run screenshots` and look at them, and re-record the trailer only if Oscar wants it.
5. Docs in the same commit: the systems doc for the map/world (find where `docs/systems/` lives now; it was moved off main to another branch on 2026-11-08), GAME_DESIGN.md gets a dated decision pointing at `docs/map-rework/JUDGING.md`, and a **What's new** entry (`NEWS` in `src/data/news.ts`, with a photo: this is a big release). Use the game's words on screen: quay, jetty, Reed's beach, no code names.

## Known trade-offs, already accepted by Oscar

- Sideways casts inside the cove reach the headland beaches at about 15 m; the game already shortens a cast until it lands in water, so long rods cast lakeward from the T end and the jetties.
- Reed stays on his own beach, 22 m from the shop (as today); his visibility comes from the plane in the cove and the board at the top of his lane, not from moving him closer.
- The headland tips are low (0.4-0.6 m); the pines make the silhouette, and from spawn and the T end they sit outside the camera's view, so they never hide the mountains.
