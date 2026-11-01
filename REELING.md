# Reeling

This is a document to analyze the reeling mechanic and its implications on gameplay. This outline will help to get a more comprehensive understanding of what effects each aspect of a catch has so they can be properly balanced.

The main goal of the reeling system is a framework for intuitive and fun gameplay with a clear and natural feedback mechanism for when an upgrade or gear change is needed. In play, that means two things:

1. **Every loss is feel-able.** The player should know *why* they lost before the card says so, from how the fight played out, not from a sudden "bucking horse" moment that came out of nowhere.
2. **The upgrade path is actionable.** From gameplay alone a player can tell whether a fish is too **strong** and/or too **heavy** for their class of gear, and so which item to buy next.

Everything below serves those two goals. The complexity budget (near the end) is the check against overdoing it.

## Primary variables

There are only two major aspects to landing a fish that we need for a baseline mechanic: the gear and the fish itself. Each has two traits, and each fish trait is answered by exactly one gear trait.

### The fish

- **Weight** — the general caliber of the fish. The "resistance" it gives when being reeled in: how slowly line comes back, and how much it drags out in a surge even when the player is doing everything right.
- **Strength** — the intensity of each surge: how high tension spikes when the fish pulls.

### The gear

- **Rod strength** — how much weight the rod can bring in. Answers the fish's weight.
- **Line strength** — how much tension the line manages before snapping. Answers the fish's strength.

So the experience of a fight is a balance between having enough rod and enough line. Fish vary on both traits independently, which pushes players to upgrade different pieces of gear at different times and to focus on a different part of the fight to land each catch.

### How the pairs play (hard wall, soft wall)

The two pairs must *feel* different, or the player can't tell them apart. The rule:

| Pair | Wall | What the fight looks like | How it's lost |
|---|---|---|---|
| Strength vs line | **Hard** | Surges push tension into the red. Easing off saves the line but gives up line; holding frays it. | **Snap.** No amount of patience lands a fish whose pull reaches the red. |
| Weight vs rod | **Soft, then hard** | Tension stays in the green, but the fish drags line out in surges and the reel wins it back slowly in the calms. | **One tier over:** a long fight that patience and clean play can win. **Two tiers over:** drag outruns the reel, the fish takes the line and **runs off** within the time budget. |

Line is the hard wall because a snap is the one failure the player can see coming on the gauge. Rod is soft for one tier so that "a bit above my rod" is a long fight rather than an impossible one, and hard past that so a definitively too-heavy fish ends the fight itself.

**No fight relies on the player giving up.** Every cell of the outcome matrix ends on its own, by a landing, a snap or a run-off, inside the time budget below. A fight that can only end when the player walks away is a design bug, not a difficulty setting.

That gives two different reasons to buy:

- **Buy line** to land fish you cannot land at all.
- **Buy a rod** to land heavy fish in a reasonable time, and to land very heavy ones at all.

### Time budget

Rough targets, to be set by play test:

| Fight | Target length |
|---|---|
| Under or matched gear | Short. Players land hundreds of these. |
| One tier over the rod | Noticeably longer, with a clear arc (see stamina). The ceiling for a winnable fight. |
| Two tiers over the rod | Ends in a run-off no later than a one-tier fight would have been landed. |
| Over the line | Ends at the first or second held surge, or sooner if the player lets go. |

## What the player feels, and what the screen says

One gauge, one button. Both failure modes read through the same gauge, so no new input is needed. The job is to make each cause unmistakable.

