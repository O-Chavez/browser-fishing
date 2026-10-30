# TODO

Finished items move to [DONE.md](DONE.md).

🎨 taste-driven: ask or propose options before coding · 📋 larger: propose a plan before editing · 💬 asked for by players (`/idea`, `/bug`)

## Up next

- [ ] Hitching for the first few seconds after load, very noticeable on phones. Likely shader programs compiling on first draw rather than textures (most textures are generated in code); `renderer.compileAsync(scene, camera)` behind the join screen could hide it. Measure before fixing
- [ ] 💬 Make the day/night cycle follow the server's clock, not each device's clock: players reported some saw night while others saw day at the same moment
  - Likely cause: each client draws the sky from its own device clock (`dayFraction(Date.now() / 1000)` in `World.updateDaylight`, `src/game/world.ts:390`), and a day lasts only 10 minutes (`DAY_SECONDS`, `src/game/daynight.ts`), so a phone clock off by a minute or two shifts its whole cycle. The server already decides night bites from its own clock (`server/room.ts:493`), so a skewed client can also show night while the server rolls day fish. Fix: the server sends its time (or the day fraction) on join and now and then, and the client uses that offset instead of its own clock
  - Also check the dev `/time` override (`m.dayFrac` in `server/room.ts`, `dayOverride` set in `src/game/game.ts:285`) only affects the player who typed it, and that it stays obvious when it's on
- [ ] Use the HUD's gold coin everywhere a price or coin amount is shown, in the shops and the rest of the UI
  - The top-left coin count draws a CSS coin (`.coin`, `src/style.css:59`, with `.sm`/`.xs` sizes), but most prices use the 🪙 emoji instead (about 34 places: `src/game/game.ts` shop, bag and casino tiles and detail panels, `casino.ts`, `tips.ts`), which looks different on every platform. Swap the HTML ones for the `.coin` span at a size that sits on the text line
  - Plain-text spots can't hold a span: toasts (e.g. the catch toast, `game.ts:316`), chat lines, and the canvas-drawn Top Anglers board (`hub.ts:438`). Decide per spot: draw a matching coin on the canvas, allow HTML in toasts, or keep the emoji there
- [ ] 🎨 Show when a Shiny Lure is on, and let players turn it off in the Bag
  - Today a bought lure is always on: the server spends a charge on the next cast that hooks a fish (`rollCast`, `src/game/economy.ts:362`), and the only sign is a line under "Charms & perks" in the Bag (`activePerks`, `economy.ts:202`; `perksHtml`, `src/game/game.ts:2879`). Add something visible while fishing, e.g. "✨ Shiny Lure on · 2 casts left" near the hotbar or HUD; propose the look first
  - An on/off toggle on the lure in the Bag, so players can save charges for a better fish. Store it in the save (`SaveData`, `src/game/state.ts:48`) and have the server check it in `rollCast`, not just the client
- [ ] 🎨 Improve the welcome screen, and let players know there they can log out or switch accounts, without making it overbearing
  - The welcome-back banner (`Game.welcome`, `src/game/game.ts:519`; text from `welcomeText`, `src/game/progression.ts:163`) shows for 4.2 s with the level, coins and next goal, plus a 🔒 password nudge from level 3. Logging out lives only in ⚙️ Settings > Account ("Log in as a different account…", finished item in DONE.md), and the join card's "Not you? Switch account" link (`#join-switch`, `index.html:99`) only shows when the browser remembers a name
  - E.g. a small "Not you? Switch account in ⚙️ Settings" line on the banner, a one-time tip, or a quiet link on the join card. Taste-driven: ask what else should change on the welcome screen, then propose options

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

- The cosmetics stall and the Casino Cove Prize Counter tiles still swap the price for "Owned" / "Wearing" / "🔒 Locked" (`cosShopHtml` and the perk tiles in `casinoHtml`, `src/game/game.ts`); they could show the price above the status the same way the rod and bait tiles now do
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

- 📋💬 Change your player name (from `/idea`, Oscar C, 2026-10-29, asked for together with the log out/in item, now done). Needs decisions first: uniqueness (the new name must also pass `rudeName`, `server/chat.ts`, like a new claim in `AccountStore.auth`), how often it can be changed, and what happens to leaderboard entries, the 💗 supporter mark and passwords, which are all keyed by name today
- Chat masks some innocent words that names now let through: `censor` (`server/chat.ts`) still stars "Scunthorpe", "Yoshitaka", "shiitake" and "fishit", since only `rudeName` skips the `NAME_SAFE` list. Passing that list to `rude` in `censor` too would fix them
- 🎨 Name filter gaps: a rude word run into other letters with no capital or digit between them ("bigdickfisher", "BIGDICK") isn't caught, since whole-word ones (`WORDS`, `server/chat.ts`) only match a whole piece so "Hancock" and "Dickens" pass. Options: match the longer whole-word ones ("asshole", "bastard", "wanker") anywhere in names, or a short list of known compounds. A dev command to rename an existing rude account would also help, since old accounts keep their names
- 📋 The server takes `pos` updates on trust (no speed or distance check), so a modified client can stand at any counter or table. Every vendor/table range check depends on it

### Mobile

- 🎨 Chat on a real phone: check it's readable (`body.touch #chat`, `src/style.css:468`, under the scaled 1400px layout) and that new messages get noticed beyond the full-strength flash every new line now gets, e.g. an unread badge on the 💬 button (`src/game/touch.ts:50`). Split off the "easier to notice" chat item (2026-10-30)
- 📋 Full mobile support, building on the touch test build and the mobile spec (https://claude.ai/artifact/KV18eWyPMNJYvD8yJdvTHv): answer the spec's five open decisions first, then full-screen menus with tap-to-select and a detail bar instead of hover tooltips, quick-chat chips, long-press to drop, and touch wording in the remaining key/click text (casino table hints, toasts like "Hold a fish (1-5)"). Remove the FPS readout (dev-only today) and decide whether touch mode should skip the desktop-only notice
