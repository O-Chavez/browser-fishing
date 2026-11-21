// The in-page half of scripts/giant-fight-audio.ts: plays the game's own sound code (`AudioFX`, src/game/audio.ts,
// with the giants' fight sound of src/game/giantsound.ts) into an OfflineAudioContext, as the clip recorder does,
// measures the result and draws its spectrogram. Rendered in two channels (the organ's room is wide; the rest of the
// game's sound is the same in both). Served to headless Chrome by Vite.
import { AudioFX, type Giant, type GiantFightState } from '../src/game/audio';

const SR = 48000;
/** A frame of the game, in the render: a whole number of the context's 128-sample blocks (31 frames a second). */
const FRAME = 1536 / SR;

/** Small seeded random numbers (mulberry32), so a render is the same every time. */
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

/** A stretch of a render to measure. */
export interface Section {
  name: string;
  from: number;
  to: number;
}
export interface SectionStats extends Section {
  /** Level over the whole stretch, the loudest 0.4 s in it, and its highest sample (dBFS, after the master gain and the limiter). */
  rmsDb: number;
  loudDb: number;
  peakDb: number;
  /** Where the middle of its spectrum's energy lies (Hz): a duller sound reads lower. */
  centroidHz: number;
  /** Share of its energy above 150 Hz: what a phone's speaker can play. */
  over150: number;
  /** For a call (`Script.calls`): how it is told from the other giants' (`voiceprint`). */
  voice?: Voiceprint;
}
/** A call's measures. */
export interface Voiceprint {
  /** Where the middle of its spectrum's energy lies (Hz), over the call itself (not the silence round it). */
  centroidHz: number;
  /** Shares of its energy below 200 Hz and above 2 kHz. */
  below200: number;
  above2k: number;
  /** How long it takes to come up, from a tenth of its loudest level to nine tenths (ms; the level over 10 ms). */
  attackMs: number;
  /** How long it sounds: from the first to the last moment within 30 dB of its loudest (s). */
  lengthS: number;
}
export interface Stats {
  name: string;
  seconds: number;
  peakDb: number;
  clipped: number;
  sections: SectionStats[];
  /** What was read along the way: the calls as planned, the lake's tune's gain, and anything else a render notes. */
  notes: Record<string, unknown>;
}

/** A render: how long it is, what happens on each frame, and what to measure. */
interface Script {
  name: string;
  seconds: number;
  seed: number;
  /** Nothing of the lake's under it (its wind, its tune's drone). */
  bare?: boolean;
  /** Its sections are single calls: measure each one's voiceprint. */
  calls?: boolean;
  /** The organ without its room (a silent stand-in for the convolver), to see what the room costs to render. */
  noRoom?: boolean;
  frame: (fx: AudioFX, t: number, dt: number, notes: Record<string, unknown>) => void;
  sections: Section[];
}

/**
 * Runs a script against a fresh `AudioFX` whose context is an OfflineAudioContext: `window.AudioContext` is swapped
 * for it while the sound starts (and the timers the lake's birds and campfire use are held off), then every frame's
 * calls are made at a suspend point, at the context's own time.
 */
async function render(script: Script): Promise<{ l: Float32Array; r: Float32Array; notes: Record<string, unknown>; ms: number }> {
  const ctx = new OfflineAudioContext(2, Math.ceil(script.seconds * SR), SR);
  if (script.noRoom) {
    (ctx as unknown as { createConvolver: () => AudioNode }).createConvolver = () => {
      const mute = ctx.createGain();
      mute.gain.value = 0;
      return mute;
    };
  }
  const w = window as unknown as Record<string, unknown>;
  const real = { AudioContext: w.AudioContext, setInterval: w.setInterval, setTimeout: w.setTimeout, random: Math.random };
  Math.random = seeded(script.seed);
  w.AudioContext = function () {
    return ctx;
  };
  w.setInterval = () => 0;
  w.setTimeout = () => 0;
  let fx: AudioFX;
  try {
    fx = new AudioFX();
    fx.start();
  } finally {
    w.AudioContext = real.AudioContext;
    w.setInterval = real.setInterval;
    w.setTimeout = real.setTimeout;
  }
  // Without the storm a render is the fight's sound alone: at sea the lake's own wind is off, and its tune cannot
  // be scheduled offline anyway (only its drone would sound).
  if (script.bare) {
    const parts = fx as unknown as { lake: GainNode; musicGain: GainNode };
    parts.lake.gain.value = 0;
    parts.musicGain.gain.value = 0;
  }
  const notes: Record<string, unknown> = {};
  const frames = Math.floor(script.seconds / FRAME);
  script.frame(fx, 0, FRAME, notes);
  for (let i = 1; i < frames; i++) {
    void ctx.suspend(i * FRAME).then(() => {
      script.frame(fx, ctx.currentTime, FRAME, notes);
      void ctx.resume();
    });
  }
  const began = performance.now();
  try {
    const out = await ctx.startRendering();
    return { l: out.getChannelData(0), r: out.getChannelData(1), notes, ms: Math.round(performance.now() - began) };
  } finally {
    Math.random = real.random;
  }
}

