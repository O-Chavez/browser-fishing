import type { Rarity } from '../data/content';
import { gloomAt, stormAt } from '../data/sea';

/** Background music level; kept low so it sits under the lake ambience. */
const MUSIC_VOL = 0.17;
/** How much the music drops under the deepest storms at sea, so the wind and thunder carry the scene. */
const SEA_MUSIC_DUCK = 0.6;
/** The bow has to drop at least this fast (m/s) to thud into a wave. */
const SLAM = 0.25;

/** At sea, what the boat is doing this frame. */
export interface SeaSound {
  /** The sea's mood (0 at the Shelf, 1 at the Drop-off's end, 2+ in the Abyss). */
  mood: number;
  /** How fast the bow is dropping into the water (m/s). */
  slam: number;
  /** The boat's heave against the long swell's height: -1 in a trough, 1 on a crest. */
  rise: number;
}

/** A looping filtered noise whose level and filter are set each frame. */
interface Bed {
  f: BiquadFilterNode;
  g: GainNode;
}

/** All sounds are synthesised with Web Audio so the game ships no audio assets. */
class AudioFX {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private creakGain?: GainNode;
  private creakOsc?: OscillatorNode;
  private lake?: GainNode;
  private duck?: GainNode;
  private sea?: { wash: Bed; hiss: Bed; wind: Bed; howl: Bed; gust: number; gustTo: number; lap: number; creak: number; cool: number; on: boolean };

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    // A safety limiter: only the loudest moments (thunder over a storm at sea) reach it.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.003;
    limit.release.value = 0.25;
    this.master.connect(limit).connect(ctx.destination);

