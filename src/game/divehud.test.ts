// The charter screens: Reed's chart and shop, the strip at sea, the Hold's full card, heading home and the end card.
import { describe, expect, it } from 'vitest';
import type { DiveEnd, DiveView } from '../net/protocol';
import type { Tally } from './dive';
import { DiveHud, catchPearlsHtml, chartersText, chartersToPart, endHtml, holdRowHtml, lureRowHtml, fishTagHtml, headHomeHtml, hudHtml, lossText, nextRodText, outHint, outHtml, partProgress, ratingToast, reedHtml, reedMarkerPick, reedZone, rodProgress, startText, whereText, type ReedSave } from './divehud';
import { newSave } from './state';

// Kelp Deep with a hold of 20: 12 fish landed, 3 got away, and the fee paid on casting off.
const tally: Tally = { landed: 12, lost: 3, pearls: 96, coins: 81_600, fee: 14_000, shiny: 0 };
const view = (o: Omit<Partial<DiveView>, 'tally'> & { tally?: Partial<Tally> } = {}): DiveView => ({
  id: 1, zone: 2, marker: 0, toNext: 0, hold: 20, state: 'fishing', rating: 'tough', pay: { pearls: 8, coins: 6800 }, fee: 14_000, ...o, tally: { ...tally, ...o.tally },
});
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const reed = (o: Partial<ReedSave> = {}): ReedSave => ({ ...newSave(), level: 20, coins: 300_000, seaRod: true, ...o });
const chart = (s: ReedSave, pick = reedZone(s, null), marker?: number) => reedHtml({ say: 'Ahoy', s, pick, open: true, marker: marker ?? reedMarkerPick(s, null) });
/** The text of one zone's card on the chart. */
const card = (html: string, zone: number) => text(new RegExp(`<(?:button|div) class="zcard z${zone}[^>]*>[\\s\\S]*?</(?:button|div)>`).exec(html)![0]);

// The mid-game player of the mockup: step 2, Storm sail and Kelp cutter fitted (Kelp Deep open).
const mid = (o: Partial<ReedSave> = {}) => reed({ rodStep: 2, boatParts: 2, coins: 341_000, pearls: 2520, ...o });

