# TODO

Finished items move to [DONE.md](DONE.md).

🎨 taste-driven: ask or propose options before coding · 📋 larger: propose a plan before editing · 💬 asked for by players (`/idea`, `/bug`)

## Up next

- [ ] 💬 Other players' catch alert shows the base value, not the charm-boosted one (from `/idea`, Oscar C, 2026-10-29). The server's `hold` act (`Room.land`, `server/room.ts:512`) sends only fish, size and shiny, and the toast (`onAct`, `src/game/game.ts:304`) uses plain `sellValue`, while the catch itself stores `mult: 1 + charmBonus` (`applyCatch`, `src/game/economy.ts:392`). Send the multiplier (or the final value) in the act and show that
- [ ] 💬 Show rod prices in the shop even when the rod is owned or still level-locked (from `/idea`, Oscar C, 2026-10-29). The tile label in `gearShopHtml` (`src/game/game.ts:3034`) replaces the price with "Owned" or "🔒 Lv N"; show the price alongside those instead, and check the bait tiles and the Bag tiles (`game.ts:2802`) the same way
- [ ] 🎨💬 NPCs wander too far and end up on top of players, "kind of jump scares" (from `/idea`, Oscar C, 2026-10-29). Probably the walk-on rule in `NpcWalker` (`src/game/npcwalk.ts`): after 10 s beside a player who stays put they walk on, and since NPCs are walk-through their route can pass straight through the player (e.g. Old Salty on the pier). Options: shorter routes, re-route or wait instead of passing within ~1.5 m of a player, or keep them stopped while someone is fishing nearby
- [ ] 🎨💬 Make night slightly brighter overall so it's easier to see, while keeping the cozy feel (from `/idea`, Oscar C, 2026-10-29). Night ambient/sky levels live in `World.updateDaylight`; taste-driven, so propose a few brightness levels side by side first
- [ ] 🎨 Make new chat messages easier to notice, including on mobile
  - The chat sits at 50% opacity while not typing (`#chat`, `src/style.css:91`) and a new line just appears (`ChatBox.add`, `src/game/chatbox.ts:157`), so it's easy to miss. Ideas: briefly show a new line at full opacity or with a highlight/slide-in that fades back, maybe a soft sound for messages from other players. Taste-driven: propose options first
  - Touch mode: check the chat is readable on a real phone (`body.touch #chat`, `style.css:449`, under the scaled 1400px layout) and that new messages get noticed, e.g. an unread badge on the 💬 button (`src/game/touch.ts:47`)
- [ ] 🎨 Feedback discoverability: today the only pointer to `/bug` and `/idea` is the chat input placeholder. A Bug/Idea button (settings tab or pause menu) would reach players who never open chat. Taste-driven: propose options first
- [ ] Hitching for the first few seconds after load, very noticeable on phones. Likely shader programs compiling on first draw rather than textures (most textures are generated in code); `renderer.compileAsync(scene, camera)` behind the join screen could hide it. Measure before fixing

## Ideas

<!-- Add new ideas under the matching area. Move one into Up next when you decide to do it. -->

### Bugs and tooling

- The bench scenes have no high-tier fish, so they can't measure the fish tier effects
- Dev console `/tips` command to clear the new-player tips list for testing: a new case in `server/dev.ts` that empties the player's saved `tips` (marked by `markTip`, `src/game/tips.ts`), so the tips show again
- `npm run ideas`: read `/idea` and `/bug` reports from the Discord feedback channel and add new ones to Ideas (skipping ones already there), instead of pasting them in by hand. The feedback webhook can only post, so this needs a separate read-only bot: a private app in the Developer Portal with Message Content Intent on, added with only View Channels + Read Message History (optionally only on the feedback channel), read with `GET /channels/<id>/messages` and `Authorization: Bot <token>`. Token and channel id go in the local `.env` (gitignored), not Render. Setup stalled on "Private application cannot have a default authorization link" (2026-10-29): set Installation > Install Link to None and save first, then turn Public Bot off

### Performance

- 🎨 Fewer real point lights: cutting them from 8 to 4 was ~20% faster but visibly darkened night streets and the casino ceiling. Outdoors, the night glow pools (`src/game/nightglow.ts`) now stand in for far lamps, so a lower cap might look fine there; the casino chandeliers would need pools of their own
- Building the pond map blocks for ~80 ms when travelling there; could be cached or split across frames
- Per-frame garbage: `World.updateDaylight` allocates about 12 `THREE.Color`s a frame and the `World.colliders` getter rebuilds a ~500-entry array a frame. Cache both (benchmark before/after)
- Shadows cost 3-6 ms per frame at the old resolution; fewer shadow casters/receivers on small props could help weaker GPUs

### Gameplay and UI

