/** WebSocket close code 1012: "service restart". The client treats it as a redeploy, not an outage. */
export const RESTART_CLOSE_CODE = 1012;

/** What the shutdown needs from one open socket. */
export interface ShutdownConn {
  /** Sends `{ t: 'restart' }`. */
  restart(): void;
  /** Leaves the room now (settles wheel spins and blackjack, ticks smoking, marks the account changed). */
  endSession(): void;
  close(code: number): void;
}

export interface Shutdown {
  /** True once a signal has come in: refuse new sockets and ignore every message. */
  readonly down: boolean;
  /** Warns every client, ends every session, closes the sockets, saves, then exits. A second call does nothing. */
  run(): Promise<void>;
}

/**
 * The SIGTERM/SIGINT path. Order matters: sessions end synchronously before the final save (the sockets' own close
 * events come later), so the save holds everything `Room.leave` settles, and `down` stops anything changing after it.
 * `settleMs` gives the close frames a moment to leave before the process exits.
 */
export function createShutdown(conns: () => Iterable<ShutdownConn>, save: () => Promise<void>, exit: () => void, settleMs = 150): Shutdown {
  let started = false;
  return {
    get down() {
      return started;
    },
    async run() {
      if (started) return;
      started = true;
      for (const c of [...conns()]) {
        try {
          c.restart();
          c.endSession();
          c.close(RESTART_CLOSE_CODE);
        } catch (e) {
          console.error('shutdown: connection cleanup failed', e);
        }
      }
      try {
        await save();
      } catch (e) {
        console.error('shutdown: final save failed', e);
      }
      if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));
      exit();
    },
  };
}
