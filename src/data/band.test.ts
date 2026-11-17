import { describe, expect, it } from 'vitest';
import {
  ALL_PARTS, BAND_MIX, BAR_MS, BEATS, CHORDS, D_MAJOR, D_PENTATONIC, EIGHTH_MS, INSTRUMENTS,
  bandLog, bandMix, bandNotes, bandPulse, barAt, barHash, barsDue, chordAt, partBit, type BarClock, type InstrumentId,
} from './band';
import { MAPS, campSeats } from './maps';

const pc = (midi: number) => ((midi % 12) + 12) % 12;
/** 64 bars from an odd start, and a stretch below zero (a clock before 1970 never happens, but the maths must hold). */
const STRETCH = [...Array.from({ length: 64 }, (_, i) => 4003 + i), -9, -8, -1, 0];
const ids = INSTRUMENTS.map((p) => p.id);
const pitched: InstrumentId[] = ['banjo', 'squeezebox', 'whistle', 'jug'];
const town = MAPS[0];

describe('the band', () => {
  it('has an instrument for each log at the fire, in order', () => {
    expect(ids).toEqual(['banjo', 'drum', 'squeezebox', 'whistle', 'washboard', 'jug']);
    expect(town.camp!.logs.at.length).toBe(INSTRUMENTS.length);
    expect(ALL_PARTS).toBe(0b111111);
    expect(INSTRUMENTS.map((_, i) => partBit(i)).reduce((a, b) => a | b)).toBe(ALL_PARTS);
  });

  it('keeps the town tune\'s bar and its round of chords', () => {
    expect(EIGHTH_MS).toBe(360);
    expect(BAR_MS).toBe(2160);
    expect(CHORDS.map((c) => c.name)).toEqual(['D', 'G', 'A', 'D', 'Bm', 'G', 'D', 'A']);
    expect(chordAt(8).name).toBe('D');
    expect(chordAt(-1).name).toBe('A');
    for (const c of CHORDS) for (const t of c.tones) expect(D_MAJOR).toContain(t);
  });
});

