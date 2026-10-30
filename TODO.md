# TODO

Finished items move to [DONE.md](DONE.md).

🎨 taste-driven: ask or propose options before coding · 📋 larger: propose a plan before editing · 💬 asked for by players (`/idea`, `/bug`)

## Up next

- [ ] Cosmetics preview starts on what the player is wearing, most noticeable at the cosmetics stall by the dock and the Casino Cove Prize Counter
  - Opening either shop picks the first cosmetic you don't own (`cosShopHtml`, `src/game/game.ts:3293`) and `previewLook` (`game.ts:2869`) puts it on the spinning character, so the preview shows an outfit you aren't wearing. Show your current look until you click or hover a tile (`tryOn`, `game.ts:1204`, already restores it on mouse-out), and decide what the detail panel shows before anything is picked (e.g. a worn item, or a "pick an item" hint)

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
- The first click or touch stalls about 200 ms in headless Chrome while `audio.start()` makes the `AudioContext` (`AudioOutputDevice::GetOutputDeviceInfo`, a synchronous call). It could be made at load (it starts suspended) and only resumed in the click, if real devices show the same stall
- Shader programs that still compile on first use, because their objects aren't in the scene until later: fish models (`buildFish`, first catch or another player holding one), held items when switching hotbar slots, drops, and the join screen's character preview (its own WebGL context, ~1 s on SwiftShader before the notice is even dismissed). Hidden stand-ins in the scene, like the one `Avatars` keeps for `World.prewarm`, would cover the in-world ones
- 🎨 The load-hitching fix moved all shader compiling behind the join screen, so on a slow phone the join screen freezes once for longer (SwiftShader: ~3 s of compiling became ~6 s there, and none after joining). If that's noticeable on real phones, the compile could be spread over several frames, or the warm-up draw skipped where the browser compiles fully at link time
- Returning players don't get the full load-hitching fix: their join card hides as soon as the server answers the auto-join (`fishing-auto`, `Game.finishJoin`), often before the background `compileAsync` (`World.prewarm`) is done, and `holdForShaders` only holds while `#join` is up, so the first frames in game still wait on the shaders left. No worse than before, and `warmDraw` still covers what's out of view. Measure with `npm run bench:load` on an auto-join, then e.g. keep the join card up ("Loading…") until the prewarm finishes

### Gameplay and UI

- The cosmetics stall and the Casino Cove Prize Counter tiles still swap the price for "Owned" / "Wearing" / "🔒 Locked" (`cosShopHtml` and the perk tiles in `casinoHtml`, `src/game/game.ts`); they could show the price above the status the same way the rod and bait tiles now do
- 📋 Smokehouse: turn fish into timed buffs, an endgame sink that never runs out and keeps every fish tier useful. The Smokehouse is only a sign on a cottage today (`src/data/maps.ts:137`). Hand in fish for smoked goods that give 10-minute buffs (better shiny odds, easier reels, longer night bite, better luck at one tier), with recipes that ask for specific species, tiers or 🌙 fish (e.g. "3 Lantern Eels + any Jewel fish"). Needs decisions first: which buffs, whether they stack with the casino perks (`activePerks`, `src/game/economy.ts:190`) and the Shiny Lure, how long they last, and whether the timer runs while offline. The server applies them in `rollCast` (`economy.ts:358`)
- 📋 Deep-water charters: an endless depth ladder for players who have every rod and bait. Captain Reed (`src/data/maps.ts:209`) sells boat trips to Depth 1, 2, 3… with no last depth; each depth raises fish stamina, fight difficulty, value and shiny odds, and landing a fish there unlocks the next. A "Deepest Charter" board shows each player's record. Needs decisions first: a new map or a boat spot on the lake, what a charter costs, and how fights keep getting harder (the surge and pull terms in `src/game/reel.ts:77-96` are capped around difficulty 2.5, so deeper water needs another lever such as stamina or snap speed). A record board needs a server-side check on catches, since reel results are trusted from the client today

