import { describe, expect, it } from 'vitest';
import { LEGEND_FIGHT } from '../data/legendshow';
import { BOAT, inHull } from '../data/sea';
import { mulberry } from './env';
import { WEAVE_GLSL, WeaveMotion, clearHeading, finAt, girthAt, restShape, weaveBreaks, weaveGeometry, weavePlates, weaveRun, weaveSpine, type WeaveNow, type WeaveShape } from './leviathanweave';

const W = LEGEND_FIGHT.weave;
const DT = 1 / 60;
const now = (o: Partial<WeaveNow> = {}): WeaveNow => ({ act: 2, build: 0, warning: false, lateral: 0.3, dist: 14, spent: false, ...o });

/** Steps the serpent `secs` seconds on; `each` after every step, with the seconds so far. */
function run(m: WeaveMotion, secs: number, n: WeaveNow, each?: (t: number) => void): void {
  for (let i = 0; i < Math.round(secs / DT); i++) {
    m.step(DT, n);
    each?.((i + 1) * DT);
  }
}

/** A serpent a few seconds into the given act, heading the way the line runs. */
function up(n: WeaveNow = now()): WeaveMotion {
  const m = new WeaveMotion(mulberry(5));
  m.begin(1);
  run(m, 4, n);
  return m;
}

/** The stretches of its back (no spines) out of the water, and the highest any stands. */
const backs = (m: WeaveMotion) => weaveBreaks(m.shape, m.girth);
const peak = (m: WeaveMotion, fin = 0): number => Math.max(0, ...weaveBreaks(m.shape, m.girth, fin).map((b) => b.peak));
const height = (m: WeaveMotion, s: number): number => weaveSpine(s, m.shape, [0, 0, 0])[1];
/** How high its back stands between `a` and `b` metres back from the head. */
function topBetween(m: WeaveMotion, a: number, b: number): number {
  let top = -Infinity;
  for (let s = a; s <= b; s += 0.2) top = Math.max(top, height(m, s) + m.girth * girthAt(s / m.shape.L));
  return top;
}

describe("the weaving serpent's spine", () => {
  it('the shader runs the same curve as the JS', () => {
    // The GLSL's lines are plain float sums: the same text as JS, with the built-ins it uses.
    const body = WEAVE_GLSL.slice(WEAVE_GLSL.indexOf('{') + 1, WEAVE_GLSL.lastIndexOf('}'))
      .replace(/\bfloat\s+/g, 'let ')
      .replace(/return vec3\(([^;]*)\);/, 'return [$1];');
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const smoothstep = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const glsl = new Function('s', 'b', 'w', 'r', 't', 'o', 'clamp', 'smoothstep', 'sin', 'exp', 'sqrt', body) as (...a: unknown[]) => number[];
    const v4 = (x: number, y: number, z: number, w: number) => ({ x, y, z, w });
    const shapes: WeaveShape[] = [
      restShape(),
      { ...restShape(), A: 1.2, K: 1.1, ph: 2.3, ride: -0.2, sunk: 0, wander: 0.6 },
      { ...restShape(), A: 0.9, ph: 5, sunk: 0.4, rear: 1, tall: 4.2, neck: 5, sway: 0.7, wander: 0.5 },
      { ...restShape(), A: 0.5, ph: 1, sunk: 0, tail: 0.8, tailUp: 3, tailLen: 5, rollAt: 6, rollUp: 2.2, rollWide: 3 },
      { ...restShape(), L: 22, A: 1.6, K: 0.9, ph: 9, sunk: 0, rear: 0.6, tail: 1, rollAt: 12, rollUp: 1, dip: 2 },
    ];
    for (const h of shapes)
      for (const s of [-0.3, 0, 1.7, 3, 5.5, 8, 10.2, 12.9, h.L, h.L + 0.3]) {
        const js = weaveSpine(s, h, [0, 0, 0]);
        const gl = glsl(s, v4(h.L, h.A, h.K, h.ph), v4(h.ride, h.from, h.to, h.sunk), v4(h.rear, h.tall, h.neck, h.sway), v4(h.tail, h.tailUp, h.tailLen, h.wander), v4(h.rollAt, h.rollUp, h.rollWide, h.dip), clamp, smoothstep, Math.sin, Math.exp, Math.sqrt);
        for (let i = 0; i < 3; i++) expect(gl[i]).toBeCloseTo(js[i], 9);
      }
  });

  it('thick through its body, thin at the tail, its spines tallest behind the neck', () => {
    expect(girthAt(0.3)).toBeCloseTo(1);
    expect(girthAt(0)).toBeLessThan(girthAt(0.3));
    expect(girthAt(1)).toBeLessThan(0.35);
    for (let u = 0.55; u < 1; u += 0.05) expect(girthAt(u + 0.05)).toBeLessThan(girthAt(u));
    expect(finAt(0.3)).toBeCloseTo(1);
    expect(finAt(1)).toBeLessThan(0.4);
  });

  it('finds where it breaks the surface: each arch a stretch, from where it comes through to where it goes under', () => {
    // Humps 6 m apart, their tops 0.5 m of spine over the water, a back 0.4 thick: the back stands out wherever the spine is within 0.4 of the surface.
    const h: WeaveShape = { ...restShape(), L: 30, A: 1, K: (Math.PI * 2) / 6, ph: 0, ride: -0.5, from: 0, to: 60, sunk: 0, dip: 0.001, tailLen: 0.001 };
    const flat = { ...h };
    const br = weaveBreaks(h, 0.4).filter((b) => b.from > 3 && b.to < 15);
    expect(br.length).toBe(2);
    for (const b of br) {
      // Its edges are where the back's top crosses the water, its peak the hump's crest.
      expect(weaveSpine(b.from, flat, [0, 0, 0])[1] + 0.4 * girthAt(b.from / h.L)).toBeCloseTo(0, 1);
      expect(weaveSpine(b.to, flat, [0, 0, 0])[1] + 0.4 * girthAt(b.to / h.L)).toBeCloseTo(0, 1);
      expect(b.at).toBeGreaterThan(b.from);
      expect(b.at).toBeLessThan(b.to);
      expect(b.peak).toBeCloseTo(0.5 + 0.4 * girthAt(b.at / h.L), 1);
    }
    expect(br[1].at - br[0].at).toBeCloseTo(6, 0);
    // Spines stand out over more of it than the back alone; sunk, nothing does.
    const wide = (list: { from: number; to: number }[]) => list.reduce((n, b) => n + b.to - b.from, 0);
    expect(wide(weaveBreaks(h, 0.4, 0.6))).toBeGreaterThan(wide(weaveBreaks(h, 0.4)));
    expect(weaveBreaks({ ...h, sunk: 3 }, 0.4, 0.6)).toEqual([]);
  });
});

