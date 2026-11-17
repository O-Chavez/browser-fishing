/**
 * Playing in the campfire band (src/data/band.ts): what a player seated at one of the Great Fire's logs does with
 * that log's instrument. It is no emote of its own: the seated look (`sit.ts`) lays it on top of the seated pose when
 * the seat is one of the band's (`EmoteCtx.band`), so it starts and ends with sitting, on the player's own body and
 * on their avatar on everyone else's screen.
 *
 * The instrument (src/game/instruments.ts) is held in front of the seated body by two of the base emotes' mittens
 * (`hands.ts`; characters have no arms), and the hands move on the notes of the instrument's own part: every motion
 * is worked out from the shared clock and the part's notes for the bar the clock is in (`Beat`), so a hand lands as
 * the note sounds, and every player sees the same hands at the same moment. The body sways once a bar and dips on
 * the bar's two beats.
 */
import * as THREE from 'three';
import { BAR_MS, EIGHTH_MS, bandNotes, type InstrumentId } from '../../../data/band';
import { BANJO, DRUM, JUG, SQUEEZEBOX, WASHBOARD, WHISTLE, buildInstrument, squeeze, squeezeboxWidth, type Instrument } from '../../instruments';
import { clamp01, easeOutBack, freeLook, progress, smoothstep } from '../kit';
import { TAU, type V3 } from '../meshes';
import type { BandSeat, EmoteCtx, EmotePose } from '../types';
import { follow, handMats, mitten, type HandMats } from './hands';
import { SIT_SQUASH } from './seated';

// ---------- the part's notes, as the hands need them ----------

/** The most notes a bar of any part starts at different moments (the banjo's turn and the drum's run have 8). */
const MAX_ONSETS = 16;

/** One bar of a part: the moments a note starts (a chord counts once), in eighths from the bar's start. */
class Onsets {
  n = 0;
  readonly at = new Float32Array(MAX_ONSETS);
  readonly len = new Float32Array(MAX_ONSETS);
  readonly vel = new Float32Array(MAX_ONSETS);
  readonly midi = new Float32Array(MAX_ONSETS);
  /** 1 for the drum's low thump, 0 for anything else. */
  readonly thump = new Uint8Array(MAX_ONSETS);

  load(id: InstrumentId, bar: number): void {
    this.n = 0;
    for (const note of bandNotes(id, bar)) {
      if (this.n > 0 && note.at === this.at[this.n - 1]) continue;
      if (this.n === MAX_ONSETS) break;
      const i = this.n++;
      this.at[i] = note.at;
      this.len[i] = note.len;
      this.vel[i] = note.vel;
      this.midi[i] = note.midi;
      this.thump[i] = note.hit === 'thump' ? 1 : 0;
    }
  }
}

/** A long time since a note (ms): none yet. */
const NEVER = 1e9;

/**
 * Where a part is in its music at a moment of the shared clock. The notes are asked for once a bar and kept (the
 * bar before, this one and the next), so reading it each frame makes nothing new.
 */
class Beat {
  private bars = [new Onsets(), new Onsets(), new Onsets()];
  private bar = NaN;
  /** How far into the bar the clock is, 0..1. */
  phase = 0;
  /** The note that last started: ms since, how long it is held (ms), how hard it is played, its pitch. */
  since = NEVER;
  held = 0;
  vel = 0;
  midi = 0;
  /** The pitch of the note before it. */
  midiWas = 0;
  /** ms since the drum's last thump, and since its last tap. */
  sinceThump = NEVER;
  sinceTap = NEVER;
  /** The first pitch of this bar and of the one before (the banjo's chord), and ms since this bar began. */
  root = 0;
  rootWas = 0;
  into = 0;

  constructor(private id: InstrumentId) {}

  read(nowMs: number): void {
    const bar = Math.floor(nowMs / BAR_MS);
    if (bar !== this.bar) {
      const [prev, cur, next] = this.bars;
      if (bar === this.bar + 1) {
        // On to the next bar: what was this bar is the one before, and only the bar ahead is new.
        this.bars = [cur, next, prev];
        prev.load(this.id, bar + 1);
      } else {
        prev.load(this.id, bar - 1);
        cur.load(this.id, bar);
        next.load(this.id, bar + 1);
      }
      this.bar = bar;
    }
    const [prev, cur] = this.bars;
    const into = nowMs - bar * BAR_MS;
    this.into = into;
    this.phase = clamp01(into / BAR_MS);
    this.root = cur.n ? cur.midi[0] : 0;
    this.rootWas = prev.n ? prev.midi[0] : this.root;
    this.since = this.sinceThump = this.sinceTap = NEVER;
    this.midiWas = 0;
    // Back from the newest note that has started, through this bar and then the one before, to the last note and
    // the one before it, and to the drum's last thump and tap.
    let found = 0;
    for (let b = 1; b >= 0; b--) {
      const o = this.bars[b];
      const start = b === 1 ? 0 : -BAR_MS;
      for (let i = o.n - 1; i >= 0; i--) {
        const ago = into - (start + o.at[i] * EIGHTH_MS);
        if (ago < 0) continue;
        if (found === 0) {
          this.since = ago;
          this.held = o.len[i] * EIGHTH_MS;
          this.vel = o.vel[i];
          this.midi = o.midi[i];
        } else if (found === 1) this.midiWas = o.midi[i];
        found++;
        if (o.thump[i]) this.sinceThump = Math.min(this.sinceThump, ago);
        else this.sinceTap = Math.min(this.sinceTap, ago);
      }
    }
    if (found < 2) this.midiWas = this.midi;
  }
}

