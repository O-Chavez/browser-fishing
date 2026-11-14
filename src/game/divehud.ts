// The charter on screen: Captain Reed's chart and shop, the strip at the top of the screen at sea, the card when the
// spool runs out, heading home, and the card at the end. The rules are in dive.ts; every number here comes from them.
import { DEEP_SEA_ROD } from '../data/content';
import { ABYSS, BEHAVIOURS, BOAT_PARTS, DIVE, LINE, MARKER, ZONES, type Behaviour } from '../data/dive';
import type { DiveEnd, DiveView } from '../net/protocol';
import { averagePearls, lineCost, nextBoatPart, nextRodBuy, payAt, pearlMult, pearlsFor, RATING_NAMES, seaRating, spoolPrice, zoneOpen, type PearlFish, type Rating, type SeaRod } from './dive';
import type { LossReason } from './reel';
import { COIN, PEARL } from './format';

/** The line bar warns below these many metres: low, then nearly out. */
export const LINE_LOW = 60;
export const LINE_DANGER = 25;
/** How long the last fish's line cost shows beside the bar (ms). */
const COST_MS = 4000;
/** How long the pearls a fish just paid show beside the tally (ms). */
const GAIN_MS = 4000;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const num = (n: number) => n.toLocaleString('en-US');
const signed = (n: number) => `${n < 0 ? '−' : '+'}${num(Math.abs(n))}`;
/** A zone's name inside a sentence: "the Drop-off". */
const lower = (name: string) => name.replace(/^The /, 'the ');

/** A zone's name, with the marker in the Abyss: "The Abyss · marker 4". */
export const whereText = (zone: number, marker: number): string => `${ZONES[zone]?.name ?? ZONES[0].name}${zone === ABYSS ? ` · marker ${marker}` : ''}`;

/** Where a charter sails to, for the "Casting off" card. */
export const startText = (v: Pick<DiveView, 'zone' | 'marker'> | null): string => (v ? whereText(v.zone, v.marker) : 'Out to sea');

/**
 * The pearls line on a sea fish's catch card: what it paid here, and why when it paid more ("double: Feisty", "five
 * times: shiny", "50 times: shiny Brutish legend").
 */
export function catchPearlsHtml(zone: number, marker: number, fish: PearlFish): string {
  const m = pearlMult(fish);
  const tag = fish.tag === 'feisty' ? 'Feisty' : fish.tag === 'brutish' ? 'Brutish' : '';
  const what = [fish.shiny ? 'shiny' : '', tag, fish.legend ? 'legend' : ''].filter(Boolean).join(' ');
  const why = m <= 1 ? '' : m === 2 ? `double: ${what}` : `${m === 5 ? 'five' : m === 10 ? 'ten' : `${m}`} times: ${what}`;
  return `<div class="pearls">${PEARL} +${pearlsFor(zone, marker, fish)}${why ? `<small class="credit">${why}</small>` : ''}</div>`;
}

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

/** A rating as a coloured pill. */
export const ratePill = (r: Rating): string => `<span class="rate ${r}">${RATING_NAMES[r]}</span>`;

/** The words on the hook toast for a zone's rating: said plainly, since "Easy" needs no warning. */
export const ratingToast = (r: Rating): string => (r === 'easy' ? 'An easy one.' : `${RATING_NAMES[r]} for your rod${r === 'over' ? '!' : '.'}`);

/** What the strip shows beyond the view: a line cost taken at the hook, a cost to note, and the pearls just paid. */
export interface StripNote {
  /** Metres taken at the hook: drawn off the bar and the number before the server's view says so. */
  hooked?: number;
  /** Metres to note over the bar, as a red "−13 m". */
  cost?: number;
  /** Pearls the last landed fish paid, shown for a few seconds. */
  gain?: number;
}

/** What the screens read from the save to show the next boat part's progress. */
export interface PartSave {
  pearls: number;
  boatParts: number;
}

