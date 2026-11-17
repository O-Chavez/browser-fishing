# Community zone: design brief and council rubric

Three rival designs for the community zone of Lakeside, a cozy, first-person, low-poly browser fishing game (three.js,
multiplayer, also played on phones). Each design is a top-down plan drawn on the real map plus a write-up. A council of
five judges votes on each. Only designs that every judge passes go to Oscar, the owner.

## Why this is being redone

A first community area was built on 2026-11-16: a fire ring, a lawn with benches and string lights, a pond. Oscar
turned it down. In his words it had no centrepiece, did not match the town, had nothing to do yet, and "did not feel
like a finished location. It should feel like a designed, landscaped, cordoned off where necessary area that players
will want to spend time in." It must "clearly be a fun, cozy community-centric area of the map" and "not feel tacked
on".

## What Oscar decided (2026-11-16)

- **A campfire camp** is the heart, in all three designs.
- **Site:** the designer's choice. Nearby town pieces (lanes, lamps, a board, a tree) may shift to tie it in.
- **Start fresh:** the built ring, lawn and pond are not a constraint.
- **Crowd:** comfortable for 8 to 12 players at once.
- **Every design gives a designed home to:**
  - sitting together (E at a seat sits you down; others see it);
  - the campfire band (each seat at the fire has an instrument; sitting there adds its part to the town's tune);
  - skipping stones (hold and release like a cast at a shore, count the skips, a sign keeps today's best);
  - fireworks (buy a rocket for coins, it goes up over the water for everyone on the map);
  - the boards: Lake Legends and Deep Sea (each player's best catch from that water), Thank You (supporters), and room
    for a Weekly Derby board later;
  - a host with a stall: a new townsperson who runs the camp and sells the rockets;
  - trophies and keepsakes: things that mark it as the anglers' own place.
- Not wanted as the heart: a bandstand green, a party deck, a lodge. Tents and lean-tos were offered and not picked.

## The game's look and what already exists to build with

Pastel sky, warm low-poly wood, pastel clapboard houses, cobbled lanes, white picket fences round house gardens,
lantern posts, string lights, flower beds and pots, benches, a stone seat wall with a plank top, log seats, a timber
sign arch (Captain Reed's CHARTERS arch), small counter stalls (Marlow's BAIT & TACKLE shack, Mags's Smokehouse),
boards on two posts under a little roof, fish models (hung at Marlow's), woodpiles, barrels, crates, a rowboat,
fish-drying racks, walkable timber docks. New kinds of prop are fine when they are a few boxes and cylinders (a hedge,
a rope rail, a carved totem, a rocket rack, a brazier, flat stones). No new textures or shaders.

The town today: players spawn on a pier in a cove, fish from it, and walk back to a quay with Marlow's stall and the
Smokehouse, then up a street to a well square and the casino gate. Captain Reed's wharf is on the cove's west side. A
small campfire with the Top Anglers and Thank You boards stands on the east headland across the cove; the map rework's
judges called that fire, seen across the water from the jetty bench, the best pocket in town.

## Engine limits a design must respect

- Ground can be levelled (a round or boxed floor, built up or cut into a slope, with a bank or a retaining wall), a
  pond can be dug, and docks are axis-aligned timber rectangles over water. The terrain mesh is coarse (a point every
  1 to 1.7 m), so steps and tiers smaller than a metre across are built as props, not ground.
- Only the eight lights nearest the player cast light. Glowing bulbs, lanterns and fires that don't cast light are free.
- The forest is planted from one random stream: removing a forest tree reshuffles the rest, so designs keep the forest
  trees that stand there. The two pines on the east headland are hand-placed and may move.
- Characters are a capsule and a head: no arms or legs. Sitting is a squat on the seat.
- Walk speed 4.2 m/s (sprint 7). A touch player needs paths at least 1.6 m wide and prompts that don't overlap: only
  the nearest prompt shows, so two things to press should stand 2.5 m or more apart.
- Added for round 2: a prompt can be made to need the player to face its thing (the casino's exit does this, within
  60 degrees). The designs use it for seats, boards and the stall, so a board is offered when you face the board and
  "Sit down" when you face the seat. Two things in the same direction still need their 2.5 m.

## The rubric

Score each from 1 to 5.

1. **Centrepiece.** One thing says "this is the place", from 20 m and at night.
2. **Belongs to the town.** It uses the town's materials and habits and is tied into its lanes. Not a park bolted on.
3. **Finished and cordoned.** Clear edges and entrances, landscaped, no leftover ground. Every edge is a decision.
4. **Cozy.** Enclosure, warmth, human scale, light.
5. **Community.** Eight to twelve players gather in one circle, facing each other, with reasons to linger together.
6. **Things to do.** Sitting, the band, stones, fireworks, the boards, the host and the trophies each have a designed
   home, and none gets in another's way.
7. **Finding it and moving through it.** How a player notices it and reaches it from the pier and the quay; how it sits
   in the daily loop; no dead ends or snags; it works on a phone.
8. **Buildable and cheap.** Within the engine's limits, with the forest untouched and no new lights beyond the eight.

## The vote

A judge votes **COMPLETE** only if they would ship the design as drawn, with polish notes at most: it looks and feels
like a finished, designed place. Otherwise **NOT YET**, with the blocking fixes named. A design passes when all five
judges vote COMPLETE. No score below 4 from a judge who votes COMPLETE.

The five judges, one eye each: a new player in their first week; a social player who comes to hang out with friends;
an endgame player between charters; a phone player on a small touch screen; a level designer and art director.
