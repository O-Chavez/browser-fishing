import type { Giant, GiantCall, GiantFightState } from './audio';

/**
 * The sound of an Abyss giant's fight, all synthesised like the rest of the game's (no audio files): the giant's voice
 * on its surges, its moves and its last stand (`GiantFight.call`), and the music that plays while it is on the line
 * (`start`, `update` every frame, `end`). Presentation only: nothing here reads or changes the reel.
 *
 * It takes any `BaseAudioContext` and keeps time by `ctx.currentTime` alone (no timers, no wall clock), so
 * `scripts/giant-fight-audio.ts` and the clip recorder render this same code offline. Every sound is a note with an
 * end: the music is scheduled a moment ahead (`ahead`) by `update`, so if the frames stop it runs out by itself, and
 * what stays between notes is only a few gains, a filter and the room.
 *
 * The voices are three kinds of sound, one a giant, each a handful of gestures shaped anew on every call
 * (`planCall`): the Leviathan a reptile's throat, the Kraken hollow tones from deep water, the Dreamer its music box
 * and things like it. The music is a pipe organ in a great room: one chord of the full organ at the hook, then a
 * piece that gains stops, figures and speed as the fight goes on (`ROUND`, `fightMix`, `step`), in each giant's key
 * and stops (`ORGAN`).
 */

/**
 * The fight sound's knobs. Levels are set from the renders of `scripts/giant-fight-audio.ts`, against the landing
 * sounds (the loudest 0.4 s of each: Leviathan -18.7 dBFS, Kraken -23.1, Dreamer -25.6), the Abyss's storm (-30.5)
 * and its thunder. Play-test: all of them.
 */
export const GIANT_FIGHT_SOUND = {
  /** Each giant's organ against the others': the Kraken's and the Dreamer's are held a little under the Leviathan's, as their landing sounds are quieter. */
  organLevel: { leviathan: 1, kraken: 0.85, dreamer: 0.8 },
  /** How far the lake's tune drops while a giant is on the line (0 gone, 1 untouched), how fast (s), and how long after the end it starts back (s). */
  lakeTune: 0,
  lakeFade: 0.5,
  lakeBack: { landed: 6, lost: 2 },
  /** How fast the music goes at the end (time constants, s): landed, near silence within 0.3 s; lost, sagging away over 1.5 s. */
  landedFade: 0.06,
  lostFade: 0.42,
  /** How far ahead of the frame notes are scheduled (s): more rides out a slow frame, less follows the fight closer. */
  ahead: 0.2,
  /**
   * How far along the fight is, 0 to 1, for the music: this share of it from how near the giant is, the rest from
   * the act. Tempo, level, stops and density all rise with it.
   */
  pushNear: 0.55,
  /** How fast the music follows the fight (s): how near it is, the act, the surge up and down, the warning up and down, the load, going spent. */
  follow: { near: 0.5, act: 1.5, surgeUp: 0.08, surgeDown: 0.25, warnUp: 0.15, warnDown: 0.4, tension: 0.3, spent: 0.45 },

  /** The organ. */
  organ: {
    /** Its level into the master gain (the lake's tune plays at 0.17): it sits forward of the storm from the first chord. */
    level: 0.18,
    /** Its level far out against at the hull (the stops it gains do most of the growing), and how much a surge and the warning lift it. */
    farLevel: 0.85,
    surgeLift: 0.15,
    warnLift: 0.08,
    /** Beats a minute (four to the bar), far out in act 1 to at the hull in act 3, and how much a surge at its height and the SURGE! warning quicken them (shares of the tempo). */
    bpm: [54, 80] as [number, number],
    surgeQuicken: 0.1,
    warnQuicken: 0.06,
    /**
     * Density (0 to 1: how far along the fight is, plus a little in a surge). Under `thin` the chords are short and
     * far apart; from `full` the chord is struck twice a bar, the pedal walks and the figure runs in sixteenths.
     */
    thin: 0.3,
    full: 0.7,
    /**
     * Each stop's level, a note: the manual's foundations (16' and 8'), its chorus (4', 2 2/3', 2' and the mixture),
     * its reeds, the second manual's moving figure and runs, the pedal and the pedal's reed, the dissonant stop, the
     * Dreamer's high flute, and the one thin stop left holding once the giant is spent.
     */
    stop: { found: 0.1, chorus: 0.075, reed: 0.07, solo: 0.11, pedal: 0.13, pedalReed: 0.1, rub: 0.05, box: 0.07, last: 0.12 },
    /** The pickups' and the runs' level in the mix (they are not shut behind any stop). */
    runs: 0.9,
    /** When stops are drawn, by how far along the fight is (0 to 1, as `pushNear`): each comes in from the first number to the second. */
    figureFrom: [0.2, 0.33] as [number, number],
    chorusFrom: [0.25, 0.5] as [number, number],
    reedFrom: [0.6, 0.8] as [number, number],
    /** What a surge at its height draws on top of that: chorus, and (from mid-fight) reeds. */
    surgeChorus: 0.7,
    surgeReed: 0.5,
    /** The dissonant stop (a semitone over the chord's root) follows the line's load: its level on a slack line, and the curve up to breaking. */
    rubSlack: 0.12,
    rubCurve: 1.5,
    /** The trill follows the surge's build-up along this curve (1 straight, more holds back until the height). */
    trillCurve: 1.2,
    /** How long the warning's pickup takes to run up the scale (s; the reel's warning is 1 s). */
    pickup: 1,
    /** How a pipe speaks: seconds to full level (the manuals', the pedal's), how fast it stops when the key is let go (a time constant, s), how sharp it starts (cents, falling to pitch in 45 ms), and the breath of noise at a chord's start (a share of the chord's level). */
    attack: 0.022,
    pedalAttack: 0.05,
    release: 0.03,
    speak: 14,
    chiff: 0.4,
    /** How far the stops sit from one another in pitch (cents, about). */
    apart: 3,
    /** The tremulant (the Dreamer's stops, and the last thin one): times a second, and how deep (a share of the level). */
    tremulant: [5.6, 0.12] as [number, number],
    /** The hook's chord: its level against the piece's, and how long it is held (s) before the piece starts under its echo. */
    hook: { level: 1.1, secs: 2.4 },
    /** The last stand's chord (a diminished seventh over the keynote): its level and how long it is held (s). */
    stand: { level: 1, secs: 2.8 },
    /** The room: how long its echo is (s), its level against the organ itself, and how long its low and its high end ring (s to die away by 60 dB). */
    room: { secs: 2.8, wet: 0.5, low: 3.2, high: 1.2 },
    /** Where the organ's top is cut (Hz), and the longest a key stays down if nothing lets it go (s). */
    top: 9000,
    longest: 9,
  },

  /** The fight voices' level as a whole (they go to the master gain like other effects), and each kind's against it. */
  voice: 1.25,
  kindLevel: { surge: 1, move: 0.78, last: 0.8 },
  /** The music steps back under a call, to this share of its level, and comes back as the call ends. */
  voiceDuck: { surge: 0.7, move: 0.7, last: 0.4 },
  /** How much louder or softer than its gesture's own level a call may be (dB either way). */
  levelSpread: 2,
  /** How much a call's mouth (its formants) may be wider or narrower (semitones either way). */
  mouthSpread: 2.5,
  /** The keys a giant's calls move between (semitones from its gestures' own pitch; the Dreamer's from its landing's, so its box plays higher in the fight); never the same key twice running. */
  keys: { leviathan: [-4, -2, 0, 2, 4, 6], kraken: [-4, -2, 0, 2, 4, 6], dreamer: [2, 4, 5, 7, 9, 11] } as Record<Giant, number[]>,
  /** Far out (near 0): a call's level against close in, how much of it is smeared into echoes, and where its top is cut (Hz); close in the cut is at `nearHz`. */
  far: { gain: 0.6, smear: 0.6, hz: { leviathan: 900, kraken: 300, dreamer: 2600 } as Record<Giant, number> },
  nearHz: 9000,
  /** Below this much fight left the voice starts to strain: wavering, breathier, cracking, more the closer to spent. */
  strainAt: 0.65,
};
const K = GIANT_FIGHT_SOUND;

const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 0 below `a`, 1 above `b`, eased between. */
const smooth = (a: number, b: number, v: number): number => {
  const k = clamp01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// ---------- the throat ----------

/** A point on a sound's course: seconds from its start, and the value there. */
export type Pt = [at: number, v: number];

/** A creature's voice (`playVoice`): a buzzing throat ringing through a mouth that opens and shuts. */
export interface Voice {
  /** How long it sounds (s), and how long from now it starts. */
  dur: number;
  at?: number;
  /** Its level at its loudest, and its swell and fall (0..1) over its course. */
  gain: number;
  level: Pt[];
  /** The throat's pitch (Hz) over its course, and the voices stacked on it (each a ratio of that pitch). */
  pitch: Pt[];
  stack?: number[];
  /** How far each voice's pitch wanders at random (cents), and how many times a second it turns. */
  waver: number;
  waverHz?: number;
  /** The mouth: the bands the buzz rings through, each moving (Hz) as the mouth opens and shuts. */
  mouth: { f: Pt[]; q: number; gain: number }[];
  /** The growl: the level shaken this many times a second, this deep (0..1); `loose` is how much of the shake is random. */
  rough: Pt[];
  depth: number;
  loose?: number;
  /** Breath: how much noise is mixed into the buzz. */
  breath: number;
  /** Grit: how hard the voice is pushed into clipping (1 barely, 6 torn). */
  grit: number;
  /** Where its top is cut (Hz; 6000 unless given). */
  top?: number;
  /** A hiss over it: noise above `hz`, at this share of the voice's level, rising and falling with it. */
  hiss?: { gain: number; hz: number };
  /** Where it goes (the master gain unless given). */
  out?: AudioNode;
}

/**
 * A voice from something huge: a buzzing throat (stacked saws and a little breath) whose pitch follows `pitch`,
 * shaken into a growl, ringing through the bands of a mouth that opens and shuts, then pushed into clipping for grit.
 * It plays into `v.out`, or `out` when the voice names none. `noise` is a few seconds of white noise.
 */
export function playVoice(ctx: BaseAudioContext, noise: AudioBuffer, out: AudioNode, v: Voice): void {
  const t = ctx.currentTime + (v.at ?? 0);
  const end = t + v.dur + 0.05;
  const course = (p: AudioParam, pts: Pt[], k = 1) => {
    p.setValueAtTime(pts[0][1] * k, t);
    for (const [at, val] of pts.slice(1)) p.linearRampToValueAtTime(val * k, t + at);
  };
  // A slow random drift, turning about `hz` times a second: the noise with all but its slowest part filtered away,
  // brought back up to swing about `depth` either way.
  const drift = (rate: number, depth: number, to: AudioParam) => {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth * 0.5 * Math.sqrt((1.35 * ctx.sampleRate) / rate);
    n.connect(f).connect(g).connect(to);
    n.start(t, Math.random() * 2.9);
    n.stop(end);
  };
  const throat = ctx.createGain();
  for (const k of v.stack ?? [1, 1.012]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    course(o.frequency, v.pitch, k);
    if (v.waver > 0) drift(v.waverHz ?? 23, v.waver, o.detune);
    o.connect(throat);
    o.start(t);
    o.stop(end);
  }
  if (v.breath > 0) {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const g = ctx.createGain();
    g.gain.value = v.breath;
    n.connect(g).connect(throat);
    n.start(t, Math.random() * 2.9);
    n.stop(end);
  }
  // The growl: the level shaken, part of it evenly and part of it at random.
  const loose = v.loose ?? 0;
  const shake = ctx.createGain();
  shake.gain.value = 1 - v.depth / 2;
  const lfo = ctx.createOscillator();
  course(lfo.frequency, v.rough);
  const even = ctx.createGain();
  even.gain.value = (v.depth / 2) * (1 - loose);
  lfo.connect(even).connect(shake.gain);
  lfo.start(t);
  lfo.stop(end);
  if (loose > 0) drift(v.rough[0][1] * 2, (v.depth / 2) * loose, shake.gain);
  throat.connect(shake);
  const mouth = ctx.createGain();
  for (const m of v.mouth) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = m.q;
    course(f.frequency, m.f);
    const g = ctx.createGain();
    g.gain.value = m.gain;
    shake.connect(f).connect(g).connect(mouth);
  }
  const tear = ctx.createWaveShaper();
  const curve = new Float32Array(513);
  for (let i = 0; i < 513; i++) curve[i] = Math.tanh((i / 256 - 1) * v.grit) / Math.tanh(v.grit);
  tear.curve = curve;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = v.top ?? 6000;
  const level = ctx.createGain();
  // Silent until its course starts: a source can start a sample ahead of a gain's first point.
  level.gain.value = 0;
  course(level.gain, v.level, v.gain);
  mouth.connect(tear).connect(soft).connect(level).connect(v.out ?? out);
  if (v.hiss) {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = v.hiss.hz;
    const g = ctx.createGain();
    g.gain.value = 0;
    course(g.gain, v.level, v.gain * v.hiss.gain);
    n.connect(high).connect(g).connect(v.out ?? out);
    n.start(t, Math.random() * 2.9);
    n.stop(end);
  }
}

