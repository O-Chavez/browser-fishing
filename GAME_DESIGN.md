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
- The hotbar is everything carried: 5 slots (7 with the Tackle Vest). Slot 1 always holds the rod in use and slot 2 the bait in use (a stack of up to 99 of one type; more waits in the tackle locker and refills the stack), both drawn with a teal frame and a ROD / BAIT tag; slots 3 and up hold fish only, so fish can't crowd the gear out. Other rods and bait wait in the tackle locker and are swapped in from the Bag (Tab); new rods and bait go to the locker and come straight into their slot when it's empty, holds the same bait, or (when bought) holds something lower tier. Picking up a rod you already own is refused. Running out of bait leaves the bait slot empty. Dropping the rod brings out your best other rod (your only rod can't be dropped). Saves from before this layout keep the equipped rod and active bait in slots 1 and 2, move every other rod and bait stack to the locker, and keep their fish; fish that no longer fit wait in extra slots (dashed outline) past the end of the bar until sold, dropped or lost at the casino. Each map's stall sells a fixed stock (Starter Pond: worm bait and the free Twig Rod; set per map in `stock`). Goods are bought by looking at them on the stall and pressing E; fish are sold by holding them near the vendor and pressing E. You cannot cast while a fish is in hand or when no fish slot is free for the catch, so sell or drop fish before the fish row fills. Dropped items last 30 seconds in the world, visible to the whole room (anyone can pick them up).

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
- **Join screen:** pick a name and body color (live 3D preview). Saved locally; `?name=` skips it.
- **Leaderboard:** the menu's Anglers tab lists everyone online with their face and level, highest first; a "Top Anglers" board stands in the plaza.
- **Faces:** 8 free painted faces (`FACES` in `src/data/cosmetics.ts`, drawn by `src/game/faces.ts`): smile, grin, wink, cat, joy, cheeky, toothy and sleepy. Each is one shared texture on the head sphere, facing where the player looks. New accounts and saves from before faces get a random one; players change it in the Wardrobe's Face section, and can drag the preview to turn their character. NPCs wear the same faces, one each, set by `face` on their `NpcDef` (and `vendor.face` for Marlow).
- **Cosmetics:** hats, shirts, jewelry and pets, tiers 0–6 (see section 33). Marlow's stall sells 6 per slot for coins (Cosmetics/Gear tabs); the casino Prize Counter sells 2 more per slot for chips only. Equipped in the Wardrobe (Tab; also the plaza and casino mirrors). Visible to all players.
- **Sea legend pieces** (deep sea cosmetics step 1, 2026-11-14; the plan in TODO.md, "Deep sea cosmetics"): each landing of a sea legend unlocks the next piece of its set, in order: the hat, the shirt and the jewelry, then the legend's pet on the 4th. An unlocked piece is then bought from Captain Reed for coins (Oscar: a real coin sink for charter players; about an hour of Abyss coins each, the Kraken's 3,000,000 / 4,000,000 / 2,500,000 / 5,000,000). Landings are counted per legend in `SaveData.legends`, from this release on, not from the Fishdex (Oscar); a piece is unlocked when the count reaches its `landing` (`legendUnlocked`). The catch card shows a teal banner ("Unlocked at Captain Reed's · piece 1 of 3"); only the player sees it, no chat line (Oscar). Reed's menu has Charters and Wardrobe tabs (Oscar's play test): the Wardrobe tab, like Marlow's Cosmetics tab, shows each legend set whose zone is open or that has been landed as one row in landing order, with try-on in the preview and the piece's state in the detail panel (`reedWardrobeHtml` in `game.ts`; `reedCosmetics`, `reedOffer`, `REED_SHOPS` in `economy.ts`, so later Sea Gear and zone sets can join it; `buylegend`, checked at Reed in `server/room.ts`). Locked pieces show in the Wardrobe with "Land the Kraken" or "At Reed's". Pets float beside and behind the player's head and ease after them, so they never clip into an outfit (Oscar's play test). The Kraken's set is first: Kraken Crown, Kraken Armor, Kraken Beak, Kraken Hatchling. Dev console: `/landed <legend> N`.
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
| Poor | Anywhere off the pier (shore, hub, Reed's wharf) | ×0.35 | ×1.7 | top tier your bait could catch is removed |

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

The land hub is a small cozy fishing town wrapped around a cove like a harbour: two pine-topped headlands frame the water, a timber quay runs across the back of the cove, the pier runs out of the quay's middle to its T end with a short jetty either side of the root, and a rock islet with a leafy tree and a lantern, 30 m past the T end and a few metres left of the pier's line, is the eye's target (casts stop short of it). Marlow's stall and the Smokehouse stand behind the quay facing the water with the Fishmonger and Net Mender beside them; a bench and a flower pot stand on the deck at the quay's east end (nothing else stands on the deck or the quay road), the wardrobe mirror at the deck's front west corner, clear of Reed's lane. A cobbled quay road runs along the deck's rear in front of the two stalls for the deck's whole length, wraps round each of its rear corners and carries on down as a lane: west as Reed's lane to his wharf, east as the campfire lane, so one cobbled way leads from the square to both. Lanes end in rounds of cobbles and bend in rounded joins, the cobbles follow the terrain as it is drawn, and no shore rock or reed lies on them. Under the docks the ground is held just below the planks, so the deck shows a clean edge where it meets sand and stone. A cobbled main street climbs from the quay to the well square, which is a junction: lanes run round the village (past Wren's Cottage down to the worm patch and the quay's west end, and past the Net Mender down to the campfire on the east headland), and three more cottages stagger up to the casino gate. The campfire is the town's meeting place, a fire ring: a level round cobbled floor with a stone kerb, the fire in its middle and a low stone seat wall with a plank top round its hill side. Top Anglers and the supporters board stand just behind the wall as a pair, the same distance from the fire, so the fire lights them at night and the cove sees them from the pier and the east jetty; a log seat sits on the rim and the water side stays open. The campfire lane runs from the quay's east corner along the foot of the hill to where the village ring's lane meets it, and from there down through a gate of two tall lantern posts, with string lights from the gate round above the wall. The floor is levelled ground (`levels` in `MapDef`: built up toward the water, dug into the hill), and the ring's shape is `RING` in `src/data/maps.ts`. The cottages stand 4-5 m back from the street; each has windows with flower boxes on all four sides (lit at night), a woodpile and a water barrel behind, and the four lower ones a fenced garden beside the door. The town's pad is grass, worn to dirt only along the paths, round the square and in front of the stalls (`dirtWeight` in `src/game/env.ts`), with leafy trees among the houses and pines round its edge (`town.trees`). The quay's west end is Captain Reed's corner: his lane runs down past the worm patch and the Furthest Out board, along the water's edge and under a CHARTERS arch onto his wharf, a short timber landing along his beach. Reed stands on the boards under the arch, where the walk down the lane shows him first; players land back from a charter just inside the arch; and his seaplane is berthed nose-on to the wharf's face, tied to two mooring piles. The wharf is a dock to stand on, not to fish from (see Prime fishing spots). Layout lives in `MapDef.town` (`src/data/maps.ts`), the shoreline and docks in `src/game/env.ts`, geometry in `src/game/town.ts` and `src/game/hub.ts`.

- **Decision (2026-11-08)**: the map was reworked from the straight-shore layout to the "Harbour crescent" plan, the hybrid judged best of three options (37/40). The brief, the three plans and every round's scores are in `docs/map-rework/` (`JUDGING.md`, `harbour.md`); the greybox and build findings in `docs/map-rework/HANDOFF.md`.

- **Townsfolk**: Old Salty (pier tips), Pip, Granny Wren and Captain Reed. Press E to talk; lines cycle and some change at night.
- **Messages in bottles**: 7 hidden around town, shore and pier. Each pays 40 coins once; finding all 7 pays a 300 coin bonus. Found bottles are saved per account (`SaveData.bottles`); the server verifies the player is within 4 m.
- **Coziness**: lantern posts line the quay, the street and the lanes; none stands on a walkway. Four stand on piles in the water a step off a deck's edge (the quay's front pair, the east jetty's end and the lake end of Reed's wharf), one stands behind the quay road beside Marlow's stall with his barrels and crate, one behind the east bench, and the rest beside the cobbles (one in the fork where the village ring's lane meets the campfire lane, one by Reed's arch). The four on piles, two of the others, three of the village's and the lantern on Reed's CHARTERS arch cast real light at night; only the eight lights nearest the player are on at once (`LightPool`). Benches and planters ring the plaza, string lights span the mouth of the main street between the two stalls (from masts on the stalls, no posts on the quay road), the square, the gate and the campfire's circle, a bench on the east jetty looks across the water to the campfire, a picnic blanket overlooks Reed's lane, and firewood is stacked by Wren's Cottage. Bottles rest on the ground or the deck; the rowboat is moored beside the west jetty.

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
- **Shop rule:** each item has a `shop` (`stall`, `casino`, `earned` for rank outfits or `legend` for sea legend pieces; the last two are never sold). The server sells an item only at its own counter: stall items for coins next to Marlow, casino items for chips at the Prize Counter (`buyCosmetic` in `economy.ts`, checked in `server/room.ts`).
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
- **Commands** (`server/dev.ts`): `/help`, `/coins N`, `/chips N`, `/level N`, `/bait <id> [N]`, `/rod <id>`, `/fish <id> [cm] [shiny]`, `/tp <map>`, `/time day|dusk|night|dawn|auto` (only for you, including the server's night bite odds), `/dig` (clears the worm patch cooldown), `/level N` also gives the ranks up to N (but no gifts), `/backpay` lists every level-50 account still owed XP from the old level cap with the level it would reach, its catches and the XP they add up to (an account whose catches add up to less than reaching 50 takes got its level some other way, like `/level`), and `/backpay apply` pays them all (online players get their new save and a notice), `/resetpass <name> <new password>` (for a player locked out of every browser: sets the password and signs out all their browsers; the password is masked in the echo and never logged). Commands change the real save. A bad id lists the valid ones.

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
- **The 💗:** a supporter gets a heart before their name on their floating name tag, in the Anglers list (online and top anglers), and on their chat lines, and is listed on the "Thank you" board beside Top Anglers at the campfire (newest first, 5 names, then "and N more"). It is kept on the account, not the save, so an account reset keeps it.
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
- **The Deep Sea Rod** has one track (`ROD`): eight **rod steps** of 0.4 of a tier, two a zone, on sale once the zone is open (50,000 coins for the first, 8,400,000 for the last), then endless **Abyss levels** of a tenth of a tier from 1,750,000 coins, each 12% dearer. The rod's tip glows a new colour as it levels.
- **Black Pearls** only come from sea fish (1 / 3 / 8 / 20 / 50 a fish by zone, double for a Feisty or Brutish fish, five times for a legend or a shiny; `PEARLS`). They buy the four **boat parts** that open the zones (`BOAT_PARTS`): Storm sail (25 pearls, opens the Drop-off), Kelp cutter (150), Deep lamps (3,000) and Iron keel (25,000). The screens show pearls as progress to the next part, not as a purse.

**The pace.** Played straight, the Abyss opens after about 8.5 hours of charters; with Shiny Lures, about 5. The first two zones come fast (the Drop-off after about 8 minutes) as a taste of the ladder. The checks are in `scripts/seaeconomy.ts` and REELING.md, and `/lakestats` in the dev console reports chips per lake hour from real play.

**The boost: Shiny Lures.** Playing charters straight is the slow base loop. A Shiny Lure from the Prize Counter (15 chips for 3 casts, the same in every zone) makes the fish a shiny, which pays five times the coins and the pearls. Reed's chart counts the charters to the next boat part plain and with lures, and shows the lures held with their switch. Lakeside chips feed the sea, and the sea's coins feed the rod.

**The Abyss.** Only the Abyss has **markers** (`MARKER`): every third fish landed reaches the next marker, each a tenth of a tier harder and 12% richer in coins and pearls, numbered from 1. A charter there fills a hold like any other, climbing markers as it goes. Each player's furthest marker goes on the **Furthest Out** board by Reed's lane. The Abyss is where the endless play lives.

**Legends and Reed's Wardrobe.** Each zone has rare legends (about 1 bite in 20, a long hard fight, worth a fortune); the Abyss has the Leviathan, the Dreamer and the Kraken. Each landing of a sea legend unlocks the next piece of its set, which Captain Reed sells for coins in the Wardrobe tab of his menu. **Built so far:** the Kraken's set (Crown, Armor, Beak and a Hatchling pet, the Abyssal rarity; §15 and §33, with the five-family outline in TODO.md). The other legend sets are not built.

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

- **Earned outfits** can't be bought: a third cosmetic source next to the stall and the casino. The Wardrobe shows them, and the locked ranks, with "🔒 Level 35" so lower levels can see what's ahead. A reward for a feature not built yet (charters, racks, provision slots) takes effect when that feature ships.
- **The outfits are storm gear** (decided 2026-10-30): the Oilskin Sou'wester is a mustard-yellow waxed rain hat with a long back brim and a dark chin cord; the Storm Slicker a matching yellow rain jacket with the hood bunched at the back, wooden toggles and a white reflective chest band; the Brass Compass a round brass compass on a chain whose glowing red needle slowly swings; the Admiral's Bicorne a navy bicorne with gold braid, a gold rosette with a glowing star, a white plume and Legendary sparkles, kept distinct from the stall's Captain's Hat.
- **Rank-up** (decided): the big banner ("⚓ BOSUN ⚓" in gold over "Level 25 · Oilskin Sou'wester added to your Wardrobe", 4.6 s; it replaces the "<Tier> fish caught!" banner on that catch) with the legendary jingle, a server-wide chat line ("⚓ Penny made Bosun!"), and [Wear title] / [Wear it] buttons on the catch card. The mouse is locked while fishing on desktop, so the buttons also answer **T** and **O** while the catch card is up. Text from `rankUp` (`src/game/rankup.ts`).
- **Where it shows:** the title is a smaller gold line under the floating name tag and under the name in the Anglers tab (online and top anglers). The Wardrobe has a Title row (None plus every title, locked ones greyed with "🔒 Level N"), and earned outfits not yet owned show greyed in their slot. The level pill's tooltip names the rank, and from level 60 the pill is bronze, then silver (75), gold (100) and an aurora shimmer (150; it holds still under reduced motion). Ranks, titles and pill tiers live in `src/data/ranks.ts`.
- **Progress stays visible:** the next-goal HUD line and the welcome banner name the next rank and its reward ("Level 25: Bosun + Oilskin Sou'wester"), and a level-up to a milestone gets a rank banner.
- **No level cap** (decided 2026-10-30, with several players already at 50, where XP used to be thrown away). Past 50, every level costs a flat `xpForNextLevel(50)` (~3,500 XP, about 50 top-gear catches), so the pace never slows and the level stays the one number everyone reads ("Lv 63"). This replaces the earlier Angler Stars idea, which was the same thing under a second number.
  - Every level past 50: one free smoked provision (the best recipe unlocked).
  - Every 5th level past 50: a free charter fare.
  - Admiral stays the last rank. Later milestones give a title and colour the level pill: 60 Fleet Admiral (bronze), 75 Admiral of the Lakes (silver), 100 Sea Legend (gold), 150 Lord of the Deep (aurora shimmer).
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
