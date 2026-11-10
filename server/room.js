// 방 시스템 (전송 계층과 분리: socket 은 on/emit 만 있으면 된다 → Socket.IO 소켓/테스트용 가짜 소켓 모두 가능)
import crypto from 'node:crypto';
import { CFG } from '../shared/config.js';
import { layoutFor, lobbyMessage, SLOT_NAMES, VALID_COUNTS } from '../shared/keys.js';
import { Game, PHASE, DT } from './game.js';
import { MAP_LIST } from '../shared/mapData.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // I, O 제외
const MAX_PLAYERS = 4, MAX_ROOMS = 80;
const LOBBY_GRACE_MS = 8000;
const noop = () => {};

const cleanName = (n) => String(n || '').replace(/[<>&"'`\\]/g, '').trim().slice(0, 12) || '플레이어';

function send(sock, ev, data, volatile = false) {
  if (!sock) return;
  try { (volatile && sock.volatile ? sock.volatile : sock).emit(ev, data); } catch (e) { /* 끊긴 소켓 */ }
}

class Room {
  constructor(code, mgr, debug, size = null, mapId = 'city') {
    this.code = code; this.mgr = mgr; this.debug = !!debug;
    this.size = VALID_COUNTS.includes(size) ? size : null;     // 로비에서 고른 인원(1P/2P/4P). null 이면 1·2·4명 아무나
    this.players = []; this.phase = 'lobby'; this.game = null; this.mapId = MAP_LIST.includes(mapId) ? mapId : 'city';
    this.pause = null; this.acc = 0; this.last = mgr.now(); this.snapTick = 0; this.endSent = false;
    this.msg = '';
  }
  get host() { return this.players[0] || null; }
  connectedPlayers() { return this.players.filter((p) => p.connected); }
  broadcast(ev, data, volatile = false) { for (const p of this.players) if (p.connected) send(p.socket, ev, data, volatile); }

  lobbyState() {
    const n = this.players.length;
    const layout = layoutFor(n) ? SLOT_NAMES[n] : null;
    const allReady = this.players.every((p, i) => i === 0 || p.ready);
    const allHere = this.players.every((p) => p.connected);
    const sizeOk = this.size ? n === this.size : VALID_COUNTS.includes(n);
    const warn = this.size && n !== this.size ? `${this.size}P 방입니다. ${this.size}명이 모이면 시작할 수 있어요 (현재 ${n}명)` : lobbyMessage(n);
    return {
      code: this.code, phase: this.phase, n, debug: this.debug, size: this.size, map: this.mapId, maps: MAP_LIST,
      players: this.players.map((p, i) => ({ name: p.name, ready: i === 0 ? true : p.ready, connected: p.connected, host: i === 0 })),
      layout, valid: sizeOk, canStart: sizeOk && allReady && allHere,
      warn, msg: this.msg,
    };
  }
  sendLobby() {
    const st = this.lobbyState();
    this.players.forEach((p, i) => send(p.socket, 'room:state', { ...st, you: i }));
  }

  // ───── 게임 시작/종료 ─────
  start() {
    const n = this.players.length;
    this.game = new Game(this.mapId, n);
    this.players.forEach((p, i) => { p.slot = i; p.ready = false; });
    this.phase = 'playing'; this.acc = 0; this.last = this.mgr.now(); this.snapTick = 0; this.endSent = false; this.pause = null; this.msg = '';
    this.sendInit();
  }
  initPayload(p) {
    return { map: this.mapId, n: this.players.length, slot: p.slot, assign: this.game.layout, names: this.players.map((x) => x.name), slotNames: SLOT_NAMES[this.players.length], debug: this.debug, code: this.code, cp: this.game.cp, tick: CFG.TICK_HZ };
  }
  sendInit() { for (const p of this.players) if (p.connected) send(p.socket, 'game:init', this.initPayload(p)); }
  backToLobby(msg = '') {
    this.game = null; this.phase = 'lobby'; this.pause = null; this.msg = msg;
    this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p) => { p.ready = false; p.slot = -1; });
    this.broadcast('game:abort', { msg });
    this.sendLobby();
  }

  // ───── 접속 해제 / 재접속 ─────
  onDisconnect(p) {
    p.connected = false; p.socket = null; p.dropAt = this.mgr.now() + LOBBY_GRACE_MS;
    if (this.game && p.slot >= 0) this.game.clearKeys(p.slot);
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.pause = { deadline: this.mgr.now() + CFG.RULES.reconnectGrace * 1000, name: p.name };
      this.broadcast('game:pause', { name: p.name, left: CFG.RULES.reconnectGrace });
    } else if (this.phase === 'paused') {
      this.broadcast('game:pause', { name: p.name, left: Math.max(0, Math.ceil((this.pause.deadline - this.mgr.now()) / 1000)) });
    } else {
      this.sendLobby();
    }
  }
  onRejoin(p, socket) {
    p.socket = socket; p.connected = true; p.dropAt = 0;
    if (this.phase === 'paused' || this.phase === 'playing' || this.phase === 'finished') {
      send(socket, 'game:init', this.initPayload(p));
      if (this.phase === 'paused' && this.players.every((x) => x.connected)) {
        this.phase = 'playing'; this.pause = null; this.last = this.mgr.now(); this.acc = 0;
        this.broadcast('game:resume', {});
      } else if (this.phase === 'paused') {
        send(socket, 'game:pause', { name: this.players.find((x) => !x.connected).name, left: Math.max(0, Math.ceil((this.pause.deadline - this.mgr.now()) / 1000)) });
      }
    } else this.sendLobby();
  }
  removePlayer(p) {
    const i = this.players.indexOf(p);
    if (i < 0) return;
    this.players.splice(i, 1);
    if (this.phase === 'playing' || this.phase === 'paused') { this.backToLobby(`${p.name}님이 나가서 로비로 돌아갑니다`); return; }
    this.sendLobby();
  }

  // ───── 매 프레임 ─────
  update(nowMs) {
    if (this.phase === 'lobby') {
      const gone = this.players.filter((p) => !p.connected && nowMs > p.dropAt);
      if (gone.length) { this.players = this.players.filter((p) => !gone.includes(p)); this.sendLobby(); }
      return;
    }
    if (this.phase === 'paused') {
      if (nowMs >= this.pause.deadline) this.backToLobby('재접속하지 않아 로비로 돌아갑니다. 인원을 다시 맞춰 주세요');
      else if (Math.floor(nowMs / 1000) !== this.lastPauseTick) { this.lastPauseTick = Math.floor(nowMs / 1000); this.broadcast('game:pause', { name: this.pause.name, left: Math.ceil((this.pause.deadline - nowMs) / 1000) }); }
      this.last = nowMs;
      return;
    }
    if (this.phase !== 'playing' && this.phase !== 'finished') return;
    const g = this.game;
    this.acc += Math.min(0.25, (nowMs - this.last) / 1000);
    this.last = nowMs;
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      g.tick(); this.acc -= DT; steps++; this.snapTick++;
      const ev = g.drainEvents();
      if (ev.length) this.broadcast('evt', ev);
      if (this.snapTick % Math.round(CFG.TICK_HZ / CFG.SNAP_HZ) === 0) this.broadcast('snap', g.snapshot(), true);
    }
    if (steps >= 8) this.acc = 0;
    if (g.phase === PHASE.FINISHED && !this.endSent) {
      this.endSent = true; this.phase = 'finished';
      this.broadcast('snap', g.snapshot());
      this.broadcast('game:end', { ...g.result, names: this.players.map((x) => x.name) });
    }
  }
}

