import { describe, expect, it } from 'vitest';
import { fishIcon } from '../fishicon';

const IDS = ['hatchet', 'fangjaw', 'lanternshark', 'oarfish', 'chandelier'];

describe('Twilight fish icons', () => {
  for (const id of IDS) {
    it(`${id} draws in every mode, glowing only when discovered`, () => {
      const normal = fishIcon(id);
      const hidden = fishIcon(id, { hidden: true });
      const shiny = fishIcon(id, { shiny: true });
      for (const svg of [normal, hidden, shiny]) expect(svg).toMatch(/^<svg/);
      expect(normal).toContain('filter="url(#tg');
      expect(hidden).not.toContain('filter="url(#t');
      expect(hidden).not.toContain('#fff');
      expect(shiny).not.toBe(normal);
      expect(normal).not.toContain('NaN');
    });
  }
});