// ---------- the scripts ----------

/** The Abyss's storm as the game gives it to the sound each frame. */
const storm = (fx: AudioFX, t: number, dt: number): void => fx.seaSound(dt, { mood: 2.6, slam: 0, rise: Math.sin(t * 0.7), night: 0.3, buoy: false });

/** True on the frame that reaches `at`. */
const reaches = (t: number, at: number): boolean => t >= at && t < at + FRAME;

/** The private parts of the sound a render looks at. */
const inside = (fx: AudioFX) => fx as unknown as { under?: GainNode; fight?: { lastPlan(id: Giant): unknown } };

/** Seconds from one call to the next in the calls' renders: room for the longest (the Kraken's, with its cave) to die away. */
const CALL_GAP = 3.8;

/** The calls: ten going from far and fresh to near and tired, a surge and a move by turns, then the last stand. */
function callsScript(id: Giant): Script {
  const N = 10;
  const sections: Section[] = [];
  for (let i = 0; i < N; i++) sections.push({ name: `call ${i + 1}`, from: 0.3 + i * CALL_GAP, to: 0.3 + (i + 1) * CALL_GAP - 0.1 });
  const lastAt = 0.3 + N * CALL_GAP + 0.6;
  sections.push({ name: 'last stand', from: lastAt, to: lastAt + 5.5 });
  const plans: unknown[] = [];
  return {
    name: `${id}-calls`,
    seconds: lastAt + 6,
    seed: 11,
    bare: true,
    calls: true,
    sections,
    frame: (fx, t, _dt, notes) => {
      notes.plans = plans;
      for (let i = 0; i < N; i++) {
        if (!reaches(t, 0.3 + i * CALL_GAP)) continue;
        const k = i / (N - 1);
        fx.giantCall(id, { kind: i % 2 ? 'move' : 'surge', near: 0.03 + 0.97 * k, fight: 1 - 0.9 * k });
        plans.push(inside(fx).fight?.lastPlan(id));
      }
      if (reaches(t, lastAt)) fx.giantCall(id, { kind: 'last', near: 1, fight: 0.05 });
    },
  };
}

/**
 * A giant's voiceprint: sixteen calls close in (so distance does not blur them), a surge and a move by turns, going
 * from fresh to tired, enough to hear every gesture. Their measures are what the three voices are told apart by.
 */
function voiceScript(id: Giant): Script {
  const N = 16;
  const sections: Section[] = [];
  for (let i = 0; i < N; i++) sections.push({ name: `call ${i + 1}`, from: 0.3 + i * CALL_GAP, to: 0.3 + (i + 1) * CALL_GAP - 0.1 });
  const plans: unknown[] = [];
  return {
    name: `${id}-voice`,
    seconds: 0.3 + N * CALL_GAP + 0.5,
    seed: 23,
    bare: true,
    calls: true,
    sections,
    frame: (fx, t, _dt, notes) => {
      notes.plans = plans;
      for (let i = 0; i < N; i++) {
        if (!reaches(t, 0.3 + i * CALL_GAP)) continue;
        fx.giantCall(id, { kind: i % 2 ? 'move' : 'surge', near: 0.9, fight: 1 - (0.85 * i) / (N - 1) });
        plans.push(inside(fx).fight?.lastPlan(id));
      }
    },
  };
}