describe('barAt', () => {
  it('finds the bar and how far into it the clock is', () => {
    expect(barAt(0)).toEqual({ bar: 0, phase: 0 });
    expect(barAt(BAR_MS - 1).bar).toBe(0);
    expect(barAt(BAR_MS - 1).phase).toBeCloseTo(1 - 1 / BAR_MS, 9);
    expect(barAt(BAR_MS)).toEqual({ bar: 1, phase: 0 });
    expect(barAt(BAR_MS * 2.5)).toEqual({ bar: 2, phase: 0.5 });
  });
  it('holds before zero and at huge clocks', () => {
    expect(barAt(-1).bar).toBe(-1);
    expect(barAt(-1).phase).toBeCloseTo(1 - 1 / BAR_MS, 9);
    expect(barAt(-BAR_MS)).toEqual({ bar: -1, phase: 0 });
    // Today's clock, and one far past it.
    for (const now of [1_795_000_000_123, 8.64e15, Number.MAX_SAFE_INTEGER]) {
      const { bar, phase } = barAt(now);
      expect(Number.isInteger(bar)).toBe(true);
      expect(bar * BAR_MS).toBeLessThanOrEqual(now);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
    expect(barAt(1_795_000_000_123).bar).toBe(Math.floor(1_795_000_000_123 / 2160));
  });
});

describe('the parts', () => {
  it('are well-formed: in the bar, in order, on the sixteenth grid', () => {
    for (const id of ids) {
      for (const bar of STRETCH) {
        const notes = bandNotes(id, bar);
        expect(notes.length).toBeGreaterThan(0);
        let last = -1;
        for (const n of notes) {
          expect(n.at).toBeGreaterThanOrEqual(0);
          expect(n.at).toBeLessThan(BEATS);
          expect(n.at * 2).toBe(Math.round(n.at * 2));
          expect(n.at).toBeGreaterThanOrEqual(last);
          last = n.at;
          expect(n.len).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          if (pitched.includes(id)) expect(n.hit).toBeUndefined();
          else {
            expect(n.midi).toBe(0);
            expect(id === 'drum' ? ['thump', 'tap'] : ['scratch']).toContain(n.hit);
          }
        }
      }
    }
  });

  it('are the same every time for a bar, and not the same bar over and over', () => {
    for (const id of ids) {
      for (const bar of STRETCH) expect(bandNotes(id, bar)).toEqual(bandNotes(id, bar));
      const shapes = new Set(STRETCH.map((bar) => JSON.stringify(bandNotes(id, bar))));
      expect(shapes.size).toBeGreaterThan(3);
    }
    expect(barHash(12, 3)).toBe(barHash(12, 3));
    const dice = STRETCH.map((b) => barHash(b, 1));
    for (const v of dice) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(dice.map((v) => Math.floor(v * 4))).size).toBe(4);
  });

  it('play only notes of D major', () => {
    for (const id of pitched) for (const bar of STRETCH) for (const n of bandNotes(id, bar)) expect(D_MAJOR, `${id} bar ${bar} note ${n.midi}`).toContain(pc(n.midi));
  });

  // The rule for each part: which of its notes must be notes of the bar's chord.
  it('banjo: every note on an eighth is a chord note (the hammered-on sixteenth of a turn is the scale step above one), the thumb plays the root on beat 1', () => {
    for (const bar of STRETCH) {
      const chord = chordAt(bar);
      const notes = bandNotes('banjo', bar);
      for (const n of notes) {
        if (Number.isInteger(n.at)) expect(chord.tones, `bar ${bar} at ${n.at}`).toContain(pc(n.midi));
      }
      expect(pc(notes[0].midi)).toBe(chord.root);
      expect(notes.filter((n) => Number.isInteger(n.at)).map((n) => n.at)).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 5]));
    }
    // The last bar of every round turns.
    expect(bandNotes('banjo', 4007).some((n) => n.at === 4.5)).toBe(true);
  });

  it('squeezebox: only the chord\'s three notes, and it lets go before the bar line', () => {
    for (const bar of STRETCH) {
      const chord = chordAt(bar);
      const notes = bandNotes('squeezebox', bar);
      expect(new Set(notes.map((n) => pc(n.midi)))).toEqual(new Set(chord.tones));
      for (const n of notes) expect(n.at + n.len).toBeLessThanOrEqual(BEATS - 0.5);
    }
  });

  it('jug: the root on beat 1 and the fifth on beat 2, only chord notes', () => {
    for (const bar of STRETCH) {
      const chord = chordAt(bar);
      const notes = bandNotes('jug', bar);
      expect(notes[0].at).toBe(0);
      expect(pc(notes[0].midi)).toBe(chord.root);
      expect(notes[1].at).toBe(3);
      expect(pc(notes[1].midi)).toBe((chord.root + 7) % 12);
      for (const n of notes) expect(chord.tones).toContain(pc(n.midi));
    }
  });

  it('whistle: D E F# A B only; the note that opens a bar and any note held three eighths or more are chord notes', () => {
    for (const bar of STRETCH) {
      const chord = chordAt(bar);
      const notes = bandNotes('whistle', bar);
      expect(notes[0].at).toBe(0);
      for (const n of notes) {
        expect(D_PENTATONIC).toContain(pc(n.midi));
        if (n.at === 0 || n.len >= 3) expect(chord.tones, `bar ${bar} at ${n.at}`).toContain(pc(n.midi));
      }
    }
  });

  it('whistle: a phrase runs over two bars and ends on a breath or a pick-up', () => {
    for (const bar of STRETCH.filter((b) => ((b % 2) + 2) % 2 === 1)) {
      const last = bandNotes('whistle', bar).at(-1)!;
      const end = last.at + last.len;
      // Either it stops short of the bar line, or its last note is a short one leading on.
      expect(end <= BEATS - 0.5 || last.len <= 1).toBe(true);
    }
  });

  it('drum and washboard: the two beats of the bar are the strong ones', () => {
    for (const bar of STRETCH) {
      const drum = bandNotes('drum', bar);
      expect(drum.filter((n) => n.hit === 'thump').map((n) => n.at)).toEqual([0, 3]);
      const board = bandNotes('washboard', bar);
      expect(board.filter((n) => Number.isInteger(n.at)).length).toBe(BEATS);
      const strong = board.filter((n) => n.at === 0 || n.at === 3).map((n) => n.vel);
      const weak = board.filter((n) => n.at !== 0 && n.at !== 3).map((n) => n.vel);
      expect(Math.min(...strong)).toBeGreaterThan(Math.max(...weak));
    }
  });

  it('keep to their own registers: jug under banjo, squeezebox in the middle, whistle on top', () => {
    const range = (id: InstrumentId) => {
      const all = STRETCH.flatMap((bar) => bandNotes(id, bar).map((n) => n.midi));
      return [Math.min(...all), Math.max(...all)];
    };
    const [jugLo, jugHi] = range('jug');
    const [banjoLo, banjoHi] = range('banjo');
    const [boxLo, boxHi] = range('squeezebox');
    const [whistleLo, whistleHi] = range('whistle');
    expect(jugLo).toBeGreaterThanOrEqual(38);
    expect(jugHi).toBeLessThan(banjoLo);
    expect(banjoHi).toBeLessThanOrEqual(76);
    expect(boxLo).toBeGreaterThanOrEqual(57);
    expect(boxHi).toBeLessThan(whistleLo);
    expect(whistleHi).toBeLessThanOrEqual(86);
  });
});

