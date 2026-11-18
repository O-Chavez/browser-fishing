import { hearGain, seeded, showSounds, type Show, type ShowSound } from '../data/rockets';

/**
 * The fireworks' sounds, synthesised like the rest of the game's (no audio files): a whoosh as a rocket leaves the
 * rack, a boom for each burst and a crackle after the ones that have it (which sounds a show makes is data,
 * `showSounds` in src/data/rockets.ts). Each is quieter and duller the further the listener stands from it, and
 * arrives a moment late, as sound does over water. It takes any `BaseAudioContext` and plays into the node it is
 * given, which in the game is the show's own gain into the master gain, so the sound switch silences it. Play-test: every level here.
 */

/** Each kind's level beside the burst, before distance. */
export const SOUND_LEVEL = { whoosh: 0.2, thump: 0.6, roll: 0.42, crack: 0.22, crackle: 0.16 };
/** Metres a second: a burst 60 m off is heard about 0.17 s after it is seen. */
const SPEED_OF_SOUND = 343;
/** A far sound loses its top: the low-pass every sound goes through closes with distance (Hz at 0 m, and the metres that halve it). */
const AIR = { open: 15000, half: 55 };

/** How long after its moment a sound is still worth playing (s): a slow frame shouldn't cost a boom. */
const LATE = 0.6;

export interface Ear { x: number; y: number; z: number }

/** How finely a crackle's loudness is written (points a second), and how many pops it has. */
const CURVE_RATE = 2000;
const POPS = 26;
/**
 * A crackle's loudness over `dur` seconds, `level` at its loudest: `POPS` pops spread along it from `seed`, each up
 * in 2 ms and dying away over 30 to 60 ms.
 */
export function crackleCurve(seed: number, dur: number, level: number): Float32Array {
  const rng = seeded(seed);
  const curve = new Float32Array(Math.max(2, Math.round(dur * CURVE_RATE)));
  for (let i = 0; i < POPS; i++) {
    const at = ((i + rng()) / POPS) * dur;
    rng();
    const peak = level * (0.4 + 0.6 * rng());
    const len = 0.03 + 0.03 * rng();
    const first = Math.floor(at * CURVE_RATE);
    for (let k = first; k < curve.length; k++) {
      const tau = k / CURVE_RATE - at;
      if (tau > len) break;
      const v = tau < 0.002 ? (peak * Math.max(0, tau)) / 0.002 : peak * Math.pow(0.0005, (tau - 0.002) / len);
      if (v > curve[k]) curve[k] = v;
    }
  }
  // It ends on silence, where the gain is left when the curve runs out.
  curve[curve.length - 1] = 0;
  return curve;
}

/**
 * The gain a show's sounds play through, on their way to the master: cut, it silences what is still sounding (the
 * player walked into the casino or left on a charter mid-show), and the next show gets a fresh one.
 */
export class ShowBus {
  private bus: GainNode | null = null;
  constructor(private ctx: BaseAudioContext, private out: AudioNode) {}

  get node(): GainNode {
    if (!this.bus) {
      this.bus = this.ctx.createGain();
      this.bus.connect(this.out);
    }
    return this.bus;
  }

  cut(): void {
    const bus = this.bus;
    if (!bus) return;
    this.bus = null;
    bus.gain.cancelScheduledValues(this.ctx.currentTime);
    bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }
}

/** Schedules one sound `wait` seconds from now for a listener at `ear`. Returns the gain distance left it with. */
export function playShowSound(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, s: ShowSound, ear: Ear, wait: number): number {
  const d = Math.hypot(s.x - ear.x, s.y - ear.y, s.z - ear.z);
  const near = hearGain(d);
  const t = ctx.currentTime + Math.max(0, wait) + d / SPEED_OF_SOUND;
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = AIR.open / (1 + d / AIR.half);
  air.connect(out);
  const hiss = (type: BiquadFilterType, f0: number, f1: number, gain: number, at: number, dur: number, q = 0.8, attack = 0.012): void => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(air);
    src.start(at, (s.t * 0.37 + at * 0.11) % 2.5);
    src.stop(at + dur + 0.05);
  };
  if (s.kind === 'whoosh') {
    // Air tearing as it climbs, rising in pitch, loudest as it leaves.
    hiss('bandpass', 500, 2600, SOUND_LEVEL.whoosh * near * (0.6 + 0.4 * s.size), t, s.dur, 1.3, 0.06);
  } else if (s.kind === 'boom') {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(115 - 35 * s.size, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.32);
    const g = ctx.createGain();
    const len = 0.3 + 0.35 * s.size;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(SOUND_LEVEL.thump * near * (0.55 + 0.45 * s.size), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(air);
    o.start(t);
    o.stop(t + len + 0.05);
    // The body of the boom and its roll over the water, then the crack only someone near hears.
    hiss('lowpass', 1100 - 400 * s.size, 110, SOUND_LEVEL.roll * near * (0.6 + 0.4 * s.size), t, s.dur);
    hiss('highpass', 2200, 900, SOUND_LEVEL.crack * near * near, t, 0.07, 0.7, 0.003);
  } else {
    // A scatter of small sharp pops: one stretch of hiss whose loudness is written out pop by pop, so a crackle
    // is three nodes however many pops it has.
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.Q.value = 0.7;
    f.frequency.value = 4600;
    const g = ctx.createGain();
    // Silent until the curve starts (no other event may share its span).
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(crackleCurve(Math.round(s.t * 1000) + 7, s.dur, SOUND_LEVEL.crackle * near), t, s.dur);
    src.connect(f).connect(g).connect(air);
    src.start(t, (s.t * 0.37) % 2.5);
    src.stop(t + s.dur + 0.02);
  }
  return near;
}

/**
 * Plays a show's sounds as it runs. `tick` is called each frame while the rocket is up with the seconds since it
 * was lit and where the listener stands now: each sound is scheduled a little before it is due, so someone walking
 * hears it from where they are by then. A sound whose moment is well past (the show was joined part way through)
 * is left out.
 */
export class ShowSounds {
  private list: ShowSound[];
  private i = 0;
  /** How many sounds have been scheduled, and the last one's gain (for the checks). */
  played = 0;
  lastGain = 0;

  constructor(show: Show) {
    this.list = showSounds(show);
  }

  tick(elapsed: number, ear: Ear, play: (s: ShowSound, ear: Ear, wait: number) => number): void {
    while (this.i < this.list.length && this.list[this.i].t <= elapsed + 0.2) {
      const s = this.list[this.i++];
      // A frame that came late still plays it, at once; only a sound well past is left out.
      if (s.t < elapsed - LATE) continue;
      this.lastGain = play(s, ear, s.t - elapsed);
      this.played++;
    }
  }
}
