// 서버 권위형 게임 시뮬레이션 (방 하나 = Game 하나)
// 카운트다운 → 주행 → (폭발 → 2.5초 뒤 체크포인트 부활, 2초 무적) → 도착
import { CFG } from '../shared/config.js';
import { getMap } from '../shared/mapData.js';
import { createWorld } from '../shared/world.js';
import { CarSim } from '../shared/sim.js';
import { layoutFor } from '../shared/keys.js';

export const DT = 1 / CFG.TICK_HZ;
export const PHASE = { COUNTDOWN: 0, RUNNING: 1, DEAD: 2, FINISHED: 3 };

export class Game {
  constructor(mapId, n) {
    this.map = getMap(mapId);
    this.world = createWorld(this.map);
    this.n = n;
    this.layout = layoutFor(n);
    this.keys = new Array(n).fill(0);
    this.hold = new Array(n).fill(0);
    this.holdDown = new Array(n).fill(false);
    this.sim = new CarSim(this.world);
    this.T = 0; this.elapsed = 0;
    this.phase = PHASE.COUNTDOWN; this.countdown = CFG.RULES.countdown;
    this.cp = 0; this.deaths = 0; this.invuln = 0; this.deadTimer = 0; this.god = false;
    this.progress = 0;           // 경로를 따라 간 거리 (위아래로 겹친 경로에서 앞쪽으로 건너뛰지 않게 연속성을 유지)
    this.events = [];
    this.result = null;
    this.respawnAt(0);
  }
  // 경로 위 s 지점에 경로 방향으로 차를 놓는다
  placeAt(s) {
    const tr = this.world.track;
    if (!tr) { let gy = this.world.groundY(0, -s); if (!Number.isFinite(gy)) gy = 0; this.sim.spawn(0, gy + 0.56, -s, 0); this.progress = s; return; }
    const p = tr.point(s, 0, 0);
    this.sim.spawn(p[0], p[1] + 0.56, p[2], -tr.headingAt(s));
    this.progress = s;
  }
  respawnAt(i) { this.placeAt(this.map.checkpoints[i].s + 1.5); }
  // 서버가 각 플레이어에게 허용된 키만 받는다 (치팅 방지). 9비트: 바퀴 4 + 배출구 4 + 브레이크
  setKeys(slot, mask) { if (slot >= 0 && slot < this.n) this.keys[slot] = (mask & 0x1ff) & this.layout[slot]; }
  setSuicide(slot, down) { if (slot >= 0 && slot < this.n) { this.holdDown[slot] = !!down; if (!down) this.hold[slot] = 0; } }
  clearKeys(slot) { this.keys[slot] = 0; this.holdDown[slot] = false; this.hold[slot] = 0; }
  combined() { let m = 0; for (const k of this.keys) m |= k; return m; }

  tick() {
    const dt = DT;
    if (this.phase === PHASE.FINISHED) return;
    if (this.phase === PHASE.COUNTDOWN) {
      this.countdown -= dt;
      this.sim.step(0, dt, this.T, false);
      this.T += dt;
      if (this.countdown <= 0) { this.phase = PHASE.RUNNING; this.events.push({ t: 'go' }); }
      return;
    }
    if (this.phase === PHASE.DEAD) {
      this.T += dt; this.elapsed += dt;
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      return;
    }
    this.elapsed += dt;
    for (let i = 0; i < this.n; i++) {
      if (!this.holdDown[i]) continue;
      this.hold[i] += dt;
      if (this.hold[i] >= CFG.RULES.suicideHold) { this.explode('suicide'); this.T += dt; return; }
    }
    const protectedNow = this.invuln > 0 || this.god;
    const hit = this.sim.step(this.combined(), dt, this.T, !protectedNow);
    this.T += dt;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (hit) { this.explode(hit.tag, hit.src ? hit.src.type : null); return; }
    // 경로 진행 거리 → 체크포인트 / 도착
    const c = this.sim.car;
    if (this.world.track) {
      const L = this.world.locate(c.p[0], c.p[1], c.p[2], this.progress);
      if (L && L.s - this.progress < 70 && L.s - this.progress > -70) this.progress = L.s;
    } else this.progress = -c.p[2];
    const s = this.progress, cps = this.map.checkpoints;
    while (this.cp + 1 < cps.length && s >= cps[this.cp + 1].s) {
      this.cp++;
      this.events.push({ t: 'cp', i: this.cp, time: +this.elapsed.toFixed(2) });
    }
    if (s >= this.map.finish.s) {
      this.phase = PHASE.FINISHED;
      this.result = { time: +this.elapsed.toFixed(2), deaths: this.deaths };
      this.events.push({ t: 'finish', ...this.result });
    }
  }

  explode(cause, src = null) {
    const c = this.sim.car;
    this.events.push({ t: 'explode', p: c.p.map((x) => +x.toFixed(2)), v: c.v.map((x) => +x.toFixed(2)), q: c.q.map((x) => +x.toFixed(4)), cause, src, seed: Math.floor(Math.random() * 1e9), n: this.deaths + 1 });
    this.deaths++;
    this.phase = PHASE.DEAD;
    this.deadTimer = CFG.RULES.respawnDelay;
    this.hold.fill(0); this.holdDown.fill(false);
  }
  respawn() {
    this.respawnAt(this.cp);
    this.invuln = CFG.RULES.invuln;
    this.phase = PHASE.RUNNING;
    this.events.push({ t: 'respawn', cp: this.cp });
  }

  // 개발 모드: 원하는 위치로 순간이동
  debugTeleport(s) {
    const cps = this.map.checkpoints;
    let k = 0;
    for (let i = 0; i < cps.length; i++) if (cps[i].s <= s) k = i;
    this.cp = k;
    this.placeAt(s);
    this.invuln = 3;
    if (this.phase === PHASE.DEAD) this.phase = PHASE.RUNNING;
    this.events.push({ t: 'tp', s });
  }
  debugGod(on) { this.god = !!on; }

  drainEvents() { const e = this.events; this.events = []; return e; }

  snapshot() {
    const c = this.sim.car, r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 10000) / 10000;
    return {
      T: Math.round(this.T * 1000) / 1000, ph: this.phase,
      p: [r2(c.p[0]), r2(c.p[1]), r2(c.p[2])], q: [r4(c.q[0]), r4(c.q[1]), r4(c.q[2]), r4(c.q[3])], v: [r2(c.v[0]), r2(c.v[1]), r2(c.v[2])],
      f: Math.round(this.sim.fuel * 10) / 10, lk: this.sim.lock ? 1 : 0, ex: this.sim.exFiring, k: this.keys.slice(),
      cp: this.cp, d: this.deaths, el: Math.round(this.elapsed * 100) / 100, inv: this.invuln > 0 || this.god ? 1 : 0,
      cd: this.phase === PHASE.COUNTDOWN ? Math.ceil(this.countdown) : 0, g: this.sim.grounded ? 1 : 0, s: Math.round(this.progress * 10) / 10,
    };
  }
}
