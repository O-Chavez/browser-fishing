/**
 * Fireworks at Anglers' Rest (GAME_DESIGN.md §41): Bram Tinder sells three rockets at Bram's Kettle, a player lights
 * one at the rack on the rocket jetty's end, and it goes up over the open lake for everyone on the map. One is in the
 * sky at a time. This file is the data and the rules both the client and the server use: the rockets and their
 * prices, the bag's stacks, and the show itself, which is worked out from the rocket's kind and a seed alone
 * (`rocketShow`, `emitShow`), so every player's screen draws the same bursts once the server has sent the seed and the
 * moment it was lit on its clock. Every name, price, colour, size and time here is a default. Play-test: all of it.
 */

export const ROCKET_IDS = ['small', 'big', 'finale'] as const;
export type RocketId = (typeof ROCKET_IDS)[number];

export interface RocketDef {
  id: RocketId;
  name: string;
  /** Coins at Bram's Kettle. */
  price: number;
  /** How long the rocket holds the sky, from the fuse to the last spark (s): the rack is busy for everyone until then. */
  seconds: number;
  icon: string;
  /** The tile's colour in the shop and the Bag (a tier's, `--t1` to `--t5`). */
  tier: number;
  /** What it does, for the shop's panel. */
  blurb: string;
}

export const ROCKETS: RocketDef[] = [
  { id: 'small', name: 'Small Rocket', price: 250, seconds: 2.5, icon: '🧨', tier: 2, blurb: 'Climbs with a trail of sparks and makes one round burst.' },
  { id: 'big', name: 'Big Rocket', price: 2000, seconds: 5, icon: '🚀', tier: 4, blurb: 'Climbs higher and makes three bursts in two colours, with a crackle.' },
  { id: 'finale', name: 'Grand Finale', price: 50000, seconds: 12, icon: '🎆', tier: 5, blurb: 'A volley of bursts in many colours that ends in a great gold willow. Everyone at the lake is told who lit it.' },
];

export const rocketById = (id: unknown): RocketDef | undefined => ROCKETS.find((r) => r.id === id);

/** The most of one kind a bag holds. */
export const ROCKET_STACK = 99;
/** How near the rack a player lights a rocket from (m), and how near the stall's middle they buy one (the server's checks). */
export const RACK_RANGE = 3;
export const STALL_RANGE = 5;
/** What the rack's prompt reads: with a rocket in the bag, with none, and while one is in the sky. */
export const RACK_PROMPT = { light: 'Light a rocket', none: "Rockets at Bram's Kettle", busy: 'Wait for the sky' };
/** How near the rack its prompt shows (m). */
export const RACK_REACH = 2.4;

/**
 * What the rack on the jetty's end offers a player standing at (`x`, `z`), or null out of reach: "Light a rocket"
 * with one in the bag (`kinds` says which: one kind is lit straight away, more are picked from a card), and a line
 * that only tells with none, or while a rocket is still in the sky (`busy`). `face` is the way the player must look
 * for it to show, toward the rack; `d` ranks it among the other prompts in reach.
 */
export function rackPrompt(rack: { x: number; z: number }, x: number, z: number, s: { rockets: RocketBag }, busy: boolean): { state: 'light' | 'none' | 'busy'; label: string; kinds: RocketId[]; face: number; d: number } | null {
  const d = Math.hypot(rack.x - x, rack.z - z);
  if (d > RACK_REACH) return null;
  const kinds = rocketKinds(s);
  const state = busy ? 'busy' : kinds.length ? 'light' : 'none';
  return { state, label: RACK_PROMPT[state], kinds, face: Math.atan2(x - rack.x, z - rack.z), d: d - 1 };
}

/** The rockets in a bag: how many of each kind. A kind with none has no entry. */
export type RocketBag = Partial<Record<RocketId, number>>;
/** The part of a save the rocket rules touch. */
interface Purse { coins: number; rockets: RocketBag }

export const rocketCount = (s: { rockets: RocketBag }, id: RocketId): number => s.rockets[id] ?? 0;
/** The kinds in the bag, small to big. */
export const rocketKinds = (s: { rockets: RocketBag }): RocketId[] => ROCKET_IDS.filter((id) => rocketCount(s, id) > 0);

