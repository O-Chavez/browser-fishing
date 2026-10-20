import { cosById, type Cosmetic } from '../data/cosmetics';

/**
 * A small inline-SVG icon per cosmetic, drawn in the item's own colours with the same dark outline
 * as the rod icons so it reads on parchment and wood alike. Mythic items get a glint and
 * legendary items twinkle with stars, matching the 3D models.
 */

const INK = '#2a1b0f';
const GOLD = '#e0b441';
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const line = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
let uid = 0;

const star = (x: number, y: number, r: number, fill = '#fff6c8') =>
  `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z" fill="${fill}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/>`;
const glint = (x: number, y: number) => `<path d="M${x} ${y}l2.5 -2.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>`;

/** The T-shirt outline every shirt icon starts from. */
const SHIRT = 'M11 8 L16 5.5 Q20 9 24 5.5 L29 8 L36 14 L31.5 18.5 L29 16.5 L29 34.5 L11 34.5 L11 16.5 L8.5 18.5 L4 14 Z';
const COAT = 'M11 8 L16 5.5 Q20 9 24 5.5 L29 8 L36 14 L31.5 18.5 L29.5 16.5 L31 37 L9 37 L10.5 16.5 L8.5 18.5 L4 14 Z';
/** A necklace hanging in a U, with the pendant point at (20, 27). */
const NECK = 'M7 6 Q9 25 20 26 Q31 25 33 6';

