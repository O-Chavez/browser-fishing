import { describe, expect, it } from 'vitest';
import * as cas from './casino';
import { CARD_FLIP_MS, CARD_SLIDE_MS, DRAW_PAUSE_MS, HOLE_PAUSE_MS, dealSteps, landedView, pegTicks, spinEase } from './tablepace';

const card = (r: number, s = 0): cas.Card => ({ r, s });
/** A hand dealt from a stacked deck: the last card listed is drawn first. */
const game = (player: cas.Card[], dealer: cas.Card[], draws: cas.Card[] = []): cas.Blackjack => {
  const deck = [...draws].reverse();
  return { deck, player, dealer, slot: 2, doubled: false, stake: 0, done: false };
};
/** A view as the client gets it: a copy, since the server's shares the hand's arrays. */
const view = (g: cas.Blackjack) => structuredClone(cas.blackjackView(g));
const order = (steps: ReturnType<typeof dealSteps>['steps']) => steps.map((s) => `${s.flip ? 'flip ' : ''}${s.who}${s.i}`);

describe('pacing a blackjack deal', () => {
  it('deals the opening hand one card at a time, the hole card face down', () => {
    const v = view(game([card(10), card(7)], [card(9), card(5)]));
    const { steps, end } = dealSteps(null, v);
    expect(order(steps)).toEqual(['player0', 'dealer0', 'player1', 'dealer1']);
    expect(steps[3].card).toBeNull();
    // Each card starts after the one before it has landed.
    for (let i = 1; i < steps.length; i++) expect(steps[i].at).toBeGreaterThan(steps[i - 1].at + steps[i - 1].ms - 1);
    expect(end).toBe(steps[3].at + CARD_SLIDE_MS);
  });

  it('turns the hole card over when a natural ends the hand on the deal', () => {
    const g = game([card(1), card(13)], [card(9), card(5)]);
    g.done = true;
    g.result = 'blackjack';
    const { steps, end } = dealSteps(null, view(g));
    expect(order(steps)).toEqual(['player0', 'dealer0', 'player1', 'dealer1', 'flip dealer1']);
    expect(steps[4]).toMatchObject({ card: card(5), at: steps[3].at + CARD_SLIDE_MS + HOLE_PAUSE_MS });
    expect(end).toBe(steps[4].at + CARD_FLIP_MS);
  });

  it('starts a new hand from an empty felt after a finished one', () => {
    const old = view(Object.assign(game([card(10), card(9)], [card(10), card(8)]), { done: true, result: 'win' as const }));
    const v = view(game([card(2), card(3)], [card(4), card(5)]));
    expect(order(dealSteps(old, v).steps)).toEqual(['player0', 'dealer0', 'player1', 'dealer1']);
  });

  it('deals a hit on its own, then the hole card and a bust', () => {
    const g = game([card(10), card(6)], [card(9), card(7)], [card(4), card(9)]);
    const live = view(g);
    cas.actBlackjack(g, 'hit');
    const hit = view(g);
    expect(order(dealSteps(live, hit).steps)).toEqual(['player2']);
    expect(dealSteps(live, hit).end).toBe(CARD_SLIDE_MS);
    cas.actBlackjack(g, 'hit');
    expect(order(dealSteps(hit, view(g)).steps)).toEqual(['player3', 'flip dealer1']);
  });

  it('turns the hole card at once on a stand, then draws one by one with a hold before each', () => {
    const g = game([card(10), card(8)], [card(5), card(6)], [card(2), card(3), card(4)]);
    const live = view(g);
    cas.actBlackjack(g, 'stand');
    const { steps, end } = dealSteps(live, view(g));
    expect(order(steps)).toEqual(['flip dealer1', 'dealer2', 'dealer3', 'dealer4']);
    expect(steps[0].at).toBe(0);
    expect(steps[1].at).toBe(CARD_FLIP_MS + DRAW_PAUSE_MS);
    expect(steps[2].at).toBe(steps[1].at + CARD_SLIDE_MS + DRAW_PAUSE_MS);
    expect(end).toBe(steps[3].at + CARD_SLIDE_MS);
  });

  it('deals a double down card before the dealer plays', () => {
    const g = game([card(5), card(6)], [card(10), card(6)], [card(9), card(2)]);
    const live = view(g);
    cas.actBlackjack(g, 'double');
    expect(order(dealSteps(live, view(g)).steps)).toEqual(['player2', 'flip dealer1', 'dealer2']);
  });

  it('shows only the landed cards and keeps the hand open until the end', () => {
    const g = game([card(1), card(13)], [card(9), card(5)]);
    g.done = true;
    g.result = 'blackjack';
    const v = view(g);
    const { steps } = dealSteps(null, v);
    expect(landedView(null, v, steps, 0)).toMatchObject({ player: [], dealer: [], playerTotal: 0, dealerTotal: null, done: false });
    expect(landedView(null, v, steps, 3)).toMatchObject({ player: [card(1), card(13)], dealer: [card(9)], playerTotal: 21, dealerTotal: null, done: false, result: undefined });
    // The dealer's total stays hidden until the hole card is turned.
    expect(landedView(null, v, steps, 4)).toMatchObject({ dealer: [card(9), null], dealerTotal: null, canDouble: false });
    expect(landedView(null, v, steps, 5)).toMatchObject({ dealer: [card(9), card(5)], dealerTotal: 14, done: false });
  });
});

describe('wheel ticks', () => {
  const step = (Math.PI * 2) / 8;
  it('ticks once per peg passed, spread over the frame', () => {
    expect(pegTicks(0.1, 0.2, 8, 1 / 60).at).toEqual([]);
    expect(pegTicks(step - 0.01, step + 0.01, 8, 1 / 60)).toEqual({ at: [0], gain: expect.any(Number) });
    const three = pegTicks(0.01, step * 3 + 0.01, 8, 0.03);
    expect(three.at).toEqual([0, 0.01, 0.02]);
  });

  it('caps a fast rattle and softens it, while slow clicks are full strength', () => {
    const fast = pegTicks(0, step * 10 + 0.01, 8, 1 / 60);
    expect(fast.at).toHaveLength(4);
    expect(fast.gain).toBeLessThan(0.3);
    expect(pegTicks(step - 0.01, step + 0.01, 8, 0.2).gain).toBe(1);
  });

  it('slows to a stop', () => {
    expect(spinEase(0)).toBe(0);
    expect(spinEase(1)).toBe(1);
    // The speed falls steadily to zero at the end.
    const speed = (k: number) => (spinEase(k + 1e-4) - spinEase(k)) / 1e-4;
    expect(speed(0)).toBeCloseTo(2, 2);
    expect(speed(0.5)).toBeCloseTo(1, 2);
    expect(speed(1 - 1e-4)).toBeCloseTo(0, 2);
  });
});