/** Why a rocket can't be bought, or null: not enough coins, or the bag's stack is full. */
export function rocketBuyError(s: Purse, id: unknown): string | null {
  const r = rocketById(id);
  if (!r) return 'Bram has no such rocket.';
  if (rocketCount(s, r.id) >= ROCKET_STACK) return `Your bag is full of ${r.name}s.`;
  if (s.coins < r.price) return `Not enough coins (${r.price.toLocaleString()} 🪙).`;
  return null;
}

/** Buys one rocket into the bag for its price. False (and nothing changed) when `rocketBuyError` says why not. */
export function buyRocket(s: Purse, id: unknown): boolean {
  const r = rocketById(id);
  if (!r || rocketBuyError(s, id)) return false;
  s.coins -= r.price;
  s.rockets[r.id] = rocketCount(s, r.id) + 1;
  return true;
}

/** Takes one rocket of a kind out of the bag. False when there is none. */
export function spendRocket(s: { rockets: RocketBag }, id: unknown): boolean {
  const r = rocketById(id);
  if (!r || rocketCount(s, r.id) <= 0) return false;
  const left = rocketCount(s, r.id) - 1;
  if (left > 0) s.rockets[r.id] = left;
  else delete s.rockets[r.id];
  return true;
}

/** A saved bag of rockets made safe: known kinds only, whole counts from 1 to `ROCKET_STACK`. A save from before rockets has none. */
export function cleanRockets(raw: unknown): RocketBag {
  const out: RocketBag = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ROCKET_IDS) {
    const n = (raw as Record<string, unknown>)[id];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) out[id] = Math.min(ROCKET_STACK, Math.floor(n));
  }
  return out;
}

/** A rocket in the sky: its kind, the seed its bursts come from, when it was lit on the server's clock (ms), and who lit it. */
export interface RocketUp { kind: RocketId; seed: number; at: number; by: number; name: string }
/** Whether a rocket lit at `up.at` still holds the sky at `now` (both on the server's clock). */
export const skyBusy = (up: Pick<RocketUp, 'kind' | 'at'> | null, now: number): boolean => !!up && now < up.at + (rocketById(up.kind)?.seconds ?? 0) * 1000;
/** The line everyone on the map reads when a Grand Finale goes up. */
export const finaleLine = (name: string): string => `🎆 ${name} lit a ${ROCKETS[2].name}!`;

// ---------- the show ----------

/**
 * Where a rocket leaves the rack, in the town map's own coordinates: over the rack at the rocket jetty's end
 * (`CAMP.rack`, src/data/maps.ts; rockets.test.ts holds the two together).
 */
export const LAUNCH = { x: 18.89, y: 1.75, z: -11.95 };
/**
 * The way the rockets lean: from the rack toward the middle of the lake (north-west of the jetty; the lake's far
 * shore is 30 to 40 m off, so a rocket that flew straight out from the jetty's end would burst over the trees).
 * `OUT` is that way along the ground, a metre long, and `ACROSS` is square to it; `over(out, side)` is the spot that
 * far out from the rack and that far to the side.
 */
const LAKE_MIDDLE = { x: 4, z: -30 };
const TO_LAKE = Math.hypot(LAKE_MIDDLE.x - LAUNCH.x, LAKE_MIDDLE.z - LAUNCH.z);
export const OUT = { x: (LAKE_MIDDLE.x - LAUNCH.x) / TO_LAKE, z: (LAKE_MIDDLE.z - LAUNCH.z) / TO_LAKE };
export const ACROSS = { x: -OUT.z, z: OUT.x };
const over = (out: number, side: number): { x: number; z: number } => ({ x: LAUNCH.x + OUT.x * out + ACROSS.x * side, z: LAUNCH.z + OUT.z * out + ACROSS.z * side });

export type Rgb = readonly [number, number, number];
const hex = (c: number): Rgb => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
/** The bursts' colours, as drawn (no tone mapping). The willow is always `GOLD`. */
export const COLOURS = {
  red: hex(0xff4a3d),
  orange: hex(0xff8a2e),
  gold: hex(0xffc247),
  green: hex(0x5dff72),
  cyan: hex(0x4ff0e6),
  blue: hex(0x4f9bff),
  violet: hex(0xb974ff),
  pink: hex(0xff6fc4),
  silver: hex(0xe6efff),
} as const;
export type ColourId = keyof typeof COLOURS;
const BRIGHTS: ColourId[] = ['red', 'green', 'blue', 'violet', 'pink', 'cyan', 'orange', 'gold'];
/** The sparks a climbing rocket sheds, and the crackle's flecks. */
const SPARK: Rgb = hex(0xffb65a);
const FLECK: Rgb = hex(0xfff1c9);
const SMOKE: Rgb = hex(0xb9b4ae);