function hat(c: Cosmetic): string {
  const col = hex(c.color);
  const acc = hex(c.accent);
  switch (c.id) {
    case 'cap':
      return `<path d="M7 26 Q7 11 20 11 Q31 11 31 26 Z" fill="${col}" ${line}/><path d="M20 11 V26" stroke="${INK}" stroke-width=".9" opacity=".4"/><path d="M27 26 H38 Q38 29.5 34 29.5 H26 Z" fill="${acc}" ${line}/><circle cx="20" cy="10.5" r="2" fill="${acc}" ${line}/>`;
    case 'straw':
      return `<ellipse cx="20" cy="27" rx="18" ry="5" fill="${col}" ${line}/><path d="M11 27 L13 13 Q20 10 27 13 L29 27 Z" fill="${col}" ${line}/><path d="M12 21 H28 L28.6 25 H11.4 Z" fill="${acc}" ${line}/><circle cx="25" cy="23" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="25" cy="23" r="1" fill="#ffd84a"/>`;
    case 'bucket':
      return `<path d="M4 29 L10 22 H30 L36 29 Q20 33 4 29 Z" fill="${col}" ${line}/><path d="M11 23 L13 10 Q20 8 27 10 L29 23 Z" fill="${col}" ${line}/><path d="M11.6 19 H28.4 L29 23 H11 Z" fill="#43593a" ${line}/><path d="M24 17 L31 13" stroke="${acc}" stroke-width="3" stroke-linecap="round"/><circle cx="31.5" cy="12.5" r="2.4" fill="#ffd84a" ${line}/>`;
    case 'captain':
      return `<path d="M5 15 Q20 6 35 15 L31 22 H9 Z" fill="${col}" ${line}/><rect x="9" y="21" width="22" height="5.5" fill="${acc}" ${line}/><path d="M10 26.5 H31 Q31 32 21 32 Q12 32 10 26.5 Z" fill="#1b1b24" ${line}/><path d="M20 12 V19 M17 13.5 H23 M17 17 Q20 20.5 23 17" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
    case 'horned':
      return `<path d="M4 28 Q20 34 36 28 Q32 24 20 24.5 Q8 24 4 28 Z" fill="${col}" ${line}/><path d="M10 25 L12 12 Q16 9 20 12 Q24 9 28 12 L30 25 Z" fill="${col}" ${line}/><path d="M10.6 21 H29.4 L30 25 H10 Z" fill="#183128" ${line}/><rect x="18" y="20.5" width="4.5" height="4.5" fill="${GOLD}" ${line}/><path d="M11 22 Q6 10 12 2 Q14 12 13 22 Z" fill="${acc}" ${line}/><path d="M11.8 5 Q12 4 12 2" stroke="#50606e" stroke-width="2"/>`;
    case 'crown':
      return `<path d="M6 28 L5 11 L12 18 L16 7 L20 16 L24 7 L28 18 L35 11 L34 28 Z" fill="${col}" ${line}/><rect x="6" y="27" width="28" height="5" rx="1" fill="#c99a3c" ${line}/><circle cx="5" cy="10" r="1.8" fill="#fff5ee" ${line}/><circle cx="16" cy="6" r="1.8" fill="#fff5ee" ${line}/><circle cx="24" cy="6" r="1.8" fill="#fff5ee" ${line}/><circle cx="35" cy="10" r="1.8" fill="#fff5ee" ${line}/><path d="M20 19 L23 23 L20 27 L17 23 Z" fill="${acc}" ${line}/><circle cx="11" cy="29.5" r="1.3" fill="#ff4f6a"/><circle cx="29" cy="29.5" r="1.3" fill="#ff4f6a"/>`;
    case 'visor':
      return `<path d="M7 18 Q20 13 33 18 L33 23 Q20 19 7 23 Z" fill="${col}" ${line}/><path d="M7 23 Q20 19 33 23 Q30 33 20 33 Q10 33 7 23 Z" fill="#2fa66a" ${line}/><path d="M8 23.5 Q20 19.5 32 23.5" stroke="${acc}" stroke-width="2" fill="none"/><path d="M7.5 18 Q20 13 32.5 18" stroke="${acc}" stroke-width="1.6" fill="none"/>`;
    case 'tophat':
      return `<path d="M3 30 Q20 36 37 30 Q35 27 20 27 Q5 27 3 30 Z" fill="${col}" ${line}/><path d="M11 28 L12 5 H28 L29 28 Z" fill="${col}" ${line}/><path d="M11.7 21 H28.3 L28.6 26 H11.4 Z" fill="${acc}" ${line}/><path d="M20 9 Q24 13 22.5 15.5 Q21 16.5 20 15 Q19 16.5 17.5 15.5 Q16 13 20 9 Z M20 15 L21 18 H19 Z" fill="${GOLD}" stroke="${INK}" stroke-width=".9"/><path d="M14.5 7 V18" stroke="#fff" stroke-width="1.2" opacity=".35"/>`;
  }
  return '';
}

function shirt(c: Cosmetic, clip: string): string {
  const col = hex(c.color);
  const acc = hex(c.accent);
  const body = (fill: string, path = SHIRT) => `<path d="${path}" fill="${fill}" ${line}/>`;
  const collar = (stroke: string) => `<path d="M16 5.5 Q20 9.5 24 5.5" stroke="${stroke}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  switch (c.id) {
    case 'tee':
      return body(col) + collar(acc) + `<path d="M11 32 H29" stroke="${acc}" stroke-width="1.4"/>`;
    case 'striped':
      return `<defs><clipPath id="${clip}"><path d="${SHIRT}"/></clipPath></defs>${body(col)}<g clip-path="url(#${clip})" fill="${acc}"><rect x="0" y="12" width="40" height="3"/><rect x="0" y="19" width="40" height="3"/><rect x="0" y="26" width="40" height="3"/></g><path d="${SHIRT}" fill="none" ${line}/>${collar(acc)}`;
    case 'vest':
      return `${body('#ece4d0')}<path d="M11 8 L16 5.5 L18.5 13 L18.5 34.5 H11 Z M29 8 L24 5.5 L21.5 13 L21.5 34.5 H29 Z" fill="${col}" ${line}/><rect x="12.5" y="17" width="5" height="4.5" fill="${acc}" ${line}/><rect x="22.5" y="17" width="5" height="4.5" fill="${acc}" ${line}/><rect x="12.5" y="25" width="5" height="4.5" fill="${acc}" ${line}/><rect x="22.5" y="25" width="5" height="4.5" fill="${acc}" ${line}/><path d="M13 13 l3 -2.5" stroke="#ff6a3d" stroke-width="2" stroke-linecap="round"/><path d="M24.5 11 l3 2.5" stroke="#4fc3f7" stroke-width="2" stroke-linecap="round"/>`;
    case 'hawaiian': {
      const flower = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${acc}" stroke="${INK}" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="1" fill="#ffd84a"/>`;
      return `${body(col)}${flower(15, 15)}${flower(25, 21)}${flower(14, 28)}${flower(26, 31)}${flower(8, 15)}${flower(32, 15)}<path d="M16 5.5 L20 12 L24 5.5 L22 11.5 L20 12 L18 11.5 Z" fill="#fff" ${line}/>`;
    }
    case 'coat':
      return `${body(col, COAT)}<path d="M15 6 L20 15 L25 6 L27 9 L20 19 L13 9 Z" fill="#141f3a" ${line}/>${[17, 23, 29].map((y) => `<circle cx="17" cy="${y}" r="1.4" fill="${acc}"/><circle cx="23" cy="${y}" r="1.4" fill="${acc}"/>`).join('')}`;
    case 'cloak':
      return `<path d="M7 10 Q20 4 33 10 L38 38 H2 Z" fill="#3d2a8f" ${line}/><path d="M3 36.5 H37" stroke="${acc}" stroke-width="2.4"/>${body(col, COAT)}<path d="M15 6 Q20 10 25 6" stroke="#ff7ad9" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M9.5 35.5 H30.5" stroke="${acc}" stroke-width="2"/>${star(20, 14, 3.5)}`;
    case 'dealer':
      return `${body('#f6f2e8')}<path d="M11 8 L16 5.5 L19 14 L19 34.5 H11 Z M29 8 L24 5.5 L21 14 L21 34.5 H29 Z" fill="${col}" ${line}/><path d="M15.5 10 L20 12 L24.5 10 L24.5 14.5 L20 12.5 L15.5 14.5 Z" fill="${acc}" stroke="${INK}" stroke-width="1"/>${[19, 24, 29].map((y) => `<circle cx="20" cy="${y}" r="1.3" fill="${GOLD}" stroke="${INK}" stroke-width=".6"/>`).join('')}`;
    case 'tux':
      return `${body(col, COAT)}<path d="M16 5.5 L20 22 L24 5.5 Z" fill="#f6f2e8" stroke="${INK}" stroke-width="1"/><path d="M16 5.5 L20 22 L14 12 Z M24 5.5 L20 22 L26 12 Z" fill="${acc}" stroke="${INK}" stroke-width="1"/><path d="M15.5 9 L20 11 L24.5 9 L24.5 13.5 L20 11.5 L15.5 13.5 Z" fill="#ff4f9a" stroke="${INK}" stroke-width="1"/><path d="M25 18 L28 17 L28 20 Z" fill="#ff4f9a"/><circle cx="20" cy="27" r="1.4" fill="${acc}" stroke="${INK}" stroke-width=".6"/>`;
  }
  return '';
}

