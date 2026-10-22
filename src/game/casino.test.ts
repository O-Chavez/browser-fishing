import { describe, expect, it } from 'vitest';
import { CHIP_COINS } from '../data/casino';
import { FISH } from '../data/content';
import * as cas from './casino';
import * as eco from './economy';
import { newSave } from './state';

const fish = (mult?: number) => ({ k: 'fish' as const, fishId: FISH[FISH.length - 1].id, size: FISH[FISH.length - 1].maxSize, mult });
const saveWith = (item: ReturnType<typeof fish> | null) => {
  const s = newSave();
  s.slots[2] = item;
  return s;
};
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};
const card = (r: number, s = 0): cas.Card => ({ r, s });

describe('betting a fish', () => {
  it('multiplies on a win with no cap, and destroys on a loss', () => {
    const s = saveWith(fish());
    const base = eco.fishValue(s.slots[2] as ReturnType<typeof fish>);
    cas.settleBet(s, 2, 2);
    expect(eco.fishValue(s.slots[2] as ReturnType<typeof fish>)).toBe(base * 2);
    for (let i = 0; i < 6; i++) cas.settleBet(s, 2, 16);
    expect((s.slots[2] as ReturnType<typeof fish>).mult).toBe(2 * 16 ** 6);
    expect(cas.betError(s, 2)).toBeNull();
    // Even a fish worth this much still sells and turns in for whole numbers.
    expect(Number.isSafeInteger(eco.sellPrice(s, s.slots[2] as ReturnType<typeof fish>))).toBe(true);
    expect(cas.chipsFor(eco.fishValue(s.slots[2] as ReturnType<typeof fish>))).toBeGreaterThan(1e6);
    cas.settleBet(s, 2, 0);
    expect(s.slots[2]).toBeNull();
  });

  it('refuses empty slots and non-fish', () => {
    const s = newSave();
    expect(cas.betError(s, 0)).toBeTruthy();
    expect(cas.betError(s, 4)).toBeTruthy();
    expect(cas.betError(s, 9)).toBeTruthy();
  });
});

describe('prize shop', () => {
  it('turns a fish in for chips of its value and refuses worthless ones', () => {
    const s = saveWith(fish());
    const value = eco.fishValue(s.slots[2] as ReturnType<typeof fish>);
    expect(cas.cashOut(s, 2)).toBeCloseTo(Math.floor((value / CHIP_COINS) * 10) / 10);
    expect(s.slots[2]).toBeNull();
    const cheap = newSave();
    cheap.slots[2] = { k: 'fish', fishId: FISH[0].id, size: FISH[0].minSize };
    expect(cas.cashOut(cheap, 2)).toBe(0);
    expect(cheap.slots[2]).not.toBeNull();
  });

  it('buys perks with chips, in order, once', () => {
    const s = newSave();
    s.chips = 500;
    expect(eco.buyPerk(s, 'charm2')).toBe(false);
    expect(eco.buyPerk(s, 'charm1')).toBe(true);
    expect(eco.buyPerk(s, 'charm1')).toBe(false);
    expect(eco.buyPerk(s, 'charm2')).toBe(true);
    expect(eco.charmBonus(s)).toBe(0.1);
    const before = s.slots.length;
    expect(eco.buyPerk(s, 'vest')).toBe(true);
    expect(s.slots).toHaveLength(before + 2);
    expect(eco.buyPerk(s, 'lure')).toBe(true);
    expect(eco.buyPerk(s, 'lure')).toBe(true);
    expect(s.lure).toBe(6);
    s.chips = 0;
    expect(eco.buyPerk(s, 'gloves')).toBe(false);
  });

  it('charms raise the value of fish when they are caught', () => {
    const s = newSave();
    const f = FISH[0];
    eco.applyCatch(s, f, 30);
    const plain = eco.fishValue(s.slots.find((x) => x?.k === 'fish') as ReturnType<typeof fish>);
    const s2 = newSave();
    s2.perks.push('charm1');
    eco.applyCatch(s2, f, 30);
    const item = s2.slots.find((x) => x?.k === 'fish') as ReturnType<typeof fish>;
    expect(eco.fishValue(item)).toBeCloseTo(plain * 1.05, 5);
    expect(eco.sellPrice(s2, item)).toBe(Math.round(plain * 1.05));
  });

  it('shiny lure forces a shiny and spends a charge', () => {
    const s = newSave();
    s.lure = 1;
    const roll = eco.rollCast(s, 'pond', seq(0.5), false);
    expect(roll.fishId).toBeTruthy();
    expect(roll.shiny).toBe(true);
    expect(s.lure).toBe(0);
  });
});

