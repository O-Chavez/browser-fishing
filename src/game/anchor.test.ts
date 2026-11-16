import { describe, expect, it } from 'vitest';
import { MAX_RANK, atMaxRank } from '../data/ranks';
import { anchorHtml } from './anchor';

describe('max-rank anchor', () => {
  it('shows from the last rank on, levels past it included', () => {
    expect(MAX_RANK.title).toBe('Lord of the Deep');
    expect(atMaxRank(149)).toBe(false);
    expect(atMaxRank(150)).toBe(true);
    expect(atMaxRank(180)).toBe(true);
    expect(atMaxRank(undefined)).toBe(false);
  });

  it('is named for screen readers, and is nothing below the last rank', () => {
    expect(anchorHtml(true)).toContain('aria-label="Lord of the Deep"');
    expect(anchorHtml(false)).toBe('');
  });
});