    const len = ctx.sampleRate * 3;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.ambience();
    this.startMusic();
    this.setupCreak();
  }

  private musicGain?: GainNode;
  private musicOn = localStorage.getItem('fishing-music') !== 'off';

  get music(): boolean {
    return this.musicOn;
  }

  /** Toggles the background music and remembers the choice. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    localStorage.setItem('fishing-music', this.musicOn ? 'on' : 'off');
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.musicOn ? MUSIC_VOL : 0, this.ctx.currentTime, 0.4);
    return this.musicOn;
  }

  private strings = new Map<number, AudioBuffer>();

  /** Karplus-Strong plucked string, rendered once per pitch. */
  private string(midi: number): AudioBuffer {
    let buf = this.strings.get(midi);
    if (buf) return buf;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const n = Math.round(sr / (440 * Math.pow(2, (midi - 69) / 12)));
    buf = ctx.createBuffer(1, Math.round(sr * 3.2), sr);
    const d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < n; i++) d[i] = prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5;
    for (let i = n; i < d.length; i++) d[i] = 0.4992 * (d[i - n] + d[i - n + 1]);
    this.strings.set(midi, buf);
    return buf;
  }

  /** Slow fingerpicked acoustic guitar with a soft whistle and a faint campfire, all synthesised (no audio files, no licensing). */
  private startMusic(): void {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = this.musicOn ? MUSIC_VOL : 0;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 300;
    body.gain.value = 5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4800;
    const room = ctx.createDelay(0.5);
    room.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    room.connect(fb).connect(room);
    room.connect(wet).connect(out);
    body.connect(tone).connect(out);
    body.connect(room);
    this.duck = ctx.createGain();
    out.connect(this.duck).connect(this.master!);
    this.musicGain = out;

    const pick = (midi: number, t: number, vel: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.string(midi);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      src.connect(g).connect(body);
      src.start(t);
    };
    const whistle = (midi: number, t: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.value = 5;
      vib.connect(vg).connect(o.detune);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.12);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(out);
      g.connect(room);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.1);
      vib.stop(t + dur + 0.1);
    };

    // Timber Hearth-style: a lilting 6/8 roll over open, major-leaning chords
    const chords = [
      { bass: 38, up: [57, 62, 66, 69] }, // D
      { bass: 43, up: [55, 62, 67, 71] }, // G
      { bass: 45, up: [57, 61, 64, 69] }, // A
      { bass: 38, up: [57, 62, 66, 69] }, // D
      { bass: 47, up: [54, 62, 66, 71] }, // Bm
      { bass: 43, up: [55, 62, 67, 71] }, // G
      { bass: 38, up: [57, 62, 66, 69] }, // D
      { bass: 45, up: [57, 61, 64, 69] }, // A
    ];
    const pattern = [-1, 1, 2, 0, 3, 2];
    // D major pentatonic, kept in a gentle whistle range
    const motifs = [
      [81, 83, 85, 83],
      [78, 81, 83, 81],
      [85, 83, 81, 78],
      [83, 81, 83, 85],
    ];
    const EIGHTH = 0.36;
    const BAR = EIGHTH * 6;

    // Warm, barely-there drone for a sense of wide open sky
    for (const [m, v] of [[38, 0.02], [45, 0.014], [50, 0.01]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      const g = ctx.createGain();
      g.gain.value = v;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + m * 0.001;
      const lg = ctx.createGain();
      lg.gain.value = v * 0.6;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(out);
      o.start();
      lfo.start();
    }

    let next = ctx.currentTime + 0.4;
    let bar = 0;
    const schedule = () => {
      // A throttled background tab can leave `next` in the past; don't play the missed bars all at once.
      next = Math.max(next, ctx.currentTime + 0.1);
      while (next < ctx.currentTime + 6) {
        const c = chords[bar % chords.length];
        pattern.forEach((k, i) => {
          const t = next + i * EIGHTH + (Math.random() - 0.5) * 0.015;
          pick(k < 0 ? c.bass : c.up[k], t, k < 0 ? 0.3 : 0.14 + Math.random() * 0.06);
        });
        if (bar % 4 === 2 && Math.random() < 0.8) {
          const motif = motifs[Math.floor(Math.random() * motifs.length)];
          motif.forEach((m, i) => whistle(m - 12, next + i * EIGHTH * 2, EIGHTH * 3.2));
        }
        next += BAR;
        bar++;
      }
    };
    schedule();
    setInterval(schedule, 2000);

    const crackle = () => {
      if (this.ctx && this.noiseBuf) {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800 + Math.random() * 3000;
        f.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.012 + Math.random() * 0.02, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
        src.connect(f).connect(g).connect(out);
        src.start(t, Math.random() * 2, 0.1);
      }
      setTimeout(crackle, 150 + Math.random() * 900);
    };
    crackle();
  }

  private loopNoise(type: BiquadFilterType, freq: number, q: number, gain: number, lfoRate: number, lfoDepth: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = ctx.createGain();
    lg.gain.value = lfoDepth;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
  }

  private ambience(): void {
    this.lake = this.ctx!.createGain();
    this.lake.connect(this.master!);
    this.loopNoise('lowpass', 420, 0.7, 0.06, 0.13, 0.03, this.lake);
    this.loopNoise('bandpass', 1100, 0.6, 0.02, 0.35, 0.012, this.lake);
    const chirp = () => {
      // No songbirds out at sea.
      if (this.ctx && !this.sea?.on) {
        const t = this.ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(2200 + Math.random() * 1500, 3200 + Math.random() * 1200, 0.09, 0.025, t + i * 0.13);
      }
      setTimeout(chirp, 5000 + Math.random() * 9000);
    };
    setTimeout(chirp, 3000);
  }

  private setupCreak(): void {
    const ctx = this.ctx!;
    this.creakOsc = ctx.createOscillator();
    this.creakOsc.type = 'sawtooth';
    this.creakOsc.frequency.value = 120;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 5;
    this.creakGain = ctx.createGain();
    this.creakGain.gain.value = 0;
    this.creakOsc.connect(f).connect(this.creakGain).connect(this.master!);
    this.creakOsc.start();
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, q = 1, at = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, when?: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whoosh(): void {
    this.noise(0.4, 'bandpass', 400, 2200, 0.35, 1.5);
  }

  splash(power = 1): void {
    this.noise(0.6, 'lowpass', 3000, 500, 0.5 * power);
    this.noise(0.25, 'highpass', 2500, 5000, 0.12 * power);
  }

  plunk(): void {
    this.tone(260, 90, 0.18, 0.4);
  }

  bite(): void {
    this.plunk();
    this.splash(0.6);
    this.tone(880, 660, 0.12, 0.12, undefined, 'triangle');
  }

  tick(gain = 0.08): void {
    this.noise(0.03, 'highpass', 3500, 5000, gain);
  }

  /**
   * A wheel's peg (or a roulette pocket) clacking past the pointer: a short knock with a little ring.
   * `pitch` scales it (lower is woodier), and `at` delays it in seconds so a frame's ticks spread out.
   */
  peg(gain = 0.14, pitch = 1, at = 0): void {
    if (!this.ctx) return;
    this.noise(0.025, 'bandpass', 2600 * pitch, 1600 * pitch, gain, 3, at);
    this.tone(1300 * pitch, 800 * pitch, 0.035, gain * 0.5, this.ctx.currentTime + at, 'triangle');
  }

  /** A card slid off the shoe, or turned over (`flip`, a little lower and shorter). */
  card(flip = false): void {
    this.noise(flip ? 0.06 : 0.09, 'bandpass', flip ? 2200 : 3200, flip ? 1200 : 1500, 0.1, 0.9);
  }

  snap(): void {
    this.noise(0.15, 'highpass', 2000, 6000, 0.5);
    this.tone(500, 120, 0.2, 0.2, undefined, 'sawtooth');
  }

  setCreak(tension: number): void {
    if (!this.ctx || !this.creakGain || !this.creakOsc) return;
    const t = this.ctx.currentTime;
    this.creakGain.gain.setTargetAtTime(Math.pow(Math.max(0, tension - 0.3), 2) * 0.12, t, 0.06);
    this.creakOsc.frequency.setTargetAtTime(110 + tension * 220, t, 0.08);
  }

  /** A looping noise bed through one filter, silent until `seaSound` sets it. */
  private bed(type: BiquadFilterType, freq: number, q: number): Bed {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master!);
    // Different start points so the beds don't share the same noise.
    src.start(0, Math.random() * 3);
    return { f, g };
  }

  /**
   * The sea's sound, each frame while at sea (null off it): waves washing past, louder in the troughs;
   * wind that rises to a howl in the deep; water lapping at the hull in calm seas; thuds when the bow
   * drops into a wave; the hull creaking in heavy seas. The lake's wind and birds fade out, and the
   * music ducks under the deep storms.
   */
  seaSound(dt: number, s: SeaSound | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.lake) return;
    const t = ctx.currentTime;
    if (!s) {
      if (this.sea?.on) {
        this.sea.on = false;
        for (const b of [this.sea.wash, this.sea.hiss, this.sea.wind, this.sea.howl]) b.g.gain.setTargetAtTime(0, t, 0.5);
        this.lake.gain.setTargetAtTime(1, t, 0.8);
        this.duck!.gain.setTargetAtTime(1, t, 0.8);
      }
      return;
    }
    this.sea ??= {
      wash: this.bed('lowpass', 300, 0.7),
      hiss: this.bed('bandpass', 1600, 0.6),
      wind: this.bed('bandpass', 450, 1.5),
      howl: this.bed('bandpass', 1000, 9),
      gust: 0,
      gustTo: 0,
      lap: 1,
      creak: 3,
      cool: 0,
      on: false,
    };
    const sea = this.sea;
    if (!sea.on) {
      sea.on = true;
      this.lake.gain.setTargetAtTime(0, t, 0.8);
    }
    const m = Math.min(1, s.mood);
    const storm = stormAt(s.mood);
    // Gusts: the wind wanders toward a new strength every few seconds.
    if (Math.random() < dt * 0.4) sea.gustTo = Math.random() * 2 - 1;
    sea.gust += (sea.gustTo - sea.gust) * Math.min(1, dt * 0.8);
    const gust = 1 + 0.35 * sea.gust;
    // The water around the boat: a low roar that swells as the boat drops into a trough, with the hiss of whitecaps over it.
    const trough = 1 + 0.5 * -s.rise * (0.3 + 0.7 * m);
    sea.wash.f.frequency.setTargetAtTime(260 + 260 * m + 120 * storm, t, 0.3);
    sea.wash.g.gain.setTargetAtTime((0.05 + 0.12 * m + 0.1 * storm) * trough, t, 0.25);
    sea.hiss.g.gain.setTargetAtTime((0.004 + 0.02 * m + 0.035 * storm) * trough, t, 0.25);
    // The wind: a soft breeze near shore, a gale by the Abyss, whistling in the rigging.
    sea.wind.f.frequency.setTargetAtTime((380 + 120 * m + 450 * storm) * (1 + 0.12 * sea.gust), t, 0.4);
    sea.wind.f.Q.value = 1.2 + 3 * storm;
    sea.wind.g.gain.setTargetAtTime((0.012 + 0.025 * m + 0.11 * storm) * gust, t, 0.4);
    sea.howl.f.frequency.setTargetAtTime(850 + 500 * storm + 180 * sea.gust, t, 0.5);
    sea.howl.g.gain.setTargetAtTime(0.06 * storm * storm * Math.max(0, gust - 0.85), t, 0.4);
    this.duck!.gain.setTargetAtTime(1 - SEA_MUSIC_DUCK * gloomAt(s.mood), t, 0.8);

    // Small waves slapping the hull, mostly heard when the sea is calm.
    sea.lap -= dt;
    if (sea.lap <= 0) {
      sea.lap = 0.5 + Math.random() * 1.6;
      const k = 0.4 + Math.random() * 0.6;
      this.noise(0.18 + Math.random() * 0.2, 'lowpass', 900 + Math.random() * 500, 250, 0.06 * k * (1 - 0.6 * m), 1.2, Math.random() * 0.1);
    }
    // The bow thuds into a wave and throws water.
    sea.cool -= dt;
    if (s.slam > SLAM && sea.cool <= 0) {
      sea.cool = 1;
      this.slam(Math.min(1, (s.slam - SLAM) / 0.6) * (0.35 + 0.65 * m) + 0.3 * storm);
    }
    // The hull working in a heavy sea.
    sea.creak -= dt * (0.1 + 0.9 * storm + 0.3 * m);
    if (sea.creak <= 0) {
      sea.creak = 0.6 + Math.random() * 2;
      if (m > 0.4) this.hullCreak(0.4 + 0.6 * storm);
    }
  }

  /** The bow dropping into a wave, `k` 0..1: a deep thud and a sheet of water over the rail. */
  private slam(k: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.tone(95, 38, 0.35, 0.35 * k, t);
    this.noise(0.5, 'lowpass', 600, 120, 0.4 * k, 0.8);
    this.noise(0.9 + 0.5 * k, 'bandpass', 2400, 900, 0.14 * k, 0.7, 0.08);
  }

  /** A slow wooden groan from the hull: a buzzy tone through a narrow band, sliding in pitch. */
  private hullCreak(k: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 0.35 + Math.random() * 0.5;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 55 + Math.random() * 40;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.8 + Math.random() * 0.5), t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 500;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * k, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /**
   * Thunder for a strike `dist` metres away, right with the flash: a sharp crack for the near ones,
   * then a long rolling rumble (longer and softer-edged for the far ones).
   */
  thunder(dist: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sea?.on) return;
    const near = Math.max(0, Math.min(1, 1 - (dist - 90) / 110));
    const t = ctx.currentTime;
    const dur = 4 + 2.5 * (1 - near) + Math.random() * 1.5;
    const layer = (type: BiquadFilterType, f0: number, f1: number, peak: number, at: number, len: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf!;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(f0, at);
      f.frequency.exponentialRampToValueAtTime(f1, at + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.06 + 0.15 * (1 - near));
      // The roll: a few swells and dips as the sound comes back off different parts of the bolt.
      for (let i = 1; i <= 4; i++) g.gain.linearRampToValueAtTime(peak * (0.25 + 0.6 * Math.random()) * (1 - i / 6), at + len * (i / 5));
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      src.connect(f).connect(g).connect(this.master!);
      src.start(at, Math.random() * 3);
      src.stop(at + len + 0.1);
    };
    if (near > 0.3) layer('highpass', 1800, 500, 0.35 * near, t, 0.4);
    layer('lowpass', 320 + 300 * near, 90, 0.9 + 0.5 * near, t, dur);
    // The body of the roll, in the range small speakers can still play.
    layer('bandpass', 420, 150, 0.45 + 0.25 * near, t + 0.03, dur * 0.85);
    layer('lowpass', 90, 45, 1.2, t + 0.05, dur * 0.8);
  }

  jingle(rarity: Rarity): void {
    if (!this.ctx) return;
    const count = { common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 6 }[rarity];
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) this.tone(notes[i], notes[i], 0.5, 0.14, t + i * 0.09, 'triangle');
  }
}

export const audio = new AudioFX();
