import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MAPS } from '../src/data/maps';
import { SERVER_PORT, type ClientMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { ChatGate } from './chat';
import { DevGate } from './dev';
import { JoinFeed, NOT_FORUM, postWebhook } from './discord';
import { FeedbackGate, feedbackPost, parseTags, type FeedbackReport } from './feedback';
import { Room } from './room';
import { createStorage } from './storage';

const storage = createStorage(process.env, fileURLToPath(new URL('./', import.meta.url)));
const data = await storage.load();
const accounts = new AccountStore(data.accounts);
const rooms = new Map<string, Room>();
/** Open sockets per room, joined or not, so a room is only dropped when nobody can still join it. */
const sockets = new Map<Room, number>();
// Chat is server-wide: one set of limits, and every line goes to every room.
const chatGate = new ChatGate();
// Dev console credentials; with either unset the console stays off.
const devGate = new DevGate({ user: process.env.DEV_USER, pass: process.env.DEV_PASS });
if (devGate.enabled) console.log('dev console: enabled');
setInterval(() => chatGate.prune(), 60_000);
const feedbackGate = new FeedbackGate();
// Discord webhooks; each feature is off while its URL is unset. The URLs are secrets: never logged or sent to clients.
const BUILD = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev';
const JOINS_HOOK = process.env.DISCORD_JOINS_WEBHOOK;
const FEEDBACK_HOOK = process.env.DISCORD_FEEDBACK_WEBHOOK;
const feedbackTags = parseTags(process.env.DISCORD_FEEDBACK_TAGS);
const online = () => [...rooms.values()].reduce((n, r) => n + r.size, 0);
const joinFeed = JOINS_HOOK ? new JoinFeed((content) => void postWebhook(JOINS_HOOK, { content }), online) : null;
console.log(`discord: joins ${JOINS_HOOK ? 'on' : 'off'}, feedback ${FEEDBACK_HOOK ? 'on' : 'off'}`);
/** Posts a report to the feedback forum; if Discord is off or unreachable, keeps it in storage instead. */
async function sendFeedback(r: FeedbackReport): Promise<void> {
  const report = { ...r, build: BUILD };
  console.log(`[feedback] ${r.kind} from ${r.name}: ${r.text}`);
  if (FEEDBACK_HOOK) {
    let res = await postWebhook(FEEDBACK_HOOK, feedbackPost(report, feedbackTags));
    // A webhook on a plain text channel can't open forum posts; send a normal message there instead.
    if (!res.ok && res.code === NOT_FORUM) res = await postWebhook(FEEDBACK_HOOK, feedbackPost(report, feedbackTags, false));
    if (res.ok) return;
  }
  try {
    await storage.saveFeedback(report);
  } catch (e) {
    console.error('feedback could not be saved', e);
  }
}
console.log(`saves: ${storage.kind} (${Object.keys(data.accounts).length} accounts loaded)`);
if (process.env.RENDER && !process.env.DATABASE_URL) {
  console.warn('WARNING: running on Render without DATABASE_URL - progress will be lost on every deploy. Set it in the web service Environment tab.');
}

const persist = () => accounts.touch();
let saving = false;
async function flush(): Promise<void> {
  if (saving) return;
  const accts = accounts.takeDirty();
  if (!accts) return;
  saving = true;
  try {
    await storage.save({ accounts: accts });
  } catch (e) {
    console.error('save failed, will retry', e);
    accounts.markDirty();
  } finally {
    saving = false;
  }
}
setInterval(flush, 2000);
// Hosts send SIGTERM on redeploy; save before exiting so recent progress survives.
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    saving = false;
    accounts.markDirty();
    await flush();
    process.exit(0);
  });
}

function room(name: string): Room {
  let r = rooms.get(name);
  if (!r) {
    r = new Room(name, MAPS, persist);
    r.hall = () => accounts.hall();
    r.hallStale = () => accounts.hallStale();
    r.chatGate = chatGate;
    r.devGate = devGate;
    r.feedbackGate = feedbackGate;
    r.report = (rep) => void sendFeedback(rep);
    r.say = (msg) => rooms.forEach((o) => o.broadcast(msg));
    rooms.set(name, r);
  }
  return r;
}

const PORT = Number(process.env.PORT) || SERVER_PORT;
// Plain HTTP answers host health checks; WebSocket upgrades share the same port.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};
// Serves the built client (npm run build) from the same port as the game socket.
const http = createServer((req, res) => {
  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    // A malformed %-escape would otherwise throw out of the handler and take the server down.
    res.writeHead(400);
    return res.end('Bad request');
  }
  const file = resolve(DIST, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    if (path === '/health' || !existsSync(join(DIST, 'index.html'))) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('fishing server ok');
    }
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});
// Room for a full-length feedback report (500 characters, up to 4 bytes each).
const wss = new WebSocketServer({ server: http, maxPayload: 4096 });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const r = room((url.searchParams.get('room') ?? 'lobby').replace(/[^\w-]/g, '').slice(0, 24) || 'lobby');
  sockets.set(r, (sockets.get(r) ?? 0) + 1);
  let id = 0;
  let name = '';
  const send = (m: unknown, json?: string) => ws.readyState === ws.OPEN && ws.send(json ?? JSON.stringify(m));
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    // Valid JSON can still be null or a bare value; reading `.t` off those would crash the server.
    if (!msg || typeof msg !== 'object') return;
    if (id) return r.handle(id, msg);
    if (msg.t !== 'join') return;
    const res = accounts.auth(msg.name, msg.token);
    if (!res.ok) {
      send({ t: 'error', msg: res.msg });
      return ws.close();
    }
    id = r.join({ send, ua: req.headers['user-agent'] }, res.account, msg.color);
    name = res.account.name;
    joinFeed?.join({ name, isNew: res.created, level: res.account.save.level, map: res.account.save.location });
  });
  ws.on('close', () => {
    if (id) r.leave(id);
    if (name) joinFeed?.left(name);
    // Any ?room= name creates a room; drop it once no socket uses it so they don't pile up.
    const left = (sockets.get(r) ?? 1) - 1;
    if (left > 0) sockets.set(r, left);
    else {
      sockets.delete(r);
      rooms.delete(r.name);
    }
  });
});
setInterval(() => rooms.forEach((r) => r.snapshot()), 100);
http.listen(PORT, () => console.log(`fishing server on port ${PORT}`));
