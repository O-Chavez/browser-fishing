/**
 * Small side-on icons (64×40 box, head right, tail left) for the nine deep sea legends, hand-drawn to read
 * as their 3D models: colours match the constants in src/game/seafish/legends and giants. Called first by
 * `fishIcon`. `hidden` is one flat ink silhouette; `shiny` mixes every colour toward gold and adds the glint.
 */
let uid = 0;
const INK = '#2a1b0f';

interface Ctx {
  /** A colour, or ink when hidden (gold-tinted when shiny). */
  c: (n: number) => string;
  /** A back-to-belly gradient fill (flat ink when hidden). */
  grad: (back: number, belly: number) => string;
  /** Detail only shows on a discovered fish. */
  d: (s: string) => string;
  /** The faint outline that goes with a body shape. */
  ol: string;
  hid: boolean;
  defs: string[];
  k: number;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
function mix(a: number, b: number, t: number): number {
  return [16, 8, 0].map((s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s).reduce((x, y) => x | y, 0);
}
/** A round eye with a pupil, as on the everyday icons. */
const eye = (x: number, y: number, r: number, iris?: string) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>${iris ? `<circle cx="${x + r * 0.2}" cy="${y}" r="${r * 0.75}" fill="${iris}"/>` : ''}<circle cx="${x + r * 0.3}" cy="${y}" r="${r * (iris ? 0.4 : 0.55)}" fill="${INK}"/>`;

type Draw = (x: Ctx) => string;

const grouper: Draw = ({ c, grad, d, ol }) => {
  const body = 'M15 19C20 11 33 8 45 10C55 11 60 17 59 24C58 31 52 34 43 34C31 34 21 28 15 23Z';
  return (
    `<path d="M16 21L10 15Q3 18 3 21Q3 25 10 28L16 24Z" fill="${c(0x7a6a3a)}"/>` + // round tail
    `<path d="M24 12L26 6L30 10L33 4L37 9L41 3L44 9L46 11Z" fill="${c(0x7a6a3a)}"/>` + // spiny dorsal
    d(`<path d="M47 9L43 2M47 9L47 1M47 9L51 2M47 9L45 3" stroke="#d8745a" stroke-width="1.6" stroke-linecap="round"/>`) + // coral fan
    `<path d="M30 33L36 38L42 33Z" fill="${c(0x7a6a3a)}"/>` +
    `<path d="${body}" fill="${grad(0x566442, 0xd6c696)}" ${ol}/>` +
    d(
      `<circle cx="27" cy="20" r="1.2" fill="#3a4430"/><circle cx="33" cy="25" r="1" fill="#3a4430"/><circle cx="38" cy="19" r="1.1" fill="#3a4430"/><circle cx="21" cy="25" r=".9" fill="#3a4430"/>` +
        `<path d="M59 25Q54 29 49 28" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M59 25Q57 31 51 31" stroke="${hex(0x9c8c5c)}" stroke-width="1.2" fill="none"/>` + // broad down-turned mouth
        `<path d="M41 23Q47 24 46 30Q41 31 38 27Z" fill="#7a6a3a" opacity=".85"/>` +
        `<circle cx="52" cy="18" r="3" fill="#fff"/><circle cx="52.6" cy="18.8" r="1.6" fill="#e0a830"/><circle cx="52.8" cy="18.8" r=".9" fill="${INK}"/><path d="M48.6 18.6Q52 14.4 55.4 17.6L55.4 16.4Q52 12.8 48.6 16.4Z" fill="#566442" stroke="${INK}" stroke-width=".5"/>`, // heavy lid
    )
  );
};