/** A course's value at `at` seconds. */
export function valueAt(pts: Pt[], at: number): number {
  if (at <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (at <= t1) {
      const [t0, v0] = pts[i - 1];
      return t1 > t0 ? v0 + ((v1 - v0) * (at - t0)) / (t1 - t0) : v1;
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * A break in a course: from `at` it jumps to `ratio` times its value for `len` seconds, then falls back onto the
 * course. On a pitch it is a voice cracking; on a level, a catch in the breath. Left alone when the course is too
 * short to hold it.
 */
export function crack(pts: Pt[], at: number, len: number, ratio: number): Pt[] {
  const end = pts[pts.length - 1][0];
  if (end < len + 0.06) return pts;
  const a = Math.min(Math.max(at, 0.02), end - len - 0.02);
  const b = a + len;
  const edge = Math.min(0.012, len / 4);
  const v = valueAt(pts, a);
  return [...pts.filter(([t]) => t < a - 0.001), [a, v], [a + edge, v * ratio], [b - edge, v * ratio], [b, valueAt(pts, b)], ...pts.filter(([t]) => t > b + 0.001)];
}

// ---------- the plan of a call ----------

/** One of a giant's gestures, as the plan needs it: how likely on a surge and with a move, and how much likelier as it tires. */
interface Lean {
  name: string;
  surge: number;
  move: number;
  tired: number;
}

/**
 * The three giants make sound three different ways, so that one call names its giant: the Leviathan a throat (a
 * reptile's rasp, high and sharp), the Kraken no throat at all (long hollow tones from deep water, far below the
 * Leviathan, with the wet noises of its body), the Dreamer no voice at all (its music box, glass and its spring).
 */

/** A throat gesture (the Leviathan's): a voice with its times as shares of its length. */
interface Gesture extends Lean {
  /** How long it is, shortest to longest (s). */
  dur: [number, number];
  gain: number;
  level: Pt[];
  pitch: Pt[];
  stack?: number[];
  waver: number;
  mouth: { f: Pt[]; q: number; gain: number }[];
  rough: Pt[];
  depth: number;
  loose?: number;
  breath: number;
  grit: number;
  /** How much hiss rides over it (a share of its level). */
  hiss: number;
  /** The double bark: the gesture sounds twice, the second time higher and harder. */
  twice?: boolean;
}

/**
 * The Leviathan's fight voice: the reptile. The throat of its landing roar, but more than an octave up and wide
 * open, raspier and brighter, with a hiss over it and an attack like a snapped jaw: a screech, a bark, a snarl that
 * climbs and is cut off, a shriek that falls, two barks together, and a rattling hiss it leans on as it tires.
 */
const LEVIATHAN: Gesture[] = [
  {
    name: 'screech', surge: 3, move: 2, tired: 0, dur: [0.5, 0.85], gain: 0.09, hiss: 0.4,
    level: [[0, 0], [0.04, 1], [0.6, 0.9], [1, 0]],
    pitch: [[0, 250], [0.18, 400], [0.6, 430], [1, 300]], stack: [1, 1.013, 0.5], waver: 60,
    mouth: [
      { f: [[0, 700], [0.2, 1050], [1, 800]], q: 4, gain: 1 },
      { f: [[0, 1700], [0.2, 2300], [1, 1800]], q: 5, gain: 0.9 },
      { f: [[0, 3000], [0.2, 3900], [1, 3200]], q: 6, gain: 0.6 },
    ],
    rough: [[0, 60], [0.3, 85], [1, 55]], depth: 0.85, loose: 0.4, breath: 0.5, grit: 6,
  },
  {
    name: 'bark', surge: 3, move: 2.5, tired: 0, dur: [0.2, 0.34], gain: 0.095, hiss: 0.5,
    level: [[0, 0], [0.07, 1], [0.5, 0.8], [1, 0]],
    pitch: [[0, 200], [0.25, 330], [1, 170]], stack: [1, 1.013, 0.5], waver: 50,
    mouth: [
      { f: [[0, 600], [0.25, 950], [1, 600]], q: 4, gain: 1 },
      { f: [[0, 1500], [0.25, 2100], [1, 1500]], q: 5, gain: 0.9 },
      { f: [[0, 2600], [0.25, 3500], [1, 2600]], q: 6, gain: 0.6 },
    ],
    rough: [[0, 55], [0.3, 75], [1, 45]], depth: 0.8, loose: 0.35, breath: 0.4, grit: 6,
  },
  {
    name: 'snarl', surge: 2.5, move: 2, tired: 0, dur: [0.55, 0.95], gain: 0.09, hiss: 0.45,
    level: [[0, 0], [0.05, 0.55], [0.8, 1], [0.94, 0.9], [1, 0]],
    pitch: [[0, 140], [0.6, 260], [0.92, 340], [1, 310]], stack: [1, 1.013, 0.5], waver: 60,
    mouth: [
      { f: [[0, 600], [0.85, 1000], [1, 900]], q: 4, gain: 1 },
      { f: [[0, 1500], [0.85, 2400], [1, 2200]], q: 5, gain: 0.9 },
      { f: [[0, 2600], [0.85, 3900], [1, 3600]], q: 6, gain: 0.6 },
    ],
    rough: [[0, 45], [0.85, 80], [1, 70]], depth: 0.85, loose: 0.4, breath: 0.5, grit: 6,
  },
  {
    name: 'shriek', surge: 3, move: 1, tired: 0.5, dur: [0.7, 1.05], gain: 0.095, hiss: 0.4,
    level: [[0, 0], [0.03, 1], [0.45, 0.85], [1, 0]],
    pitch: [[0, 380], [0.12, 450], [0.5, 330], [1, 150]], stack: [1, 1.013, 0.5], waver: 60,
    mouth: [
      { f: [[0, 1050], [0.45, 900], [1, 650]], q: 4, gain: 1 },
      { f: [[0, 2300], [0.45, 2000], [1, 1500]], q: 5, gain: 0.9 },
      { f: [[0, 3900], [0.45, 3500], [1, 2700]], q: 6, gain: 0.6 },
    ],
    rough: [[0, 85], [0.5, 65], [1, 45]], depth: 0.85, loose: 0.4, breath: 0.5, grit: 6,
  },
  {
    name: 'two barks', surge: 2, move: 2, tired: 0, dur: [0.18, 0.26], gain: 0.09, hiss: 0.5, twice: true,
    level: [[0, 0], [0.08, 1], [0.55, 0.8], [1, 0]],
    pitch: [[0, 210], [0.25, 320], [1, 190]], stack: [1, 1.013, 0.5], waver: 50,
    mouth: [
      { f: [[0, 640], [0.3, 950], [1, 640]], q: 4, gain: 1 },
      { f: [[0, 1500], [0.3, 2100], [1, 1550]], q: 5, gain: 0.9 },
      { f: [[0, 2700], [0.3, 3500], [1, 2700]], q: 6, gain: 0.6 },
    ],
    rough: [[0, 55], [0.3, 75], [1, 50]], depth: 0.8, loose: 0.35, breath: 0.4, grit: 6,
  },
  {
    name: 'hiss', surge: 0.4, move: 1.5, tired: 4, dur: [0.6, 1.0], gain: 0.075, hiss: 0.7,
    level: [[0, 0], [0.08, 1], [0.7, 0.7], [1, 0]],
    pitch: [[0, 170], [1, 120]], waver: 70,
    mouth: [
      { f: [[0, 900], [1, 700]], q: 2.5, gain: 1 },
      { f: [[0, 2400], [1, 1800]], q: 3, gain: 0.9 },
      { f: [[0, 4200], [1, 3400]], q: 3, gain: 0.7 },
    ],
    // A rattle: the breath shaken evenly, as a snake's tail.
    rough: [[0, 31], [1, 24]], depth: 0.95, loose: 0.15, breath: 1.6, grit: 3,
  },
];

/** A deep gesture (the Kraken's): a hollow tone with its times as shares of its length, and the wet noises with it. */
interface Deep extends Lean {
  dur: [number, number];
  gain: number;
  level: Pt[];
  pitch: Pt[];
  /** Its two voices sit this far apart (Hz), so it throbs that many times a second. */
  beat: number;
  /** How far it opens over its course (a low-pass, Hz). */
  open: Pt[];
  /** A slow pulse of pressure in it: times a second, and how deep (0..1). */
  throb?: [rate: number, depth: number];
  /** Runs of bubbles ([share of the length, how many]), a run of wet clicks, a suck and a pop at its end, and the hull's timbers answering (at this share of its length). */
  glugs?: [at: number, n: number][];
  clicks?: [at: number, n: number];
  suck?: boolean;
  creak?: number;
}

/**
 * The Kraken's fight voice: no throat. Long, slow, hollow tones from deep water, an octave and more under the
 * Leviathan: a whale's moan that bends up, a foghorn in a cave (and the hull's timbers answering it), a groan that
 * sinks away into bubbles, a low hum under a run of wet clicks, a throb of pressure (the tired one), and a call that
 * climbs into a suck and a pop. Each swells in slowly and rings on in its cave. They ring through the same three
 * bands as its landing groan, with the same bubbles, suck and creaking hull, so they belong with it.
 */
const KRAKEN: Deep[] = [
  {
    name: 'moan', surge: 2.5, move: 2.5, tired: 1, dur: [1.8, 2.6], gain: 0.14, beat: 0.9,
    level: [[0, 0], [0.28, 0.9], [0.6, 1], [1, 0]],
    pitch: [[0, 62], [0.35, 58], [0.8, 82], [1, 78]],
    open: [[0, 200], [0.6, 520], [1, 240]], glugs: [[0.55, 2]],
  },
  {
    name: 'foghorn', surge: 3, move: 1.5, tired: 0, dur: [1.5, 2.2], gain: 0.14, beat: 1.6,
    level: [[0, 0], [0.22, 1], [0.75, 0.9], [1, 0]],
    pitch: [[0, 55], [0.8, 55], [1, 50]],
    open: [[0, 260], [0.3, 600], [1, 300]], creak: 0.55,
  },
  {
    name: 'sink', surge: 2, move: 2, tired: 2, dur: [1.6, 2.4], gain: 0.14, beat: 0.6,
    level: [[0, 0], [0.24, 1], [0.6, 0.8], [1, 0]],
    pitch: [[0, 92], [0.3, 84], [1, 47]],
    open: [[0, 480], [1, 180]], glugs: [[0.5, 3], [0.8, 4]],
  },
  {
    name: 'clicks', surge: 1, move: 3, tired: 0.5, dur: [1.5, 2.0], gain: 0.13, beat: 2.2,
    level: [[0, 0], [0.32, 0.9], [0.7, 0.8], [1, 0]],
    pitch: [[0, 50], [1, 54]],
    open: [[0, 220], [1, 280]], clicks: [0.35, 6], suck: true,
  },
  {
    name: 'pressure', surge: 1, move: 2, tired: 3.5, dur: [1.5, 2.1], gain: 0.15, beat: 3, throb: [3.2, 0.5],
    level: [[0, 0], [0.3, 1], [1, 0]],
    pitch: [[0, 46], [1, 42]],
    open: [[0, 190], [1, 150]], glugs: [[0.3, 2], [0.7, 3]], creak: 0.4,
  },
  {
    name: 'rise', surge: 3, move: 2, tired: 0, dur: [1.6, 2.3], gain: 0.14, beat: 1.2,
    level: [[0, 0], [0.3, 0.8], [0.85, 1], [1, 0]],
    pitch: [[0, 48], [0.5, 54], [1, 96]],
    open: [[0, 200], [1, 640]], suck: true,
  },
];

/** The Drowned Dreamer's lullaby as its landing plays it (MIDI notes): B5 G5 rocking, the top slipping a semitone a time, D#5 short of home. */
export const LULLABY = [83, 79, 83, 79, 82, 79, 81, 77, 80, 77, 75];

/** A phrase of the Dreamer's music box: notes of its lullaby (two at once where a step is a pair), and how it is played. */
interface Phrase extends Lean {
  notes: (number | [number, number])[];
  /** Seconds between notes, quickest to slowest. */
  beat: [number, number];
  /** The box is wound first: this many ratchet clicks before the notes. */
  wind?: number;
  /** A bell swelling in backwards into the first note. */
  bell?: boolean;
  /** Two notes of rubbed glass held under it. */
  glass?: [number, number];
  /** Its spring twangs before the notes. */
  twang?: boolean;
}

/**
 * The Dreamer's fight voice: no voice at all. Its music box, higher than in its landing, a few notes of its lullaby
 * at a time in a different key each call, and things like it: a bell swelling in backwards, rubbed glass, the key
 * being wound, its spring twanging, and a whisper of breath over them. The rocking opening (out of a backwards
 * bell), the slip, the fall short of home, the rocking turned upside down, a wind of the key and two notes, a bare
 * tritone answered by one note, two notes of glass with one of the box, and the spring with two.
 */
const DREAMER: Phrase[] = [
  { name: 'rock', surge: 3, move: 2, tired: 0, notes: [83, 79, 83, 79], beat: [0.17, 0.26], bell: true },
  { name: 'slip', surge: 3, move: 2, tired: 1, notes: [82, 79, 81, 77], beat: [0.17, 0.26] },
  { name: 'fall', surge: 1.5, move: 2, tired: 3, notes: [80, 77, 75], beat: [0.24, 0.36], bell: true },
  { name: 'turn', surge: 2, move: 2.5, tired: 0, notes: [79, 83, 79, 82], beat: [0.15, 0.22] },
  { name: 'wind', surge: 2, move: 2, tired: 0, notes: [83, 82], beat: [0.2, 0.3], wind: 6 },
  { name: 'chime', surge: 1.5, move: 2.5, tired: 1.5, notes: [[76, 82], 75], beat: [0.4, 0.55] },
  { name: 'glass', surge: 1.5, move: 2.5, tired: 2, notes: [80], beat: [0.3, 0.4], glass: [83, 77] },
  { name: 'spring', surge: 2, move: 2, tired: 0.5, notes: [79, 82], beat: [0.2, 0.3], wind: 4, twang: true },
];

/** Each giant's gestures, for the plan. */
const GESTURES: Record<Giant, Lean[]> = { leviathan: LEVIATHAN, kraken: KRAKEN, dreamer: DREAMER };
/** The names of a giant's gestures, in the order `CallPlan.gesture` counts them. */
export const gestureNames = (id: Giant): string[] => GESTURES[id].map((g) => g.name);

/** How one call is to sound: which gesture, and how it is shaped this time. */
export interface CallPlan {
  /** Which of the giant's gestures (`gestureNames`), or -1 for its last stand. */
  gesture: number;
  /** Its key: semitones from the landing sound's pitch (one of `keys`, a little off). */
  semis: number;
  /** Its length within the gesture's range, 0 shortest to 1 longest. */
  len: number;
  /** Its mouth: the formants scaled by this (the Dreamer's box: how hard the tines are plucked). */
  mouth: number;
  /** Its level, before distance. */
  level: number;
  /** How strained it is, 0 (fresh) to 1 (spent). */
  strain: number;
  /** How near it is, 0 to 1: its distance (`distanceOf`). */
  near: number;
}

/**
 * Plans a call: a gesture other than the last one's (likelier ones for a surge or a move, and for a tired giant), in
 * a key other than the last one's, with its own length, mouth and level. The last stand is one fixed gesture, so only
 * its shaping varies. `rng` gives 0..1.
 */
export function planCall(id: Giant, c: GiantCall, rng: () => number, last?: CallPlan): CallPlan {
  const strain = clamp01(1 - clamp01(c.fight) / K.strainAt);
  const near = clamp01(c.near);
  const keys = K.keys[id];
  const spread = 10 ** (((rng() * 2 - 1) * K.levelSpread) / 20);
  const mouth = 2 ** (((rng() * 2 - 1) * K.mouthSpread) / 12);
  if (c.kind === 'last') return { gesture: -1, semis: rng() * 2 - 1, len: rng(), mouth: lerp(1, mouth, 0.4), level: K.kindLevel.last, strain: Math.max(strain, 0.5), near };
  const leans = GESTURES[id];
  const weights = leans.map((g, i) => (i === last?.gesture ? 0 : (c.kind === 'surge' ? g.surge : g.move) * (1 + g.tired * strain)));
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  let gesture = weights.findIndex((w) => (pick -= w) < 0);
  if (gesture < 0) gesture = weights.findIndex((w) => w > 0);
  const lastKey = last ? keys.reduce((best, k) => (Math.abs(k - last.semis) < Math.abs(best - last.semis) ? k : best)) : NaN;
  const free = keys.filter((k) => k !== lastKey);
  const key = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  return { gesture, semis: key + (rng() - 0.5) * 0.6, len: rng(), mouth, level: K.kindLevel[c.kind] * spread, strain, near };
}

/** A call's distance: its level, where its top is cut (Hz), and how much of it is smeared into echoes. */
export function distanceOf(id: Giant, near: number): { gain: number; hz: number; smear: number } {
  const n = clamp01(near);
  const far = K.far.hz[id];
  return { gain: lerp(K.far.gain, 1, n), hz: far * (K.nearHz / far) ** n, smear: K.far.smear * (1 - n) };
}

// ---------- the music's mix ----------

/** The fight as the organ follows it: `GiantFightState` with its switches eased into levels. */
export interface Settled {
  act: number;
  near: number;
  fight: number;
  surge: number;
  warn: number;
  tension: number;
  spent: number;
}

/** A frame's state as levels: where the music is heading. */
export const settled = (s: GiantFightState): Settled => ({
  act: Math.min(3, Math.max(1, s.act)),
  near: clamp01(s.near),
  fight: clamp01(s.fight),
  surge: clamp01(s.surge),
  warn: s.warning ? 1 : 0,
  tension: clamp01(s.tension),
  spent: s.spent ? 1 : 0,
});

/** Eases `from` toward `to` over `dt` seconds, each value at its own pace (`follow`). */
export function follow(from: Settled, to: Settled, dt: number): Settled {
  const f = K.follow;
  const ease = (a: number, b: number, tau: number) => a + (b - a) * (1 - Math.exp(-Math.max(0, dt) / tau));
  return {
    act: ease(from.act, to.act, f.act),
    near: ease(from.near, to.near, f.near),
    fight: ease(from.fight, to.fight, f.near),
    surge: ease(from.surge, to.surge, to.surge > from.surge ? f.surgeUp : f.surgeDown),
    warn: ease(from.warn, to.warn, to.warn > from.warn ? f.warnUp : f.warnDown),
    tension: ease(from.tension, to.tension, f.tension),
    spent: ease(from.spent, to.spent, f.spent),
  };
}

/** What the organ does for a state: its tempo and level, each stop's level, and how dense the piece is. */
export interface FightMix {
  /** Beats a minute. */
  bpm: number;
  /** The whole organ's level, before its own volume. */
  level: number;
  /** The stops: the pedal, the manual's foundations, its chorus and its reeds, the second manual's figure, the dissonant stop, the Dreamer's high flute, the surge's trill, and the last thin stop. */
  pedal: number;
  found: number;
  chorus: number;
  reed: number;
  figure: number;
  rub: number;
  box: number;
  trill: number;
  last: number;
  /** How much plays, 0 (the pedal and slow, short chords) to 1 (everything). */
  density: number;
}

/**
 * The state-to-mix mapping. The organ grows as the giant comes in and the acts go by: quicker, louder and denser,
 * and by its stops (foundations and pedal from the start, the moving figure and the chorus through act 2, the reeds
 * in act 3). A surge draws more chorus and reeds and swells its trill with its build-up; the warning lifts it; the
 * dissonant stop is louder as the line loads; and once the giant is spent, everything shuts but one thin stop.
 */
export function fightMix(s: Settled): FightMix {
  const O = K.organ;
  const push = clamp01(K.pushNear * s.near + ((1 - K.pushNear) * (s.act - 1)) / 2);
  const awake = 1 - clamp01(s.spent);
  return {
    bpm: lerp(O.bpm[0], O.bpm[1], push) * (1 + (O.surgeQuicken * s.surge + O.warnQuicken * s.warn) * awake),
    level: lerp(O.farLevel, 1, push) * (1 + (O.surgeLift * s.surge + O.warnLift * s.warn) * awake),
    pedal: awake * lerp(0.85, 1, push),
    found: awake,
    chorus: awake * Math.min(1.15, smooth(O.chorusFrom[0], O.chorusFrom[1], push) + O.surgeChorus * s.surge),
    reed: awake * Math.min(1.15, smooth(O.reedFrom[0], O.reedFrom[1], push) + O.surgeReed * s.surge * smooth(0.1, 0.4, push)),
    figure: awake * smooth(O.figureFrom[0], O.figureFrom[1], push),
    rub: awake * lerp(O.rubSlack, 1, s.tension ** O.rubCurve) * lerp(0.5, 1, push),
    box: awake * lerp(0.7, 1, push),
    trill: awake * s.surge ** O.trillCurve,
    last: clamp01(s.spent),
    density: clamp01(push + 0.15 * s.surge) * awake,
  };
}

// ---------- the instruments ----------

/** What every sound here is built with. */
interface Kit {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  rng: () => number;
}

/** A tone starting at `f0` and sliding to `f1` over `slide` seconds, up in `attack` and dying away over `dur`. */
function tone(k: Kit, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, slide: number, dur: number, gain: number, attack = 0.005): void {
  const o = k.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + slide);
  const g = k.ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A burst of noise through one filter sliding from `f0` to `f1`, up in `attack` and dying away over `dur`. */
function hiss(k: Kit, out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, q = 1, attack = Math.min(0.03, dur / 3)): void {
  const src = k.ctx.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  const f = k.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = k.ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, k.rng() * 2.5);
  src.stop(t + dur + 0.05);
}

/** A music box's warped cylinder, for `dur` seconds: the waver its tines share (cents), a slow lurch and a quick flutter. */
function wow(k: Kit, t: number, dur: number, deep = 1): GainNode {
  const sum = k.ctx.createGain();
  for (const [rate, cents] of [[0.6, 9], [5.5, 3.5]]) {
    const lfo = k.ctx.createOscillator();
    lfo.frequency.value = rate * (0.85 + 0.3 * k.rng());
    const g = k.ctx.createGain();
    g.gain.value = cents * deep;
    lfo.connect(g).connect(sum);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  return sum;
}

/**
 * One note of the Dreamer's comb, as its landing plays it: the tine, its neighbour `off` cents out, the octave and
 * the comb's ring, and the tick of the pin letting go. `sag`: how far it sinks as it rings (cents); `pluck`: how hard.
 */
function tine(k: Kit, out: AudioNode, t: number, note: number, ring: number, o: { sag?: number; pluck?: number; off?: number; wow?: AudioNode } = {}): void {
  const { ctx } = k;
  const off = (Math.round(note) % 2 ? 1 : -1) * (o.off ?? 6.5);
  const pluck = o.pluck ?? 1;
  for (const [ratio, level, len, cents] of [[1, 0.08, 1, 0], [1, 0.038, 0.8, off], [2, 0.021, 0.45, 4], [5.4, 0.011, 0.12, 0]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = hz(note) * ratio;
    osc.detune.setValueAtTime(cents, t);
    if (o.sag) osc.detune.linearRampToValueAtTime(cents - o.sag, t + ring);
    o.wow?.connect(osc.detune);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level * pluck, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring * len);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + ring * len + 0.05);
  }
  hiss(k, out, t, 0.012, 'highpass', 5000, 7000, 0.018 * pluck, 0.7, 0.004);
}

/** A run of the Kraken's bubbles: `n` short rising blips. */
function glug(k: Kit, out: AudioNode, t: number, n: number, level: number): void {
  let at = t;
  for (let i = 0; i < n; i++) {
    const f = 190 + k.rng() * 420;
    const len = 0.06 + k.rng() * 0.05;
    tone(k, out, at, 'sine', f, f * (1.5 + k.rng() * 0.7), len, len, 0.09 * level, 0.01);
    at += 0.07 + k.rng() * 0.05;
  }
}

/** The Kraken's wet suck: a narrow band of noise sweeping up as it swells, cut off short, and the pop as it lets go. */
function suck(k: Kit, out: AudioNode, t: number, dur: number, gain: number): void {
  const src = k.ctx.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  const f = k.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 5;
  f.frequency.setValueAtTime(260, t);
  f.frequency.exponentialRampToValueAtTime(1500, t + dur);
  const g = k.ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.92);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, k.rng() * 2.5);
  src.stop(t + dur + 0.05);
  tone(k, out, t + dur, 'sine', 280, 110, 0.08, 0.08, gain * 0.5, 0.01);
}

