import { describe, expect, it } from 'vitest';
import { isRestartClose, RESTART_GIVE_UP_MS, RESTART_SETTLE_MS, restartReady, waitForRestart, type RestartDeps } from './restart';

describe('restart logic', () => {
  it('only close code 1012 is a restart', () => {
    expect(isRestartClose(1012)).toBe(true);
    for (const c of [1000, 1001, 1005, 1006, 1008]) expect(isRestartClose(c)).toBe(false);
  });

  it('trusts an OK only once the socket closed and the old server is gone or has had time to exit', () => {
    expect(restartReady(false, true, true, 99999)).toBe(false);
    expect(restartReady(true, false, true, 99999)).toBe(false);
    expect(restartReady(true, true, false, RESTART_SETTLE_MS - 1)).toBe(false);
    expect(restartReady(true, true, false, RESTART_SETTLE_MS)).toBe(true);
    expect(restartReady(true, true, true, 0)).toBe(true);
  });

  function run(answers: (t: number) => boolean | 'throw', closed = true) {
    let t = 0;
    const out = { reloads: 0, giveUps: 0, probes: 0 };
    const deps: RestartDeps = {
      probe: async () => {
        out.probes++;
        const a = answers(t);
        if (a === 'throw') throw new Error('down');
        return a;
      },
      socketClosed: () => closed,
      now: () => t,
      sleep: async (ms) => void (t += ms),
      reload: () => out.reloads++,
      giveUp: () => out.giveUps++,
    };
    return waitForRestart(deps).then(() => out);
  }

  it('reloads after a failed poll then an OK', async () => {
    const out = await run((t) => (t < 5000 ? 'throw' : true));
    expect(out).toMatchObject({ reloads: 1, giveUps: 0 });
  });

  it('does not reload into a server that answers at once until the settle time has passed', async () => {
    let first = -1;
    const out = await run((t) => { if (first < 0) first = t; return true; });
    expect(out.reloads).toBe(1);
    expect(out.probes).toBeGreaterThan(1);
  });

  it('never reloads while the socket is still open', async () => {
    const out = await run(() => true, false);
    expect(out).toMatchObject({ reloads: 0, giveUps: 1 });
  });

  it('gives up after the limit when the server never comes back', async () => {
    const out = await run(() => false);
    expect(out).toMatchObject({ reloads: 0, giveUps: 1 });
    expect(RESTART_GIVE_UP_MS).toBe(120000);
  });
});
