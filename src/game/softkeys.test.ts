import { describe, expect, it } from 'vitest';
import { autoCap, BOTTOM, keyFace, keyId, keyOf, keysLiftPx, pressKey, ROWS, startKeys, type Key, type KeyState } from './softkeys';

const type = (s: KeyState, text: string, max = 120): KeyState =>
  [...text].reduce((st, ch) => pressKey(st, ch === ' ' ? { act: 'space' } : { ch }, max), s);

describe('soft keyboard', () => {
  it('capitalises the first letter and after a sentence', () => {
    const s = type(startKeys(), 'hi there. ok');
    expect(s.text).toBe('Hi there. Ok');
  });

  it('keeps slash commands lower case', () => {
    expect(autoCap('/bug it broke. ')).toBe(false);
  });

  it('shift toggles a one-shot capital', () => {
    let s = pressKey(startKeys(), { act: 'shift' }, 120);
    s = type(s, 'ab');
    expect(s.text).toBe('ab');
    s = pressKey(s, { act: 'shift' }, 120);
    s = type(s, 'cd');
    expect(s.text).toBe('abCd');
  });

  it('backspace removes one character, emoji included', () => {
    let s: KeyState = { text: 'hi 🎣', shift: false, layer: 'abc' };
    s = pressKey(s, { act: 'back' }, 120);
    expect(s.text).toBe('hi ');
    s = pressKey(pressKey(pressKey(pressKey(s, { act: 'back' }, 120), { act: 'back' }, 120), { act: 'back' }, 120), { act: 'back' }, 120);
    expect(s.text).toBe('');
    expect(s.shift).toBe(true);
  });

  it('no leading or double spaces, and stops at the limit', () => {
    expect(type(startKeys(), ' a  b').text).toBe('A b');
    expect(type(startKeys(), 'abcdef', 3).text).toBe('Abc');
  });

  it('the symbol layer types as is and switches back', () => {
    let s = pressKey(startKeys(), { act: 'layer' }, 120);
    s = type(s, '12');
    expect(s.text).toBe('12');
    expect(keyFace({ act: 'layer' }, s).label).toBe('ABC');
    s = pressKey(s, { act: 'layer' }, 120);
    expect(s.layer).toBe('abc');
  });

  it('send and native leave the text alone', () => {
    const s = type(startKeys(), 'yo');
    expect(pressKey(s, { act: 'send' }, 120)).toEqual(s);
    expect(pressKey(s, { act: 'native' }, 120)).toEqual(s);
  });

  it('every key round-trips through its id', () => {
    const all: Key[] = [...ROWS.abc.flat(), ...ROWS.sym.flat(), ...BOTTOM];
    for (const k of all) expect(keyOf(keyId(k))).toEqual(k);
    expect(keyOf('nope')).toBeNull();
    expect(keyOf('c:')).toBeNull();
  });

  it('rows fit ten keys', () => {
    for (const rows of Object.values(ROWS)) for (const r of rows) expect(r.length).toBeLessThanOrEqual(10);
  });
});

describe('the lip under the keys', () => {
  it('clears the home bar on a phone, measured in real points', () => {
    // A 844-point phone shows the 1400px layout at about 0.6x: 54px there is 32 points, past the bar's 21.
    expect(keysLiftPx(1400, 844)).toBe(54);
    expect((keysLiftPx(1400, 844) * 844) / 1400).toBeGreaterThan(30);
    expect((keysLiftPx(1112, 667) * 667) / 1112).toBeGreaterThan(30);
  });

  it('is smaller in the layout on a tablet, which shows it larger', () => {
    expect(keysLiftPx(1400, 1180)).toBe(38);
  });

  it('never goes under the old 26px, and has a default without a screen size', () => {
    expect(keysLiftPx(1400, 2000)).toBe(26);
    expect(keysLiftPx(1400, 0)).toBe(54);
  });
});
