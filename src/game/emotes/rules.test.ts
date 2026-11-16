import { describe, expect, it } from 'vitest';
import { EMOTES, emoteById } from '../../data/emotes';
import * as eco from '../economy';
import { newSave } from '../state';

describe("what Captain Reed's tiles say about an emote", () => {
  it('counts the gate: pieces of the set owned, or for Master of the Deep the other emotes', () => {
    const s = newSave();
    expect(eco.emoteGateProgress(s, emoteById('kelp')!)).toEqual({ have: 0, of: 3, what: 'pieces' });
    s.owned.push('kelpcap', 'holdfast', 'krakencrown', 'crown');
    expect(eco.emoteGateProgress(s, emoteById('kelp')!)).toEqual({ have: 2, of: 3, what: 'pieces' });
    expect(eco.emoteGateProgress(s, emoteById('twilight')!)).toEqual({ have: 0, of: 3, what: 'pieces' });
    // The Abyss: all twelve pieces of the three legends' sets, pets included.
    expect(eco.emoteGateProgress(s, emoteById('abyss')!)).toEqual({ have: 1, of: 12, what: 'pieces' });
    expect(eco.emoteGateProgress(s, emoteById('master')!)).toEqual({ have: 0, of: 3, what: 'emotes' });
    s.emotes.push('kelp', 'abyss');
    expect(eco.emoteGateProgress(s, emoteById('master')!)).toEqual({ have: 2, of: 3, what: 'emotes' });
    // The base ones have no gate.
    expect(eco.emoteGateProgress(s, emoteById('wave')!)).toEqual({ have: 0, of: 0, what: 'emotes' });
  });

  it('goes from locked to on sale to owned, and on sale says what the player is short of', () => {
    const s = newSave();
    const kelp = emoteById('kelp')!;
    expect(eco.emoteOffer(s, kelp)).toBe('locked');
    s.owned.push(...kelp.gate!.pieces);
    // The gate met: on sale whether or not they can pay; what they are short of is the tile's to say.
    expect(eco.emoteOffer(s, kelp)).toBe('sale');
    expect(eco.emoteShort(s, kelp)).toEqual({ coins: 300_000 - 20, pearls: 1_000 });
    s.coins = 300_000;
    expect(eco.emoteShort(s, kelp)).toEqual({ coins: 0, pearls: 1_000 });
    s.pearls = 5_000;
    expect(eco.emoteShort(s, kelp)).toEqual({ coins: 0, pearls: 0 });
    expect(eco.buyEmote(s, 'kelp')).toBe(true);
    expect(eco.emoteOffer(s, kelp)).toBe('owned');
    expect(s.pearls).toBe(4_000);
    expect(eco.emotePriceText(kelp)).toBe('300,000 coins and 1,000 Black Pearls');
    expect(eco.emotePriceText(emoteById('wave')!)).toBe('');
  });
});