/**
 * A burst's shape. `round`: a ball of stars. `double`: a ball with a smaller ball of a second colour inside it.
 * `ring`: a tilted ring round a small core. `willow`: long gold stars that hang and droop, each leaving a trail.
 */
export type BurstStyle = 'round' | 'double' | 'ring' | 'willow';
export interface Burst {
  /** Seconds after the rocket was lit. */
  t: number;
  x: number;
  y: number;
  z: number;
  /** How far its stars fly (m). */
  r: number;
  style: BurstStyle;
  colour: ColourId;
  /** The second colour of a `double`, and of a `ring`'s core. */
  inner?: ColourId;
  /** Flecks that pop inside it as it fades. */
  crackle: boolean;
}
/** A rocket (or a star thrown from a burst) on its way up: from one point to another in `rise` seconds, shedding sparks. */
export interface Climb { t: number; from: readonly [number, number, number]; to: readonly [number, number, number]; rise: number }
export interface Show { kind: RocketId; seed: number; seconds: number; climbs: Climb[]; bursts: Burst[] }

/** Small seeded random numbers (mulberry32): the same seed gives the same show on every machine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sizes of the three shows: heights and distances in metres, times in seconds. */
export const SHOW = {
  small: { rise: 1.0, height: 22, out: 15, r: 9 },
  big: { rise: 1.45, height: 34, out: 24, r: 14, next: [0.65, 1.25], nextR: 10.5, spread: 12 },
  finale: {
    /** The volley's bursts, the willow not counted: 9 to 11 of them, so 10 to 12 bursts with it. */
    min: 9, more: 3,
    first: 1.25, last: 8.3,
    height: [25, 40], out: [18, 34], side: 13, r: [11, 16], rise: [1.15, 1.5],
    willow: { t: 9.25, rise: 1.55, height: 41, out: 27, r: 21 },
  },
} as const;

/** The bursts and climbs of one rocket of `kind`, from `seed` alone. */
export function rocketShow(kind: RocketId, seed: number): Show {
  const rng = seeded(seed ^ (kind === 'small' ? 0x1111 : kind === 'big' ? 0x2222 : 0x3333));
  const range = (a: number, b: number) => a + (b - a) * rng();
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];
  const other = (c: ColourId): ColourId => pick(BRIGHTS.filter((x) => x !== c));
  const from: [number, number, number] = [LAUNCH.x, LAUNCH.y, LAUNCH.z];
  const climbs: Climb[] = [];
  const bursts: Burst[] = [];
  const def = rocketById(kind)!;
  if (kind === 'small') {
    const s = SHOW.small;
    const b: Burst = { t: s.rise, ...over(s.out, range(-2, 2)), y: s.height + range(-1, 1), r: s.r, style: 'round', colour: pick(BRIGHTS), crackle: false };
    climbs.push({ t: 0, from, to: [b.x, b.y, b.z], rise: s.rise });
    bursts.push(b);
  } else if (kind === 'big') {
    const s = SHOW.big;
    const a = pick(BRIGHTS);
    const second = other(a);
    const main: Burst = { t: s.rise, ...over(s.out, range(-3, 3)), y: s.height + range(-1.5, 1.5), r: s.r, style: 'round', colour: a, crackle: true };
    climbs.push({ t: 0, from, to: [main.x, main.y, main.z], rise: s.rise });
    bursts.push(main);
    // Two stars thrown from the first burst, one to each side, burst in turn: the second colour, then the first again.
    const left = rng() < 0.5 ? -1 : 1;
    s.next.forEach((dt, i) => {
      const side = (i ? -left : left) * (s.spread + range(-1, 1));
      const along = range(-3, 3);
      const b: Burst = { t: main.t + dt, x: main.x + ACROSS.x * side + OUT.x * along, y: main.y + range(-3, 2.5), z: main.z + ACROSS.z * side + OUT.z * along, r: s.nextR, style: 'round', colour: i ? a : second, crackle: true };
      climbs.push({ t: main.t + 0.05, from: [main.x, main.y, main.z], to: [b.x, b.y, b.z], rise: dt - 0.05 });
      bursts.push(b);
    });
  } else {
    const s = SHOW.finale;
    const n = s.min + Math.floor(rng() * s.more);
    let last: ColourId = 'gold';
    for (let i = 0; i < n; i++) {
      const colour = (last = other(last));
      const style: BurstStyle = pick(['round', 'round', 'double', 'ring'] as const);
      // Side to side across the sky in turn, so the volley fills it and two bursts in a row don't sit on each other.
      const side = (i % 2 ? 1 : -1) * range(0.25, 1) * s.side;
      const b: Burst = {
        t: s.first + (i * (s.last - s.first)) / (n - 1) + range(-0.1, 0.1),
        ...over(range(s.out[0], s.out[1]), side), y: range(s.height[0], s.height[1]),
        r: range(s.r[0], s.r[1]), style, colour,
        ...(style !== 'round' ? { inner: other(colour) } : {}),
        crackle: i % 3 === 2,
      };
      const rise = Math.min(range(s.rise[0], s.rise[1]), b.t);
      climbs.push({ t: b.t - rise, from, to: [b.x, b.y, b.z], rise });
      bursts.push(b);
    }
    const w = s.willow;
    const b: Burst = { t: w.t, ...over(w.out, range(-2, 2)), y: w.height, r: w.r, style: 'willow', colour: 'gold', crackle: false };
    climbs.push({ t: w.t - w.rise, from, to: [b.x, b.y, b.z], rise: w.rise });
    bursts.push(b);
  }
  return { kind, seed, seconds: def.seconds, climbs, bursts };
}