- 🎨📋💬 Dedicated rod and bait slots in the hotbar: same total number of slots, but two are always the rod and the bait, so fish can't crowd them out (from `/idea`, Oscar C, 2026-10-29). Today every slot holds a rod, a fish or a bait stack (`src/game/state.ts:10-15`, `renderHotbar`, `src/game/game.ts:2623`). Needs decisions first: how the two slots look and where they sit, what happens to a save holding several rods or bait types in the hotbar (move extras to the tackle locker?), and how scroll/number-key selection and the active bait (`eco.activeSlot`) work with them
- 📋 Smokehouse: turn fish into timed buffs, an endgame sink that never runs out and keeps every fish tier useful. The Smokehouse is only a sign on a cottage today (`src/data/maps.ts:137`). Hand in fish for smoked goods that give 10-minute buffs (better shiny odds, easier reels, longer night bite, better luck at one tier), with recipes that ask for specific species, tiers or 🌙 fish (e.g. "3 Lantern Eels + any Jewel fish"). Needs decisions first: which buffs, whether they stack with the casino perks (`activePerks`, `src/game/economy.ts:190`) and the Shiny Lure, how long they last, and whether the timer runs while offline. The server applies them in `rollCast` (`economy.ts:358`)
- 📋 Deep-water charters: an endless depth ladder for players who have every rod and bait. Captain Reed (`src/data/maps.ts:209`) sells boat trips to Depth 1, 2, 3… with no last depth; each depth raises fish stamina, fight difficulty, value and shiny odds, and landing a fish there unlocks the next. A "Deepest Charter" board shows each player's record. Needs decisions first: a new map or a boat spot on the lake, what a charter costs, and how fights keep getting harder (the surge and pull terms in `src/game/reel.ts:77-96` are capped around difficulty 2.5, so deeper water needs another lever such as stamina or snap speed). A record board needs a server-side check on catches, since reel results are trusted from the client today

### Casino

- 🎨💬 Make gambling feel more suspenseful; today it "feels a bit disconnected" (from `/idea`, Oscar C, 2026-10-29). Taste-driven: first ask which games and moments feel flat, then propose options (e.g. a slower reveal, a short drumroll before the result, camera or sound cues on the big moment)
- 🎨💬 Casino scoreboard for the biggest win and biggest loss in a single hand or spin (from `/idea`, Oscar C, 2026-10-29), maybe a board on the casino wall like Top Anglers (`buildLeaderboard`, `src/game/hub.ts:384`). Decide whether it's all-time or daily, and record results on the server where hands settle (`Room.bjAct`, `server/room.ts`), not from the client. Pairs well with the hand-history item below
- 🎨 Blackjack hand history or per-player stats (hands, wins, dealer blackjacks) so players can check their luck against the real odds. Players have complained of "rigged" bad luck, but a 2M-hand simulation (2026-10-21) showed the deal is fair (dealer natural 4.84%, theory 4.83%)

### World, NPCs and visuals

- 🎨 Townsfolk follow the day: head indoors at night (Granny Wren to her cottage) or gather at the campfire; their walks could take a different loop after dark (`nightLines` already exists for talk)
- 🎨 Level 3 of the visual polish options (https://claude.ai/artifact/4rfm9mFjxTXaYms9thDuUc): a soft foam line just offshore and lighter shallows (a baked shore-distance texture read by the water shader), small round bushes along the shore and hillsides, slightly richer greens. Each piece could ship on its own
- 🎨 Shoreline rocks, flower pots and log piles have no colliders, so players walk through them. Decide whether that's intended

### Accounts and server

- 📋💬 Change your player name (from `/idea`, Oscar C, 2026-10-29, asked for together with the log out/in item, now done). Needs decisions first: uniqueness and the profanity filter, how often it can be changed, and what happens to leaderboard entries, the 💗 supporter mark and passwords, which are all keyed by name today
- 🎨 Profanity filter: nothing filters names (on join or, once it exists, on rename) or chat today. Decide on a word list and where it applies (names only, or chat too), then check it in `parse` (`server/accounts.ts`) and the chat gate (`server/chat.ts`)
- 📋 The server takes `pos` updates on trust (no speed or distance check), so a modified client can stand at any counter or table. Every vendor/table range check depends on it

### Mobile

- 📋 Full mobile support, building on the touch test build and the mobile spec (https://claude.ai/artifact/KV18eWyPMNJYvD8yJdvTHv): answer the spec's five open decisions first, then full-screen menus with tap-to-select and a detail bar instead of hover tooltips, quick-chat chips, long-press to drop, and touch wording in the remaining key/click text (casino table hints, toasts like "Hold a fish (1-5)"). Remove the FPS readout (dev-only today) and decide whether touch mode should skip the desktop-only notice
