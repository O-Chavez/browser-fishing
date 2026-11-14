// The charter screens: Reed's chart and shop, the strip at sea, the spool's-out card, heading home and the end card.
import { describe, expect, it } from 'vitest';
import type { DiveEnd, DiveView } from '../net/protocol';
import { DiveHud, catchPearlsHtml, chartersText, chartersToPart, endHtml, lureRowHtml, fishTagHtml, headHomeHtml, hudHtml, lineLevel, lossText, nextRodText, outHint, outHtml, partProgress, ratingToast, reedHtml, reedMarkerPick, reedZone, rodProgress, startText, whereText, type ReedSave } from './divehud';
import { newSave } from './state';

const tally = { landed: 21, lost: 2, pearls: 186, coins: 91_000, spools: 3, spoolCoins: 78_000, shiny: 0 };
const view = (o: Partial<DiveView> = {}): DiveView => ({
  id: 1, zone: 2, marker: 0, toNext: 0, line: 199, state: 'fishing', rating: 'tough', fishLine: 13, pay: { pearls: 8, coins: 3600 }, spool: 26_000, tally, ...o,
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
      expect(text(h)).toContain("A charter is a day's fishing at sea");
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

    it('has a card for each zone: rating, pay, line a fish and fish a spool, and the spool', () => {
      const h = chart(mid());
      expect(h.match(/class="zcard /g)).toHaveLength(5);
      expect(card(h, 0)).toBe('The Shelf Easy 1 · 1,470 a fish 5 m a fish · 60 fish a spool Spool: free');
      expect(card(h, 1)).toContain('Easy');
      expect(card(h, 1)).toContain('3 · 2,710 a fish');
      expect(card(h, 1)).toContain('Spool: 14,000');
      expect(card(chart(mid(), 2), 2)).toBe('Kelp Deep ⛵ Tough 8 · 4,830 a fish 13 m a fish · 23 fish a spool Spool: 26,000');
    });

    it('shows a closed zone locked, dimmed, with what opens it, and not as a button', () => {
      const h = chart(mid());
      expect(card(h, 3)).toContain('🔒');
      expect(card(h, 3)).toContain('Opens with the Deep lamps: 3,000');
      expect(card(h, 3)).not.toContain('Spool');
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
      expect(text(h)).toContain('⚓ Cast off to the Drop-off one spool · 14,000 coins');
    });

    it('starts on the furthest open zone the rod rates Easy or Fair, else the furthest open one', () => {
      expect(reedZone(reed({ boatParts: 2, rodStep: 2 }), null)).toBe(1); // Kelp Deep is Tough at step 2
      expect(reedZone(reed({ boatParts: 2, rodStep: 3 }), null)).toBe(2);
      expect(reedZone(reed({ boatParts: 0 }), null)).toBe(0);
      expect(reedZone(reed({ boatParts: 2, rodStep: 0 }), 1)).toBe(1);
      expect(reedZone(reed({ boatParts: 1, rodStep: 0 }), 3)).toBe(0);
    });

    it('offers the spool free on the Shelf, and a disabled "Need" button without the coins', () => {
      expect(text(chart(reed({ coins: 0 }), 0))).toContain('one spool · free');
      expect(chart(reed({ coins: 0 }), 0)).toContain('data-act="castoff"');
      const poor = chart(mid({ coins: 20_000 }), 2);
      expect(poor).not.toContain('data-act="castoff"');
      expect(text(poor)).toContain('Need 6,000 more');
    });

    it('has the rod row in each state: upgrade, need more, and not on sale yet', () => {
      const ok = chart(mid());
      expect(text(ok)).toContain('Deep Sea Rod · step 2 of 8');
      expect(text(ok)).toContain('Next step: Kelp Deep goes from Tough to Fair, 13 m to 9 m a fish');
      expect(ok).toContain('data-act="rodstep"');
      expect(text(ok)).toContain('Upgrade 150,000');
      const poor = chart(mid({ coins: 149_000 }));
      expect(poor).not.toContain('data-act="rodstep"');
      expect(text(poor)).toContain('Need 1,000 more of 150,000');
      const wait = chart(mid({ rodStep: 4 }));
      expect(wait).not.toContain('data-act="rodstep"');
      expect(text(wait)).toContain('On sale when The Twilight opens');
      const late = chart(reed({ boatParts: 4, rodStep: 8, abyssLevels: 3, coins: 5e6 }));
      expect(text(late)).toContain('Deep Sea Rod · Abyss level 3');
      expect(text(late)).toContain('Next Abyss level: The Abyss at marker');
      expect(late).toContain('data-act="abysslevel"');
      expect(rodProgress(reed({ rodStep: 8 }))).toBe('Deep Sea Rod · step 8 of 8');
    });

    it('says what the next rod step changes, including when the rating stays', () => {
      expect(nextRodText({ rodStep: 0, abyssLevels: 0 }, 1)).toContain('The Drop-off');
      expect(nextRodText({ rodStep: 2, abyssLevels: 0 }, 1)).toBe('Next step: Kelp Deep goes from Tough to Fair, 13 m to 9 m a fish');
      expect(nextRodText({ rodStep: 4, abyssLevels: 0 }, 1)).toMatch(/^Next step: The Twilight (stays|goes from)/);
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
    it('works out the charters to the next boat part in a zone, plain and lured, from the fish a spool lasts', () => {
      // Kelp Deep at step 2: 13 m a fish, 23 fish a spool, 298.08 pearls plain and 1,242 lured. 480 to go: 1.6 and 0.4.
      expect(chartersToPart(mid(), 2, 0)).toEqual({ part: 'Deep lamps', plain: 2, lured: 1 });
      // 3,000 to go: 10.06 and 2.4.
      expect(chartersToPart(mid({ pearls: 0 }), 2, 0)).toEqual({ part: 'Deep lamps', plain: 11, lured: 3 });
      // The Drop-off at step 2: 5 m, 60 fish, 291.6 and 1,215: 10.3 and 2.5. The Shelf: 97.2 and 405: 30.9 and 7.4.
      expect(chartersToPart(mid({ pearls: 0 }), 1, 0)).toEqual({ part: 'Deep lamps', plain: 11, lured: 3 });
      expect(chartersToPart(mid({ pearls: 0 }), 0, 0)).toEqual({ part: 'Deep lamps', plain: 31, lured: 8 });
      // The Drop-off at step 0, Kelp cutter next: 13 m, 23 fish, 111.78 and 465.75 against 150: 1.3 and 0.3.
      expect(chartersToPart(reed({ boatParts: 1, rodStep: 0, pearls: 0 }), 1, 0)).toEqual({ part: 'Kelp cutter', plain: 2, lured: 1 });
      // An Abyss marker counts its growth: marker 3 at step 8 is 7 m, 42 fish, 101.61 × 42 = 4,267.5 plain and
      // 17,781.1 lured a spool against the Iron keel's 25,000: 5.9 and 1.4 (without the growth, 3,402 a spool: 7.3).
      expect(chartersToPart(reed({ boatParts: 3, rodStep: 8, pearls: 0 }), 4, 3)).toEqual({ part: 'Iron keel', plain: 6, lured: 2 });
      // Nothing with the boat fully fitted, the part ready to fit, or the zone Too much for the rod (Kelp Deep at step 1).
      expect(chartersToPart(reed({ boatParts: 4, pearls: 0 }), 2, 0)).toBeNull();
      expect(chartersToPart(mid({ pearls: 3000 }), 2, 0)).toBeNull();
      expect(chartersToPart(mid({ rodStep: 1 }), 2, 0)).toBeNull();
    });

    it("says under the boat part's bar how many charters it is in the picked zone, and with Shiny Lures from Kelp Deep", () => {
      expect(chartersText(mid({ pearls: 0 }), 2, 0)).toBe('About 11 charters to the Deep lamps · about 3 with Shiny Lures');
      expect(text(chart(mid({ pearls: 0 }), 2))).toContain('Next boat part: Deep lamps Opens the Twilight 0 / 3,000 About 11 charters to the Deep lamps · about 3 with Shiny Lures');
      // The picked zone's count: the Shelf.
      expect(text(chart(mid({ pearls: 0 }), 0))).toContain('About 31 charters to the Deep lamps · about 8 with Shiny Lures');
      // One charter in the singular, and for the lured half too.
      expect(chartersText(mid(), 2, 0)).toBe('About 2 charters to the Deep lamps · about 1 with Shiny Lures');
      expect(chartersText(reed({ boatParts: 0, pearls: 12 }), 0, 0)).toBe('About 1 charter to the Storm sail');
      // The lured half only when it's fewer: 10 to go is one charter either way.
      expect(chartersText(mid({ pearls: 2990 }), 2, 0)).toBe('About 1 charter to the Deep lamps');
      // Before Kelp Deep is open, no lured half.
      expect(chartersText(reed({ boatParts: 1, rodStep: 0, pearls: 0 }), 1, 0)).toBe('About 2 charters to the Kelp cutter');
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

    it("ends with the player's coins; the pearls are the boat row's", () => {
      const foot = text(/<div class="foot">[\s\S]*?<\/div>/.exec(chart(mid()))![0]);
      expect(foot).toBe('341,000 coins');
    });

    it("works out the next part's progress, carrying pearls past its price", () => {
      expect(partProgress({ pearls: 12, boatParts: 0 })).toEqual({ name: 'Storm sail', zone: 1, have: 12, need: 30, pct: 40, ready: false });
      expect(partProgress({ pearls: 36, boatParts: 0 })).toMatchObject({ have: 36, need: 30, pct: 100, ready: true });
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

    it("shows the zone with its rating, the line a fish uses, the charter's coins and the next boat part's progress", () => {
      const t = text(hudHtml(view(), {}, sv));
      expect(t).toContain('Kelp Deep Tough');
      expect(t).toContain('Line · 13 m a fish');
      expect(t).toContain('199 m');
      expect(t).toContain('This charter 91,000 Deep lamps 2,520 / 3,000');
      expect(hudHtml(view(), {}, sv)).toContain('<i style="width:84.0%">');
      // Enough pearls: the part is ready for Captain Reed.
      const ready = hudHtml(view(), {}, { pearls: 3010, boatParts: 2 });
      expect(text(ready)).toContain('Deep lamps · ready 3,010 / 3,000');
      expect(ready).toContain('class="part ready"');
      // With every part fitted, the pearls held; without a save, this charter's.
      expect(text(hudHtml(view(), {}, { pearls: 23_480, boatParts: 4 }))).toContain('Black Pearls 23,480');
      expect(text(hudHtml(view()))).toContain('This charter 91,000 Black Pearls 186');
      expect(hudHtml(view({ line: 20 }))).toContain('class="line danger"');
      expect([lineLevel(200), lineLevel(60), lineLevel(25), lineLevel(0)]).toEqual(['ok', 'low', 'danger', 'danger']);
    });

    it('shows the Abyss marker with a pip for each fish toward the next', () => {
      const t = text(hudHtml(view({ zone: 4, marker: 7, toNext: 2 })));
      expect(t).toContain('The Abyss Marker 7 ●●○');
      expect(text(hudHtml(view({ zone: 4, marker: 7, toNext: 0 })))).toContain('○○○');
      expect(t).not.toContain('Tough');
    });

    it('notes the cost of the fish just hooked, and the pearls a landed fish paid', () => {
      expect(text(hudHtml(view(), { cost: 13 }))).toContain('Line · 13 m a fish −13 m 199 m');
      expect(text(hudHtml(view()))).not.toContain('−13');
      expect(text(hudHtml(view(), { gain: 8 }, { pearls: 2528, boatParts: 2 }))).toContain('Deep lamps +8 2,528 / 3,000');
      expect(text(hudHtml(view(), {}, sv))).not.toContain('+8');
      // Drawn at the hook: the bar and the number are as they will be.
      const hooked = hudHtml(view(), { hooked: 13, cost: 13 });
      expect(text(hooked)).toContain('−13 m 186 m');
      expect(hooked).toContain('width:62.0%');
      expect(text(hudHtml(view({ line: 5 }), { hooked: 13 }))).toContain('0 m');
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

    it('takes the line at the hook and settles on the next view, a lost fish showing its extra metres', () => {
      stage((hud, el) => {
        hud.set(view());
        hud.hook();
        expect(text(el.innerHTML)).toContain('−13 m 186 m');
        hud.set(view({ line: 186, cost: 13 }));
        expect(text(el.innerHTML)).toContain('−13 m 186 m');
        hud.hook();
        hud.set(view({ line: 148, cost: 38, tally: { ...tally, lost: 3 } }));
        expect(text(el.innerHTML)).toContain('−38 m 148 m');
      });
    });

    it('notes the pearls a landed fish paid for a while, and only after a landing', () => {
      stage((hud, el) => {
        hud.set(view());
        hud.set(view({ tally: { ...tally, landed: 22, pearls: 194 }, gain: 8 }));
        expect(text(el.innerHTML)).toContain('Black Pearls +8 194');
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

  describe("the spool's out", () => {
    const sv = { coins: 100_000, pearls: 2520, rodStep: 2, abyssLevels: 0, boatParts: 2 };
    const out = view({ state: 'out', line: 0 });

    it('shows the fish, the pearls, the coins from fish and on line, and the hint', () => {
      const t = text(outHtml(out, sv));
      expect(t).toContain("Spool's out");
      expect(t).toContain('21 fish landed · 2 got away');
      expect(t).toContain('+186');
      expect(t).toContain('Coins from fish +91,000');
      expect(t).toContain('Line · 3 spools −78,000');
      expect(t).toContain('Tough for your rod: 13 m a fish. The next rod step makes it 9 m.');
      expect(t).toContain('Head home');
    });

    it("shows the next boat part's progress, and when Captain Reed can fit it", () => {
      expect(text(outHtml(out, sv))).toContain('⛵ Deep lamps 2,520 / 3,000');
      expect(text(outHtml(out, { ...sv, pearls: 3000 }))).toContain('⛵ Deep lamps Ready: see Captain Reed 3,000 / 3,000');
      expect(outHtml(out, { ...sv, boatParts: 4 })).not.toContain('pbar');
    });

    it('counts the shiny fish landed, only once there is one', () => {
      expect(text(outHtml(view({ state: 'out', line: 0, tally: { ...tally, shiny: 4 } }), sv))).toContain('✨ Shiny fish 4 Coins from fish +91,000');
      expect(outHtml(out, sv)).not.toContain('Shiny fish');
    });

    it('offers another spool at the zone price, with the key hints', () => {
      const h = outHtml(out, sv);
      expect(h).toContain('data-act="spool"');
      expect(text(h)).toContain('Another spool 26,000');
      expect(h).toContain('<kbd>1</kbd>');
      expect(h).toContain('<kbd>2</kbd>');
      expect(h).toContain('data-act="headhome"');
    });

    it('is a disabled "Need" button without the coins, and free on the Shelf', () => {
      const poor = outHtml(out, { ...sv, coins: 20_000 });
      expect(poor).not.toContain('data-act="spool"');
      expect(text(poor)).toContain('Need 6,000 more');
      const shelf = outHtml(view({ zone: 0, state: 'out', spool: 0, rating: 'easy', fishLine: 5, tally: { ...tally, spools: 2, spoolCoins: 0 } }), { ...sv, coins: 0 });
      expect(shelf).toContain('data-act="spool"');
      expect(text(shelf)).toContain('Another spool free');
      expect(text(shelf)).toContain('Line · 2 spools free');
    });

    it('hints only when the zone is not Easy and a rod purchase on sale would help', () => {
      expect(outHint(view({ rating: 'easy', fishLine: 5 }), sv)).toBe('');
      expect(outHint(out, { ...sv, rodStep: 4, boatParts: 2 })).toBe(''); // step 4 is not on sale yet
      expect(outHint(out, sv)).toContain('The next rod step makes it 9 m.');
      expect(outHint(view({ zone: 4, marker: 5, rating: 'tough', fishLine: 13, state: 'out' }), { coins: 0, pearls: 0, rodStep: 8, abyssLevels: 0, boatParts: 4 })).toContain('The next Abyss level makes it');
    });
  });

  it('heading home asks once, and says the line left is not refunded', () => {
    const h = headHomeHtml(view({ line: 187 }));
    expect(text(h)).toContain('Head home? Kelp Deep');
    expect(text(h)).toContain("You have 187 m of line left. It isn't refunded.");
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
      expect(t).toContain('+186');
      expect(t).toContain('Fish landed 21');
      expect(t).toContain('Fish that got away 2');
      expect(t).toContain('Coins from fish +91,000');
      expect(t).toContain('Line · 3 spools −78,000');
      expect(t).toContain('Net coins +13,000');
      expect(text(endHtml({ ...end, tally: { ...tally, coins: 1000 } }))).toContain('Net coins −77,000');
    });

    it('counts the shiny fish landed after the fish landed, only once there is one', () => {
      expect(text(endHtml({ ...end, tally: { ...tally, shiny: 12 } }))).toContain('Fish landed 21 ✨ Shiny fish 12 Fish that got away 2');
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
    const all = [chart(s, 4, 3), chart(mid()), chart(mid({ pearls: 0, lure: 46 })), chart(mid({ lure: 46, lureOff: true })), endHtml({ why: 'home', zone: 2, marker: 0, tally: { ...tally, shiny: 3 } }), chart(reed({ boatParts: 0 })), reedHtml({ say: '', s: reed({ seaRod: false }), pick: 0, open: true }), hudHtml(view()), hudHtml(view({ zone: 4, marker: 3, toNext: 1 })), outHtml(view({ state: 'out' }), s), headHomeHtml(view()), endHtml({ why: 'home', zone: 4, marker: 5, tally }, true)]
      .map(text).join(' ');
    for (const bad of [/depth/i, /\bdive/i, /league/i, /ledge/i, /\bsunk\b|\bsank\b|\bsink/i, /\bhaul/i, /bonus/i, /pearl water/i, /undefined|NaN|<\w/]) expect(all).not.toMatch(bad);
  });
});
