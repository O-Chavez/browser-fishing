// The dive on screen (D3): the strip at the top of the screen at sea, Captain Reed's charter panel, the choice at a
// marker, heading home early, and the cards at the end. Players read a dive as a charter sailing further out
// (Oscar, 2026-10-31): the zones (The Shelf, The Drop-off, ...) are stretches of sea, each holding markers named by
// their league ("marker 25"), and the boat's place is "league N". The rules and messages keep depth and ledge.
import { RODS, byId } from '../data/content';
import { BEHAVIOURS, DIVE, type Behaviour } from '../data/dive';
import type { DiveEnd, DiveView } from '../net/protocol';
import { haulBonus, pearlsAt, zoneAt, type Chart } from './dive';
import type { LossReason } from './reel';
import { COIN } from './format';

export const PEARL = '<i class="pearl"></i>';
/** The line bar warns below these many metres: low, then nearly out. */
export const LINE_LOW = 60;
export const LINE_DANGER = 25;
/** How long the last fight's line cost shows beside the bar (ms). */
const WORN_MS = 4000;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const pct = (bonus: number) => `+${Math.round((bonus - 1) * 100)}%`;

/** The next marker past this depth (at a marker, the one after it). */
export const nextMarker = (depth: number): number => (Math.floor(depth / DIVE.ledgeEvery) + 1) * DIVE.ledgeEvery;

/** Where a charter sets out from, for the "Casting off" card: the harbour, a marker, or (dev `/sea`) a league. */
export const startText = (depth: number): string =>
  `${zoneAt(depth).name} · ${depth === 0 ? 'from the harbour' : depth % DIVE.ledgeEvery === 0 ? `from marker ${depth}` : `league ${depth}`}`;

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

/** The strip's contents: zone and league, the next marker, the line and the haul. */
export function hudHtml(v: DiveView, worn: boolean): string {
  const z = zoneAt(v.depth);
  const at = v.state === 'ledge';
  const next = nextMarker(v.depth);
  const left = next - v.depth;
  const marker = at
    ? `<span class="lab">🚩 Marker</span><span class="m">Head home or sail on?</span>`
    : `<span class="lab">🚩 Next marker</span><span class="m">Marker ${next} · ${plural(left, 'more fish', 'more fish')}</span>`;
  const full = Math.max(0, Math.min(100, (v.line / DIVE.spool) * 100));
  // Easy fights barely touch the spool; the cost shows once it's a metre or more.
  const cost = worn && v.worn && v.worn >= 0.5 ? `<span class="worn">−${Math.round(v.worn)} m</span>` : '';
  const grow = v.ledges ? `<span class="grow">${pct(haulBonus(v.ledges))}</span>` : '';
  return `<div><span class="zone">${z.name}</span><span class="depth"><small>league</small>${v.depth}</span></div>
    <div>${marker}</div>
    <div class="line ${lineLevel(v.line)}"><span class="lab">Line</span><span class="linerow"><span class="bar"><i style="width:${full.toFixed(1)}%"></i></span><span class="m">${Math.floor(v.line)} m</span>${cost}</span></div>
    <div><span class="lab">Haul</span><span class="haul">${PEARL}${v.pearls}${grow}<span class="dfish">🐟 ${v.fish}</span></span></div>`;
}

/** The dive strip at the top of the screen, and the hooked sea fish's behaviour under it. */
export class DiveHud {
  view: DiveView | null = null;
  private wornUntil = 0;
  private timer = 0;

  constructor(private readonly el: HTMLElement, private readonly tag: HTMLElement) {}

  /** A new dive state; a fight's line cost shows for a few seconds. */
  set(v: DiveView | null): void {
    const before = this.view;
    this.view = v;
    if (v?.worn && (!before || before.line !== v.line)) this.wornUntil = performance.now() + WORN_MS;
    this.render();
  }

  private render(): void {
    const v = this.view;
    this.el.classList.toggle('hidden', !v);
    if (!v) return this.fight(null);
    const worn = performance.now() < this.wornUntil;
    this.el.innerHTML = hudHtml(v, worn);
    clearTimeout(this.timer);
    if (worn) this.timer = window.setTimeout(() => this.render(), this.wornUntil - performance.now() + 20);
  }

  /** Names the hooked fish's way of fighting while it's on, or hides the tag. */
  fight(b: Behaviour | null | undefined): void {
    this.tag.classList.toggle('hidden', !b || !this.view);
    if (b) this.tag.innerHTML = `${BEHAVIOUR_ICON[b]} ${BEHAVIOURS[b].name} <span>· ${BEHAVIOURS[b].hint.toLowerCase()}</span>`;
  }
}

const BEHAVIOUR_ICON: Record<Behaviour, string> = { runner: '🏃', thrasher: '💥', sounder: '⤵️' };

