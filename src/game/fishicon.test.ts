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
});