describe('barsDue', () => {
  const BAR = BAR_MS / 1000;
  /** Runs passes at the given audio times; `clock(t)` is the shared clock (ms) at audio time `t`. */
  const run = (times: number[], clock: (t: number) => number, ahead = 0.4) => {
    const c: BarClock = { last: null, endT: 0 };
    return times.flatMap((t) => barsDue(c, clock(t), t, ahead));
  };
  const every = (step: number, from: number, to: number) => Array.from({ length: Math.round((to - from) / step) }, (_, i) => from + i * step);

  it('schedules each bar once, in order, where the clock puts it', () => {
    const t0 = 4000 * BAR_MS + 700;
    const due = run(every(1 / 60, 0, 30), (t) => t0 + t * 1000);
    // The bar the clock was in comes first, to be played from where it is.
    expect(due[0].bar).toBe(4000);
    expect(due[0].t).toBeCloseTo(-0.7, 6);
    expect(due.map((d) => d.bar)).toEqual(due.map((_, i) => 4000 + i));
    for (const d of due.slice(1)) {
      expect(d.t).toBeCloseTo((d.bar * BAR_MS - t0) / 1000, 6);
      // Scheduled before it starts, by no more than the look-ahead.
      expect(d.notBefore).toBeLessThanOrEqual(d.t);
    }
    expect(due.length).toBe(Math.floor((30 + 0.7 + 0.4) / BAR) + 1);
  });

  it('plays no burst after a sleep: one bar, the one the clock is in', () => {
    const t0 = 4000 * BAR_MS;
    const due = run([...every(0.25, 0, 5), ...every(0.25, 65, 70)], (t) => t0 + t * 1000);
    const after = due.filter((d) => d.t + BAR > 65);
    expect(after[0].bar).toBe(Math.floor((t0 + 65000) / BAR_MS));
    expect(after.map((d) => d.bar)).toEqual(after.map((_, i) => after[0].bar + i));
    // Nothing was scheduled for the bars slept through.
    expect(due.filter((d) => d.t > 6 && d.t + BAR < 65)).toEqual([]);
    // What is left of the bar it woke in is played from now, not from its start.
    expect(after[0].notBefore).toBeGreaterThan(65);
  });

  it('rides out the clock being corrected by a few ms: no bar twice, none missed, none far off', () => {
    const t0 = 4000 * BAR_MS;
    // The server's clock, re-read every 7 s, up to 20 ms either way.
    const offset = (t: number) => [0, 12, -20, 5, 20, -8][Math.floor(t / 7) % 6];
    const due = run(every(1 / 30, 0, 60), (t) => t0 + t * 1000 + offset(t));
    expect(due.map((d) => d.bar)).toEqual(due.map((_, i) => 4000 + i));
    for (let i = 1; i < due.length; i++) {
      expect(Math.abs(due[i].t - due[i - 1].t - BAR)).toBeLessThan(0.045);
      expect(Math.abs(due[i].t - (due[i].bar * BAR_MS - t0) / 1000)).toBeLessThan(0.021);
      // Its first note is never held back by the bar before.
      if (i > 1) expect(due[i].notBefore).toBeLessThanOrEqual(due[i].t);
    }
  });

  it('follows a clock that jumps (joining a server) without playing over the bar still sounding', () => {
    const t0 = 4000 * BAR_MS;
    for (const jump of [3_600_000, -3_600_000, 5000, -5000]) {
      const clock = (t: number) => t0 + t * 1000 + (t >= 10 ? jump : 0);
      const c: BarClock = { last: null, endT: 0 };
      let before = { bar: 0, t: 0, notBefore: 0 };
      const after: { bar: number; t: number; notBefore: number }[] = [];
      for (const t of every(0.1, 0, 20)) {
        for (const d of barsDue(c, clock(t), t, 0.4)) {
          if (t < 10) before = d;
          else after.push(d);
        }
      }
      // The first bar on the new clock is the one that clock is in (or the next), and it waits for the old bar to end.
      expect(after[0].bar).toBeGreaterThanOrEqual(Math.floor(clock(10) / BAR_MS));
      expect(after[0].bar).toBeLessThanOrEqual(Math.floor(clock(10) / BAR_MS) + 1);
      expect(after[0].notBefore).toBeGreaterThanOrEqual(before.t + BAR - 0.1 - 1e-9);
      expect(after.map((d) => d.bar)).toEqual(after.map((_, i) => after[0].bar + i));
      for (const d of after) expect(d.t).toBeCloseTo((d.bar * BAR_MS - clock(10)) / 1000 + 10, 5);
      // Never more than a bar of silence either.
      expect(after[0].t).toBeLessThan(before.t + 2 * BAR + 0.01);
    }
  });
});