describe('owning emotes', () => {
  it('gives every account the base four, and the rest only once bought', () => {
    const s = newSave();
    expect(EMOTES.filter((e) => eco.ownsEmote(s, e.id)).map((e) => e.id)).toEqual(['wave', 'nice', 'yes', 'no']);
    s.emotes.push('twilight');
    expect(eco.ownsEmote(s, 'twilight')).toBe(true);
    expect(eco.ownsEmote(s, 'kelp')).toBe(false);
    // An id in the save that isn't an emote owns nothing.
    s.emotes.push('nope');
    expect(eco.ownsEmote(s, 'nope')).toBe(false);
    expect(eco.ownsEmote(s, 'constructor')).toBe(false);
  });

  it('opens a zone emote with every piece of its set owned, not just some', () => {
    const s = newSave();
    const kelp = emoteById('kelp')!;
    expect(eco.emoteOffer(s, kelp)).toBe('locked');
    s.owned.push('kelpcap', 'holdfast');
    expect(eco.emoteGateMet(s, kelp)).toBe(false);
    s.owned.push('kelpwrap');
    expect(eco.emoteGateMet(s, kelp)).toBe(true);
    expect(eco.emoteOffer(s, kelp)).toBe('sale');
    // The Kelp Deep set does nothing for the Twilight's.
    expect(eco.emoteOffer(s, emoteById('twilight')!)).toBe('locked');
    s.emotes.push('kelp');
    expect(eco.emoteOffer(s, kelp)).toBe('owned');
    expect(eco.emoteOffer(s, emoteById('wave')!)).toBe('owned');
  });

  it("opens the Abyss emote with all three legend sets and their pets", () => {
    const s = newSave();
    const abyss = emoteById('abyss')!;
    const pieces = abyss.gate!.pieces;
    s.owned.push(...pieces.filter((id) => id !== 'dreamerpet'));
    expect(eco.emoteGateMet(s, abyss)).toBe(false);
    expect(eco.emoteBuyError(s, 'abyss')).toBe("Own the Abyss's three legend sets and their pets to unlock the Abyss emote.");
    s.owned.push('dreamerpet');
    expect(eco.emoteGateMet(s, abyss)).toBe(true);
  });

  it('opens Master of the Deep with the other three emotes owned, whatever is worn or owned besides', () => {
    const s = newSave();
    const master = emoteById('master')!;
    s.owned.push(...EMOTES.flatMap((e) => e.gate?.pieces ?? []));
    expect(eco.emoteGateMet(s, master)).toBe(false);
    s.emotes.push('kelp', 'twilight');
    expect(eco.emoteGateMet(s, master)).toBe(false);
    s.emotes.push('abyss');
    expect(eco.emoteGateMet(s, master)).toBe(true);
  });

  it('buys an emote once its gate is met, for its coins and its Black Pearls, once', () => {
    const s = newSave();
    s.coins = 1e9;
    s.pearls = 1e9;
    expect(eco.buyEmote(s, 'twilight')).toBe(false);
    expect(eco.emoteBuyError(s, 'twilight')).toBe('Own the Twilight set to unlock the Twilight emote.');
    s.owned.push(...emoteById('twilight')!.gate!.pieces);
    // Short of coins, of pearls, of both: it says which, and by how much. Neither is taken until both are there.
    s.coins = 1_999_999;
    expect(eco.emoteShort(s, emoteById('twilight')!)).toEqual({ coins: 1, pearls: 0 });
    expect(eco.emoteBuyError(s, 'twilight')).toBe('The Twilight emote costs 2,000,000 coins and 6,000 Black Pearls: you need 1 more coin.');
    expect(eco.buyEmote(s, 'twilight')).toBe(false);
    s.coins = 1e9;
    s.pearls = 5_750;
    expect(eco.emoteShort(s, emoteById('twilight')!)).toEqual({ coins: 0, pearls: 250 });
    expect(eco.emoteBuyError(s, 'twilight')).toBe('The Twilight emote costs 2,000,000 coins and 6,000 Black Pearls: you need 250 more Black Pearls.');
    expect(eco.buyEmote(s, 'twilight')).toBe(false);
    s.coins = 500_000;
    s.pearls = 0;
    expect(eco.emoteBuyError(s, 'twilight')).toBe('The Twilight emote costs 2,000,000 coins and 6,000 Black Pearls: you need 1,500,000 more coins and 6,000 more Black Pearls.');
    expect(eco.buyEmote(s, 'twilight')).toBe(false);
    expect(s).toMatchObject({ coins: 500_000, pearls: 0, emotes: [] });
    s.coins = 2_000_000;
    s.pearls = 6_000;
    expect(eco.emoteBuyError(s, 'twilight')).toBeNull();
    expect(eco.buyEmote(s, 'twilight')).toBe(true);
    expect(s).toMatchObject({ coins: 0, pearls: 0, emotes: ['twilight'] });
    s.coins = 1e9;
    s.pearls = 1e9;
    expect(eco.buyEmote(s, 'twilight')).toBe(false);
    expect(s.emotes).toEqual(['twilight']);
    expect(s).toMatchObject({ coins: 1e9, pearls: 1e9 });
    for (const id of ['wave', 'nope', '']) {
      expect(eco.emoteBuyError(s, id)).toBe('Captain Reed has nothing like that.');
      expect(eco.buyEmote(s, id)).toBe(false);
    }
  });
});