### Casino

- A Shiny Lure charge is spent when the fish bites (`rollCast`, `src/game/economy.ts`), so a shiny that snaps the line or gets away still uses one up. Maybe refund the charge when the catch fails, or only spend it on a landed fish (the server would have to track that the hooked fish came from the lure)
- 🎨 Blackjack hand history or per-player stats (hands, wins, dealer blackjacks) so players can check their luck against the real odds. Players have complained of "rigged" bad luck, but a 2M-hand simulation (2026-10-21) showed the deal is fair (dealer natural 4.84%, theory 4.83%). Each account already keeps its own biggest win and loss (`Account.casino`, `server/accounts.ts`), which a stats panel could show
- 🎨 Announce a broken casino record in chat ("🎰 Ann just won 12,000 🪙 at blackjack, a casino record!"), a server-wide `sys` line from `Room.gambled` (`server/room.ts`). Left out of the record board because blackjack settles on the server the moment the last card is drawn, so with a paced client-side reveal the line could spoil the hand for the player; send it after the reveal or delay it by the deal's length

### World, NPCs and visuals

- 🎨 Townsfolk follow the day: head indoors at night (Granny Wren to her cottage) or gather at the campfire; their walks could take a different loop after dark (`nightLines` already exists for talk)
- 🎨 Level 3 of the visual polish options (https://claude.ai/artifact/4rfm9mFjxTXaYms9thDuUc): a soft foam line just offshore and lighter shallows (a baked shore-distance texture read by the water shader), small round bushes along the shore and hillsides, slightly richer greens. Each piece could ship on its own
- 🎨 Shoreline rocks, flower pots and log piles have no colliders, so players walk through them. Decide whether that's intended

### Accounts and server

- 📋💬 Change your player name (from `/idea`, Oscar C, 2026-10-29, asked for together with the log out/in item, now done). Needs decisions first: uniqueness (the new name must also pass `rudeName`, `server/chat.ts`, like a new claim in `AccountStore.auth`), how often it can be changed, and what happens to leaderboard entries, the 💗 supporter mark and passwords, which are all keyed by name today
- Chat masks some innocent words that names now let through: `censor` (`server/chat.ts`) still stars "Scunthorpe", "Yoshitaka", "shiitake" and "fishit", since only `rudeName` skips the `NAME_SAFE` list. Passing that list to `rude` in `censor` too would fix them
- 🎨 Name filter gaps: a rude word run into other letters with no capital or digit between them ("bigdickfisher", "BIGDICK") isn't caught, since whole-word ones (`WORDS`, `server/chat.ts`) only match a whole piece so "Hancock" and "Dickens" pass. Options: match the longer whole-word ones ("asshole", "bastard", "wanker") anywhere in names, or a short list of known compounds. A dev command to rename an existing rude account would also help, since old accounts keep their names
- 📋 The server takes `pos` updates on trust (no speed or distance check), so a modified client can stand at any counter or table. Every vendor/table range check depends on it

### Mobile

- 🎨 Chat on a real phone: check it's readable (`body.touch #chat`, `src/style.css:468`, under the scaled 1400px layout) and that new messages get noticed beyond the full-strength flash every new line now gets, e.g. an unread badge on the 💬 button (`src/game/touch.ts:50`). Split off the "easier to notice" chat item (2026-10-30)
- 📋 Full mobile support, building on the touch test build and the mobile spec (https://claude.ai/artifact/KV18eWyPMNJYvD8yJdvTHv): answer the spec's five open decisions first, then full-screen menus with tap-to-select and a detail bar instead of hover tooltips, quick-chat chips, long-press to drop, and touch wording in the remaining key/click text (casino table hints, toasts like "Hold a fish (1-5)"). Remove the FPS readout (dev-only today) and decide whether touch mode should skip the desktop-only notice
