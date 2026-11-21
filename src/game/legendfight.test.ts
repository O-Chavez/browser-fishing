import { describe, expect, it } from 'vitest';
import { ZONES } from '../data/dive';
import { LEGEND_FIGHT, type GiantId, type GiantMove } from '../data/legendshow';
import { seaGaps } from './dive';
import { mulberry } from './env';
import { FightDirector, actAt, isGiant, movesIn, nearAt, type FightCue, type FightNow } from './legendfight';
import { rollFishGaps } from './progression';
import { FIGHT_DT, GOOD_MAX, HoldLog, P, Reel, replayFight } from './reel';

const GIANTS: GiantId[] = ['kraken', 'leviathan', 'dreamer'];
const ABYSS = ZONES.length - 1;
const now = (o: Partial<FightNow> = {}): FightNow => ({ progress: P.start, fightLeft: 1, surge: false, exhausted: false, free: true, ...o });
/** A copy of a cue (the director reuses the one it returns). */
const step = (d: FightDirector, dt: number, n: Partial<FightNow> = {}): FightCue => ({ ...d.step(dt, now(n)) });

/** An Abyss giant's gaps on a rod that reads the zone Fair (Brutish at 1.5 times, as the game rolls it). */
const giantGaps = (seed: number) => rollFishGaps(seaGaps(ABYSS, 1, { steps: 7, levels: 0 }), mulberry(seed), ZONES[ABYSS].legendTag).d;

/**
 * A fight played one step at a time by a careful hand (it eases off near the red and takes the line up again below
 * the pull, 0.3 s late), `each` called after every step as the game's frame loop would.
 */
function fight(reel: Reel, each: (surge: boolean) => void = () => {}, log?: HoldLog): void {
  let holding = true, want = true, surges = 0;
  const queue: { at: number; v: boolean }[] = [];
  while (reel.status === 'reeling' && reel.elapsed < 600) {
    const next: boolean = want ? reel.tension <= GOOD_MAX - 0.05 : reel.tension < (reel.surging ? Math.min(reel.need + 0.05, GOOD_MAX - 0.08) : 0.6);
    if (next !== want) queue.push({ at: reel.elapsed + 0.3, v: (want = next) });
    while (queue.length && queue[0].at <= reel.elapsed) holding = queue.shift()!.v;
    log?.push(holding);
    reel.update(FIGHT_DT, holding);
    each(reel.surgeCount !== surges);
    surges = reel.surgeCount;
  }
}

/** A giant's fight with the director fed from the reel every step as the game does: every cue it gave, with the fight's clock. */
function play(id: GiantId, seed: number): { reel: Reel; cues: (FightCue & { t: number; progress: number })[]; d: FightDirector } {
  const reel = new Reel(giantGaps(seed), mulberry(seed * 31 + 7));
  const d = new FightDirector(id, mulberry(seed * 17 + 3));
  const cues: (FightCue & { t: number; progress: number })[] = [];
  fight(reel, (surge) => {
    const c = d.step(FIGHT_DT, { progress: reel.progress, fightLeft: reel.fightLeft, surge, exhausted: reel.exhausted, free: true });
    if (c.entered || c.move || c.boil || c.last || c.call) cues.push({ ...c, t: reel.elapsed, progress: reel.progress });
  });
  return { reel, cues, d };
}

