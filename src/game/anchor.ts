import { MAX_RANK } from '../data/ranks';

/**
 * The anchor by a max-rank player's name (Lord of the Deep, level 150): on the name tag over their avatar, in chat and
 * in the Anglers lists, left of the supporter 💗. It's drawn as strokes on a 24x24 grid in the level pill's aurora
 * colours, so it looks the same on every device (an emoji wouldn't). In HTML it's `.anchor`, masked by `--anchor-mask`.
 */
export const ANCHOR_PATH =
  'M12 7v14 M7.5 10.5h9 M4.5 14.5c.6 4 3.6 6.5 7.5 6.5s6.9-2.5 7.5-6.5 M2.6 16.4l1.9-1.9 2.3 1.1 M21.4 16.4l-1.9-1.9-2.3 1.1 M14.2 4.6a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0';

// The same strokes as the HTML mask (`.anchor::before`, `src/style.css`), set once so the shape lives only here.
if (typeof document !== 'undefined') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><path d='${ANCHOR_PATH}'/></svg>`;
  document.documentElement.style.setProperty('--anchor-mask', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
}

/** The level pill's aurora colours (`#lvl[data-pill="aurora"]`, `src/style.css`). */
const AURORA = ['#5af0c4', '#7aa8ff', '#c58bff'];

/** The anchor for HTML lists and chat, or nothing below the last rank. */
export const anchorHtml = (show: boolean): string =>
  show ? `<span class="anchor" role="img" aria-label="${MAX_RANK.title}" title="${MAX_RANK.title}"></span>` : '';

/** Draws the anchor on a canvas with its top-left at (x, y), `size` px square, outlined like the name tag's text. */
export function drawAnchor(g: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const path = new Path2D(ANCHOR_PATH);
  const k = size / 24;
  const grad = g.createLinearGradient(x, y, x + size, y + size);
  AURORA.forEach((c, i) => grad.addColorStop(i / (AURORA.length - 1), c));
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 2.4 + 5 / k;
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.stroke(path);
  g.lineWidth = 2.4;
  g.strokeStyle = grad;
  g.stroke(path);
  g.restore();
}
