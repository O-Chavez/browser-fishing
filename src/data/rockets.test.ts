import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import {
  COLOURS, HEAR, LAUNCH, PARTICLE_BUDGET, RACK_PROMPT, RACK_REACH, ROCKETS, ROCKET_STACK, STYLE, buyRocket, cleanRockets, emitShow, finaleLine, hearGain,
  particleAt, rackPrompt, rocketBuyError, rocketById, rocketCount, rocketKinds, rocketShow, showSounds, skyBusy, spendRocket, type Particle, type RocketId, type Show,
} from './rockets';
import { ROCKET_JETTY, groundHeight } from '../game/env';
import { migrate, newSave } from '../game/state';

const KINDS: RocketId[] = ['small', 'big', 'finale'];
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);
/** Every particle of a show, copied. */
const particles = (show: Show): Particle[] => {
  const out: Particle[] = [];
  emitShow(show, (p) => out.push({ ...p }));
  return out;
};

describe("Bram's rockets", () => {
  it('are three, at the prices Oscar set, small to big', () => {
    expect(ROCKETS.map((r) => [r.id, r.name, r.price])).toEqual([['small', 'Small Rocket', 250], ['big', 'Big Rocket', 2000], ['finale', 'Grand Finale', 50000]]);
    expect(ROCKETS.map((r) => r.seconds)).toEqual([2.5, 5, 12]);
    expect(rocketById('big')?.name).toBe('Big Rocket');
    expect(rocketById('huge')).toBeUndefined();
    expect(rocketById({ toString: null })).toBeUndefined();
  });

  it('are bought for coins into a stack in the bag, and not without the coins', () => {
    const s = { coins: 600, rockets: {} };
    expect(buyRocket(s, 'small')).toBe(true);
    expect(buyRocket(s, 'small')).toBe(true);
    expect(s).toEqual({ coins: 100, rockets: { small: 2 } });
    expect(rocketBuyError(s, 'small')).toMatch(/Not enough coins/);
    expect(buyRocket(s, 'small')).toBe(false);
    expect(buyRocket(s, 'finale')).toBe(false);
    expect(buyRocket(s, 'nope')).toBe(false);
    expect(s).toEqual({ coins: 100, rockets: { small: 2 } });
    expect(rocketKinds({ rockets: { finale: 1, small: 2 } })).toEqual(['small', 'finale']);
  });

  it('stop at a full stack', () => {
    const s = { coins: 1e6, rockets: { small: ROCKET_STACK - 1 } };
    expect(buyRocket(s, 'small')).toBe(true);
    expect(rocketBuyError(s, 'small')).toMatch(/full/);
    expect(buyRocket(s, 'small')).toBe(false);
    expect(s.rockets.small).toBe(ROCKET_STACK);
  });

  it('leave the bag one at a time, and the last takes its entry with it', () => {
    const s = { rockets: { big: 2 } as Record<string, number> };
    expect(spendRocket(s, 'small')).toBe(false);
    expect(spendRocket(s, 'big')).toBe(true);
    expect(rocketCount(s, 'big')).toBe(1);
    expect(spendRocket(s, 'big')).toBe(true);
    expect(s.rockets).toEqual({});
    expect(spendRocket(s, 'big')).toBe(false);
  });

  it('load from a save: none in one from before rockets, and only whole stacks of known kinds', () => {
    expect(cleanRockets(undefined)).toEqual({});
    expect(cleanRockets('lots')).toEqual({});
    expect(cleanRockets({ small: 3.7, big: -1, finale: 1e9, huge: 4, toString: 2 })).toEqual({ small: 3, finale: ROCKET_STACK });
    const old: Record<string, unknown> = { ...newSave(), coins: 777 };
    delete old.rockets;
    const loaded = migrate(old);
    expect(loaded.rockets).toEqual({});
    expect(loaded.coins).toBe(777);
    expect(migrate({ ...newSave(), rockets: { small: 2, big: 'x' } } as unknown as object).rockets).toEqual({ small: 2 });
    expect(newSave().rockets).toEqual({});
  });

  it('hold the sky for their own length', () => {
    const up = { kind: 'big' as const, at: 10_000 };
    expect(skyBusy(null, 0)).toBe(false);
    expect(skyBusy(up, 10_000)).toBe(true);
    expect(skyBusy(up, 14_999)).toBe(true);
    expect(skyBusy(up, 15_000)).toBe(false);
  });

  it('word the rack and the finale as written', () => {
    expect(RACK_PROMPT).toEqual({ light: 'Light a rocket', none: "Rockets at Bram's Kettle", busy: 'Wait for the sky' });
    expect(finaleLine('Oscar')).toBe('🎆 Oscar lit a Grand Finale!');
  });
});

