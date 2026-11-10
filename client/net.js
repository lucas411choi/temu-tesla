// 네트워크: 서버 깨우기(/health) → Socket.IO 연결 → 상태 보간(Interp)
import { qSlerp } from '../shared/math.js';

export class Net {
  constructor() { this.socket = null; this.handlers = {}; this.session = null; try { this.session = JSON.parse(sessionStorage.getItem('tt-session') || 'null'); } catch (e) { /* ignore */ } }

  // Render 무료 플랜은 잠들어 있을 수 있어서 /health 가 응답할 때까지 기다린다
  async waitServer(onStatus) {
    const t0 = performance.now();
    for (let i = 0; ; i++) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch('/health', { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
        if (r.ok) return true;
      } catch (e) { /* 아직 깨는 중 */ }
      const sec = Math.round((performance.now() - t0) / 1000);
      onStatus(sec);
      if (sec > 150) return false;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (typeof window.io !== 'function') return reject(new Error('Socket.IO 클라이언트를 불러오지 못했습니다'));
      const s = window.io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 700, reconnectionDelayMax: 3000 });
      this.socket = s;
      s.on('connect', () => { const again = this.everConnected; this.everConnected = true; this.fire('connected', { again }); resolve(); if (again && this.session) this.rejoin(); });
      s.on('disconnect', (why) => this.fire('disconnected', why));
      s.on('connect_error', (e) => { this.fire('connect_error', e); });
      for (const ev of ['room:state', 'game:init', 'game:pause', 'game:resume', 'game:abort', 'game:end', 'snap', 'evt', 'hello']) s.on(ev, (d) => this.fire(ev, d));
    });
  }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  fire(ev, d) { (this.handlers[ev] || []).forEach((fn) => fn(d)); }
  call(ev, data) { return new Promise((res) => this.socket.emit(ev, data, res)); }
  save(code, token) { this.session = { code, token }; try { sessionStorage.setItem('tt-session', JSON.stringify(this.session)); } catch (e) { /* ignore */ } }
  clear() { this.session = null; try { sessionStorage.removeItem('tt-session'); } catch (e) { /* ignore */ } }
  async create(name, debug, size, map) { const r = await this.call('room:create', { name, debug, size, map }); if (r.ok) this.save(r.code, r.token); return r; }
  async join(code, name) { const r = await this.call('room:join', { code, name }); if (r.ok) this.save(r.code, r.token); return r; }
  async rejoin() { if (!this.session) return { ok: false }; const r = await this.call('room:rejoin', this.session); if (!r.ok) this.clear(); else this.fire('rejoined', r); return r; }
  send(ev, d) { if (this.socket) this.socket.emit(ev, d); }
}

// 서버 스냅샷(30Hz)을 약 0.12초 늦춰서 부드럽게 보간한다. 장애물도 같은 시간축(T)으로 그려 서버와 일치시킨다.
export class Interp {
  constructor() { this.reset(); this.delay = 0.12; }
  reset() { this.buf = []; this.off = null; }
  push(s, now) {
    const o = now - s.T;
    this.off = this.off === null ? o : (o < this.off ? o : this.off + (o - this.off) * 0.01);
    this.buf.push(s);
    if (this.buf.length > 40) this.buf.shift();
    this.lastRecv = now;
  }
  get(now, paused) {
    const b = this.buf;
    if (!b.length) return null;
    const last = b[b.length - 1];
    let Tr = paused ? last.T : Math.min(now - this.off - this.delay, last.T + 0.2);
    if (Tr <= b[0].T) return this.pack(b[0], b[0], 0, b[0].T);
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].T <= Tr) {
        const a = b[i - 1], c = b[i], span = c.T - a.T || 1e-6;
        let k = Math.min(1.25, (Tr - a.T) / span);
        const jump = Math.hypot(c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]) > 12;
        return this.pack(a, c, jump ? 1 : k, Tr);
      }
    }
    return this.pack(last, last, 0, last.T);
  }
  pack(a, b, k, T) {
    const L = (x, y) => x + (y - x) * k;
    const q = qSlerp(a.q, b.q, Math.min(1, k));
    return {
      T, p: [L(a.p[0], b.p[0]), L(a.p[1], b.p[1]), L(a.p[2], b.p[2])], q, v: [L(a.v[0], b.v[0]), L(a.v[1], b.v[1]), L(a.v[2], b.v[2])],
      f: b.f, lk: b.lk, ex: b.ex, k: b.k, cp: b.cp, d: b.d, el: b.el, inv: b.inv, ph: b.ph, cd: b.cd, g: b.g,
    };
  }
}
