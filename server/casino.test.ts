import { describe, expect, it } from 'vitest';
import { MAPS, arrivalSpot } from '../src/data/maps';
import { FISH } from '../src/data/content';
import { CASINO_LEVEL } from '../src/data/casino';
import { cosById } from '../src/data/cosmetics';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { Room } from './room';

const conn = () => {
  const log: ServerMsg[] = [];
  return { log, send: (m: ServerMsg) => log.push(m) };
};

const setup = () => {
  let now = 1_000_000;
  let roll = 0.5;
  const store = new AccountStore();
  const room = new Room('r', MAPS, () => {}, () => now, () => roll);
  const join = (name: string, location = 'pond') => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    res.account.save.location = location;
    const c = conn();
    const id = room.join(c, res.account);
    return { c, id, acct: res.account };
  };
  return { room, join, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r) };
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
