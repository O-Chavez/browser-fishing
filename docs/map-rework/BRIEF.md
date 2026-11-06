# Lakeside map rework: mockup brief

You are designing a replacement layout for the main lakeside map of a cozy, first-person, browser fishing game
(three.js, low-poly, pastel sky, warm palette; multiplayer; runs on phones). Players spawn on a pier, fish off it,
walk back into a small lakeside town to sell/buy, smoke fish, dress up, read boards, and travel on to Casino Cove
(through a gate) or out to sea (Captain Reed's seaplane charters). The map is "largely in its initial form" and the
owner wants it reworked: keep the pieces, move them freely, make the place feel great.

Look at these before designing:
- `current.png` in this folder: the current map to scale (top of the page = toward the lake = -z; camera yaw 0 looks up the page).
- Game screenshots: `/Users/oscarchavez/Documents/Code/Personal/agent-test-game/docs/images/dock.jpg` (the fishing view from the pier)
  and `night.jpg` (the town square at night, looking toward the casino gate), plus `outfits.jpg`, `fish.jpg`.
- `current.json`: the current layout in the schema below (this is also the schema reference).

## Hard requirements
1. Keep every core component, positions free: the **fishing dock** (walkable timber over water, a deep reach for the "big ones"),
   **Marlow's BAIT & TACKLE** stall (shop + shopkeeper), the **Smokehouse** (Mags's counter shack), the **casino gate** (an arch with a
   "Travel" prompt and a framed poster on each side), and the **boards**: Top Anglers leaderboard (+ its Thanks board beside it) and
   the **Furthest Out** board (by the harbour today, free to move).