function jewelry(c: Cosmetic): string {
  const col = hex(c.color);
  const acc = hex(c.accent);
  const chain = (stroke: string, w = 2.4) => `<path d="${NECK}" fill="none" stroke="${INK}" stroke-width="${w + 1.8}" stroke-linecap="round"/><path d="${NECK}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  switch (c.id) {
    case 'shell':
      return `${chain(col, 1.6)}<path d="M20 36 L13 28 Q20 21 27 28 Z" fill="${acc}" ${line}/><path d="M20 36 L17 25.5 M20 36 V24.5 M20 36 L23 25.5" stroke="${INK}" stroke-width=".8" opacity=".55"/>`;
    case 'chain':
      return `${chain(col)}<circle cx="20" cy="27.5" r="1.8" fill="none" stroke="${INK}" stroke-width="1.2"/><path d="M20 29 V35 Q20 38 23 37.5 Q25.5 36.5 24.5 33.5 L26 34.5" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/><path d="M20 29 V35 Q20 38 23 37.5 Q25.5 36.5 24.5 33.5 L26 34.5" fill="none" stroke="#e6ebef" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'pendant':
      return `${chain(col)}<path d="M12 31 Q19 24 26 31 Q19 38 12 31 Z M26 31 L31 27 L30.5 35 Z" fill="${col}" ${line}/><circle cx="16" cy="30.5" r="1.4" fill="${acc}"/>`;
    case 'pearl': {
      const beads = [0, 0.11, 0.22, 0.33, 0.44, 0.56, 0.67, 0.78, 0.89, 1].map((t) => {
        const x = 7 + 26 * t;
        const y = 6 + 20 * (1 - (2 * t - 1) ** 2);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.3" fill="${col}" stroke="${INK}" stroke-width="1"/>`;
      });
      return `${beads.join('')}<circle cx="20" cy="31" r="3.6" fill="${col}" ${line}/><circle cx="19" cy="30" r="1" fill="#fff"/>`;
    }
    case 'amulet':
      return `${chain(col)}<circle cx="20" cy="31" r="6.5" fill="${col}" ${line}/><path d="M20 26 L24 31 L20 36 L16 31 Z" fill="${acc}" ${line}/>${glint(18.5, 29.5)}`;
    case 'diamond':
      return `${chain(col)}<path d="${NECK}" fill="none" stroke="${acc}" stroke-width=".8" transform="translate(0 2.5)"/><path d="M14 28 L17 24.5 H23 L26 28 L20 37.5 Z" fill="${acc}" ${line}/><path d="M14 28 H26 M17 24.5 L20 28 L23 24.5 M20 28 V37" stroke="${INK}" stroke-width=".8" opacity=".5"/>`;
    case 'dice': {
      const die = (x: number, y: number, rot: number, pips: [number, number][]) =>
        `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-4.5" y="-4.5" width="9" height="9" rx="1.8" fill="${acc}" ${line}/>${pips.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="1" fill="#fff"/>`).join('')}</g>`;
      return `${chain(col)}${die(15.5, 31, -12, [[-2, -2], [0, 0], [2, 2]])}${die(25, 31.5, 10, [[-2, -2], [2, -2], [-2, 2], [2, 2]])}`;
    }
    case 'jackpot':
      return `${chain(col, 3.4)}<circle cx="20" cy="30" r="8.5" fill="${acc}" ${line}/><circle cx="20" cy="30" r="8.5" fill="none" stroke="#ffe9a8" stroke-width="2.6" stroke-dasharray="2.6 3.6"/><circle cx="20" cy="30" r="5" fill="#1b1b24"/><path d="M20 26.2 L21.1 28.9 L24 29 L21.8 30.8 L22.5 33.6 L20 32 L17.5 33.6 L18.2 30.8 L16 29 L18.9 28.9 Z" fill="#ffd24a"/>`;
  }
  return '';
}

const cache = new Map<string, string>();

/** Inline SVG for a cosmetic (empty for unknown ids). */
export function cosIcon(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const c = cosById(id);
  if (!c) return '';
  const art = c.slot === 'hat' ? hat(c) : c.slot === 'shirt' ? shirt(c, `cosclip${++uid}`) : jewelry(c);
  const extra = c.tier >= 5 ? star(6, 6, 4) + star(34, 9, 2.6) + star(35, 35, 3.2) : c.tier === 4 ? star(34, 7, 2.6) : '';
  const svg = `<svg class="cosico${c.tier >= 5 ? ' legend' : ''}" viewBox="0 0 40 40" aria-hidden="true">${art}${extra}</svg>`;
  cache.set(id, svg);
  return svg;
}
