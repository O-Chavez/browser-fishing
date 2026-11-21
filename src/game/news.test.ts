import { describe, expect, it } from 'vitest';
import { NEWS, type NewsEntry } from '../data/news';
import { latestNews, newsDate, newsHtml, readSeen, unreadNews } from './news';

const entry = (id: number, extra: Partial<NewsEntry> = {}): NewsEntry => ({ id, date: '2026-11-01', title: `Feature ${id}`, body: ['Something new.'], ...extra });
const list = [entry(5), entry(4), entry(3), entry(2), entry(1)];

describe('What\'s new board', () => {
  it('reads the stored id, or null when there is none', () => {
    expect(readSeen(null)).toBeNull();
    expect(readSeen('')).toBeNull();
    expect(readSeen('junk')).toBeNull();
    expect(readSeen('3')).toBe(3);
  });

  it('shows a returning player the entries newer than the last one seen', () => {
    expect(unreadNews(3, false, list).map((e) => e.id)).toEqual([5, 4]);
    expect(unreadNews(5, false, list)).toEqual([]);
    // Seen on this browser before, so a fresh save (an account reset, a new account) still gets later news.
    expect(unreadNews(3, true, list).map((e) => e.id)).toEqual([5, 4]);
  });

  it('skips old news for a brand-new player, but not for a returning one on a new browser', () => {
    expect(unreadNews(null, true, list)).toEqual([]);
    expect(unreadNews(null, false, list)).toHaveLength(5);
  });

  it('lists the whole board, with a chip on the unread entries only', () => {
    const board = newsHtml(list, unreadNews(3, false, list));
    expect(board.match(/<article/g)).toHaveLength(list.length);
    expect(board.match(/news-new/g)).toHaveLength(2);
    // The chips sit on the two newest, which come first.
    expect(board.indexOf('news-new')).toBeLessThan(board.indexOf('Feature 5'));
    expect(board.lastIndexOf('news-new')).toBeLessThan(board.indexOf('Feature 4'));
    expect(newsHtml(list)).not.toContain('news-new');
  });

  it('ends with the way back it is given, and says so when there is no news', () => {
    const back = '<button data-tab="settings">← Settings</button>';
    expect(newsHtml(list, [], back).endsWith(`${back}</div>`)).toBe(true);
    expect(newsHtml([])).toContain('No news yet');
  });

  it('draws a photo only for entries that have one', () => {
    expect(newsHtml([entry(1)])).not.toContain('<img');
    expect(newsHtml([entry(1, { image: '/x.jpg', alt: 'A boat' })])).toContain('<img src="/x.jpg" alt="A boat">');
  });

  it('formats the release day without a time zone shift', () => {
    expect(newsDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(newsDate('2026-10-31')).toBe('Oct 31, 2026');
  });

  // Guards for hand-written entries in src/data/news.ts.
  it('keeps the entries newest first, with unique rising ids and real dates', () => {
    expect(latestNews()).toBe(NEWS[0]?.id ?? 0);
    NEWS.forEach((e, i) => {
      expect(Number.isInteger(e.id) && e.id > 0, `id ${e.id}`).toBe(true);
      if (i > 0) {
        expect(e.id, `${e.title} must have a lower id than the entry above it`).toBeLessThan(NEWS[i - 1].id);
        expect(e.date <= NEWS[i - 1].date, `${e.title} must not be newer than the entry above it`).toBe(true);
      }
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(newsDate(e.date)).not.toBe('Invalid Date');
      expect(e.title.trim()).not.toBe('');
      expect(e.body.length).toBeGreaterThan(0);
      if (e.image) expect(e.alt?.trim(), `${e.title} needs alt text for its image`).toBeTruthy();
    });
  });
});
