# TODO

Finished items move to [DONE.md](DONE.md).

🎨 taste-driven: ask or propose options before coding · 📋 larger: propose a plan before editing · 💬 asked for by players (`/idea`, `/bug`)

## Up next

- [ ] 🎨 Make new chat messages easier to notice, including on mobile
  - The chat sits at 50% opacity while not typing (`#chat`, `src/style.css:91`) and a new line just appears (`ChatBox.add`, `src/game/chatbox.ts:157`), so it's easy to miss. Ideas: briefly show a new line at full opacity or with a highlight/slide-in that fades back, maybe a soft sound for messages from other players. Taste-driven: propose options first
  - Touch mode: check the chat is readable on a real phone (`body.touch #chat`, `style.css:449`, under the scaled 1400px layout) and that new messages get noticed, e.g. an unread badge on the 💬 button (`src/game/touch.ts:47`)
- [ ] 💬 Log out of a password-free account and log in as another one
  - E.g. a player who started a throwaway account on one device wants to switch to their main account there. Today "Log out of this device" only appears once a password is set (`acctForm` in `src/game/game.ts:2971-2974`) and the server refuses `forget` without one (`server/index.ts:252`), so the only way to switch is clearing site data
  - Add a "Log in as a different account" option in ⚙️ Settings > Account for every account, leading to the join screen (name + password). For a password-free account, warn clearly that it can't be got back after logging out (or offer to set a password first)
  - Also asked for in-game via `/idea` (Oscar C, 2026-10-29), together with changing your name (Ideas > Accounts and server)

## Ideas

<!-- Add new ideas under the matching area. Move one into Up next when you decide to do it. -->

### Bugs and tooling

- `npm run smoke` fails "pond night: town lamps lit, lanterns and windows drawn" on `main` (seen 2026-10-22). Probably since the night glow made real lights fade in: the check reads `intensity > 1` only 600 ms after switching to night. Fix the check (or the fade) so smoke is green again
- The bench scenes have no high-tier fish, so they can't measure the fish tier effects
- `npm run build` only type-checks `src/` (tsconfig `include`), so type errors in `server/` go unnoticed. The two that had piled up were fixed in the bug sweep (2026-10-21), but nothing stops new ones
- Dev console `/tips` command to clear the new-player tips list for testing: a new case in `server/dev.ts` that empties the player's saved `tips` (marked by `markTip`, `src/game/tips.ts`), so the tips show again
- `npm run ideas`: read `/idea` and `/bug` reports from the Discord feedback channel and add new ones to Ideas (skipping ones already there), instead of pasting them in by hand. The feedback webhook can only post, so this needs a separate read-only bot: a private app in the Developer Portal with Message Content Intent on, added with only View Channels + Read Message History (optionally only on the feedback channel), read with `GET /channels/<id>/messages` and `Authorization: Bot <token>`. Token and channel id go in the local `.env` (gitignored), not Render. Setup stalled on "Private application cannot have a default authorization link" (2026-10-29): set Installation > Install Link to None and save first, then turn Public Bot off

### Performance

- 🎨 Fewer real point lights: cutting them from 8 to 4 was ~20% faster but visibly darkened night streets and the casino ceiling. Outdoors, the night glow pools (`src/game/nightglow.ts`) now stand in for far lamps, so a lower cap might look fine there; the casino chandeliers would need pools of their own
- Building the pond map blocks for ~80 ms when travelling there; could be cached or split across frames
- Per-frame garbage: `World.updateDaylight` allocates about 12 `THREE.Color`s a frame and the `World.colliders` getter rebuilds a ~500-entry array a frame. Cache both (benchmark before/after)
- Shadows cost 3-6 ms per frame at the old resolution; fewer shadow casters/receivers on small props could help weaker GPUs
- Hitching for the first few seconds after load, very noticeable on phones. Likely shader programs compiling on first draw rather than textures (most textures are generated in code); `renderer.compileAsync(scene, camera)` behind the join screen could hide it. Measure before fixing

### Gameplay and UI

- 💬 Show rod prices in the shop even when the rod is owned or still level-locked (from `/idea`, Oscar C, 2026-10-29). The tile label in `gearShopHtml` (`src/game/game.ts:3034`) replaces the price with "Owned" or "🔒 Lv N"; show the price alongside those instead, and check the bait tiles and the Bag tiles (`game.ts:2802`) the same way
- 🎨 Feedback discoverability: today the only pointer to `/bug` and `/idea` is the chat input placeholder. A Bug/Idea button (settings tab or pause menu) would reach players who never open chat. Taste-driven: propose options first

### Casino

- 🎨💬 Make gambling feel more suspenseful; today it "feels a bit disconnected" (from `/idea`, Oscar C, 2026-10-29). Taste-driven: first ask which games and moments feel flat, then propose options (e.g. a slower reveal, a short drumroll before the result, camera or sound cues on the big moment)
- 🎨 Blackjack hand history or per-player stats (hands, wins, dealer blackjacks) so players can check their luck against the real odds. Players have complained of "rigged" bad luck, but a 2M-hand simulation (2026-10-21) showed the deal is fair (dealer natural 4.84%, theory 4.83%)

### World, NPCs and visuals

- 🎨💬 NPCs wander too far and end up on top of players, "kind of jump scares" (from `/idea`, Oscar C, 2026-10-29). Probably the walk-on rule in `NpcWalker` (`src/game/npcwalk.ts`): after 10 s beside a player who stays put they walk on, and since NPCs are walk-through their route can pass straight through the player (e.g. Old Salty on the pier). Options: shorter routes, re-route or wait instead of passing within ~1.5 m of a player, or keep them stopped while someone is fishing nearby
- 🎨💬 Make night slightly brighter overall so it's easier to see, while keeping the cozy feel (from `/idea`, Oscar C, 2026-10-29). Night ambient/sky levels live in `World.updateDaylight`; taste-driven, so propose a few brightness levels side by side first
- 🎨 Townsfolk follow the day: head indoors at night (Granny Wren to her cottage) or gather at the campfire; their walks could take a different loop after dark (`nightLines` already exists for talk)
- 🎨 Level 3 of the visual polish options (https://claude.ai/artifact/4rfm9mFjxTXaYms9thDuUc): a soft foam line just offshore and lighter shallows (a baked shore-distance texture read by the water shader), small round bushes along the shore and hillsides, slightly richer greens. Each piece could ship on its own
- 🎨 Shoreline rocks, flower pots and log piles have no colliders, so players walk through them. Decide whether that's intended

### Accounts and server

- 📋💬 Change your player name (from `/idea`, Oscar C, 2026-10-29, asked for together with the log out/in item in Up next). Needs decisions first: uniqueness and the profanity filter, how often it can be changed, and what happens to leaderboard entries, the 💗 supporter mark and passwords, which are all keyed by name today
- 📋 The server takes `pos` updates on trust (no speed or distance check), so a modified client can stand at any counter or table. Every vendor/table range check depends on it

### Mobile

- 📋 Full mobile support, building on the touch test build and the mobile spec (https://claude.ai/artifact/KV18eWyPMNJYvD8yJdvTHv): answer the spec's five open decisions first, then full-screen menus with tap-to-select and a detail bar instead of hover tooltips, quick-chat chips, long-press to drop, and touch wording in the remaining key/click text (casino table hints, toasts like "Hold a fish (1-5)"). Remove the FPS readout (dev-only today) and decide whether touch mode should skip the desktop-only notice