// ---------- the voices ----------

/** A tired voice cracks: the pitch jumps and falls back, and the breath catches after it. Returns the two courses, cracked. */
function strained(pitch: Pt[], level: Pt[], dur: number, strain: number, rng: () => number): [pitch: Pt[], level: Pt[]] {
  const cracks = Math.min(dur < 0.6 ? 1 : 3, Math.floor(strain * 2.2 + rng() * 0.8));
  for (let i = 0; i < cracks; i++) {
    const at = dur * (0.25 + 0.55 * rng());
    const len = 0.04 + 0.04 * rng();
    pitch = crack(pitch, at, len, 1.3 + 0.35 * rng());
    level = crack(level, at + len, 0.05, 0.4);
  }
  return [pitch, level];
}

/** A throat gesture shaped by a plan into a voice: its length, key and mouth set, and strained as the plan says. */
function shape(g: Gesture, p: CallPlan, rng: () => number): Voice {
  const dur = lerp(g.dur[0], g.dur[1], p.len);
  const along = (pts: Pt[], k = 1): Pt[] => pts.map(([u, v]) => [u * dur, v * k]);
  const [pitch, level] = strained(along(g.pitch, 2 ** (p.semis / 12)), along(g.level), dur, p.strain, rng);
  return {
    dur,
    gain: g.gain,
    level,
    pitch,
    stack: g.stack,
    waver: g.waver * (1 + 1.6 * p.strain),
    mouth: g.mouth.map((m) => ({ f: along(m.f, p.mouth), q: m.q, gain: m.gain })),
    rough: along(g.rough, 1 - 0.2 * p.strain),
    depth: g.depth,
    loose: Math.min(1, (g.loose ?? 0) + 0.3 * p.strain),
    breath: g.breath + 0.4 * p.strain,
    grit: g.grit,
    top: 9500,
    hiss: { gain: g.hiss * (1 + 0.8 * p.strain), hz: 3200 },
  };
}

