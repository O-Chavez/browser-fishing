import type { Rarity } from '../data/content';
import { gloomAt, stormAt } from '../data/sea';
import { bandMix } from '../data/band';
import { Music } from './bandsound';
import { chimeNow, gullCryWait, gullsAbout, rainLevel } from './seamix';
import { ShowBus, playShowSound, type Ear } from './rocketsound';
import type { ShowSound } from '../data/rockets';
import { GiantFight, playVoice, type Voice } from './giantsound';

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
/** How far the wind and the rain drop for a quiet moment at sea (`hush`), as a share of their level. */
const HUSH = 0.18;
/** An Abyss legend with a landing sound of its own (`giant`). */
export type Giant = 'leviathan' | 'kraken' | 'dreamer';

/**
 * A giant's fight as the sound follows it (`giantFight`, every frame of the fight). The game works these out from the
 * reel and the fight's acts (`src/game/legendfight.ts`); nothing here changes the fight.
 */
export interface GiantFightState {
  /** The fight's act: 1 far out (wake and voice only), 2 mid-fight (it shows itself), 3 close in beside the hull. */
  act: 1 | 2 | 3;
  /** How far it has been brought in, 0 (just hooked, far out) to 1 (at the hull). */
  near: number;
  /** Fight left, 1 (fresh) to 0 (spent). */
  fight: number;
  /** The surge under way: its build-up, 0 in the calm to 1 at its height. */
  surge: number;
  /** A surge is about to start (the gauge's SURGE! warning). */
  warning: boolean;
  /** The line's load, 0 slack to 1 at breaking. */
  tension: number;
  /** After its last stand: it has nothing left and is only being brought in (the music drops away). */
  spent: boolean;
}

