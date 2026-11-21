import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Giant, GiantFightState } from './audio';
import { GIANT_FIGHT_SOUND as K, GiantFight, ROUND, crack, distanceOf, fightMix, figureNote, follow, gestureNames, planCall, roomResponse, scaleStep, settled, stopPartials, valueAt, type CallPlan, type Pt, type Settled, type Stop } from './giantsound';

const GIANTS: Giant[] = ['leviathan', 'kraken', 'dreamer'];

/** Small seeded random numbers (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One thing asked of a gain or a filter: what, the value, when, and how fast (a target's time constant). */
type Ask = [kind: 'set' | 'ramp' | 'exp' | 'target' | 'cancel', v: number, at: number, tau: number];
interface FakeParam {
  value: number;
  asks: Ask[];
}

/** What a sound asked of the audio context: every time it scheduled something at, and what a real one would refuse. */
interface Heard {
  times: number[];
  starts: number;
  stops: number;
  made: number;
  disconnects: number;
  bad: string[];
  /** Every source's start and stop time. */
  spans: [from: number, to: number][];
  /** The organ's stop waves and room echoes made. */
  waves: number;
  buffers: number;
}

/** Whether everything that was started is also stopped. */
const allStopped = (heard: Heard): boolean => heard.spans.length === heard.starts && heard.spans.every(([from, to]) => Number.isFinite(to) && to >= from);