/** The three voices side by side: a call from the Leviathan, the Kraken and the Dreamer in turn, twice round, close in and fresh. */
function allCallsScript(): Script {
  const order: Giant[] = ['leviathan', 'kraken', 'dreamer', 'leviathan', 'kraken', 'dreamer'];
  return {
    name: 'all-calls',
    seconds: 0.3 + order.length * CALL_GAP + 0.5,
    seed: 31,
    bare: true,
    calls: true,
    sections: order.map((id, i) => ({ name: `${id} ${i < 3 ? 1 : 2}`, from: 0.3 + i * CALL_GAP, to: 0.3 + (i + 1) * CALL_GAP - 0.1 })),
    frame: (fx, t) => {
      order.forEach((id, i) => {
        if (reaches(t, 0.3 + i * CALL_GAP)) fx.giantCall(id, { kind: 'surge', near: 0.9, fight: 0.9 });
      });
    },
  };
}

/** The scripted fight (seconds from the hook unless said), paced as the reel paces one: a 1 s warning and a 1.6 s surge every 5 to 6 s. */
const FIGHT = {
  /** Before the hook, and after the landing sound starts. */
  pre: 2,
  tail: 7.5,
  /** The acts: 2 from, 3 from. */
  act2: 16,
  act3: 34,
  /** When each surge starts, how long it lasts, and the warning before it. The giant calls on each: from act 2 on, with a move on every other one. */
  surges: [4.5, 10, 15.5, 21, 26.5, 32, 37.5, 43, 48],
  surge: 1.6,
  warn: 1,
  /** The last stand: when, and how long its thrash lasts (`LEGEND_FIGHT.lastStand.secs`); then spent for this long; then landed, and the landing sound this long after. */
  stand: 53,
  thrash: 3.2,
  spent: 6,
  gap: 1.2,
};

/** A surge's build-up `s` seconds in, as the reel ramps it. */
const build = (s: number, dur: number): number => Math.max(0, Math.min(1, s / 0.95, (dur - s) / 0.25));

/** The fight's state `ft` seconds after the hook. */
function stateAt(ft: number): GiantFightState {
  const F = FIGHT;
  const landed = F.stand + F.thrash + F.spent;
  let surge = 0;
  let warning = false;
  for (const s of F.surges) {
    if (ft >= s && ft < s + F.surge) surge = build(ft - s, F.surge);
    if (ft >= s - F.warn && ft < s) warning = true;
  }
  if (ft >= F.stand && ft < F.stand + F.thrash) surge = build(ft - F.stand, F.thrash);
  if (ft >= F.stand - F.warn && ft < F.stand) warning = true;
  const spent = ft >= F.stand + F.thrash;
  const along = Math.min(1, ft / F.stand);
  return {
    act: ft < F.act2 ? 1 : ft < F.act3 ? 2 : 3,
    near: spent ? 0.94 + (0.06 * (ft - F.stand - F.thrash)) / (landed - F.stand - F.thrash) : Math.max(0, 0.04 + 0.9 * along ** 0.9 - 0.03 * surge),
    fight: spent ? 0 : 1 - 0.93 * along,
    surge,
    warning,
    tension: spent ? 0.3 : Math.min(1, 0.4 + 0.15 * Math.sin(ft * 0.9) + 0.4 * surge),
    spent,
  };
}

/**
 * A fight from hook to landing: three acts, a warning and a surge every 5 to 6 s with the giant's voice on each, the
 * last stand with its bolt, spent, landed, then the landing sound as the game plays it (the Leviathan's
 * and the Kraken's with their bolt's thunder, the Dreamer's with the wind and rain hushed; both only at sea). With
 * `storm` the Abyss's sea, wind, rain and a few rolls of thunder play under it all, as in the game; `music` false
 * renders the voices alone, and `voices` false the music alone (no calls and no landing sound), to measure each.
 */
