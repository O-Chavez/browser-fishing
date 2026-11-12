import { describe, expect, it } from 'vitest';
import type { DiveEnd, DiveView } from '../net/protocol';
import { banked, defaultStart, endHtml, fishTagHtml, headHomeHtml, hudHtml, lastMarker, lineLevel, lossText, zoneMarkers, markerHtml, nextMarker, reedHtml, reedStart, startText } from './divehud';
import { surface, type Dive } from './dive';

const view = (o: Partial<DiveView> = {}): DiveView => ({ id: 1, start: 10, depth: 23, line: 214, state: 'fishing', ledges: 2, grown: 2, pearls: 16, gear: { rod: 0, line: 0 }, fish: 13, coins: 24000, ...o });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('dive HUD', () => {
  it("the fish's sticker keeps its pull, behaviour and matchup with the gear up all fight", () => {
    const none = { match: '', too: false };
    expect(text(fishTagHtml({ b: 'thrasher', pull: 'strong', match: 'Too strong for your line', too: true }))).toBe('💪 Strong · 💥 Thrasher · too strong for your line');
    expect(text(fishTagHtml({ b: 'runner', pull: 'light', ...none }))).toBe('🪶 Light · 🏃 Runner · long pulls that take line');
    expect(text(fishTagHtml({ b: 'sounder', pull: null, ...none }))).toBe('⤵️ Sounder · dives with little warning');
    expect(text(fishTagHtml({ b: null, pull: 'strong', ...none }))).toBe('💪 Strong');
    expect(fishTagHtml({ b: null, pull: null, match: 'Strong for your line, heavy for your rod', too: false })).toBe('Strong for your line, heavy for your rod');
    // A fish the gear handles: no sticker.
    expect(fishTagHtml({ b: null, pull: null, ...none })).toBe('');
  });

  it('counts to the next marker, and past the one the boat is at', () => {
    expect(nextMarker(0)).toBe(5);
    expect(nextMarker(23)).toBe(25);
    expect(nextMarker(25)).toBe(30);
    expect([lastMarker(0), lastMarker(4), lastMarker(23), lastMarker(25)]).toEqual([0, 0, 20, 25]);
  });

  it('banks the haul the way surfacing does', () => {
    for (const [pearls, grown] of [[20, 3], [7, 1], [100, 9], [0, 0]]) {
      const dive: Dive = { start: 0, depth: 25, line: 100, state: 'ledge', ledges: 5, grown, pearls, gear: { rod: 0, line: 0 }, fish: [] };
      expect(banked({ pearls, grown })).toBe(surface(dive, { ledges: [], record: 0 })!.pearls);
    }
  });

  it('shows the last marker, fish and markers to go, the line and the haul in pearls and coins, and warns as the line runs low', () => {
    const t = text(hudHtml(view({ worn: 12 }), true));
    expect(t).toContain('The Drop-off Marker 20');
    expect(t).not.toMatch(/league/i);
    expect(t).toContain('2 fish to marker 25');
    expect(t).toContain('3 markers to Kelp Deep');
    expect(text(hudHtml(view({ depth: 24 }), false))).toContain('1 fish to marker 25');
    expect(text(hudHtml(view({ depth: 3 }), false))).toMatch(/^The Shelf 2 fish to marker 5 .* 3 markers to the Drop-off/);
    expect(text(hudHtml(view({ depth: 32 }), false))).toContain('1 marker to Kelp Deep');
    expect(text(hudHtml(view({ state: 'ledge', depth: 35 }), false))).toContain('Kelp Deep next');
    expect(hudHtml(view({ worn: 12 }), true).match(/<i class="on/g)).toHaveLength(3);
    expect(hudHtml(view({ state: 'ledge', depth: 25 }), false).match(/<i class="(flag )?on/g)).toHaveLength(7);
    expect(t).toContain('214 m −12 m');
    expect(t).toContain('16 ×1.56 24,000');
    expect(t).not.toContain('🐟 13');
    expect(text(hudHtml(view({ worn: 12 }), false))).not.toContain('−12');
    expect(text(hudHtml(view({ worn: 0.3 }), true))).not.toContain('−');
    expect(text(hudHtml(view({ state: 'ledge', depth: 25 }), false))).toContain('Marker 25 reached');
    expect([lineLevel(200), lineLevel(60), lineLevel(25), lineLevel(0)]).toEqual(['ok', 'low', 'danger', 'danger']);
    expect(hudHtml(view({ line: 20 }), false)).toContain('class="line danger"');
  });

  it('lists a flag per marker in the zone, none in the last one', () => {
    expect([0, 20, 45, 75, 90].map((d) => zoneMarkers(d).length)).toEqual([3, 4, 5, 6, 6]);
    expect(zoneMarkers(200)).toEqual([]);
    expect(zoneMarkers(75)[0]).toBe(65);
    expect(text(hudHtml(view({ depth: 72 }), false))).toContain('4 markers to the Abyss');
    expect(hudHtml(view({ depth: 72 }), false).match(/class="flag on/g)).toHaveLength(2);
    expect(hudHtml(view({ depth: 200 }), false)).not.toContain('markers to');
    expect(text(hudHtml(view({ depth: 200 }), false))).toContain('The Abyss Marker 200');
  });

  it('shows what a fish pays right now on the strip: pearls in pearl water, else when they start', () => {
    // +0/+0 at depth 3: pearl water from the harbour, so every fish pays.
    expect(text(hudHtml(view({ depth: 3, grown: 0, pearls: 0 }), false))).toContain('Haul 1 a fish');
    const easy = text(hudHtml(view({ depth: 23, grown: 0, pearls: 0, gear: { rod: 10, line: 10 } }), false));
    expect(easy).toContain('Haul easy water · pearls from marker 50');
    expect(easy).not.toContain('×');
    expect(text(hudHtml(view({ depth: 23, grown: 2, pearls: 16, gear: { rod: 10, line: 10 } }), false))).toContain('16 ×1.56');
    expect(text(hudHtml(view({ grown: 0 }), false))).not.toContain('×');
  });

  it("starts Reed's panel where pearl water starts for the gear, up to the furthest marker", () => {
    const gear = { rod: 10, line: 10 };
    expect(defaultStart({ ledges: [], record: 0 }, gear)).toBe(0);
    expect(defaultStart({ ledges: [], record: 20 }, gear)).toBe(20);
    expect(defaultStart({ ledges: [], record: 100 }, gear)).toBe(50);
    expect(defaultStart({ ledges: [], record: 40 }, gear)).toBe(40);
    expect(defaultStart({ ledges: [], record: 100 }, { rod: 0, line: 0 })).toBe(0);
    // A pick counts only where a charter can start.
    expect(reedStart({ ledges: [], record: 60 }, gear, 50)).toBe(50);
    expect(reedStart({ ledges: [], record: 60 }, gear, 65)).toBe(50);
    expect(reedStart({ ledges: [], record: 60 }, gear, null)).toBe(50);
  });

  it("offers Reed's starts as chips and a stepper for any marker up to the furthest, with the rod and line's reach", () => {
    const gear = { rod: 10, line: 10 };
    const chart = { ledges: [5, 60], record: 60 };
    const reed = (pick: number, c = chart, g = gear) => reedHtml({ say: 'Shall we?', chart: c, pearls: 68, ownsRod: true, pick, open: true, gear: g });
    const html = reed(40);
    const t = text(html);
    expect(t).toContain('Harbour start Pearl water marker 50 Furthest marker 60');
    expect(html).toContain('class="chip" data-act="divefrom" data-id="0"');
    expect(html).toContain('class="chip rec" data-act="divefrom" data-id="60"');
    expect(html).toContain('class="chip" data-act="divefrom" data-id="50"');
    expect(reed(50)).toContain('class="chip sel" data-act="divefrom" data-id="50"');
    // The stepper moves one marker a step and stops at both ends.
    expect(t).toContain('Marker 40 Kelp Deep');
    expect(html).toContain('data-id="35" aria-label="Earlier marker"');
    expect(html).toContain('data-id="45" aria-label="Later marker"');
    expect(reed(60)).toMatch(/data-id="60" aria-label="Later marker" disabled/);
    expect(reed(0)).toMatch(/data-id="0" aria-label="Earlier marker" disabled/);
    expect(t).toContain('Your rod and line Pearl water from marker 50 Hard going from marker 80 Too much from marker 95');
    expect(text(reed(55))).toMatch(/Start at marker 55 in Kelp Deep\. \d+ a fish here, more each marker out\./);
    expect(html).toContain('data-act="castoff" data-id="40"');
    expect(t).toContain('Head home at a marker to bank the haul with its bonus. Run out of line and you keep the pearls but lose the bonus.');
    expect(t).toContain('Furthest marker: 60');
    // Before pearl water.
    expect(text(reed(20))).toContain('Start at marker 20 in the Drop-off. Easy water for your gear: quick fights and coins, no pearls until marker 50.');
    // No pearl chip past the furthest marker; fresh gear is in pearl water from the harbour.
    const fresh = text(reed(0, { ledges: [], record: 0 }, { rod: 0, line: 0 }));
    expect(fresh).toContain('Start at the harbour, into the Shelf. 1 a fish here, more each marker out.');
    expect(fresh).toContain('Pearl water from the harbour');
    expect(fresh).not.toContain('Pearl water marker');
    expect(fresh).not.toContain('Furthest marker ');
    expect(fresh).toContain('No markers charted yet');
    const locked = text(reedHtml({ say: '', chart: { ledges: [], record: 0 }, pearls: 0, ownsRod: false, pick: 0, open: true, gear: { rod: 0, line: 0 } }));
    expect(locked).toContain('need the Deep Sea Rod');
    expect(locked).toContain('stays on my boat');
    expect(locked).toContain('keep the pearls but lose the bonus');
    expect(locked).not.toContain('Cast off');
  });

  it("explains charters and that Reed's seaplane isn't ready while charters are closed", () => {
    const closed = (ownsRod: boolean) => reedHtml({ say: 'Shall we?', chart: { ledges: [5], record: 5 }, pearls: 3, ownsRod, pick: 5, open: false, gear: { rod: 0, line: 0 } });
    const t = text(closed(true));
    expect(t).toContain('Charters are coming soon.');
    expect(t).toContain('Every 5 fish you land, you reach a marker: head home with your haul, or sail on');
    expect(t).toContain('keep the pearls but lose the bonus');
    expect(t).toContain('Deep Sea Rod, and you have one.');
    expect(t).not.toContain('Shall we?');
    expect(closed(true)).not.toContain('castoff');
    expect(closed(true)).not.toContain('divefrom');
    expect(text(closed(false))).toMatch(/Deep Sea Rod, which Marlow sells from level \d+\./);
  });

  it('offers head home or sail on at a marker, with the haul each way and what sailing on means', () => {
    // Pearl water ahead (+0/+0).
    const t = text(markerHtml(view({ depth: 25, state: 'ledge', ledges: 3, grown: 3, pearls: 20, line: 198, fish: 15 })));
    expect(t).toContain('Marker 25 The Drop-off · 24,000 from fish this charter');
    expect(t).toContain('Line left 198 m');
    expect(t).toContain('20 ×1.95 = 39');
    expect(t).toContain('Sail on: 6 a fish to marker 30, and the bonus grows to ×2.44 there. Run out of line and you keep the 20 pearls but lose the bonus.');
    expect(t).toContain('Head home bank 39 · chart marker 25');
    expect(t).toContain('Sail on ×2.44 at marker 30');
    // Easy water ahead: the bonus holds, a new zone ahead, and the pearl water start.
    const easy = text(markerHtml(view({ depth: 35, state: 'ledge', ledges: 5, grown: 2, pearls: 60, gear: { rod: 10, line: 10 } })));
    expect(easy).toContain('Sail on: easy water to marker 40, no pearls yet. Pearl water starts at marker 50. Past marker 35: Kelp Deep.');
    expect(easy).toContain('Run out of line and you keep the 60 pearls but lose the bonus.');
    expect(easy).toContain('Sail on next: marker 40');
    const deep = text(markerHtml(view({ depth: 50, state: 'ledge', ledges: 6, grown: 1, pearls: 60, gear: { rod: 10, line: 10 } })));
    expect(deep).toContain('Sail on: 3 a fish to marker 55, and the bonus grows to ×1.56 there.');
    const wide = text(markerHtml(view({ depth: 20, state: 'ledge', ledges: 4, grown: 0, pearls: 0, gear: { rod: 10, line: 10 } })));
    expect(wide).toContain('Sail on: easy water to marker 25, no pearls yet. Pearl water starts at marker 50.');
    expect(wide).toContain('Sail on next: marker 25');
    expect(wide).not.toContain('Run out of line');
    for (const h of [t, easy, deep, wide]) expect(h).not.toMatch(/\bsink|\bsank|\bsunk/i);
  });

  it('tells what heading home between markers keeps, with and without a bonus', () => {
    const bonus = text(headHomeHtml(view({ pearls: 120, grown: 2 })));
    expect(bonus).toContain('The Drop-off · 2 fish to marker 25 Head home now and you keep the 120 pearls but lose the ×1.56 bonus (68 pearls).');
    expect(bonus).toContain('You keep the 24,000 from fish sold so far.');
    expect(bonus).not.toContain('13 fish');
    const plain = text(headHomeHtml(view({ pearls: 120, grown: 0 })));
    expect(plain).toContain('You keep the 120 pearls.');
    expect(plain).not.toContain('bonus');
    const empty = text(headHomeHtml(view({ pearls: 0, grown: 0, fish: 0, coins: 0 })));
    expect(empty).toContain('Nothing in the haul yet');
    expect(empty).not.toContain('You keep');
    for (const h of [bonus, plain, empty]) expect(h).not.toMatch(/\bsink|\bsank|\bsunk/i);
  });

  it('tells how a charter ended: pearls kept as a gain, and the bonus lost only when there was one', () => {
    const home: DiveEnd = { result: 'surfaced', ledge: 25, pearls: 39, record: true, fish: 15, coins: 27400 };
    const t = text(endHtml(home, view({ depth: 25, state: 'ledge', ledges: 3, grown: 3, pearls: 20 }), 68, 25));
    expect(t).toContain('Home safe!');
    expect(t).toContain('Marker 25 charted ★ New record');
    expect(t).toContain('+39 20 pearls ×1.95 for 3 markers in pearl water · 68 Black Pearls in all');
    expect(t).toContain('Fish landed and sold 15 · 27,400');
    const sunkHtml = (o: Partial<Extract<DiveEnd, { result: 'sunk' }>> = {}, last: DiveView | null = null) =>
      endHtml({ result: 'sunk', why: 'line', depth: 27, pearls: 120, bonus: 67, fish: 17, coins: 31200, ...o }, last, 42, 25);
    const sunk = (o: Partial<Extract<DiveEnd, { result: 'sunk' }>> = {}, last: DiveView | null = null) => text(sunkHtml(o, last));
    const line = sunk({ lost: 'held-red' }, view());
    expect(line).toContain('Out of line Before marker 30 · The Drop-off The last fish snapped the line: you held on in the red.');
    expect(line).toContain('+120');
    expect(line).toContain('The ×1.56 bonus (67 pearls) was lost. Head home at a marker to bank it.');
    expect(line).toContain('Head home sooner when the line runs low.');
    expect(sunkHtml()).not.toContain('class="big lost"');
    expect(sunk({ lost: 'ran' })).toContain('ran off with the line');
    expect(sunk()).toContain('took the last of the line');
    // Without the dive's growth the multiplier is worked back from the pearls.
    expect(sunk({ pearls: 100, bonus: 25 })).toContain('The ×1.25 bonus (25 pearls) was lost.');
    const headed = sunk({ why: 'home' });
    expect(headed).toContain('Headed home');
    expect(headed).toContain('You headed home between markers.');
    const away = sunk({ why: 'away' });
    expect(away).toContain('The charter ended');
    expect(away).toContain('waited 2 minutes');
    // No bonus, no line about it; no pearls, no gain.
    const none = sunk({ pearls: 12, bonus: 0 });
    expect(none).toContain('+12');
    expect(none).not.toContain('bonus');
    const empty = sunk({ pearls: 0, bonus: 0 });
    expect(empty).not.toContain('+0');
    expect(empty).not.toContain('bonus');
    for (const h of [line, headed, away, none, empty]) expect(h).not.toMatch(/\bsink|\bsank|\bsunk/i);
    expect(lossText('held-surge')).toContain('through a surge');
    expect([startText(0), startText(20), startText(24)]).toEqual(['The Shelf · from the harbour', 'The Drop-off · from marker 20', 'The Drop-off · partway to marker 25']);
  });
});
