import { describe, expect, it } from 'vitest';
import { CHAT_KEYBOARD_KEY, parseChatKeyboard, readChatKeyboard, writeChatKeyboard } from './chatkeyboard';

describe('chat keyboard setting', () => {
  it("is the game's keyboard unless the phone's is saved", () => {
    expect(parseChatKeyboard(null)).toBe('game');
    expect(parseChatKeyboard('nonsense')).toBe('game');
    expect(parseChatKeyboard('phone')).toBe('phone');
  });

  it('saves and reads the choice', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect(readChatKeyboard(store)).toBe('game');
    writeChatKeyboard('phone', store);
    expect(m.get(CHAT_KEYBOARD_KEY)).toBe('phone');
    expect(readChatKeyboard(store)).toBe('phone');
  });

  it('falls back to the default when storage throws', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readChatKeyboard(bad)).toBe('game');
    expect(() => writeChatKeyboard('phone', bad)).not.toThrow();
  });
});
