# First-Person Fishing Game — Design & Requirements

## 1. Vision

A relaxing, browser-based first-person fishing game. The player stands at water's edge (or in a boat), casts, waits, hooks, and reels in fish. Long-term hooks come from a **progression loop**: catch fish → earn XP and money → level up → unlock better rods, baits, and locations → catch rarer fish → complete the collection.

**Pillars**
- **Cozy and satisfying:** the cast/bite/reel loop feels good and is never punishing.
- **Meaningful progression:** every upgrade opens new fish; gear and location choices matter.
- **Collect them all:** a fish log (Fishdex) drives long-term goals.
- **Instant access:** runs in a modern browser with no install and a short load time.

## 2. Target Platform & Tech (proposed)

| Area | Decision |
|---|---|
| Platform | Desktop browsers (Chrome, Firefox, Safari, Edge); mobile/touch is a stretch goal |
| Rendering | WebGL via **Three.js** (or Babylon.js) |
| Language | TypeScript |
| Build | Vite |
| Audio | Web Audio API (Howler.js optional) |
| Persistence | `localStorage` for MVP; optional backend (accounts, cloud saves, leaderboards) later |
| Data | Fish, bait, rods, and locations defined in JSON/TS data files (no hardcoded content in logic) |

**Performance targets:** 60 FPS on a mid-range laptop with integrated graphics; initial load under 10 MB / 5 seconds on broadband; stylized low-poly art to keep assets small.

## 3. Core Gameplay Loop

1. **Equip:** choose rod, bait, and (optionally) lure.
2. **Aim & cast:** hold mouse to charge power, release to cast. Distance and direction determine the landing spot.
3. **Wait:** the bobber floats. Fish are attracted based on location, time, weather, bait, and cast distance or depth.
4. **Bite:** the bobber dips and a sound/visual cue plays. The player has a short reaction window to **hook** (click).
5. **Reel-in minigame:** a tension meter and a fish-stamina bar. Reel while the fish pulls, keep tension in the safe zone, and ease off when the fish thrashes. Too much tension snaps the line; too little lets the fish escape.
6. **Catch:** the fish is shown with its name, size, weight, rarity, and value. The catch is added to the log and awards XP and money.
7. **Spend and upgrade:** sell fish, buy gear, unlock locations, repeat.

## 4. Progression System

### 4.1 Account level & XP
- XP is earned per catch: `base XP × rarity multiplier × size bonus × first-catch bonus`.
- Level curve is gentle early and steeper later (e.g., XP to next level = `100 × level^1.5`).
- Max level at launch: 50.
- **Level gates** unlock shop items, locations, and quests. The player earns **money**, but **level** controls access, so money alone cannot skip ahead.

### 4.2 Currency
- **Coins:** earned by selling fish, completing quests, and finishing Fishdex milestones. Spent on rods, bait, lures, travel/permits, and cosmetics.
- No real-money transactions in scope.

### 4.3 Gating matrix
Each fish defines its requirements. A fish can only be caught when **all** conditions are met:

| Requirement | Example |
|---|---|
| Location | Deep-sea tuna only in Open Ocean |
| Minimum rod tier | Heavy fish snap light rods |
| Bait / lure type | Predators need live bait; bottom-feeders need worms |
| Conditions (optional) | Time of day, weather, season |
| Water depth / cast distance | Deep fish need long casts and enough line |

If the player lacks a requirement, the fish is never offered. A hint in the Fishdex ("Needs: Heavy rod, Live bait") lets players plan upgrades.

## 5. Content

### 5.1 Rarity tiers
| Tier | Colour | Relative frequency | Value multiplier |
|---|---|---|---|
| Common | Grey | 60% | ×1 |
| Uncommon | Green | 25% | ×2.5 |
| Rare | Blue | 10% | ×6 |
| Epic | Purple | 4% | ×15 |
| Legendary | Gold | 1% | ×50 |

Frequencies are modified by bait quality, rod luck stat, and location.

### 5.2 Locations (unlock by level)
| # | Location | Unlock | Notes |
|---|---|---|---|
| 1 | Starter Pond | Lv 1 | Tutorial, calm, small freshwater fish |
| 2 | Forest Lake | Lv 5 | Bass, perch, trout; day/night cycle matters |
| 3 | River Rapids | Lv 10 | Current affects the reel minigame; salmon, trout |
| 4 | Ocean Pier | Lv 18 | Saltwater species; larger fish |
| 5 | Deep Sea (boat) | Lv 28 | Heavy rods required; tuna, marlin, sharks |
| 6 | Frozen Lake (ice fishing) | Lv 35 | Different cast mechanic; rare cold-water species |
| 7 | Mythic Depths / Hidden Cavern | Lv 45 | Legendary and event fish |

### 5.3 Rods
| Tier | Name | Level | Stats focus |
|---|---|---|---|
| 1 | Twig Rod | 1 | Starting rod; low strength |
| 2 | Fiberglass Rod | 4 | Better line strength |
| 3 | Graphite Rod | 12 | Casting distance, sensitivity |
| 4 | Carbon Pro Rod | 22 | Higher strength and luck |
| 5 | Deep-Sea Rod | 30 | Heavy fish capability |
| 6 | Master / Legendary Rod | 45 | Max stats |

Rod stats: **strength** (max fish weight), **cast distance**, **sensitivity** (bite window length), **luck** (rarity chance), **control** (tension stability).

### 5.4 Bait & lures
- **Worms:** cheap, general freshwater.
- **Insects / flies:** surface feeders, trout.
- **Minnows (live):** predators like bass and pike.
- **Squid / cut bait:** saltwater fish.
- **Special lures (reusable):** attract specific species and add a luck boost.
- **Rare bait:** limited stock or crafted; needed for epic and legendary fish.
- Bait is consumed per cast (or per catch), so there is a steady coin sink.