/**
 * Black Pearls as progress (Oscar, 2026-11-13): they only buy boat parts, so the screens show how far along the next
 * part is instead of a purse.
 */
export interface PartProgress {
  name: string;
  /** The zone the part opens. */
  zone: number;
  have: number;
  need: number;
  /** The bar's fill, 0 to 100. */
  pct: number;
  /** Enough pearls: Captain Reed can fit it. */
  ready: boolean;
}

/** Progress to the next boat part, or null with the boat fully fitted. */
export function partProgress(s: PartSave): PartProgress | null {
  const part = nextBoatPart(s.boatParts);
  if (!part) return null;
  return { name: part.name, zone: s.boatParts + 1, have: s.pearls, need: part.pearls, pct: Math.max(0, Math.min(100, (s.pearls / part.pearls) * 100)), ready: s.pearls >= part.pearls };
}

/** A part's progress as a pearl, a bar and "42 / 150". */
export const partBar = (p: PartProgress, pop = false): string =>
  `${PEARL}<span class="pbar${p.ready ? ' full' : ''}"><i style="width:${p.pct.toFixed(1)}%"></i></span><span class="pn${pop ? ' pop' : ''}">${num(p.have)} / ${num(p.need)}</span>`;

/**
 * The strip's contents: where, the line, the coins this charter's fish have paid, and the next boat part's progress
 * (with every part fitted, the pearls held). Without a save (`s`), the pearls this charter has paid.
 */
export function hudHtml(v: DiveView, note: StripNote = {}, s: PartSave | null = null): string {
  const line = Math.max(0, v.line - (note.hooked ?? 0));
  const full = Math.max(0, Math.min(100, (line / LINE.spool) * 100));
  const cost = note.cost ? `<span class="worn">−${note.cost} m</span>` : '';
  const where = v.zone === ABYSS
    ? `<span class="v">Marker ${v.marker} <span class="pips" title="${MARKER.every - v.toNext} fish to the next marker">${'●'.repeat(v.toNext)}${'○'.repeat(Math.max(0, MARKER.every - v.toNext))}</span></span>`
    : `<span class="v">${ratePill(v.rating)}</span>`;
  const gain = note.gain ? `<span class="gain">+${note.gain}</span>` : '';
  const p = s ? partProgress(s) : null;
  const part = p
    ? `<div class="part${p.ready ? ' ready' : ''}"><span class="labrow"><span class="lab">${p.name}${p.ready ? ' · ready' : ''}</span>${gain}</span><span class="partrow">${partBar(p, !!note.gain)}</span></div>`
    : `<div class="part"><span class="labrow"><span class="lab">Black Pearls</span>${gain}</span><span class="partrow">${PEARL}<span class="pn${note.gain ? ' pop' : ''}">${num(s ? s.pearls : v.tally.pearls)}</span></span></div>`;
  return `<div class="where"><span class="zone">${ZONES[v.zone]?.name ?? ZONES[0].name}</span>${where}</div>
    <div class="line ${lineLevel(line)}"><span class="labrow"><span class="lab">Line · ${v.fishLine} m a fish</span>${cost}</span><span class="linerow"><span class="bar"><i style="width:${full.toFixed(1)}%"></i></span><span class="m">${Math.floor(line)} m</span></span></div>
    <div class="earn"><span class="lab">This charter</span><span class="haul">${COIN} ${num(v.tally.coins)}</span></div>
    ${part}`;
}

/** The charter strip at the top of the screen, and the hooked sea fish's sticker under it. */
export class DiveHud {
  view: DiveView | null = null;
  private costUntil = 0;
  private timer = 0;
  private gainUntil = 0;
  private gain = 0;
  /** Metres a hooked fish will take, drawn at the hook until the server's view says so. */
  private hooked = 0;
  /** The save's pearls and boat parts, for the next part's progress. */
  private save: PartSave | null = null;