// ---------- the particles ----------

/** The most particles one show may use: the size of the buffers the client draws from (`Fireworks`, src/game/fireworks.ts). */
export const PARTICLE_BUDGET = 4096;
/** What a particle is drawn as: a streak of light, one that flickers, a burst's flash, or a puff of smoke. */
export const STYLE = { spark: 0, twinkle: 1, flash: 2, smoke: 3 } as const;

/**
 * One particle of a show. It is born `t0` seconds after the rocket was lit at (`x`, `y`, `z`) moving at (`vx`, `vy`,
 * `vz`) m/s, slowed by `drag` (per second) and pulled down by `grav` (m/s²), and is gone `life` seconds later; where
 * it is in between is `particleAt`, the same sum the client's shader does.
 */
export interface Particle {
  t0: number; life: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  drag: number; grav: number;
  r: number; g: number; b: number;
  /** Half the width of its glow (m), and how long a tail it draws (s of its own path). */
  size: number; streak: number;
  style: number;
  /** 0 to 1, for a twinkle's flicker. */
  seed: number;
}

const blank = (): Particle => ({ t0: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, drag: 1, grav: 0, r: 1, g: 1, b: 1, size: 0.3, streak: 0, style: 0, seed: 0 });

/** Where a particle is `tau` seconds after it was born: `out` gets (x, y, z). */
export function particleAt(p: Particle, tau: number, out: [number, number, number]): [number, number, number] {
  const k = p.drag;
  const e = (1 - Math.exp(-k * tau)) / k;
  const fall = -p.grav / k;
  out[0] = p.x + p.vx * e;
  out[1] = p.y + (p.vy - fall) * e + fall * tau;
  out[2] = p.z + p.vz * e;
  return out;
}

/** The speed that carries a particle from `from` to `to` in `rise` seconds under `drag` and `grav`: `out` gets (vx, vy, vz). */
function speedTo(from: readonly number[], to: readonly number[], rise: number, drag: number, grav: number, out: [number, number, number]): void {
  const e = (1 - Math.exp(-drag * rise)) / drag;
  const fall = -grav / drag;
  out[0] = (to[0] - from[0]) / e;
  out[1] = (to[1] - from[1] - fall * rise) / e + fall;
  out[2] = (to[2] - from[2]) / e;
}

const CLIMB = { drag: 0.9, grav: 5 };
const STAR = { drag: 2.2, grav: 3.6 };
const WILLOW = { drag: 0.85, grav: 6, stars: 170, trail: 6 };

/**
 * Every particle of a show, in a fixed order, each handed to `put` (the same object every time: copy what you keep).
 * Returns how many there were. It never hands over more than `PARTICLE_BUDGET`, and a particle that would outlast the
 * show is cut short at its end, so the sky is empty when the rack frees up.
 */