### 5.5 Fish roster
- **Launch target:** 40–60 species across all locations.
- **MVP target:** about 10–12 species across 2 locations.
- Each fish has: name, description, rarity, locations, required rod tier, bait list, time/weather conditions, size range (min/max), weight range, base value, reel difficulty (stamina, pull pattern), and a model/sprite.
- **Size variance:** each catch rolls a size within the range. Records are tracked per species ("Personal Best").

### 5.6 Fishdex (collection log)
- Silhouettes for undiscovered fish; details revealed on first catch.
- Tracks count caught, biggest size, and first-catch date.
- Completion rewards (coins, cosmetic items) at 25/50/75/100% per location and overall.

### 5.7 Quests & goals
- **Daily/rotating challenges:** "Catch 5 trout", "Catch a fish over 3 kg".
- **Story/milestone quests:** introduce each new location with a small goal.
- Rewards: coins, XP, rare bait.

### 5.8 Economy loop
- Fish sell prices = species base value × tier multiplier × weight factor (0.5× for a species' lightest catch up to 1.5× for its heaviest; weight follows length cubed) × 5 if shiny.
- Shop prices are tuned so each upgrade needs roughly 15–30 minutes of play at the current tier.
- The player can keep a fish for the Fishdex or sell it; the first catch of a species is always recorded.

## 6. Mechanics Details

### 6.1 First-person controls
- **Mouse:** look (pointer lock). **Left click:** cast / hook / reel. **WASD:** walk along the dock or shore within bounds.
- **1–5:** hold that hotbar slot. The held item replaces the rod in your hands: a fish model, or a bait jar; hold the rod to cast. **E:** interact (buy the stall item you are looking at, sell the fish in hand, pick up a drop, talk to the vendor). **G:** drop the item in hand (vanishes after 30 s). **Esc:** closes any open menu, or opens the game menu.
- Accessibility: rebindable keys, adjustable mouse sensitivity, optional simplified reel mode.

### 6.2 Casting
- Charge meter determines distance; the aim reticle shows the landing zone.
- Water depth varies by distance. Some fish only live in deep or shallow zones.

### 6.3 Bite & hook
- A random wait time is drawn from a range that depends on bait match and fish density.
- A bobber animation and sound signal the bite. Hook window is roughly 0.6–1.5 s (modified by sensitivity). Missing it means the fish escapes and bait may be lost.

### 6.4 Reel-in minigame
- The fish has **stamina** and a **pull pattern** (steady, bursts, runs).
- The player holds to reel (tension up, stamina down) and releases to relax. Keeping tension in the green zone drains stamina. Red zone for too long breaks the line (lose the fish and some bait). Fish surge periodically: release to ride out a surge, reel in the gaps.
- **Catch presentation:** the fish dangles from the rod tip on the line (first-person), with a card showing weight (kg, scales with length cubed up to each species' max weight), length, value and XP. Bigger fish of a species are worth more.
- Higher-rarity fish have harder patterns. Rod control and strength widen the safe zone.

### 6.5 Environment
- Day/night cycle and weather (clear, rain, fog) affect which fish bite.
- Ambient audio (water, birds, wind), a soft music track, and satisfying catch/splash sounds.

## 7. UI / UX

- **HUD:** minimal; crosshair, equipped bait, cast power meter, tension meter during reel-in. Level and XP bar are shown at the corner.
- **Catch screen:** fish model/image, stats, rarity glow, XP gained, "New!" and "Personal Best" tags.
- **Menus:** Shop, Inventory/Equipment, Fishdex, Map/Travel (location select with level locks), Quests, Settings.
- **Tutorial:** guided first cast and catch at the Starter Pond.

## 8. Art & Audio Direction

- Stylized low-poly 3D, bright and calm colours, readable water shader with ripples.
- Surfaces get small hand-painted textures drawn in code at load (`src/game/textures.ts`): soft dabs on the ground, wood grain on the dock, siding and shingles on cottages, stone on the well and chimneys. They are near-white and multiply over each material's colour, so the flat-shaded look and palette stay the same; nothing is downloaded.
- Scenery: two rings of snow-capped mountains that take on the sky's haze through the day, a mixed forest of pines and round leafy trees, grass tufts and flower clusters on grassy ground (never on sand, paths or near hidden bottles), and lily pads in the shallows. Lite graphics hides the tufts and flowers.
- Fish are shown as 3D models (swimming silhouettes visible in clear water is a stretch goal).
- Audio: relaxing ambient soundtrack, dynamic tension audio during the reel, distinct bite cue.

## 9. Save System

- Auto-save after each catch, purchase, and level up.
- Saved data: level/XP, coins, inventory, owned and equipped gear, unlocked locations, Fishdex, quest progress, settings.
- Versioned save format with migration support. Export/import save as JSON.

## 10. Scope & Milestones

### MVP (playable vertical slice)
- First-person scene with water, one location (Starter Pond) plus Forest Lake.
- Cast → bite → hook → reel loop.
- ~10 fish, 3 rarities used, 3 rods, 3 baits.
- XP, levels (to ~10), coins, a basic shop, and a simple Fishdex.
- `localStorage` saves.

### Milestone 2 — Progression depth
- All 5 rarity tiers, gating matrix fully enforced, 4–5 locations, 6 rods, full bait set.
- Quests, Fishdex rewards, day/night and weather.

### Milestone 3 — Content & polish
- Boat/deep sea and ice fishing, legendary fish, full 40–60 species roster.
- Audio pass, visual polish, tutorial, settings/accessibility, performance tuning.

### Stretch goals
- Accounts and cloud saves, leaderboards (biggest catch), mobile/touch controls, seasonal events, cosmetics, multiplayer presence at shared lakes.

## 11. Non-Functional Requirements

- **Performance:** 60 FPS target; graceful quality settings (low/med/high).
- **Graphics:** Full or Lite in ⚙ Settings, remembered per browser. Lite turns off sun shadows (and frees the shadow map), grass tufts and flowers, and draws 25% fewer pixels each way. Touch devices start in Lite. If the browser loses the WebGL context (a GPU crash; Chromium then shows a blank "sad canvas" and won't make a new context until a reload), a banner offers a reload, which starts in Lite.
- **Compatibility:** latest two versions of major browsers; WebGL2 required.
- **Accessibility:** colour-blind-safe rarity indicators (icons plus colour), rebindable controls, subtitles for audio cues, simplified reel option.
- **Maintainability:** data-driven content, modular systems (casting, fishing, progression, economy, UI, save), unit tests for progression and loot-table logic.
- **Security/privacy:** no personal data collected in MVP; if accounts are added, follow standard auth and privacy practices.

## 12. Success Criteria

- A new player can cast and catch their first fish within 2 minutes.
- Players can see a clear next goal (next unlock) at all times.
- Each location and rod tier noticeably changes what can be caught.
- A full playthrough to max level takes roughly 15–25 hours; reaching the first new location takes about 20 minutes.

## 13. Open Questions

- ~~Art style~~ Decided: low-poly stylized.
- ~~Online features~~ Revised: shared-world multiplayer (see section 14).
- ~~Mobile~~ Decided: desktop only for launch.
- ~~Engine~~ Decided: Three.js.
- Should fish be sellable and keepable (aquarium/trophy room feature)?

## 14. Open World, Map Shops & Multiplayer (v2 plan)

### 14.1 Traversable world
- Each map is a walkable area (WASD + mouse look, jump optional) containing a **shop hub** (dock-side vendor stall), fishing spots (shore, dock, boat later) and scenery.
- Fishing starts when the player stands at a valid spot and equips the rod; casting/reeling is unchanged.
- Maps are separate zones joined by a travel point (gate/boat) that stays locked until the player reaches the destination's `minLevel`.

### 14.2 Map shop
- One vendor per map. **Sell** fish (price by species rarity and weight, as today) and **buy** rods, bait and map-specific gear. Stock improves per map.
- The hotbar is the entire inventory: 5 slots, each holding one rod, one fish, or a stack of up to 99 bait of one type (more waits in the tackle locker and refills the stack). Each map's stall sells a fixed stock (Starter Pond: worm bait and the free Twig Rod; set per map in `stock`). Goods are bought by looking at them on the stall and pressing E; fish are sold by holding them near the vendor and pressing E. You cannot cast while a fish is in hand or when no slot is free for the catch, so sell or drop fish before the bar fills. Dropped items last 30 seconds in the world, visible to the whole room (anyone can pick them up).

### 14.3 Progression gate
- Each map's gate opens per player once they reach the destination map's `minLevel` (the casino uses `CASINO_LEVEL`, 15). The server checks the level on travel.
- The next map brings rarer fish, better rods/bait and a higher shop tier.
- Progress is saved per account, so it persists across sessions.
- *History:* this used to be a pooled **Town Fund** (coins handed to the vendor until a room-wide goal was met). It was removed; old saves with `fund`/`contributed` fields and the old stored `rooms` fund totals are ignored on load.

### 14.4 Multiplayer (first version: shared world)
- Players on the same map see each other walking, casting and holding a catch (simple avatars with nameplates), plus bobbers and lines.
- **Authoritative server** (Node + WebSocket, e.g. `ws` or Colyseus) owns: player positions (client-predicted, server-validated), inventory, coins, level, fish rolls and sales. The client only requests actions, which stops cheating and keeps the economy consistent.
- Network model: 10–20 Hz position snapshots with client-side interpolation; discrete events for cast, bite, catch, sell and jump (remote players replay the jump arc locally).
- Accounts: simple name + token for v2, with a database (SQLite) for saves. Server-side saves replace localStorage.
- Rooms: one room per map instance with a player cap (about 16); players are routed into a room when they travel.
- Social extras (later): chat, shared leaderboards (biggest fish per species).

### 14.5 Phasing
1. **Phase A — World & shop (single-player):** walk controller, map layout with vendor, sell/buy at the vendor only, per-map unlock, map data refactor.
2. **Phase B — Server:** authoritative Node server, accounts and saves, move economy and fish rolls server-side.
3. **Phase C — Shared presence:** avatars, nameplates, synced casts and catches, room management.
4. **Phase D — Social & polish:** chat, leaderboards.

### 14.6 Decisions
- **No player-to-player trading.**
- Only the first map (`pond`) is built, as a template.

### 14.7 Adding a map (template)
1. Add a `MapDef` to `src/data/maps.ts`: `spawn`, hub `pad`, `vendor` and `gate` spots, `next`, `radius`, and `minLevel` if travelling there needs a level.
2. Give it a `locationId` in `src/data/content.ts` (palette, fish pool).
3. Point the previous map's `next` at it. The hub and gate are built from the data by `src/game/hub.ts`.

### 14.8 Multiplayer status
- **Server** (`server/`): `npm run server` starts a WebSocket server on port 8787. Rooms are chosen with `?room=name` (default `lobby`); `?name=` sets your display name. Logic lives in `server/room.ts` (tested).
- **Client** (`src/game/net.ts`, `avatars.ts`): other players in the same map appear as nameplated avatars. If the server is unreachable the game falls back to offline single-player.
- **Run both:** `npm run server` and `npm run dev` in two terminals.
- **Accounts** (`server/accounts.ts`): the first join with a name claims it; a browser-held token (SHA-256 hashed server-side, `server/accounts.json`) proves ownership and logs that browser in by itself. Logging in again elsewhere disconnects the older session ("You logged in somewhere else").
- **Passwords** (optional): set or changed in ⚙ Settings > Account, which signs out every other browser. A taken name with a password shows a password field on the join screen (`error` with `need: 'password'`); the right password adds that browser to the account, up to 10 remembered browsers (oldest forgotten first). Hashed with scrypt; 5 wrong passwords lock that name for 15 minutes, 50 across all names lock everyone out of password logins (browsers already remembered still get in). "Log out of this device" (only with a password) forgets this browser and gives it a fresh token. No email recovery: any still-remembered browser can set a new password, otherwise the dev console's `/resetpass`. Returning players at level 3+ without a password get a nudge on the welcome banner. Saves from before passwords (single `hash`) load as one remembered browser, and `hash` is still written so a rollback keeps every account.
- **Server-side economy:** coins, carry slots (fish and bait), rods and level live in the account save. Buy/sell are validated by the server (vendor proximity, funds). The server rolls fish, size and bite wait on `cast`, and rejects a `catch` that arrives before the bite wait plus fight time. Shared logic is in `src/game/economy.ts`; the client mirrors it optimistically and the server `state` overwrites.
- **Synced visuals:** other players' casts (bobber and line) and held catches (fish hanging on a line from the rod tip) are broadcast as `act` messages.
- **Remaining gaps:** the reel minigame outcome is still client-side (only timing is checked), positions are client-reported, chat/leaderboards, and the second map.

### Lucky Wheel
Each map hub has a Lucky Wheel. Hold a fish near it and press E to gamble that fish: 45% chance its value doubles (stackable, shown as ×2 on the hotbar), 55% chance it is lost. The server rolls and applies the result only after the ~3.8 s spin ends (the hotbar doesn't spoil it); other actions are locked during the spin, and leaving mid-spin settles it immediately. A large DOUBLED!/LOST! banner reports the outcome.

### Shiny Fish
- **Shiny fish:** every hooked fish has a 5% chance to be shiny. A shiny is gold with a glint, fights about 40% harder (stronger, longer surges), is worth 5× the normal sale value and gives 3× XP. It is announced on bite, on the catch card, on the hotbar and to other players. It survives drop, pickup and the Lucky Wheel.

## 15. Identity, Cosmetics & Expanded Hub
- **Join screen:** pick a name and body color (live 3D preview). Saved locally; `?name=` skips it.
- **Leaderboard:** the menu's Anglers tab lists everyone online with their face and level, highest first; a "Top Anglers" board stands in the plaza.
- **Faces:** 8 free painted faces (`FACES` in `src/data/cosmetics.ts`, drawn by `src/game/faces.ts`): smile, grin, wink, cat, joy, cheeky, toothy and sleepy. Each is one shared texture on the head sphere, facing where the player looks. New accounts and saves from before faces get a random one; players change it in the Wardrobe's Face section, and can drag the preview to turn their character. NPCs wear the same faces, one each, set by `face` on their `NpcDef` (and `vendor.face` for Marlow).
- **Cosmetics:** hats, shirts, jewelry, tiers 0–5 (see section 33). Marlow's stall sells 6 per slot for coins (Cosmetics/Gear tabs); the casino Prize Counter sells 2 more per slot for chips only. Equipped in the Wardrobe (Tab; also the plaza and casino mirrors). Visible to all players.
- **Selling:** with the shop menu open, hover a hotbar fish to see its price and click to sell.
- **Hub:** T-shaped dock with side piers, rowboat, barrel and rope; plaza gains a campfire with benches, leaderboard board, mirror and extra lamps.
- **Persistence:** see section 17.

## 17. Persistence & account reset

- **Storage** (`server/storage.ts`): accounts are saved every 2 s when changed, and on SIGTERM/SIGINT (redeploys).
  - Default: JSON files in `DATA_DIR` (or the server folder). Lost on Render free redeploys unless a paid disk is mounted at `DATA_DIR`.
  - Set `DATABASE_URL` to use Postgres instead (Neon, Supabase or Render Postgres, no disk needed). A `game_state` table is created automatically.
- **Reset:** menu ⚙ Settings tab -> "Reset account…" -> confirm. Wipes coins, level, gear, fish, dex and cosmetics; keeps name, login token, body color and face. Works offline too. Blocked mid wheel-spin.

## 18. Tier rules (bait gates, rod eases)

- **Bait tier decides which fish can bite.** Any rod can use any bait.
- **Rod tier decides how hard the reel fight is.** Difficulty = fish stamina ÷ rod control^0.45, plus 35% for every tier the fish is above the rod (capped at 3.2). A tier 5 fish on a twig rod is near-impossible; on the Aurora Rod it is about medium-hard.
- Each tier's fish sell for more and have higher stamina than the tier below. Inventory shows rods, bait and cosmetics as the same icon tiles as the shop.

## 19. Top-tier banner, brutal fights, stretch cosmetics

- **Banner:** when the hooked or caught fish is the same tier as your equipped bait (your best catchable tier), a large "<Tier> fish hooked!/caught!" banner shows in that tier's color.
- **Harder reels:** high difficulty means shorter rests, stronger and longer surges, tighter tension coupling and a faster line snap. Tuning lives in `src/game/reel.ts`.
- **Cosmetic prices:** entry items cost 100-400 coins; the top items (Lake King's Crown 75,000, Aurora Mantle 60,000, Starfall Diamond 120,000) are stretch goals worth roughly 25-40 top-tier catches. Casino outfits cost 30-450 chips.

## 20. Perfect cast (skill shot)

- While charging, the power gauge shows a gold zone (power 0.86-0.96). Releasing inside it is a perfect cast.
- A perfect cast drops fish more than one tier below your bait's tier from the pool, doubles the non-common luck weight and removes the "outgrown" penalty, so top-tier fish are much more likely. The bait gate itself is unchanged.
- The client reports `perfect` with the cast; the server trusts it (like reel results), so it is a fun bonus rather than an anti-cheat feature.

## 21. Top Anglers board

- The physical board ranks players in the room by their single most valuable catch (`save.best`, set in `applyCatch`, reset with the account). Each row shows rank, name, level, the fish's tier and name (tier-colored, ✨ if shiny) and its sell value. Players with no catch yet rank last, by coins.
- The Anglers tab in the menu ranks by level.

## 22. Music and coin HUD

- Background music is generated live with Web Audio, in a quiet Outer Wilds / Timber Hearth style: a lilting 6/8 banjo-like fingerpick (Karplus-Strong strings) over D-G-A-D-Bm-G-D-A, a soft whistled pentatonic motif, a slow warm drone and a faint campfire crackle. It is mixed low (`MUSIC_VOL` in `audio.ts`) so it sits under the lake ambience, so there are no audio files and no licensing. Press **M** to toggle; the choice is remembered in localStorage.
- The top bar shows coins in a gold pill that pulses whenever the amount changes.

## 23. Prime fishing spots

Where you stand when you cast matters (server-checked from the player's position):

| Spot | Where | Luck | Bite wait | Pool |
|------|-------|------|-----------|------|
| Prime | Outer pier and T-platform (z ≤ 5.4) | ×1 | ×1 | full |
| Inner pier | Rest of the pier | ×0.7 | ×1.25 | full |
| Poor | Anywhere off the pier (shore, hub) | ×0.35 | ×1.7 | top tier your bait could catch is removed |

A HUD chip shows the current spot's quality; the cast toast names it. Perfect casts still apply on top.

## 24. Day / night cycle

A full day is 10 real minutes (`DAY_SECONDS` in `daynight.ts`), driven by the wall clock so every player sees the same time. Roughly: day 0–45%, dusk 45–60%, night 60–85%, dawn 85–100%.

- Sky, fog, water, clouds, sun/moon light and hemisphere light blend between day, a warm dusk/dawn tint, and night; stars fade in.
- Hub lamp posts and the pier lanterns glow brighter and cast warm point light at night.
- Fireflies hover over the lake and blink at night, fading out by day.
- Dev: `__game.day(0.72)` freezes the time of day (`null` resumes the clock).

## 25. Persistent leaderboard

The physical Top Anglers board is a hall of fame built from every account's best catch (`AccountStore.hall`, top 8), so players stay on it while offline. The server sends a `hall` message on join and whenever it changes. Offline play shows only the local player.

## 26. The town

The land hub is a small cozy fishing town: a cobbled main street from the pier to the Forest Lake gate, a plaza with a well, six cottages (Wren's Cottage, Smokehouse, Fishmonger, Net Mender and two homes) with lit windows at night, fish racks and a rowboat on the shore, flower beds and fences. Layout lives in `MapDef.town` (`src/data/maps.ts`), geometry in `src/game/town.ts`.

- **Townsfolk**: Old Salty (pier tips), Pip, Granny Wren and Captain Reed. Press E to talk; lines cycle and some change at night.
- **Messages in bottles**: 7 hidden around town, shore and pier. Each pays 40 coins once; finding all 7 pays a 300 coin bonus. Found bottles are saved per account (`SaveData.bottles`); the server verifies the player is within 4 m.
- **Coziness**: lantern posts line the street (some cast real light at night), benches and planters ring the plaza, string lights span the street, a log-seat fire pit sits by the Smokehouse, picnic blankets overlook the water, and firewood is stacked by the cottages. Bottles rest on the ground; the rowboat sits upright on the shore.

## 27. Night fishing

Night is the shortest part of the day, so it is the best time to fish. When the night level is ≥ 0.7 (`NIGHT_BITE`):
- Four night-only fish join the pool: Midnight Catfish (T2), Lantern Eel (T3), Moonstone Salmon (T4) and Starweaver Eel (T5). They are marked 🌙 in the Fishdex and the shop chips.
- All non-common weights are multiplied by 1.8 (`NIGHT_LUCK`), and night-only fish get a further 2× weight.
- The shiny chance rises from 5% to 15%.
- A HUD chip tells the player when the fish are biting. The server decides night from the wall clock when it rolls a cast, so every player sees the same cycle.


## 28. Tier visuals

Superseded by the fish rework: see §32 (Looks, Catch moment).

## 29. Casino

The endgame. A separate **Casino map** replaces the Forest Lake as the pond's `next`. The Forest Lake stays in the data, shelved.

### Access
- The pond gate opens at **level 15** (`CASINO_LEVEL`, the Aurora Rod level) so players have fished before they gamble. The server enforces it on travel.
- The casino is an **indoor map** (no water, terrain or dock): a carpeted hall with a roulette table, a blackjack table and a cashier counter. Fishing is disabled inside. The front door returns to the pond.
- The hall's look (`src/game/casinoroom.ts`, tables in `casinohall.ts`): damask walls over raised wood panels, a coffered wood ceiling with gold medallions above the chandeliers, fluted pillars, brass sconces and framed fish paintings, and velvet ropes at the cashier. The table felt is printed in gold with the real rules ("BLACKJACK ×3 · DEALER STANDS ON 17"; a border and wheel ring on roulette). Only the chandeliers are real lights; sconces and the ceiling use glowing materials. `npm run screenshots -- casino` re-shoots the poster image at the pond gate.
- Tables are played **in the world**: walk up, hold the fish to bet (keys 1-5), then aim and click the 3D red/black/green patches, or the DEAL / HIT / STAND / DOUBLE buttons on the felt. Cards are laid out on the table and a small status line shows the bet and result.
- At the cashier, hold a fish and click the chip tray to turn it in. Click the prize case (or press E) to open the perk list and buy unlocks.

### Let it ride
- A player bets a **fish** at a table. The fish keeps its identity and gains a **×multiplier** (as the Lucky Wheel does).
- A win multiplies the fish's value. A loss destroys the fish. There is no cash-out prompt at the table: the player simply keeps playing or walks away.
- Cashing out is separate. The player **turns the fish in manually at the casino prize shop**, which pays **chips** at its current boosted value times a fixed rate. The decision to stop is always theirs.
- The multiplier has no cap: a fish can be bet again and again until it is lost or turned in.
- The server rolls everything and applies the result after the animation, like the wheel. If a player disconnects mid-round, the round settles on the server so the result can't be dodged.

### Tables
- **Roulette:** red, black or green. Red and black double the fish, green pays more. Slots are weighted so the house keeps about a 3% edge. One spin is shared by every player at the table.
- **Blackjack:** hit, stand and double. The dealer stands on 17. A win doubles the fish (×2) and a natural triples it (×3). Doubling down costs coins equal to the fish's value: a win makes the fish ×4, a push refunds the coins, and a loss takes the coins with the fish. Without the coins the server refuses the double.
- **Result sounds:** every table and the Lucky Wheel share them: a win plays the big jingle, a loss the line-snap sound. A blackjack push plays the short jingle from selling a fish, since the fish is kept. Hands that end on the deal play theirs too.

### Chips
- A separate currency in the account save. Chips are earned only by turning fish in at the prize shop and are spent only on casino unlocks and casino-only cosmetics. Coins keep buying rods, bait and the stall's cosmetics.
- One config holds the fish-to-chip rate and unlock prices so the grind can be tuned.

### Casino unlocks (bought with chips)
| Item | Effect | Type |
|---|---|---|
| Tackle Vest | +2 inventory slots | permanent |
| Lucky Charms (3 tiers) | +5/10/15% value on every fish caught after buying (applied at catch, not at sale) | permanent, total bonus capped |
| Quick-Reel Gloves | shorter reel time | permanent |
| Shiny Lure | N charges, each guarantees a shiny catch | consumable, re-bought |
| Night Owl Lantern | better night-fish luck | permanent |
| Cosmetics | casino-only outfits (High Roller tab, see section 33) | permanent |

### Build order
1. Casino map, gate and travel.
2. Chips currency in the save, the server and the HUD.
3. Roulette.
4. Blackjack.
5. Unlock shop and equipping.
6. Applying the effects: vest slots, sell bonus, reel time, shiny charges.
7. Tests and a design-doc update.

### Decisions
- **No daily chip cap.** Chips are the endgame grind, so there is no cap or streak protection.
- **No minimum fish tier at the tables.** Any fish can be bet. The chip rate gates progress instead: with a high rate (for example 1 chip per 1,000 coins of fish value), a low-tier fish needs a long lucky streak before it is worth any chips. Taking that gamble is the player's choice.
- **Chips are the grind.** Unlock prices are set high enough that the chips are what players work toward after the last rod and bait.

### Open questions
- The exact fish-to-chip rate and unlock prices, kept in one config so they can be tuned after playtesting.

## 30. Global chat

- **Scope:** every connected player on the server, across all rooms and worlds. Offline play has no chat.
- **No history:** the server relays each line and keeps nothing, so players only see messages sent after they join.
- **Join notices:** when someone joins, everyone already online (every room) gets an italic "Name has joined" line; it shows under either world filter.
- **Window** (top right, `src/game/chatbox.ts`): the last 8 lines, each removed 5 minutes after it arrived. "Press Enter to chat" sits under it. The window is half transparent while playing and full strength while typing. Enter opens the input (movement and hotkeys pause), Enter sends, Esc cancels. The browser always releases the mouse on Esc, so cancelling shows a small "click to keep playing" overlay instead of the pause menu (Esc again opens the menu). Tab while typing switches between all worlds and the current world; lines from another world are tagged with its name. Typing `/` lists the player commands (`/bug`, `/idea`, `/feedback`; dev console commands stay unlisted) under the input, and Tab completes a half-typed one, stepping through several on repeat presses (Shift+Tab steps back). In slash-command text Tab only completes, so it never changes the world filter mid-report. Phones have no Tab key, so touch mode has no completion.
- **Bubbles** (`src/game/avatars.ts`): players in the same room and map see a speech bubble over the speaker for 6 s (fading in the last second), cut to 40 characters. Only nearby players see it (full within 15 m, gone by 20 m), and it fades out when you stand right on the speaker (gone within 1.2 m, full again at 2.5 m) so it never covers your view.
- **Rules** (`server/chat.ts`, one `ChatGate` shared by every room): 120 characters, control characters stripped and whitespace collapsed; 3 lines per 5 s per account, and no repeating the same line within 10 s (the sender gets a notice). Rude words, including common spellings like `sh1t`, are masked with asterisks.

## 31. Interface style (Cozy Wood)

- **Look:** walnut frames, parchment cards and gold accents, matching the town's stalls and signs, in the bundled Nunito font (`src/assets/fonts`). Colours are CSS variables at the top of `src/style.css` (`--wood-*`, `--paper*`, `--gold`, tier colours `--t1`-`--t5`). The casino counter uses the same pieces in burgundy and gold.
- **HUD:** level badge with an XP ring and a coin counter (chips only in the casino) top left; spot and night hints only with a rod in hand; chat top right; hotbar with icons (fish drawn in their species colour by `src/game/fishicon.ts`), and the item's name pops up when switching slots; a short Tab / Enter / Esc reminder bottom left.
- **Menu window:** one frame for everything. Header: who it belongs to (you, Marlow's Stall or the Prize Counter), tabs, and Esc ✕. Player tabs: Bag (setup, rods, bait), Wardrobe (preview, colour, face, owned cosmetics), Fishdex, Anglers, ⚙ Settings (controls, music, graphics, reset). Shop tabs: Gear, Cosmetics. Prize Counter tabs: Unlocks, High Roller (casino cosmetics).
- **Tiles and details:** items are tiles with their tier colour along the bottom edge. Clicking one selects it and shows it in the details panel on the right (stats, one plain sentence, and the main action: Equip, Buy, Wear). The Wardrobe applies clicks straight away since nothing is spent.
- **Selling:** the shop and prize counter sit higher so the hotbar stays visible; a strip at the bottom explains clicking a fish to sell (or turn in), with "Sell all" in the shop.

## 32. Fish and tiers

- **Tier themes:** 1 Shallows (small everyday fish), 2 Sport fish (the classics), 3 Lake giants (big predators and pond royalty), 4 Jewel fish (gem colours: Pearl Sturgeon, Ruby Arowana, Sapphire Dorado, Moonstone Salmon), 5 Spirit fish (mythic versions of familiar fish: Ghost Carp, Phoenix Trout, Aurora Pike, Starweaver Eel). Ids never change, so renames keep saves intact.
- **Bigger every tier:** sizes climb without overlap at the top (tier 1 is 5-40 cm, tier 5 is 130-320 cm), and one curve, `fishScale` in `src/game/fishscale.ts`, sizes every view of a fish (water, landing, held, carried, dropped, other players) so a legend really looks like a trophy. A tier boost on top (×1, ×1, ×1.08, ×1.2, ×1.35) makes jewels and spirits read bigger than their length alone. Each view eases toward its own soft cap instead of a hard one, so a bigger fish always looks bigger: the dangling catch (cap 3.3) hangs on a shorter line from a raised rod so it clears the dock, the carried fish (cap 0.3) moves further out and down as it grows, and other players' catches (cap 1.5) hang closer to their rod tip so they stay off the ground. Tests check that every view's smallest and biggest fish grow strictly with tier. Saves from before the rework have their records and carried fish pulled into the new ranges.
- **Looks:** each species has a silhouette, fins, colours and markings in `src/data/fishlook.ts`; the 3D model (`fishmodel.ts`) and 2D icon (`fishicon.ts`) are both drawn from it. The tier adds the finish: matte, then satin, then a glossy clear coat with an iridescent shimmer and bigger fins and tail (3), then a jewel sheen with a coloured rim glow, a soft halo, faceted gems along the flanks and on the brow, glowing gem-coloured eyes and sparkles (4), then a spirit aura with a bigger halo, shining eyes, a floating crown of light, a wider ring of sparkles and a signature flourish (veils, flames, colour-cycling ribbons, stars) (5). A dangling catch turns a flank toward the camera so all of this is on show. The 2D icons follow: a gloss streak from tier 3, a coloured glow, gem row, gem iris and sparkles on jewels, and a crown plus the spirit's flames or ribbons on spirits.
- **Catch moment:** landing a jewel, spirit or shiny fish bursts coloured sparkles around it (`FX.burst`), kicks the camera and rod, and the catch card pops in; jewel and spirit cards also pulse a glow in the tier colour, sweep a shine across and float the icon (bigger on spirits). All client-side.
- **Odds:** fish below your gear tier bite at ×0.3 per tier below (`OUTGROWN`), and legendaries have a base weight of 0.6, so with top gear roughly 1 catch in 5 is tier 1-2 and 1 in 6 is legendary. Upgrades take a similar number of catches each (about 45, 54, 72). Every tier is still worth strictly more than the one below at any size (tested).
- **Fishdex:** grouped by tier under its theme name, with a one-line description per species (`FISH_BLURB`); undiscovered fish show their silhouette, size range and the gear to try. The catch card shows the icon, description, tier theme and a 🌙 for night fish.

## 33. Cosmetics look

- **Themes:** Marlow's stall sells lakeside angler gear (Fisher Cap, Straw Sun Hat, Fly-Tier Bucket Hat, Captain's Hat, Heron Plume Hat, Lake King's Crown; Camp Tee, Sailor Stripes, Angler Vest, Lily Pad Shirt, Harbor Peacoat, Aurora Mantle; Shell Necklace, Hook Charm Chain, Golden Fish Pendant, Pearl Strand, Sapphire Amulet, Starfall Diamond). The casino sells high-roller glam in felt green, gold, neon pink and red/black: Dealer's Visor (T2, 30 chips), High Roller Top Hat (T4, 150), Croupier's Waistcoat (T2, 40), Jackpot Tuxedo (T4, 200), Lucky Dice Chain (T3, 75) and the Jackpot Medallion (T5, 450). Ids never change, so renames keep saves intact.
- **Shop rule:** each item has a `shop` (`stall` or `casino`). The server sells an item only at its own counter: stall items for coins next to Marlow, casino items for chips at the Prize Counter (`buyCosmetic` in `economy.ts`, checked in `server/room.ts`).
- **Rarity:** tier 0 Plain (grey), 1 Fine (green), 2 Rare (blue), 3 Epic (purple), 4 Mythic (orange), 5 Legendary (gold). Finishes climb with the tier: matte cloth, then satin, brass and gold trims, glowing gems, and for legendaries breathing glow trims plus stars that circle the wearer.
- **UI:** every item has its own drawn icon (`src/game/cosicon.ts`). Mythic tiles have a warm glow; legendary tiles are gold, shimmer and twinkle; casino items carry a small pink chip in the corner. The details panel shows the rarity, a one-line blurb and a live try-on preview.
- **Models** (`src/game/character.ts`): low-poly primitives on the capsule body, built once per item and cloned for every wearer (geometry and materials are shared, small parts merged into one mesh). No lights are added; glows are emissive materials.

## 34. New-player tips

One-time tips walk a new player through the core loop, each shown at the moment it matters in a gold-edged box above the hotbar (separate from action toasts, so those can't replace it):

- **start** (first time play begins): hold click to cast, click on the "!" to hook.
- **reel** (first hooked fish): hold to reel, ease off when it surges.
- **catch** (first catch card put away): sell it at the vendor's stall with E.
- **sold** (first sale): the next bait up, with its unlock level or price.
- **bait** (first better bait bought): better bait draws bigger fish.
- **tier** (first fish above tier 1): keep upgrading; the casino opens at Lv 15.

The ids seen are kept in the save (`tips`), so each shows once per account. Saves from before the tips start with every tip seen, unless the player hadn't caught anything yet. An account reset shows them again.

**Rod upgrade hint:** when a line snaps, a fish slips off, or a catch takes more than 30 s to reel in (`TOUGH_FIGHT_SECS`; medium fights take about 18 s), the same box names the next rod up and its price: "A better rod makes fish easier to reel in". Only when that rod is unlocked and the player doesn't own it or anything better, and at most once per session (not saved), so it doesn't nag. After a tough catch it waits for the catch card to be put away, and skips if a new-player tip shows then.

## 35. Dev console

Slash commands typed into the chat box go to the server as `cmd` messages, never to chat; replies come back only to the player who typed them (`dev` messages, shown as system lines).

- **Login:** `/login <user> <password>`, checked on the server against the `DEV_USER` and `DEV_PASS` environment variables. With either unset the console is off. A login lasts for that connection only; `/logout` ends it. Five failed logins lock that account out for 15 minutes, and 30 failures across all accounts lock everyone out for 15 minutes. The password is masked in the local echo and never logged; the server logs each command.
- **Commands** (`server/dev.ts`): `/help`, `/coins N`, `/chips N`, `/level N`, `/bait <id> [N]`, `/rod <id>`, `/fish <id> [cm] [shiny]`, `/tp <map>`, `/time day|dusk|night|dawn|auto` (only for you, including the server's night bite odds), `/dig` (clears the worm patch cooldown), `/resetpass <name> <new password>` (for a player locked out of every browser: sets the password and signs out all their browsers; the password is masked in the echo and never logged). Commands change the real save. A bad id lists the valid ones.

## 36. Feedback and Discord

Two optional Discord webhooks, each set as a server environment variable and never sent to the client. With a URL unset, that feature is off. Mentions are always disabled, so nothing a player types can ping anyone.

- **Feedback:** any player can type `/bug <text>`, `/idea <text>` or `/feedback <text>` in chat. The text goes to the server as a `cmd` message, never to chat. The server cleans it, caps it at 500 characters and runs the chat profanity filter. It allows 3 reports per account and 20 server-wide per 10 minutes. It then attaches context the client can't fake: account, level, map, position, room, browser (from the socket's user-agent), time and build (`RENDER_GIT_COMMIT`). Each report opens one forum post in `DISCORD_FEEDBACK_WEBHOOK`'s channel, titled `[Bug] …`/`[Idea] …`/`[Feedback] …` (on a plain text channel it is posted as a normal message instead). `DISCORD_FEEDBACK_TAGS` (`bug=<id>,idea=<id>,new=<id>`) adds forum tags. If the webhook is unset or Discord is unreachable, the report is kept in storage instead (Postgres `feedback` table, or `feedback.jsonl` next to the JSON saves). The player gets a thank-you line in chat either way.
- **Join pings:** `DISCORD_JOINS_WEBHOOK` gets a batched summary of who joined: name, new player or level, map, and players online. The first join after a quiet spell waits 30 s to gather a burst, then there is at most one message per 5 minutes. A player who was online within the last 10 minutes isn't posted again, so reconnects and redeploys stay quiet.

## 37. Tip jar

Players who enjoy the game can tip Oscar on Ko-fi (`KOFI_URL` in `src/data/support.ts`). **A tip never gives anything in game**: no coins, chips, perks or head start, because anything that feeds the casino would make tips real money for gambling currency. The only thanks is cosmetic recognition.

- **Where it shows:** a "Support Lakeside" section in the ⚙️ settings sidebar (under Sound) with a ☕ Tip on Ko-fi link, and a Support section in the README. Nothing pops up in play.
- **The 💗:** a supporter gets a heart before their name on their floating name tag, in the Anglers list (online and top anglers), and on their chat lines, and is listed on the "Thank you" board beside Top Anglers in the town square (newest first, 5 names, then "and N more"). It is kept on the account, not the save, so an account reset keeps it.
- **Linking a tip to a player:** Ko-fi posts each tip to `POST /kofi`. The server checks Ko-fi's verification token (`KOFI_VERIFY_TOKEN`; with it unset, every request is turned away), then looks for a Lakeside name written in the tip message as a whole word, falling back to the tipper's Ko-fi name. A message naming several players matches nobody. A matched player gets the heart at once, everyone gets the new supporters list, and the player, if online, a thank-you notice. Retries of the same Ko-fi message id are ignored. The tipper's email is never read.
- **Discord and the dev console:** `DISCORD_TIPS_WEBHOOK` gets one message per tip (amount, Ko-fi name, message, and who got the heart, or a reminder to give it by hand). `/supporter <name>` in the dev console gives the heart; `/supporter <name> off` takes it away.
