/** Rod shaft colours by tier, matching the tier colours used across the UI (`--t1`..`--t5`). */
const SHAFT = ['#b9b9b9', '#4cd964', '#4a90e2', '#b05ce6', '#ffc933'];

/**
 * A fishing rod as inline SVG: cork handle, reel, a shaft in the rod's tier colour, line and
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
