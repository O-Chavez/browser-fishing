import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import * as eco from '../src/game/economy';
import { newSave } from '../src/game/state';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { FISH } from '../src/data/content';
import { sellValue, xpForNextLevel } from '../src/game/progression';
import { BOARD_MS, CLOCK_MS, Room } from './room';
import * as smoke from '../src/game/smoke';
import { SmokeStats } from './smokestats';
import { mulberry } from '../src/game/env';
import { FIGHT_DT, GOOD_MAX, HoldLog, MAX_FIGHT_STEPS, Reel, type Gaps, type ReelTune } from '../src/game/reel';
import { charterFee, pearlsFor } from '../src/game/dive';
import { DIVE } from '../src/data/dive';
import { HARBOUR } from '../src/data/maps';

const conn = () => {
  const log: ServerMsg[] = [];
  return { log, send: (m: ServerMsg) => log.push(m) };
};
const last = <T extends ServerMsg['t']>(c: { log: ServerMsg[] }, t: T) =>
  [...c.log].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }>;

/** Plays a fight with perfect reactions, riding high in the green in a surge: the reel and the button log it wrote. */
const playFight = (d: Gaps, seed: number, hold = (r: Reel) => (r.surging ? r.tension < GOOD_MAX - 0.03 : r.tension < 0.6), tune?: ReelTune) => {
  const log = new HoldLog();
  const r = new Reel(d, mulberry(seed), tune);
  while (r.status === 'reeling' && log.steps < MAX_FIGHT_STEPS) {
    const h = hold(r);
    log.push(h);
    r.update(FIGHT_DT, h);
  }
  return { reel: r, h: log.encode(), ms: r.elapsed * 1000 };
};
/** The `catch` message for the fish in the latest `castok`, fought by `playFight`. */
const fought = (c: { log: ServerMsg[] }) => {
  const ok = last(c, 'castok');
  return { t: 'catch', h: playFight(ok.d ?? { strength: 0, weight: 0 }, ok.seed ?? 0).h } as const;
};

const setup = () => {
  let now = 1_000_000;
  let roll = 0.5;
  /** Rolls used once each, in order, before `roll` again. */
  const rolls: number[] = [];
  const store = new AccountStore();
  const room = new Room('r', MAPS, () => {}, () => now, () => rolls.shift() ?? roll);
  const join = (name: string) => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    const c = conn();
    const id = room.join(c, res.account);
    return { c, id, acct: res.account };
  };
  const atShop = (p: { id: number }) => {
    const v = MAPS[0].vendor.shop;
    room.place(p.id, v.x - 2, v.z, 0);
  };
  return { room, join, store, atShop, advance: (ms: number) => (now += ms), setRoll: (r: number) => (roll = r), queueRolls: (...r: number[]) => rolls.push(...r) };
};