describe('the acts of a giant\'s fight', () => {
  it('starts in act 1 and moves on by the line or by the fight left, whichever is further on', () => {
    const A = LEGEND_FIGHT.acts;
    expect(actAt(P.start, 1)).toBe(1);
    expect(actAt(A.two.progress, 1)).toBe(2);
    expect(actAt(P.start, A.two.fight)).toBe(2);
    expect(actAt(A.three.progress, 1)).toBe(3);
    expect(actAt(P.start, A.three.fight)).toBe(3);
    expect(actAt(A.two.progress - 0.01, A.two.fight + 0.01)).toBe(1);
    // The acts come in order as a fight goes on.
    expect(A.two.progress).toBeLessThan(A.three.progress);
    expect(A.two.fight).toBeGreaterThan(A.three.fight);
    expect(A.two.progress).toBeGreaterThan(P.start);
  });

  it('never goes back, even when the giant takes the line back out', () => {
    const d = new FightDirector('kraken', mulberry(1));
    expect(step(d, 0.1, { progress: 0.4, surge: true }).act).toBe(1);
    expect(step(d, 0.1, { progress: 0.8 }).act).toBe(3);
    expect(step(d, 0.1, { progress: 0.2 }).act).toBe(3);
    const e = new FightDirector('kraken', mulberry(1));
    const seen: number[] = [];
    // A line that goes in and out while the giant tires.
    for (let i = 0; i < 600; i++) seen.push(step(e, 0.1, { progress: 0.45 + 0.3 * Math.sin(i / 20), fightLeft: 1 - i / 600, surge: i % 40 === 5 }).act);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[0]).toBe(1);
    expect(seen[seen.length - 1]).toBe(3);
  });

  it('says when an act begins, once', () => {
    const d = new FightDirector('dreamer', mulberry(2));
    expect(step(d, 0.1, { surge: true }).entered).toBe(false);
    expect(step(d, 0.1, { progress: 0.6 }).entered).toBe(true);
    expect(step(d, 0.1, { progress: 0.6 }).entered).toBe(false);
    expect(step(d, 0.1, { progress: 0.9 }).entered).toBe(true);
    expect(step(d, 0.1, { progress: 0.9 }).entered).toBe(false);
  });

  it('the first surge is always act 1\'s, however fast the line comes in', () => {
    const d = new FightDirector('leviathan', mulberry(11));
    // An easy giant: the line is most of the way in before it has surged once.
    for (let i = 0; i < 20; i++) expect(step(d, 0.1, { progress: 0.8, fightLeft: 0.9 }).act).toBe(1);
    const c = step(d, 0.1, { progress: 0.8, fightLeft: 0.9, surge: true });
    expect(c.act).toBe(1);
    expect(c.boil).toBe(true);
    expect(c.move).toBe(null);
    expect(c.call).toBe('surge');
    const n = step(d, 0.1, { progress: 0.8, fightLeft: 0.9 });
    expect(n.act).toBe(3);
    expect(n.entered).toBe(true);
  });

  it('how far in it is runs from 0 at the hook to 1 at the hull', () => {
    expect(nearAt(P.start, P.start)).toBe(0);
    expect(nearAt(1, P.start)).toBe(1);
    expect(nearAt(0.1, P.start)).toBe(0);
    expect(nearAt((1 + P.start) / 2, P.start)).toBeCloseTo(0.5);
  });
});

