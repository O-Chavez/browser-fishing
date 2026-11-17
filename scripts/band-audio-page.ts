// The in-page half of scripts/band-audio.ts: renders the game's own music code (`Music`, src/game/bandsound.ts)
// with an OfflineAudioContext, measures the result and draws its spectrogram. Served to headless Chrome by Vite.
import { ALL_PARTS, BAR_MS, EIGHTH_MS, INSTRUMENTS, bandNotes, barHash, chordAt } from '../src/data/band';
import { Music } from '../src/game/bandsound';

const SR = 48000;
const BAR = BAR_MS / 1000;
/** Every render's first bar: far from zero, and at the top of the eight-bar round. */
export const START_BAR = 4000;
/** A render starts this long before its first bar line (ms), as the game schedules a bar a moment before it starts. */
// Not a whole number of samples: every note of the tune is a whole number of samples from the bar line, and a start
// time that sits exactly on a sample could round either way between two renders.
const LEAD_MS = 100 + 0.3 / 48;
/** Where the shared clock stands as a render starts (ms), its first whole bar, and when that bar starts in the render (s). */
const clock0 = (spec: RenderSpec): number => spec.startMs ?? START_BAR * BAR_MS - LEAD_MS;
const firstBar = (spec: RenderSpec): number => Math.ceil(clock0(spec) / BAR_MS);
const lead = (spec: RenderSpec): number => (firstBar(spec) * BAR_MS - clock0(spec)) / 1000;
const length = (spec: RenderSpec): number => lead(spec) + spec.bars * BAR + 1.5;

/** One step of a staged "live" render: from `at` seconds on, the scheduler is given this. */
export interface LiveStep {
  at: number;
  /** Who plays. */
  mask?: number;
  /** The shared clock's correction (ms), as when the server resends its clock. */
  offsetMs?: number;
  /** No scheduler passes from here until the next step: a throttled tab. */
  asleep?: boolean;
}
export interface RenderSpec {
  name: string;
  /** Which parts play (bit i is INSTRUMENTS[i]). */
  mask: number;
  /** The town layer's level (its pick and whistle) and the band's, as `bandMix` would set them. */
  town: number;
  band: number;
  drone: boolean;
  bars: number;
  /** Where the shared clock stands as the render starts (ms); just before `START_BAR` when left out. `bars` whole bars follow the first bar line. */
  startMs?: number;
  /** Schedule as the game does, a pass every `every` s looking `ahead` s on, through these steps; one pass for everything when left out. */
  live?: { every: number; ahead: number; steps: LiveStep[] };
}

