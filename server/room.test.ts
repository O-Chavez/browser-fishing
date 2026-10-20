import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import * as eco from '../src/game/economy';
import { newSave } from '../src/game/state';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { FISH } from '../src/data/content';
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
  const room = new Room('r', MAPS, () => {}, () => now, () => roll);
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
  return { room, join, store, atShop, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r) };
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
  it('only opens bottles when standing next to them', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = MAPS[0].town.bottles[0];
    const before = a.acct.save.coins;
    room.handle(a.id, { t: 'pos', x: b.x + 30, z: b.z, yaw: 0 });
    room.handle(a.id, { t: 'bottle', id: b.id });
    expect(a.acct.save.coins).toBe(before);
    room.handle(a.id, { t: 'pos', x: b.x, z: b.z, yaw: 0 });
    room.handle(a.id, { t: 'bottle', id: b.id });
    room.handle(a.id, { t: 'bottle', id: b.id });
    expect(a.acct.save.coins).toBe(before + eco.BOTTLE_COINS);
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
    room.handle(a.id, { t: 'buyrod', id: 'carbon' });
    expect(eco.ownsRod(a.acct.save, 'carbon')).toBe(false);
    room.handle(a.id, { t: 'buybait', id: 'pearl' });
    expect(eco.baitCount(a.acct.save, 'pearl')).toBe(0);
    room.handle(a.id, { t: 'buyrod', id: 'fiberglass' });
    expect(eco.ownsRod(a.acct.save, 'fiberglass')).toBe(true);
    room.handle(a.id, { t: 'equiprod', id: 'twig' });
    expect(a.acct.save.rod).toBe('twig');
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

  it('resets progress but keeps the account, name and body color', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const s = a.acct.save;
    s.coins = 999;
    s.xp = 500;
    s.look.color = 0x123456;
    s.locker.rods.push('graphite');
    room.handle(a.id, { t: 'reset' });
    expect(s.coins).toBe(newSave().coins);
    expect(s.xp).toBe(0);
    expect(s.locker.rods).toEqual(newSave().locker.rods);
    expect(s.look.color).toBe(0x123456);
    expect(last(a.c, 'state')).toBeTruthy();
    expect(a.acct.online).toBe(true);
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

describe('shinies & fishing spots', () => {
  it('slows bites when casting from the shore instead of the pier', () => {
    const { room, join } = setup() as ReturnType<typeof setup>;
    const a = join('Ann');
    room.handle(a.id, { t: 'pos', x: 0, z: 0, yaw: 0 });
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castok').spot).toBe('prime');
    room.handle(a.id, { t: 'pos', x: 6, z: 20, yaw: 0 });
    room.handle(a.id, { t: 'cast', x: 0, z: 10 });
    expect(last(a.c, 'castok').spot).toBe('shore');
  });
  it('keeps offline players on the hall of fame', () => {
    const { room, join, store } = setup();
    const a = join('Ann');
    a.acct.save.best = { fishId: FISH[0].id, size: 30, value: 500 };
    const b = join('Bob');
    b.acct.save.best = { fishId: FISH[0].id, size: 30, value: 900 };
    room.hall = () => store.hall();
    room.leave(a.id);
    a.acct.online = false;
    room.snapshot();
    const rows = last(b.c, 'hall').rows;
    expect(rows.map((r) => r.name)).toEqual(['Bob', 'Ann']);
  });
  it('flags a perfect cast in the roll', () => {
    const { room, join } = setup() as ReturnType<typeof setup>;
    const a = join('Ann');
    room.handle(a.id, { t: 'cast', x: 0, z: 10, perfect: true });
    expect(last(a.c, 'castok').perfect).toBe(true);
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

describe('cosmetics, selling by slot and the board', () => {
  it('buys at the vendor only, equips owned items, and broadcasts looks', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const b = join('Bob');
    a.acct.save.coins = 500;
    room.handle(a.id, { t: 'buycos', id: 'cap' });
    expect(a.acct.save.owned).toEqual([]);
    atShop(a);
    room.handle(a.id, { t: 'buycos', id: 'cap' });
    room.handle(a.id, { t: 'buycos', id: 'cap' });
    room.handle(a.id, { t: 'buycos', id: 'crown' });
    expect(a.acct.save.owned).toEqual(['cap']);
    expect(a.acct.save.coins).toBe(350);
    // Casino items are never sold at the stall, whatever the coins or chips.
    a.acct.save.coins = 1_000_000;
    a.acct.save.chips = 1000;
    room.handle(a.id, { t: 'buycos', id: 'visor' });
    expect(a.acct.save.owned).toEqual(['cap']);
    a.acct.save.coins = 350;
    a.acct.save.chips = 0;
    room.handle(a.id, { t: 'equip', slot: 'hat', id: 'crown' });
    room.handle(a.id, { t: 'equip', slot: 'shirt', id: 'cap' });
    expect(a.acct.save.look.hat).toBeNull();
    room.handle(a.id, { t: 'equip', slot: 'hat', id: 'cap' });
    expect(last(b.c, 'look')).toMatchObject({ id: a.id, look: { hat: 'cap' } });
    room.handle(a.id, { t: 'color', color: 0xff0000 });
    expect(a.acct.save.look.color).toBe(0xff0000);
    room.handle(a.id, { t: 'color', color: -5 });
    expect(a.acct.save.look.color).toBe(0xff0000);
  });

  it('sells the clicked hotbar slot and reports coins to everyone', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const b = join('Bob');
    a.acct.save.slots[3] = { k: 'fish', fishId: 'perch', size: 20 };
    room.handle(a.id, { t: 'sell', i: 3 });
    expect(a.acct.save.slots[3]).not.toBeNull();
    atShop(a);
    const before = a.acct.save.coins;
    room.handle(a.id, { t: 'sell', i: 3 });
    expect(a.acct.save.slots[3]).toBeNull();
    expect(a.acct.save.coins).toBeGreaterThan(before);
    room.snapshot();
    expect(last(b.c, 'board').coins[a.id]).toBe(a.acct.save.coins);
  });
});

describe('chat', () => {
  it('sends accepted lines to the room, censored, and tells only the sender to slow down', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'chat', text: '  hi  shit ' });
    expect(last(b.c, 'chat')).toMatchObject({ room: 'r', id: a.id, name: 'Ann', map: 'pond', text: 'hi ****' });
    room.handle(a.id, { t: 'chat', text: 'two' });
    room.handle(a.id, { t: 'chat', text: 'three' });
    b.c.log.length = 0;
    room.handle(a.id, { t: 'chat', text: 'four' });
    expect(b.c.log.some((m) => m.t === 'chat')).toBe(false);
    expect(last(a.c, 'notice').msg).toContain('Slow down');
  });

  it('works mid-spin, and the server can route lines to every room', () => {
    const { room, join, store } = setup();
    const a = join('Ann');
    (room as any).members.get(a.id).spin = { at: Infinity, run: () => {} };
    const other = new Room('other', MAPS);
    const res = store.auth('Cat', 'token-token-token-Cat');
    if (!res.ok) throw new Error(res.msg);
    const c = conn();
    other.join(c, res.account, 'casino');
    room.say = (msg) => [room, other].forEach((r) => r.broadcast(msg));
    room.handle(a.id, { t: 'chat', text: 'hello casino' });
    expect(last(c, 'chat')).toMatchObject({ room: 'r', name: 'Ann', text: 'hello casino' });
  });
});

describe('faces', () => {
  it('changes face, tells the room, and keeps it through a reset', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'face', id: 'toothy' });
    expect(a.acct.save.look.face).toBe('toothy');
    expect(last(b.c, 'look')).toMatchObject({ id: a.id, look: { face: 'toothy' } });
    room.handle(a.id, { t: 'face', id: 'not-a-face' });
    expect(a.acct.save.look.face).toBe('toothy');
    room.handle(a.id, { t: 'reset' });
    expect(a.acct.save.look.face).toBe('toothy');
  });
});

describe('join notices', () => {
  it('tells everyone else on the server, but not the player who joined', () => {
    const { room, join, store } = setup();
    const other = new Room('other', MAPS);
    room.say = (msg) => [room, other].forEach((r) => r.broadcast(msg));
    const res = store.auth('Cat', 'token-token-token-Cat');
    if (!res.ok) throw new Error(res.msg);
    const c = conn();
    other.join(c, res.account, 'pond');
    const a = join('Ann');
    expect(last(c, 'sys')).toEqual({ t: 'sys', text: 'Ann has joined' });
    expect(a.c.log.some((m) => m.t === 'sys')).toBe(false);
  });
});
