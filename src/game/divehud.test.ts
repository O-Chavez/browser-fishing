import { describe, expect, it } from 'vitest';
import type { DiveEnd, DiveView } from '../net/protocol';
import { banked, endHtml, fishTagHtml, headHomeHtml, hudHtml, lastMarker, lineLevel, lossText, zoneMarkers, markerHtml, nextMarker, reedHtml, startText } from './divehud';
import { surface, type Dive } from './dive';

const view = (o: Partial<DiveView> = {}): DiveView => ({ id: 1, start: 10, depth: 23, line: 214, state: 'fishing', ledges: 2, pearls: 16, fish: 13, coins: 24000, ...o });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('dive HUD', () => {
  it("the fish's sticker keeps its pull and behaviour up all fight, and says when it's too strong for the line", () => {
    expect(text(fishTagHtml({ b: 'thrasher', pull: 'strong', overLine: true }))).toBe('💪 Strong · 💥 Thrasher · too strong for your line');
    expect(text(fishTagHtml({ b: 'runner', pull: 'light', overLine: false }))).toBe('🪶 Light · 🏃 Runner · long pulls that take line');
    expect(text(fishTagHtml({ b: 'sounder', pull: null, overLine: false }))).toBe('⤵️ Sounder · dives with little warning');
    expect(text(fishTagHtml({ b: null, pull: 'strong', overLine: false }))).toBe('💪 Strong');
    expect(fishTagHtml({ b: null, pull: null, overLine: true })).toBe('Too strong for your line');
    // A typical Shelf fish the line holds: no sticker.
    expect(fishTagHtml({ b: null, pull: null, overLine: false })).toBe('');
  });

  it('counts to the next marker, and past the one the boat is at', () => {
    expect(nextMarker(0)).toBe(5);
    expect(nextMarker(23)).toBe(25);
    expect(nextMarker(25)).toBe(30);
    expect([lastMarker(0), lastMarker(4), lastMarker(23), lastMarker(25)]).toEqual([0, 0, 20, 25]);
  });

  it('banks the haul the way surfacing does', () => {
    for (const [pearls, ledges] of [[20, 3], [7, 1], [100, 9], [0, 0]]) {
      const dive: Dive = { start: 0, depth: 25, line: 100, state: 'ledge', ledges, pearls, fish: [] };
      expect(banked({ pearls, ledges })).toBe(surface(dive, { ledges: [], record: 0 })!.pearls);
    }
  });

  it('shows the last marker, fish and markers to go, the line and the haul in pearls and coins, and warns as the line runs low', () => {
    const t = text(hudHtml(view({ worn: 12 }), true));
    expect(t).toContain('The Drop-off Marker 20');
    expect(t).not.toMatch(/league/i);
    expect(t).toContain('2 fish to marker 25');
    expect(t).toContain('4 markers to Kelp Deep');
    expect(text(hudHtml(view({ depth: 24 }), false))).toContain('1 fish to marker 25');
    expect(text(hudHtml(view({ depth: 3 }), false))).toMatch(/^The Shelf 2 fish to marker 5 .* 3 markers to the Drop-off/);
    expect(text(hudHtml(view({ depth: 37 }), false))).toContain('1 marker to Kelp Deep');
    expect(text(hudHtml(view({ state: 'ledge', depth: 40 }), false))).toContain('Kelp Deep next');
    expect(hudHtml(view({ worn: 12 }), true).match(/<i class="on/g)).toHaveLength(3);
    expect(hudHtml(view({ state: 'ledge', depth: 25 }), false).match(/<i class="(flag )?on/g)).toHaveLength(7);
    expect(t).toContain('214 m −12 m');
    expect(t).toContain('16 +20% 24,000');
    expect(t).not.toContain('🐟 13');
    expect(text(hudHtml(view({ worn: 12 }), false))).not.toContain('−12');
    expect(text(hudHtml(view({ worn: 0.3 }), true))).not.toContain('−');
    expect(text(hudHtml(view({ state: 'ledge', depth: 25 }), false))).toContain('Marker 25 reached');
    expect([lineLevel(200), lineLevel(60), lineLevel(25), lineLevel(0)]).toEqual(['ok', 'low', 'danger', 'danger']);
    expect(hudHtml(view({ line: 20 }), false)).toContain('class="line danger"');
  });

  it('lists a flag per marker in the zone, none in the last one', () => {
    expect([0, 20, 45, 100, 150].map((d) => zoneMarkers(d).length)).toEqual([3, 5, 8, 14, 14]);
    expect(zoneMarkers(200)).toEqual([]);
    expect(zoneMarkers(100)[0]).toBe(85);
    expect(text(hudHtml(view({ depth: 92 }), false))).toContain('12 markers to the Abyss');
    expect(hudHtml(view({ depth: 92 }), false).match(/class="flag on/g)).toHaveLength(2);
    expect(hudHtml(view({ depth: 200 }), false)).not.toContain('markers to');
    expect(text(hudHtml(view({ depth: 200 }), false))).toContain('The Abyss Marker 200');
  });

  it("lists the harbour and charted markers by zone in Reed's panel, or what a charter needs", () => {
    const html = reedHtml({ say: 'Shall we?', chart: { ledges: [5, 10, 15, 20, 25], record: 25 }, pearls: 68, ownsRod: true, pick: 25, open: true });
    const t = text(html);
    expect(t).toMatch(/The Shelf Harbour start 5 marker 10 marker 15 marker The Drop-off 20 marker 25 marker/);
    expect(html).toContain('class="chip sel rec" data-act="divefrom" data-id="25"');
    expect(t).toContain('Start at marker 25 in The Drop-off. Runners: long pulls that take line. 2 pearls a fish.');
    expect(html).toContain('data-act="castoff" data-id="25"');
    expect(t).toContain('Furthest marker: 25');
    expect(text(reedHtml({ say: '', chart: { ledges: [], record: 0 }, pearls: 0, ownsRod: true, pick: 0, open: true }))).toContain('Start at the harbour, into The Shelf. Steady fish, no tricks. 1 pearl a fish.');
    const locked = text(reedHtml({ say: '', chart: { ledges: [], record: 0 }, pearls: 0, ownsRod: false, pick: 0, open: true }));
    expect(locked).toContain('need the Deep Sea Rod');
    expect(locked).toContain('stays on my boat');
    expect(locked).not.toContain('Cast off');
  });

  it("explains charters and that Reed's seaplane isn't ready while charters are closed", () => {
    const closed = (ownsRod: boolean) => reedHtml({ say: 'Shall we?', chart: { ledges: [5], record: 5 }, pearls: 3, ownsRod, pick: 5, open: false });
    const t = text(closed(true));
    expect(t).toContain('Charters are coming soon.');
    expect(t).toContain('Every 5 fish you land, you reach a marker: head home with your haul, or sail on');
    expect(t).toContain('Deep Sea Rod, and you have one.');
    expect(t).not.toContain('Shall we?');
    expect(closed(true)).not.toContain('castoff');
    expect(closed(true)).not.toContain('divefrom');
    expect(text(closed(false))).toMatch(/Deep Sea Rod, which Marlow sells from level \d+\./);
  });

  it('offers head home or sail on at a marker, with the haul each way', () => {
    const t = text(markerHtml(view({ depth: 25, state: 'ledge', ledges: 3, pearls: 20, line: 198, fish: 15 })));
    expect(t).toContain('Marker 25 The Drop-off · 24,000 from fish this charter');
    expect(t).toContain('20 × 1.3 = 26');
    expect(t).toContain('Head home bank 26 · chart marker 25');
    expect(t).toContain('Sail on +40% at marker 30');
    // Capped growth, and a new zone ahead.
    const capped = text(markerHtml(view({ depth: 40, state: 'ledge', ledges: 5, pearls: 60 })));
    expect(capped).toContain('at its best (+50%)');
    expect(capped).toContain('Past marker 40: Kelp Deep');
  });

  it('warns that heading home between markers sinks the haul', () => {
    expect(text(headHomeHtml(view()))).toContain('The Drop-off · 2 fish to marker 25 The haul of 16 pearls sinks');
    expect(text(headHomeHtml(view()))).toContain('You keep the 24,000 from fish sold so far.');
    expect(text(headHomeHtml(view()))).not.toContain('13 fish');
    const empty = text(headHomeHtml(view({ pearls: 0, fish: 0, coins: 0 })));
    expect(empty).toContain('Nothing in the haul yet');
    expect(empty).not.toContain('You keep');
  });

  it('tells how a charter ended, with the reason a haul sank', () => {
    const home: DiveEnd = { result: 'surfaced', ledge: 25, pearls: 26, record: true, fish: 15, coins: 27400 };
    const t = text(endHtml(home, view({ depth: 25, state: 'ledge', ledges: 3, pearls: 20 }), 68, 25));
    expect(t).toContain('Home safe!');
    expect(t).toContain('Marker 25 charted ★ New record');
    expect(t).toContain('+26 20 pearls × 1.3 for 3 markers · 68 Black Pearls in all');
    expect(t).toContain('Fish landed and sold 15 · 27,400');
    const sunk = (o: Partial<Extract<DiveEnd, { result: 'sunk' }>>) =>
      text(endHtml({ result: 'sunk', why: 'line', depth: 27, pearls: 24, fish: 17, coins: 31200, ...o }, null, 42, 25));
    expect(sunk({ lost: 'held-red' })).toContain('Out of line before marker 30 · The Drop-off The last fish snapped the line: you held on in the red.');
    expect(sunk({ lost: 'ran' })).toContain('ran off with the line');
    expect(sunk({})).toContain('took the last of the line');
    expect(sunk({ why: 'home' })).toContain('Headed home');
    expect(sunk({ why: 'away' })).toContain('waited 2 minutes');
    expect(lossText('held-surge')).toContain('through a surge');
    expect([startText(0), startText(20), startText(24)]).toEqual(['The Shelf · from the harbour', 'The Drop-off · from marker 20', 'The Drop-off · partway to marker 25']);
  });
});