/** What the water at this depth holds, for Reed's panel and the marker card. */
function waterText(depth: number): string {
  const z = zoneAt(depth);
  const fight = z.behaviours.length
    ? z.behaviours.map((b) => `${BEHAVIOURS[b].name}s: ${BEHAVIOURS[b].hint.toLowerCase()}`).join('. ')
    : 'Steady fish, no tricks';
  return `${fight}. ${plural(pearlsAt(depth), 'pearl')} a fish.`;
}

/** Captain Reed's panel: where to start a charter from (the harbour or a charted marker), or what a charter needs. */
export function reedHtml(o: { say: string; chart: Chart; pearls: number; ownsRod: boolean; pick: number }): string {
  if (!o.ownsRod) {
    const rod = byId(RODS, DIVE.rod);
    return `<div class="reed"><p class="say">"The open sea snaps lesser rods like reeds. No offence to me."</p>
      <div class="detail"><b>Charters need the ${rod.name}.</b> Marlow sells it from level ${rod.unlockLevel}. Each fish you land takes the boat a league further out, with a marker every ${DIVE.ledgeEvery} leagues where you can head home with the haul.</div>
      <div class="btns"><button class="btn plain" data-act="close">OK</button></div></div>`;
  }
  const starts = [0, ...o.chart.ledges];
  const groups = new Map<string, number[]>();
  for (const d of starts) {
    const name = zoneAt(d).name;
    groups.set(name, [...(groups.get(name) ?? []), d]);
  }
  const chips = [...groups].map(([name, ds]) => `<div class="zlab">${name}</div><div class="chips">${ds.map((d) =>
    `<button class="chip${d === o.pick ? ' sel' : ''}${d && d === o.chart.record ? ' rec' : ''}" data-act="divefrom" data-id="${d}">${d ? d : 'Harbour'}<small>${d ? 'marker' : 'league 0'}</small></button>`).join('')}</div>`).join('');
  const where = o.pick ? `marker ${o.pick} in ${zoneAt(o.pick).name}` : `the harbour, into ${zoneAt(0).name}`;
  return `<div class="reed"><p class="say">"${o.say}"</p>
    ${chips}
    <div class="detail"><b>Start at ${where}.</b> ${waterText(o.pick)} One ${DIVE.spool} m spool of line a charter; head home at any marker to bank the haul.</div>
    <div class="btns"><button class="btn plain" data-act="close">Not now</button><button class="btn ok" data-act="castoff" data-id="${o.pick}">⚓ Cast off</button></div>
    <div class="foot"><span>${o.chart.record ? `Furthest marker: ${o.chart.record}` : 'No markers charted yet'}</span><span>${PEARL} ${plural(o.pearls, 'pearl')}</span></div></div>`;
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
    <div class="sub">${zoneAt(v.depth).name} · ${plural(v.fish, 'fish', 'fish')} landed this charter</div>
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
    <div class="sub">${zoneAt(v.depth).name} · league ${v.depth} · ${plural(next - v.depth, 'fish', 'fish')} to marker ${next}</div>
    <div class="why">${v.pearls ? `The haul of ${plural(v.pearls, 'pearl')} sinks if you head home now.` : 'Nothing in the haul yet, so nothing is lost.'}</div>
    <p class="note">${v.fish ? `Your ${plural(v.fish, 'fish', 'fish')} ${v.fish === 1 ? 'is' : 'are'} already sold. ` : ''}Markers you've charted stay charted.</p>
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
      <div class="sub">${how}${plural(pearls, 'pearl')} in all</div>
      <div class="rows">${soldRow(e.fish, e.coins)}</div>
      <div class="btns"><button class="btn" data-act="close">OK</button></div></div>`;
  }
  const z = zoneAt(e.depth).name;
  const [title, sub, why] =
    e.why === 'home' ? ['Headed home', `Turned back at league ${e.depth} · ${z}`, 'You headed home between markers, so the haul sank.']
    : e.why === 'away' ? ['The haul sank', `Left at league ${e.depth} · ${z}`, `The boat waited ${Math.round(DIVE.holdMs / 60000)} minutes for you, then turned back without the haul.`]
    : e.why === 'line' ? ['The haul sank', `Out of line at league ${e.depth} · ${z}`, e.lost ? `The last fish ${lossText(e.lost)}.` : 'The last fight took the last of the line.']
    : ['The charter ended', `League ${e.depth} · ${z}`, 'The haul sank.'];
  return `<div class="dcard"><h2 class="blue">${title}</h2>
    <div class="sub">${sub}</div>
    <div class="why">${why}</div>
    ${e.pearls ? `<div class="big lost">${PEARL}${e.pearls}</div>` : ''}
    <div class="rows">${soldRow(e.fish, e.coins, true)}${record ? `<div class="row">Furthest charted marker <b>${record}</b></div>` : ''}</div>
    <p class="note">${e.why === 'line' ? 'Head home sooner when the line runs low. ' : ''}Markers you've charted stay charted.</p>
    <div class="btns"><button class="btn" data-act="close">OK</button></div></div>`;
}