  constructor(private readonly el: HTMLElement, private readonly tag: HTMLElement) {}

  /**
   * The save's pearls and boat parts as they stand. Returns the next boat part's name when these pearls are the ones
   * that made it ready, so the game can say so once.
   */
  boat(s: PartSave): string | null {
    const before = this.save;
    if (before && before.pearls === s.pearls && before.boatParts === s.boatParts) return null;
    this.save = { pearls: s.pearls, boatParts: s.boatParts };
    if (this.view) this.render();
    const was = before && before.boatParts === s.boatParts ? partProgress(before) : null;
    const now = partProgress(s);
    return was && now && !was.ready && now.ready ? now.name : null;
  }

  /** A new charter state; a fish's line cost and pearls show for a few seconds. */
  set(v: DiveView | null): void {
    const before = this.view;
    this.view = v;
    this.hooked = 0;
    if (v?.cost && (!before || before.line !== v.line)) this.costUntil = performance.now() + COST_MS;
    if (v && before && v.tally.landed === before.tally.landed + 1) {
      this.gain = v.gain ?? 0;
      this.gainUntil = this.gain > 0 ? performance.now() + GAIN_MS : 0;
    }
    this.render();
  }

  /** A fish is hooked: its line goes now, as the fight starts, so the bar and the number show what the fight will cost. */
  hook(): void {
    const v = this.view;
    if (!v || v.state !== 'fishing') return;
    this.hooked = Math.min(v.line, v.fishLine);
    this.render();
  }

  private render(): void {
    const v = this.view;
    this.el.classList.toggle('hidden', !v);
    if (!v) return this.fight(null);
    const now = performance.now();
    const cost = this.hooked || (now < this.costUntil ? v.cost ?? 0 : 0);
    const gaining = now < this.gainUntil;
    // The line and the boat part's bars slide from where they were to where they are now.
    const dom = typeof this.el.querySelector === 'function';
    const BARS = ['.bar i', '.pbar i'];
    const prev = BARS.map((q) => (dom ? this.el.querySelector<HTMLElement>(q)?.style.width : undefined));
    this.el.innerHTML = hudHtml(v, { hooked: this.hooked, cost, gain: gaining ? this.gain : 0 }, this.save);
    BARS.forEach((q, i) => {
      const bar = dom ? this.el.querySelector<HTMLElement>(q) : null;
      const from = prev[i];
      if (!bar || !from || from === bar.style.width) return;
      const to = bar.style.width;
      bar.style.width = from;
      void bar.offsetWidth;
      bar.style.width = to;
    });
    clearTimeout(this.timer);
    const due = Math.max(!this.hooked && now < this.costUntil ? this.costUntil : 0, gaining ? this.gainUntil : 0);
    if (due) this.timer = window.setTimeout(() => this.render(), due - now + 20);
  }

  /** Shows the hooked fish's sticker: the zone's rating for the rod, red only when it's too much. */
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
  /** The zone's rating for the rod in words ("Tough for your rod"), and whether it's too much. */
  match: string;
  too: boolean;
}

/** The sticker for the whole fight: the fish's pull and behaviour (both off for now), and the zone's rating with the rod. */
export function fishTagHtml(f: SeaFightTag): string {
  const parts = [f.pull === 'strong' ? '💪 Strong' : f.pull === 'light' ? '🪶 Light' : '', f.b ? `${BEHAVIOUR_ICON[f.b]} ${BEHAVIOURS[f.b].name}` : ''].filter(Boolean);
  const hint = f.match ? f.match.toLowerCase() : f.b ? BEHAVIOURS[f.b].hint.toLowerCase() : '';
  if (!parts.length) return f.match;
  return `${parts.join(' · ')}${hint ? ` <span>· ${hint}</span>` : ''}`;
}

