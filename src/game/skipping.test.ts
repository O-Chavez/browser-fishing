import * as THREE from 'three';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLook } from '../data/cosmetics';
import { EMOTES, SKIP_THROW, WHEEL_ORDER, emoteById } from '../data/emotes';
import { MAPS, campSeats } from '../data/maps';
import { SKIP, skipDir, skipPath, skipSignText } from '../data/skip';
import type { Writable } from './camp';
import { EMOTE_LOOKS } from './emotes/looks';
import { SKIP_HAND, SKIP_LET_GO, SKIP_SECONDS, skipThrow } from './emotes/looks/skip';
import { restPose } from './emotes/types';
import { ROCKET_JETTY, groundHeight, isWater, setAprons, setLevels, setPad } from './env';
import { Skipping, type SkipHost, type SkipView } from './skipping';

/** An element that keeps its classes and text, which is all the counter needs. */
function fakeElement() {
  const classes = new Set<string>();
  return {
    id: '',
    textContent: '',
    style: {} as Record<string, string>,
    offsetWidth: 0,
    get className() { return [...classes].join(' '); },
    set className(v: string) { classes.clear(); v.split(' ').filter(Boolean).forEach((c) => classes.add(c)); },
    classList: {
      add: (c: string) => void classes.add(c),
      remove: (c: string) => void classes.delete(c),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)),
    },
  };
}
/** A canvas that draws nothing: enough to build the throw's hand, whose glow texture is drawn on one. */
const ctx2d: unknown = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
vi.stubGlobal('document', { createElement: (tag: string) => (tag === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : fakeElement()) });
afterAll(() => {
  vi.unstubAllGlobals();
});

const map = MAPS[0];
setPad(map.pad);
setAprons(map.aprons ?? []);
setLevels(map.levels ?? []);
const camp = map.camp!;
const PILE = camp.stones;
const FACE_CONE = Math.PI / 3;
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** The yaw that looks from a spot at another. */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
const AIM = Math.atan2(-skipDir(0)[0], -skipDir(0)[1]);

