// The dive on screen (D3): the strip at the top of the screen at sea, Captain Reed's charter panel, the choice at a
// marker, heading home early, and the cards at the end. Players read a dive as a charter sailing further out
// (Oscar, 2026-10-31): the zones (The Shelf, The Drop-off, ...) are stretches of sea, each holding markers ("marker
// 25"), and distance is told in fish and markers. The rules and messages keep depth and ledge.
import { DEEP_SEA_ROD } from '../data/content';
import { BEHAVIOURS, DIVE, ZONES, type Behaviour } from '../data/dive';
import type { DiveEnd, DiveView } from '../net/protocol';
import { haulBonus, pearlsAt, zoneAt, type Chart } from './dive';
import type { LossReason } from './reel';
import { COIN, PEARL } from './format';

/** The line bar warns below these many metres: low, then nearly out. */
export const LINE_LOW = 60;
export const LINE_DANGER = 25;
/** How long the last fight's line cost shows beside the bar (ms). */
const WORN_MS = 4000;
const POP_MS = 700;

/**
 * The "next marker" row: one icon per fish between markers, then the flag. Tweak the icons and count here; the
 * grey-out and the pop animation are in style.css (the `.trail` block, `--off-*` and `@keyframes trailPop`).
 */
export const TRAIL = { fish: '🐟', flag: '🚩', count: DIVE.ledgeEvery };

