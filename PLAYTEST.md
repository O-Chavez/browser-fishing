# Play-test notes: sea charters

Feedback from players testing the charters after the rework ("A place to earn", merged 2026-11-13), what was checked against the game, and what Oscar decided in the workshop that followed (2026-11-13). Nothing here is built yet.

- A note that becomes work moves to [TODO.md](TODO.md) and is ticked here with a pointer to it.
- New feedback goes under **Inbox** at the bottom as it comes in, in the player's words, and is sorted into a numbered note later.
- Sim numbers are from `npx tsx scripts/seaeconomy.ts` on main at `168017c`, the careful hand (0.4 s) unless it says otherwise. The sim counts no Shiny Lures, Lucky Charms or dishes, so kitted players earn more than it shows.

## At a glance

| # | Note | Status |
|---|------|--------|
| 1 | Shiny fish at sea don't seem to pay more coins | Decided: a shiny sea fish pays five times the pearls too. The coins already work |
| 2 | A fish quota by hull instead of spools of line | Decided: a hold replaces line. Size, fee and upgrades still to set |
| 3 | Something to buy that raises pearls a fish | Decided: no new purchase. The Shiny Lure is the boost |
| 4 | Early zones pay more coins than the ones after | Target decided: a new zone pays clearly more from Fair. Numbers still to set |
| 5 | The pearl jump after Kelp Deep needs goals in between | Partly answered by the boost and Reed's chart. The upgrade ladder is still open |

---

## The plan agreed: the charter loop and its boost

**The shape (Oscar):** playing charters straight is the base loop: charter, spend the proceeds on the rod and boat parts, repeat. It is slow, gets a player there for the cost of time, and leaves them asking what would speed it up. The answer is the flow players already have: lake fish, chips at the Prize Counter, Shiny Lures, shinies on the charter. Boosts aren't needed in the first two zones, which pass quickly.

**The three rules** (signed by a four-seat review of subagents, accepted by Oscar):

1. A shiny sea fish pays five times the coins and the Black Pearls. Today it pays five times the coins and no extra pearls (`pearlsFor`, `src/game/dive.ts`), so a lure opens zones no faster.
2. The Shiny Lure stays as it is: 15 chips for 3 casts, one lure a fish, at the lake and in every zone. Also sold 30 at a time for 150 chips.
3. Reed's chart shows it: the holds to the next boat part plain and with Shiny Lures ("About 12 holds to the Deep lamps · about 3 with Shiny Lures"), the lures held, and the on/off switch. The Prize Counter tile reads "Casts that always hook a shiny, at the lake or at sea."

**Why the lure's price stays flat:** a lured lake fish averages 9.5 chips (only 16% of plain casts and 34% of perfect casts hook a top-tier fish), so luring a whole hold costs about as much lake time as fishing it, in every zone. Neither a hold's length nor lake income grows by zone. Every dearer-by-zone option came out barely faster than playing plain.

**How big the boost is:**

| | A lured hold against a plain one | Pace counting lake time |
|---|---|---|
| Ordinary player | about 4 times | about 2 times |
| Optimiser (night, perfect casts, Spirit Banquet) | about 4 times | about 3 times |
| Slow lake player | about 4 times | about 1.1 times |

