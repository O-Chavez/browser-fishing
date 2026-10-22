import { censor, cleanText } from './chat';
import { escapeMd } from './discord';

export const FEEDBACK_KINDS = ['bug', 'idea', 'feedback'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_MAX = 500;
const FEEDBACK_MIN = 5;
/** At most `FEEDBACK_BURST` reports per account per window... */
export const FEEDBACK_BURST = 3;
/** ...and `FEEDBACK_SERVER_MAX` from everyone, since new accounts are free. */
export const FEEDBACK_SERVER_MAX = 20;
export const FEEDBACK_WINDOW_MS = 10 * 60_000;

/** One player report, with context filled in by the server so a client can't fake it. */
export interface FeedbackReport {
  kind: FeedbackKind;
  text: string;
  name: string;
  level: number;
  /** Map name. */
  map: string;
  x: number;
  z: number;
  room: string;
  browser: string;
  /** Epoch ms. */
  at: number;
  /** Short commit hash of the deploy. */
  build?: string;
}

export type FeedbackResult = { ok: true; text: string } | { ok: false; msg: string };

/** Limits for `/bug`, `/idea` and `/feedback`; one instance is shared server-wide. */
export class FeedbackGate {
  private sent = new Map<string, number[]>();
  private all: number[] = [];

  constructor(private now: () => number = Date.now) {}

  check(who: string, kind: FeedbackKind, raw: unknown): FeedbackResult {
    const text = cleanText(raw, FEEDBACK_MAX);
    if (text.length < FEEDBACK_MIN) return { ok: false, msg: `Add a few words after the command, e.g. /${kind} ${kind === 'idea' ? 'a fishing rod that glows' : 'my fish vanished when I sold it'}` };
    const t = this.now();
    const fresh = (xs: number[]) => xs.filter((x) => t - x < FEEDBACK_WINDOW_MS);
    const key = who.toLowerCase();
    const mine = fresh(this.sent.get(key) ?? []);
    this.all = fresh(this.all);
    if (mine.length >= FEEDBACK_BURST) return { ok: false, msg: "Thanks! You've sent a lot of feedback just now. Try again in a few minutes." };
    if (this.all.length >= FEEDBACK_SERVER_MAX) return { ok: false, msg: 'Feedback is busy right now. Try again in a few minutes.' };
    mine.push(t);
    this.all.push(t);
    this.sent.set(key, mine);
    for (const [k, xs] of this.sent) if (!fresh(xs).length) this.sent.delete(k);
    return { ok: true, text: censor(text) };
  }
}

/** "Chrome 141 on macOS", from a user-agent header. */
export function browserName(ua = ''): string {
  const ver = (re: RegExp) => re.exec(ua)?.[1];
  const b = ver(/Edg\/(\d+)/) ? `Edge ${ver(/Edg\/(\d+)/)}`
    : ver(/OPR\/(\d+)/) ? `Opera ${ver(/OPR\/(\d+)/)}`
    : ver(/Firefox\/(\d+)/) ? `Firefox ${ver(/Firefox\/(\d+)/)}`
    : ver(/Chrome\/(\d+)/) ? `Chrome ${ver(/Chrome\/(\d+)/)}`
    : ver(/Version\/(\d+)[\d.]* .*Safari/) ? `Safari ${ver(/Version\/(\d+)[\d.]* .*Safari/)}`
    : 'Unknown browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'unknown OS';
  return `${b} on ${os}`;
}

const LABEL: Record<FeedbackKind, string> = { bug: 'Bug', idea: 'Idea', feedback: 'Feedback' };
const TITLE_MAX = 100;

/** "bug=123,idea=456,new=789" -> forum tag ids by name. */
export function parseTags(raw = ''): Record<string, string> {
  return Object.fromEntries(raw.split(',').map((p) => p.split('=').map((s) => s.trim())).filter(([k, v]) => k && /^\d+$/.test(v ?? '')));
}

/**
 * The webhook body for a report: one forum post (with tags) on a forum channel, or a plain
 * message with a bold label when `forum` is false (a webhook on a text channel).
 */
export function feedbackPost(r: FeedbackReport, tags: Record<string, string> = {}, forum = true): object {
  const title = `[${LABEL[r.kind]}] ${r.text}`;
  const room = r.room === 'lobby' ? '' : ` · room ${escapeMd(r.room)}`;
  const content = [
    ...(forum ? [] : [`**${LABEL[r.kind]}** from ${escapeMd(r.name)}`]),
    `> ${r.text}`,
    '',
    `**Player** ${escapeMd(r.name)} · level ${r.level} · ${r.map} (${r.x.toFixed(1)}, ${r.z.toFixed(1)})${room}`,
    `**Browser** ${r.browser}`,
    `**Build** ${r.build ?? 'dev'} · <t:${Math.floor(r.at / 1000)}:f>`,
  ].join('\n');
  if (!forum) return { content };
  const applied = [tags[r.kind], tags.new].filter(Boolean);
  return {
    thread_name: title.length > TITLE_MAX ? title.slice(0, TITLE_MAX - 1) + '…' : title,
    content,
    ...(applied.length ? { applied_tags: applied } : {}),
  };
}
