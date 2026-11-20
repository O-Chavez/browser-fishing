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
| Platform | Desktop browsers (Chrome, Firefox, Safari, Edge), and phones and tablets in landscape with touch controls (§39) |
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

If the player lacks a requirement, the fish is never offered. A hint in the Fishdex ("Needs: Heavy rod, Live bait") lets players plan upgrades. As built (2026-10-31): bait gates the bite, and a fish hooked but lost to a gear wall is *seen* in the Fishdex with the line it needs to be held and the rod to be landed (`SaveData.seen`, `gearNeeds`).

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

**Line** (added 2026-10-31, see [REELING.md](REELING.md)) is the second gear path: a permanent spool on the rod, one at a time, upgraded at the stall and never carried. Five tiers in the rods' colours (Twine, Mono, Fluoro, Braid, Moonsilk), each unlocking just after the bait of its tier and before its rod, at about 40% of the rod's price. The rod wins line, the line holds the fish.

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
- **1–5:** hold that hotbar slot (1 is always the rod, 2 the bait, 3 and up fish). The held item replaces the rod in your hands: a fish model, or a bait jar; hold the rod to cast. **E:** interact (buy the stall item you are looking at, sell the fish in hand, pick up a drop, talk to the vendor). **G:** drop the item in hand (vanishes after 30 s). **Esc:** closes any open menu, or opens the game menu.
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
- **Two axes** (2026-10-31, [REELING.md](REELING.md)): a fish's **weight** against the rod sets drag and reel speed (a fish a tier over the rod is a fight about twice as long; two tiers over, it takes the line and runs off on its own), its **strength** against the line sets how high surges pull and how fast the red frays (a fish over the line pulls into the red and snaps it). The pace, warning, build-up, needle speed and sweet spot follow the fish's tier, not the gear. Size, a shiny and a **Brutish** tag make a fish heavier; a **Feisty** tag makes it stronger; none of them can push a fish over a wall its gear handles. A tagged fish wears a sticker in the lower right for the fight and is worth 15% more landed (`TAG_BONUS`), on top of the clean catch's 10%.
- **Sea fish tire** (2026-11-01, [REELING.md](REELING.md), "Fish stamina"): a FIGHT bar above the gauge empties as the fish goes from full fight to tired to exhausted. Keeping the line tight wears the fish down; tired surges get weaker, shorter and sparser until it comes in as dead weight, though a fish too strong for your line never tires out of the red. Heavier fish have more fight. A sticker under the gauge shows the fish's pull and behaviour all fight.

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
- **The lake's water** (Oscar's pick, 2026-11-19: "Sunlit shallows", its clarity leaning toward the murkier, greener mockup) reads as depth, not a colour filter: whatever lies under the surface fades with the water over it, by how deep it is and the angle it is seen at, red first, toward the water's own colour (a greener body looking down into it, the lake's pale blue looking across it). The shallows at the shore stay clear and the bed fades out about 3 m down. The bed is pale sand in the shallows, weedy green past the lip and dark silt deeper, with wet sand and a thin breathing line of foam at the water's edge, stones and pebbles in the shallows, and a slow net of sunlight (caustics) on the bed and the stones that fades with the sun and is gone at night. Near the viewer the surface only mirrors the sky and the glints; from about 8 to 28 m out it turns back into the old surface, so the open lake keeps its pale grey-blue. It is clipped by world height, so everything under the surface fades (posts, the bobber's foot, a hooked fish, the line, another player's catch) and nothing above it does; the rowboat's inside stays dry. No extra pass: the shading rides in every built-in material's shader (`src/game/underwater.ts`), the surface and the bed's height map are in `src/game/lakewater.ts` and `src/game/lakebed.ts`, and the knobs in `LAKE` (`src/data/lake.ts`). Lite graphics (the phones' default) keeps the depth on the bed, the wet sand and the foam line, leaves out the caustics, the stones and the bed's zones, and lets the surface veil everything else under it in the lake's colour (more over deeper water), as the old surface did, since fading every material costs a phone too much. Staged with `scripts/lakeshots.ts`.
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
- **Graphics:** Full or Lite in ⚙ Settings, remembered per browser. Lite turns off sun shadows (and frees the shadow map), grass tufts and flowers, and draws 25% fewer pixels each way. Touch devices start in Lite. If the browser loses the WebGL context (a GPU crash; Chromium then shows a blank "sad canvas" and won't make a new context until a reload), a banner offers a reload, which starts in Lite. If WebGL can't be created at all (blocked after a crash, or no hardware acceleration), the page says so with a Reload button instead of failing silently. Phones don't draw the world behind the "made for desktop" notice.
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
- The hotbar is everything carried: 5 slots (7 with the Tackle Vest). Slot 1 always holds the rod in use and slot 2 the bait in use (a stack of up to 99 of one type; more waits in the tackle locker and refills the stack), both drawn with a teal frame and a ROD / BAIT tag; slots 3 and up hold fish only, so fish can't crowd the gear out. Other rods and bait wait in the tackle locker and are swapped in from the Bag (Tab, which opens on your own character to turn with a drag until a tile is picked, so players see their look often); new rods and bait go to the locker and come straight into their slot when it's empty, holds the same bait, or (when bought) holds something lower tier. Picking up a rod you already own is refused. Running out of bait leaves the bait slot empty. Dropping the rod brings out your best other rod (your only rod can't be dropped). Saves from before this layout keep the equipped rod and active bait in slots 1 and 2, move every other rod and bait stack to the locker, and keep their fish; fish that no longer fit wait in extra slots (dashed outline) past the end of the bar until sold, dropped or lost at the casino. Each map's stall sells a fixed stock (Starter Pond: worm bait and the free Twig Rod; set per map in `stock`). Goods are bought by looking at them on the stall and pressing E; fish are sold by holding them near the vendor and pressing E. You cannot cast while a fish is in hand or when no fish slot is free for the catch, so sell or drop fish before the fish row fills. Dropped items last 30 seconds in the world, visible to the whole room (anyone can pick them up).

### 14.3 Progression gate
- Each map's gate opens per player once they reach the destination map's `minLevel` (the casino uses `CASINO_LEVEL`, 15). The server checks the level on travel.
- The next map brings rarer fish, better rods/bait and a higher shop tier.
- Progress is saved per account, so it persists across sessions.
- *History:* this used to be a pooled **Town Fund** (coins handed to the vendor until a room-wide goal was met). It was removed; old saves with `fund`/`contributed` fields and the old stored `rooms` fund totals are ignored on load.

### 14.4 Multiplayer (first version: shared world)
- Players on the same map see each other walking, casting and holding a catch (simple avatars with nameplates), plus bobbers and lines.
- **Authoritative server** (Node + WebSocket, e.g. `ws` or Colyseus) owns: player positions (client-predicted, server-validated), inventory, coins, level, fish rolls and sales. The client only requests actions, which stops cheating and keeps the economy consistent.
- Network model: 10–20 Hz position snapshots with client-side interpolation; discrete events for cast, bite, catch, sell, jump (remote players replay the jump arc locally) and emotes (§40).
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
- **Client** (`src/game/net.ts`, `avatars.ts`): other players in the same map appear as nameplated avatars. A walking avatar bounces at each step and sways from side to side like the townsfolk (`src/game/gait.ts`: 5 cm and 0.05 rad, the same numbers `Town` uses), its rod with it and its name tag level; the steps come from how fast it is drawn moving, lengthening with speed (about 3 a second at a walk, under 4 at a sprint), and stop mid-jump and under an emote. The player's own view is unchanged. If the server is unreachable the game falls back to offline single-player.
- **Dropped connections** (`reconnect` in `src/game/game.ts`): a connection that drops with no reason from the server (a phone that slept or switched apps, a network blip) shows "Reconnecting…" and reloads the page once `/health` answers and the page is in view, which rejoins with the saved login. At most 2 such reloads in 3 minutes (`autoReload`, `src/game/restart.ts`), then the plain "Disconnected" banner; it also gives up after 2 minutes. A reason from the server (logged in elsewhere, kicked) never reconnects. A socket that hears nothing for 150 s while the page is in view counts as dropped (the server sends the clock every minute), since a phone can wake to a dead socket that still reads as open.
- **Problem reports** (`src/game/clientlog.ts`, `server/clientlog.ts`): script errors, lost graphics, failed joins, dropped connections and reconnects send a beacon to `POST /clientlog` with the browser, map, touch or not and seconds since load. The server prints one `[client]` line each to its log (Render's Logs tab), at most 8 a page load and 20 per address per 10 minutes. Nothing is stored.
- **Run both:** `npm run server` and `npm run dev` in two terminals.
- **Accounts** (`server/accounts.ts`): the first join with a name claims it; a browser-held token (SHA-256 hashed server-side, `server/accounts.json`) proves ownership and logs that browser in by itself. Logging in again elsewhere disconnects the older session ("You logged in somewhere else").
- **Name changes:** ⚙ Settings > Account > "Change name…", at most once every 7 days (`RENAME_COOLDOWN_MS`; a change of capitals counts too). The new name follows the join rules and can't be another account's. The old name is freed at once, and everyone on the server sees "Old is now New" in chat. Password, remembered browsers, save, hall of fame entry and supporter 💗 all live on the account, so they follow it; Ko-fi tips have to name the new one. The account keeps its last old name (`prev`), so a browser it remembers that still has the old name saved logs into it, even after someone claims the old name, and picks up the new name from `welcome`. `renamed` (when) and `prev` sit outside the save, so a progress reset doesn't clear the cooldown.
- **Passwords** (optional): set or changed in ⚙ Settings > Account, which signs out every other browser. A taken name with a password shows a password field on the join screen (`error` with `need: 'password'`); the right password adds that browser to the account, up to 10 remembered browsers (oldest forgotten first). Hashed with scrypt; 5 wrong passwords lock that name for 15 minutes, 50 across all names lock everyone out of password logins (browsers already remembered still get in). "Log in as a different account" (every account) logs out and returns to the join screen with a fresh token. With a password it only forgets this browser; without one nothing could log back in, so after a red warning (with a "Set a password first" button) the account is deleted and its name freed, along with its hall of fame entry and supporter 💗. No email recovery: any still-remembered browser can set a new password, otherwise the dev console's `/resetpass`. Returning players at level 3+ without a password get a nudge on the welcome banner. Saves from before passwords (single `hash`) load as one remembered browser, and `hash` is still written so a rollback keeps every account.
- **Server-side economy:** coins, carry slots (fish and bait), rods and level live in the account save. Buy/sell are validated by the server (vendor proximity, funds). The server rolls fish, size and bite wait on `cast`, and rejects a `catch` that arrives before the bite wait plus fight time. Shared logic is in `src/game/economy.ts`; the client mirrors it optimistically and the server `state` overwrites.
- **Synced visuals:** other players' casts (bobber and line) and held catches (fish hanging on a line from the rod tip) are broadcast as `act` messages.
- **Remaining gaps:** the reel minigame outcome is still client-side (only timing is checked), positions are client-reported, chat/leaderboards, and the second map.

### Lucky Wheel
The Lucky Wheel stands in the casino's back corner on the roulette side (`casino.wheel` in `maps.ts`); until 2026-10-31 it stood on the pond map, where new players lost their fish to it before they knew what a fish was worth. Hold a fish, stand at the wheel and click it to spin. It has 12 equal wedges (`WHEEL_WEDGES`, `src/data/casino.ts`), with no two alike side by side: 6 LOSE, 2 ×½ (half back: the fish stays but is worth half), 3 ×2 and a rare ×5. A spin wins 1 time in 3 and returns the fish's full value on average: a fair bet with no house edge, unlike roulette (5% on red, 16% on green). The ×½ and ×5 are there so it doesn't feel like a coin flip. Every win at least doubles, so each LOSE turned into a ×½ or a win has to be paid for elsewhere, or the wheel pays players more than they bet. A win multiplies the fish's value (stackable, shown on the hotbar), a ×½ halves it, a loss destroys it. A ×½ shows a gold "×½ · HALF BACK" banner with the short jingle and goes on the record board as a loss of half the fish. The server picks the wedge and applies the result only after the ~3.8 s spin ends (the hotbar doesn't spoil it); other actions are locked during the spin, and leaving mid-spin settles it immediately. The tables' result banner reports the outcome, and wins and losses go on the casino's record board as "Lucky Wheel".

### Shiny Fish
- **Shiny fish:** every hooked fish has a 5% chance to be shiny. A shiny is gold with a glint, fights about 40% harder (stronger, longer surges), is worth 5× the normal sale value and gives 3× XP. It is announced on bite, on the catch card, and on the hotbar. It survives drop, pickup and the Lucky Wheel. Other players in the same place only hear about a catch (a toast, "<name> caught a ✨ SHINY …" for a shiny) when it is a rare-or-better fish that beats that player's own Fishdex record for the species (`rec` on the `hold` act, from `applyCatch`'s `record`; `announcesCatch`); a first catch of a species is no record, and a shiny that isn't a record stays quiet.

## 15. Identity, Cosmetics & Expanded Hub
- **Join screen:** pick a name and body color (live 3D preview). Saved locally; `?name=` skips it. Once the server lets a player in, the card says "Loading…" until the map's and the legend pieces' shaders are warmed up (`Game.finishJoin`, at most 10 s, a play-test default), which mostly matters for returning players, who join by themselves as the page loads.
- **Leaderboard:** the menu's Anglers tab lists everyone online with their face, level and where they are (at the lake, at the casino or on a charter), highest first; two catch boards, Lake Legends and Deep Sea, stand at the campfire (§21).
- **Faces:** 8 free painted faces (`FACES` in `src/data/cosmetics.ts`, drawn by `src/game/faces.ts`): smile, grin, wink, cat, joy, cheeky, toothy and sleepy. Each is one shared texture on the head sphere, facing where the player looks. New accounts and saves from before faces get a random one; players change it in the Wardrobe's Face section, and can drag the preview to turn their character. NPCs wear the same faces, one each, set by `face` on their `NpcDef` (and `vendor.face` for Marlow).
- **Cosmetics:** hats, shirts, jewelry and pets, tiers 0–6 (see section 33). Marlow's stall sells 6 per slot for coins (Cosmetics/Gear tabs); the casino Prize Counter sells 2 more per slot for chips only. Equipped in the Wardrobe (Tab; also the plaza and casino mirrors). Visible to all players.
- **Sea legend pieces** (deep sea cosmetics step 1, 2026-11-14; the plan in TODO.md, "Deep sea cosmetics"): each landing of a sea legend unlocks the next piece of its set, in order: the hat, the shirt and the jewelry, then the legend's pet on the 4th. An unlocked piece is then bought from Captain Reed for coins (Oscar: a real coin sink for charter players). Prices follow the zone the legend is caught in (Oscar, step 2): about an hour of that zone's coins a piece, so every Abyss set costs 3,000,000 / 4,000,000 / 2,500,000 / 5,000,000 for the hat, shirt, jewelry and pet. Landings are counted per legend in `SaveData.legends`, from this release on, not from the Fishdex (Oscar); a piece is unlocked when the count reaches its `landing` (`legendUnlocked`). The catch card shows a teal banner ("Unlocked at Captain Reed's · piece 1 of 3"); only the player sees it, no chat line (Oscar). Reed's menu has Charters and Wardrobe tabs (Oscar's play test): the Wardrobe tab, like Marlow's Cosmetics tab, shows every legend set from the start, one row a set by zone, in landing order, with try-on in the preview and the piece's state in the detail panel. A set the player hasn't reached (its zone not open and its legend not landed) shows as dark silhouettes in the tiles, and trying one on turns the whole preview character into a silhouette (Oscar), with its name, its zone and what it takes, but not its blurb (Oscar, step 2: show all there is to get; `legendSetReached`, `reedOffer`'s `unseen`) (`reedWardrobeHtml` in `game.ts`; `reedCosmetics`, `reedOffer`, `REED_SHOPS` in `economy.ts`, so later Sea Gear and zone sets can join it; `buylegend`, checked at Reed in `server/room.ts`). The player's own Wardrobe lists only pieces they own (Oscar, 2026-11-15); the sets still ahead show at Reed's. Pets float beside and behind the player's head and ease after them, so they never clip into an outfit (Oscar's play test). The Abyss's three legends have sets so far, each in its own look and glow: the Kraken's (step 1: Kraken Crown, Kraken Armor, Kraken Beak, Kraken Hatchling; wet crimson, pink sparkles), the Leviathan's (step 2: Leviathan's Jaw, Leviathan Coil, Leviathan Fangs, Leviathan Wyrmling; the Leviathan coiled round you, slate and molten orange, ember sparkles) and the Drowned Dreamer's (step 2: Dreamer's Nightcap, Dream Robe, Dreamcatcher, Sleepy Dreamer; sleepy and cosy, teal and mint). The legends of the other zones get theirs later, priced to their zone. Dev console: `/landed <legend> N`.
- **Sea zone sets** (2026-11-15; Oscar: "the set IS the zone"): Kelp Deep and the Twilight each have a hat, shirt and jewelry set in the zone's own look, no pet: Kelp Deep's flowing kelp (Kelp Cap, Kelp Wrap, Holdfast Pendant; Epic) and the Twilight's glowing jellies (Anemone Crown, Drift Tunic, Jelly Locket; Legendary). Each piece unlocks at a number of fish landed in its zone (Kelp Deep 30 / 60 / 100, the Twilight 100 / 200 / 300; lowered 2026-11-19 from 40 / 90 / 150 and 100 / 300 / 550), counted from the Fishdex (`zoneLanded`: the zone's fish and legends; each species lives in one zone), so fish landed before the release count too. Then Captain Reed sells it for coins (Kelp Deep 150,000 / 200,000 / 100,000, the Twilight 1,000,000 / 1,250,000 / 750,000), in his Wardrobe tab with the legend sets. The numbers come from the charter sim: each set unlocks, and can be bought, during its own zone's grind, so the long legs have something to work toward. Casting plain, the sim's player lands about 210 Kelp Deep fish before the Twilight opens and about 750 Twilight fish before the Abyss, so the sets finish about halfway through each leg; on Shiny Lures the next zone opens after about 65 and 200, so the last piece takes about 35 Kelp Deep fish (15 minutes) or 100 Twilight fish (35 to 40 minutes) back in its zone, where the old 150 and 550 took about 2 hours back in the Twilight. Each set's emote follows its last piece. Reed's tab shows a progress bar per zone set ("57 / 60 fish landed in Kelp Deep", the milestones marked); the landing that reaches a milestone adds a line to the catch card, for the player only. Until its zone is open a set is a silhouette, like the legend sets. Dev console: `/zonefish <zone> N`.
- **Abyssal** (tier 6, teal `#43e3d2`): above Legendary, only for pieces from the Abyss. Tiles shimmer teal, icons get teal stars, and the 3D pieces get sparkles in their own glow colour.
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
- **Rod tier decides how long the reel fight is, line tier whether it holds** (2026-10-31; the earlier single difficulty, +35% a tier above the rod capped at 3.2, is gone). Each axis starts from the fish's tier on matched gear (`MATCHED_DIFFICULTY`) spread a little by species stamina, eased ×0.85 for each tier the gear is above the fish. Weight steps `WEIGHT_STEP` (×1.5 one tier over the rod, ×12 two tiers over, past the run-off cliff); strength steps `STRENGTH_STEP` (×2.5 one tier over the line, where a fast player still lands about half by giving line, ×4 two tiers over). Gloves and the rod boost act on weight. One pond fish in eight rolls a tag (`rollTag`): Feisty ×1.3 strength or Brutish ×1.3 weight, only on an axis the gear already handles.
- Each tier's fish sell for more and have higher stamina than the tier below. Inventory shows rods, bait and cosmetics as the same icon tiles as the shop.

