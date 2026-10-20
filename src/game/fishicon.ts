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
  const eyeT = look.shape === 'eel' ? 0.07 : 0.11;
  const eye = opts.hidden ? '' : `<circle cx="${HEAD - eyeT * PX}" cy="${MID - sh.h * envelope(look.shape, eyeT) * PX * hScale * 0.3}" r="2.9" fill="#fff"/><circle cx="${HEAD - eyeT * PX + 0.8}" cy="${MID - sh.h * envelope(look.shape, eyeT) * PX * hScale * 0.3}" r="1.6" fill="${ink}"/>`;
  const glint = opts.shiny ? '<path d="M50 4l1.4 3.2 3.2 1.4-3.2 1.4L50 13.2l-1.4-3.2L45.4 8.6l3.2-1.4z" fill="#fff6c2"/>' : '';
  return `<svg class="fishico" viewBox="0 0 64 40" aria-hidden="true">
    <defs><linearGradient id="fg${k}" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="${back}"/><stop offset=".8" stop-color="${belly}"/></linearGradient><clipPath id="fc${k}"><path d="${body}"/></clipPath></defs>
    <path d="${TAIL_PATHS[look.tail]}" fill="${fin}"/>${dorsal}
    <path d="${body}" fill="url(#fg${k})" stroke="${ink}" stroke-opacity=".25" stroke-width=".8"/>
    <g clip-path="url(#fc${k})">${marks}</g>${extras}${eye}${glint}
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