function fightScript(id: Giant, withStorm: boolean, music = true, voices = true, noRoom = false): Script {
  const F = FIGHT;
  const t0 = F.pre;
  const landed = t0 + F.stand + F.thrash + F.spent;
  const landing = landed + F.gap;
  const sections: Section[] = [{ name: 'before', from: 0.3, to: t0 }, { name: 'hook', from: t0, to: t0 + 2.5 }];
  F.surges.forEach((s, i) => {
    sections.push({ name: `calm ${i + 1} (act ${stateAt(s - 2).act})`, from: t0 + s - 2.9, to: t0 + s - F.warn });
    sections.push({ name: `warning ${i + 1}`, from: t0 + s - F.warn, to: t0 + s });
    sections.push({ name: `surge ${i + 1}`, from: t0 + s, to: t0 + s + F.surge });
  });
  sections.push(
    { name: 'last stand', from: t0 + F.stand, to: t0 + F.stand + F.thrash + 0.8 },
    { name: 'spent', from: t0 + F.stand + F.thrash + 1.5, to: landed },
    { name: 'landed, before the landing sound', from: landed + 0.3, to: landing },
    { name: 'landing sound', from: landing, to: landing + 5 },
    { name: 'after', from: landing + 5.5, to: landing + F.tail },
  );
  const lake: Record<string, number> = {};
  return {
    name: (voices ? `${id}-fight${withStorm ? '-storm' : ''}${music ? '' : '-nomusic'}` : `${id}-music`) + (noRoom ? '-noroom' : ''),
    seconds: landing + F.tail,
    seed: 7,
    bare: !withStorm,
    noRoom,
    sections,
    frame: (fx, t, dt, notes) => {
      if (withStorm) {
        storm(fx, t, dt);
        // A few of the storm's own strikes along the way.
        for (const [at, dist] of [[t0 + 8, 180], [t0 + 24.5, 120], [t0 + 41, 170]]) if (reaches(t, at)) fx.thunder(dist);
        // The last stand's bolt, as the game throws it (`LEGEND_FIGHT.lastStand`: 0.55 s in, 95 m off).
        if (reaches(t, t0 + F.stand + 0.55)) fx.thunder(95);
      }
      const ft = t - t0;
      if (music && reaches(t, t0)) fx.giantFightStart(id);
      const s = stateAt(ft);
      if (music && ft >= 0 && t < landed) fx.giantFight(dt, s);
      if (voices) {
        F.surges.forEach((at, i) => {
          if (reaches(ft, at)) fx.giantCall(id, { kind: s.act > 1 && i % 2 ? 'move' : 'surge', near: s.near, fight: s.fight });
        });
        if (reaches(ft, F.stand)) fx.giantCall(id, { kind: 'last', near: s.near, fight: s.fight });
      }
      if (music && reaches(t, landed)) fx.giantFightEnd('landed');
      if (voices && reaches(t, landing)) {
        if (id === 'dreamer') fx.hush(5);
        else fx.thunder(95);
        fx.giant(id);
      }
      // The lake's tune's own gain along the way: 1 before the hook, 0 through the fight, back after the landing.
      const under = inside(fx).under;
      for (const [label, at] of [['before the hook', t0 - 0.2], ['2 s into the fight', t0 + 2], ['as it is landed', landed - 0.1], ['7 s after it is landed', landed + 7]] as const) {
        if (under && reaches(t, at)) lake[label] = Number(under.gain.value.toFixed(3));
      }
      notes.lakeTuneGain = lake;
    },
  };
}

/** The music's ends, for the checks: a fight lost in act 2 (it sags away), and a fight restarted mid-way and the music switched off and on. */
function endsScript(id: Giant): Script {
  return {
    name: `${id}-ends`,
    seconds: 30,
    seed: 5,
    bare: true,
    sections: [
      { name: 'fight', from: 4, to: 8 },
      { name: 'lost: 0 to 0.5 s after', from: 8, to: 8.5 },
      { name: 'lost: 0.5 to 1.5 s after', from: 8.5, to: 9.5 },
      { name: 'lost: 1.5 to 3 s after', from: 9.5, to: 11 },
      { name: 'second fight', from: 13, to: 15 },
      { name: 'restarted', from: 16, to: 19 },
      { name: 'music switched off', from: 21, to: 23 },
      { name: 'music back on', from: 25, to: 27 },
      { name: 'landed: 0.3 to 2 s after', from: 27.3, to: 29 },
    ],
    frame: (fx, t, dt) => {
      const s: GiantFightState = { act: 2, near: 0.5, fight: 0.6, surge: 0, warning: false, tension: 0.5, spent: false };
      if (reaches(t, 0.5) || reaches(t, 11) || reaches(t, 15)) fx.giantFightStart(id);
      if ((t >= 0.5 && t < 8) || (t >= 11 && t < 27)) fx.giantFight(dt, s);
      if (reaches(t, 8)) fx.giantFightEnd('lost');
      if (reaches(t, 19.5) || reaches(t, 23.5)) fx.toggleMusic();
      if (reaches(t, 27)) fx.giantFightEnd('landed');
      // Ending twice, and with nothing on, must do nothing.
      if (reaches(t, 9) || reaches(t, 28)) fx.giantFightEnd('lost');
    },
  };
}

