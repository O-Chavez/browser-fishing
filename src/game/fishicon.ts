import { FISH } from '../data/content';
import { FISH_LOOK, SHAPES, envelope, type FishLook, type TailKind } from '../data/fishlook';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
let uid = 0;

/** Head at the right, tail root at the left; the body spans these x pixels in a 64×40 box. */
const HEAD = 57;
const ROOT = 15;
const MID = 20;
const PX = HEAD - ROOT;

const TAIL_PATHS: Record<TailKind, string> = {
  fork: `M${ROOT + 1} ${MID} L3 ${MID - 9} L7 ${MID} L3 ${MID + 9} Z`,
  round: `M${ROOT + 1} ${MID - 2} Q2 ${MID - 10} 3 ${MID} Q2 ${MID + 10} ${ROOT + 1} ${MID + 2} Z`,
  lunate: `M${ROOT + 1} ${MID} L6 ${MID - 12} Q9 ${MID} 6 ${MID + 12} Z`,
  shark: `M${ROOT + 1} ${MID} L2 ${MID - 10} L8 ${MID + 1} L6 ${MID + 5} Z`,
  eel: `M${ROOT + 1} ${MID - 2} Q6 ${MID} ${ROOT + 1} ${MID + 2} Z`,
};

/**
 * A small side-on fish icon for the UI, drawn from the same shape and colours as the 3D model:
 * the species' silhouette, back-to-belly shading, signature markings and a cartoon eye.
 * `hidden` draws a dark silhouette for undiscovered species; `shiny` adds a gold tint and glint.
 * The tier adds a finish, as on the 3D model: a gloss streak from tier 3, a coloured glow, gems and
 * sparkles on jewels (4), and on spirits (5) a stronger glow, a crown and their signature flourish.
 */
