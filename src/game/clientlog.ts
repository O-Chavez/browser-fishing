import { NetClient } from './net';
import { touchOnly } from './touch';

/** Kinds the server keeps (`CLIENT_LOG_KINDS`, `server/clientlog.ts`). */
export type ClientLogKind = 'error' | 'gpu' | 'close' | 'failed' | 'reconnect';

/** At most this many reports a page load, so a page stuck in an error loop can't flood the log. */
const MAX_REPORTS = 8;
let sent = 0;
let mapOf: () => string = () => '';

/** Where the player is, for the reports. */
export function setLogMap(get: () => string): void {
  mapOf = get;
}

/**
 * A problem report to the server log (`POST /clientlog`): a script error, lost graphics or a dropped connection,
 * with the browser and how long the page has been open. Sent as a beacon, so it gets out even while the page
 * unloads and needs no reply.
 */
export function clientLog(kind: ClientLogKind, msg: string): void {
  if (import.meta.env.MODE === 'test' || sent >= MAX_REPORTS) return;
  sent++;
  try {
    const body = JSON.stringify({ kind, msg: msg.slice(0, 400), ua: navigator.userAgent, map: mapOf(), up: performance.now() / 1000, touch: touchOnly });
    const url = `${NetClient.serverBase().replace(/^ws/, 'http')}/clientlog`;
    // text/plain keeps a client on another host from needing a CORS preflight.
    const blob = new Blob([body], { type: 'text/plain' });
    if (!navigator.sendBeacon?.(url, blob)) void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {}
}

/** Reports uncaught script errors and rejected promises. */
export function watchErrors(): void {
  addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : '';
    clientLog('error', `${e.message || 'error'}${where}`);
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string } | undefined;
    clientLog('error', `unhandled: ${r?.message ?? String(e.reason)}`);
  });
}
