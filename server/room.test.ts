import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import * as eco from '../src/game/economy';
import { newSave } from '../src/game/state';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { FISH } from '../src/data/content';
import { fundGoal } from '../src/game/fund';
import { sellValue } from '../src/game/progression';
import { Room } from './room';

const conn = () => {
  const log: ServerMsg[] = [];
  return { log, send: (m: ServerMsg) => log.push(m) };
};
const last = <T extends ServerMsg['t']>(c: { log: ServerMsg[] }, t: T) =>
  [...c.log].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }>;

const setup = () => {
  let now = 1_000_000;
  let roll = 0.5;
  const store = new AccountStore();
  const room = new Room('r', {}, MAPS, () => {}, () => now, () => roll);
  const join = (name: string) => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    const c = conn();
    const id = room.join(c, res.account, 'pond');
    return { c, id, acct: res.account };
  };
  const atShop = (p: { id: number }) => {
    const v = MAPS[0].vendor.shop;
    room.handle(p.id, { t: 'pos', x: v.x - 2, z: v.z, yaw: 0 });
  };
  return { room, join, atShop, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r) };
};

describe('accounts', () => {
  it('claims names, rejects wrong tokens and duplicate logins', () => {
    const store = new AccountStore();
    expect(store.auth('Ann', 'a'.repeat(20)).ok).toBe(true);
    expect(store.auth('Ann', 'a'.repeat(20))).toMatchObject({ ok: false });
    const other = new AccountStore();
    other.auth('Bob', 'b'.repeat(20));
    expect(other.auth('bob', 'c'.repeat(20))).toMatchObject({ ok: false, msg: expect.stringContaining('taken') });
    expect(store.auth('x', 'a'.repeat(20))).toMatchObject({ ok: false });
  });
});

