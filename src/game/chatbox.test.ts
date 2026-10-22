import { describe, expect, it } from 'vitest';
import { CHAT_TTL_MS, commandMatches, liveLines, shownLines, typedCommand, type ChatLine } from './chatbox';

const line = (text: string, map = 'pond', at = 0): ChatLine => ({ name: 'Ann', map, text, self: false, at });

describe('chat window lines', () => {
  it('drops lines five minutes after they arrive', () => {
    const lines = [line('old', 'pond', 0), line('new', 'pond', 60_000)];
    expect(liveLines(lines, CHAT_TTL_MS - 1).map((l) => l.text)).toEqual(['old', 'new']);
    expect(liveLines(lines, CHAT_TTL_MS).map((l) => l.text)).toEqual(['new']);
  });

  it('shows the newest eight, optionally from one world only', () => {
    const lines = Array.from({ length: 12 }, (_, i) => line(`m${i}`, i % 2 ? 'casino' : 'pond'));
    expect(shownLines(lines, null).map((l) => l.text)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']);
    expect(shownLines(lines, 'casino').map((l) => l.text)).toEqual(['m1', 'm3', 'm5', 'm7', 'm9', 'm11']);
  });

  it('keeps server notices in every world filter', () => {
    const lines = [line('hi', 'pond'), { ...line('Bob has joined', ''), system: true }];
    expect(shownLines(lines, 'casino').map((l) => l.text)).toEqual(['Bob has joined']);
  });
});

describe('slash command completion', () => {
  const names = (t: string) => commandMatches(t)?.map((c) => c.cmd) ?? null;

  it('offers the commands that start with what is typed, only while the name is being typed', () => {
    expect(names('/')).toEqual(['bug', 'idea', 'feedback']);
    expect(names('/i')).toEqual(['idea']);
    expect(names('/F')).toEqual(['feedback']);
    expect(names('/x')).toEqual([]);
    expect(names('/bug ')).toBeNull();
    expect(names('hello')).toBeNull();
  });

  it('keeps dev console commands unlisted', () => {
    expect(names('/l')).toEqual([]);
    expect(names('/re')).toEqual([]);
  });

  it('knows which command is being written', () => {
    expect(typedCommand('/bug my fish vanished')?.cmd).toBe('bug');
    expect(typedCommand('/Idea ')?.cmd).toBe('idea');
    expect(typedCommand('/bug')).toBeUndefined();
    expect(typedCommand('/login admin x')).toBeUndefined();
  });
});
