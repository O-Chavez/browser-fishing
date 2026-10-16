import { createReadStream, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { MAPS } from '../src/data/maps';
import { SERVER_PORT, type ClientMsg } from '../src/net/protocol';
import { AccountStore } from './accounts';
import { Room } from './room';

// DATA_DIR lets a host point saves at a persistent disk; otherwise they live next to the server code.
const dataFile = (name: string) => (process.env.DATA_DIR ? pathToFileURL(join(process.env.DATA_DIR, name)) : new URL(`./${name}`, import.meta.url));
const ROOMS_FILE = dataFile('rooms.json');
const stored: Record<string, Record<string, number>> = existsSync(ROOMS_FILE)
  ? JSON.parse(readFileSync(ROOMS_FILE, 'utf8'))
  : {};
const accounts = new AccountStore(dataFile('accounts.json'));
const rooms = new Map<string, Room>();

let roomsDirty = false;
const persist = () => {
  roomsDirty = true;
  accounts.touch();
};
setInterval(() => {
  accounts.flush();
  if (!roomsDirty) return;
  roomsDirty = false;
  writeFileSync(ROOMS_FILE, JSON.stringify(Object.fromEntries([...rooms].map(([k, r]) => [k, r.funds]))));
}, 2000);

function room(name: string): Room {
  let r = rooms.get(name);
  if (!r) {
    r = new Room(name, stored[name] ?? {}, MAPS, persist);
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
};
// Serves the built client (npm run build) from the same port as the game socket.
const http = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
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
const wss = new WebSocketServer({ server: http, maxPayload: 1024 });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const r = room((url.searchParams.get('room') ?? 'lobby').replace(/[^\w-]/g, '').slice(0, 24) || 'lobby');
  let id = 0;
  const send = (m: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (id) return r.handle(id, msg);
    if (msg.t !== 'join') return;
    const res = accounts.auth(msg.name, msg.token);
    if (!res.ok) {
      send({ t: 'error', msg: res.msg });
      return ws.close();
    }
    id = r.join({ send }, res.account, msg.map);
  });
  ws.on('close', () => id && r.leave(id));
});
setInterval(() => rooms.forEach((r) => r.snapshot()), 100);
http.listen(PORT, () => console.log(`fishing server on port ${PORT}`));