const marlin: Draw = ({ c, grad, d, ol }) =>
  `<path d="M17 21L6 6Q10 21 6 36Z" fill="${c(0x2c4c88)}"/>` +
  `<path d="M21 17L25 3L29 8L33 2L37 8L41 5L43 18Z" fill="${c(0x2c4c88)}"/>` + // the sail
  d(`<path d="M26 16L27 5M30 16L31 5M34 16L35 4M38 16L39 7" stroke="#6fa0e8" stroke-width=".5" opacity=".8"/>`) +
  `<path d="M13 21Q22 16 36 16.5Q46 17 52 21Q47 25 36 26.5Q22 27 13 21Z" fill="${grad(0x111d3c, 0xd6e2ee)}" ${ol}/>` +
  `<path d="M51 21L63 20.4L51 22.2Z" fill="${c(0x111d3c)}"/>` + // the spear
  `<path d="M33 25L29 31L37 26Z" fill="${c(0x2c4c88)}"/>` +
  d(`<path d="M25 17L28 20L24 22L27 25M33 16.5L36 20L32 22.5L35 26M41 17.5L43 20L40 22L42 24" stroke="#cfeeff" stroke-width="1.1" fill="none" stroke-linejoin="round"/>` + eye(47, 20, 2.1));

const kelpbeard: Draw = ({ c, grad, d, ol }) =>
  `<path d="M17 22L9 16Q5 19 6 22Q5 25 9 28L17 25Z" fill="${c(0x74b04c)}"/>` +
  `<path d="M24 12L26 6L30 10L33 5L37 9L40 5L42 10Z" fill="${c(0x74b04c)}"/>` +
  // the crown of kelp
  `<path d="M38 11Q34 4 40 1Q41 6 44 8Q44 3 50 2Q48 7 48 11Z" fill="${c(0x9cc848)}"/><path d="M44 10Q46 4 53 5Q50 8 49 12Z" fill="${c(0x8fd04a)}"/>` +
  `<path d="M16 22C18 12 30 9 43 11C53 13 58 19 57 25C55 31 49 33 41 33C28 33 18 29 16 22Z" fill="${grad(0x467a36, 0xdcc98c)}" ${ol}/>` +
  // the beard
  `<path d="M50 31Q47 36 50 39M54 30Q54 35 57 38M46 32Q43 36 45 39" stroke="${c(0x5a9a34)}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
  d(
    `<path d="M24 18q2 -2 4 0M30 16q2 -2 4 0M36 17q2 -2 4 0M27 23q2 -2 4 0M33 22q2 -2 4 0M39 23q2 -2 4 0M22 25q2 -2 4 0" stroke="#e8d890" stroke-width=".9" fill="none" opacity=".9"/>` +
      `<path d="M56 26Q52 29 48 28" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
      `<circle cx="50" cy="19" r="3" fill="#fff"/><circle cx="50.6" cy="19.8" r="1.6" fill="#e0e060"/><circle cx="50.8" cy="19.8" r=".9" fill="${INK}"/><path d="M46.6 19.4Q50 15 53.4 18.4L53.4 17Q50 13.4 46.6 17Z" fill="#467a36" stroke="${INK}" stroke-width=".5"/>` +
      `<circle cx="38" cy="3" r=".9" fill="#d4f47a"/><circle cx="51" cy="3" r=".9" fill="#d4f47a"/><circle cx="46" cy="14" r=".7" fill="#d4f47a"/>`,
  );

