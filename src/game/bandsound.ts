import { BAR_MS, EIGHTH_MS, INSTRUMENTS, bandNotes, barHash, barsDue, type BandNote, type BarClock, type InstrumentId } from '../data/band';

/**
 * The town's tune and the campfire band's six voices, all synthesised (no audio files, no licensing), and the
 * scheduler that keeps both on the server's shared clock. It takes any `BaseAudioContext`, so
 * `scripts/band-audio.ts` renders this same code offline to check it. The notes are data in `src/data/band.ts`.
 */

const EIGHTH = EIGHTH_MS / 1000;
const BAR = BAR_MS / 1000;
const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * The band's level against the town's tune, and each part's own level inside it. Set from the renders of
 * `scripts/band-audio.ts`: every part alone sits within a few dB of the others and about level with the town's
 * tune (alone at the fire it is the tune), and the full ring comes out a touch above the tune and peaks under
 * -3 dBFS before the music's own volume. Play-test: all of them.
 */
const BAND_LEVEL = 0.75;
const PART_LEVEL: Record<InstrumentId, number> = { banjo: 0.42, drum: 0.38, squeezebox: 0.085, whistle: 0.125, washboard: 0.24, jug: 0.09 };
/** How much of the band goes into the tune's small room echo, so both stand in the same place. */
const BAND_ROOM = 0.2;
/** How quickly a part fades when its player gets up (the time constant, s): its ringing notes die at the bar line. */
const PART_FADE = 0.07;
/** The town's pick may land this far off the beat (s, either way): a human hand. Not shared; a few ms don't matter. */
const HUMAN = 0.0075;
/** Small seeded random numbers (mulberry32), so a string or a breath of noise is the same on every render. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The town's tune, as it has always been: a lilting 6/8 roll over open, major-leaning chords (Timber Hearth style).
const TOWN_CHORDS = [
  { bass: 38, up: [57, 62, 66, 69] }, // D
  { bass: 43, up: [55, 62, 67, 71] }, // G
  { bass: 45, up: [57, 61, 64, 69] }, // A
  { bass: 38, up: [57, 62, 66, 69] }, // D
  { bass: 47, up: [54, 62, 66, 71] }, // Bm
  { bass: 43, up: [55, 62, 67, 71] }, // G
  { bass: 38, up: [57, 62, 66, 69] }, // D
  { bass: 45, up: [57, 61, 64, 69] }, // A
];
const TOWN_ROLL = [-1, 1, 2, 0, 3, 2];
// D major pentatonic, kept in a gentle whistle range
const TOWN_MOTIFS = [
  [81, 83, 85, 83],
  [78, 81, 83, 81],
  [85, 83, 81, 78],
  [83, 81, 83, 85],
];

export interface MusicOptions {
  /** The town's pick lands a few ms off the beat, at random (on by default; the offline renders turn it off). */
  human?: boolean;
}

/**
 * The music: the town's tune (a drone, a fingerpicked guitar, a whistle now and then) and the band's parts, mixed
 * into `out`. The caller connects `out` on and sets its level; `pass` is called often with the shared clock and
 * schedules each bar a moment before it starts.
 */
export class Music {
  /** Everything the music makes; its gain is the caller's (the music volume and its switch). */
  readonly out: GainNode;
  /** The town's own pick and whistle, which step back near the fire while the band plays. */
  private townPick: GainNode;
  private townAir: GainNode;
  private body: BiquadFilterNode;
  private room: DelayNode;
  /** The band's bus (its level by distance) and each part's own gain, which opens while its player sits. */
  private bandBus: GainNode;
  private parts: GainNode[] = [];
  /** Where each part's voices plug in: ahead of the part's own filters. */
  private ins: Record<InstrumentId, AudioNode>;
  private noise: AudioBuffer;
  private strings = new Map<string, AudioBuffer>();
  private human: boolean;
  /** The last bar scheduled and when it ends on the context's clock, and the parts it was given. */
  private clock: BarClock = { last: null, endT: 0 };
  private lastMask = 0;
  /** Which parts' gains are open. */
  private open = 0;
  /** When the last bar with any part in it ends on the context's clock. */
  private bandEndT = 0;