2. Keep these too (they are live features): **Captain Reed's harbour** (Reed on the sand, a CHARTERS signpost, the seaplane floating
   in the shallows nose-to-shore ~7x7 m, a landing spot on the sand where dive players reappear), the **wardrobe mirror**,
   the **campfire**, the **worm patch** (soft sand on a beach, for broke players), the **well square** (cobbled disc, well, 2 benches),
   the **6 houses** (2 signed: Wren's Cottage, Fishmonger, Net Mender; houses are decoration, NPC walks pass them),
   the 5 NPCs (Old Salty walks the pier, Pip laps the well then runs to the fish racks, Granny Wren shuffles near her cottage,
   Mags stands behind her counter, Reed stands by his sign), 7 hidden bottles, 2 fish-drying racks, 1 rowboat, flower beds, lamps.
3. **Size:** not significantly larger than today. Today's placed things span x -20..17, z -5..56 (about 37 x 61 m). Stay within
   roughly 45 x 70 m. Walk speed is 4.2 m/s (sprint 7), so 20 m is ~5 s.
4. **Performance:** same budgets as today or less. Today: 6 houses, ~22 lamp posts of which 8 carry a real point light (point
   lights are the expensive thing; glowing bulbs are free), ~50 small props, 4 dock rects, 300 instanced trees outside the town,
   water is one plane, terrain is one mesh. New *kinds* of mesh are fine if they are a few boxes/cylinders (bridge, jetty, pergola,
   lookout, rocks); no new textures or shaders. Keep point lights ≤ 8.
5. **Style:** the game's own look (see the screenshots): pastel sky, warm low-poly wood and pastel painted houses, cobbles, picket fences,
   string lights, lanterns. No new palette, no "different game" mood.

## How the engine shapes the ground (so your plan is buildable)
- The lake is at the origin. Ground height is radial: the shore is `innerRadius(theta)` with `theta = atan2(x, z)` (theta 0 = +z,
  toward the town). Inside that radius the ground drops to water (water where height < -0.25 m, roughly 1 m inside the radius);
  outside it rises to grass and then hills (trees are spawned where the ground is > 0.8 m and outside the town pad + 6 m).
  You can give the shore as a formula in `t` or as `[thetaDeg, radius]` samples (smoothly interpolated, periodic). The domain is
  star-shaped around the origin: one lake, no separate ponds, but coves, points, a bay, an islet reached by a bridge (as a dock
  rect) are all possible. Rocks in the water are props.
- The **town pad** flattens a disc to height `h` and its bank slopes 0.3 m/m into the water beyond its radius, so the pad is
  effectively the town's island/peninsula: water starts ~4 m past `pad.r`. Today: centre (0,35), r 24, h 0.9. You may move/resize it
  (one pad only). Sand shows where the ground is below ~0.4 m, grass above ~1.6 m.
- **Docks** are axis-aligned rectangles in x/z at deck height 0.7 (players walk on them, nothing snags on them). 3 m is a comfortable
  width; the pier is narrow on purpose so props must not sit on it. A T or L end, side piers, a boardwalk along the shore, a bridge
  to an islet are all just rects.
- **Casting:** players cast from any dock edge or shore into water; fish quality is by distance from shore, deeper is better
  ("the far end of the pier is where the big ones bite"). Keep a reach of ≥ 8 m of open water in front of the main fishing spot.
- Every placed thing is `{x, z, facing}` with facing in radians (0 = toward +z, positive turns toward +x).
- The casino gate is `gate` (an arch; players pass through it). Its arrival spot is just inside it. Posters hang 5.2 m either side.
- Spawn is where new players appear; camera yaw there should look at the water with the town behind.

## What great looks like (the judge's rubric)
1. **First 10 s:** from spawn, the lake/mountain view is clean and the first cast is obvious. Turn around: the town reads as one
   cozy place and the shop + smokehouse are visible from the foot of the pier.
2. **Hub legibility:** core services (shop, smokehouse, boards, mirror) within one glance and a short walk of the pier's foot; the
   gate is a landmark you can see from the hub; the harbour is near the loop for endgame players.
3. **Loop tightness:** pier end → shop → smokehouse → back on the pier is the everyday loop; aim under ~15 s of walking total,
   no backtracking through clutter.
4. **Cozy density:** pockets with purpose (a square, a campfire cove, a beach, a quay) rather than a scatter; props never on walking lines.
5. **Lake framing:** the shore shape gives silhouettes (a cove, a point, a rock, reeds, a far jetty) without blocking casts; the
   fishing spot still looks out at open water and mountains.
6. **Night:** lamps lead from the pier to the hub and gate; the gate glows as the back-of-town landmark; ≤ 8 point lights.
7. **Distinctiveness:** this must feel like a real update, not the same map shuffled.
8. **Buildable:** respects the ground rules above; nothing in water that shouldn't be; walks (NPC loops) stay on land.

## Deliverables (write them into the folder you are told to use)
1. `<name>.json`: the layout in the schema of `current.json`. Required keys: `name`, `notes`, `shore`, `pad`, `square`, `docks`,
   `paths`, `houses` (6, with `sign` on three), `spots` (ids: spawn, dock_end, shop, smokehouse, gate, leaderboard, mirror, campfire,
   worms, reed, plane, charters_sign, furthest; use `facing` where it matters), `props`, `npcs` (with `walk` stops for Salty, Pip,
   Wren), `bottles` (7), `sightlines` (the 2-4 views you want the judge to notice). Prop kinds the renderer knows: lamp, lit-lamp
   (counts as a point light), tree, bench, rack, boat, flowers, rock, firepit, string-lights (z, x0, x1), fence (x0,z0,x1,z1),
   blanket, pot, logs, bridge (x0,z0,x1,z1), lily-pads, reeds, custom (w, d, facing, label; for anything new, e.g. "pergola").
2. Render it: `node plan.mjs <name>.json <name>.svg --metrics` then `node svg2png.mjs <name>.svg <name>.png` (both scripts live in
   this folder; run them from this folder). **Look at the PNG** (Read tool) and fix what reads badly. The metrics print walk
   distances, counts and validity warnings (WATER = something placed in water; docks need corners over water). Iterate until it is
   clean and you are proud of it.
3. `<name>.md` (≤ 600 words): concept in 3 sentences; the first minute of a new player (what they see at spawn, when they turn
   around, where they go); the everyday loop with walk times; where each required piece went and why; the night plan (which lamps
   are lit, what glows); what is new or different from today; what it costs (prop/light counts vs today; any new mesh kinds);
   risks or things the judge should push back on; and 3 "hero views" as `{x, z, yaw, note}` the owner could stage in-engine.