/** What Reed's panel reads from the save. */
export interface ReedSave {
  level: number;
  coins: number;
  pearls: number;
  seaRod: boolean;
  rodStep: number;
  abyssLevels: number;
  boatParts: number;
  abyssRecord: number;
  /** Shiny Lure casts held, and whether they're switched off (saved for later). */
  lure: number;
  lureOff: boolean;
}

const rodOf = (s: Pick<ReedSave, 'rodStep' | 'abyssLevels'>): SeaRod => ({ steps: s.rodStep, levels: s.abyssLevels });

/** The furthest Abyss marker a charter can start at (at least 1). */
export const reedMarker = (s: Pick<ReedSave, 'abyssRecord'>): number => Math.max(1, s.abyssRecord);

/** The Abyss marker Reed's panel shows: the one picked if it's reachable, else the furthest the rod rates Easy or Fair (at least 1). */
export function reedMarkerPick(s: Pick<ReedSave, 'abyssRecord' | 'rodStep' | 'abyssLevels'>, picked: number | null): number {
  const top = reedMarker(s);
  if (picked !== null) return Math.max(1, Math.min(top, picked));
  const r = rodOf(s);
  for (let m = top; m > 1; m--) {
    const g = seaRating(ABYSS, m, r);
    if (g === 'easy' || g === 'fair') return m;
  }
  return 1;
}

/** The zone Reed's panel starts on: the one picked if it's open, else the furthest open zone the rod rates Easy or Fair, else the furthest open one. */
export function reedZone(s: Pick<ReedSave, 'boatParts' | 'rodStep' | 'abyssLevels'>, picked: number | null): number {
  if (picked !== null && zoneOpen(s, picked)) return picked;
  const far = Math.min(s.boatParts, ZONES.length - 1);
  const r = rodOf(s);
  for (let z = far; z >= 0; z--) {
    const g = seaRating(z, z === ABYSS ? 1 : 0, r);
    if (g === 'easy' || g === 'fair') return z;
  }
  return far;
}

/** How many fish one spool lasts at this line cost. */
export const fishPerSpool = (cost: number): number => Math.floor(LINE.spool / cost);

/** Shiny Lures come up on Reed's chart once this zone is open: the first two zones pass quickly without them. */
const LURE_ZONE = ZONES.findIndex((z) => z.id === 'kelp');

/** How many charters the next boat part is, fishing one zone: plain, and with a Shiny Lure on every cast. */
export interface PartCharters {
  part: string;
  plain: number;
  lured: number;
}

/**
 * The charters still to fish for the next boat part in this zone (and Abyss marker), each one spool: the pearls still
 * needed over what a spool pays here for this rod, rounded up. A spool pays the fish it lasts (`fishPerSpool`) times a
 * fish's average pearls (`averagePearls`, every fish shiny when lured). Null with the boat fully fitted, the part
 * already ready to fit, or the zone Too much for the rod.
 */
export function chartersToPart(s: Pick<ReedSave, 'pearls' | 'boatParts' | 'rodStep' | 'abyssLevels'>, zone: number, marker: number): PartCharters | null {
  const p = partProgress(s);
  if (!p || p.ready) return null;
  const r = rodOf(s);
  const m = zone === ABYSS ? marker : 0;
  if (seaRating(zone, m, r) === 'over') return null;
  const fish = fishPerSpool(lineCost(zone, m, r));
  const left = p.need - p.have;
  // A hair under, so a spool that pays exactly what's left reads as that many charters and not one more.
  const count = (lured: boolean) => Math.max(1, Math.ceil(left / (fish * averagePearls(zone, m, lured)) - 1e-9));
  return { part: p.name, plain: count(false), lured: count(true) };
}

/**
 * Reed's line under the boat part's bar: "About 12 charters to the Deep lamps · about 3 with Shiny Lures". The lured
 * half once Kelp Deep is open, and only when it's fewer. Empty when `chartersToPart` has nothing to say.
 */
