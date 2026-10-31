// WebSocket connection that survives iPhones locking, switching apps and
// flaky cell signal. It reconnects on its own and tells the app when it's back.
//
// The tricky case: after Safari has been in the background (say, while the
// camera was open), iOS often leaves the socket looking OPEN when it's
// actually dead, and anything sent on it silently vanishes. So whenever the
// page comes back, and every so often, we ping and reconnect if no reply.

const PING_EVERY_MS = 15_000;
const PONG_TIMEOUT_MS = 3500;

let ws = null;
let retry = 0;
let retryTimer = null;
let replaced = false;
let lastHeard = 0;
let pongTimer = null;
const listeners = { message: [], open: [], status: [] };
const queue = [];

export const on = (evt, fn) => listeners[evt].push(fn);
export const off = (evt, fn) => {
  const i = listeners[evt].indexOf(fn);
  if (i >= 0) listeners[evt].splice(i, 1);
};
const emit = (evt, arg) => [...listeners[evt]].forEach((fn) => fn(arg));

export function status() {
  if (replaced) return 'replaced';
  if (ws?.readyState === WebSocket.OPEN) return 'open';
  return 'connecting';
}

export function connect() {
  clearTimeout(retryTimer);
  replaced = false;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  emit('status', status());
  sock.onopen = () => {
    retry = 0;
    lastHeard = Date.now();
    emit('status', status());
    emit('open');
    while (queue.length) sock.send(queue.shift());
  };
  sock.onmessage = (e) => {
    lastHeard = Date.now();
    clearTimeout(pongTimer);
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === 'pong') return;
    emit('message', msg);
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
    clearTimeout(pongTimer);
    if (e.code === 4000) {
      replaced = true;
      emit('status', status());
      return;
    }
    emit('status', status());
    const delay = Math.min(8000, 400 * 2 ** retry++);
    retryTimer = setTimeout(connect, delay);
  };
  sock.onerror = () => {};
}

// Throw away a socket that has stopped answering and start a fresh one.
function reconnectNow() {
  const old = ws;
  ws = null;
  clearTimeout(pongTimer);
  if (old) {
    old.onclose = null;
    try {
      old.close();
    } catch {}
  }
  retry = 0;
  emit('status', status());
  connect();
}

// Ping, and reconnect if nothing comes back quickly.
export function checkAlive() {
  if (replaced) return;
  if (ws?.readyState !== WebSocket.OPEN) return connect();
  clearTimeout(pongTimer);
  try {
    ws.send('{"t":"ping"}');
  } catch {
    return reconnectNow();
  }
  pongTimer = setTimeout(reconnectNow, PONG_TIMEOUT_MS);
}

// Joins/creates wait for the connection; game actions sent while offline are
// dropped (the server state will catch the phone up when it reconnects).
export function send(msg) {
  const data = JSON.stringify(msg);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(data);
    return true;
  }
  if (msg.t === 'create' || msg.t === 'join') queue.push(data);
  connect();
  return false;
}

// For things that must arrive (a photo, a drawing): send now, then keep
// re-sending after every reconnect and every few seconds until isDone()
// says the server has it (or maxMs passes). Returns a function that stops trying.
export function sendUntil(msg, isDone, everyMs = 6000, maxMs = 180_000) {
  let stopped = false;
  const until = Date.now() + maxMs;
  const attempt = () => {
    if (stopped) return;
    if (isDone() || Date.now() > until) return stop();
    send(msg);
    checkAlive();
  };
  const onOpen = () => setTimeout(attempt, 300);
  const timer = setInterval(attempt, everyMs);
  const stop = () => {
    stopped = true;
    clearInterval(timer);
    off('open', onOpen);
  };
  on('open', onOpen);
  send(msg);
  return stop;
}

// Ask the server for a photo/drawing over the socket. Used when a normal
// download keeps failing. Resolves to a data: URL, or null.
export function requestMedia(id, timeoutMs = 12_000) {
  return new Promise((resolve) => {
    const done = (v) => {
      clearTimeout(t);
      off('message', onMsg);
      resolve(v);
    };
    const onMsg = (msg) => msg.t === 'media' && msg.id === id && done(msg.data || null);
    const t = setTimeout(() => done(null), timeoutMs);
    on('message', onMsg);
    if (!send({ t: 'media', id })) {
      // Not connected right now: try once more when we are.
      const retryOnOpen = () => {
        off('open', retryOnOpen);
        send({ t: 'media', id });
      };
      on('open', retryOnOpen);
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || replaced) return;
  if (ws?.readyState !== WebSocket.OPEN) {
    retry = 0;
    connect();
  } else checkAlive();
});
window.addEventListener('pageshow', () => !replaced && checkAlive());
window.addEventListener('online', () => !replaced && checkAlive());

setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN && Date.now() - lastHeard > PING_EVERY_MS) checkAlive();
}, 5000);
