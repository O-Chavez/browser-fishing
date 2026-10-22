import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import type { ServerMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { FEEDBACK_BURST, FEEDBACK_MAX, FEEDBACK_SERVER_MAX, FEEDBACK_WINDOW_MS, FeedbackGate, browserName, feedbackPost, parseTags, type FeedbackReport } from './feedback';
import { Room } from './room';

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const setup = () => {
  let now = 1_700_000_000_000;
  const store = new AccountStore();
  const room = new Room('lobby', MAPS, () => {}, () => now);
  const reports: FeedbackReport[] = [];
  room.report = (r) => reports.push(r);
  const join = (name: string) => {
    const res = store.auth(name, 'token-token-token-' + name);
    if (!res.ok) throw new Error(res.msg);
    const log: ServerMsg[] = [];
    const id = room.join({ send: (m) => log.push(m), ua: CHROME_MAC }, res.account);
    const replies = () => log.flatMap((m) => (m.t === 'dev' ? m.lines : []));
    return { id, log, replies, acct: res.account };
  };
  return { room, join, reports, advance: (ms: number) => (now += ms) };
};

describe('feedback commands', () => {
  it('sends a report with server-side context and thanks the player', () => {
    const { room, join, reports } = setup();
    const a = join('Ann');
    a.acct.save.level = 7;
    room.handle(a.id, { t: 'pos', x: 3.14, z: -2, yaw: 0 });
    room.handle(a.id, { t: 'cmd', text: '/bug   my fish   vanished when I sold it' });
    expect(reports).toEqual([
      { kind: 'bug', text: 'my fish vanished when I sold it', name: 'Ann', level: 7, map: 'Starter Pond', x: 3.14, z: -2, room: 'lobby', browser: 'Chrome 141 on macOS', at: 1_700_000_000_000 },
    ]);
    expect(a.replies().at(-1)).toMatch(/bug report was sent/);
    // Never broadcast as chat.
    expect(a.log.some((m) => m.t === 'chat')).toBe(false);
  });

  it('handles /idea and /feedback, case-insensitively, without a dev login', () => {
    const { room, join, reports } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/IDEA a glowing rod' });
    room.handle(a.id, { t: 'cmd', text: '/feedback love the casino' });
    expect(reports.map((r) => [r.kind, r.text])).toEqual([['idea', 'a glowing rod'], ['feedback', 'love the casino']]);
  });

  it('refuses empty reports and censors rude words', () => {
    const { room, join, reports } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/bug' });
    expect(reports).toHaveLength(0);
    expect(a.replies().at(-1)).toMatch(/Add a few words/);
    room.handle(a.id, { t: 'cmd', text: '/bug this shit is broken' });
    expect(reports[0].text).toBe('this **** is broken');
  });

  it('caps the length well above chat', () => {
    const { room, join, reports } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/idea ' + 'x'.repeat(2000) });
    expect(reports[0].text).toHaveLength(FEEDBACK_MAX);
  });

  it('rate-limits per account', () => {
    const { room, join, reports, advance } = setup();
    const a = join('Ann');
    for (let i = 0; i <= FEEDBACK_BURST; i++) room.handle(a.id, { t: 'cmd', text: `/bug report number ${i}` });
    expect(reports).toHaveLength(FEEDBACK_BURST);
    expect(a.replies().at(-1)).toMatch(/Try again in a few minutes/);
    advance(FEEDBACK_WINDOW_MS);
    room.handle(a.id, { t: 'cmd', text: '/bug one more report' });
    expect(reports).toHaveLength(FEEDBACK_BURST + 1);
  });

  it('caps reports server-wide', () => {
    const gate = new FeedbackGate(() => 0);
    for (let i = 0; i < FEEDBACK_SERVER_MAX; i++) expect(gate.check(`p${i}`, 'bug', 'something broke').ok).toBe(true);
    expect(gate.check('late', 'bug', 'something broke')).toEqual({ ok: false, msg: expect.stringMatching(/busy/) });
  });

  it('still answers unknown commands with a hint', () => {
    const { room, join, reports } = setup();
    const a = join('Ann');
    room.handle(a.id, { t: 'cmd', text: '/coins 999' });
    expect(reports).toHaveLength(0);
    expect(a.replies().at(-1)).toMatch(/\/bug/);
    expect(a.acct.save.coins).not.toBe(999);
  });
});

describe('feedback formatting', () => {
  const report: FeedbackReport = { kind: 'bug', text: 'fish vanished', name: 'a_b', level: 7, map: 'Starter Pond', x: 3.14, z: -2, room: 'lobby', browser: 'Chrome 141 on macOS', at: 1_700_000_000_000, build: 'abc1234' };

  it('opens a forum post with context and tags', () => {
    const post = feedbackPost(report, { bug: '11', idea: '22', new: '33' }) as Record<string, unknown>;
    expect(post.thread_name).toBe('[Bug] fish vanished');
    expect(post.applied_tags).toEqual(['11', '33']);
    expect(post.content).toBe(
      ['> fish vanished', '', '**Player** a\\_b · level 7 · Starter Pond (3.1, -2.0)', '**Browser** Chrome 141 on macOS', '**Build** abc1234 · <t:1700000000:f>'].join('\n'),
    );
  });

  it('trims long titles and leaves tags out when unset', () => {
    const post = feedbackPost({ ...report, kind: 'idea', text: 'y'.repeat(300), room: 'test' }) as Record<string, string>;
    expect(post.thread_name).toHaveLength(100);
    expect(post.thread_name.endsWith('…')).toBe(true);
    expect(post).not.toHaveProperty('applied_tags');
    expect(post.content).toContain('· room test');
  });

  it('falls back to a plain message for text channels', () => {
    const post = feedbackPost(report, { bug: '11' }, false) as Record<string, string>;
    expect(Object.keys(post)).toEqual(['content']);
    expect(post.content.startsWith('**Bug** from a\\_b\n> fish vanished')).toBe(true);
  });

  it('parses tag ids and browsers', () => {
    expect(parseTags('bug=1, idea = 2,junk,new=x')).toEqual({ bug: '1', idea: '2' });
    expect(parseTags(undefined)).toEqual({});
    expect(browserName(CHROME_MAC)).toBe('Chrome 141 on macOS');
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari 18 on iOS');
    expect(browserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox 131 on Windows');
    expect(browserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toBe('Edge 141 on Windows');
    expect(browserName(undefined)).toBe('Unknown browser on unknown OS');
  });
});