/** Renders `spec` to mono samples at 48 kHz, before the music's own volume (`MUSIC_VOL`). */
export async function render(spec: RenderSpec): Promise<Float32Array> {
  const seconds = length(spec);
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  const music = new Music(ctx, { human: false });
  music.out.connect(ctx.destination);
  music.mix(spec.band, spec.town, 0.0001);
  if (spec.drone) music.startDrone();
  const startMs = clock0(spec);
  // No bar that would start after the bars asked for.
  const end = lead(spec) + spec.bars * BAR - 0.001;
  const pass = (t: number, mask: number, offsetMs: number, ahead: number) => music.pass(startMs + t * 1000 + offsetMs, mask, Math.min(ahead, end - t));
  if (!spec.live) pass(0, spec.mask, 0, seconds);
  else {
    const { every, ahead, steps } = spec.live;
    const at = (t: number) => {
      let s: LiveStep = { at: 0 };
      let mask = spec.mask;
      let offsetMs = 0;
      for (const step of steps) {
        if (step.at > t) break;
        s = step;
        mask = step.mask ?? mask;
        offsetMs = step.offsetMs ?? offsetMs;
      }
      return { asleep: !!s.asleep, mask, offsetMs };
    };
    const first = at(0);
    pass(0, first.mask, first.offsetMs, ahead);
    for (let t = every; t < seconds; t += every) {
      void ctx.suspend(t).then(() => {
        const s = at(t);
        if (!s.asleep) pass(ctx.currentTime, s.mask, s.offsetMs, ahead);
        void ctx.resume();
      });
    }
  }
  return (await ctx.startRendering()).getChannelData(0);
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
/** The magnitudes (0 to n/2) of `x` around sample `centre` under a Hann window of `win` samples, zero-padded to `n`; a sine of amplitude 1 reads 1. */
function spectrum(x: Float32Array, centre: number, w: Float32Array, n = w.length): Float32Array {
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const from = Math.round(centre - w.length / 2);
  for (let i = 0; i < w.length; i++) {
    const k = from + i;
    re[i] = k >= 0 && k < x.length ? x[k] * w[i] : 0;
  }
  fft(re, im);
  const mag = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]) / (w.length / 4);
  return mag;
}
const db = (v: number): number => 20 * Math.log10(Math.max(v, 1e-9));
const rms = (x: Float32Array, from = 0, to = x.length): number => {
  let s = 0;
  for (let i = Math.max(0, from); i < Math.min(x.length, to); i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const round = (v: number, places = 2): number => Number(v.toFixed(places));

/**
 * Note onsets, in seconds, uncorrected: where the rise of the spectrum's bands (each about a sixth of an octave, on
 * a log scale, so a vibrato or a tremble doesn't count) peaks, timed at the half-way point of the rise.
 */
function rawOnsets(x: Float32Array): number[] {
  const N = 1024;
  const HOP = 128;
  const BACK = 4;
  const w = hann(N);
  const frames = Math.floor(x.length / HOP);
  const edges = [1];
  while (edges[edges.length - 1] < (10000 * N) / SR) edges.push(edges[edges.length - 1] + Math.max(1, Math.round(edges[edges.length - 1] * 0.12)));
  const logs: Float32Array[] = [];
  const flux = new Float32Array(frames);
  const level = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const m = spectrum(x, i * HOP, w);
    const l = new Float32Array(edges.length - 1);
    for (let b = 0; b < l.length; b++) {
      let e = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) e += m[k] * m[k];
      l[b] = Math.log(1 + 400 * Math.sqrt(e));
      level[i] += e;
    }
    logs.push(l);
    if (i >= BACK) {
      let f = 0;
      const p = logs[i - BACK];
      // Only a band that has clearly risen counts: two reeds beating against each other ripple every band a little.
      for (let b = 0; b < l.length; b++) if (l[b] > p[b] + 0.08) f += l[b] - p[b];
      flux[i] = f;
    }
  }
  const sorted = Float32Array.from(flux).sort();
  // Against the strong rises (there are at least a couple of dozen notes in any render), not the average frame: a
  // held chord's slow beating is far below them.
  const strong = sorted[Math.max(0, sorted.length - 40)];
  const thr = 0.22 * strong;
  const out: number[] = [];
  const R = 8;
  let lastPeak = -100;
  for (let i = R; i < frames - R; i++) {
    if (flux[i] < thr || i - lastPeak < 12) continue;
    let top = true;
    for (let k = -R; k <= R; k++) if (flux[i + k] > flux[i]) top = false;
    // A weak rise counts only if it lifts the level as a whole (by half a dB at least): a held chord's shimmer moves
    // the level about between its bands, a note adds to it. (A whistle slurring to its next note is a strong rise.)
    if (!top || (flux[i] < 0.6 * strong && level[i + 2] < 1.12 * level[i - 6] + 1e-9)) continue;
    lastPeak = i;
    let j = i;
    while (j > i - 14 && flux[j - 1] > 0.5 * flux[i]) j--;
    out.push((j * HOP) / SR);
  }
  return out;
}
/** How late the detector reads a sharp onset (s): measured on bursts of noise at known times. */
let detectorLag: number | undefined;
function lag(): number {
  if (detectorLag !== undefined) return detectorLag;
  const x = new Float32Array(SR * 4);
  const times = Array.from({ length: 16 }, (_, i) => 0.2 + i * 0.2171);
  let seed = 1;
  for (const t of times) {
    for (let i = 0; i < 0.08 * SR; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      x[Math.round(t * SR) + i] = (seed / 2147483648 - 1) * 0.3 * Math.exp(-i / (0.02 * SR));
    }
  }
  const found = rawOnsets(x);
  const d = times.map((t) => found.reduce((best, f) => (Math.abs(f - t) < Math.abs(best) ? f - t : best), 1)).filter((v) => Math.abs(v) < 0.05);
  return (detectorLag = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length));
}
/**
 * Note onsets, in seconds. Good to about 3 ms on a pluck or a hit (the frames are 2.7 ms apart); soft attacks
 * (the squeezebox's bellows, the jug, the whistle) read a few ms off either way.
 */
