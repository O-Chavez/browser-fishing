import { describe, expect, it } from 'vitest';
import { JUMP_TIME, Player, jumpLift } from './player';

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

  it('jumpLift replays the arc the player flies, for other players to see', () => {
    const p = new Player(60);
    p.teleport(0, 2);
    expect(p.jump()).toBe(true);
    expect(p.jump()).toBe(false);
    const dt = 0.004;
    for (let t = dt; t < JUMP_TIME + 0.1; t += dt) {
      p.update(dt, 0, 0, false, 0, []);
      expect(Math.abs(p.bob - jumpLift(t))).toBeLessThan(0.05);
    }
    expect(jumpLift(JUMP_TIME / 2)).toBeGreaterThan(0.9);
    expect(jumpLift(JUMP_TIME)).toBe(0);
  });
});