describe('Room economy', () => {
  it('only opens bottles when standing next to them', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = MAPS[0].town.bottles[0];
    const before = a.acct.save.coins;
    room.place(a.id, b.x + 30, b.z, 0);
    room.handle(a.id, { t: 'bottle', id: b.id });
    expect(a.acct.save.coins).toBe(before);
    room.place(a.id, b.x, b.z, 0);
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

  it('remembers the tip nudge milestones a player has seen', () => {
    const { room, join } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'tip', id: 'nudge20' });
    room.handle(a.id, { t: 'tip', id: 'nudge20' });
    room.handle(a.id, { t: 'tip', id: 'nudge25' });
    expect(a.acct.save.tips).toEqual(['nudge20']);
  });

  it('lets broke players with no bait dig worms at the patch, with a cooldown', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const w = MAPS[0].worms!;
    const s = a.acct.save;
    const dig = () => room.handle(a.id, { t: 'dig' });
    room.place(a.id, w.x, w.z, 0);
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(15);
    s.slots[1] = null;
    s.coins = 0;
    room.place(a.id, w.x + 10, w.z, 0);
    dig();
    expect(eco.baitCount(s, 'worm')).toBe(0);
    room.place(a.id, w.x, w.z, 0);
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
    const worms = eco.baitCount(a.acct.save, 'worm');
    room.handle(a.id, { t: 'buybait', id: 'worm', n: 10 });
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(worms);
    room.handle(a.id, { t: 'buybait', id: 'worm', n: 25 });
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(worms + 25);
  });

  it('spools line only at the vendor, from its stock, unlocked, paid for and a step up', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const s = a.acct.save;
    Object.assign(s, { level: 6, coins: 1_000 });
    room.handle(a.id, { t: 'buyline', id: 'mono' });
    expect(s.line).toBe('twine'); // not at the vendor
    atShop(a);
    room.handle(a.id, { t: 'buyline', id: 'nope' });
    room.handle(a.id, { t: 'buyline', id: 'braid' }); // level 9
    expect(s.line).toBe('twine');
    room.handle(a.id, { t: 'buyline', id: 'fluoro' });
    expect(s.line).toBe('fluoro');
    expect(s.coins).toBe(500);
    room.handle(a.id, { t: 'buyline', id: 'mono' }); // lighter
    room.handle(a.id, { t: 'buyline', id: 'fluoro' }); // the same
    expect(s.line).toBe('fluoro');
    expect(s.coins).toBe(500);
    s.level = 20;
    room.handle(a.id, { t: 'buyline', id: 'moonsilk' }); // 8 000 coins
    expect(s.line).toBe('fluoro');
  });

  it('sells the Deep Sea Rod at Captain Reed only, once, and nothing goes in the bag', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const s = a.acct.save;
    Object.assign(s, { level: 20, coins: 130_000 });
    room.handle(a.id, { t: 'buysearod' });
    expect(s.seaRod).toBe(false);
    // Marlow's stall doesn't sell it any more.
    atShop(a);
    room.handle(a.id, { t: 'buysearod' });
    expect(s.seaRod).toBe(false);
    room.place(a.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
    room.handle(a.id, { t: 'buysearod' });
    expect(s).toMatchObject({ seaRod: true, coins: 30_000 });
    expect(s.locker.rods).toEqual([]);
    expect(last(a.c, 'state').save).toMatchObject({ seaRod: true });
    room.handle(a.id, { t: 'buysearod' });
    expect(s.coins).toBe(30_000);
  });

  it('sells rod steps, Abyss levels and boat parts at Captain Reed only, saying why not', () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const s = a.acct.save;
    Object.assign(s, { level: 20, seaRod: true, coins: 10_000_000, pearls: 100 });
    const atReed = () => room.place(a.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
    // Not at the stall, nor anywhere but Reed's stand.
    atShop(a);
    room.handle(a.id, { t: 'boatpart' });
    room.handle(a.id, { t: 'rodstep' });
    expect(s).toMatchObject({ boatParts: 0, rodStep: 0, pearls: 100 });
    atReed();
    // Step 1 is on sale only once the Drop-off is open.
    room.handle(a.id, { t: 'rodstep' });
    expect(s.rodStep).toBe(0);
    expect(last(a.c, 'notice').msg).toMatch(/Storm sail/);
    room.handle(a.id, { t: 'boatpart' });
    expect(s).toMatchObject({ boatParts: 1, pearls: 75 });
    expect(last(a.c, 'state').save).toMatchObject({ boatParts: 1, pearls: 75 });
    // The next part needs 150 pearls.
    room.handle(a.id, { t: 'boatpart' });
    expect(s.boatParts).toBe(1);
    expect(last(a.c, 'notice').msg).toMatch(/Kelp cutter needs 150/);
    room.handle(a.id, { t: 'rodstep' });
    room.handle(a.id, { t: 'rodstep' });
    room.handle(a.id, { t: 'rodstep' });
    expect(s).toMatchObject({ rodStep: 2, coins: 10_000_000 - 160_000 });
    // Abyss levels come after the eighth step.
    room.handle(a.id, { t: 'abysslevel' });
    expect(s.abyssLevels).toBe(0);
    Object.assign(s, { rodStep: 8, boatParts: 4 });
    room.handle(a.id, { t: 'abysslevel' });
    expect(s).toMatchObject({ abyssLevels: 1, coins: 10_000_000 - 160_000 - 2_625_000 });
  });

  it("sells the hold's levels at Captain Reed only, in order, each once its zone is open, saying why not", () => {
    const { room, join, atShop } = setup();
    const a = join('Ann');
    const s = a.acct.save;
    Object.assign(s, { level: 20, seaRod: true, coins: 1_000_000 });
    // Not at the stall.
    atShop(a);
    s.boatParts = 1;
    room.handle(a.id, { t: 'holdlevel' });
    expect(s).toMatchObject({ holdLevel: 0, coins: 1_000_000 });
    room.place(a.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
    room.handle(a.id, { t: 'holdlevel' });
    expect(s).toMatchObject({ holdLevel: 1, coins: 975_000 });
    expect(last(a.c, 'state').save).toMatchObject({ holdLevel: 1, coins: 975_000 });
    // Level 2 waits for Kelp Deep.
    room.handle(a.id, { t: 'holdlevel' });
    expect(s.holdLevel).toBe(1);
    expect(last(a.c, 'notice').msg).toMatch(/Hold level 2 goes on sale once the Kelp cutter/);
    s.boatParts = 4;
    room.handle(a.id, { t: 'holdlevel' });
    expect(s).toMatchObject({ holdLevel: 2, coins: 675_000 });
    // Level 3 costs 8,000,000 coins.
    room.handle(a.id, { t: 'holdlevel' });
    expect(s).toMatchObject({ holdLevel: 2, coins: 675_000 });
    expect(last(a.c, 'notice').msg).toBe('Hold level 3 costs 8,000,000 coins.');
    Object.assign(s, { holdLevel: 4, coins: 1e9 });
    room.handle(a.id, { t: 'holdlevel' });
    expect(s).toMatchObject({ holdLevel: 4, coins: 1e9 });
    expect(last(a.c, 'notice').msg).toBe('You have the biggest hold.');
  });

  it('a pond fish lost to a gear wall is noted in the Fishdex as seen', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const s = a.acct.save;
    // Minnow bait on the Twig Rod and Twine: tier 2 and 3 fish bite, and both are over the gear.
    s.level = 10;
    s.bait = 'minnow';
    s.slots[1] = { k: 'bait', id: 'minnow', n: 50 };
    // Reeling in before the fight, or a log cut short, sees nothing: the fish was never on the line.
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    room.handle(a.id, { t: 'lost' });
    expect(s.seen).toEqual([]);
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const half = new HoldLog();
    for (let i = 0; i < 30; i++) half.push(true);
    room.handle(a.id, { t: 'lost', h: half.encode() });
    expect(s.seen).toEqual([]);
    // A fight held straight through: a fish over the gear is lost (snap or run-off) and seen; a tier 1 fish is simply landed.
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const ok = last(a.c, 'castok');
    const fish = FISH.find((f) => f.id === ok.fishId)!;
    const held = playFight(ok.d!, ok.seed!, () => true);
    expect(fish.tier > 1 ? ['snapped', 'escaped'] : ['caught']).toContain(held.reel.status);
    room.handle(a.id, { t: 'lost', h: held.h });
    expect(s.seen).toEqual(fish.tier > 1 ? [fish.id] : []);
    if (fish.tier > 1) expect(last(a.c, 'state').save.seen).toEqual([fish.id]);
    // Saying it twice changes nothing.
    room.handle(a.id, { t: 'lost', h: held.h });
    expect(s.seen.length).toBeLessThanOrEqual(1);
  });

  it('rolls fish on the server and rejects instant catches', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const ok = last(a.c, 'castok');
    expect(ok.fishId).toBeTruthy();
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(14);

    room.handle(a.id, fought(a.c));
    const fishCount = () => a.acct.save.slots.filter((x) => x?.k === 'fish').length;
    expect(fishCount()).toBe(0);

    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const f = playFight(last(a.c, 'castok').d!, last(a.c, 'castok').seed!);
    advance(ok.wait * 1000 + f.ms);
    room.handle(a.id, { t: 'catch', h: f.h });
    expect(fishCount()).toBe(1);
    room.handle(a.id, { t: 'catch', h: f.h });
    expect(fishCount()).toBe(1);
  });

  it('replays a Quick-Reel Gloves fight with its faster reeling', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    a.acct.save.perks = ['gloves'];
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const ok = last(a.c, 'castok');
    expect(ok.tune).toEqual(eco.fightTune(a.acct.save));
    const f = playFight(ok.d!, ok.seed!, undefined, ok.tune);
    expect(f.reel.status).toBe('caught');
    // The same fish fought without the gloves takes longer, so the server must replay with them.
    expect(playFight(ok.d!, ok.seed!).ms).toBeGreaterThan(f.ms);
    advance(ok.wait * 1000 + f.ms);
    room.handle(a.id, { t: 'catch', h: f.h });
    expect(a.acct.save.slots.filter((x) => x?.k === 'fish')).toHaveLength(1);
  });

  it('replays the fight: refuses a lost fight, a fight faster than real time and a missing or broken log', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const fishCount = () => a.acct.save.slots.filter((x) => x?.k === 'fish').length;
    const cast = () => {
      room.handle(a.id, { t: 'cast', x: 0, z: -10 });
      return last(a.c, 'castok');
    };
    let ok = cast();
    expect(ok.seed).toBeTypeOf('number');
    expect(typeof ok.d!.weight).toBe('number');
    // Letting go the whole fight: the fish takes all the line.
    const lost = playFight(ok.d!, ok.seed!, () => false);
    expect(lost.reel.status).toBe('escaped');
    advance(60_000);
    room.handle(a.id, { t: 'catch', h: lost.h });
    expect(fishCount()).toBe(0);
    expect(last(a.c, 'act').act).toBeNull();

    // A real win, sent before the fight could have been played out.
    ok = cast();
    const won = playFight(ok.d!, ok.seed!);
    expect(won.reel.status).toBe('caught');
    advance(ok.wait * 1000 + won.ms / 2);
    room.handle(a.id, { t: 'catch', h: won.h });
    expect(fishCount()).toBe(0);

    for (const h of [undefined, 42, 'not base64!', won.h.slice(0, 8), 'A'.repeat(8000)]) {
      cast();
      advance(60_000);
      room.handle(a.id, { t: 'catch', h } as never);
      expect(fishCount()).toBe(0);
    }
    // The old trusted flag lands nothing on its own.
    cast();
    advance(60_000);
    room.handle(a.id, { t: 'catch', clean: true } as never);
    expect(fishCount()).toBe(0);

    ok = cast();
    advance(ok.wait * 1000 + won.ms);
    room.handle(a.id, { t: 'catch', h: won.h });
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

  it('refuses to cast when every fish slot is full, even on the last bait', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const perch = { k: 'fish', fishId: 'perch', size: 20 } as const;
    a.acct.save.slots = [{ k: 'rod', id: 'twig' }, { k: 'bait', id: 'worm', n: 1 }, perch, perch, perch];
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castfail').msg).toMatch(/fish slots are full/);
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(1);
  });

  it('lets a catch get away when the fish row fills up mid-fight', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    const ok = last(a.c, 'castok');
    const perch = { k: 'fish', fishId: 'perch', size: 20 } as const;
    a.acct.save.slots.splice(2, 3, perch, perch, perch);
    advance(ok.wait * 1000 + 2000);
    room.handle(a.id, fought(a.c));
    expect(a.acct.save.slots).toHaveLength(5);
    expect(a.acct.save.slots[1]).toMatchObject({ k: 'bait', id: 'worm', n: 14 });
  });

  it('keeps picked-up rods and bait out of the fish slots', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.place(a.id, 0, 0, 0);
    room.place(b.id, 0, 0, 0);
    a.acct.save.locker.rods.push('graphite');
    room.handle(a.id, { t: 'slot', i: 0 });
    room.handle(a.id, { t: 'drop' });
    expect(a.acct.save.slots[0]).toEqual({ k: 'rod', id: 'graphite' });
    const [d] = last(b.c, 'drops').list;
    // Bob already has a Twig Rod, so it stays on the ground for someone else.
    room.handle(b.id, { t: 'pickup', id: d.id });
    expect(room.drops.all()).toHaveLength(1);
    expect(b.acct.save.slots.slice(2)).toEqual([null, null, null]);
    // Old clients may still ask to stow gear; there's nothing to stow it from any more.
    room.handle(a.id, { t: 'stow', i: 0 } as never);
    expect(a.acct.save.slots[0]).toEqual({ k: 'rod', id: 'graphite' });
  });

  it('drops items, lets others pick them up, and expires them after 30 s', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.place(a.id, 0, 0, 0);
    room.place(b.id, 0, 0, 0);
    room.handle(a.id, { t: 'slot', i: 1 });
    room.handle(a.id, { t: 'drop' });
    expect(eco.baitCount(a.acct.save, 'worm')).toBe(0);
    const [d] = last(b.c, 'drops').list;
    expect(d.item).toMatchObject({ k: 'bait', n: 15 });
    room.place(b.id, 40, 0, 0);
    room.handle(b.id, { t: 'pickup', id: d.id });
    expect(room.drops.all()).toHaveLength(1);
    room.place(b.id, 0, 0, 0);
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
    room.handle(a.id, fought(a.c));
    expect(last(b.c, 'act').act).toMatchObject({ a: 'hold' });
    room.handle(a.id, { t: 'lost' });
    expect(last(b.c, 'act').act).toBeNull();
  });

  it('flags a held catch as a record only when it beats that player\'s best of the species', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    const land = () => {
      room.handle(a.id, { t: 'cast', x: 1, z: -9 });
      advance(20_000);
      room.handle(a.id, fought(a.c));
      const act = last(b.c, 'act').act;
      if (act?.a !== 'hold') throw new Error('no hold');
      return act;
    };
    // A first catch of a species is no record.
    const first = land();
    expect(first.rec).toBeUndefined();
    // The same fish at the same size doesn't beat it either.
    a.acct.save.slots = a.acct.save.slots.map((x) => (x?.k === 'fish' ? null : x));
    expect(land().rec).toBeUndefined();
    // Once the Fishdex best is smaller, the same landing is a record.
    a.acct.save.slots = a.acct.save.slots.map((x) => (x?.k === 'fish' ? null : x));
    a.acct.save.dex[first.fish].best = 0.001;
    expect(land().rec).toBe(true);
  });

  it('sends the Lucky Charm bonus with a held catch, so others see its real value', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'cast', x: 1, z: -9 });
    advance(20_000);
    room.handle(a.id, fought(a.c));
    // A clean fight (the replay had no frays): only the clean bonus.
    expect(last(b.c, 'act').act).toMatchObject({ a: 'hold', mult: 1 + eco.CLEAN_BONUS });

    a.acct.save.perks.push('charm1', 'charm2');
    room.handle(a.id, { t: 'cast', x: 1, z: -9 });
    advance(20_000);
    room.handle(a.id, fought(a.c));
    const act = last(b.c, 'act').act;
    expect(act).toMatchObject({ a: 'hold' });
    const mult = act?.a === 'hold' ? act.mult : 0;
    expect(mult).toBeCloseTo(1.1 * (1 + eco.CLEAN_BONUS), 9);
    const stored = a.acct.save.slots.find((s) => s?.k === 'fish' && s.mult === mult);
    expect(stored).toMatchObject({ fishId: act?.a === 'hold' ? act.fish : '' });
  });
});