/** A giant's landing sound alone, as the game has it: the level the fight has to stay under. */
function landingScript(id: Giant): Script {
  return {
    name: `${id}-landing`,
    seconds: 8,
    seed: 9,
    bare: true,
    sections: [{ name: 'landing sound', from: 0.5, to: 5.5 }],
    frame: (fx, t) => {
      if (reaches(t, 0.5)) fx.giant(id);
    },
  };
}

/** What the fight plays against: the Abyss's storm alone, and a bolt 95 m off in it (the one a giant lands with). */
function referenceScript(): Script {
  return {
    name: 'reference',
    seconds: 18,
    seed: 3,
    sections: [
      { name: 'storm', from: 3, to: 9 },
      { name: 'thunder at 95 m, in the storm', from: 10, to: 15 },
    ],
    frame: (fx, t, dt) => {
      storm(fx, t, dt);
      if (reaches(t, 10)) fx.thunder(95);
    },
  };
}

// ---------- analysis ----------

/** In-place radix-2 FFT of `re`/`im` (length a power of two). */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}
const hann = (n: number): Float32Array => Float32Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
/** The magnitudes (0 to n/2) of `x` around sample `centre` under the window `w`; a sine of amplitude 1 reads 1. */
function spectrum(x: Float32Array, centre: number, w: Float32Array): Float32Array {
  const n = w.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const from = Math.round(centre - n / 2);
  for (let i = 0; i < n; i++) {
    const k = from + i;
    re[i] = k >= 0 && k < x.length ? x[k] * w[i] : 0;
  }
  fft(re, im);
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / (n / 4);
  return mag;
}
const db = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));
const rms = (x: Float32Array, from: number, to: number): number => {
  let s = 0;
  const a = Math.max(0, Math.round(from));
  const b = Math.min(x.length, Math.round(to));
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const round = (v: number, places = 1): number => Number(v.toFixed(places));

/** A call's measures, from the samples of its section (`from` to `to`). */
function voiceprint(x: Float32Array, from: number, to: number): Voiceprint {
  const WIN = 480;
  const HOP = 120;
  const env: number[] = [];
  for (let a = Math.round(from); a + WIN <= to; a += HOP) env.push(rms(x, a, a + WIN));
  const top = Math.max(...env, 1e-9);
  const first = (level: number, after = 0) => env.findIndex((v, i) => i >= after && v >= level * top);
  const onset = first(0.1);
  const full = first(0.9, onset);
  const start = first(0.0316);
  let end = env.length - 1;
  while (end > start && env[end] < 0.0316 * top) end--;
  const N = 4096;
  const w = hann(N);
  const a = from + start * HOP;
  const b = from + end * HOP + WIN;
  const avg = new Float64Array(N / 2);
  for (let c = a; c <= Math.max(a, b - N / 4); c += N / 4) {
    const m = spectrum(x, c, w);
    for (let i = 0; i < N / 2; i++) avg[i] += m[i] * m[i];
  }
  let total = 0;
  let weighted = 0;
  let low = 0;
  let high = 0;
  for (let i = 1; i < N / 2; i++) {
    const f = (i * SR) / N;
    total += avg[i];
    weighted += avg[i] * f;
    if (f < 200) low += avg[i];
    if (f > 2000) high += avg[i];
  }
  total = Math.max(total, 1e-20);
  return { centroidHz: Math.round(weighted / total), below200: round(low / total, 3), above2k: round(high / total, 3), attackMs: Math.round(((full - onset) * HOP * 1000) / SR), lengthS: round(((end - start) * HOP + WIN) / SR, 2) };
}

function measure(script: Script, l: Float32Array, r: Float32Array, notes: Record<string, unknown>): Stats {
  // The two channels together: their mean for the spectra, both for the peak, and the mean of their powers for the levels.
  const x = l.map((v, i) => (v + r[i]) / 2);
  const level = (from: number, to: number): number => Math.hypot(rms(l, from, to), rms(r, from, to)) / Math.SQRT2;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(Math.abs(l[i]), Math.abs(r[i]));
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
  }
  const N = 4096;
  const w = hann(N);
  const sections = script.sections.map((sec) => {
    const from = sec.from * SR;
    const to = Math.min(x.length, sec.to * SR);
    let top = 0;
    for (let i = Math.round(from); i < to; i++) top = Math.max(top, Math.abs(l[i]), Math.abs(r[i]));
    let loud = 0;
    const win = 0.4 * SR;
    for (let a = from; a + win <= to + 1; a += 0.1 * SR) loud = Math.max(loud, level(a, a + win));
    if (to - from < win) loud = level(from, to);
    const avg = new Float64Array(N / 2);
    for (let c = from + N / 2; c < to; c += N / 2) {
      const m = spectrum(x, c, w);
      for (let i = 0; i < N / 2; i++) avg[i] += m[i] * m[i];
    }
    let total = 0;
    let weighted = 0;
    let high = 0;
    for (let i = 1; i < N / 2; i++) {
      const f = (i * SR) / N;
      total += avg[i];
      weighted += avg[i] * f;
      if (f > 150) high += avg[i];
    }
    return {
      ...sec,
      rmsDb: round(db(level(from, to))),
      loudDb: round(db(loud)),
      peakDb: round(db(top)),
      centroidHz: Math.round(weighted / Math.max(total, 1e-20)),
      over150: round(high / Math.max(total, 1e-20), 2),
      ...(script.calls ? { voice: voiceprint(x, from, to) } : {}),
    };
  });
  return { name: script.name, seconds: round(x.length / SR, 2), peakDb: round(db(peak)), clipped, sections, notes };
}

