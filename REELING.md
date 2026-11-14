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

### The ladder (2026-11-02, replacing the walls below)

Decided with Oscar while prototyping the reel gauge (`gauge-lab.html` on branch `reel-gauge`), and being built there. Until it's tuned, "How the pairs play" and the outcome matrix below still describe the game as it is.

Each axis counts tiers over the gear (the fish's strength over the line, its weight over the rod) and tests something different in the player (Oscar, 2026-11-02):

- **Weight tests persistence.** Too much weight, and no amount of persistence beats it.
- **Strength tests tension management, backed by the line.** Too much strength, and no amount of tension management keeps the fish on the line.

| Over the gear | Weight against the rod (persistence) | Strength against the line (tension) |
|---|---|---|
| 0 and below | A short fight. | Easy to keep on the line. Everyone lands it. |
| +1 | Noticeably longer. | Hard: a careful player lands it with effort. |
| +2 | The longest fight persistence still wins: with tension managed perfectly, line won only just beats line lost. Patience always lands it, eventually. | The upper limit: a skilled player lands about half. |
| +3 and up | Runs off: no play wins line back. | Snaps: no play keeps it on the line. |

Every fight still ends on its own: +2 weight by landing, however long it takes, and +3 by running off or snapping. In the pond, a matched fish takes about 10 s, one over the rod about 25 s and two over about 60 s (Oscar, 2026-11-02). Pond fish tire like sea fish, so persistence shows on a FIGHT bar in both places.

- **Who plays where.** Skilled players, who push their gear rather than upgrade straight away, have the most fun between +1 and +2. Careful players, less willing to risk losing fish, live between 0 and +1 and upgrade as soon as they can.
- **Who sets each rung** (`HANDS` in `reelbot.ts`): "careful" (`HANDS.careful`) lands about half at +1 strength. **+2 is the limit however well someone plays** (Oscar, 2026-11-02): the best play a hand as quick as Oscar's can find (`HANDS.best`) lands about half, and +3 never. Oscar's own habit is `HANDS.skilled`, fitted to his lab fights; it sets no rung.
- **Variance drives the upgrade.** Species, size and Feisty or Brutish push some fish past their tier's average, so in play a skilled player lands under half at +2 strength, and some +2 weight fish are heavy enough to run off. That's what should make them want the next line or rod.
- **Strength and weight follow the same ladder,** each measured its own way (above). The line is no longer a wall at +1. Each axis still fails its own way (strength strains and frays the line, then snaps it; weight drags line out, then runs off), so which gear to buy stays readable.
- **The sea is a continuation of the pond, with no fight logic of its own** (Oscar, 2026-11-02). Each sea zone, or band of markers, is the next fish tier without end, and the sea rod and line levels are gear tiers on the same scale. One formula turns fish against gear into a fight in both places, rod answering weight and line answering strength, one to one. A slog is fine where it means something: a long fight is how a player feels they're nearing the limit of their rod, and that going further needs an upgrade; past it (+3) a sea fish runs off, as in the pond. Tiring and surge spread are the same in both places. Fish vary the same way in both places: one set of temperament names for the same ideas (a heavier-than-usual fish and a stronger-than-usual one; today Brutish and Feisty in the pond, Runner and Thrasher at sea), the sea's pull roll goes, and the Sounder is left out for now. Build this baseline for pond and sea first, then add sea-only modifiers on top if they're still wanted. The spool stays as the charter's trip budget on top of the fights. Today's sea differs on all of this (`seaDifficulty` and `SEA_FIGHT`, `dive.ts`: depth against levels on a sliding scale, crossed gear, a weight cap, only sea fish tire, ±5% surges, behaviours as feel only), so mapping it onto the ladder is part of this work.
- **+2 weight, as felt (Oscar, 2026-11-02):** Oscar found the bar in the table on a tier 3 fish at +2 weight (×12) in the lab, with line taken below the pull at 0.25 (from 1.5), drag at 0.005 (from 0.07) and fray marks filling twice as fast. With those, both lab hands land it every time in about 50 s (60-116 s under sea rules), which is right for a persistence test.
- **The gauge shows what the fight really rewards,** riding into the red included, so a +2 fish looks as hard as it is to a skilled player and reads as "upgrade" to a careful one.

Where it stood before the refit (tier 3 pond fish, the old levers, the lab's hands, 2026-11-02): +2 lands 0% for the skilled hand on both axes, one over the line lands about 70%, and one over the rod lands 100% for both hands, barely longer than a matched fish.

**As built (steps 1-3, 2026-11-02, the lab's placeholder hands, pond tiers 2-5, n = 100):**

- **Levers:** Oscar's +2 bar is the baseline (`P.run` 0.25, `P.drag[0]` 0.005). Fray time spans the strengths over the line (`P.fray` [1.5, 0.5, 2, 7]), so a better line gives more time in the red: about 1.1 s a mark at +1, 0.6 s at +2, 0.5 s at +3, 1.5 s matched.
- **Steps:** `WEIGHT_STEP` [1, 7, 13, 36, 72] and `STRENGTH_STEP` [1, 2.4, 4.9, 6.5, 8], fitted on tier 3. Higher tiers fight at a quicker pace, which makes the same step harder, so a step over the gear shrinks per tier above 3 (`OVER_EASE`, per axis and step: weight 0.84; strength 0.82 at +1, which the slow careful hand sets, and 0.865 from +2, which the quick hand sets; `axisStep` in progression.ts, shared with the lab).
- **Every fish tires,** pond and sea, with one surge spread (±5%) (Oscar, 2026-11-02). Fight grows as the square root of weight (`P.tire` k 11, q 0.5) rather than in proportion, so the FIGHT bar drains about as far on every rung: about 40% used on a matched fish, 50% at +1, 75% at +2 (tired by mid-fight). A sea fish of weight 3 keeps about the fight it had (19 s against 18 s).
- **Weight (Oscar's habit / careful hand):** matched 7-10 s, +1 25-29 / 28-35 s, +2 48-58 / 60-68 s (a species' smallest about 45 s, its biggest about 70 s), +3 runs off in 10-20 s, before it tires, for every hand.
- **Strength:** the careful hand lands +1 49-61%; the best quick play lands +2 42-57%; +3 snaps for every hand, the best quick play included. Oscar's habit lands +1 87-100% and +2 0%.
- **Oscar's play, fitted (step 4, his 7 lab fights on tier 3, 99 presses and releases):** about 0.12 s to react (0.10-0.14, reading the needle's movement ahead); in a surge he lets go as the needle tips into the red and presses again as soon as it's back out, on every fish. A bot playing that way matches 76 of his 99 presses, within 0.1 s on average, and his results (weight +1 27 s, +2 58 s; strength +2 landed with a fray, +3 snapped).
- **What beats +2 strength is a margin, not the red:** the best quick play lets go a little below the red (0.68-0.75). With 0.12 s reactions it landed the old +2 every time, about 95% clean; at 0.4 s the same play lands 0%. Letting go at the red's edge frays the line, because a strong surge drives the needle 0.1-0.3 into the red before a quick hand reacts. So +2 strength mostly tests reaction speed, and the gauge's real optimum there is a margin below the red.
- **Oscar's style has a hard spot below a strong fish:** once a surge pulls hard enough that letting go leaves the needle in the red (pull × `slip` > 0.8), he never presses during the surge, gives line cheaply and never frays. So just below that strength, where letting go drops the needle just out of the red and he presses straight back into it, is harder for him than a stronger fish (tier 3: ×2.8 lands 41%, ×3.4 98%). Not changed; a per-fish strength roll (±15%) can put a +1 fish there.
- **Tiring never beats the line, per fish:** a fish whose pull reaches the red keeps every surge just in it, or at its full pull if a weak ±5% roll pulls less (`fadeAt`). It was decided per surge, so a fish at the red's edge could fade a weak-rolled surge to 40% once fights got long enough to tire it.

### The gauge is the ladder (Oscar, 2026-11-02, decided, not built yet)

Drawn by Oscar as two rows of gauges, strength 0 to +3 and weight 0 to +3. It replaces how the ladder above is delivered (steps fitted to land rates, the pull doing two jobs), not the ladder itself. Each axis owns one readout, so the matchup reads from the hook and each loss names its gear:

- **The dot is the tension.** Holding raises it above the fish's pull (you reel against it); letting go drops it.
- **Strength sets the pull marker** (a black line), against the line's red. A matched fish's pull sits in the middle of the green (about 0.575), +1 at the red's edge (0.8), +2 inside the red (about 0.9), +3 past the gauge's end (over 1.0). The same position on every tier and sea zone; only pace climbs.
- **Weight sets how much of the gauge wins line.** Below a threshold the fish takes line (blue); above it, holding wins line (green). Weight 0: about the bottom of the green (0.4); +1: about 0.67; +2: about 0.78, a sliver under the red; +3: above the red's start, so nothing in the green wins.
- **The red frays the line while holding,** and still wins or loses line by weight: hatched green and red at weight +1 and +2 (pushing into the red is how you win line on a heavy fish), hatched blue and red at +3 (even the red loses line, so it runs off).
- **Letting go in a surge always gives the fish line,** wherever the dot is, and the dot falls at a speed that slows the further the pull sits above the middle of the green: at once on a matched fish, slowly at +2 (let go before the peak), too slowly at +3 to leave the red in time, so a +3 fish snaps the line or takes it all. Strength becomes anticipation; the gauge's ghost of the next surge shows when.
- **Overs add up:** strength over the line plus weight over the rod is the fight's rung. +1 is very doable; +2 (one axis +2, or +1 on both) is possible but the noticeable frontier, where every player considers upgrading; +3 and up can't be overcome. Fish over both pieces are common (the line unlocks just before the rod of its tier, at about 40% of its price).
- **Fish of a kind vary only slightly** (each fish's pull roll from ±15% to about ±5%); the Feisty and Brutish tags stay as the named variety.

Proposed with it and not yet confirmed: tiring lowers the weight threshold, so the green grows back as the FIGHT bar drains and persistence shows (a +3 weight fish still runs off before it tires); the sweet spot folds in as "the higher above the threshold, the faster you win line"; between surges a heavy fish still reels in slowly, which is where fight length mostly comes from.

Risks: a needle that lingers after letting go can feel like lag, so the release needs clear feedback (line paying out, the reel spinning); the steps, fight times, bots and the fit to Oscar's play get redone (anticipation is a different skill from reacting). Next: a headless sim of these rules on the full grid, diagonals included, with the careful, skilled and best hands plus one that anticipates surges; then a lab prototype behind a switch, today's fight beside it; then the refit.

### The foundation (Oscar, 2026-11-02, decided, in the gauge lab)

Built from "The gauge is the ladder" after a headless sim (`scripts/gaugesim.ts`), an outside review and a lab prototype (`GaugeReel` in `src/game/gaugereel.ts`; the lab's **Foundation** rules). Oscar: "the closest we have gotten", the foundation to build on.

- **A fish is its two stats against the gear's,** strength against the line and weight against the rod, each open-ended. Only the two gaps (fish over gear) decide the fight: a fish 2 over its gear fights alike at any level. Upgrading lands more of the fish above the gear and shortens fights. In the pond, bait tiers decide which fish a player meets; at sea, how far the charter goes (markers and zones).
- **Everything else is constant:** one timing for every fish (surge, calm, warning, build-up, dot speed: today's tier 3 averages) and no random spread (no per-surge or per-fish rolls, no temperament on warnings). Variety (Feisty, Brutish, Runner, zones) comes later as modifiers on top.
- **The rungs are conceptual, not numeric targets:** 0 parity, practically always landed; +1 a slight challenge, lost only to moderate mistakes; +2 the frontier, landed by getting the most out of the gear; +3 the hard line, no skill lands it. Overs on both axes add up.
- **The rules:** strength places the pull (a black line: mid-green at 0, the red's edge at +1, in the red at +2, past the end at +3). Weight places the threshold: holding in a surge wins line above it (green, faster the higher) and loses it below (blue); the red frays while holding and is hatched by which of the two it does. Letting go in a surge always gives line, more the stronger the fish (×1, 2.2, 4, 8 from 0 to +3), and the dot falls slower the stronger the fish. The calm reels slower the heavier the fish (×1, 0.45, 0.22, 0.08), an exhausted heavy fish included. **With the button up the fish always takes line**, in the calm too (Oscar, 2026-11-02). Fray marks fill in 1.5, 1.2, 0.9, 0.5 s from 0 to +3. Gaps below 0 keep shortening fights down to a floor at -2.
- **As simmed (n = 20 per style; careful 0.4 s, Oscar's habit 0.12 s, a 0.03 s ceiling with every style):** weight 0 / +1 / +2 lands in about 9 / 22-28 / 48-71 s, +3 runs off; a gap of -1 / -2 takes 6 / 4-5 s. Strength +1 lands 90% careful and 100% quick; +2 lands by riding the red's edge (Oscar's habit 75%, the best play 100%, careful 0%); +3 lands for no one, the ceiling included. A quicker hand than 0.12 s gains nothing; riding the edge beats letting go early. +1 on both lands for quick hands in about 36 s and for careful 90%.
- **Open, for play test or later:** a +3 strength fish strips the line in about 3 s, which may read as a bait thief rather than "too strong for my line"; a +2.5 weight fish is a 90-115 s slog that lands while +3 runs off in 11-19 s; tiring makes heavy fish give way on strength, so quick hands land a little past a combined +3 (proposals 1 and 2, tiring lowering the threshold and the linear win rate, still unsettled; proposal 3, the calm slowing with weight, is in). How fish and gear stats turn into gaps is for the refit.

### The foundation in the game (step C, 2026-11-02)

`Reel` (`src/game/reel.ts`) is now the foundation's fight, in the game, the server's replay check, the bots and the gauge lab alike (`GaugeReel` became it; the old fight is gone). Decided with Oscar:

- **One tier is one rung.** A pond fish's strength and weight are its tier; a line's strength and a rod's weight are theirs (`fightGaps`, progression.ts). So a player who buys each bait as it unlocks meets +1 on both (the frontier) until the line comes, +1 weight until the rod, then parity: careful 90% in 45 s, quick hands every time in 36 s; +1 weight alone 22-28 s; matched 9 s. Bait two tiers up still hooks +2 on both or more (the "cap bait" idea in TODO).
- **Nothing varies but the two gaps, for now** (Oscar): species stamina, size, shiny, Feisty and Brutish, the Quick-Reel Gloves' fight effect, sea behaviours, legends' longer fights and the sea pull roll are all off, to come back as modifiers on top only if they're wanted. The tag and behaviour plumbing stays, unrolled.
- **The sea, a placeholder until the sea mapping** (`seaGaps`, `SEA_GAPS`): a sea fish is a tier 5 fish at the harbour and a tier higher every 30 fish out, the same all through a marker; the Deep Sea Rod and Line are tier 5 gear, each level 0.15 of a tier (a level worth 4.5 fish, as before). With no levels, marker 30 is +1 on both; quick hands land 90% at marker 40 and none at 45. The careful hand drops from 90% at marker 30 to 0% at 35, a cliff rather than a frontier felt marker by marker: one for the sea mapping.
- **The gauge in the game is the lab's** (`drawFightGauge`, `src/game/fightgauge.ts`, shared by both), with the FIGHT bar above the gauge as before (Oscar). Its words and details are the lab's draft, for step 6.
- **The red with a strip, not hatching** (Oscar, 2026-11-03, step 6): the red is one flat red, and a strip along its inside half (first 4 of the band's 15 units, then half on Oscar's look) is green where holding there still wins line and blue where it loses it. The green/blue hatching across the whole red was an eyesore and blurred the green's edge. A red gradient by fray speed was tried in mockups and not picked.
- **The ring round the gauge sits clear of the FIGHT bar** (Oscar, 2026-11-03, step 6): the amber ring in a surge (red when about to fray) keeps its inside edge just clear of the fray marks (118 units) and pulses outward, and the bar sits 152 units above the centre (was 132), so even the ring's widest pulse no longer runs over it. The lab's gauge moved down to fit.
- **From a visual review (Fable, 2026-11-03), Oscar took three fixes:** the gauge's words in the HUD's font (Nunito); the game's gauge drawn at the screen's pixel density (`drawGauge`), so it's crisp on Retina screens and phones instead of stretched from 1×; the fray glow on the red's outside half only, so the inside half still reads while the line frays. The review's style ideas (dot over pull marker, walnut backings, lighter empty fray marks, a cream line ring, a divider at the blue/green edge, the band's ends, the surge ring, text sizes on phones, RIDE HIGHER's wording) wait in TODO Ideas.
- **"Over the gear" is a rung or more** on an axis (`overGear`), pond and sea alike, for the hook toast and the loss cards.
- **A fish has no random spread, so a replay doesn't depend on the seed** (it only picks which way the fish swims): one button log lands every fish with the same gaps. Fine for now (Oscar, 2026-11-03): some variance comes back to pond and sea later, which covers it.
- **Settled with Oscar (2026-11-03):**
  - **+3 strength runs off in about 3 s, and that's right:** a fish that snaps the line was wrestled, one that runs off was let go; either way it was lost to the gear. So the loss card's big word says how the fight ended (SNAP! or RAN OFF!) and its lines follow the matchup, one short line per piece of gear the fish was over: "Line too weak → Fluoro Line", "Rod too weak → Deep Sea Rod +4" (Oscar: no wall of text; `lossVerdict`, `seaLossVerdict`). A fish over neither still gets the cause and a reel tip.
  - **+2.5 weight is a slog of about 100-120 s, and that's fine:** it's where a player decides they need a better rod. Ideally nearer +2's length, but it can stay.
  - **One flat green (proposal 2 dropped):** holding anywhere above the threshold wins line at one rate (`P.win` 0.05 per s), the gauge's green is one colour. Bands barely move: matched 9-10 s, weight +1 22-28 s, +2 49-66 s; strength +2 now lands for quick hands every time (your habit 75% → 100%), careful hands still none.
  - **The threshold stays put as the fish tires (proposal 1 dropped, `P.tireDrop` 0):** with the flat green it let quick hands land strength +1 on weight +2, a combined +3, 50-65% of the time. Without it: matched 9-10 s; weight +1 22-29 s, +2 58-75 s, +2.5 109-118 s for quick hands (careful 55%), +3 runs off; strength +1 careful 95%, +2 quick hands only, +3 no one; +1 on both 37-46 s; any combined +3 0-5%. The sea placeholder is unchanged (marker 35 lands for quick hands in 50 s, 45 for no one).
  - **The hook toast and sea sticker say the matchup by rung** (`matchupWords`): "Strong for your line" or "Heavy for your rod" one rung over, "Too strong" or "Too heavy" from two, both when both; the sticker turns red from two. It answers his play test: at sea every fight said "Too strong for your line" though the rod was what stopped him.
- **Oscar's first play test in the game (2026-11-03):** the pond's tier 1-3 fish on the Twig Rod and Twine feel as they should. At sea with no levels, marker 35 lands but in long fights that end with the fish tired out, where he'd want a better rod; at marker 45 nothing lands, the rod unable to win back what each surge takes. Every sea fight said "Too strong for your line" (the sea sticker named only the line, from the old sea design, and every gap from +1 counted as over), though the line was never really at risk up to marker 45: on the sea's diagonal the rod is what stops a quick hand. Now worded by rung (below).
- **Oscar's lab fights on the foundation (2026-11-03, 15 fights, all replay exactly):** matched 10-11 s; weight +1 25-26 s, +2 52-53 s (riding into the red), +3 ran off in 19-24 s; strength +1 landed both in 13 s, +2 two of three in 27-28 s, +3 ran off in 3.4-3.5 s. That's the reference hands' bands, so `HANDS` stays as it is. He found every strategy about as effective: at 0 and +1 every sensible way of playing lands, and how you play only shows in fight length (at +2 weight, 53 s pushing into the red against 76 s keeping well under it) and at the edges (+2 strength loses those who push into the red, +2.5 weight those who stay low). The fit can't pin his reaction time (0.06-0.3 s fit alike) and matches 61% of his presses, since he pulses several times a surge.

### The sea mapping (step 5, 2026-11-03)

- **One formula on one scale of tiers** (`gapsOf`, progression.ts): a fish has a strength and a weight in tiers, the gear a line and a rod, and each gap is the fish's over the gear's. A pond fish is its tier on both; a sea fish is a tier 5 fish at the harbour and climbs evenly with depth, without end, the same all through a marker (`seaFishTiers`, `SEA_TIERS`, Oscar's option A: zones keep their fish and names, not a tier each); the Deep Sea Rod and Line are tier 5 plus a share of a tier a level (`seaGearTiers`).
- **Where the cliffs come from (no levels, the reference hands):** the foundation's own gap space, not the mapping. On the sea both gaps grow together, a third of a combined rung a marker: careful lands 90% at +1/+1 (marker 30), 20% at +1.05 each, none from +1.1 (snaps: a 0.4 s hand can't get off a pull just in the red with weight on top); quick hands 100% to +1.3 each (marker 40), none by +1.4. The pond's whole-number gaps hide it. The variance coming back is what spreads each cliff over markers (Oscar: it also widens how far apart careful and quick hands stop, 2 markers on the baseline).
- **What a level is for (Oscar):** levels take a marker from "long, tough fights" (+2 on that gear) back to "manageable". **A level is 1/6 of a tier, one marker on its gear** (Oscar, 2026-11-03), so the panels can name a marker that moves one a level. 3 levels on each track take a tough marker (skilled at 35-40, careful at 30: 46-58 s) to 21-27 s, and 6 to about 10 s; at today's prices that's about 2.5 hours of charters (a level about every 25 minutes, the sea economy sim on the reference hands).
- **The spool is the price of pushing past your wall** (Oscar's option B, 2026-11-03): landed fish stay cheap (1-10 m short of the wall, 16-24 m at it), and a lost fish costs `DIVE.lostMetres` (25 m) on top of its line however it got away, so a run-off costs about what a snap does (it cost only its line, about 5 m, before). From a charted marker two short of the wall, about 110-120 m are left on reaching it: about 4 lost fish there, where a quick hand's run-offs used to buy 20. The fights, not the spool, stop a charter from a charted marker; from the harbour the line runs out a marker or two short of the wall. The best pearls an hour still comes from short charters well short of the wall (careful / skilled 230 / 276 at +0, 545 / 596 at +6 a track, 903 / 961 at +12), never sinking.
- **The charters' structure is the working baseline, open to rework** (Oscar, 2026-11-03): the goal is an endgame without end that stays rewarding and fun, so players want to keep pushing. A flat line cost per lost fish, zone or marker modifiers, boss fish events and more are on the table for the deep sea mechanics pass (TODO Ideas).
- **The first modifiers, built (Oscar, 2026-11-03; `rollFishGaps`, progression.ts), pond and sea, rolled with the bite into the gaps so the fight and replays are untouched:**
  - **Spread:** each fish rolls its strength and its weight separately, up to ±0.15 of a tier (`FISH_SPREAD`).
  - **Feisty and Brutish:** one fish in 8 (`TAG_CHANCE`), Feisty +0.25 of a tier on strength and Brutish +0.5 on weight (`TAG_TIERS`): a change you notice in the fight, not a death sentence (Oscar). Feisty is smaller because a careful player's strength limit is a cliff at the red's edge: at +0.5, Feisty took careful from 100% to 25% at sea marker 20; at +0.15 it barely changes a fight. A tag rolls on any fish, and pays +15%.
  - **The matchup words** count a rung give or take the spread (`rungsOver`), so a pond fish a tier over always reads as one.
  - **Bands** (careful / skilled, no levels; plain → with modifiers): in comfortable water every fish still lands, tags a few seconds longer (skilled at a tagged fish up to marker 35: 100%). Each hand's wall becomes a slope over about three markers instead of a step: careful 100% / 90% / 51% / 4% at markers 20 / 25 / 30 / 35; skilled 100% / 53% / 0% at 35 / 40 / 45. Careful at pond strength +1 lands a Feisty fish 79% of the time; at +1 on both (sea marker 30) none. Skilled lands pond strength +2 79% (a Brutish fish there is a combined +2.5).
  - **The spool with them:** lost fish near the wall now cost 25 m each, so the line runs out a few fish short of the wall (careful from marker 25: out at 33; skilled from 30: out at 43) rather than the fights stopping the charter. Best pearls an hour 3-4% lower.
- **The modifier sequence (Oscar, 2026-11-03):** (a) the spread and Feisty/Brutish, above, to play-test; (b) 2-3 "how it fights" temperaments prototyped in the gauge lab (more fight, sharp short surges, lazy fish, faster or slower reeling), each one fight lever per fish, a trade measured in rungs, one per fish; (c) reward modifiers (Pearl fish, bosses) in the deep sea mechanics pass. Zones stay plain until then.
- **The leftovers, built (Oscar, 2026-11-03):**
  - **The level panels say a marker range, not "% lighter"** (percentages read as arbitrary): the Deep Sea Rod "Sea fish heavy for it from marker 30 · Too heavy from marker 60", the Deep Sea Line the same with "strong", in the hook toast's words, each level one marker further out (`markerOver`, dive.ts; `rodLevelEase` is gone). The level-up toasts say the new marker.
  - **Reed's panel and the marker card drop the zones' behaviour lines** until the deep sea mechanics pass fleshes zones out; they say what a fish pays.
  - **The Quick-Reel Gloves reel in fish faster:** the calm reels ×1.35 (`fightTune`, economy.ts), carried with the bite as fight levers over `P` (`Roll.tune`) that the server replays with, the slot "how it fights" temperaments can use later. Careful fights 20-30% shorter (+1 weight 29 → 22 s, +2 75 → 61 s), +2.5 weight 55% → 100%, +3 still runs off: about a quarter of a rung on weight. They keep the longer strike window. Card "Reel in fish faster", buff line "Reeling ×1.35 faster".
  - **Fixed on the way:** a tagged sea fish wasn't kept on the server's pending catch, so it wouldn't have paid its +15%.
- **Oscar's play test (2026-11-03) passed:** the modifiers, the panels' marker ranges, Reed's panel and the gloves.
- **Tags at the frontier too** (Oscar, 2026-11-03): tags first rolled only on an axis at most a rung over the gear, so they stopped where the gear strains (marker 35 on no levels), which made pushing past it easier. Now they roll on any fish. No levels, landed overall (tagged fish landed): careful 4% (– → 0%) at marker 35; skilled 100% → 96% (– → 63%) at 35, 56% → 47% (– → 0%) at 40. A skilled spool from marker 30 runs out at fish 42 instead of 43; nearer in, nothing changes.

### The finish (step 7, 2026-11-03)

- **The fan, refit** (`reel.test.ts`, "the fan of hands", replacing main's `FAN_HALF`): the gap each reference hand lands half its fish at, judged by band. Measured: careful +1.35 strength, +2.52 weight, +1.00 on both; skilled +2.18, +2.55, +1.36. Skill is worth most of a rung on strength and next to nothing on weight. On the plain gaps a wall drops up to 100% in 0.1 of a rung; each fish's spread makes it a slope (at most about 55% per 0.1).
- **The loss cards:** SNAP! / RAN OFF! and the pond's gear lines were right as they were; a pond fish's spread and tags never change which gear it's over, so the cards and Fishdex (by tier) agree with the fight. At sea the card names the first level on which this fish is no longer over that gear (Oscar): with no levels a fish lost at marker 30 needs +1, at 40 +3, a Brutish one more.
- **Bait over the gear:** at one tier over the line careful hands land 68-95% of a bait's bites and skilled 100%; at two tiers over 34-45% and 52-60%. So the old "can't hold most of what this bait attracts" became the hook toast's words (Open questions).
- **The Fishdex at sea** (Oscar): a sea fish lost a rung or more over the Deep Sea Rod or Line is noted as seen, like the pond's, client and server (`recordSeaSighting`). Its card names it and says "Got away in the Twilight! A stronger Deep Sea Line or Rod lands it": a nudge, not a level, since how hard a sea fish is depends on the marker.
- **The line's panel** says "a fish strong for your line pulls its surges up to the red, one too strong pulls them into it, and holding in the red frays the line" (it said a fish above the line snaps it).
- **The hook toast** says "An easy one" for a fish a rung or more under the gear on both axes, give or take its spread (Oscar: upgrades should feel rewarded); the Easy-to-Brutal word stays gone.

### The edge pays (2026-11-11, branch `charter-edge`; play-tested 2026-11-12 and replaced by "A place to earn" below)

Oscar found the Abyss out of reach and the charter still an "early idea". Measured on the reference hands first: a level on both tracks took about 50 minutes at every stage and moved the wall one marker, so the Abyss (marker 151) needed about +22 / +22, 17-20 hours; the best pearls an hour came from a five-marker run that ended 5-30 fish short of the wall, its first markers fought only for the haul's +50%; and the stall's panels listed rod and line apart ("too heavy from marker 60") though the gaps add up, so they overstated a player's reach by 15-20 fish.

- **What Oscar asked for:** reward stretching your luck; farming early markers must not be the best income, and they should be easy and fast once the gear is levelled; about 8-10 hours of charters to first reach the Abyss, a new zone every 2-3 hours; the endless ladder only in the Abyss; running out of line costs the haul's bonus, not the haul.
- **Zones closer in:** 0 / 16 / 36 / 61 / 91 (were 0 / 16 / 41 / 81 / 151), in `ZONES` and `SEA_ZONES`, with the sea's look retimed to them. Fights are untouched: a tier every 30 fish, a level a sixth of a tier. The Shelf to the Twilight are a journey with an end; the Abyss goes on.
- **Pearl water** (`edgeSteps`, `inPearlWater`, `pearlsAt`, dive.ts): water where a typical fish at least matches the rod and line together. Before it, fish pay coins and no pearls. In it, a fish pays the marker's base (1 + a pearl every 20 fish) doubled for each combined rung over the gear (`PEARLS.step`, about a quarter more a marker on even levels). Each level moves pearl water half a marker out.
- **The haul's bonus** (`haulBonus`, `Dive.grown`): 25% more, compounding and uncapped, at each marker reached in pearl water (`DIVE.haulGrow`, `haulCap`); easy markers add nothing. Heading home at a marker banks the haul with it.
- **Out of line costs the bonus only:** the charter ends and the pearls in the haul come home without the bonus, as do heading home between markers and the boat's wait running out. Only heading home at a marker charts it.
- **Start at any marker up to the furthest** (`canStartAt`): Reed's panel suggests the marker where pearl water starts, so a charter opens at the edge instead of with easy markers. It used to be only the markers headed home from, which sit at the far end of a charter.
- **The screens say the reach of rod and line together** (`reach`, `seaMatchupWords`): where pearl water starts, where it gets hard (two combined rungs) and where it's too much (three); a fish three combined rungs over reads "Too much for your rod and line" in red, where it read "Strong for your line, heavy for your rod" on a fish no one lands.
- **Feisty, Brutish and legends pay more** (`PEARLS.tag` 2, `PEARLS.legend` 5, `pearlsFor`; Oscar, 2026-11-11): a tagged fish pays double pearls and a legend five times, both multiplying what the fish pays at its marker (still nothing before pearl water). A tagged fish at the edge was pure cost and a legend paid like any other fish. It adds about a third to pearl income and leaves the best charter where it was. The catch card shows the pearls a fish paid and why, the strip shows the gain, and the hook toast, the sticker and the legend banner say double or five times.
- **Prices:** a level is 400 + 235·N Black Pearls on each track (was 100 + 24·N), low at the start so the first levels come quickly; the rod's coins are 30,000 + 7,000·N and the line's half (were 75,000 + 6,000·N), low at the start for the same reason; unspent pearls in older saves count sevenfold (`pearlsV`).
- **Bands on the reference hands** (careful / skilled at +0, +8 and +16 a track; a scratch sim like `scripts/seaeconomy.ts`):
  - The best charter starts where pearl water starts and ends 0-5 fish short of the wall: 16 / 22 minutes, 4-12% / 1-4% of charters out of line.
  - Farming 20 or more fish short of the wall earns 14-38% / 35-43% of the best rate (63-100% before); one-marker hops at the edge 37-46% / 22-25%; never heading home 28-35% / 19-23%.
  - Skilled hands earn 2.1-2.5 times careful ones (1.1 times before). A cap of five markers on the bonus narrows that to about 1.5 and shortens charters to 15-17 minutes, but a skilled hand that stays four markers short of its wall then earns about three quarters of the best rate. Left uncapped for the play test.
  - With the extras, pearls an hour are 1,500 / 3,603 at +0, 3,485 / 7,947 at +8 and 5,499 / 12,123 at +16 (`scripts/seaeconomy.ts`). At these prices the first level takes about 25 / 11 minutes and a level near +10 about 41 / 18, and the Abyss about +13 / +10 on each track: about 16 / 5 hours at the best rate. A flat 750 + 130·N was tried first: about 18 / 6 hours, but a careful hand's first level took 48 minutes (33 before the rework).
  - Coins: edge fights are longer, so charter fish earn less an hour than farming did (205-541k / 211-539k from +0 to +16). The levels' coins take about 75% of a skilled hand's charter coins at +0, 64% at +8 and 57% at +16, and half that share of a careful hand's.
- **Tried and dropped:** double and triple pearls by the hook toast's words alone (careful hands gained 2-15% and the best start stayed 30-45 fish short of the wall); steep pay with no haul growth (one-marker hops at the edge earn 88-100% of the best rate); uncapped haul growth on every marker (the best charter starts at the harbour and grinds every easy marker).
- **Not in this build** (TODO): a twist and a first-time reward for each zone, a trophy for legends, boat upgrades as the coin sink, three-fish markers, bigger steps per level, chat lines for zones and legends.

### A place to earn (2026-11-12; play-tested and retuned 2026-11-13; merged 2026-11-13 from branch `charter-edge`)

Oscar played "The edge pays" and found the premise wrong, not the tuning. A full charter (markers 0-30, about 700 pearls and 45,000 coins) bought one line level, a sixth of a rung on one of two axes, and nothing changed: the fish still read as strong and heavy. Line vanished on clean catches with nothing saying why. Markers, zones and the strip's nine facts blurred together. And "see how far you can push" had no answer to "for what reason".

- **Why the old pay rule could not be tuned into shape** (an independent review, 2026-11-12): pearls were paid only on fish that at least matched the gear, so a level never made the paying fights easier; it moved the paying water further out. Pearls bought the right to earn pearls in harder water.
- **The premise now (Oscar):** the sea is a place to earn. Pay is by place, so after an upgrade the same water gets easier and earns more, as at the lake. Each further zone challenges the gear, and upgrading raises what a spool of line returns.
- **Zones are places** (`SEA_TIERS`, `seaFishTier`): the Shelf to the Twilight have one difficulty each, 0.8 of a tier apart, and no markers. Only the Abyss has markers: every third fish reaches the next, each a tenth of a tier harder and 12% richer in pearls and coins, numbered from 1, with the furthest kept for the board.
- **One rod track** (`ROD`, `seaRodTier`): eight steps of 0.4 of a tier on strength and weight alike, two a zone and on sale once the zone is open, then endless Abyss levels of a tenth of a tier. The Deep Sea Line's levels are gone; the line is the spool. The lake keeps its rods and lines.
- **The rating** (`ratingOf`): a zone reads Easy, Fair, Tough or Too much for the rod (a typical fish at most 0.05, 0.45 or 0.85 of a tier over it, or more). It replaces the two-gear words at sea, and the hook toast names the zone's rating rather than the fish's own, since a Brutish fish would read Too much in a zone that is Fair.
- **Line** (`LINE`, `lineCost`): one 300 m spool in every zone. Every hooked fish uses 5 m at Easy, 9 m at Fair, 13 m at Tough (5 + 10 a tier over the rod), taken at the hook, and one that gets away 25 m more. Frays and the way the fight was played no longer cost line (Oscar: losing line on a clean catch was not intuitive; a fixed cost that falls as the rod improves is).
- **Spools cost coins** (`SPOOL_COINS`): free on the Shelf, then 14,000 / 26,000 / 46,000 / 83,000. When one runs out the player buys another or heads home; nothing is ever lost.
- **Two kinds of money** (Oscar wants the lake and the sea to feed each other): coins buy line and the rod (steps 40,000 / 90,000 / 150,000 / 350,000 / 600,000 / 1,300,000 / 1,200,000 / 2,400,000, Abyss levels from 1,000,000 rising 12% each); Black Pearls, which only sea fish pay (1 / 3 / 8 / 20 / 50 a fish by zone, double for a tagged fish, five times for a legend), buy the four boat parts that open zones (30 / 150 / 1,500 / 10,000). First drafted the other way round; Oscar swapped them so a zone is always earned at sea and coins have a sink without end. The prices are the second play test's (below); the first build's were 250,000 / 400,000 / 300,000 / 700,000 / 550,000 / 1,300,000 / 1,000,000 / 2,400,000 coins and 150 / 900 / 2,500 / 6,500 pearls.
- **What the swap needs:** coins a fish rising about 1.8 times a zone (1,100 / 2,000 / 3,600 / 6,400 / 11,500; it was about 1.3 times). With the old values the simulated player bought every rod step from easy water in the zone before and never fished a zone until it was easy. Oscar accepted the inflation (a matched Abyss charter earns about 2 million coins an hour) with an economy repass to follow (TODO Ideas).
- **Reed sells it all:** the Deep Sea Rod, its steps and levels and the boat parts, at his stand; the stall's Sea gear tab is gone.
- **Bands on the reference hands** (careful / skilled; `scripts/seaeconomy.ts`):
  - In a zone, a rod step takes a fight from about 35 / 28 s (Tough) to 19 / 14 s (Fair) to 12 / 10 s (Easy) and a spool from 17 / 23 landed fish to 33 to 60. A careful hand lands about 88% at Tough; everything easier lands every time.
  - With the first build's prices, zones opened at about 38 / 35 minutes, then 2.8 / 2.5, 5.1 / 4.5 and 7.4 / 6.6 hours, and all eight rod steps were bought by 9.2 / 8.2 hours. The gap between the hands is about a seventh (it was more than double under "The edge pays"). (The first write-up said 0.7 / 0.6, 3.1 / 2.7, 5.4 / 4.7, 7.7 / 6.7 and 10.3 / 9.0 hours: that sim left shinies out of the coins, about a fifth of them, and only bought between whole spools.)
  - The simulated player spends a little over half its time at Fair and the rest at Easy; Tough is a choice for a player who wants the next zone sooner, since a Tough zone pays more pearls an hour than the easy zone before it.
  - A million lake coins shorten the journey by about a third and cannot skip a zone.
- **Second play test (Oscar, 2026-11-13):**
  - **The first zones come fast** (`BOAT_PARTS`, `ROD.stepCoins`): Oscar wanted the first boat part after 5 to 10 minutes, as a taste of the progression, the next 15 to 30 minutes on, then an hour to an hour and a half, and so on. The parts now cost 30 / 150 / 1,500 / 10,000 pearls, and the rod's first steps came down with them (40,000 / 90,000 / 150,000 / 350,000, then 600,000 / 1,300,000 / 1,200,000 / 2,400,000): with only the parts cheaper, the Drop-off opened at Tough with the step that makes it Fair still an hour of the Shelf away. On the reference hands (careful / skilled) the Drop-off opens at about 9 / 8 minutes, Kelp Deep at 43 / 40 minutes, the Twilight at 2.2 / 2.0 hours and the Abyss at 5.3 / 4.9 hours, with all eight rod steps by 6.4 / 5.7 hours. The sim's player goes back to the Shelf for coins; one who stays in the Drop-off opens Kelp Deep in about 20 to 25 minutes.
  - **What that gives up:** the Abyss opens at about 5 hours, not the 8 to 10 agreed for the first build. The last leg (the Twilight, about 3 hours) is the one to stretch if the Abyss should be further off: 3 to 4 times the leg before it already, and the endless levels are where the long game is meant to be.
  - **The shown coins a fish are the average a player gets** (`averageSale`, `payAt`): over the zone's everyday fish and legends, with shinies (one in 20, five times the coins) and Feisty or Brutish fish counted in, to three figures: about 1,470 / 2,710 / 4,830 / 8,610 / 15,500 by zone, a third over the plain everyday fish the first build showed. The clean-catch bonus, snacks and charms are left out, as the player's own. `typicalSale` (the plain everyday fish) still sets the fish's `baseValue`s.
  - **Black Pearls show as progress, not a purse** (`partProgress`): they only buy boat parts, so the level-and-coins row has no pearl count; the strip, Reed's boat row and the cards after fishing show the next part's bar ("Kelp cutter 96 / 150"), teal and "ready" once Reed can fit it, with a toast at sea when a fish fills it. With every part fitted the strip and Reed show the pearls held, until they have a use.
  - **The strip is centred** at the top of the screen at every size, in four cells (where, line, this charter's coins, the next boat part). What the last fish cost or paid shows at the right end of a cell's label, so the strip doesn't change width. On a screen too narrow to clear the level and coins it sits under them, still centred; on a phone it is a size larger, centred between the level and coins and the buttons, without this charter's coins.
- **The boost: Shiny Lures at sea (Oscar, 2026-11-13, after a third play test; PLAYTEST.md, "The plan agreed"):**
  - **The frame:** playing charters straight is the base loop, slow on purpose, and it leaves a player asking what would speed it up. The answer is the flow the lake already has: lake fish, chips at the Prize Counter, Shiny Lures, shinies on the charter. Oscar found it himself (about 30 lures and a Spirit Banquet made one Twilight charter pay about 1.5 million coins against 260,000) and liked the jump from slow, steady progress to a faster pace he had prepared for. Boosts aren't needed in the first two zones.
  - **A shiny sea fish pays five times the pearls** (`PEARLS.shiny`, `pearlMult`), as well as the coins, multiplying with a tag and a legend. Before this a lure sped up coins only, so it opened zones no faster. Natural shinies add about a fifth to a plain player's pearls.
  - **The lure's price stays flat in every zone** (15 chips for 3 casts, one lure a fish). A simulated lured lake fish turns in for about 9.5 chips (only 16% of plain casts and 34% of perfect casts hook a top-tier fish), so luring a whole spool costs about as much lake time as fishing it, in every zone: neither a spool's length nor lake income grows by zone. Dearer lures further out came out barely faster than plain play. A fully lured spool pays about 4.2 times an average plain one; counting the lake time the pace is about 2 times (about 3 for a player who fishes the lake at night with perfect casts and a Spirit Banquet, and almost nothing for a slow one). The lake's times are assumed, not measured: `docs/charter-boost/sims/lake.ts`.
  - **The plain path is longer** (`BOAT_PARTS`, `ROD.stepCoins`): Oscar took "the Abyss at about 5 hours" as the lured player's time. The Deep lamps and the Iron keel cost 3,000 and 25,000 pearls (were 1,500 and 10,000) and rod steps 5 to 8 cost 900,000 / 2,000,000 / 2,400,000 / 4,800,000 coins (were 600,000 / 1,300,000 / 1,200,000 / 2,400,000), so coins don't pile up while the pearls are earned. On the reference hands (careful / skilled) the plain path opens the Twilight at 2.6 / 2.4 hours and the Abyss at 8.4 / 7.5, with all eight steps by 9.8 / 8.8; a careful hand luring from Kelp Deep at the middle lake rate opens the Abyss at about 5.0 hours, half of it at the lake (`docs/charter-boost/sims/journey.ts`). The first two zones are unchanged. A best estimate, to revisit once `/lakestats` has real chips per lake hour.
  - **The screens say it:** Reed's chart counts the charters to the next boat part, plain and with Shiny Lures, and shows the lures held with their switch; the Prize Counter says the lure works at sea, sells 30 casts at once and has "Turn in all"; the catch card credits a shiny in its pearls line and the cards after fishing count the shiny fish. Before this no screen said a lure works at sea.
  - **Set aside** (the list is in PLAYTEST.md): slots, racks and caps for lures; a lure fee; earned all-shiny charters; zone drops; lures priced by zone; vouchers; sea fish brought home. Oscar: think simplicity, and keep the flow that exists.
- **The hold and the coin retune (Oscar, 2026-11-14, after his first play of the boost; PLAYTEST.md, notes 2 and 4 and the Inbox):**
  - **Why:** a charter held far too many fish (60 at Easy on a spool), coins had nothing left to buy (about 3 million spare by the Iron keel on his Twilight charters), and a newly opened zone paid no more coins an hour than the one before (note 4).
  - **The hold replaces line** (`HOLD`, `holdFish`, `afterFight`): a charter is a set number of landed fish for a fee. A fish that gets away takes no place, a missed strike costs nothing, and when the hold is full the charter waits at sea with one way on, Head home; there is no buying another hold. Spools, metres a fish and "another spool" are gone. Not a timer: a clock adds pressure (Oscar).
  - **One hold, on the rod's pattern** (`nextHoldBuy`): 10 fish to start, and a bigger hold on sale from Captain Reed as each zone opens, 5 fish more each time: 15 / 20 / 25 / 30 for 25,000 / 300,000 / 8,000,000 / 10,000,000 coins (the last two were 4,000,000 / 8,000,000 in the first build: see the journey below). Not a hold per zone, and no endless levels. Existing players start at 10 (Oscar).
  - **The fee** (`CHARTER_FEE`): two average fish of the zone, paid on casting off: free on the Shelf, then 7,000 / 14,000 / 27,000 / 54,000. Four fish (the first proposal) took 27% of a 15-fish hold and put the Drop-off 13% under the free Shelf.
  - **A charter's length** (careful hand, 45 s around each charter): 4 / 6 / 7 / 9 / 11 minutes at Easy for a hold of 10 / 15 / 20 / 25 / 30, 5 to 15 at Fair, 9 to 25 at Tough (a spool was 21 at Easy, 16 at Fair, 14 at Tough). Oscar (2026-11-14, after playing it): 4 minutes is the shortest a charter should go, so the 10-fish hold is the floor. A hold level is worth 20 to 50% more a charter but only 2 to 7% more coins an hour from Kelp Deep on (13 to 15% in the Drop-off) and 1 to 3% more pearls: longer charters and fewer trips, not speed. So it is priced as the place for spare coins, and it doesn't move the Abyss.
  - **A new zone pays clearly more from Fair** (sea fish `baseValue`s): from the Drop-off on, a zone's fish are worth about twice the zone before, about 1,470 / 3,400 / 6,800 / 13,600 / 27,200 coins a fish (were 1,470 / 2,710 / 4,830 / 8,610 / 15,500). A new zone at Fair now earns about 26 to 28% more coins an hour than the zone before at Easy for a careful hand and 45 to 50% for a skilled one (it was −3% to +7%). At Tough it still earns 10 to 18% fewer coins than the zone before, but more pearls. The late zones were raised rather than the early ones lowered, since a Shelf fish is already under a top lake fish.
  - **Prices follow the coins:** with richer zones and the old prices the Abyss opened at 7.1 hours plain and 4.6 lured, with about 9 million coins spare. Each zone's rod steps went up by its coin factor: 50,000 / 110,000 / 200,000 / 500,000 / 1,400,000 / 4,000,000 / 4,200,000 / 8,400,000 (step 6 was 3,200,000 in the first build), and Abyss levels from 1,750,000 rising 12%. The Storm sail costs 25 pearls (was 30), so two 10-fish Shelf charters open the Drop-off 86% of the time (57% at 30), always by the third.
  - **The journey** (careful hand; `scripts/seaeconomy.ts`): the first build (25-fish hold 4,000,000, step 6 3,200,000) opened the zones at about 8 min / 32 min / 2.7 h / 8.5 h plain (were 7 min / 36 min / 2.6 h / 8.4 h) and the Abyss at 4.9 h lured (was 5.0), with up to 2.8 million coins idle. Oscar's play test the same day found coins still piling up in the Twilight (about 2 million a lured 30-fish hold): his coins run about a quarter over the sim (dishes and charms), which leaves about 6 million idle there. The coins earned per pearl are the same lured or plain, so every player banks about the same coins while earning the Iron keel's pearls; a lured one just gets there sooner. Oscar chose to raise both the hold and the rod there: the 25-fish hold 8,000,000, the 30-fish 10,000,000 and step 6 4,000,000. At the sim's coins the Abyss opens at about 8.6 h plain and 5.1 h lured (skilled 7.6 / 4.7) with under half a million idle, and the 25-fish hold is bought just after the Abyss opens; at Oscar's coins, about 8.0 h and 4.9 h with about a million idle and the hold bought before. The price of soaking up the coins is a longer stretch with nothing to buy: the longest wait between purchases before the Abyss is about 2.7 hours plain and 1.8 lured at the sim's coins.
  - **The Abyss:** the hold doesn't cap how far a player reaches. From the furthest marker a charter ends because the fish turn Too much, not because the hold fills; a 30-fish hold reaches as far as a spool did, or a marker or two further for a skilled hand, since lost fish cost nothing. From an easy start it fills at 10 markers, a full tier.
- **Open:** pearls pile up once the Abyss is open (about 8,500-13,400 by the last rod step on the plain path, and they have no bar to fill by then): a pearl purchase every five Abyss markers to sail further is the idea on file. The Abyss's tuning is not simulated. Nothing is at stake in a charter but time; if charters feel flat, stakes can come back in the Abyss only.



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

### Oscar's first charters (2026-11-01)

On the base Aurora Rod and line Oscar reached fish 39 with no snaps and ran out of line there. The last stretch was a slog: fights of minutes, barely gaining line after each surge. Rebuilt from the bots (`botFight` on `rollSeaFish`, `rollSize` and `seaDifficulty`, 300 fish a marker), metres of spool per marker of 5 fish / share of fights over 60 s:

| Player | 20 | 25 | 30 | 35 | 40 | Out of line from the harbour |
|---|---|---|---|---|---|---|
| Fast (0.25 s, best style, rides near the red) | 15 m / 0% | 27 / 0% | 42 / 1% | 65 / 0% | 76 / 0% | ~fish 49 |
| Careful (0.3 s, eases off 0.2 short of the red, like Oscar) | 33 / 3% | 65 / 14% | 127 / 36% | 163 / 42% | 152 / 41% | ~fish 36 |

The careful player's 90th-percentile fight passes 2.5 minutes from marker 30 on: easing off early hands the fish line in every surge, and Drop-off weight makes it slow to win back. A lower weight cap (3.0), milder Runners (`run` 1.3) or less pull spread (1.2) each moved the careful player's run by a fish at most, so the fix is fish that tire (built: "Fight left" below).

### Fish stamina (fight left)

How much fight a hooked fish has left. Built for the sea (2026-11-01), and every fish's since 2026-11-02 (`P.tire` in `reel.ts`); the old light trim (surge power ×0.85-1) is only left so older lab fights replay. The fight is you against the fish: your skill and persistence, backed by your gear, against its size, strength and energy.

- **Three stages, on one bar above the gauge labelled FIGHT** (only the bar says which stage; words like "tired" could read as the player, Oscar). **Full fight** (orange): full-strength surges, the longest, close together. **Tired** (yellow, from 60% left): as it drains, its surges pull weaker (to 40%), get shorter (to 65%) and come further apart (to 1.75×), all gradually: the pull marker slides down even within a surge. **Exhausted** (empty): dead weight, no more surges, REEL IT IN!
- **You tire it.** Fight drains while it surges against a tight line (tension at or above its pull), at a quarter of that against slack, and at 45% of that while you reel it in the calm with the gauge green. The bar glows softly while it's surging against a tight line, where it tires fastest.
- **Heavier fish have more fight**, as the square root of weight (11 s of surging at weight 1, 22 s at 4), so the rod still decides how long a fight runs and how much spool it costs, and the bar drains about as far on a long fight as a short one (Oscar, 2026-11-02; it was in proportion, 6 s a unit); a legend's has 1.5× as much.
- **Tiring never beats the line.** A fish whose pull reaches the red keeps every surge just inside it however tired it gets (or at its full pull, if a weak roll pulls less), so a fish too strong for your line keeps fraying it; it can't be waited out.
- **The marker reads as strength.** Each surge pulls within ±5% of the others (`powerJitter`, pond and sea alike since 2026-11-02; the pond had ±20%), so how high the marker sits is the fish's strength, and its fall is the fish tiring, not luck. Fish still differ from each other by their own pull roll.

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
- **The last markers are a gamble, not a wall.** Every fish rolls its own pull, up to ×1.4 either way, and the hook toast says so ("A strong one!" / "A light one."); the sticker under the gauge keeps it up all fight ("💪 Strong · 💥 Thrasher"), red with "too strong for your line" when its surges reach the red. Near the frontier some fish are fine and some are too much, and the player sees which before the first surge. Without the roll every fish at a depth is the same and the land rate falls off a cliff.
- **Both tracks count, and neither is a wall on its own.** Each Deep Sea Rod level takes the most off weight and a little off strength; each sea line level the reverse. A player who levels only one track still goes deeper, just less far than one who levels both.

Nothing new to learn out there, only harder versions of what the pond already taught.

## Complexity budget

What the player has to hold in their head, kept to the minimum that is still actionable:

- **One input.** Hold and release.
- **One gauge** with one new mark on it: the fish's pull marker, so strength-vs-line is visible.
- **One line bar** that already exists, now the place where weight-vs-rod is read.
- **Two gear numbers** to compare against a fish: rod and line, on one item. Two messages, one each.
- **Two tags** a fish can carry, one per axis.
- **One bar**, fight left, at sea: it shows the fish wearing down and how to tire it (keep the line tight), and never lets a fish past the line's wall.

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

### Rerun with the deep zones' fish (slice B, 2026-11-01)

The same sim with the deep zones' own fish (about 2,500 / 3,500 / 5,000 coins a catch, legends 3×) and the legends' longer fights. The frontier and pearls an hour barely moved; coins an hour now climb with gear, from ~220k to ~650k for a fast player. Under the old coin prices (capped at 150k / 75k from +13) levels took only 42-45% of a fast player's charter coins by +20 / +20.

| Rod + line levels | Coins an hour, fast / slow | Share of charter coins on levels, fast / slow: old → new prices |
|---|---|---|
| +0 / +0 | 218k / 179k | 46% → 65% / 32% → 45% |
| +10 / +10 | 336k / 280k | 66% → 68% / 51% → 52% |
| +20 / +20 | 528k / 418k | 45% → 61% / 45% → 61% |
| +30 / +30 | 656k / 553k | 42% → 73% / 41% → 71% |

New coin prices (Oscar, 2026-11-01): the rod 75k + 6k·N, the line half that, with only a safety cap past +54. Slow players stay under the 60-75% band early: they earn about as many coins as fast players but far fewer pearls, and pricing for them would leave fast players coin-bound. Best-rate play still farms easy water short of the frontier.

## Fight left (2026-11-01)

After Oscar's first charters (above). Measured with `scripts/seafights.ts` (spool, long fights and stages per depth, base gear unless stated) and `scripts/seaeconomy.ts` (whole charters, best start marker and head-home rule). "Careful" eases off 0.2 short of the red at 0.3 s, like Oscar; "fast" is the best of the bot styles at 0.25 s.

| On base gear | Before | After |
|---|---|---|
| Out of line from the harbour, fast / careful | fish 44 / 34 | 45 / 39 |
| Careful: fights over a minute at marker 30 / 45 | 36% / 35% | 0% / 0% |
| Careful: slowest 1 in 10 fights at marker 30 / 45 | 140 s / 157 s | 35 s / 38 s |
| Tired surges before exhausted, at marker 45 | | 5-6 |
| Fights reaching exhausted at marker 45, fast / careful | | 20% / 31% |

| Rod + line levels | Out of line, fast / careful: before → after | Pearls an hour, fast / careful: before → after |
|---|---|---|
| +10 / +0 | 68 / 61 → 72 / 66 | |
| +0 / +10 | 79 / 50 → 76 / 55 | |
| +0 / +0 | 44 / 34 → 45 / 39 | 288 / 228 → 297 / 256 |
| +5 / +5 | 73 / 60 → 75 / 64 | 498 / 360 → 566 / 488 |
| +10 / +10 | 96 / 87 → 98 / 91 | 786 / 655 → 828 / 738 |
| +20 / +20 | not rerun | 1,318 / 1,185 → 1,347 / 1,220 |

What set the numbers, over five play-test rounds:

| Finding | Consequence |
|---|---|
| Fish that tire take far less spool, and a slow player stops losing it to slogs, so the frontier moved 5-10 fish deeper. | Line taken costs 15 m of spool per fight length (`DIVE.metresPerLine`, was 10), keeping a fast player's frontier within a fish or two of before at every gear level. |
| With fight in proportion to weight minus 1, rod levels shortened fights so much that rod +10 moved a fast player's frontier 7 fish deeper. | Fight is in proportion to weight itself (`tire` w0 = 0). |
| Tiring only during surges left 2-3 tired surges, with few fish ever exhausted; tiring in the calm as well cut the tired stage short. | Calm tiring at 45% of a surge's, with weaker, shorter tired surges, gives 5-6 tired surges near the frontier. |
| Surge strength fixed at each surge's start made the fade a staircase: full, ~90%, then ~30% on the last surge. | The pull fades every step, sliding within a surge; no surge pulls more than a sixth of the gauge below the one before. |
| Per-surge spread (±20%, Thrashers ±40%) made the pull marker jump, so a fish near the red felt random. | ±5% at sea, and the sticker and loss card name the line (below). |
| A legend's weaker tired surges come over a longer fight. | A legend takes about 1.4× the spool of an everyday fish at its depth (was ~1×); legends are 1 bite in 20. |
| Pearls an hour rose 2-14% for fast players and 3-36% for careful ones (most at +5 / +5), coins an hour barely moved. | Prices left alone: within the spread the level pricing already allows. |
| With fish that tire, a fish the line holds comes in and one over it gets away, so past the Drop-off the land rate follows the share of fish the line holds: the approach to the frontier is longer and spool per fish climbs less steeply. | The frontier tests now allow it (`dive.test.ts`). |

The bots never flutter into the red the way Oscar does, so they understate how far that play goes (he rode one spool from marker 35 to 60 on base gear); see the green-zone item in TODO Ideas.

## Decisions so far

- The sea continues the pond with no fight logic of its own (Oscar, 2026-11-02): zones as fish tiers, gear levels as gear tiers, one formula, rod for weight and line for strength with no crossing, no weight cap (a slog is the sign of the rod's limit, and +3 runs off), one set of temperament names for pond and sea, no sea pull roll, no Sounder for now; a shared baseline first, sea-only modifiers after. It replaces "both tracks count" and "stops short of the slog" in "The sea" below.
- Weight tests persistence, strength tests tension management (Oscar, 2026-11-02); pond fights take about 10 / 25 / 60 s at 0 / +1 / +2 weight, and pond fish tire like sea fish.
- Fight grows as the square root of weight, so the FIGHT bar drains about as far on every rung; one surge spread, ±5%, pond and sea (Oscar, 2026-11-02). It replaces "in proportion to weight" in "Fish stamina" below.
- +2 strength is the limit however well someone plays: measured on the best play a quick hand (Oscar's 0.12 s) can find, not on Oscar's current habit (Oscar, 2026-11-02).
- The foundation in the game (Oscar, 2026-11-02): one tier is one rung (a pond fish's stats are its tier, gear's its tier); nothing but the two gaps varies until modifiers are wanted; the sea a placeholder (a tier every 30 fish, a level 0.15 of a tier) until the sea mapping; the lab's gauge in the game with the FIGHT bar above. "The foundation in the game" above.
- The foundation (Oscar, 2026-11-02): a fish is its strength and weight against the line and rod, only the gaps count, everything else constant with no random spread, variety later as modifiers; the rungs are conceptual (0 parity, +1 slight challenge, +2 the frontier, +3 the hard line); letting go gives more line the stronger the fish, the calm reels slower the heavier, and with the button up the fish always takes line. "The foundation" above, playable in the gauge lab.
- The gauge is the ladder (Oscar, 2026-11-02): strength sets the pull marker against the red, weight sets where holding wins line, letting go in a surge gives line and the dot falls slower on stronger fish, and the overs add up (+1 on both feels like +2, the frontier). "The gauge is the ladder" above; built as the foundation.
- One tier ladder for both axes, pond and sea alike (Oscar, 2026-11-02): 0 ideal, +1 landable, +2 about half for a skilled player, +3 not landable ("The ladder" above). It replaces the line as the hard wall at +1 and the rod's run-off at +2, below.

- Line is a separate upgrade path, presented as a spool on the rod (2026-10-31).
- Feisty and Brutish tags for outlier rolls, shown at hook time, never wall-crossing (2026-10-31).
- "Too heavy" only fires when the fish's weight class is above the rod's tier, once per fight (2026-10-31).
- Both walls end the fight on their own; nothing waits for the player to quit (2026-10-31).
- Line: Twine, Mono, Fluoro, Braid, Moonsilk, unlocking at levels 1, 2, 5, 9, 13 for 0, 100, 500, 2 000, 8 000 coins; saves from before line get the line of their best rod (2026-10-31).
- Surge length is a pace lever; weight is drag and reel speed only (2026-10-31).
- Shiny, size and Brutish all sit on weight; shiny only counts on gear that handles the fish (2026-10-31).
- Gloves act on weight (they are Quick-Reel Gloves) (2026-10-31).
- Sea fights on the two axes (2026-11-01): the rod decides how long the spool lasts, the line whether it holds; each zone leads on an axis and keeps it; per-fish pull roll named on the hook toast; behaviours are feel only. The frontier keeps P1's pacing table, counting rod and line levels together, and levelling only one track is a soft stall (slower), not a wall.
- A sea line that levels at Marlow's for Black Pearls, a second track next to the rod's levels, "because it gives players more to invest in" (Oscar, 2026-11-01). It's the **Deep Sea Line +N** (Oscar, 2026-11-01). Priced to keep P1's pace and leave charters paying for both tracks with coins to spare ("Sea economy" below).
- Messages as built (slice 3, 2026-10-31, reworked after Oscar's first play test the same day): during the fight only the gauge speaks ("Too strong for your line!" when a surge's pull sits in the red, "Too heavy for your rod" on the drag caption for a fish above the rod's tier), plus a sticker in the lower right of the screen for a Feisty (⚡, the red zone's orange) or Brutish (⚓, steel blue) fish, which also says what it pays. A lost fight ends on one card: **SNAP!** or **RAN OFF!**, the cause in a line ("Too strong for your Mono Line"), the fix in a line ("Fluoro Line holds it · Marlow's, 500 🪙"), and "noted in your Fishdex" when the fish was over the gear. Player-error losses get a reel tip instead of a gear fix. No mid-fight toasts, no separate hint bubble after a loss. Buying or inspecting bait above the line warns which line holds what it attracts. Sea fights get the same card: a snap names the Deep Sea Line's next level when the fish's surges reached the red, a run-off the Deep Sea Rod's when it was at its heaviest, anything else a reel tip (slice 2, 2026-11-01). The line comes first (Oscar's play test, 2026-11-01): a fish whose surges reach the red that runs off took the line given to save it from fraying, so that card names the line too, as does the drag caption.

- **The Deep Sea Rod** (Oscar, 2026-11-01): charters get their own gear. Buying the rod at Marlow's (level 20, 100,000 coins, the next grind after the Aurora Rod and the pond's top gear; a default for the play test; Aurora Rod owners too) is what pays for charter access. It's no bag item: it waits on Reed's boat and is in hand at sea, where the hotbar shows only it (the rest waits untouched until home) and badges in the bottom right show the rod's and line's levels, so a charter can't be fought on the wrong rod. The rod levels moved to it from the Aurora Rod, which is the pond's top rod again; levels already bought carried over. The Deep Sea Line comes on it and is sea only: the pond keeps its own line (saves that had it spooled over a line under Moonsilk got Moonsilk). In first person it's longer than the pond rods, with loop guides on top and a lever reel whose spool empties as the charter's line runs down and whose crank turns as fast as line is won (`Reel.reelRate`). It holds a landed sea fish out past the rail and draws it bigger than the pond would (`seaHeldScale`, `seaHangPitch`), so a marlin fits the screen.
- Fight left at sea (Oscar, 2026-11-01, five play-test rounds): full fight, tired, exhausted on one bar labelled FIGHT; tired surges fade gradually in strength, length and frequency; you tire a fish by keeping the line tight, in surges and while reeling it in; tiring never takes a surge out of the red; each surge pulls about the same; a sticker under the gauge shows the fish's pull and behaviour all fight. Pond fights unchanged for now.
- The deep zones' fish (Oscar, 2026-11-01): all 17 from the Deep Sea Fish Options page. Legends fight about 1.5× longer than everyday fish at the same depth, from slower reeling only, so a legend is a long fight but never over the gear by itself. Landing one gets its own moment: legendary jingle, a gold banner and catch card; everyday sea fish get a lesser jingle.

## Open questions

- The time budget numbers, set by play test.
- ~~Whether tagged fish are worth a little more, so Feisty is welcomed rather than dreaded.~~ Yes: +15% on the landed fish, stacking with the clean catch's +10% (Oscar, 2026-10-31).
- ~~Wording and placement of the bait-over-line shop warning.~~ The bait's top fish in the hook toast's words, against line and rod, in the bait's details at the shop and in the bag; from two rungs over a ⚠ that names the gear, also shown after buying (Oscar, 2026-11-03; `baitWarning`).
- ~~Whether the Fishdex sighting shows the fish's silhouette or its name.~~ Both: the silhouette with the real name, since the player has seen it on the line (2026-10-31).
