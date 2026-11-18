import { describe, expect, it } from 'vitest';
import { HARBOUR, MAPS } from '../src/data/maps';
import { ROCKET_STACK } from '../src/data/rockets';
import { newSave } from '../src/game/state';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { Room } from './room';

const conn = () => {
  const log: ServerMsg[] = [];
  return { log, send: (m: ServerMsg) => log.push(m) };
};
const of = <T extends ServerMsg['t']>(c: { log: ServerMsg[] }, t: T) => c.log.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
const last = <T extends ServerMsg['t']>(c: { log: ServerMsg[] }, t: T) => of(c, t).at(-1);

const CAMP = MAPS[0].camp!;
const CASINO = MAPS.find((m) => m.casino)!;

const setup = () => {
  let now = 1_000_000;
  let saves = 0;
  const store = new AccountStore();
  const room = new Room('r', MAPS, () => saves++, () => now, () => 0.5);
  const join = (name: string, at?: string) => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    if (at) res.account.save.location = at;
    const c = conn();
    const id = room.join(c, res.account);
    return { c, id, acct: res.account, s: res.account.save };
  };
  type P = ReturnType<typeof join>;
  /** At the stall's counter, a step out from its middle toward the fire. */
  const atStall = (p: P) => room.place(p.id, CAMP.stall.x + 2 * Math.sin(CAMP.stall.facing), CAMP.stall.z + 2 * Math.cos(CAMP.stall.facing));
  /** On the jetty, a step back from the rack. */
  const atRack = (p: P) => room.place(p.id, CAMP.rack.x, CAMP.rack.z + 1.5);
  const atPier = (p: P) => room.place(p.id, 0, -7);
  return { room, store, join, atStall, atRack, atPier, advance: (ms: number) => (now += ms), now: () => now, saves: () => saves };
};

describe("buying a rocket at Bram's Kettle", () => {
  it('takes the coins, puts it in the bag, saves, and sends the save back', () => {
    const t = setup();
    const a = t.join('Ann');
    a.s.coins = 3000;
    t.atStall(a);
    const saved = t.saves();
    t.room.handle(a.id, { t: 'buyrocket', id: 'small' });
    expect(a.s.coins).toBe(2750);
    expect(a.s.rockets).toEqual({ small: 1 });
    expect(t.saves()).toBe(saved + 1);
    expect(last(a.c, 'state')!.save.rockets).toEqual({ small: 1 });
    expect(of(a.c, 'rocket')).toHaveLength(0);
  });

  it('stacks rockets of a kind, and keeps the kinds apart', () => {
    const t = setup();
    const a = t.join('Ann');
    a.s.coins = 60_000;
    t.atStall(a);
    for (const id of ['small', 'small', 'big', 'small', 'finale']) t.room.handle(a.id, { t: 'buyrocket', id });
    expect(a.s.rockets).toEqual({ small: 3, big: 1, finale: 1 });
    expect(a.s.coins).toBe(60_000 - 3 * 250 - 2000 - 50_000);
  });

  it('refuses without the coins, and says so', () => {
    const t = setup();
    const a = t.join('Ann');
    a.s.coins = 1999;
    t.atStall(a);
    const saved = t.saves();
    t.room.handle(a.id, { t: 'buyrocket', id: 'big' });
    expect(a.s.coins).toBe(1999);
    expect(a.s.rockets).toEqual({});
    expect(last(a.c, 'notice')!.msg).toMatch(/Not enough coins/);
    expect(t.saves()).toBe(saved);
    a.s.coins = 49_999;
    t.room.handle(a.id, { t: 'buyrocket', id: 'finale' });
    expect(a.s.rockets).toEqual({});
  });

  it('only sells at the stall, only what Bram has, and only up to a full stack', () => {
    const t = setup();
    const a = t.join('Ann');
    a.s.coins = 1e6;
    t.atPier(a);
    t.room.handle(a.id, { t: 'buyrocket', id: 'small' });
    expect(a.s.rockets).toEqual({});
    t.atStall(a);
    for (const id of ['huge', '', 'constructor', '__proto__']) t.room.handle(a.id, { t: 'buyrocket', id });
    t.room.handle(a.id, { t: 'buyrocket', id: { toString: null } as unknown as string });
    expect(a.s.rockets).toEqual({});
    expect(a.s.coins).toBe(1e6);
    a.s.rockets.small = ROCKET_STACK;
    t.room.handle(a.id, { t: 'buyrocket', id: 'small' });
    expect(a.s.rockets.small).toBe(ROCKET_STACK);
    expect(a.s.coins).toBe(1e6);
    // Not from the casino, where there is no stall.
    const c = t.join('Cat', 'casino');
    c.s.coins = 1e6;
    t.room.place(c.id, CAMP.stall.x, CAMP.stall.z);
    t.room.handle(c.id, { t: 'buyrocket', id: 'small' });
    expect(c.s.rockets).toEqual({});
  });

  it('is kept by the account store, and a save from before rockets loads with none', () => {
    const t = setup();
    const a = t.join('Ann');
    a.s.coins = 5000;
    t.atStall(a);
    t.room.handle(a.id, { t: 'buyrocket', id: 'big' });
    t.room.handle(a.id, { t: 'buyrocket', id: 'big' });
    const back = new AccountStore(JSON.parse(JSON.stringify(t.store.snapshot())));
    const res = back.auth('Ann', 'token-token-token-Ann');
    expect(res.ok && res.account.save.rockets).toEqual({ big: 2 });
    expect(res.ok && res.account.save.coins).toBe(1000);
    // An account saved before rockets existed.
    const snap = JSON.parse(JSON.stringify(t.store.snapshot())) as Record<string, { save: Record<string, unknown> }>;
    for (const acct of Object.values(snap)) delete acct.save.rockets;
    const old = new AccountStore(snap).auth('Ann', 'token-token-token-Ann');
    expect(old.ok && old.account.save.rockets).toEqual({});
    expect(old.ok && old.account.save.coins).toBe(1000);
    const older = { ...newSave(), level: 31 } as Record<string, unknown>;
    delete older.rockets;
    snap[Object.keys(snap)[0]].save = older;
    const oldest = new AccountStore(snap).auth('Ann', 'token-token-token-Ann');
    expect(oldest.ok && [oldest.account.save.level, oldest.account.save.rockets]).toEqual([31, {}]);
  });
});