describe("the rack's prompt", () => {
  const rack = MAPS[0].camp!.rack;
  const at = (rockets: object, busy = false, back = 1.5) => rackPrompt(rack, rack.x, rack.z + back, { rockets }, busy);

  it('offers to light a rocket with one in the bag, and says which kinds there are', () => {
    expect(at({ big: 1 })).toMatchObject({ state: 'light', label: 'Light a rocket', kinds: ['big'] });
    expect(at({ finale: 1, small: 2 })).toMatchObject({ state: 'light', kinds: ['small', 'finale'] });
  });

  it('tells where to get one with none', () => {
    expect(at({})).toMatchObject({ state: 'none', label: "Rockets at Bram's Kettle", kinds: [] });
  });

  it('says to wait while a rocket is up, whatever the bag holds', () => {
    expect(at({ big: 1 }, true)).toMatchObject({ state: 'busy', label: 'Wait for the sky' });
    expect(at({}, true)).toMatchObject({ state: 'busy', label: 'Wait for the sky' });
  });

  it('shows within reach only, to a player who looks toward the rack', () => {
    expect(at({ big: 1 }, false, RACK_REACH + 0.01)).toBeNull();
    expect(at({ big: 1 }, false, RACK_REACH - 0.01)).not.toBeNull();
    // Standing south of it (+z), the player looks along -z: yaw 0.
    expect(at({ big: 1 })!.face).toBeCloseTo(0);
    expect(rackPrompt(rack, rack.x + 1.5, rack.z, { rockets: {} }, false)!.face).toBeCloseTo(Math.PI / 2);
    // Nearer ranks higher among the prompts in reach.
    expect(at({}, false, 1)!.d).toBeLessThan(at({}, false, 2)!.d);
  });
});