describe('Room economy', () => {
  it('pools coins from every player and caps at the goal', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const b = join('Bob');
    a.acct.save.coins = 1000;
    b.acct.save.coins = 1000;
    atShop(a);
    atShop(b);
    room.handle(a.id, { t: 'give', map: 'pond', coins: 200 });
    room.handle(b.id, { t: 'give', map: 'pond', coins: 900 });
    const goal = fundGoal(MAPS[0], 2);
    expect(room.funds.pond).toBe(goal);
    expect(a.acct.save.coins).toBe(800);
    expect(b.acct.save.coins).toBe(1000 - (goal - 200));
  });

  it('cannot give coins you do not have, or away from the vendor', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'give', map: 'pond', coins: 10 });
    expect(room.funds.pond ?? 0).toBe(0);
    atShop(a);
    room.handle(a.id, { t: 'give', map: 'pond', coins: 9999 });
    expect(room.funds.pond).toBe(newSave().coins);
    expect(a.acct.save.coins).toBe(0);
    room.handle(a.id, { t: 'give', map: 'pond', coins: -5 });
    room.handle(a.id, { t: 'give', map: 'nope', coins: 5 });
    expect(a.acct.save.coins).toBe(0);
  });

  it('only sells and buys at the vendor', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    a.acct.save.slots[2] = { k: 'fish', fishId: 'perch', size: 20 };
    room.handle(a.id, { t: 'slot', i: 2 });
    room.handle(a.id, { t: 'sell' });
    expect(a.acct.save.slots[2]).not.toBeNull();
    atShop(a);
    room.handle(a.id, { t: 'sell' });
    expect(a.acct.save.slots[2]).toBeNull();
    expect(a.acct.save.coins).toBeGreaterThan(20);
    a.acct.save.coins = 500;
    a.acct.save.level = 5;
    room.handle(a.id, { t: 'buyrod', id: 'fiberglass' });
    expect(eco.hasRod(a.acct.save, 'fiberglass')).toBe(false);
    room.handle(a.id, { t: 'buybait', id: 'fly' });
    expect(eco.baitCount(a.acct.save, 'fly')).toBe(0);
    room.handle(a.id, { t: 'buybait', id: 'worm' });
    expect(a.acct.save.coins).toBeLessThan(500);
  });

  it('rolls fish on the server and rejects instant catches', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const ok = last(a.c, 'castok');
    expect(ok.fishId).toBeTruthy();
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(14);

    room.handle(a.id, { t: 'catch' });
    const fishCount = () => a.acct.save.slots.filter((x) => x?.k === 'fish').length;
    expect(fishCount()).toBe(0);

    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    advance(ok.wait * 1000 + 2000);
    room.handle(a.id, { t: 'catch' });
    expect(fishCount()).toBe(1);
    room.handle(a.id, { t: 'catch' });
    expect(fishCount()).toBe(1);
  });

  it('refuses to cast without bait and to equip rods you do not own', () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.slots[1] = null;
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castfail')).toBeTruthy();
    room.handle(a.id, { t: 'equip', id: 'graphite' });
    expect(a.acct.save.rod).toBe('twig');
  });

  it('refuses to cast when every slot is full', () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.slots = [
      { k: 'rod', id: 'twig' },
      { k: 'bait', id: 'worm', n: 5 },
      { k: 'fish', fishId: 'perch', size: 20 },
      { k: 'fish', fishId: 'perch', size: 20 },
    ];
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castfail').msg).toMatch(/full/);
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(5);
  });

  it('drops items, lets others pick them up, and expires them after 30 s', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'pos', x: 0, z: 0, yaw: 0 });
    room.handle(b.id, { t: 'pos', x: 0, z: 0, yaw: 0 });
    room.handle(a.id, { t: 'slot', i: 1 });
    room.handle(a.id, { t: 'drop' });
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(0);
    const [d] = last(b.c, 'drops').list;
    expect(d.item).toMatchObject({ k: 'bait', n: 15 });
    room.handle(b.id, { t: 'pos', x: 40, z: 0, yaw: 0 });
    room.handle(b.id, { t: 'pickup', id: d.id });
    expect(room.drops.all()).toHaveLength(1);
    room.handle(b.id, { t: 'pos', x: 0, z: 0, yaw: 0 });
    room.handle(b.id, { t: 'pickup', id: d.id });
    expect(eco.baitCount(b.acct.save, 'worm')).toBe(30);
    expect(room.drops.all()).toHaveLength(0);

    room.handle(b.id, { t: 'slot', i: 1 });
    room.handle(b.id, { t: 'drop' });
    advance(31_000);
    room.snapshot();
    expect(last(a.c, 'drops').list).toHaveLength(0);
  });

  it('shows the fish a player is holding to everyone', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = join('Bob');
    a.acct.save.slots[2] = { k: 'fish', fishId: 'perch', size: 20 };
    room.handle(a.id, { t: 'slot', i: 2 });
    expect(last(b.c, 'act').act).toMatchObject({ a: 'carry', fish: 'perch' });
    room.handle(a.id, { t: 'slot', i: 0 });
    expect(last(b.c, 'act').act).toBeNull();
  });

  it('shows other players casts and held catches', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cast', x: 1, z: -9 });
    expect(last(b.c, 'act').act).toMatchObject({ a: 'cast', x: 1 });
    advance(20_000);
    room.handle(a.id, { t: 'catch' });
    expect(last(b.c, 'act').act).toMatchObject({ a: 'hold' });
    room.handle(a.id, { t: 'lost' });
    expect(last(b.c, 'act').act).toBeNull();
  });
});