function onsets(x: Float32Array): number[] {
  return rawOnsets(x).map((t) => t - lag());
}

/** When each note of the render should start (s from its first bar line), from the note data: the town's tune and the parts in `mask`. */
function expectedOnsets(spec: RenderSpec): number[] {
  const set = new Set<number>();
  const bar0 = firstBar(spec);
  for (let b = 0; b < spec.bars; b++) {
    const bar = bar0 + b;
    if (spec.town > 0) {
      for (let i = 0; i < 6; i++) set.add(b * BAR_MS + i * EIGHTH_MS);
      if (((bar % 4) + 4) % 4 === 2 && barHash(bar, 30) < 0.8) for (let i = 0; i < 4; i++) set.add(b * BAR_MS + i * 2 * EIGHTH_MS);
    }
    INSTRUMENTS.forEach(({ id }, i) => {
      if (spec.mask & (1 << i)) for (const n of bandNotes(id, bar)) set.add(b * BAR_MS + n.at * EIGHTH_MS);
    });
  }
  return [...set].sort((a, b) => a - b).map((ms) => ms / 1000);
}

export interface Stats {
  name: string;
  seconds: number;
  /** Before the music's own volume (MUSIC_VOL 0.17) and the master (0.7). */
  peak: number;
  peakDb: number;
  rms: number;
  rmsDb: number;
  /** The level as the ear weighs it (A-weighted, dB): the fair way to set a bass part against a whistle. */
  rmsDbA: number;
  crestDb: number;
  clipped: number;
  centroidHz: number;
  /** Where the middle 80% of the energy lies (Hz): 10% of it is below `lo`, 10% above `hi`. */
  bandHz: { lo: number; hi: number };
  onsets: {
    found: number;
    /** Against the notes the data says play: how many of them were found within 40 ms, and how far off (ms). */
    expected: number;
    matched: number;
    meanMs: number;
    maxMs: number;
    /** Found onsets with no note within 40 ms, nor the room's echo of one (190 ms after it). */
    stray: number;
    /** Every found onset against the nearest eighth (360 ms) and sixteenth (180 ms) of the grid (ms). */
    eighthGrid: { meanMs: number; maxMs: number };
    sixteenthGrid: { meanMs: number; maxMs: number };
  };
  /** Each bar: its chord, its level (dB), the level of its last 60 ms against that (dB), and how much of its pitched energy is on the chord's notes (0..1). */
  bars: { chord: string; rmsDb: number; tailDb: number; onChord: number }[];
}

