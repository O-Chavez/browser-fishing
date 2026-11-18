import { ROCKETS, ROCKET_STACK, rocketById, rocketCount, rocketKinds, type RocketBag, type RocketId } from '../data/rockets';
import { COIN } from './format';

/**
 * The fireworks' menus (GAME_DESIGN.md §41), drawn with the pieces every vendor's menu is made of (the game hands
 * them in as `ShopUi`): Bram Tinder's counter at Bram's Kettle, which leads with his next line as Captain Reed's
 * panel does and sells the three rockets from the stall's tiles and panel; the small card at the jetty's rack that
 * picks which rocket to light when the bag holds more than one kind; and the rockets' row in the Bag.
 */

/** The menu's tabs these are drawn in. */
export const BRAM_TAB = 'bram';
export const RACK_TAB = 'rocketpick';
export const ROCKET_TABS = [BRAM_TAB, RACK_TAB];

/** The game's own tile, panel and button (the ones Marlow's stall is drawn with). */
export interface ShopUi {
  tile(o: { icon: string; name: string; sub: string; price?: string; tier: number; on?: boolean; ghost?: boolean; attrs: string }): string;
  detail(o: { icon: string; name: string; tier: number; badge?: string; body: string; note: string; actions: string }): string;
  btn(label: string, attrs: string, kind?: 'gold' | 'ok' | 'plain' | 'bad', disabled?: boolean): string;
}
interface Purse { coins: number; rockets: RocketBag }

const price = (n: number): string => `${n.toLocaleString()} ${COIN}`;
const held = (s: Purse, id: RocketId): string => `<div class="have">In your bag: <b>${rocketCount(s, id)}</b></div>`;
const WHERE = "Light it at the rack on the end of the jetty, down the steps and across Skipper's Beach. It can't be sold back.";

/** Bram's counter: his line, the three rockets and the one picked (`pick`, a rocket's id; the small one to begin with). */
export function bramHtml(s: Purse, say: string, pick: string | undefined, ui: ShopUi): string {
  const sel = rocketById(pick) ?? ROCKETS[0];
  const tiles = ROCKETS.map((r) => {
    const n = rocketCount(s, r.id);
    return ui.tile({ icon: r.icon, name: r.name, sub: n ? `×${n} in your bag` : '', price: price(r.price), tier: r.tier, on: r.id === sel.id, ghost: s.coins < r.price, attrs: `data-pick="rocket" data-id="${r.id}"` });
  }).join('');
  const action = rocketCount(s, sel.id) >= ROCKET_STACK
    ? ui.btn('Your bag is full of these', '', 'plain', true)
    : s.coins < sel.price
      ? ui.btn(`Need ${price(sel.price)}`, '', 'plain', true)
      : ui.btn(`Buy for ${price(sel.price)}`, `data-act="buyrocket" data-id="${sel.id}"`);
  const panel = ui.detail({
    icon: sel.icon,
    name: sel.name,
    tier: sel.tier,
    badge: `<span class="badge" style="--c:var(--t${sel.tier})">${sel.seconds < 3 ? 'A quick one' : sel.seconds < 6 ? 'About 5 seconds' : 'About 12 seconds'}</span>`,
    body: held(s, sel.id),
    note: `${sel.blurb} ${WHERE}`,
    actions: action,
  });
  return `<div class="reed bram"><p class="say">"${say}"</p>
    <div class="cols"><div class="main"><h4>Rockets</h4><div class="tiles">${tiles}</div>
    <p class="foot">Everyone at the lake sees a rocket go up. One is in the sky at a time.</p></div>${panel}</div></div>`;
}

/** The rack's card: one button for each kind of rocket in the bag. */
export function rackHtml(s: Purse): string {
  const buttons = rocketKinds(s).map((id) => {
    const r = rocketById(id)!;
    return `<button class="btn gold" data-act="lightrocket" data-id="${id}"><span>${r.icon} ${r.name}</span><small>×${rocketCount(s, id)} in your bag</small></button>`;
  }).join('');
  return `<div class="dcard rack"><h2>Light a rocket</h2><div class="sub">Which one?</div><div class="btns">${buttons}</div></div>`;
}

/** The Bag's row of rockets, with nothing to show while there are none. */
export function bagRocketsHtml(s: Purse, sel: string, ui: ShopUi): string {
  const kinds = rocketKinds(s);
  if (!kinds.length) return '';
  const tiles = kinds.map((id) => {
    const r = rocketById(id)!;
    return ui.tile({ icon: r.icon, name: r.name, sub: `×${rocketCount(s, id)}`, tier: r.tier, on: sel === `rocket:${id}`, attrs: `data-pick="bag" data-id="rocket:${id}"` });
  }).join('');
  return `<h4>Rockets</h4><div class="tiles">${tiles}</div>`;
}

/** The Bag's panel for a rocket picked there. */
export function bagRocketDetail(s: Purse, id: string, ui: ShopUi): string {
  const r = rocketById(id) ?? ROCKETS[0];
  return ui.detail({ icon: r.icon, name: r.name, tier: r.tier, badge: `<span class="badge" style="--c:var(--t${r.tier})">Firework</span>`, body: held(s, r.id), note: `${r.blurb} ${WHERE}`, actions: ui.btn("From Bram Tinder at Bram's Kettle", '', 'plain', true) });
}
