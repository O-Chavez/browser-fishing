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
- Fish sell prices scale with rarity, size, and species base value.
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
- Maps are separate zones joined by a travel point (gate/boat) that stays locked until the map goal is met.

### 14.2 Map shop
- One vendor per map. **Sell** fish (price by species rarity and weight, as today) and **buy** rods, bait and map-specific gear. Stock improves per map.
- The hotbar is the entire inventory: 5 slots, each holding one rod, one fish, or a stack of up to 20 bait of one type. Each map's stall sells a fixed stock (Starter Pond: worm bait and the free Twig Rod; set per map in `stock`). Goods are bought by looking at them on the stall and pressing E; fish are sold by holding them near the vendor and pressing E. You cannot cast while a fish is in hand or when no slot is free for the catch, so sell or drop fish before the bar fills. Dropped items last 30 seconds in the world, visible to the whole room (anyone can pick them up).

### 14.3 Map goal (progression gate)
- Each map has a **turn-in goal**: deliver X coins to the map's vendor (a "contribution" that is spent, not just earned) to unlock the next map. Goal grows per map.
- The next map brings rarer fish, better rods/bait and a higher shop tier. Account level stays as a soft gate for gear; the goal is the hard gate for maps.
- Progress is saved per account, so it persists across sessions.

### 14.4 Multiplayer (first version: shared world)
- Players on the same map see each other walking, casting and holding a catch (simple avatars with nameplates), plus bobbers and lines.
- **Authoritative server** (Node + WebSocket, e.g. `ws` or Colyseus) owns: player positions (client-predicted, server-validated), inventory, coins, level, fish rolls and sales. The client only requests actions, which stops cheating and keeps the economy consistent.
- Network model: 10–20 Hz position snapshots with client-side interpolation; discrete events for cast, bite, catch and sell.
- Accounts: simple name + token for v2, with a database (SQLite) for saves. Server-side saves replace localStorage.
- Rooms: one room per map instance with a player cap (about 16); players are routed into a room when they travel.
- Social extras (later): chat, shared leaderboards (biggest fish per species), co-op goal contributions where a town fund unlocks the map for the whole room.

### 14.5 Phasing
1. **Phase A — World & shop (single-player):** walk controller, map layout with vendor, sell/buy at the vendor only, per-map goal and unlock, map data refactor.
2. **Phase B — Server:** authoritative Node server, accounts and saves, move economy and fish rolls server-side.
3. **Phase C — Shared presence:** avatars, nameplates, synced casts and catches, room management.
4. **Phase D — Social & polish:** chat, leaderboards, shared goals.

### 14.6 Decisions
- Coins are turned in to a **pooled lobby fund**; the map unlocks **per room**.
- **No player-to-player trading.**
- Only the first map (`pond`) is built, as a template. Phase A is implemented single-player behind a `Fund` interface (`src/game/fund.ts`) so a server can own the pooled state later.

### 14.7 Adding a map (template)
1. Add a `MapDef` to `src/data/maps.ts`: `spawn`, hub `pad`, `vendor`, `board` and `gate` spots, `goal`, `next`, `radius`.
2. Give it a `locationId` in `src/data/content.ts` (palette, fish pool).
3. Point the previous map's `next` at it. The hub, fund board and gate are built from the data by `src/game/hub.ts`.

### 14.8 Multiplayer status
- **Server** (`server/`): `npm run server` starts a WebSocket server on port 8787. Rooms are chosen with `?room=name` (default `lobby`); `?name=` sets your display name. The pooled fund per map is server-authoritative, capped at the goal, and persisted to `server/rooms.json`. Logic lives in `server/room.ts` (tested).
- **Client** (`src/game/net.ts`, `avatars.ts`): other players in the same map appear as nameplated avatars; fund changes from anyone update the board and HUD live. If the server is unreachable the game falls back to the local single-player fund.
- **Run both:** `npm run server` and `npm run dev` in two terminals.
- **Accounts:** the first join with a name claims it; a browser-held token (SHA-256 hashed server-side, `server/accounts.json`) proves ownership. Not a password system. Duplicate logins are rejected.
- **Server-side economy:** coins, carry slots (fish and bait), rods, level and contributions live in the account save. Buy/sell/give are validated by the server (vendor proximity, funds, goal cap). The server rolls fish, size and bite wait on `cast`, and rejects a `catch` that arrives before the bite wait plus fight time. Shared logic is in `src/game/economy.ts`; the client mirrors it optimistically and the server `state` overwrites.
- **Synced visuals:** other players' casts (bobber and line) and held catches (fish hanging on a line from the rod tip) are broadcast as `act` messages.
- **Remaining gaps:** the reel minigame outcome is still client-side (only timing is checked), positions are client-reported, no passwords, chat/leaderboards, and the second map.

### Lucky Wheel
Each map hub has a Lucky Wheel. Hold a fish near it and press E to gamble that fish: 45% chance its value doubles (stackable, shown as ×2 on the hotbar), 55% chance it is lost. The server rolls and applies the result only after the ~3.8 s spin ends (the hotbar doesn't spoil it); other actions are locked during the spin, and leaving mid-spin settles it immediately. A large DOUBLED!/LOST! banner reports the outcome.

### Scaled Goals & Shiny Fish
- **Goal scaling:** a map's Town Fund goal is `base × (1 + 0.5 × (players − 1))` for the players currently in the room (e.g. 300 → 450 for two, 600 for three). Once a room's fund reaches its goal the gate stays open for good, even if more players join later.
- **Shiny fish:** every hooked fish has a 5% chance to be shiny. A shiny is gold with a glint, fights about 40% harder (stronger, longer surges), is worth 5× the normal sale value and gives 3× XP. It is announced on bite, on the catch card, on the hotbar and to other players. It survives drop, pickup and the Lucky Wheel.

## 15. Identity, Cosmetics & Expanded Hub
- **Join screen:** pick a name and body color (live 3D preview). Saved locally; `?name=` skips it.
- **Leaderboard:** Tab/Esc menu "Players" tab lists everyone online with coins; a "Top Anglers" board stands in the plaza.
- **Cosmetics:** hats, shirts, jewelry (6 each, tiers 0–5; higher price = flashier, top tiers glow). Bought at Marlow's shop menu (Cosmetics/Gear tabs), equipped in the Wardrobe (Tab; also the plaza mirror). Visible to all players.
- **Selling:** with the shop menu open, hover a hotbar fish to see its price and click to sell.
- **Hub:** T-shaped dock with side piers, rowboat, barrel and rope; plaza gains a campfire with benches, leaderboard board, mirror and extra lamps.
- **Persistence note:** cosmetics are stored in accounts.json; on Render use a persistent disk (`DATA_DIR`) to keep them across deploys.