export function measure(spec: RenderSpec, x: Float32Array): Stats {
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
  }
  const start = Math.round(lead(spec) * SR);
  const body = start + spec.bars * BAR * SR;
  const r = rms(x, start, body);
  // The long-term spectrum, for the centroid and the band the energy sits in.
  const N = 8192;
  const w = hann(N);
  const avg = new Float64Array(N / 2);
  for (let c = start + N / 2; c < body; c += N / 2) {
    const m = spectrum(x, c, w);
    for (let i = 0; i < N / 2; i++) avg[i] += m[i] * m[i];
  }
  let total = 0;
  let weighted = 0;
  let heard = 0;
  for (let i = 1; i < N / 2; i++) {
    const f = (i * SR) / N;
    total += avg[i];
    weighted += avg[i] * f;
    // The A-weighting curve.
    const f2 = f * f;
    const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    heard += avg[i] * (ra * 1.2589) ** 2;
  }
  const quantile = (q: number): number => {
    let run = 0;
    for (let i = 1; i < N / 2; i++) {
      run += avg[i];
      if (run >= q * total) return (i * SR) / N;
    }
    return SR / 2;
  };
  const found = onsets(x).map((t) => t - lead(spec)).filter((t) => t > -0.05 && t < spec.bars * BAR);
  const want = expectedOnsets(spec);
  const devs: number[] = [];
  for (const t of want) {
    const d = Math.min(...found.map((f) => Math.abs(f - t)));
    if (d <= 0.04) devs.push(d * 1000);
  }
  const stray = found.filter((f) => Math.min(...want.map((t) => Math.min(Math.abs(f - t), Math.abs(f - t - 0.19)))) > 0.04).length;
  const grid = (step: number) => {
    const d = found.map((f) => Math.abs(f - Math.round(f / step) * step) * 1000);
    return { meanMs: round(d.reduce((a, b) => a + b, 0) / Math.max(1, d.length)), maxMs: round(Math.max(0, ...d)) };
  };
  const bar0 = firstBar(spec);
  const BN = 131072;
  const bars = Array.from({ length: spec.bars }, (_, b) => {
    const from = start + Math.round(b * BAR * SR);
    const to = start + Math.round((b + 1) * BAR * SR);
    const chord = chordAt(bar0 + b);
    const m = spectrum(x, (from + to) / 2, hann(to - from), BN);
    let on = 0;
    let all = 0;
    for (let i = Math.round((60 * BN) / SR); i < (1300 * BN) / SR; i++) {
      const pitch = 69 + 12 * Math.log2((i * SR) / BN / 440);
      if (Math.abs(pitch - Math.round(pitch)) > 0.35) continue;
      const p = m[i] * m[i];
      all += p;
      if (chord.tones.includes(((Math.round(pitch) % 12) + 12) % 12)) on += p;
    }
    const level = rms(x, from, to);
    return { chord: chord.name, rmsDb: round(db(level), 1), tailDb: round(db(rms(x, to - 0.06 * SR, to)) - db(level), 1), onChord: round(on / Math.max(all, 1e-12)) };
  });
  return {
    name: spec.name,
    seconds: round(x.length / SR),
    peak: round(peak, 4),
    peakDb: round(db(peak), 1),
    rms: round(r, 4),
    rmsDb: round(db(r), 1),
    rmsDbA: round(db(r) + 10 * Math.log10(Math.max(heard, 1e-30) / Math.max(total, 1e-30)), 1),
    crestDb: round(db(peak) - db(r), 1),
    clipped,
    centroidHz: Math.round(weighted / Math.max(total, 1e-12)),
    bandHz: { lo: Math.round(quantile(0.1)), hi: Math.round(quantile(0.9)) },
    onsets: {
      found: found.length,
      expected: want.length,
      matched: devs.length,
      meanMs: round(devs.reduce((a, b) => a + b, 0) / Math.max(1, devs.length)),
      maxMs: round(Math.max(0, ...devs)),
      stray,
      eighthGrid: grid(EIGHTH_MS / 1000),
      sixteenthGrid: grid(EIGHTH_MS / 2000),
    },
    bars,
  };
}

// ---------- the picture ----------

/** A dark-to-bright colour for `v` (0..1). */
function heat(v: number): [number, number, number] {
  const stops = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
  const p = Math.min(0.9999, Math.max(0, v)) * (stops.length - 1);
  const i = Math.floor(p);
  const f = p - i;
  return [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as [number, number, number];
}

/**
 * The render's spectrogram as a PNG (base64): frequency on a log scale from 40 Hz to 14 kHz, -95 to -15 dB, a
 * line at every bar with its number and chord, a tick at every eighth; under it the level, peak (line) and RMS
 * (filled), from -60 to 0 dBFS with lines at -3 and -12.
 */
export function picture(spec: RenderSpec, x: Float32Array, s: Stats): string {
  const W = 1500;
  const H = 460;
  const LEFT = 56;
  const TOP = 44;
  const STRIP = 110;
  const canvas = document.createElement('canvas');
  canvas.width = LEFT + W + 12;
  canvas.height = TOP + H + 26 + STRIP + 14;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#111';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const N = 4096;
  const w = hann(N);
  const seconds = length(spec);
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
    levels[c] = rms(x, Math.floor(centre - half * 4), Math.floor(centre + half * 4));
  }
  g.putImageData(img, LEFT, TOP);
  g.font = '12px sans-serif';
  g.fillStyle = '#ddd';
  g.fillText(`${spec.name}   peak ${s.peakDb} dBFS   RMS ${s.rmsDb} dB (${s.rmsDbA} dBA)   crest ${s.crestDb} dB   clipped ${s.clipped}   centroid ${s.centroidHz} Hz   onsets ${s.onsets.matched}/${s.onsets.expected} within ${s.onsets.maxMs} ms (mean ${s.onsets.meanMs})`, LEFT, 14);
  g.textAlign = 'right';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = TOP + H * (1 - Math.log(f / F0) / Math.log(F1 / F0));
    g.fillStyle = '#aaa';
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), LEFT - 6, y + 4);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(LEFT, y, W, 1);
  }
  g.textAlign = 'left';
  const bar0 = firstBar(spec);
  const first = lead(spec);
  const sy = TOP + H + 26;
  for (let b = 0; b <= spec.bars; b++) {
    const t = first + b * BAR;
    const px = LEFT + (t / seconds) * W;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(px, TOP - 12, 1, H + 12);
    g.fillRect(px, sy, 1, STRIP);
    g.fillStyle = '#eee';
    if (b < spec.bars) g.fillText(`${b + 1} ${chordAt(bar0 + b).name}`, px + 3, TOP - 3);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let e = 1; e < 6; e++) g.fillRect(LEFT + ((t + (e * EIGHTH_MS) / 1000) / seconds) * W, TOP + H, 1, e === 3 ? 9 : 5);
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

