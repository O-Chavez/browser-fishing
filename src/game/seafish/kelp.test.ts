import { describe, expect, it } from 'vitest';
import { FISH_LOOK } from '../../data/fishlook';
import { fishIcon } from '../fishicon';

const KELP = Object.keys(FISH_LOOK).filter((id) => FISH_LOOK[id].finish === 'overgrown');

describe('Kelp Deep fish icons', () => {
  it('has its five species, each with parts', () => {
    expect(KELP.sort()).toEqual(['frondback', 'kelpbeard', 'kelpwyrm', 'lionfish', 'wolfeel']);
    for (const id of KELP) expect(Object.keys(FISH_LOOK[id].kelp ?? {}).length, id).toBeGreaterThan(0);
  });

  it('draws parts beyond the plain body, with no glow filter', () => {
    for (const id of KELP) {
      const svg = fishIcon(id);
      expect(svg, id).not.toContain('<filter');
      expect(svg.length, id).toBeGreaterThan(fishIcon('minnow').length);
    }
  });

  it('keeps an undiscovered fish a single-ink silhouette', () => {
    for (const id of KELP) {
      const svg = fishIcon(id, { hidden: true });
      const fills = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,6})"/gi)].map((m) => m[1].toLowerCase());
      expect(new Set(fills).size, id).toBeLessThanOrEqual(2);
    }
  });

  it('tints shinies', () => {
    for (const id of KELP) expect(fishIcon(id, { shiny: true }), id).not.toBe(fishIcon(id));
  });
});
