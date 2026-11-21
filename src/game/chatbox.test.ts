import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatBox, CHAT_TTL_MS, FLASH_MS, TOUCH_GLANCE_MS, TOUCH_SHOWN, fullLines, glanceLines, commandMatches, countsAsUnread, unreadLabel, flashElapsed, liveLines, loginCommand, maskedEcho, promptEcho, resetPassCommand, secretError, secretPrompt, sendsOnBlur, shownLines, typedCommand, type ChatLine } from './chatbox';

const line = (text: string, map = 'pond', at = 0): ChatLine => ({ name: 'Ann', map, text, self: false, at });

describe('chat window lines', () => {
  it('drops lines five minutes after they arrive', () => {
    const lines = [line('old', 'pond', 0), line('new', 'pond', 60_000)];
    expect(liveLines(lines, CHAT_TTL_MS - 1).map((l) => l.text)).toEqual(['old', 'new']);
    expect(liveLines(lines, CHAT_TTL_MS).map((l) => l.text)).toEqual(['new']);
  });

  it('shows the newest eight, optionally from one world only', () => {
    const lines = Array.from({ length: 12 }, (_, i) => line(`m${i}`, i % 2 ? 'casino' : 'pond'));
    expect(shownLines(lines, null).map((l) => l.text)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11']);
    expect(shownLines(lines, 'casino').map((l) => l.text)).toEqual(['m1', 'm3', 'm5', 'm7', 'm9', 'm11']);
  });

  it('glances at the last three lines from the last half minute on touch', () => {
    const lines = [line('stale', 'pond', 0), ...Array.from({ length: 5 }, (_, i) => line(`m${i}`, 'pond', 40_000 + i))];
    expect(TOUCH_SHOWN).toBe(3);
    expect(glanceLines(lines, null, 40_010).map((l) => l.text)).toEqual(['m2', 'm3', 'm4']);
    expect(glanceLines(lines.slice(0, 3), null, 40_010).map((l) => l.text)).toEqual(['m0', 'm1']);
  });

  it('lets a line leave the glance after thirty seconds, but not the full log', () => {
    const lines = [line('hi', 'pond', 1000)];
    expect(glanceLines(lines, null, 1000 + TOUCH_GLANCE_MS - 1)).toHaveLength(1);
    expect(glanceLines(lines, null, 1000 + TOUCH_GLANCE_MS)).toHaveLength(0);
    expect(liveLines(lines, 1000 + TOUCH_GLANCE_MS)).toHaveLength(1);
    expect(fullLines(lines, null)).toHaveLength(1);
  });

  it('applies the world filter to the glance and the full log, keeping notices', () => {
    const lines = [line('a', 'pond'), line('b', 'casino'), { ...line('Bob has joined', ''), system: true }];
    expect(glanceLines(lines, 'casino', 1).map((l) => l.text)).toEqual(['b', 'Bob has joined']);
    expect(fullLines(lines, 'casino').map((l) => l.text)).toEqual(['b', 'Bob has joined']);
  });

  it('gives the open touch log every line, not just eight', () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(`m${i}`));
    expect(fullLines(lines, null)).toHaveLength(30);
  });

  it('keeps server notices in every world filter', () => {
    const lines = [line('hi', 'pond'), { ...line('Bob has joined', ''), system: true }];
    expect(shownLines(lines, 'casino').map((l) => l.text)).toEqual(['Bob has joined']);
  });

  it('flashes a new line for a few seconds, resuming where it was when the window is rebuilt', () => {
    const l = line('hi', 'pond', 10_000);
    expect(flashElapsed(l, 10_000)).toBe(0);
    expect(flashElapsed(l, 11_500)).toBe(1500);
    expect(flashElapsed(l, 10_000 + FLASH_MS - 1)).toBe(FLASH_MS - 1);
    expect(flashElapsed(l, 10_000 + FLASH_MS)).toBeNull();
  });
});

describe('slash command completion', () => {
  const names = (t: string) => commandMatches(t)?.map((c) => c.cmd) ?? null;

  it('offers the commands that start with what is typed, only while the name is being typed', () => {
    expect(names('/')).toEqual(['bug', 'idea', 'feedback']);
    expect(names('/i')).toEqual(['idea']);
    expect(names('/F')).toEqual(['feedback']);
    expect(names('/x')).toEqual([]);
    expect(names('/bug ')).toBeNull();
    expect(names('hello')).toBeNull();
  });

  it('keeps dev console commands unlisted', () => {
    expect(names('/l')).toEqual([]);
    expect(names('/re')).toEqual([]);
  });

  it('knows which command is being written', () => {
    expect(typedCommand('/bug my fish vanished')?.cmd).toBe('bug');
    expect(typedCommand('/Idea ')?.cmd).toBe('idea');
    expect(typedCommand('/bug')).toBeUndefined();
    expect(typedCommand('/login admin x')).toBeUndefined();
  });
});

