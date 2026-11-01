import { describe, expect, it } from 'vitest';
import { createShutdown, RESTART_CLOSE_CODE, type ShutdownConn } from './shutdown';

function setup() {
  const log: string[] = [];
  const conn = (n: string): ShutdownConn => ({
    restart: () => log.push(`${n}:restart`),
    endSession: () => log.push(`${n}:end`),
    close: (code) => log.push(`${n}:close:${code}`),
  });
  const conns = new Set([conn('a'), conn('b')]);
  const sd = createShutdown(
    () => conns,
    async () => void log.push('save'),
    () => log.push('exit'),
    0,
  );
  return { log, sd };
}

describe('server shutdown', () => {
  it('warns every client, ends sessions, closes with 1012, then saves and exits', async () => {
    const { log, sd } = setup();
    expect(sd.down).toBe(false);
    const p = sd.run();
    expect(sd.down).toBe(true);
    await p;
    expect(RESTART_CLOSE_CODE).toBe(1012);
    expect(log).toEqual(['a:restart', 'a:end', 'a:close:1012', 'b:restart', 'b:end', 'b:close:1012', 'save', 'exit']);
  });

  it('ends every session before the save', async () => {
    const { log, sd } = setup();
    await sd.run();
    expect(log.lastIndexOf('b:end')).toBeLessThan(log.indexOf('save'));
    expect(log.lastIndexOf('a:end')).toBeLessThan(log.indexOf('save'));
  });

  it('a second signal does nothing', async () => {
    const { log, sd } = setup();
    await sd.run();
    const n = log.length;
    await sd.run();
    expect(log.length).toBe(n);
  });

  it('still saves and exits when one connection throws', async () => {
    const log: string[] = [];
    const bad: ShutdownConn = { restart: () => { throw new Error('x'); }, endSession: () => {}, close: () => {} };
    const good: ShutdownConn = { restart: () => log.push('r'), endSession: () => log.push('e'), close: () => log.push('c') };
    const sd = createShutdown(() => [bad, good], async () => void log.push('save'), () => log.push('exit'), 0);
    const quiet = console.error;
    console.error = () => {};
    await sd.run();
    console.error = quiet;
    expect(log).toEqual(['r', 'e', 'c', 'save', 'exit']);
  });
});