/** A skip sign that counts how often its face is lettered, and with what. */
function fakeSign() {
  const lines: string[] = [];
  const ctx = new Proxy({ canvas: { width: 384, height: 240 } } as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : k === 'fillText' ? (text: string) => void lines.push(text) : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { sign: { group: new THREE.Group(), solids: [], ctx, tex: { needsUpdate: false } } as unknown as Writable, lines };
}

function setup(opts: { online?: boolean; me?: { id?: number; x: number; z: number } } = {}) {
  const scene = new THREE.Scene();
  const view: SkipView = { yaw: 0, pitch: -0.5, fovKick: 0, pitchKick: 0 };
  const me = { id: 1, name: 'Ann', x: PILE.x - 1, z: PILE.z, ...opts.me };
  const sent: number[] = [];
  const log: string[] = [];
  const { sign, lines } = fakeSign();
  const hud = { els: [] as ReturnType<typeof fakeElement>[], append(el: ReturnType<typeof fakeElement>) { this.els.push(el); } };
  const host: SkipHost = {
    surface: () => 0,
    splash: (_p, n) => void log.push(`splash ${n}`),
    warm: (o) => void log.push(`warm ${o.children.length}`),
    sign: () => sign,
    me: () => me,
    send: (p) => (opts.online === false ? false : (sent.push(p), true)),
    pose: (id) => void log.push(`pose ${id}`),
    whoosh: () => void log.push('whoosh'),
    plip: (gain, pitch) => void log.push(`plip ${gain.toFixed(2)} ${pitch.toFixed(2)}`),
    plop: () => void log.push('plop'),
    toast: (msg) => void log.push(`toast ${msg}`),
  };
  const sk = new Skipping(scene, view, host, hud as unknown as HTMLElement);
  sk.setMap(map);
  const counter = hud.els[0];
  /** Runs `secs` of game time in 60 Hz frames. */
  const run = (secs: number, ok = true) => {
    for (let t = 0; t < secs - 1e-9; t += 1 / 60) sk.update(1 / 60, ok);
  };
  return { sk, scene, view, me, sent, log, lines, counter, run };
}

describe('the throw others see', () => {
  it('is no emote of the wheel and none a client can ask for, and lasts as long as its look', () => {
    expect(emoteById('skip')).toBeUndefined();
    expect(EMOTES).not.toContain(SKIP_THROW);
    expect(WHEEL_ORDER).not.toContain('skip');
    expect(EMOTE_LOOKS[SKIP_THROW.id]).toBe(skipThrow);
    expect(SKIP_THROW.seconds).toBe(SKIP_SECONDS);
    expect(SKIP_LET_GO).toBeLessThan(SKIP_SECONDS / 2);
  });

  it('starts and ends at rest with the hand away, winds back and comes through, and lets the stone go as its flight starts', () => {
    for (const dark of [0, 1]) {
      const play = skipThrow({ look: defaultLook(), top: 1.82, reach: 0.28, dark, local: false });
      const at = (t: number) => {
        const pose = restPose();
        play.update(t, 1 / 60, pose);
        return pose;
      };
      const hand = play.group.children[0].children[0];
      const stone = hand.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.CylinderGeometry)!;
      for (const t of [0, SKIP_SECONDS - 1e-3]) {
        for (const [k, v] of Object.entries(restPose())) expect(at(t)[k as keyof ReturnType<typeof restPose>], `${k} at ${t}`).toBeCloseTo(v, 2);
        expect(hand.scale.x).toBeLessThan(0.05);
      }
      // Wound back: turned to the right, the hand behind the body.
      expect(at(0.18).yaw).toBeLessThan(-0.3);
      expect(hand.position.z).toBeLessThan(-0.2);
      expect(stone.visible).toBe(true);
      // Through: turned the other way and leaning in, the hand out in front on the right, where the stone's flight starts.
      const through = at(0.36);
      expect(through.yaw).toBeGreaterThan(0.25);
      expect(through.pitch).toBeGreaterThan(0.1);
      expect(hand.position.z).toBeCloseTo(SKIP_HAND.front, 1);
      expect(hand.position.x).toBeLessThan(-0.3);
      expect(stone.visible).toBe(false);
      for (let t = 0; t < SKIP_SECONDS; t += 1 / 30) expect(Object.values(at(t)).every(Number.isFinite)).toBe(true);
      play.dispose();
    }
  });
});