describe("lighting a rocket at the jetty's rack", () => {
  /** Ann by the rack with rockets, Bob far off on the pier, Cat in the casino. */
  const three = () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    const c = t.join('Cat', 'casino');
    a.s.rockets = { small: 2, big: 1, finale: 1 };
    t.atRack(a);
    t.atPier(b);
    return { ...t, a, b, c };
  };

  it('takes it from the bag and tells everyone on the map, the player who lit it too', () => {
    const { room, a, b, saves, now } = three();
    const saved = saves();
    room.handle(a.id, { t: 'lightrocket', id: 'small' });
    expect(a.s.rockets).toEqual({ small: 1, big: 1, finale: 1 });
    expect(saves()).toBe(saved + 1);
    expect(last(a.c, 'state')!.save.rockets.small).toBe(1);
    const up = { t: 'rocket', kind: 'small', at: now(), by: a.id, name: 'Ann' };
    expect(of(a.c, 'rocket')).toHaveLength(1);
    expect(of(b.c, 'rocket')).toHaveLength(1);
    expect(last(a.c, 'rocket')).toMatchObject(up);
    // The same seed for both, so both draw the same bursts.
    expect(last(b.c, 'rocket')).toEqual(last(a.c, 'rocket'));
    expect(Number.isInteger(last(a.c, 'rocket')!.seed)).toBe(true);
  });

  it('is neither seen nor heard in the casino or on a charter', () => {
    const t = three();
    const { room, a, c } = t;
    room.chartersOpen = true;
    const d = t.join('Dan');
    Object.assign(d.s, { seaRod: true, coins: 100_000 });
    room.place(d.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
    room.handle(d.id, { t: 'dive', zone: 0 });
    expect(d.s.location).toBe('sea');
    const before = [c.c.log.length, d.c.log.length];
    room.handle(a.id, { t: 'lightrocket', id: 'finale' });
    expect(of(a.c, 'rocket')).toHaveLength(1);
    expect(of(c.c, 'rocket')).toHaveLength(0);
    expect(of(d.c, 'rocket')).toHaveLength(0);
    // Nothing at all reached them: no notice, no chat line.
    expect([c.c.log.length, d.c.log.length]).toEqual(before);
  });

  it('needs a rocket of that kind in the bag', () => {
    const { room, a, b } = three();
    a.s.rockets = { small: 1 };
    room.handle(a.id, { t: 'lightrocket', id: 'big' });
    expect(a.s.rockets).toEqual({ small: 1 });
    expect(last(a.c, 'notice')!.msg).toMatch(/no rocket/);
    expect(of(a.c, 'rocket')).toHaveLength(0);
    expect(of(b.c, 'rocket')).toHaveLength(0);
    for (const id of ['huge', '', 'toString']) room.handle(a.id, { t: 'lightrocket', id });
    expect(of(b.c, 'rocket')).toHaveLength(0);
    room.handle(a.id, { t: 'lightrocket', id: 'small' });
    expect(a.s.rockets).toEqual({});
    room.handle(a.id, { t: 'lightrocket', id: 'small' });
    expect(of(b.c, 'rocket')).toHaveLength(1);
  });

  it('needs the player at the rack', () => {
    const t = three();
    const { room, a, b } = t;
    t.atPier(a);
    room.handle(a.id, { t: 'lightrocket', id: 'small' });
    t.atStall(a);
    room.handle(a.id, { t: 'lightrocket', id: 'small' });
    expect(a.s.rockets.small).toBe(2);
    expect(of(b.c, 'rocket')).toHaveLength(0);
  });

  it('holds the sky for everyone until the show is over: one rocket at a time, and no other wait', () => {
    const t = three();
    const { room, a, b, advance } = t;
    b.s.rockets = { small: 1, finale: 1 };
    room.handle(a.id, { t: 'lightrocket', id: 'big' });
    // Bob walks over and tries while Ann's big rocket (5 s) is up.
    t.atRack(b);
    advance(4900);
    room.handle(b.id, { t: 'lightrocket', id: 'small' });
    expect(b.s.rockets).toEqual({ small: 1, finale: 1 });
    expect(last(b.c, 'notice')!.msg).toMatch(/Wait for the sky/);
    expect(of(a.c, 'rocket')).toHaveLength(1);
    // Ann can't light a second one either.
    room.handle(a.id, { t: 'lightrocket', id: 'small' });
    expect(a.s.rockets.small).toBe(2);
    advance(100);
    room.handle(b.id, { t: 'lightrocket', id: 'small' });
    expect(b.s.rockets).toEqual({ finale: 1 });
    expect(of(a.c, 'rocket')).toHaveLength(2);
    expect(last(a.c, 'rocket')).toMatchObject({ kind: 'small', by: b.id, name: 'Bob' });
    // The small one holds it 2.5 s, the finale 12 s.
    advance(2499);
    room.handle(a.id, { t: 'lightrocket', id: 'finale' });
    expect(a.s.rockets.finale).toBe(1);
    advance(1);
    room.handle(a.id, { t: 'lightrocket', id: 'finale' });
    expect(a.s.rockets.finale).toBeUndefined();
    advance(11_999);
    room.handle(b.id, { t: 'lightrocket', id: 'finale' });
    expect(b.s.rockets.finale).toBe(1);
    advance(1);
    room.handle(b.id, { t: 'lightrocket', id: 'finale' });
    expect(b.s.rockets).toEqual({});
    expect(of(a.c, 'rocket').map((m) => m.kind)).toEqual(['big', 'small', 'finale', 'finale']);
  });

  it('shows a player who arrives on the map the rocket still in the sky, and nothing once it is over', () => {
    const t = three();
    const { room, a, c, advance } = t;
    room.handle(a.id, { t: 'lightrocket', id: 'finale' });
    const up = last(a.c, 'rocket')!;
    advance(4000);
    // Dan joins at the lake mid-show; Eve joins in the casino.
    const d = t.join('Dan');
    expect(of(d.c, 'rocket')).toEqual([up]);
    const e = t.join('Eve', 'casino');
    expect(of(e.c, 'rocket')).toHaveLength(0);
    // Cat walks out of the casino while it is still up.
    room.place(c.id, CASINO.gate.x, CASINO.gate.z, 0);
    room.handle(c.id, { t: 'travel', to: 'pond' });
    expect(c.s.location).toBe('pond');
    expect(of(c.c, 'rocket')).toEqual([up]);
    advance(8000);
    const f = t.join('Fay');
    expect(of(f.c, 'rocket')).toHaveLength(0);
  });

  it('gives each rocket its own seed', () => {
    let roll = 0.1;
    let now = 0;
    const store = new AccountStore();
    const room = new Room('r', MAPS, () => {}, () => now, () => (roll += 0.07) % 1);
    const res = store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    const c = conn();
    const id = room.join(c, res.account);
    res.account.save.rockets = { small: 3 };
    room.place(id, CAMP.rack.x, CAMP.rack.z + 1.5);
    for (let i = 0; i < 3; i++) {
      room.handle(id, { t: 'lightrocket', id: 'small' });
      now += 2500;
    }
    expect(new Set(of(c, 'rocket').map((m) => m.seed)).size).toBe(3);
  });
});
