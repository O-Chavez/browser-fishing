import { describe, expect, it } from 'vitest';
import { FISH, RARITY_COLOR, TIERS, tierName, tierTextColor } from './content';

/** Hue of a `#rrggbb` colour in degrees, or -1 for a grey. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 0.05) return -1;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('fish tier colours', () => {
  it("gives each tier's words the hue the menus give that tier: grey, green, blue, purple, gold", () => {
    // The banner and the boards took their colour one tier up ("Uncommon fish hooked!" in blue; a player's note, 2026-11-17).
    for (let tier = 1; tier <= 5; tier++) {
      const menu = hue(RARITY_COLOR[TIERS[tier - 1]]);
      const words = hue(tierTextColor(tier));
      const apart = menu < 0 || words < 0 ? (menu === words ? 0 : 180) : Math.abs(((menu - words + 540) % 360) - 180);
      expect(apart, `tier ${tier} ${tierName(tier)}: ${tierTextColor(tier)} against ${RARITY_COLOR[TIERS[tier - 1]]}`).toBeLessThan(25);
    }
  });

  it('has a colour for every fish, and white where there is none', () => {
    for (const f of FISH) expect(tierTextColor(f.tier)).toMatch(/^#[0-9a-f]{6}$/);
    expect(tierTextColor(0)).toBe('#ffffff');
  });
});
