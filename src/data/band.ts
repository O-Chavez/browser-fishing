import { LOG, campLogs, type MapDef } from './maps';

/**
 * The campfire band at Anglers' Rest: the notes and the rules, with no sound in it (the voices are in
 * `src/game/bandsound.ts`). Each of the six log seats round the Great Fire has an instrument, and a player seated
 * there plays its part until they get up. Every part is written from the bar's number alone, and the bar's number
 * comes from the server's shared clock, so every player hears the same notes at the same moment without a message
 * being sent. The town's own tune keeps the same bars and chords, so the two can sound together.
 */

export type InstrumentId = 'banjo' | 'drum' | 'squeezebox' | 'whistle' | 'washboard' | 'jug';
/** In fire-log order (`CAMP.logs.at`): log i plays INSTRUMENTS[i]. `name` is how the prompt says it: "Sit down · play the banjo". */
export const INSTRUMENTS: readonly { id: InstrumentId; name: string }[] = [
  { id: 'banjo', name: 'banjo' },
  { id: 'drum', name: 'drum' },
  { id: 'squeezebox', name: 'squeezebox' },
  { id: 'whistle', name: 'whistle' },
  { id: 'washboard', name: 'washboard' },
  { id: 'jug', name: 'jug' },
];
/** The bit of instrument `i` (its place in `INSTRUMENTS`) in a "who is playing" mask; `ALL_PARTS` is the full ring. */
export const partBit = (i: number): number => 1 << i;
export const ALL_PARTS = (1 << INSTRUMENTS.length) - 1;

/** The tune's lilt: six eighth notes to the bar (6/8), at the pace the town's tune has always had. */
export const EIGHTH_MS = 360;
export const BEATS = 6;
export const BAR_MS = EIGHTH_MS * BEATS;

/** The bar the shared clock is in, and how far into it (0..1). */
export function barAt(nowMs: number): { bar: number; phase: number } {
  const bar = Math.floor(nowMs / BAR_MS);
  // Clamped: at huge clock values the division's rounding could put the phase a hair outside the bar.
  return { bar, phase: Math.min(1 - Number.EPSILON, Math.max(0, (nowMs - bar * BAR_MS) / BAR_MS)) };
}

/**
 * Where the scheduler has got to: the last bar it scheduled (null before the first) and when what it has scheduled
 * ends on the audio clock (s).
 */
export interface BarClock {
  last: number | null;
  endT: number;
}
/**
 * A bar scheduled after the shared clock moved may start a little before the last one ends; its notes play unless
 * they would land more than this (s) inside the bar still sounding. The server resends the clock every minute and
 * the answer moves by a few ms each time.
 */
const OVERLAP = 0.1;
/** A note that should already have started is dropped unless it is this fresh (s). */
const LATE = 0.02;
/** A bar already scheduled that now lies more than this (s) past the look-ahead means the clock has jumped back. */
const BACK_SLACK = 0.25;
/**
 * The bars to schedule now: every bar after `c.last` that starts within `ahead` seconds, each with its start `t`
 * on the audio clock (which reads `now`) and the time `notBefore` which none of its notes may start. `nowMs` is
 * the shared clock. Each bar comes up once and whole, where the clock says it starts, so a clock that is corrected
 * by a few ms only moves the next bar line by as much. At the start, after a long sleep (a throttled tab) or when
 * the clock itself has jumped (joining a server), it picks up in the bar the clock is in, of which only what is
 * left gets played: never the missed bars in a burst, and never over the bar still sounding. Updates `c`.
 */
export function barsDue(c: BarClock, nowMs: number, now: number, ahead: number): { bar: number; t: number; notBefore: number }[] {
  const cur = Math.floor(nowMs / BAR_MS);
  const jumpedBack = c.last !== null && c.last * BAR_MS > nowMs + (ahead + BACK_SLACK) * 1000;
  let last = c.last === null || c.last < cur - 1 || jumpedBack ? cur - 1 : c.last;
  const due: { bar: number; t: number; notBefore: number }[] = [];
  for (;;) {
    const bar = last + 1;
    const t = now + (bar * BAR_MS - nowMs) / 1000;
    if (t > now + ahead) break;
    due.push({ bar, t, notBefore: Math.max(now + LATE, c.endT - OVERLAP) });
    last = bar;
    // Never earlier than what is already scheduled: after a jump back, that still has to play out first.
    c.endT = Math.max(c.endT, t + BAR_MS / 1000);
  }
  c.last = last;
  return due;
}

