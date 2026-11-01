import { NEWS, type NewsEntry } from '../data/news';

/**
 * The "What's new" board's reading state lives in this browser, not the account: the highest entry id
 * shown here. Joining with unread entries opens them in a card; Settings re-opens the whole board.
 */
export const NEWS_KEY = 'fishing-news';

/** The join card shows at most this many entries; older unread ones wait on the board in Settings. */
export const GLANCE_MAX = 3;

/** The newest entry's id, 0 with no entries. */
export const latestNews = (list: readonly NewsEntry[] = NEWS): number => list[0]?.id ?? 0;

/** The stored id, or null if this browser has never recorded one. */
export function readSeen(raw: string | null): number | null {
  const n = Number(raw);
  return raw !== null && raw !== '' && Number.isFinite(n) ? n : null;
}

/**
 * What the card on joining shows: the unread entries, newest first. A brand-new player (a fresh save
 * on a browser with nothing recorded) skips everything from before they started.
 */
export function unreadNews(seen: number | null, fresh: boolean, list: readonly NewsEntry[] = NEWS): NewsEntry[] {
  if (seen === null && fresh) return [];
  return list.filter((e) => e.id > (seen ?? 0));
}

/** "Oct 31, 2026" from YYYY-MM-DD, read as a calendar day (no time zone shift). */
export function newsDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The board as HTML. `glance`: the card on joining, which lists the unread entries (up to GLANCE_MAX)
 * and closes with "Got it"; otherwise the full board opened from Settings, with a way back.
 */
export function newsHtml(entries: readonly NewsEntry[], glance: boolean): string {
  const shown = glance ? entries.slice(0, GLANCE_MAX) : entries;
  const items = shown
    .map((e) => {
      const img = e.image ? `<img src="${e.image}" alt="${e.alt ?? ''}">` : '';
      return `<article class="news-item${img ? ' pic' : ''}">${img}<div class="news-text"><span class="news-date">${newsDate(e.date)}</span><h3>${e.title}</h3>${e.body.map((p) => `<p>${p}</p>`).join('')}</div></article>`;
    })
    .join('');
  const empty = shown.length ? '' : '<p class="news-empty">No news yet. Check back after the next big update!</p>';
  const more = entries.length - shown.length;
  const note = more > 0 ? `<span>${more} more on the board: ⚙️ Settings → What's new</span>` : '<span></span>';
  const act = glance ? '<button class="btn gold" data-act="close">Got it</button>' : '<button class="btn plain" data-tab="settings">← Settings</button>';
  return `<div class="news">${items}${empty}<div class="strip news-foot">${note}${act}</div></div>`;
}