describe("the Leviathan's fight on the weaving serpent", () => {
  it('act 1: under, but for a ridge of spines for a moment at a surge', () => {
    const m = up(now({ act: 1, dist: 21 }));
    expect(m.gone).toBe(true);
    expect(peak(m, m.fin)).toBe(0);
    m.glimpse();
    let most = 0, back = 0, secs = 0;
    run(m, 5, now({ act: 1, dist: 21 }), () => {
      most = Math.max(most, peak(m, m.fin));
      back = Math.max(back, peak(m));
      if (peak(m, m.fin) > 0) secs += DT;
    });
    // Its spines cut the water; its back hardly does. Then it is gone again.
    expect(most).toBeGreaterThan(0.3);
    expect(back).toBeLessThan(0.45);
    expect(secs).toBeGreaterThan(0.8);
    expect(secs).toBeLessThan(3);
    expect(m.gone).toBe(true);
    expect(m.busy).toBe(false);
  });

  it('a few big arches in a line, travelling toward its head', () => {
    const m = up();
    let arches = 0, n = 0;
    const tops: number[] = [];
    run(m, 6, now(), () => {
      const br = backs(m);
      arches += br.length;
      n++;
      tops.push(peak(m));
    });
    // Two or three at a time, each standing a metre and more out of the water (bigger for the distance).
    expect(arches / n).toBeGreaterThanOrEqual(1.8);
    expect(arches / n).toBeLessThanOrEqual(3.2);
    expect(Math.min(...tops)).toBeGreaterThan(1 * m.scale);
    // The same arch a moment later is nearer the head.
    const mid = (m.shape.from + m.shape.to) / 2;
    const near = (): number => backs(m).reduce((best, b) => (Math.abs(b.at - mid) < Math.abs(best - mid) ? b.at : best), Infinity);
    const was = near();
    run(m, 0.3, now());
    const is = near();
    expect(is).toBeLessThan(was);
    expect(was - is).toBeLessThan(2 * m.scale);
  });

  it('more of it and bigger as a surge builds', () => {
    const calm = up(), surging = up(now({ build: 1 }));
    let c = 0, s = 0, cw = 0, sw = 0;
    const wide = (m: WeaveMotion) => backs(m).reduce((n, b) => n + b.to - b.from, 0);
    run(calm, 4, now(), () => {
      c = Math.max(c, peak(calm));
      cw += wide(calm);
    });
    run(surging, 4, now({ build: 1 }), () => {
      s = Math.max(s, peak(surging));
      sw += wide(surging);
    });
    expect(s).toBeGreaterThan(c * 1.2);
    expect(sw).toBeGreaterThan(cw);
    // And hotter: its seams burn brighter.
    expect(surging.seams).toBeGreaterThan(calm.seams);
  });

  it('drawn bigger far off, and nothing of it taller than the view has room for', () => {
    const far = up(now({ dist: 20 })), near = up(now({ dist: 4, act: 3 }));
    expect(far.scale).toBeCloseTo(W.grow.scale);
    expect(near.scale).toBeCloseTo(1);
    expect(far.shape.L).toBeCloseTo(W.length * W.grow.scale);
    for (const dist of [4, 7, 12, 20]) {
        const m = up(now({ dist, act: 3 }));
        const room = W.room[0] + W.room[1] * dist;
        m.play('rear');
        let head = 0;
        run(m, 2, now({ dist, act: 3 }), () => (head = Math.max(head, height(m, 0))));
        expect(head, `rear ${dist}`).toBeLessThanOrEqual(room + 0.01);
        expect(head, `rear ${dist}`).toBeGreaterThan(1);
        const t = up(now({ dist, act: 3 }));
        t.play('tail');
        let tip = 0;
        run(t, 1.3, now({ dist, act: 3 }), () => (tip = Math.max(tip, height(t, t.shape.L))));
        expect(tip, `tail ${dist}`).toBeLessThanOrEqual(room + 0.01);
      }
  });

  it('close in it rides higher, so it shows over the rail from mid-deck', () => {
    const at = (dist: number): number => {
      const m = up(now({ act: 3, dist }));
      let top = 0;
      run(m, 4, now({ act: 3, dist }), () => (top = Math.max(top, peak(m, m.fin))));
      return top / m.scale;
    };
    // The same serpent, size for size: taller by the hull than ten metres out.
    expect(at(4)).toBeGreaterThan(at(10) + 0.3);
    expect(at(10)).toBeCloseTo(at(12), 1);
  });

  it('a move that finds it under, mid-turn, brings it up at once', () => {
    const m = up();
    run(m, W.turn.every, now());
    const against = now({ lateral: -0.4 });
    for (let i = 0; i < 600 && !(m.turning && m.show < 0.05); i++) m.step(DT, against);
    expect(m.show).toBeLessThan(0.05);
    m.stand();
    run(m, LEGEND_FIGHT.stand.leviathan.up, against);
    expect(m.show).toBe(1);
    expect(height(m, 0)).toBeGreaterThan(2);
  });

  it('rear: head and neck out of the water and back, a crash where the head comes down', () => {
    const m = up();
    expect(height(m, 0)).toBeLessThan(-m.girth);
    m.play('rear');
    expect(m.busy).toBe(true);
    const R = LEGEND_FIGHT.rear;
    let top = 0, when = 0, crash = -1, plume = -1;
    run(m, R.up + R.hold + R.down + 0.5, now(), (t) => {
      if (height(m, 0) > top) {
        top = height(m, 0);
        when = t;
      }
      if (m.events.some((e) => e.kind === 'crash') && crash < 0) crash = t;
      if (m.events.some((e) => e.kind === 'plume') && plume < 0) plume = t;
    });
    expect(top).toBeGreaterThan(1.5);
    expect(when).toBeLessThanOrEqual(R.up + R.hold + 0.1);
    expect(plume).toBeLessThan(0.05);
    expect(crash).toBeGreaterThan(R.up + R.hold);
    expect(crash).toBeLessThan(R.up + R.hold + R.down);
    // Over: its head is under again, and it is free for the next move.
    expect(m.busy).toBe(false);
    expect(height(m, 0)).toBeLessThan(0);
    // Its eyes blazed while it was up.
    expect(m.eyes).toBeLessThan(0.6);
  });

  it('coil: one long arch rolls through, taller and longer than its everyday humps, from its tail end to its neck', () => {
    const m = up();
    let calm = 0;
    run(m, 3, now(), () => (calm = Math.max(calm, ...backs(m).map((b) => b.to - b.from), 0)));
    const calmTop = peak(m);
    m.play('coil');
    const C = LEGEND_FIGHT.coil;
    let long = 0, top = 0, crash = -1, foam = 0;
    const at: number[] = [];
    run(m, C.secs + C.back + 0.1, now(), (t) => {
      long = Math.max(long, ...backs(m).map((b) => b.to - b.from), 0);
      top = Math.max(top, peak(m));
      if (t > 0.6 && t < C.secs - 0.6) at.push(m.shape.rollAt);
      if (m.events.some((e) => e.kind === 'crash')) crash = t;
      foam += m.events.filter((e) => e.kind === 'foam').length;
    });
    expect(long).toBeGreaterThan(Math.max(calm, 3) * 1.15);
    expect(top).toBeGreaterThan(calmTop + 0.6);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeLessThan(at[i - 1]);
    expect(crash).toBeGreaterThan(C.secs - 0.1);
    expect(crash).toBeLessThan(C.secs + 0.1);
    expect(foam).toBeGreaterThan(15);
    expect(m.busy).toBe(false);
    expect(m.shape.rollUp).toBeLessThan(0.05);
  });

  it('tail: the blade stood out of the water and slapped down flat', () => {
    const m = up();
    expect(height(m, m.shape.L)).toBeLessThan(0);
    m.play('tail');
    const X = LEGEND_FIGHT.tail;
    let top = 0, slap = -1;
    run(m, X.up + X.hold + X.down + 0.4, now(), (t) => {
      top = Math.max(top, height(m, m.shape.L));
      if (m.events.some((e) => e.kind === 'slap')) slap = t;
    });
    expect(top).toBeGreaterThan(1.8);
    expect(slap).toBeCloseTo(X.up + X.hold + X.down, 1);
    expect(m.busy).toBe(false);
    expect(height(m, m.shape.L)).toBeLessThan(0);
  });

  it('flicks its tail between moves', () => {
    const m = up();
    let n = 0;
    run(m, 30, now(), () => (n += m.events.filter((e) => e.kind === 'flick').length));
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(10);
  });

  it('the last stand: head, coils and tail all up at once inside the first second, down by a second and a half, then spent', () => {
    const L = LEGEND_FIGHT.lastStand;
    const n = now({ act: 3, dist: 7 });
    const m = up(n);
    const coiled = (): number => topBetween(m, m.shape.neck, m.shape.L - m.shape.tailLen);
    let calm = 0;
    run(m, 3, n, () => (calm = Math.max(calm, coiled())));
    m.stand();
    let head = 0, tail = 0, coils = 0, crash = -1, slap = -1;
    run(m, 1, n, () => {
      head = Math.max(head, height(m, 0));
      tail = Math.max(tail, height(m, m.shape.L));
      coils = Math.max(coils, coiled());
    });
    // Higher than a rear ever goes, its tail with it, its coils taller than they were.
    const room = W.room[0] + W.room[1] * 7;
    expect(head).toBeGreaterThan(Math.min(W.rear.tall, room) * 0.9);
    expect(tail).toBeGreaterThan(1.5);
    expect(coils).toBeGreaterThan(calm + 0.25);
    run(m, 0.6, n, (t) => {
      if (m.events.some((e) => e.kind === 'crash') && crash < 0) crash = 1 + t;
      if (m.events.some((e) => e.kind === 'slap') && slap < 0) slap = 1 + t;
    });
    expect(crash).toBeGreaterThan(1);
    expect(crash).toBeLessThanOrEqual(1.5);
    expect(slap).toBe(crash);
    // Spent, from then on (the director says so once `lastStand.secs` are up): low humps barely breaking the water,
    // slower, its seams smouldering, listing over; and no more flicks.
    run(m, L.secs - 1.6, n);
    expect(m.busy).toBe(false);
    let low = 0, flicks = 0;
    const ph0 = m.shape.ph;
    run(m, 6, { ...n, spent: true }, () => {
      low = Math.max(low, peak(m));
      flicks += m.events.filter((e) => e.kind === 'flick').length;
    });
    expect(low).toBeLessThan(Math.min(calm * 0.75, 0.75));
    expect(height(m, 0)).toBeLessThan(0);
    expect(flicks).toBe(0);
    expect(m.seams).toBeLessThan(0.6);
    expect(Math.abs(m.list)).toBeGreaterThan(0.2);
    const spentPace = (m.shape.ph - ph0) / 6;
    const live = up(n);
    const ph1 = live.shape.ph;
    run(live, 6, n);
    expect(spentPace).toBeLessThan(((live.shape.ph - ph1) / 6) * 0.6);
  });

  it('turns only wholly under: the line run against it, it dives and comes up heading the other way', () => {
    const m = up();
    expect(m.side).toBe(1);
    const against = now({ lateral: -0.4 });
    let flippedAt = -1, shownAtFlip = 1, dipped = false;
    run(m, W.turn.every + 6, against, (t) => {
      if (m.show < 0.05) dipped = true;
      if (m.side === -1 && flippedAt < 0) {
        flippedAt = t;
        shownAtFlip = m.show;
      }
    });
    expect(dipped).toBe(true);
    expect(flippedAt).toBeGreaterThan(W.turn.every - 4.5);
    expect(shownAtFlip).toBe(0);
    // Up again, heading the new way, and it stays so while the line runs that way.
    expect(m.show).toBe(1);
    run(m, 10, against);
    expect(m.side).toBe(-1);
    // A move in the middle of a dive brings it back up as it was heading, not swung round in plain sight.
    const k = up();
    run(k, W.turn.every, now());
    let diving = false;
    for (let i = 0; i < 600 && !diving; i++) {
      k.step(DT, against);
      diving = k.turning && k.show < 0.8 && k.show > 0.3;
    }
    expect(diving).toBe(true);
    k.play('rear');
    run(k, 2.5, against);
    expect(k.side).toBe(1);
  });

  it('the fight over, it slides under where it is, whatever it was doing', () => {
    const m = up();
    m.stand();
    run(m, 0.7, now());
    expect(height(m, 0)).toBeGreaterThan(1);
    m.end();
    run(m, W.dive + 0.1, now());
    expect(m.gone).toBe(true);
    expect(peak(m, m.fin)).toBe(0);
    expect(height(m, 0)).toBeLessThan(-0.5);
    expect(m.events.length).toBe(0);
  });
});