  constructor(private ctx: BaseAudioContext, opts: MusicOptions = {}) {
    this.human = opts.human ?? true;
    const out = (this.out = ctx.createGain());
    // The guitar's body and a small room, as before.
    const body = (this.body = ctx.createBiquadFilter());
    body.type = 'peaking';
    body.frequency.value = 300;
    body.gain.value = 5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4800;
    const room = (this.room = ctx.createDelay(0.5));
    room.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    room.connect(fb).connect(room);
    room.connect(wet).connect(out);
    body.connect(tone).connect(out);
    body.connect(room);
    this.townPick = ctx.createGain();
    this.townPick.connect(body);
    this.townAir = ctx.createGain();
    this.townAir.connect(out);
    this.townAir.connect(room);

    // Two seconds of noise for the breaths, scratches and drum skins: the same noise on every machine.
    const rnd = seeded(7);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;

    this.bandBus = ctx.createGain();
    this.bandBus.gain.value = BAND_LEVEL;
    this.bandBus.connect(out);
    const send = ctx.createGain();
    send.gain.value = BAND_ROOM;
    this.bandBus.connect(send).connect(room);
    for (const { id } of INSTRUMENTS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const level = ctx.createGain();
      level.gain.value = PART_LEVEL[id];
      g.connect(level).connect(this.bandBus);
      this.parts.push(g);
    }
    this.ins = this.partFilters();
  }

