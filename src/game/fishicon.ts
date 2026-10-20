/**
 * A small cartoon fish as inline SVG, tinted with the species color. Used wherever a fish
 * appears in the UI (hotbar, Fishdex, catch card) so caught fish never look like bait.
 * `hidden` draws a dark silhouette for undiscovered species.
 */
export function fishIcon(color: number, opts: { hidden?: boolean; shiny?: boolean } = {}): string {
  const body = opts.hidden ? '#2a1b0f' : `#${color.toString(16).padStart(6, '0')}`;
  const shade = opts.hidden ? '#2a1b0f' : 'rgba(0,0,0,.18)';
  const eye = opts.hidden ? '' : '<circle cx="47" cy="17" r="3.4" fill="#fff"/><circle cx="48" cy="17" r="1.8" fill="#2a1d17"/>';
  const glint = opts.shiny ? '<path d="M14 4l1.6 3.6L19 9l-3.4 1.4L14 14l-1.6-3.6L9 9l3.4-1.4z" fill="#fff6c2"/>' : '';
  return `<svg class="fishico" viewBox="0 0 64 40" aria-hidden="true">
    <path d="M14 20 L2 8 Q5 20 2 32 Z" fill="${body}"/>
    <ellipse cx="34" cy="20" rx="22" ry="13" fill="${body}"/>
    <path d="M24 9 Q32 1 42 8 Z" fill="${body}"/>
    <path d="M14 24 Q34 38 56 22 Q34 30 14 24 Z" fill="${shade}"/>
    ${eye}${glint}
  </svg>`;
}