describe('the stone pile prompt', () => {
  it('is offered within reach to a player who looks at the pile, or out over the lake the way the stones fly', () => {
    const { sk } = setup();
    for (let deg = 0; deg < 360; deg += 15) {
      for (const d of [0.7, 1, SKIP.reach - 0.05]) {
        const x = PILE.x + d * Math.sin((deg * Math.PI) / 180);
        const z = PILE.z + d * Math.cos((deg * Math.PI) / 180);
        expect(sk.offered(x, z, yawTo(x, z, PILE.x, PILE.z), FACE_CONE), `${deg}° ${d} m, at the pile`).toBeCloseTo(d, 5);
        expect(sk.offered(x, z, AIM, FACE_CONE), `${deg}° ${d} m, at the lake`).toBeCloseTo(d, 5);
        // With the back to both: not offered. (From the lake's side of the pile the two ways are opposite, so one of them always is.)
        const away = yawTo(x, z, PILE.x, PILE.z) + Math.PI;
        if (turn(away, AIM) > FACE_CONE) expect(sk.offered(x, z, away, FACE_CONE), `${deg}° ${d} m, away`).toBeNull();
      }
      const x = PILE.x + (SKIP.reach + 0.1) * Math.sin((deg * Math.PI) / 180);
      const z = PILE.z + (SKIP.reach + 0.1) * Math.cos((deg * Math.PI) / 180);
      expect(sk.offered(x, z, yawTo(x, z, PILE.x, PILE.z), FACE_CONE)).toBeNull();
    }
  });

  it('is not offered to someone reading the sign, and leaves every seat its own prompt', () => {
    const { sk } = setup();
    const sign = camp.skipSign;
    // In front of the sign's face, looking at it, from right up against it to as far as it reads.
    for (const d of [0.6, 0.9, 1.2, 1.6, 2.2]) {
      for (const side of [-0.5, 0, 0.5]) {
        const x = sign.x + d * Math.sin(sign.facing) + side * Math.cos(sign.facing);
        const z = sign.z + d * Math.cos(sign.facing) - side * Math.sin(sign.facing);
        expect(sk.offered(x, z, yawTo(x, z, sign.x, sign.z), FACE_CONE), `${d} m, ${side} m aside`).toBeNull();
      }
    }
    // Seats are offered within 1.5 m (`SEAT_RANGE`, game.ts): nowhere is one in reach together with the pile.
    const bench = map.town.benches.map((b) => ({ x: b.x, z: b.z }));
    for (const s of [...campSeats(map), ...bench]) expect(Math.hypot(s.x - PILE.x, s.z - PILE.z), `${s.x}, ${s.z}`).toBeGreaterThan(SKIP.reach + 1.5);
    // Nor a bottle, the fire or a board.
    for (const p of [...map.town.bottles, map.campfire, map.leaderboard, map.seaboard!, camp.rack]) expect(Math.hypot(p.x - PILE.x, p.z - PILE.z)).toBeGreaterThan(3 + SKIP.reach);
  });

  it('is withheld on a map with no pile, while winding up and while the player\'s own stone is in the air', () => {
    const { sk, run } = setup();
    const at = [PILE.x - 1, PILE.z] as const;
    const face = yawTo(...at, PILE.x, PILE.z);
    expect(sk.offered(...at, face, FACE_CONE)).not.toBeNull();
    sk.begin();
    expect(sk.offered(...at, face, FACE_CONE)).toBeNull();
    sk.cancel();
    expect(sk.offered(...at, face, FACE_CONE)).not.toBeNull();
    sk.thrown(1, 3, 0, { x: at[0], z: at[1] });
    expect(sk.offered(...at, face, FACE_CONE)).toBeNull();
    // Someone else's stone doesn't hold it back.
    run(10);
    sk.thrown(2, 3, 0, { x: at[0], z: at[1] });
    expect(sk.offered(...at, face, FACE_CONE)).not.toBeNull();
    sk.setMap(MAPS.find((m) => !m.camp)!);
    expect(sk.offered(...at, face, FACE_CONE)).toBeNull();
    sk.begin();
    expect(sk.charging).toBe(false);
  });
});

describe('the wind-up', () => {
  it('sweeps the gauge up and down at the cast\'s speed and turns the view to the lake', () => {
    const { sk, view, run } = setup();
    view.yaw = AIM + 2;
    sk.begin();
    expect(sk.gauge).toBe(0);
    run(0.5);
    expect(sk.power).toBeCloseTo(0.5 * SKIP.sweep, 2);
    expect(Math.abs(Math.atan2(Math.sin(view.yaw - AIM), Math.cos(view.yaw - AIM)))).toBeLessThan(0.05);
    expect(view.pitch).toBeCloseTo(-0.1, 1);
    run(1 / SKIP.sweep - 0.5);
    expect(sk.power).toBeCloseTo(1, 1);
    run(0.5);
    expect(sk.power).toBeCloseTo(1 - 0.5 * SKIP.sweep, 1);
    run(1 / SKIP.sweep);
    expect(sk.power).toBeGreaterThan(0.4);
    // After its first moments the view is the player's again.
    view.yaw = AIM + 1;
    run(0.2);
    expect(view.yaw).toBe(AIM + 1);
  });

  it('sends the release to the server from where the gauge stood, and waits for its word', () => {
    const { sk, sent, log, view, run } = setup();
    sk.begin();
    run(SKIP.sweet / SKIP.sweep);
    sk.release();
    expect(sk.charging).toBe(false);
    expect(sk.gauge).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeCloseTo(SKIP.sweet, 1);
    // No stone, swish or kick until the server says how it went (a refused release plays nothing); no second wind-up meanwhile.
    expect(log).not.toContain('whoosh');
    expect(view.fovKick).toBe(0);
    expect(sk.state().stones).toHaveLength(0);
    expect(sk.busy).toBe(true);
    sk.begin();
    expect(sk.charging).toBe(false);
    sk.thrown(1, 9, 0.01, { x: PILE.x - 1, z: PILE.z });
    expect(log).toContain('whoosh');
    expect(view.fovKick).toBeGreaterThan(0);
    expect(sk.state().stones).toEqual([expect.objectContaining({ id: 1, own: true, n: 9 })]);
    // Someone else's stone neither swishes nor kicks here.
    view.fovKick = 0;
    sk.thrown(2, 9, 0.01, { x: PILE.x - 1, z: PILE.z });
    expect(log.filter((l) => l === 'whoosh')).toHaveLength(1);
    expect(view.fovKick).toBe(0);
  });

  it('takes a hold too short to mean it as a slip, and drops the wind-up when the player can no longer be winding', () => {
    const { sk, sent, log, run } = setup();
    sk.begin();
    run(0.1);
    sk.release();
    expect(sent).toHaveLength(0);
    expect(log.some((l) => l.startsWith('toast Hold'))).toBe(true);
    expect(sk.busy).toBe(false);
    sk.begin();
    run(0.3);
    run(0.1, false);
    expect(sk.charging).toBe(false);
    sk.release();
    expect(sent).toHaveLength(0);
  });

  it('offline counts the skips itself and keeps this visit\'s best on the sign', () => {
    const { sk, lines, run, counter } = setup({ online: false });
    sk.begin();
    run(SKIP.sweet / SKIP.sweep);
    sk.power = SKIP.sweet;
    sk.release();
    const [stone] = sk.state().stones;
    expect(stone.own).toBe(true);
    expect(stone.n).toBeGreaterThanOrEqual(11);
    run(8);
    expect(sk.state().best).toEqual({ n: stone.n, name: 'Ann' });
    expect(lines.at(-1)).toBe(skipSignText({ n: stone.n, name: 'Ann' }));
    expect(counter.classList.contains('hidden')).toBe(true);
  });
});

