import { CHIP_COINS, ROULETTE_PAY, ROULETTE_POCKETS, type RouletteBet } from '../data/casino';
import { fishValue } from './economy';
import type { SaveData } from './state';

/** Pure casino rules. The server runs these; nothing here touches the network or the DOM. */

type Rng = () => number;

// ---------- betting a fish ----------

/** Any fish can be bet; there is no limit on how much it can grow. */
export function betError(s: SaveData, i: number): string | null {
  const it = s.slots[i];
  if (!Number.isInteger(i) || it?.k !== 'fish') return 'Hold a fish to bet it.';
  return null;
}

/** Settles a bet on the fish in slot i: a win multiplies its value, a loss destroys it. */
export function settleBet(s: SaveData, i: number, factor: number): { before: number; after: number } {
  const it = s.slots[i];
  if (it?.k !== 'fish') return { before: 0, after: 0 };
  const before = fishValue(it);
  if (factor <= 0) {
    s.slots[i] = null;
    return { before, after: 0 };
  }
  if (factor > 1) it.mult = (it.mult ?? 1) * factor;
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
  /** Coins paid to double down: lost with the fish, refunded on a push. */
  stake: number;
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
  const g: Blackjack = { deck, player: [deck.pop()!], dealer: [deck.pop()!], slot, doubled: false, stake: 0, done: false };
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

/** Coins it costs to double down: the bet fish's value, so the fish and the coins are both at stake. */
export function doubleCost(s: SaveData, slot: number): number {
  const it = s.slots[slot];
  return it?.k === 'fish' ? Math.round(fishValue(it)) : 0;
}

/** Doubles down, paying the stake in coins. Returns why it can't, or null once the action is taken. */
export function doubleDown(s: SaveData, g: Blackjack): string | null {
  if (!canDouble(g)) return 'You can only double down on your first two cards.';
  const cost = doubleCost(s, g.slot);
  if (s.coins < cost) return `Doubling down costs ${cost} 🪙. You only have ${Math.floor(s.coins)} 🪙.`;
  s.coins -= cost;
  g.stake = cost;
  actBlackjack(g, 'double');
  return null;
}

/** Pays out a finished hand: the fish wins, survives or is lost, and a push refunds the double-down stake. */
export function settleBlackjack(s: SaveData, g: Blackjack): void {
  settleBet(s, g.slot, blackjackFactor(g));
  if (g.result === 'push') s.coins += g.stake;
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

/**
 * How a finished hand reads on the result banner (title, sub) and the table readout (line). A natural
 * 21 ends the hand on the deal, so it says who had blackjack.
 */
export function blackjackVerdict(v: BlackjackView): { kind: 'win' | 'lose' | 'push'; title: string; sub: string; line: string } {
  const r = v.result ?? 'lose';
  const kind = r === 'win' || r === 'blackjack' ? 'win' : r === 'push' ? 'push' : 'lose';
  const dealer21 = v.dealer.length === 2 && v.dealer.every((c) => c) && handTotal(v.dealer as Card[]) === 21;
  if (r === 'blackjack') return { kind, title: 'BLACKJACK!', sub: `You were dealt 21 · your fish is now worth ×${v.factor}`, line: 'Blackjack! You were dealt 21.' };
  if (dealer21 && r === 'push') return { kind, title: 'BOTH BLACKJACK', sub: 'You and the dealer were both dealt 21 · your fish is safe', line: 'Both blackjack. Your fish is safe.' };
  if (dealer21) return { kind, title: 'DEALER BLACKJACK', sub: 'The dealer was dealt 21 · the fish is gone', line: 'Dealer blackjack. The fish is gone.' };
  const title = { win: 'YOU WIN!', push: 'PUSH', lose: 'DEALER WINS', bust: 'BUST!' }[r];
  const line = { win: 'You win!', push: 'Push. Your fish is safe.', lose: 'Dealer wins. The fish is gone.', bust: 'Bust. The fish is gone.' }[r];
  // A doubled hand also staked coins: refunded on a push, lost with the fish.
  const sub =
    kind === 'win' ? `Your fish is now worth ×${v.factor}`
    : kind === 'push' ? (v.stake ? `Your fish is safe and ${v.stake} 🪙 came back` : 'Your fish is safe')
    : v.stake ? `The fish and ${v.stake} 🪙 are gone` : 'The fish is gone';
  return { kind, title, sub, line };
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
  /** Coins staked on a double down. */
  stake: number;
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
    stake: g.stake,
  };
}
