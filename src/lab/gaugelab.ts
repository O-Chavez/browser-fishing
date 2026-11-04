/**
 * Gauge lab (dev only, `/gauge-lab.html`): play the game's reel fight (`Reel`, REELING.md "The foundation") on any fish
 * of the grid, a fish being its two gaps over the gear, with the game's gauge (`drawFightGauge`), the levers on sliders
 * and the reference hands (`HANDS` in reelbot.ts) beside it. Every fight is logged with its button presses, to export
 * for `scripts/fitlab.ts`.
 */
import { lineWorn } from '../game/dive';
import { mulberry } from '../game/env';
import { drawFightGauge } from '../game/fightgauge';
import { FIGHT_DT, HoldLog, P, Reel, type Gaps, type ReelTune } from '../game/reel';
import { handCell, type BotCell } from '../game/reelbot';

/** The grid: the fish's gaps over the gear, weight against the rod and strength against the line, -2..+3. */
const grid = { w: 0, s: 0 };
const gapsNow = (w = grid.w, s = grid.s): Gaps => ({ strength: s, weight: w });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const fishName = () => `Foundation · weight ${signed(grid.w)} · strength ${signed(grid.s)}`;

/** Levers to try live (`P`); a fight records all of `P` it was played with. */
interface Lever {
  label: string;
  min: number;
  max: number;
  step: number;
  base: number;
  apply: (v: number, t: ReelTune) => void;
}
const LEVERS: Record<string, Lever> = {
  give: { label: 'Line given letting go in a surge (×1 / 2.2 / 4 / 8 by strength)', min: 0, max: 0.5, step: 0.01, base: P.give, apply: (v, t) => (t.give = v) },
  slack: { label: 'Line taken with the button up in the calm', min: 0, max: 0.3, step: 0.01, base: P.slack, apply: (v, t) => (t.slack = v) },
  reel: { label: 'Reel speed in the calm (slower by weight)', min: 0.02, max: 0.3, step: 0.01, base: P.reel, apply: (v, t) => (t.reel = v) },
  win: { label: 'Line won holding above the threshold (per s)', min: 0, max: 0.2, step: 0.005, base: P.win, apply: (v, t) => (t.win = v) },
  lose: { label: 'Line lost holding, per unit below the threshold', min: 0, max: 2, step: 0.05, base: P.lose, apply: (v, t) => (t.lose = v) },
  fray: { label: 'Seconds to fill a fray mark (×)', min: 0.25, max: 3, step: 0.05, base: 1, apply: (v, t) => (t.fray = P.fray.map(([x, y]) => [x, y * v])) },
  tireDrop: { label: 'Threshold drops as the fish tires', min: 0, max: 0.4, step: 0.01, base: P.tireDrop, apply: (v, t) => (t.tireDrop = v) },
};
const lever: Record<string, number> = Object.fromEntries(Object.entries(LEVERS).map(([k, l]) => [k, l.base]));
function tune(): ReelTune | undefined {
  const t: ReelTune = {};
  for (const [k, l] of Object.entries(LEVERS)) if (lever[k] !== l.base) l.apply(lever[k], t);
  return Object.keys(t).length ? t : undefined;
}

/**
 * Every fight played here, with the button press by press (`HoldLog`, as the server replays a catch), kept in this
 * browser and exported as JSON: `new Reel(gaps, mulberry(seed), gtune)` and the holds replay it exactly, and `gtune`
 * holds every lever it was played with, so later changes to `P` don't change a replay. Fights logged under the old
 * fight (no `gaps`) are kept but no longer replay.
 */
interface FightRecord {
  at: string;
  rules?: 'foundation' | 'today';
  gaps?: Gaps;
  gtune?: ReelTune;
  fish: string;
  seed: number;
  holds: string;
  status: string;
  clean: boolean;
  frays: number;
  secs: number;
  lineOut: number;
  metres: number;
}
const LOG_KEY = 'gaugeLab.fights';
const log: FightRecord[] = JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');

const $ = (id: string) => document.getElementById(id)!;
let seed = 1;
let reel = new Reel(gapsNow(), mulberry(seed), tune());
let holds = new HoldLog();
let logged = false;
let holding = false;
let paused = false;
let frayFlash = 0;
let lastFrays = 0;

/**
 * The reference hands on a fish: 20 fish per style, the best style's results, seeded as `scripts/gaugesim.ts` seeds
 * them, so a lever change is the only thing that moves them.
 */
