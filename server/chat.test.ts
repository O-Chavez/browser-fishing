import { describe, expect, it } from 'vitest';
import { CHAT_MAX, CHAT_REPEAT_MS, CHAT_WINDOW_MS, ChatGate, censor, cleanText } from './chat';

describe('chat text', () => {
  it('trims, collapses whitespace, strips control characters and caps the length', () => {
    expect(cleanText('  hi \n\t there\u0000 ')).toBe('hi there');
    expect(cleanText('x'.repeat(500))).toHaveLength(CHAT_MAX);
    expect(cleanText('   ')).toBe('');
    expect(cleanText(42)).toBe('');
  });

  it('masks rude words, including common spellings, and leaves innocent words alone', () => {
    expect(censor('what the fuck')).toBe('what the ****');
    expect(censor('sh1t happens')).toBe('**** happens');
    expect(censor('FUUUCK')).toBe('******');
    expect(censor('you ass')).toBe('you ***');
    expect(censor('nice class, pass the cocktail, Dickens')).toBe('nice class, pass the cocktail, Dickens');
    expect(censor('caught a bass!')).toBe('caught a bass!');
  });
});

describe('ChatGate', () => {
  const setup = () => {
    let t = 0;
    return { gate: new ChatGate(() => t), advance: (ms: number) => (t += ms) };
  };

  it('allows a burst, then asks the player to slow down until the window passes', () => {
    const { gate, advance } = setup();
    expect(gate.check('Ann', 'a').ok).toBe(true);
    expect(gate.check('Ann', 'b').ok).toBe(true);
    expect(gate.check('Ann', 'c').ok).toBe(true);
    expect(gate.check('Ann', 'd')).toMatchObject({ ok: false, msg: expect.stringContaining('Slow down') });
    expect(gate.check('Bob', 'hi').ok).toBe(true);
    advance(CHAT_WINDOW_MS);
    expect(gate.check('ann', 'e').ok).toBe(true);
  });

  it('blocks repeating the same message for a while', () => {
    const { gate, advance } = setup();
    expect(gate.check('Ann', 'hello').ok).toBe(true);
    expect(gate.check('Ann', 'HELLO ')).toMatchObject({ ok: false });
    advance(CHAT_REPEAT_MS);
    expect(gate.check('Ann', 'hello').ok).toBe(true);
  });

  it('ignores empty messages silently and censors what it accepts', () => {
    const { gate } = setup();
    expect(gate.check('Ann', '   ')).toEqual({ ok: false });
    expect(gate.check('Ann', 'oh shit')).toEqual({ ok: true, text: 'oh ****' });
  });

  it('prunes quiet accounts', () => {
    const { gate, advance } = setup();
    gate.check('Ann', 'a');
    advance(CHAT_REPEAT_MS + 1);
    gate.prune();
    expect((gate as any).sent.size).toBe(0);
  });
});