describe('a stone in the air', () => {
  it('touches down on open water every time: any count, either edge of the spread, wherever by the pile it was thrown from', () => {
    for (let n = 0; n <= SKIP.max; n++) {
      const path = skipPath(n);
      for (const a of [-1, -0.5, 0, 0.5, 1].map((k) => (k * SKIP.spread * Math.PI) / 180)) {
        const [dx, dz] = skipDir(a);
        for (const d of path.d) {
          const [x, z] = [PILE.x + dx * d, PILE.z + dz * d];
          expect(isWater(x, z), `n ${n}, stray ${a.toFixed(3)}, ${d.toFixed(1)} m`).toBe(true);
          // Clear of the jetty's planks, and in water deep enough to sink in.
          const j = ROCKET_JETTY;
          expect(Math.hypot(Math.max(j.x0 - x, 0, x - j.x1), Math.max(j.z0 - z, 0, z - j.z1)), `jetty, n ${n}`).toBeGreaterThan(0.6);
          expect(groundHeight(x, z)).toBeLessThan(-0.3);
        }
      }
    }
  });

  it("flies out past the corner of the beach's wall without crossing it or the jetty, over the sand and then the water", () => {
    const wall = camp.beachWall[1];
    /** True when the step from p to q crosses the stretch from a to b, seen from above. */
    const crosses = (p: number[], q: number[], a: number[], b: number[]) => {
      const side = (u: number[], v: number[], w: number[]) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
      return side(p, q, a) !== side(p, q, b) && side(a, b, p) !== side(a, b, q);
    };
    const j = ROCKET_JETTY;
    // Throwers all round the pile, as far off as the prompt reaches, on the sand inside the beach's wall (x 25.55).
    for (let deg = 0; deg < 360; deg += 30) {
      const me = { x: PILE.x + SKIP.reach * Math.sin((deg * Math.PI) / 180), z: PILE.z + SKIP.reach * Math.cos((deg * Math.PI) / 180) };
      if (me.x > 25.55 - 0.35) continue;
      for (const [n, a] of [[0, -1], [0, 1], [5, 1], [12, -1], [12, 1]] as const) {
        const { sk, scene } = setup({ me });
        sk.thrown(1, n, (a * SKIP.spread * Math.PI) / 180, me);
        const stone = scene.children[0].children[0];
        let was: number[] | null = null;
        for (let t = 0; t < skipPath(n).t[0] - 0.02; t += 1 / 120) {
          sk.update(1 / 120, true);
          const p = stone.position;
          const where = `${deg}° n ${n} stray ${a} at ${t.toFixed(2)} s`;
          // Over the ground all the way, never across the wall's line, and wide of the jetty.
          expect(p.y, where).toBeGreaterThan(Math.max(0, groundHeight(p.x, p.z)) + 0.02);
          if (was) for (let i = 0; i + 1 < wall.length; i++) expect(crosses(was, [p.x, p.z], wall[i], wall[i + 1]), where).toBe(false);
          expect(Math.hypot(Math.max(j.x0 - p.x, 0, p.x - j.x1), Math.max(j.z0 - p.z, 0, p.z - j.z1)), where).toBeGreaterThan(0.4);
          was = [p.x, p.z];
        }
        expect(was![1]).toBeLessThan(PILE.z - 5);
      }
    }
    // The line itself passes every bend of the wall and the jetty's corner with 0.7 m or more to spare, at either edge of the spread.
    for (const k of [-1, 1]) {
      const [dx, dz] = skipDir((k * SKIP.spread * Math.PI) / 180);
      const off = (x: number, z: number) => Math.abs((x - PILE.x) * dz - (z - PILE.z) * dx);
      for (const [x, z] of wall) expect(off(x, z), `${x}, ${z}`).toBeGreaterThan(0.7);
      expect(off(j.x1, j.z0)).toBeGreaterThan(0.7);
    }
  });

  it('skips its count: a ring, a few drops and a plip at each touch, the count ticking up for its thrower, then the plop and the final count', () => {
    const { sk, log, counter, run } = setup();
    sk.thrown(1, 4, 0, { x: PILE.x - 1, z: PILE.z });
    const path = skipPath(4);
    const read: string[] = [];
    for (let t = 0; t < path.t[4] + 0.1; t += 1 / 60) {
      sk.update(1 / 60, true);
      if (!counter.classList.contains('hidden') && read.at(-1) !== counter.textContent) read.push(counter.textContent);
    }
    expect(read).toEqual(['1', '2', '3', '4', '4 skips']);
    expect(counter.classList.contains('final')).toBe(true);
    expect(log.filter((l) => l.startsWith('plip'))).toHaveLength(4);
    expect(log.filter((l) => l === 'plop')).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('splash'))).toHaveLength(5);
    // Each plip a little higher than the last, and fainter as the stone gets further off.
    const plips = log.filter((l) => l.startsWith('plip')).map((l) => l.split(' ').slice(1).map(Number));
    for (let i = 1; i < plips.length; i++) {
      expect(plips[i][1]).toBeGreaterThan(plips[i - 1][1]);
      expect(plips[i][0]).toBeLessThan(plips[i - 1][0]);
    }
    expect(sk.state().stones[0]).toMatchObject({ skips: 4, sunk: true });
    // It sinks and is put away; the count stays a moment, then goes.
    run(SKIP.sink + 0.1);
    expect(sk.state().stones).toHaveLength(0);
    expect(counter.classList.contains('hidden')).toBe(false);
    run(3);
    expect(counter.classList.contains('hidden')).toBe(true);
    expect(sk.state().rings).toBe(0);
  });

  it('reads Plop! for a stone that never skipped', () => {
    const { sk, log, counter, run } = setup();
    sk.thrown(1, 0, 0, { x: PILE.x - 1, z: PILE.z });
    run(skipPath(0).t[0] + 0.05);
    expect(counter.textContent).toBe('Plop!');
    expect(log.filter((l) => l.startsWith('plip'))).toHaveLength(0);
    expect(log).toContain('plop');
  });

  it("plays another player's throw on their avatar, lets the stone go as the arm comes through, and shows them no counter", () => {
    const { sk, log, counter, scene, run } = setup();
    const at = { x: PILE.x - 0.5, z: PILE.z + 1 };
    sk.thrown(2, 6, 0, at);
    expect(log).toContain('pose 2');
    const stone = scene.children[0].children[0];
    run(SKIP_LET_GO - 0.05);
    expect(stone.visible).toBe(false);
    run(0.1);
    expect(stone.visible).toBe(true);
    // From the thrower's right hand, as they face down the throw's line.
    const [dx, dz] = skipDir(0);
    expect(Math.hypot(stone.position.x - (at.x - dz * SKIP_HAND.side + dx * SKIP_HAND.front), stone.position.z - (at.z + dx * SKIP_HAND.side + dz * SKIP_HAND.front))).toBeLessThan(1.2);
    expect(stone.position.y).toBeGreaterThan(1);
    run(8);
    expect(counter.classList.contains('hidden')).toBe(true);
    expect(sk.state().stones).toHaveLength(0);
  });

  it('flies the same stone on every screen: the same place at the same moment from the same word', () => {
    const a = setup();
    const b = setup({ me: { id: 2, x: 10, z: 10 } });
    const at = { x: PILE.x - 1.2, z: PILE.z + 0.4 };
    a.sk.thrown(1, 7, 0.02, at);
    b.sk.thrown(1, 7, 0.02, at);
    // The watcher's copy starts as the arm comes through.
    b.run(SKIP_LET_GO);
    for (let i = 0; i < 200; i++) {
      a.sk.update(1 / 60, true);
      b.sk.update(1 / 60, true);
      const [p, q] = [a.scene.children[0].children[0].position, b.scene.children[0].children[0].position];
      expect(p.distanceTo(q)).toBeLessThan(1e-6);
    }
  });

  it('holds its stones a set time into their flight for staging', () => {
    const { sk, run } = setup();
    sk.hold = 0.5;
    sk.thrown(1, 8, 0, { x: PILE.x - 1, z: PILE.z });
    run(3);
    expect(sk.state().stones[0].t).toBe(0.5);
    sk.hold = null;
    run(0.2);
    expect(sk.state().stones[0].t).toBeCloseTo(0.7, 1);
  });
});

