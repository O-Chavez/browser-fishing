import { describe, expect, it } from 'vitest';
import { FeedbackForm, OFFLINE_MSG } from './feedback';

// The limits are checked against the server's in server/feedback.test.ts (src/ can't import server/ code).
describe('feedback form', () => {
  it('sends the draft as a /bug or /idea command, squashing spaces', () => {
    const f = new FeedbackForm();
    f.text = '  my fish\n\nvanished  ';
    expect(f.submit(true)).toBe('/bug my fish vanished');
    expect(f.sending).toBe(true);
    // One report at a time.
    expect(f.submit(true)).toBeNull();
    const g = new FeedbackForm();
    g.show('idea');
    g.text = 'a glowing rod';
    expect(g.submit(true)).toBe('/idea a glowing rod');
  });

  it('says why it cannot send instead of failing silently', () => {
    const f = new FeedbackForm();
    f.text = 'my fish vanished';
    expect(f.submit(false)).toBeNull();
    expect([f.state, f.msg]).toEqual(['error', OFFLINE_MSG]);
    f.text = ' hm ';
    expect(f.submit(true)).toBeNull();
    expect(f.msg).toMatch(/a few words/);
    expect(f.text).toBe(' hm ');
  });

  it('shows the server answer and clears the draft only once it was sent', () => {
    const f = new FeedbackForm();
    expect(f.answer(true, 'Thanks!')).toBe(false);
    f.text = 'my fish vanished';
    f.submit(true);
    expect(f.answer(false, 'Try again in a few minutes.')).toBe(true);
    expect([f.state, f.msg, f.text]).toEqual(['error', 'Try again in a few minutes.', 'my fish vanished']);
    f.submit(true);
    expect(f.answer(true, 'Thanks! Your bug report was sent to the developer.')).toBe(true);
    expect([f.state, f.text]).toEqual(['sent', '']);
  });

  it('lets the player try again when no answer comes', () => {
    const f = new FeedbackForm();
    f.text = 'my fish vanished';
    f.submit(true);
    f.giveUp();
    expect(f.state).toBe('error');
    expect(f.submit(true)).toBe('/bug my fish vanished');
  });

  it('keeps the draft and a pending send across close and reopen', () => {
    const f = new FeedbackForm();
    f.show();
    f.text = 'half typed';
    f.hide();
    f.show();
    expect([f.open, f.text, f.state]).toEqual([true, 'half typed', 'edit']);
    f.text = 'my fish vanished';
    f.submit(true);
    f.hide();
    f.show('idea');
    expect(f.sending).toBe(true);
  });
});