export function chartersText(s: Pick<ReedSave, 'pearls' | 'boatParts' | 'rodStep' | 'abyssLevels'>, zone: number, marker: number): string {
  const c = chartersToPart(s, zone, marker);
  if (!c) return '';
  const lured = zoneOpen(s, LURE_ZONE) && c.lured < c.plain ? ` · about ${num(c.lured)} with Shiny Lures` : '';
  return `About ${plural(c.plain, 'charter')} to the ${c.part}${lured}`;
}

/**
 * Reed's row for the Shiny Lures held, with the same on/off switch as the Bag's (`data-act="lure"`). Holding none, a
 * quiet hint once Kelp Deep is open, else nothing.
 */
export function lureRowHtml(s: Pick<ReedSave, 'lure' | 'lureOff' | 'boatParts'>): string {
  if (s.lure <= 0) {
    return zoneOpen(s, LURE_ZONE)
      ? '<div class="row quiet"><div>✨ Shiny Lures from the Prize Counter work out here: every fish a shiny, five times the coins and Black Pearls.</div></div>'
      : '';
  }
  const on = !s.lureOff;
  return `<div class="row lures"><div>✨ ${plural(s.lure, 'Shiny Lure')}<small>${on ? `Every bite is a shiny until ${s.lure === 1 ? 'it runs' : 'they run'} out` : 'Saved for later'}</small></div><button class="perk lure${on ? '' : ' off'}" data-act="lure" aria-pressed="${on}" title="Click to turn ${on ? 'off' : 'on'}"><b>${on ? 'On' : 'Off'}</b><span class="sw"></span></button></div>`;
}

/** What the rod's next purchase changes, in plain words, for the zone it belongs to. */
export function nextRodText(s: Pick<ReedSave, 'rodStep' | 'abyssLevels'>, marker: number): string {
  const r = rodOf(s);
  const b = nextRodBuy(r);
  const after: SeaRod = b.kind === 'step' ? { steps: r.steps + 1, levels: r.levels } : { steps: r.steps, levels: r.levels + 1 };
  const m = b.zone === ABYSS ? marker : 0;
  const was = seaRating(b.zone, m, r);
  const now = seaRating(b.zone, m, after);
  const a = lineCost(b.zone, m, r);
  const z = lineCost(b.zone, m, after);
  const where = b.zone === ABYSS ? `The Abyss at marker ${m}` : ZONES[b.zone].name;
  const rated = was === now ? `stays ${RATING_NAMES[now]}` : `goes from ${RATING_NAMES[was]} to ${RATING_NAMES[now]}`;
  const metres = a === z ? `${z} m a fish` : `${a} m to ${z} m a fish`;
  return `Next ${b.kind === 'step' ? 'step' : 'Abyss level'}: ${where} ${rated}, ${metres}`;
}

/** The rod row's progress: "Deep Sea Rod · step 2 of 8", or "Deep Sea Rod · Abyss level 3". */
export const rodProgress = (s: Pick<ReedSave, 'rodStep' | 'abyssLevels'>): string =>
  `${DEEP_SEA_ROD.name} · ${s.abyssLevels > 0 ? `Abyss level ${s.abyssLevels}` : `step ${s.rodStep} of 8`}`;

/** "Need [coin] 1,240 more", for a button the player can't afford yet. */
const needCoins = (n: number) => `Need ${COIN} ${num(n)} more`;

