import { describe, expect, it } from 'vitest';
import { CHAT_MAX } from '../../server/chat';
import { BUBBLE_MS, bubbleMs, wrapBubble } from './bubbletext';

/** Every character is 10 wide, so a width of 200 holds 20 characters. */
const measure = (s: string) => [...s].length * 10;
const widest = (lines: string[]) => Math.max(...lines.map(measure));

describe('chat bubble text', () => {
  it('keeps a short line as it is', () => {
    expect(wrapBubble('hello from the pier', 200, measure)).toEqual(['hello from the pier']);
  });

  it('wraps a long message onto several lines without losing a word', () => {
    const text = 'does anyone know where the old lighthouse keeper sells the brass lantern, I have looked all over the harbour for it';
    expect(text.length).toBeGreaterThan(100);
    const lines = wrapBubble(text, 300, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(text);
    expect(widest(lines)).toBeLessThanOrEqual(300);
  });

  it('evens the lines out instead of leaving a stray last word', () => {
    // Filled greedily at 200 this would be "one two three four" over "five".
    const lines = wrapBubble('one two three four five', 200, measure);
    expect(lines).toEqual(['one two three', 'four five']);
  });

  it('cuts a word that is wider than a line', () => {
    const lines = wrapBubble('a'.repeat(45), 200, measure);
    expect(lines.join('')).toBe('a'.repeat(45));
    expect(lines).toHaveLength(3);
    expect(widest(lines)).toBeLessThanOrEqual(200);
  });

  it('carries on with words after a cut one', () => {
    const lines = wrapBubble(`look ${'z'.repeat(30)} wow`, 200, measure);
    expect(lines.join('').replace(/ /g, '')).toBe(`look${'z'.repeat(30)}wow`);
    expect(widest(lines)).toBeLessThanOrEqual(200);
  });

  it('never cuts an emoji in half', () => {
    const lines = wrapBubble('🐟'.repeat(30), 100, measure);
    expect(lines.join('')).toBe('🐟'.repeat(30));
    for (const l of lines) expect([...l].every((ch) => ch === '🐟')).toBe(true);
    expect(wrapBubble('👍🏽'.repeat(8), 40, measure).every((l) => l.length % 4 === 0)).toBe(true);
  });

  it('shows the longest message chat allows, whatever it is made of', () => {
    for (const text of ['w'.repeat(CHAT_MAX), 'ab '.repeat(CHAT_MAX / 3).trim(), '🐟'.repeat(CHAT_MAX)]) {
      const lines = wrapBubble(text, 200, measure);
      expect(lines.join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''));
      expect(widest(lines)).toBeLessThanOrEqual(200);
    }
  });

  it('has nothing to draw for an empty message', () => {
    expect(wrapBubble('', 200, measure)).toEqual([]);
  });

  it('stays up longer for a long message', () => {
    expect(bubbleMs('hello from the pier')).toBe(BUBBLE_MS);
    expect(bubbleMs('x'.repeat(40))).toBe(BUBBLE_MS);
    expect(bubbleMs('x'.repeat(CHAT_MAX))).toBe(10_000);
    // Counted in characters, as chat's own limit is.
    expect(bubbleMs('🐟'.repeat(40))).toBe(BUBBLE_MS);
  });
});
