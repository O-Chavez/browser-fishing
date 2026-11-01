/** WebSocket close code 1012 ("service restart"): the server is redeploying, not gone. */
export const RESTART_CLOSE_CODE = 1012;
/** How often the "Lakeside is updating" card asks the server if it's back. */
export const RESTART_POLL_MS = 2000;
/** Wait before the first poll, so the dying server isn't asked first. */
export const RESTART_FIRST_POLL_MS = 1500;
/**
 * Without a failed poll to prove the old server went away, an OK answer only counts this long after the restart
 * notice (the old server exits well within this once its sockets are closed).
 */
export const RESTART_SETTLE_MS = 4000;
/** After this long without the server coming back, fall back to the offline banner. */
export const RESTART_GIVE_UP_MS = 120_000;
/** Each poll gives up on a silent server after this long. */
export const RESTART_PROBE_TIMEOUT_MS = 1500;

/** A close that means "restarting", not an outage, a logout or a kick. */
export const isRestartClose = (code: number): boolean => code === RESTART_CLOSE_CODE;

/** Whether an OK answer from /health can be trusted to come from the new server. */
export function restartReady(ok: boolean, socketClosed: boolean, sawFailure: boolean, elapsedMs: number): boolean {
  return ok && socketClosed && (sawFailure || elapsedMs >= RESTART_SETTLE_MS);
}

export interface RestartDeps {
  /** Resolves true when /health answered OK. */
  probe(): Promise<boolean>;
  /** Whether the game socket has closed. */
  socketClosed(): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Called at most once. */
  reload(): void;
  giveUp(): void;
  /** Stops the loop (the card was dismissed some other way). */
  cancelled?(): boolean;
}

/** Polls until the server is back (then reloads) or `RESTART_GIVE_UP_MS` passes (then gives up). */
export async function waitForRestart(d: RestartDeps): Promise<void> {
  const start = d.now();
  let sawFailure = false;
  await d.sleep(RESTART_FIRST_POLL_MS);
  while (!d.cancelled?.()) {
    const elapsed = d.now() - start;
    if (elapsed >= RESTART_GIVE_UP_MS) return d.giveUp();
    const ok = await d.probe().catch(() => false);
    if (!ok) sawFailure = true;
    if (restartReady(ok, d.socketClosed(), sawFailure, d.now() - start)) return d.reload();
    await d.sleep(RESTART_POLL_MS);
  }
}
