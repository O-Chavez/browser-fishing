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
- [x] Remove the bench blocking the path in front of the well in the town square
  - Well benches are placed by `Town.benches()` (`src/game/town.ts:163`). Remove only the one in front of the well and keep the others
- [x] Faces on player models
  - Simple, happy, fun faces
  - Painted texture on the head sphere, on the side the player is looking
  - Optionally A/B against a simple 3D face if it fits the theme better and doesn't cost much performance
  - Random face assigned on account creation; pickable in the wardrobe
  - Existing accounts without a face get a random one at login
- [x] General visual cleanup
  - The HUD shows a lot of unnecessary information; tone it down and remove unneeded elements
  - The 3D world is fine as is
- [x] Polish the menu systems
  - Inventory and shop menus are clumsy and cluttered; improve the flow so it's clear what everything does
- [x] Escape always closes the current menu
  - If any menu is open (inventory, shop, wardrobe, etc.), pressing Escape closes it
- [x] Show a "XXXX has joined" message in chat when a player joins
  - Sent to everyone already on the server, using the joining player's name
- [x] Lower the global chat's opacity when not in chat mode
  - Fade the chat window while the player isn't typing; return to full opacity when they press Enter to open chat mode
- [x] Rework the fish and tiers into a cohesive set
  - Each tier gets a clear identity (Shallows, Sport fish, Lake giants, Jewel fish, Spirit fish) carried through look, name and value
  - Distinct 3D silhouettes and species markings instead of one shared egg body; tier 5 stays recognisably fish; 2D icons match
  - Balance pass: better gear catches fewer low-tier fish, values spread sensibly, bait cost vs earnings checked, catch mixes covered by tests
  - Fishdex and catch card: one-line description, day/night note
  - Keep all fish ids so saves, Fishdex progress and records carry over; show renames before applying
- [ ] Casino game menus/pop-ups block the screen since the UI changes
  - Regression from the menu/HUD polish; casino game panels should stay out of the way of the view
- [ ] Hotbar fish icons show only total value
  - Drop the "x.x" multiplier text on hotbar fish slots and show just the total value
- [ ] Show a prompt in the casino when the player can trade fish for chips
  - A UI hint appears when the player is in range and able to click to trade fish in for chips
- [x] Inventory/wardrobe shows equipped charms and their total buffs
  - List the equipped charms and the summed buffs they give
- [ ] Smaller bait purchase popup, and reconsider the 20-bait cap
  - The shop's purchase popup is too large and blocks the view; it should just say the amount purchased
  - Oscar is fine with holding more than 20 bait unless there's a reason for the limit (`BAIT_STACK` in `src/game/state.ts:11`, covered by `economy.test.ts`)
- [ ] UI sometimes disappears until Escape/Tab is toggled
  - Find the repro first; the UI only comes back after pressing/toggling Escape or Tab
- [ ] Cosmetic rework
  - Change the cosmetics' appearance so they fit the game's theme better. Taste-driven: propose options before coding
- [ ] Join/welcome-back screen
  - Currently joining just shows the inventory; replace it with a proper join/welcome-back screen. Taste-driven: propose options before coding
- [ ] Continue fish rework
  - Higher tiers of fish should be more extreme/special (visually and in size)
- [ ] Add an in game element by the casino teleport that add a popup with a screenshot of the inside of the casino
  - This is nice to show newer players whats waiting for them.

## Ideas

<!-- Add new ideas here. Move them into the checklist when you decide to do them. -->

- Fake "light pools" (cheap glowing decals) under lamps and above casino chandeliers, so fewer real point lights are needed. Cutting real lights from 8 to 4 was ~20% faster but visibly darkened night streets and the casino ceiling
- Building the pond map blocks for ~80 ms when travelling there; could be cached or split across frames
- Shadows cost 3-6 ms per frame at the old resolution; fewer shadow casters/receivers on small props could help weaker GPUs
