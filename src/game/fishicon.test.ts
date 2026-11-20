import { describe, expect, it } from 'vitest';
import { FISH } from '../data/content';
import { FISH_LOOK } from '../data/fishlook';
import { fishIcon } from './fishicon';

describe('fish icon tier finish', () => {
  it('gets fancier with each tier', () => {
    for (const f of FISH.filter((x) => !x.sea)) {
      const svg = fishIcon(f.id);
      expect(svg.includes('<filter'), `${f.id} glow`).toBe(f.tier >= 4);
      expect(svg.includes('class="fishico t5"'), `${f.id} spirit`).toBe(f.tier === 5);
      expect(svg.includes('opacity="0.35"') || svg.includes('opacity="0.5"'), `${f.id} gloss`).toBe(f.tier >= 3);
    }
  });

  it('gives sea fish without a zone finish the plain lake-giant look, with no glow or spirit crown', () => {
    for (const f of FISH.filter((x) => x.sea && !FISH_LOOK[x.id]?.finish)) {
      const svg = fishIcon(f.id);
      expect(svg, f.id).not.toContain('<filter');
      expect(svg, f.id).not.toContain('fishico t');
      expect(svg, f.id).not.toContain('#ffe27a');
    }
  });

  it('keeps undiscovered fish a plain silhouette', () => {
    for (const f of FISH.filter((x) => x.tier >= 4 && !x.sea)) expect(fishIcon(f.id, { hidden: true })).not.toContain('<filter');
  });

  it('draws each sea legend its own icon, flat ink when hidden and with the glint when shiny', () => {
    const legends = ['grouper', 'marlin', 'kelpbeard', 'kelpwyrm', 'oarfish', 'chandelier', 'leviathan', 'dreamer', 'kraken'];
    const seen = new Set<string>();
    for (const id of legends) {
      const svg = fishIcon(id);
      expect(svg, id).toContain('viewBox="0 0 64 40"');
      expect(svg, id).not.toContain('<filter');
      expect(seen.has(svg), `${id} unique`).toBe(false);
      seen.add(svg);
      const hidden = fishIcon(id, { hidden: true });
      const fills = [...hidden.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
      expect(fills.length, id).toBeGreaterThan(0);
      for (const f of fills) expect(f, `${id} hidden colour`).toBe('#2a1b0f');
      expect(hidden, id).not.toContain('url(#');
      expect(fishIcon(id, { shiny: true }), id).toContain('#fff6c2');
      expect(fishIcon(id), id).not.toContain('#fff6c2');
    }
  });
});