/** One zone's card on the chart. */
function zoneCard(s: ReedSave, i: number, picked: boolean, marker: number): string {
  const z = ZONES[i];
  const open = zoneOpen(s, i);
  const m = i === ABYSS ? marker : 0;
  const r = rodOf(s);
  const pay = payAt(i, m);
  const cost = lineCost(i, m, r);
  const rating = seaRating(i, m, r);
  const lock = open ? '' : '<span class="lk" title="Locked">🔒</span>';
  const mark = open && picked ? '<span class="lk" title="Where you will fish">⛵</span>' : '';
  const here = i === ABYSS && open ? `<small>Marker ${m}</small>` : '';
  const spool = !open
    ? `<small class="opens">Opens with the ${BOAT_PARTS[i - 1].name}: ${PEARL} ${num(BOAT_PARTS[i - 1].pearls)}</small>`
    : `<small>Spool: ${spoolPrice(i) ? `${COIN} ${num(spoolPrice(i))}` : 'free'}</small>`;
  const body = `<span class="top"><span>${z.name}</span>${lock}${mark}</span>
    <span class="in">${ratePill(rating)}${here}<span class="pay"><span class="amts">${PEARL} ${num(pay.pearls)} · ${COIN} ${num(pay.coins)}</span> <span class="af">a fish</span></span><small>${cost} m a fish · <span class="nb">${fishPerSpool(cost)} fish a spool</span></small>${spool}</span>`;
  const cls = `zcard z${i}`;
  return open
    ? `<button class="${cls}${picked ? ' sel' : ''}" data-act="divefrom" data-id="${i}">${body}</button>`
    : `<div class="${cls} locked">${body}</div>`;
}

/**
 * Captain Reed's panel: the chart of the five zones (a card each, open ones to pick), the rod, the boat's next part
 * and how many charters in the picked zone it is (`chartersText`), the Shiny Lures held (`lureRowHtml`), and the way
 * out to sea. Without the Deep Sea Rod he sells it and says what a charter is. While charters are
 * closed, that his seaplane isn't ready yet.
 */
export function reedHtml(o: { say: string; s: ReedSave; pick: number; open: boolean; marker?: number }): string {
  const { s } = o;
  const rod = DEEP_SEA_ROD;
  if (!o.open) {
    return `<div class="reed"><p class="say">"Still tinkering with the old girl's engine. She'll be flying again soon, I promise."</p>
      <div class="detail"><p><b>Charters are coming soon.</b></p></div>
      <div class="btns"><button class="btn plain" data-act="close">OK</button></div></div>`;
  }
  if (!s.seaRod) {
    const lacks = s.level < rod.unlockLevel ? `Needs level ${rod.unlockLevel}` : s.coins < rod.price ? needCoins(rod.price - s.coins) : '';
    return `<div class="reed"><p class="say">"${o.say}"</p>
      <div class="detail"><p><b>A charter is a day's fishing at sea.</b> Buy a spool of line, land sea fish, keep what they pay.</p>
      <p>It takes the ${rod.name}: ${num(rod.price)} ${COIN}, from level ${rod.unlockLevel}. It stays on my boat between charters.</p></div>
      <div class="btns"><button class="btn plain" data-act="close">Not now</button>${
        lacks ? `<button class="btn off" disabled data-act="buysearod"><span>${lacks}</span></button>` : `<button class="btn ok" data-act="buysearod"><span>Buy the ${rod.name}</span><small>${num(rod.price)} ${COIN}</small></button>`
      }</div></div>`;
  }
  const r = rodOf(s);
  const marker = o.marker ?? reedMarkerPick(s, null);
  const cards = ZONES.map((_, i) => zoneCard(s, i, i === o.pick, marker)).join('');
  const abyss = zoneOpen(s, ABYSS)
    ? (() => {
        const top = reedMarker(s);
        const pay = payAt(ABYSS, marker);
        return `<div class="mstep"><span class="lab">Abyss start</span><button class="step" data-act="markerdown"${marker <= 1 ? ' disabled' : ''} aria-label="Lower marker">−</button><b>Marker ${marker}</b><button class="step" data-act="markerup"${marker >= top ? ' disabled' : ''} aria-label="Higher marker">+</button><span class="of">of ${top} reached</span><span class="pay">${PEARL} ${num(pay.pearls)} · ${COIN} ${num(pay.coins)} a fish</span>${ratePill(seaRating(ABYSS, marker, r))}</div>`;
      })()
    : '';
  const buy = nextRodBuy(r);
  const onSale = buy.kind === 'level' || zoneOpen(s, buy.zone);
  const rodBtn = !onSale
    ? `<button class="btn off" disabled>On sale when ${ZONES[buy.zone].name} opens</button>`
    : s.coins < buy.coins
      ? `<button class="btn off" disabled><span>${needCoins(buy.coins - s.coins)}</span><small>of ${num(buy.coins)}</small></button>`
      : `<button class="btn ok" data-act="${buy.kind === 'step' ? 'rodstep' : 'abysslevel'}"><span>Upgrade</span><small>${COIN} ${num(buy.coins)}</small></button>`;
  const part = partProgress(s);
  const far = chartersText(s, o.pick, marker);
  const partRow = part
    ? `<div class="row"><div>⛵ Next boat part: ${part.name}<small>Opens ${lower(ZONES[part.zone].name)}</small><span class="prog">${partBar(part)}</span>${far ? `<small class="far">${far}</small>` : ''}</div>${
        part.ready
          ? `<button class="btn ok" data-act="boatpart"><span>Fit it</span><small>${PEARL} ${num(part.need)}</small></button>`
          : `<button class="btn off" disabled><span>${PEARL} ${num(part.need - part.have)} to go</span></button>`
      }</div>`
    : `<div class="row"><div>⛵ The boat is fully fitted<small>Every zone is open · ${PEARL} ${num(s.pearls)} Black Pearls</small></div></div>`;
  const price = spoolPrice(o.pick);
  const go = s.coins >= price
    ? `<button class="btn ok" data-act="castoff" data-id="${o.pick}"><span>⚓ Cast off to ${lower(ZONES[o.pick].name)}</span><small>one spool · ${price ? `${num(price)} coins` : 'free'}</small></button>`
    : `<button class="btn off" disabled><span>${needCoins(price - s.coins)}</span><small>for the spool</small></button>`;
  return `<div class="reed"><p class="say">"${o.say}"</p>
    <div class="zcards">${cards}</div>${abyss}
    <div class="rows"><div class="row"><div>🎣 ${rodProgress(s)}<small>${nextRodText(s, marker)}</small></div>${rodBtn}</div>${partRow}${lureRowHtml(s)}</div>
    <div class="btns"><button class="btn plain" data-act="close">Not now</button>${go}</div>
    <div class="foot"><span>${COIN} ${num(s.coins)} coins</span></div></div>`;
}