describe('dev login panel', () => {
  it('opens for /login on its own and /resetpass with just a name', () => {
    expect(secretPrompt('/login')).toEqual({ kind: 'login' });
    expect(secretPrompt('  /Login ')).toEqual({ kind: 'login' });
    expect(secretPrompt('/resetpass Ann')).toEqual({ kind: 'resetpass', name: 'Ann' });
  });

  it('leaves the full typed forms and everything else alone', () => {
    expect(secretPrompt('/login admin hunter2')).toBeNull();
    expect(secretPrompt('/resetpass Ann hunter2')).toBeNull();
    expect(secretPrompt('/resetpass')).toBeNull();
    expect(secretPrompt('/logout')).toBeNull();
    expect(secretPrompt('/bug login')).toBeNull();
    expect(secretPrompt('login')).toBeNull();
  });

  it('builds the commands the server reads', () => {
    expect(loginCommand('admin', 'hunter2')).toBe('/login admin hunter2');
    expect(resetPassCommand('Ann', 'n3wpass')).toBe('/resetpass Ann n3wpass');
  });

  it('never shows the typed values in the echo', () => {
    expect(promptEcho({ kind: 'login' })).toBe('/login ••••');
    expect(promptEcho({ kind: 'resetpass', name: 'Ann' })).toBe('/resetpass Ann ••••');
    const echo = promptEcho({ kind: 'login' });
    expect(echo).not.toContain('admin');
    expect(echo).not.toContain('hunter2');
    expect(maskedEcho('/login admin hunter2')).toBe('/login admin ••••');
    expect(maskedEcho('/resetpass Big Fish hunter2')).toBe('/resetpass Big Fish ••••');
    expect(maskedEcho('/bug it broke')).toBe('/bug it broke');
  });

  it('refuses empty values and spaces, which would change what the server reads', () => {
    expect(secretError(['admin', 'hunter2'])).toBeNull();
    expect(secretError(['admin', ''])).not.toBeNull();
    expect(secretError(['admin', 'hunter 2'])).not.toBeNull();
  });
});

describe('unread chat badge', () => {
  it('counts other players\' messages only', () => {
    expect(countsAsUnread({ self: false })).toBe(true);
    expect(countsAsUnread({ self: true })).toBe(false);
    expect(countsAsUnread({ self: false, system: true })).toBe(false);
  });

  it('shows nothing for none and caps at 9+', () => {
    expect(unreadLabel(0)).toBe('');
    expect(unreadLabel(1)).toBe('1');
    expect(unreadLabel(9)).toBe('9');
    expect(unreadLabel(10)).toBe('9+');
  });
});

describe('touch chat keyboard setting', () => {
  // The tests run without a DOM, so the chat box gets a stand-in root whose elements remember only what open() touches.
  const fakeEl = () => {
    const cls = new Set<string>();
    const el: Record<string, unknown> = {
      classList: { add: (...c: string[]) => c.forEach((x) => cls.add(x)), remove: (...c: string[]) => c.forEach((x) => cls.delete(x)), contains: (c: string) => cls.has(c), toggle: () => false },
      style: { setProperty() {}, fontSize: '' },
      dataset: {},
      value: '',
      readOnly: false,
      scrollHeight: 0,
      clientHeight: 0,
      childElementCount: 0,
      addEventListener() {},
      focus: vi.fn(),
      blur() {},
    };
    return el;
  };
  const build = (phoneKeys?: () => boolean) => {
    const els = new Map<string, ReturnType<typeof fakeEl>>();
    const root = { ...fakeEl(), innerHTML: '', querySelector: (sel: string) => (els.has(sel) ? els.get(sel)! : (els.set(sel, fakeEl()), els.get(sel)!)) };
    vi.stubGlobal('addEventListener', () => {});
    vi.stubGlobal('removeEventListener', () => {});
    vi.stubGlobal('screen', { width: 844, height: 390 });
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('setInterval', () => 0);
    const chat = new ChatBox(root as unknown as HTMLElement, { send() {}, map: () => 'pond', mapName: (id) => id, soft: () => true, phoneKeys });
    const input = els.get('.chat-input')!;
    return { chat, root: root as unknown as { classList: { contains(c: string): boolean } }, input };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('opens straight into the phone keyboard when the setting says phone', () => {
    const { chat, root, input } = build(() => true);
    chat.open();
    expect(root.classList.contains('typing')).toBe(true);
    expect(root.classList.contains('native')).toBe(true);
    expect(root.classList.contains('soft')).toBe(false);
    expect(input.readOnly).toBe(false);
    expect(input.focus).toHaveBeenCalledTimes(1);
  });

  it("keeps the game's keys by default", () => {
    for (const phoneKeys of [undefined, () => false]) {
      const { chat, root, input } = build(phoneKeys);
      chat.open();
      expect(root.classList.contains('soft')).toBe(true);
      expect(root.classList.contains('native')).toBe(false);
      expect(input.readOnly).toBe(true);
      expect(input.focus).not.toHaveBeenCalled();
    }
  });
});

describe("the phone keyboard's ✓ / Done", () => {
  const done = { open: true, native: true, movedTo: false, stillFocused: false };

  it("sends what's typed when the phone's keyboard is put away", () => {
    expect(sendsOnBlur(done)).toBe(true);
  });

  it('does not send once chat is closed (✕, Esc, Send), which lets go of the field afterwards', () => {
    expect(sendsOnBlur({ ...done, open: false })).toBe(false);
  });

  it("does not send on desktop or with the game's keyboard", () => {
    expect(sendsOnBlur({ ...done, native: false })).toBe(false);
  });

  it('does not send when the focus moves to another field or the page loses it', () => {
    expect(sendsOnBlur({ ...done, movedTo: true })).toBe(false);
    expect(sendsOnBlur({ ...done, stillFocused: true })).toBe(false);
  });
});
