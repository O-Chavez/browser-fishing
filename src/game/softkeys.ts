/**
 * The in-game chat keyboard on touch devices (`ChatBox`, style `.chat-keys` in style.css): our own keys at the bottom
 * of the screen in place of the phone's keyboard, which covers most of a landscape screen and hides what's typed.
 * This file is the layout and what each key does; `ChatBox` draws it and feeds it taps.
 */

export type Layer = 'abc' | 'sym';

/** What the keyboard is typing: the text, a one-shot capital, and which layer of keys shows. */
export interface KeyState {
  text: string;
  shift: boolean;
  layer: Layer;
}

/** A key: a character to type, or one of the named keys. */
export type Key = { ch: string } | { act: 'shift' | 'back' | 'space' | 'send' | 'layer' | 'native' };

const chars = (s: string): Key[] => [...s].map((ch) => ({ ch }));

/** Rows of keys per layer, top to bottom. The bottom row is the same on both. */
export const ROWS: Record<Layer, Key[][]> = {
  abc: [chars('qwertyuiop'), chars('asdfghjkl'), [{ act: 'shift' }, ...chars('zxcvbnm'), { act: 'back' }]],
  sym: [chars('1234567890'), chars('@#$&-/:;()'), [...chars('\'".,?!_*'), { act: 'back' }]],
};
export const BOTTOM: Key[] = [{ act: 'layer' }, { act: 'native' }, { ch: ',' }, { act: 'space' }, { ch: '.' }, { act: 'send' }];

/** A fresh keyboard: empty, with a capital for the first letter. */
export const startKeys = (): KeyState => ({ text: '', shift: true, layer: 'abc' });

/**
 * One key press. `send` and `native` don't change the text; the caller acts on them. The first letter of a message,
 * and the one after ". ", "! " or "? ", gets a capital, like a phone keyboard; ⇧ toggles it by hand.
 */
export function pressKey(s: KeyState, k: Key, maxLen: number): KeyState {
  if ('ch' in k) {
    if (s.text.length >= maxLen) return s;
    const ch = s.shift && s.layer === 'abc' ? k.ch.toUpperCase() : k.ch;
    const text = s.text + ch;
    return { ...s, text, shift: autoCap(text) };
  }
  switch (k.act) {
    case 'shift':
      return { ...s, shift: !s.shift };
    case 'back': {
      const text = [...s.text].slice(0, -1).join('');
      return { ...s, text, shift: autoCap(text) };
    }
    case 'space':
      if (s.text.length >= maxLen || !s.text || s.text.endsWith(' ')) return s;
      return { ...s, text: s.text + ' ', shift: autoCap(s.text + ' ') };
    case 'layer':
      return { ...s, layer: s.layer === 'abc' ? 'sym' : 'abc' };
    default:
      return s;
  }
}

/** Whether the next letter starts a sentence. Slash commands ("/bug") stay lower case. */
export const autoCap = (text: string): boolean => (text === '' ? true : /[.!?]\s$/.test(text) && !text.startsWith('/'));

/** A key's label and its CSS class (its width) on screen. */
export function keyFace(k: Key, s: KeyState): { label: string; cls: string } {
  if ('ch' in k) return { label: s.shift && s.layer === 'abc' ? k.ch.toUpperCase() : k.ch, cls: 'k' };
  switch (k.act) {
    case 'shift':
      return { label: '⇧', cls: `k fn${s.shift ? ' on' : ''}` };
    case 'back':
      return { label: '⌫', cls: 'k fn' };
    case 'space':
      return { label: 'space', cls: 'k space' };
    case 'send':
      return { label: 'Send', cls: 'k send' };
    case 'layer':
      return { label: s.layer === 'abc' ? '123' : 'ABC', cls: 'k fn' };
    case 'native':
      return { label: '🌐', cls: 'k fn' };
  }
}

/** A key's id in the markup (`data-k`): the character, or the named key's name. */
export const keyId = (k: Key): string => ('ch' in k ? `c:${k.ch}` : k.act);
export const keyOf = (id: string): Key | null => {
  if (id.startsWith('c:')) return id.length > 2 ? { ch: id.slice(2) } : null;
  const acts = ['shift', 'back', 'space', 'send', 'layer', 'native'] as const;
  const act = acts.find((a) => a === id);
  return act ? { act } : null;
};

/** ⌫ held down repeats after this long, this often. */
export const REPEAT_DELAY_MS = 420;
export const REPEAT_MS = 70;