describe('a giant\'s moves', () => {
  it('each giant has three or four of its own, and at least two to choose from in each act', () => {
    const all = new Set<GiantMove>();
    for (const id of GIANTS) {
      const mine = new Set<GiantMove>([...movesIn(id, 2), ...movesIn(id, 3)]);
      expect(mine.size).toBeGreaterThanOrEqual(3);
      expect(mine.size).toBeLessThanOrEqual(4);
      expect(movesIn(id, 1)).toEqual([]);
      expect(movesIn(id, 2).length).toBeGreaterThanOrEqual(2);
      expect(movesIn(id, 3).length).toBeGreaterThanOrEqual(2);
      for (const m of mine) {
        // No two giants share a move.
        expect(all.has(m)).toBe(false);
        all.add(m);
      }
    }
    // The Dreamer's are all eyes on the water (nothing dims the lamps or the view: that read as a fault).
    expect(new Set([...movesIn('dreamer', 2), ...movesIn('dreamer', 3)])).toEqual(new Set(['ring', 'trail', 'under']));
    expect(new Set([...movesIn('leviathan', 2), ...movesIn('leviathan', 3)])).toEqual(new Set(['rear', 'coil', 'tail']));
    expect(new Set([...movesIn('kraken', 2), ...movesIn('kraken', 3)])).toEqual(new Set(['arm', 'slap', 'twin', 'grip']));
    expect(isGiant('kraken')).toBe(true);
    expect(isGiant('oarfish')).toBe(false);
    expect(isGiant(undefined)).toBe(false);
  });

  it('act 1 shows no move: a surge is a boil and the giant\'s voice', () => {
    const d = new FightDirector('leviathan', mulberry(3));
    // Past the rest after the hook.
    for (let i = 0; i < 40; i++) step(d, 0.1);
    const c = step(d, 0.1, { surge: true });
    expect(c.act).toBe(1);
    expect(c.move).toBe(null);
    expect(c.boil).toBe(true);
    expect(c.call).toBe('surge');
  });

  it('a surge brings a move of the act, with one call for the two of them', () => {
    for (const id of GIANTS) {
      const d = new FightDirector(id, mulberry(4));
      // Its first surge is act 1's; the next, past the rest between moves, brings a move.
      expect(step(d, 0.1, { progress: 0.6, surge: true }).boil).toBe(true);
      for (let i = 0; i < 30; i++) expect(step(d, 0.1, { progress: 0.6 }).move).toBe(null);
      const c = step(d, 0.1, { progress: 0.6, surge: true });
      expect(movesIn(id, 2)).toContain(c.move);
      expect(c.call).toBe('move');
      expect(c.boil).toBe(false);
      expect(d.move).toBe(c.move);
      expect(d.moves).toBe(1);
    }
  });

  it('never makes the same move twice running, through a long fight and across the acts', () => {
    for (const id of GIANTS)
      for (let seed = 1; seed <= 20; seed++) {
        const d = new FightDirector(id, mulberry(seed));
        const made: GiantMove[] = [];
        for (let i = 0; i < 4000; i++) {
          const progress = i < 1500 ? 0.6 : 0.8;
          // A surge every 4 seconds.
          const c = step(d, 0.1, { progress, surge: i % 40 === 0 });
          if (c.move) {
            expect(movesIn(id, c.act)).toContain(c.move);
            made.push(c.move);
          }
        }
        expect(made.length).toBeGreaterThan(50);
        for (let i = 1; i < made.length; i++) expect(made[i]).not.toBe(made[i - 1]);
        // Every move of both acts turns up.
        expect(new Set(made)).toEqual(new Set([...movesIn(id, 2), ...movesIn(id, 3)]));
      }
  });

  it('never makes two moves close together, and one comes anyway after a while without a surge', () => {
    const F = LEGEND_FIGHT;
    const d = new FightDirector('kraken', mulberry(5));
    const at: number[] = [];
    let t = 0;
    // Surges every second: far closer together than moves may come.
    for (let i = 0; i < 600; i++) {
      t += 0.05;
      if (step(d, 0.05, { progress: 0.6, surge: i % 20 === 0 }).move) at.push(t);
    }
    expect(at.length).toBeGreaterThan(5);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(F.glimpseRest - 1e-6);
    // No surge after its first: the next comes within the gap, and the next.
    const e = new FightDirector('kraken', mulberry(6));
    const quiet: number[] = [];
    t = 0;
    expect(step(e, 0.05, { surge: true }).boil).toBe(true);
    for (let i = 0; i < 800; i++) {
      t += 0.05;
      if (step(e, 0.05, { progress: 0.6 }).move) quiet.push(t);
    }
    expect(quiet[0]).toBeGreaterThanOrEqual(F.glimpseGap[0] - 0.06);
    expect(quiet[0]).toBeLessThanOrEqual(F.glimpseGap[1] + 0.06);
    expect(quiet.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < quiet.length; i++) {
      expect(quiet[i] - quiet[i - 1]).toBeGreaterThanOrEqual(F.glimpseGap[0] - 0.06);
      expect(quiet[i] - quiet[i - 1]).toBeLessThanOrEqual(F.glimpseGap[1] + 0.06);
    }
  });

  it('a surge while its body is busy gets the voice only', () => {
    const d = new FightDirector('leviathan', mulberry(7));
    for (let i = 0; i < 40; i++) step(d, 0.1, { progress: 0.6, free: false });
    const c = step(d, 0.1, { progress: 0.6, surge: true, free: false });
    expect(c.move).toBe(null);
    expect(c.call).toBe('surge');
    expect(d.moves).toBe(0);
  });
});