const kelpwyrm: Draw = ({ c, d }) => {
  const path = 'M8 31C16 36 24 23 33 27C41 31 47 22 54 22';
  const fronds = [20, 25, 30, 35, 40, 45]
    .map((x, i) => `<path d="M${x} ${28 - (x - 20) * 0.1 - (i % 2)}Q${x - 3} ${15 - (i % 2) * 3} ${x - 8 + i} ${8 - (i % 2) * 2}Q${x + 3} ${14} ${x + 2} ${26}Z" fill="${c(i % 2 ? 0x9cc848 : 0x7fc24a)}"/>`)
    .join('');
  return (
    `<path d="M10 32L2 27Q1 33 4 36Z" fill="${c(0x7fc24a)}"/>` +
    fronds +
    `<path d="${path}" stroke="${c(0x284f30)}" stroke-width="6.5" fill="none" stroke-linecap="round"/>` +
    d(`<path d="${path}" stroke="#7fc24a" stroke-width=".9" fill="none" transform="translate(0 .6)"/><path d="${path}" stroke="#e8dcb4" stroke-width="1.4" fill="none" stroke-dasharray=".5 2.5" transform="translate(0 -3.2)"/>`) +
    // head, horn, jaw
    `<path d="M49 19Q56 15 61 21L62 25L50 27Z" fill="${c(0x284f30)}"/><path d="M50 26L62 25L61 28Q55 30 50 28Z" fill="${c(0x284f30)}"/>` +
    `<path d="M50 17Q46 11 38 10Q45 12 49 20Z" fill="${c(0xe8dcb4)}"/>` +
    d(`<path d="M52 26.6L53 29M55 26.4L56 29M58 26.2L59 28.6" stroke="#f4eed8" stroke-width="1.1"/>` + eye(54, 20.5, 2.3, '#e8e060'))
  );
};

const oarfish: Draw = ({ c, d }) => {
  const w = 'M3 33C9 28 14 37 22 31S34 24 42 24S50 22 55 21';
  return (
    `<path d="${w}" stroke="${c(0xc4cee2)}" stroke-width="4.4" fill="none" stroke-linecap="round"/>` +
    d(`<path d="${w}" stroke="#f2f6ff" stroke-width="1.2" fill="none" transform="translate(0 .8)"/>`) +
    `<path d="${w}" stroke="${c(0xff3a5a)}" stroke-width="2" fill="none" stroke-dasharray="1.3 .7" transform="translate(0 -3.2)"/>` +
    // the red crest rising from the head, and two streamers hanging with bulbs
    `<path d="M54 18Q46 14 40 6M55 18Q50 12 47 4M56 18Q55 11 55 3M53 19Q43 17 33 12" stroke="${c(0xff3a5a)}" stroke-width="1" fill="none"/>` +
    `<path d="M40 6l1.5-3 1 3-1.5 3zM47 4l1.5-3 1 3-1.5 3zM55 3l1.5-3 1 3-1.5 3zM33 12l1.5-3 1 3-1.5 3z" fill="${c(0xff3a5a)}"/>` +
    `<path d="M57 23Q58 31 54 37M54 23.5Q54 30 49 33" stroke="${c(0xff3a5a)}" stroke-width=".9" fill="none"/><circle cx="54" cy="37" r="1.8" fill="${c(0xff7a9a)}"/><circle cx="49" cy="33" r="1.6" fill="${c(0xff7a9a)}"/>` +
    `<path d="M52 18.4Q57 15.5 60 20.5L56 24Q53 22 52 18.4Z" fill="${c(0xc4cee2)}"/>` +
    d(eye(56, 19.8, 2.6))
  );
};