  /** One filter, set up. */
  private filter(type: BiquadFilterType, freq: number, q = 0.7, gain = 0): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.gain.value = gain;
    return f;
  }

  /** Each part's own tone, shared by all its notes: the voices plug into the first filter of each chain. */
  private partFilters(): Record<InstrumentId, AudioNode> {
    const chain = (i: number, ...nodes: AudioNode[]): AudioNode => {
      nodes.reduce((a, b) => (a.connect(b), b)).connect(this.parts[i]);
      return nodes[0];
    };
    return {
      // The banjo's skin: no boom underneath, a ring where a drum head rings, and the fizz off the top.
      banjo: chain(0, this.filter('highpass', 170), this.filter('peaking', 2100, 0.9, 6), this.filter('lowpass', 6500)),
      drum: chain(1, this.filter('lowpass', 2400)),
      // Reeds in a wooden box: the saws' buzz taken off twice over, and nothing under the chord.
      squeezebox: chain(2, this.filter('lowpass', 1500, 0.8), this.filter('lowpass', 2600, 0.6), this.filter('highpass', 200)),
      whistle: chain(3, this.filter('lowpass', 7000)),
      // Thin tin: only the scratch's upper band.
      washboard: chain(4, this.filter('highpass', 1700), this.filter('peaking', 3600, 0.9, 5), this.filter('lowpass', 7500)),
      // A round hollow note: little above its first few harmonics.
      jug: chain(5, this.filter('lowpass', 700, 0.8)),
    };
  }

  /** A warm, barely-there drone for a sense of wide open sky. It never stops, whoever plays. */
  startDrone(): void {
    const ctx = this.ctx;
    for (const [m, v] of [[38, 0.02], [45, 0.014], [50, 0.01]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(m);
      const g = ctx.createGain();
      g.gain.value = v;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + m * 0.001;
      const lg = ctx.createGain();
      lg.gain.value = v * 0.6;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(this.out);
      o.start();
      lfo.start();
    }
  }

  /**
   * The band's level and the town layer's (`bandMix`), eased over `tau` seconds so walking through the arch never
   * clicks.
   */
  mix(band: number, town: number, tau = 0.5): void {
    const t = this.ctx.currentTime;
    this.bandBus.gain.setTargetAtTime(BAND_LEVEL * band, t, tau);
    this.townPick.gain.setTargetAtTime(town, t, tau);
    this.townAir.gain.setTargetAtTime(town, t, tau);
  }

  /** The parts sounding now, as a mask: those of the last bar scheduled, until it ends. */
  get sounding(): number {
    return this.ctx.currentTime < this.bandEndT ? this.lastMask : 0;
  }

  /** The last bar scheduled (null before the first), for the test hook. */
  get bar(): number | null {
    return this.clock.last;
  }

  /**
   * Schedules every bar that starts within `ahead` seconds (`barsDue`), with the band's parts in `mask` (bit i is
   * `INSTRUMENTS[i]`). `nowMs` is the shared clock now.
   */
  pass(nowMs: number, mask: number, ahead: number): void {
    const now = this.ctx.currentTime;
    // A player who got up after their next bar was scheduled: close their part at that bar's line, not a bar late.
    const left = this.lastMask & ~mask;
    const lastStart = this.clock.endT - BAR;
    if (left && lastStart > now) {
      for (let i = 0; i < this.parts.length; i++) if (left & (1 << i)) this.gate(i, false, lastStart);
      this.lastMask &= mask;
    }
    for (const { bar, t, notBefore } of barsDue(this.clock, nowMs, now, ahead)) {
      this.scheduleBar(bar, t, mask, notBefore);
      this.lastMask = mask;
      if (mask) this.bandEndT = t + BAR;
    }
  }

  /** Opens or closes a part's gain at `t`. */
  private gate(i: number, on: boolean, t: number): void {
    const g = this.parts[i].gain;
    const at = Math.max(this.ctx.currentTime, t);
    g.cancelScheduledValues(at);
    // Open just ahead of the bar line so its first note is whole; close from the line with a quick fade.
    if (on) g.setTargetAtTime(1, Math.max(this.ctx.currentTime, t - 0.03), 0.008);
    else g.setTargetAtTime(0, at, PART_FADE);
    this.open = on ? this.open | (1 << i) : this.open & ~(1 << i);
  }

  /** One bar of the town's tune and of each part in `mask`, starting at `t0`; notes before `notBefore` are left out. */
  private scheduleBar(bar: number, t0: number, mask: number, notBefore: number): void {
    const c = TOWN_CHORDS[((bar % 8) + 8) % 8];
    TOWN_ROLL.forEach((k, i) => {
      const t = t0 + i * EIGHTH + (this.human ? (Math.random() - 0.5) * 2 * HUMAN : 0);
      if (t >= notBefore) this.pick(k < 0 ? c.bass : c.up[k], t, k < 0 ? 0.3 : 0.14 + barHash(bar, 40 + i) * 0.06);
    });
    // The town's whistle, most times round on the third bar of four.
    if (((bar % 4) + 4) % 4 === 2 && barHash(bar, 30) < 0.8) {
      const motif = TOWN_MOTIFS[Math.floor(barHash(bar, 31) * TOWN_MOTIFS.length)];
      motif.forEach((m, i) => {
        const t = t0 + i * EIGHTH * 2;
        if (t >= notBefore) this.townWhistle(m - 12, t, EIGHTH * 3.2);
      });
    }
    INSTRUMENTS.forEach(({ id }, i) => {
      const on = (mask & (1 << i)) !== 0;
      if (on !== ((this.open & (1 << i)) !== 0)) this.gate(i, on, t0);
      if (!on) return;
      bandNotes(id, bar).forEach((n, k) => {
        const t = t0 + n.at * EIGHTH;
        if (t >= notBefore) this.voice(id, n, t, barHash(bar, 100 + i * 16 + k));
      });
    });
  }

  /** Karplus-Strong plucked string, rendered once per pitch: the town's guitar, or the banjo's brighter, shorter one. */
  private string(midi: number, banjo: boolean): AudioBuffer {
    const key = `${banjo ? 'b' : 'g'}${midi}`;
    let buf = this.strings.get(key);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const n = Math.round(sr / hz(midi));
    const rnd = seeded(midi * 2 + (banjo ? 1 : 0));
    buf = this.ctx.createBuffer(1, Math.round(sr * (banjo ? 1.3 : 3.2)), sr);
    const d = buf.getChannelData(0);
    if (banjo) {
      // Plucked hard near the bridge: raw noise with a fifth of the string's length combed out of it.
      const comb = Math.max(1, Math.round(n / 5));
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) raw[i] = rnd() * 2 - 1;
      for (let i = 0; i < n; i++) d[i] = 0.5 * (raw[i] - raw[(i + n - comb) % n]);
      // A skin head soaks the string up faster than a wooden top.
      for (let i = n; i < d.length; i++) d[i] = 0.4975 * (d[i - n] + d[i - n + 1]);
    } else {
      let prev = 0;
      for (let i = 0; i < n; i++) d[i] = prev = prev * 0.5 + (rnd() * 2 - 1) * 0.5;
      for (let i = n; i < d.length; i++) d[i] = 0.4992 * (d[i - n] + d[i - n + 1]);
    }
    this.strings.set(key, buf);
    return buf;
  }

  private pick(midi: number, t: number, vel: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.string(midi, false);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    src.connect(g).connect(this.townPick);
    src.start(t);
    src.stop(t + 1.7);
  }

  private townWhistle(midi: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(midi);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 5;
    vib.connect(vg).connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.12);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.townAir);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }

  /** A stretch of the shared noise from a spot picked by `r` (0..1), `dur` seconds long. */
  private breath(t: number, dur: number, r: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, r * (this.noise.duration - dur - 0.01), dur);
    return src;
  }

  /** An oscillator that plays from `t` to `end`. */
  private osc(type: OscillatorType, freq: number, t: number, end: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(end);
    return o;
  }

  /** One note of a band part at `t`; `r` (0..1) is the note's own dice, the same on every machine. */
  private voice(id: InstrumentId, n: BandNote, t: number, r: number): void {
    const ctx = this.ctx;
    const dest = this.ins[id];
    const dur = n.len * EIGHTH;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.connect(dest);
    switch (id) {
      case 'banjo': {
        // A bright pluck that is gone in half a second, so the roll stays a run of separate notes.
        const src = ctx.createBufferSource();
        src.buffer = this.string(n.midi, true);
        // The string's loop is a whole number of samples and half a sample more (its averaging); the last few
        // cents come from the playback speed, so the banjo is in tune with the whistle and the reeds.
        src.playbackRate.value = (hz(n.midi) * (Math.round(ctx.sampleRate / hz(n.midi)) + 0.5)) / ctx.sampleRate;
        g.gain.linearRampToValueAtTime(n.vel, t + 0.002);
        g.gain.setTargetAtTime(0, t + 0.002, 0.2);
        src.connect(g);
        src.start(t);
        src.stop(t + 1.2);
        break;
      }
      case 'drum': {
        // A hand on a skin: a short falling note with a soft pat of noise, no click and no hard kick.
        const thump = n.hit === 'thump';
        const end = t + (thump ? 0.5 : 0.25);
        const o = this.osc('sine', thump ? 150 : 250, t, end);
        o.frequency.setValueAtTime(thump ? 150 : 250, t);
        o.frequency.exponentialRampToValueAtTime(thump ? 96 : 205, t + (thump ? 0.09 : 0.05));
        g.gain.linearRampToValueAtTime(n.vel * (thump ? 1 : 0.55), t + 0.005);
        g.gain.setTargetAtTime(0, t + 0.005, thump ? 0.075 : 0.035);
        o.connect(g);
        const pat = ctx.createGain();
        pat.gain.setValueAtTime(0, t);
        pat.gain.linearRampToValueAtTime(n.vel * (thump ? 0.5 : 0.55), t + 0.004);
        pat.gain.setTargetAtTime(0, t + 0.004, thump ? 0.02 : 0.016);
        this.breath(t, 0.2, r).connect(this.filter('bandpass', thump ? 420 : 1100, 0.8)).connect(pat).connect(dest);
        break;
      }
      case 'squeezebox': {
        // A reed, a quieter one a few cents sharp of it (so they shimmer, not wobble) and a hollow one, on a bellows
        // swell, with a slow tremble.
        const end = t + dur + 0.4;
        const f = hz(n.midi);
        for (const [type, cents, level] of [['sawtooth', 0, 0.55], ['sawtooth', 8, 0.25], ['square', 0, 0.16]] as const) {
          const lv = ctx.createGain();
          lv.gain.value = level;
          this.osc(type, f, t, end, cents).connect(lv).connect(g);
        }
        g.gain.linearRampToValueAtTime(0.7 * n.vel, t + 0.09);
        g.gain.linearRampToValueAtTime(n.vel, t + dur * 0.45);
        g.gain.linearRampToValueAtTime(0.8 * n.vel, t + dur);
        g.gain.setTargetAtTime(0, t + dur, 0.055);
        // The tremble rides on the note (it multiplies it), so it dies with the note.
        g.disconnect();
        const trem = ctx.createGain();
        const depth = ctx.createGain();
        depth.gain.value = 0.06;
        this.osc('sine', 5.3, t, end).connect(depth).connect(trem.gain);
        g.connect(trem).connect(dest);
        break;
      }
      case 'whistle': {
        // A breathy tin whistle: a pure note that scoops up into pitch, a vibrato that comes in late, air round it.
        const end = t + dur + 0.25;
        const f = hz(n.midi);
        const o = this.osc('sine', f, t, end);
        const o2 = this.osc('sine', f * 2, t, end);
        const h2 = ctx.createGain();
        h2.gain.value = 0.1;
        const vg = ctx.createGain();
        vg.gain.setValueAtTime(0, t);
        vg.gain.linearRampToValueAtTime(0, t + 0.12);
        vg.gain.linearRampToValueAtTime(9, t + 0.4);
        const vib = this.osc('sine', 5.2, t, end);
        vib.connect(vg);
        for (const x of [o, o2]) {
          vg.connect(x.detune);
          x.detune.setValueAtTime(-45, t);
          x.detune.linearRampToValueAtTime(0, t + 0.055);
        }
        o.connect(g);
        o2.connect(h2).connect(g);
        g.gain.linearRampToValueAtTime(n.vel, t + 0.045);
        // Each note is tongued and then eases off, so a held note tapers instead of sitting flat.
        g.gain.setTargetAtTime(0.7 * n.vel, t + 0.045, 0.22);
        g.gain.setTargetAtTime(0, t + dur - 0.03, 0.04);
        // The air: a chiff as the note speaks, then a hiss under it.
        const air = ctx.createGain();
        air.gain.setValueAtTime(0, t);
        air.gain.linearRampToValueAtTime(0.5 * n.vel, t + 0.012);
        air.gain.setTargetAtTime(0.12 * n.vel, t + 0.012, 0.03);
        air.gain.setTargetAtTime(0, t + dur - 0.03, 0.04);
        this.breath(t, Math.min(1.9, dur + 0.25), r).connect(this.filter('bandpass', f * 2.5, 1.6)).connect(air).connect(dest);
        break;
      }
      case 'washboard': {
        // A thimble dragged over the ridges: a short hiss chopped by the ridges going by, longer on the beats.
        const accent = n.vel > 0.7;
        const len = accent ? 0.3 : 0.2;
        g.gain.linearRampToValueAtTime(n.vel, t + 0.003);
        g.gain.setTargetAtTime(0, t + 0.003, accent ? 0.05 : 0.03);
        const ridges = ctx.createGain();
        ridges.gain.value = 0.55;
        const depth = ctx.createGain();
        depth.gain.value = 0.45;
        this.osc('triangle', 78 + 30 * r, t, t + len).connect(depth).connect(ridges.gain);
        this.breath(t, len, r).connect(ridges).connect(g);
        break;
      }
      case 'jug': {
        // Blown across the mouth of a jug: a round low note that scoops up into pitch, with a puff of air to start it.
        const end = t + dur + 0.35;
        const f = hz(n.midi);
        for (const [type, mult, level] of [['sine', 1, 1], ['triangle', 1, 0.3], ['sine', 2, 0.75], ['sine', 3, 0.3]] as const) {
          const o = this.osc(type, f * mult, t, end);
          o.detune.setValueAtTime(-350, t);
          o.detune.linearRampToValueAtTime(0, t + 0.075);
          // The note sags a little as the breath runs out.
          o.detune.linearRampToValueAtTime(-25, t + dur);
          const lv = ctx.createGain();
          lv.gain.value = level;
          o.connect(lv).connect(g);
        }
        g.gain.linearRampToValueAtTime(n.vel, t + 0.04);
        g.gain.linearRampToValueAtTime(0.7 * n.vel, t + dur);
        g.gain.setTargetAtTime(0, t + dur, 0.05);
        const puff = ctx.createGain();
        puff.gain.setValueAtTime(0, t);
        puff.gain.linearRampToValueAtTime(0.5 * n.vel, t + 0.01);
        puff.gain.setTargetAtTime(0, t + 0.01, 0.03);
        this.breath(t, 0.25, r).connect(this.filter('bandpass', 380, 1.2)).connect(puff).connect(dest);
        break;
      }
    }
  }
}
