import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import { FISH } from '../src/data/content';
import { openKey } from '../src/game/fund';
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
  const funds: Record<string, number> = {};
  const store = new AccountStore();
  const room = new Room('r', funds, MAPS, () => {}, () => now, () => roll);
  const join = (name: string) => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    const c = conn();
    const id = room.join(c, res.account, 'pond');
    return { c, id, acct: res.account };
  };
  return { room, join, funds, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r) };
};

const casino = MAPS.find((m) => m.id === 'casino')!;
const pond = MAPS[0];
const goTo = (room: Room, id: number, s: { x: number; z: number }) => room.handle(id, { t: 'pos', x: s.x, z: s.z, yaw: 0 });
const dear = FISH[FISH.length - 1];

describe('casino travel', () => {
  it('needs the open gate, the level, and the gate nearby', () => {
    const { room, join, funds } = setup();
    const a = join('Ann');
    goTo(room, a.id, pond.gate);
    room.handle(a.id, { t: 'travel', to: 'casino' });
    expect(a.acct.save.location).toBe('pond');
    funds[openKey('pond')] = 1;
    room.handle(a.id, { t: 'travel', to: 'casino' });
    expect(a.acct.save.location).toBe('pond');
    a.acct.save.level = 15;
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
});

describe('casino tables', () => {
  const seat = (name: string) => {
    const ctx = setup();
    const p = ctx.join(name);
    p.acct.save.location = 'casino';
    p.acct.save.slots[2] = { k: 'fish', fishId: dear.id, size: dear.maxSize };
    p.acct.save.held = 2;
    ctx.room.handle(p.id, { t: 'map', map: 'casino' });
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
});
