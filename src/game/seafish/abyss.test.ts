import { describe, expect, it } from 'vitest';
import { FISH } from '../../data/content';
import { FISH_LOOK } from '../../data/fishlook';
import { fishIcon } from '../fishicon';

const ABYSS = FISH.filter((f) => f.locations.includes('abyss'));

describe('the Abyss fish looks', () => {
  it('gives every Abyss fish its parts and glowing eyes in place of the usual pair', () => {
    expect(ABYSS.length).toBeGreaterThan(0);
    for (const f of ABYSS) {
      const look = FISH_LOOK[f.id];
      expect(look.finish, f.id).toBe('abyssal');
      expect(look.abyss, f.id).toBeDefined();
      expect(look.eye, f.id).toBe('none');
    }
  });

  it('draws a glowing icon without blur filters, the same every time', () => {
    for (const f of ABYSS) {
      const svg = fishIcon(f.id);
      expect(svg, f.id).not.toContain('<filter');
      expect(svg, f.id).toContain('radialGradient');
      expect(svg.replace(/(fg|fc|ag)\d+/g, ''), f.id).toBe(fishIcon(f.id).replace(/(fg|fc|ag)\d+/g, ''));
    }
  });

  it('keeps undiscovered fish a plain silhouette: no glow, eyes or colour', () => {
    for (const f of ABYSS) {
      const svg = fishIcon(f.id, { hidden: true });
      expect(svg, f.id).not.toContain('radialGradient');
      expect(svg, f.id).not.toContain('#fff"');
      const accent = `#${FISH_LOOK[f.id].accent!.toString(16).padStart(6, '0')}`;
      expect(svg, f.id).not.toContain(accent);
    }
  });

  it('turns the parts gold on a shiny', () => {
    for (const f of ABYSS) expect(fishIcon(f.id, { shiny: true }), f.id).toContain('#ffe27a');
  });
});
