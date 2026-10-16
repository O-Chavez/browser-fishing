import { describe, expect, it } from 'vitest';
import { Player } from './player';

describe('jumping', () => {
  it('rises, lands, and cannot double-jump', () => {
    const p = new Player(60);
    p.teleport(0, 2);
    p.jump();
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      p.update(0.016, 0, 0, false, 0, []);
      peak = Math.max(peak, p.bob);
    }
    expect(peak).toBeGreaterThan(0.3);
    p.jump();
    for (let i = 0; i < 100; i++) p.update(0.016, 0, 0, false, 0, []);
    expect(p.airborne).toBe(false);
    expect(Math.abs(p.bob)).toBeLessThan(0.05);
  });
});