const chandelier: Draw = ({ c, grad, d, ol }) =>
  `<path d="M17 21L8 11Q3 21 8 31L17 23Z" fill="${c(0x45365e)}"/>` +
  `<path d="M14 21C15 12 30 9 43 12C54 14 59 21 57 27C54 33 43 35 33 33C23 31 14 27 14 21Z" fill="${grad(0x5c428c, 0x2c1e44)}" ${ol}/>` +
  d(
    `<path d="M25 12L25 32M30 11L30 33M35 11.5L35 33.5M40 12.5L40 32M20 14L20 29" stroke="#1c1430" stroke-width="1.8" opacity=".75"/>` +
      `<circle cx="24" cy="18" r=".9" fill="#b070ff"/><circle cx="33" cy="22" r=".9" fill="#b070ff"/><circle cx="39" cy="17" r=".9" fill="#b070ff"/><circle cx="28" cy="27" r=".9" fill="#b070ff"/><circle cx="21" cy="22" r=".8" fill="#b070ff"/>` +
      // the grin: a long jaw of fangs
      `<path d="M58 26L47 30" stroke="${INK}" stroke-width="1.2"/><path d="M57 25.4l-1.2 2.6-1.4-2.2-1.4 2.6-1.4-2-1.4 2.4-1.4-2L48.6 29" fill="#fff" stroke="#fff" stroke-width=".4" stroke-linejoin="round"/>` +
      `<circle cx="51" cy="19" r="3.4" fill="#fff0c0"/><circle cx="51.6" cy="19.6" r="1.7" fill="${INK}"/><path d="M47.4 19Q51 14.2 54.6 17.8L54 16.4Q51 13 47.6 16.6Z" fill="#5c428c"/>`,
  ) +
  // the stalk, and a brass chandelier with three lamps
  `<path d="M45 12Q47 1 33 3.5" stroke="${c(0xc89a52)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
  d(`<circle cx="26" cy="7" r="4" fill="#ffd27a" opacity=".3"/><circle cx="40" cy="7" r="4" fill="#ffd27a" opacity=".3"/><circle cx="33" cy="8.5" r="3.8" fill="#ffd27a" opacity=".3"/>`) +
  `<path d="M33 4V14M33 11Q26 13.5 26 8.5M33 11Q40 13.5 40 8.5" stroke="${c(0xc89a52)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
  `<path d="M32 15l1-2 1 2z" fill="${c(0xc89a52)}"/>` +
  `<circle cx="26" cy="6.8" r="1.7" fill="${c(0xfff0c0)}"/><circle cx="40" cy="6.8" r="1.7" fill="${c(0xfff0c0)}"/><circle cx="33" cy="8" r="1.8" fill="${c(0xfff0c0)}"/>`;

const leviathan: Draw = ({ c, d }) => {
  const w = 'M6 31C14 37 22 25 32 29C42 33 45 21 51 19';
  const spikes = [[22, 28], [28, 25], [34, 26], [40, 27], [45, 21]].map(([x, y]) => `<path d="M${x - 2.5} ${y}L${x - 1} ${y - 6}L${x + 1.5} ${y - 1}Z" fill="${c(0xe6d3a0)}" ${d(`stroke="#6a5a3a" stroke-width=".5"`)}/>`).join('');
  return (
    `<path d="M10 32L1 24L3.5 31L1 38Z" fill="${c(0x3e3a56)}"/>` +
    spikes +
    `<path d="${w}" stroke="${c(0x1e1b40)}" stroke-width="8" fill="none" stroke-linecap="round"/>` +
    d(`<path d="${w}" stroke="#ff6a1a" stroke-width="7.5" fill="none" stroke-dasharray=".9 3.2" opacity=".9"/><path d="${w}" stroke="#4c4898" stroke-width="1" fill="none" transform="translate(0 -3)" opacity=".8"/>`) +
    // the horn, then the head with its jaws agape
    `<path d="M51 15Q46 5 35 5Q44 8 48 17Z" fill="${c(0xe6d3a0)}" ${d(`stroke="#6a5a3a" stroke-width=".5"`)}/>` +
    `<path d="M47 14Q54 11 63 18L51 21Z" fill="${c(0x1e1b40)}"/><path d="M50 22L63 22.4Q57 29 47 26Z" fill="${c(0x2a2242)}"/>` +
    d(
      `<path d="M52 20.2l1.4 3.4 1.4-3.2 1.4 3.2 1.4-3 1.4 2.8 1.6-2.4M52 22.4l1.4-2.6 1.4 2.4 1.6-2.4 1.6 2.4" fill="#f4e8cc" stroke="#f4e8cc" stroke-width=".7" stroke-linejoin="round"/>` +
        `<circle cx="51" cy="16" r="2.2" fill="#ffb02e"/><circle cx="54.6" cy="16.2" r="1.9" fill="#ffb02e"/><circle cx="51.2" cy="16" r=".9" fill="${INK}"/><circle cx="54.8" cy="16.2" r=".8" fill="${INK}"/>` +
        `<circle cx="53" cy="15.4" r="5" fill="#ff9a2a" opacity=".2"/>`,
    )
  );
};

