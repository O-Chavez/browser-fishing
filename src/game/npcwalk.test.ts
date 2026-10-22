import { describe, expect, it } from 'vitest';
import { MAPS, type NpcDef, type NpcWalk } from '../data/maps';
import { isWater, setPad } from './env';
import { NPC_PATIENCE, NPC_RESUME_DELAY, NPC_STOP_RANGE, NpcWalker } from './npcwalk';

const DT = 1 / 60;
const FAR = 1e4;
const def = (walk: NpcWalk): NpcDef & { walk: NpcWalk } => ({ name: 'Test', lines: [], coat: 0, x: 0, z: 0, facing: 0, walk });
const run = (w: NpcWalker, secs: number, px = FAR, pz = FAR): void => {
  for (let t = 0; t < secs; t += DT) w.update(DT, px, pz);
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
      w.update(DT, FAR, FAR);
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
      w.update(DT, FAR, FAR);
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
