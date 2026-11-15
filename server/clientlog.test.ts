import { describe, expect, it } from 'vitest';
import { CLIENT_LOG_PER_WINDOW, CLIENT_LOG_WINDOW_MS, ClientLogGate, clientLogLine, parseClientLog } from './clientlog';

describe('parseClientLog', () => {
  it('keeps a well-formed report', () => {
    const r = parseClientLog(JSON.stringify({ kind: 'gpu', msg: 'lost', ua: 'Pixel 8', map: 'pond', up: 12.6, touch: true }));
    expect(r).toEqual({ kind: 'gpu', msg: 'lost', ua: 'Pixel 8', map: 'pond', up: 13, touch: true });
  });

  it('turns away junk and unknown kinds', () => {
    expect(parseClientLog('not json')).toBeNull();
    expect(parseClientLog('null')).toBeNull();
    expect(parseClientLog(JSON.stringify({ kind: 'hack', msg: 'x' }))).toBeNull();
  });

  it('cleans control characters and caps lengths', () => {
    const r = parseClientLog(JSON.stringify({ kind: 'error', msg: 'a\nb\u0000c' + 'x'.repeat(1000), ua: 5, up: -3 }))!;
    expect(r.msg.startsWith('a b c')).toBe(true);
    expect(r.msg.length).toBe(400);
    expect(r.ua).toBe('');
    expect(r.up).toBe(0);
    expect(r.touch).toBe(false);
  });

  it('prints one line', () => {
    const line = clientLogLine({ kind: 'close', msg: 'code 1006', ua: 'Firefox', map: 'town', up: 40, touch: true });
    expect(line).toBe('[client] close (touch) at 40s on town: code 1006 | Firefox');
  });
});

describe('ClientLogGate', () => {
  it('lets a few through per address, then waits out the window', () => {
    let t = 0;
    const gate = new ClientLogGate(() => t);
    for (let i = 0; i < CLIENT_LOG_PER_WINDOW; i++) expect(gate.allow('a')).toBe(true);
    expect(gate.allow('a')).toBe(false);
    expect(gate.allow('b')).toBe(true);
    t += CLIENT_LOG_WINDOW_MS;
    expect(gate.allow('a')).toBe(true);
  });
});
