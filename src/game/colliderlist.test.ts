import { describe, expect, it } from 'vitest';
import { ColliderList } from './colliderlist';

const c = (x: number) => ({ x, z: 0, r: 1 });

describe('ColliderList', () => {
  it('joins the lists in order and reuses the array while nothing changes', () => {
    const a = [c(1)];
    const b = [c(2), c(3)];
    const list = new ColliderList();
    const first = list.get([a, b]);
    expect(first.map((q) => q.x)).toEqual([1, 2, 3]);
    expect(list.get([a, b])).toBe(first);
  });

  it('rebuilds when a list grows', () => {
    const a = [c(1)];
    const list = new ColliderList();
    const first = list.get([a, []]);
    a.push(c(2));
    const next = list.get([a, []]);
    expect(next).not.toBe(first);
    expect(next.map((q) => q.x)).toEqual([1, 2]);
  });

  it('rebuilds when a list is swapped for another of the same length, or a list is added or dropped', () => {
    const a = [c(1)];
    const list = new ColliderList();
    const first = list.get([a, []]);
    const swapped = list.get([[c(9)], []]);
    expect(swapped).not.toBe(first);
    expect(swapped.map((q) => q.x)).toEqual([9]);
    expect(list.get([[c(9)]]).length).toBe(1);
    expect(list.get([a, [], []])).not.toBe(swapped);
  });
});