/** A chord of the tune: its name, its root as a pitch class (0 is C), and the pitch classes that fit it. */
export interface Chord {
  name: string;
  root: number;
  tones: readonly number[];
}
const D: Chord = { name: 'D', root: 2, tones: [2, 6, 9] };
const G: Chord = { name: 'G', root: 7, tones: [7, 11, 2] };
const A: Chord = { name: 'A', root: 9, tones: [9, 1, 4] };
const BM: Chord = { name: 'Bm', root: 11, tones: [11, 2, 6] };
/** The eight-bar round the town's tune has always played. */
export const CHORDS: readonly Chord[] = [D, G, A, D, BM, G, D, A];
/** The chord of bar `bar` (any integer). */
export const chordAt = (bar: number): Chord => CHORDS[mod(bar, CHORDS.length)];
/** D major, and its five-note scale the melodies keep to (D E F# A B), as pitch classes. */
export const D_MAJOR: readonly number[] = [2, 4, 6, 7, 9, 11, 1];
export const D_PENTATONIC: readonly number[] = [2, 4, 6, 9, 11];

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * A number from 0 up to (not including) 1 made from a bar's number and a `salt` (which choice it is for): the
 * band's dice. The same bar gives the same number on every player's machine, so everyone hears the same turns
 * and fills.
 */
