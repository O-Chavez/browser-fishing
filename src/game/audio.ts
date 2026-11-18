import type { Rarity } from '../data/content';
import { gloomAt, stormAt } from '../data/sea';
import { bandMix } from '../data/band';
import { Music } from './bandsound';
import { chimeNow, gullCryWait, gullsAbout, rainLevel } from './seamix';

/** Background music level; kept low so it sits under the lake ambience. */
const MUSIC_VOL = 0.17;
/** The tune's bars are scheduled this far ahead (s): the least, with a pass every frame, and the most, in a throttled background tab. */
const AHEAD_MIN = 0.5;
const AHEAD_MAX = 4;
/** Overall output level, before the safety limiter. */
const MASTER_VOL = 0.7;
/** How much the music drops under the deepest storms at sea, so the wind and thunder carry the scene. */
const SEA_MUSIC_DUCK = 0.6;
/**
 * How loud the sea is at the height of the storm, against the mix it was built with: the water, wind, rain and
 * thunder fade toward this as the storm builds, so the Shelf is unchanged and the Abyss is 30% quieter (Mighty's
 * play test, 2026-11-15). A play-test default.
 */
const STORM_VOL = 0.7;
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
  /** How dark it is (0..1): the gulls roost after dark. */
  night: number;
  /** Whether a marker's buoy has come alongside. */
  buoy: boolean;
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
  private sea?: { wash: Bed; hiss: Bed; wind: Bed; howl: Bed; rain: Bed; patter: Bed; gull: number; buoy: boolean; gust: number; gustTo: number; lap: number; creak: number; cool: number; on: boolean };

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.soundOn ? MASTER_VOL : 0;
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

  private soundOn = localStorage.getItem('fishing-sound') !== 'off';

  get sound(): boolean {
    return this.soundOn;
  }

  /** Mutes or unmutes every sound in the game (music included) and remembers the choice. */
  toggleSound(): boolean {
    this.soundOn = !this.soundOn;
    localStorage.setItem('fishing-sound', this.soundOn ? 'on' : 'off');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.soundOn ? MASTER_VOL : 0, this.ctx.currentTime, 0.1);
    return this.soundOn;
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

  private tune?: Music;
  /** The campfire band as the game last gave it (`band`): who plays, how far the fire is, and the shared clock against this device's. */
  private bandMask = 0;
  private fireDist = Infinity;
  private clockSkew = 0;
  /** How far ahead bars are scheduled (s), when the last pass ran (`performance.now()`), and the mix last set. */
  private ahead = AHEAD_MIN;
  private passedAt = 0;
  private mixSet = { band: -1, town: -1 };

  /**
   * Slow fingerpicked acoustic guitar with a soft whistle and a faint campfire, all synthesised (no audio files, no
   * licensing), and with it the campfire band's parts (`Music`, bandsound.ts). Both keep time by the shared clock.
   */
  private startMusic(): void {
    const ctx = this.ctx!;
    const tune = (this.tune = new Music(ctx));
    const out = tune.out;
    out.gain.value = this.musicOn ? MUSIC_VOL : 0;
    this.duck = ctx.createGain();
    out.connect(this.duck).connect(this.master!);
    this.musicGain = out;
    tune.startDrone();
    this.musicPass();
    // The game calls `band` every frame; this keeps the tune going in a background tab, where frames stop.
    setInterval(() => this.musicPass(), 1000);

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

  /**
   * The campfire band, each frame: `mask` says which of the six parts have a player seated at their log (bit i is
   * `INSTRUMENTS[i]`; 0 away from the town), `dist` is how far the listener stands from the fire (m), and `nowMs`
   * is the shared clock (`net.now()`), which sets the bar and the chord for the town's tune and the band alike.
   */
  band(mask: number, dist: number, nowMs: number): void {
    this.bandMask = mask;
    this.fireDist = dist;
    this.clockSkew = nowMs - Date.now();
    this.musicPass();
  }

  /** Schedules the bars about to start and sets the band's mix for where the listener stands. */
  private musicPass(): void {
    const tune = this.tune;
    if (!tune || this.ctx?.state !== 'running') return;
    // Bars are scheduled only just before they start, so a player who sits down is heard from the next bar. In a
    // background tab the passes come a second or more apart, so look further ahead by as much.
    const at = performance.now();
    const gap = this.passedAt ? (at - this.passedAt) / 1000 : 0;
    this.passedAt = at;
    this.ahead = Math.min(AHEAD_MAX, Math.max(AHEAD_MIN, gap * 2.5 + 0.2, this.ahead - 0.01));
    tune.pass(Date.now() + this.clockSkew, this.bandMask, this.ahead);
    const mix = bandMix(this.fireDist, (this.bandMask | tune.sounding) !== 0);
    if (Math.abs(mix.band - this.mixSet.band) > 0.002 || Math.abs(mix.town - this.mixSet.town) > 0.002) {
      this.mixSet = mix;
      tune.mix(mix.band, mix.town);
    }
  }

  private meter?: AnalyserNode;
  /** For the test hook: how loud the music is right now, after its own volume and switch (the RMS of its last two thirds of a second), or -1 before the sound has started. */
  musicLevel(): number {
    if (!this.ctx || !this.tune) return -1;
    if (!this.meter) {
      this.meter = this.ctx.createAnalyser();
      this.meter.fftSize = 32768;
      this.tune.out.connect(this.meter);
    }
    const d = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(d);
    return Math.sqrt(d.reduce((sum, v) => sum + v * v, 0) / d.length);
  }

  /** For the test hook: who the band was last told plays, the parts sounding, the last bar scheduled, the two mix levels, and the music switch. */
  bandState(): { mask: number; sounding: number; bar: number | null; band: number; town: number; music: boolean } {
    return { mask: this.bandMask, sounding: this.tune?.sounding ?? 0, bar: this.tune?.bar ?? null, ...bandMix(this.fireDist, (this.bandMask | (this.tune?.sounding ?? 0)) !== 0), music: this.musicOn };
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

  /** A skipping stone touching the water: a small bright blip, higher with `pitch`; `gain` 0 to 1 by how far off it is. */
  plip(gain = 1, pitch = 1): void {
    this.tone(1150 * pitch, 620 * pitch, 0.07, 0.16 * gain);
    this.noise(0.05, 'highpass', 3200, 5200, 0.07 * gain);
  }

  /** A skipping stone going under: a low plunk with a little splash. */
  plop(gain = 1): void {
    this.tone(300, 95, 0.2, 0.34 * gain);
    this.noise(0.3, 'lowpass', 2400, 500, 0.2 * gain);
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
        this.sea.buoy = false;
        for (const b of [this.sea.wash, this.sea.hiss, this.sea.wind, this.sea.howl, this.sea.rain, this.sea.patter]) b.g.gain.setTargetAtTime(0, t, 0.5);
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
      // Rain on the deck: a soft hiss over a lower patter.
      rain: this.bed('bandpass', 3400, 0.4),
      patter: this.bed('bandpass', 1100, 0.7),
      gull: 4 + Math.random() * 6,
      buoy: false,
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
    // The storm's whole mix comes down a little as it builds (STORM_VOL).
    const loud = 1 - (1 - STORM_VOL) * storm;
    sea.wash.f.frequency.setTargetAtTime(260 + 260 * m + 120 * storm, t, 0.3);
    sea.wash.g.gain.setTargetAtTime((0.05 + 0.12 * m + 0.1 * storm) * trough * loud, t, 0.25);
    sea.hiss.g.gain.setTargetAtTime((0.004 + 0.02 * m + 0.035 * storm) * trough * loud, t, 0.25);
    // The wind: a soft breeze near shore, a gale by the Abyss, whistling in the rigging.
    sea.wind.f.frequency.setTargetAtTime((380 + 120 * m + 450 * storm) * (1 + 0.12 * sea.gust), t, 0.4);
    sea.wind.f.Q.value = 1.2 + 3 * storm;
    sea.wind.g.gain.setTargetAtTime((0.012 + 0.025 * m + 0.11 * storm) * gust * loud, t, 0.4);
    sea.howl.f.frequency.setTargetAtTime(850 + 500 * storm + 180 * sea.gust, t, 0.5);
    sea.howl.g.gain.setTargetAtTime(0.06 * storm * storm * Math.max(0, gust - 0.85) * loud, t, 0.4);
    // Rain on the deck from Kelp Deep on, fading with the rain you see. Soft, under the wind.
    const rain = rainLevel(s.mood);
    sea.rain.g.gain.setTargetAtTime(0.05 * rain * loud, t, 0.8);
    sea.patter.g.gain.setTargetAtTime(0.03 * rain * loud, t, 0.8);
    this.duck!.gain.setTargetAtTime(1 - SEA_MUSIC_DUCK * gloomAt(s.mood), t, 0.8);

    // Gulls crying now and then while some are about on the Shelf.
    const about = gullsAbout(s.mood, s.night);
    sea.gull -= dt;
    if (sea.gull <= 0) {
      sea.gull = gullCryWait(about, Math.random());
      if (about > 0) this.gullCry(0.6 + 0.4 * (about / 7));
    }
    // The marker buoy's bell as it comes alongside.
    if (chimeNow(sea.buoy, s.buoy)) this.buoyBell();
    sea.buoy = s.buoy;

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

  /** A gull's cry far off: two or three thin falling whistles, panned to a random side and softened by distance. */
  private gullCry(k: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.connect(pan).connect(this.master!);
    const base = 1500 + Math.random() * 300;
    const calls = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < calls; i++) {
      const t = t0 + i * 0.3;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(base * 1.25, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.24);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.018 * k, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + 0.3);
    }
  }

  /** The buoy's bell: a soft two-note chime with a little inharmonic shimmer, ringing out over a few seconds. */
  private buoyBell(): void {
    const t = this.ctx!.currentTime;
    for (const [at, f, k] of [[0, 659, 1], [0.7, 523, 0.7]]) {
      this.tone(f, f, 2.4, 0.035 * k, t + at);
      this.tone(f * 2.76, f * 2.76, 1.1, 0.01 * k, t + at);
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
    const layer = (type: BiquadFilterType, f0: number, f1: number, full: number, at: number, len: number) => {
      // Thunder only rolls in the storm, so it takes the storm's level (STORM_VOL) whole.
      const peak = full * STORM_VOL;
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