describe('a rocket show', () => {
  it('is the same for the same kind and seed, and differs with the seed', () => {
    for (const kind of KINDS) {
      expect(rocketShow(kind, 4242)).toEqual(rocketShow(kind, 4242));
      expect(particles(rocketShow(kind, 4242))).toEqual(particles(rocketShow(kind, 4242)));
      expect(rocketShow(kind, 4243)).not.toEqual(rocketShow(kind, 4242));
    }
  });

  it('small: one round burst in one colour, done in 2.5 s', () => {
    for (const seed of SEEDS) {
      const s = rocketShow('small', seed);
      expect(s.seconds).toBe(2.5);
      expect(s.climbs).toHaveLength(1);
      expect(s.bursts).toHaveLength(1);
      expect(s.bursts[0]).toMatchObject({ style: 'round', crackle: false });
      expect(s.bursts[0].inner).toBeUndefined();
    }
  });

  it('big: a taller climb and three bursts in two colours, each with a crackle, done in 5 s', () => {
    for (const seed of SEEDS) {
      const s = rocketShow('big', seed);
      expect(s.seconds).toBe(5);
      expect(s.bursts).toHaveLength(3);
      expect(new Set(s.bursts.map((b) => b.colour)).size).toBe(2);
      expect(s.bursts.every((b) => b.crackle)).toBe(true);
      expect(s.bursts[0].y).toBeGreaterThan(rocketShow('small', seed).bursts[0].y + 8);
      // One rocket leaves the rack; the other two bursts are thrown from the first.
      expect(s.climbs.filter((c) => c.from[1] === LAUNCH.y)).toHaveLength(1);
    }
  });

  it('finale: 10 to 12 bursts of several colours over 12 s, ending in the biggest, a gold willow', () => {
    const counts = new Set<number>();
    for (const seed of SEEDS) {
      const s = rocketShow('finale', seed);
      expect(s.seconds).toBe(12);
      counts.add(s.bursts.length);
      const last = s.bursts.at(-1)!;
      expect(last).toMatchObject({ style: 'willow', colour: 'gold' });
      expect(Math.max(...s.bursts.map((b) => b.t))).toBe(last.t);
      expect(Math.max(...s.bursts.map((b) => b.r))).toBe(last.r);
      expect(s.bursts.slice(0, -1).every((b) => b.style !== 'willow')).toBe(true);
      expect(new Set(s.bursts.map((b) => b.colour)).size).toBeGreaterThanOrEqual(3);
      // No two bursts in a row share a colour.
      for (let i = 1; i < s.bursts.length - 1; i++) expect(s.bursts[i].colour).not.toBe(s.bursts[i - 1].colour);
    }
    expect([...counts].sort()).toEqual([10, 11, 12]);
  });

  it('leaves the rack on the jetty and bursts high over the open lake, clear of the shore and the pier, inside the map', () => {
    const map = MAPS[0];
    const rack = map.camp!.rack;
    expect(Math.hypot(LAUNCH.x - rack.x, LAUNCH.z - rack.z)).toBeLessThan(0.5);
    let bad = 0, n = 0;
    for (const kind of KINDS) {
      for (const seed of SEEDS) {
        const s = rocketShow(kind, seed);
        for (const b of s.bursts) {
          n++;
          const ok =
            // Water under it (the lake's bed is below the surface there), no nearer than 8 m to the jetty's end or the pier's.
            groundHeight(b.x, b.z) < -0.25 &&
            Math.hypot(b.x - rack.x, b.z - rack.z) > 8 && Math.hypot(b.x, b.z + 9) > 8 &&
            b.z < ROCKET_JETTY.z0 - 4 &&
            b.y - b.r * 0.6 > 8 &&
            Math.hypot(b.x, b.z) < map.radius &&
            b.t > 0 && b.t < s.seconds - 1;
          if (!ok) bad++;
        }
        // Each rocket has left the rack by the time its burst comes.
        if (s.climbs.some((c) => c.t < 0)) bad++;
      }
    }
    expect(n).toBeGreaterThan(4000);
    expect(bad).toBe(0);
  });

  it('uses colours that are drawn as they are', () => {
    for (const c of Object.values(COLOURS)) for (const v of c) expect(v >= 0 && v <= 1).toBe(true);
  });
});