const dreamer: Draw = ({ c, grad, d, ol }) => {
  const tent = [[16, 6], [22, 3], [28, 7], [34, 3], [40, 7], [46, 4], [52, 6]]
    .map(([x, dx], i) => `<path d="M${x} 27Q${x + dx * 0.6} ${32 + (i % 2)} ${x + dx * (i % 2 ? 0.2 : -0.4)} ${38 - (i % 2)}" stroke="${c(0x2f7a62)}" stroke-width="2.3" fill="none" stroke-linecap="round"/>`)
    .join('');
  return (
    tent +
    // the nightcap sags back from the crown
    `<path d="M30 11Q22 3 13 8Q17 5 14 9" stroke="${c(0x6f8a6a)}" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="12.5" cy="9.5" r="2.3" fill="${c(0x9cb08a)}"/>` +
    `<path d="M12 28C10 12 22 7 36 8C50 9 59 17 58 28Q36 31 12 28Z" fill="${grad(0x1e5f6a, 0x0f3f4c)}" ${ol}/>` +
    d(
      `<path d="M14 25Q35 29 57 25" stroke="#98d8cc" stroke-width="1" opacity=".5" fill="none"/>` +
        // the great eye, asleep: a dark closed bulge high on the crown, a thin mint lid line along its lower edge, short lashes
        `<ellipse cx="38" cy="13.4" rx="9.4" ry="5.2" fill="#17525e" stroke="#0b2c38" stroke-width=".6"/>` +
        `<path d="M30.4 14.2Q38 17.2 45.6 14.2" stroke="#9affd0" stroke-width=".9" fill="none" stroke-linecap="round"/>` +
        `<path d="M32.6 15.2l-.8 1.8M35.6 16.1l-.4 1.9M38.6 16.4v2M41.6 16.1l.4 1.9M44.4 15.2l.8 1.8" stroke="#9affd0" stroke-width=".7" stroke-linecap="round"/>` +
        // the small waking eyes below, each half under a dark lid
        `<circle cx="50" cy="19" r="3" fill="#dffff4"/><circle cx="50.4" cy="19.8" r="1.9" fill="#4fd8b0"/><circle cx="50.6" cy="19.9" r=".9" fill="#03100c"/><path d="M47 19.3A3 3 0 0 1 53 19.3Z" fill="#14505c"/>` +
        `<circle cx="42" cy="23.3" r="2.5" fill="#dffff4"/><circle cx="42.3" cy="24" r="1.6" fill="#4fd8b0"/><circle cx="42.5" cy="24.1" r=".8" fill="#03100c"/><path d="M39.5 23.5A2.5 2.5 0 0 1 44.5 23.5Z" fill="#14505c"/>` +
        `<circle cx="30" cy="22.8" r="2.1" fill="#dffff4"/><circle cx="30.3" cy="23.4" r="1.3" fill="#4fd8b0"/><circle cx="30.5" cy="23.5" r=".65" fill="#03100c"/><path d="M27.9 23A2.1 2.1 0 0 1 32.1 23Z" fill="#14505c"/>` +
        `<path d="M55 5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6zM22 14l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="#fff1c8"/>`,
    )
  );
};