describe('shinies & fishing spots', () => {
  it('slows bites when casting from the shore instead of the pier', () => {
    const { room, join } = setup() as ReturnType<typeof setup>;
    const a = join('Ann');
    room.place(a.id, 0, 0, 0);
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castok').spot).toBe('prime');
    room.place(a.id, 6, 20, 0);
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
  it('rolls the Shiny Lure on the server only while the player has it on', () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.lure = 2;
    room.handle(a.id, { t: 'lure', on: false });
    expect(last(a.c, 'state').save.lureOff).toBe(true);
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castok').shiny).toBe(false);
    expect(a.acct.save.lure).toBe(2);
    room.handle(a.id, { t: 'lure', on: true });
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castok').shiny).toBe(true);
    expect(a.acct.save.lure).toBe(1);
  });
  it('counts lure casts spent at the lake for /lakestats, only when a lure is spent', () => {
    const { room, join } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(a.acct.lake?.lakeLures ?? 0).toBe(0);
    a.acct.save.lure = 2;
    room.handle(a.id, { t: 'lure', on: false });
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(a.acct.lake?.lakeLures ?? 0).toBe(0);
    room.handle(a.id, { t: 'lure', on: true });
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(a.acct.lake).toMatchObject({ lakeLures: 1, seaLures: 0, seaHooks: 0 });
  });

  it('counts online seconds at the lake side and, once on a charter, at sea', () => {
    const t = setup();
    t.room.chartersOpen = true;
    const a = t.join('Ann');
    t.advance(30_000);
    t.room.snapshot();
    expect(a.acct.lake).toMatchObject({ lakeSec: 30, seaSec: 0 });
    const s = a.acct.save;
    s.seaRod = true;
    s.coins = 100_000;
    t.room.place(a.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(s.location).toBe('sea');
    t.advance(20_000);
    t.room.snapshot();
    expect(a.acct.lake).toMatchObject({ lakeSec: 30, seaSec: 20 });
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
    room.handle(a.id, fought(a.c));
    const fish = a.acct.save.slots.find((s) => s?.k === 'fish') as { fishId: string; size: number; shiny?: boolean };
    expect(fish.shiny).toBe(true);
    const plain = sellValue(FISH.find((f) => f.id === fish.fishId)!, fish.size);
    // Fought clean, so the clean bonus rides on top, and a Feisty or Brutish roll pays its own bonus.
    expect(eco.fishValue(fish)).toBeCloseTo(plain * 5 * (1 + eco.CLEAN_BONUS) * (roll.tag ? 1 + eco.TAG_BONUS : 1), 9);
  });
});

describe('dropping a carried fish', () => {
  it('works while the fish is held in hand', () => {
    const { room, join } = setup();
    const a = join('Ann');
    a.acct.save.slots[2] = { k: 'fish', fishId: 'perch', size: 20 };
    room.handle(a.id, { t: 'slot', i: 2 });
    room.handle(a.id, { t: 'drop' });
    expect(a.acct.save.slots[2]).toBeNull();
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
    expect(last(b.c, 'chat')).toMatchObject({ room: 'r', id: a.id, name: 'Ann', map: 'pond', text: 'hi ****', level: 1 });
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

describe('blackjack double down', () => {
  const card = (r: number) => ({ r, s: 0 });
  // A doubled 5+6 draws the next card; the dealer holds 10+7 or 10+10.
  const play = (dealer: number, draw: number) => {
    const { room, store } = setup();
    const res = store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    const s = res.account.save;
    s.location = 'casino';
    const fishId = FISH[FISH.length - 1].id;
    s.slots[2] = { k: 'fish', fishId, size: FISH[FISH.length - 1].maxSize };
    const c = conn();
    const id = room.join(c, res.account);
    const spot = MAPS.find((m) => m.id === 'casino')!.casino!.blackjack;
    room.place(id, spot.x, spot.z, 0);
    const value = eco.fishValue(s.slots[2] as Extract<typeof s.slots[number], { k: 'fish' }>);
    const cost = Math.round(value);
    s.coins = cost + 100;
    (room as any).members.get(id).bj = { deck: [card(draw)], player: [card(5), card(6)], dealer: [card(10), card(dealer)], slot: 2, doubled: false, stake: 0, done: false };
    room.handle(id, { t: 'bj', a: 'double' });
    const it = s.slots[2];
    return { s, c, value, cost, after: it?.k === 'fish' ? eco.fishValue(it) : null };
  };

  it('a win multiplies the fish by 4 and keeps the double-down coins spent', () => {
    const r = play(7, 10);
    expect(last(r.c, 'bj').view).toMatchObject({ done: true, result: 'win', stake: r.cost });
    expect(r.s.coins).toBe(100);
    expect(r.after).toBe(r.value * 4);
    expect(last(r.c, 'state').save.coins).toBe(100);
  });

  it('a push keeps the fish as it was and refunds the coins', () => {
    const r = play(10, 9);
    expect(last(r.c, 'bj').view).toMatchObject({ done: true, result: 'push' });
    expect(r.s.coins).toBe(r.cost + 100);
    expect(r.after).toBe(r.value);
  });

  it('a loss takes the fish and the coins', () => {
    const r = play(10, 2);
    expect(last(r.c, 'bj').view).toMatchObject({ done: true, result: 'lose' });
    expect(r.s.coins).toBe(100);
    expect(r.after).toBeNull();
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

describe('emotes', () => {
  const emotes = (x: { log: ServerMsg[] }) => x.log.filter((m): m is Extract<ServerMsg, { t: 'emote' }> => m.t === 'emote');
  /** Ann and Bob at the pond, Cat in the casino. */
  const three = () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    const res = t.store.auth('Cat', 'token-token-token-Cat');
    if (!res.ok) throw new Error(res.msg);
    res.account.save.location = 'casino';
    const c = conn();
    t.room.join(c, res.account);
    return { ...t, a, b, c };
  };

  it('shows a base emote to the others on the same map only', () => {
    const { room, a, b, c } = three();
    // It says where the player stands as it begins: the emote can arrive before the snap with their last step.
    room.place(a.id, 3.456, -2.004);
    room.handle(a.id, { t: 'emote', id: 'wave' });
    expect(emotes(b.c)).toEqual([{ t: 'emote', id: a.id, emote: 'wave', x: 3.46, z: -2 }]);
    expect(emotes(a.c)).toHaveLength(0);
    expect(emotes(c)).toHaveLength(0);
    // It changes nothing on the save, so no state goes out.
    expect(a.c.log.filter((m) => m.t === 'state')).toHaveLength(0);
  });

  it('shows a player sitting down to the others, and getting up again however long they sat', () => {
    const t = three();
    const { room, a, b } = t;
    room.place(a.id, 20, 1);
    room.handle(a.id, { t: 'emote', id: 'sit' });
    expect(emotes(b.c)).toEqual([{ t: 'emote', id: a.id, emote: 'sit', x: 20, z: 1 }]);
    // Sitting has no length, so the end is passed on whenever it comes.
    t.advance(30 * 60_000);
    room.handle(a.id, { t: 'emote', id: null });
    expect(emotes(b.c).at(-1)).toEqual({ t: 'emote', id: a.id, emote: null });
  });

  it('shows a player who joins the emotes still playing on their map, after the welcome that brings the avatars', () => {
    const t = three();
    const { room, a, b } = t;
    room.place(a.id, 20, 1);
    room.handle(a.id, { t: 'emote', id: 'sit' });
    t.advance(30 * 60_000);
    room.place(b.id, 5, 5);
    room.handle(b.id, { t: 'emote', id: 'wave' });
    const d = t.join('Dan');
    expect(emotes(d.c)).toEqual([
      { t: 'emote', id: a.id, emote: 'sit', x: 20, z: 1 },
      { t: 'emote', id: b.id, emote: 'wave', x: 5, z: 5 },
    ]);
    expect(d.c.log.findIndex((m) => m.t === 'welcome')).toBeLessThan(d.c.log.findIndex((m) => m.t === 'emote'));
    // One that ran its length, or was ended, isn't.
    t.advance(5000);
    room.handle(a.id, { t: 'emote', id: null });
    const e = t.join('Eve');
    expect(emotes(e.c)).toHaveLength(0);
  });

  it("shows a player arriving on a map the emotes still playing there, and only there's", () => {
    const t = three();
    const { room, a, b } = t;
    room.place(a.id, 20, 1);
    room.handle(a.id, { t: 'emote', id: 'sit' });
    // Bob goes over to the casino: nobody sits there.
    const before = emotes(b.c).length;
    b.acct.save.level = 99;
    room.place(b.id, MAPS[0].gate.x, MAPS[0].gate.z, 0);
    room.handle(b.id, { t: 'travel', to: 'casino' });
    expect(last(b.c, 'moved')).toMatchObject({ id: b.id, map: 'casino' });
    expect(emotes(b.c)).toHaveLength(before);
    t.advance(5000);
    // And back to the pond, where Ann still sits: it comes after the snap with her where she is.
    const casino = MAPS.find((m) => m.id === 'casino')!;
    room.place(b.id, casino.gate.x, casino.gate.z, 0);
    room.handle(b.id, { t: 'travel', to: 'pond' });
    expect(emotes(b.c).slice(before)).toEqual([{ t: 'emote', id: a.id, emote: 'sit', x: 20, z: 1 }]);
    expect(b.c.log.findLastIndex((m) => m.t === 'snap')).toBeLessThan(b.c.log.findLastIndex((m) => m.t === 'emote'));
    // Once she stands up, arriving shows nothing.
    room.handle(a.id, { t: 'emote', id: null });
    room.place(b.id, MAPS[0].gate.x, MAPS[0].gate.z, 0);
    room.handle(b.id, { t: 'travel', to: 'casino' });
    t.advance(5000);
    room.place(b.id, casino.gate.x, casino.gate.z, 0);
    room.handle(b.id, { t: 'travel', to: 'pond' });
    expect(emotes(b.c).slice(before)).toHaveLength(2);
  });

  it("never shows an emote the player doesn't own, or one that doesn't exist", () => {
    const { room, a, b, advance } = three();
    for (const id of ['kelp', 'twilight', 'abyss', 'master', 'nope', 'constructor', '', 7, {}, undefined, ['wave']]) {
      room.handle(a.id, { t: 'emote', id: id as string });
      advance(5000);
    }
    expect(emotes(b.c)).toHaveLength(0);
    // Bought (in the save): it shows. The save is the server's, never the client's word.
    a.acct.save.emotes.push('kelp');
    room.handle(a.id, { t: 'emote', id: 'kelp' });
    expect(emotes(b.c)).toMatchObject([{ t: 'emote', id: a.id, emote: 'kelp' }]);
    advance(5000);
    room.handle(a.id, { t: 'emote', id: 'abyss' });
    expect(emotes(b.c)).toHaveLength(1);
  });

  it('drops emotes started within a second of the last, whichever they are', () => {
    const { room, a, b, advance } = three();
    room.handle(a.id, { t: 'emote', id: 'wave' });
    advance(400);
    room.handle(a.id, { t: 'emote', id: 'yes' });
    advance(400);
    room.handle(a.id, { t: 'emote', id: 'no' });
    expect(emotes(b.c).map((m) => m.emote)).toEqual(['wave']);
    advance(300);
    room.handle(a.id, { t: 'emote', id: 'nice' });
    expect(emotes(b.c).map((m) => m.emote)).toEqual(['wave', 'nice']);
    // Bob's own limit is his own.
    room.handle(b.id, { t: 'emote', id: 'wave' });
    expect(emotes(a.c)).toMatchObject([{ t: 'emote', id: b.id, emote: 'wave' }]);
  });

  it('passes on an early end only while an emote is playing', () => {
    const { room, a, b, advance } = three();
    // Nothing playing: nothing to end.
    room.handle(a.id, { t: 'emote', id: null });
    expect(emotes(b.c)).toHaveLength(0);
    room.handle(a.id, { t: 'emote', id: 'wave' });
    advance(500);
    room.handle(a.id, { t: 'emote', id: null });
    expect(emotes(b.c).at(-1)).toEqual({ t: 'emote', id: a.id, emote: null });
    // Ended once; saying it again is dropped, and so is one after the emote ran its length.
    room.handle(a.id, { t: 'emote', id: null });
    expect(emotes(b.c)).toHaveLength(2);
    advance(1000);
    room.handle(a.id, { t: 'emote', id: 'yes' });
    advance(2500);
    room.handle(a.id, { t: 'emote', id: null });
    expect(emotes(b.c).map((m) => m.emote)).toEqual(['wave', null, 'yes']);
  });

  it('plays none with a fish on the line', () => {
    const { room, a, b, advance } = three();
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    expect(last(a.c, 'castok').fishId).toBeTruthy();
    room.handle(a.id, { t: 'emote', id: 'wave' });
    expect(emotes(b.c)).toHaveLength(0);
    room.handle(a.id, { t: 'lost' });
    advance(100);
    room.handle(a.id, { t: 'emote', id: 'wave' });
    expect(emotes(b.c)).toHaveLength(1);
  });

  it("sells a deep sea emote at Reed's seaplane once its gate is met, for coins and Black Pearls, once", () => {
    const t = setup();
    const a = t.join('Ann');
    const s = a.acct.save;
    const atReed = () => t.room.place(a.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
    const buy = (id = 'kelp') => t.room.handle(a.id, { t: 'buyemote', id });
    s.coins = 1e9;
    s.pearls = 1e9;
    // Not anywhere but Reed's.
    t.atShop(a);
    buy();
    expect(last(a.c, 'notice').msg).toMatch(/Reed's seaplane/);
    atReed();
    // Locked until the whole Kelp Deep set is owned, whatever the client thinks.
    buy();
    expect(last(a.c, 'notice').msg).toBe('Own the Kelp Deep set to unlock the Kelp Deep emote.');
    s.owned.push('kelpcap', 'kelpwrap');
    buy();
    expect(s.emotes).toEqual([]);
    s.owned.push('holdfast');
    // Both currencies, checked from the save: short of either one sells nothing and takes nothing.
    s.coins = 299_999;
    buy();
    expect(last(a.c, 'notice').msg).toBe('The Kelp Deep emote costs 300,000 coins and 1,000 Black Pearls: you need 1 more coin.');
    s.coins = 300_000;
    s.pearls = 999;
    buy();
    expect(last(a.c, 'notice').msg).toBe('The Kelp Deep emote costs 300,000 coins and 1,000 Black Pearls: you need 1 more Black Pearl.');
    expect(s).toMatchObject({ emotes: [], coins: 300_000, pearls: 999 });
    s.pearls = 1_000;
    buy();
    expect(s.emotes).toEqual(['kelp']);
    expect(s).toMatchObject({ coins: 0, pearls: 0 });
    expect(last(a.c, 'state').save).toMatchObject({ emotes: ['kelp'], coins: 0, pearls: 0 });
    s.coins = 1e9;
    s.pearls = 1e9;
    buy();
    expect(last(a.c, 'notice').msg).toBe('You already have the Kelp Deep emote.');
    expect(s).toMatchObject({ coins: 1e9, pearls: 1e9 });
    // The base ones and made-up ones aren't for sale.
    for (const id of ['wave', 'nope', 'constructor']) {
      buy(id);
      expect(last(a.c, 'notice').msg).toBe('Captain Reed has nothing like that.');
    }
    // Master of the Deep takes the other three emotes, not their sets.
    buy('master');
    expect(last(a.c, 'notice').msg).toBe('Own the other three deep sea emotes to unlock the Master of the Deep emote.');
    s.emotes.push('twilight', 'abyss');
    buy('master');
    expect(s.emotes).toEqual(['kelp', 'twilight', 'abyss', 'master']);
    expect(s).toMatchObject({ coins: 1e9 - 250_000_000, pearls: 1e9 - 1_000_000 });
  });

  it('takes bought emotes away with an account reset', () => {
    const { room, a, b, advance } = three();
    a.acct.save.emotes.push('kelp');
    room.handle(a.id, { t: 'reset' });
    expect(a.acct.save.emotes).toEqual([]);
    advance(5000);
    room.handle(a.id, { t: 'emote', id: 'kelp' });
    expect(emotes(b.c)).toHaveLength(0);
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

describe('shared clock', () => {
  it("sends the server's time on join and again every CLOCK_MS, so every sky shows the same hour", () => {
    const t = setup();
    const a = t.join('Ann');
    expect(last(a.c, 'welcome').now).toBe(1_000_000);
    t.room.snapshot();
    expect(last(a.c, 'clock').now).toBe(1_000_000);
    const sent = () => a.c.log.filter((m) => m.t === 'clock').length;
    t.advance(CLOCK_MS - 1);
    t.room.snapshot();
    expect(sent()).toBe(1);
    t.advance(1);
    t.room.snapshot();
    expect(sent()).toBe(2);
    expect(last(a.c, 'clock').now).toBe(1_000_000 + CLOCK_MS);
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
    t.room.place(p.id, g.x, g.z, 0);
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
    t.room.place(a.id, 1, 2, 0);
    t.room.snapshot();
    expect(last(b.c, 'snap').p).toEqual([[a.id, 1, 2, 0]]);
    b.c.log.length = 0;
    t.room.snapshot();
    expect(snaps(b.c)).toHaveLength(0);

    toCasino(t, c);
    t.room.snapshot();
    a.c.log.length = 0;
    t.room.place(c.id, 5, 5, 0);
    t.room.snapshot();
    expect(snaps(a.c)).toHaveLength(0);
  });

  it('gives a player arriving on a map the positions of everyone already there', () => {
    const t = setup();
    const a = t.join('Ann');
    const b = t.join('Bob');
    toCasino(t, a);
    t.room.place(a.id, 3, 4, 1);
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

  it('sends the charters\' best catches as their own list, re-ranked when an online player sets a new one', () => {
    const t = setup();
    t.room.hall = () => t.store.hall();
    t.room.hallSea = () => t.store.hallSea();
    t.room.hallStale = () => t.store.hallStale();
    const a = t.join('Ann');
    t.room.snapshot();
    expect(last(a.c, 'hall').sea).toEqual([]);
    a.acct.save.bestSea = { fishId: 'marlin', size: 300, value: 9000 };
    t.advance(BOARD_MS);
    t.room.snapshot();
    const hall = last(a.c, 'hall');
    expect(hall.sea?.map((r) => [r.name, r.best.fishId])).toEqual([['Ann', 'marlin']]);
    expect(hall.rows).toEqual([]);
  });

  it("doesn't resend an unchanged board for a charter record, which only the hall of fame shows", () => {
    const t = setup();
    t.room.hall = () => t.store.hall();
    t.room.hallSea = () => t.store.hallSea();
    t.room.hallStale = () => t.store.hallStale();
    const a = t.join('Ann');
    const boards = () => a.c.log.filter((m) => m.t === 'board').length;
    t.room.snapshot();
    expect(boards()).toBe(1);
    a.acct.save.bestSea = { fishId: 'marlin', size: 300, value: 9000 };
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(last(a.c, 'hall').sea?.map((r) => r.name)).toEqual(['Ann']);
    expect(boards()).toBe(1);
    // A level still does.
    a.acct.save.level = 2;
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(boards()).toBe(2);
  });
});

describe('the Furthest Out board', () => {
  it('sends it on joining, offline players included, and again when an online player fits a boat part or goes further in the Abyss', () => {
    const t = setup();
    t.room.furthest = () => t.store.furthest();
    t.room.furthestStale = () => t.store.furthestStale();
    const cy = t.store.auth('Cy', 'token-token-token-Cy');
    if (!cy.ok) throw new Error(cy.msg);
    cy.account.save.boatParts = 2;
    const a = t.join('Ann');
    expect(last(a.c, 'furthest').rows).toEqual([{ name: 'Cy', level: cy.account.save.level, zone: 2 }]);
    const b = t.join('Bob');
    t.room.snapshot();
    const sent = () => b.c.log.filter((m) => m.t === 'furthest').length;
    const n = sent();
    a.acct.save.boatParts = 4;
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(last(b.c, 'furthest').rows.map((r) => [r.name, r.zone])).toEqual([['Ann', 4], ['Cy', 2]]);
    // Nothing new, nothing sent.
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(sent()).toBe(n + 1);
    // A further Abyss marker shows at the next tick too.
    a.acct.save.abyssRecord = 6;
    t.advance(BOARD_MS);
    t.room.snapshot();
    expect(last(b.c, 'furthest').rows[0]).toEqual({ name: 'Ann', level: a.acct.save.level, zone: 4, marker: 6 });
  });
});

describe('the Furthest Out record line', () => {
  const lines = (c: { log: { t: string }[] }) => c.log.filter((m) => m.t === 'sys').map((m) => (m as unknown as { text: string }).text).filter((x) => x.startsWith('🧭'));
  it('tells the server when someone moves past the leader, not on a tie, the Shelf or a fresh start', () => {
    const t = setup();
    t.room.furthest = () => t.store.furthest();
    t.room.furthestStale = () => t.store.furthestStale();
    const cy = t.store.auth('Cy', 'token-token-token-Cy');
    if (!cy.ok) throw new Error(cy.msg);
    cy.account.save.boatParts = 3;
    const a = t.join('Ann');
    const b = t.join('Bob');
    const tick = () => {
      t.advance(BOARD_MS);
      t.room.snapshot();
    };
    tick();
    expect(lines(b.c)).toEqual([]); // the board as the server found it
    a.acct.save.boatParts = 3; // ties Cy (listed by name: Ann first)
    tick();
    expect(lines(b.c)).toEqual([]);
    a.acct.save.boatParts = 4;
    tick();
    expect(lines(b.c)).toEqual(['🧭 Ann has sailed the furthest out: the Abyss!']);
    a.acct.save.abyssRecord = 5; // the leader pushing on
    tick();
    b.acct.save.boatParts = 4;
    b.acct.save.abyssRecord = 5; // a tie
    tick();
    b.acct.save.abyssRecord = 6;
    tick();
    expect(lines(a.c).slice(-2)).toEqual(['🧭 Ann has sailed the furthest out: Abyss marker 5!', '🧭 Bob has sailed the furthest out: Abyss marker 6!']);
    expect(lines(b.c)).toHaveLength(3);
  });
});

describe('ranks and titles', () => {
  it('announces a new rank to everyone when a catch reaches it', () => {
    const { room, join, advance } = setup();
    const a = join('Ann');
    const b = join('Bob');
    a.acct.save.level = 24;
    a.acct.save.xp = xpForNextLevel(24) - 1;
    room.handle(a.id, { t: 'cast', x: 0, z: -10 });
    advance(60_000);
    room.handle(a.id, fought(a.c));
    expect(a.acct.save.level).toBe(25);
    expect(b.c.log.filter((m) => m.t === 'sys').map((m) => (m as { text: string }).text)).toContain('⚓ Ann made Bosun!');
  });
  it('shrugs off ids that are objects instead of crashing the server', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const bad = { toString: null } as unknown as string;
    expect(() => room.handle(a.id, { t: 'title', id: bad })).not.toThrow();
    expect(() => room.handle(a.id, { t: 'buyrod', id: bad })).not.toThrow();
    expect(a.acct.save.title).toBe(null);
  });
  it('shows a worn title to the other players, and only an earned one', () => {
    const { room, join } = setup();
    const a = join('Ann');
    const b = join('Bob');
    room.handle(a.id, { t: 'title', id: 'admiral' });
    expect(b.c.log.some((m) => m.t === 'title')).toBe(false);
    a.acct.save.titles.push('bosun');
    room.handle(a.id, { t: 'title', id: 'bosun' });
    expect(last(b.c, 'title')).toEqual({ t: 'title', id: a.id, title: 'bosun' });
    const c = join('Cy');
    expect(last(c.c, 'welcome').players.find((p) => p.id === a.id)?.title).toBe('bosun');
  });
});

describe('Smokehouse', () => {
  const atCounter = (room: Room, p: { id: number }) => {
    const c = MAPS[0].smokehouse!;
    room.place(p.id, c.x, c.z - 1.5, 0);
  };
  const give = (save: ReturnType<typeof newSave>, ...ids: string[]) =>
    ids.forEach((id, i) => (save.slots[2 + i] = { k: 'fish', fishId: id, size: FISH.find((f) => f.id === id)!.minSize }));
  /** A level-3 player, so Mags is open. */
  const joinOpen = (setupResult: ReturnType<typeof setup>, name: string) => {
    const res = setupResult.store.auth(name, `token-token-token-${name}`);
    if (!res.ok) throw new Error(res.msg);
    res.account.save.level = 3;
    // Already opened, so the free smoked fish don't get in the way.
    res.account.save.smoke.seen = ['smallfry'];
    return setupResult.join(name);
  };

  it('smokes only at the counter, and says why not', () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    give(a.acct.save, 'pike');
    t.room.handle(a.id, { t: 'smoke', i: 2 });
    expect(a.acct.save.smoke.spots[0]).toBeNull();
    expect(last(a.c, 'notice').msg).toBe("Get closer to Mags's counter.");
    atCounter(t.room, a);
    t.room.handle(a.id, { t: 'smoke', i: { toString: null } as unknown as number });
    expect(last(a.c, 'notice').msg).toBe('Pick a fish from your hotbar.');
    t.room.handle(a.id, { t: 'smoke', i: 2 });
    expect(a.acct.save.smoke.spots[0]?.fish.fishId).toBe('pike');
  });

  it('puts down the fish in hand when it goes on the smoker', () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    const b = t.join('Bob');
    give(a.acct.save, 'pike');
    t.room.handle(a.id, { t: 'slot', i: 2 });
    expect(last(b.c, 'act')).toMatchObject({ id: a.id, act: { a: 'carry', fish: 'pike' } });
    atCounter(t.room, a);
    t.room.handle(a.id, { t: 'smokeall' });
    expect(last(b.c, 'act')).toMatchObject({ id: a.id, act: null });
  });

  it('smokes while the player is away and hands the fish over when they come back', () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    give(a.acct.save, 'pike', 'gar');
    atCounter(t.room, a);
    t.room.handle(a.id, { t: 'smokeall' });
    t.room.leave(a.id);
    t.advance(60 * 60_000);
    const back = t.join('Ann');
    expect(back.acct.save.smoke.pantry.pike).toHaveLength(1);
    expect(last(back.c, 'notice').msg).toBe("🔥 While you were away, Mags smoked your Northern Pike and Spotted Gar. It's in your Pantry.");
  });

  it('hands over a fish that finishes while online', () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    give(a.acct.save, 'pike');
    atCounter(t.room, a);
    t.room.handle(a.id, { t: 'smoke', i: 2 });
    t.advance(30_000);
    t.room.snapshot();
    expect(last(a.c, 'notice').msg).toBe("🔥 Smoked Northern Pike: it's in your Pantry.");
    expect(last(a.c, 'state').save.smoke.pantry.pike).toHaveLength(1);
  });

  it('sells smoked small fry at the counter only', () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    smoke.stock(a.acct.save, 'minnow', 10, 2);
    const coins = a.acct.save.coins;
    t.room.handle(a.id, { t: 'sellsmoked', id: 'minnow' });
    expect(a.acct.save.coins).toBe(coins);
    atCounter(t.room, a);
    t.room.handle(a.id, { t: 'sellsmoked', id: 'minnow' });
    expect(a.acct.save.coins).toBe(coins + 15);
    smoke.stock(a.acct.save, 'minnow', 10, 2);
    t.room.handle(a.id, { t: 'sellsmoked', id: 'minnow', all: true });
    expect(a.acct.save.coins).toBe(coins + 60);
    expect(a.acct.save.smoke.pantry.minnow).toBeUndefined();
  });

  it('runs the snack down in online time only', () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    smoke.stock(a.acct.save, 'perch', 10);
    t.room.handle(a.id, { t: 'eat', id: 'perch' });
    expect(a.acct.save.smoke.snack).toEqual({ fishId: 'perch', ms: 300_000 });
    t.advance(60_000);
    t.room.snapshot();
    t.room.leave(a.id);
    t.advance(3 * 60 * 60_000);
    const back = t.join('Ann');
    expect(back.acct.save.smoke.snack).toEqual({ fishId: 'perch', ms: 240_000 });
    t.advance(4 * 60_000);
    t.room.snapshot();
    expect(back.acct.save.smoke.snack).toBeNull();
    expect(last(back.c, 'notice').msg).toMatch(/snack wore off/);
  });

  it("doesn't eat in the casino", () => {
    const t = setup();
    const a = joinOpen(t, 'Ann');
    smoke.stock(a.acct.save, 'perch', 10);
    a.acct.save.location = 'casino';
    t.room.leave(a.id);
    const b = t.join('Ann');
    t.room.handle(b.id, { t: 'eat', id: 'perch' });
    expect(b.acct.save.smoke.snack).toBeNull();
  });

  it('opens the stages already reached on joining, once', () => {
    const t = setup();
    const res = t.store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    Object.assign(res.account.save, { level: 12, dex: { minnow: { count: 5, best: 6 }, pike: { count: 1, best: 60 } } });
    const a = t.join('Ann');
    expect(last(a.c, 'stages')).toEqual({ t: 'stages', ids: ['smallfry', 'giants'], intro: true });
    expect(a.acct.save.smoke.pantry.minnow).toHaveLength(3);
    t.room.leave(a.id);
    const b = t.join('Ann');
    expect(b.c.log.some((m) => m.t === 'stages')).toBe(false);
  });

  /** A level-20 player who has caught tiers 1-3, at the counter, with the Kitchen already open. */
  const joinCook = (t: ReturnType<typeof setup>) => {
    const res = t.store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    Object.assign(res.account.save, { level: 20, coins: 1000, dex: { minnow: { count: 5, best: 6 }, perch: { count: 1, best: 9 }, pike: { count: 1, best: 60 } } });
    res.account.save.smoke.seen = ['smallfry', 'giants'];
    return t.join('Ann');
  };

  it('cooks at the counter only, into the Pantry, and counts it for /smokestats', () => {
    const t = setup();
    const stats = new SmokeStats(null, 0);
    t.room.smokeStats = stats;
    const a = joinCook(t);
    smoke.stock(a.acct.save, 'minnow', 10, 3);
    smoke.stock(a.acct.save, 'pike', 80, 1);
    t.room.handle(a.id, { t: 'cook', id: 'fishcakes' });
    expect(last(a.c, 'notice').msg).toBe("Get closer to Mags's counter.");
    atCounter(t.room, a);
    t.room.handle(a.id, { t: 'cook', id: 'fishcakes' });
    expect(a.acct.save.smoke.cooked).toEqual([{ id: 'fishcakes', n: 1 }]);
    expect(smoke.pantryTotal(a.acct.save)).toBe(0);
    t.room.handle(a.id, { t: 'cook', id: 'fishcakes' });
    expect(last(a.c, 'notice').msg).toMatch(/Not enough smoked fish/);
    expect(stats.data.cooked).toEqual({ fishcakes: 1 });
  });

  it('eats a dish anywhere but the casino and runs it down in online time only', () => {
    const t = setup();
    const a = joinCook(t);
    smoke.addCooked(a.acct.save, 'supper', 1);
    t.room.handle(a.id, { t: 'eatdish', id: 'supper' });
    expect(a.acct.save.smoke.dish).toEqual({ id: 'supper', ms: 12 * 60_000 });
    t.advance(2 * 60_000);
    t.room.snapshot();
    t.room.leave(a.id);
    t.advance(3 * 60 * 60_000);
    const back = t.join('Ann');
    expect(back.acct.save.smoke.dish).toEqual({ id: 'supper', ms: 10 * 60_000 });
    t.advance(10 * 60_000);
    t.room.snapshot();
    expect(back.acct.save.smoke.dish).toBeNull();
    expect(last(back.c, 'notice').msg).toMatch(/dish wore off/);
  });

  it('turns banked level gifts into dishes on joining', () => {
    const t = setup();
    const res = t.store.auth('Ann', 'token-token-token-Ann');
    if (!res.ok) throw new Error(res.msg);
    Object.assign(res.account.save, { level: 55, dex: { minnow: { count: 5, best: 6 }, perch: { count: 1, best: 9 }, pike: { count: 1, best: 60 } } });
    res.account.save.smoke.seen = ['smallfry', 'giants'];
    res.account.save.gifts.provisions = 5;
    const a = t.join('Ann');
    expect(a.acct.save.smoke.cooked).toEqual([{ id: 'supper', n: 5 }]);
    expect(last(a.c, 'notice').msg).toBe("🎁 Level gifts: Mags cooked you 5 Angler's Supper. They're in your Pantry.");
  });

  it('/smokestats reports by stage, with who online has a buff', () => {
    const stats = new SmokeStats({ since: 0, smoked: [4, 2, 1, 0, 0], sold: [1], cooked: { supper: 2, bogus: 9 }, eaten: { supper: 1 } }, 0);
    const s = newSave();
    s.smoke.dish = { id: 'supper', ms: 1000 };
    const lines = stats.report([s, newSave()], 3 * 86_400_000);
    expect(lines[0]).toBe('🔥 Smokehouse since 1970-01-01 (3 days):');
    expect(lines[1]).toBe('🐟 Small Fry (T1/T2): smoked 4/2 · sold 1/0 · snacks 0/0');
    expect(lines[2]).toBe("🐊 Lake Giants (T3): smoked 1 · snacks 0 · Fish Cakes 0 cooked, 0 eaten · Angler's Supper 2 cooked, 1 eaten");
    expect(lines.at(-1)).toBe('Online now: 1 of 2 with a buff (0 snack, 1 dish)');
  });
});

describe('charters', () => {
  type P = ReturnType<ReturnType<typeof setup>['join']>;
  const atReed = (t: ReturnType<typeof setup>, p: P) => t.room.place(p.id, HARBOUR.stand.x, HARBOUR.stand.z + 1.5);
  const diver = (t: ReturnType<typeof setup>, name = 'Ann') => {
    t.room.chartersOpen = true;
    const p = t.join(name);
    p.acct.save.seaRod = true;
    atReed(t, p);
    return p;
  };
  const states = (p: P) => p.c.log.filter((m): m is Extract<ServerMsg, { t: 'divestate' }> => m.t === 'divestate').map((m) => m.dive);
  const lastDive = (p: P) => states(p).at(-1)!;
  /** Casts at sea and fights the fish: `win` holds in the green, otherwise never reels, so the fish runs off with the line. */
  const fight = (t: ReturnType<typeof setup>, p: P, win = true) => {
    t.room.handle(p.id, { t: 'cast', x: 0, z: -8 });
    const ok = last(p.c, 'castok');
    const f = playFight(ok.d!, ok.seed!, win ? undefined : () => false);
    t.advance(ok.wait * 1000 + f.ms + 10);
    t.room.handle(p.id, win ? { t: 'catch', h: f.h } : { t: 'lost', h: f.h });
    return f;
  };

  it("refuses charters at Reed's seaplane while they're closed", () => {
    const t = setup();
    t.room.chartersOpen = false;
    const a = t.join('Ann');
    a.acct.save.seaRod = true;
    atReed(t, a);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(last(a.c, 'notice').msg).toMatch(/still working on his seaplane/);
    expect(a.acct.save.location).toBe('pond');
    expect(states(a)).toEqual([]);
  });

  it("starts only at Captain Reed's seaplane, with the Deep Sea Rod, in an open zone, paying its fee", () => {
    const t = setup();
    t.room.chartersOpen = true;
    const a = t.join('Ann');
    const b = t.join('Bob');
    const s = a.acct.save;
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(last(a.c, 'notice').msg).toMatch(/Reed's seaplane/);
    atReed(t, a);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(last(a.c, 'notice').msg).toBe('Charters need the Deep Sea Rod.');
    s.locker.rods.push('aurora');
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(last(a.c, 'notice').msg).toBe('Charters need the Deep Sea Rod.');
    s.seaRod = true;
    // The Drop-off needs the Storm sail.
    t.room.handle(a.id, { t: 'dive', zone: 1 });
    expect(last(a.c, 'notice').msg).toMatch(/fitted for/);
    s.boatParts = 1;
    // Its fee is 7,000 coins.
    s.coins = 6_999;
    t.room.handle(a.id, { t: 'dive', zone: 1 });
    expect(last(a.c, 'notice').msg).toBe('A charter here costs 7,000 coins.');
    expect(s.location).toBe('pond');
    for (const bad of [{ zone: 1, marker: 3 }, { zone: '1' }, { zone: 9 }, {}]) {
      t.room.handle(a.id, { t: 'dive', ...bad } as never);
      expect(s.location).toBe('pond');
    }
    s.coins = 20_000;
    t.room.handle(a.id, { t: 'dive', zone: 1 });
    expect(s.location).toBe('sea');
    expect(s.coins).toBe(13_000);
    // The charter arrives before the save that takes the player to sea.
    const dive = a.c.log.findIndex((m) => m.t === 'divestate');
    expect(a.c.log.findLastIndex((m) => m.t === 'state')).toBeGreaterThan(dive);
    expect(lastDive(a)).toMatchObject({
      zone: 1, marker: 0, toNext: 0, hold: 10, state: 'fishing', rating: 'tough', fee: 7_000,
      tally: { landed: 0, lost: 0, pearls: 0, coins: 0, fee: 7_000, shiny: 0 },
    });
    expect(lastDive(a).pay.pearls).toBe(3);
    expect(lastDive(a).gain).toBeUndefined();
    expect(last(b.c, 'moved')).toMatchObject({ id: a.id, map: 'sea', dive: lastDive(a).id });
    // One charter at a time.
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(lastDive(a).zone).toBe(1);
  });

  it('keeps the hotbar as it was through a charter: at sea the Deep Sea Rod is in hand, and slots and drops wait for home', () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    s.slots[2] = { k: 'fish', fishId: 'pike', size: 60 };
    s.held = 2;
    const before = JSON.stringify(s.slots);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    t.room.handle(a.id, { t: 'slot', i: 0 });
    t.room.handle(a.id, { t: 'drop' });
    expect(s.held).toBe(2);
    expect(JSON.stringify(s.slots)).toBe(before);
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    expect(last(a.c, 'castok')).toBeTruthy();
  });

  it('sells each fish as it lands and pays its pearls at once, each one taking its place in the hold', () => {
    const t = setup();
    const a = diver(t);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    const s = a.acct.save;
    const bait = (s.slots[1] as { n: number }).n;
    const coins = s.coins;
    fight(t, a);
    // No bait at sea, and the fish goes straight to coins instead of the hotbar.
    expect((s.slots[1] as { n: number }).n).toBe(bait);
    expect(s.slots.slice(2).every((x) => !x)).toBe(true);
    expect(s.coins).toBeGreaterThan(coins + 500);
    expect(Object.keys(s.dex).some((id) => FISH.find((f) => f.id === id)?.sea)).toBe(true);
    // A Shelf fish on a fresh rod: Easy, one of the hold's 10 and a pearl, on the save already.
    expect(lastDive(a)).toMatchObject({ hold: 10, gain: 1, rating: 'easy', state: 'fishing', tally: { landed: 1, pearls: 1, coins: s.coins - coins, fee: 0 } });
    expect(s.pearls).toBe(1);
    expect(last(a.c, 'state').save.pearls).toBe(1);
    for (let i = 0; i < 4; i++) fight(t, a);
    expect(lastDive(a)).toMatchObject({ state: 'fishing', tally: { landed: 5, pearls: 5 } });
    expect(s.pearls).toBe(5);
  });

  it('pays a Feisty or Brutish fish double and a legend five times, and tells the HUD what each landed fish paid', () => {
    const t = setup();
    const a = diver(t);
    a.acct.save.boatParts = 2;
    a.acct.save.rodStep = 4;
    a.acct.save.coins = 30_000;
    t.room.handle(a.id, { t: 'dive', zone: 2 });
    // Under 1 in 8 rolls a tag, and 1 in 20 or more is no legend: a Feisty everyday fish.
    t.setRoll(0.1);
    fight(t, a);
    expect(last(a.c, 'castok')).toMatchObject({ tag: 'feisty' });
    expect(FISH.find((f) => f.id === last(a.c, 'castok').fishId)?.legend).toBeFalsy();
    expect(lastDive(a)).toMatchObject({ gain: 16, tally: { landed: 1, pearls: 16 } });
    t.setRoll(0.5);
    fight(t, a);
    expect(last(a.c, 'castok').tag).toBeUndefined();
    expect(lastDive(a)).toMatchObject({ gain: 8, tally: { pearls: 24 } });
    // Under 1 in 20 is the zone's legend, tagged too, and the same roll makes it shiny: 2 × 5 × 5, fifty times.
    t.setRoll(0.01);
    fight(t, a);
    expect(FISH.find((f) => f.id === last(a.c, 'castok').fishId)?.legend).toBe(true);
    expect(last(a.c, 'castok')).toMatchObject({ tag: 'feisty', shiny: true });
    expect(lastDive(a)).toMatchObject({ gain: 400, tally: { pearls: 424, shiny: 1 } });
    // A lost fish pays nothing and sends no gain.
    t.setRoll(0.1);
    fight(t, a, false);
    expect(lastDive(a)).toMatchObject({ tally: { landed: 3, lost: 1, pearls: 424 } });
    expect(lastDive(a).gain).toBeUndefined();
    expect(lastDive(a).lost).toBeTruthy();
    expect(a.acct.save.pearls).toBe(424);
    // Heading home settles nothing more: every fish was credited as it landed.
    t.room.handle(a.id, { t: 'headhome' });
    expect(last(a.c, 'diveend').end).toEqual({ why: 'home', zone: 2, marker: 0, tally: lastDive(a).tally });
    expect(a.acct.save.pearls).toBe(424);
  });

  it("unlocks the next piece of the Kraken's set with each Kraken landed, only for the player who landed it", () => {
    const t = setup();
    const a = diver(t);
    const b = t.join('Bob');
    const s = a.acct.save;
    Object.assign(s, { boatParts: 4, rodStep: 8, abyssLevels: 60, holdLevel: 4, coins: 1e9 });
    t.room.handle(a.id, { t: 'dive', zone: 4, marker: 1 });
    expect(s.location).toBe('sea');
    const krakens = () => {
      // A sea cast rolls the legend chance first, then which of the Abyss's three legends: the last is the Kraken.
      t.queueRolls(0.01, 0.99);
      fight(t, a);
      expect(last(a.c, 'castok').fishId).toBe('kraken');
    };
    krakens();
    expect(s.legends).toEqual({ kraken: 1 });
    expect(last(a.c, 'state').save.legends).toEqual({ kraken: 1 });
    // Unlocked, not given: Reed sells it.
    expect(s.owned).toEqual([]);
    krakens();
    // An everyday fish doesn't count; another legend counts for itself.
    t.setRoll(0.5);
    fight(t, a);
    t.queueRolls(0.01, 0);
    fight(t, a);
    expect(last(a.c, 'castok').fishId).toBe('leviathan');
    expect(s.legends).toEqual({ kraken: 2, leviathan: 1 });
    krakens();
    krakens();
    krakens();
    expect(s.legends.kraken).toBe(5);
    expect(s.owned).toEqual([]);
    // Nobody else hears about it.
    expect(b.c.log.some((m) => m.t === 'sys' && /Kraken/.test(m.text))).toBe(false);
  });

  it.each([
    { legend: 'leviathan', roll: 0, ids: ['leviathanjaw', 'leviathancoil', 'leviathanfangs', 'leviathanpet'] },
    { legend: 'dreamer', roll: 0.5, ids: ['dreamercap', 'dreamerrobe', 'dreamcatcher', 'dreamerpet'] },
  ])("unlocks the $legend's set landing by landing too, and Reed sells it", ({ legend, roll, ids }) => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    Object.assign(s, { boatParts: 4, rodStep: 8, abyssLevels: 60, holdLevel: 4, coins: 1e9 });
    t.room.handle(a.id, { t: 'dive', zone: 4, marker: 1 });
    for (let n = 1; n <= ids.length; n++) {
      // The legend chance, then which of the Abyss's three legends.
      t.queueRolls(0.01, roll);
      fight(t, a);
      expect(last(a.c, 'castok').fishId).toBe(legend);
      expect(s.legends).toEqual({ [legend]: n });
    }
    expect(s.owned).toEqual([]);
    t.room.handle(a.id, { t: 'headhome' });
    atReed(t, a);
    const coins = s.coins;
    for (const id of ids) t.room.handle(a.id, { t: 'buylegend', id });
    expect(s.owned).toEqual(ids);
    expect(s.coins).toBe(coins - 14_500_000);
  });

  it("sells an unlocked legend piece for coins at Reed's seaplane only, and wears it once bought", () => {
    const t = setup();
    const a = diver(t);
    const b = t.join('Bob');
    const s = a.acct.save;
    const buy = (id = 'krakencrown') => t.room.handle(a.id, { t: 'buylegend', id });
    s.coins = 1e9;
    // Locked until the Kraken is landed.
    buy();
    expect(last(a.c, 'notice').msg).toBe('Land the Kraken once to unlock the Kraken Crown.');
    s.legends = { kraken: 1 };
    // Not anywhere else, not something else, not without the coins.
    t.room.place(a.id, HARBOUR.stand.x + 40, HARBOUR.stand.z);
    buy();
    expect(last(a.c, 'notice').msg).toMatch(/Reed's seaplane/);
    atReed(t, a);
    buy('crown');
    expect(last(a.c, 'notice').msg).toBe('Captain Reed has nothing like that.');
    buy('krakenarmor');
    expect(last(a.c, 'notice').msg).toBe('Land the Kraken once more to unlock the Kraken Armor.');
    s.coins = 2_999_999;
    buy();
    expect(last(a.c, 'notice').msg).toBe('The Kraken Crown costs 3,000,000 coins.');
    expect(s.owned).toEqual([]);
    s.coins = 3_000_000;
    buy();
    expect(s.owned).toEqual(['krakencrown']);
    expect(s.coins).toBe(0);
    expect(last(a.c, 'state').save.owned).toEqual(['krakencrown']);
    s.coins = 1e9;
    buy();
    expect(last(a.c, 'notice').msg).toBe('You already have the Kraken Crown.');
    expect(s.coins).toBe(1e9);
    // The stall never sells it, whatever the coins.
    t.atShop(a);
    s.legends = { kraken: 4 };
    t.room.handle(a.id, { t: 'buycos', id: 'krakenpet' });
    expect(s.owned).toEqual(['krakencrown']);
    // A pet is worn only once bought, and everyone sees it.
    t.room.handle(a.id, { t: 'equip', slot: 'pet', id: 'krakenpet' });
    expect(s.look.pet).toBeNull();
    atReed(t, a);
    buy('krakenpet');
    t.room.handle(a.id, { t: 'equip', slot: 'bogus' as never, id: 'krakenpet' });
    expect(s.look.pet).toBeNull();
    t.room.handle(a.id, { t: 'equip', slot: 'pet', id: 'krakenpet' });
    expect(s.look.pet).toBe('krakenpet');
    expect(last(b.c, 'look')).toMatchObject({ id: a.id, look: { pet: 'krakenpet' } });
  });

  it("sells a zone set's piece at Reed's once the fish landed in its zone unlock it, checked from the save", () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    Object.assign(s, { boatParts: 2, rodStep: 8, abyssLevels: 60, holdLevel: 4, coins: 1e9 });
    // Kelp Deep's fish land in the server's Fishdex, which is the count.
    t.room.handle(a.id, { t: 'dive', zone: 2, marker: 0 });
    t.setRoll(0.5);
    fight(t, a);
    fight(t, a);
    expect(eco.zoneLanded(s, 2)).toBe(2);
    t.room.handle(a.id, { t: 'headhome' });
    atReed(t, a);
    // Locked: the server says what it takes and sells nothing, whatever the client thinks.
    const buy = (id = 'kelpcap') => t.room.handle(a.id, { t: 'buylegend', id });
    buy();
    expect(last(a.c, 'notice').msg).toBe('Land 38 more fish in Kelp Deep to unlock the Kelp Cap.');
    expect(s.owned).toEqual([]);
    s.dex.frondback = { count: 40, best: 100 };
    s.coins = 149_999;
    buy();
    expect(last(a.c, 'notice').msg).toBe('The Kelp Cap costs 150,000 coins.');
    s.coins = 150_000;
    buy('kelpwrap');
    expect(last(a.c, 'notice').msg).toMatch(/^Land \d+ more fish in Kelp Deep to unlock the Kelp Wrap\.$/);
    buy();
    expect(s.owned).toEqual(['kelpcap']);
    expect(s.coins).toBe(0);
    expect(last(a.c, 'state').save.owned).toEqual(['kelpcap']);
    // Not at the stall either.
    s.coins = 1e9;
    s.dex.frondback.count = 200;
    t.atShop(a);
    t.room.handle(a.id, { t: 'buycos', id: 'holdfast' });
    expect(s.owned).toEqual(['kelpcap']);
  });

  it('counts sea casts, lured ones and the pearls landed for /lakestats', () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    Object.assign(s, { boatParts: 2, rodStep: 4, coins: 30_000, pearls: 0 });
    t.room.handle(a.id, { t: 'dive', zone: 2 });
    t.setRoll(0.5);
    s.lure = 1;
    fight(t, a);
    // The lured cast is a sea one: it leaves the lake counter alone.
    expect(a.acct.lake).toMatchObject({ lakeLures: 0, seaLures: 1, seaHooks: 1, pearls: 40 });
    fight(t, a);
    expect(a.acct.lake).toMatchObject({ lakeLures: 0, seaLures: 1, seaHooks: 2, pearls: 48 });
    // A fish lost on the line is a hooked cast but earns no pearls.
    fight(t, a, false);
    expect(a.acct.lake).toMatchObject({ seaHooks: 3, pearls: 48 });
  });

  it('pays a shiny five times the pearls into the save and counts it in the tally; a plain fish neither', () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    Object.assign(s, { boatParts: 2, rodStep: 4, coins: 30_000, pearls: 0 });
    t.room.handle(a.id, { t: 'dive', zone: 2 });
    // A roll of 0.5 is an everyday fish with no tag and no natural shiny: a Shiny Lure makes it shiny.
    t.setRoll(0.5);
    s.lure = 1;
    fight(t, a);
    expect(last(a.c, 'castok')).toMatchObject({ shiny: true });
    expect(last(a.c, 'castok').tag).toBeUndefined();
    expect(s.lure).toBe(0);
    expect(lastDive(a)).toMatchObject({ gain: 40, tally: { landed: 1, pearls: 40, shiny: 1 } });
    expect(s.pearls).toBe(40);
    expect(last(a.c, 'state').save.pearls).toBe(40);
    fight(t, a);
    expect(last(a.c, 'castok').shiny).toBe(false);
    expect(lastDive(a)).toMatchObject({ gain: 8, tally: { landed: 2, pearls: 48, shiny: 1 } });
    expect(s.pearls).toBe(48);
    t.room.handle(a.id, { t: 'headhome' });
    expect(last(a.c, 'diveend').end.tally).toMatchObject({ landed: 2, shiny: 1, pearls: 48 });
  });

  it("reads a held charter's tally from before the shiny count as none", () => {
    const t = setup();
    const a = diver(t);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    delete (a.acct.dive!.dive.tally as { shiny?: number }).shiny;
    t.room.handle(a.id, { t: 'headhome' });
    expect(last(a.c, 'diveend').end.tally.shiny).toBe(0);
  });

  it('in the Abyss reaches a marker every 5 fish, pays 12% more a marker, keeps the furthest, and starts up to it', () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    Object.assign(s, { boatParts: 4, rodStep: 8, coins: 1_000_000 });
    t.setRoll(0.5);
    t.room.handle(a.id, { t: 'dive', zone: 4, marker: 2 });
    expect(s.location).toBe('pond');
    t.room.handle(a.id, { t: 'dive', zone: 4 });
    expect(s.location).toBe('pond');
    t.room.handle(a.id, { t: 'dive', zone: 4, marker: 1 });
    expect(s.location).toBe('sea');
    expect(s.coins).toBe(1_000_000 - charterFee(4));
    expect(charterFee(4)).toBe(54_000);
    expect(s.abyssRecord).toBe(1);
    for (let i = 0; i < 4; i++) fight(t, a);
    expect(lastDive(a)).toMatchObject({ marker: 1, toNext: 4, gain: 50 });
    const coins = s.coins;
    fight(t, a);
    expect(lastDive(a)).toMatchObject({ marker: 2, toNext: 0, gain: 50, rating: 'fair' });
    const plain = s.coins - coins;
    expect(s.abyssRecord).toBe(2);
    // At marker 2 a fish pays 12% more: the same fish (the rolls are fixed) sells for 12% more too.
    fight(t, a);
    expect(lastDive(a).gain).toBe(pearlsFor(4, 2));
    expect(lastDive(a).gain).toBe(56);
    // To the coin: each sale is rounded.
    expect(Math.abs(s.coins - coins - plain - plain * 1.12)).toBeLessThanOrEqual(1);
    t.room.handle(a.id, { t: 'headhome' });
    expect(last(a.c, 'diveend').end).toMatchObject({ why: 'home', zone: 4, marker: 2 });
    // The next charter may start at marker 2, not 3.
    atReed(t, a);
    t.room.handle(a.id, { t: 'dive', zone: 4, marker: 3 });
    expect(s.location).toBe('pond');
    t.room.handle(a.id, { t: 'dive', zone: 4, marker: 2 });
    expect(lastDive(a)).toMatchObject({ zone: 4, marker: 2, toNext: 0 });
  });

  it('counts a hooked fish that got away, taking no place in the hold, and nothing for a missed strike', () => {
    const t = setup();
    const a = diver(t);
    a.acct.save.boatParts = 1;
    a.acct.save.coins = 7_000;
    t.room.handle(a.id, { t: 'dive', zone: 1 });
    const f = fight(t, a, false);
    expect(f.reel.status).toBe('escaped');
    expect(lastDive(a)).toMatchObject({ lost: 'ran', state: 'fishing', tally: { landed: 0, lost: 1 } });
    // Pulled in before the bite, or missed the strike: no fight, nothing counted.
    const n = states(a).length;
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    t.room.handle(a.id, { t: 'lost' });
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    t.advance(last(a.c, 'castok').wait * 1000 + 1500);
    t.room.handle(a.id, { t: 'lost' });
    expect(states(a)).toHaveLength(n);
    // Recasting long after the bite, with no fight to show: the fish was hooked and lost.
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    t.advance(last(a.c, 'castok').wait * 1000 + 10_000);
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    expect(lastDive(a)).toMatchObject({ lost: 'gone', tally: { landed: 0, lost: 2 } });
    // A caught fish reported as lost isn't landed.
    t.advance(last(a.c, 'castok').wait * 1000);
    const ok = last(a.c, 'castok');
    const won = playFight(ok.d!, ok.seed!, undefined);
    t.advance(won.ms);
    t.room.handle(a.id, { t: 'lost', h: won.h });
    expect(lastDive(a)).toMatchObject({ lost: 'gone', state: 'fishing', tally: { landed: 0, lost: 3 } });
  });

  it('a sea fish lost over the rod is noted in the Fishdex as seen, one the rod handles is not', () => {
    const t = setup();
    const a = diver(t);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    // On the Shelf the rod matches the fish: a run-off there is the player's doing.
    fight(t, a, false);
    expect(a.acct.save.seen).toEqual([]);
    // Kelp Deep's fish are two steps over a fresh rod.
    a.acct.dive!.dive.zone = 2;
    fight(t, a, false);
    expect(a.acct.save.seen).toEqual([last(a.c, 'castok').fishId]);
  });

  it("fills the hold with the save's hold level, then waits, full, to head home losing nothing", () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    Object.assign(s, { boatParts: 1, holdLevel: 1, coins: 30_000 });
    t.room.handle(a.id, { t: 'dive', zone: 1 });
    expect(s.coins).toBe(23_000);
    expect(lastDive(a)).toMatchObject({ hold: 15, state: 'fishing', fee: 7_000, tally: { fee: 7_000 } });
    // The hold's size is fixed at casting off: a level bought meanwhile doesn't change it.
    s.holdLevel = 2;
    for (let i = 0; i < 14; i++) fight(t, a);
    fight(t, a, false);
    expect(lastDive(a)).toMatchObject({ state: 'fishing', tally: { landed: 14, lost: 1 } });
    fight(t, a);
    expect(lastDive(a)).toMatchObject({ hold: 15, state: 'full', tally: { landed: 15, lost: 1 } });
    const pearls = s.pearls;
    expect(pearls).toBe(45);
    // Full: no more casts, and the charter waits on the boat.
    const n = states(a).length;
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    expect(last(a.c, 'castfail').msg).toBe('Your hold is full: head home.');
    expect(states(a)).toHaveLength(n);
    expect(s.location).toBe('sea');
    t.advance(60 * 60_000);
    t.room.snapshot();
    expect(a.acct.dive).toBeDefined();
    // There's no buying another hold: the old spool message does nothing.
    const coins = s.coins;
    t.room.handle(a.id, { t: 'spool' } as never);
    expect(s.coins).toBe(coins);
    expect(lastDive(a).state).toBe('full');
    // Heading home loses nothing: the pearls and coins are the player's already, and the fee isn't refunded.
    t.room.handle(a.id, { t: 'headhome' });
    expect(last(a.c, 'diveend').end).toEqual({ why: 'home', zone: 1, marker: 0, tally: { landed: 15, lost: 1, pearls: 45, coins: lastDive(a).tally.coins, fee: 7_000, shiny: 0 } });
    expect(s).toMatchObject({ location: 'pond', pearls: 45, coins });
    expect(a.acct.dive).toBeUndefined();
    // The next charter casts off with the level bought since.
    atReed(t, a);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    expect(lastDive(a)).toMatchObject({ hold: 20, fee: 0, tally: { fee: 0 } });
  });

  it('heads home at any time outside a fight: a cast still waiting for its bite is reeled in, a fish on the line is not left', () => {
    const t = setup();
    const a = diver(t);
    const s = a.acct.save;
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    fight(t, a);
    // With a fish on the line, not yet.
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    t.advance(last(a.c, 'castok').wait * 1000 + 100);
    t.room.handle(a.id, { t: 'headhome' });
    expect(s.location).toBe('sea');
    t.room.handle(a.id, { t: 'lost' });
    // A cast before its bite is fine, and costs nothing.
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    const tally = lastDive(a).tally;
    t.room.handle(a.id, { t: 'headhome' });
    expect(s.location).toBe('pond');
    expect(last(a.c, 'diveend').end).toMatchObject({ why: 'home', zone: 0, tally: { landed: 1, pearls: 1 } });
    expect(last(a.c, 'diveend').end.tally).toEqual(tally);
    expect(last(a.c, 'state').save.pearls).toBe(1);
  });

  it('waits two minutes for an angler who drops out, then simply ends', () => {
    const t = setup();
    let a = diver(t);
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    fight(t, a);
    // Leaving with a fish on the line loses it.
    t.room.handle(a.id, { t: 'cast', x: 0, z: -8 });
    t.advance(last(a.c, 'castok').wait * 1000 + 5000);
    t.room.leave(a.id);
    t.advance(DIVE.holdMs - 1000);
    a = t.join('Ann');
    expect(a.acct.save.location).toBe('sea');
    const w = last(a.c, 'welcome');
    expect(w.dive).toMatchObject({ lost: 'gone', hold: 10, tally: { landed: 1, lost: 1, pearls: 1 } });
    fight(t, a);
    t.room.leave(a.id);
    t.advance(DIVE.holdMs + 1000);
    a = t.join('Ann');
    expect(a.acct.save.location).toBe('pond');
    expect(last(a.c, 'welcome').dive).toBeUndefined();
    expect(last(a.c, 'diveend').end).toMatchObject({ why: 'away', zone: 0, tally: { landed: 2, pearls: 2 } });
    expect(a.acct.save.pearls).toBe(2);
    expect(last(a.c, 'welcome').save.pearls).toBe(2);
  });

  it('keeps each charter to itself: anglers on other charters never see each other move or jump', () => {
    const t = setup();
    const a = diver(t, 'Ann');
    const b = diver(t, 'Bob');
    t.room.handle(a.id, { t: 'dive', zone: 0 });
    t.room.handle(b.id, { t: 'dive', zone: 0 });
    const own = (p: P) => p.c.log.find((m): m is Extract<ServerMsg, { t: 'moved' }> => m.t === 'moved' && m.id === p.id)!.dive;
    expect(own(a)).toBeGreaterThan(0);
    expect(own(a)).not.toBe(own(b));
    b.c.log.length = 0;
    t.room.place(a.id, 1, 0);
    t.room.snapshot();
    t.advance(1000);
    t.room.handle(a.id, { t: 'jump' });
    expect(b.c.log.some((m) => (m.t === 'snap' && m.p.some(([id]) => id === a.id)) || m.t === 'jump')).toBe(false);
    // Nothing goes overboard into someone else's sea.
    a.acct.save.slots[2] = { k: 'fish', fishId: 'perch', size: 20 };
    a.acct.save.held = 2;
    t.room.handle(a.id, { t: 'drop' });
    expect(t.room.drops.all()).toHaveLength(0);
  });
});

describe('moves', () => {
  it('takes a move only as far as the player could walk, and sends them back when it was further', () => {
    const t = setup();
    const a = t.join('Ann');
    const s = MAPS[0].spawn;
    const fixes = () => a.c.log.filter((m): m is Extract<ServerMsg, { t: 'pos' }> => m.t === 'pos');
    t.room.handle(a.id, { t: 'pos', x: s.x + 5, z: s.z, yaw: 0 });
    expect(fixes()).toHaveLength(0);
    // A teleport across the map stops where the budget runs out.
    t.room.handle(a.id, { t: 'pos', x: s.x + 80, z: s.z, yaw: 0 });
    expect(fixes().at(-1)).toEqual({ t: 'pos', x: s.x + 20, z: s.z });
    // Walking at sprint speed is fine, however the messages bunch up.
    t.advance(2000);
    for (let i = 1; i <= 4; i++) t.room.handle(a.id, { t: 'pos', x: s.x + 20, z: s.z + i * 3.5, yaw: 0 });
    expect(fixes()).toHaveLength(1);
    // Off the edge of the map.
    t.advance(60_000);
    t.room.handle(a.id, { t: 'pos', x: 0, z: 150, yaw: 0 });
    expect(fixes()).toHaveLength(2);
    expect(Math.hypot(fixes()[1].x, fixes()[1].z)).toBeLessThanOrEqual(MAPS[0].radius + 1.01);
  });

  it('drops stale moves from before a teleport without sending the player back', () => {
    const t = setup();
    const a = t.join('Ann');
    a.acct.save.level = 99;
    const g = MAPS[0].gate;
    t.room.place(a.id, g.x, g.z);
    t.room.handle(a.id, { t: 'travel', to: 'casino' });
    expect(a.acct.save.location).toBe('casino');
    t.room.handle(a.id, { t: 'pos', x: g.x, z: g.z - 1, yaw: 0 });
    expect(a.c.log.some((m) => m.t === 'pos')).toBe(false);
  });
});
