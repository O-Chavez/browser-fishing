// The Abyss giants' fight sound, checked by eye: plays the game's own sound code (`AudioFX`, src/game/audio.ts,
// with src/game/giantsound.ts) into an OfflineAudioContext in headless Chrome, the way the clip recorder does, and
// writes for each render a two-channel WAV, a spectrogram PNG with a line at every section, and its numbers (level,
// loudest 0.4 s, peak, spectral centroid and the share of energy above 150 Hz, per section) into `stats.json`.
//
//   npx tsx scripts/giant-fight-audio.ts                 # into .bench/giant-fight/
//   npx tsx scripts/giant-fight-audio.ts out/dir         # somewhere else
//   npx tsx scripts/giant-fight-audio.ts out/dir kraken  # one giant only
//   ONLY=calls,voice,allcalls ...                        # just those kinds of render
//
// To listen to, in the out dir, for each giant (leviathan, kraken, dreamer):
//   <id>-calls              ten calls going from far and fresh to near and tired, then the last stand
//   <id>-music              a scripted 62 s fight's music alone (the hook's chord, acts 1 to 3, a warning and a
//                           surge every 5 to 6 s, the last stand's chord, spent, landed)
//   <id>-fight-storm        the same fight whole, over the Abyss's storm with its thunder, as it is heard in the
//                           game: the music, the giant's voice on each surge, the last stand, the landing sound
// and `all-calls`: a call from each giant in turn, twice round, to hear the three voices side by side.
//
// For the checks, in `checks/` under it:
//   reference               the storm alone and a bolt's thunder: the levels the fight plays against
//   <id>-landing            its landing sound alone, as the game has it (the level the fight stays under)
//   <id>-voice              sixteen calls close in: each one's voiceprint (spectral centroid, the shares of energy
//                           below 200 Hz and above 2 kHz, attack time, length). `voices.json` and the table printed
//                           at the end set the three giants' ranges side by side and say on which measures each
//                           pair does not overlap.
//   <id>-fight              the fight without the storm
//   <id>-ends               a fight lost, one restarted, the music switched off and on mid-fight, one landed
//   leviathan-music-noroom  the organ without its room, to see what the room costs to render
// Levels are at the output, after the master gain and the limiter. With ffmpeg on the path every WAV is also written
// as an MP3 (128 kbps).
//
// Set CHROME_PATH to the Chrome to use. Look at the pictures after any change to the voices or the music.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import type { Ask, Stats, Voiceprint } from './giant-fight-audio-page';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VITE_PORT = 5351;
const OUT = path.resolve(process.argv[2] ?? '.bench/giant-fight');
const CHECKS = path.join(OUT, 'checks');
const ALL = ['leviathan', 'kraken', 'dreamer'] as const;
const GIANTS = ALL.filter((id) => !process.argv[3] || process.argv[3] === id);
fs.mkdirSync(CHECKS, { recursive: true });

/** What to render, and whether it is one of the checks. */
const asks: [ask: Ask, check: boolean][] = [[{ kind: 'reference' }, true]];
for (const id of GIANTS) {
  asks.push([{ kind: 'landing', id }, true], [{ kind: 'voice', id }, true], [{ kind: 'calls', id }, false]);
  asks.push([{ kind: 'fight', id, storm: false, voices: false }, false], [{ kind: 'fight', id, storm: true }, false], [{ kind: 'fight', id, storm: false }, true], [{ kind: 'ends', id }, true]);
}
asks.push([{ kind: 'allcalls' }, false]);
if (GIANTS.includes('leviathan')) asks.push([{ kind: 'fight', id: 'leviathan', storm: false, voices: false, noRoom: true }, true]);

const only = process.env.ONLY?.split(',');
if (only) asks.splice(0, asks.length, ...asks.filter(([a]) => only.includes(a.kind)));

let ffmpeg = true;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  ffmpeg = false;
}

