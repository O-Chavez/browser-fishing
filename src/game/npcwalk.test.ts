import { describe, expect, it } from 'vitest';
import { MAPS, type NpcDef, type NpcWalk } from '../data/maps';
import { isWater, setPad } from './env';
import {
  NPC_CLEARANCE,
  NPC_FISH_LINGER,
  NPC_GIVE_WAY,
  NPC_PATIENCE,
  NPC_RESUME_DELAY,
  NPC_STOP_RANGE,
  NpcWalker,
  type Bystander,
} from './npcwalk';

const DT = 1 / 60;
const FAR = 1e4;
const def = (walk: NpcWalk): NpcDef & { walk: NpcWalk } => ({ name: 'Test', lines: [], coat: 0, x: 0, z: 0, facing: 0, walk });
const away: Bystander = { x: FAR, z: FAR, fishing: false };
const at = (x: number, z: number, fishing = false): Bystander => ({ x, z, fishing });
const run = (w: NpcWalker, secs: number, px = FAR, pz = FAR, others: Bystander[] = []): void => {
  for (let t = 0; t < secs; t += DT) w.update(DT, at(px, pz), others);
};
/** Runs `secs` and returns the closest they came to any of the players. */
const closest = (w: NpcWalker, secs: number, you: Bystander, others: Bystander[] = []): number => {
  let min = Infinity;
  for (let t = 0; t < secs; t += DT) {
    w.update(DT, you, others);
    for (const p of [you, ...others]) min = Math.min(min, Math.hypot(p.x - w.x, p.z - w.z));
  }
  return min;
};
const angle = (a: number): number => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));