const HAND_N = 20;
const pct = (x: number) => `${Math.round(x * 100)}%`;
function showHands(): void {
  const el = $('hands');
  el.innerHTML = '<div class="hint">Running the hands…</div>';
  const at = reel;
  setTimeout(() => {
    if (at !== reel) return;
    const line = (name: string, c: BotCell) => `<div class="row"><span>${name}</span><b>${pct(c.land)} · ${c.t.toFixed(0)} s · ${pct(c.clean)} clean</b></div>`;
    el.innerHTML =
      line('Best quick play lands', handCell(gapsNow(), 'best', HAND_N, tune())) +
      line('Your habit lands', handCell(gapsNow(), 'skilled', HAND_N, tune())) +
      line('Careful hand lands', handCell(gapsNow(), 'careful', HAND_N, tune()));
  }, 30);
}
/** Your habit (riding the red's edge, which plays as well as the best play here and runs much quicker) and the careful hand across the grid, for these levers. */
let gridHands: { key: string; cells: Map<string, { skilled: BotCell; careful: BotCell }> } | null = null;
const gridKey = () => JSON.stringify(lever);
function runGridHands(): void {
  const key = gridKey();
  const cells = new Map<string, { skilled: BotCell; careful: BotCell }>();
  gridHands = { key, cells };
  const todo: [number, number][] = [];
  for (let s = 3; s >= -2; s--) for (let w = -2; w <= 3; w++) todo.push([w, s]);
  const next = () => {
    if (gridHands?.key !== key || gridHands.cells !== cells) return;
    const [w, s] = todo.shift()!;
    cells.set(`${w},${s}`, { skilled: handCell(gapsNow(w, s), 'skilled', HAND_N, tune()), careful: handCell(gapsNow(w, s), 'careful', HAND_N, tune()) });
    buildPanel();
    if (todo.length) setTimeout(next, 0);
  };
  setTimeout(next, 0);
}

function record(status: string): void {
  logged = true;
  const r = reel;
  log.push({
    at: new Date().toISOString(),
    rules: 'foundation',
    gaps: gapsNow(),
    gtune: { ...P, ...tune() },
    fish: fishName(),
    seed,
    holds: holds.encode(),
    status,
    clean: r.clean,
    frays: r.wear.frays,
    secs: Math.round(r.elapsed * 10) / 10,
    lineOut: Math.round(r.wear.lineOut * 1000) / 1000,
    metres: Math.round(lineWorn(r.wear, r.status === 'caught') * 10) / 10,
  });
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
  buildPanel();
}

function start(newSeed: boolean): void {
  // A fight left unfinished after a few seconds still counts as played.
  if (!logged && reel.status === 'reeling' && reel.elapsed > 5) record('quit');
  if (newSeed) seed = (seed * 9301 + 49297) % 233280 || 1;
  reel = new Reel(gapsNow(), mulberry(seed), tune());
  holds = new HoldLog();
  logged = false;
  frayFlash = 0;
  lastFrays = 0;
  $('result').textContent = '';
  $('result').style.background = '';
  if (gridHands && gridHands.key !== gridKey()) gridHands = null;
  buildPanel();
  showHands();
}

function button(html: string, on: boolean, click: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.innerHTML = html;
  b.className = `${cls}${on ? ' on' : ''}`;
  b.onclick = click;
  return b;
}