export function barHash(bar: number, salt = 0): number {
  let h = (Math.imul(bar | 0, 0x9e3779b1) ^ Math.imul((salt + 1) | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How an unpitched note is struck: the drum's low thump and its light tap, the washboard's scratch. */
export type Hit = 'thump' | 'tap' | 'scratch';
/** One note of a part, timed from the start of its bar. */
export interface BandNote {
  /** When it starts, in eighths from the bar's start (0 to 6; halves are sixteenths). */
  at: number;
  /** How long it is held, in eighths. A held note may ring on past the bar line. */
  len: number;
  /** Its pitch as a MIDI note (60 is middle C), or 0 for a drum or washboard hit. */
  midi: number;
  /** How hard it is played, 0..1. */
  vel: number;
  hit?: Hit;
}

// ---------- banjo: the lead roll ----------

/**
 * The banjo's strings for each chord: the thumb's two (the root on beat 1, the fifth below or above on beat 4) and
 * four fingers' notes, low to high. It sits from D3 to D5, over the jug and under the whistle.
 */
const BANJO: Record<string, { thumb: [number, number]; up: [number, number, number, number] }> = {
  D: { thumb: [50, 57], up: [62, 66, 69, 74] },
  G: { thumb: [55, 50], up: [62, 67, 71, 74] },
  A: { thumb: [57, 52], up: [61, 64, 69, 73] },
  Bm: { thumb: [59, 54], up: [62, 66, 71, 74] },
};
/** The rolls: which finger string (0..3 of `up`) plays on eighths 2, 3, 5 and 6; the thumb takes 1 and 4. */
const ROLLS: readonly [number, number, number, number][] = [
  [0, 1, 2, 1],
  [1, 2, 0, 2],
  [0, 2, 1, 3],
  [2, 1, 2, 0],
];
/** How often a bar ends in a melodic turn instead of its last two plain eighths. Play-test. */
const BANJO_TURN = 0.3;
/** The next note up the D major scale from `midi`. */
function scaleUp(midi: number): number {
  for (let m = midi + 1; ; m++) if (D_MAJOR.includes(mod(m, 12))) return m;
}
function banjo(bar: number): BandNote[] {
  const c = BANJO[chordAt(bar).name];
  const roll = ROLLS[Math.floor(barHash(bar, 1) * ROLLS.length)];
  const soft = (i: number) => 0.5 + 0.18 * barHash(bar, 10 + i);
  const notes: BandNote[] = [
    { at: 0, len: 1, midi: c.thumb[0], vel: 0.95 },
    { at: 1, len: 1, midi: c.up[roll[0]], vel: soft(1) },
    { at: 2, len: 1, midi: c.up[roll[1]], vel: soft(2) },
    { at: 3, len: 1, midi: c.thumb[1], vel: 0.8 },
  ];
  // The last bar of each round always turns, to lead back to the top.
  if (mod(bar, CHORDS.length) === CHORDS.length - 1 || barHash(bar, 2) < BANJO_TURN) {
    // A turn in sixteenths: a string, the scale note above it hammered on and pulled off, then the string below.
    const s = c.up[2];
    notes.push(
      { at: 4, len: 0.5, midi: s, vel: 0.62 },
      { at: 4.5, len: 0.5, midi: scaleUp(s), vel: 0.45 },
      { at: 5, len: 0.5, midi: s, vel: 0.55 },
      { at: 5.5, len: 0.5, midi: c.up[1], vel: 0.48 },
    );
  } else {
    notes.push({ at: 4, len: 1, midi: c.up[roll[2]], vel: soft(4) }, { at: 5, len: 1, midi: c.up[roll[3]], vel: soft(5) });
  }
  return notes;
}

// ---------- drum: a soft hand drum ----------

function drum(bar: number): BandNote[] {
  const notes: BandNote[] = [
    { at: 0, len: 1, midi: 0, vel: 1, hit: 'thump' },
    { at: 2, len: 1, midi: 0, vel: 0.5, hit: 'tap' },
    { at: 3, len: 1, midi: 0, vel: 0.8, hit: 'thump' },
    { at: 5, len: 1, midi: 0, vel: 0.55, hit: 'tap' },
  ];
  // Some bars fill in the other eighths, lighter still.
  if (barHash(bar, 3) < 0.5) notes.push({ at: 1, len: 1, midi: 0, vel: 0.32, hit: 'tap' });
  if (barHash(bar, 4) < 0.35) notes.push({ at: 4, len: 1, midi: 0, vel: 0.36, hit: 'tap' });
  // Every fourth bar ends on a little run of taps into the next.
  if (mod(bar, 4) === 3) notes.push({ at: 4.5, len: 0.5, midi: 0, vel: 0.4, hit: 'tap' }, { at: 5.5, len: 0.5, midi: 0, vel: 0.45, hit: 'tap' });
  return notes.sort((a, b) => a.at - b.at);
}

// ---------- squeezebox: held chords ----------

/** The squeezebox's three reeds for each chord, around middle C, each chord a step or less from the last. */
const REEDS: Record<string, [number, number, number]> = {
  D: [57, 62, 66],
  G: [59, 62, 67],
  A: [57, 61, 64],
  Bm: [59, 62, 66],
};
/** How long before the bar line the bellows let go (eighths), so one chord never sounds over the next. Play-test. */
const BELLOWS_GAP = 0.7;
function squeezebox(bar: number): BandNote[] {
  const reeds = REEDS[chordAt(bar).name];
  // Most bars are one long pull; some are a push and a pull, one to each half of the bar.
  const pushes = barHash(bar, 5) < 0.35 ? [{ at: 0, len: 3 - BELLOWS_GAP, vel: 0.85 }, { at: 3, len: 3 - BELLOWS_GAP, vel: 0.7 }] : [{ at: 0, len: BEATS - BELLOWS_GAP, vel: 0.85 }];
  return pushes.flatMap((p) => reeds.map((midi) => ({ ...p, midi })));
}

// ---------- whistle: the melody ----------

/** A note of a whistle phrase: when it starts in eighths from the phrase's start (0 to 12), how long it is held, its pitch. */
type PhraseNote = [at: number, len: number, midi: number];
/**
 * The whistle's phrases, two bars each, on D E F# A B from B4 to D6. The round's eight bars are four pairs of
 * chords (D G, A D, Bm G, D A); each pair has two phrases written for it and the bar's dice pick one. Every phrase
 * opens each of its bars on a note of that bar's chord and rests on one.
 */
const PHRASES: readonly (readonly PhraseNote[])[][] = [
  [
    [[0, 2, 78], [2, 1, 81], [3, 2, 83], [5, 1, 81], [6, 3, 83], [9, 2, 81], [11, 1, 78]],
    [[0, 3, 81], [3, 2, 78], [5, 1, 76], [6, 2, 74], [8, 1, 76], [9, 3, 74]],
  ],
  [
    [[0, 2, 76], [2, 1, 78], [3, 3, 76], [6, 2, 78], [8, 1, 76], [9, 3, 74]],
    [[0, 3, 81], [3, 2, 76], [5, 1, 78], [6, 3, 81], [9, 3, 78]],
  ],
  [
    [[0, 2, 83], [2, 1, 81], [3, 2, 78], [5, 1, 81], [6, 3, 83], [9, 2, 86], [11, 1, 83]],
    [[0, 3, 78], [3, 2, 74], [5, 1, 76], [6, 2, 74], [8, 1, 71], [9, 3, 74]],
  ],
  [
    [[0, 2, 81], [2, 1, 78], [3, 2, 74], [5, 1, 78], [6, 2, 76], [8, 1, 78], [9, 3, 76]],
    [[0, 2, 74], [2, 1, 76], [3, 3, 78], [6, 2, 81], [8, 1, 83], [9, 3, 81]],
  ],
];
/** How often a phrase's second bar is left as its first note alone, held: room to breathe. Play-test. */
const WHISTLE_REST = 0.25;
/** A phrase's last note lets go this long before the next phrase (eighths): the player's breath. Play-test. */
const WHISTLE_BREATH = 0.9;
function whistle(bar: number): BandNote[] {
  const pair = Math.floor(bar / 2);
  const second = mod(bar, 2) === 1;
  const options = PHRASES[mod(pair, PHRASES.length)];
  const phrase = options[Math.floor(barHash(pair, 6) * options.length)];
  const from = second ? BEATS : 0;
  let mine = phrase.filter(([at]) => at >= from && at < from + BEATS);
  if (second && barHash(pair, 7) < WHISTLE_REST) mine = [[from, 4, mine[0][2]]];
  // A long note that ends the phrase is cut short for the breath; a short pick-up note runs on into the next phrase.
  const held = (at: number, len: number) => (len >= 2 && at + len >= 2 * BEATS ? 2 * BEATS - WHISTLE_BREATH - at : len);
  // A little weight on the two beats of the bar, and less breath behind the short notes.
  return mine.map(([at, len, midi]) => ({ at: at - from, len: held(at, len), midi, vel: (at - from) % 3 === 0 ? 0.9 : len >= 2 ? 0.74 : 0.6 }));
}

// ---------- washboard: scratches on the eighths ----------

function washboard(bar: number): BandNote[] {
  const notes: BandNote[] = [];
  for (let i = 0; i < BEATS; i++) notes.push({ at: i, len: 1, midi: 0, vel: i === 0 ? 1 : i === 3 ? 0.8 : 0.42 + 0.16 * barHash(bar, 20 + i), hit: 'scratch' });
  // Now and then a quick double before a beat.
  if (barHash(bar, 8) < 0.4) notes.push({ at: 2.5, len: 0.5, midi: 0, vel: 0.36, hit: 'scratch' });
  if (barHash(bar, 9) < 0.4) notes.push({ at: 5.5, len: 0.5, midi: 0, vel: 0.4, hit: 'scratch' });
  return notes.sort((a, b) => a.at - b.at);
}

// ---------- jug: the bass ----------

/** The jug's two notes for each chord, the root and its fifth, from D2 to B2: under everything else. */
const JUG: Record<string, [number, number]> = { D: [38, 45], G: [43, 38], A: [45, 40], Bm: [47, 42] };
function jug(bar: number): BandNote[] {
  const [root, fifth] = JUG[chordAt(bar).name];
  const notes: BandNote[] = [
    { at: 0, len: 2.4, midi: root, vel: 1 },
    { at: 3, len: 1.8, midi: fifth, vel: 0.8 },
  ];
  // Some bars puff the root once more on the last eighth, into the next bar.
  if (barHash(bar, 11) < 0.3) notes.push({ at: 5, len: 0.8, midi: root, vel: 0.6 });
  return notes;
}

const PARTS: Record<InstrumentId, (bar: number) => BandNote[]> = { banjo, drum, squeezebox, whistle, washboard, jug };
/** The notes instrument `id` plays in bar `bar` (any integer), in the order they start. */
export function bandNotes(id: InstrumentId, bar: number): BandNote[] {
  return PARTS[id](Math.floor(bar));
}

/** How close to a log's seat (m) a seated player counts as on it: the two seats of a log are 0.76 m apart and position updates are rounded. */
const ON_SEAT = 0.3;
/** The fire log (0..5) whose seat is at this spot, or -1: a seated player there plays INSTRUMENTS[that]. */
export function bandLog(map: MapDef, x: number, z: number): number {
  const camp = map.camp;
  if (!camp) return -1;
  // The fire's logs come first in `campLogs`, in `CAMP.logs.at` order; the beach's logs after them are quiet.
  const logs = campLogs(map).slice(0, Math.min(camp.logs.at.length, INSTRUMENTS.length));
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i];
    for (const lx of LOG.seats) {
      const sx = l.x + lx * Math.cos(l.facing);
      const sz = l.z - lx * Math.sin(l.facing);
      if ((x - sx) ** 2 + (z - sz) ** 2 < ON_SEAT * ON_SEAT) return i;
    }
  }
  return -1;
}

/** A seat's prompt: "Sit down", and at one of the fire's logs what sitting there plays: "Sit down · play the banjo". */
export function seatPrompt(map: MapDef, x: number, z: number): string {
  const log = bandLog(map, x, z);
  return log < 0 ? 'Sit down' : `Sit down · play the ${INSTRUMENTS[log].name}`;
}

/** How fast a hit's strength dies away for each instrument's hands (ms to fall to about a third). Play-test. */
const PULSE_MS: Record<InstrumentId, number> = { banjo: 110, drum: 140, squeezebox: 600, whistle: 300, washboard: 80, jug: 260 };
/** Per-part beat envelope for animating a player's hands: 0..1 "hit" strength for instrument `id` at clock `nowMs` (peaks on the part's notes in the current bar, decays between), a pure function. */
export function bandPulse(id: InstrumentId, nowMs: number): number {
  const { bar } = barAt(nowMs);
  let pulse = 0;
  // The last bar too: its final note is still dying away as this one starts.
  for (const b of [bar - 1, bar]) {
    for (const n of bandNotes(id, b)) {
      const since = nowMs - (b * BAR_MS + n.at * EIGHTH_MS);
      if (since < 0) continue;
      pulse = Math.max(pulse, (0.5 + 0.5 * n.vel) * Math.exp(-since / PULSE_MS[id]));
    }
  }
  return Math.min(1, pulse);
}

/**
 * How the band carries, by the listener's distance from the fire (m). Measured on the map (`band.test.ts` checks
 * these): the fire's logs are 2.9 m out, the terrace's seat wall 5.75 m and the gate arch 6.25 m; the signpost
 * where the lanes meet 7.5 m; the beach's logs 8 to 10 m; the quay's east end 13.7 m and the rocket jetty's end
 * 14.5 m; the pier 20.6 m at its root and 26.4 m at its end; the quay's middle 23.7 m and its west end 36 m;
 * Marlow's stall 30 m; the village square 35.7 m; Reed's wharf 37.8 m; the town gate 57 m. Play-test: all of it.
 */
export const BAND_MIX = {
  /** Full band out to here: the whole terrace and its cove seat wall. */
  full: 6.5,
  /** The band has faded to `nearLevel` by here: through the arch, down the beach, at the jetty's end and the quay's east end. */
  near: 15,
  nearLevel: 0.25,
  /** ...and to its faint floor by here, which then holds across the cove and the village: the pier, the quay, Reed's wharf. */
  far: 22,
  floor: 0.1,
  /** The floor holds to here, then fades to nothing by `silent`, the town gate at the village's far side. */
  reach: 42,
  silent: 57,
  /** The town's own pick and whistle while a part plays: this low on the terrace, back to full by `near`. */
  townNear: 0.12,
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));
/** Band and town-layer gains for a listener `d` metres from the fire while `playing` parts sound. */
export function bandMix(d: number, playing: boolean): { band: number; town: number } {
  const m = BAND_MIX;
  const band =
    d <= m.full ? 1
    : d <= m.near ? lerp(1, m.nearLevel, (d - m.full) / (m.near - m.full))
    : d <= m.far ? lerp(m.nearLevel, m.floor, (d - m.near) / (m.far - m.near))
    : d <= m.reach ? m.floor
    : lerp(m.floor, 0, (d - m.reach) / (m.silent - m.reach));
  const town = playing ? lerp(m.townNear, 1, (d - m.full) / (m.near - m.full)) : 1;
  return { band, town };
}