/** The most sources sounding at once. */
function mostAtOnce(spans: [number, number][]): number {
  const edges = spans.flatMap(([from, to]) => [[from, 1], [to, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let most = 0;
  for (const [, step] of edges) most = Math.max(most, (now += step));
  return most;
}

/** A stand-in audio context that builds nothing and writes down what was scheduled. Its clock is set by hand. */
function fakeContext() {
  const heard: Heard = { times: [], starts: 0, stops: 0, made: 0, disconnects: 0, bad: [], spans: [], waves: 0, buffers: 0 };
  const param = () => {
    const p: FakeParam & Record<string, unknown> = { value: 0, asks: [] };
    const note = (kind: Ask[0], ok: (v: number) => boolean) => (v: number, at: number, tau = 0) => {
      if (!ok(v) || !Number.isFinite(at) || !Number.isFinite(tau)) heard.bad.push(`${kind} ${v} at ${at}`);
      heard.times.push(at);
      p.asks.push([kind, v, at, tau]);
    };
    p.setValueAtTime = note('set', Number.isFinite);
    p.linearRampToValueAtTime = note('ramp', Number.isFinite);
    // A real context throws on an exponential ramp to zero or below.
    p.exponentialRampToValueAtTime = note('exp', (v) => v > 0 && Number.isFinite(v));
    p.setTargetAtTime = note('target', Number.isFinite);
    p.cancelScheduledValues = (at: number) => p.asks.push(['cancel', 0, at, 0]);
    p.cancelAndHoldAtTime = (at: number) => p.asks.push(['cancel', 0, at, 0]);
    return p;
  };
  const node = () => {
    heard.made++;
    const span: [number, number] = [0, Infinity];
    const own: Record<string | symbol, unknown> = {
      connect: (to: unknown) => to,
      disconnect: () => heard.disconnects++,
      start: (when = 0) => (heard.starts++, heard.times.push(when), (span[0] = when), heard.spans.push(span)),
      // A stop may be given again (a held organ key let go early): the last one counts, as in a real context.
      stop: (when = 0) => (heard.stops++, heard.times.push(when), (span[1] = when)),
      setPeriodicWave: () => {},
    };
    return new Proxy(own, { get: (o, key) => (o[key] ??= param()), set: (o, key, v) => ((o[key] = v), true) });
  };
  const made = { createPeriodicWave: () => (heard.waves++, {}), createBuffer: () => (heard.buffers++, { copyToChannel: () => {} }) };
  const ctx = new Proxy({ currentTime: 0, sampleRate: 48000, ...made } as Record<string | symbol, unknown>, { get: (o, key) => o[key] ?? node });
  return { ctx: ctx as unknown as BaseAudioContext & { currentTime: number }, heard, param: () => param() as unknown as AudioParam & FakeParam };
}

/** A fight's sound on a stand-in context, with the lake's tune's gain to watch. */
function rig(seed = 1) {
  const { ctx, heard, param } = fakeContext();
  const lake = param();
  const fight = new GiantFight(ctx, {} as AudioBuffer, {} as AudioNode, {} as AudioNode, lake, seeded(seed));
  return { ctx, heard, lake, fight };
}

const calm: GiantFightState = { act: 2, near: 0.5, fight: 0.6, surge: 0, warning: false, tension: 0.4, spent: false };

/** Runs `secs` seconds of frames from where the clock stands; `state` may change by the time into the run. */
function run(r: ReturnType<typeof rig>, secs: number, state: (t: number) => GiantFightState = () => calm, audible = true): void {
  const dt = 1 / 30;
  for (let t = 0; t < secs; t += dt) {
    r.ctx.currentTime += dt;
    r.fight.update(dt, state(t), audible);
  }
}

/** The private gate of the music playing (its end fades it). */
const gateOf = (fight: GiantFight): FakeParam => (fight as unknown as { live: { gate: { gain: FakeParam } } }).live.gate.gain;

describe('a giant’s calls are never twice the same', () => {
  for (const id of GIANTS) {
    it(`${id}: no gesture and no key twice running, whatever the fight`, () => {
      const rng = seeded(id.length);
      const keys = K.keys[id];
      const nearest = (semis: number) => keys.reduce((best, k) => (Math.abs(k - semis) < Math.abs(best - semis) ? k : best));
      const used = new Set<number>();
      let last: CallPlan | undefined;
      for (let i = 0; i < 600; i++) {
        const plan = planCall(id, { kind: rng() < 0.5 ? 'surge' : 'move', near: rng(), fight: rng() }, rng, last);
        expect(plan.gesture).toBeGreaterThanOrEqual(0);
        expect(plan.gesture).toBeLessThan(gestureNames(id).length);
        expect(keys).toContain(nearest(plan.semis));
        expect(Math.abs(plan.semis - nearest(plan.semis))).toBeLessThanOrEqual(0.3);
        if (last) {
          expect(plan.gesture).not.toBe(last.gesture);
          expect(nearest(plan.semis)).not.toBe(nearest(last.semis));
        }
        expect(plan.len).toBeGreaterThanOrEqual(0);
        expect(plan.len).toBeLessThan(1);
        used.add(plan.gesture);
        last = plan;
      }
      // Every gesture gets its turn.
      expect(used.size).toBe(gestureNames(id).length);
    });
  }

  it('varies the level and the mouth within their spread', () => {
    const rng = seeded(4);
    const levels: number[] = [];
    const mouths: number[] = [];
    let last: CallPlan | undefined;
    for (let i = 0; i < 300; i++) {
      last = planCall('leviathan', { kind: 'surge', near: 1, fight: 1 }, rng, last);
      levels.push(last.level);
      mouths.push(last.mouth);
    }
    const spread = 10 ** (K.levelSpread / 20);
    expect(Math.max(...levels)).toBeLessThanOrEqual(K.kindLevel.surge * spread);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(K.kindLevel.surge / spread);
    expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(1.5);
    expect(Math.max(...mouths) / Math.min(...mouths)).toBeGreaterThan(1.2);
  });

  it('strains as the giant tires, and leans on its tired gestures', () => {
    const rng = seeded(9);
    expect(planCall('kraken', { kind: 'surge', near: 0.5, fight: 1 }, rng).strain).toBe(0);
    expect(planCall('kraken', { kind: 'surge', near: 0.5, fight: K.strainAt }, rng).strain).toBe(0);
    expect(planCall('kraken', { kind: 'surge', near: 0.5, fight: 0 }, rng).strain).toBe(1);
    const huff = gestureNames('leviathan').indexOf('hiss');
    expect(huff).toBeGreaterThanOrEqual(0);
    const count = (fight: number) => {
      let n = 0;
      let last: CallPlan | undefined;
      for (let i = 0; i < 400; i++) {
        last = planCall('leviathan', { kind: 'move', near: 0.5, fight }, rng, last);
        if (last.gesture === huff) n++;
      }
      return n;
    };
    expect(count(0.05)).toBeGreaterThan(count(1) * 1.5);
  });

  it('the last stand is its own gesture, strained, at full level', () => {
    for (const id of GIANTS) {
      const plan = planCall(id, { kind: 'last', near: 0.9, fight: 1 }, seeded(2));
      expect(plan.gesture).toBe(-1);
      expect(plan.level).toBe(K.kindLevel.last);
      expect(plan.strain).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('far out a call is quieter, duller and smeared; close in clear and loud', () => {
    for (const id of GIANTS) {
      const far = distanceOf(id, 0);
      const mid = distanceOf(id, 0.5);
      const near = distanceOf(id, 1);
      expect(far.gain).toBeLessThan(mid.gain);
      expect(mid.gain).toBeLessThan(near.gain);
      expect(near.gain).toBe(1);
      expect(far.hz).toBeCloseTo(K.far.hz[id]);
      expect(far.hz).toBeLessThan(mid.hz);
      expect(near.hz).toBeCloseTo(K.nearHz);
      expect(far.smear).toBeGreaterThan(mid.smear);
      expect(near.smear).toBe(0);
      // Out of range is held to the ends.
      expect(distanceOf(id, -3)).toEqual(far);
      expect(distanceOf(id, NaN)).toEqual(far);
      expect(distanceOf(id, 7)).toEqual(near);
    }
  });

  it('a crack keeps a course in order and inside its length', () => {
    const pts: Pt[] = [[0, 100], [0.5, 200], [1, 50]];
    expect(valueAt(pts, 0.25)).toBeCloseTo(150);
    expect(valueAt(pts, -1)).toBe(100);
    expect(valueAt(pts, 9)).toBe(50);
    for (const at of [-1, 0, 0.3, 0.5, 0.97, 4]) {
      const out = crack(pts, at, 0.06, 1.5);
      expect(out[0]).toEqual([0, 100]);
      expect(out[out.length - 1]).toEqual([1, 50]);
      for (let i = 1; i < out.length; i++) expect(out[i][0]).toBeGreaterThan(out[i - 1][0]);
      expect(out.some(([t, v]) => v > valueAt(pts, t) * 1.4)).toBe(true);
    }
    // Too short to hold one.
    const short: Pt[] = [[0, 1], [0.1, 2]];
    expect(crack(short, 0.05, 0.06, 2)).toBe(short);
  });
});

describe('the fight music follows the fight', () => {
  const at = (over: Partial<Settled> = {}): Settled => ({ act: 1, near: 0, fight: 1, surge: 0, warn: 0, tension: 0.4, spent: 0, ...over });

  it('grows as the giant comes in and the acts go by: quicker, louder, denser, and by its stops', () => {
    const steps = [at(), at({ near: 0.3 }), at({ near: 0.3, act: 2 }), at({ near: 0.6, act: 2 }), at({ near: 0.6, act: 3 }), at({ near: 1, act: 3 })].map((s) => fightMix(s));
    for (let i = 1; i < steps.length; i++) {
      for (const key of ['bpm', 'level', 'density', 'rub', 'box'] as const) expect(steps[i][key], `${key} at step ${i}`).toBeGreaterThan(steps[i - 1][key]);
      for (const key of ['pedal', 'chorus', 'reed', 'figure'] as const) expect(steps[i][key], `${key} at step ${i}`).toBeGreaterThanOrEqual(steps[i - 1][key]);
    }
    const [slow, quick] = K.organ.bpm;
    expect(steps[0].bpm).toBeCloseTo(slow);
    expect(steps[steps.length - 1].bpm).toBeCloseTo(quick);
    // Foundations and pedal only far out, the figure and the chorus by mid-fight, the reeds close in.
    const [far, , , mid, , close] = steps;
    expect([far.found, far.figure, far.chorus, far.reed]).toEqual([1, 0, 0, 0]);
    expect(mid.figure).toBe(1);
    expect(mid.chorus).toBeGreaterThan(0.5);
    expect(mid.reed).toBe(0);
    expect([close.figure, close.chorus, close.reed]).toEqual([1, 1, 1]);
  });

  it('a surge swells the trill with its build-up and draws more chorus and reeds', () => {
    const base = at({ near: 0.5, act: 2 });
    expect(fightMix(base).trill).toBe(0);
    let last = fightMix(base);
    for (const surge of [0.25, 0.5, 0.75, 1]) {
      const m = fightMix({ ...base, surge });
      for (const key of ['trill', 'level', 'bpm'] as const) expect(m[key], key).toBeGreaterThan(last[key]);
      last = m;
    }
    // In any act (far out the chorus alone).
    for (const s of [at({ near: 0.1 }), base, at({ near: 0.9, act: 3 })]) {
      expect(fightMix({ ...s, surge: 1 }).chorus).toBeGreaterThan(fightMix(s).chorus);
      expect(fightMix({ ...s, surge: 1 }).reed).toBeGreaterThanOrEqual(fightMix(s).reed);
    }
    expect(fightMix({ ...base, surge: 1 }).reed).toBeGreaterThan(0.3);
    expect(fightMix(at({ near: 0.1, surge: 1 })).reed).toBeLessThan(0.05);
  });

  it('the warning lifts it, and the dissonant stop is louder as the line loads', () => {
    const base = at({ near: 0.5, act: 2 });
    const calmMix = fightMix(base);
    const warned = fightMix({ ...base, warn: 1 });
    for (const key of ['level', 'bpm'] as const) expect(warned[key], key).toBeGreaterThan(calmMix[key]);
    expect(fightMix({ ...base, tension: 1 }).rub).toBeGreaterThan(fightMix({ ...base, tension: 0.5 }).rub);
    expect(fightMix({ ...base, tension: 0.5 }).rub).toBeGreaterThan(fightMix({ ...base, tension: 0 }).rub);
  });

  it('once the giant is spent everything shuts but one thin stop', () => {
    const close = at({ near: 0.95, act: 3, tension: 0.3 });
    const before = fightMix(close);
    const spent = fightMix({ ...close, spent: 1, surge: 1, warn: 1 });
    for (const key of ['pedal', 'found', 'chorus', 'reed', 'figure', 'rub', 'box', 'trill', 'density'] as const) expect(spent[key], key).toBe(0);
    expect(spent.last).toBe(1);
    expect(before.last).toBe(0);
    for (const key of ['pedal', 'found', 'chorus', 'reed', 'figure'] as const) expect(before[key], key).toBeGreaterThan(0.9);
  });

  it('eases toward the state: a surge comes up faster than it goes down, and it settles', () => {
    const rest = settled({ ...calm, surge: 0 });
    const high = settled({ ...calm, surge: 1, warning: true, spent: true, act: 3, near: 1 });
    const up = follow(rest, high, 0.1);
    const down = follow(high, rest, 0.1);
    expect(up.surge).toBeGreaterThan(0.5);
    expect(1 - down.surge).toBeLessThan(up.surge);
    expect(up.act).toBeGreaterThan(2);
    expect(up.act).toBeLessThan(2.2);
    expect(follow(rest, high, 0)).toEqual(rest);
    let s = rest;
    for (let i = 0; i < 600; i++) s = follow(s, high, 1 / 30);
    for (const key of Object.keys(high) as (keyof Settled)[]) expect(s[key]).toBeCloseTo(high[key], 3);
    // A state out of range is held in it.
    expect(settled({ act: 3, near: 4, fight: -1, surge: NaN, warning: false, tension: 2, spent: false })).toEqual({ act: 3, near: 1, fight: 0, surge: 0, warn: 0, tension: 1, spent: 0 });
  });
});

describe('the fight music starts and ends safely', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does nothing when no fight is on', () => {
    const r = rig();
    r.fight.end('landed');
    r.fight.end('lost');
    r.fight.update(1 / 30, calm);
    expect(r.fight.playing).toBeNull();
    expect(r.heard.made).toBe(0);
    expect(r.lake.asks).toEqual([]);
  });

  for (const id of GIANTS) {
    it(`${id}: plays a whole fight, stops everything it starts, and keeps to the clock`, () => {
      const timers = [vi.spyOn(globalThis, 'setTimeout'), vi.spyOn(globalThis, 'setInterval'), vi.spyOn(performance, 'now'), vi.spyOn(Date, 'now')];
      const r = rig(3);
      r.ctx.currentTime = 12.5;
      r.fight.start(id);
      expect(r.fight.playing).toBe(id);
      // 40 s through the acts with a warning and a surge every 8 s and a call on each, then spent.
      run(r, 46, (t) => {
        const into = t % 8;
        if (into < 1 / 30 && t > 1 && t < 40) r.fight.call(id, { kind: 'surge', near: t / 40, fight: 1 - t / 40 });
        return { act: t < 12 ? 1 : t < 26 ? 2 : 3, near: Math.min(1, t / 40), fight: Math.max(0, 1 - t / 40), surge: into < 2 ? Math.min(1, into, (2 - into) * 4) : 0, warning: into > 7, tension: 0.5, spent: t > 40 };
      });
      r.fight.call(id, { kind: 'last', near: 1, fight: 0 });
      r.fight.end('landed');
      expect(r.fight.playing).toBeNull();
      expect(r.heard.bad).toEqual([]);
      expect(r.heard.starts).toBeGreaterThan(100);
      // Held keys are let go early: stopped a second time.
      expect(r.heard.stops).toBeGreaterThan(r.heard.starts);
      expect(allStopped(r.heard)).toBe(true);
      // Nothing is asked for before the fight began, or further off than a few seconds past the frame it was asked in.
      expect(Math.min(...r.heard.times)).toBeGreaterThanOrEqual(12.5);
      expect(Math.max(...r.heard.times)).toBeLessThan(r.ctx.currentTime + 8);
      // Few enough voices at once for a phone, the calls included.
      expect(mostAtOnce(r.heard.spans)).toBeLessThan(64);
      for (const spy of timers) expect(spy).not.toHaveBeenCalled();
    });
  }

  it('schedules only a moment ahead, and nothing in a clump after the frames stop', () => {
    const r = rig();
    r.fight.start('leviathan');
    run(r, 5);
    // While it plays, nothing is asked for further off than the longest a key may stay down.
    expect(Math.max(...r.heard.times)).toBeLessThan(r.ctx.currentTime + K.ahead + K.organ.longest + 0.1);
    const before = r.heard.starts;
    const asked = r.heard.times.length;
    // The tab sleeps for a minute: the frame after it schedules no more than any frame does, and nothing in the past.
    r.ctx.currentTime += 60;
    const woke = r.ctx.currentTime;
    r.fight.update(1 / 30, calm);
    expect(r.heard.starts - before).toBeLessThan(40);
    run(r, 1);
    expect(Math.min(...r.heard.times.slice(asked))).toBeGreaterThanOrEqual(woke);
  });

  it('builds nothing while the music is switched off, and picks up when it is back', () => {
    const r = rig();
    r.fight.start('kraken');
    // (The hook's chord is built with the start, whatever the switch.)
    const made = r.heard.made;
    const hook = r.heard.starts;
    run(r, 6, () => ({ ...calm, surge: 1, warning: true }), false);
    expect(r.heard.starts).toBe(hook);
    expect(r.heard.made).toBe(made);
    run(r, 3);
    expect(r.heard.starts).toBeGreaterThan(hook + 10);
  });

  it('landed: as good as silent within 0.3 s; lost: sagging away over about 1.5 s', () => {
    for (const how of ['landed', 'lost'] as const) {
      const r = rig();
      r.fight.start('dreamer');
      run(r, 4);
      const gate = gateOf(r.fight);
      const t = r.ctx.currentTime;
      r.fight.end(how);
      const fade = gate.asks.filter(([kind, v, when]) => kind === 'target' && v === 0 && when === t);
      expect(fade).toHaveLength(1);
      const tau = fade[0][3];
      const left = (after: number) => Math.exp(-after / tau);
      if (how === 'landed') expect(left(0.3)).toBeLessThan(0.01);
      else {
        expect(left(0.3)).toBeGreaterThan(0.3);
        expect(left(1.5)).toBeLessThan(0.05);
      }
      // And then it is shut for good.
      expect(gate.asks[gate.asks.length - 1].slice(0, 2)).toEqual(['set', 0]);
      expect(r.fight.playing).toBeNull();
      // Every key that was down is up soon after: nothing is left sounding for long.
      expect(Math.max(...r.heard.spans.map(([, to]) => to))).toBeLessThan(t + 6);
    }
  });

  it('starting while one is on cuts it and starts clean; its parts are taken apart once silent', () => {
    const r = rig();
    r.fight.start('leviathan');
    run(r, 3);
    const first = gateOf(r.fight);
    r.fight.start('kraken');
    expect(r.fight.playing).toBe('kraken');
    expect(gateOf(r.fight)).not.toBe(first);
    expect(first.asks.some(([kind, v]) => kind === 'target' && v === 0)).toBe(true);
    expect(r.heard.disconnects).toBe(0);
    run(r, 2);
    const cut = r.heard.disconnects;
    expect(cut).toBeGreaterThan(8);
    r.fight.end('lost');
    r.fight.end('lost');
    r.ctx.currentTime += 5;
    // The next thing asked of it clears the second away too.
    r.fight.call('kraken', { kind: 'move', near: 0.5, fight: 0.5 });
    expect(r.heard.disconnects).toBeGreaterThan(cut + 8);
    expect(r.heard.bad).toEqual([]);
  });

  it('the lake’s tune gives way for the fight and comes back after it', () => {
    const r = rig();
    r.ctx.currentTime = 3;
    r.fight.start('leviathan');
    expect(r.lake.asks[r.lake.asks.length - 1].slice(0, 3)).toEqual(['target', K.lakeTune, 3]);
    run(r, 2);
    const t = r.ctx.currentTime;
    r.fight.end('landed');
    const back = r.lake.asks[r.lake.asks.length - 1];
    expect(back.slice(0, 2)).toEqual(['target', 1]);
    expect(back[2]).toBeCloseTo(t + K.lakeBack.landed);
    // Hooked again before it is back: the return is dropped.
    r.fight.start('leviathan');
    expect(r.lake.asks.slice(-2).map(([kind]) => kind)).toEqual(['cancel', 'target']);
    expect(r.lake.asks[r.lake.asks.length - 1][1]).toBe(K.lakeTune);
  });

  it('a call plays with no music on, stops what it starts, and the last stand is the longest', () => {
    for (const id of GIANTS) {
      const longest = (kind: 'surge' | 'move' | 'last') => {
        let most = 0;
        for (let seed = 1; seed <= 12; seed++) {
          const r = rig(seed);
          r.ctx.currentTime = 2;
          r.fight.call(id, { kind, near: seed / 12, fight: 1 - seed / 12 });
          expect(r.heard.bad).toEqual([]);
          expect(r.heard.starts).toBeGreaterThan(2);
          expect(allStopped(r.heard)).toBe(true);
          expect(Math.min(...r.heard.times)).toBeGreaterThanOrEqual(2);
          most = Math.max(most, Math.max(...r.heard.times) - 2);
        }
        return most;
      };
      const last = longest('last');
      expect(longest('surge')).toBeLessThan(last);
      expect(longest('move')).toBeLessThan(last);
      expect(last).toBeGreaterThan(3);
      expect(last).toBeLessThan(5.5);
    }
  });

  it('the music steps back under a call and comes back', () => {
    const r = rig();
    r.fight.start('leviathan');
    run(r, 2);
    const duck = (r.fight as unknown as { live: { duck: { gain: FakeParam } } }).live.duck.gain;
    r.fight.call('leviathan', { kind: 'surge', near: 0.5, fight: 1 });
    const asks = duck.asks.filter(([kind]) => kind === 'target');
    expect(asks.map(([, v]) => v)).toEqual([K.voiceDuck.surge, 1]);
    expect(asks[1][2]).toBeGreaterThan(asks[0][2]);
  });
});

describe('the organ', () => {
  const STOP_NAMES: Stop[] = ['found', 'chorus', 'reed', 'solo', 'pedal', 'pedalReed', 'string', 'flute'];
  const fresh: GiantFightState = { act: 1, near: 0.05, fight: 1, surge: 0, warning: false, tension: 0.3, spent: false };
  /** The sources that start in a stretch of time. */
  const startsIn = (r: ReturnType<typeof rig>, from: number, to: number): number => r.heard.spans.filter(([at]) => at >= from && at < to).length;

  it('every stop is a wave of level 1, with its ranks where they belong', () => {
    for (const stop of STOP_NAMES) {
      const a = stopPartials(stop);
      expect(a[0]).toBe(0);
      let power = 0;
      for (const v of a) power += (v * v) / 2;
      expect(power).toBeCloseTo(1, 5);
    }
    // The foundations sound the 16' and the 8'; the chorus nothing under the 4'; the reeds are the brightest.
    const found = stopPartials('found');
    expect(found[1]).toBeGreaterThan(0.1);
    expect(found[2]).toBeGreaterThan(found[1]);
    const chorus = stopPartials('chorus');
    expect([chorus[1], chorus[2], chorus[3]]).toEqual([0, 0, 0]);
    for (const rank of [4, 6, 8, 12, 16]) expect(chorus[rank]).toBeGreaterThan(0.05);
    const high = (a: Float32Array) => a.slice(17).reduce((sum, v) => sum + v * v, 0);
    expect(high(stopPartials('reed'))).toBeGreaterThan(high(found) * 4);
  });

  it('the room is a few seconds of echo that dies away, darker as it goes, different in each ear', () => {
    const rate = 8000;
    const [l, r] = roomResponse(rate, 2, 2.5, 1, seeded(3));
    expect(l.length).toBe(2 * rate);
    const power = (h: Float32Array, from: number, to: number) => h.slice(Math.floor(from * rate), Math.floor(to * rate)).reduce((sum, v) => sum + v * v, 0);
    // A held chord comes back at about its own level (the first walls' few echoes add a little).
    expect(power(l, 0, 2)).toBeGreaterThan(0.95);
    expect(power(l, 0, 2)).toBeLessThan(1.3);
    expect(power(l, 0, 0.011)).toBe(0);
    expect(power(l, 0.1, 0.6)).toBeGreaterThan(power(l, 0.6, 1.1) * 2);
    expect(power(l, 0.6, 1.1)).toBeGreaterThan(power(l, 1.4, 1.9) * 2);
    expect(l[l.length - 1]).toBeCloseTo(0, 6);
    // How fast it wiggles: fewer zero crossings late than early, as the top dies first.
    const crossings = (h: Float32Array, from: number, to: number) => {
      let n = 0;
      for (let i = Math.floor(from * rate) + 1; i < to * rate; i++) if (h[i] * h[i - 1] < 0) n++;
      return n;
    };
    expect(crossings(l, 0.05, 0.45)).toBeGreaterThan(crossings(l, 1.4, 1.8) * 1.5);
    let same = 0;
    for (let i = 0; i < l.length; i++) same += l[i] * r[i];
    expect(Math.abs(same)).toBeLessThan(0.2);
  });

  it('the round is in the key: a bass that walks, chords of the scale and its two dark turns, figures on the chord', () => {
    expect(ROUND).toHaveLength(8);
    expect(ROUND[0]).toEqual({ bass: 0, root: 0, tones: [0, 3, 7] });
    for (const [bar, chord] of ROUND.entries()) {
      // The pedal stays within a fifth under and a fourth over the keynote, and plays the chord's root, its seventh or its fifth.
      expect(chord.bass).toBeGreaterThanOrEqual(-7);
      expect(chord.bass).toBeLessThanOrEqual(5);
      for (let i = 1; i < chord.tones.length; i++) expect(chord.tones[i]).toBeGreaterThan(chord.tones[i - 1]);
      for (const quick of [false, true]) {
        for (let i = 0; i < 16; i++) {
          const note = figureNote(chord.tones, bar, i, quick);
          expect(chord.tones.map((v) => ((v % 12) + 12) % 12)).toContain(((note % 12) + 12) % 12);
        }
      }
    }
    // The last bar leans on the leading note, which pulls back to the first.
    expect(ROUND[7].tones).toContain(-1);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 14].map(scaleStep)).toEqual([0, 2, 3, 5, 7, 8, 11, 12, 24]);
    expect(scaleStep(-1)).toBe(-1);
  });

  it('can be made ready ahead of the hook, once', () => {
    const r = rig();
    r.fight.warm();
    expect([r.heard.waves, r.heard.buffers, r.heard.made]).toEqual([STOP_NAMES.length, 1, 0]);
    r.fight.start('leviathan');
    run(r, 20, () => ({ ...fresh, act: 3, near: 0.9, surge: 1 }));
    r.fight.start('dreamer');
    expect([r.heard.waves, r.heard.buffers]).toEqual([STOP_NAMES.length, 1]);
  });

  for (const id of GIANTS) {
    it(`${id}: the hook is one big chord at once, then the piece starts quietly as it is let go`, () => {
      const r = rig();
      r.ctx.currentTime = 5;
      r.fight.start(id);
      // Six notes on three stops, the pedal on two, and the breath of their speech: all within a twentieth of a second.
      expect(startsIn(r, 5, 5.05)).toBe(6 * 3 + 2 + 1);
      expect(r.heard.spans.every(([, to]) => to <= 5.03 + K.organ.hook.secs + 0.05)).toBe(true);
      const gate = gateOf(r.fight);
      expect(gate.asks).toEqual([]);
      expect(gate.value).toBe(1);
      run(r, K.organ.hook.secs - 0.3, () => fresh);
      expect(r.heard.spans).toHaveLength(21);
      // Then: a chord on the foundations alone and the pedal under it, slow and sparse.
      run(r, 9, () => fresh);
      const piece = r.heard.spans.slice(21);
      expect(piece.length).toBeGreaterThan(8);
      expect(piece.length).toBeLessThan(id === 'dreamer' ? 60 : 40);
      expect(mostAtOnce(piece)).toBeLessThanOrEqual(id === 'dreamer' ? 12 : 8);
      expect(r.heard.bad).toEqual([]);
    });
  }

  it('gains stops, figures and speed as the fight goes on, and more of them in a surge', () => {
    const acts: [GiantFightState, number][] = [];
    for (const state of [fresh, { ...fresh, act: 2 as const, near: 0.45 }, { ...fresh, act: 3 as const, near: 0.9 }]) {
      const r = rig(2);
      r.fight.start('leviathan');
      run(r, 14, () => state);
      const before = r.heard.spans.length;
      run(r, 10, () => state);
      acts.push([state, r.heard.spans.length - before]);
      // A surge on top: more starts in the same time (a run, a trill, the stops it draws).
      const calm = r.heard.spans.length;
      run(r, 2, () => state);
      const surged = r.heard.spans.length;
      run(r, 2, (t) => ({ ...state, surge: Math.min(1, t) }));
      expect(r.heard.spans.length - surged).toBeGreaterThan(surged - calm + 8);
      expect(r.heard.bad).toEqual([]);
    }
    expect(acts[1][1]).toBeGreaterThan(acts[0][1] * 2);
    expect(acts[2][1]).toBeGreaterThan(acts[1][1] * 1.8);
  });

  it('plays a pickup on the warning, a chord on the last stand, and then one thin stop', () => {
    const r = rig(4);
    const close: GiantFightState = { ...fresh, act: 3, near: 0.9 };
    r.fight.start('kraken');
    run(r, 12, () => close);
    let before = r.heard.spans.length;
    const t = r.ctx.currentTime;
    run(r, 0.1, () => ({ ...close, warning: true }));
    // Six notes up the scale, all asked for at once and spread over the warning's second.
    const pickup = r.heard.spans.slice(before).filter(([from, to]) => to - from < 0.4 && from > t + 0.1);
    expect(pickup.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...pickup.map(([from]) => from))).toBeLessThan(t + K.organ.pickup + 0.1);
    // The last stand: every key comes up and the big chord lands with the call.
    run(r, 2, () => close);
    before = r.heard.spans.length;
    const stand = r.ctx.currentTime;
    r.fight.call('kraken', { kind: 'last', near: 0.9, fight: 0 });
    const chord = r.heard.spans.slice(before).filter(([from, to]) => Math.abs(to - from - K.organ.stand.secs) < 0.1);
    expect(chord).toHaveLength(6 * 3 + 2);
    expect(r.heard.spans.slice(0, before).every(([, to]) => to < stand + 0.3)).toBe(true);
    // With the music off the call still sounds but the organ does not answer.
    const mute = rig(4);
    mute.fight.start('kraken');
    run(mute, 12, () => close, false);
    mute.fight.call('kraken', { kind: 'last', near: 0.9, fight: 0 }, false);
    expect(mute.heard.spans.filter(([from, to]) => Math.abs(to - from - K.organ.stand.secs) < 0.1)).toHaveLength(0);
    expect(mute.heard.spans.length).toBeGreaterThan(21);
    // Spent: nothing new but the one stop (and its tremulant), however long it goes on.
    run(r, 3.4, () => close);
    before = r.heard.spans.length;
    const spentAt = r.ctx.currentTime;
    run(r, 6, () => ({ ...close, spent: true, surge: 1, warning: true }));
    expect(r.heard.spans.slice(before)).toHaveLength(2);
    expect(r.heard.spans.slice(0, before).every(([, to]) => to < spentAt + 0.4)).toBe(true);
    r.fight.end('landed');
    expect(allStopped(r.heard)).toBe(true);
    expect(r.heard.bad).toEqual([]);
  });
});