describe('NpcWalker', () => {
  it('waits at home, walks every stop in order, and comes back', () => {
    const w = new NpcWalker(def({ speed: 2, wait: 1, stops: [{ x: 4, z: 0 }, { x: 4, z: 4, wait: 2 }] }));
    run(w, 0.9);
    expect([w.x, w.z]).toEqual([0, 0]);
    // Where they stood still for half a second or more, in order.
    const stays: string[] = [];
    let still = 0;
    for (let t = 0; t < 12; t += DT) {
      const x0 = w.x;
      const z0 = w.z;
      w.update(DT, away);
      still = w.x === x0 && w.z === z0 ? still + DT : 0;
      const at = `${w.x},${w.z}`;
      if (still > 0.5 && stays.at(-1) !== at) stays.push(at);
    }
    expect(stays).toEqual(['4,4', '0,0']);
  });

  it('pauses facing the way a stop says, and never walks sideways', () => {
    const w = new NpcWalker(def({ speed: 1, wait: 0, stops: [{ x: 0, z: 3, wait: 5, face: Math.PI / 2 }] }));
    for (let t = 0; t < 4; t += DT) {
      const x0 = w.x;
      const z0 = w.z;
      w.update(DT, away);
      if (w.x !== x0 || w.z !== z0) expect(angle(Math.atan2(w.x - x0, w.z - z0) - w.yaw)).toBeLessThan(0.9);
    }
    expect(w.z).toBeCloseTo(3);
    run(w, 1);
    expect(w.yaw).toBeCloseTo(Math.PI / 2);
    expect(w.z).toBeCloseTo(3);
  });

  it('stops for a nearby player, turns to them, and carries on after they leave', () => {
    const w = new NpcWalker(def({ speed: 1, wait: 0, stops: [{ x: 0, z: 10 }] }));
    run(w, 2);
    const z = w.z;
    run(w, 3, 3, z);
    expect(w.z).toBeCloseTo(z, 1);
    expect(w.yaw).toBeCloseTo(Math.PI / 2);
    expect(w.moving).toBeLessThan(0.01);
    run(w, NPC_RESUME_DELAY - 0.2);
    expect(w.z).toBeCloseTo(z, 1);
    run(w, 1.5);
    expect(w.z).toBeGreaterThan(z + 0.3);
  });

  it('walks on after a while beside someone who stays put, unless they talk', () => {
    const w = new NpcWalker(def({ speed: 1, wait: 0, stops: [{ x: 0, z: 10 }] }));
    run(w, 1);
    const z = w.z;
    run(w, NPC_PATIENCE - 1, 2, z);
    w.listen();
    run(w, NPC_PATIENCE - 1, 2, z);
    expect(w.z).toBeCloseTo(z, 1);
    run(w, NPC_RESUME_DELAY + 3, 2, z);
    expect(w.z).toBeGreaterThan(z + 1);
  });

  // A pier-like walk: out to the end, a long pause, and back.
  const pier = (): NpcWalker =>
    new NpcWalker(def({ speed: 1, wait: 1, stops: [{ x: 0, z: 8 }, { x: 0, z: 16, wait: 4, face: 0 }, { x: 0, z: 8 }] }));

  it('never walks within the clearance of someone standing still', () => {
    const spots = [at(0, 5), at(1, 9), at(-1.2, 12), at(0, 16), at(0.5, 8)];
    for (const p of spots) {
      expect(closest(pier(), 90, p), `you at ${p.x}, ${p.z}`).toBeGreaterThan(NPC_CLEARANCE);
      expect(closest(pier(), 90, away, [p]), `someone at ${p.x}, ${p.z}`).toBeGreaterThan(NPC_CLEARANCE);
    }
    // Two people at once, one each side of the walk.
    expect(closest(pier(), 90, at(1, 6), [at(-1, 12)])).toBeGreaterThan(NPC_CLEARANCE);
  });

  it('still stops to chat with you first when you stand in the way', () => {
    const w = pier();
    run(w, 30, 0, 6);
    expect(6 - w.z).toBeGreaterThanOrEqual(NPC_STOP_RANGE - 0.05);
    expect(w.yaw).toBeCloseTo(0);
  });

  it('waits, then turns back along the walk instead of walking through someone', () => {
    const w = pier();
    const other = [at(0, 6)];
    // A second's pause at home, then 2.5 m before the next 2 m ahead come within reach of them.
    run(w, 3.6, FAR, FAR, other);
    const z = w.z;
    expect(z).toBeCloseTo(2.5, 1);
    run(w, NPC_GIVE_WAY - 0.3, FAR, FAR, other);
    expect(w.z).toBeCloseTo(z, 5);
    expect(w.moving).toBeLessThan(0.01);
    run(w, 2, FAR, FAR, other);
    expect(w.z).toBeLessThan(z - 0.5);
    // Back home, they try again later and give way again rather than pushing past.
    expect(closest(w, 60, away, other)).toBeGreaterThan(NPC_CLEARANCE);
    // Once the way is clear they carry on to the end of the walk.
    run(w, 30);
    let far = 0;
    for (let t = 0; t < 40; t += DT) {
      w.update(DT, away);
      far = Math.max(far, w.z);
    }
    expect(far).toBeCloseTo(16);
  });

  it('walks on past someone who is close but not in the way, and only stops to chat with you', () => {
    const w = pier();
    expect(closest(w, 20, away, [at(1.8, 5)])).toBeLessThan(2);
    expect(w.z).toBeGreaterThan(8);
  });

  it('stays put while someone nearby is fishing, and carries on after', () => {
    for (const mine of [true, false]) {
      const w = new NpcWalker(def({ speed: 1, wait: 0, stops: [{ x: 0, z: 10 }] }));
      run(w, 1);
      const z = w.z;
      const fisher = at(2, z + 1, true);
      const step = (secs: number): void => {
        for (let t = 0; t < secs; t += DT) w.update(DT, mine ? fisher : away, mine ? [] : [fisher]);
      };
      step(60);
      expect(w.z, mine ? 'you' : 'someone else').toBeCloseTo(z, 5);
      fisher.fishing = false;
      if (mine) fisher.x = FAR;
      step(NPC_FISH_LINGER - 0.2);
      expect(w.z).toBeCloseTo(z, 5);
      step(2);
      expect(w.z).toBeGreaterThan(z + 0.3);
    }
  });

  it("doesn't dither when boxed in or when someone stands in a narrow spot", () => {
    // Someone ahead and someone behind: they stand still, facing one way.
    const w = new NpcWalker(def({ speed: 1, wait: 0, stops: [{ x: 0, z: 10 }] }));
    run(w, 5);
    const z = w.z;
    const box = [at(0, z + 2), at(0, z - 2)];
    run(w, 3, FAR, FAR, box);
    const yaw = w.yaw;
    let turned = 0;
    for (let t = 0; t < 30; t += DT) {
      const y0 = w.yaw;
      w.update(DT, away, box);
      turned += angle(w.yaw - y0);
    }
    expect(w.z).toBeCloseTo(z, 5);
    expect(w.yaw).toBeCloseTo(yaw, 5);
    expect(turned).toBeLessThan(1e-6);

    // Someone in the middle of a short pacing walk: every about-turn comes after a proper pause.
    const pacer = new NpcWalker(def({ speed: 1, wait: 2, stops: [{ x: 8, z: 0, wait: 2 }] }));
    const mid = [at(5, 0.5)];
    let dir = 0;
    let still = 0;
    let flips = 0;
    for (let t = 0; t < 120; t += DT) {
      const x0 = pacer.x;
      pacer.update(DT, away, mid);
      const dx = pacer.x - x0;
      if (dx === 0) still += DT;
      else {
        if (dir && Math.sign(dx) !== dir) {
          flips++;
          expect(still).toBeGreaterThan(0.5);
        }
        dir = Math.sign(dx);
        still = 0;
      }
      expect(Math.hypot(5 - pacer.x, 0.5 - pacer.z)).toBeGreaterThan(NPC_CLEARANCE);
    }
    expect(flips).toBeGreaterThan(4);
    expect(flips).toBeLessThan(40);
  });
});

describe('NPC walks', () => {
  for (const map of MAPS) {
    for (const npc of map.town.npcs) {
      if (!npc.walk) continue;
      it(`${map.id}: ${npc.name} stays on dry land or the dock`, () => {
        setPad(map.pad);
        const pts = [{ x: npc.x, z: npc.z }, ...npc.walk!.stops, { x: npc.x, z: npc.z }];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
          for (let k = 0; k <= n; k++) {
            const x = a.x + ((b.x - a.x) * k) / n;
            const z = a.z + ((b.z - a.z) * k) / n;
            expect(isWater(x, z), `${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(false);
          }
        }
      });
    }
  }

  it('stop range matches the talk prompt reach', () => {
    // game.ts shows "Talk to" when (distance - 0.5) < 3.
    expect(NPC_STOP_RANGE).toBe(3.5);
  });
});