describe('where the serpent lies', () => {
  it('is kept clear of the hull, without being swung end-on to the boat', () => {
    // Off the starboard rail amidships, lying along the hull: clear as it is.
    const z = -(BOAT.beam + 5);
    expect(clearHeading(0, z, 0, 7, 7, W.pad)).toBe(0);
    // Off the quarter, lying toward the hull: turned until it is clear, and never by more than `most`.
    const x = BOAT.len / 2 + 3, want = Math.PI * 0.75;
    const hits = (a: number): number => {
      let n = 0;
      for (let d = -7; d <= 7; d++) if (inHull(x + Math.cos(a) * d, -3 + Math.sin(a) * d, W.pad)) n++;
      return n;
    };
    expect(hits(want)).toBeGreaterThan(0);
    const a = clearHeading(x, -3, want, 7, 7, W.pad);
    expect(hits(a)).toBe(0);
    expect(Math.abs(a - want)).toBeLessThanOrEqual(0.7 + 1e-9);
    // Nowhere clear within reach: the heading that crosses least of the hull.
    const all = clearHeading(0, 0, 1, 7, 7, W.pad, 0.3);
    expect(Math.abs(all - 1)).toBeLessThanOrEqual(0.3 + 1e-9);
  });
});

describe("the serpent's mesh", () => {
  it('is one light piece: a couple of thousand triangles', () => {
    const { geo, triangles } = weaveGeometry();
    expect(triangles).toBeLessThan(2600);
    expect(geo.getAttribute('position').count).toBe(triangles * 3);
    for (const name of ['aS', 'aP', 'aCol', 'aFin', 'aGlow']) expect(geo.getAttribute(name).count, name).toBe(triangles * 3);
    // Two plates more than its length holds: sliding forward, each comes out of the tail's root and goes into the
    // skull unseen, and the one wholly in the skull starts again behind the tail's root.
    const s = geo.getAttribute('aS'), p = geo.getAttribute('aP');
    let most = 0;
    for (let i = 0; i < s.count; i++) {
      if (Math.abs(s.getX(i)) > 500) continue;
      most = Math.max(most, s.getX(i));
      // Every corner hangs within its own plate.
      expect(s.getX(i) - p.getX(i)).toBeGreaterThanOrEqual(-1e-6);
      expect(s.getX(i) - p.getX(i)).toBeLessThanOrEqual(W.plate + 1e-6);
    }
    expect(weavePlates() * W.plate).toBeGreaterThanOrEqual(W.length + 2 * W.plate - 1e-6);
    expect(most).toBeCloseTo(weaveRun());
    // As the shader places them: for any slide, a plate's start is from one plate ahead of the skull to one behind the tail's root.
    for (const slide of [0, 0.3, W.plate, 5.21, weaveRun() - 0.01])
      for (let i = 0; i < weavePlates(); i++) {
        const base = ((((i * W.plate - slide + W.plate) % weaveRun()) + weaveRun()) % weaveRun()) - W.plate;
        expect(base).toBeGreaterThanOrEqual(-W.plate - 1e-9);
        expect(base).toBeLessThan(W.length + W.plate + 1e-9);
      }
  });
});