describe("a show's particles", () => {
  it('never exceed the budget, with room to spare, whatever the seed', () => {
    let most = 0;
    for (const kind of KINDS) {
      for (const seed of SEEDS) most = Math.max(most, emitShow(rocketShow(kind, seed), () => {}));
    }
    // Strictly under: at the budget itself, particles would have been left out.
    expect(most).toBeLessThan(PARTICLE_BUDGET);
    expect(emitShow(rocketShow('small', 1), () => {})).toBeLessThan(260);
    expect(emitShow(rocketShow('big', 1), () => {})).toBeLessThan(1000);
  });

  it('stay under it for the fullest finale there could be: twelve bursts, every one of the volley a big double', () => {
    const s = rocketShow('finale', SEEDS.find((seed) => rocketShow('finale', seed).bursts.length === 12)!);
    for (const b of s.bursts.slice(0, -1)) Object.assign(b, { style: 'double', r: 16, inner: 'red' });
    for (const c of s.climbs) c.rise = Math.max(c.rise, 1.55);
    expect(emitShow(s, () => {})).toBeLessThan(PARTICLE_BUDGET);
  });

  it('stop at the budget even if a show asked for more', () => {
    const s = rocketShow('finale', 5);
    s.bursts.push(...Array.from({ length: 40 }, () => ({ ...s.bursts[0] })));
    expect(emitShow(s, () => {})).toBe(PARTICLE_BUDGET);
  });

  it('are born after the fuse and gone by the end of the show, so the sky is clear when the rack frees up', () => {
    let bad = 0, n = 0;
    const styles = Object.values(STYLE) as number[];
    for (const kind of KINDS) {
      for (const seed of SEEDS.slice(0, 60)) {
        const s = rocketShow(kind, seed);
        emitShow(s, (p) => {
          n++;
          const ok = p.t0 >= 0 && p.life > 0 && p.t0 + p.life <= s.seconds + 1e-9 && p.drag > 0 && styles.includes(p.style) &&
            [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.size, p.streak, p.r, p.g, p.b, p.seed].every(Number.isFinite);
          if (!ok) bad++;
        });
      }
    }
    expect(n).toBeGreaterThan(100_000);
    expect(bad).toBe(0);
  });

  it('follow one sum: a rocket leaves the rack and is at its burst as it bursts', () => {
    const at: [number, number, number] = [0, 0, 0];
    for (const kind of KINDS) {
      const s = rocketShow(kind, 99);
      const ps = particles(s);
      for (const c of s.climbs) {
        // The climb's head is the first particle born at its start with its length for a life.
        const head = ps.find((p) => p.t0 === c.t && p.life === Math.min(c.rise, s.seconds - c.t) && p.x === c.from[0] && p.y === c.from[1])!;
        expect(head).toBeDefined();
        expect(particleAt(head, 0, at)).toEqual([c.from[0], c.from[1], c.from[2]]);
        particleAt(head, c.rise, at);
        for (let i = 0; i < 3; i++) expect(at[i]).toBeCloseTo(c.to[i], 6);
      }
    }
  });

  it("keep a burst's stars about its radius from its middle, and the small rocket's burst one colour", () => {
    const s = rocketShow('small', 7);
    const b = s.bursts[0];
    const stars = particles(s).filter((p) => p.t0 === b.t && p.style === STYLE.spark);
    expect(stars.length).toBeGreaterThan(100);
    const at: [number, number, number] = [0, 0, 0];
    const reach = stars.map((p) => { particleAt(p, 1.1, at); return Math.hypot(at[0] - b.x, at[1] - b.y + 1.3, at[2] - b.z); });
    expect(Math.max(...reach)).toBeLessThan(b.r * 1.05);
    expect(Math.max(...reach)).toBeGreaterThan(b.r * 0.8);
    expect(new Set(stars.map((p) => `${p.r},${p.g},${p.b}`)).size).toBe(1);
  });
});

describe("a show's sounds", () => {
  it('are a whoosh for each rocket off the rack and a boom for each burst, with a crackle for the big one', () => {
    const count = (s: Show, kind: string) => showSounds(s).filter((x) => x.kind === kind).length;
    const small = rocketShow('small', 3), big = rocketShow('big', 3), finale = rocketShow('finale', 3);
    expect([count(small, 'whoosh'), count(small, 'boom'), count(small, 'crackle')]).toEqual([1, 1, 0]);
    expect([count(big, 'whoosh'), count(big, 'boom'), count(big, 'crackle')]).toEqual([1, 3, 3]);
    expect(count(finale, 'whoosh')).toBe(finale.bursts.length);
    expect(count(finale, 'boom')).toBe(finale.bursts.length);
    const times = showSounds(finale).map((x) => x.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // The willow's boom is the biggest.
    const booms = showSounds(finale).filter((x) => x.kind === 'boom');
    expect(Math.max(...booms.map((x) => x.size))).toBe(booms.at(-1)!.size);
  });

  it('are quieter with distance', () => {
    expect(hearGain(0)).toBe(1);
    expect(hearGain(HEAR.half)).toBeCloseTo(0.5);
    for (let d = 0; d < 200; d += 10) expect(hearGain(d + 10)).toBeLessThan(hearGain(d));
    expect(hearGain(150)).toBeGreaterThan(0.05);
  });
});
