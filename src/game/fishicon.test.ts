import { describe, expect, it } from 'vitest';
import { FISH } from '../data/content';
import { fishIcon } from './fishicon';

describe('fish icon tier finish', () => {
  it('gets fancier with each tier', () => {
    for (const f of FISH) {
      const svg = fishIcon(f.id);
      expect(svg.includes('<filter'), `${f.id} glow`).toBe(f.tier >= 4);
      expect(svg.includes('class="fishico t5"'), `${f.id} spirit`).toBe(f.tier === 5);
      expect(svg.includes('opacity="0.35"') || svg.includes('opacity="0.5"'), `${f.id} gloss`).toBe(f.tier >= 3);
    }
  });

  it('keeps undiscovered fish a plain silhouette', () => {
    for (const f of FISH.filter((x) => x.tier >= 4)) expect(fishIcon(f.id, { hidden: true })).not.toContain('<filter');
  });
});
