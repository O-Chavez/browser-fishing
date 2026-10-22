import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOIN_EVERY_MS, JOIN_GATHER_MS, JOIN_QUIET_MS, JoinFeed, NOT_FORUM, joinMessage, postWebhook } from './discord';

describe('JoinFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const posts: string[] = [];
    let online = 1;
    const feed = new JoinFeed((c) => posts.push(c), () => online);
    return { feed, posts, setOnline: (n: number) => (online = n) };
  };
  const ann = { name: 'Ann', isNew: true, level: 1, map: 'pond' };
  const bob = { name: 'Bob', isNew: false, level: 12, map: 'casino' };

  it('gathers a burst of joins into one message', () => {
    const { feed, posts, setOnline } = setup();
    feed.join(ann);
    vi.advanceTimersByTime(5000);
    feed.join(bob);
    setOnline(2);
    vi.advanceTimersByTime(JOIN_GATHER_MS - 5001);
    expect(posts).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain('2 players joined');
    expect(posts[0]).toContain('**Ann** · new player · Starter Pond');
    expect(posts[0]).toContain('**Bob** · level 12 · Casino Cove');
    expect(posts[0]).toContain('2 online');
  });

  it('posts at most once per interval', () => {
    const { feed, posts } = setup();
    feed.join(ann);
    vi.advanceTimersByTime(JOIN_GATHER_MS);
    expect(posts).toHaveLength(1);
    feed.join(bob);
    vi.advanceTimersByTime(JOIN_EVERY_MS - 1);
    expect(posts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toContain('**Bob** is back');
  });

  it('skips players who were online recently', () => {
    const { feed, posts } = setup();
    feed.join(bob);
    vi.advanceTimersByTime(JOIN_GATHER_MS);
    // Played for an hour, then a reconnect: quiet.
    vi.advanceTimersByTime(60 * 60_000);
    feed.left('Bob');
    vi.advanceTimersByTime(60_000);
    feed.join(bob);
    vi.advanceTimersByTime(JOIN_EVERY_MS);
    expect(posts).toHaveLength(1);
    // Back after a real break: posted again.
    feed.left('Bob');
    vi.advanceTimersByTime(JOIN_QUIET_MS + 1);
    feed.join(bob);
    vi.advanceTimersByTime(JOIN_EVERY_MS);
    expect(posts).toHaveLength(2);
  });

  it('escapes markdown in names and caps long lists', () => {
    expect(joinMessage([{ ...ann, name: 'a_b_c' }], 1)).toContain('**a\\_b\\_c**');
    const many = Array.from({ length: 20 }, (_, i) => ({ ...ann, name: `P${i}` }));
    const msg = joinMessage(many, 20);
    expect(msg).toContain('20 players joined');
    expect(msg).toContain('…and 5 more');
    expect(msg).not.toContain('P15');
  });
});

describe('postWebhook', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => vi.restoreAllMocks());

  it('disables mentions and reports success', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await postWebhook('https://x', { content: '@everyone hi' }, fetchFn)).toEqual({ ok: true });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ content: '@everyone hi', allowed_mentions: { parse: [] } });
  });

  it('retries once after a rate limit', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ retry_after: 0.01 }), { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await postWebhook('https://x', {}, fetchFn)).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns false instead of throwing when Discord is down', async () => {
    quiet();
    expect(await postWebhook('https://x', {}, vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))).toEqual({ ok: false });
    expect(await postWebhook('https://x', {}, vi.fn().mockResolvedValue(new Response('bad', { status: 400 })))).toEqual({ ok: false });
  });

  it('reports when the channel is not a forum', async () => {
    const body = JSON.stringify({ message: 'Webhooks can only create threads in forum channels', code: NOT_FORUM });
    expect(await postWebhook('https://x', { thread_name: 't' }, vi.fn().mockResolvedValue(new Response(body, { status: 400 })))).toEqual({ ok: false, code: NOT_FORUM });
  });
});