| Cause | What the player feels | Gauge cue | Message | Fix |
|---|---|---|---|---|
| Fish **too strong** for the line | Surges shove the needle into the red no matter how carefully they feather. | The fish's pull marker sits in or past the red. | "Too strong for your line" | Next line up |
| Fish **too heavy** for the rod | Needle is fine, but the line counter bleeds out in every surge and barely recovers between them. Fight runs long, or the fish walks off. | Line bar loses more in each surge than the calm wins back. | "Too heavy for your rod" | Next rod up |
| Both | Red surges *and* line bleeding. | Both cues. | Both lines, strength first (it's the one that ends the fight) | Line first, then rod |
| Player error on matched gear | Held through a surge, or dozed off and let it run. | Fray marks fill; or line bar drained with the needle below the pull. | "The line is fraying" / "Tighten!" | None, play it again |

Rules that make this legible:

- **A message names exactly one piece of gear.** Never "your gear" and never "your rod" when the real cause is the line.
- **The warning comes before the loss.** "Too strong" fires on the first surge whose pull reaches the red. "Too heavy" fires at the first surge where drag visibly beats the reel. The player feels the problem and reads the words in the same second, and can choose to let go rather than lose bait and time.
- **Once per fight, and only outside the rod's range.** "Too heavy" only ever appears when the fish's weight class is above the rod's tier. Inside the range the game says nothing: silence means this fight is yours to win, which keeps the message meaningful when it does appear.
- **A wall loss pays out as information.** A fish lost to either wall is logged in the Fishdex as *seen*, with its Needs hint (rod or line, whichever was missing). The player leaves every lost fight knowing exactly what to buy.

## Outcome matrix

The expected result for each fish against each gear state. This is both the design spec and the fan the reel bots should be checked against. "Under" means the fish is a tier below that gear trait, "over" a tier above.

| Fish weight → / Fish strength ↓ | Under the rod | Matched | One tier over the rod | Two tiers over the rod |
|---|---|---|---|---|
| **Under the line** | Trivial. Short, calm fight. | Easy. Few surges, quick reel. | Long and calm. No danger, lots of drag. Message: too heavy. | Runs off. Message: too heavy. |
| **Matched** | Quick but surges need feathering. | **The reference fight.** Surges near the red, won in the calms. Clean catch is the skill test. | Long with feathering. Patience wins. Message: too heavy. | Runs off. Message: too heavy. |
| **Over the line** | Short fight, but surges reach the red. Snaps unless the player eases off and gives up line. Message: too strong. | Snaps on a held surge. Message: too strong. | Both messages. Not meant to be landed. | Both messages. Not meant to be landed. |

Target feel in one line: the diagonal is fun, the third column is slow, the fourth column and the bottom row are walls that end themselves. If a play test shows the strong-but-light cell being won by brute force, the line wall is too soft. If the one-tier-over column is being farmed, it is too long or too rewarding.

## Secondary variables

### Fish stamina (fight left)

How much fight a hooked fish has left. It drains with every surge and with time spent held in the green, and a tired fish surges less often and less hard. Stamina is what makes the one-tier-over fight an arc (hard start, tired finish) rather than a flat slog, and it belongs on the **weight** side only:

- It shortens and softens surges. It **never** lowers a surge's pull below the line's red. A fish that can snap the line keeps that ability until it's landed or gone, so stamina never erodes the hard wall.
- It never makes a two-tiers-over fish landable. Drag past that point beats the reel even when the fish is tired.
- Shown as a simple fight-left bar, so a long heavy fight visibly progresses and the player can see the payoff of hanging on.

### Size

A bigger individual of a species is **heavier**, not stronger. Size feeds the weight axis only, so a big fish means a longer fight, not a surprise snap.

### Temperament: Feisty and Brutish

Some individuals roll away from their species. Instead of hiding that as noise, name it:

- **Feisty** — strength above the species norm. Surges spike higher.
- **Brutish** — weight above the species norm. Drags more line, reels in slower.

Rules:

- Exactly two tags, one per axis, one tag per fish, roughly one fish in eight so they stay notable. Below-norm rolls get no tag; an easier-than-usual fish needs no excuse.
- The tag shows at hook time, before the first surge, so it is a heads-up rather than an excuse.
- **An outlier never crosses a wall by itself.** A Feisty fish on matched gear still cannot reach the red; a Brutish fish on matched gear still gets landed. Without this rule, Feisty becomes "the game stole my fish" and the gear messages lose their trust.
- Tags are the tutorial for the axes. A Feisty fish on matched gear is a safe lesson in what strength feels like before the real line wall arrives, and the same for Brutish and weight.

## Skill vs gear

The third input to a fight is the player. For the gear messages to be trustworthy, being out-geared must never look like being slow, and vice versa. So the levers are split:

| Gear levers (move with rod and line tiers) | Skill levers (move gently with fish tier only) |
|---|---|
| Surge pull against the red | Warning time before a surge |
| Drag in a surge, line taken when slack | Surge build-up speed |
| Reel speed in the calm | Needle follow speed |
| Fray speed in the red | Sweet-spot width |

A fish two tiers above the gear should feel *heavy* or *strong*, not twitchy. Twitchiness is the fish's species and tier, and it tops out at something a 0.7 s reaction can still play.

## Where line lives

Line is a second upgrade path, but it must not be a second thing to carry. So:

- Line is a **permanent spool upgrade applied to the rod**, bought at the same stall. Not an inventory item, never swapped, never consumed, no hotbar slot. The player's mental model stays "my rod", with two bars on it.
- Same five tiers and colours as rods, so "tier 3 rod, tier 3 line" reads as the matched set at a glance.
- Cheaper than a rod, so purchases alternate small, big, small, big.
- No cap on line tier per rod. Top line on a Twig Rod makes everything holdable but slow, and the two-tier run-off wall still forces the rod purchase.

One sentence a player can repeat: **the rod wins line, the line holds the fish.**

### The third ladder

Bait already decides what bites, so with line the player has three ladders: bait (what bites), rod (how fast), line (whether it holds). Two guards keep that from being three things to think about:

- Line and bait of the same tier unlock at nearly the same level, so a player who can buy the bait for tier N fish can afford the line to hold them.
- Buying bait above your line gets a shop warning: "Your line can't hold most of what this bait attracts." The earliest actionable moment, and it costs no new UI.

Shop tiles show both numbers. The Fishdex Needs hint names the one that's missing, rod or line, not both unless both are.

## The player's view

What a player of relaxed progression games would say about this, and what answers it:

- **"I lost a fish I was never going to land, and it ate my bait."** Answered by the early warning, quick let-go and the Fishdex sighting. A wall loss costs seconds and returns a shopping list.
- **"Heavy fights are a slog."** Answered by the one-tier ceiling, the two-tier run-off and the stamina arc. A fight is long *or* unwinnable, never both.
- **"Matched fights get stale after a hundred."** Answered by keeping them short, and by variety the player can see: species, size, temperament, clean-catch bonus as the skill ceiling. No pattern memorisation.
- **"Now I have three things to buy."** Answered by line living on the rod, mirrored tiers, and the bait-over-line warning.

## The sea

The sea uses the same two axes, but its gear climbs in levels rather than tiers and its depth has no end, so it plays as a frontier rather than as walls: the deepest marker where a player still lands about half their fish. Past it the spool runs out and the haul sinks.

- **The rod decides how long your spool lasts; the line decides whether it holds.** Weight at sea is spool: a heavy fish takes more line from the charter's one spool, about the same for a slow player as a fast one, so it reads as gear. It stops short of the slog (a fight where reeling barely beats the drag), so it never becomes a three-minute fight. Strength is the snap, as in the pond. Pace follows the depth and levels off where a 0.7 s player can still play it; no gear eases it.
- **Each advance is a step.** A fight is the same all through a marker, then steps up at the next. Each zone leads on one axis and keeps it for the zones below, so no marker is easier than the one before:
  - **The Drop-off** — heavier fish. Its **Runners** make long pulls that take line. Tests the rod.
  - **Kelp Deep** — stronger fish. Its **Thrashers** make quick, close surges. Tests the line.
  - **The Twilight** — twitchier fish. Its **Sounders** dive with little warning. Tests the player.
  - **The Abyss** — all three behaviours, on top of everything above.

  A zone's lead and its behaviour come in a quarter at a time over its first four markers, so a new way of fighting arrives a few fish at a time rather than at once. The behaviours themselves are feel only: each plays within about 5% of a plain fish of the same difficulty.
- **The last markers are a gamble, not a wall.** Every fish rolls its own pull, up to ×1.4 either way, and the hook toast says so ("A strong one!" / "A light one."). Near the frontier some fish are fine and some are too much, and the player sees which before the first surge. Without the roll every fish at a depth is the same and the land rate falls off a cliff.
- **Both tracks count, and neither is a wall on its own.** Each Aurora Rod level takes the most off weight and a little off strength; each sea line level the reverse. A player who levels only one track still goes deeper, just less far than one who levels both.

Nothing new to learn out there, only harder versions of what the pond already taught.

## Complexity budget

What the player has to hold in their head, kept to the minimum that is still actionable:

- **One input.** Hold and release.
- **One gauge** with one new mark on it: the fish's pull marker, so strength-vs-line is visible.
- **One line bar** that already exists, now the place where weight-vs-rod is read.
- **Two gear numbers** to compare against a fish: rod and line, on one item. Two messages, one each.
- **Two tags** a fish can carry, one per axis.
- **One optional bar**, fight left, that never changes the outcome, only the length.

Not in the budget: a second button, a third gear stat, swappable line, per-species patterns the player must memorise, or stamina that can beat either wall. If an addition can't be tied to one of the two messages above, it waits in TODO Ideas until a play test asks for it.

## Engine findings (slice 1, 2026-10-31)

The engine now takes the difficulty as three axes, `weight`, `strength` and `pace`, with a plain number meaning all three alike, so every fight the game plays today is unchanged step for step. The bots then played the matrix with today's constants, a tier 3 fish (matched 1.6) with the pace held at 1.6:

| Axis | What the bots found |
|---|---|
| Strength alone | Already a hard wall, and a skill-sensitive one. At 2.5× matched a slow player (0.7 s) snaps 99%; a fast one (0.25 s) lands about half, losing the rest by giving line to stay out of the red. Fights stay short. |
| Weight alone | A time axis up to about 2.5× matched (×1.9 roughly doubles the fight, ×2.5 lands every time in 55 s), then a cliff: ×3.1 runs off almost always, ×3.75 walks off in 6 s with no snaps. |
| Riding high | Letting the player save less drag by riding high in the green (50% instead of 90%) only turns the edge fights into 200 s slogs. Leave it. |

What that meant for slice 2:

- The ladder places "one tier over the rod" near ×1.9 weight (a doubled fight, still landed) and "two tiers over" past the cliff, without changing any constant. The numbers are invisible to the player; only the feel matters.
- Size and Brutish rolls must stay inside the one-tier band, or they cross the wall.
- The edge of the weight wall is a slog zone. Nothing should be placed there on purpose.
- The strength wall moves with skill, as the fan test records. If the line is to be the same wall for everyone, the ladder should put "over the line" past where even a fast player snaps, about ×2.5.

## Ladder findings (slice 2, 2026-10-31)

Built: line as a spool on the rod, the two-axis ladder in `reelDifficulty`, tags, and the per-fish spread cut from ±50% to ±15% (`P.fight`). Bot measurements that set the numbers:

| Finding | Consequence |
|---|---|
| Surge length moved from weight to pace. With it on weight, a slow player following only the big words landed 62% of fish one tier over the rod, losing the rest to fraying in long surges; on pace, 91%. | Weight is now exactly the doc's lever list: drag and reel speed. The cost is a slower run-off, so the two-tier step moved out. |
| Where the run-off is quick depends on the pace, because drag follows the surge's build-up, which is slow on low-pace fish: at pace 1.4 it takes weight 12 to run off in under 20 s, at 1.8 weight 8. | `WEIGHT_STEP` is ×1.5 one tier over, ×12 two tiers over, so even the smallest tier 3 fish on the Twig Rod runs off within the time a one-tier fight would have been landed. |
| The slow-player snaps on tier 5 fights come from pace, not weight: tier 5 matched fights were already a coin flip for a 0.7 s player before this work. | Left alone here. It is the tier 4-5 retune under Ideas. |
| Shiny stacking on a trophy one tier over the rod reached the slog zone. | A shiny fights heavier only on gear that handles it, like a tag. Over the rod it fights like a plain fish of its size. |
| With the spread small the land-rate curve is steeper than before (the spread used to smear it). The fan's half-landing points moved by under 0.05. | The "no cliff" tests now allow a steeper fall; 0.2 of difficulty is about 8 leagues at sea. |
| Strength one tier over the line (×2.5): a slow player snaps every time, a fast player lands about half by giving line. Two tiers over, nobody. | Kept as designed: poaching one tier over the line is the "pushing skill" stress. |

## Sea findings (slice 1, 2026-11-01)

The bots played every marker over the zone's behaviours, four pull rolls and two sizes (`seaRow` in `dive.test.ts`). "Frontier" is where the land rate crosses 50%; "approach" is the leagues from 90% to 50%.

| What | Before (one number, 1% a league) | After |
|---|---|---|
| Approach, fast / slow player | 7 / 9 leagues | 17-29 / 14-30 |
| Worst drop between markers before the frontier | 40-48 points | 9-20 |
| Fights 30 leagues short of the frontier, fast | 12 s, ~1 m of spool | 18-31 s, 3-9 m |
| Frontier at +0, +5/+5, +10/+10, +20/+20 rod/line levels, fast | 45, 76, 106, 165 (rod +0/+10/+20/+40) | 59, 85, 105, 170 |
| The same, slow | 17, 43, 69, 145 | 21, 42, 58, 119 |
| Rod +10 only / line +10 only / both, fast | (one track) | 79 / 94 / 105 |

What set the numbers:

| Finding | Consequence |
|---|---|
| No single axis walls in the sea's range on its own; today's frontier came from all three rising together, which is why it was a cliff. | Each zone leads on one axis instead. |
| A band wide enough to feel coming is narrow next to the gap between a slow and a fast player, whatever the slope, unless fish vary. | The per-fish pull roll (×1.4 either way), shown on the hook toast. |
| Weight climbing smoothly runs into the slog (2-3 minute fights) before it runs off, and heavy-and-strong fish compound: each axis alone lands 95-100%, both together 47%. | Weight stops at 3.3 at pace 2, less on twitchier fish (`SEA_FIGHT.weightCap`). |
| Behaviour leads on the axes made zone borders a reset: Kelp Deep's first marker took less spool than the Drop-off's last, since its Thrashers dropped the Runners' weight. | Leads belong to zones and add up going deeper. |
| Switching behaviour at a zone border dropped the land rate 25-35 points in one marker, as did an extra step per zone. | No extra zone step; behaviours blend in from the zone above (`behaviourOdds`). |
| Slow players' frontier grows more slowly with levels than a fast player's. | Kept (Oscar): gear helps land the fish, it doesn't remove the skill. Checked again when tuning (TODO Ideas). |

## Sea economy (slice 2, 2026-11-01)

A scratch sim played whole charters on the bots' fights: per marker 120 rolled fish (zone, behaviour, pull, size), the spool, pearls and haul growth, and the best start marker and head-home rule for pearls an hour. It assumes 4.5 s to a bite, 4 s around each fish and 45 s around each charter. Levels split evenly between the tracks.

| Rod + line levels | Frontier, fast / slow | Pearls an hour, fast / slow | Coins an hour from charter fish |
|---|---|---|---|
| +0 / +0 | 56 / 16 | 293 / 168 | 180-220k |
| +5 / +5 | 82 / 34 | 475 / 310 | ~240k |
| +10 / +10 | 101 / 51 | 802 / 509 | 255-275k |
| +20 / +20 | 162 / 113 | 1,298 / 1,033 | 280-295k |

| Finding | Consequence |
|---|---|
| Pearls come 1.3-1.6× faster than in P1: the two-axis fights in easy water are quick. Two tracks on the rod's old curve (100 + 12N each) would bring levels ~1.7× faster than P1 (14-23 min for a fast player). | Each track's step doubles to 24 pearls, so even levelling costs what P1's single track did: a level every 24-29 min fast, 29-45 min slow. |
| At the old coins, charter fish only just pay for the levels, and a fast player past +15 / +15 needs pond coins. | The line costs half the rod's coins (25k + 4k·N, cap 75k). Charters then pay for both tracks with 20-50% to spare, more once Kelp Deep and below get their own, dearer fish. |
| Sea fish reach their heaviest (the weight cap) 10-20 leagues short of the frontier, so "too heavy" would show on nearly every fish there; strength crosses the red gradually (about 1 fish in 10 a marker short of the frontier, half at it). | The hook toast names only the line. The rod is named on the drag caption and the RAN OFF card, where its weight is what's costing line. |

## Decisions so far

- Line is a separate upgrade path, presented as a spool on the rod (2026-10-31).
- Feisty and Brutish tags for outlier rolls, shown at hook time, never wall-crossing (2026-10-31).
- "Too heavy" only fires when the fish's weight class is above the rod's tier, once per fight (2026-10-31).
- Both walls end the fight on their own; nothing waits for the player to quit (2026-10-31).
- Line: Twine, Mono, Fluoro, Braid, Moonsilk, unlocking at levels 1, 2, 5, 9, 13 for 0, 100, 500, 2 000, 8 000 coins; saves from before line get the line of their best rod (2026-10-31).
- Surge length is a pace lever; weight is drag and reel speed only (2026-10-31).
- Shiny, size and Brutish all sit on weight; shiny only counts on gear that handles the fish (2026-10-31).
- Gloves act on weight (they are Quick-Reel Gloves) (2026-10-31).
- Sea fights on the two axes (2026-11-01): the rod decides how long the spool lasts, the line whether it holds; each zone leads on an axis and keeps it; per-fish pull roll named on the hook toast; behaviours are feel only. The frontier keeps P1's pacing table, counting rod and line levels together, and levelling only one track is a soft stall (slower), not a wall.
- A sea line that levels at Marlow's for Black Pearls, a second track next to the Aurora Rod's levels, "because it gives players more to invest in" (Oscar, 2026-11-01). It's the **Deep Sea Line +N**, its own tile after Moonsilk, spooled by its first level (Oscar, 2026-11-01). Priced to keep P1's pace and leave charters paying for both tracks with coins to spare ("Sea economy" below).
- Messages as built (slice 3, 2026-10-31, reworked after Oscar's first play test the same day): during the fight only the gauge speaks ("Too strong for your line!" when a surge's pull sits in the red, "Too heavy for your rod" on the drag caption for a fish above the rod's tier), plus a sticker in the lower right of the screen for a Feisty (⚡, the red zone's orange) or Brutish (⚓, steel blue) fish, which also says what it pays. A lost fight ends on one card: **SNAP!** or **RAN OFF!**, the cause in a line ("Too strong for your Mono Line"), the fix in a line ("Fluoro Line holds it · Marlow's, 500 🪙"), and "noted in your Fishdex" when the fish was over the gear. Player-error losses get a reel tip instead of a gear fix. No mid-fight toasts, no separate hint bubble after a loss. Buying or inspecting bait above the line warns which line holds what it attracts. Sea fights get the same card: a snap names the Deep Sea Line's next level when the fish's surges reached the red, a run-off the Aurora Rod's when it was at its heaviest, anything else a reel tip (slice 2, 2026-11-01).

## Open questions

- The time budget numbers, set by play test.
- ~~Whether tagged fish are worth a little more, so Feisty is welcomed rather than dreaded.~~ Yes: +15% on the landed fish, stacking with the clean catch's +10% (Oscar, 2026-10-31).
- Wording and placement of the bait-over-line shop warning.
- ~~Whether the Fishdex sighting shows the fish's silhouette or its name.~~ Both: the silhouette with the real name, since the player has seen it on the line (2026-10-31).
