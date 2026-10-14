// WebSocket connection that survives iPhones locking, switching apps and
// flaky cell signal. It reconnects on its own and tells the app when it's back.

let ws = null;
let retry = 0;
let retryTimer = null;
let replaced = false;
const listeners = { message: [], open: [], status: [] };
const queue = [];

export const on = (evt, fn) => listeners[evt].push(fn);
const emit = (evt, arg) => listeners[evt].forEach((fn) => fn(arg));

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
    emit('status', status());
    emit('open');
    while (queue.length) sock.send(queue.shift());
  };
  sock.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    emit('message', msg);
  };
  sock.onclose = (e) => {
    if (ws !== sock) return;
    ws = null;
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !replaced && ws?.readyState !== WebSocket.OPEN) {
    retry = 0;
    connect();
  }
});
window.addEventListener('online', () => !replaced && connect());

setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) ws.send('{"t":"ping"}');
}, 20_000);
