import { describe, expect, it } from 'vitest';
import { keepRecordHaul, migrate, newSave, type SeaChart } from './state';

describe("the sea record's haul (Furthest Out board)", () => {
  const haul = (pearls: number, coins = 1000, fish = 10) => ({ pearls, fish, coins });

  it('keeps the haul of the charter that set a new record, replacing the old record\'s', () => {
    const sea: SeaChart = { ledges: [10], record: 10, haul: haul(50) };
    // `surface` has already moved the record to 15.
    sea.ledges.push(15);
    sea.record = 15;
    expect(keepRecordHaul(sea, 15, true, haul(20))).toBe(true);
    expect(sea.haul).toEqual(haul(20));
  });

  it('keeps a bigger haul from the same marker, and only a bigger one', () => {
    const sea: SeaChart = { ledges: [15], record: 15, haul: haul(30, 5000) };
    expect(keepRecordHaul(sea, 15, false, haul(25, 9000))).toBe(false);
    expect(keepRecordHaul(sea, 15, false, haul(30, 5000))).toBe(false);
    expect(sea.haul).toEqual(haul(30, 5000));
    // Same pearls, more coins.
    expect(keepRecordHaul(sea, 15, false, haul(30, 6000))).toBe(true);
    expect(keepRecordHaul(sea, 15, false, haul(40, 100, 12))).toBe(true);
    expect(sea.haul).toEqual(haul(40, 100, 12));
  });

  it('ignores a haul from a shallower marker, and gives an old record with no haul the next one from its marker', () => {
    const sea: SeaChart = { ledges: [5, 15], record: 15 };
    expect(keepRecordHaul(sea, 5, false, haul(99))).toBe(false);
    expect(sea.haul).toBeUndefined();
    expect(keepRecordHaul(sea, 15, false, haul(1))).toBe(true);
    expect(sea.haul).toEqual(haul(1));
  });

  it('migrates: old records have no haul, a whole haul survives, a broken one or one whose record moved is dropped', () => {
    expect(migrate({ ...newSave(), sea: { ledges: [5, 10], record: 10 } }).sea).toEqual({ ledges: [5, 10], record: 10 });
    expect(newSave().sea.haul).toBeUndefined();
    const kept = migrate({ ...newSave(), sea: { ledges: [10], record: 10, haul: haul(12, 3400, 10) } });
    expect(kept.sea).toEqual({ ledges: [10], record: 10, haul: haul(12, 3400, 10) });
    expect(migrate(structuredClone(kept)).sea).toEqual(kept.sea);
    for (const bad of [{ pearls: -1, fish: 1, coins: 1 }, { pearls: 1.5, fish: 1, coins: 1 }, { pearls: 1, fish: 1 }, 'lots', null]) {
      expect(migrate({ ...newSave(), sea: { ledges: [10], record: 10, haul: bad } }).sea.haul).toBeUndefined();
    }
    // The record was shallower than a charted ledge, so it moves, and the haul belonged to the old one.
    expect(migrate({ ...newSave(), sea: { ledges: [20], record: 10, haul: haul(5) } }).sea).toEqual({ ledges: [20], record: 20 });
    expect(migrate({ ...newSave(), sea: { ledges: [], record: 0, haul: haul(5) } }).sea).toEqual({ ledges: [], record: 0 });
  });
});
