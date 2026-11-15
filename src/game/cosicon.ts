import { cosById, type Cosmetic } from '../data/cosmetics';

/**
 * A small inline-SVG icon per cosmetic, drawn in the item's own colours with the same dark outline
 * as the rod icons so it reads on parchment and wood alike. Mythic items get a glint and
 * legendary items twinkle with stars, matching the 3D models; Abyssal stars are teal, and there are four.
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

/** The Kraken's colours, as on the 3D pieces. */
const KRAKEN = '#a3203f';
const KRAKEN_DARK = '#6e1430';
const SUCKER = '#f4b8c4';
/** A tentacle: a thick outlined stroke along `d`. */
const tentacle = (d: string, w = 3, fill = KRAKEN) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 1.8}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x: number, y: number, r = 0.8, fill = SUCKER) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

/** The Leviathan's and the Drowned Dreamer's colours, as on the 3D pieces. */
const LEV = '#2c2c42';
const MOLTEN = '#ff6a1a';
const EMBER = '#ffb02e';
const BONE = '#f4e8cc';
const DRE = '#2c6a5c';
const DRE_GLOW = '#9affd0';
const FLUFF = '#f4f0ff';
const MOON = '#fff1c8';
/** A fang hanging from (x, y), `len` long, tipped `rot` degrees. */
const fang = (x: number, y: number, len: number, w = 1.8, rot = 0) =>
  `<path d="M${x - w} ${y} Q${x - w * 0.5} ${y + len * 0.6} ${x} ${y + len} Q${x + w * 0.5} ${y + len * 0.6} ${x + w} ${y} Z" fill="${BONE}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}/>`;
/** A plated coil along `d`: an outlined band with molten seams across it. */
const coil = (d: string, w: number) => `${tentacle(d, w, LEV)}<path d="${d}" fill="none" stroke="${MOLTEN}" stroke-width="${w}" stroke-dasharray="1.3 3.7"/>`;
/** A closed, sleeping eye: a glowing lash line curving down, with three lashes. */
const sleepy = (x: number, y: number, r: number, stroke = DRE_GLOW) =>
  `<path d="M${x - r} ${y} Q${x} ${y + r * 1.1} ${x + r} ${y} M${x} ${y + r * 0.55} V${y + r * 1.15} M${x - r * 0.6} ${y + r * 0.4} L${x - r * 0.9} ${y + r} M${x + r * 0.6} ${y + r * 0.4} L${x + r * 0.9} ${y + r}" stroke="${stroke}" stroke-width="1" fill="none" stroke-linecap="round"/>`;