These rest on a scratch simulation of the lake (the game's fish values, tier odds and fight lengths; a fight of 5 to 6 s, a bite at 3.3 s) with assumed times around it: 7 s to cast, strike and read the card, 45 to 90 s for a casino round trip per hotbar of fish. The middle rate, about 570 chips an hour net of lures, is good to about 30% either way; the low and high cases (220 and 925) are four times apart. The perfect-cast rate moves it most. The scratch simulations are kept in `docs/charter-boost/sims/` (`lake.ts` for the lake rate, `journey.ts` for plain against lured, `hold.ts` for the hold, `bj.ts` for blackjack); `npx tsx docs/charter-boost/sims/lake.ts` reprints the table.

**Build order:**

1. Shiny pearls; the chart line and the lure switch at Reed's; the Prize Counter wording; buying 30 at once; a What's new entry.
2. "Turn in all" at the Prize Counter; a lured-fish count on the "Home safe!" card.
3. A play test that logs chips per lake hour, then the boat part prices.
4. The Abyss, when it is designed. Until then the same lure works there.

**Oscar's decisions (2026-11-13):**

- The Abyss opening at about 5 hours is the lured player's time. So the plain path gets longer, and the later boat parts go up. A first candidate from the review: Deep lamps 3,000, Iron keel 25,000, rod steps 5 to 8 at 900k / 2.0M / 2.4M / 4.8M, which gave plain 2.6 h and 8.4 h to the Twilight and the Abyss, and lured 2.0 h and 5.0 h at the middle lake rate. Set the real prices with the sim once lake rates are logged from play. Play testers already called the Twilight leg long on the plain path, so check that an 8-hour plain path is wanted before shipping it.
- The walks between the pier and the Prize Counter stay as they are. One hold's lures take about 33 lured lake fish, seven hotbar loads with the Tackle Vest (five fish) and eleven without (three); one reviewer called that a tedious task. Oscar: it isn't a bad thing. In his own play he would catch a very valuable fish (about 50,000 coins), gamble it, and turn the result in for lures; a win feels like more than a loss costs, and it keeps gambling in the loop while staying fun. A 50,000-coin fish is 50 chips, 10 lured casts; doubled on the Lucky Wheel it is 20, and on the five-times wedge 50, more than a hold's worth. The wheel is a fair bet, so it changes the swings, not the average pace.
- Lost fish take no place in the hold.
- Shiny Lures keep working at the lake.
- What pearls are for once the Abyss is open is on the back burner.

**Still open:**

- **The slow lake player.** Their lured hold looks four times richer but the journey is no shorter. Watch for it in the play test; the walks themselves are settled (above).
- **The Abyss.** A flat lure there is a lasting 2 to 3 times on rod levels an hour, and the Furthest Out board leans toward lake hours. On file: lures sold by Reed for Black Pearls there.
- **Top Anglers.** A lured sea catch counts today (`applyCatch` sets the best catch for sea fish). Left as is.

**Found along the way:**

- Blackjack may pay the player about 1.8% a hand with good play (two reviewers' simulations: naturals pay three times). Not checked in the code. Filed in TODO Ideas, Casino.
- The catch card credits a dish's shiny bonus on a lured cast, where the dish did nothing. Filed in TODO Ideas, Bugs.
- A missed strike at sea costs no line but still spends the lure (the lure goes at the cast, since every sea cast hooks a fish).

**Set aside, so they aren't proposed again:**

- Slots on the cast-off card for lures and a dish; a chip shelf of permanent boat upgrades; lake fish as live bait (Oscar: not cohesive enough).
- Reed's fee paid in Shiny Lures; an all-shiny "shiny water" charter earned every third hold; a zone drop a lure needs to bite at sea (Oscar: too much mechanism, think simplicity).
- Lures named and priced by zone, or one lure costing more per shiny further out (slower than plain at the measured lake rate).
- Charter vouchers as a new currency, and charters locked behind vouchers (a fourth currency; sea earnings would pay for the boost; a lake toll on the plain loop).
- The best fish of a hold coming home to stake or turn in (the Abyss would fund its own lures).
- A sea dish from Mags (the Spirit Banquet already works at sea).
- Parked, not dropped: chum that calls more Feisty and Brutish fish (it multiplies with lures).

---

## 1. Shiny fish at sea don't seem to pay more coins

- [ ] Shiny pearls (the plan's first build step)

**Reported:** the shiny bonus doesn't seem to change a sea fish's value the way it does at the lake. Shiny fish raise the pearls but not the coins.

**What the game does:** the reverse. A shiny sea fish sells for 5 times the coins, the same rule as the lake (`sellValue`, `SHINY_VALUE`; a 155 cm Copper Snapper is 1,150 plain and 5,750 shiny), and pays no extra pearls. Only a Feisty or Brutish fish (double) and a legend (five times) raise pearls (`pearlMult`, `src/game/dive.ts`). Shinies roll at 5% at sea, with no 15% at night.

Best guess at what the players saw: the pearls line on the catch card reading "double: Feisty" taken for the shiny's doing, or the 5 times going unnoticed because the fish is sold as it lands. Not staged in the game.

**Decided:** a shiny pays five times the pearls as well. It multiplies with Feisty or Brutish and with legends (a shiny legend 25 times). Natural shinies alone add about 20% to a plain player's pearls an hour.

---

## 2. A fish quota by hull instead of spools of line

- [ ] Build the hold (size, fee and upgrades still to set)

**Reported:** replace line with a hull quota: a set number of fish per charter for the fee, raised by upgrading the hull.

**What line does today** (`LINE`, `SPOOL_COINS`, `src/data/dive.ts`): a 300 m spool; a fish uses 5 m at Easy, 9 m at Fair, 13 m at Tough, and one that gets away 25 m more. That is 60 fish a spool at Easy, 33 at Fair and 17 to 23 at Tough. Free on the Shelf, then 14,000 / 26,000 / 46,000 / 83,000 coins.

**Decided:** a hold replaces line. A charter is a set number of landed fish for a fee, and a fish that gets away takes no place in it. Not a timer: line is already close to one (every spool lasts 14 to 21 minutes), which is why a Tough zone pays less per charter, and a clock adds pressure.

**Measured on the fight bot** (a scratch model, careful hand, 30-fish hold): a full hold takes 11 minutes at Easy, 14 to 15 at Fair and 25 at Tough.

**Proposed, not confirmed:**

- The fee as four average fish of the zone (free on the Shelf): about 13% of a 30-fish hold's take in every zone.
- The hold as bag space, one level a zone (20, 30, 40, 50, 60 fish). It is worth only a few percent in fees per level; the point is longer charters without paying again.

---

## 3. Something to buy that raises pearls a fish

- [x] Answered by the plan above: the Shiny Lure with shiny pearls is the pearl boost. No new purchase from Reed.

**Reported:** add something that raises pearls per fish, as a coin investment that directly helps progression.

---

## 4. Early zones pay more coins than the ones after

- [ ] Retune with the hold

**Reported:** for one charter, the first zone returned far more coins than the next ones, at least up to Kelp Deep. "I think I just make way more money sticking to the early zones."

**What the sim shows:** the players are right. A newly opened zone out-earns the one before only once both of its rod steps are bought and it reads Easy.

Coins an hour, the new zone against the zone before with the same rod:

| Arriving in | Rod steps | Reads | New zone | Zone before |
|---|---|---|---|---|
| The Drop-off | 0 | Tough | 148k | 271k |
| The Drop-off | 1 | Fair | 315k | 318k |
| The Drop-off | 2 | Easy | 466k | 327k |
| Kelp Deep | 2 | Tough | 270k | 466k |
| Kelp Deep | 3 | Fair | 531k | 543k |
| Kelp Deep | 4 | Easy | 915k | 616k |
| The Twilight | 4 | Tough | 422k | 915k |
| The Twilight | 5 | Fair | 968k | 901k |
| The Twilight | 6 | Easy | 1,514k | 1,009k |

Per spool after paying for it: the Shelf 93k (free spool); the Drop-off 37k at Tough, 85k at Fair, 164k at Easy; Kelp Deep 70k, 143k, 319k.

**Why:** fish a spool fall from 60 to 33 to 17 as a zone goes from Easy to Fair to Tough, while coins a fish rise only 1.8 times a zone (about 1,470 / 2,710 / 4,830 / 8,610 / 15,500); the spool costs coins past the Shelf; and a Tough fight takes about three times as long as an Easy one.

**Decided (the target):** a newly opened zone pays clearly more than the one before once it reads Fair, about +25% coins an hour. Oscar: "A player should never feel that progressing further out isn't worth the time."

**What meets it** (scratch model, 30-fish hold):

- The hold fixes the per-charter view: a full hold in the next zone is worth about double.
- Per hour at Fair needs coins a fish rising about 2.1 times a zone instead of 1.8: careful hand +21% to +36%, skilled +40% to +60%. At 1.8 it is +4% to +17%.
- At Tough a careful hand still earns 8% to 26% fewer coins an hour than the zone before (a skilled one about even).

**Proposed, not confirmed:**

- Raise the late zones (an Abyss fish about 28,700 coins instead of 15,500) and leave it to the economy repass, not lower the early ones.
- Put the rod step that makes the next zone Fair on sale one zone earlier, so a player who keeps the rod up arrives at Fair.
- Reed's chart shows what a full hold pays in every zone, locked ones included.

---

## 5. The pearl jump after Kelp Deep needs goals in between

- [ ] The upgrade ladder, with the hold and the retune

**Reported:** the pearls needed to get past Kelp Deep are a big jump. It needs interim goals: mini-grinds inside the pearl grind, a breadcrumb trail.

**What the sim shows:** the boat parts cost 30 / 150 / 1,500 / 10,000 pearls. What a careful hand buys, and when:

| Time | Purchase | Wait since the last one |
|---|---|---|
| 9 min | The Drop-off opens | 9 min |
| 11 min | Rod step 1 | 2 min |
| 28 min | Rod step 2 | 17 min |
| 43 min | Kelp Deep opens | 15 min |
| 54 min | Rod step 3 | 11 min |
| 1.7 h | Rod step 4 | 48 min |
| 2.2 h | The Twilight opens | 30 min |
| 2.5 h | Rod step 5 | 18 min |
| 3.8 h | Rod step 6 | 78 min |
| 5.3 h | The Abyss opens, rod step 7 | 90 min |
| 6.4 h | Rod step 8 | 66 min |

**Answered so far:** the lured charter is the mini-grind (prepare at the lake, then a hold that pays about four times), and Reed's chart shows the distance to the next boat part, plain and lured.

**Still open:** the long waits are the rod's late steps (5 to 8, 600k to 2.4M coins), which were the 35 to 60 minute gaps in every scratch run. Whether hold levels fill them, and what the rod's late steps should cost, wants a buyer in `scripts/seaeconomy.ts` that picks by payback. Oscar (2026-11-13): small upgrades must not feel tedious, and big ones must not be so far apart that aiming for them isn't worth it.

---

## Inbox

<!-- New feedback goes here as it comes in, in the player's words, with the date and who said it. -->
