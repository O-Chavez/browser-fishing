/**
 * Runs one client message through `fn`; a throw is logged and swallowed so a single bad packet can't take the
 * whole server (and everyone's session) down. Logs who sent it and the message type, never the payload.
 */
export function guarded(who: string, msg: { t?: unknown }, fn: () => void, log: (...a: unknown[]) => void = console.error): void {
  try {
    fn();
  } catch (e) {
    const t = typeof msg.t === 'string' ? msg.t.slice(0, 24) : typeof msg.t;
    log(`message handler failed (${who}, t=${t})`, e);
  }
}