/** A small 'Z' for sleepers, `s` wide. */
const zed = (x: number, y: number, s: number) => `<path d="M${x} ${y} h${s} l${-s} ${s} h${s}" stroke="${DRE_GLOW}" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A puff of cloud: overlapping white rounds along a flat bottom. */
const cloud = (x: number, y: number, w: number) =>
  `<path d="M${x - w} ${y} Q${x - w - 2} ${y - 4} ${x - w * 0.55} ${y - 4.2} Q${x - w * 0.4} ${y - 8} ${x - w * 0.05} ${y - 6.2} Q${x + w * 0.3} ${y - 9} ${x + w * 0.55} ${y - 4.8} Q${x + w + 2} ${y - 4.5} ${x + w} ${y} Z" fill="${FLUFF}" ${line}/>`;

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
    case 'souwester':
      return `<path d="M3 31 Q8 33 14 30 L26 30 L31 20 Q34 22 36 28 Q30 32 20 32 Z" fill="${col}" ${line}/><path d="M9 28 Q8 12 20 11 Q31 12 31 28 Q20 30 9 28 Z" fill="${col}" ${line}/><path d="M9.5 24 Q20 27 30.5 24" stroke="${INK}" stroke-width="1" opacity=".4" fill="none"/><path d="M10 28 Q8 36 20 38 Q32 36 30 28" stroke="${acc}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M14 16 Q17 14 21 14" stroke="#fff" stroke-width="1.4" opacity=".45" fill="none" stroke-linecap="round"/>`;
    case 'bicorne':
      return `<path d="M2 20 Q20 2 38 20 Q20 38 2 20 Z" fill="${col}" ${line}/><path d="M3.5 19 Q20 4.5 36.5 19" stroke="${acc}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M10 11 Q20 3 30 11 Q20 6 10 11 Z" fill="#fff" ${line}/><circle cx="2.5" cy="20" r="1.8" fill="${acc}" ${line}/><circle cx="37.5" cy="20" r="1.8" fill="${acc}" ${line}/><circle cx="27" cy="21" r="5" fill="${acc}" ${line}/>${star(27, 21, 3.2, '#fff6c8')}`;
    case 'visor':
      return `<path d="M7 18 Q20 13 33 18 L33 23 Q20 19 7 23 Z" fill="${col}" ${line}/><path d="M7 23 Q20 19 33 23 Q30 33 20 33 Q10 33 7 23 Z" fill="#2fa66a" ${line}/><path d="M8 23.5 Q20 19.5 32 23.5" stroke="${acc}" stroke-width="2" fill="none"/><path d="M7.5 18 Q20 13 32.5 18" stroke="${acc}" stroke-width="1.6" fill="none"/>`;
    case 'krakencrown':
      // Tentacles curl up from behind a gold band set with the ruby eye.
      return `${tentacle('M15 18 Q13 9 10 6.5 Q8 5 7.5 8')}${tentacle('M25 18 Q27 9 30 6.5 Q32 5 32.5 8')}${tentacle('M20 16 Q20 8 20.5 4 Q21 1.8 23 3')}<path d="M10 24 Q10 14 20 14 Q30 14 30 24 Z" fill="${KRAKEN_DARK}" ${line}/>${tentacle('M10.5 22 Q6 15 3.5 14 Q1.5 13.5 2 16')}${tentacle('M29.5 22 Q34 15 36.5 14 Q38.5 13.5 38 16')}${dot(13.6, 10.5)}${dot(26.4, 10.5)}${dot(6, 16)}${dot(34, 16)}${dot(20.2, 9)}<path d="M8 23 H32 L31 31 H9 Z" fill="${GOLD}" ${line}/><path d="M9.3 28.5 H30.7" stroke="${INK}" stroke-width=".8" opacity=".4"/><ellipse cx="20" cy="27" rx="3.8" ry="2.7" fill="${acc}" ${line}/><ellipse cx="20" cy="27" rx=".8" ry="2" fill="${INK}"/>`;
    case 'leviathanjaw':
      // The Leviathan's skull from the front: bone horns, a molten seam, burning eyes, fangs over the brow and up from the lower jaw.
      return `${tentacle('M12 13 Q8.5 7 12.5 2.5', 2.6, BONE)}${tentacle('M28 13 Q31.5 7 27.5 2.5', 2.6, BONE)}<path d="M8 23.5 Q20 26 32 23.5 L31 31 Q20 36 9 31 Z" fill="#7a2434" ${line}/><path d="M5.5 24 Q5 9 20 8.5 Q35 9 34.5 24 Q20 26.5 5.5 24 Z" fill="${col}" ${line}/><path d="M20 8.8 V15" stroke="#3e3a56" stroke-width="2.4" stroke-linecap="round"/><path d="M7.3 17 Q20 13.2 32.7 17" stroke="${acc}" stroke-width="1.4" fill="none" stroke-linecap="round"/>${[[-1, 13], [1, 27]].map(([s, x]) => `<ellipse cx="${x}" cy="20" rx="2.6" ry="2" fill="${EMBER}" stroke="${INK}" stroke-width=".8"/><path d="M${x} 18.6 V21.4" stroke="${INK}" stroke-width="1"/><circle cx="${x + s * 4.2}" cy="19.2" r="1.3" fill="${EMBER}" stroke="${INK}" stroke-width=".6"/>`).join('')}${[9.5, 13.5, 17.5, 22.5, 26.5, 30.5].map((x) => fang(x, 24.6, Math.abs(x - 20) < 3 ? 5 : 4, 1.5)).join('')}<path d="M8 30 Q20 38.5 32 30 L31 33 Q20 40 9 33 Z" fill="${col}" ${line}/>${[14, 20, 26].map((x) => fang(x, x === 20 ? 34.2 : 33.2, -3.6, 1.3)).join('')}`;
    case 'dreamercap':
      // A long nightcap flopping over to a pompom that is a sleepy eye, mint stars on it, a halo over it and Zs drifting up.
      return `<path d="M8 30 Q6.5 13 15 5.5 Q24.5 0.5 30.5 10 Q33 15 33 21 L30 20.5 Q29.5 15 26 12.5 Q24.5 22 32 30 Z" fill="${col}" ${line}/>${star(13, 21, 2.2, acc)}${star(19, 9.5, 1.8, acc)}${star(20.5, 22.5, 1.6, acc)}<ellipse cx="15" cy="4.2" rx="6.5" ry="1.6" fill="none" stroke="${INK}" stroke-width="2.4"/><ellipse cx="15" cy="4.2" rx="6.5" ry="1.6" fill="none" stroke="${acc}" stroke-width="1.1"/><path d="M5.5 30.5 Q20 26.5 34.5 30.5 Q35 35.5 20 35.5 Q5 35.5 5.5 30.5 Z" fill="${FLUFF}" ${line}/><circle cx="32" cy="24" r="4" fill="${FLUFF}" ${line}/><path d="M29.4 24.6 Q32 22.4 34.6 24.6 Q32 26.6 29.4 24.6 Z" fill="#fff" stroke="${INK}" stroke-width=".8"/><circle cx="32" cy="25.1" r="1.1" fill="${acc}" stroke="${INK}" stroke-width=".5"/><path d="M29.4 24.6 Q32 22.8 34.6 24.6" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>${zed(1.5, 16, 3.2)}${zed(3.5, 11, 2.2)}`;
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
    case 'slicker':
      return `${body(col)}<path d="M15 5.5 Q20 11 25 5.5 L27.5 8 Q20 15 12.5 8 Z" fill="${hex(c.color)}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><rect x="11" y="17" width="18" height="3.4" fill="${acc}" stroke="${INK}" stroke-width="1"/>${[23.5, 27.5, 31.5].map((y) => `<rect x="17.4" y="${y - 1.3}" width="5.2" height="2.6" rx="1.3" fill="#7a4a24" stroke="${INK}" stroke-width=".8"/>`).join('')}`;
    case 'cloak':
      return `<path d="M7 10 Q20 4 33 10 L38 38 H2 Z" fill="#3d2a8f" ${line}/><path d="M3 36.5 H37" stroke="${acc}" stroke-width="2.4"/>${body(col, COAT)}<path d="M15 6 Q20 10 25 6" stroke="#ff7ad9" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M9.5 35.5 H30.5" stroke="${acc}" stroke-width="2"/>${star(20, 14, 3.5)}`;
    case 'dealer':
      return `${body('#f6f2e8')}<path d="M11 8 L16 5.5 L19 14 L19 34.5 H11 Z M29 8 L24 5.5 L21 14 L21 34.5 H29 Z" fill="${col}" ${line}/><path d="M15.5 10 L20 12 L24.5 10 L24.5 14.5 L20 12.5 L15.5 14.5 Z" fill="${acc}" stroke="${INK}" stroke-width="1"/>${[19, 24, 29].map((y) => `<circle cx="20" cy="${y}" r="1.3" fill="${GOLD}" stroke="${INK}" stroke-width=".6"/>`).join('')}`;
    case 'krakenarmor':
      // A wet shell with squid fins behind the shoulders, a pale ridged belly, a gold collar and ruby, tentacles curling
      // off the shoulders and trailing behind, a stream of water across it and drops falling.
      return `<path d="M12 10 L7.5 0.8 Q2 4 1.2 13 Z" fill="#b02a48" ${line}/><path d="M28 10 L32.5 0.8 Q38 4 38.8 13 Z" fill="#b02a48" ${line}/>${tentacle('M13 31 Q10 37 5.5 37 Q3.5 36.5 4.5 34.5')}${tentacle('M27 31 Q30 37 34.5 37 Q36.5 36.5 35.5 34.5')}<defs><clipPath id="${clip}"><path d="${SHIRT}"/></clipPath></defs>${body('#b02a48')}<g clip-path="url(#${clip})"><g fill="${KRAKEN_DARK}"><rect x="0" y="21" width="40" height="1.6"/><rect x="0" y="27" width="40" height="1.6"/></g><rect x="16.5" y="18" width="7" height="17" fill="#f2b8c2"/><path d="M16.5 23 H23.5 M16.5 27.5 H23.5 M16.5 32 H23.5" stroke="#d88a9a" stroke-width="1"/></g><path d="${SHIRT}" fill="none" ${line}/>${collar(GOLD)}${tentacle('M9 9 Q6 3 3 4 Q1.2 5 2.8 7')}${tentacle('M31 9 Q34 3 37 4 Q38.8 5 37.2 7')}${dot(6.3, 4.6)}${dot(33.7, 4.6)}<path d="M5 24 Q20 32 35 21" stroke="#bff4ff" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="20" cy="14" r="3.8" fill="none" stroke="${GOLD}" stroke-width="1.6"/><path d="M20 10.2 L22.6 14 L20 17.8 L17.4 14 Z" fill="${acc}" ${line}/>${dot(4.2, 38.8, 0.9, '#7fd8f4')}${dot(35.8, 38.8, 0.9, '#7fd8f4')}`;
    case 'leviathancoil':
      // A dark belly with the Leviathan wrapped round it: the coil crosses twice, seamed with molten rings, its shark tail
      // flicking up at one side and its head over the shoulder.
      return `<path d="M5.5 33 L1.5 25 Q4 29 8.5 29.5 Z" fill="${LEV}" ${line}/>${body('#4c3c44')}${collar('#3e3a56')}${coil('M6 31 Q14 35.5 21 31 Q28 26.5 36 27', 4.4)}${coil('M4.5 21 Q12 24.5 21 19.5 Q28.5 15 27 6', 3.8)}${[[12, 31.7], [24.5, 28], [10.5, 21.6], [24.5, 15]].map(([x, y]) => `<path d="M${x - 1.2} ${y - 2} L${x} ${y - 4.6} L${x + 1.2} ${y - 2} Z" fill="${BONE}" stroke="${INK}" stroke-width=".7" stroke-linejoin="round"/>`).join('')}<circle cx="27" cy="6" r="2.6" fill="${LEV}" ${line}/><circle cx="27.8" cy="5.6" r=".9" fill="${EMBER}"/>`;
    case 'dreamerrobe':
      // A long robe of stars to the ground: a cloud ruff at the collar, a crescent moon, and sleeping eyes round the pale hem.
      return `${body(col, 'M11 8 L16 5.5 Q20 9 24 5.5 L29 8 L36 14 L31.5 18.5 L29.5 16.5 L33.5 35 L6.5 35 L10.5 16.5 L8.5 18.5 L4 14 Z')}<path d="M7 31 H33 L33.5 35 H6.5 Z" fill="#9ad8b8" ${line}/>${[11.5, 20, 28.5].map((x) => sleepy(x, 32.2, 2, '#2c6a5c')).join('')}<path d="M14.5 6.5 Q20 11.5 25.5 6.5" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M14.5 6.5 Q20 11.5 25.5 6.5" stroke="${FLUFF}" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M24.5 13 A4 4 0 1 0 24.5 20.5 A3 3 0 1 1 24.5 13 Z" fill="${MOON}" stroke="${INK}" stroke-width=".8"/>${star(14, 16, 1.8, acc)}${star(16.5, 25, 1.5, MOON)}${star(25.5, 26, 1.8, acc)}${star(12.5, 21, 1.2, acc)}${star(29, 20.5, 1.2, acc)}`;
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
    case 'compass':
      return `${chain(col)}<rect x="18.5" y="19" width="3" height="4" fill="${col}" ${line}/><circle cx="20" cy="31" r="8" fill="${col}" ${line}/><circle cx="20" cy="31" r="5.6" fill="#dff3f2" stroke="${INK}" stroke-width="1"/><path d="M20 26 L21.7 31 L20 36 L18.3 31 Z" fill="${acc}" ${line} transform="rotate(35 20 31)"/><circle cx="20" cy="31" r="1" fill="${col}"/>`;
    case 'dice': {
      const die = (x: number, y: number, rot: number, pips: [number, number][]) =>
        `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-4.5" y="-4.5" width="9" height="9" rx="1.8" fill="${acc}" ${line}/>${pips.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="1" fill="#fff"/>`).join('')}</g>`;
      return `${chain(col)}${die(15.5, 31, -12, [[-2, -2], [0, 0], [2, 2]])}${die(25, 31.5, 10, [[-2, -2], [2, -2], [-2, 2], [2, 2]])}`;
    }
    case 'krakenbeak': {
      // A dark cord of suckers, the ruby in gold, and the beak hooking down below it.
      const q = (t: number, a: number, b: number, c: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;
      const suckers = [0.3, 0.65].flatMap((t) => [dot(q(t, 7, 9, 20), q(t, 6, 25, 26), 1.4), dot(q(1 - t, 20, 31, 33), q(1 - t, 26, 25, 6), 1.4)]);
      return `${chain('#3a0f20', 1.6)}${suckers.join('')}<path d="M13.5 29 Q20 26 26.5 29 Q26 35 20 38.5 Q14 35 13.5 29 Z" fill="${col}" ${line}/><path d="M20 29.5 Q21.5 34 20 38" stroke="#6a4a5a" stroke-width="1.2" fill="none" stroke-linecap="round"/><path d="M16 30.5 Q17 34 19 36" stroke="#fff" stroke-width="1" opacity=".3" fill="none" stroke-linecap="round"/><circle cx="20" cy="26.5" r="3.2" fill="${GOLD}" ${line}/><circle cx="20" cy="26.5" r="1.7" fill="${acc}"/>`;
    }
    case 'leviathanfangs': {
      // Five fangs hung from embers along a dark cord, longest in the middle.
      const hung = [[11.5, 21.5, 6, 22], [15.5, 24.6, 7.5, 11], [20, 25.8, 9.5, 0], [24.5, 24.6, 7.5, -11], [28.5, 21.5, 6, -22]];
      return `${chain('#3a3448', 1.6)}${hung.map(([x, y, len, rot]) => `${fang(x, y + 1.2, len, 2, rot)}<circle cx="${x}" cy="${y}" r="1.7" fill="${acc}" stroke="${INK}" stroke-width=".8"/>`).join('')}`;
    }
    case 'dreamcatcher':
      // A pale hoop with a web and a mint heart, hung with three glowing tentacle feathers.
      return `${chain('#4a9a7c', 1.4)}${['M16 31 Q15 35 16.5 39', 'M20 32 Q21 36 19.5 39.5', 'M24 31 Q25 35 23.5 39'].map((d) => tentacle(d, 2.4, acc)).join('')}<circle cx="20" cy="25" r="7" fill="#e6fbf2" stroke="${INK}" stroke-width="3.6"/><circle cx="20" cy="25" r="7" fill="none" stroke="${col}" stroke-width="2"/><path d="M13.6 25 H26.4 M16.8 19.5 L23.2 30.5 M16.8 30.5 L23.2 19.5" stroke="#7aaa98" stroke-width=".7"/><circle cx="20" cy="25" r="3" fill="none" stroke="${acc}" stroke-width="1"/><circle cx="20" cy="25" r="1.4" fill="${acc}" stroke="${INK}" stroke-width=".6"/>`;
    case 'jackpot':
      return `${chain(col, 3.4)}<circle cx="20" cy="30" r="8.5" fill="${acc}" ${line}/><circle cx="20" cy="30" r="8.5" fill="none" stroke="#ffe9a8" stroke-width="2.6" stroke-dasharray="2.6 3.6"/><circle cx="20" cy="30" r="5" fill="#1b1b24"/><path d="M20 26.2 L21.1 28.9 L24 29 L21.8 30.8 L22.5 33.6 L20 32 L17.5 33.6 L18.2 30.8 L16 29 L18.9 28.9 Z" fill="#ffd24a"/>`;
  }
  return '';
}

function pet(c: Cosmetic): string {
  const col = hex(c.color);
  const acc = hex(c.accent);
  switch (c.id) {
    case 'krakenpet': {
      // Kraken Hatchling: a round pink head, big eyes and little tentacles.
      const arms = ['M12 24 Q8 30 9 35', 'M16 26 Q14.5 32 16 37', 'M20 27 Q20.5 33 19 37.5', 'M24 26 Q25.5 32 24 37', 'M28 24 Q32 30 31 35'].map((d) => tentacle(d, 2.6, col)).join('');
      const eye = (x: number) => `<circle cx="${x}" cy="20" r="4" fill="#fff" ${line}/><circle cx="${x + 0.4}" cy="20.6" r="2.2" fill="${INK}"/><circle cx="${x - 0.5}" cy="19.4" r=".8" fill="#fff"/>`;
      return `${arms}<ellipse cx="20" cy="15.5" rx="11" ry="12" fill="${col}" ${line}/>${dot(15, 7.5, 1.4, acc)}${dot(25.5, 9.5, 1.2, acc)}${dot(22, 5.5, 1, acc)}${eye(15.5)}${eye(24.5)}`;
    }
    case 'leviathanpet':
      // Leviathan Wyrmling: a little serpent swimming in an S, molten rings along it, burning eye, bone horns and tail fin.
      return `<path d="M8.5 27 L3 21.5 Q5 26.5 4 31.5 Z" fill="${col}" ${line}/>${coil('M7.5 27.5 Q12 19 18 25 Q24 32 28.5 22', 4.8)}${tentacle('M27 16 Q24 11 20.5 10', 1.6, BONE)}${tentacle('M30 15.5 Q29.5 10 27 7.5', 1.6, BONE)}<ellipse cx="30" cy="19.5" rx="6" ry="4.6" fill="${col}" ${line} transform="rotate(-25 30 19.5)"/><circle cx="31.5" cy="18" r="1.8" fill="${EMBER}" stroke="${INK}" stroke-width=".7"/><path d="M31.5 16.8 V19.2" stroke="${INK}" stroke-width=".8"/>${fang(34.2, 21.2, 2.2, 0.7, -25)}`;
    case 'dreamerpet':
      // Sleepy Dreamer: a teal blob fast asleep on a cloud in its own little nightcap, Zs rising.
      return `<path d="M8.5 30 Q7 14.5 20 14 Q33 14.5 31.5 30 Z" fill="${col}" ${line}/><path d="M12.5 30 Q12 23.5 20 23.5 Q28 23.5 27.5 30 Z" fill="#9ad8b8"/>${sleepy(15, 20, 2.4)}${sleepy(25, 20, 2.4)}<path d="M13 15.5 Q14 6.5 21 6 Q27.5 6 30 11.5 L27.5 12.5 Q26 10 23.5 10.5 L27 15.5 Z" fill="${col}" ${line}/><path d="M12.5 15.8 Q20 13 27.5 15.8" stroke="${INK}" stroke-width="3.8" fill="none" stroke-linecap="round"/><path d="M12.5 15.8 Q20 13 27.5 15.8" stroke="${FLUFF}" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="29.5" cy="13" r="2.2" fill="${FLUFF}" ${line}/>${cloud(20, 37, 13)}${zed(3, 13, 3.2)}${zed(7, 8, 2.2)}`;
  }
  return '';
}

const cache = new Map<string, string>();
/** Abyssal stars: teal, where legendary ones are gold. */
const ABYSS_STAR = '#8ff5e8';

/** Inline SVG for a cosmetic (empty for unknown ids). */
export function cosIcon(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const c = cosById(id);
  if (!c) return '';
  const art = c.slot === 'hat' ? hat(c) : c.slot === 'shirt' ? shirt(c, `cosclip${++uid}`) : c.slot === 'pet' ? pet(c) : jewelry(c);
  const extra =
    c.tier >= 6
      ? star(6, 6, 4, ABYSS_STAR) + star(34, 9, 2.6, ABYSS_STAR) + star(35, 35, 3.2, ABYSS_STAR) + star(5, 33, 2.4, ABYSS_STAR)
      : c.tier === 5
        ? star(6, 6, 4) + star(34, 9, 2.6) + star(35, 35, 3.2)
        : c.tier === 4
          ? star(34, 7, 2.6)
          : '';
  const cls = c.tier >= 6 ? ' legend abyssal' : c.tier >= 5 ? ' legend' : '';
  const svg = `<svg class="cosico${cls}" viewBox="0 0 40 40" aria-hidden="true">${art}${extra}</svg>`;
  cache.set(id, svg);
  return svg;
}