/**
 * The Leviathan's last stand: nothing like the arch of its landing roar, and an octave and more above it. It screams
 * from the first instant, high and wide open, and climbs in steps; then the voice breaks, catches twice trying to
 * hold, and gutters out in coughs.
 */
function leviathanLast(p: CallPlan): Voice {
  const k = 2 ** (p.semis / 12);
  const s = 0.94 + 0.12 * p.len;
  const along = (pts: Pt[], by = 1): Pt[] => pts.map(([t, v]) => [t * s, v * by]);
  return {
    dur: 3.3 * s, gain: 0.15,
    level: along([[0, 0], [0.04, 1], [1.5, 0.92], [1.9, 1], [1.96, 0.3], [2.1, 0.8], [2.3, 0.25], [2.5, 0.55], [2.72, 0.15], [2.92, 0.38], [3.3, 0]]),
    pitch: along([[0, 290], [0.25, 390], [0.9, 405], [1.05, 435], [1.5, 450], [1.62, 478], [1.9, 490], [1.96, 235], [2.08, 390], [2.28, 188], [2.5, 250], [2.72, 150], [2.92, 180], [3.3, 105]], k),
    stack: [1, 1.013, 0.5], waver: 80,
    mouth: [
      { f: along([[0, 900], [0.25, 1150], [1.9, 1200], [2.3, 750], [3.3, 520]], p.mouth), q: 4, gain: 1 },
      { f: along([[0, 1900], [0.25, 2300], [1.9, 2500], [2.3, 1700], [3.3, 1200]], p.mouth), q: 5, gain: 0.9 },
      { f: along([[0, 3300], [0.25, 3900], [1.9, 4200], [2.3, 3000], [3.3, 2300]], p.mouth), q: 6, gain: 0.55 },
    ],
    rough: along([[0, 70], [1.9, 90], [2.3, 50], [3.3, 28]]), depth: 0.85, loose: 0.45, breath: 0.55, grit: 6,
    top: 9500, hiss: { gain: 0.3, hz: 3200 },
  };
}

/** A deep tone as it is played (`deepTone`). */
interface DeepTone {
  dur: number;
  gain: number;
  level: Pt[];
  pitch: Pt[];
  beat: number;
  open: Pt[];
  throb?: [rate: number, depth: number];
  /** How far its pitch wavers (cents), how much air leaks through it, and its bands scaled (the plan's mouth). */
  waver: number;
  air: number;
  mouth: number;
}

/**
 * A hollow tone from something huge and soft: two square waves a little apart (so it throbs), a little of them
 * through a low-pass that opens and shuts and most through the three narrow bands the Kraken's landing groan rings
 * through, so what carries is well above the note itself (a phone can play it). No growl and no grit: it is blown,
 * not voiced.
 */
function deepTone(k: Kit, out: AudioNode, t: number, d: DeepTone): void {
  const { ctx } = k;
  const end = t + d.dur + 0.05;
  const course = (p: AudioParam, pts: Pt[], mul = 1, add = 0) => {
    p.setValueAtTime(pts[0][1] * mul + add, t);
    for (const [at, v] of pts.slice(1)) p.linearRampToValueAtTime(v * mul + add, t + at);
  };
  let wob: GainNode | undefined;
  if (d.waver > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5 * (0.8 + 0.4 * k.rng());
    wob = ctx.createGain();
    wob.gain.value = d.waver;
    lfo.connect(wob);
    lfo.start(t);
    lfo.stop(end);
  }
  const body = ctx.createGain();
  for (const apart of [0, d.beat]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    course(o.frequency, d.pitch, 1, apart);
    wob?.connect(o.detune);
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g).connect(body);
    o.start(t);
    o.stop(end);
  }
  if (d.air > 0) {
    const n = ctx.createBufferSource();
    n.buffer = k.noise;
    n.loop = true;
    const g = ctx.createGain();
    g.gain.value = d.air;
    n.connect(g).connect(body);
    n.start(t, k.rng() * 2.5);
    n.stop(end);
  }
  const sum = ctx.createGain();
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.Q.value = 1.5;
  course(low.frequency, d.open);
  const through = ctx.createGain();
  through.gain.value = 0.22;
  body.connect(low).connect(through).connect(sum);
  for (const [f, q, gain] of [[250, 6, 1.2], [560, 7, 1], [1150, 8, 0.35]]) {
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = f * d.mouth;
    band.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    body.connect(band).connect(g).connect(sum);
  }
  const level = ctx.createGain();
  level.gain.value = 0;
  course(level.gain, d.level, d.gain);
  if (d.throb) {
    const [rate, depth] = d.throb;
    const shake = ctx.createGain();
    shake.gain.value = 1 - depth / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const deep = ctx.createGain();
    deep.gain.value = depth / 2;
    lfo.connect(deep).connect(shake.gain);
    lfo.start(t);
    lfo.stop(end);
    sum.connect(shake).connect(level).connect(out);
  } else sum.connect(level).connect(out);
}

/** A deep gesture shaped by a plan into a tone: its length and key set, and strained as the plan says (wavering, leaking air, cracking). */
function shapeDeep(g: Deep, p: CallPlan, rng: () => number): DeepTone {
  const dur = lerp(g.dur[0], g.dur[1], p.len);
  const along = (pts: Pt[], k = 1): Pt[] => pts.map(([u, v]) => [u * dur, v * k]);
  const [pitch, level] = strained(along(g.pitch, 2 ** (p.semis / 12)), along(g.level), dur, p.strain, rng);
  return { dur, gain: g.gain, level, pitch, beat: g.beat, open: along(g.open, p.mouth), throb: g.throb, waver: 6 + 45 * p.strain, air: 0.04 + 0.3 * p.strain, mouth: p.mouth };
}

/**
 * The Kraken's last stand: where its landing groan sags and bends, this climbs. One long tone hauling itself up
 * through an octave and opening as it goes, until it breaks and collapses.
 */
function krakenLast(p: CallPlan): DeepTone {
  const k = 2 ** (p.semis / 12);
  const s = 0.94 + 0.12 * p.len;
  const along = (pts: Pt[], by = 1): Pt[] => pts.map(([t, v]) => [t * s, v * by]);
  return {
    dur: 3.6 * s, gain: 0.19,
    level: along([[0, 0], [0.6, 0.7], [1.6, 0.9], [2.4, 1], [2.5, 0.4], [2.62, 0.85], [2.78, 0.45], [3.6, 0]]),
    pitch: along([[0, 48], [0.8, 58], [1.6, 74], [2.2, 92], [2.45, 102], [2.5, 66], [2.62, 90], [2.78, 56], [3.6, 36]], k),
    beat: 2.4,
    open: along([[0, 220], [2.4, 900], [2.6, 380], [3.6, 160]], p.mouth),
    waver: 30, air: 0.2, mouth: p.mouth,
  };
}

/** A run of the Kraken's wet clicks: `n` of them, the gap between them growing by `grow` each time. */
function clickRun(k: Kit, out: AudioNode, t: number, n: number, gap: number, grow: number, level: number): void {
  let at = t;
  for (let i = 0; i < n; i++) {
    const f = 1300 + k.rng() * 1100;
    tone(k, out, at, 'sine', f, f * 0.55, 0.012, 0.022, 0.07 * level, 0.001);
    hiss(k, out, at, 0.014, 'bandpass', 1900, 1200, 0.05 * level, 3, 0.002);
    at += gap;
    gap *= grow;
  }
}

