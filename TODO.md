# TODO

## Checklist

- [x] Improve performance
  - Merged to `main` (2026-10-19): 23-29% faster rendering in every benchmark scene, original lighting kept. Results in `bench-results/ab-2a42083-vs-13dbd1f.json`
  - Done = a tangible difference is noticed when playing (confirmed by Oscar, 2026-10-19)
- [x] Global chat in the top right
  - Non-intrusive, with a clear hint on how to use it ("Press Enter to chat")
  - Everyone on the server; filterable by world (pond vs casino) with Tab while in chat mode, if needed
  - No history on join: players only see messages sent after they log in (like OSRS)
  - Messages disappear from the chat window after 5 minutes
  - Standard max message length, spam/rate limiting, basic profanity filter
  - Chat bubble above the speaker's head, as long as it isn't obnoxious
- [x] Stop the player getting stuck on dock objects
  - Keep the decorative items sitting on the dock (bucket etc.) for the look, but don't let them block movement
  - Shore objects are fine as they are
  - Also let players walk through the NPCs on that map (they block the path to/from the casino)
- [x] Remove the duplicated set of benches in the town square
  - Bench code lives in several places: `Town.benches()` around the well (`src/game/town.ts`), `Town.buildCozy()` (also `town.ts`), and the fire-pit benches in `src/game/hub.ts`. Confirm in-game which set is the extra one before removing it
- [x] Allow changing inventory slots while sprinting
- [x] Make scroll-wheel slot switching smooth
  - Right now it doesn't respond evenly to scroll movement and feels sticky; each notch/gesture should move one slot consistently
  - Add a slight animation when the highlight moves to a new hotbar slot
- [x] Luck items in the casino shop should read as "caught fish are worth x more"
  - The in-game text currently says "Every fish sells for +X%"
  - Source already says "worth" (commit fa24e73, 2026-10-17), but the built `dist/` bundle still says "sells for", so the running game may be a stale build. Rebuild (and redeploy if the live server is behind) and check before changing any code
- [x] Tab player list should show each player's level instead of their money
- [x] Remove the Town Fund from the game entirely
  - The level-15 casino lock (`CASINO_LEVEL`) is the only gate needed
  - Remove all references and elements: `src/game/fund.ts` + `fund.test.ts`, the HUD/menus (`game.ts`, `index.html`, `style.css`), world props (`town.ts`, `hub.ts`), the `fund` net message (`protocol.ts`, `net.ts`, `server/room.ts`), `goal` fields in `maps.ts`, the save `fund` field (`state.ts`, `accounts.ts`, `server/index.ts`), tests, and `GAME_DESIGN.md`
  - Watch out: the server gate (`server/room.ts:262`) currently checks only the fund, and the level check happens only on the client (`game.ts:887`). Swap in a server-side `CASINO_LEVEL` check, or the casino ends up open to everyone server-side
  - Make sure old saves and stored fund data still load cleanly after the field is removed
- [ ] Remove the bench blocking the path in front of the well in the town square
  - Well benches are placed by `Town.benches()` (`src/game/town.ts:163`). Remove only the one in front of the well and keep the others
- [ ] Faces on player models
  - Simple, happy, fun faces
  - Painted texture on the head sphere, on the side the player is looking
  - Optionally A/B against a simple 3D face if it fits the theme better and doesn't cost much performance
  - Random face assigned on account creation; pickable in the wardrobe
  - Existing accounts without a face get a random one at login
- [ ] General visual cleanup
  - The HUD shows a lot of unnecessary information; tone it down and remove unneeded elements
  - The 3D world is fine as is
- [ ] Polish the menu systems
  - Inventory and shop menus are clumsy and cluttered; improve the flow so it's clear what everything does
  - Escape should always close any open menu

## Ideas

<!-- Add new ideas here. Move them into the checklist when you decide to do them. -->

- Fake "light pools" (cheap glowing decals) under lamps and above casino chandeliers, so fewer real point lights are needed. Cutting real lights from 8 to 4 was ~20% faster but visibly darkened night streets and the casino ceiling
- Building the pond map blocks for ~80 ms when travelling there; could be cached or split across frames
- Shadows cost 3-6 ms per frame at the old resolution; fewer shadow casters/receivers on small props could help weaker GPUs