describe('the stones on the screen', () => {
  it('makes its stones, rings and materials once, warms them, and builds nothing while stones fly', () => {
    const { sk, scene, log, run } = setup();
    const group = scene.children[0];
    expect(log[0]).toBe(`warm ${group.children.length}`);
    const before = { children: group.children.length, geos: new Set<THREE.BufferGeometry>(), mats: new Set<THREE.Material>() };
    const collect = (into: typeof before) => group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { into.geos.add(m.geometry); into.mats.add(m.material as THREE.Material); } });
    collect(before);
    // Two geometries (a stone, a ring) and one stone material; each ring fades by itself.
    expect(before.geos.size).toBe(2);
    for (let i = 0; i < 40; i++) {
      sk.thrown(2 + (i % 5), i % 13, 0, { x: PILE.x - 1, z: PILE.z });
      run(0.7);
    }
    const after = { children: group.children.length, geos: new Set<THREE.BufferGeometry>(), mats: new Set<THREE.Material>() };
    collect(after);
    expect(after.children).toBe(before.children);
    expect([...after.geos]).toEqual([...before.geos]);
    expect([...after.mats]).toEqual([...before.mats]);
    // More stones than the pool at once: the oldest is taken over, none is added.
    expect(sk.state().stones.length).toBeLessThanOrEqual(12);
    run(10);
    expect(sk.state()).toMatchObject({ stones: [], rings: 0 });
  });

  it('settles a stone whose place is taken: thirteen and more in the air at once leave no count stuck up and no best waiting', () => {
    const { sk, counter, lines, run } = setup();
    const at = { x: PILE.x - 1, z: PILE.z };
    // This player's own 12, which is the day's best, then fourteen more from others before it has skipped far.
    sk.thrown(1, 12, 0, at);
    sk.setBest({ n: 12, name: 'Ann' }, 1);
    run(1);
    expect(counter.textContent).toBe('1');
    for (let i = 0; i < 14; i++) sk.thrown(10 + i, 12, 0, at);
    expect(sk.state().stones).toHaveLength(12);
    expect(sk.state().stones.some((s) => s.own)).toBe(false);
    // Her stone was taken over: she reads its final count, which goes away by itself, and the sign has her best.
    expect(counter.textContent).toBe('12 skips');
    expect(counter.classList.contains('final')).toBe(true);
    expect(sk.state().best).toEqual({ n: 12, name: 'Ann' });
    expect(sk.busy).toBe(false);
    run(3);
    expect(counter.classList.contains('hidden')).toBe(true);
    expect(lines).toEqual(['BEST SKIP', 'today: 12 skips · Ann']);
    run(10);
    expect(sk.state()).toMatchObject({ stones: [], rings: 0 });
  });

  it('flies a count out of range as the nearest one in it, to its last touch and under', () => {
    for (const n of [99, -4, 7.9]) {
      const { sk, run } = setup();
      sk.thrown(2, n, 0, { x: PILE.x - 1, z: PILE.z });
      expect(sk.state().stones[0].n).toBe(Math.max(0, Math.min(12, Math.floor(n))));
      run(8);
      expect(sk.state().stones).toHaveLength(0);
    }
  });

  it('casts no light and writes no depth for its rings: nothing to count against the eight lights, nothing in the way', () => {
    const { scene } = setup();
    let lights = 0;
    scene.traverse((o) => void ((o as THREE.Light).isLight && lights++));
    expect(lights).toBe(0);
    scene.children[0].traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      expect(m.visible).toBe(false);
      expect(m.castShadow).toBe(false);
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.transparent) expect(mat.depthWrite).toBe(false);
    });
  });

  it('clears its stones, rings and counter when the player goes to another map', () => {
    const { sk, counter, run } = setup();
    sk.thrown(1, 9, 0, { x: PILE.x - 1, z: PILE.z });
    run(1.5);
    expect(sk.state().stones).toHaveLength(1);
    expect(sk.state().rings).toBeGreaterThan(0);
    sk.setMap(map);
    expect(sk.state()).toMatchObject({ stones: [], rings: 0, busy: false, charging: false });
    expect(counter.classList.contains('hidden')).toBe(true);
  });
});