/** The hull's timbers answering: a slow wooden groan, as the game's own hull makes in a heavy sea. */
function creak(k: Kit, out: AudioNode, t: number, level: number): void {
  const { ctx } = k;
  const dur = 0.45 + k.rng() * 0.5;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  const f0 = 55 + k.rng() * 40;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * (0.8 + k.rng() * 0.5), t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 500 + k.rng() * 500;
  f.Q.value = 6;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05 * level, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** A bell heard backwards: its partials swelling in over `dur` seconds and cut off as the note it leads to is struck. */
function bellIn(k: Kit, out: AudioNode, t: number, note: number, dur: number, gain: number, shared?: AudioNode): void {
  for (const [ratio, level] of [[1, 1], [2.76, 0.22], [5.4, 0.07]]) {
    const o = k.ctx.createOscillator();
    o.frequency.value = hz(note) * ratio;
    shared?.connect(o.detune);
    const g = k.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * level, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.09);
  }
}

/** Rubbed glass: a thin note swelling in and away, wavering, two a hair apart and a glassy overtone. */
function glass(k: Kit, out: AudioNode, t: number, note: number, dur: number, gain: number): void {
  const lfo = k.ctx.createOscillator();
  lfo.frequency.value = 5 * (0.9 + 0.2 * k.rng());
  const wide = k.ctx.createGain();
  wide.gain.value = 7;
  lfo.connect(wide);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  for (const [ratio, cents, level] of [[1, -4, 1], [1, 5, 0.8], [2.76, 0, 0.12]]) {
    const o = k.ctx.createOscillator();
    o.frequency.value = hz(note) * ratio;
    o.detune.value = cents;
    wide.connect(o.detune);
    const g = k.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * level, t + dur * 0.4);
    g.gain.setValueAtTime(gain * level, t + dur * 0.65);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** The spring's twang: a struck note whose pitch shudders and settles as it dies. */
function twang(k: Kit, out: AudioNode, t: number, note: number, gain: number): void {
  const len = 0.7;
  const lfo = k.ctx.createOscillator();
  lfo.frequency.value = 27;
  const shudder = k.ctx.createGain();
  shudder.gain.setValueAtTime(350, t);
  shudder.gain.exponentialRampToValueAtTime(4, t + len * 0.8);
  lfo.connect(shudder);
  lfo.start(t);
  lfo.stop(t + len + 0.05);
  for (const [ratio, level, ring] of [[1, 1, len], [2.32, 0.28, len * 0.6], [4.1, 0.1, len * 0.3]]) {
    const o = k.ctx.createOscillator();
    o.frequency.value = hz(note) * ratio;
    shudder.connect(o.detune);
    const g = k.ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + ring + 0.05);
  }
  hiss(k, out, t, 0.03, 'bandpass', 3000, 1800, gain * 0.5, 3, 0.002);
}

/** A whisper of breath: a thin band of noise high up, in and out. */
function whisper(k: Kit, out: AudioNode, t: number, dur: number, gain: number): void {
  const src = k.ctx.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  const f = k.ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2.5;
  f.frequency.setValueAtTime(2600, t);
  f.frequency.linearRampToValueAtTime(4200, t + dur * 0.45);
  f.frequency.linearRampToValueAtTime(2200, t + dur);
  const g = k.ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.45);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, k.rng() * 2.5);
  src.stop(t + dur + 0.05);
}

/** The key being wound: `n` quick ratchet clicks, each a little higher, the gap between them growing by `grow`. Returns when the last one is done. */
function ratchet(k: Kit, out: AudioNode, t: number, n: number, gap: number, grow: number, gain: number): number {
  let at = t;
  for (let i = 0; i < n; i++) {
    hiss(k, out, at, 0.02, 'bandpass', 2400 + 180 * i, 1800 + 150 * i, gain, 4, 0.002);
    at += gap;
    gap *= grow;
  }
  return at;
}

// ---------- the organ ----------

/** An organ stop: the ranks of pipes that sound together on one key. */
export type Stop = 'found' | 'chorus' | 'reed' | 'solo' | 'pedal' | 'pedalReed' | 'string' | 'flute';
type Pipe = 'principal' | 'flute' | 'reed' | 'string';
/** How strong a pipe's harmonics are, the first being 1: an open principal, a stopped flute (hollow: the odd ones), a reed (bright and buzzing), a narrow string. */
const PIPE: Record<Pipe, (k: number) => number> = {
  principal: (k) => (k <= 16 ? k ** -1.4 : 0),
  flute: (k) => (k === 1 ? 1 : k > 9 ? 0 : k % 2 ? 0.5 * k ** -2.2 : 0.05 / k),
  reed: (k) => (k <= 32 ? k ** -0.55 * Math.exp(-k / 16) : 0),
  string: (k) => (k <= 20 ? k ** -0.9 : 0),
};
/**
 * Each stop's ranks: [pitch, level, pipe]. Pitch counts from the 16' rank (an octave under the key): 1 the 16', 2 the
 * 8' (the key's own pitch), 4 the 4', 6 the 2 2/3', 8 the 2', 12 and 16 the mixture's 1 1/3' and 1'.
 */
const STOPS: Record<Stop, [pitch: number, level: number, pipe: Pipe][]> = {
  found: [[1, 0.45, 'flute'], [2, 1, 'principal'], [2, 0.5, 'flute']],
  chorus: [[4, 1, 'principal'], [6, 0.45, 'principal'], [8, 0.6, 'principal'], [12, 0.25, 'principal'], [16, 0.2, 'principal']],
  reed: [[2, 1, 'reed'], [1, 0.35, 'reed'], [4, 0.3, 'reed']],
  solo: [[2, 0.8, 'flute'], [4, 0.7, 'principal'], [8, 0.4, 'principal']],
  pedal: [[1, 0.7, 'principal'], [2, 0.8, 'principal'], [4, 0.3, 'principal']],
  pedalReed: [[1, 1, 'reed'], [2, 0.3, 'reed']],
  string: [[2, 1, 'string']],
  flute: [[2, 1, 'flute'], [4, 0.25, 'flute']],
};
/** How far each stop sits from true (in units of `organ.apart` cents): no two ranks of a real organ are quite in tune. */
const APART: Record<Stop, number> = { found: 0, chorus: 1, reed: -1.3, solo: 0.6, pedal: 0, pedalReed: -1, string: 1.8, flute: 0.4 };
/** How many harmonics of the 16' pitch a stop's wave holds. */
const PARTIALS = 96;

/**
 * A stop as one wave: the level of each harmonic of the 16' pitch (0 to `PARTIALS`) with all its ranks laid in, so
 * one oscillator plays the whole stop. Scaled so that the wave's level (RMS) is 1 whatever the stop.
 */
export function stopPartials(stop: Stop): Float32Array {
  const a = new Float32Array(PARTIALS + 1);
  for (const [pitch, level, pipe] of STOPS[stop]) for (let k = 1; pitch * k <= PARTIALS; k++) a[pitch * k] += level * PIPE[pipe](k);
  let power = 0;
  for (const v of a) power += (v * v) / 2;
  const scale = 1 / Math.sqrt(power);
  return a.map((v) => v * scale);
}

/**
 * The room the organ sounds in, as its echo of one click (two channels, for the two ears): a few early reflections,
 * then a dense tail that dies away over `low` seconds at its low end and `high` at its top (to -60 dB). Noise shaped,
 * not a recording. Each channel is scaled so a held chord comes back from it at the chord's own level.
 */
export function roomResponse(rate: number, secs: number, low: number, high: number, rng: () => number): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const n = Math.floor(secs * rate);
  const pre = Math.floor(0.012 * rate);
  const channel = (): Float32Array<ArrayBuffer> => {
    const h = new Float32Array(n);
    // The level dies by the same share every sample (60 dB in `low` seconds), and so does how open the tail is: it
    // darkens as it dies, the noise smoothed harder the later it comes. (Kept to plain arithmetic: this runs once
    // in the game, for a quarter of a million samples.)
    const dying = 10 ** (-3 / (low * rate));
    const closing = Math.exp(-1 / (high * 0.3 * rate));
    let level = 1;
    let open = 0.94;
    let y = 0;
    for (let i = pre; i < n; i++) {
      y += (0.06 + open) * ((rng() * 2 - 1) * level - y);
      h[i] = y;
      level *= dying;
      open *= closing;
    }
    // It ends on silence.
    const out = Math.floor(0.05 * rate);
    for (let i = 0; i < out; i++) h[n - 1 - i] *= i / out;
    let power = 0;
    for (const v of h) power += v * v;
    const scale = 1 / Math.sqrt(power);
    for (let i = 0; i < n; i++) h[i] *= scale;
    // The first walls: a few single echoes inside the first tenth of a second.
    for (let k = 0; k < 6; k++) h[pre + Math.floor((0.004 + 0.085 * rng()) * rate)] += (rng() < 0.5 ? -1 : 1) * (0.16 - 0.015 * k);
    return h;
  };
  return [channel(), channel()];
}

/**
 * The organ's piece: a round of eight bars, a chord a bar, in the giant's minor key. Its own, not anyone's tune: the
 * keynote's chord, the same over a bass stepping down, the sixth, the fifth (major, with the leading note), the
 * fourth, the flattened second (the darkest turn), then the keynote's chord over the fifth and the fifth's seventh,
 * which pulls back to the start. `bass`: the pedal's note; `root`: the chord's own; `tones`: the hands' notes
 * (semitones from the keynote, low to high).
 */
export const ROUND: { bass: number; root: number; tones: number[] }[] = [
  { bass: 0, root: 0, tones: [0, 3, 7] },
  { bass: -2, root: 0, tones: [0, 3, 7] },
  { bass: -4, root: 8, tones: [0, 3, 8] },
  { bass: -5, root: 7, tones: [-1, 2, 7] },
  { bass: 5, root: 5, tones: [0, 5, 8] },
  { bass: 1, root: 1, tones: [1, 5, 8] },
  { bass: -5, root: 0, tones: [0, 3, 7] },
  { bass: -5, root: 7, tones: [-1, 2, 5, 7] },
];
/**
 * The second manual's figures over a chord's three notes and the same an octave up (0 to 5, low to high), eight
 * notes each: an arch, a rocking round the top note, a fall, and a climb in thirds. `FIGURE_ORDER`: which plays in
 * each bar of the round.
 */
const FIGURES = [
  [0, 1, 2, 3, 2, 1, 2, 1],
  [3, 2, 3, 1, 3, 2, 3, 0],
  [5, 4, 3, 2, 3, 2, 1, 0],
  [0, 2, 1, 3, 2, 4, 3, 5],
];
const FIGURE_ORDER = [0, 1, 0, 2, 3, 1, 0, 2];
/**
 * The figure's note (semitones from the keynote) on a sixteenth of a bar of the round. Slow, it plays eighths (the
 * bar's figure once); `quick`, sixteenths (the bar's figure, then another).
 */