/** A 16-bit two-channel WAV of the samples (base64). */
function wav(l: Float32Array, r: Float32Array): string {
  const n = l.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const text = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), true);
    v.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), true);
  }
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A dark-to-bright colour for `v` (0..1). */
function heat(v: number): [number, number, number] {
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const p = Math.min(0.9999, Math.max(0, v)) * (stops.length - 1);
  const i = Math.floor(p);
  const f = p - i;
  return [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as [number, number, number];
}

/**
 * The render's spectrogram as a PNG (base64): frequency on a log scale from 40 Hz to 14 kHz, -95 to -15 dB, a line
 * and a name at the start of every section; under it the level, peak (line) and RMS (filled), from -60 to 0 dBFS.
 */
function picture(script: Script, x: Float32Array, s: Stats): string {
  const W = 1500;
  const H = 460;
  const LEFT = 56;
  const TOP = 64;
  const STRIP = 110;
  const canvas = document.createElement('canvas');
  canvas.width = LEFT + W + 12;
  canvas.height = TOP + H + 26 + STRIP + 14;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#111';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const N = 4096;
  const w = hann(N);
  const seconds = x.length / SR;
  const F0 = 40;
  const F1 = 14000;
  const rowHz = (y: number) => F0 * Math.pow(F1 / F0, 1 - y / H);
  const img = g.createImageData(W, H);
  const peaks = new Float32Array(W);
  const levels = new Float32Array(W);
  for (let c = 0; c < W; c++) {
    const centre = ((c + 0.5) / W) * seconds * SR;
    const m = spectrum(x, centre, w);
    for (let y = 0; y < H; y++) {
      const a = (rowHz(y + 1) * N) / SR;
      const b = (rowHz(y) * N) / SR;
      let v = 0;
      if (b - a < 1) {
        const i = Math.floor((a + b) / 2);
        const f = (a + b) / 2 - i;
        v = m[i] * (1 - f) + (m[i + 1] ?? 0) * f;
      } else for (let i = Math.ceil(a); i <= b; i++) v = Math.max(v, m[i]);
      const [r, gr, bl] = heat((db(v) + 95) / 80);
      const o = (y * W + c) * 4;
      img.data[o] = r;
      img.data[o + 1] = gr;
      img.data[o + 2] = bl;
      img.data[o + 3] = 255;
    }
    const half = (seconds * SR) / W / 2;
    let p = 0;
    for (let i = Math.max(0, Math.floor(centre - half)); i < Math.min(x.length, centre + half); i++) p = Math.max(p, Math.abs(x[i]));
    peaks[c] = p;
    levels[c] = rms(x, centre - half * 4, centre + half * 4);
  }
  g.putImageData(img, LEFT, TOP);
  g.font = '12px sans-serif';
  g.fillStyle = '#ddd';
  g.fillText(`${script.name}   ${s.seconds} s   peak ${s.peakDb} dBFS   clipped ${s.clipped}`, LEFT, 14);
  g.textAlign = 'right';
  for (const f of [50, 100, 150, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = TOP + H * (1 - Math.log(f / F0) / Math.log(F1 / F0));
    g.fillStyle = '#aaa';
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), LEFT - 6, y + 4);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(LEFT, y, W, 1);
  }
  g.textAlign = 'left';
  const sy = TOP + H + 26;
  g.font = '10px sans-serif';
  script.sections.forEach((sec, i) => {
    const px = LEFT + (sec.from / seconds) * W;
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(px, TOP - 6, 1, H + 6);
    g.fillRect(px, sy, 1, STRIP);
    g.fillStyle = '#eee';
    g.save();
    g.translate(px + 3, TOP - 8 - (i % 3) * 12);
    g.fillText(sec.name.replace('before the landing sound', '').replace(/ \(act \d\)/, ''), 0, 0);
    g.restore();
  });
  g.font = '12px sans-serif';
  // Seconds along the bottom.
  g.fillStyle = '#aaa';
  for (let t = 0; t < seconds; t += seconds > 40 ? 5 : 2) {
    const px = LEFT + (t / seconds) * W;
    g.fillRect(px, TOP + H, 1, 6);
    g.fillText(String(t), px + 2, TOP + H + 18);
  }
  // The level strip.
  const ly = (v: number) => sy + STRIP * Math.min(1, Math.max(0, -db(v) / 60));
  g.fillStyle = '#1b2b3a';
  g.fillRect(LEFT, sy, W, STRIP);
  for (let c = 0; c < W; c++) {
    g.fillStyle = '#3f8fd0';
    g.fillRect(LEFT + c, ly(levels[c]), 1, sy + STRIP - ly(levels[c]));
    g.fillStyle = '#f2f2f2';
    g.fillRect(LEFT + c, ly(peaks[c]), 1, 1.5);
  }
  g.textAlign = 'right';
  for (const [d, colour] of [[0, '#aaa'], [-3, '#e66'], [-12, '#aa8'], [-24, '#777'], [-48, '#777']] as const) {
    const y = sy + (STRIP * -d) / 60;
    g.fillStyle = colour;
    g.fillRect(LEFT, y, W, 1);
    g.fillText(String(d), LEFT - 6, y + 4);
  }
  return canvas.toDataURL('image/png').split(',')[1];
}

