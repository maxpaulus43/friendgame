import { Room, send } from './room.js';
import { UserError } from './util.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const IDLE_ROOM_MS = 6 * 60 * 60 * 1000;

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
const cleanAvatar = (s) => [...String(s ?? '')].slice(0, 4).join('') || '🙂';
const cleanPid = (s) => (/^[\w-]{8,64}$/.test(String(s)) ? String(s) : null);

export class Lobby {
  constructor() {
    this.rooms = new Map();
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref();
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  getMedia(code, id) {
    return this.rooms.get(String(code).toUpperCase())?.media.get(id) ?? null;
  }

  onMessage(ws, msg) {
    try {
      this.handle(ws, msg);
    } catch (err) {
      if (err instanceof UserError) send(ws, { t: 'error', msg: err.message });
      else {
        console.error('message error:', err);
        send(ws, { t: 'error', msg: 'Something went wrong on the server.' });
      }
    }
  }

  handle(ws, msg) {
    const room = ws.room;
    switch (msg?.t) {
      case 'create':
      case 'join': {
        const pid = cleanPid(msg.pid);
        const name = cleanName(msg.name);
        if (!pid) throw new UserError('Bad player id. Try reloading.');
        if (!name) throw new UserError('Pick a name first.');
        let target;
        if (msg.t === 'create') {
          target = new Room(this.newCode());
          this.rooms.set(target.code, target);
          console.log(`room ${target.code} created`);
        } else {
          target = this.rooms.get(String(msg.code ?? '').toUpperCase().trim());
          if (!target) return send(ws, { t: 'error', code: 'noroom', msg: 'No room with that code. Double-check it?' });
        }
        if (room && room !== target) room.disconnect(ws);
        target.join(pid, name, cleanAvatar(msg.avatar), ws);
        // The host's phone remembers their favorite settings between weeks.
        if (msg.t === 'create' && msg.settings) target.setSettings(msg.settings);
        send(ws, { t: 'joined', code: target.code });
        return;
      }
      case 'ping':
        return send(ws, { t: 'pong', now: Date.now() });
    }
    if (!room) return send(ws, { t: 'error', code: 'noroom', msg: 'You are not in a room.' });
    room.lastActive = Date.now();
    switch (msg.t) {
      case 'leave':
        room.remove(ws.pid);
        ws.room = null;
        return;
      case 'ready':
        return room.markReady(ws.pid);
      case 'host':
        return room.hostAction(ws.pid, msg);
      case 'g':
        return room.gameAction(ws.pid, msg);
    }
  }

  onClose(ws) {
    ws.room?.disconnect(ws);
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty() && now - room.lastActive > IDLE_ROOM_MS) {
        room.close();
        this.rooms.delete(code);
        console.log(`room ${code} closed (idle)`);
      }
    }
  }
}
