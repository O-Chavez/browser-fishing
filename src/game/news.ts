import { NEWS, type NewsEntry } from '../data/news';

/**
 * The "What's new" board's reading state lives in this browser, not the account: the highest entry id
 * shown here. The home screen's button counts the unread entries, and opening the board (there or from
 * Settings) marks them read.
 */
export const NEWS_KEY = 'fishing-news';

/** The newest entry's id, 0 with no entries. */
export const latestNews = (list: readonly NewsEntry[] = NEWS): number => list[0]?.id ?? 0;

/** The stored id, or null if this browser has never recorded one. */
export function readSeen(raw: string | null): number | null {
  const n = Number(raw);
  return raw !== null && raw !== '' && Number.isFinite(n) ? n : null;
}

/**
 * The entries this browser hasn't shown, newest first: what the home screen's badge counts and the board
 * marks "NEW". A brand-new player (a fresh save on a browser with nothing recorded) skips everything from
 * before they started.
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

/** The board as HTML: every entry, newest first, with a "NEW" chip on those in `unread`. `foot` goes under them (Settings' way back). */
export function newsHtml(entries: readonly NewsEntry[], unread: readonly NewsEntry[] = [], foot = ''): string {
  const fresh = new Set(unread.map((e) => e.id));
  const items = entries
    .map((e) => {
      const img = e.image ? `<img src="${e.image}" alt="${e.alt ?? ''}">` : '';
      const chip = fresh.has(e.id) ? '<b class="news-new">NEW</b>' : '';
      return `<article class="news-item${img ? ' pic' : ''}">${img}<div class="news-text"><span class="news-date">${newsDate(e.date)}${chip}</span><h3>${e.title}</h3>${e.body.map((p) => `<p>${p}</p>`).join('')}</div></article>`;
    })
    .join('');
  const empty = entries.length ? '' : '<p class="news-empty">No news yet. Check back after the next big update!</p>';
  return `<div class="news">${items}${empty}${foot}</div>`;
}
