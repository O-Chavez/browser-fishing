import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import { SKIP, skipCount, skipFlightMs } from '../src/data/skip';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { Room } from './room';
import { SkipDay } from './skipbest';

const conn = () => {
  const log: ServerMsg[] = [];
  return { log, send: (m: ServerMsg) => log.push(m) };
};
type Log = { log: ServerMsg[] };
const skips = (x: Log) => x.log.filter((m): m is Extract<ServerMsg, { t: 'skip' }> => m.t === 'skip');
const bests = (x: Log) => x.log.filter((m): m is Extract<ServerMsg, { t: 'skipbest' }> => m.t === 'skipbest');

const PILE = MAPS[0].camp!.stones;
/** Noon UTC, so a day's turn is twelve hours off. */
const NOON = Date.UTC(2026, 10, 17, 12);
/** A release that skips `n` times with even luck (0.5), found on the gauge below the sweet spot. */
const releaseFor = (n: number): number => {
  for (let p = SKIP.sweet; p >= 0; p -= 0.001) if (skipCount(p, () => 0.5) === n) return +p.toFixed(3);
  throw new Error(`no release gives ${n}`);
};

const setup = () => {
  let now = NOON;
  let roll = 0.5;
  const store = new AccountStore();
  const day = new SkipDay(now);
  const mk = (name: string) => {
    const room = new Room(name, MAPS, () => {}, () => now, () => roll);
    room.skips = day;
    return room;
  };
  const rooms = [mk('r'), mk('other')];
  // As the server does: a word for everyone goes to every room.
  for (const r of rooms) {
    r.say = (msg) => rooms.forEach((o) => o.broadcast(msg));
    r.sayOthers = (msg) => rooms.forEach((o) => o !== r && o.broadcast(msg));
  }
  const join = (name: string, room = rooms[0], location?: string) => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    if (location) res.account.save.location = location;
    const c = conn();
    const id = room.join(c, res.account);
    return { c, id, acct: res.account, room };
  };
  /** Stands a player by the pile. */
  const atPile = (p: { id: number; room: Room }, dx = -1, dz = 0) => p.room.place(p.id, PILE.x + dx, PILE.z + dz, 0);
  return { rooms, room: rooms[0], join, atPile, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r), now: () => now };
};