describe('the last stand', () => {
  it('is front-loaded: each giant\'s height and its bolt come inside the first second, its crash by a second and a half', () => {
    const F = LEGEND_FIGHT;
    const K = F.stand.kraken, V = F.stand.leviathan, D = F.stand.dreamer;
    // The bolt behind it (the Dreamer's own shuts its eyes).
    expect(F.lastStand.bolt).toBeLessThanOrEqual(1);
    expect(D.bolt).toBeLessThanOrEqual(1);
    // The Kraken's arms are all up before its bolt and all down by 1.5 s.
    const up = (K.arms - 1) * K.lag + K.rise;
    expect(up).toBeLessThanOrEqual(F.lastStand.bolt + 0.2);
    expect(up + K.hold + K.fall).toBeLessThanOrEqual(1.5);
    // The Leviathan is at its height at the bolt and has fallen by 1.5 s.
    expect(V.up).toBeLessThanOrEqual(F.lastStand.bolt + 0.1);
    expect(V.up + V.hold).toBeGreaterThan(F.lastStand.bolt);
    expect(V.up + V.hold + V.down).toBeLessThanOrEqual(1.5);
    // Every one of the Dreamer's eyes is open before its bolt.
    expect((D.ring + D.boat - 1) * D.gap + 0.35).toBeLessThanOrEqual(D.bolt);
    // What is left is the fall and the wallow, which the landing cuts.
    expect(F.lastStand.secs).toBeGreaterThan(1.5);
  });

  it('comes the moment the giant is exhausted, once, and leaves it spent', () => {
    const L = LEGEND_FIGHT.lastStand;
    const d = new FightDirector('kraken', mulberry(8));
    for (let i = 0; i < 100; i++) expect(step(d, 0.1, { progress: 0.6, fightLeft: 0.2, surge: i % 40 === 0 }).last).toBe(false);
    expect(d.stood).toBe(false);
    const c = step(d, 0.1, { progress: 0.6, fightLeft: 0, exhausted: true });
    expect(c.last).toBe(true);
    expect(c.call).toBe('last');
    expect(c.move).toBe(null);
    expect(d.stood).toBe(true);
    // Not spent until it has played out.
    expect(d.spent).toBe(false);
    let again = 0, moves = 0, calls = 0;
    for (let i = 0; i < 600; i++) {
      // (A reel makes no more surges once the fish is exhausted; a staged one would still get no move.)
      const n = step(d, 0.1, { progress: 0.6 + i / 2000, fightLeft: 0, exhausted: true, surge: i % 50 === 25 });
      if (n.last) again++;
      if (n.move || n.boil) moves++;
      if (n.call === 'last' || n.call === 'move') calls++;
      expect(d.spent).toBe((i + 1) * 0.1 >= L.secs - 1e-6);
    }
    expect(again).toBe(0);
    expect(moves).toBe(0);
    expect(calls).toBe(0);
    expect(d.spent).toBe(true);
  });

  it('failing that, is the first surge to start with the line nearly in', () => {
    const L = LEGEND_FIGHT.lastStand;
    const d = new FightDirector('dreamer', mulberry(9));
    step(d, 0.1, { surge: true });
    for (let i = 0; i < 40; i++) step(d, 0.1, { progress: L.near - 0.05 });
    // A surge short of it is an ordinary move.
    const a = step(d, 0.1, { progress: L.near - 0.01, fightLeft: 0.5, surge: true });
    expect(a.last).toBe(false);
    expect(a.move).not.toBe(null);
    // The line nearly in but no surge: nothing.
    expect(step(d, 0.1, { progress: L.near + 0.02, fightLeft: 0.5 }).last).toBe(false);
    const b = step(d, 0.1, { progress: L.near + 0.02, fightLeft: 0.5, surge: true });
    expect(b.last).toBe(true);
    expect(b.call).toBe('last');
    expect(b.move).toBe(null);
    // A later surge (the giant had fight left) gets its voice and nothing else.
    for (let i = 0; i < 50; i++) step(d, 0.1, { progress: 0.9, fightLeft: 0.4 });
    const c = step(d, 0.1, { progress: 0.9, fightLeft: 0.4, surge: true });
    expect(c.last).toBe(false);
    expect(c.move).toBe(null);
    expect(c.call).toBe('surge');
    expect(d.spent).toBe(true);
  });

  it('on the reel bots: once a fight at most, never a move after it, and nearly every Fair giant landed gets one', () => {
    let landed = 0, stood = 0;
    for (const id of GIANTS)
      for (let seed = 1; seed <= 12; seed++) {
        const { reel, cues, d } = play(id, seed);
        const last = cues.filter((c) => c.last);
        expect(last.length).toBeLessThanOrEqual(1);
        expect(last.length === 1).toBe(d.stood);
        // The acts in order, each begun once.
        const acts = cues.map((c) => c.act);
        for (let i = 1; i < acts.length; i++) expect(acts[i]).toBeGreaterThanOrEqual(acts[i - 1]);
        expect(cues.filter((c) => c.entered).length).toBeLessThanOrEqual(2);
        // Never the same move twice running; none in act 1; none once the last stand has come.
        const made = cues.filter((c) => c.move);
        for (let i = 1; i < made.length; i++) expect(made[i].move).not.toBe(made[i - 1].move);
        for (const c of made) expect(c.act).toBeGreaterThan(1);
        if (last.length) for (const c of cues.filter((c) => c.t > last[0].t)) expect(c.move ?? c.boil).toBeFalsy();
        // One call a frame at most, and the last stand's is the last of its kind.
        expect(cues.filter((c) => c.call === 'last').length).toBe(last.length);
        if (reel.status === 'caught') {
          landed++;
          if (d.stood) stood++;
        }
      }
    expect(landed).toBeGreaterThan(25);
    expect(stood / landed).toBeGreaterThan(0.9);
  });
});