describe('bandLog', () => {
  const seats = campSeats(town);
  it('gives each of the twelve fire seats its log, in log order', () => {
    for (let i = 0; i < 12; i++) expect(bandLog(town, seats[i].x, seats[i].z)).toBe(Math.floor(i / 2));
    // A position that came over the network a little off.
    expect(bandLog(town, seats[5].x + 0.12, seats[5].z - 0.12)).toBe(2);
  });
  it('keeps every other seat quiet: the beach logs and the cove wall', () => {
    expect(seats.length).toBeGreaterThan(20);
    for (const s of seats.slice(12)) expect(bandLog(town, s.x, s.z)).toBe(-1);
    expect(bandLog(town, town.campfire.x, town.campfire.z)).toBe(-1);
    expect(bandLog(town, town.spawn.x, town.spawn.z)).toBe(-1);
    // Standing between two logs, or behind one.
    expect(bandLog(town, (seats[1].x + seats[2].x) / 2, (seats[1].z + seats[2].z) / 2)).toBe(-1);
  });
  it('finds no band on a map with no camp', () => {
    for (const m of MAPS.filter((m) => !m.camp)) expect(bandLog(m, seats[0].x, seats[0].z)).toBe(-1);
  });
});

describe('bandMix', () => {
  const fire = town.campfire;
  const from = (p: { x: number; z: number }) => Math.hypot(p.x - fire.x, p.z - fire.z);
  it('leaves the town tune alone when nobody plays', () => {
    for (let d = 0; d <= 120; d += 0.5) expect(bandMix(d, false).town).toBe(1);
  });
  it('is full on the terrace and its seat wall, and the town layer steps back there', () => {
    for (const s of campSeats(town).filter((s) => from(s) < 6)) expect(bandMix(from(s), true)).toEqual({ band: 1, town: BAND_MIX.townNear });
    expect(bandMix(0, true)).toEqual({ band: 1, town: 0.12 });
    expect(bandMix(6.5, true)).toEqual({ band: 1, town: 0.12 });
  });
  it('fades through the arch and down the beach, and is faint but there across the cove', () => {
    const camp = town.camp!;
    const at = (p: { x: number; z: number }) => bandMix(from(p), true);
    // Just through the arch: all but full.
    expect(at(camp.arch).band).toBe(1);
    expect(at(camp.signpost).band).toBeGreaterThan(0.85);
    // The beach's logs: well over half.
    for (const l of camp.beachLogs) expect(at(l).band).toBeGreaterThan(0.65);
    // The jetty's end: a quarter, and the town's tune nearly back.
    expect(at(camp.rack).band).toBeCloseTo(0.3, 1);
    expect(at(camp.rack).town).toBeGreaterThan(0.9);
    expect(bandMix(15, true)).toEqual({ band: 0.25, town: 1 });
    // The pier (where players arrive), the quay's stalls and Reed's wharf: the faint floor, under the full tune.
    for (const p of [town.spawn, town.vendor.shop, town.smokehouse!, town.harbour!.stand, { x: 0, z: -14 }]) {
      expect(from(p)).toBeGreaterThan(20);
      expect(at(p).band).toBeGreaterThanOrEqual(0.1);
      expect(at(p).band).toBeLessThan(0.14);
      expect(at(p).town).toBe(1);
    }
    // The gate at the village's far side, and anywhere past it: nothing.
    expect(at(town.gate).band).toBeLessThan(0.001);
    expect(bandMix(80, true).band).toBe(0);
  });
  it('never rises with distance (the band) or falls with it (the town layer), and never jumps', () => {
    let last = bandMix(0, true);
    for (let d = 0.1; d <= 100; d += 0.1) {
      const m = bandMix(d, true);
      expect(m.band).toBeLessThanOrEqual(last.band);
      expect(m.town).toBeGreaterThanOrEqual(last.town);
      expect(last.band - m.band).toBeLessThan(0.012);
      expect(m.town - last.town).toBeLessThan(0.012);
      last = m;
    }
  });
});