export function figureNote(tones: number[], bar: number, sixteenth: number, quick: boolean): number {
  const low = tones.slice(0, 3);
  const all = [...low, ...low.map((v) => v + 12)];
  const first = FIGURES[FIGURE_ORDER[bar % 8]];
  const second = FIGURES[FIGURE_ORDER[(bar + 3) % 8]];
  return all[quick ? (sixteenth < 8 ? first[sixteenth] : second[sixteenth - 8]) : first[(sixteenth >> 1) % 8]];
}
/** The key's scale (harmonic minor), and a step of it in semitones from the keynote (7 is the octave). */
const MINOR = [0, 2, 3, 5, 7, 8, 11];
export const scaleStep = (d: number): number => 12 * Math.floor(d / 7) + MINOR[((d % 7) + 7) % 7];
/** The runs that answer a surge, taken in turn (steps of the scale from the keynote): down from two octaves up, up the keynote's chord, down in thirds, up from the fifth. */
const RUNS = [
  [14, 13, 12, 11, 10, 9, 8, 7],
  [0, 2, 4, 7, 9, 11, 14, 16],
  [14, 12, 13, 11, 12, 10, 11, 9, 10, 8],
  [4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
];
/** The pickup on the warning: up from the fifth to the fifth above (steps of the scale), quickening. */
const PICKUP = [4, 6, 7, 8, 9, 11];
/** The hook's chord (the keynote's, wide, from an octave under the hands) and the last stand's (a diminished seventh on the leading note), in semitones from the keynote. */
const HOOK_CHORD = [-12, -5, 0, 3, 7, 12];
const STAND_CHORD = [-1, 2, 5, 8, 11, 14];

/** Keys held down on the organ: their gain, what sounds through it, the level they hold at, when they went down and when they end if nothing lets them go. */
interface Held {
  env: GainNode;
  oscs: OscillatorNode[];
  level: number;
  from: number;
  until: number;
}
/** Where held keys are kept until the next thing lets them go: the hands' chord, the pedal, the moving figure, the dissonant stop, the last thin stop. */
type Slot = 'chord' | 'pedal' | 'figure' | 'rub' | 'last';

/**
 * Each giant's organ. They share the piece and differ in key and stops: the Leviathan the full organ in D; the
 * Kraken lower, in B, with less brightness and more reed; the Dreamer in E (its lullaby's key) with few reeds, its
 * stops trembling, and its lullaby picked out on a high flute. `root`: the keynote (MIDI; the pedal sounds an octave
 * over it, the hands two); `chorus`, `reed`: how much of each it draws (1 the full organ); `trem`: its stops
 * tremble; `box`: its music box's tune is woven in.
 */
const ORGAN: Record<Giant, { root: number; chorus: number; reed: number; trem: boolean; box: boolean }> = {
  leviathan: { root: 38, chorus: 1, reed: 1, trem: false, box: false },
  kraken: { root: 35, chorus: 0.8, reed: 1.1, trem: false, box: false },
  dreamer: { root: 40, chorus: 0.8, reed: 0.4, trem: true, box: true },
};

/** A fight's music while it plays: its gains and filters, where it has got to, and what it last set. */
interface Live {
  id: Giant;
  organ: (typeof ORGAN)[Giant];
  /** The organ's level (`out`), its step back under a call (`duck`), its end (`gate`), its top's cut, and each stop's own gain (`runs`: the pickups and runs, which no stop shuts). */
  out: GainNode;
  duck: GainNode;
  gate: GainNode;
  tone: BiquadFilterNode;
  bus: Record<'pedal' | 'found' | 'chorus' | 'reed' | 'figure' | 'rub' | 'box' | 'trill' | 'runs' | 'last', GainNode>;
  /** The big chords (the hook's, the last stand's) go here, past the piece's own level. */
  hit: GainNode;
  /** Everything it is wired from, to take apart at the end. */
  nodes: AudioNode[];
  /** The state the music has eased to, and whether it has had its first frame yet. */
  s: Settled;
  fresh: boolean;
  /** When the next sixteenth is due (context time), and how many have been scheduled. */
  next: number;
  count: number;
  /** When the trill's notes and the last stop's key run out, how far the lullaby has got, and the surge and the warning as they were last frame. */
  trillUntil: number;
  lastUntil: number;
  lullaby: number;
  surging: boolean;
  surges: number;
  warned: boolean;
  /** The keys held down, those let go but not yet up, the chord and the pedal note sounding, when a short chord ends, which stops have been drawn on them, and whether the spent giant's keys have been let go. */
  held: Record<Slot, Held[]>;
  going: Held[];
  chordNow: number[];
  chordEnds: number;
  pedalNow: number;
  drawn: { chorus: boolean; reed: boolean; pedalReed: boolean };
  hushed: boolean;
  /** The last value sent to each gain, so a frame that changes nothing sends nothing. */
  set: Record<string, number>;
}

/**
 * A giant's fight, heard: its voice (`call`) and its music (`start`, `update` every frame, `end`). `music` is where
 * the music plays (in the game, a gain that follows the music switch) and `voices` where the calls go (the master
 * gain); `lake` is the lake's tune's own gain, which the fight lowers and gives back. `rng` gives 0..1.
 */
export class GiantFight {
  private live?: Live;
  /** Music that has ended: its nodes, and when it is quiet enough to take them apart (context time). */
  private ending: { nodes: AudioNode[]; at: number }[] = [];
  /** Each giant's last call, so the next is not the same. */
  private lastCall: Partial<Record<Giant, CallPlan>> = {};
  private kit: Kit;
  /** The organ's stops as waves and its room's echo, made once (`warm`, or the first hook). */
  private waves = new Map<Stop, PeriodicWave>();
  private roomEcho?: AudioBuffer;

  constructor(private ctx: BaseAudioContext, noise: AudioBuffer, private music: AudioNode, private voices: AudioNode, private lake?: AudioParam, rng: () => number = Math.random) {
    this.kit = { ctx, noise, rng };
  }

  /** The giant whose fight music is playing, if one is. */
  get playing(): Giant | null {
    return this.live?.id ?? null;
  }

  /** The last call planned for a giant (for the checks). */
  lastPlan(id: Giant): CallPlan | undefined {
    return this.lastCall[id];
  }

  /**
   * A giant is hooked: the organ lands its first chord (the full organ over a low pedal, held, then let go into the
   * room as the piece starts quietly under its echo) and the lake's tune gives way. Called while one plays, that one
   * is cut and this starts clean.
   */
  start(id: Giant): void {
    const { ctx } = this;
    const O = K.organ;
    const t = ctx.currentTime;
    this.reap(t);
    if (this.live) {
      this.liftAll(this.live, t + 0.4);
      this.close(this.live, t, 0.05);
    }
    const nodes: AudioNode[] = [];
    const gain = (v: number): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      nodes.push(g);
      return g;
    };
    const gate = gain(1);
    gate.connect(this.music);
    const duck = gain(1);
    duck.connect(gate);
    const out = gain(0);
    out.connect(duck);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.7;
    tone.frequency.value = O.top;
    nodes.push(tone);
    tone.connect(out);
    const hit = gain(O.level * K.organLevel[id]);
    hit.connect(duck);
    // The room: everything the organ plays comes back off the walls for seconds.
    const room = ctx.createConvolver();
    room.normalize = false;
    room.buffer = this.echo();
    nodes.push(room);
    out.connect(room);
    hit.connect(room);
    room.connect(gain(O.room.wet)).connect(duck);
    const bus = { pedal: gain(0), found: gain(0), chorus: gain(0), reed: gain(0), figure: gain(0), rub: gain(0), box: gain(0), trill: gain(0), runs: gain(O.runs), last: gain(0) };
    for (const b of Object.values(bus)) b.connect(tone);
    this.live = {
      id, organ: ORGAN[id], out, duck, gate, tone, bus, hit, nodes,
      s: { act: 1, near: 0, fight: 1, surge: 0, warn: 0, tension: 0, spent: 0 },
      fresh: true,
      // The piece starts as the hook's chord is let go.
      next: t + 0.03 + O.hook.secs,
      count: 0,
      trillUntil: 0,
      lastUntil: 0,
      lullaby: 0,
      surging: false,
      surges: 0,
      warned: false,
      held: { chord: [], pedal: [], figure: [], rub: [], last: [] },
      going: [],
      chordNow: [],
      chordEnds: 0,
      pedalNow: 0,
      drawn: { chorus: false, reed: false, pedalReed: false },
      hushed: false,
      set: {},
    };
    this.bigChord(this.live, t + 0.03, HOOK_CHORD, O.hook.level, O.hook.secs);
    if (this.lake) {
      this.hold(this.lake, t);
      this.lake.setTargetAtTime(K.lakeTune, t, K.lakeFade / 3);
    }
  }

  /** A stop's wave, made once. Its harmonics are given scattered phases, so a chord's peaks do not all fall together. */
  private wave(stop: Stop): PeriodicWave {
    let w = this.waves.get(stop);
    if (!w) {
      const a = stopPartials(stop);
      const real = new Float32Array(a.length);
      const imag = new Float32Array(a.length);
      for (let i = 1; i < a.length; i++) {
        const turn = Math.sin(i * 12.9898 + stop.length * 78.233) * 43758.5453;
        const phase = 2 * Math.PI * (turn - Math.floor(turn));
        real[i] = a[i] * Math.cos(phase);
        imag[i] = a[i] * Math.sin(phase);
      }
      w = this.ctx.createPeriodicWave(real, imag, { disableNormalization: true });
      this.waves.set(stop, w);
    }
    return w;
  }

  /**
   * Makes what the organ needs ahead of time (its stops' waves and its room's echo: a few ms of arithmetic), so the
   * hook does not pay for it. The game's sound calls this as the boat comes into the Abyss.
   */
  warm(): void {
    for (const stop of Object.keys(STOPS) as Stop[]) this.wave(stop);
    this.echo();
  }

  /** The room's echo, made once. */
  private echo(): AudioBuffer {
    if (!this.roomEcho) {
      const R = K.organ.room;
      const sides = roomResponse(this.ctx.sampleRate, R.secs, R.low, R.high, this.kit.rng);
      this.roomEcho = this.ctx.createBuffer(2, sides[0].length, this.ctx.sampleRate);
      sides.forEach((side, i) => this.roomEcho!.copyToChannel(side, i));
    }
    return this.roomEcho;
  }

  /**
   * Keys go down on a stop at `t`: each note (MIDI, the key's own pitch) one oscillator playing the whole stop, all
   * through one gain that comes up quickly, holds steady and lets go quickly, as a pipe does. Each pipe starts a
   * shade sharp and settles (its speech). With `len` the keys come up by themselves; with a `slot` they are kept
   * until `lift` lets them go (and come up after `organ.longest` if nothing does).
   */
  private press(L: Live, t: number, notes: number[], stop: Stop, bus: AudioNode, level: number, o: { len?: number; slot?: Slot; attack?: number; trem?: boolean } = {}): void {
    const { ctx } = this;
    const O = K.organ;
    const attack = o.attack ?? O.attack;
    const until = t + Math.max(attack * 2, o.len ?? O.longest);
    const fall = Math.min(O.release * 3, (until - t - attack) / 2);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + attack);
    env.gain.setValueAtTime(level, until - fall);
    env.gain.linearRampToValueAtTime(0, until);
    env.connect(bus);
    const wave = this.wave(stop);
    const oscs = notes.map((note) => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      // The wave is laid out on the 16' pitch, an octave under the key.
      osc.frequency.value = hz(note - 12);
      const cents = APART[stop] * O.apart + (this.kit.rng() * 2 - 1) * 1.5;
      osc.detune.setValueAtTime(cents + O.speak, t);
      osc.detune.linearRampToValueAtTime(cents, t + 0.045);
      osc.connect(env);
      osc.start(t);
      osc.stop(until + 0.02);
      return osc;
    });
    if (o.trem) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = O.tremulant[0];
      const deep = ctx.createGain();
      deep.gain.value = level * O.tremulant[1];
      lfo.connect(deep).connect(env.gain);
      lfo.start(t);
      lfo.stop(until + 0.02);
      oscs.push(lfo);
    }
    if (o.slot) L.held[o.slot].push({ env, oscs, level, from: t, until });
  }

  /** A key comes up at `t`: a quick release, into the room. */
  private letGo(h: Held, t: number): void {
    if (h.until <= t) return;
    const R = K.organ.release;
    h.until = t;
    h.env.gain.cancelScheduledValues(t);
    // A key that was not down yet never sounds.
    h.env.gain.setValueAtTime(h.from < t ? h.level : 0, t);
    h.env.gain.setTargetAtTime(0, t, R);
    for (const osc of h.oscs) osc.stop(t + R * 6);
  }

  /** The keys held in a slot come up at `t`. They are remembered until then, in case everything is let go sooner. */
  private lift(L: Live, slot: Slot, t: number): void {
    const now = this.ctx.currentTime;
    L.going = L.going.filter((h) => h.until > now);
    for (const h of L.held[slot]) {
      this.letGo(h, t);
      L.going.push(h);
    }
    L.held[slot].length = 0;
  }

  /** Every key comes up at `t`: those held, and those already let go for a moment later. */
  private liftAll(L: Live, t: number): void {
    for (const slot of Object.keys(L.held) as Slot[]) this.lift(L, slot, t);
    for (const h of L.going) this.letGo(h, t);
    L.chordNow = [];
    L.pedalNow = 0;
  }

  /** The breath of noise as a chord's pipes start to speak. */
  private chiff(bus: AudioNode, t: number, note: number, level: number): void {
    hiss(this.kit, bus, t, 0.06, 'bandpass', hz(note) * 3, hz(note) * 2, level * K.organ.chiff, 1.2, 0.008);
  }

  /**
   * One of the two big chords (the hook's, the last stand's): `tones` (semitones from the keynote) on every stop the
   * giant's organ has, over the keynote in the pedal with its reed, held `secs` seconds. It goes past the piece's
   * own level and stops, straight to the room.
   */
  private bigChord(L: Live, t: number, tones: number[], level: number, secs: number): void {
    const S = K.organ.stop;
    const { root, chorus, reed } = L.organ;
    const notes = tones.map((v) => root + 24 + v);
    this.press(L, t, notes, 'found', L.hit, S.found * level, { len: secs });
    this.press(L, t, notes, 'chorus', L.hit, S.chorus * level * chorus, { len: secs });
    this.press(L, t, notes, 'reed', L.hit, S.reed * level * reed, { len: secs });
    this.press(L, t, [root + 12], 'pedal', L.hit, S.pedal * level, { len: secs, attack: K.organ.pedalAttack });
    this.press(L, t, [root + 12], 'pedalReed', L.hit, S.pedalReed * level * reed, { len: secs, attack: K.organ.pedalAttack });
    this.chiff(L.hit, t, notes[notes.length - 1], S.found * level * notes.length);
  }

  /**
   * Every frame of the fight: the stops follow the state, and the notes due in the next moment are scheduled. Once
   * the giant is spent every key comes up and one thin high stop holds, trembling. Until then: a pickup on the
   * warning (a run up the scale into the surge), a run answering each surge and a trill for as long as it lasts,
   * and the piece's sixteenths as they fall due. With `audible` false (the music or the sound switched off) nothing
   * is built; the music picks up when it is back.
   */
  update(dt: number, state: GiantFightState, audible = true): void {
    const L = this.live;
    if (!L) return;
    const O = K.organ;
    const now = this.ctx.currentTime;
    this.reap(now);
    const to = settled(state);
    L.s = L.fresh ? to : follow(L.s, to, dt);
    L.fresh = false;
    const m = fightMix(L.s);
    this.aim(L, 'level', L.out.gain, m.level * O.level * K.organLevel[L.id], 0.1);
    this.aim(L, 'pedal', L.bus.pedal.gain, m.pedal, 0.15);
    this.aim(L, 'found', L.bus.found.gain, m.found, 0.2);
    this.aim(L, 'chorus', L.bus.chorus.gain, m.chorus * L.organ.chorus, 0.12);
    this.aim(L, 'reed', L.bus.reed.gain, m.reed * L.organ.reed, 0.12);
    this.aim(L, 'figure', L.bus.figure.gain, m.figure, 0.2);
    this.aim(L, 'rub', L.bus.rub.gain, m.rub, 0.15);
    this.aim(L, 'box', L.bus.box.gain, m.box, 0.2);
    this.aim(L, 'trill', L.bus.trill.gain, m.trill, 0.04);
    this.aim(L, 'last', L.bus.last.gain, m.last, 0.3);
    const warning = state.warning && !L.warned;
    L.warned = state.warning;
    if (!audible) {
      L.surging = false;
      return;
    }
    const soon = now + 0.02;
    const T = L.organ.root + 24;
    const step = 15 / m.bpm;
    if (state.spent) {
      if (!L.hushed) {
        L.hushed = true;
        this.liftAll(L, soon);
      }
      if (soon >= L.lastUntil - 0.3) {
        this.lift(L, 'last', soon);
        this.press(L, soon, [T + 19], 'flute', L.bus.last, O.stop.last, { slot: 'last', attack: 0.3, trem: true });
        L.lastUntil = soon + O.longest;
      }
      L.surging = false;
      return;
    }
    if (warning) {
      const n = PICKUP.length;
      const when = (i: number) => soon + O.pickup * (i / n) ** 0.85;
      PICKUP.forEach((d, i) => this.press(L, when(i), [T + scaleStep(d)], 'solo', L.bus.runs, O.stop.solo * (0.6 + (0.5 * i) / n), { len: (when(i + 1) - when(i)) * 0.95 }));
    }
    if (state.surge > 0.03) {
      const each = Math.max(0.055, step / 2);
      if (!L.surging) {
        L.surging = true;
        L.surges++;
        // The run that answers it: each surge another of them.
        const run = RUNS[L.surges % RUNS.length];
        run.forEach((d, i) => this.press(L, soon + i * each, [T + scaleStep(d)], 'solo', L.bus.runs, O.stop.solo * 1.1, { len: each * 0.95 }));
        L.trillUntil = soon + run.length * each;
      }
      // Then a trill on the chord's top note and the note of the scale over it, swelling with the surge.
      if (soon >= L.trillUntil - 0.05) {
        const from = Math.max(soon, L.trillUntil);
        const top = L.chordNow.length ? Math.max(...L.chordNow) : T + 7;
        let over = 0;
        while (T + scaleStep(over) <= top) over++;
        const quick = each * 0.8;
        for (let i = 0; i < 6; i++) this.press(L, from + i * quick, [i % 2 ? top : T + scaleStep(over)], 'solo', L.bus.trill, O.stop.solo * 1.2, { len: quick * 0.95 });
        L.trillUntil = from + 6 * quick;
      }
    } else L.surging = false;
    // After a gap in the frames it picks up from now, with nothing in a clump.
    if (L.next < now - 0.05) L.next = soon;
    while (L.next < now + K.ahead) {
      this.step(L, Math.max(L.next, now + 0.005), m, step);
      L.next += step;
      L.count++;
    }
  }

  /**
   * One sixteenth of the piece. The bar's chord goes down on the foundations at its start (far out, held half the
   * bar and let go: slow and sparse; close in, struck again mid-bar with its top doubled) and the pedal takes the
   * bass (close in, walking in octaves a beat at a time). Mid-fight the second manual's figure moves over it in
   * eighths, close in in sixteenths. The chorus and the reeds are drawn on whatever is down as their turn comes.
   * The dissonant stop holds a semitone over the chord's root, as loud as the line is loaded.
   */
  private step(L: Live, t: number, m: FightMix, step: number): void {
    const O = K.organ;
    const S = O.stop;
    const { root, trem, box } = L.organ;
    const T = root + 24;
    const i = L.count % 16;
    const bar = Math.floor(L.count / 16);
    const chord = ROUND[bar % ROUND.length];
    const full = m.density >= O.full;
    const sparse = m.density < O.thin;
    if (i === 0 || (full && i === 8)) {
      this.lift(L, 'chord', t);
      const tones = chord.tones.map((v) => T + v);
      if (full) tones.push(T + chord.tones[0] + 12);
      L.chordNow = tones;
      L.chordEnds = sparse ? t + step * 9 : Infinity;
      L.drawn.chorus = L.drawn.reed = false;
      this.press(L, t, tones, 'found', L.bus.found, S.found, { slot: 'chord', len: sparse ? step * 9 : undefined, trem });
      this.chiff(L.bus.found, t, tones[tones.length - 1], S.found * tones.length);
    }
    if (L.chordNow.length && t < L.chordEnds - step) {
      const len = sparse ? L.chordEnds - t : undefined;
      if (!L.drawn.chorus && m.chorus > 0.03) {
        L.drawn.chorus = true;
        this.press(L, t, L.chordNow, 'chorus', L.bus.chorus, S.chorus, { slot: 'chord', len });
      }
      if (!L.drawn.reed && m.reed > 0.03) {
        L.drawn.reed = true;
        this.press(L, t, L.chordNow, 'reed', L.bus.reed, S.reed, { slot: 'chord', len });
      }
    }
    if (i === 0 || (full && i % 4 === 0)) {
      this.lift(L, 'pedal', t);
      L.pedalNow = root + 12 + chord.bass + (full && (i / 4) % 2 === 1 ? 12 : 0);
      L.drawn.pedalReed = false;
      this.press(L, t, [L.pedalNow], 'pedal', L.bus.pedal, S.pedal, { slot: 'pedal', attack: O.pedalAttack });
    }
    if (L.pedalNow && !L.drawn.pedalReed && m.reed > 0.03) {
      L.drawn.pedalReed = true;
      this.press(L, t, [L.pedalNow], 'pedalReed', L.bus.reed, S.pedalReed, { slot: 'pedal', attack: O.pedalAttack });
    }
    if (m.figure > 0.03) {
      const every = full ? 1 : 2;
      if (i % every === 0) {
        this.lift(L, 'figure', t);
        this.press(L, t, [T + 12 + figureNote(chord.tones, bar, i, full)], 'solo', L.bus.figure, S.solo, { slot: 'figure', len: step * every * 1.5 });
      }
    } else if (L.held.figure.length) this.lift(L, 'figure', t);
    if (i === 0) {
      this.lift(L, 'rub', t);
      if (m.rub > 0.03) this.press(L, t, [T + 12 + chord.root + 1], 'string', L.bus.rub, S.rub, { slot: 'rub', attack: 0.12 });
    }
    // The Dreamer's lullaby, a note at a time on a high trembling flute, off the beat, with a rest where it comes round.
    if (box && m.box > 0.03 && i % (sparse ? 8 : 4) === 2) {
      const n = L.lullaby++ % (LULLABY.length + 1);
      if (n < LULLABY.length) this.press(L, t, [LULLABY[n]], 'flute', L.bus.box, S.box, { len: step * 3.2, trem: true });
    }
  }

  /**
   * The giant's voice, never twice the same: one of its gestures, shaped anew (`planCall`), then set at its distance:
   * far out duller, quieter and smeared into a few echoes. `c.kind` 'last' is its last stand, which the organ answers
   * with a chord (unless `music` is false: the music switched off).
   */
  call(id: Giant, c: GiantCall, music = true): CallPlan {
    const { ctx } = this;
    const t = ctx.currentTime + 0.02;
    this.reap(ctx.currentTime);
    // The organ lands a chord with the last stand: every key up, then a diminished seventh on all it has, and the piece waits under it.
    if (c.kind === 'last' && music && this.live && !this.live.hushed) {
      const L = this.live;
      const S = K.organ.stand;
      this.liftAll(L, t);
      this.bigChord(L, t, STAND_CHORD, S.level, S.secs);
      L.next = Math.max(L.next, t + S.secs + 0.6);
    }
    const plan = planCall(id, c, this.kit.rng, this.lastCall[id]);
    if (plan.gesture >= 0) this.lastCall[id] = plan;
    const d = distanceOf(id, plan.near);
    // The distance: two low-passes over the top, the level, and the smear.
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = d.hz;
    air.Q.value = 0.6;
    const air2 = ctx.createBiquadFilter();
    air2.type = 'lowpass';
    air2.frequency.value = d.hz * 1.6;
    air2.Q.value = 0.6;
    const level = ctx.createGain();
    level.gain.value = K.voice * plan.level * d.gain;
    air.connect(air2).connect(level).connect(this.voices);
    if (d.smear > 0.01) {
      for (const [wait, k, cut] of [[0.07, 0.55, 900], [0.16, 0.4, 650], [0.29, 0.25, 450]]) {
        const delay = ctx.createDelay(1);
        delay.delayTime.value = wait;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = Math.max(cut, d.hz * 0.6);
        const g = ctx.createGain();
        g.gain.value = k * d.smear;
        level.connect(delay).connect(f).connect(g).connect(this.voices);
      }
    }
    const dur = id === 'leviathan' ? this.leviathanCall(plan, t, air) : id === 'kraken' ? this.krakenCall(plan, t, air) : this.dreamerCall(plan, t, air);
    // The music steps back under the voice.
    const L = this.live;
    if (L) {
      this.hold(L.duck.gain, ctx.currentTime);
      L.duck.gain.setTargetAtTime(K.voiceDuck[c.kind], ctx.currentTime, 0.05);
      L.duck.gain.setTargetAtTime(1, t + dur * 0.8, 0.35);
    }
    return plan;
  }

  /** A voice played from `t` (context time) into `out`. */
  private say(v: Voice, t: number, out: AudioNode): void {
    playVoice(this.ctx, this.kit.noise, out, { ...v, at: t - this.ctx.currentTime + (v.at ?? 0) });
  }

  /** Each giant's call, from `t` into `out`; they return how long it sounds (s). */
  private leviathanCall(p: CallPlan, t: number, out: AudioNode): number {
    if (p.gesture < 0) {
      const last = leviathanLast(p);
      this.say(last, t, out);
      return last.dur;
    }
    const g = LEVIATHAN[p.gesture];
    const v = shape(g, p, this.kit.rng);
    if (!g.twice) {
      this.say(v, t, out);
      return v.dur;
    }
    // Two barks: the first held back, the second a few semitones up and harder.
    this.say({ ...v, gain: v.gain * 0.7 }, t, out);
    const up = 2 ** ((2 + 2 * this.kit.rng()) / 12);
    const gap = v.dur + 0.04 + 0.08 * this.kit.rng();
    this.say({ ...v, pitch: v.pitch.map(([at, f]) => [at, f * up]) }, t + gap, out);
    return gap + v.dur;
  }

  private krakenCall(p: CallPlan, t: number, out: AudioNode): number {
    const { ctx, kit } = this;
    // The hollow of it, as in its landing: its sounds come back off its insides in a few echoes, each duller than the last.
    const cave = ctx.createGain();
    cave.connect(out);
    for (const [wait, k, cut] of [[0.11, 0.5, 900], [0.24, 0.32, 600], [0.41, 0.2, 400]]) {
      const d = ctx.createDelay(1);
      d.delayTime.value = wait;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut;
      const g = ctx.createGain();
      g.gain.value = k;
      cave.connect(d).connect(f).connect(g).connect(out);
    }
    if (p.gesture < 0) {
      const v = krakenLast(p);
      deepTone(kit, cave, t, v);
      const s = v.dur / 3.6;
      glug(kit, cave, t + 0.9 * s, 2, 0.8);
      glug(kit, cave, t + 1.8 * s, 3, 0.9);
      // The break: the air goes out of it all at once, its clicks scatter, and the hull groans as it lets go.
      glug(kit, cave, t + 2.5 * s, 9, 1.1);
      clickRun(kit, cave, t + 2.55 * s, 7, 0.05, 1.25, 0.8);
      glug(kit, cave, t + 3.0 * s, 4, 0.7);
      suck(kit, cave, t + 3.05 * s, 0.5, 0.1);
      creak(kit, this.voices, t + 1.3 * s, K.voice * 1.2);
      creak(kit, this.voices, t + 2.7 * s, K.voice * 1.5);
      return v.dur + 0.4;
    }
    const g = KRAKEN[p.gesture];
    const v = shapeDeep(g, p, kit.rng);
    deepTone(kit, cave, t, v);
    for (const [at, n] of g.glugs ?? []) glug(kit, cave, t + at * v.dur, n + Math.floor(kit.rng() * 2), 0.7);
    if (g.clicks) clickRun(kit, cave, t + g.clicks[0] * v.dur, g.clicks[1] + Math.floor(kit.rng() * 4), 0.07, 1.16, 0.6);
    if (g.suck) suck(kit, cave, t + v.dur - 0.1, 0.3 + 0.15 * kit.rng(), 0.07);
    // The hull is beside the listener however far off the Kraken is, so its answer does not go through the distance.
    if (g.creak) creak(kit, this.voices, t + g.creak * v.dur, K.voice * p.level);
    return v.dur + 0.4;
  }

  private dreamerCall(p: CallPlan, t: number, out: AudioNode): number {
    const { kit } = this;
    const { rng } = kit;
    const off = 6.5 + 18 * p.strain;
    if (p.gesture < 0) {
      // The last stand: the box wound too tight. The lullaby's rocking races, climbing a semitone a pair and
      // plucked harder each time, a note of glass rising under it, until the spring breaks: a twang, the works
      // running down, and three notes dropped out of tune. Nothing like the landing, where it slows and sinks.
      const key = Math.round(p.semis) + 5;
      const w = wow(kit, t, 4.4, 2.2);
      const run = [83, 79, 83, 79, 82, 79, 81, 77, 80, 77];
      let at = t;
      let beat = 0.2;
      whisper(kit, out, t, 2.2, 0.02);
      run.forEach((note, i) => {
        const up = Math.floor(i / 2) + key;
        tine(kit, out, at, note + up, 0.7, { pluck: 0.42 + 0.045 * i, off: 14, wow: w });
        if (i % 2 === 0) tine(kit, out, at, 64 + up, 0.9, { pluck: 0.3, off: 14, wow: w });
        at += beat;
        beat *= 0.9;
      });
      glass(kit, out, t, 71 + key, (at - t) * 1.5, 0.022);
      // The spring: its twang, a tine dropping away under it, and the snap.
      twang(kit, out, at, 64 + key, 0.085);
      tine(kit, out, at, 76 + key, 1.1, { pluck: 0.8, off: 25, sag: 900, wow: w });
      hiss(kit, out, at, 0.09, 'bandpass', 3600, 1500, 0.035, 2, 0.003);
      ratchet(kit, out, at + 0.08, 9, 0.045, 1.28, 0.022);
      [77, 75, 70].forEach((note, i) => tine(kit, out, t + 2.2 + 0.36 * i + 0.1 * i * i, note + key, 1.3, { pluck: 0.45 - 0.08 * i, off: 22, sag: 50 + 40 * i, wow: w }));
      return 3.8;
    }
    const g = DREAMER[p.gesture];
    const key = Math.round(p.semis);
    let beat = lerp(g.beat[0], g.beat[1], p.len);
    // How long it is before the notes (the key, the spring, the bell, the glass), for the waver they all share.
    const before = (g.wind ? g.wind * 0.05 + 0.05 : 0) + (g.twang ? 0.32 : 0) + (g.bell ? 0.7 : 0) + (g.glass ? 0.8 : 0);
    const w = wow(kit, t, before + g.notes.length * beat * 1.1 + 2.3, 1 + 1.5 * p.strain);
    const pluck = 0.66 + 0.3 * (p.mouth - 1);
    const first = g.notes[0];
    const lead = (typeof first === 'number' ? first : first[0]) + key;
    let at = t;
    if (g.wind) at = ratchet(kit, out, at, g.wind, 0.05, 0.96, 0.02) + 0.05;
    if (g.twang) {
      twang(kit, out, at, lead - 12, 0.055 * pluck);
      at += 0.32;
    }
    if (g.bell) {
      const len = 0.45 + 0.25 * p.len;
      bellIn(kit, out, at, lead, len, 0.05 * pluck, w);
      at += len;
    }
    if (g.glass) {
      const len = 1.5 + 0.5 * p.len;
      glass(kit, out, at, g.glass[0] + key, len, 0.035 * pluck);
      glass(kit, out, at + 0.3, g.glass[1] + key, len, 0.03 * pluck);
      at += 0.8;
    }
    whisper(kit, out, t, at - t + g.notes.length * beat + 0.8, 0.012 + 0.014 * p.strain);
    // A tired box drops a note now and then, and its pins come late.
    const drop = g.notes.length > 2 && rng() < 0.6 * p.strain ? 1 + Math.floor(rng() * (g.notes.length - 1)) : -1;
    g.notes.forEach((step, i) => {
      const last = i === g.notes.length - 1;
      const when = at + (i > 0 ? rng() * 0.05 * p.strain : 0);
      if (i !== drop) {
        for (const note of typeof step === 'number' ? [step] : step) tine(kit, out, when, note + key, last ? 2.2 : 1.25, { pluck: typeof step === 'number' ? pluck : pluck * 0.75, off, sag: last ? 20 + 60 * p.strain : 0, wow: w });
      }
      at += beat;
      beat *= 0.94 + 0.12 * rng();
    });
    return at - t + 1.2;
  }

  /**
   * The fight is over. Landed: the music is as good as gone within 0.3 s, so the landing's own sound hits. Lost: it
   * falls away over about 1.5 s as the wind runs out of the organ, every pipe sagging. The lake's tune comes back a
   * while after. Does nothing when no fight is on.
   */
  end(how: 'landed' | 'lost'): void {
    const L = this.live;
    const t = this.ctx.currentTime;
    this.reap(t);
    if (!L) return;
    if (how === 'lost') for (const held of Object.values(L.held)) for (const h of held) for (const osc of h.oscs) osc.detune.setTargetAtTime(-700, t, 0.8);
    // The keys come up once it is silent.
    this.liftAll(L, t + (how === 'landed' ? K.landedFade * 8 : K.lostFade * 4));
    this.close(L, t, how === 'landed' ? K.landedFade : K.lostFade);
    this.live = undefined;
    if (this.lake) {
      this.hold(this.lake, t);
      this.lake.setTargetAtTime(1, t + K.lakeBack[how], 0.5);
    }
  }

  /** Fades a fight's music out (`tau`: the fade's time constant, s) and leaves its nodes to be taken apart once it is silent. */
  private close(L: Live, t: number, tau: number): void {
    this.hold(L.gate.gain, t);
    L.gate.gain.setTargetAtTime(0, t, tau);
    L.gate.gain.setValueAtTime(0, t + tau * 8);
    this.ending.push({ nodes: [...L.nodes], at: t + tau * 8 + 0.1 });
    if (this.live === L) this.live = undefined;
  }

  /** Takes apart the music that ended and has gone silent. */
  private reap(now: number): void {
    if (!this.ending.length) return;
    this.ending = this.ending.filter((e) => {
      if (e.at > now) return true;
      for (const n of e.nodes) n.disconnect();
      return false;
    });
  }

  /** Drops what is scheduled on a gain from `t` on, leaving it where it has got to. */
  private hold(p: AudioParam, t: number): void {
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
    else {
      const v = p.value;
      p.cancelScheduledValues(t);
      p.setValueAtTime(v, t);
    }
  }

  /** Heads a gain for `v`, unless that is where it was last sent. */
  private aim(L: Live, key: string, p: AudioParam, v: number, tau: number): void {
    const was = L.set[key];
    if (was !== undefined && Math.abs(v - was) <= 0.01 * Math.max(Math.abs(was), 0.02)) return;
    L.set[key] = v;
    p.setTargetAtTime(v, this.ctx.currentTime, tau);
  }
}