describe('presentation only', () => {
  it('a directed fight is the same fight: the reel ends as it would have, and the server\'s replay agrees', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const gaps = giantGaps(seed);
      // The fight alone.
      const alone = new Reel(gaps, mulberry(seed * 31 + 7));
      fight(alone);
      // The same fight with a director reading it every step (it is handed numbers, never the reel or its dice).
      const reel = new Reel(gaps, mulberry(seed * 31 + 7));
      const d = new FightDirector('kraken', mulberry(99));
      const log = new HoldLog();
      fight(reel, (surge) => void d.step(FIGHT_DT, { progress: reel.progress, fightLeft: reel.fightLeft, surge, exhausted: reel.exhausted, free: true }), log);
      expect(d.moves).toBeGreaterThan(0);
      expect(reel.status).toBe(alone.status);
      expect(reel.elapsed).toBe(alone.elapsed);
      expect(reel.surgeCount).toBe(alone.surgeCount);
      expect(reel.wear).toEqual(alone.wear);
      const replay = replayFight(gaps, seed * 31 + 7, log.encode())!;
      expect(replay.status).toBe(reel.status);
      expect(replay.progress).toBe(reel.progress);
    }
  });
});

describe('staging', () => {
  it('holds an act, plays a move or the last stand on demand, and can stop the fight\'s own', () => {
    const d = new FightDirector('kraken', mulberry(10));
    d.auto = false;
    d.forceAct = 3;
    for (let i = 0; i < 100; i++) {
      // (Exhausted, as far as the director is told: with its own cues stopped, even that brings no last stand.)
      const c = d.staged(d.step(0.1, now({ surge: i % 30 === 0, exhausted: true })));
      expect(c.act).toBe(3);
      expect(c.move).toBe(null);
      expect(c.last).toBe(false);
    }
    expect(d.force('rear')).toBe(false);
    expect(d.force('grip')).toBe(true);
    const c = { ...d.staged(d.step(0.1, now())) };
    expect(c.move).toBe('grip');
    expect(c.call).toBe('move');
    d.forceAct = null;
    expect(d.staged(d.step(0.1, now())).act).toBe(1);
    expect(d.forceLast()).toBe(true);
    const l = { ...d.staged(d.step(0.1, now())) };
    expect(l.last).toBe(true);
    expect(l.call).toBe('last');
    expect(d.forceLast()).toBe(false);
    expect(d.force('grip')).toBe(false);
  });
});