export function emitShow(show: Show, put: (p: Particle) => void): number {
  const rng = seeded(show.seed ^ 0x9e3779b9);
  const range = (a: number, b: number) => a + (b - a) * rng();
  const p = blank();
  const v: [number, number, number] = [0, 0, 0];
  const at: [number, number, number] = [0, 0, 0];
  let n = 0;
  const send = (): void => {
    p.life = Math.min(p.life, show.seconds - p.t0);
    if (n >= PARTICLE_BUDGET || p.life <= 0.02) return;
    n++;
    put(p);
  };
  const colour = (c: Rgb, k = 1): void => {
    p.r = c[0] * k;
    p.g = c[1] * k;
    p.b = c[2] * k;
  };
  /** A direction spread evenly over the sphere, `speed` long. */
  const ball = (speed: number): void => {
    const u = range(-1, 1);
    const a = range(0, Math.PI * 2);
    const s = Math.sqrt(1 - u * u) * speed;
    p.vx = s * Math.cos(a);
    p.vy = u * speed;
    p.vz = s * Math.sin(a);
  };

  for (const c of show.climbs) {
    // The rocket's head, bright and streaked, and the sparks it sheds along its way.
    speedTo(c.from, c.to, c.rise, CLIMB.drag, CLIMB.grav, v);
    Object.assign(p, { t0: c.t, life: c.rise, x: c.from[0], y: c.from[1], z: c.from[2], vx: v[0], vy: v[1], vz: v[2], drag: CLIMB.drag, grav: CLIMB.grav, size: 0.24, streak: 0.04, style: STYLE.spark, seed: rng() });
    colour(SPARK);
    send();
    const head = { ...p };
    const sparks = Math.round(14 + c.rise * 12);
    for (let i = 0; i < sparks; i++) {
      const tau = ((i + rng()) / sparks) * c.rise;
      particleAt(head, tau, at);
      Object.assign(p, { t0: c.t + tau, life: range(0.3, 0.65), x: at[0], y: at[1], z: at[2], vx: range(-0.9, 0.9), vy: range(-2.2, -0.4), vz: range(-0.9, 0.9), drag: 1.6, grav: 2.5, size: range(0.2, 0.32), streak: 0.06, style: STYLE.twinkle, seed: rng() });
      colour(SPARK, range(0.7, 1));
      send();
    }
  }

  for (const b of show.bursts) {
    const main = COLOURS[b.colour];
    const inner = COLOURS[b.inner ?? b.colour];
    const willow = b.style === 'willow';
    // The flash as it bursts, and smoke that hangs where it was.
    Object.assign(p, { t0: b.t, life: willow ? 1.6 : 1.0, x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: 0, drag: 1, grav: 0, size: b.r * (willow ? 1.3 : 1.6), streak: 0, style: STYLE.flash, seed: rng() });
    colour(main);
    send();
    for (let i = 0; i < 3; i++) {
      Object.assign(p, { t0: b.t + 0.08, life: range(2.2, 3.2), x: b.x + range(-0.3, 0.3) * b.r, y: b.y + range(-0.25, 0.25) * b.r, z: b.z + range(-0.3, 0.3) * b.r, vx: range(-0.4, 0.4), vy: range(0.1, 0.5), vz: range(-0.4, 0.4), drag: 1, grav: 0, size: b.r * range(0.4, 0.55), streak: 0, style: STYLE.smoke, seed: rng() });
      colour(SMOKE);
      send();
    }
    if (willow) {
      for (let i = 0; i < WILLOW.stars; i++) {
        ball(b.r * WILLOW.drag * range(0.82, 1.02));
        // A willow's stars leave upward and outward more than down, so its crown is round and its skirts long.
        p.vy = p.vy * 0.8 + b.r * 0.25;
        Object.assign(p, { t0: b.t, life: range(2.3, 2.75), x: b.x, y: b.y, z: b.z, drag: WILLOW.drag, grav: WILLOW.grav, size: 0.55, streak: 0.85, style: STYLE.spark, seed: rng() });
        colour(COLOURS.gold);
        send();
        const star = { ...p };
        for (let j = 0; j < WILLOW.trail; j++) {
          const tau = 0.3 + (j + rng()) * 0.33;
          particleAt(star, tau, at);
          Object.assign(p, { t0: b.t + tau, life: range(1.1, 1.7), x: at[0], y: at[1], z: at[2], vx: range(-0.25, 0.25), vy: range(-0.9, -0.2), vz: range(-0.25, 0.25), drag: 1.4, grav: 2.4, size: range(0.34, 0.5), streak: 0.3, style: STYLE.twinkle, seed: rng() });
          colour(COLOURS.gold, range(0.75, 1));
          send();
        }
      }
      continue;
    }
    const speed = b.r * STAR.drag;
    // A volley's bursts hang longer, so two or three are in the sky together, and the big rocket's a little longer than the small one's.
    const hang = show.kind === 'finale' ? 1.3 : show.kind === 'big' ? 1.2 : 1;
    const star = (c: Rgb, k: number, size: number): void => {
      Object.assign(p, { t0: b.t, life: range(1.15, 1.5) * hang, x: b.x, y: b.y, z: b.z, drag: STAR.drag, grav: STAR.grav, size, streak: 0.2, style: STYLE.spark, seed: rng() });
      p.vx *= k;
      p.vy *= k;
      p.vz *= k;
      colour(c);
      send();
    };
    if (b.style === 'ring') {
      // A ring tilted toward the shore, round a small core of the second colour.
      const tilt = range(0.5, 1.0);
      const lean = range(-0.5, 0.5);
      for (let i = 0; i < 80; i++) {
        const a = ((i + rng() * 0.3) / 80) * Math.PI * 2;
        const [cx, cy] = [Math.cos(a) * speed, Math.sin(a) * speed];
        p.vx = cx * Math.cos(lean) - cy * Math.sin(tilt) * Math.sin(lean);
        p.vy = cy * Math.cos(tilt);
        p.vz = cx * Math.sin(lean) + cy * Math.sin(tilt) * Math.cos(lean);
        star(main, range(0.97, 1.03), 0.62);
      }
      for (let i = 0; i < 36; i++) {
        ball(speed);
        star(inner, range(0.3, 0.42), 0.5);
      }
    } else {
      const outer = b.r > 12 ? 140 : 120;
      for (let i = 0; i < outer; i++) {
        ball(speed);
        star(main, range(0.93, 1.03), 0.62);
      }
      const fill = b.style === 'double' ? 48 : 28;
      for (let i = 0; i < fill; i++) {
        ball(speed);
        star(inner, b.style === 'double' ? range(0.48, 0.58) : range(0.35, 0.75), 0.5);
      }
    }
    if (b.crackle) {
      // Flecks that pop all through the ball as its stars fade.
      for (let i = 0; i < 90; i++) {
        ball(b.r * range(0.25, 0.95));
        Object.assign(p, { t0: b.t + range(0.55, 1.75), life: range(0.12, 0.3), x: b.x + p.vx, y: b.y + p.vy - 0.8, z: b.z + p.vz, vx: 0, vy: -0.6, vz: 0, drag: 1, grav: 0, size: range(0.5, 0.78), streak: 0, style: STYLE.twinkle, seed: rng() });
        colour(FLECK);
        send();
      }
    }
  }
  return n;
}

