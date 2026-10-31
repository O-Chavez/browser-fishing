import { glowColor, glowStep } from '../data/dive';

/** Rod shaft colours by tier, matching the tier colours used across the UI (`--t1`..`--t5`). */
const SHAFT = ['#b9b9b9', '#4cd964', '#4a90e2', '#b05ce6', '#ffc933'];

/**
 * A fishing rod as inline SVG: cork handle, reel, a shaft in the rod's tier colour, line and
 * bobber. Drawn with a dark outline so it reads on both the wood HUD and the parchment menus
 * (the 🎣 emoji was faint on dark backgrounds and identical for every rod).
 */
export function rodIcon(tier: number, rodLevel = 0): string {
  const shaft = SHAFT[Math.max(0, Math.min(4, tier - 1))];
  return `<svg class="rodico" viewBox="0 0 40 40" aria-hidden="true">${tipGlow(rodLevel, 'under')}
    <path d="M14 27 Q24 12 35 5" fill="none" stroke="#2a1b0f" stroke-width="5" stroke-linecap="round"/>
    <path d="M14 27 Q24 12 35 5" fill="none" stroke="${shaft}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M35 5 L31 23" stroke="#fff4dc" stroke-width="1.1" stroke-linecap="round"/>
    <circle cx="31" cy="25.5" r="3" fill="#e5533d" stroke="#2a1b0f" stroke-width="1.4"/>
    <path d="M28.2 25.5 h5.6" stroke="#fff4dc" stroke-width="1.4"/>
    <path d="M6 35 L15 26" stroke="#2a1b0f" stroke-width="7" stroke-linecap="round"/>
    <path d="M6 35 L15 26" stroke="#c8925a" stroke-width="4.4" stroke-linecap="round"/>
    <circle cx="14.5" cy="31" r="3.6" fill="#8a8f98" stroke="#2a1b0f" stroke-width="1.6"/>
    <circle cx="14.5" cy="31" r="1.2" fill="#ffc933"/>${tipGlow(rodLevel, 'over')}
  </svg>`;
}

/** A levelled Aurora Rod's glow at the icon's tip, in its glow step's colour (a rainbow from the last step): a halo under the rod, a bright dot over it. */
function tipGlow(rodLevel: number, part: 'under' | 'over'): string {
  const step = glowStep(rodLevel);
  if (step < 1) return '';
  const c = glowColor(step);
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  const fill = c === null ? 'url(#rodglow-rainbow)' : hex(c);
  const defs = c === null
    ? '<defs><linearGradient id="rodglow-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fa8"/><stop offset=".33" stop-color="#ffc933"/><stop offset=".66" stop-color="#3fe6c8"/><stop offset="1" stop-color="#a77bff"/></linearGradient></defs>'
    : '';
  if (part === 'over') return `<circle cx="35" cy="5" r="2.2" fill="${fill}" stroke="#2a1b0f" stroke-width=".8"/>`;
  return `${defs}<circle cx="35" cy="5" r="${4 + 0.6 * Math.min(step, 5)}" fill="${fill}" opacity=".45"/>`;
}
