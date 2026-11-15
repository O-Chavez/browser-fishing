/**
 * Problem reports from players' browsers (`POST /clientlog`, sent by `src/game/clientlog.ts`): a script error, lost
 * graphics or a dropped connection, with the browser and how long the page had been open. They go to the server log
 * only, so a phone that breaks shows up there without anyone having to ask what happened.
 */

export const CLIENT_LOG_KINDS = ['error', 'gpu', 'close', 'failed', 'reconnect'] as const;
export type ClientLogKind = (typeof CLIENT_LOG_KINDS)[number];

export interface ClientLog {
  kind: ClientLogKind;
  msg: string;
  ua: string;
  map: string;
  /** Seconds since the page loaded. */
  up: number;
  touch: boolean;
}

/** The body is at most this long; anything bigger is turned away unread. */
export const CLIENT_LOG_MAX_BYTES = 2048;
/** Each address may send this many reports per window; more are dropped (a page stuck in an error loop). */
export const CLIENT_LOG_PER_WINDOW = 20;
export const CLIENT_LOG_WINDOW_MS = 10 * 60_000;

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';

/** A report as the server keeps it, or null if the body isn't one. */
export function parseClientLog(body: string): ClientLog | null {
  let o: unknown;
  try {
    o = JSON.parse(body);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const kind = CLIENT_LOG_KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  const up = typeof r.up === 'number' && Number.isFinite(r.up) ? Math.max(0, Math.round(r.up)) : 0;
  return { kind, msg: clean(r.msg, 400), ua: clean(r.ua, 200), map: clean(r.map, 24), up, touch: r.touch === true };
}

/** One log line per report. */
export const clientLogLine = (r: ClientLog): string =>
  `[client] ${r.kind}${r.touch ? ' (touch)' : ''} at ${r.up}s on ${r.map || '?'}: ${r.msg || '-'} | ${r.ua || '?'}`;

/** Counts reports per address in a sliding window. */
export class ClientLogGate {
  private seen = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}

  allow(addr: string): boolean {
    const t = this.now();
    const recent = (this.seen.get(addr) ?? []).filter((at) => t - at < CLIENT_LOG_WINDOW_MS);
    if (recent.length >= CLIENT_LOG_PER_WINDOW) {
      this.seen.set(addr, recent);
      return false;
    }
    recent.push(t);
    this.seen.set(addr, recent);
    if (this.seen.size > 5000) this.prune(t);
    return true;
  }

  private prune(t: number): void {
    for (const [k, v] of this.seen) if (!v.some((at) => t - at < CLIENT_LOG_WINDOW_MS)) this.seen.delete(k);
  }
}