describe('the sign', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.run(0.1);
  });

  it('is left as built until there is a best, then lettered once for each change', () => {
    expect(s.lines).toHaveLength(0);
    expect(s.sk.state().sign).toBe('today: none yet');
    s.sk.setBest({ n: 9, name: 'Oscar' });
    s.run(1);
    expect(s.lines).toEqual(['BEST SKIP', 'today: 9 skips · Oscar']);
    // The same best again (a rejoin's word): nothing is drawn.
    s.sk.setBest({ n: 9, name: 'Oscar' });
    s.run(1);
    expect(s.lines).toHaveLength(2);
    s.sk.setBest({ n: 10, name: 'Ann' });
    s.run(1);
    expect(s.lines.slice(2)).toEqual(['BEST SKIP', 'today: 10 skips · Ann']);
    // A new day.
    s.sk.setBest(null);
    s.run(1);
    expect(s.lines.slice(4)).toEqual(['BEST SKIP', 'today: none yet']);
  });

  it("waits for the stone that set the best to sink, on its thrower's screen and a watcher's", () => {
    for (const thrower of [1, 2]) {
      const t = setup();
      t.sk.thrown(thrower, 6, 0, { x: PILE.x - 1, z: PILE.z });
      t.sk.setBest({ n: 6, name: 'Bob' }, thrower);
      const end = skipPath(6).t[6] + (thrower === 1 ? 0 : SKIP_LET_GO);
      t.run(end - 0.1);
      expect(t.lines).toHaveLength(0);
      expect(t.sk.state().best).toBeNull();
      t.run(0.2);
      expect(t.lines).toEqual(['BEST SKIP', 'today: 6 skips · Bob']);
    }
  });

  it("shows a best at once when its thrower's stone is not on this map", () => {
    s.sk.setBest({ n: 7, name: 'Dan' }, 44);
    s.run(0.05);
    expect(s.lines).toEqual(['BEST SKIP', 'today: 7 skips · Dan']);
  });

  it('letters a new map\'s sign with the best it already knows, and keeps one still waiting when the map changes', () => {
    s.sk.setBest({ n: 8, name: 'Eve' });
    s.run(0.05);
    s.sk.setMap(map);
    s.run(0.05);
    // The sign there is fresh from its builder ("none yet"), so it is lettered again.
    expect(s.lines).toEqual(['BEST SKIP', 'today: 8 skips · Eve', 'BEST SKIP', 'today: 8 skips · Eve']);
    s.sk.thrown(1, 9, 0, { x: PILE.x - 1, z: PILE.z });
    s.sk.setBest({ n: 9, name: 'Ann' }, 1);
    s.sk.setMap(map);
    s.run(0.05);
    expect(s.sk.state().best).toEqual({ n: 9, name: 'Ann' });
  });
});