const lower = (zone: string) => zone.replace(/^The /, 'the ');
const zoneAfter = (depth: number) => ZONES[ZONES.findIndex((z) => z === zoneAt(depth)) + 1];
/** The markers in this zone (multiples of `ledgeEvery`, up to where the next zone starts); none in the last zone. */
export function zoneMarkers(depth: number): number[] {
  const z = zoneAt(depth), to = zoneAfter(depth);
  if (!to) return [];
  const out: number[] = [];
  for (let m = Math.max(1, Math.ceil(z.from / DIVE.ledgeEvery)) * DIVE.ledgeEvery; m < to.from; m += DIVE.ledgeEvery) out.push(m);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const pct = (bonus: number) => `+${Math.round((bonus - 1) * 100)}%`;

/** The next marker past this depth (at a marker, the one after it). */
export const nextMarker = (depth: number): number => (Math.floor(depth / DIVE.ledgeEvery) + 1) * DIVE.ledgeEvery;

/** Where a charter sets out from, for the "Casting off" card: the harbour, a marker, or (dev `/sea`) partway between markers. */
export const startText = (depth: number): string =>
  `${zoneAt(depth).name} · ${depth === 0 ? 'from the harbour' : depth % DIVE.ledgeEvery === 0 ? `from marker ${depth}` : `partway to marker ${nextMarker(depth)}`}`;

/** Pearls the haul banks if the player heads home now (at a marker), as `surface` works it out. */
export const banked = (v: Pick<DiveView, 'pearls' | 'ledges'>): number => Math.round(v.pearls * haulBonus(v.ledges));

export const lineLevel = (metres: number): 'ok' | 'low' | 'danger' => (metres <= LINE_DANGER ? 'danger' : metres <= LINE_LOW ? 'low' : 'ok');

/** Why the last fish got away, after "it" or "the last fish". */
export function lossText(lost: LossReason | 'gone'): string {
  switch (lost) {
    case 'held-surge': return 'snapped the line: you held on through a surge';
    case 'held-red': return 'snapped the line: you held on in the red';
    case 'ran': return 'ran off with the line';
    default: return 'got away';
  }
}

/** The last marker the boat has passed (0 before the first). */
export const lastMarker = (depth: number): number => Math.floor(depth / DIVE.ledgeEvery) * DIVE.ledgeEvery;

/** The strip's contents: the zone and last marker, the fish and marker rows, the line and the haul. `pop` is the trail icon that just lit. */
export function hudHtml(v: DiveView, worn: boolean, pop = -1): string {
  const z = zoneAt(v.depth);
  const at = v.state === 'ledge';
  const next = nextMarker(v.depth);
  const last = lastMarker(v.depth);
  // Row 1: fish landed since the last marker light up one by one (all lit at a marker).
  const landed = at ? TRAIL.count : Math.min(TRAIL.count, v.depth % DIVE.ledgeEvery);
  const icons = Array.from({ length: TRAIL.count }, (_, i) =>
    `<i class="${i < landed ? 'on' : ''}${i === pop ? ' pop' : ''}">${TRAIL.fish}</i>`).join('');
  const fishRow = `<span class="trailrow"><span class="lab">${at ? `Marker ${v.depth} reached` : `${plural(next - v.depth, 'fish', 'fish')} to marker ${next}`}</span><span class="trail">${icons}</span></span>`;
  // Row 2: a flag per marker in this zone, lit once reached; hidden in the last zone, which never ends.
  const marks = zoneMarkers(v.depth);
  const flags = marks.map((m) => `<i class="flag${m <= v.depth ? ' on' : ''}${at && m === v.depth && pop === TRAIL.count ? ' pop' : ''}">${TRAIL.flag}</i>`).join('');
  const to = zoneAfter(v.depth);
  const ahead = marks.filter((m) => m > v.depth).length;
  const flagLab = !to ? '' : ahead ? `${plural(ahead, 'marker')} to ${lower(to.name)}` : `${to.name} next`;
  const flagRow = marks.length && to ? `<span class="trailrow"><span class="lab">${flagLab}</span><span class="trail">${flags}</span></span>` : '';
  const marker = fishRow + flagRow;
  const full = Math.max(0, Math.min(100, (v.line / DIVE.spool) * 100));
  // Easy fights barely touch the spool; the cost shows once it's a metre or more.
  const cost = worn && v.worn && v.worn >= 0.5 ? `<span class="worn">−${Math.round(v.worn)} m</span>` : '';
  const grow = v.ledges ? `<span class="grow">${pct(haulBonus(v.ledges))}</span>` : '';
  return `<div><span class="zone">${z.name}</span>${last ? `<span class="at">Marker ${last}</span>` : ''}</div>
    <div>${marker}</div>
    <div class="line ${lineLevel(v.line)}"><span class="lab">Line</span><span class="linerow"><span class="bar"><i style="width:${full.toFixed(1)}%"></i></span><span class="m">${Math.floor(v.line)} m</span>${cost}</span></div>
    <div><span class="lab">Haul</span><span class="haul">${PEARL}${v.pearls}${grow}<span class="dcoins">${COIN} ${v.coins.toLocaleString()}</span></span></div>`;
}

/** The dive strip at the top of the screen, and the hooked sea fish's behaviour under it. */
export class DiveHud {
  view: DiveView | null = null;
  private wornUntil = 0;
  private timer = 0;
  private popUntil = 0;
  private pop = -1;

  constructor(private readonly el: HTMLElement, private readonly tag: HTMLElement) {}

  /** A new dive state; a fight's line cost shows for a few seconds. */
  set(v: DiveView | null): void {
    const before = this.view;
    this.view = v;
    if (v?.worn && (!before || before.line !== v.line)) this.wornUntil = performance.now() + WORN_MS;
    if (v && before && v.depth === before.depth + 1) {
      // The fish just landed: pop its icon (the flag too if that was the marker).
      this.pop = v.state === 'ledge' ? TRAIL.count : (v.depth % DIVE.ledgeEvery) - 1;
      this.popUntil = performance.now() + POP_MS;
    }
    this.render();
  }

  private render(): void {
    const v = this.view;
    this.el.classList.toggle('hidden', !v);
    if (!v) return this.fight(null);
    const now = performance.now();
    const worn = now < this.wornUntil;
    const popping = now < this.popUntil;
    this.el.innerHTML = hudHtml(v, worn, popping ? this.pop : -1);
    clearTimeout(this.timer);
    // Re-render when the cost note or the pop is due to end (a re-render mid-pop must not restart it, so keep the pop going).
    const due = Math.max(worn ? this.wornUntil : 0, popping ? this.popUntil : 0);
    if (due) this.timer = window.setTimeout(() => this.render(), due - now + 20);
  }

  /** Shows the hooked fish's matchup with the gear while it's on (`fishTagHtml`), red when it's two rungs or more over. */
  fight(f: SeaFightTag | null): void {
    const html = f && this.view ? fishTagHtml(f) : '';
    this.tag.classList.toggle('hidden', !html);
    this.tag.classList.toggle('over', !!f?.too);
    if (html) this.tag.innerHTML = html;
  }
}

const BEHAVIOUR_ICON: Record<Behaviour, string> = { runner: '🏃', thrasher: '💥', sounder: '⤵️' };

/** What the top sticker says about a hooked sea fish. */
export interface SeaFightTag {
  b: Behaviour | null | undefined;
  /** Its pull roll's word; none for a typical one (the pull roll is off while the foundation leaves variety out). */
  pull: 'strong' | 'light' | null | undefined;
  /** The matchup in words (`matchupWords`), and whether it's two rungs or more over the gear. */
  match: string;
  too: boolean;
}

/**
 * The sticker for the whole fight: the fish's pull and behaviour (both off for now), and the matchup with the gear in
 * place of the behaviour's hint, so the hook toast's warning doesn't vanish after a few seconds. Empty when the gear
 * handles a typical fish with no behaviour.
 */
export function fishTagHtml(f: SeaFightTag): string {
  const parts = [f.pull === 'strong' ? '💪 Strong' : f.pull === 'light' ? '🪶 Light' : '', f.b ? `${BEHAVIOUR_ICON[f.b]} ${BEHAVIOURS[f.b].name}` : ''].filter(Boolean);
  const hint = f.match ? f.match.toLowerCase() : f.b ? BEHAVIOURS[f.b].hint.toLowerCase() : '';
  if (!parts.length) return f.match;
  return `${parts.join(' · ')}${hint ? ` <span>· ${hint}</span>` : ''}`;
}

/**
 * What the water at this depth pays, for Reed's panel and the marker card. The zones' ways of fighting are left out
 * until the deep sea mechanics pass fleshes them out (Oscar, 2026-11-03).
 */
function waterText(depth: number): string {
  return `${plural(pearlsAt(depth), 'pearl')} a fish.`;
}

/**
 * Captain Reed's panel: where to start a charter from (the harbour or a charted marker), or what a charter needs.
 * While charters are closed (`DIVES_OPEN`), what a charter is and that his seaplane isn't ready yet.
 */
export function reedHtml(o: { say: string; chart: Chart; pearls: number; ownsRod: boolean; pick: number; open: boolean }): string {
  if (!o.open) {
    const rod = DEEP_SEA_ROD;
    return `<div class="reed"><p class="say">"Still tinkering with the old girl's engine. She'll be flying again soon, I promise."</p>
      <div class="detail"><b>Charters are coming soon.</b> Reed flies you out to sea. Every ${DIVE.ledgeEvery} fish you land, you reach a marker: head home with your haul, or sail on for a bigger one. The haul is only safe once you head home at a marker. Charters will need the ${rod.name}${o.ownsRod ? ', and you have one.' : `, which Marlow sells from level ${rod.unlockLevel}.`}</div>
      <div class="btns"><button class="btn plain" data-act="close">OK</button></div></div>`;
  }
  if (!o.ownsRod) {
    const rod = DEEP_SEA_ROD;
    return `<div class="reed"><p class="say">"The open sea snaps lake rods like reeds. No offence to me. Get yourself a proper rod and I'll keep it aboard for you."</p>
      <div class="detail"><b>Charters need the ${rod.name}.</b> Marlow sells it from level ${rod.unlockLevel} for ${rod.price.toLocaleString('en-US')} ${COIN}, and it stays on my boat between charters. Every ${DIVE.ledgeEvery} fish you land, you reach a marker, where you can head home with the haul.</div>
      <div class="btns"><button class="btn plain" data-act="close">OK</button></div></div>`;
  }
  const starts = [0, ...o.chart.ledges];
  const groups = new Map<string, number[]>();
  for (const d of starts) {
    const name = zoneAt(d).name;
    groups.set(name, [...(groups.get(name) ?? []), d]);
  }
  const chips = [...groups].map(([name, ds]) => `<div class="zlab">${name}</div><div class="chips">${ds.map((d) =>
    `<button class="chip${d === o.pick ? ' sel' : ''}${d && d === o.chart.record ? ' rec' : ''}" data-act="divefrom" data-id="${d}">${d ? d : 'Harbour'}<small>${d ? 'marker' : 'start'}</small></button>`).join('')}</div>`).join('');
  const where = o.pick ? `marker ${o.pick} in ${zoneAt(o.pick).name}` : `the harbour, into ${zoneAt(0).name}`;
  return `<div class="reed"><p class="say">"${o.say}"</p>
    ${chips}
    <div class="detail"><b>Start at ${where}.</b> ${waterText(o.pick)} One ${DIVE.spool} m spool of line a charter; head home at any marker to bank the haul.</div>
    <div class="btns"><button class="btn plain" data-act="close">Not now</button><button class="btn ok" data-act="castoff" data-id="${o.pick}">⚓ Cast off</button></div>
    <div class="foot"><span>${o.chart.record ? `Furthest marker: ${o.chart.record}` : 'No markers charted yet'}</span><span>${PEARL} ${plural(o.pearls, 'Black Pearl')}</span></div></div>`;
}

/** At a marker: head home with the haul, or sail on for a bigger one. */
export function markerHtml(v: DiveView): string {
  const now = haulBonus(v.ledges);
  const then = haulBonus(v.ledges + 1);
  const next = nextMarker(v.depth);
  const full = Math.max(0, Math.min(100, (v.line / DIVE.spool) * 100));
  const ahead = zoneAt(next - 1).name !== zoneAt(v.depth).name ? ` Past marker ${v.depth}: ${zoneAt(next - 1).name}. ${waterText(next - 1)}` : '';
  const stake = then > now
    ? `Sail on and the haul grows to ${pct(then)} at marker ${next}, but if the line runs out it sinks.`
    : `The haul is at its best (${pct(now)}). Sail on and it still sinks if the line runs out.`;
  return `<div class="dcard"><h2>🚩 Marker ${v.depth}</h2>
    <div class="sub">${zoneAt(v.depth).name} · ${v.coins.toLocaleString()} ${COIN} from fish this charter</div>
    <div class="rows">
      <div class="row ${lineLevel(v.line)}">Line left <span class="bar"><i style="width:${full.toFixed(1)}%"></i></span><b>${Math.floor(v.line)} m</b></div>
      <div class="row">Haul <span>${PEARL} <b>${v.pearls}</b> × ${now.toFixed(1)} = <b>${banked(v)}</b></span></div>
    </div>
    <p class="note">${stake}${ahead}</p>
    <div class="btns">
      <button class="btn ok" data-act="markerhome"><span><kbd>1</kbd>Head home</span><small>bank ${banked(v)} · chart marker ${v.depth}</small></button>
      <button class="btn" data-act="markeron"><span><kbd>2</kbd>Sail on</span><small>${then > now ? `${pct(then)} at marker ${next}` : `next: marker ${next}`}</small></button>
    </div></div>`;
}

/** Between markers: heading home now sinks the haul. */
export function headHomeHtml(v: DiveView): string {
  const next = nextMarker(v.depth);
  return `<div class="dcard"><h2 class="blue">Head home?</h2>
    <div class="sub">${zoneAt(v.depth).name} · ${plural(next - v.depth, 'fish', 'fish')} to marker ${next}</div>
    <div class="why">${v.pearls ? `The haul of ${plural(v.pearls, 'pearl')} sinks if you head home now.` : 'Nothing in the haul yet, so nothing is lost.'}</div>
    <p class="note">${v.coins ? `You keep the ${v.coins.toLocaleString()} ${COIN} from fish sold so far. ` : ''}Markers you've charted stay charted.</p>
    <div class="btns"><button class="btn plain" data-act="close">Stay out</button><button class="btn bad" data-act="headhome">Head home</button></div></div>`;
}

const soldRow = (fish: number, coins: number, kept = false) =>
  fish ? `<div class="row">${kept ? 'Fish sold along the way (kept)' : 'Fish landed and sold'} <b>${fish.toLocaleString()} · ${coins.toLocaleString()} ${COIN}</b></div>` : '';

/**
 * The card after a trip. `last` is the dive as it stood before it ended (for the haul's growth), `pearls` the
 * player's pearls in all once the save has caught up.
 */
export function endHtml(e: DiveEnd, last: DiveView | null, pearls: number, record: number): string {
  if (e.result === 'surfaced') {
    const how = last && last.ledges ? `${last.pearls} pearls × ${haulBonus(last.ledges).toFixed(1)} for ${plural(last.ledges, 'marker')} · ` : '';
    return `<div class="dcard"><h2>Home safe!</h2>
      <div><span class="ribbon">Marker ${e.ledge} charted</span>${e.record ? '<span class="ribbon gold">★ New record</span>' : ''}</div>
      <div class="big">${PEARL}+${e.pearls}</div>
      <div class="sub">${how}${plural(pearls, 'Black Pearl')} in all</div>
      <div class="rows">${soldRow(e.fish, e.coins)}</div>
      <div class="btns"><button class="btn" data-act="close">OK</button></div></div>`;
  }
  const z = zoneAt(e.depth).name;
  const [title, sub, why] =
    e.why === 'home' ? ['Headed home', `Turned back between markers · ${z}`, 'You headed home between markers, so the haul sank.']
    : e.why === 'away' ? ['The haul sank', `Left between markers · ${z}`, `The boat waited ${Math.round(DIVE.holdMs / 60000)} minutes for you, then turned back without the haul.`]
    : e.why === 'line' ? ['The haul sank', `Out of line before marker ${nextMarker(e.depth)} · ${z}`, e.lost ? `The last fish ${lossText(e.lost)}.` : 'The last fight took the last of the line.']
    : ['The charter ended', `Between markers · ${z}`, 'The haul sank.'];
  return `<div class="dcard"><h2 class="blue">${title}</h2>
    <div class="sub">${sub}</div>
    <div class="why">${why}</div>
    ${e.pearls ? `<div class="big lost">${PEARL}${e.pearls}</div>` : ''}
    <div class="rows">${soldRow(e.fish, e.coins, true)}${record ? `<div class="row">Furthest charted marker <b>${record}</b></div>` : ''}</div>
    <p class="note">${e.why === 'line' ? 'Head home sooner when the line runs low. ' : ''}Markers you've charted stay charted.</p>
    <div class="btns"><button class="btn" data-act="close">OK</button></div></div>`;
}
