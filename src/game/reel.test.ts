import { describe, expect, it } from 'vitest';
import { mulberry } from './env';
import { Reel, type ReelStatus } from './reel';

type Policy = (r: Reel) => boolean;

function fight(difficulty: number, control: number, seed: number, policy: Policy): ReelStatus {
  const r = new Reel(difficulty, control, mulberry(seed));
  for (let i = 0; i < 60 * 180 && r.status === 'reeling'; i++) r.update(1 / 60, policy(r));
  return r.status;
}

// A human reacts late: they see tension, then take ~0.15s to change their input.
function laggy(threshold: number, lag = 0.15): Policy {
  let held = true;
  let pending: boolean | null = null;
  let t = 0;
  return (r) => {
    const want = r.tension < threshold;
    if (want !== held && pending !== want) { pending = want; t = 0; }
    if (pending !== null) { t += 1 / 60; if (t >= lag) { held = pending; pending = null; } }
    return held;
  };
}

const skilled: Policy = (r) => r.tension < 0.7;
const mashing: Policy = () => true;
const idle: Policy = () => false;

const winRate = (d: number, c: number, p: Policy) => {
  let w = 0;
  for (let s = 1; s <= 30; s++) if (fight(d, c, s, p) === 'caught') w++;
  return w / 30;
};

describe('tension reel fight', () => {
  it('a skilled player lands easy, mid and legendary fish', () => {
    expect(winRate(0.6, 1, skilled)).toBeGreaterThan(0.9);
    expect(winRate(1.3, 1.2, skilled)).toBeGreaterThan(0.9);
    expect(winRate(2.2, 1.5, skilled)).toBeGreaterThan(0.9);
  });

  it('holding down the button loses hard fish', () => {
    expect(winRate(2.2, 1, mashing)).toBeLessThan(0.3);
  });

  it('a laggy but attentive player still wins mid fish', () => {
    expect(winRate(1.3, 1, laggy(0.7))).toBeGreaterThan(0.5);
  });

  it('never reeling lets the fish escape', () => {
    expect(fight(1, 1, 5, idle)).toBe('escaped');
  });
});
