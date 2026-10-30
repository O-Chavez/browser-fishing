import { describe, expect, it } from 'vitest';
import { MAPS, arrivalSpot } from '../src/data/maps';
import { FISH } from '../src/data/content';
import { CASINO_LEVEL, ROULETTE_MS } from '../src/data/casino';
import { cosById } from '../src/data/cosmetics';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { fishValue } from '../src/game/economy';
import { Room, SPIN_MS } from './room';

const conn = () => {
  const log: ServerMsg[] = [];
  return { log, send: (m: ServerMsg) => log.push(m) };
};

const setup = () => {
  let now = 1_000_000;
  let roll = 0.5;
  const store = new AccountStore();
  const room = new Room('r', MAPS, () => {}, () => now, () => roll);
  room.recordGamble = (a, win, g) => store.gambled(a, win, g);
  room.records = () => store.records();
  const join = (name: string, location = 'pond') => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    res.account.save.location = location;
    const c = conn();
    const id = room.join(c, res.account);
    return { c, id, acct: res.account };
  };
  return { room, store, join, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r) };
};

const casino = MAPS.find((m) => m.id === 'casino')!;
const pond = MAPS[0];
const goTo = (room: Room, id: number, s: { x: number; z: number }) => room.handle(id, { t: 'pos', x: s.x, z: s.z, yaw: 0 });
const dear = FISH[FISH.length - 1];

