import { timingSafeEqual } from 'node:crypto';
import { escapeMd } from './discord';

/** The parts of a Ko-fi webhook we use. The tipper's email is never read. */
export interface KofiTip {
  id: string;
  /** Donation, Subscription, Commission or Shop Order. */
  type: string;
  fromName: string;
  message: string;
  amount: string;
  currency: string;
}

/**
 * Reads a Ko-fi webhook body (form-encoded, with the JSON in a `data` field). Null if it isn't one,
 * or if its verification token doesn't match ours, so a stranger can't post fake tips.
 */
export function parseKofi(body: string, token: string): KofiTip | null {
  if (!token) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(new URLSearchParams(body).get('data') ?? '');
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || !sameToken(String(d.verification_token ?? ''), token)) return null;
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    id: s(d.message_id, 64) || s(d.kofi_transaction_id, 64),
    type: s(d.type, 32) || 'Donation',
    fromName: s(d.from_name, 64),
    message: s(d.message, 500),
    amount: s(d.amount, 16),
    currency: s(d.currency, 8),
  };
}

function sameToken(got: string, want: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The account a tip is for: a Lakeside name written in the tip message, or else the tipper's Ko-fi
 * name. Names count only as whole words, and a message naming several players matches nobody.
 */
export function matchTip(tip: KofiTip, names: Iterable<string>): string | null {
  const list = [...names];
  return matchIn(tip.message, list) ?? matchIn(tip.fromName, list);
}

function matchIn(text: string, names: string[]): string | null {
  const t = text.toLowerCase();
  const found = names.filter((n) => {
    const k = n.toLowerCase();
    for (let i = t.indexOf(k); i >= 0; i = t.indexOf(k, i + 1)) {
      if (!/\w/.test(t[i - 1] ?? '') && !/\w/.test(t[i + k.length] ?? '')) return true;
    }
    return false;
  });
  // "Ann Lee" also contains "Ann": a name inside a longer match isn't a second player.
  const outer = found.filter((n) => !found.some((o) => o !== n && o.toLowerCase().includes(n.toLowerCase())));
  return outer.length === 1 ? outer[0] : null;
}

/** The Discord message for a tip: who, how much, and which account got the heart. */
export function tipMessage(tip: KofiTip, matched: string | null): string {
  const what = tip.type === 'Donation' ? 'tip' : tip.type.toLowerCase();
  const lines = [`☕ **${escapeMd(tip.amount)} ${escapeMd(tip.currency)}** ${what} from **${escapeMd(tip.fromName || 'someone')}**`];
  if (tip.message) lines.push(`> ${escapeMd(tip.message).replace(/\n/g, '\n> ')}`);
  lines.push(matched ? `💗 Supporter heart given to **${escapeMd(matched)}**` : 'No Lakeside name found. Give the heart with `/supporter <name>` in the dev console.');
  return lines.join('\n');
}