/** What the spool's-out card needs of the save: the coins and pearls on hand, and the rod and boat as they stand. */
export type OutSave = Pick<ReedSave, 'coins' | 'pearls' | 'rodStep' | 'abyssLevels' | 'boatParts'>;

/** The next boat part's row on the cards after fishing: its progress, or that Captain Reed can fit it. Nothing with the boat fully fitted. */
function partRowHtml(s: PartSave | null): string {
  const p = s ? partProgress(s) : null;
  if (!p) return '';
  return `<div class="row part${p.ready ? ' ready' : ''}"><span>⛵ ${p.name}${p.ready ? '<small>Ready: see Captain Reed</small>' : ''}</span><span class="prog">${partBar(p)}</span></div>`;
}

/** The cards' row for the shiny fish a charter has landed; nothing before the first. */
const shinyRowHtml = ({ shiny = 0 }: { shiny?: number }): string => (shiny > 0 ? `<div class="row">✨ Shiny fish <b>${num(shiny)}</b></div>` : '');

/** The hint on the spool's-out card: when the zone isn't Easy and the next rod purchase is on sale and would cut the line a fish uses. */
export function outHint(v: DiveView, s: OutSave): string {
  if (v.rating === 'easy') return '';
  const r = rodOf(s);
  const b = nextRodBuy(r);
  if (b.kind === 'step' && !zoneOpen(s, b.zone)) return '';
  const after: SeaRod = b.kind === 'step' ? { steps: r.steps + 1, levels: r.levels } : { steps: r.steps, levels: r.levels + 1 };
  const z = lineCost(v.zone, v.marker, after);
  if (z >= v.fishLine) return '';
  return `${RATING_NAMES[v.rating]} for your rod: ${v.fishLine} m a fish. The next ${b.kind === 'step' ? 'rod step' : 'Abyss level'} makes it ${z} m.`;
}