describe('skipping stones', () => {
  it('counts the skips from the release and tells everyone on the map, the thrower too', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    const c = t.join('Cat', t.room, 'casino');
    t.atPile(a, -1.004, 0.5);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    const msg = { t: 'skip', id: a.id, n: 12, a: 0, x: +(PILE.x - 1).toFixed(2), z: PILE.z + 0.5 };
    expect(skips(a.c)).toEqual([msg]);
    expect(skips(b.c)).toEqual([msg]);
    expect(skips(c.c)).toHaveLength(0);
    // It changes nothing on the save.
    expect(a.c.log.filter((m) => m.t === 'state')).toHaveLength(0);
  });

  it('takes its luck from the server: the same release can skip one more or fewer, and strays a little either way', () => {
    const t = setup();
    const a = t.join('Ann');
    t.atPile(a);
    const p = releaseFor(5);
    const got: number[] = [];
    const strays: number[] = [];
    for (const r of [0, 0.5, 0.9999]) {
      t.setRoll(r);
      t.room.handle(a.id, { t: 'skip', p });
      got.push(skips(a.c).at(-1)!.n);
      strays.push(skips(a.c).at(-1)!.a);
      t.advance(10_000);
    }
    expect(got[1]).toBe(5);
    expect(got[0]).toBeLessThanOrEqual(5);
    expect(got[2]).toBeGreaterThanOrEqual(5);
    expect(got[2] - got[0]).toBeLessThanOrEqual(2);
    const most = (SKIP.spread * Math.PI) / 180;
    expect(strays[0]).toBeCloseTo(-most, 2);
    expect(strays[1]).toBe(0);
    expect(strays[2]).toBeCloseTo(most, 2);
  });

  it('ignores a release that is no number from 0 to 1', () => {
    const t = setup();
    const a = t.join('Ann');
    t.atPile(a);
    for (const p of [-0.1, 1.1, NaN, Infinity, '0.75', null, undefined, {}, [0.75]]) t.room.handle(a.id, { t: 'skip', p: p as number });
    expect(skips(a.c)).toHaveLength(0);
    t.room.handle(a.id, { t: 'skip', p: 0 });
    expect(skips(a.c)).toHaveLength(1);
    expect(skips(a.c)[0].n).toBe(0);
  });

  it('allows one stone in the air for each player: the next waits until the last has sunk', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    t.atPile(a);
    t.atPile(b, 0, 1);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(a.c)).toHaveLength(1);
    // Someone else's stone doesn't wait for hers.
    t.room.handle(b.id, { t: 'skip', p: 0.2 });
    expect(skips(a.c)).toHaveLength(2);
    t.advance(skipFlightMs(12) - 1);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(a.c)).toHaveLength(2);
    t.advance(1);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(a.c)).toHaveLength(3);
    // A plop is over sooner.
    t.advance(skipFlightMs(12));
    t.room.handle(a.id, { t: 'skip', p: 0 });
    t.advance(skipFlightMs(0));
    t.room.handle(a.id, { t: 'skip', p: 0 });
    expect(skips(a.c)).toHaveLength(5);
  });

  it('only throws for a player by the pile, on their feet, with no fish on the line', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    // Too far: the far end of the beach, and the terrace.
    t.room.place(a.id, PILE.x - (SKIP.reach + SKIP.slack + 0.1), PILE.z, 0);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    t.room.place(a.id, 20.5, 2.7, 0);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(b.c)).toHaveLength(0);
    // Seated within the server's leeway of the pile (the nearest real seat is further off, so this is a tampered client's case): no throw until they get up.
    t.atPile(a, -2, 0);
    t.room.handle(a.id, { t: 'emote', id: 'sit' });
    t.advance(60_000);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(b.c)).toHaveLength(0);
    t.room.handle(a.id, { t: 'emote', id: null });
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(b.c)).toHaveLength(1);
    // A fish on the line: no throw.
    t.advance(10_000);
    t.room.handle(a.id, { t: 'cast', x: PILE.x - 6, z: PILE.z - 9 });
    expect(a.c.log.some((m) => m.t === 'castok')).toBe(true);
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(b.c)).toHaveLength(1);
    // In the casino there is no pile.
    const c = t.join('Cat', t.room, 'casino');
    t.room.handle(c.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(c.c)).toHaveLength(0);
  });

  it("puts the day's best on every sign on the server, and gives it to whoever joins", () => {
    const t = setup();
    const a = t.join('Ann');
    const far = t.join('Dan', t.rooms[1]);
    const c = t.join('Cat', t.room, 'casino');
    // Joining brings the sign's line: none yet.
    expect(bests(a.c)).toEqual([{ t: 'skipbest', best: null }]);
    t.atPile(a);
    t.room.handle(a.id, { t: 'skip', p: releaseFor(7) });
    // `by` is the thrower's id in her own room, so only that room is told it (once each); the other room gets the best alone.
    const best = { t: 'skipbest', best: { n: 7, name: 'Ann' }, by: a.id };
    expect(bests(a.c).slice(1)).toEqual([best]);
    expect(bests(c.c).slice(1)).toEqual([best]);
    expect(far.id).toBe(a.id);
    expect(bests(far.c).slice(1)).toEqual([{ t: 'skipbest', best: { n: 7, name: 'Ann' } }]);
    // The stone goes out before the sign's word, so a client can hold the sign until that stone has sunk.
    expect(a.c.log.findIndex((m) => m.t === 'skip')).toBeLessThan(a.c.log.findLastIndex((m) => m.t === 'skipbest'));
    const late = t.join('Eve');
    expect(bests(late.c)).toEqual([{ t: 'skipbest', best: { n: 7, name: 'Ann' } }]);
    const lateFar = t.join('Fay', t.rooms[1]);
    expect(bests(lateFar.c)).toEqual([{ t: 'skipbest', best: { n: 7, name: 'Ann' } }]);
  });

  it('keeps the holder on a tie or a lower count, and says nothing', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    t.atPile(a);
    t.atPile(b, 0, 1);
    t.room.handle(a.id, { t: 'skip', p: releaseFor(7) });
    const said = bests(a.c).length;
    t.room.handle(b.id, { t: 'skip', p: releaseFor(7) });
    t.advance(10_000);
    t.room.handle(b.id, { t: 'skip', p: releaseFor(4) });
    t.advance(10_000);
    t.room.handle(a.id, { t: 'skip', p: releaseFor(7) });
    expect(skips(a.c)).toHaveLength(4);
    expect(bests(a.c)).toHaveLength(said);
    expect(t.room.skips.best(t.now())).toEqual({ n: 7, name: 'Ann' });
    // A plop never takes an empty sign either; one more skip takes it.
    t.advance(10_000);
    t.room.handle(b.id, { t: 'skip', p: releaseFor(8) });
    expect(bests(a.c).at(-1)).toEqual({ t: 'skipbest', best: { n: 8, name: 'Bob' }, by: b.id });
  });

  it("puts the holder's new name on every sign when they rename, here or from the dev console, online or not", () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    const far = t.join('Dan', t.rooms[1]);
    t.atPile(a);
    t.atPile(b, 0, 1);
    t.room.handle(a.id, { t: 'skip', p: releaseFor(7) });
    // Someone else's rename says nothing about the sign.
    const said = bests(far.c).length;
    b.acct.name = 'Rob';
    t.room.renamed(b.id, 'Bob');
    expect(bests(far.c)).toHaveLength(said);
    // Ann renames herself (the server sets the account's name, then tells her room).
    a.acct.name = 'Anna';
    t.room.renamed(a.id, 'Ann');
    for (const x of [a, b, far]) expect(bests(x.c).at(-1)).toEqual({ t: 'skipbest', best: { n: 7, name: 'Anna' } });
    expect(bests(far.c)).toHaveLength(said + 1);
    // The dev console renames her after she has left: every room is asked, the signs change once.
    t.room.leave(a.id);
    a.acct.name = 'Annie';
    t.rooms.forEach((r) => r.renamedAccount(a.acct, 'Anna'));
    expect(bests(far.c).slice(said + 1)).toEqual([{ t: 'skipbest', best: { n: 7, name: 'Annie' } }]);
    expect(bests(t.join('Eve').c)).toEqual([{ t: 'skipbest', best: { n: 7, name: 'Annie' } }]);
  });

  it('refuses a throw with the line out, and a throw ends the emote the server remembers', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    t.atPile(a);
    // The line is out with no fish on it yet (the server's own record of the player, as the welcome lists it).
    const info = (b.c.log.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).players.find((p) => p.id === a.id)!;
    info.act = { a: 'cast', x: PILE.x - 6, z: PILE.z - 9 };
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    info.act = { a: 'hold', fish: 'bluegill', size: 12 };
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(b.c)).toHaveLength(0);
    // Carrying a fish in hand is no bar.
    info.act = { a: 'carry', fish: 'bluegill', size: 12 };
    t.room.handle(a.id, { t: 'skip', p: SKIP.sweet });
    expect(skips(b.c)).toHaveLength(1);
    // A wave, then a throw: someone who joins a moment later is not shown the wave again.
    t.advance(10_000);
    t.room.handle(a.id, { t: 'emote', id: 'wave' });
    expect(t.join('Cat').c.log.filter((m) => m.t === 'emote')).toHaveLength(1);
    t.room.handle(a.id, { t: 'skip', p: 0 });
    expect(t.join('Dan').c.log.filter((m) => m.t === 'emote')).toHaveLength(0);
  });

  it('never puts a plop on an empty sign', () => {
    const t = setup();
    const a = t.join('Ann');
    t.atPile(a);
    t.room.handle(a.id, { t: 'skip', p: 0 });
    expect(skips(a.c)).toHaveLength(1);
    expect(bests(a.c)).toEqual([{ t: 'skipbest', best: null }]);
  });

  it('clears every sign when the UTC day turns, once', () => {
    const t = setup();
    const a = t.join('Ann');
    const far = t.join('Dan', t.rooms[1]);
    t.atPile(a);
    t.room.handle(a.id, { t: 'skip', p: releaseFor(9) });
    t.advance(11 * 3_600_000);
    t.rooms.forEach((r) => r.snapshot());
    expect(bests(a.c).at(-1)!.best).toEqual({ n: 9, name: 'Ann' });
    const said = bests(far.c).length;
    t.advance(3_600_000);
    t.rooms.forEach((r) => r.snapshot());
    t.rooms.forEach((r) => r.snapshot());
    expect(bests(a.c).at(-1)).toEqual({ t: 'skipbest', best: null });
    expect(bests(far.c)).toHaveLength(said + 1);
    expect(bests(far.c).at(-1)).toEqual({ t: 'skipbest', best: null });
    // The new day's first skip takes the sign, however few.
    t.room.handle(a.id, { t: 'skip', p: releaseFor(2) });
    expect(bests(a.c).at(-1)).toEqual({ t: 'skipbest', best: { n: 2, name: 'Ann' }, by: a.id });
    expect(bests(far.c).at(-1)).toEqual({ t: 'skipbest', best: { n: 2, name: 'Ann' } });
    expect(t.join('Eve').c.log.filter((m) => m.t === 'skipbest')).toEqual([{ t: 'skipbest', best: { n: 2, name: 'Ann' } }]);
  });
});
