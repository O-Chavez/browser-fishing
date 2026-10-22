import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import * as eco from '../src/game/economy';
import { newSave } from '../src/game/state';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { FISH } from '../src/data/content';
import { sellValue } from '../src/game/progression';
import { BOARD_MS, Room } from './room';

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
    const id = room.join(c, res.account);
    return { c, id, acct: res.account };
  };
  const atShop = (p: { id: number }) => {
    const v = MAPS[0].vendor.shop;
    room.handle(p.id, { t: 'pos', x: v.x - 2, z: v.z, yaw: 0 });
  };
  return { room, join, store, atShop, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r) };
};

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

  it('remembers which new-player tips were shown, ignoring unknown ones', () => {
    const { room, join } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'tip', id: 'start' });
    room.handle(a.id, { t: 'tip', id: 'start' });
    room.handle(a.id, { t: 'tip', id: 'bogus' });
    expect(a.acct.save.tips).toEqual(['start']);
    expect(last(a.c, 'state').save.tips).toEqual(['start']);
  });

  it('lets broke players with no bait dig worms at the patch, with a cooldown', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const w = MAPS[0].worms!;
    const s = a.acct.save;
    const dig = () => room.handle(a.id, { t: 'dig' });
    room.handle(a.id, { t: 'pos', x: w.x, z: w.z, yaw: 0 });
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(15);
    s.slots[1] = null;
    s.coins = 0;
    room.handle(a.id, { t: 'pos', x: w.x + 10, z: w.z, yaw: 0 });
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(0);
    room.handle(a.id, { t: 'pos', x: w.x, z: w.z, yaw: 0 });
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(eco.DIG_WORMS);
    // Drop the worms and try again: refused until the cooldown passes.
    room.handle(a.id, { t: 'slot', i: s.slots.findIndex((x) => x?.k === 'bait') });
    room.handle(a.id, { t: 'drop' });
    expect(eco.baitCount(s, 'worm')).toBe(0);
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(0);
    advance(eco.DIG_COOLDOWN_MS);
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(eco.DIG_WORMS);
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
    room.handle(a.id, { t: 'equiprod', id: 'graphite' });
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
    const { room, join, advance, setRoll } = setup() as ReturnType<typeof setup>;
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
    res.account.save.location = 'casino';
    const c = conn();
    other.join(c, res.account);
    room.say = (msg) => [room, other].forEach((r) => r.broadcast(msg));
    room.handle(a.id, { t: 'chat', text: 'hello casino' });
    expect(last(c, 'chat')).toMatchObject({ room: 'r', name: 'Ann', text: 'hello casino' });
  });
});

describe('jumping', () => {
  it('shows a jump to the others on the same map only, and drops ones faster than a jump lasts', () => {
    const { room, join, store, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    const res = store.auth('Cat', 'token-token-token-Cat');
    if (!res.ok) throw new Error(res.msg);
    res.account.save.location = 'casino';
    const c = conn();
    room.join(c, res.account);
    const jumps = (x: { log: ServerMsg[] }) => x.log.filter((m) => m.t === 'jump');
    room.handle(a.id, { t: 'jump' });
    expect(jumps(b.c)).toEqual([{ t: 'jump', id: a.id }]);
    expect(jumps(a.c)).toHaveLength(0);
    expect(jumps(c)).toHaveLength(0);
    advance(100);
    room.handle(a.id, { t: 'jump' });
    expect(jumps(b.c)).toHaveLength(1);
    advance(600);
    room.handle(a.id, { t: 'jump' });
    expect(jumps(b.c)).toHaveLength(2);
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

describe('player list', () => {
  it("gives a new joiner everyone's current level, not the level they joined with", () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.level = 7;
    room.snapshot();
    const b = join('Bob');
    const welcome = b.c.log.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    expect(welcome.players.find((p) => p.id === a.id)?.level).toBe(7);
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
    other.join(c, res.account);
    const a = join('Ann');
    expect(last(c, 'sys')).toEqual({ t: 'sys', text: 'Ann has joined' });
    expect(a.c.log.some((m) => m.t === 'sys')).toBe(false);
  });
});

describe('scaling', () => {
  const snaps = (c: { log: ServerMsg[] }) => c.log.filter((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>[];
  const toCasino = (t: ReturnType<typeof setup>, p: { id: number; acct: { save: { level: number } } }) => {
    p.acct.save.level = 99;
    const g = MAPS[0].gate;
    t.room.handle(p.id, { t: 'pos', x: g.x, z: g.z, yaw: 0 });
    t.room.handle(p.id, { t: 'travel', to: 'casino' });
  };

  it('serializes a broadcast once and hands the same JSON to everyone', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    const seen: (string | undefined)[] = [];
    for (const p of [a, b]) {
      const send = p.c.send;
      p.c.send = (m: ServerMsg, json?: string) => (seen.push(json), send(m));
    }
    t.room.broadcast({ t: 'left', id: 99 });
    expect(seen).toEqual([JSON.stringify({ t: 'left', id: 99 }), JSON.stringify({ t: 'left', id: 99 })]);
  });

  it('only snaps players who moved, and only to their own map', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    const c = t.join('Cat');
    t.room.handle(a.id, { t: 'pos', x: 1, z: 2, yaw: 0 });
    t.room.snapshot();
    expect(last(b.c, 'snap').p).toEqual([[a.id, 1, 2, 0]]);
    b.c.log.length = 0;
    t.room.snapshot();
    expect(snaps(b.c)).toHaveLength(0);

    toCasino(t, c);
    t.room.snapshot();
    a.c.log.length = 0;
    t.room.handle(c.id, { t: 'pos', x: 5, z: 5, yaw: 0 });
    t.room.snapshot();
    expect(snaps(a.c)).toHaveLength(0);
  });

  it('gives a player arriving on a map the positions of everyone already there', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    toCasino(t, a);
    t.room.handle(a.id, { t: 'pos', x: 3, z: 4, yaw: 1 });
    t.room.snapshot();
    t.room.snapshot();
    b.c.log.length = 0;
    toCasino(t, b);
    expect(last(b.c, 'snap').p).toEqual([[a.id, 3, 4, 1]]);
  });

  it('sends the board at most once per BOARD_MS', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    t.room.snapshot();
    const boards = () => b.c.log.filter((m) => m.t === 'board').length;
    const n = boards();
    a.acct.save.coins += 10;
    t.room.snapshot();
    expect(boards()).toBe(n);
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(boards()).toBe(n + 1);
    expect(last(b.c, 'board').coins[a.id]).toBe(a.acct.save.coins);
  });

  it('re-ranks the cached hall of fame when an online player sets a new best', () => {
    const t = setup();
    t.room.hall = () => t.store.hall();
    t.room.hallStale = () => t.store.hallStale();
    const a = t.join('Ann');
    t.room.snapshot();
    const rows = t.store.hall();
    expect(t.store.hall()).toBe(rows);
    a.acct.save.best = { fishId: FISH[0].id, size: 30, value: 500 };
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(last(a.c, 'hall').rows.map((r) => r.name)).toEqual(['Ann']);
  });
});
