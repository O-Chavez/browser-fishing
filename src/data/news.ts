/**
 * The "What's new" board: one entry per notable feature release, newest first. A returning player
 * sees the entries they haven't read in a card right after joining, and Settings re-opens the whole
 * board. Feature additions only: no balance tweaks, bug fixes or small adjustments.
 *
 * Adding an entry (see "What's new board" in CLAUDE.md):
 * - Put it at the top with `id` one higher than the current top entry. Ids are never reused or
 *   renumbered: the browser remembers the highest id it has shown (`src/game/news.ts`).
 * - Write for players, in the words the game uses on screen. Body paragraphs may hold simple HTML
 *   (`<b>`, `<kbd>`); only this file goes in, so nothing is escaped.
 * - A photo is optional, for the big releases: a 16:9 JPEG of about 1280x720 and under 200 KB in
 *   `src/assets/images/news/`, imported here so Vite bundles it.
 *
 * Example:
 *   import delve from '../assets/images/news/delve.jpg';
 *   { id: 1, date: '2026-11-20', title: 'The Delve', image: delve, alt: 'Diving below the pond',
 *     body: ['Past level 30, ...', 'Ask <b>Captain Reed</b> at the harbour to ...'] },
 */
import deepSea from '../assets/images/news/deep-sea.jpg';
import fightLeft from '../assets/images/news/fight-left.jpg';

export interface NewsEntry {
  /** Release number: unique, and higher than every entry below it. */
  id: number;
  /** Release day, YYYY-MM-DD. */
  date: string;
  title: string;
  /** Paragraphs, HTML allowed. Two or three short ones. */
  body: string[];
  /** A bundled image URL (an `import` from `src/assets/images/news/`). */
  image?: string;
  /** What the image shows, for screen readers. Required with `image`. */
  alt?: string;
}

export const NEWS: NewsEntry[] = [
  {
    id: 2,
    date: '2026-11-01',
    title: 'Wear down the big ones',
    image: fightLeft,
    alt: "A charter fight at Marker 35 in the Drop-off: above the reel gauge a half-empty yellow FIGHT bar, and under it a tag reads Runner, long pulls that take line",
    body: [
      "Fish at sea now tire as you fight them. The <b>Fight</b> bar above the reel gauge shows how much fight a hooked fish has left.",
      "Keep your line tight through its surges to wear it down; the bar glows while it's tiring. As the bar runs low the fish pulls weaker, in shorter surges that come less often, and once it's empty the fish stops fighting: reel it in.",
      "A tag under the gauge shows how each fish fights and whether it's a strong one. When it turns red, that fish is too strong for your line and won't tire out of the red: the <b>Deep Sea Line</b> at <b>Marlow's stall</b> holds it.",
    ],
  },
  {
    id: 1,
    date: '2026-11-01',
    title: 'Charters to the deep sea',
    image: deepSea,
    alt: 'The Kraken, a giant crimson squid with a glowing golden eye, rearing its arms out of towering storm waves far out at sea',
    body: [
      "<b>Captain Reed</b>'s seaplane is flying again! Bring the <b>Aurora Rod</b> to his stand on the west beach and cast off on a charter to the open sea. Every 5 fish you land, you reach a marker: <b>Head home</b> with your haul of <b>Black Pearls</b>, or <b>Sail on</b> for a bigger one.",
      'The further out you sail, the stranger the fish: leafy seadragons in <b>Kelp Deep</b>, glowing anglers in <b>the Twilight</b>, and in <b>the Abyss</b>, things with far too many eyes. Every zone has its own legends, long, hard fights that are worth a fortune.',
      "Spend your Black Pearls at <b>Marlow's stall</b> to level up the Aurora Rod and the new <b>Deep Sea Line</b>. The rod makes your line last, and the line keeps strong fish from snapping it.",
    ],
  },
];
