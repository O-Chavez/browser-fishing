import { glowColor, glowStep } from '../data/dive';

/** Rod shaft colours by tier, matching the tier colours used across the UI (`--t1`..`--t5`). */
const SHAFT = ['#b9b9b9', '#4cd964', '#4a90e2', '#b05ce6', '#ffc933'];

/**
 * A pond rod as inline SVG: cork handle, reel, a shaft in the rod's tier colour, line and
 * bobber. Drawn with a dark outline so it reads on both the wood HUD and the parchment menus
 * (the 🎣 emoji was faint on dark backgrounds and identical for every rod).
 */
export function rodIcon(tier: number): string {
  const shaft = SHAFT[Math.max(0, Math.min(4, tier - 1))];
  return `<svg class="rodico" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M14 27 Q24 12 35 5" fill="none" stroke="#2a1b0f" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 27 Q24 12 35 5" fill="none" stroke="${shaft}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M35 5 L31 23" stroke="#fff4dc" stroke-width="1.1" stroke-linecap="round"/>
    <circle cx="31" cy="25.5" r="3" fill="#e5533d" stroke="#2a1b0f" stroke-width="1.4"/>
    <path d="M28.2 25.5 h5.6" stroke="#fff4dc" stroke-width="1.4"/>
    <path d="M6 35 L15 26" stroke="#2a1b0f" stroke-width="7" stroke-linecap="round"/>
    <path d="M6 35 L15 26" stroke="#c8925a" stroke-width="4.4" stroke-linecap="round"/>
    <circle cx="14.5" cy="31" r="3.6" fill="#8a8f98" stroke="#2a1b0f" stroke-width="1.6"/>
    <circle cx="14.5" cy="31" r="1.2" fill="#ffc933"/>
  </svg>`;
}

/**
 * The Deep Sea Rod, in the same style: a stout navy blank with sea-teal wraps, a chunky brass lever reel with its red
 * drag lever, and a gimbal butt; a levelled rod's glow at the tip.
 */
export function seaRodIcon(rodLevel = 0): string {
  const O = '#2a1b0f';
  return `<svg class="rodico" viewBox="0 0 40 40" aria-hidden="true">${tipGlow(rodLevel, 'under', 33, 8)}
    <path d="M12 28 Q22 15 33 8" fill="none" stroke="${O}" stroke-width="6.4" stroke-linecap="round"/>
    <path d="M12 28 Q22 15 33 8" fill="none" stroke="#36548f" stroke-width="3.8" stroke-linecap="round"/>
    <path d="M20 19.6 l1.8 1.6 M26 13.6 l1.6 1.6" stroke="#3fc7b4" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M4 37 L13 27" stroke="${O}" stroke-width="7.6" stroke-linecap="round"/>
    <path d="M4 37 L13 27" stroke="#263354" stroke-width="5" stroke-linecap="round"/>
    <circle cx="4.4" cy="36.6" r="2.4" fill="#d9a441" stroke="${O}" stroke-width="1.2"/>
    <rect x="9" y="26" width="12" height="9" rx="3.6" fill="#d9a441" stroke="${O}" stroke-width="1.6"/>
    <path d="M12.5 26 v9 M17.5 26 v9" stroke="#a87a2c" stroke-width="1.2"/>
    <path d="M20 27 l3.6 -3" stroke="#e5533d" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="33" cy="8" r="1.8" fill="#d9a441" stroke="${O}" stroke-width=".8"/>${tipGlow(rodLevel, 'over', 33, 8)}
  </svg>`;
}

/** A levelled rod's glow at the icon's tip (x, y), in its glow step's colour (a rainbow from the last step): a halo under the rod, a bright dot over it. */
function tipGlow(rodLevel: number, part: 'under' | 'over', x: number, y: number): string {
  const step = glowStep(rodLevel);
  if (step < 1) return '';
  const c = glowColor(step);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const fill = c === null ? 'url(#rodglow-rainbow)' : hex(c);
  const defs = c === null
    ? '<defs><linearGradient id="rodglow-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fa8"/><stop offset=".33" stop-color="#ffc933"/><stop offset=".66" stop-color="#3fe6c8"/><stop offset="1" stop-color="#a77bff"/></linearGradient></defs>'
    : '';
  if (part === 'over') return `<circle cx="${x}" cy="${y}" r="2.2" fill="${fill}" stroke="#2a1b0f" stroke-width=".8"/>`;
  return `${defs}<circle cx="${x}" cy="${y}" r="${4 + 0.6 * Math.min(step, 5)}" fill="${fill}" opacity=".45"/>`;
}