// ---------- the sound ----------

/** One sound of a show: a rocket's whoosh as it leaves, a burst's boom, or a crackle after it. */
export interface ShowSound {
  kind: 'whoosh' | 'boom' | 'crackle';
  /** Seconds after the rocket was lit, and how long it lasts. */
  t: number;
  dur: number;
  /** Where it comes from, for how loud it is to a listener. */
  x: number; y: number; z: number;
  /** 0 to 1: the willow's boom is the biggest. */
  size: number;
}

/** The sounds of a show, in order of time: a whoosh for each rocket leaving the rack, a boom for each burst and a crackle after the ones that have it. */
export function showSounds(show: Show): ShowSound[] {
  const out: ShowSound[] = [];
  for (const c of show.climbs) {
    if (c.from[1] > LAUNCH.y + 0.01) continue;
    out.push({ kind: 'whoosh', t: c.t, dur: c.rise, x: c.from[0], y: c.from[1], z: c.from[2], size: Math.min(1, c.rise / 1.6) });
  }
  for (const b of show.bursts) {
    out.push({ kind: 'boom', t: b.t, dur: b.style === 'willow' ? 1.6 : 0.5 + b.r / 30, x: b.x, y: b.y, z: b.z, size: Math.min(1, b.r / 21) });
    if (b.crackle) out.push({ kind: 'crackle', t: b.t + 0.55, dur: 1.2, x: b.x, y: b.y, z: b.z, size: 0.5 });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** How loud a sound `d` metres away is, 0 to 1: full beside it, half at `HEAR.half` m, and still faint across the lake. */
export const HEAR = { half: 60 };
export const hearGain = (d: number): number => 1 / (1 + (d / HEAR.half) ** 2);