function buildPanel(): void {
  const fish = $('fish');
  fish.innerHTML = '';
  const h = (t: string) => Object.assign(document.createElement('h4'), { textContent: t });
  // Strength against the line down the side (+3 at the top), weight against the rod across.
  fish.appendChild(h('Weight vs rod → · strength vs line ↑'));
  const table = document.createElement('div');
  table.className = 'grid';
  table.appendChild(document.createElement('span'));
  for (let w = -2; w <= 3; w++) table.appendChild(Object.assign(document.createElement('span'), { textContent: signed(w), className: 'ax' }));
  for (let s = 3; s >= -2; s--) {
    table.appendChild(Object.assign(document.createElement('span'), { textContent: signed(s), className: 'ax' }));
    for (let w = -2; w <= 3; w++) {
      const mine = log.filter((f) => f.gaps?.weight === w && f.gaps.strength === s);
      const won = mine.filter((f) => f.status === 'caught').length;
      const tally = mine.length ? `<small>${won}/${mine.length}</small>` : '';
      const bots = gridHands?.cells.get(`${w},${s}`);
      const hand = bots ? `<small class="hs">${Math.round(bots.skilled.land * 100)}</small><small class="hc">${Math.round(bots.careful.land * 100)}</small>` : '';
      table.appendChild(button(`${w === 0 && s === 0 ? '<i>●</i>' : ''}${tally}${hand}`, grid.w === w && grid.s === s, () => ((grid.w = w), (grid.s = s), start(true)), 'cell'));
    }
  }
  fish.appendChild(table);
  fish.appendChild(Object.assign(document.createElement('div'), {
    className: 'hint',
    innerHTML: 'Cells: the fish\'s gaps over the gear. Your fish landed / played, then the hands\' land % (<span class="hs">your habit</span>, <span class="hc">careful</span>). ● is matched gear.',
  }));
  fish.appendChild(button(gridHands ? (gridHands.cells.size < 36 ? `Running the hands… ${gridHands.cells.size}/36` : 'Hands on the grid: done') : 'Run the hands on the grid <small>for these levers</small>', false, runGridHands));

  const levers = $('levers');
  if (!levers.childElementCount) {
    for (const [k, l] of Object.entries(LEVERS)) {
      const row = document.createElement('label');
      row.className = 'lever';
      const val = document.createElement('b');
      const input = Object.assign(document.createElement('input'), { type: 'range', min: String(l.min), max: String(l.max), step: String(l.step), value: String(lever[k]) });
      const show = () => {
        val.textContent = `${lever[k]}${lever[k] === l.base ? '' : ` (was ${l.base})`}`;
        row.classList.toggle('moved', lever[k] !== l.base);
      };
      input.oninput = () => ((lever[k] = Number(input.value)), show());
      input.onchange = () => start(false);
      row.append(Object.assign(document.createElement('span'), { textContent: l.label }), val, input);
      show();
      levers.appendChild(row);
    }
    levers.appendChild(button('Reset levers', false, () => {
      for (const [k, l] of Object.entries(LEVERS)) lever[k] = l.base;
      levers.innerHTML = '';
      start(false);
    }));
  }
  $('logcount').textContent = `${log.length} fight${log.length === 1 ? '' : 's'} recorded`;
}
$('again').onclick = () => start(false);
$('next').onclick = () => start(true);
$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(log, null, 1)], { type: 'application/json' }));
  a.download = `gauge-lab-fights-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
  a.click();
};
$('clear').onclick = () => {
  if (!confirm(`Delete all ${log.length} recorded fights from this browser?`)) return;
  log.length = 0;
  localStorage.removeItem(LOG_KEY);
  buildPanel();
};

// Hold anywhere outside the panels, or Space.
for (const el of [$('hold'), $('stage')]) el.addEventListener('pointerdown', () => (holding = true));
window.addEventListener('pointerup', () => (holding = false));
window.addEventListener('pointercancel', () => (holding = false));
window.addEventListener('blur', () => (holding = false));
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'range') return;
  if (e.code === 'Space') {
    holding = true;
    e.preventDefault();
  } else if (e.code === 'KeyR') start(false);
  else if (e.code === 'KeyN') start(true);
  else if (e.code === 'KeyP') paused = !paused;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') holding = false;
});

/** Canvas units: the game's gauge units (radius 96), scaled to fit; the gauge's centre sits this far down. */
const UNITS = 306;
const CY = 172;

function stats(r: Reel): void {
  const rows: [string, string][] = [
    ['Fish', fishName()],
    ['Seed', String(seed)],
    ['Time', `${r.elapsed.toFixed(1)} s`],
    ['Line won', `${Math.round(r.progress * 100)}%`],
    ['Line taken', `${r.wear.lineOut.toFixed(2)} · ${lineWorn(r.wear, r.status === 'caught').toFixed(0)} m of spool`],
    ['Frays', `${r.wear.frays} / 2`],
    ['Strain on the next mark', `${Math.round(Math.min(1, Math.max(0, r.strain * 2 - r.wear.frays)) * 100)}%`],
    ['Pull marker (full build-up)', r.surgePulls[1].toFixed(2)],
    ['Pull right now', r.need.toFixed(2)],
    ['Threshold (at the hook → now)', `${r.baseThreshold.toFixed(2)} → ${r.threshold.toFixed(2)}`],
    ['Tension', r.tension.toFixed(2)],
    ['Line per s right now', r.lineRate.toFixed(3)],
    ['Fight left', `${Math.round(r.fightLeft * 100)}%`],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  if (r.status !== 'reeling' && !$('result').textContent) {
    const res = $('result');
    res.textContent = r.status === 'caught' ? (r.clean ? 'Landed, clean!' : `Landed, ${r.wear.frays} fray`) : r.status === 'snapped' ? 'Snapped' : 'Ran off';
    res.style.background = r.status === 'caught' ? '#2f7a4a' : '#8a2a22';
  }
}

const now = $('now') as HTMLCanvasElement;
let last = performance.now();
let acc = 0;
let statsT = 0;
function frame(ms: number): void {
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms;
  if (!paused) acc += dt;
  while (acc >= FIGHT_DT) {
    acc -= FIGHT_DT;
    if (reel.status === 'reeling') {
      holds.push(holding);
      reel.update(FIGHT_DT, holding);
    }
    frayFlash = Math.max(0, frayFlash - FIGHT_DT);
  }
  const r = reel;
  if (r.status !== 'reeling' && !logged) record(r.status);
  if (r.wear.frays > lastFrays) frayFlash = 1.2;
  lastFrays = r.wear.frays;
  const ctx = now.getContext('2d')!;
  const s = now.width / UNITS;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, UNITS, UNITS * 2);
  now.classList.toggle('shake', drawFightGauge(ctx, UNITS / 2, CY, r, ms / 1000, { holding, frayFlash }));
  statsT -= dt;
  if (statsT <= 0) {
    stats(r);
    statsT = 0.1;
  }
  requestAnimationFrame(frame);
}
// For headless staging: the fight, the button, and a grid cell to play.
(window as unknown as { __lab: object }).__lab = {
  get reel() { return reel; },
  hold: (on: boolean) => (holding = on),
  pick: (w: number, s: number) => ((grid.w = w), (grid.s = s), start(true)),
};
buildPanel();
showHands();
requestAnimationFrame(frame);