## 19. Top-tier banner, brutal fights, stretch cosmetics

- **Banner:** when the hooked or caught fish is the same tier as your equipped bait (your best catchable tier), a large "<Tier> fish hooked!/caught!" banner shows in that tier's color.
- **Harder reels:** high difficulty means shorter rests, stronger and longer surges, tighter tension coupling and a faster line snap. Tuning lives in `src/game/reel.ts`.
- **Cosmetic prices:** entry items cost 100-400 coins; the top items (Lake King's Crown 75,000, Aurora Mantle 60,000, Starfall Diamond 120,000) are stretch goals worth roughly 25-40 top-tier catches. Casino outfits cost 30-450 chips.

## 20. Perfect cast (skill shot)

- While charging, the power gauge shows a gold zone (power 0.86-0.96). Releasing inside it is a perfect cast.
- A perfect cast drops fish more than one tier below your bait's tier from the pool, doubles the non-common luck weight and removes the "outgrown" penalty, so top-tier fish are much more likely. The bait gate itself is unchanged.
- The client reports `perfect` with the cast; the server trusts it (like reel results), so it is a fun bonus rather than an anti-cheat feature.

## 21. The catch boards: Lake Legends and Deep Sea

- Two boards stand on the back rim of the campfire's terrace, either side of Bram's Kettle (§41; Oscar, 2026-11-16; one Top Anglers board before, where charter catches pushed lake catches off). Each ranks players by their single most valuable catch from its own water: **Lake Legends** by `save.best`, **Deep Sea** by `save.bestSea` (both set in `applyCatch` by `fish.sea`, reset with the account; the sea reset clears `bestSea`). Both rank by coins. The names are a default.
- Each row shows rank, name, level, the fish (tier and name on the lake board; the name alone on the sea board, where every fish is tier 5, with gold kept for the zones' legends; ✨ if shiny) and its sell value, five rows a board. Sums from a million up are shortened to three figures (`boardSum`, `src/game/format.ts`: 2.45M, 18.4M, 2.45B) so a long name fits beside them.
- **Trophies:** over each board's roof stands a wooden mount, a tan plank face in a dark frame so dark and pale fish both read against it, with a model of that board's number one catch (`buildFish` with the row's fish and ✨) and, under it, a brass plaque with the holder's name, big enough to read from the logs across the fire. Whatever the species and its size, the fish's whole outline is fitted to one box on the mount, 1.4 m by 0.8 m; one that is taller than that for its width (the Kraken with its arms out, a round bluegill) stands up to 1.2 m high against a back board made taller for it. They change whenever the boards do (`Hub.setLeaders`, which draws a board again only when its rows changed); each new fish is compiled and drawn once as it is mounted (`World.warm`), so the first look up at a new record doesn't stall, and the one it replaces is freed (`disposeFish`, which leaves the geometries every fish of a kind shares). A board with no catch on it shows a bare mount and "No catch yet"; offline the lake board shows the player's own best. The trophies stand at the roof's front edge, in front of the crown's bulbs, and are seen from the logs and the ring, not from the reading spot under the roof.
- A save from before the split may hold a sea fish as `best`: on loading it moves to `bestSea`, and the lake record becomes the best size the Fishdex still knows of, at the fish's plain price (`splitBest`, `src/game/state.ts`), so the player stays on the lake board. A shiny or clean bonus on that old lake catch is not recovered.
- E at Lake Legends opens the Anglers tab; E at Deep Sea opens it scrolled to the charter list. The tab ranks the players online by level, and lists both boards' rankings beside them. A board is read from a step back from the seat wall it stands behind; right at the wall its seats are offered instead (§41).

## 22. Music and coin HUD

- Background music is generated live with Web Audio, in a quiet Outer Wilds / Timber Hearth style: a lilting 6/8 banjo-like fingerpick (Karplus-Strong strings) over D-G-A-D-Bm-G-D-A, a soft whistled pentatonic motif, a slow warm drone and a faint campfire crackle. It is mixed low (`MUSIC_VOL` in `audio.ts`) so it sits under the lake ambience, so there are no audio files and no licensing. Press **M** to toggle; the choice is remembered in localStorage.
- The top bar shows coins in a gold pill that pulses whenever the amount changes.

## 23. Prime fishing spots

Where you stand when you cast matters (server-checked from the player's position):

| Spot | Where | Luck | Bite wait | Pool |
|------|-------|------|-----------|------|
| Prime | Outer pier and T-platform (z ≤ 5.4) | ×1 | ×1 | full |
| Inner pier | Rest of the pier | ×0.7 | ×1.25 | full |
| Poor | Anywhere off the pier (shore, hub, Reed's wharf) | ×0.35 | ×1.7 | top tier your bait could catch is removed |

A HUD chip shows the current spot's quality; the cast toast names it. Perfect casts still apply on top.

## 24. Day / night cycle

A full day is 10 real minutes (`DAY_SECONDS` in `daynight.ts`), driven by the wall clock so every player sees the same time. Roughly: day 0–45%, dusk 45–60%, night 60–85%, dawn 85–100%.

- Sky, fog, water, clouds, sun/moon light and hemisphere light blend between day, a warm dusk/dawn tint, and night; stars fade in.
- Hub lamp posts and the pier lanterns glow brighter and cast warm point light at night.
- Fireflies hover over the lake and blink at night, fading out by day.
- Dev: `__game.day(0.72)` freezes the time of day (`null` resumes the clock).

## 25. Persistent leaderboard

The two catch boards are halls of fame built from every account's best catch in each water (`AccountStore.hall` for the lake and `hallSea` for the charters, top 8 each), so players stay on them while offline. The server sends one `hall` message with both lists (`rows`, `sea`) on join and whenever either changes. Offline play shows only the local player, on the sea board only once they have a charter catch.

## 26. The town

The land hub is a small cozy fishing town wrapped around a cove like a harbour: two pine-topped headlands frame the water, a timber quay runs across the back of the cove, the pier runs out of the quay's middle to its T end with a short jetty either side of the root, and a rock islet with a leafy tree and a lantern, 30 m past the T end and a few metres left of the pier's line, is the eye's target (casts stop short of it). Marlow's stall and the Smokehouse stand behind the quay facing the water with the Fishmonger and Net Mender beside them (Marlow's stall is a mint clapboard BAIT & TACKLE shack with a red shingled roof and a carved fish in the gable: he serves from its window, in a fishing vest and a bucket hat with lures pinned to it, with the five baits in jars on the sill, lures and spools of line inside, the five rods racked on its street side and a LIVE BAIT chalkboard out front; `src/game/baitshop.ts`); a bench and a flower pot stand on the deck at the quay's east end (nothing else stands on the deck or the quay road), the wardrobe mirror at the deck's front west corner, clear of Reed's lane. A cobbled quay road runs along the deck's rear in front of the two stalls for the deck's whole length, wraps round each of its rear corners and carries on down as a lane: west as Reed's lane to his wharf, east as the campfire lane, so one cobbled way leads from the square to both. Lanes end in rounds of cobbles and bend in rounded joins, the cobbles follow the terrain as it is drawn, and no shore rock or reed lies on them. Under the docks the ground is held just below the planks, so the deck shows a clean edge where it meets sand and stone. A cobbled main street climbs from the quay to the well square, which is a junction: lanes run round the village (past Wren's Cottage down to the worm patch and the quay's west end, and past the Net Mender down to the campfire on the east headland), and three more cottages stagger up to the casino gate. The campfire is Anglers' Rest, the town's meeting place (§41): a round cobbled terrace 11 m across on the east headland, facing the cove, with the Great Fire in its middle, log seats round it, a low stone seat wall along its cove side and a crown of string lights on tall posts round its rim. Thank You, Lake Legends, Bram's Kettle (the fire keeper's stall) and Deep Sea line its back rim, with a flower bed in the bay past Deep Sea, in front of a retaining wall, a hedge and the town's picket fence; steps on its lake side go down to Skipper's Beach and the rocket jetty. The campfire lane runs from the quay's east corner along the foot of the hill to where the village ring's lane meets it, by a signpost, and from there under the ANGLERS' REST arch onto the terrace. The ground is levelled (`levels` in `MapDef`: built up toward the water, dug into the hill), and the camp's layout is `CAMP` in `src/data/maps.ts`. The cottages stand 4-5 m back from the street; each has windows with flower boxes on all four sides (lit at night), a woodpile and a water barrel behind, and the four lower ones a fenced garden beside the door. The town's pad is grass, worn to dirt only along the paths, round the square and in front of the stalls (`dirtWeight` in `src/game/env.ts`), with leafy trees among the houses and pines round its edge (`town.trees`). The quay's west end is Captain Reed's corner: his lane runs down past the worm patch and the Furthest Out board (E, "take a look", opens the charters explanation with the Kraken), along the water's edge and under a CHARTERS arch onto his wharf, a short timber landing along his beach. Reed stands on the boards under the arch, where the walk down the lane shows him first; players land back from a charter just inside the arch; and his seaplane is berthed nose-on to the wharf's face, tied to two mooring piles. The wharf is a dock to stand on, not to fish from (see Prime fishing spots). Layout lives in `MapDef.town` (`src/data/maps.ts`), the shoreline and docks in `src/game/env.ts`, geometry in `src/game/town.ts` and `src/game/hub.ts`.

- **Decision (2026-11-08)**: the map was reworked from the straight-shore layout to the "Harbour crescent" plan, the hybrid judged best of three options (37/40). The brief, the three plans and every round's scores are in `docs/map-rework/` (`JUDGING.md`, `harbour.md`); the greybox and build findings in `docs/map-rework/HANDOFF.md`.

- **Townsfolk**: Old Salty (pier tips), Pip, Granny Wren and Captain Reed. Press E to talk; lines cycle and some change at night.
- **Messages in bottles**: 7 hidden around town, shore and pier. Each pays 40 coins once; finding all 7 pays a 300 coin bonus. Found bottles are saved per account (`SaveData.bottles`); the server verifies the player is within 4 m.
- **Coziness**: lantern posts line the quay, the street and the lanes; none stands on a walkway. Four stand on piles in the water a step off a deck's edge (the quay's front pair, the east jetty's end and the lake end of Reed's wharf), one stands behind the quay road beside Marlow's stall with his barrels and crate, one behind the east bench, and the rest beside the cobbles (one in the fork where the village ring's lane meets the campfire lane, one by Reed's arch). The four on piles, two of the others, three of the village's, the lantern on Reed's CHARTERS arch, the one under the awning of Bram's Kettle and the one on Skipper's Beach cast real light at night (a fifth pile, off the end of the rocket jetty, only glows); only the eight lights nearest the player are on at once (`LightPool`). Benches and planters ring the plaza, string lights span the mouth of the main street between the two stalls (from a pole beside Marlow's shack and a mast on the Smokehouse, no posts on the quay road), the square, the gate and the campfire's terrace (its crown, §41), a bench on the east jetty looks across the water to the campfire, a picnic blanket overlooks Reed's lane, and firewood is stacked by Wren's Cottage. Bottles rest on the ground or the deck; the rowboat is moored beside the west jetty.

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
- Tables are played **in the world**: walk up, hold the fish to bet (keys 3-5), then aim and click the 3D red/black/green patches, or the DEAL / HIT / STAND / DOUBLE buttons on the felt. Cards are laid out on the table and a small status line shows the bet and result.
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
- "Turn in all" at the Prize Counter turns in every hotbar fish worth a chip or more in one press.

### Casino unlocks (bought with chips)
| Item | Effect | Type |
|---|---|---|
| Tackle Vest | +2 inventory slots | permanent |
| Lucky Charms (3 tiers) | +5/10/15% value on every fish caught after buying (applied at catch, not at sale) | permanent, total bonus capped |
| Quick-Reel Gloves | shorter reel time | permanent |
| Shiny Lure | 3 casts a pack, each hooks a shiny, at the lake or at sea (where a shiny pays five times the coins and the Black Pearls); sold one pack or ten at a time | consumable, re-bought |
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
- **Window** (top right, `src/game/chatbox.ts`): the last 8 lines, each removed 5 minutes after it arrived. On a phone the closed window is only a glance: the last 3 lines from the last 30 seconds, each cut to one line with an ellipsis, and the whole window never taller than a quarter of the visible screen and ending above 👋 (a browser's address bar and tabs can leave little of a landscape screen, so then it holds 2 lines; the oldest lines that don't fit whole are dropped, never one cut in half); older lines are still in the full log until their 5 minutes are up, and the 💬 badge counts unread lines as before. The 3 lines, 30 seconds and quarter-screen cap are play-test defaults (`TOUCH_SHOWN`, `TOUCH_GLANCE_MS`). "Press Enter to chat" sits under it. The window is half transparent while playing and full strength while typing. Enter opens the input (movement and hotkeys pause), Enter sends, Esc cancels. The browser always releases the mouse on Esc, so cancelling shows a small "click to keep playing" overlay instead of the pause menu (Esc again opens the menu). Tab while typing switches between all worlds and the current world; lines from another world are tagged with its name. Typing `/` lists the player commands (`/bug`, `/idea`, `/feedback`; dev console commands stay unlisted) under the input, and Tab completes a half-typed one, stepping through several on repeat presses (Shift+Tab steps back). In slash-command text Tab only completes, so it never changes the world filter mid-report. Phones have no Tab key, so touch mode has no completion.
- **Typing on touch** (`src/game/softkeys.ts`, `ChatBox`): 💬 opens chat over the whole screen with our own keyboard in place of the phone's, which covered most of a landscape screen and hid what was typed. The keyboard takes the bottom 40% and a little more: its panel runs on under the keys to the foot of the screen as an empty lip that keeps the bottom row 32 real screen points up (`KEYS_CLEAR_PT`, `keysLiftPx`; about 54px of the phone layout, 38 on a tablet; it was 26px, about 15 points). An iPhone's home bar reads taps in its bottom 21 points as the start of a swipe to another app, and two as "Type to Siri", so players' spaces went to the phone instead of the chat (2026-11-16); a web page can't turn those gestures off, only stay out of the strip. The keys are letters with ⇧ (a capital for the first letter and after ". ", "! " or "? ", not in slash commands), a 123 layer for numbers and punctuation, ⌫ (repeats while held), space, Send and 🌐. The field with a caret and a Send button sit just above it, the chat lines above that, and ✕ and the world filter ("🌍 All worlds" / "📍 the map", Tab on desktop) take the 💬 and 🎒 corner. With nothing typed, /bug, /idea and /feedback show as gold chips that fill in the command; typing "/" narrows them. The chat lines above show every line still kept (up to 100), whole and wrapped, and scroll back with a finger: the log starts at the newest line and follows new ones only while it is at the bottom, so reading older lines is never interrupted. The world shows through a light dim and still takes drags to look; the action, Jump and top buttons and the top-left chips hide. A tablet's hardware keyboard types into the field. 🌐 switches to the phone's own keyboard (emoji, other languages, voice typing): the field moves to the top, clear of it, with its text at 17 real pixels (`nativeFontPx`) so iPhones don't zoom the page. No cursor moving: typing adds at the end. Keyboard height, key size, the lip and the dim are play-test defaults
- **Bubbles** (`src/game/avatars.ts`): players in the same room and map see a speech bubble over the speaker with the whole message, wrapped onto as many lines as it needs (`wrapBubble`, `src/game/bubbletext.ts`: lines up to 440 canvas pixels wide, about 1.9 m, evened out so the last isn't one stray word; a word wider than a line is cut). The bubble grows upwards, so its tail stays just above the name tag. It stays 6 s, plus 50 ms for each character past 40 (10 s for a full 120-character line, `bubbleMs`), fading in the last second. Only nearby players see it (full within 15 m, gone by 20 m), and it fades out when you stand right on the speaker (gone within 1.2 m, full again at 2.5 m) so it never covers your view.
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
- **Shop rule:** each item has a `shop` (`stall`, `casino`, `earned` for rank outfits, `legend` for sea legend pieces or `zone` for sea zone sets). Earned items are never sold; legend and zone pieces are sold only by Captain Reed once unlocked (`reedBuyError`, `buyReedPiece`; `REED_SHOPS`). The server sells an item only at its own counter: stall items for coins next to Marlow, casino items for chips at the Prize Counter (`buyCosmetic` in `economy.ts`, checked in `server/room.ts`).
- **Rarity:** tier 0 Plain (grey), 1 Fine (green), 2 Rare (blue), 3 Epic (purple), 4 Mythic (orange), 5 Legendary (gold). Finishes climb with the tier: matte cloth, then satin, brass and gold trims, glowing gems, and for legendaries breathing glow trims plus stars that circle the wearer.
- **UI:** every item has its own drawn icon (`src/game/cosicon.ts`). Mythic tiles have a warm glow; legendary tiles are gold, shimmer and twinkle; casino items carry a small pink chip in the corner. The details panel shows the rarity, a one-line blurb and a live try-on preview.
- **Models** (`src/game/character.ts`): low-poly primitives on the capsule body, built once per item and cloned for every wearer (geometry and materials are shared, small parts merged into one mesh). No lights are added; glows are emissive materials. Moving parts many wearers share (drips, bubbles, sliding seams, Zs) are one mesh moved on the CPU once a frame, and only for items someone in view is wearing. The sea legend pieces, the biggest models, are built by hidden stand-ins in idle moments while the page loads and compiled with the scene (`Avatars.warmLegends`, `World.warm`), so the first one worn nearby doesn't stall the game; every `legend` item is covered, so new sets need nothing there.

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

- **Login:** `/login` on its own opens a small "Dev login" panel (Username and Password, both starred out, Enter sends, Esc cancels; `DevPrompt`, `src/game/devprompt.ts`) so nothing readable shows when the screen is shared; it sends `/login <user> <password>`, and the typed-in-full form still works. The mouse is let go while the panel is open and taken back when it closes (sent or cancelled), as after closing a menu; if the browser refuses, the usual "Click to keep playing" overlay stays. Checked on the server against the `DEV_USER` and `DEV_PASS` environment variables. With either unset the console is off. A login lasts for that connection only; `/logout` ends it. Five failed logins lock that account out for 15 minutes, and 30 failures across all accounts lock everyone out for 15 minutes. The panel's values stay out of the chat log (the echo is `/login ••••`); typed in full, the password is masked in the echo. The password is never logged; the server logs each command.
- **Commands** (`server/dev.ts`): `/help`, `/coins N`, `/chips N`, `/level N`, `/bait <id> [N]`, `/rod <id>`, `/fish <id> [cm] [shiny]`, `/tp <map>`, `/time day|dusk|night|dawn|auto` (only for you, including the server's night bite odds), `/dig` (clears the worm patch cooldown), `/emote <id|all> [off]` (gives or takes back a bought emote, §40), `/level N` also gives the ranks up to N (but no gifts), `/backpay` lists every level-50 account still owed XP from the old level cap with the level it would reach, its catches and the XP they add up to (an account whose catches add up to less than reaching 50 takes got its level some other way, like `/level`), and `/backpay apply` pays them all (online players get their new save and a notice), `/resetpass <name> <new password>` (for a player locked out of every browser: sets the password and signs out all their browsers; `/resetpass <name>` alone opens a panel asking for the new password starred out, and the password is masked in the echo and never logged; a name with spaces needs the full typed form), `/rename <name> > <new name>` (changes a player's name for them past the 7-day wait, online or not, for a player who wants a name back; the `>` splits the two names, since names can hold spaces; the same checks as a player's own change apply, the room and server hear "X is now Y" if they are online, a browser that still has the old name saved follows the account, and the 7-day wait starts again from this change). Commands change the real save. A bad id lists the valid ones.

## 36. Feedback and Discord

Two optional Discord webhooks, each set as a server environment variable and never sent to the client. With a URL unset, that feature is off. Mentions are always disabled, so nothing a player types can ping anyone.

- **Feedback:** any player can type `/bug <text>`, `/idea <text>` or `/feedback <text>` in chat. The text goes to the server as a `cmd` message, never to chat. The server cleans it, caps it at 500 characters and runs the chat profanity filter. It allows 3 reports per account and 20 server-wide per 10 minutes. It then attaches context the client can't fake: account, level, map, position, room, browser (from the socket's user-agent), time and build (`RENDER_GIT_COMMIT`). Each report opens one forum post in `DISCORD_FEEDBACK_WEBHOOK`'s channel, titled `[Bug] …`/`[Idea] …`/`[Feedback] …` (on a plain text channel it is posted as a normal message instead). `DISCORD_FEEDBACK_TAGS` (`bug=<id>,idea=<id>,new=<id>`) adds forum tags. If the webhook is unset or Discord is unreachable, the report is kept in storage instead (Postgres `feedback` table, or `feedback.jsonl` next to the JSON saves). The player gets a thank-you line in chat either way.
- **Join pings:** `DISCORD_JOINS_WEBHOOK` gets a batched summary of who joined: name, new player or level, map, and players online. The first join after a quiet spell waits 30 s to gather a burst, then there is at most one message per 5 minutes. A player who was online within the last 10 minutes isn't posted again, so reconnects and redeploys stay quiet.

## 37. Tip jar

Players who enjoy the game can tip Oscar on Ko-fi (`KOFI_URL` in `src/data/support.ts`). **A tip never gives anything in game**: no coins, chips, perks or head start, because anything that feeds the casino would make tips real money for gambling currency. The only thanks is cosmetic recognition.

- **Where it shows:** a "Support Lakeside" section in the ⚙️ settings sidebar (under Sound) with a ☕ Tip on Ko-fi link, a Support section in the README, and the tip nudge below.
- **The tip nudge:** a small card, "Enjoying Lakeside?", that says the server costs money to run, links the Ko-fi, repeats that a tip gives nothing in game but the 💗, and tells the player to write their name in the Ko-fi message. It has a "Keep fishing" button and closes like any menu. It shows at most once per milestone level, 20, 30 and 50 (`NUDGE_LEVELS`, `src/game/tips.ts`), so three times in an account's life.
  - **When it is due:** after any level-up that leaves a milestone at or under the player's level unseen. Reaching 20, 30 and 50 each make it due, and a player already past some of them (from before the nudge, or back-paid past them) gets one card for all of those after their next level-up, never on joining. Never for supporters, and never offline.
  - **When it opens:** in a lull, not at the level-up itself. A catch has been released and nothing cast since, the player is at the pond, and has stood idle for a second (`NUDGE_BEAT_SECS`) with no menu, chat, banner, "Heading in" card or Lucky Wheel spin up. So it never lands in a fight, on the rank banner (20 Deckhand, 30 First Mate, 50 Admiral), after a lost fish, on a charter or in the casino. A player who casts again at once gets it after a later catch, at the latest on the walk to sell. One that came due on a charter opens back at the harbour.
  - **What is saved:** the milestones are kept with the new-player tips (`nudge20`, `nudge30`, `nudge50` in `SaveData.tips`) and marked when the card opens, not when it comes due, so a player who leaves first is asked after their next level-up instead. The dev console's `/tips` clears them with the tips.
- **The 💗:** a supporter gets a heart before their name on their floating name tag, in the Anglers list (online and top anglers), and on their chat lines, and is listed on the "Thank you" board on the campfire's back rim (newest first, 5 names, then "and N more"). It is kept on the account, not the save, so an account reset keeps it.
- **Linking a tip to a player:** Ko-fi posts each tip to `POST /kofi`. The server checks Ko-fi's verification token (`KOFI_VERIFY_TOKEN`; with it unset, every request is turned away), then looks for a Lakeside name written in the tip message as a whole word, falling back to the tipper's Ko-fi name. A message naming several players matches nobody. A matched player gets the heart at once, everyone gets the new supporters list, and the player, if online, a thank-you notice. Retries of the same Ko-fi message id are ignored. The tipper's email is never read.
- **Discord and the dev console:** `DISCORD_TIPS_WEBHOOK` gets one message per tip (amount, Ko-fi name, message, and who got the heart, or a reminder to give it by hand). `/supporter <name>` in the dev console gives the heart; `/supporter <name> off` takes it away.

## 38. Endgame

Planned 2026-10-30. Built today: titles, level rewards and levels past 50 (§38.4), the Smokehouse's snacks and dishes (§38.2), and charters (§38.1, rebuilt since the plan). Not built: the Weekly Derby (§38.3), server-checked fights (§38.5), the Chef's Special, the Smokehouse's spices and group charters (TODO.md Ideas).

**The problem:** everything unlocks by level 15 (~3,200 XP). Levels 16-50 take ~66,000 more XP (~1,000 catches with top gear) and give nothing, and a maxed player earns ~1,100-3,100 coins a catch with little left to buy once the cosmetics and casino perks (455 chips) are owned. Coins, fish, XP and chips all stop mattering at about the same time.

**The plan:** four loops that feed each other, with no resets or prestige (decided).

- **Charters** (§38.1) are the endless ladder: they cost a fee and coins for the rod and the hold, and give sea fish, coins and Black Pearls.
- **The Smokehouse** (§38.2) turns spare fish, cheap ones included, into snacks and dishes: buffs that earn more coins, XP and shinies. Their planned help for charters (spices) is shelved.
- **The Weekly Derby** (§38.3) gives a reason to log in each week.
- **Titles, level rewards and levels past 50** (§38.4) give the long tail.

### 38.1 Deep-water charters

**Built** (2026-11-01 to 2026-11-14), and changed a lot from the first plan, which had numbered levels, fares, a fixed number of casts, provisions, Sea Legs and a fast track. Play tests replaced it with "a place to earn" (REELING.md, "A place to earn" and "The hold and the coin retune"). The numbers live in `src/data/dive.ts` and REELING.md, so this section gives the rules and a few headline figures. The words on screen are charter, zone, hold, fee, Easy / Fair / Tough / Too much, rod steps, boat parts, markers (Abyss only), Cast off and Head home.

Two goals (decided 2026-10-30): charters get harder but never impossible, and every charter gives the player something good and a clear next thing to go for. The second goal is why the sea became a place to earn, with pay by place.

**Captain Reed and the harbour**
- Captain Reed stands at the quay's west end, with his seaplane in the cove. His chart is the charter menu: the zones, what a fish pays, the fee, the Deep Sea Rod, the boat parts, the hold, and a Wardrobe tab (below). A charter runs as an instance: **Cast off** leads to the player on a boat in the sea.
- The player needs the **Deep Sea Rod** (level 20, 100,000 coins; `DEEP_SEA_ROD`). It is the only thing in hand at sea, and the hotbar waits as it was until home. Casts at sea use no bait, because Reed's boat has it.

**Zones** (`ZONES`): The Shelf, The Drop-off, Kelp Deep, The Twilight and The Abyss. Each has its own sea, sea species and legends. Zone fish run 0.8 of a tier harder with each zone out (`SEA_TIERS`). A zone reads **Easy, Fair, Tough or Too much** for the player's rod (`ratingOf`, `RATING`). After a rod step the same water gets easier and pays more, as at the lake.

**The hold and the fee**
- A charter fills a **hold** of landed fish (`HOLD`): 10 fish to start, then 15 / 20 / 25 / 30. A fish that gets away takes no place. When the hold is full the charter waits at sea for **Head home** ("Hold's full"). Four minutes is the shortest a charter should go.
- Captain Reed sells each bigger hold for coins once the next zone is open (25,000 / 300,000 / 8,000,000 / 10,000,000). It is the place for spare coins, and makes charters longer, not faster.
- Casting off costs a **fee** by zone, about two average fish (`CHARTER_FEE`): free on the Shelf, then 7,000 / 14,000 / 27,000 / 54,000 coins. It isn't refunded if the player heads home early.

**Two kinds of money** (the lake and the sea feed each other)
- **Coins** buy the hold's levels and the rod. From the Drop-off on, a zone's fish pay about twice the coins of the zone before (about 1,470 coins a fish on the Shelf, 27,200 in the Abyss).
- **The Deep Sea Rod** has one track (`ROD`): eight **rod steps** of 0.4 of a tier, two a zone, on sale once the zone is open (50,000 coins for the first, 8,400,000 for the last), then endless **Abyss levels** of a tenth of a tier from 2,625,000 coins, each 12% dearer (1,750,000 until 2026-11-16). The rod's tip glows a new colour as it levels.
- **Black Pearls** only come from sea fish (1 / 3 / 8 / 20 / 50 a fish by zone, double for a Feisty or Brutish fish, five times for a legend or a shiny; `PEARLS`). They buy the four **boat parts** that open the zones (`BOAT_PARTS`): Storm sail (25 pearls, opens the Drop-off), Kelp cutter (150), Deep lamps (3,000) and Iron keel (25,000). The screens show pearls as progress to the next part, not as a purse.

**The pace.** Played straight, the Abyss opens after about 8.5 hours of charters; with Shiny Lures, about 5. The first two zones come fast (the Drop-off after about 8 minutes) as a taste of the ladder. The checks are in `scripts/seaeconomy.ts` and REELING.md, and `/lakestats` in the dev console reports chips per lake hour from real play.

**The boost: Shiny Lures.** Playing charters straight is the slow base loop. A Shiny Lure from the Prize Counter (15 chips for 3 casts, the same in every zone) makes the fish a shiny, which pays five times the coins and the pearls. Reed's chart counts the charters to the next boat part plain and with lures, and shows the lures held with their switch. Lakeside chips feed the sea, and the sea's coins feed the rod.

**The Abyss.** Only the Abyss has **markers** (`MARKER`): every fifth fish landed reaches the next marker (every third until 2026-11-16), each a tenth of a tier harder and 12% richer in coins and pearls, numbered from 1. A charter there fills a hold like any other, climbing markers as it goes: six in a 30-fish hold. How fast a player's furthest marker moves is set by the rod's Abyss level prices, not by the fish a marker: a marker and a level are both a tenth of a tier, and a marker's pay and a level's price both grow 12%, so each level takes about the same time to earn however far out the player is (about 23 minutes a marker played straight and 13 with Shiny Lures in the sim). Each player's furthest marker goes on the **Furthest Out** board by Reed's lane. The Abyss is where the endless play lives.

**The Abyss's look** (`ABYSS`, `src/data/sea.ts`; Oscar's picks, 2026-11-19: the violet band and the whitecaps back). The Abyss is a standing night, the way the Twilight is a standing dusk. Whatever the clock says, the sky and the fog are near black, with a band of dim violet storm-light along the horizon between the sea and the cloud; the clock only dims it a little at night (`night`).
- **The water** is black and glassy, and the swell reads at all times by the band's light: crests carry a rim of it, a face leaning toward the boat keeps a faint sheen, and thin torn lines of dim foam lie along the breaking ridges (`foam.lines`) in place of the storm's whitecaps, streaks and chop foam.
- **The boat is the only warm light.** Its lamps lay a small pool on the water round the hull, with a few glints (`pool`). Rain, spindrift and the spray on the screen are dimmed against the black, and the lamps catch the rain near the boat.
- **Lightning silhouettes the world** (`flash`): a bolt lights the sky and the far haze from behind the cloud and leaves the fog and the water dark, so the swells, and anything standing in them, show as black shapes; the boat and the players take a short cold light from the bolt's side. Between bolts, sheet lightning flickers inside the cloud with no bolt and no thunder (`sheet`). Lightning strikes only in the Abyss, more often the further out (`lightningAt`).
- **Where it applies:** it eases in with the Abyss's colours over depths 86 to 97 (`abyssAt`), which a charter only sails through, since the Twilight is drawn at 76 and the Abyss from 100; no other zone is changed. Over those depths the Twilight's own atmosphere (`DEEP_LOOKS.twilight`: its violet night, the hidden sun's glow, the lamps turned down at night, the dimmed rain and spray) eases out as the Abyss's eases in; the hidden sun stays down on the horizon and fades there. Lite graphics draws all of it. Only where the look is in does the sea draw the water with the Abyss's shading built in (`seaFrag` with `ABYSS`, `src/game/sea.ts`), so the other zones run the shader they always did.

**What lurks in the Abyss** (`LURK`, `src/data/sea.ts`; `src/game/abysslurk.ts`). The Abyss's three legends are glimpsed from the deck, so what a player sees out there is what they might hook.
- **The Leviathan**, 90 to 180 m out: a plated serpent with ember seams arching through the swell in a pass of 12 to 20 seconds; or standing there for one lightning flash; or, rarely, a breach, its head and neck rearing 24 m out of the water and crashing back.
- **Kraken arms**, 60 to 150 m out: one arm rising out of a far crest, hanging for 5 to 9 seconds with a slow curl and sliding back under; or three to five at once, shown by one flash.
- **The Dreamer's eyes**: three to nine mint eyes open just under the water 5 to 25 m from the hull, off to the side of where the player is looking. They find the player and follow them, and shut at a lightning strike or when looked at for half a second, then open somewhere else, up to twice more.
- **Rules:** sightings are atmosphere only. They change no bite, fight, hold or pay; each player sees their own and nothing is sent. A flash sighting brings its own bolt, held until the swell leaves the view to it clear.
- **Pacing:** most of the time nothing is there. Each kind has its own mean wait (`every`: a pass 6 minutes, a flash sighting 4, an arm 5, several arms 12, a breach 25; the eyes about 2), far sightings never overlap, and at least 30 seconds of nothing follow each (`rest`), so by marker 3 something far shows about every two minutes. They ease in over the first markers (half as often at marker 1; `from`), and by marker 21 come 1.8 times as often and nearer the boat (`deep`, `busy`, `closer`).
- **Cost and lite graphics:** three draws at most, and none while nothing shows. Lite graphics drops the eyes' glow on the water and opens five at most.
- **Staging:** in dev, `__game.world.sea.lurk.show('breach')` (or `pass`, `flash`, `arm`, `arms`, `eyes`) calls one; `scripts/lurkshots.ts` stages stills and clips.

**Legends and Reed's Wardrobe.** Each zone has rare legends (about 1 bite in 20, a long hard fight, worth a fortune); the Abyss has the Leviathan, the Dreamer and the Kraken. Each landing of a sea legend unlocks the next piece of its set, which Captain Reed sells for coins in the Wardrobe tab of his menu. **Built so far:** the Kraken's, the Coiled Leviathan's and the Drowned Dreamer's sets, each with a pet (the Abyssal rarity; §15 and §33, with the five-family outline in TODO.md), and the Kelp Deep and Twilight zone sets. The other legend sets are not built. The same tab sells the deep sea emotes (§40), each at the end of its zone's row, for coins and Black Pearls.

**Not built from the first plan:** Sea Legs, the fast track, milestone chests and zone titles, boat comforts (Fighting Chair, Sonar, Storm Canopy), packing provisions and charter spices (§38.2), the Captain's Feast, a weekly board for the Derby, zone chat lines, the reel-bot curve tests and group charters. TODO.md Ideas holds what is still wanted. The board's records need server-checked fights (§38.5).

### 38.2 Smokehouse

**Status:** built and merged. R1 (the smoker, snacks and stages) and R2 (dishes) are on main; v1's racks and recipes were replaced by the three-stage model below. **Not built:** R3, the spices (Hickory and Chili for the pond, charter spices) and packing dishes for charters at Reed. They are shelved; the "Smokehouse R3" idea in TODO.md holds them. Charters were built without them (§38.1).

**Why it exists**
- **Before the endgame:** a use for the cheap fish everyone sells for a few coins, so no catch is wasted.
- **In the endgame:** a steady boost to coins and XP per hour. Charter spices to help a player through a hard zone were planned too, and are shelved.
- **Kept simple on purpose** (Oscar, 2026-10-30): three buffs, one for each thing the player is grinding at that stage.

**The loop:** catch, then smoke the fish (seconds). Sell it smoked for more, eat it as a **snack**, or cook smoked fish into a **dish** that gives several buffs at once. A **spice** (coins) added to a dish was planned to make it last longer or hit harder, or to help on a charter; spices are shelved (below).

**Three stages, each opened by a first catch** (decided 2026-10-30). The stages are named after their fish, not early, mid and end (Oscar, 2026-10-30), because they all open by about level 12; "endgame" means charters only.

| Stage | Opens | Fish | Smoked fish give | Kitchen |
|---|---|---|---|---|
| Small Fry | Level 3 | Tiers 1-2 | ⭐ XP: tier 1 +25%, tier 2 +50% (the grind here is levels; big enough to see on a 6 XP catch) | None yet |
| Lake Giants | First tier 3 catch (or higher) | Tier 3 | 💰 Coins +15% (the grind here is paying for gear, then chips for the casino perks) | Dishes open: Small Fry and Lake Giants together |
| Jewels & Spirits | First tier 4 catch (or higher), then tier 5 | Tiers 4-5 | ✨ Shiny chance (more coins, chips and XP per hour); dish ingredient only | Dishes with all three buffs |

- **Unlocks are announced:** each stage opens with a banner and Mags's line ("📖 Now that's a fish worth cooking. New recipes!"). Locked recipes show their goal ("Catch a tier 4 fish"), so the next step is always visible.
- **Opening from the Fishdex:** stages open from the Fishdex, and a higher tier counts too (Oscar, 2026-10-30: a player whose first big catch is tier 4 or 5 still gets the Kitchen), so existing players get every stage they've already reached on their first join. They see it once as "New in town: Mags's Smokehouse".

**Where it fits in the game's phases** (agreed with Oscar 2026-10-30)

| Phase | Levels | The grind | What the Smokehouse does |
|---|---|---|---|
| Gear | 1-15 | Levels and coins for rods and bait (the Aurora Rod is 20,000 coins at level 15) | ⭐ XP snacks, then 💰 dishes for the next rod |
| Casino | 15 on | Chips for the perks: 455 chips, about 230 top-gear catches turned in without betting | ✨ and 💰 dishes speed the chips up; spices (shelved) were meant to use up the coins that have nothing else to buy |
| Charters | 20 on, endless | Zones and the rod | Nothing yet: charter spices (R3) are shelved |

- **Charters overlap the casino, on purpose.** They open about 50 catches after level 15, about a quarter of the way through the perk grind, and the casino's Shiny Lures are the boost for charters (§38.1). The Quick-Reel Gloves help in the harder zones.
- **No casino rework for now.** If the play test shows the chip grind is off, `CHIP_COINS` and the perk prices in `src/data/casino.ts` tune it.
- **Buffs apply at catch, like the Lucky Charms** (Oscar, 2026-10-30). 💰 multiplies into the fish's `mult` when it lands (`land` in `src/game/economy.ts`), so it raises the chips a fish turns into as well as its sale price. ✨ makes more shinies, each worth 5× in coins or chips. That makes the Jewels & Spirits dishes the casino accelerator.

Every number in this section is a starting value, to be tuned in play.

**The smoker (R1)**
- **Loading:** at Mags's counter, click a hotbar fish, or press **Smoke all**, to put it on the smoker. It has 5 spots, one fish each. Smoke all skips shinies, because a shiny sells for 5×.
- **Times by tier:** 5 s, 10 s, 20 s, 1 min, 2 min.
- **Offline:** smoking finishes on server time, offline too. Top-tier fish can be loaded before logging off, ready on the next visit.
- **Into the Pantry:** finished fish go there, stacked by species ("Smoked Rainbow Trout ×4"). The hotbar is freed just like selling.
- **Selling smoked fish:** smoked tier 1-2 fish sell to Mags for 1.5× their raw price. It's small money, but it is a newcomer's simplest first visit (fish in, wait, more coins out).

**Snacks: eating one smoked fish (R1)**
- **Which tiers:** tiers 1-3 only. Smoked tier 4-5 fish go into dishes only; a legend is never worth a 5-minute snack.
- **Where:** from the Pantry or the Bag, anywhere except the casino.
- **Duration:** 5 minutes of online time each. More of the same adds time, up to 30 minutes, and **Eat all** does it in one click.
- **One snack at a time:** a different one replaces it; if more than a minute is left, the game asks first.

**Dishes (R2)**
- **The rule, one sentence each:**
  - **The tiers in a dish decide what it does:** each kind of buff at twice the best snack in it.
  - **The number of fish decides how long it lasts:** 3 minutes a fish.
  - Shiny strength for tiers 4 and 5 is defined for dishes only: ×1.5 and ×2.
  - **One exception, XP:** a dish's ⭐ is the best snack's, not twice it, so at most +50%. Past level 50 every level gifts a dish, and a +100% XP dish would nearly pay for the next gift on its own.
- **Cooking:** instant, at Mags's counter, from smoked fish in the Pantry: any species of the right tier, the cheapest first (the best stay for selling, like eating snacks). The cooked dish goes into the Pantry (Oscar, 2026-10-30), to be eaten from there or the Bag whenever the player likes, so dishes can be cooked ahead.
- **Unlocking:** each dish unlocks once the player has caught its top tier or higher (Fish Cakes and Angler's Supper with the Kitchen, the Jewel Platter with tier 4, the Spirit Banquet with tier 5).

| Dish | Made from | Does | Lasts |
|---|---|---|---|
| Fish Cakes | 3 tier 1 + 1 tier 3 | ⭐ +25% XP, 💰 +30% coins | 12 min |
| Angler's Supper | 2 tier 2 + 2 tier 3 | ⭐ +50%, 💰 +30% | 12 min |
| Jewel Platter | 2 tier 1 + 1 tier 2 + 1 tier 3 + 1 tier 4 | ⭐ +50%, 💰 +30%, ✨ ×1.5 | 15 min |
| Spirit Banquet | 2 tier 1 + 2 tier 2 + 1 tier 3 + 1 tier 5 | ⭐ +50%, 💰 +30%, ✨ ×2 | 18 min |

- **Cheap fish matter at every stage:** every dish has tier 1-2 fish in it, so even the top dish needs them.
- **One dish at a time,** on top of the snack. If both give the same kind of buff, **the stronger counts**, with no adding up. That means no stacking maths for players and no caps to explain.
- **Eating the same dish again** adds its time, up to an hour (Oscar, 2026-10-30), like snacks add time up to 30 minutes. A different dish replaces it, asking first if over a minute is left.
- **Free dishes:** Mags hands over a Fish Cakes when the Kitchen opens, and each level past 50 gifts the best dish unlocked into the Pantry (gifts banked before the Kitchen opened arrive on the next join).
- **Each card shows the gain plainly:** "+50% XP · +30% coins · ×1.5 shinies · 15 min", next to what eating the fish one by one would give ("As snacks, one at a time: ⭐ +50% · 10 min, 💰 +15% · 10 min").

**Spices (shelved to R3, with charters)**
- **Shelved (Oscar, 2026-10-30):** R2 shipped Hickory and Chili with a picker in the Kitchen, but they were taken out before the merge to keep the play test to dishes alone. Pond and charter spices were to come back together with charters (R3); charters shipped without them and R3 is still shelved (TODO.md, "Smokehouse R3"). `/smokestats` will show whether players pile up coins with nothing to spend them on in the meantime.
- **What they are:** bought from Mags with coins when cooking; one per dish, optional. They are the Smokehouse's coin sink.
- **Pond spices:**
  - 🌰 **Hickory:** the dish lasts twice as long.
  - 🌶 **Chili:** the dish's buffs are a quarter stronger. On a multiplier it's the bonus that grows, so ✨ ×2 becomes ×2.25.
- **Price:** set by the dish, the same for both spices; the shelved build used 100 coins (Fish Cakes), 500 (Angler's Supper), 5,000 (Jewel Platter) and 20,000 (Spirit Banquet). The aim is about a third of what a spice adds for a player at that gear, so it always pays back.
- **Charter spices (R3, not built):** the idea was that each one answers a charter challenge, for example ⚓ **Storm Pepper:** fights 15% easier at sea. Charters now rate each zone for the rod (Easy / Fair / Tough / Too much) and have no provisions, so this needs a new plan. Some were to be made from sea fish instead of bought.

**Play-testing (after R2).** Players test it at the pond before charters exist. A `/smokestats` dev command shows whether it's working: fish smoked and sold by tier, snacks eaten, and dishes cooked and eaten, all by stage, plus the share of online players with a buff running. The counts are saved with the accounts (Oscar, 2026-10-30), so a redeploy doesn't wipe a multi-day play test. Watch night shinies: ✨ ×2 on the night's 15% is 30%.

**Seeing the payoff**
- The catch card credits the buff: "+120 XP ⭐ Smoked Perch", "+540 🪙 Angler's Supper", "✨ Shiny! Spirit Banquet".
- HUD chips show the snack and the dish with their time left.

**The player's path**
1. **Levels 1-2, before it opens.** The shack stands across from Marlow's, smoking. Mags says "Come back at level 3 and I'll show you what to do with your small fry", and the next-goal line names the unlock.
2. **Level 3: Smokehouse open** (Oscar, 2026-10-30: level 4 was too late, since Minnow bait brings tier 3 fish at level 4 and the Small Fry stage would last minutes; at level 3 the Fly is bringing tier 2 fish and tier 1 catches pile up).
   - A banner, and 3 free smoked tier 1 fish in the Pantry.
   - **Tip `smoker`** on the next tier 1 catch: smoke it instead of selling it.
   - **Tip `snack`** on the first smoked fish: eat it from the Bag for more XP.
3. **First tier 3 catch: the kitchen opens.** A banner, Fish Cakes unlocked, and Mags hands over one Fish Cakes to try. The tip names what to smoke for the next one ("3 tier 1 fish and your Golden Koi"). **Tip `dish`:** a dish combines its fish's buffs, stronger and longer.
4. **First tier 4 catch, then tier 5:** the Jewel Platter, then the Spirit Banquet, each with a banner.
5. **Charters:** charter spices and packing were planned here and are not built (shelved with R3).
6. **Past level 50:** each level gifts the best dish unlocked.

**From v1**
- **Kept:**
  - Mags and her shack beside the Lucky Wheel (and the E priority over the wheel).
  - The menu frame (list and detail pane, Ingredients rows, intro line). Its tabs become Smoker, Kitchen and Pantry, and the intro line now reads "smoke fish to sell or snack on, cook them into dishes".
  - The Pantry and its Bag section, HUD chips, and buffs ticking down in online time only on the server.
  - No eating in the casino, the server checks with the "Get closer" notice, dev `/smoke`, and level gifts going to the Pantry.
- **Dropped:** multi-fish racks, rack times, loading over several trips, the five v1 recipes and their buffs (luck, reel control, the dusk bite), Prime trophy fish, Well-smoked ★ and the third rack.
- **Later:** smoker upgrades and mastery are in TODO.md Ideas; the Chef's Special is not built.
- **No save migration:** Smokehouse data has never shipped on main; only dev and demo saves need `cleanSmoke` to drop v1's racks.
- **v1 details still useful**
  - Mags is stout, with a red headscarf and a leather apron over a rust shirt; warm but brisk.
  - The shack is `buildSmokehouse` in `src/game/town.ts`, with its spot in `src/data/maps.ts`.
  - Rules live in `src/game/smoke.ts`, tuning in `src/data/smokehouse.ts`, saves in `SaveData.smoke`.
  - Buffs tick in the server's 100 ms snapshot.
  - A smoke finished while away is announced on joining.

### 38.3 Weekly Derby

- Each Monday the server picks a contest from a rotation by week number (heaviest Northern Pike, most shinies, deepest charter, biggest night catch, ...). A plaza board shows it; it resets weekly.
- **The reward is a title only** (decided): champion titles for the top 3, and Bronze/Silver/Gold personal targets so the week still counts with few players online. A week that ends while a player is offline pays out on their next login.

### 38.4 Titles, level rewards and levels past 50

Built 2026-10-30 (step 1). Provision gifts go to the Smokehouse Pantry as the best dish unlocked. Charters are built (§38.1) but have no fares or provision slots, so the level 40 reward (a third provision slot) and the free charter fare every 5th level past 50 have nothing to do yet. Decided 2026-10-30: a mix of titles, earned outfits and Smokehouse and charter unlocks; level titles are nautical ranks, because everyone knows their order, so a rank reads as progress at a glance.

- **Titles:** one is chosen in the Wardrobe and shown under the name tag and in the Anglers list. Level ranks, charter zone titles, and Derby titles all go in the same list.
- **Before the ranks** (Smokehouse rework, §38.2): level 3 opens the Smokehouse. The kitchen and its dishes open on the first tier 3, 4 and 5 catches, each with a banner, and the next-goal HUD line names the level 3 unlock beforehand, so players meet the Smokehouse well before the endgame relies on it.
- **Level rewards** (the catches between milestones grow from ~54 to ~250, so rewards grow too):

| Level | Rank | Also earned |
|---|---|---|
| 20 | Deckhand | Charters open |
| 25 | Bosun | Oilskin Sou'wester (hat, Rare) |
| 30 | First Mate | (Smokehouse reward dropped in the rework; to be decided) |
| 35 | Skipper | Storm Slicker (shirt, Epic) |
| 40 | Captain | A third provision slot on charters |
| 45 | Commodore | Brass Compass (jewelry, Mythic) |
| 50 | Admiral | Admiral's Bicorne (hat, Legendary) |

- **Earned outfits** can't be bought: a third cosmetic source next to the stall and the casino. The Wardrobe lists them once earned (only owned pieces show there, Oscar, 2026-11-15); the Title row shows the locked ranks with "🔒 Level 35" so lower levels can see what's ahead. A reward for a feature not built yet (charters, racks, provision slots) takes effect when that feature ships.
- **The outfits are storm gear** (decided 2026-10-30): the Oilskin Sou'wester is a mustard-yellow waxed rain hat with a long back brim and a dark chin cord; the Storm Slicker a matching yellow rain jacket with the hood bunched at the back, wooden toggles and a white reflective chest band; the Brass Compass a round brass compass on a chain whose glowing red needle slowly swings; the Admiral's Bicorne a navy bicorne with gold braid, a gold rosette with a glowing star, a white plume and Legendary sparkles, kept distinct from the stall's Captain's Hat.
- **Rank-up** (decided): the big banner ("⚓ BOSUN ⚓" in gold over "Level 25 · Oilskin Sou'wester added to your Wardrobe", 4.6 s; it replaces the "<Tier> fish caught!" banner on that catch) with the legendary jingle, a server-wide chat line ("⚓ Penny made Bosun!"), and [Wear title] / [Wear it] buttons on the catch card. The mouse is locked while fishing on desktop, so the buttons also answer **T** and **O** while the catch card is up. Text from `rankUp` (`src/game/rankup.ts`).
- **Where it shows:** the title is a smaller gold line under the floating name tag and under the name in the Anglers tab (online and top anglers). The Wardrobe has a Title row (None plus every title, locked ones greyed with "🔒 Level N"); outfits show in their slot once earned (the Wardrobe lists only owned pieces). The level pill's tooltip names the rank, and from level 60 the pill is bronze, then silver (75), gold (100) and an aurora shimmer (150; it holds still under reduced motion). Ranks, titles and pill tiers live in `src/data/ranks.ts`.
- **The max-rank anchor** (Oscar, 2026-11-15): from Lord of the Deep (150, the last rank, `MAX_RANK`) a player gets an anchor in the pill's aurora colours before their name, which everyone sees: on the floating name tag, on their chat lines (the server sends the speaker's level with each line) and in the Anglers lists (online and top anglers). It sits left of the 💗 on the name tag and in chat, and before it after the name in the Anglers lists. It's drawn, not the ⚓ emoji, so it looks the same on every device and stands apart from the ⚓ rank chat lines (`src/game/anchor.ts`). It's kept by level, not by the worn title, so it shows whatever title the player wears. Levels go on past 150; the ranks stop there (decided 2026-11-15: no ranks up to 250).
- **Progress stays visible:** the next-goal HUD line and the welcome banner name the next rank and its reward ("Level 25: Bosun + Oilskin Sou'wester"), and a level-up to a milestone gets a rank banner.
- **No level cap** (decided 2026-10-30, with several players already at 50, where XP used to be thrown away). Past 50, every level costs a flat `xpForNextLevel(50)` (~3,500 XP, about 50 top-gear catches), so the pace never slows and the level stays the one number everyone reads ("Lv 63"). This replaces the earlier Angler Stars idea, which was the same thing under a second number.
  - Every level past 50: one free smoked provision (the best recipe unlocked).
  - Every 5th level past 50: a free charter fare.
  - Admiral stays the last rank. Later milestones give a title and colour the level pill: 60 Fleet Admiral (bronze), 75 Admiral of the Lakes (silver), 100 Sea Legend (gold), 150 Lord of the Deep (aurora shimmer and the max-rank anchor by the name).
  - **Back pay:** a level-50 player's thrown-away XP is estimated from their Fishdex counts: each species' count × a mid-size catch's XP, with the daytime shiny chance (5% of catches at triple XP) and each species' double-XP first catch, minus the ~69,000 XP needed to reach 50. Night shinies and Shiny Lures aren't counted, so it still comes out a little low. (The first version left out shinies and first catches, which ran ~15% low and wiped out about the first 10,000 XP owed; `BACKPAY_VERSION` makes `migrate` redo an unpaid older estimate, less the XP already earned past 50 since.) `migrate` takes the estimate once, the first time the server loads the save after the update (before new catches reach the Fishdex), and keeps it in `SaveData.backPay`. Nothing is paid until the dev console's `/backpay apply`; `/backpay` previews each account's new level first. It pays out as levels and titles, but back-paid levels give at most 5 provisions and 1 fare (`BACKPAY_GIFTS`), so nobody gets 25 levels of rewards at once.
- **Later, species mastery:** bronze, silver and gold per species (catch counts, a trophy size, a shiny), with a Shiny Fishdex page. Shiny counts per species start being saved in step 1.

### 38.5 Server-checked fights

Today the server rolls the fish and size and enforces a minimum fight time, but trusts the client's win. Before the depth and Derby boards, the server sends a reel seed with each cast, the client runs the reel on a fixed 1/60 s step and sends the frames where the button was pressed or released, and the server replays the fight with `Reel` and only accepts a `caught` ending.

### 38.6 Build order

1. Titles, level rewards, no level cap (with back pay), shiny counts.
2. Smokehouse: **built and merged.** The three-stage rework replaced v1's racks; R1 (the smoker, snacks and stages) and R2 (the dishes) are on main. R3, the spices (pond and charter) and packing, is **shelved, not built**.
3. Server-checked fights.
4. Charters: **built, and changed from this plan** (§38.1). The instance, the five zones, the sea species, the hold and fee, the Deep Sea Rod's steps and Abyss levels, boat parts and Black Pearls, Shiny Lures as the boost, and Abyss markers. Not built: Sea Legs, the fast track, milestones and zone titles, provision slots and the sea recipes.
5. Charter rewards: **partly built.** Zone legends, the Furthest Out board and the Kraken's set from Reed's Wardrobe are built (the other legend sets are planned in TODO.md). Boat comforts, the Captain's Feast and zone chat lines are not.
6. The Chef's Special: not built (TODO.md Ideas).
7. Weekly Derby: not built.
8. Later, not built: group charters and species mastery.

## 39. Phones and tablets (touch)

Planned with Oscar on 2026-11-15 (TODO.md, "Full mobile support"; the mobile spec at https://claude.ai/artifact/KV18eWyPMNJYvD8yJdvTHv). Touch mode turns on for touch-only devices (`(pointer: coarse) and (hover: none)`, `touchOnly` in `src/game/touch.ts`) or with `?touch`, straight into the game (the "made for desktop" notice and its "Try touch controls" are gone since step 6; its panel now only shows when the game can't start).

- **Layout:** landscape only, one layout for phones and tablets; an upright phone gets "Turn your phone sideways". The page is laid out wide and scaled to the screen (`enableTouch`, `src/game/game.ts`): the screen's long side / 0.6, between 1000 and 1400px (`touchLayoutWidth`, `src/game/touch.ts`), so phones show it at about 0.6x and sizes in the touch CSS are in that layout. Text on touch is at least about 19px there (11 pt on a phone). In a fight only the gauge, the action button, the level and coins stay up. Under 1300px wide the hotbar centres left of JUMP and the action button. In a browser tab the address bar and tabs take about a third of a landscape phone, so the game offers the Home Screen instead (below).
- **Controls:** a floating move stick wherever the left thumb lands (push to the edge to run), drag anywhere else to look, the big action button (cast, hook, reel, bet), JUMP, 👋 above it for emotes (§40), 💬 and 🎒 top right. The E prompt is tapped. Casino table pieces are tapped. Tapping a hotbar slot takes it in hand; holding one for half a second offers a Drop button over it (G on desktop; `wireHoldToDrop`). Settings > Controls lists the touch controls.
- **Wording:** "Tap" where desktop says "Click", "tap one in your hotbar" for the number keys, no Esc or Tab keys named (`clickWord`, `fishKeys`).
- **Chat:** typed with the in-game keyboard (§30, "Typing on touch").
- **Menus:** full menus fill the screen with their tabs in a rail on the left and "✕ Close" at its foot (at a vendor they stop above the hotbar); fitted cards stay cards. A tap on an item shows its tooltip as a bar at the foot of the screen and tries a locked piece on the preview; picking items works as on desktop. The back gesture closes a menu. Text fields use 28px so iPhones don't zoom into them.
- **Home Screen** (`src/game/homescreen.ts`; Oscar's ask 2026-11-19): added to the Home Screen (or installed), the game opens like an app without the browser's address bar and tabs. The page doesn't go full screen itself: Chrome on Android ignores the page's viewport while full screen, so the touch layout (`touchLayoutWidth`) drew 1.7x too big, and the manifest says `standalone` (not `fullscreen`, which could do the same for an installed game) and `landscape` (`public/site.webmanifest`; `apple-mobile-web-app-capable` in `index.html` for iPhones). A phone or tablet in a browser tab (`offersHomeScreen`: not already opened from the Home Screen or installed, `runningInstalled`) is asked twice at most: on its first visit at the join, then once in a later session in play. **At the join** (`homeAtJoin`, `homeJoinHtml`; Oscar's ask 2026-11-20): when this browser has never joined or played (`homeJoinDue`: no `fishing-name`, which is saved on the first try to join and kept until a log-out, no `fishing-auto`, a save with no progress, so nothing played offline either), the join card itself is up (not a `?name=` link or a returning player's automatic join) and it hasn't been shown here before (`fishing-homescreen-join`), the join card opens on "📲 Get the whole screen" in its own look, in place of the form (the card's layout below), with a 📲 Add to Home Screen button when the browser has offered to install, and "Play in the browser", which goes on to the usual form; "You can find this again in ⚙️ Settings." under it. Nothing about passwords: there's no account yet, and a player who adds the game now makes their account in the Home Screen game, so nothing has to carry over. The name field is let go as the step opens, so the phone's keyboard doesn't come up under it. Installing (or accepting the prompt) swaps it for "Installed! Open Lakeside from your Home Screen.", with "Play in the browser" still there. **In play** a one-time "Get the whole screen" card opens after a later join (`homeTipHtml`; `fishing-homescreen-tip` in the browser, apart from the join's, so a player who played on in the browser at the join sees it once more). It opens online only, never on a brand-new player's first join (they have the start tutorial), and waits for a quiet beat in play (`tickHomeTip`: no menu or card open, so never over What's new or the tip nudge, no banner, nothing on the line, the stick at rest, for 1.5 seconds, and not before 20 seconds after joining so the welcome and a stage's banner have had their turn, `HOME_TIP_DELAY_SECS`). Both say what the player gets ("Add Lakeside to your Home Screen and it opens like an app:", then ✓ no address bar or tabs, the whole screen for the lake, opens straight into the game, no download or app store) beside numbered steps, two columns so they fit a phone with the browser's bars (wording a play-test default, Oscar 2026-11-20: clear steps and the benefit). iPhones and iPads: 1 Tap Share (drawn as Safari's icon; under ··· on some iPhones), 2 scroll down and tap Add to Home Screen, then Add, 3 open Lakeside from the Home Screen, and "Don't see Add to Home Screen? Open this page in Safari" for browsers without it (Brave on iOS, 2026; Chrome, Edge and Firefox have it). A Home Screen game there keeps its own storage apart from Safari's, so it doesn't have the browser's login: a player without a password is told to set one first, with Set a password opening Settings > Account's password form; one with a password is told to log in there with it. Elsewhere, when the browser has offered to install (Chrome's `beforeinstallprompt`, held from page load instead of the browser's own install bar) the card has a 📲 Add to Home Screen button for it (steps: tap it, confirm with Install, open Lakeside), else the steps in the browser's menu (⋮, Add to Home screen or Install app, open Lakeside); an installed app there shares the browser's storage, so nothing about passwords. Settings has a "Home Screen" section with "📲 Add to Home Screen" to open the card again; installing (`appinstalled`) closes the card and hides it. Test browsers (`navigator.webdriver`: the smoke test, the staging scripts) never get the card. The wording of both and their timing are play-test defaults.

## 40. Emotes

Planned with Oscar on 2026-11-15 (TODO.md, "Emotes"; built and merged 2026-11-16, DONE.md). The base four and the deep sea four are built, with their looks and Captain Reed's counter for the deep sea ones; the casino's are designed, not built (TODO.md, "The casino emotes").

- **The emotes** (`EMOTES`, `src/data/emotes.ts`): every account has Wave, Nice!, Yes and No (2.2 to 2.6 seconds). The rest are bought and kept in the save (`SaveData.emotes`; `ownsEmote`, `src/game/economy.ts`). Captain Reed sells four deep sea emotes (9.5 to 10.5 seconds), each behind a gate checked from the save (`emoteGateMet`, `emoteBuyError`, `buyEmote`; the `buyemote` message, at his stand): Kelp Deep needs the three pieces of the Kelp Deep set owned, The Twilight the three of the Twilight set, The Abyss every piece of the Leviathan's, the Drowned Dreamer's and the Kraken's sets with their pets, and Master of the Deep the other three emotes. Each costs coins and Black Pearls, both paid at once, and the client and the server both check the gate, both amounts and that it isn't owned yet (`EMOTE_PRICES`, Oscar's ask 2026-11-16, worked out from the charter sims with the reasoning beside them: Kelp Deep 300,000 coins and 1,000 pearls, the Twilight 2,000,000 and 6,000, the Abyss 8,000,000 and 40,000, Master of the Deep 250,000,000 and 1,000,000; defaults to tune). Master of the Deep is priced for a player who uses Shiny Lures and levels the rod, since Abyss pay compounds with every marker: `npx tsx scripts/abyssjourney.ts` puts it 3 to 5 lured hours after the three sets (it started at 20,000,000 and 150,000, a charter or two for that player). A zone emote's pearls stay at 20 to 40% of the boat part its zone is earning, so it never stands in the next zone's way.
- **At Captain Reed's** (`emoteTileHtml`, `emoteDetailHtml`, `src/game/game.ts`): the emotes sit in his Wardrobe tab, each zone's as the last tile of that zone's sets (the Abyss's after its three legend sets) and Master of the Deep in a row of its own at the foot. Until bought a tile is a mystery: a question mark in the dark with the name, the price ("300k 🪙 · 1k ⚫") and, while the gate is unmet, its progress ("🔒 2 / 3 pieces", "0 / 3 emotes"). There is no preview and no try-on: the look is a surprise the first time it's played (Oscar, 2026-11-16). The panel says the gate and how far along the player is, or the price and which currency they're short of and by how much ("Need 3,000 ⚫ more"), or Buy; once bought the tile shows the emote's icon and "On your wheel". Buying the piece that meets a gate says so ("Bought the Holdfast Pendant · that unlocks the Kelp Deep emote, here at Captain Reed's"), and buying an emote says it's on the wheel ("hold F to play it", "tap 👋" on touch) and when it unlocks Master of the Deep. Toasts sit outside the HUD so they show over an open menu. The wheel's locked slots are unchanged.
- **Picking one:** hold **F** for the wheel (`EmoteWheel`, `src/game/emotes/wheelview.ts`; rules in `wheel.ts`): eight slots round the middle of the screen, the base four on the cross and the deep sea four between them (`WHEEL_ORDER`). The mouse moves a pointer from the middle instead of turning the view, the slot in that direction lights up, and letting go of F plays it; letting go in the middle plays nothing. On touch the 👋 button above JUMP works like F: held, the wheel opens, dragging the finger moves the pointer from the middle and lights the slot in that direction, and letting go plays it; letting go in the middle, which is back on the button, plays nothing. A quick, still tap (under 300 ms and 12 px, `WHEEL_TAP`, `touchRelease`) leaves the wheel open as a tap menu instead: a slot is tapped, and a tap anywhere else, or on 👋 again, closes it. Emotes the player doesn't own show locked, and picking one says where it comes from ("Own the Kelp Deep set, then Captain Reed sells it"). The wheel is one page of `WHEEL_SLOTS`; a longer list would page (`wheelPage`).
- **When:** standing on the ground with nothing on the line: not mid-cast, mid-fight or with a catch held up, not in the air, not with a menu open. A step, a jump, a cast or opening a menu ends it early; so does being moved to another map. Typing in chat and changing the hotbar slot don't. Emotes start at least a second apart (`EMOTE_GAP_MS`).
- **Third person:** the game is first person, and an emote is the one time the player sees themselves. While it plays the camera pulls back from the player's eyes along the way they were looking (`ThirdPerson`, `src/game/emotes/thirdperson.ts`; play-test defaults in `CAM`) and their own model shows in place of the first-person rod (`Game.body`, hidden until the camera is 0.9 m back). `behind` (the base emotes) holds 3.6 m behind and above, aimed over the player's head so they still see who they're emoting at; `cinematic` (the deep sea emotes) sits 5 m back, higher, and circles the player once over the emote; an emote whose scene is too big for that sets its own distance in the catalog (`cameraDistance`: the Abyss stands it 5.5 m back, Master of the Deep 6.5 m). Dragging turns the camera round the player, who keeps facing the way they were. The camera stops short of walls and trees (the map's colliders, checked along the line back from the player) and of the charter boat's wheelhouse (it looks over the deck's boxes and barrels), stays above the ground and the water and under the casino's ceiling, and eases home to first person in about a third of a second when the emote ends. The E prompt and the casino tables' aim wait meanwhile.
- **The look contract** (`src/game/emotes/types.ts`): an emote's look moves the whole character through a pose (lift, lean, turn, squash) and may add its own objects in the character's space; characters have no arms, so the body moves as one piece. `Character` keeps its body, head and outfit in one posed group; a pet and ground effects (a puddle, a glow at the feet) stay out of it, so a hop doesn't drag them along. A look is told the outfit's top and how far it reaches (a box round the outfit, without the pet) so its effects clear hats and capes. `EMOTE_LOOKS` (`src/game/emotes/looks.ts`) maps each emote id to its look, the one place a look is swapped; an emote with none plays a plain bob. `EmotePlayer` (`player.ts`) runs a look on a character and frees it; a look that throws is dropped without stopping the game.
- **The looks** (`src/game/emotes/looks/`, one file per emote; Oscar's picks from the design round, 2026-11-15): Kelp Deep is "Seadragon dance" (`kelp.ts`, 9.5 s): a stand of the set's kelp grows round the player, three little schools of Frondback Seadragons weave between the blades and circle the head like a crown, then swim off as the kelp sinks. The Twilight is "Moonlit oarfish" (`twilight.ts`, 10 s): the Twilight's legend coils up round the player while little jellies drift round them, and melts into light from the tail up. Both wear their zone's in-game colours. The base four share one style, a chunky cream hand cuffed in the body's colour (`hands.ts`; characters have no arms), that pops out beside the head or over the hat, never in front of the body, so it reads from the camera behind the player as well as from in front: Wave is "Mitten wave" (`wave.ts`, 2.4 s), an open mitten waving hello as the body leans into it with a little bounce; Nice! is "Mitten clap" (`nice.ts`, 2.6 s), two mittens clapping three times over the head with a burst of golden sparks on each clap, then a hooray and a hop; Yes is "Glove thumbs-up" (`yes.ts`, 2.2 s), a glove that flips into view with a glint on the thumb and pumps twice as the body nods; No is "Glove finger wag" (`no.ts`, 2.2 s), one fat finger wagging "nuh-uh" while the body leans back and shakes. The hands ride the body's lift, lean and turn, glow a little at night, and stand further out and higher for a wide or tall outfit. Master of the Deep is "Lord of the deep, swimming" (`master.ts`, 10.5 s; 2026-11-16, as refined in its C5), Level 4 of the Abyssal Wardrobe page with the three zones woven in: a whirlpool opens underfoot, six great tentacles rise from its rim and arch over the player, a shaft of light comes down and an orb lights in a gold ring over the head, water ribbons spiral up, four streams of fish circle and sparkles drift, Kelp Deep's kelp sways at the rim, the Twilight's jellies glide and breathe up the Coiled Leviathan's coils as it swims up round the player, and the Drowned Dreamer (a fifth smaller than the Leviathan) swims a loop round the far side, staring; the rim's kelp are small accents. The player floats up half a metre and lands softly. The scene is about 5 m tall and 3.4 m out; the Leviathan, the Dreamer and the near kelp are placed against the camera's circle, so on the player's own screen they stay out from between the camera and the player (another player sees the same scene from wherever they stand, so for them they sometimes cross in front). The Abyss is "Rough crossing, hunted" (`abyss.ts`, 9.5 s; 2026-11-16, concept F6): a patch of the Abyss's dark, rough sea with whitecaps spreads from the player's feet, a toy Pelican (the charter boat with Captain Reed at the wheel, `pelican.ts`) surfaces under them and carries them over the swell, the player lifted onto her deck and pitching and rolling with her (up to about 12 degrees of pitch and 20 of roll, a third less than F6 rocked, at Oscar's ask on 2026-11-16: `TILT`), glancing at each threat, leaning away and ducking; three storm cells build up round the far side and strike six times; the Leviathan glides round in long heavy curves and lunges, the Kraken's arms wriggle and curl, come over the rail and whip the sea, the Dreamer hangs still, stares and lashes; they strike together at 6 s, then everything sinks away. Nothing of a legend passes through the boat or the player: bodies are pushed out of her (`clearOfBoat`), the Kraken's arms are held to a reach and kept out by a smooth field in her moving frame (`smoothClear`), so they never jump from frame to frame. Like Master's legends, the storm and the legends turn with the camera's circle. The legends both looks bring on are built in `legends.ts`. Looks are built from `kit.ts` (easing, a seed from a name, `freeLook`) and `meshes.ts`, whose moving parts are one draw each however much they show (rigs merged into one mesh, ribbons and tubes rewritten each frame, instanced copies, camera-facing glows): Kelp Deep's is 6 draws and about 9,500 triangles, the Twilight's 7 and about 6,700, each under 0.2 ms a frame; each of the base four is 2 to 5 draws and under 600 triangles; Master's is the heaviest to draw at 37 draws and 3 glows, about 15,700 triangles and about 0.11 to 0.13 ms of update a frame; the Abyss's has the most work a frame (its legends' spines recomputed and kept out of the boat): 33 draws and 10 glows, about 16,100 triangles, about 0.16 to 0.18 ms. Every frame is worked out from the time alone and every random number is drawn when the look is built, so each screen shows the same picture. No look adds a light (a new light would recompile every material in the scene).
- **Looks in the world:** the water draws late, over anything see-through, so a look's see-through parts are moved to draw after it, in the look's own order (`drawAfterWater`); the Abyss's sea patch writes depth, so it sets its own order after the water. Pools of light lie 6 cm over the feet, clear of the town's cobbles (`POOL_LIFT`). When a play ends its geometries and textures are freed and its materials kept (`freeLook`; the quad every sprite shares, the name tags' too, stays), since a freed material would recompile its shader on the next play; and a day and a night copy of every look is built while the page loads and compiled in the background (`LookWarmer`, `warm.ts`), like the sea sets' stand-ins, so the first emote played nearby doesn't stall the game.
- **Other players:** the client sends `emote` with the id (or `null` when it ends early) and the server shows it to the others on the same map and charter, like a jump (`Room.emote`, `server/room.ts`). The server checks the player owns it from their save, has no fish on the line and didn't start one within the last second, so a made-up or locked emote never reaches anyone. Avatars play the same look from its start (`Avatars.emote`), with the rod put away meanwhile and the name tag (and a chat bubble over it) rising with a body the emote lifts and over hands it holds up over the head (`EmotePlay.over`; the tag is drawn over everything, so it would hide Nice!'s clap), and end it when told, when their player jumps or casts, or when they walk more than 0.3 m from where it began. A player who arrives mid-emote doesn't see it.
- **Dev console:** `/emote <id|all> [off]` gives or takes back a bought emote, past its gate and price.


## 41. The community zone

Anglers' Rest, the campfire camp on the east headland: a small open-air theatre facing the cove, with the fire as its centrepiece (design A, "Ember Point", `docs/community-zone/a-ember-point.md`; Oscar's pick of the three designs in `docs/community-zone/`, 2026-11-16, after he turned down the first build, a ring with a lawn and a pond behind it). Built: the place, its host, the trophies over the catch boards (§21), sitting, the campfire band, skipping stones and fireworks (TODO.md, "The community zone"). Every name is a default. Where things stand is data (`CAMP` in `src/data/maps.ts`); the props are builders in `src/game/camp.ts`, stood by `Town.buildCamp` (`src/game/town.ts`), and the fire and the boards are the hub's (`src/game/hub.ts`).

- **The terrace:** one round cobbled floor 11 m across, level, 0.85 m above the water, built out about a metre into the cove and edged with a stone kerb. In its middle the **Great Fire**: a stone hearth 2.1 m across with flames to head height and a kettle on an iron tripod at its edge. E within 2.6 m of its middle is "Warm up by the campfire". Round it six log seats for two at 2.9 m, then a clear ring 1.8 m wide all the way round behind the logs, where walkers and board readers go without passing between a sitter and the fire; the logs leave 2 m open on the line of the gate and of the beach steps. Along the cove side of the rim runs a low stone seat wall with twelve plank seats, unbroken but for a stone pier at its middle that carries a lantern (1.2 m to its cap, no taller than someone sitting beside it). Under the wall its footing, a battered face of stone in the wall's courses, runs 1.3 m out and down the rim's bank to the water's edge, so from the pier the terrace is a plinth with the fire on it; the footing and the shallows at its foot are solid, so nobody walks or wades round the cove side.
- **The crown of lights:** ten posts 3.9 m tall round the rim (brass collars and finials, one of them rising from the back of the lantern's pier) and the gate arch's post, with one run of bulbs from each to the next, closed over the way in. None stands in a walking line or in front of a panel. Like every string of lights in town, the bulbs of one colour share a material, so each string bakes into a few draws, and a bare marker at each bulb carries its night halo (`glowTag`'s `of`).
- **The wall of panels** on the back rim, each facing the fire in its own bay and read from the clear ring: Thank You, Lake Legends, Bram's Kettle and Deep Sea. The fifth bay, between Deep Sea and the beach steps, holds a flower bed until the Weekly Derby (§38.3) is built and its stand goes there. Over each catch board hangs its record fish with the holder's name under it (§21).
- **Bram's Kettle and Bram Tinder:** the host's stall, a pale blue clapboard shack 3.2 m wide in the family of Marlow's, with a slate-blue shingled roof, a coral-and-cream awning, a hanging BRAM'S KETTLE sign, a kettle and mugs on the counter, a crate of rockets beside it and a plaque on the counter, "Light it on the jetty". It stands back from the rim with its back in the line of the retaining wall, and the kerb gives way before it to an apron of cobbles, so whoever stands at the counter is off the ring. Bram Tinder, the fire keeper, stands behind the counter in a mustard coat, a dark apron and a red hat (a town NPC with `front`, the way his counter faces: "Talk to Bram Tinder" shows only to a player looking at the counter, as a board's prompt does). He welcomes players and points out the rockets, the boards, the seats, the beach and the jetty in five lines, with one more after dark. He sells rockets: the prompt reads "Talk to Bram Tinder · rockets" and opens his counter, led by his next line (Fireworks, below).
- **The cordon:** behind the panels a strip of turf, then a stone retaining wall 0.9 m high that holds the cut bank (in two arcs, either side of the stall's back), a clipped hedge behind it that stands a metre above its top and ends on a stone gate pier at each end (as wide as the hedge and a hand taller, under a pale capstone), and the town's white picket fence on the bank behind that. The fence runs on from one pier to the gate arch's outer post (its run is solid from end to end). A low stone wall edges the beach's sand: along the beach's back it holds the turf, which runs level to it, and from the hedge's other pier it runs down the east end at the foot of the bank, turns its corner and goes out into the bay east of the beach, past where anyone can wade round its end (solid from end to end; the beach's own fence came out, Oscar, 2026-11-18). A curved flower bed fills the wedge behind Thank You, and a shorter one (1.9 m by 0.43 m) the bay between Deep Sea and the beach steps: it stands outside the kerb on the bank down to the beach, level with the other, and the beach's low wall carries on round its outer face (0.25 m thick, the same top) and back to the kerb beside the steps, so from the beach it is the wall with planting on top. The bed and its wall are solid. With the seat wall and its ledge on the cove side, the only way in is the gate.
- **The gate:** the campfire lane from the quay's east corner and the lane from the village ring meet at a round of cobbles, and from there the lane runs on under a timber arch, ANGLERS' REST (the CHARTERS arch's builder, `Town.arch`). Its two posts are the crown's, 2.4 m apart, each with a lantern on an arm outside it; the crown's bulbs hang from the one nearer the fire. On the cove side of the round stands a signpost 3 m tall with three fingers, Fire, Stones and Rockets, pointing on through the arch above head height.
- **Skipper's Beach:** three stone steps 2 m wide go down 0.4 m from the terrace's lake side, between two of the crown's posts, onto a shelf of sand about 7 m by 5 m that runs out to a round tongue of sand at its south-east, by the corner of the low wall. Past the wall's corner the lake opens into a bay east of the beach, under the bank and the pines (the shore there was moved about 8 m east, 2026-11-18): the water the stones skip on. A bench stands east of a clear 2 m way from the steps to the jetty (two log seats stood there too until Oscar took them out, 2026-11-18, so nobody catches on them by the stones). The Legends' Totem stands alone on the beach's west tip, 3.4 m of carved fish faces on a stone plinth (the lake's four legends, the Leviathan and the Drowned Dreamer, the Kraken on top), its faces turned to whoever comes down the steps; the pier sees it side on against the water. At the east end, by the low wall, are the pile of skipping stones and their sign, "BEST SKIP" over the day's best (below; the sign itself has no prompt). A lantern on a short stone pier west of the steps' foot lights the sand and the Totem's faces at night. Bottle b6 lies at the water's edge west of the jetty's root.
- **The rocket jetty** (`ROCKET_JETTY`, `src/game/env.ts`): timber, 2.2 m by 5.5 m, from the beach out over the open lake, with the rocket rack and a crate across its end and a lantern on a pile off the end's corner. It is a landing like Reed's wharf: a cast from it fishes as the shore does. The rock on the headland's tip lies in the shallows west of its root, a metre off the way onto it.
- **The ground** (`levels` in `MapDef`, `src/game/env.ts`): the bank behind the retaining wall, the beach's shelf, the turf behind the panels, the terrace, the round where the lanes meet and its causeway, the sand at the jetty's root, and a ramp of sand under the beach steps that falls a tread's rise in a tread's depth, so a player on the steps stands on their stone. A level can be the part of a disc between two bearings (`arc`), and a `grass` level is turf whatever its height. The terrain's mesh has a point every 1 to 1.7 m out here and colours the ground by its points, which draws a sawtooth where turf meets sand. So the camp's turf (kerb to retaining wall, the wedge by the lane out to the fence, a level lip over the bank to the beach's back wall, and the bank's top behind the east wall) and the beach's sand (from the kerb and the low wall to the water) are relaid on a fine grid in the terrain's own colours and texture (`Town.relay`), which gives each a clean edge at the kerb, the walls and the fence: sand meets stone or water all round the beach.
- **The forest** kept every tree that stands on main but the east headland's two pines, which moved to (29.2, -3.8) and (28, -6.6), on the bank outside the fence. Adding a clearing that removes a tree shifts every tree planted after it, since the forest places them from one random stream (`buildForest`, `src/game/world.ts`).
- **Sitting** (`SIT`, `src/data/emotes.ts`; `Town.seats`): E at a seat ("Sit down") sits the player on it: two places on every bench in town and on every log seat, and one on each plank of the seat wall, which makes 24 at the fire and 6 on the beach. It plays through the emote system as an emote with no end (`looks/sit.ts`: characters have no legs, so the body hops onto the seat, sinks into a squat and leans back), so the others on the map see it, the player's own view pulls back to a front quarter view (`cameraTurn`), and a step, a jump, a cast or a menu gets them up, back where they sat down from. It is no emote of the wheel. Seats aren't reserved: two players can pick the same one.
- **The campfire band** (`src/data/band.ts`, `src/game/bandsound.ts`, `src/game/instruments.ts`): an instrument stands by each of the fire's six logs (banjo, drum, squeezebox, whistle, washboard, jug), and the prompt there reads "Sit down · play the banjo". A player seated on a log holds its instrument and plays its part until they get up; two on a log each hold one and it is one part. There is nothing to press and no reward, and no message for it: every client works out who plays from who sits where. The town's tune and the band keep to the server's clock (a bar is 2.16 s, the chord is the bar's number in the round of eight) and every choice in a part comes from the bar's number, so everyone hears the same notes. A part comes in on the next bar. While any part plays, the town's own pick and whistle step back on the terrace and the band is the tune; it fades through the arch and down the steps, and a faint band reaches the pier, the quay and the village square over the normal tune (`BAND_MIX`). The music switch silences it. Each seat carries its top's height, so a seated body rests on it (`SEAT_TOP`). Play-test: every part, the levels and the distances.
- **Skipping stones** (rules shared by the game and the server in `src/data/skip.ts`; the stones, counter and sign in `src/game/skipping.ts`; the day's best in `server/skipbest.ts`; Oscar's spec, 2026-11-17). Within 1.2 m of the stone pile, looking at it or out over the lake the way the stones fly, the prompt reads "Skip a stone" (not while seated, with a fish on the line or a cast winding up, in the air, or while the player's last stone is still skipping; someone looking at the sign more than at the pile is reading the sign and gets no prompt; the nearest seat is 2.74 m away and offered from 1.5 m, so the two are never both in reach). **Hold E** (on touch, hold the action button, which reads SKIP there, or the prompt itself) and the cast's own gauge sweeps up and down at the cast's speed (1.1 lengths a second) with a sweet spot marked at 0.75 (a gold band from 0.70 to 0.80 with a notch at its middle); the view comes round to the lake over the first half second and the player stands still, as when charging a cast. **Let go to throw.** A hold under 0.15 s is taken for a slip and says "Hold to wind up, let go to throw."
  - **The score is the number of skips.** The server counts them from where on the gauge the stone was let go: `12 * exp(-(miss / 0.085) ^ 0.75)`, plus or minus 0.7 of the server's own luck, rounded, from 0 to 12. On the sweet spot that is 12 (11 one time in seven); a hundredth of the gauge off about 10; at the band's edge about 6; a tenth off about 4; a fifth off 1 to 3; a third off and further a plop (0 or 1). A hand that lets go within a tenth of a second of the sweet spot gets 3 to 7 six times in ten and a 12 about once in a hundred (`src/data/skip.test.ts`). No coins, XP or other reward.
  - **The server decides** (`Room.skip`): the client sends only the release value (a number from 0 to 1, anything else is ignored); the server refuses it without a word unless the player is on the lakeside map within 2.2 m of the pile, not seated, with no fish on the line and no line out, and their last stone has sunk (one stone in the air a player: the flight's own length, 1.4 s for a plop to 4.3 s for a 12). It tells everyone on the map, the thrower too: who, where they stand, the count, and a stray of up to 2° either side.
  - **Every screen flies the same stone** from that (`skipPath`): out from the thrower's hand along a fixed line from the pile, bearing 165° (out past the corner of the beach's low wall, over the tongue of sand and down the middle of the bay east of the beach; the view comes round to look along it as the throw winds up). A better throw goes out flatter, faster and further: a plop lobs 1.8 m up and drops in 7.5 m from the pile after 0.9 s, a 12 leaves almost level at 16 m/s and first touches 10.5 m out. Then it hops, each hop 0.8 of the last (the first 1.4 m, and 0.17 m more for each skip in the count), to 26.5 m out for a 12, and sinks. Each touch leaves a ring on the water, a few drops and a small plip that rises in pitch and fades with distance; the last a wider double ring and a plop. The thrower sees a small counter in the upper part of the screen tick 1, 2, 3 and end on "7 skips" (or "Plop!"), which stays 2.4 s. The others see the thrower's body wind back and whip through with a cream mitten low at the right hip (a 1.1 s pose in the emotes' style, `looks/skip.ts`, which no client can ask for as an emote), and the stone leave the hand as the arm comes through. The thrower's own view stays first person, with the cast's swish and a small kick as the server's word comes back (a refused release plays nothing).
  - **The sign** reads BEST SKIP over "today: 9 skips · Oscar", or "today: none yet". It is the day's best on the whole server (every room), kept in memory by the server (a restart clears it), sent to everyone when it changes and to whoever joins. More skips take it; a tie keeps the holder; a plop never takes it; a holder who changes their name is renamed on the sign. The day is the real calendar day in UTC (the server had no daily reset to reuse), so it clears at midnight UTC. A screen that shows the record stone holds the sign until that stone has sunk, and the sign is redrawn only when its line changes.
  - **Cost:** twelve stones and twenty-eight rings are made once (a thirteenth stone in the air takes over the one longest out, whose count and sign are settled first), hidden, and compiled as the game starts (`World.warm`); nothing is built while a stone flies. No light, no collider (the forest and the walkable ground are as they were). Offline the game counts the skips itself and the sign keeps that visit's best.
- **Fireworks** (`src/data/rockets.ts` the rockets, the rules and the show; `src/game/fireworks.ts` the sky; `src/game/rocketsound.ts` the sound; `src/game/rocketshop.ts` the menus; `server/rockets.ts` the server's side; Oscar's rules, 2026-11-17). Every name, size, colour, time and level is a default.
  - **Buying:** Bram sells three rockets for coins: a Small Rocket for 250, a Big Rocket for 2,000 and a Grand Finale for 50,000. His counter is the vendors' menu (tiles and a panel, as at Marlow's stall) under his line (as Captain Reed's panel leads with his). A rocket goes into the Bag, where each kind is a stack of up to 99 (a Rockets row, shown once there is one). The server decides the purchase and saves it (`buyrocket`: at the stall, with the coins); rockets can't be sold back, dropped or given.
  - **Lighting:** at the rack on the jetty's end, to a player within 2.4 m who looks at it, the prompt reads "Light a rocket". With one kind in the bag E lights it; with more a small card offers a button for each kind. With none the prompt reads "Rockets at Bram's Kettle", and while a rocket is up "Wait for the sky"; neither has anything to press. The server takes the rocket from the bag, checks the player stands within 3 m of the rack, and tells everyone on the town map (`rocket`: the kind, a seed, the moment on its clock, who lit it). The casino and the charters see and hear nothing.
  - **One in the sky at a time:** a rocket holds the sky for its own length (2.5 s, 5 s, 12 s) and the rack is busy for everyone until then. There is no other wait. A player who joins, or comes back from the casino or a charter, while one is up is sent it and sees it from where it has got to (its sounds from then on).
  - **The show** is worked out from the kind and the seed alone (`rocketShow`), and runs on the server's clock, so every screen draws the same bursts at the same moments. The lake is small (its far shore is 30 to 40 m from the jetty), so the rockets lean from the rack toward its middle, north-west of the jetty, and burst over the water between the jetty and the pier's end, no nearer than 8 m to either. **Small:** climbs a second with a trail of sparks to about 22 m, 15 m out, and makes one round burst 9 m across its radius in one colour. **Big:** climbs 1.45 s to about 34 m, 24 m out, and bursts 14 m in radius; two stars thrown from it burst 0.65 s and 1.25 s later to either side (10.5 m in radius), the second colour and then the first again, each burst with a crackle of pale flecks. **Grand Finale:** nine to eleven bursts from 1.25 s to 8.3 s, each from its own rocket off the rack, side to side across 26 m of sky at 25 to 40 m up, 11 to 16 m in radius, round, two-coloured or a tilted ring, no two in a row the same colour; then a gold willow at 9.25 s, 41 m up and 21 m in radius, whose stars hang and droop until the 12th second. Eight colours (red, orange, gold, green, cyan, blue, violet, pink). As a Grand Finale is lit everyone on the map reads "🎆 Oscar lit a Grand Finale!", as a toast and as a line in the chat window.
  - **Sound** (synthesised, through the master gain, so the sound switch silences it): a whoosh as each rocket leaves the rack, a boom for each burst (a low thump, a roll of noise and, near by, a crack; the willow's is the biggest) and a scatter of pops after a burst with a crackle. Each is quieter with distance (full beside it, half at 60 m, about a quarter across the map), duller, and late by the time sound takes to cross the water; it is scheduled as it comes due, so a player walking hears it from where they are. A show's sounds go through one gain of their own, which is cut when the player leaves the map (into the casino, out on a charter), and nothing is scheduled while the sound switch is off or the audio is asleep. A crackle is one stretch of hiss whose pops are written as a single loudness curve (three nodes).
  - **Cost:** the whole sky is one draw of at most 4,096 quads that face the camera, each a particle whose path the graphics card works out from where and when it was born; a frame sets one number, and nothing is written or allocated while a rocket is up. The buffers are made once with the map, compiled and drawn once with it (`World.prewarm`), and filled once per rocket (a small rocket uses 179 particles, a big one 829, a finale 2,958 to 3,845 over 5,000 seeds; the fullest finale there could be stays under the budget, `rockets.test.ts`). Between rockets the mesh is hidden and nothing runs. A finale adds one draw call to the frame (`scripts/rocket-views.ts perf`, 2026-11-18). The bursts are glows: no light is added and nothing in the scene is lit by them. At night they add to the sky; by day they are drawn solid in their own colour, a little fatter, with a puff of grey smoke at each burst. No collider was added.
- **Prompts** take a facing rule (`face`, as the casino's exit does): a seat is offered to a player within 1.5 m who looks toward it, a catch board within 2 m of its reading spot to one who faces it, and Bram to one who faces his counter. So in the ring, facing a log gives "Sit down" and facing a board gives the board. The beach's bottle lies out of reach of its seats.
- **Lights:** the fire's light and, at night, the lantern under the stall's awning and the one by the foot of the beach steps are the camp's only lights that cast. The crown's bulbs, the lanterns on the arch, the seat wall's pier and the jetty's pile, and the fire's embers glow. The map still shows only the eight lights nearest the player at once (`LightPool`).
- **Cost:** everything static is baked into the town's and the hub's merged meshes (`mergeStatic`); the fire's flames, the trophy fish, the signs' and plaques' faces, the lantern glasses and Bram stay their own draws. Looking at the camp from the pier takes 173 draw calls and from the terrace's cove side 122, where the bare terrace took 218 and 127 with every bulb its own draw (2026-11-17, `renderer.info`).
