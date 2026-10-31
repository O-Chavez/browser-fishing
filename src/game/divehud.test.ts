import { describe, expect, it } from 'vitest';
import type { DiveEnd, DiveView } from '../net/protocol';
import { banked, endHtml, headHomeHtml, hudHtml, lineLevel, lossText, markerHtml, nextMarker, reedHtml, startText } from './divehud';
import { surface, type Dive } from './dive';

const view = (o: Partial<DiveView> = {}): DiveView => ({ id: 1, start: 10, depth: 23, line: 214, state: 'fishing', ledges: 2, pearls: 16, fish: 13, coins: 24000, ...o });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('dive HUD', () => {
  it('counts to the next marker, and past the one the boat is at', () => {
    expect(nextMarker(0)).toBe(5);
    expect(nextMarker(23)).toBe(25);
    expect(nextMarker(25)).toBe(30);
  });

  it('banks the haul the way surfacing does', () => {
    for (const [pearls, ledges] of [[20, 3], [7, 1], [100, 9], [0, 0]]) {
      const dive: Dive = { start: 0, depth: 25, line: 100, state: 'ledge', ledges, pearls, fish: [] };
      expect(banked({ pearls, ledges })).toBe(surface(dive, { ledges: [], record: 0 })!.pearls);
    }
  });

  it('shows leagues and markers, the line and the haul, and warns as the line runs low', () => {
    const t = text(hudHtml(view({ worn: 12 }), true));
    expect(t).toContain('The Drop-off');
    expect(t).toContain('league 23');
    expect(t).toContain('Marker 25 · 2 more fish');
    expect(t).toContain('214 m −12 m');
    expect(t).toContain('16 +20% 🐟 13');
    expect(text(hudHtml(view({ worn: 12 }), false))).not.toContain('−12');
    expect(text(hudHtml(view({ worn: 0.3 }), true))).not.toContain('−');
    expect(text(hudHtml(view({ state: 'ledge', depth: 25 }), false))).toContain('Head home or sail on?');
    expect([lineLevel(200), lineLevel(60), lineLevel(25), lineLevel(0)]).toEqual(['ok', 'low', 'danger', 'danger']);
    expect(hudHtml(view({ line: 20 }), false)).toContain('class="line danger"');
  });

  it("lists the harbour and charted markers by zone in Reed's panel, or what a charter needs", () => {
    const html = reedHtml({ say: 'Shall we?', chart: { ledges: [5, 10, 15, 20, 25], record: 25 }, pearls: 68, ownsRod: true, pick: 25 });
    const t = text(html);
    expect(t).toMatch(/The Shelf Harbour league 0 5 marker 10 marker 15 marker The Drop-off 20 marker 25 marker/);
    expect(html).toContain('class="chip sel rec" data-act="divefrom" data-id="25"');
    expect(t).toContain('Start at marker 25 in The Drop-off. Runners: long pulls that take line. 2 pearls a fish.');
    expect(html).toContain('data-act="castoff" data-id="25"');
    expect(t).toContain('Furthest marker: 25');
    expect(text(reedHtml({ say: '', chart: { ledges: [], record: 0 }, pearls: 0, ownsRod: true, pick: 0 }))).toContain('Start at the harbour, into The Shelf. Steady fish, no tricks. 1 pearl a fish.');
    const locked = text(reedHtml({ say: '', chart: { ledges: [], record: 0 }, pearls: 0, ownsRod: false, pick: 0 }));
    expect(locked).toContain('need the Aurora Rod');
    expect(locked).not.toContain('Cast off');
  });

  it('offers head home or sail on at a marker, with the haul each way', () => {
    const t = text(markerHtml(view({ depth: 25, state: 'ledge', ledges: 3, pearls: 20, line: 198, fish: 15 })));
    expect(t).toContain('Marker 25 The Drop-off · 15 fish landed this charter');
    expect(t).toContain('20 × 1.3 = 26');
    expect(t).toContain('Head home bank 26 · chart marker 25');
    expect(t).toContain('Sail on +40% at marker 30');
    // Capped growth, and a new zone ahead.
    const capped = text(markerHtml(view({ depth: 40, state: 'ledge', ledges: 5, pearls: 60 })));
    expect(capped).toContain('at its best (+50%)');
    expect(capped).toContain('Past marker 40: Kelp Deep');
  });

  it('warns that heading home between markers sinks the haul', () => {
    expect(text(headHomeHtml(view()))).toContain('The Drop-off · league 23 · 2 fish to marker 25 The haul of 16 pearls sinks');
    expect(text(headHomeHtml(view({ pearls: 0, fish: 0 })))).toContain('Nothing in the haul yet');
  });

  it('tells how a charter ended, with the reason a haul sank', () => {
    const home: DiveEnd = { result: 'surfaced', ledge: 25, pearls: 26, record: true, fish: 15, coins: 27400 };
    const t = text(endHtml(home, view({ depth: 25, state: 'ledge', ledges: 3, pearls: 20 }), 68, 25));
    expect(t).toContain('Home safe!');
    expect(t).toContain('Marker 25 charted ★ New record');
    expect(t).toContain('+26 20 pearls × 1.3 for 3 markers · 68 pearls in all');
    expect(t).toContain('Fish landed and sold 15 · 27,400');
    const sunk = (o: Partial<Extract<DiveEnd, { result: 'sunk' }>>) =>
      text(endHtml({ result: 'sunk', why: 'line', depth: 27, pearls: 24, fish: 17, coins: 31200, ...o }, null, 42, 25));
    expect(sunk({ lost: 'held-red' })).toContain('Out of line at league 27 · The Drop-off The last fish snapped the line: you held on in the red.');
    expect(sunk({ lost: 'ran' })).toContain('ran off with the line');
    expect(sunk({})).toContain('took the last of the line');
    expect(sunk({ why: 'home' })).toContain('Headed home');
    expect(sunk({ why: 'away' })).toContain('waited 2 minutes');
    expect(lossText('held-surge')).toContain('through a surge');
    expect([startText(0), startText(20), startText(24)]).toEqual(['The Shelf · from the harbour', 'The Drop-off · from marker 20', 'The Drop-off · league 24']);
  });
});
