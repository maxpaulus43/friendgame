import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Lobby } from './lobby.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const lobby = new Lobby();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return end(res, 200, 'text/plain', 'ok');
    if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('http error:', err);
    end(res, 500, 'text/plain', 'Server error');
  }
});

function end(res, status, type, body, headers = {}) {
  res.writeHead(status, { 'content-type': type, ...headers });
  res.end(body);
}

// Photos and voice clips live in memory for the round. Safari's <audio>
// insists on byte-range support, so we handle Range requests.
function serveMedia(req, res, url) {
  const [, , code, id] = url.pathname.split('/');
  const m = lobby.getMedia(code, id);
  if (!m) return end(res, 404, 'text/plain', 'Not found');
  const size = m.buf.length;
  const headers = { 'content-type': m.mime, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let stop = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
    start = Math.max(0, start);
    if (start > stop) return end(res, 416, 'text/plain', '', { 'content-range': `bytes */${size}` });
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${stop}/${size}`, 'content-length': stop - start + 1 });
    return res.end(req.method === 'HEAD' ? undefined : m.buf.subarray(start, stop + 1));
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  res.end(req.method === 'HEAD' ? undefined : m.buf);
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC)) return end(res, 403, 'text/plain', 'Forbidden');
  let info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    // Unknown paths fall back to the app so /ABCD style links still load it.
    if (path.extname(rel)) return end(res, 404, 'text/plain', 'Not found');
    file = path.join(PUBLIC, 'index.html');
    info = await stat(file);
  }
  const etag = `"${info.size.toString(36)}-${info.mtimeMs.toString(36)}"`;
  const headers = {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-cache',
    etag,
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : await readFile(file));
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 6 * 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', (raw) => {
    ws.alive = true;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    lobby.onMessage(ws, msg);
  });
  ws.on('close', () => lobby.onClose(ws));
  ws.on('error', () => {});
});

// Drop connections whose phone went to sleep without saying goodbye.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 15_000).unref();

server.listen(PORT, () => console.log(`Wednesday game night is live on http://localhost:${PORT}`));