describe('casino travel', () => {
  it('needs the casino level and the gate nearby', () => {
    const { room, join } = setup();
    const a = join('Ann');
    goTo(room, a.id, pond.gate);
    a.acct.save.level = CASINO_LEVEL - 1;
    room.handle(a.id, { t: 'travel', to: 'casino' });
    expect(a.acct.save.location).toBe('pond');
    expect(a.c.log.some((m) => m.t === 'notice' && m.msg.includes(`level ${CASINO_LEVEL}`))).toBe(true);
    a.acct.save.level = CASINO_LEVEL;
    goTo(room, a.id, pond.spawn);
    room.handle(a.id, { t: 'travel', to: 'casino' });
    expect(a.acct.save.location).toBe('pond');
    goTo(room, a.id, pond.gate);
    room.handle(a.id, { t: 'travel', to: 'casino' });
    expect(a.acct.save.location).toBe('casino');
    goTo(room, a.id, casino.gate);
    room.handle(a.id, { t: 'travel', to: 'pond' });
    expect(a.acct.save.location).toBe('pond');
  });

  it('brings players back from the casino at the pond gate, not the dock', () => {
    const { room, join } = setup();
    const a = join('Ann', 'casino');
    const b = join('Bob', 'casino');
    for (const p of [a, b]) {
      goTo(room, p.id, casino.gate);
      room.handle(p.id, { t: 'travel', to: 'pond' });
    }
    // Bob's arrival snap carries where the server put Ann.
    const snap = b.c.log.findLast((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>;
    const at = pond.gateArrival!;
    expect(snap.p).toContainEqual([a.id, at.x, at.z, 0]);
    expect(Math.hypot(at.x - pond.spawn.x, at.z - pond.spawn.z)).toBeGreaterThan(20);
  });

  it('uses the spawn for logins and every other arrival', () => {
    expect(arrivalSpot(pond)).toBe(pond.spawn);
    expect(arrivalSpot(pond, 'pond')).toBe(pond.spawn);
    expect(arrivalSpot(pond, 'casino')).toBe(pond.gateArrival);
    expect(arrivalSpot(casino, 'pond')).toBe(casino.spawn);
  });

  it("can't be skipped by a client claiming to be in the casino", () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.slots[2] = { k: 'fish', fishId: dear.id, size: dear.maxSize };
    // Older clients sent { t: 'map' }; the server no longer takes the map from the client.
    room.handle(a.id, { t: 'map', map: 'casino' } as never);
    goTo(room, a.id, casino.casino!.prizes);
    room.handle(a.id, { t: 'cashout', i: 2 });
    expect(a.acct.save.chips).toBe(0);
    expect(a.acct.save.slots[2]).not.toBeNull();
  });

  it('joins on the saved map, falling back to the pond', () => {
    const { join } = setup();
    const a = join('Ann', 'casino');
    const b = join('Bob', 'nowhere');
    expect(b.acct.save.location).toBe('pond');
    // Bob's welcome lists Ann on the map the server put her on.
    const welcome = b.c.log.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    expect(welcome.players.find((p) => p.id === a.id)?.map).toBe('casino');
  });

  it('refuses to cast inside the casino', () => {
    const { room, join } = setup();
    const a = join('Ann', 'casino');
    const bait = a.acct.save.slots[1];
    room.handle(a.id, { t: 'cast', x: 0, z: 40 });
    expect(a.c.log.some((m) => m.t === 'castok')).toBe(false);
    expect(a.acct.save.slots[1]).toEqual(bait);
  });

  it('ignores map ids that name Object prototype members', () => {
    const { room, join } = setup();
    const a = join('Ann');
    goTo(room, a.id, pond.gate);
    for (const to of ['constructor', 'toString', '__proto__']) {
      expect(() => room.handle(a.id, { t: 'travel', to })).not.toThrow();
      expect(() => room.handle(a.id, { t: 'map', map: to } as never)).not.toThrow();
    }
    expect(() => room.handle(a.id, { t: 'travel', to: 'pond' })).not.toThrow();
    expect(a.acct.save.location).toBe('pond');
  });
});

describe('casino tables', () => {
  const seat = (name: string) => {
    const ctx = setup();
    const p = ctx.join(name, 'casino');
    p.acct.save.slots[2] = { k: 'fish', fishId: dear.id, size: dear.maxSize };
    p.acct.save.held = 2;
    return { ...ctx, p };
  };

  it('roulette needs the table, locks actions, then multiplies or destroys', () => {
    const { room, p, advance, setRoll } = seat('Ann');
    room.handle(p.id, { t: 'roulette', bet: 'red', i: 2 });
    expect(p.c.log.some((m) => m.t === 'roulette')).toBe(false);
    goTo(room, p.id, casino.casino!.roulette);
    setRoll(0.03);
    room.handle(p.id, { t: 'roulette', bet: 'red', i: 2 });
    expect(p.c.log.some((m) => m.t === 'roulette')).toBe(true);
    room.handle(p.id, { t: 'drop' });
    expect(p.acct.save.slots[2]).not.toBeNull();
    advance(5000);
    room.handle(p.id, { t: 'slot', i: 2 });
    expect((p.acct.save.slots[2] as { mult?: number }).mult).toBe(2);
    setRoll(0.06);
    room.handle(p.id, { t: 'roulette', bet: 'red', i: 2 });
    advance(5000);
    room.handle(p.id, { t: 'slot', i: 0 });
    expect(p.acct.save.slots[2]).toBeNull();
  });

  it('settles a roulette spin when the player disconnects', () => {
    const { room, p } = seat('Bob');
    goTo(room, p.id, casino.casino!.roulette);
    room.handle(p.id, { t: 'roulette', bet: 'red', i: 2 });
    room.leave(p.id);
    expect(p.acct.save.slots[2]).toBeNull();
  });

  it('blackjack blocks other actions and pays out on stand', () => {
    const { room, p } = seat('Cy');
    goTo(room, p.id, casino.casino!.blackjack);
    room.handle(p.id, { t: 'bj', a: 'deal', i: 2 });
    const view = [...p.c.log].reverse().find((m) => m.t === 'bj') as Extract<ServerMsg, { t: 'bj' }>;
    expect(view.view).toBeTruthy();
    if (!view.view!.done) {
      room.handle(p.id, { t: 'drop' });
      expect(p.acct.save.slots[2]).not.toBeNull();
      room.handle(p.id, { t: 'bj', a: 'stand' });
    }
    const final = [...p.c.log].reverse().find((m) => m.t === 'bj') as Extract<ServerMsg, { t: 'bj' }>;
    expect(final.view!.done).toBe(true);
    const item = p.acct.save.slots[2] as { mult?: number } | null;
    expect(final.view!.factor === 0 ? item === null : item !== null).toBe(true);
  });

  it('blackjack double down needs coins for the fish value and refuses without them', () => {
    const { room, p, setRoll } = seat('Flo');
    goTo(room, p.id, casino.casino!.blackjack);
    setRoll(0.3);
    room.handle(p.id, { t: 'bj', a: 'deal', i: 2 });
    const last = () => ([...p.c.log].reverse().find((m) => m.t === 'bj') as Extract<ServerMsg, { t: 'bj' }>).view!;
    // A fixed roll deals the same hand every time; 0.3 leaves a live hand to double on.
    expect(last().canDouble).toBe(true);
    p.acct.save.coins = 0;
    room.handle(p.id, { t: 'bj', a: 'double' });
    expect(p.c.log.some((m) => m.t === 'notice' && m.msg.includes('Doubling down costs'))).toBe(true);
    expect(last()).toMatchObject({ done: false, canDouble: true });
    p.acct.save.coins = 10_000_000;
    room.handle(p.id, { t: 'bj', a: 'double' });
    expect(last()).toMatchObject({ done: true, stake: expect.any(Number) });
    expect(p.acct.save.coins).toBe(10_000_000 - (last().result === 'push' ? 0 : last().stake));
  });

  it('turns fish in for chips at the prize counter and sells perks', () => {
    const { room, p } = seat('Di');
    room.handle(p.id, { t: 'cashout', i: 2 });
    expect(p.acct.save.chips).toBe(0);
    goTo(room, p.id, casino.casino!.prizes);
    room.handle(p.id, { t: 'cashout', i: 2 });
    expect(p.acct.save.chips).toBeGreaterThan(5);
    expect(p.acct.save.slots[2]).toBeNull();
    p.acct.save.chips += 100;
    const chips = p.acct.save.chips;
    room.handle(p.id, { t: 'buyperk', id: 'gloves' });
    expect(p.acct.save.perks).toContain('gloves');
    expect(p.acct.save.chips).toBeLessThan(chips);
  });

  it('sells casino cosmetics for chips only, and only at the prize counter', () => {
    const { room, p } = seat('Eve');
    p.acct.save.chips = 1000;
    p.acct.save.coins = 1_000_000;
    // Away from the counter nothing sells.
    room.handle(p.id, { t: 'buycos', id: 'tophat' });
    expect(p.acct.save.owned).toEqual([]);
    goTo(room, p.id, casino.casino!.prizes);
    // Stall items are not sold at the casino, even with coins to spare.
    room.handle(p.id, { t: 'buycos', id: 'crown' });
    expect(p.acct.save.owned).toEqual([]);
    room.handle(p.id, { t: 'buycos', id: 'tophat' });
    expect(p.acct.save.owned).toEqual(['tophat']);
    expect(p.acct.save.chips).toBe(1000 - cosById('tophat')!.price);
    expect(p.acct.save.coins).toBe(1_000_000);
    // Not enough chips: coins never pay for casino items.
    p.acct.save.chips = 10;
    room.handle(p.id, { t: 'buycos', id: 'jackpot' });
    expect(p.acct.save.owned).toEqual(['tophat']);
    expect(p.acct.save.chips).toBe(10);
    room.handle(p.id, { t: 'equip', slot: 'hat', id: 'tophat' });
    expect(p.acct.save.look.hat).toBe('tophat');
  });
});

describe('casino records', () => {
  type Fish = { k: 'fish'; fishId: string; size: number; shiny?: boolean; mult?: number };
  const records = (log: ServerMsg[]) => log.filter((m): m is Extract<ServerMsg, { t: 'records' }> => m.t === 'records').map((m) => m.records);
  /** A player in the casino holding a fish worth about `value` coins in slot 2. */
  const seat = (ctx: ReturnType<typeof setup>, name: string, value = 1000, shiny = false) => {
    const p = ctx.join(name, 'casino');
    const fish: Fish = { k: 'fish', fishId: dear.id, size: dear.maxSize, ...(shiny ? { shiny } : {}) };
    fish.mult = value / fishValue(fish);
    p.acct.save.slots[2] = fish;
    p.acct.save.held = 2;
    return { ...p, fish };
  };
  const spin = (ctx: ReturnType<typeof setup>, p: { id: number }, bet: 'red' | 'black' | 'green', roll: number) => {
    goTo(ctx.room, p.id, casino.casino!.roulette);
    ctx.setRoll(roll);
    ctx.room.handle(p.id, { t: 'roulette', bet, i: 2 });
    ctx.advance(ROULETTE_MS);
    ctx.room.snapshot();
  };
  const hand = (ctx: ReturnType<typeof setup>, p: { id: number; c: { log: ServerMsg[] } }, roll: number, a?: 'stand' | 'double') => {
    goTo(ctx.room, p.id, casino.casino!.blackjack);
    ctx.setRoll(roll);
    ctx.room.handle(p.id, { t: 'bj', a: 'deal', i: 2 });
    if (a) ctx.room.handle(p.id, { t: 'bj', a });
    return ([...p.c.log].reverse().find((m) => m.t === 'bj') as Extract<ServerMsg, { t: 'bj' }>).view!;
  };

  it('starts empty and is sent on join', () => {
    const ctx = setup();
    const a = ctx.join('Ann', 'casino');
    expect(records(a.c.log)).toEqual([{ win: null, loss: null }]);
  });

  it('records a roulette win when the spin is applied, not when it is rolled, and tells everyone', () => {
    const ctx = setup();
    const a = seat(ctx, 'Ann', 1000, true);
    const b = ctx.join('Bob');
    goTo(ctx.room, a.id, casino.casino!.roulette);
    ctx.setRoll(0.03); // red
    ctx.room.handle(a.id, { t: 'roulette', bet: 'red', i: 2 });
    expect(ctx.store.records().win).toBeNull();
    ctx.advance(ROULETTE_MS);
    ctx.room.snapshot();
    const win = { name: 'Ann', amount: 1000, game: 'roulette', fishId: dear.id, shiny: true, at: expect.any(Number) };
    expect(ctx.store.records()).toEqual({ win, loss: null });
    expect(records(b.c.log).at(-1)).toEqual({ win, loss: null });
  });

  it('records a green win at its full payout, and a roulette loss as the fish value', () => {
    const ctx = setup();
    const a = seat(ctx, 'Ann', 500);
    spin(ctx, a, 'green', 0);
    expect(ctx.store.records().win).toMatchObject({ amount: 500 * 15, game: 'roulette' });
    spin(ctx, a, 'red', 0.06); // black: the 8,000 coin fish is gone
    expect(a.acct.save.slots[2]).toBeNull();
    expect(ctx.store.records().loss).toMatchObject({ name: 'Ann', amount: 8000, game: 'roulette' });
  });

  it('records the Lucky Wheel', () => {
    const ctx = setup();
    const w = MAPS[0].wheel;
    const a = seat(ctx, 'Ann', 300);
    goTo(ctx.room, a.id, w);
    ctx.setRoll(0.1);
    ctx.room.handle(a.id, { t: 'gamble' });
    ctx.advance(SPIN_MS);
    ctx.room.snapshot();
    expect(ctx.store.records().win).toMatchObject({ amount: 300, game: 'wheel', fishId: dear.id });
    ctx.setRoll(0.9);
    ctx.room.handle(a.id, { t: 'gamble' });
    ctx.advance(SPIN_MS);
    ctx.room.snapshot();
    expect(ctx.store.records().loss).toMatchObject({ amount: 600, game: 'wheel' });
  });

  it('counts blackjack, with a double down net of the coins it cost', () => {
    const ctx = setup();
    const a = seat(ctx, 'Ann', 1000);
    a.acct.save.coins = 5000;
    // A fixed roll deals the same hand every time: 0.31 wins a double down, 0.3 busts one.
    expect(hand(ctx, a, 0.31, 'double')).toMatchObject({ result: 'win', stake: 1000, factor: 4 });
    // The fish went from 1,000 to 4,000 but the double down cost 1,000 coins: 2,000 gained.
    expect(a.acct.save.coins).toBe(4000);
    expect(ctx.store.records().win).toMatchObject({ amount: 2000, game: 'blackjack' });
    expect(hand(ctx, a, 0.3, 'double')).toMatchObject({ result: 'bust', stake: 4000 });
    // The 4,000 coin fish and the 4,000 coin stake.
    expect(ctx.store.records().loss).toMatchObject({ amount: 8000, game: 'blackjack' });
  });

  it('counts a natural blackjack and a plain win, and ignores a push', () => {
    const ctx = setup();
    const a = seat(ctx, 'Ann', 1000);
    expect(hand(ctx, a, 0.19, 'stand')).toMatchObject({ result: 'push' });
    expect(ctx.store.records()).toEqual({ win: null, loss: null });
    expect(hand(ctx, a, 0.04, 'stand')).toMatchObject({ result: 'win' });
    expect(ctx.store.records().win).toMatchObject({ amount: 1000 });
    expect(hand(ctx, a, 0.01)).toMatchObject({ result: 'blackjack' });
    expect(ctx.store.records().win).toMatchObject({ amount: 4000 });
  });

  it('keeps the record when a smaller or equal result comes in, and only tells rooms when it falls', () => {
    const ctx = setup();
    const a = seat(ctx, 'Ann', 1000);
    spin(ctx, a, 'red', 0.03);
    const b = seat(ctx, 'Bob', 400);
    const sent = records(b.c.log).length;
    spin(ctx, b, 'red', 0.03);
    expect(ctx.store.records().win).toMatchObject({ name: 'Ann', amount: 1000 });
    expect(records(b.c.log)).toHaveLength(sent);
    // A tie leaves it with whoever got there first.
    b.acct.save.slots[2] = { ...b.fish, mult: 1000 / fishValue({ ...b.fish, mult: 1 }) };
    spin(ctx, b, 'red', 0.03);
    expect(ctx.store.records().win).toMatchObject({ name: 'Ann' });
    expect(records(b.c.log)).toHaveLength(sent);
    spin(ctx, b, 'red', 0.03);
    expect(ctx.store.records().win).toMatchObject({ name: 'Bob', amount: 2000 });
    expect(records(a.c.log).at(-1)!.win).toMatchObject({ name: 'Bob', amount: 2000 });
  });

  it('survives a reload and a progress reset', () => {
    const ctx = setup();
    const a = seat(ctx, 'Ann', 1000);
    spin(ctx, a, 'red', 0.03);
    spin(ctx, a, 'red', 0.06);
    const before = ctx.store.records();
    ctx.room.handle(a.id, { t: 'reset' });
    expect(ctx.store.records()).toEqual(before);
    const back = new AccountStore(JSON.parse(JSON.stringify(ctx.store.snapshot())));
    expect(back.records()).toEqual(before);
    expect(before).toMatchObject({ win: { name: 'Ann', amount: 1000 }, loss: { name: 'Ann', amount: 2000 } });
  });
});