/** A giant's voice in the fight (`giantCall`): at a surge, with one of its moves, or its last stand (its biggest). */
export interface GiantCall {
  kind: 'surge' | 'move' | 'last';
  /** As in `GiantFightState`: far out it is muffled and distant, close in clear and loud. */
  near: number;
  /** As in `GiantFightState`: a tiring giant sounds more strained. */
  fight: number;
}

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
export class AudioFX {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private creakGain?: GainNode;
  private creakOsc?: OscillatorNode;
  private lake?: GainNode;
  private duck?: GainNode;
  /** The lake's tune goes through this after `duck`: a giant's fight music lowers it and gives it back (`GiantFight`). */
  private under?: GainNode;
  /** A giant's fight (its voice and its music, giantsound.ts), and the gain its music plays through, which follows the music switch. */
  private fight?: GiantFight;
  private fightBus?: GainNode;
  private fightWarm = false;
  /** The wind and the rain at sea go through this, so a quiet moment can drop them together (`hush`). */
  private weather?: GainNode;
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
    if (this.fightBus && this.ctx) this.fightBus.gain.setTargetAtTime(this.musicOn ? 1 : 0, this.ctx.currentTime, 0.4);
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
    this.under = ctx.createGain();
    out.connect(this.duck).connect(this.under).connect(this.master!);
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

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, q = 1, at = 0, out: AudioNode = this.master!): void {
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
    // Silent until the burst starts: the source can start a sample ahead of the gain's first point, and that one
    // sample of noise at full level is a click.
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, when?: number, type: OscillatorType = 'sine', out: AudioNode = this.master!): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
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

  /** A looping noise bed through one filter, silent until `seaSound` sets it; `out`: where it plays (the master gain unless given). */
  private bed(type: BiquadFilterType, freq: number, q: number, out: AudioNode = this.master!): Bed {
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
    src.connect(f).connect(g).connect(out);
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
        // A fight that was never ended (the player left the sea mid-fight) ends here.
        this.giantFightEnd('lost');
      }
      return;
    }
    if (!this.weather) {
      this.weather = ctx.createGain();
      this.weather.connect(this.master!);
    }
    this.sea ??= {
      wash: this.bed('lowpass', 300, 0.7),
      hiss: this.bed('bandpass', 1600, 0.6),
      wind: this.bed('bandpass', 450, 1.5, this.weather),
      howl: this.bed('bandpass', 1000, 9, this.weather),
      // Rain on the deck: a soft hiss over a lower patter.
      rain: this.bed('bandpass', 3400, 0.4, this.weather),
      patter: this.bed('bandpass', 1100, 0.7, this.weather),
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
    // In the Abyss a giant may be hooked: its organ's waves and room are made now, not on the frame of the hook.
    if (s.mood >= 1.85 && !this.fightWarm) {
      this.fightWarm = true;
      this.fights()?.warm();
    }

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

  /** A slow wooden groan from the hull: a buzzy tone through a narrow band, sliding in pitch. `at`: seconds from now; `len`: how long it is (random unless given). */
  private hullCreak(k: number, at = 0, len?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + at;
    const dur = len ?? 0.35 + Math.random() * 0.5;
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

  /**
   * One of a firework show's sounds (`src/game/rocketsound.ts`), `wait` seconds from now, as heard from `ear`. It
   * goes through the show's own gain (`ShowBus`) into the master gain, so the sound switch silences it. Returns its gain after distance.
   */
  rocket(s: ShowSound, ear: Ear, wait: number): number {
    // Nothing is built into a muted master, or queued in a sleeping context to play in a clump when it wakes.
    if (!this.ctx || !this.soundOn || this.ctx.state !== 'running') return 0;
    this.showBus ??= new ShowBus(this.ctx, this.master!);
    return playShowSound(this.ctx, this.showBus.node, this.noiseBuf!, s, ear, wait);
  }

  private showBus?: ShowBus;
  /** Silences what is still sounding of a firework show: the player has left the map it is over. */
  rocketCut(): void {
    this.showBus?.cut();
  }

  /** The wind and the rain drop away for `secs` seconds and come back: a quiet moment at sea (the Dreamer waking). */
  hush(secs: number): void {
    if (!this.ctx || !this.weather) return;
    const t = this.ctx.currentTime;
    const g = this.weather.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(HUSH, t, 0.12);
    g.setTargetAtTime(1, t + secs, 0.5);
  }

  /** Under the bite of an Abyss legend: one low falling note, with a little of it an octave up for small speakers. */
  deepNote(): void {
    this.tone(62, 37, 1.7, 0.5);
    this.tone(124, 74, 1.1, 0.12, undefined, 'triangle');
  }

  /** A voice from something huge (`playVoice`, giantsound.ts), into the master gain unless it names somewhere else. */
  private voice(v: Voice): void {
    playVoice(this.ctx!, this.noiseBuf!, this.master!, v);
  }

  /** The giants' fight sound, built the first time it is asked for (not before the sound has started). */
  private fights(): GiantFight | undefined {
    if (!this.ctx || !this.master || !this.noiseBuf) return undefined;
    if (!this.fight) {
      this.fightBus = this.ctx.createGain();
      this.fightBus.gain.value = this.musicOn ? 1 : 0;
      this.fightBus.connect(this.master);
      this.fight = new GiantFight(this.ctx, this.noiseBuf, this.fightBus, this.master, this.under?.gain);
    }
    return this.fight;
  }

  /**
   * A giant is hooked: its fight music starts and the lake's tune gives way to it. The music is a pipe organ
   * (giantsound.ts), and the hook is its first chord, the full organ at once. Follows the music switch, also when it
   * is flipped mid-fight. Called while a fight is on, it starts over cleanly.
   */
  giantFightStart(id: Giant): void {
    this.fights()?.start(id);
  }

  /** Every frame of a giant's fight: the music follows the fight (more stops, figures and speed as it comes in and the acts go by, more again in each surge, one thin stop once it is spent). */
  giantFight(dt: number, s: GiantFightState): void {
    this.fight?.update(dt, s, this.musicOn && this.soundOn);
  }

  /**
   * The giant's voice, never twice the same. Each giant makes sound its own way (the Leviathan a reptile's rasping
   * throat, the Kraken long hollow tones from deep water, the Dreamer its music box, glass and spring), as a handful
   * of gestures, each time in another key, length, shape and level; duller and quieter far out, more strained as it
   * tires. `kind` 'last' is its last stand, the biggest thing in the fight, which the organ answers with a chord. It
   * goes to the master gain like other effects.
   */
  giantCall(id: Giant, c: GiantCall): void {
    // Nothing is built into a muted master.
    if (!this.soundOn) return;
    this.fights()?.call(id, c, this.musicOn);
  }

  /**
   * The fight is over: landed (the music drops to near silence within 0.3 s so the landing's own sound hits, `giant`)
   * or lost (it sags away over about 1.5 s). The lake's tune comes back. Safe when no fight is on.
   */
  giantFightEnd(how: 'landed' | 'lost'): void {
    this.fight?.end(how);
  }

  /**
   * An Abyss legend breaking the water beside the hull, each with a sound of its own in place of the legendary jingle:
   * - the Leviathan: a roar, heard over its bolt's thunder;
   * - the Kraken: a long wet groan out of a hollow body, bubbles running off it, the hull creaking as it leans on it;
   * - the Drowned Dreamer: a music box running down on a tune that goes wrong (the game drops the wind and the rain
   *   under it, `hush`).
   * Each is the take Oscar picked by ear (2026-11-20) of the two that were made.
   */
  giant(id: Giant): void {
    if (!this.ctx) return;
    if (id === 'leviathan') this.leviathan();
    else if (id === 'kraken') this.kraken();
    else this.dreamer();
  }

  /**
   * The Leviathan's roar: a living throat, not a rumble, so it reads over the thunder it lands with. Its pitch climbs
   * into the roar and falls away, its mouth opening and shutting round it, torn and shaken all the way.
   */
  private leviathan(): void {
    // A dragon's roar: a rattle low in the shut throat, then the mouth opens on a long torn "raaawr" that sags
    // back down into the chest.
    this.voice({
      dur: 0.7, gain: 0.14, level: [[0, 0], [0.1, 0.8], [0.5, 1], [0.7, 0]],
      pitch: [[0, 44], [0.5, 56], [0.7, 80]], waver: 50,
      mouth: [{ f: [[0, 230], [0.7, 330]], q: 3, gain: 1 }, { f: [[0, 640], [0.7, 820]], q: 4, gain: 0.7 }],
      rough: [[0, 17], [0.7, 30]], depth: 0.95, breath: 0.3, grit: 4,
    });
    this.voice({
      at: 0.55, dur: 2.6, gain: 0.22, level: [[0, 0], [0.12, 0.6], [0.45, 1], [1.1, 0.9], [1.9, 0.45], [2.6, 0]],
      pitch: [[0, 72], [0.45, 185], [0.9, 168], [1.6, 108], [2.6, 48]], stack: [1, 1.012, 0.5], waver: 50,
      mouth: [
        { f: [[0, 150], [2.6, 120]], q: 1.5, gain: 0.22 },
        { f: [[0, 280], [0.45, 700], [1.2, 560], [2.0, 360], [2.6, 280]], q: 4, gain: 1 },
        { f: [[0, 900], [0.45, 1200], [1.2, 1000], [2.0, 720], [2.6, 640]], q: 5, gain: 0.9 },
        { f: [[0, 1300], [0.45, 2200], [1.2, 2000], [2.0, 1400], [2.6, 1300]], q: 6, gain: 0.45 },
      ],
      rough: [[0, 34], [0.45, 57], [1.4, 44], [2.6, 24]], depth: 0.8, loose: 0.35, breath: 0.35, grit: 6,
    });
  }

  /**
   * The Kraken's groan: nothing like the Leviathan's roar. Long, low and slow, out of a hollow body with water in it:
   * a moan that bends rather than climbs, gurgling, with bubbles running off it and the hull creaking under its weight.
   */
  private kraken(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // The hollow of it: the wet sounds come back off its insides in a few echoes, each duller than the last.
    const cave = ctx.createGain();
    cave.connect(this.master!);
    for (const [wait, k, lp] of [[0.11, 0.5, 900], [0.24, 0.32, 600], [0.41, 0.2, 400]]) {
      const d = ctx.createDelay(1);
      d.delayTime.value = wait;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      const g = ctx.createGain();
      g.gain.value = k;
      cave.connect(d).connect(f).connect(g).connect(this.master!);
    }
    // A run of bubbles: short rising blips, a "glug-glug" of `n` of them.
    const glug = (at: number, n: number, k = 1) => {
      for (let i = 0; i < n; i++) {
        const f = 190 + Math.random() * 420;
        this.tone(f, f * (1.5 + Math.random() * 0.7), 0.06 + Math.random() * 0.05, 0.09 * k, t + at + i * (0.07 + Math.random() * 0.05), 'sine', cave);
      }
    };
    // A wet suck: a narrow band of noise sweeping up as it swells, cut off short, and the pop as it lets go.
    const suck = (at: number, dur: number, gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf!;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 5;
      f.frequency.setValueAtTime(260, t + at);
      f.frequency.exponentialRampToValueAtTime(1500, t + at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(gain, t + at + dur * 0.92);
      g.gain.linearRampToValueAtTime(0.0001, t + at + dur);
      src.connect(f).connect(g).connect(cave);
      src.start(t + at);
      src.stop(t + at + dur + 0.05);
      this.tone(280, 110, 0.08, gain * 0.5, t + at + dur, 'sine', cave);
    };
    // A moan out of a cave: one long breath that sags, bends up and sinks away, the mouth barely open, gurgling
    // unevenly; it ends on a suck and a pop.
    this.voice({
      dur: 3.6, gain: 0.3, level: [[0, 0], [0.7, 0.8], [1.7, 1], [2.6, 0.75], [3.6, 0]],
      pitch: [[0, 57], [0.9, 50], [1.8, 63], [2.6, 54], [3.6, 41]], stack: [1, 1.006, 2.004], waver: 25, waverHz: 5,
      mouth: [
        { f: [[0, 120], [3.6, 100]], q: 6, gain: 0.3 },
        { f: [[0, 210], [1.7, 300], [3.6, 220]], q: 10, gain: 1 },
        { f: [[0, 480], [1.7, 640], [3.6, 450]], q: 11, gain: 1.1 },
        { f: [[0, 1050], [1.7, 1250], [3.6, 950]], q: 12, gain: 0.6 },
      ],
      rough: [[0, 7], [1.7, 11], [3.6, 5]], depth: 0.55, loose: 0.7, breath: 0.15, grit: 1.5, out: cave,
    });
    glug(0.3, 3);
    glug(1.05, 4);
    glug(1.9, 3, 0.8);
    glug(2.5, 5);
    suck(2.75, 0.55, 0.12);
    this.hullCreak(2.2, 0.8, 0.9);
    this.hullCreak(1.6, 1.9, 0.7);
  }

  /**
   * The Drowned Dreamer's music box: a lullaby that goes wrong and runs down. Every tine has a second one a little off
   * beside it, the whole box wavers like a warped cylinder, each note comes later than the last, and the last one sags.
   */
  private dreamer(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.25;
    const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
    // The waver every tine shares (cents): a slow lurch and a quick flutter.
    const wow = ctx.createGain();
    for (const [rate, cents] of [[0.6, 9], [5.5, 3.5]]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = cents;
      lfo.connect(g).connect(wow);
      lfo.start(t);
      lfo.stop(t + 6.2);
    }
    // One note of the comb (a MIDI note number): the tine, its neighbour a little off, the octave and the comb's
    // ring, and the tick of the pin letting go. `sag`: how far it sinks as it rings (cents); `k`: how hard it is plucked.
    const tine = (note: number, at: number, ring: number, sag = 0, k = 1) => {
      const off = note % 2 ? 6 : -7;
      for (const [ratio, level, len, cents] of [[1, 0.08, 1, 0], [1, 0.038, 0.8, off], [2, 0.021, 0.45, 4], [5.4, 0.011, 0.12, 0]]) {
        const o = ctx.createOscillator();
        o.frequency.value = hz(note) * ratio;
        o.detune.setValueAtTime(cents, t + at);
        if (sag) o.detune.linearRampToValueAtTime(cents - sag, t + at + ring);
        wow.connect(o.detune);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.linearRampToValueAtTime(level * k, t + at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + ring * len);
        o.connect(g).connect(this.master!);
        o.start(t + at);
        o.stop(t + at + ring * len + 0.05);
      }
      this.noise(0.012, 'highpass', 5000, 7000, 0.018, 0.7, 0.25 + at);
    };
    // A low tone under the box, swelling in over `up` seconds and dying away: two a little apart, so it throbs.
    const drone = (note: number, at: number, dur: number, gain: number, up: number) => {
      for (const k of [1, 1.006]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = hz(note) * k;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.linearRampToValueAtTime(gain, t + at + up);
        g.gain.setValueAtTime(gain, t + at + dur * 0.6);
        g.gain.linearRampToValueAtTime(0.0001, t + at + dur);
        o.connect(g).connect(this.master!);
        o.start(t + at);
        o.stop(t + at + dur + 0.05);
      }
    };
    // The tune: [note, beats, a low note plucked under it]. Each beat is `slow` times as long as the one before; the
    // last note is left to ring and sag.
    const play = (tune: [note: number, beats: number, under?: number][], beat: number, slow: number, at = 0) => {
      tune.forEach(([note, beats, under], i) => {
        const last = i === tune.length - 1;
        tine(note, at, last ? 2.4 : 1.4, last ? 45 : 0);
        if (under) tine(under, at, last ? 2.4 : 1.8, 0, 0.55);
        for (let b = 0; b < beats; b++, beat *= slow) at += beat;
      });
    };
    // A cradle rocking as it sinks, in E minor over a low E and the F beside it: B5 G5 B5 G5 rocking; then the
    // top note slips a semitone each time while the bottom gives way under it (A#5 G5, A5 F5, G#5 and a long F5);
    // and D#5, a semitone short of home, left ringing and sinking over a low E. It opens on two notes a tritone
    // apart swelling in backwards.
    for (const note of [76, 82]) {
      const o = ctx.createOscillator();
      o.frequency.value = hz(note);
      wow.connect(o.detune);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t - 0.25);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.47);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.52);
      o.connect(g).connect(this.master!);
      o.start(t - 0.25);
      o.stop(t + 0.57);
    }
    drone(52, -0.2, 6, 0.025, 1.2);
    drone(53, 1.5, 4.3, 0.017, 1.8);
    // The box starts as the swell cuts off.
    play([[83, 1, 64], [79, 1], [83, 1], [79, 1], [82, 1, 64], [79, 1], [81, 1], [77, 1], [80, 1, 64], [77, 2], [75, 1, 64]], 0.2, 1.07, 0.5);
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