describe('bandPulse', () => {
  it('stays between 0 and 1', () => {
    for (const id of ids) {
      for (let t = 4003 * BAR_MS; t < 4007 * BAR_MS; t += 17) {
        const p = bandPulse(id, t);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
  it('peaks as each note starts and has fallen just before the next', () => {
    for (const id of ids) {
      for (const bar of [4003, 4004, 4010, 4015]) {
        const notes = bandNotes(id, bar);
        const starts = [...new Set(notes.map((n) => n.at))];
        starts.forEach((at, i) => {
          const t = bar * BAR_MS + at * EIGHTH_MS;
          const vel = Math.max(...notes.filter((n) => n.at === at).map((n) => n.vel));
          const on = bandPulse(id, t);
          expect(on).toBeGreaterThanOrEqual(0.5 + 0.5 * vel - 1e-9);
          // Higher at the note than just before it and than a little after.
          expect(on).toBeGreaterThan(bandPulse(id, t - 1));
          expect(on).toBeGreaterThan(bandPulse(id, t + 60));
          const next = i + 1 < starts.length ? bar * BAR_MS + starts[i + 1] * EIGHTH_MS : null;
          if (next !== null) expect(bandPulse(id, next - 1)).toBeLessThan(on);
        });
      }
    }
    // The hardest hit of a bar is a full 1.
    expect(bandPulse('drum', 4003 * BAR_MS)).toBe(1);
    expect(bandPulse('jug', 4003 * BAR_MS)).toBe(1);
  });
  it('is the same for everyone at the same clock', () => {
    const t = 1_795_000_000_123;
    for (const id of ids) expect(bandPulse(id, t)).toBe(bandPulse(id, t));
  });
});
