// Fits a bot hand to fights exported from the gauge lab (REELING.md, "The foundation"): replays each fight, lists what the
// gauge showed at each press and release, then scores candidate styles and reaction times by how closely the bot's
// presses and releases, made from the state of the player's own fight, match the player's (within 0.6 s).
// Run: npx tsx scripts/fitlab.ts <gauge-lab-fights.json>
import fs from 'node:fs';
import { mulberry } from '../src/game/env';
import { FIGHT_DT, GOOD_MAX, Reel, decodeHolds, type Gaps, type ReelTune } from '../src/game/reel';
import { HANDS, type BotStyle } from '../src/game/reelbot';

/** A lab fight; only the foundation's (`gaps`, with its levers in `gtune`) replay on today's fight. */
interface Logged { fish: string; gaps?: Gaps; gtune?: ReelTune; seed: number; holds: string; status: string; secs: number; frays: number }
interface Step { tension: number; need: number; surging: boolean; strain: number; frays: number; hold: boolean }

const fights: Logged[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const traces: { fish: string; steps: Step[] }[] = [];
for (const f of fights) {
  const bits = decodeHolds(f.holds);
  if (!bits || !f.gaps) continue;
  const r = new Reel(f.gaps, mulberry(f.seed), f.gtune);
  const steps: Step[] = [];
  for (let i = 0; i < bits.length * 8 && r.status === 'reeling'; i++) {
    const hold = ((bits[i >> 3] >> (i & 7)) & 1) === 1;
    steps.push({ tension: r.tension, need: r.need, surging: r.surging, strain: r.strain, frays: r.wear.frays, hold });
    r.update(FIGHT_DT, hold);
  }
  const ok = r.status === f.status && Math.abs(r.elapsed - f.secs) < 0.06 && r.wear.frays === f.frays;
  console.log(`${ok ? 'replays' : 'MISMATCH'}: ${f.fish} → ${r.status} ${r.elapsed.toFixed(1)} s, ${r.wear.frays} frays (logged ${f.status} ${f.secs} s)`);
  traces.push({ fish: f.fish, steps });
}

// What the gauge showed at each release and press: S/c for surge or calm, tension/pull, and the fray mark if in the red.
console.log('\nLet go and pressed (tension/pull·mark):');
for (const { fish, steps } of traces) {
  const rel: string[] = [], pre: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i];
    const at = `${s.surging ? 'S' : 'c'}${s.tension.toFixed(2)}/${s.need.toFixed(2)}`;
    if (steps[i - 1].hold && !s.hold) rel.push(at + (s.tension > GOOD_MAX ? `·${(s.strain * 2 - s.frays).toFixed(1)}` : ''));
    if (!steps[i - 1].hold && s.hold) pre.push(at);
  }
  console.log(`${fish}\n  let go:  ${rel.join(' ')}\n  pressed: ${pre.join(' ')}`);
}

/** The bot's wanted button at each step of a trace (reelbot's botFight decision, open loop on the player's fight). */
function wants(steps: Step[], style: BotStyle): boolean[] {
  let desired = true;
  return steps.map((s) => {
    const take = s.surging ? Math.min(s.need + style.lo, GOOD_MAX - Math.max(0, style.hi) - 0.03) : 0.6;
    const spent = style.push !== undefined && s.tension > GOOD_MAX && s.strain * 2 - s.frays > style.push;
    desired = desired ? s.tension <= GOOD_MAX - style.hi && !spent : s.tension < take;
    return desired;
  });
}
const events = (hold: boolean[]) => hold.flatMap((v, i) => (i > 0 && v !== hold[i - 1] ? [{ i, v }] : []));

/** Matches each of the player's presses and releases to the bot's nearest of the same kind within 0.6 s. */
function timing(style: BotStyle, react: number) {
  const lag = Math.round(react / FIGHT_DT), win = Math.round(0.6 / FIGHT_DT);
  let err = 0, matched = 0, missed = 0, extra = 0, bias = 0;
  for (const { steps } of traces) {
    const want = wants(steps, style);
    const bot = events(steps.map((_, i) => (i >= lag ? want[i - lag] : true)));
    const his = events(steps.map((s) => s.hold)).filter((e) => e.i > 30);
    const used = new Set<number>();
    for (const e of his) {
      let best = -1, bd = win + 1;
      bot.forEach((b, k) => {
        if (!used.has(k) && b.v === e.v && Math.abs(b.i - e.i) < bd) (bd = Math.abs(b.i - e.i)), (best = k);
      });
      if (best >= 0 && bd <= win) used.add(best), matched++, (err += bd), (bias += bot[best].i - e.i);
      else missed++;
    }
    extra += bot.length - used.size;
  }
  const mean = (err * FIGHT_DT) / Math.max(1, matched);
  return { cost: mean + (0.3 * (missed + extra)) / Math.max(1, matched + missed), matched, missed, extra, mean, bias: (bias * FIGHT_DT) / Math.max(1, matched) };
}

const cands: BotStyle[] = [];
for (const lo of [0.1, 0.2, 0.25, 0.3, 0.35, 0.45, 0.6])
  for (const hi of [-0.1, -0.06, -0.04, -0.02, 0, 0.02, 0.05, 0.08, 0.12])
    for (const push of hi < 0 ? [0.2, 0.35, 0.5, 0.65, 0.8, 0.95] : [undefined]) cands.push({ lo, hi, push });
const style = (s: BotStyle) => `lo ${s.lo} hi ${s.hi}${s.push !== undefined ? ` push ${s.push}` : ''}`;
const results = cands.flatMap((s) => [0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.2, 0.25, 0.3, 0.4, 0.5].map((react) => ({ s, react, t: timing(s, react) })));
results.sort((a, b) => a.t.cost - b.t.cost);
const total = traces.reduce((a, t) => a + events(t.steps.map((s) => s.hold)).filter((e) => e.i > 30).length, 0);
console.log(`\nBest fits (${total} presses and releases):`);
for (const r of results.slice(0, 8)) console.log(`  react ${r.react} s, ${style(r.s)}: matched ${r.t.matched}, missed ${r.t.missed}, extra ${r.t.extra}, off by ${r.t.mean.toFixed(2)} s (bot ${r.t.bias >= 0 ? 'late' : 'early'} ${Math.abs(r.t.bias).toFixed(2)} s)`);
console.log('Best by reaction time:');
for (const react of [0.06, 0.1, 0.14, 0.2, 0.3, 0.4, 0.5]) {
  const b = results.find((r) => r.react === react)!;
  console.log(`  ${react} s: matched ${b.t.matched}, missed ${b.t.missed}, extra ${b.t.extra}, off by ${b.t.mean.toFixed(2)} s (${style(b.s)})`);
}
for (const [name, h] of Object.entries(HANDS)) {
  const b = h.styles.map((s) => ({ s, t: timing(s, h.react) })).sort((x, y) => x.t.cost - y.t.cost)[0];
  console.log(`  HANDS.${name}: matched ${b.t.matched}, missed ${b.t.missed}, extra ${b.t.extra}, off by ${b.t.mean.toFixed(2)} s (${style(b.s)})`);
}
