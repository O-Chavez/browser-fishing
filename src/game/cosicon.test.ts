import { describe, expect, it } from 'vitest';
import { COSMETICS } from '../data/cosmetics';
import { cosIcon } from './cosicon';

describe('cosmetic icons', () => {
  it('draws every cosmetic', () => {
    for (const c of COSMETICS) {
      // The 40x40 frame alone is about 80 characters; a drawn icon is far longer.
      expect(cosIcon(c.id).length, c.id).toBeGreaterThan(300);
    }
  });

  it('gives Legendary zone pieces stars and Epic ones none, like their models', () => {
    const zone = COSMETICS.filter((c) => c.shop === 'zone');
    expect(zone.length).toBeGreaterThan(0);
    for (const c of zone) expect(cosIcon(c.id).includes('class="cosico legend"'), c.id).toBe(c.tier === 5);
  });
});