describe('lucky wheel', () => {
  const stage = () => {
    const t = setup();
    const a = t.join('Ann');
    const w = MAPS[0].wheel;
    t.room.handle(a.id, { t: 'pos', x: w.x + 1, z: w.z, yaw: 0 });
    a.acct.save.slots[1] = { k: 'fish', fishId: 'perch', size: 20 };
    a.acct.save.held = 1;
    return { ...t, a };
  };
  it('doubles a fish after the spin finishes, not before', () => {
    const { room, a, advance, setRoll } = stage();
    const base = eco.fishValue(a.acct.save.slots[1] as never);
    setRoll(0.1);
    room.handle(a.id, { t: 'gamble' });
    expect(last(a.c, 'wheel').win).toBe(true);
    room.snapshot();
    expect((a.acct.save.slots[1] as { mult?: number }).mult).toBeUndefined();
    advance(5000);
    room.snapshot();
    expect((a.acct.save.slots[1] as { mult?: number }).mult).toBe(2);
    room.handle(a.id, { t: 'pos', x: MAPS[0].vendor.shop.x - 2, z: MAPS[0].vendor.shop.z, yaw: 0 });
    const coins = a.acct.save.coins;
    room.handle(a.id, { t: 'sell' });
    expect(a.acct.save.coins).toBe(coins + base * 2);
  });
  it('loses the fish, blocks actions mid-spin, and needs the wheel nearby', () => {
    const { room, a, advance, setRoll } = stage();
    setRoll(0.9);
    room.handle(a.id, { t: 'gamble' });
    room.handle(a.id, { t: 'drop' });
    room.handle(a.id, { t: 'slot', i: 0 });
    expect(a.acct.save.held).toBe(1);
    advance(5000);
    room.snapshot();
    expect(a.acct.save.slots[1]).toBeNull();
    room.handle(a.id, { t: 'pos', x: 0, z: 0, yaw: 0 });
    a.acct.save.slots[1] = { k: 'fish', fishId: 'perch', size: 20 };
    a.c.log.length = 0;
    room.handle(a.id, { t: 'gamble' });
    expect(a.c.log.some((m) => m.t === 'wheel')).toBe(false);
  });
});

describe('scaled goal & shinies', () => {
  const goalOf = (n: number) => fundGoal(MAPS[0], n);
  it('raises the goal with the player count', () => {
    expect(goalOf(1)).toBe(MAPS[0].goal);
    expect(goalOf(3)).toBe(MAPS[0].goal * 2);
  });
  it('accepts coins up to the scaled goal and keeps the gate open once reached', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const b = join('Bob');
    atShop(a);
    a.acct.save.coins = 10_000;
    room.handle(a.id, { t: 'give', map: 'pond', coins: 10_000 });
    expect(room.funds.pond).toBe(goalOf(2));
    expect(room.funds['pond:open']).toBe(1);
    const c = join('Cat');
    expect(room.funds.pond).toBe(goalOf(2));
    room.handle(a.id, { t: 'give', map: 'pond', coins: 100 });
    expect(room.funds.pond).toBe(goalOf(2));
    expect(b.id).not.toBe(c.id);
  });
  it('carries a shiny through cast, catch and sale for 5x value', () => {
    const { room, join, atShop, advance, setRoll } = setup() as ReturnType<typeof setup>;
    const a = join('Ann');
    setRoll(0.001);
    room.handle(a.id, { t: 'cast', x: 0, z: 10 });
    const roll = last(a.c, 'castok');
    expect(roll.shiny).toBe(true);
    advance(60_000);
    room.handle(a.id, { t: 'catch' });
    const fish = a.acct.save.slots.find((s) => s?.k === 'fish') as { fishId: string; size: number; shiny?: boolean };
    expect(fish.shiny).toBe(true);
    const plain = sellValue(FISH.find((f) => f.id === fish.fishId)!, fish.size);
    expect(eco.fishValue(fish)).toBe(plain * 5);
  });
});

describe('dropping a carried fish', () => {
  it('works while the fish is held in hand', () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.slots[1] = { k: 'fish', fishId: 'perch', size: 20 };
    room.handle(a.id, { t: 'slot', i: 1 });
    room.handle(a.id, { t: 'drop' });
    expect(a.acct.save.slots[1]).toBeNull();
    expect(room.drops.all()).toHaveLength(1);
  });
});
