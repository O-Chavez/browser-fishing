import { handTotal, type BlackjackView, type Card } from './casino';

/** Pacing for the casino reveals. The server has already decided; these only set how the client shows it. */

/** The quiet beat between a wheel stopping (or the last card landing) and the result banner and sound. */
export const RESULT_BEAT_MS = 450;
/** A card sliding from the shoe to its place on the felt. */
export const CARD_SLIDE_MS = 300;
/** The dealer's hole card turning over. */
export const CARD_FLIP_MS = 350;
/** Between cards of the opening deal (after the previous one lands). */
export const DEAL_GAP_MS = 120;
/** The hold before the hole card turns over after the player's own cards (a natural, a bust, a double). */
export const HOLE_PAUSE_MS = 550;
/** The hold before each card the dealer draws. */
export const DRAW_PAUSE_MS = 600;
/** Most pegs that tick in one frame; a faster wheel rattles at this rate. */
const PEG_CAP = 4;
/** Pegs per second above which each tick gets quieter, so a fast rattle stays soft and the last slow clicks stand out. */
const PEG_SOFT_RATE = 12;

export interface DealStep {
  /** Start, in ms from when the view arrived; the card has landed at `at + ms`. */
  at: number;
  ms: number;
  who: 'player' | 'dealer';
  i: number;
  /** The face it lands with: null is the hole card, dealt face down. */
  card: Card | null;
  /** Turns over a card already on the felt instead of dealing one. */
  flip?: boolean;
}

/**
 * The cards a new view adds to the hand on the felt (`shown`, null or finished for a new deal), in
 * dealing order: the opening deal goes player, dealer, player, dealer (face down); then the player's
 * new card, the hole card turning over once the hand is decided, and each dealer draw after a hold.
 * `end` is when the last card has landed.
 */
export function dealSteps(shown: BlackjackView | null, v: BlackjackView): { steps: DealStep[]; end: number } {
  const steps: DealStep[] = [];
  let t = 0;
  const add = (pause: number, s: Omit<DealStep, 'at' | 'ms'>) => {
    if (steps.length) t += pause;
    const ms = s.flip ? CARD_FLIP_MS : CARD_SLIDE_MS;
    steps.push({ ...s, at: t, ms });
    t += ms;
  };
  const fresh = !shown || shown.done;
  let p = fresh ? 0 : shown.player.length;
  let d = fresh ? 0 : shown.dealer.length;
  if (fresh) {
    for (let i = 0; i < 2; i++) {
      if (i < v.player.length) add(DEAL_GAP_MS, { who: 'player', i, card: v.player[i] });
      if (i < v.dealer.length) add(DEAL_GAP_MS, { who: 'dealer', i, card: i === 1 ? null : v.dealer[i] });
    }
    p = Math.min(2, v.player.length);
    d = Math.min(2, v.dealer.length);
  }
  for (; p < v.player.length; p++) add(DEAL_GAP_MS, { who: 'player', i: p, card: v.player[p] });
  const hole = v.dealer[1];
  if (hole && (fresh || !shown.dealer[1])) add(HOLE_PAUSE_MS, { who: 'dealer', i: 1, card: hole, flip: true });
  for (d = Math.max(d, 2); d < v.dealer.length; d++) add(DRAW_PAUSE_MS, { who: 'dealer', i: d, card: v.dealer[d] });
  return { steps, end: t };
}

/**
 * The hand as the felt shows it once `landed` of the steps have landed: the totals count only the
 * cards down so far (the dealer's stays hidden until the hole card is turned), and nothing is
 * decided or clickable until the reveal ends.
 */
export function landedView(shown: BlackjackView | null, v: BlackjackView, steps: DealStep[], landed: number): BlackjackView {
  const fresh = !shown || shown.done;
  const player = fresh ? [] : [...shown.player];
  const dealer = fresh ? [] : [...shown.dealer];
  for (const s of steps.slice(0, landed)) {
    if (s.who === 'player') player[s.i] = s.card!;
    else dealer[s.i] = s.card;
  }
  // Hidden until the hole card is down and turned, as in a live hand: no up-card total flashing first
  const faceUp = dealer.length > 1 && dealer.every((c) => c);
  return { ...v, player, dealer, playerTotal: handTotal(player), dealerTotal: faceUp ? handTotal(dealer as Card[]) : null, done: false, result: undefined, factor: 0, canDouble: false };
}

/**
 * Ticks for the pegs (or pockets) that passed a wheel's pointer this frame, as the wheel turned from
 * `from` to `to` (radians, increasing; peg edges at multiples of 2π / pegs). The ticks are spread
 * across the frame so a fast spin rattles evenly, and a fast rattle is softer.
 */
export function pegTicks(from: number, to: number, pegs: number, dt: number): { at: number[]; gain: number } {
  const k = pegs / (Math.PI * 2);
  const n = Math.max(0, Math.floor(to * k) - Math.floor(from * k));
  if (!n) return { at: [], gain: 0 };
  const rate = n / Math.max(dt, 1 / 240);
  const shown = Math.min(n, PEG_CAP);
  return { at: Array.from({ length: shown }, (_, i) => (i * dt) / shown), gain: Math.min(1, Math.sqrt(PEG_SOFT_RATE / rate)) };
}

/** Constant deceleration, like friction: fast at first, then a clean stop at k = 1. */
export const spinEase = (k: number): number => 1 - (1 - k) * (1 - k);