export function fishIcon(id: string, opts: { hidden?: boolean; shiny?: boolean } = {}): string {
  const look: FishLook | undefined = FISH_LOOK[id];
  if (!look) return '';
  const sh = SHAPES[look.shape];
  const gold = (c: number) => (opts.shiny ? mix(c, 0xffd23a, 0.55) : c);
  const ink = '#2a1b0f';
  const back = opts.hidden ? ink : hex(gold(look.back));
  const belly = opts.hidden ? ink : hex(gold(look.belly));
  const fin = opts.hidden ? ink : hex(gold(look.fin));
  // Eels and long fish would be hair-thin at true proportions; give icons a minimum height.
  const hScale = Math.max(1, 0.12 / sh.h) ** 0.5;
  const top: string[] = [];
  const bottom: string[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const env = envelope(look.shape, t);
    const x = HEAD - t * PX;
    top.push(`${x.toFixed(1)} ${(MID - sh.h * env * PX * hScale).toFixed(1)}`);
    bottom.unshift(`${x.toFixed(1)} ${(MID + (sh.h + sh.sag) * env * PX * hScale).toFixed(1)}`);
  }
  const body = `M${top.join(' L')} L${bottom.join(' L')} Z`;
  const k = ++uid;
  const topAt = (t: number) => MID - sh.h * envelope(look.shape, t) * PX * hScale;

  let dorsal = '';
  if (look.dorsal !== 'none') {
    const [a, b, tall] = { small: [0.4, 0.55, 5], soft: [0.36, 0.56, 7], spiny: [0.28, 0.6, 7], long: [0.22, 0.8, 4], sail: [0.2, 0.7, 12] }[look.dorsal];
    const xa = HEAD - a * PX;
    const xb = HEAD - b * PX;
    const tip = look.dorsal === 'spiny' ? `L${xa - 3} ${topAt(a) - tall} L${xa - 6} ${topAt(a) - tall * 0.5} L${xa - 9} ${topAt(a) - tall} L${xa - 12} ${topAt(a) - tall * 0.4}` : `L${xa - 2} ${topAt(a) - tall} L${(xa + xb) / 2} ${topAt((a + b) / 2) - tall * 0.8}`;
    dorsal = `<path d="M${xa} ${topAt(a) + 1} ${tip} L${xb} ${topAt(b) + 1} Z" fill="${fin}"/>`;
  }

  let marks = '';
  if (!opts.hidden) {
    const rng = seeded(id);
    for (const m of look.marks ?? []) {
      const c = hex(gold(m.color));
      if (m.k === 'stripe') marks += `<rect x="${ROOT}" y="${MID - 1 - (m.width ?? 0.08) * 12}" width="${PX - 4}" height="${2 + (m.width ?? 0.08) * 24}" fill="${c}" opacity=".9"/>`;
      if (m.k === 'bars') for (let i = 0; i < m.n; i++) marks += `<rect x="${HEAD - (0.22 + (i / m.n) * 0.62) * PX - 2}" y="0" width="2.6" height="${MID + 2}" fill="${c}" opacity=".8"/>`;
      if (m.k === 'spots' || m.k === 'speckle' || m.k === 'stars' || m.k === 'glowdots') {
        const n = m.k === 'speckle' ? 22 : m.k === 'stars' ? 16 : m.k === 'glowdots' ? 6 : Math.min(10, m.n);
        for (let i = 0; i < n; i++) {
          const x = m.k === 'glowdots' ? HEAD - (0.2 + i * 0.12) * PX : HEAD - (0.12 + rng() * 0.8) * PX;
          const y = m.k === 'glowdots' ? MID + 2 : MID - 7 + rng() * 10;
          marks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${m.k === 'spots' ? 1.6 : 0.9}" fill="${c}"/>`;
        }
      }
      if (m.k === 'patches') for (let i = 0; i < 3; i++) marks += `<ellipse cx="${(HEAD - (0.2 + rng() * 0.55) * PX).toFixed(1)}" cy="${(MID - 6 + rng() * 6).toFixed(1)}" rx="${5 + rng() * 3}" ry="${4 + rng() * 2}" fill="${c}"/>`;
      if (m.k === 'earspot') marks += `<circle cx="${HEAD - 0.17 * PX}" cy="${MID - 1}" r="2.2" fill="${c}"/>`;
    }
  }
  const ex = look.extras ?? [];
  let extras = '';
  if (ex.includes('snout')) extras += `<path d="M${HEAD - 1} ${MID - 1} L${HEAD + 7} ${MID} L${HEAD - 1} ${MID + 1.5} Z" fill="${back}"/>`;
  if (!opts.hidden && (ex.includes('whiskers') || ex.includes('barbels'))) {
    const len = ex.includes('whiskers') ? 9 : 4;
    extras += `<path d="M${HEAD - 2} ${MID + 1} q2 ${len * 0.6} ${-len * 0.4} ${len}" stroke="${ink}" stroke-width=".9" fill="none"/>`;
  }
  if (!opts.hidden && ex.includes('lantern')) extras += `<path d="M${HEAD - 4} ${topAt(0.1)} q3 -8 7 -7" stroke="${fin}" stroke-width="1" fill="none"/><circle cx="${HEAD + 3}" cy="${topAt(0.1) - 7}" r="2.3" fill="${hex(look.accent ?? 0x7dffd8)}"/>`;
  const tier = opts.hidden ? 1 : (FISH.find((f) => f.id === id)?.tier ?? 1);
  const accent = hex(opts.shiny ? 0xffe27a : look.accent ?? mix(look.fin, 0xffffff, 0.4));
  const eyeT = look.shape === 'eel' ? 0.07 : 0.11;
  const ex0 = HEAD - eyeT * PX;
  const ey = MID - sh.h * envelope(look.shape, eyeT) * PX * hScale * 0.3;
  const iris = tier >= 4 ? `<circle cx="${ex0 + 0.6}" cy="${ey}" r="2" fill="${accent}"/>` : '';
  const eye = opts.hidden ? '' : `<circle cx="${ex0}" cy="${ey}" r="2.9" fill="#fff"/>${iris}<circle cx="${ex0 + 0.8}" cy="${ey}" r="${tier >= 4 ? 1.1 : 1.6}" fill="${ink}"/>`;
  // The shiny glint moves aside on spirits so it doesn't sit on the crown.
  const gx = tier >= 5 ? -12 : 0;
  const glint = opts.shiny ? `<path d="M${50 + gx} 4l1.4 3.2 3.2 1.4-3.2 1.4L${50 + gx} 13.2l-1.4-3.2L${45.4 + gx} 8.6l3.2-1.4z" fill="#fff6c2"/>` : '';

  // Tier finish. Behind the fish: a blurred glow in the accent colour. On top: gloss, gems, crown, sparkles.
  const spark = (x: number, y: number, r: number, c = '#fff') => `<path d="M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z" fill="${c}"/>`;
  let defs = '';
  let under = '';
  let gloss = '';
  let over = '';
  if (tier >= 3) gloss = `<ellipse cx="${HEAD - 0.4 * PX}" cy="${topAt(0.4) + 2.4}" rx="${PX * 0.28}" ry="1.3" fill="#fff" opacity="${tier >= 4 ? 0.5 : 0.35}"/>`;
  if (tier >= 4) {
    defs += `<filter id="fb${k}" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${tier >= 5 ? 2.6 : 1.8}"/></filter>`;
    under = `<g filter="url(#fb${k})" opacity="${tier >= 5 ? 0.95 : 0.75}"><path d="${body}" fill="${accent}" stroke="${accent}" stroke-width="${tier >= 5 ? 4 : 2.5}"/><path d="${TAIL_PATHS[look.tail]}" fill="${accent}"/></g>`;
    over += spark(8, 6, 2.6) + spark(60, 33, 2);
  }
  if (tier === 4) {
    // A row of gems along the flank.
    for (let i = 0; i < 4; i++) {
      const x = HEAD - (0.3 + i * 0.14) * PX;
      gloss += `<path d="M${x} ${MID - 1.8}l1.3 1.8-1.3 1.8-1.3-1.8z" fill="${accent}" stroke="#fff" stroke-width=".5"/>`;
    }
  }
  if (tier >= 5) {
    const hx = HEAD - 0.16 * PX;
    const hy = topAt(0.16) - 2;
    // A little crown of light floating over the head.
    over += `<path d="M${hx - 5} ${hy} L${hx - 5} ${hy - 4} L${hx - 2.5} ${hy - 2} L${hx} ${hy - 6} L${hx + 2.5} ${hy - 2} L${hx + 5} ${hy - 4} L${hx + 5} ${hy} Z" fill="#ffe27a" stroke="${accent}" stroke-width=".8"/>`;
    over += spark(30, 4, 2.2, accent) + spark(4, 32, 1.8);
    if (look.spirit === 'flame') for (let i = 0; i < 3; i++) {
      const x = HEAD - (0.32 + i * 0.13) * PX;
      const y = topAt(0.32 + i * 0.13);
      under += `<path d="M${x - 2} ${y} Q${x - 2.5} ${y - 5} ${x + 1} ${y - 9 + i} Q${x + 1} ${y - 4} ${x + 2.5} ${y} Z" fill="${i % 2 ? '#ffd040' : '#ff5a10'}"/>`;
    }
    if (look.spirit === 'aurora' || look.spirit === 'ghost')
      under += `<path d="M${ROOT} ${MID - 1} C10 ${MID - 7} 6 ${MID + 4} 0 ${MID - 3}" stroke="${accent}" stroke-width="2" fill="none" opacity=".8"/><path d="M${ROOT} ${MID + 1} C10 ${MID + 6} 6 ${MID - 3} 0 ${MID + 5}" stroke="${look.spirit === 'aurora' ? '#c58aff' : accent}" stroke-width="1.6" fill="none" opacity=".7"/>`;
  }
  return `<svg class="fishico${tier >= 4 ? ` t${tier}` : ''}" viewBox="0 0 64 40" aria-hidden="true">
    <defs><linearGradient id="fg${k}" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="${back}"/><stop offset=".8" stop-color="${belly}"/></linearGradient><clipPath id="fc${k}"><path d="${body}"/></clipPath>${defs}</defs>
    ${under}<path d="${TAIL_PATHS[look.tail]}" fill="${fin}"/>${dorsal}
    <path d="${body}" fill="url(#fg${k})" stroke="${ink}" stroke-opacity=".25" stroke-width=".8"/>
    <g clip-path="url(#fc${k})">${marks}${gloss}</g>${extras}${eye}${over}${glint}
  </svg>`;
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => [(a >> s) & 255, (b >> s) & 255];
  const out = [16, 8, 0].map((s) => { const [x, y] = ch(s); return Math.round(x + (y - x) * t) << s; });
  return out[0] | out[1] | out[2];
}

function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
