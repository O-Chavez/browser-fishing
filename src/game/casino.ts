import { CHIP_COINS, MULT_CAP, ROULETTE_PAY, ROULETTE_POCKETS, type RouletteBet } from '../data/casino';
import { fishValue } from './economy';
import type { SaveData } from './state';

/** Pure casino rules. The server runs these; nothing here touches the network or the DOM. */

type Rng = () => number;

// ---------- betting a fish ----------

/** A fish can be bet unless it already sits at the multiplier cap. */
export function betError(s: SaveData, i: number): string | null {
  const it = s.slots[i];
  if (!Number.isInteger(i) || it?.k !== 'fish') return 'Hold a fish to bet it.';
  if ((it.mult ?? 1) >= MULT_CAP) return `This fish is already at ×${MULT_CAP}. Turn it in at the prize shop.`;
  return null;
}

/** Settles a bet on the fish in slot i: a win multiplies its value (up to the cap), a loss destroys it. */
export function settleBet(s: SaveData, i: number, factor: number): { before: number; after: number } {
  const it = s.slots[i];
  if (it?.k !== 'fish') return { before: 0, after: 0 };
  const before = fishValue(it);
  if (factor <= 0) {
    s.slots[i] = null;
    return { before, after: 0 };
  }
  if (factor > 1) it.mult = Math.min(MULT_CAP, (it.mult ?? 1) * factor);
  return { before, after: fishValue(it) };
}

// ---------- prize shop ----------

/** Chips a fish is worth, in tenths. Nothing below one chip can be turned in. */
export const chipsFor = (value: number): number => Math.floor((value / CHIP_COINS) * 10) / 10;

export function cashOutError(s: SaveData, i: number): string | null {
  const it = s.slots[i];
  if (!Number.isInteger(i) || it?.k !== 'fish') return 'Hold a fish to turn in.';
  if (chipsFor(fishValue(it)) < 1) return `Worth less than 1 chip (${CHIP_COINS} 🪙 of value). Gamble it up first, or sell it for coins.`;
  return null;
}

export function cashOut(s: SaveData, i: number): number {
  if (cashOutError(s, i)) return 0;
  const it = s.slots[i];
  if (it?.k !== 'fish') return 0;
  const chips = chipsFor(fishValue(it));
  s.chips = Math.round((s.chips + chips) * 10) / 10;
  s.slots[i] = null;
  return chips;
}

// ---------- roulette ----------

const POCKET_COUNT = ROULETTE_POCKETS.red + ROULETTE_POCKETS.black + ROULETTE_POCKETS.green;
/** Pocket i on the wheel: two evenly spaced greens, the rest alternate red and black. */
export function pocketColor(i: number): RouletteBet {
  if (i === 0 || i === POCKET_COUNT / 2) return 'green';
  return i % 2 === 1 ? 'red' : 'black';
}

export function spinRoulette(bet: RouletteBet, rng: Rng): { pocket: number; color: RouletteBet; factor: number } {
  const pocket = Math.floor(rng() * POCKET_COUNT);
  const color = pocketColor(pocket);
  return { pocket, color, factor: color === bet ? ROULETTE_PAY[bet] : 0 };
}

// ---------- blackjack ----------

export interface Card { r: number; s: number }
export type BjResult = 'win' | 'blackjack' | 'lose' | 'bust' | 'push';

export interface Blackjack {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  /** The hotbar slot holding the bet fish. */
  slot: number;
  doubled: boolean;
  done: boolean;
  result?: BjResult;
}

export function handTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 1) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.r);
  }
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}

const isNatural = (cards: Card[]): boolean => cards.length === 2 && handTotal(cards) === 21;

function shuffled(rng: Rng): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function dealBlackjack(slot: number, rng: Rng): Blackjack {
  const deck = shuffled(rng);
  const g: Blackjack = { deck, player: [deck.pop()!], dealer: [deck.pop()!], slot, doubled: false, done: false };
  g.player.push(deck.pop()!);
  g.dealer.push(deck.pop()!);
  const pn = isNatural(g.player);
  const dn = isNatural(g.dealer);
  if (pn || dn) finish(g, pn && dn ? 'push' : pn ? 'blackjack' : 'lose');
  return g;
}

function finish(g: Blackjack, result: BjResult): void {
  g.done = true;
  g.result = result;
}

function dealerPlays(g: Blackjack): void {
  while (handTotal(g.dealer) < 17) g.dealer.push(g.deck.pop()!);
  const p = handTotal(g.player);
  const d = handTotal(g.dealer);
  finish(g, d > 21 || p > d ? 'win' : p === d ? 'push' : 'lose');
}

export type BjAction = 'hit' | 'stand' | 'double';

export const canDouble = (g: Blackjack): boolean => !g.done && g.player.length === 2;

/** Applies a player action. Returns false when the action is not allowed. */
export function actBlackjack(g: Blackjack, a: BjAction): boolean {
  if (g.done) return false;
  if (a === 'hit') {
    g.player.push(g.deck.pop()!);
    const t = handTotal(g.player);
    if (t > 21) finish(g, 'bust');
    else if (t === 21) dealerPlays(g);
  } else if (a === 'stand') dealerPlays(g);
  else if (a === 'double') {
    if (!canDouble(g)) return false;
    g.doubled = true;
    g.player.push(g.deck.pop()!);
    if (handTotal(g.player) > 21) finish(g, 'bust');
    else dealerPlays(g);
  } else return false;
  return true;
}

/** The multiplier a finished hand pays: 0 destroys the fish, 1 returns it unchanged. */
export function blackjackFactor(g: Blackjack): number {
  switch (g.result) {
    case 'blackjack':
      return 3;
    case 'win':
      return g.doubled ? 4 : 2;
    case 'push':
      return 1;
    default:
      return 0;
  }
}

/** What the client may see: the dealer's second card stays hidden until the hand is over. */
export interface BlackjackView {
  player: Card[];
  dealer: (Card | null)[];
  playerTotal: number;
  dealerTotal: number | null;
  done: boolean;
  result?: BjResult;
  factor: number;
  canDouble: boolean;
}

export function blackjackView(g: Blackjack): BlackjackView {
  return {
    player: g.player,
    dealer: g.done ? g.dealer : [g.dealer[0], null],
    playerTotal: handTotal(g.player),
    dealerTotal: g.done ? handTotal(g.dealer) : null,
    done: g.done,
    result: g.result,
    factor: g.done ? blackjackFactor(g) : 0,
    canDouble: canDouble(g),
  };
}