/** What to render: a landing sound, a giant's calls or its voiceprint, the three voices in turn, a fight (with the storm or without; the music or the voices left out; the organ without its room), the ends, or the reference levels. */
export type Ask =
  | { kind: 'calls'; id: Giant }
  | { kind: 'voice'; id: Giant }
  | { kind: 'allcalls' }
  | { kind: 'fight'; id: Giant; storm: boolean; music?: boolean; voices?: boolean; noRoom?: boolean }
  | { kind: 'ends'; id: Giant }
  | { kind: 'landing'; id: Giant }
  | { kind: 'reference' };

/** Renders one and returns its sound, its picture, its numbers and how long the rendering took (ms). */
export async function run(ask: Ask): Promise<{ name: string; wav: string; png: string; stats: Stats; ms: number }> {
  const script =
    ask.kind === 'calls' ? callsScript(ask.id)
    : ask.kind === 'voice' ? voiceScript(ask.id)
    : ask.kind === 'allcalls' ? allCallsScript()
    : ask.kind === 'fight' ? fightScript(ask.id, ask.storm, ask.music ?? true, ask.voices ?? true, ask.noRoom ?? false)
    : ask.kind === 'ends' ? endsScript(ask.id)
    : ask.kind === 'landing' ? landingScript(ask.id)
    : referenceScript();
  const { l, r, notes, ms } = await render(script);
  const stats = measure(script, l, r, notes);
  return { name: script.name, wav: wav(l, r), png: picture(script, l.map((v, i) => (v + r[i]) / 2), stats), stats, ms };
}