/** A 16-bit mono WAV of the samples (base64). */
export function wav(x: Float32Array): string {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const text = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + x.length * 2, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true);
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Renders one spec and returns its sound, its picture and its numbers. */
export async function run(spec: RenderSpec): Promise<{ wav: string; png: string; stats: Stats }> {
  const x = await render(spec);
  const stats = measure(spec, x);
  return { wav: wav(x), png: picture(spec, x, stats), stats };
}

/** How two stretches of samples compare: the largest difference, the difference's level against the sound's (dB), and the shift (samples) at which they match best. */
function compare(a: Float32Array, b: Float32Array): { maxDiff: number; diffDb: number; lagSamples: number } {
  const n = Math.min(a.length, b.length);
  let max = 0;
  let diff = 0;
  let level = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    max = Math.max(max, Math.abs(d));
    diff += d * d;
    level += a[i] * a[i];
  }
  let best = 0;
  let bestSum = -Infinity;
  const step = 7;
  for (let lag = -480; lag <= 480; lag++) {
    let sum = 0;
    for (let i = 480; i < n - 480; i += step) sum += a[i] * b[i + lag];
    if (sum > bestSum) {
      bestSum = sum;
      best = lag;
    }
  }
  return { maxDiff: round(max, 6), diffDb: round(10 * Math.log10(Math.max(diff, 1e-30) / Math.max(level, 1e-30)), 1), lagSamples: best };
}

/**
 * The sync check. Two players' machines start the music at different moments of the shared clock; where their
 * renders cover the same bars they must carry the same sound at the same clock times. A: started at the top of a
 * bar. B: started two and a half bars later, in the middle of one. C: started like A but scheduled as the game
 * does, a pass every quarter second looking 0.6 s ahead. Compared over eight bars from the fifth bar of A on (by
 * then the notes B missed before it started have died away).
 */
export async function syncCheck(): Promise<Record<string, unknown>> {
  const base = { mask: ALL_PARTS, town: 0.12, band: 1, drone: false, bars: 14 };
  const t0 = START_BAR * BAR_MS - LEAD_MS;
  const late = 2.5 * BAR_MS;
  const a = await render({ ...base, name: 'a' });
  const b = await render({ ...base, name: 'b', startMs: t0 + late });
  const c = await render({ ...base, name: 'c', live: { every: 0.25, ahead: 0.6, steps: [] } });
  const from = (LEAD_MS / 1000 + 4 * BAR) * SR;
  const len = 8 * BAR * SR;
  const cut = (x: Float32Array, at: number) => x.subarray(Math.round(at), Math.round(at + len));
  const shift = (late / 1000) * SR;
  return {
    comparedBars: 8,
    lateStartVsOnTheBar: compare(cut(a, from), cut(b, from - shift)),
    stagedPassesVsOnePass: compare(cut(a, from), cut(c, from)),
    // A control: the same comparison with B read one sixteenth late must NOT match.
    controlOneSixteenthOff: compare(cut(a, from), cut(b, from - shift + 0.18 * SR)),
  };
}