const kraken: Draw = ({ c, grad, d, ol }) => {
  const arm = (dd: string, w: number) => `<path d="${dd}" stroke="${c(0xb0284a)}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const dots = (dd: string) => d(`<path d="${dd}" stroke="#ffd6de" stroke-width="1" fill="none" stroke-dasharray=".1 2.2" stroke-linecap="round" transform="translate(0 .8)"/>`);
  const a1 = 'M38 21C46 17 50 9 59 7Q63 7 62 11Q60 13 58 11';
  const a2 = 'M39 23C48 20 54 17 61 18Q63 21 60 22';
  const a3 = 'M39 26C47 27 52 29 58 28Q62 28 61 31Q59 32 57.5 30.5';
  const a4 = 'M38 28C44 32 48 36 55 36Q59 37 58 39';
  const a5 = 'M37 20C40 12 44 6 50 4Q53 4 52 7';
  return (
    arm(a5, 2.8) + arm(a4, 2.8) +
    `<path d="M18 21L3 13Q10 21 3 29Z" fill="${c(0x9a2a50)}"/>` + // the fins on the mantle's tip
    `<path d="M4 21C12 14 26 13 40 16C44 17 44 25 40 26C26 29 12 28 4 21Z" fill="${grad(0xb0284a, 0x6a1430)}" ${ol}/>` +
    d(`<path d="M10 21C20 18 34 18 41 20" stroke="#e8a0b2" stroke-width="1.4" fill="none" opacity=".6"/><circle cx="18" cy="19" r="1.2" fill="#f2b8c2"/><circle cx="26" cy="17.5" r="1.3" fill="#f2b8c2"/><circle cx="24" cy="23" r="1.1" fill="#f2b8c2"/><circle cx="32" cy="22" r="1.2" fill="#f2b8c2"/>`) +
    arm(a1, 3.2) + arm(a3, 3.2) + arm(a2, 3.6) + dots(a1) + dots(a2) + dots(a3) +
    `<circle cx="42" cy="21.5" r="5" fill="${c(0xb0284a)}" ${ol}/>` +
    d(`<circle cx="42.6" cy="21.4" r="3.5" fill="#ffc23a"/><path d="M39.6 21.4h6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/><circle cx="42.6" cy="21.4" r="6.5" fill="#ffc23a" opacity=".18"/>`)
  );
};

const ICONS: Record<string, Draw> = { grouper, marlin, kelpbeard, kelpwyrm, oarfish, chandelier, leviathan, dreamer, kraken };

/** The icon for one of the nine sea legends, or null for any other fish. */
export function legendIcon(id: string, opts: { hidden?: boolean; shiny?: boolean } = {}): string | null {
  const draw = ICONS[id];
  if (!draw) return null;
  const hid = !!opts.hidden;
  const k = ++uid;
  const defs: string[] = [];
  const ctx: Ctx = {
    hid,
    defs,
    k,
    c: (n) => (hid ? INK : hex(opts.shiny ? mix(n, 0xffd23a, 0.55) : n)),
    grad: (back, belly) => {
      if (hid) return INK;
      const gc = (n: number) => hex(opts.shiny ? mix(n, 0xffd23a, 0.55) : n);
      const gid = `lg${k}_${defs.length}`;
      defs.push(`<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="${gc(back)}"/><stop offset=".8" stop-color="${gc(belly)}"/></linearGradient>`);
      return `url(#${gid})`;
    },
    d: (s) => (hid ? '' : opts.shiny ? goldDetail(s) : s),
    ol: hid ? '' : `stroke="${INK}" stroke-opacity=".25" stroke-width=".8"`,
  };
  const art = draw(ctx);
  const glint = opts.shiny ? `<path d="M50 4l1.4 3.2 3.2 1.4-3.2 1.4L50 13.2l-1.4-3.2L45.4 8.6l3.2-1.4z" fill="#fff6c2"/>` : '';
  return `<svg class="fishico" viewBox="0 0 64 40" aria-hidden="true"><defs>${defs.join('')}</defs>${art}${glint}</svg>`;
}

/** Details carry their own colours as hex strings; tint those toward gold too (white and ink stay). */
function goldDetail(s: string): string {
  return s.replace(/#([0-9a-f]{6})\b/gi, (m, h: string) => {
    const n = parseInt(h, 16);
    return n === 0x2a1b0f || n === 0xffffff || n === 0x03100c ? m : hex(mix(n, 0xffd23a, 0.55));
  });
}