describe('the fight sound through the game’s audio', () => {
  let audio: typeof import('./audio').audio;
  let fake: ReturnType<typeof fakeContext>;
  beforeAll(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    audio = (await import('./audio')).audio;
  });

  it('is safe before the sound has started', () => {
    audio.giantFightEnd('landed');
    audio.giantFightStart('kraken');
    audio.giantFight(1 / 60, calm);
    audio.giantCall('kraken', { kind: 'surge', near: 0.5, fight: 0.5 });
    audio.giantFightEnd('lost');
  });

  it('is safe in any order once it has, and follows the music switch', () => {
    fake = fakeContext();
    Object.assign(audio, { ctx: fake.ctx, master: {}, noiseBuf: {} });
    audio.giantFightEnd('lost');
    audio.giantFight(1 / 60, calm);
    expect(fake.heard.starts).toBe(0);
    audio.giantCall('dreamer', { kind: 'move', near: 0.2, fight: 0.9 });
    const afterCall = fake.heard.starts;
    expect(afterCall).toBeGreaterThan(0);
    audio.giantFightStart('dreamer');
    audio.giantFightStart('dreamer');
    for (let i = 0; i < 90; i++) {
      fake.ctx.currentTime += 1 / 30;
      audio.giantFight(1 / 30, calm);
    }
    const playing = fake.heard.starts;
    expect(playing).toBeGreaterThan(afterCall + 10);
    // Music off mid-fight: its gain is turned down and no more notes are built; on again, they are.
    const bus = (audio as unknown as { fightBus: { gain: FakeParam } }).fightBus.gain;
    expect(audio.toggleMusic()).toBe(false);
    expect(bus.asks[bus.asks.length - 1].slice(0, 2)).toEqual(['target', 0]);
    for (let i = 0; i < 90; i++) {
      fake.ctx.currentTime += 1 / 30;
      audio.giantFight(1 / 30, calm);
    }
    expect(fake.heard.starts).toBe(playing);
    expect(audio.toggleMusic()).toBe(true);
    expect(bus.asks[bus.asks.length - 1].slice(0, 2)).toEqual(['target', 1]);
    for (let i = 0; i < 90; i++) {
      fake.ctx.currentTime += 1 / 30;
      audio.giantFight(1 / 30, calm);
    }
    expect(fake.heard.starts).toBeGreaterThan(playing + 10);
    audio.giantFightEnd('landed');
    audio.giantFightEnd('landed');
    audio.giant('dreamer');
    expect(fake.heard.bad).toEqual([]);
    expect(allStopped(fake.heard)).toBe(true);
  });
});