export class RoomManager {
  constructor(opts = {}) {
    this.rooms = new Map();
    this.now = opts.now || (() => Date.now());
    this.timer = null;
  }
  start() { if (!this.timer) this.timer = setInterval(() => this.updateAll(this.now()), 5); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  updateAll(nowMs) {
    for (const [code, room] of this.rooms) {
      room.update(nowMs);
      if (!room.players.length) this.rooms.delete(code);
    }
  }
  stats() { return { rooms: this.rooms.size, players: [...this.rooms.values()].reduce((a, r) => a + r.players.length, 0) }; }
  newCode() {
    for (let t = 0; t < 200; t++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }

  attach(socket) {
    const ctx = { room: null, player: null };
    const bind = (room, player) => { ctx.room = room; ctx.player = player; };
    const need = () => ctx.room && ctx.player;
    send(socket, 'hello', { v: 1, time: Date.now() });

    socket.on('room:create', (data, cb = noop) => {
      if (typeof cb !== 'function') cb = noop;
      if (ctx.room) return cb({ ok: false, err: '이미 방에 있습니다' });
      if (this.rooms.size >= MAX_ROOMS) return cb({ ok: false, err: '서버가 가득 찼습니다. 잠시 뒤에 다시 시도하세요' });
      const code = this.newCode();
      if (!code) return cb({ ok: false, err: '방 코드를 만들 수 없습니다' });
      const room = new Room(code, this, data && data.debug, data && Number(data.size), data && String(data.map || 'city'));
      const p = { token: crypto.randomBytes(8).toString('hex'), name: cleanName(data && data.name), socket, connected: true, ready: true, slot: -1, dropAt: 0, rate: 0, rateT: 0 };
      room.players.push(p); this.rooms.set(code, room); bind(room, p);
      cb({ ok: true, code, token: p.token });
      room.sendLobby();
    });

    socket.on('room:join', (data, cb = noop) => {
      if (typeof cb !== 'function') cb = noop;
      if (ctx.room) return cb({ ok: false, err: '이미 방에 있습니다' });
      const code = String((data && data.code) || '').toUpperCase().trim();
      const room = this.rooms.get(code);
      if (!room) return cb({ ok: false, err: '그 코드의 방이 없습니다' });
      if (room.phase !== 'lobby') return cb({ ok: false, err: '이미 게임이 진행 중인 방입니다' });
      if (room.players.length >= (room.size || MAX_PLAYERS)) return cb({ ok: false, err: room.size ? `방이 가득 찼습니다 (${room.size}P 방)` : '방이 가득 찼습니다 (최대 4명)' });
      const p = { token: crypto.randomBytes(8).toString('hex'), name: cleanName(data && data.name), socket, connected: true, ready: false, slot: -1, dropAt: 0, rate: 0, rateT: 0 };
      room.players.push(p); bind(room, p);
      cb({ ok: true, code, token: p.token });
      room.sendLobby();
    });

    socket.on('room:rejoin', (data, cb = noop) => {
      if (typeof cb !== 'function') cb = noop;
      const room = this.rooms.get(String((data && data.code) || '').toUpperCase());
      const p = room && room.players.find((x) => x.token === (data && data.token));
      if (!p) return cb({ ok: false, err: '다시 들어갈 수 있는 방이 없습니다' });
      if (p.connected && p.socket && p.socket !== socket) { try { p.socket.disconnect && p.socket.disconnect(true); } catch (e) { /* ignore */ } }
      bind(room, p);
      cb({ ok: true, code: room.code, token: p.token });
      room.onRejoin(p, socket);
    });

    socket.on('room:ready', (data) => {
      if (!need() || ctx.room.phase !== 'lobby') return;
      if (ctx.room.host !== ctx.player) ctx.player.ready = !!(data && data.ready);
      ctx.room.sendLobby();
    });

    socket.on('room:start', (data, cb = noop) => {
      if (typeof cb !== 'function') cb = noop;
      if (!need()) return cb({ ok: false, err: '방에 들어가 있지 않습니다' });
      const room = ctx.room;
      if (room.host !== ctx.player) return cb({ ok: false, err: '방장만 시작할 수 있습니다' });
      if (room.phase !== 'lobby') return cb({ ok: false, err: '이미 진행 중입니다' });
      const st = room.lobbyState();
      if (!st.valid) return cb({ ok: false, err: st.warn || lobbyMessage(room.players.length) || '인원이 맞지 않습니다' });
      if (!st.canStart) return cb({ ok: false, err: '모든 플레이어가 준비 완료여야 시작할 수 있습니다' });
      room.start();
      cb({ ok: true });
    });

    socket.on('room:map', (data) => {
      if (!need() || ctx.room.phase !== 'lobby' || ctx.room.host !== ctx.player) return;
      const id = String((data && data.map) || '');
      if (MAP_LIST.includes(id)) { ctx.room.mapId = id; ctx.room.sendLobby(); }
    });

    socket.on('room:again', () => {
      if (!need() || ctx.room.phase !== 'finished') return;
      ctx.room.game = null; ctx.room.phase = 'lobby'; ctx.room.msg = '';
      ctx.room.players.forEach((p) => { p.ready = false; p.slot = -1; });
      ctx.room.broadcast('game:abort', { msg: '' });
      ctx.room.sendLobby();
    });

    socket.on('room:leave', () => {
      if (!need()) return;
      const { room, player } = ctx;
      ctx.room = null; ctx.player = null;
      player.connected = false; player.socket = null;
      room.removePlayer(player);
    });

    socket.on('input', (data) => {
      if (!need()) return;
      const { room, player } = ctx;
      if (room.phase !== 'playing' || !room.game || player.slot < 0) return;
      const nowMs = this.now();
      if (nowMs - player.rateT > 1000) { player.rateT = nowMs; player.rate = 0; }
      if (++player.rate > 240) return;
      const m = typeof data === 'number' ? data : data && data.m;
      if (!Number.isFinite(m)) return;
      room.game.setKeys(player.slot, m | 0);
    });

    socket.on('suicide', (down) => {
      if (!need()) return;
      const { room, player } = ctx;
      if (room.phase === 'playing' && room.game && player.slot >= 0) room.game.setSuicide(player.slot, !!down);
    });

    // 개발 모드 (방을 ?debug 로 만든 경우에만)
    socket.on('debug', (data) => {
      if (!need() || !ctx.room.debug || !ctx.room.game || !data) return;
      const g = ctx.room.game;
      if (data.cmd === 'tp' && Number.isFinite(data.s)) g.debugTeleport(Math.max(0, Math.min(g.map.length - 5, data.s)));
      else if (data.cmd === 'god') g.debugGod(data.on);
      else if (data.cmd === 'fuel') g.sim.fuel = 100;
    });

    socket.on('ping2', (t, cb) => { if (typeof cb === 'function') cb(Date.now()); });

    socket.on('disconnect', () => {
      if (!need()) return;
      const { room, player } = ctx;
      if (player.socket !== socket) return;      // 이미 다른 소켓으로 재접속함
      room.onDisconnect(player);
    });
  }
}