describe('charter screens', () => {
  it("the fish's sticker names the zone's rating for the rod all fight", () => {
    const none = { match: '', too: false };
    expect(text(fishTagHtml({ b: 'thrasher', pull: 'strong', match: 'Too much for your rod', too: true }))).toBe('💪 Strong · 💥 Thrasher · too much for your rod');
    expect(text(fishTagHtml({ b: 'runner', pull: 'light', ...none }))).toBe('🪶 Light · 🏃 Runner · long pulls that take line');
    expect(fishTagHtml({ b: null, pull: null, match: 'Fair for your rod', too: false })).toBe('Fair for your rod');
    expect(fishTagHtml({ b: null, pull: null, ...none })).toBe('');
    expect([ratingToast('easy'), ratingToast('fair'), ratingToast('tough'), ratingToast('over')]).toEqual(['An easy one.', 'Fair for your rod.', 'Tough for your rod.', 'Too much for your rod!']);
  });

  it('names where a charter is: the zone, and the marker in the Abyss', () => {
    expect(whereText(1, 0)).toBe('The Drop-off');
    expect(whereText(4, 7)).toBe('The Abyss · marker 7');
    expect(startText(view())).toBe('Kelp Deep');
    expect(startText(null)).toBe('Out to sea');
  });

  describe("Reed's chart and shop", () => {
    it('sells the Deep Sea Rod to a player without one, and says what a charter is', () => {
      const h = reedHtml({ say: 'Ahoy', s: reed({ seaRod: false, coins: 100_000 }), pick: 0, open: true });
      expect(text(h)).toContain("A charter is a day's fishing at sea. Pay my fee, fill the hold with sea fish, keep what they pay.");
      expect(h).toContain('data-act="buysearod"');
      expect(h).not.toContain('disabled data-act="buysearod"');
      expect(h).not.toContain('zcard');
      expect(text(h)).toContain('100,000');
      const poor = reedHtml({ say: '', s: reed({ seaRod: false, coins: 99_990 }), pick: 0, open: true });
      expect(poor).toContain('disabled data-act="buysearod"');
      expect(text(poor)).toContain('Need 10 more');
      expect(text(reedHtml({ say: '', s: reed({ seaRod: false, level: 12 }), pick: 0, open: true }))).toContain('Needs level 20');
      expect(text(reedHtml({ say: '', s: reed(), pick: 0, open: false }))).toContain('coming soon');
    });

    it("has a card for each zone: rating, pay and Reed's fee", () => {
      const h = chart(mid());
      expect(h.match(/class="zcard /g)).toHaveLength(5);
      expect(card(h, 0)).toBe('The Shelf Easy 1 · 1,470 a fish Fee: free');
      expect(card(h, 1)).toBe('The Drop-off ⛵ Easy 3 · 3,400 a fish Fee: 7,000');
      expect(card(chart(mid(), 2), 2)).toBe('Kelp Deep ⛵ Tough 8 · 6,800 a fish Fee: 14,000');
      expect(text(h)).not.toMatch(/spool| m a fish/i);
    });

    it('shows a closed zone locked, dimmed, with what opens it, and not as a button', () => {
      const h = chart(mid());
      expect(card(h, 3)).toContain('🔒');
      expect(card(h, 3)).toContain('Opens with the Deep lamps: 3,000');
      expect(card(h, 3)).not.toContain('Fee');
      expect(h).toContain('class="zcard z3 locked"');
      expect(h).not.toContain('data-act="divefrom" data-id="3"');
      expect(h).toContain('data-act="divefrom" data-id="2"');
      expect(card(h, 4)).toContain('Opens with the Iron keel: 25,000');
    });

    it('highlights the picked zone, and casts off to it', () => {
      const h = chart(mid(), 1);
      expect(h).toContain('class="zcard z1 sel"');
      expect(h).not.toContain('class="zcard z2 sel"');
      expect(h).toContain('data-act="castoff" data-id="1"');
      expect(text(h)).toContain('⚓ Cast off to the Drop-off 10 fish · fee 7,000 coins');
      // The hold's size as it stands: a bigger hold casts off with more fish.
      expect(text(chart(mid({ holdLevel: 2 }), 2))).toContain('⚓ Cast off to Kelp Deep 20 fish · fee 14,000 coins');
    });

    it('starts on the furthest open zone the rod rates Easy or Fair, else the furthest open one', () => {
      expect(reedZone(reed({ boatParts: 2, rodStep: 2 }), null)).toBe(1); // Kelp Deep is Tough at step 2
      expect(reedZone(reed({ boatParts: 2, rodStep: 3 }), null)).toBe(2);
      expect(reedZone(reed({ boatParts: 0 }), null)).toBe(0);
      expect(reedZone(reed({ boatParts: 2, rodStep: 0 }), 1)).toBe(1);
      expect(reedZone(reed({ boatParts: 1, rodStep: 0 }), 3)).toBe(0);
    });

    it('casts off free on the Shelf, and is a disabled "Need" button without the fee', () => {
      expect(text(chart(reed({ coins: 0 }), 0))).toContain('⚓ Cast off to the Shelf 10 fish · free');
      expect(chart(reed({ coins: 0 }), 0)).toContain('data-act="castoff"');
      const poor = chart(mid({ coins: 10_000 }), 2);
      expect(poor).not.toContain('data-act="castoff"');
      expect(text(poor)).toContain('Need 4,000 more for the fee');
    });

    it('has the rod row in each state: upgrade, need more, and not on sale yet', () => {
      const ok = chart(mid());
      expect(text(ok)).toContain('Deep Sea Rod · step 2 of 8');
      expect(text(ok)).toContain('Next step: Kelp Deep goes from Tough to Fair');
      expect(ok).toContain('data-act="rodstep"');
      expect(text(ok)).toContain('Upgrade 200,000');
      const poor = chart(mid({ coins: 199_000 }));
      expect(poor).not.toContain('data-act="rodstep"');
      expect(text(poor)).toContain('Need 1,000 more of 200,000');
      const wait = chart(mid({ rodStep: 4 }));
      expect(wait).not.toContain('data-act="rodstep"');
      expect(text(wait)).toContain('On sale when The Twilight opens');
      const late = chart(reed({ boatParts: 4, rodStep: 8, abyssLevels: 3, coins: 5e6 }));
      expect(text(late)).toContain('Deep Sea Rod · Abyss level 3');
      expect(text(late)).toContain('Next Abyss level: the Abyss at marker');
      expect(late).toContain('data-act="abysslevel"');
      expect(rodProgress(reed({ rodStep: 8 }))).toBe('Deep Sea Rod · step 8 of 8');
    });

    it('says what the next rod step changes, including when the rating stays', () => {
      expect(nextRodText({ rodStep: 0, abyssLevels: 0 }, 1)).toBe('Next step: the Drop-off goes from Tough to Fair');
      expect(nextRodText({ rodStep: 2, abyssLevels: 0 }, 1)).toBe('Next step: Kelp Deep goes from Tough to Fair');
      expect(nextRodText({ rodStep: 4, abyssLevels: 0 }, 1)).toBe('Next step: the Twilight goes from Tough to Fair');
      expect(nextRodText({ rodStep: 8, abyssLevels: 0 }, 1)).toBe('Next Abyss level: the Abyss at marker 1 stays Easy');
      expect(nextRodText({ rodStep: 8, abyssLevels: 3 }, 5)).toBe('Next Abyss level: the Abyss at marker 5 goes from Fair to Easy');
    });

    it("has the hold row on the rod row's pattern: upgrade, need more, not on sale yet, and the biggest", () => {
      // Level 0 with the Drop-off open: level 1 is on sale.
      const first = chart(mid());
      expect(text(first)).toContain('🧺 Hold · 10 fish Next: 15 fish a charter Upgrade 25,000');
      expect(first).toContain('data-act="holdlevel"');
      // Under the rod row, before the boat row.
      expect(text(first)).toMatch(/Deep Sea Rod · step 2 of 8[\s\S]*🧺 Hold[\s\S]*Next boat part/);
      // Level 1 with Kelp Deep open: level 2, and the coins still needed without them.
      const ok = chart(mid({ holdLevel: 1 }));
      expect(text(ok)).toContain('🧺 Hold · 15 fish Next: 20 fish a charter Upgrade 300,000');
      const poor = chart(mid({ holdLevel: 1, coins: 100_000 }));
      expect(poor).not.toContain('data-act="holdlevel"');
      expect(text(poor)).toContain('🧺 Hold · 15 fish Next: 20 fish a charter Need 200,000 more of 300,000');
      // Level 2 waits for the Twilight; a new player's level 1 for the Drop-off.
      const wait = chart(mid({ holdLevel: 2 }));
      expect(wait).not.toContain('data-act="holdlevel"');
      expect(text(wait)).toContain('🧺 Hold · 20 fish Next: 25 fish a charter On sale when The Twilight opens');
      expect(text(holdRowHtml({ holdLevel: 0, coins: 1e9, boatParts: 0 }))).toBe('🧺 Hold · 10 fish Next: 15 fish a charter On sale when The Drop-off opens');
      // The biggest hold: no button.
      const top = holdRowHtml({ holdLevel: 4, coins: 1e9, boatParts: 4 });
      expect(text(top)).toBe('🧺 Hold · 30 fish The biggest hold');
      expect(top).not.toContain('<button');
    });

    it("has the boat row: the next part's progress in pearls, ready to fit, and fully fitted", () => {
      const poor = chart(mid());
      expect(text(poor)).toContain('Next boat part: Deep lamps Opens the Twilight 2,520 / 3,000');
      expect(poor).toContain('<i style="width:84.0%">');
      expect(poor).not.toContain('data-act="boatpart"');
      expect(text(poor)).toContain('480 to go');
      const ok = chart(mid({ pearls: 3000 }));
      expect(ok).toContain('data-act="boatpart"');
      expect(ok).toContain('class="pbar full"');
      expect(text(ok)).toContain('3,000 / 3,000 Fit it 3,000');
      const done = chart(reed({ boatParts: 4, pearls: 23_480 }));
      expect(done).not.toContain('data-act="boatpart"');
      expect(done).not.toContain('pbar');
      expect(text(done)).toContain('The boat is fully fitted Every zone is open · 23,480 Black Pearls');
    });

    // A fish's average pearls: the zone's × 1.125 (Feisty or Brutish, one in 8, double) × 1.2 (a legend, one in 20,
    // five times) × 1.2 plain (a shiny, one in 20, five times) or × 5 lured: Shelf 1.62 / 6.75, Drop-off 4.86 / 20.25,
    // Kelp Deep 12.96 / 54.
    it('works out the charters to the next boat part in a zone, plain and lured, from the fish the hold takes', () => {
      // Kelp Deep with a hold of 15: 194.4 pearls plain and 810 lured a charter. 480 to go: 2.5 and 0.6.
      expect(chartersToPart(mid({ holdLevel: 1 }), 2, 0)).toEqual({ part: 'Deep lamps', plain: 3, lured: 1 });
      // 3,000 to go: 15.4 and 3.7.
      expect(chartersToPart(mid({ holdLevel: 1, pearls: 0 }), 2, 0)).toEqual({ part: 'Deep lamps', plain: 16, lured: 4 });
      // A bigger hold is fewer charters: 10 fish, 129.6 a charter: 23.1; 20 fish, 259.2: 11.6.
      expect(chartersToPart(mid({ holdLevel: 0, pearls: 0 }), 2, 0)).toEqual({ part: 'Deep lamps', plain: 24, lured: 6 });
      expect(chartersToPart(mid({ holdLevel: 2, pearls: 0 }), 2, 0)).toEqual({ part: 'Deep lamps', plain: 12, lured: 3 });
      // The rod doesn't change it, only the zone and the hold: the Drop-off, 15 fish, 72.9 and 303.75: 41.2 and 9.9.
      expect(chartersToPart(mid({ holdLevel: 1, pearls: 0 }), 1, 0)).toEqual({ part: 'Deep lamps', plain: 42, lured: 10 });
      expect(chartersToPart(mid({ holdLevel: 1, pearls: 0, rodStep: 3 }), 1, 0)).toEqual({ part: 'Deep lamps', plain: 42, lured: 10 });
      // The Drop-off at step 0, Kelp cutter next, 10 fish: 48.6 and 202.5 against 150: 3.1 and 0.7.
      expect(chartersToPart(reed({ boatParts: 1, rodStep: 0, pearls: 0 }), 1, 0)).toEqual({ part: 'Kelp cutter', plain: 4, lured: 1 });
      // An Abyss marker counts its growth and its legends always Brutish: marker 3 is 118.07 a fish plain, 25 fish a
      // charter = 2,951.8 against the Iron keel's 25,000: 8.5 (without the growth, 2,353: 10.6).
      expect(chartersToPart(reed({ boatParts: 3, rodStep: 8, pearls: 0, holdLevel: 3 }), 4, 3)).toEqual({ part: 'Iron keel', plain: 9, lured: 3 });
      // Nothing with the boat fully fitted, the part ready to fit, or the zone Too much for the rod (Kelp Deep at step 1).
      expect(chartersToPart(reed({ boatParts: 4, pearls: 0 }), 2, 0)).toBeNull();
      expect(chartersToPart(mid({ pearls: 3000 }), 2, 0)).toBeNull();
      expect(chartersToPart(mid({ rodStep: 1 }), 2, 0)).toBeNull();
    });

    it("says under the boat part's bar how many charters it is in the picked zone, and with Shiny Lures from Kelp Deep", () => {
      expect(chartersText(mid({ holdLevel: 1, pearls: 0 }), 2, 0)).toBe('About 16 charters to the Deep lamps · about 4 with Shiny Lures');
      expect(text(chart(mid({ holdLevel: 1, pearls: 0 }), 2))).toContain('Next boat part: Deep lamps Opens the Twilight 0 / 3,000 About 16 charters to the Deep lamps · about 4 with Shiny Lures');
      // The picked zone's count: the Shelf, 15 fish, 24.3 and 101.25 a charter.
      expect(text(chart(mid({ holdLevel: 1, pearls: 0 }), 0))).toContain('About 124 charters to the Deep lamps · about 30 with Shiny Lures');
      // One charter in the singular, and for the lured half too.
      expect(chartersText(mid({ holdLevel: 1 }), 2, 0)).toBe('About 3 charters to the Deep lamps · about 1 with Shiny Lures');
      expect(chartersText(reed({ boatParts: 0, pearls: 12 }), 0, 0)).toBe('About 1 charter to the Storm sail');
      // The lured half only when it's fewer: 10 to go is one charter either way.
      expect(chartersText(mid({ pearls: 2990 }), 2, 0)).toBe('About 1 charter to the Deep lamps');
      // Before Kelp Deep is open, no lured half.
      expect(chartersText(reed({ boatParts: 1, rodStep: 0, pearls: 0 }), 1, 0)).toBe('About 4 charters to the Kelp cutter');
      // Left out fully fitted, ready to fit, and Too much.
      expect(chart(reed({ boatParts: 4, pearls: 0 }))).not.toContain('class="far"');
      expect(chart(mid({ pearls: 3000 }))).not.toContain('class="far"');
      const over = chart(mid({ rodStep: 1 }), 2);
      expect(card(over, 2)).toContain('Too much');
      expect(over).not.toContain('class="far"');
      expect(text(over)).not.toContain('charters to');
    });

    it('shows the Shiny Lures held with the Bag\'s on/off switch, a hint without them from Kelp Deep, else nothing', () => {
      const on = chart(mid({ lure: 46 }));
      expect(text(on)).toContain('✨ 46 Shiny Lures Every bite is a shiny until they run out On');
      expect(on).toContain('class="perk lure" data-act="lure"');
      expect(text(lureRowHtml({ lure: 1, lureOff: false, boatParts: 2 }))).toBe('✨ 1 Shiny Lure Every bite is a shiny until it runs out On');
      const off = chart(mid({ lure: 46, lureOff: true }));
      expect(text(off)).toContain('✨ 46 Shiny Lures Saved for later Off');
      expect(off).toContain('class="perk lure off" data-act="lure"');
      // Lures held show before Kelp Deep too: they're the player's.
      expect(text(chart(reed({ boatParts: 0, lure: 3 })))).toContain('✨ 3 Shiny Lures');
      const none = chart(mid());
      expect(none).not.toContain('data-act="lure"');
      expect(text(none)).toContain('✨ Shiny Lures from the Prize Counter work out here: every fish a shiny, five times the coins and Black Pearls.');
      expect(none).toContain('class="row quiet"');
      // Holding none before Kelp Deep is open, nothing; switched off with none left, the hint.
      expect(chart(reed({ boatParts: 1 }))).not.toContain('✨');
      expect(lureRowHtml({ lure: 0, lureOff: true, boatParts: 2 })).toContain('Prize Counter');
    });

    it("ends with the player's coins and Black Pearls", () => {
      const foot = text(/<div class="foot">[\s\S]*?<\/div>/.exec(chart(mid()))![0]);
      expect(foot).toBe('341,000 coins 2,520 Black Pearls');
    });

    it("works out the next part's progress, carrying pearls past its price", () => {
      expect(partProgress({ pearls: 12, boatParts: 0 })).toEqual({ name: 'Storm sail', zone: 1, have: 12, need: 25, pct: 48, ready: false });
      expect(partProgress({ pearls: 36, boatParts: 0 })).toMatchObject({ have: 36, need: 25, pct: 100, ready: true });
      expect(partProgress({ pearls: 99_999, boatParts: 4 })).toBeNull();
    });

    it('has the Abyss marker stepper only once the Abyss is open, from 1 to the furthest reached', () => {
      expect(chart(mid())).not.toContain('mstep');
      const s = reed({ boatParts: 4, rodStep: 8, abyssRecord: 9, coins: 1e6 });
      const h = chart(s, 4, 7);
      expect(text(h)).toContain('Marker 7 + of 9 reached');
      expect(card(h, 4)).toContain('Marker 7');
      expect(h).toContain('data-act="markerup"');
      expect(h).toContain('data-act="markerdown"');
      expect(chart(s, 4, 9)).toContain('data-act="markerup" disabled');
      expect(chart(s, 4, 1)).toContain('data-act="markerdown" disabled');
      expect(reedMarkerPick(s, 12)).toBe(9);
      expect(reedMarkerPick(s, 0)).toBe(1);
      expect(reedMarkerPick(reed({ abyssRecord: 0 }), null)).toBe(1);
      // By default it is the furthest marker the rod rates Easy or Fair.
      expect(reedMarkerPick(reed({ boatParts: 4, rodStep: 8, abyssRecord: 40 }), null)).toBeLessThan(40);
    });
  });

  describe('the strip', () => {
    const sv = { pearls: 2520, boatParts: 2 };

    it("shows the zone with its rating, the hold's fish, the charter's coins and the next boat part's progress", () => {
      const t = text(hudHtml(view(), {}, sv));
      expect(t).toBe('Kelp Deep Tough Hold 12 / 20 This charter 81,600 Deep lamps 2,520 / 3,000');
      expect(hudHtml(view(), {}, sv)).toContain('<i style="width:60.0%">');
      expect(hudHtml(view(), {}, sv)).toContain('<i style="width:84.0%">');
      // Four cells, as before the hold.
      expect(hudHtml(view(), {}, sv).match(/^\s*<div class="/gm)).toHaveLength(4);
      // Enough pearls: the part is ready for Captain Reed.
      const ready = hudHtml(view(), {}, { pearls: 3010, boatParts: 2 });
      expect(text(ready)).toContain('Deep lamps · ready 3,010 / 3,000');
      expect(ready).toContain('class="part ready"');
      // With every part fitted, the pearls held; without a save, this charter's.
      expect(text(hudHtml(view(), {}, { pearls: 23_480, boatParts: 4 }))).toContain('Black Pearls 23,480');
      expect(text(hudHtml(view()))).toContain('This charter 81,600 Black Pearls 96');
    });

    it('shows the hold full, its bar filled', () => {
      const h = hudHtml(view({ state: 'full', tally: { landed: 20 } }));
      expect(h).toContain('class="hold full"');
      expect(h).toContain('width:100.0%');
      expect(text(h)).toContain('Hold · full 20 / 20');
      expect(hudHtml(view())).toContain('class="hold"');
      // A fresh charter: an empty hold.
      expect(text(hudHtml(view({ tally: { landed: 0, lost: 0 } })))).toContain('Hold 0 / 20');
    });

    it('shows the Abyss marker with a pip for each fish toward the next', () => {
      const t = text(hudHtml(view({ zone: 4, marker: 7, toNext: 2 })));
      expect(t).toContain('The Abyss Marker 7 ●●○○○');
      expect(text(hudHtml(view({ zone: 4, marker: 7, toNext: 0 })))).toContain('○○○○○');
      expect(t).not.toContain('Tough');
    });

    it('notes a fish just landed in the hold, and the pearls it paid', () => {
      expect(text(hudHtml(view(), { landed: true }))).toContain('Hold +1 12 / 20');
      expect(text(hudHtml(view()))).not.toContain('+1');
      expect(text(hudHtml(view(), { gain: 8 }, { pearls: 2528, boatParts: 2 }))).toContain('Deep lamps +8 2,528 / 3,000');
      expect(text(hudHtml(view(), {}, sv))).not.toContain('+8');
    });

    function stage(run: (hud: DiveHud, el: { innerHTML: string }) => void): void {
      const el = { classList: { toggle() {} }, innerHTML: '' } as unknown as HTMLElement;
      const tag = { classList: { toggle() {}, add() {}, remove() {} }, innerHTML: '' } as unknown as HTMLElement;
      const g = globalThis as any;
      const had = 'window' in g;
      g.window = { setTimeout: () => 0 };
      try {
        run(new DiveHud(el, tag), el);
      } finally {
        if (!had) delete g.window;
      }
    }

    it('adds a landed fish to the hold with a "+1"; a fish that got away takes no place', () => {
      stage((hud, el) => {
        hud.set(view());
        expect(text(el.innerHTML)).toContain('Hold 12 / 20');
        hud.set(view({ tally: { lost: 4 } }));
        expect(text(el.innerHTML)).toContain('Hold 12 / 20');
        expect(text(el.innerHTML)).not.toContain('+1');
      });
      stage((hud, el) => {
        hud.set(view());
        hud.set(view({ tally: { landed: 13 } }));
        expect(text(el.innerHTML)).toContain('Hold +1 13 / 20');
      });
      // A fresh charter shows no "+1".
      stage((hud, el) => {
        hud.set(view({ tally: { landed: 0, lost: 0 } }));
        expect(text(el.innerHTML)).not.toContain('+1');
      });
    });

    it('notes the pearls a landed fish paid for a while, and only after a landing', () => {
      stage((hud, el) => {
        hud.set(view());
        hud.set(view({ tally: { landed: 13, pearls: 104 }, gain: 8 }));
        expect(text(el.innerHTML)).toContain('Black Pearls +8 104');
      });
      stage((hud, el) => {
        hud.set(view({ gain: 8 }));
        expect(text(el.innerHTML)).not.toContain('+8');
      });
    });
  });

  it("the strip follows the save's pearls, and says once when they make the next boat part ready", () => {
    const el = { classList: { toggle() {} }, innerHTML: '' } as unknown as HTMLElement;
    const tag = { classList: { toggle() {}, add() {}, remove() {} }, innerHTML: '' } as unknown as HTMLElement;
    const g = globalThis as any;
    const had = 'window' in g;
    g.window = { setTimeout: () => 0 };
    try {
      const hud = new DiveHud(el, tag);
      // The save as it stands on joining says nothing, even with a part already affordable.
      expect(hud.boat({ pearls: 3100, boatParts: 2 })).toBeNull();
      expect(hud.boat({ pearls: 100, boatParts: 3 })).toBeNull(); // the part was fitted
      hud.set(view());
      expect(text(el.innerHTML)).toContain('Iron keel 100 / 25,000');
      expect(hud.boat({ pearls: 24_990, boatParts: 3 })).toBeNull();
      expect(text(el.innerHTML)).toContain('Iron keel 24,990 / 25,000');
      expect(hud.boat({ pearls: 25_010, boatParts: 3 })).toBe('Iron keel');
      expect(text(el.innerHTML)).toContain('Iron keel · ready 25,010 / 25,000');
      expect(hud.boat({ pearls: 25_030, boatParts: 3 })).toBeNull(); // already ready
      expect(hud.boat({ pearls: 25_030, boatParts: 3 })).toBeNull(); // nothing changed
    } finally {
      if (!had) delete g.window;
    }
  });

  it("writes a sea fish's pearls for the catch card, with why when it paid more", () => {
    expect(text(catchPearlsHtml(2, 0, {}))).toBe('+8');
    expect(text(catchPearlsHtml(2, 0, { tag: 'feisty' }))).toBe('+16 double: Feisty');
    expect(text(catchPearlsHtml(0, 0, { legend: true }))).toBe('+5 five times: legend');
    expect(text(catchPearlsHtml(1, 0, { tag: 'brutish', legend: true }))).toBe('+30 ten times: Brutish legend');
    expect(text(catchPearlsHtml(4, 2, {}))).toBe('+56');
  });

  it("credits a shiny on the catch card's pearls line, multiplied with a tag and a legend", () => {
    expect(text(catchPearlsHtml(2, 0, { shiny: true }))).toBe('+40 five times: shiny');
    expect(text(catchPearlsHtml(1, 0, { shiny: true, tag: 'feisty' }))).toBe('+30 ten times: shiny Feisty');
    expect(text(catchPearlsHtml(0, 0, { shiny: true, legend: true }))).toBe('+25 25 times: shiny legend');
    expect(text(catchPearlsHtml(1, 0, { shiny: true, tag: 'brutish', legend: true }))).toBe('+150 50 times: shiny Brutish legend');
    expect(text(catchPearlsHtml(4, 2, { shiny: true }))).toBe('+280 five times: shiny');
    expect(text(catchPearlsHtml(2, 0, { shiny: false, tag: 'feisty' }))).toBe('+16 double: Feisty');
  });

  describe("the hold's full", () => {
    const sv = { coins: 100_000, pearls: 2520, rodStep: 2, abyssLevels: 0, boatParts: 2 };
    const full = view({ state: 'full', tally: { landed: 20 } });

    it('shows the fish, the pearls, the coins from fish, the fee and the hint', () => {
      const t = text(outHtml(full, sv));
      expect(t).toContain("Hold's full");
      expect(t).toContain('20 fish landed · 3 got away');
      expect(t).toContain('+96');
      expect(t).toContain('Coins from fish +81,600 Fee −14,000');
      expect(t).toContain('Tough for your rod: the next rod step makes it Fair.');
    });

    it('has one button, Head home, and no other hold to buy', () => {
      const h = outHtml(full, sv);
      expect(h.match(/<button/g)).toHaveLength(1);
      expect(h).toContain('data-act="headhome"');
      expect(text(h)).toContain('1 Head home');
      // The same without the coins for another fee: there's nothing to buy.
      expect(outHtml(full, { ...sv, coins: 0 }).match(/<button/g)).toHaveLength(1);
      expect(text(outHtml(full, sv))).not.toMatch(/another|spool|Need/i);
    });

    it('says the fee is free on the Shelf', () => {
      const shelf = outHtml(view({ zone: 0, state: 'full', rating: 'easy', fee: 0, hold: 10, tally: { landed: 10, fee: 0 } }), { ...sv, coins: 0 });
      expect(text(shelf)).toContain('10 fish landed');
      expect(text(shelf)).toContain('Fee free');
    });

    it("shows the next boat part's progress, and when Captain Reed can fit it", () => {
      expect(text(outHtml(full, sv))).toContain('⛵ Deep lamps 2,520 / 3,000');
      expect(text(outHtml(full, { ...sv, pearls: 3000 }))).toContain('⛵ Deep lamps Ready: see Captain Reed 3,000 / 3,000');
      expect(outHtml(full, { ...sv, boatParts: 4 })).not.toContain('pbar');
    });

    it('counts the shiny fish landed, only once there is one', () => {
      expect(text(outHtml(view({ state: 'full', tally: { landed: 20, shiny: 4 } }), sv))).toContain('✨ Shiny fish 4 Coins from fish +81,600');
      expect(outHtml(full, sv)).not.toContain('Shiny fish');
    });

    it('hints only when the zone is not Easy and a rod purchase on sale would change its rating', () => {
      expect(outHint(view({ rating: 'easy' }), sv)).toBe('');
      expect(outHint(full, { ...sv, rodStep: 4, boatParts: 2 })).toBe(''); // step 5 is not on sale yet
      // Too much in the Twilight at step 2: step 3 is Kelp Deep's and leaves the Twilight Too much.
      expect(outHint(view({ zone: 3, rating: 'over' }), { ...sv, boatParts: 3 })).toBe('');
      expect(outHint(full, sv)).toBe('Tough for your rod: the next rod step makes it Fair.');
      expect(outHint(view({ zone: 4, marker: 5, rating: 'fair', state: 'full' }), { coins: 0, pearls: 0, rodStep: 8, abyssLevels: 3, boatParts: 4 })).toBe('Fair for your rod: the next Abyss level makes it Easy.');
      expect(outHint(full, sv)).not.toMatch(/ m\b/);
    });
  });

  it("heading home asks once, and says the room left in the hold and that the fee isn't refunded", () => {
    const h = headHomeHtml(view());
    expect(text(h)).toContain('Head home? Kelp Deep');
    expect(text(h)).toContain("You have room for 8 more fish. The fee isn't refunded.");
    expect(h).toContain('data-act="close"');
    expect(text(h)).toContain('Stay out');
    expect(h).toContain('data-act="headhome"');
    expect(h).not.toContain('bad');
  });

  describe('the end card', () => {
    const end: DiveEnd = { why: 'home', zone: 4, marker: 5, tally };

    it('shows the zone, the fish, the pearls, the coins and the net', () => {
      const t = text(endHtml({ ...end, zone: 2, marker: 0 }));
      expect(t).toContain('Home safe!');
      expect(t).toContain('Kelp Deep');
      expect(t).toContain('+96');
      expect(t).toContain('Fish landed 12');
      expect(t).toContain('Fish that got away 3');
      expect(t).toContain('Coins from fish +81,600 Fee −14,000 Net coins +67,600');
      expect(text(endHtml({ ...end, tally: { ...tally, coins: 1000 } }))).toContain('Net coins −13,000');
      // Free on the Shelf: the net is the fish's coins.
      expect(text(endHtml({ ...end, zone: 0, marker: 0, tally: { ...tally, fee: 0 } }))).toContain('Coins from fish +81,600 Fee free Net coins +81,600');
    });

    it('counts the shiny fish landed after the fish landed, only once there is one', () => {
      expect(text(endHtml({ ...end, tally: { ...tally, shiny: 12 } }))).toContain('Fish landed 12 ✨ Shiny fish 12 Fish that got away 3');
      expect(endHtml(end)).not.toContain('Shiny fish');
    });

    it('shows the Abyss marker reached, with a ribbon for a new record', () => {
      expect(text(endHtml(end))).toContain('The Abyss · marker 5');
      expect(endHtml(end)).not.toContain('ribbon');
      expect(text(endHtml(end, true))).toContain('★ New record');
      expect(text(endHtml({ ...end, zone: 2, marker: 0 }, true))).not.toContain('record');
    });

    it('says when the boat waited and turned back', () => {
      expect(text(endHtml(end, false, { pearls: 2520, boatParts: 2 }))).toContain('⛵ Deep lamps 2,520 / 3,000');
      expect(endHtml(end)).not.toContain('pbar');
      expect(endHtml(end, false, { pearls: 5, boatParts: 4 })).not.toContain('pbar');
      expect(text(endHtml({ ...end, why: 'away' }))).toContain('waited 2 minutes');
      expect(text(endHtml({ ...end, why: 'away' }))).toContain('The charter ended');
      expect(lossText('held-surge')).toContain('through a surge');
    });
  });

  it('keeps the banned words off every screen', () => {
    const s = reed({ boatParts: 4, rodStep: 8, abyssRecord: 9, coins: 1e7, pearls: 1e4 });
    const all = [chart(s, 4, 3), chart(mid()), chart(mid({ pearls: 0, lure: 46 })), chart(mid({ lure: 46, lureOff: true })), endHtml({ why: 'home', zone: 2, marker: 0, tally: { ...tally, shiny: 3 } }), chart(reed({ boatParts: 0 })), reedHtml({ say: '', s: reed({ seaRod: false }), pick: 0, open: true }), hudHtml(view()), hudHtml(view({ zone: 4, marker: 3, toNext: 1 })), outHtml(view({ state: 'full', tally: { landed: 20 } }), s), outHtml(view({ zone: 0, state: 'full', fee: 0, tally: { fee: 0 } }), s), holdRowHtml(reed({ holdLevel: 4 })), headHomeHtml(view()), endHtml({ why: 'home', zone: 4, marker: 5, tally }, true)]
      .map(text).join(' ');
    for (const bad of [/depth/i, /\bdive/i, /league/i, /ledge/i, /\bsunk\b|\bsank\b|\bsink/i, /\bhaul/i, /bonus/i, /pearl water/i, /spool/i, / m a fish/, /out of line/i, /\btrip/i, /undefined|NaN|<\w/]) expect(all).not.toMatch(bad);
  });
});