describe('roulette', () => {
  it('has 38 pockets: 18 red, 18 black, 2 green', () => {
    const colors = Array.from({ length: 38 }, (_, i) => cas.pocketColor(i));
    expect(colors.filter((c) => c === 'red')).toHaveLength(18);
    expect(colors.filter((c) => c === 'black')).toHaveLength(18);
    expect(colors.filter((c) => c === 'green')).toHaveLength(2);
  });

  it('pays only the matching colour', () => {
    expect(cas.spinRoulette('red', () => 1 / 38 + 0.001)).toMatchObject({ color: 'red', factor: 2 });
    expect(cas.spinRoulette('black', () => 1 / 38 + 0.001).factor).toBe(0);
    expect(cas.spinRoulette('green', () => 0)).toMatchObject({ color: 'green', factor: 16 });
  });
});

describe('blackjack', () => {
  const game = (player: cas.Card[], dealer: cas.Card[], deck: cas.Card[] = []): cas.Blackjack => ({ deck: [...deck].reverse(), player, dealer, slot: 2, doubled: false, stake: 0, done: false });

  it('totals aces softly', () => {
    expect(cas.handTotal([card(1), card(13)])).toBe(21);
    expect(cas.handTotal([card(1), card(1), card(9)])).toBe(21);
    expect(cas.handTotal([card(10), card(9), card(5)])).toBe(24);
  });

  it('busts on a bad hit', () => {
    const g = game([card(10), card(6)], [card(10), card(7)], [card(9)]);
    expect(cas.actBlackjack(g, 'hit')).toBe(true);
    expect(g).toMatchObject({ done: true, result: 'bust' });
    expect(cas.blackjackFactor(g)).toBe(0);
  });

  it('dealer draws to 17 and the player wins with more', () => {
    const g = game([card(10), card(9)], [card(10), card(2)], [card(5)]);
    cas.actBlackjack(g, 'stand');
    expect(g.result).toBe('win');
    expect(cas.blackjackFactor(g)).toBe(2);
  });

  it('pushes on equal totals and keeps the fish', () => {
    const g = game([card(10), card(8)], [card(10), card(8)]);
    cas.actBlackjack(g, 'stand');
    expect(g.result).toBe('push');
    expect(cas.blackjackFactor(g)).toBe(1);
  });

  it('doubling pays x4 on a win, once, as the first action', () => {
    const g = game([card(5), card(6)], [card(10), card(7)], [card(10)]);
    expect(cas.actBlackjack(g, 'double')).toBe(true);
    expect(g).toMatchObject({ doubled: true, result: 'win' });
    expect(cas.blackjackFactor(g)).toBe(4);
    const late = game([card(2), card(3), card(4)], [card(10), card(7)], [card(2)]);
    expect(cas.actBlackjack(late, 'double')).toBe(false);
  });

  it('doubling down costs coins equal to the fish, refunded only on a push', () => {
    const value = (s: ReturnType<typeof saveWith>) => eco.fishValue(s.slots[2] as ReturnType<typeof fish>);
    const cost = cas.doubleCost(saveWith(fish()), 2);
    expect(cost).toBe(Math.round(value(saveWith(fish()))));

    const broke = saveWith(fish());
    broke.coins = cost - 1;
    const g0 = game([card(5), card(6)], [card(10), card(7)], [card(10)]);
    expect(cas.doubleDown(broke, g0)).toMatch(/costs/);
    expect(g0).toMatchObject({ doubled: false, done: false, stake: 0 });
    expect(broke.coins).toBe(cost - 1);

    const win = saveWith(fish());
    win.coins = cost + 5;
    const g1 = game([card(5), card(6)], [card(10), card(7)], [card(10)]);
    expect(cas.doubleDown(win, g1)).toBeNull();
    cas.settleBlackjack(win, g1);
    expect(win.coins).toBe(5);
    expect(value(win)).toBe(value(saveWith(fish())) * 4);

    const push = saveWith(fish());
    push.coins = cost;
    const g2 = game([card(5), card(6)], [card(10), card(10)], [card(9)]);
    expect(cas.doubleDown(push, g2)).toBeNull();
    expect(g2.result).toBe('push');
    cas.settleBlackjack(push, g2);
    expect(push.coins).toBe(cost);
    expect(push.slots[2]).not.toBeNull();

    const lose = saveWith(fish());
    lose.coins = cost;
    const g3 = game([card(5), card(6)], [card(10), card(10)], [card(2)]);
    expect(cas.doubleDown(lose, g3)).toBeNull();
    cas.settleBlackjack(lose, g3);
    expect(lose.coins).toBe(0);
    expect(lose.slots[2]).toBeNull();

    const late = game([card(2), card(3), card(4)], [card(10), card(7)], [card(2)]);
    expect(cas.doubleDown(saveWith(fish()), late)).toMatch(/first two cards/);
  });

  it('deals two cards each from a 52-card deck', () => {
    const g = cas.dealBlackjack(2, Math.random);
    expect(g.deck.length).toBe(48);
    expect(g.player).toHaveLength(2);
    expect(g.dealer).toHaveLength(2);
  });

  it('hides the dealer hole card until the hand ends', () => {
    const g = game([card(10), card(6)], [card(10), card(7)]);
    expect(cas.blackjackView(g).dealer[1]).toBeNull();
    cas.actBlackjack(g, 'stand');
    expect(cas.blackjackView(g).dealer[1]).not.toBeNull();
  });
});