// ---------- hands ----------

/** The mitten's palm is this far up from its wrist, where it is modelled (`mittenGeo`). */
const PALM = 0.15;
/** How big the playing hands are drawn, against the base emotes' `HAND_SCALE` of 1.3: small enough not to hide what they hold. Play-test. */
const PLAY_HAND = 0.72;

/** A mitten that holds or plays: turned once as it is built, then moved by where its palm should be. */
class Hand {
  readonly g: THREE.Group;
  private off = new THREE.Vector3();

  /**
   * `fingers` is the way its fingers point and `palm` the way its palm faces, in the frame of what it holds; `thumb`
   * is +1 or -1, the side its thumb is on.
   */
  constructor(mats: HandMats, fingers: V3, palm: V3, thumb: number, private size = PLAY_HAND) {
    this.g = mitten(thumb, mats);
    const y = new THREE.Vector3(...fingers).normalize();
    const x = new THREE.Vector3().crossVectors(y, new THREE.Vector3(...palm)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    this.g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.g.scale.setScalar(size);
    this.off.copy(y).multiplyScalar(PALM * size);
  }

  /** Puts the middle of the palm at a spot. */
  at(x: number, y: number, z: number): void {
    this.g.position.set(x - this.off.x, y - this.off.y, z - this.off.z);
  }
}

// ---------- the seated body, in the frame the hands follow ----------

/**
 * The seated body is squashed to `SEATED` of its height and widened to keep its volume (`sit.ts`); the hands' frame
 * follows its lift and lean but not its squash (`follow`), so heights here are the standing ones times `SEATED` and
 * widths times `WIDER`.
 */
const SEATED = SIT_SQUASH;
const WIDER = 1 / Math.sqrt(SEATED);
/** The chest's and the mouth's heights on a standing character. */
const CHEST_Y = 0.85 * SEATED;
const MOUTH_Y = 1.56 * SEATED;
/** Room left between the outfit and what is held in front of it. */
const CLEAR = 0.02;
/** An outfit that reaches further forward than this (a cape's tentacles) is not cleared: the instrument stays in the hands' reach. Play-test. */
const FRONT_MAX = 0.52;
/** How far forward the chest's outfit and the face's reach on the seated body, with room to spare. */
const chestOf = (ctx: EmoteCtx): number => Math.min(FRONT_MAX, Math.max(ctx.front ?? 0, 0.28) * WIDER) + CLEAR;
const mouthOf = (ctx: EmoteCtx): number => Math.min(FRONT_MAX, Math.max(ctx.face ?? 0, 0.2) * WIDER) + CLEAR;

/** A hit's strength `ms` after it lands: all there at once, a third left after `fall` ms. */
const strike = (ms: number, fall: number): number => (ms >= NEVER ? 0 : Math.exp(-ms / fall));
/** A stroke and back: out in the first `out` ms after a note, back over the next `back` ms. 0 at rest, 1 at the stroke's end. */
const stroke = (ms: number, out: number, back: number): number => (ms >= NEVER ? 0 : ms < out ? smoothstep(0, out, ms) : 1 - smoothstep(out, out + back, ms));

/** What one instrument's player does each frame, from where its part is. */
type Playing = (beat: Beat) => void;
/** Sets the instrument in the hands (`hold`, which carries it and both hands) and says how it is played. */
type Hold = (ctx: EmoteCtx, hold: THREE.Group, inst: Instrument, mats: HandMats) => Playing;

// Play-test: every number below, the holds and the strokes.

/**
 * The banjo lies across the lap, its pot at the right hip and its neck rising to the left shoulder. The right hand
 * reaches over the strings from the pot's tail and picks down across them on each note, harder on the thumb's two;
 * the left hand holds the neck and slides along it when the chord changes.
 */
const banjo: Hold = (ctx, hold, _inst, mats) => {
  const Z = BANJO.depth / 2;
  hold.position.set(-0.1, CHEST_Y - 0.1, chestOf(ctx) + Z);
  hold.rotation.z = 0.5;
  const pick = new Hand(mats, [1, -0.35, 0], [0, 0, -1], 1);
  const fret = new Hand(mats, [0, 1, 0], [0, 0, -1], -1);
  hold.add(pick.g, fret.g);
  const slideOf = (midi: number): number => ((midi % 12) / 11 - 0.5) * 0.14;
  return (beat) => {
    const down = stroke(beat.since, 60, 200) * (0.5 + 0.5 * beat.vel);
    pick.at(-0.03, 0.065 - 0.085 * down, Z + 0.06);
    const k = smoothstep(0, 160, beat.into);
    fret.at(0.46 + slideOf(beat.rootWas) + (slideOf(beat.root) - slideOf(beat.rootWas)) * k, 0.005, Z + 0.035);
    hold.rotation.z = 0.5 + 0.03 * down;
  };
};

/**
 * The drum rests tipped in the lap, its skin up and toward the fire. Both hands hover over the skin: the right
 * comes down on the low thumps, the left on the light taps, and the drum gives a little under each.
 */
const drum: Hold = (ctx, hold, _inst, mats) => {
  const TILT = 0.6;
  const y0 = CHEST_Y - 0.2;
  hold.position.set(0, y0, chestOf(ctx) + DRUM.r * Math.cos(TILT) + 0.03);
  hold.rotation.x = TILT;
  const right = new Hand(mats, [-0.15, 0.2, 1], [0, -1, 0], -1);
  const left = new Hand(mats, [0.15, 0.2, 1], [0, -1, 0], 1);
  hold.add(right.g, left.g);
  const skin = DRUM.depth / 2 + 0.035;
  return (beat) => {
    const thump = strike(beat.sinceThump, 150);
    const tap = strike(beat.sinceTap, 120);
    right.at(-0.085, skin + 0.11 * (1 - thump), -0.05);
    left.at(0.085, skin + 0.08 * (1 - tap), -0.05);
    hold.position.y = y0 - 0.018 * thump - 0.008 * tap;
  };
};

/**
 * The squeezebox is held before the chest, a hand flat on each end. Each chord is one draw of the bellows: out as
 * it sounds and in again before the next, the ends rocking a little as they go.
 */
const squeezebox: Hold = (ctx, hold, inst, mats) => {
  hold.position.set(0, CHEST_Y + 0.03, chestOf(ctx) + SQUEEZEBOX.r + 0.03);
  // Smaller hands than the others', so the wooden ends show round them.
  const right = new Hand(mats, [0, 0.45, 0.9], [1, 0, 0], 1, PLAY_HAND * 0.82);
  const left = new Hand(mats, [0, 0.45, 0.9], [-1, 0, 0], -1, PLAY_HAND * 0.82);
  hold.add(right.g, left.g);
  return (beat) => {
    // Out over the first half of the chord and in over the second; between chords it stays a little open.
    const u = beat.since >= NEVER || beat.held <= 0 ? 1 : clamp01(beat.since / beat.held);
    const open = 0.12 + 0.88 * Math.sin(Math.PI * u) ** 2;
    squeeze(inst, open);
    const half = squeezeboxWidth(open) / 2 + 0.03;
    right.at(-half, -0.01, 0);
    left.at(half, -0.01, 0);
    hold.rotation.z = 0.09 * Math.sin(TAU * beat.phase);
    hold.rotation.y = 0.12 * (open - 0.5);
  };
};

/**
 * The whistle is held to the mouth, pointing down and out, a hand either side of its tube. It lifts with the
 * tune's pitch and dips on each note, and the hands' fingers lift off in turn.
 */
const whistle: Hold = (ctx, hold, _inst, mats) => {
  const TILT = 0.85;
  hold.position.set(0, MOUTH_Y, mouthOf(ctx));
  const upper = new Hand(mats, [0, 0.2, 1], [-1, 0, 0], -1, PLAY_HAND * 0.8);
  const lower = new Hand(mats, [0, 0.2, 1], [1, 0, 0], 1, PLAY_HAND * 0.8);
  hold.add(upper.g, lower.g);
  /** A pitch's place in the whistle's range (B4 to D6), -1..1. */
  const high = (midi: number): number => (midi ? (midi - 78.5) / 7.5 : 0);
  return (beat) => {
    const k = smoothstep(0, 90, beat.since);
    const pitch = high(beat.midiWas) + (high(beat.midi) - high(beat.midiWas)) * k;
    const note = strike(beat.since, 160);
    hold.rotation.x = -(TILT + 0.1 * pitch - 0.07 * note);
    hold.rotation.z = 0.05 * Math.sin(TAU * beat.phase);
    // The fingers: the upper hand lifts off on the high notes, the lower on the low ones.
    upper.at(0.05 + 0.02 * note * Math.max(0, pitch), -0.2, 0.01);
    lower.at(-0.05 - 0.02 * note * Math.max(0, -pitch), -0.33, 0.01);
  };
};

/**
 * The washboard stands on the lap against the chest, the left hand on its top. The right hand scrapes down the
 * ribs on every scratch and comes back up for the next, further on the bar's two beats.
 */
const washboard: Hold = (ctx, hold, _inst, mats) => {
  const TILT = 0.2;
  hold.position.set(0.04, CHEST_Y + 0.02, chestOf(ctx) + 0.02 + (WASHBOARD.h / 2) * Math.sin(TILT));
  hold.rotation.x = -TILT;
  const top = new Hand(mats, [0, -1, 0.1], [0, 0, -1], 1);
  const scrape = new Hand(mats, [1, 0.3, 0], [0, 0, -1], -1);
  hold.add(top.g, scrape.g);
  const [low, high] = WASHBOARD.ribs;
  top.at(0.1, WASHBOARD.h / 2 - 0.05, 0.05);
  return (beat) => {
    const down = stroke(beat.since, 70, 230) * (0.45 + 0.55 * beat.vel);
    scrape.at(-0.03, high - 0.03 - (high - low - 0.08) * down, 0.055);
    hold.rotation.z = 0.05 - 0.04 * down;
  };
};

/**
 * The jug is held up in both hands, its mouth under the player's lips. Each note is a puff: the jug tips up to the
 * mouth and settles back.
 */
const jug: Hold = (ctx, hold, _inst, mats) => {
  const TILT = 0.5;
  // Tipped toward the face: the belly clears the chest, and the mouth comes up to just under the lips.
  const y0 = MOUTH_Y - 0.03 - JUG.h * Math.cos(TILT);
  hold.position.set(0, y0, Math.max(mouthOf(ctx) + 0.07 + JUG.h * Math.sin(TILT), chestOf(ctx) + JUG.r + 0.08));
  const right = new Hand(mats, [0, 0.35, 1], [1, 0, 0], 1);
  const left = new Hand(mats, [0, 0.35, 1], [-1, 0, 0], -1);
  hold.add(right.g, left.g);
  right.at(-JUG.r - 0.02, 0.13, 0.01);
  left.at(JUG.r + 0.02, 0.17, 0.01);
  return (beat) => {
    const puff = strike(beat.since, 260) * (0.4 + 0.6 * beat.vel);
    hold.rotation.x = -(TILT + 0.16 * puff);
    hold.position.y = y0 + 0.035 * puff;
  };
};

const HOLDS: Record<InstrumentId, Hold> = { banjo, drum, squeezebox, whistle, washboard, jug };

// ---------- the look ----------

/** The instrument comes up into the hands this long after the player starts to sit (s), as the body settles. */
const PICK_UP: [number, number] = [0.3, 0.62];
/** The body's sway to each side once a bar (radians), and how much it dips on each of the bar's two beats (of its height). Play-test. */
const SWAY = 0.035;
const DIP = 0.012;

/** A seated player's instrument and hands, to lay over the seated pose. */
export interface BandPlay {
  group: THREE.Group;
  /** Called by the seated look after it has written its pose: `t` is seconds since the player began to sit. */
  update(t: number, pose: EmotePose): void;
  dispose(): void;
}

export function bandPlay(ctx: EmoteCtx, seat: BandSeat): BandPlay {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  const hold = new THREE.Group();
  group.add(rig);
  rig.add(hold);
  const inst = buildInstrument(seat.id);
  hold.add(inst.group);
  const playing = HOLDS[seat.id](ctx, hold, inst, handMats(ctx));
  const beat = new Beat(seat.id);
  return {
    group,
    update(t, pose) {
      beat.read(seat.clock());
      const up = progress(PICK_UP[0], PICK_UP[1], t);
      hold.scale.setScalar(up <= 0 ? 0 : easeOutBack(up));
      playing(beat);
      // The 6/8 sway: over to one side on the bar's first beat and to the other on its second, a dip on each.
      const settled = smoothstep(PICK_UP[0], PICK_UP[1] + 0.4, t);
      pose.roll += SWAY * Math.sin(TAU * beat.phase) * settled;
      pose.squash -= DIP * (0.5 + 0.5 * Math.cos(2 * TAU * beat.phase)) * settled;
      follow(rig, pose);
    },
    dispose: () => freeLook(group),
  };
}

/** Kept so a test can check the hands against the notes: the part's place in its music at a moment of the clock. */
export function beatAt(id: InstrumentId, nowMs: number): { since: number; held: number; vel: number; midi: number; sinceThump: number; sinceTap: number; phase: number } {
  const b = new Beat(id);
  b.read(nowMs);
  return { since: b.since, held: b.held, vel: b.vel, midi: b.midi, sinceThump: b.sinceThump, sinceTap: b.sinceTap, phase: b.phase };
}
