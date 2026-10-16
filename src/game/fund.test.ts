import { describe, expect, it } from 'vitest';
import { MAPS } from '../data/maps';
import { LocalFund } from './fund';
import { newSave } from './state';

describe('LocalFund', () => {
  const map = MAPS[0];
  it('accumulates and caps at the goal', () => {
    const fund = new LocalFund(newSave());
    expect(fund.contribute(map, 100)).toBe(100);
    expect(fund.state(map).unlocked).toBe(false);
    expect(fund.contribute(map, 1000)).toBe(map.goal - 100);
    const st = fund.state(map);
    expect(st.unlocked).toBe(true);
    expect(st.mine).toBe(map.goal);
    expect(fund.contribute(map, 5)).toBe(0);
  });
  it('ignores non-positive amounts', () => {
    const fund = new LocalFund(newSave());
    expect(fund.contribute(map, -5)).toBe(0);
    expect(fund.state(map).total).toBe(0);
  });
});
