import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Giant } from './audio';

/** What a sting asked of the audio context: every time it scheduled something at, and what a real one would refuse. */
interface Heard {
  times: number[];
  starts: number;
  stops: number;
  bad: string[];
}

/** A stand-in audio context that builds nothing and writes down what was scheduled. */
function fakeContext(heard: Heard) {
  const at = (when: number) => heard.times.push(when);
  const param = () => ({
    value: 0,
    setValueAtTime: (v: number, when: number) => (Number.isFinite(v) ? at(when) : heard.bad.push(`set ${v}`)),
    linearRampToValueAtTime: (v: number, when: number) => (Number.isFinite(v) ? at(when) : heard.bad.push(`ramp ${v}`)),
    // A real context throws on an exponential ramp to zero or below.
    exponentialRampToValueAtTime: (v: number, when: number) => (v > 0 && Number.isFinite(v) ? at(when) : heard.bad.push(`exponential ramp ${v}`)),
  });
  const node = () => {
    const own: Record<string | symbol, unknown> = {
      connect: (to: unknown) => to,
      start: (when = 0) => (heard.starts++, at(when)),
      stop: (when = 0) => (heard.stops++, at(when)),
    };
    return new Proxy(own, { get: (o, key) => (o[key] ??= param()), set: (o, key, v) => ((o[key] = v), true) });
  };
  return new Proxy({ currentTime: 0, sampleRate: 44100 } as Record<string | symbol, unknown>, { get: (o, key) => o[key] ?? node });
}

describe('the Abyss legends’ landing sounds', () => {
  let play: (id: Giant) => Heard;
  beforeAll(async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    const { audio } = await import('./audio');
    play = (id) => {
      const heard: Heard = { times: [], starts: 0, stops: 0, bad: [] };
      const ctx = fakeContext(heard);
      Object.assign(audio, { ctx, master: {}, noiseBuf: {} });
      audio.giant(id);
      return heard;
    };
  });

  const stings: [Giant, number][] = [['leviathan', 4], ['kraken', 4], ['dreamer', 6.5]];
  for (const [id, longest] of stings) {
    it(`${id}: plays, stops everything it starts, and does not overstay`, () => {
      const heard = play(id);
      expect(heard.bad).toEqual([]);
      expect(heard.starts).toBeGreaterThan(5);
      expect(heard.stops).toBe(heard.starts);
      expect(heard.times.every((when) => Number.isFinite(when) && when >= 0)).toBe(true);
      expect(Math.max(...heard.times)).toBeGreaterThan(2.5);
      expect(Math.max(...heard.times)).toBeLessThanOrEqual(longest);
    });
  }
});
