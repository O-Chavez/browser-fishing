// The campfire band, checked by eye: renders the game's own music code (src/game/bandsound.ts) in headless
// Chrome with an OfflineAudioContext and writes, for each mix, a WAV, a spectrogram PNG with bar lines and a
// JSON of measurements (peak, RMS, crest factor, clipped samples, spectral centroid, note onsets against the
// notes written and the eighth-note grid, and each bar's level and fit to its chord).
//
//   npx tsx scripts/band-audio.ts            # into .bench/band/
//   npx tsx scripts/band-audio.ts out/dir    # somewhere else
//
// The mixes, 16 bars (two rounds of the chords) each: `town` (the town's tune alone, as with nobody seated), one
// for each part alone, `band` (all six), `terrace` (all six with the drone and the town's pick and whistle at
// their stepped-back level: what a player on the terrace hears) and `staged` (the scheduler run as the game runs
// it, with players sitting down and getting up, the clock corrected and a throttled tab). `sync.json` is the sync
// check (`syncCheck` in band-audio-page.ts) and `stats.json` every mix's numbers. Levels are before the music's
// own volume (MUSIC_VOL in audio.ts), which then brings everything down by 15 dB.
//
// Set CHROME_PATH to the Chrome to use. Look at the pictures after any change to the voices or the notes.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { ALL_PARTS, BAND_MIX, INSTRUMENTS, partBit } from '../src/data/band';
import type { RenderSpec, Stats } from './band-audio-page';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5297;
const OUT = path.resolve(process.argv[2] ?? '.bench/band');
const BARS = 16;
fs.mkdirSync(OUT, { recursive: true });

const bit = (id: string): number => partBit(INSTRUMENTS.findIndex((p) => p.id === id));
const specs: RenderSpec[] = [
  { name: 'town', mask: 0, town: 1, band: 1, drone: true, bars: BARS },
  ...INSTRUMENTS.map(({ id }, i) => ({ name: id, mask: partBit(i), town: 0, band: 1, drone: false, bars: BARS })),
  { name: 'band', mask: ALL_PARTS, town: 0, band: 1, drone: false, bars: BARS },
  { name: 'terrace', mask: ALL_PARTS, town: BAND_MIX.townNear, band: 1, drone: true, bars: BARS },
  {
    // The game's own way of scheduling (a pass every 0.25 s, looking 0.6 s ahead), with things happening: the
    // whistle alone; the banjo and the jug sit down mid-bar (7 s); the clock is corrected 15 ms on (11 s) and
    // 25 ms back (16 s); the whistle gets up just before a bar line (19.3 s); the tab sleeps for 4 s (23 to 27 s);
    // everyone sits (28 s); the clock jumps 5 s on, as when a server is joined (31 s).
    name: 'staged', mask: bit('whistle'), town: BAND_MIX.townNear, band: 1, drone: false, bars: BARS,
    live: {
      every: 0.25, ahead: 0.6,
      steps: [
        { at: 7, mask: bit('whistle') | bit('banjo') | bit('jug') },
        { at: 11, offsetMs: 15 },
        { at: 16, offsetMs: -10 },
        { at: 19.3, mask: bit('banjo') | bit('jug') },
        { at: 23, asleep: true },
        { at: 27 },
        { at: 28, mask: ALL_PARTS },
        { at: 31, offsetMs: 4990 },
      ],
    },
  },
];

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  // Any same-origin page will do: the work is in the module imported from it.
  await page.goto(`http://localhost:${VITE_PORT}/scripts/band-audio-page.ts`, { waitUntil: 'load', timeout: 150_000 });
  const call = <T>(fn: string, arg?: unknown): Promise<T> =>
    page.evaluate(`import('/scripts/band-audio-page.ts').then((m) => m.${fn}(${JSON.stringify(arg ?? null)}))`) as Promise<T>;
  const all: Stats[] = [];
  for (const spec of specs) {
    const r = await call<{ wav: string; png: string; stats: Stats }>('run', spec);
    fs.writeFileSync(path.join(OUT, `${spec.name}.wav`), Buffer.from(r.wav, 'base64'));
    fs.writeFileSync(path.join(OUT, `${spec.name}.png`), Buffer.from(r.png, 'base64'));
    fs.writeFileSync(path.join(OUT, `${spec.name}.json`), JSON.stringify(r.stats, null, 1));
    all.push(r.stats);
    const s = r.stats;
    console.log(
      `${s.name.padEnd(11)} peak ${String(s.peakDb).padStart(6)} dBFS  rms ${String(s.rmsDb).padStart(6)} dB ${String(s.rmsDbA).padStart(6)} dBA  crest ${String(s.crestDb).padStart(5)}  clipped ${s.clipped}  centroid ${String(s.centroidHz).padStart(5)} Hz  80% in ${s.bandHz.lo}-${s.bandHz.hi} Hz  ` +
        `onsets ${s.onsets.matched}/${s.onsets.expected} (mean ${s.onsets.meanMs} max ${s.onsets.maxMs} ms, ${s.onsets.stray} stray)  on chord ${(s.bars.reduce((a, b) => a + b.onChord, 0) / s.bars.length).toFixed(2)}  tail ${(s.bars.reduce((a, b) => a + b.tailDb, 0) / s.bars.length).toFixed(1)} dB`,
    );
  }
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(all, null, 1));
  const sync = await call<Record<string, unknown>>('syncCheck');
  fs.writeFileSync(path.join(OUT, 'sync.json'), JSON.stringify(sync, null, 1));
  console.log('sync', JSON.stringify(sync));
  console.log(`written to ${OUT}`);
} finally {
  await browser.close();
  await vite.close();
}