const vite = await createServer({ server: { port: VITE_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warn') && !/favicon|404/.test(m.text()) && console.error(m.text()));
  // Any same-origin page will do: the work is in the module imported from it.
  await page.goto(`http://localhost:${VITE_PORT}/scripts/giant-fight-audio-page.ts`, { waitUntil: 'load', timeout: 150_000 });
  const all: Stats[] = [];
  for (const [ask, check] of asks) {
    const r = (await page.evaluate(`import('/scripts/giant-fight-audio-page.ts').then((m) => m.run(${JSON.stringify(ask)}))`)) as { name: string; wav: string; png: string; stats: Stats; ms: number };
    const dir = check ? CHECKS : OUT;
    const file = path.join(dir, `${r.name}.wav`);
    fs.writeFileSync(file, Buffer.from(r.wav, 'base64'));
    fs.writeFileSync(path.join(dir, `${r.name}.png`), Buffer.from(r.png, 'base64'));
    if (ffmpeg) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-c:a', 'libmp3lame', '-b:a', '128k', path.join(dir, `${r.name}.mp3`)]);
    all.push(r.stats);
    console.log(`\n${r.name}   ${r.stats.seconds} s   peak ${r.stats.peakDb} dBFS   clipped ${r.stats.clipped}   rendered in ${r.ms} ms`);
    for (const s of r.stats.sections) {
      const v = s.voice;
      console.log(
        `  ${s.name.padEnd(34)} rms ${String(s.rmsDb).padStart(6)}  loudest 0.4 s ${String(s.loudDb).padStart(6)}  peak ${String(s.peakDb).padStart(6)} dBFS  centroid ${String(s.centroidHz).padStart(5)} Hz  over 150 Hz ${s.over150}` +
          (v ? `   call: centroid ${v.centroidHz} Hz, below 200 Hz ${v.below200}, above 2 kHz ${v.above2k}, attack ${v.attackMs} ms, length ${v.lengthS} s` : ''),
      );
    }
    if (Object.keys(r.stats.notes).length) console.log(`  ${JSON.stringify(r.stats.notes)}`);
  }
  // A run for one giant, or for some kinds, leaves the other numbers in place.
  const statsFile = path.join(OUT, 'stats.json');
  const kept: Stats[] = (process.argv[3] || only) && fs.existsSync(statsFile) ? (JSON.parse(fs.readFileSync(statsFile, 'utf8')) as Stats[]).filter((s) => !all.some((a) => a.name === s.name)) : [];
  const stats = [...kept, ...all];
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 1));

  // The three voices side by side: each measure's range over a giant's sixteen calls, and for each pair of giants
  // the measures on which their ranges do not overlap. Two or more a pair is the bar.
  const MEASURES: (keyof Voiceprint)[] = ['centroidHz', 'below200', 'above2k', 'attackMs', 'lengthS'];
  const ranges: Record<string, Record<string, [number, number]>> = {};
  for (const id of ALL) {
    const calls = stats.find((s) => s.name === `${id}-voice`)?.sections.map((s) => s.voice!);
    if (calls?.length) ranges[id] = Object.fromEntries(MEASURES.map((m) => [m, [Math.min(...calls.map((c) => c[m])), Math.max(...calls.map((c) => c[m]))]]));
  }
  const apart: Record<string, string[]> = {};
  const ids = Object.keys(ranges);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ranges[ids[i]], ranges[ids[j]]];
      apart[`${ids[i]} / ${ids[j]}`] = MEASURES.filter((m) => a[m][1] < b[m][0] || b[m][1] < a[m][0]);
    }
  }
  if (ids.length) {
    fs.writeFileSync(path.join(CHECKS, 'voices.json'), JSON.stringify({ ranges, apart }, null, 1));
    console.log('\nthe voices, each measure lowest to highest over sixteen calls close in:');
    for (const id of ids) console.log(`  ${id.padEnd(10)} ${MEASURES.map((m) => `${m} ${ranges[id][m][0]} to ${ranges[id][m][1]}`).join('   ')}`);
    for (const [pair, on] of Object.entries(apart)) console.log(`  ${pair}: apart on ${on.length ? on.join(', ') : 'nothing'}${on.length < 2 ? '   (fewer than two)' : ''}`);
  }
  console.log(`\nwritten to ${OUT}`);
} finally {
  await browser.close();
  await vite.close();
}
