import { MAPS } from '../src/data/maps';

/** Discord's error code for `thread_name` sent to a webhook on a channel that isn't a forum. */
export const NOT_FORUM = 220003;

export type PostResult = { ok: true } | { ok: false; code?: number };

/**
 * Posts to a Discord webhook. Mentions are always off, so player text can't ping anyone.
 * Retries once on a rate limit; never throws. The URL holds the webhook's secret, so it is never logged.
 */
export async function postWebhook(url: string, body: object, fetchFn: typeof fetch = fetch): Promise<PostResult> {
  const payload = JSON.stringify({ ...body, allowed_mentions: { parse: [] } });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { ok: true };
      if (res.status === 429 && attempt === 0) {
        const wait = Number((await res.json().catch(() => null))?.retry_after) || 1;
        await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
        continue;
      }
      const text = await res.text().catch(() => '');
      const code = Number(/"code":\s*(\d+)/.exec(text)?.[1]) || undefined;
      if (code !== NOT_FORUM) console.error(`discord webhook refused: ${res.status} ${text.slice(0, 300)}`);
      return { ok: false, code };
    } catch (e) {
      console.error('discord webhook unreachable:', (e as Error).message);
      return { ok: false };
    }
  }
  return { ok: false };
}

/** Backslash-escapes Discord markdown, so a name like "a_b_c" isn't shown in italics. */
export const escapeMd = (s: string): string => s.replace(/[\\_*~`|>#[\]()-]/g, '\\$&');

export const mapName = (id: string): string => MAPS.find((m) => m.id === id)?.name ?? id;

/** The first join after a quiet spell waits this long, so a burst of joins becomes one message. */
export const JOIN_GATHER_MS = 30_000;
/** At most one join message this often. */
export const JOIN_EVERY_MS = 5 * 60_000;
/** A returning player who was online this recently isn't posted again (reconnects, redeploys). */
export const JOIN_QUIET_MS = 10 * 60_000;
/** Names listed in one message; the rest are counted. */
const JOIN_LIST_MAX = 15;

export interface JoinEvent {
  name: string;
  /** The account was created by this join. */
  isNew: boolean;
  level: number;
  map: string;
}

/** Collects player joins and posts them as a batched summary. */
export class JoinFeed {
  private pending: JoinEvent[] = [];
  /** Lower-case name -> when the player was last seen joining or leaving. */
  private seen = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPost = -Infinity;

  constructor(
    private post: (content: string) => void,
    /** Players online across every room, read when the message goes out. */
    private online: () => number,
    private now: () => number = Date.now,
  ) {}

  join(e: JoinEvent): void {
    const t = this.now();
    const key = e.name.toLowerCase();
    const last = this.seen.get(key);
    this.seen.set(key, t);
    for (const [k, at] of this.seen) if (t - at > JOIN_QUIET_MS) this.seen.delete(k);
    if (last !== undefined && t - last < JOIN_QUIET_MS) return;
    if (this.pending.some((p) => p.name.toLowerCase() === key)) return;
    this.pending.push(e);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), Math.max(JOIN_GATHER_MS, this.lastPost + JOIN_EVERY_MS - t));
      this.timer.unref?.();
    }
  }

  left(name: string): void {
    this.seen.set(name.toLowerCase(), this.now());
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.length) return;
    this.post(joinMessage(this.pending, this.online()));
    this.pending = [];
    this.lastPost = this.now();
  }
}

const who = (e: JoinEvent): string => `${e.isNew ? 'new player' : `level ${e.level}`} · ${mapName(e.map)}`;

export function joinMessage(list: JoinEvent[], online: number): string {
  const tail = `${online} online`;
  if (list.length === 1) {
    const e = list[0];
    return `🎣 **${escapeMd(e.name)}** ${e.isNew ? 'joined' : 'is back'} · ${who(e)} · ${tail}`;
  }
  const lines = list.slice(0, JOIN_LIST_MAX).map((e) => `• **${escapeMd(e.name)}** · ${who(e)}`);
  if (list.length > JOIN_LIST_MAX) lines.push(`• …and ${list.length - JOIN_LIST_MAX} more`);
  return [`🎣 **${list.length} players joined** · ${tail}`, ...lines].join('\n');
}
