import { describe, expect, it } from 'vitest';
import { COSMETICS, cosById } from './cosmetics';
import { BOAT_PARTS, ZONES } from './dive';
import { EMOTES, EMOTE_PRICES, WHEEL_ORDER, WHEEL_SLOTS, emoteById, wheelPage } from './emotes';

describe('emote catalog', () => {
  it('has the base four and the deep sea four, under the ids the looks are written for', () => {
    expect(EMOTES.map((e) => e.id)).toEqual(['wave', 'nice', 'yes', 'no', 'kelp', 'twilight', 'abyss', 'master']);
    expect(EMOTES.filter((e) => e.tier === 'base').map((e) => e.name)).toEqual(['Wave', 'Nice!', 'Yes', 'No']);
    expect(EMOTES.filter((e) => e.tier === 'deep').map((e) => e.name)).toEqual(['Kelp Deep', 'The Twilight', 'The Abyss', 'Master of the Deep']);
    expect(new Set(EMOTES.map((e) => e.id)).size).toBe(EMOTES.length);
    expect(emoteById('wave')?.name).toBe('Wave');
    for (const bad of ['nope', '', null, undefined, 3, {}, 'constructor']) expect(emoteById(bad)).toBeUndefined();
  });

  it('frames the base ones from behind for 2 to 3 seconds and the deep sea ones in a slow circle for 8 to 11', () => {
    for (const e of EMOTES) {
      if (e.tier === 'base') {
        expect(e.camera).toBe('behind');
        expect(e.cameraDistance).toBeUndefined();
        expect(e.seconds).toBeGreaterThanOrEqual(2);
        expect(e.seconds).toBeLessThanOrEqual(3);
        expect(e.gate).toBeUndefined();
        expect(e.price).toBeUndefined();
      } else {
        expect(e.camera).toBe('cinematic');
        expect(e.seconds).toBeGreaterThanOrEqual(8);
        expect(e.seconds).toBeLessThanOrEqual(11);
        // Further back than the circle's usual 5 m only for a scene that needs it, and never so far it loses the player.
        if (e.cameraDistance !== undefined) expect(e.cameraDistance).toBeGreaterThan(5);
        expect(e.cameraDistance ?? 5).toBeLessThanOrEqual(7);
        expect(e.seller).toBe('Captain Reed');
        // Both are paid: coins and Black Pearls.
        expect(e.price!.coins).toBeGreaterThan(0);
        expect(e.price!.pearls).toBeGreaterThan(0);
      }
    }
  });

  it("gates each deep sea emote on what exists today: a zone's set, the Abyss legends' sets and pets, the other three emotes", () => {
    const gate = (id: string) => emoteById(id)!.gate!;
    const zone = (id: string) => ZONES.findIndex((z) => z.id === id);
    expect(gate('kelp')).toMatchObject({ pieces: ['kelpcap', 'kelpwrap', 'holdfast'], emotes: [] });
    expect(gate('kelp').pieces.every((id) => cosById(id)?.zone === zone('kelp'))).toBe(true);
    expect(gate('twilight')).toMatchObject({ pieces: ['anemonecrown', 'drifttunic', 'jellylocket'], emotes: [] });
    expect(gate('twilight').pieces.every((id) => cosById(id)?.zone === zone('twilight'))).toBe(true);
    // The Abyss: every piece of the Leviathan's, the Drowned Dreamer's and the Kraken's sets, pets included.
    const abyss = COSMETICS.filter((c) => c.shop === 'legend').map((c) => c.id);
    expect(abyss).toHaveLength(12);
    expect([...gate('abyss').pieces].sort()).toEqual([...abyss].sort());
    expect(gate('abyss').pieces.filter((id) => cosById(id)?.slot === 'pet')).toHaveLength(3);
    expect(gate('master')).toMatchObject({ pieces: [], emotes: ['kelp', 'twilight', 'abyss'] });
  });

  it('prices each emote in coins and Black Pearls: coins over the dearest piece of its set, and Master of the Deep over them all', () => {
    expect(EMOTE_PRICES).toEqual({
      kelp: { coins: 300_000, pearls: 1_000 },
      twilight: { coins: 2_000_000, pearls: 6_000 },
      abyss: { coins: 8_000_000, pearls: 40_000 },
      master: { coins: 20_000_000, pearls: 150_000 },
    });
    for (const id of ['kelp', 'twilight', 'abyss', 'master'] as const) expect(emoteById(id)!.price).toEqual(EMOTE_PRICES[id]);
    const dearest = (id: string) => Math.max(...emoteById(id)!.gate!.pieces.map((p) => cosById(p)!.price));
    for (const id of ['kelp', 'twilight', 'abyss'] as const) expect(EMOTE_PRICES[id].coins).toBeGreaterThan(dearest(id));
    for (const k of ['coins', 'pearls'] as const) {
      expect(EMOTE_PRICES.kelp[k]).toBeLessThan(EMOTE_PRICES.twilight[k]);
      expect(EMOTE_PRICES.twilight[k]).toBeLessThan(EMOTE_PRICES.abyss[k]);
      expect(EMOTE_PRICES.abyss[k]).toBeLessThan(EMOTE_PRICES.master[k]);
    }
    // Master of the Deep costs more coins than the other three together.
    expect(EMOTE_PRICES.master.coins).toBeGreaterThan(EMOTE_PRICES.kelp.coins + EMOTE_PRICES.twilight.coins + EMOTE_PRICES.abyss.coins);
  });

  it("keeps a zone emote's pearls well under the boat part its zone is earning, so it never stands in the next zone's way", () => {
    // Kelp Deep's fish earn the Deep lamps, the Twilight's the Iron keel (zone z's leg earns part z).
    const part = (zone: string) => BOAT_PARTS[ZONES.findIndex((z) => z.id === zone)].pearls;
    expect(part('kelp')).toBe(3000);
    expect(part('twilight')).toBe(25_000);
    for (const id of ['kelp', 'twilight'] as const) {
      expect(EMOTE_PRICES[id].pearls).toBeGreaterThanOrEqual(part(id) * 0.2);
      expect(EMOTE_PRICES[id].pearls).toBeLessThanOrEqual(part(id) * 0.4);
    }
  });

  it('puts all eight on the wheel once, the base four on the cross and the deep sea four between them', () => {
    expect(WHEEL_SLOTS).toBe(8);
    expect([...WHEEL_ORDER].sort()).toEqual(EMOTES.map((e) => e.id).sort());
    const page = wheelPage();
    expect(page).toHaveLength(WHEEL_SLOTS);
    expect(page.map((e) => e.tier)).toEqual(['base', 'deep', 'base', 'deep', 'base', 'deep', 'base', 'deep']);
    expect(page[0].id).toBe('wave');
    // Yes and No face each other.
    expect([page[2].id, page[6].id]).toEqual(['yes', 'no']);
    // There is one page today; a second would hold whatever comes after the first eight.
    expect(wheelPage(1)).toEqual([]);
  });
});