/** The spool's out: coins and pearls so far, and another spool at the zone's price, or head home. */
export function outHtml(v: DiveView, s: OutSave): string {
  const t = v.tally;
  const hint = outHint(v, s);
  const spool = s.coins >= v.spool
    ? `<button class="btn ok" data-act="spool"><span><kbd>1</kbd>Another spool</span><small>${v.spool ? `${COIN} ${num(v.spool)}` : 'free'}</small></button>`
    : `<button class="btn off" disabled><span>${needCoins(v.spool - s.coins)}</span><small>for another spool</small></button>`;
  return `<div class="dcard"><h2>Spool's out</h2>
    <div class="sub">${plural(t.landed, 'fish', 'fish')} landed · ${t.lost} got away</div>
    <div class="big">${PEARL}+${num(t.pearls)}</div>
    <div class="rows">
      ${shinyRowHtml(t)}
      <div class="row">Coins from fish <b>${COIN} ${signed(t.coins)}</b></div>
      <div class="row">Line · ${plural(t.spools, 'spool')} <b>${t.spoolCoins ? `${COIN} ${signed(-t.spoolCoins)}` : 'free'}</b></div>
      ${partRowHtml(s)}
    </div>
    ${hint ? `<p class="note">${hint}</p>` : ''}
    <div class="btns"><button class="btn plain" data-act="headhome"><span><kbd>2</kbd>Head home</span></button>${spool}</div></div>`;
}

/** Heading home asks once, since the line left on the spool isn't refunded. Nothing else is lost. */
export function headHomeHtml(v: DiveView): string {
  return `<div class="dcard"><h2 class="blue">Head home?</h2>
    <div class="sub">${whereText(v.zone, v.marker)}</div>
    <p class="note">You have ${Math.floor(v.line)} m of line left. It isn't refunded.</p>
    <div class="btns"><button class="btn plain" data-act="close">Stay out</button><button class="btn ok" data-act="headhome">Head home</button></div></div>`;
}

/**
 * The card after a charter: where it ended, what it caught and what it came to, and how far along the next boat part
 * is (`s`). `record`: it reached a new furthest Abyss marker.
 */
export function endHtml(e: DiveEnd, record = false, s: PartSave | null = null): string {
  const t = e.tally;
  const title = e.why === 'away' ? 'The charter ended' : 'Home safe!';
  const why = e.why === 'away' ? `<div class="why">The boat waited ${Math.round(DIVE.holdMs / 60000)} minutes for you, then turned back.</div>` : '';
  const net = t.coins - t.spoolCoins;
  return `<div class="dcard"><h2>${title}</h2>
    <div class="sub">${whereText(e.zone, e.marker)}</div>
    ${record && e.zone === ABYSS ? '<span class="ribbon gold">★ New record</span>' : ''}
    ${why}
    <div class="big">${PEARL}+${num(t.pearls)}</div>
    <div class="rows">
      <div class="row">Fish landed <b>${num(t.landed)}</b></div>
      ${shinyRowHtml(t)}
      <div class="row">Fish that got away <b>${num(t.lost)}</b></div>
      <div class="row">Coins from fish <b>${COIN} ${signed(t.coins)}</b></div>
      <div class="row">Line · ${plural(t.spools, 'spool')} <b>${t.spoolCoins ? `${COIN} ${signed(-t.spoolCoins)}` : 'free'}</b></div>
      <div class="row net">Net coins <b>${COIN} ${signed(net)}</b></div>
      ${partRowHtml(s)}
    </div>
    <div class="btns"><button class="btn" data-act="close">OK</button></div></div>`;
}
