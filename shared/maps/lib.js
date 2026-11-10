// 맵 빌더: 정적 충돌체(statics), 동적 장애물(dynamics), 시각 장식(decor), 지면, 체크포인트, 충전 구역(pad),
// 비행 구간(flights)을 한 번에 등록한다. 좌표는 (s=도로 진행 거리, x=좌우, y=높이)로 쓰고 월드 z = -s 로 변환한다.
//
// 원칙: "보이는 것 = 닿으면 터지는 것". 장식(decor)으로 그린 구조물은 반드시 같은 자리에 충돌체가 있고,
// 충돌체가 있는 자리는 반드시 그려진다. (예전에는 장벽 decor 의 두께 t 가 종류 t 를 덮어써서 장벽이 안 보였다)
import { makeBox, makeSphere } from '../collision.js';
import { makeRng, m3MulV, rotY } from '../math.js';
import { VEH, VEH_COLORS } from '../vehicles.js';
import { entityZRange } from '../obstacles.js';

const NO_ZONE_CHECK = new Set(['lamp', 'tree', 'prop', 'ledge', 'bldg', 'building']);
export const CAR_HALF_H = 0.55;       // 질량중심 ~ 지붕/바퀴 바닥 거리
export const CORR = 16.6;             // 인도 끝(건물 벽 바로 안쪽)

export class MapBuilder {
  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.statics = []; this.dynamics = []; this.decor = []; this.checkpoints = []; this.pads = [];
    this.flights = []; this.hints = []; this.sections = []; this.zones = []; this.warnings = []; this.ceils = [];
    this.defaults = []; this.overrides = [];
    this.nextId = 1; this.cur = 0; this.flightCount = {};
  }

  // ───────── 기본 ─────────
  begin(idx, name, s0, s1, theme = {}, ground = {}) {
    this.cur = idx;
    this.sections.push({ idx, name, s0, s1, theme });
    this.defaults.push({ s0, s1, props: { y: 0, solid: true, half: 16.5, wall: 16.5, ...ground } });
  }
  secOf(s) { for (const q of this.sections) if (s >= q.s0 && s < q.s1) return q; return this.sections[this.sections.length - 1]; }
  warn(msg) { this.warnings.push(`[구간${this.cur}] ${msg}`); }
  zone(s0, s1, kind) { this.zones.push({ s0, s1, kind }); }
  checkFree(s0, s1, what) {
    if (NO_ZONE_CHECK.has(what)) return;
    for (const z of this.zones) if (s1 > z.s0 && s0 < z.s1) { this.warn(`${what} (s=${s0.toFixed(0)}~${s1.toFixed(0)})가 안전지대(${z.kind} ${z.s0.toFixed(0)}~${z.s1.toFixed(0)})와 겹침`); return; }
  }
  box(s, x, y, hx, hy, hz, tag, yaw = 0) {
    const b = makeBox(x, y, -s, hx, hy, hz, yaw);
    b.tag = tag; b.sec = this.cur; if (this.fid) b.fid = this.fid;
    this.statics.push(b);
    if (Math.abs(x) - hx < 12.3) this.checkFree(s - hz, s + hz, tag);
    return b;
  }
  sph(s, x, y, r, tag) { const b = makeSphere(x, y, -s, r); b.tag = tag; b.sec = this.cur; this.statics.push(b); this.checkFree(s - r, s + r, tag); return b; }
  dyn(type, p) {
    const e = Object.assign({ type, id: this.nextId++, sec: this.cur }, p);
    e.zr = entityZRange(e);
    this.dynamics.push(e);
    this.checkFree(-e.zr[1], -e.zr[0], type);
    return e;
  }
  // 장식 추가. 주의: o 에 t 라는 키를 넣으면 종류(t)를 덮어쓰므로 두께는 th 로 쓴다.
  add(t, o) { const d = Object.assign({ sec: this.cur }, o, { t }); this.decor.push(d); return d; }

  // ───────── 지면 ─────────
  ground(s0, s1, props) { this.overrides.push({ s0, s1, props }); }
  // s 위치의 지면 속성(기본 + 덮어쓰기)
  groundAt(s) {
    let p = null;
    for (const d of this.defaults) if (s >= d.s0 && s < d.s1) p = { ...d.props };
    if (!p) p = { ...(this.defaults[0] ? this.defaults[0].props : { y: 0, solid: true, half: 16.5, wall: 16.5 }) };
    for (const o of this.overrides) if (s >= o.s0 && s < o.s1) Object.assign(p, o.props);
    return p;
  }
  finalizeGround(len) {
    const cuts = new Set([-80, len + 200]);
    for (const d of this.defaults) { cuts.add(d.s0); cuts.add(d.s1); }
    for (const o of this.overrides) { cuts.add(o.s0); cuts.add(o.s1); }
    const pts = [...cuts].sort((a, b) => a - b);
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], mid = (a + b) / 2;
      let props = { y: 0, solid: true, half: 16.5, wall: 16.5 };
      const first = this.defaults[0], last = this.defaults[this.defaults.length - 1];
      if (mid < first.s0) props = { ...first.props }; else if (mid >= last.s1) props = { ...last.props };
      for (const d of this.defaults) if (mid >= d.s0 && mid < d.s1) props = { ...d.props };
      for (const o of this.overrides) if (mid >= o.s0 && mid < o.s1) props = { ...props, ...o.props };
      const prev = segs[segs.length - 1];
      if (prev && JSON.stringify(prev.p) === JSON.stringify(props)) prev.s1 = b; else segs.push({ s0: a, s1: b, p: props });
    }
    return segs.map((g) => ({ s0: g.s0, s1: g.s1, ...g.p }));
  }

  // ───────── 체크포인트 / 충전 구역 / 힌트 ─────────
  pad(s0, s1, o = {}) { this.pads.push({ s0, s1, sec: this.cur }); this.zone(s0 - 10, s1 + 8, '충전구역'); this.add('pad', { s0, s1, ...o }); }
  checkpoint(s, o = {}) {
    const id = this.checkpoints.length;
    this.checkpoints.push({ id, s, x: 0, sec: this.cur });
    if (!o.noPad) this.pad(s - 8, s + 32, { cp: id });
    this.add('cp', { s, id, style: o.style });
    return id;
  }
  hint(s0, s1, key) { this.hints.push({ s0, s1, key }); }

  // ───────── 비행 구간 등록 ─────────
  startFlight() { const n = (this.flightCount[this.cur] || 0) + 1; this.fid = `${this.cur}-${n}`; }
  flight(o) {
    const n = (this.flightCount[this.cur] = (this.flightCount[this.cur] || 0) + 1);
    this.fid = null;
    const first = Math.min(...o.bands.map((b) => b.s0)), last = Math.max(...o.bands.map((b) => b.s1));
    const f = {
      id: `${this.cur}-${n}`, sec: this.cur, kind: o.kind, name: `구간${this.cur} · ${o.label}`,
      v0: o.v0 || 9, x: o.x || 0, bands: o.bands, sStart: first - (o.run || 60), sEnd: o.endS || last + 10,
      gap: o.gap || null, platform: o.platform || null, fuelNeed: null,
    };
    this.flights.push(f);
    return f;
  }

  // ───────── 정적 장애물 ─────────
  // 도로+인도를 가로막는 장벽. h=높이, spikes=위쪽 가시 높이, wire=전선 간격(없으면 0)
  wall(s, o = {}) {
    const h = o.h, t = o.t || 1.2, sp = o.spikes || 0, x0 = o.x0 !== undefined ? o.x0 : -CORR, x1 = o.x1 !== undefined ? o.x1 : CORR;
    const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
    this.box(s, cx, h / 2, hx, h / 2, t / 2, 'wall');
    if (sp) this.box(s, cx, h + sp / 2, hx, sp / 2, t / 2 - 0.1, 'spike');
    let wireY = 0;
    if (o.wire) { wireY = h + sp + o.wire; this.box(s, cx, wireY, hx, 0.06, 0.06, 'wire'); }
    this.add('wall', { s, x0, x1, h, th: t, spikes: sp, wireY, style: o.style || this.secOf(s).theme.wall || 'barrier' });
  }
  // 벽 넘기 (벽 + 비행 구간)
  hop(s, h, o = {}) {
    const t = o.t || 1.2, sp = o.spikes || 0, top = h + sp;
    this.startFlight();
    this.wall(s, { h, t, spikes: sp, wire: o.wire, x0: o.x0, x1: o.x1, style: o.style });
    const wg = o.wire || 0;
    this.flight({ kind: 'hop', label: o.label || `장벽 ${h.toFixed(1)}m${sp ? '+가시' : ''}${wg ? '+전선' : ''}`, v0: o.v0 || 9,
      bands: [{ s0: s - 3.4, s1: s + t + 3.4, lo: top + 1.0, hi: wg ? top + wg - 0.95 : Infinity }], endS: s + t + 14, run: o.run });
  }
  // 도로가 끊긴 틈(날아서 건너기)
  gapFlight(s, len, o = {}) {
    this.checkFree(s - 3, s + len + 3, '도로 끊김');
    this.startFlight();
    this.ground(s, s + len, { solid: false, ref: 0 });
    this.box(s + len + 1.5, 0, -20.45, CORR, 20, 1.5, 'ledge');       // 반대편 절벽 면
    this.box(s - 1.5, 0, -20.45, CORR, 20, 1.5, 'ledge');
    this.add('gap', { s0: s, s1: s + len, style: o.style || this.secOf(s).theme.gap || 'bridge' });
    this.flight({ kind: 'gap', label: o.label || `도로 끊김 ${len}m`, v0: o.v0 || 9, gap: [s, s + len],
      bands: [{ s0: s - 2, s1: s + len - 3.2, lo: 0.6, hi: Infinity }, { s0: s + len - 3.2, s1: s + len + 3.4, lo: 0.95, hi: Infinity }], endS: s + len + 14, run: o.run });
  }
  // 높은 단상 위로 올라타기
  stepFlight(s, len, h, o = {}) {
    this.checkFree(s - 3, s + len, '단상');
    this.startFlight();
    this.ground(s, s + len, { y: h, ref: h });
    this.box(s, 0, h / 2, CORR, h / 2, 0.6, 'wall');
    this.add('step', { s0: s, s1: s + len, h, style: o.style || this.secOf(s).theme.step || 'concrete' });
    this.flight({ kind: 'step', label: o.label || `단상 ${h}m 올라타기`, v0: o.v0 || 9, platform: [s, s + len, h],
      bands: [{ s0: s - 3.2, s1: s + 3.4, lo: h + 1.0, hi: Infinity }], endS: s + Math.min(len, 30), run: o.run });
  }
  // 높은 벽의 창문(포털) 통과
  portal(s, y0, y1, o = {}) {
    const t = o.t || 1.6, H = o.H || 64, x0 = o.x0 !== undefined ? o.x0 : -CORR, x1 = o.x1 !== undefined ? o.x1 : CORR;
    const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
    this.startFlight();
    if (y0 > 0.05) this.box(s, cx, y0 / 2, hx, y0 / 2, t / 2, 'wall');
    this.box(s, cx, (y1 + H) / 2, hx, (H - y1) / 2, t / 2, 'wall');
    this.add('portal', { s, y0, y1, th: t, x0, x1, H, style: o.style || 'sky' });
    this.flight({ kind: 'portal', label: o.label || `창문 통과 ${y0}~${y1}m`, v0: o.v0 || 8,
      bands: [{ s0: s - 3.4, s1: s + t + 3.4, lo: y0 + 0.95, hi: y1 - 0.95 }], endS: s + t + 16, run: o.run });
  }
  // 낮은 천장(터널/실내/캐노피). 가시가 매달려 있으면 spikes>0
  ceiling(s0, s1, y, o = {}) {
    const sp = o.spikes || 0, c = (s0 + s1) / 2, hz = (s1 - s0) / 2;
    const wide = o.wide || 0;
    const b = makeBox(0, y + 2.5, -c, CORR + wide, 2.5, hz); b.tag = 'ceiling'; b.sec = this.cur; this.statics.push(b);
    if (!o.overPads) this.checkFree(s0, s1, '천장');
    if (sp) for (let s = s0 + 2; s < s1 - 1; s += o.every || 3.2) this.box(s, 0, y - sp / 2, CORR, sp / 2, 0.35, 'spike');
    this.ceils.push({ s0, s1, y });
    this.add('ceil', { s0, s1, y, spikes: sp, every: o.every || 3.2, style: o.style || 'tunnel' });
  }
  // 고정 레이저 격자(항상 켜짐). ys 사이의 win번째 틈이 통과 창문
  laserWall(s, ys, o = {}) {
    const x0 = o.x0 !== undefined ? o.x0 : -CORR, x1 = o.x1 !== undefined ? o.x1 : CORR, cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
    this.startFlight();
    for (const y of ys) this.box(s, cx, y, hx, 0.07, 0.07, 'laser');
    this.add('laserfix', { s, ys, x0, x1 });
    const k = o.win || 0, lo = ys[k] + 0.07 + CAR_HALF_H + 0.35, hi = ys[k + 1] !== undefined ? ys[k + 1] - 0.07 - CAR_HALF_H - 0.35 : Infinity;
    this.flight({ kind: 'laser', label: o.label || `레이저 격자 틈 ${ys[k]}~${ys[k + 1]}m`, v0: o.v0 || 8, bands: [{ s0: s - 3.4, s1: s + 3.4, lo, hi }], endS: s + 16, run: o.run });
  }
  pipeRack(s, y, o = {}) {
    this.box(s, 0, y, CORR, 0.6, 0.7, 'pipe');
    this.add('piperack', { s, y, x0: -CORR, x1: CORR });
  }
  arch(s, y) { this.box(s, 0, y, 14.5, 0.8, 0.9, 'cable'); this.add('arch', { s, y }); }
  spikeStrip(s, x0, x1, o = {}) {
    const d = o.d || 1.6, h = o.h || 0.5;
    this.box(s, (x0 + x1) / 2, h / 2, (x1 - x0) / 2, h / 2, d / 2, 'spike');
    this.add('spikes', { s, x0, x1, d, h });
  }
  wireSpan(s, y, o = {}) {
    const x0 = o.x0 !== undefined ? o.x0 : -CORR, x1 = o.x1 !== undefined ? o.x1 : CORR;
    this.box(s, (x0 + x1) / 2, y, (x1 - x0) / 2, 0.07, 0.07, 'wire');
    this.add('wire', { s, y, x0, x1, sparks: !!o.sparks });
  }
  parked(s, x, vk, o = {}) {
    const yaw = o.yaw || 0, R = rotY(yaw), V = VEH[vk];
    for (const b of V.boxes) {
      const off = m3MulV(R, [b[0], b[1], b[2]]);
      const bx = makeBox(x + off[0], off[1], -s + off[2], b[3], b[4], b[5], 0, R);
      bx.tag = o.burn ? 'fire-car' : 'car'; bx.sec = this.cur; this.statics.push(bx);
      this.checkFree(s - V.L / 2, s + V.L / 2, 'car');
    }
    this.add('veh', { s, x, vk, yaw, color: o.color !== undefined ? o.color : this.rng.pick(VEH_COLORS), burn: !!o.burn });
  }
  pillar(s, x, w, h, o = {}) { this.box(s, x, h / 2, w / 2, h / 2, w / 2, o.tag || 'pillar'); this.add('pillar', { s, x, w, h, style: o.style || 'concrete' }); }
  guardrail(s0, s1, side, o = {}) {
    const x = side * (o.x || 11.8), c = (s0 + s1) / 2;
    this.box(c, x, 0.55, 0.12, 0.45, (s1 - s0) / 2, 'rail');
    this.add('rail', { s0, s1, x, style: o.style || 'steel' });
  }

  // ───────── 위로 뛰어넘기(날먹) 방지 구조물 ─────────
  // 모두 "도로를 가로지르는 실제 구조물"이다. 지면 통과로는 항상 지나갈 수 있게 가장 낮은 것도 6.5m 이상에 둔다.
  // 육교 (도심): 상판 y~y+1.3, 양쪽 계단탑은 벽 바깥
  overpass(s, y, o = {}) {
    this.box(s, 0, y + 0.65, CORR + 0.4, 0.65, 2.0, 'overpass');
    this.box(s, 0, y + 2.3, CORR + 0.4, 0.06, 2.0, 'overpass');       // 난간 손잡이(상판 위 1.7m)
    this.add('overpass', { s, y, sign: o.sign || '', color: o.color || '#35f0ff' });
  }
  // 줄(빨랫줄/등불줄/깃발줄/전구줄) 여러 단. ys = 줄 높이 목록. 매달린 빨래/등불이 줄 아래 dy 만큼 내려온다.
  lines(s, ys, o = {}) {
    const kind = o.kind || 'laundry', dy = o.drop !== undefined ? o.drop : (kind === 'lantern' ? 0.9 : kind === 'laundry' ? 1.0 : 0.55);
    for (const y of ys) this.box(s, 0, y - dy / 2, CORR, dy / 2 + 0.05, 0.12, kind === 'laundry' ? 'laundry' : kind === 'lantern' ? 'lantern' : 'bunting');
    this.add('lines', { s, ys, kind, dy, seed: Math.floor(this.rng() * 1e6) });
  }
  // 크레인 지브(붐): 도로 위를 가로지르는 철골 트러스. y=하단 높이, 마스트는 side 쪽 벽 바깥
  jib(s, y, o = {}) {
    const side = o.side || (this.rng.chance(0.5) ? 1 : -1), hook = o.hook || 0, hx = -side * 5;
    this.box(s, 0, y + 0.9, CORR, 0.9, 0.9, 'crane');
    // 갈고리 + 매달린 철근 다발 (보이는 그대로 충돌)
    if (hook) { this.box(s, hx, y - hook / 2, 0.06, hook / 2, 0.06, 'crane'); this.box(s, hx, y - hook - 0.5, 2.4, 0.5, 0.7, 'crane'); }
    this.add('crane', { s, y, side, x: side * (o.x || 24), hook, hx, top: y + 9 });
  }
  // 고층 연결 통로(스카이브리지): y0~y0+h
  skybridge(s, y0, h = 4, o = {}) {
    this.box(s, 0, y0 + h / 2, CORR + 0.4, h / 2, (o.d || 4) / 2, 'skybridge');
    this.add('skybridge', { s, y: y0, h, d: o.d || 4, hue: o.hue !== undefined ? o.hue : Math.floor(this.rng() * 360) });
  }
  // 대형 전광판 다리(도로 위 LED 스크린): y0~y1
  banner(s, y0, y1, o = {}) {
    this.box(s, 0, (y0 + y1) / 2, CORR, (y1 - y0) / 2, 0.5, 'banner');
    this.add('banner', { s, y0, y1, text: o.text || 'TEMU', hue: o.hue !== undefined ? o.hue : Math.floor(this.rng() * 360) });
  }
  // 고압 송전선: 양쪽 철탑(벽 바깥) + 여러 단 전선
  powerline(s, ys, o = {}) {
    for (const y of ys) this.box(s, 0, y, CORR + 6, 0.09, 0.09, 'wire');
    this.box(s, 18.5, ys[ys.length - 1] / 2 + 1, 1.4, ys[ys.length - 1] / 2 + 1, 1.4, 'pylon');
    this.box(s, -18.5, ys[ys.length - 1] / 2 + 1, 1.4, ys[ys.length - 1] / 2 + 1, 1.4, 'pylon');
    this.add('powerline', { s, ys });
  }
  // 공장 배관/컨베이어 다리 (y 높이, kind: pipe|conveyor)
  pipeBridge(s, y, o = {}) {
    this.box(s, 0, y, CORR, o.kind === 'conveyor' ? 0.9 : 0.7, o.kind === 'conveyor' ? 1.6 : 0.8, o.kind === 'conveyor' ? 'conveyor' : 'pipe');
    this.add('pipebridge', { s, y, kind: o.kind || 'pipe' });
  }

  // ───────── 옆 건물 (보이는 그대로 충돌) ─────────
  // 건물 1채: 도로 쪽 면이 x0(기본 17). 단(tier)은 여기서 정해 클라이언트와 공유한다.
  // 그 자리의 옆벽(wall)이 wallTop 보다 높은 부분을 막지 못하면, 건물 단마다 충돌 상자를 추가한다.
  building(s, side, w, d, h, o = {}) {
    const rng = this.rng, x0 = o.x0 || 17, hz = w / 2, base = o.base || 0;
    const h0 = o.flat ? h : Math.min(h, 20 + rng() * 18), h1 = o.flat ? h : Math.max(h0, Math.min(h, 44 + rng() * 20));
    const tiers = [[0, h0, 0, 0, 0]];
    if (h > h0) tiers.push([h0, h1, 1.0, 0, 1.2]);
    if (h > h1) tiers.push([h1, h, 2.6, 2.4, 3.0]);
    const g = this.groundAt(s), wt = g.wallTop === undefined ? Infinity : g.wallTop, wh = g.wall;
    const covered = Number.isFinite(wh) && wh <= x0 + 0.05 && !Number.isFinite(wt) ? true : false;
    if (!covered) {
      for (const [y0, y1, si, ri, bi] of tiers) {
        const yb = Number.isFinite(wh) && wh <= x0 + 0.05 ? Math.max(y0, wt) : y0;
        if (y1 <= yb) continue;
        const xa = x0 + ri, xb = x0 + d - bi;
        const b = makeBox(side * (xa + xb) / 2, base + (yb + y1) / 2, -s, (xb - xa) / 2, (y1 - yb) / 2, hz - si);
        b.tag = 'building'; b.sec = this.cur; this.statics.push(b);
      }
    }
    return this.add('bldg', { s, side, w: w - 1.2, d, h, x0, tiers, base, style: o.style || 'city', seed: Math.floor(rng() * 1e9), tex: o.tex !== undefined ? o.tex : rng.int(0, 3), neon: rng.chance(o.neon || 0.3), roof: rng.int(0, 3), shop: o.shop !== undefined ? o.shop : rng() < 0.75 });
  }
  // 한쪽 줄의 건물들을 s0~s1 에 빈틈 없이 채운다
  buildingRow(s0, s1, side, o = {}) {
    const rng = this.rng, skip = o.skip || [];
    let s = s0;
    while (s < s1) {
      const w = Math.min(rng.range(o.wmin || 18, o.wmax || 40), Math.max(8, s1 - s));
      const a = s, b = s + w;
      const hit = skip.find(([p, q]) => b > p && a < q);
      if (hit) { s = hit[1]; continue; }
      this.building((a + b) / 2, side, w, rng.range(o.dmin || 24, o.dmax || 44), rng.range(o.hmin || 46, o.hmax || 150), o);
      s = b;
    }
  }

  // ───────── 도시 소품 ─────────
  lamp(s, side) {
    this.box(s, side * 13.9, 4.5, 0.17, 4.5, 0.17, 'lamp');
    this.box(s, side * 12.4, 8.95, 1.5, 0.1, 0.12, 'lamp');
    this.add('lamp', { s, side });
  }
  tree(s, side, o = {}) {
    const x = side * (o.x || 15.3);
    this.box(s, x, 1.7, 0.3, 1.7, 0.3, 'tree');
    this.sph(s, x, 5.0, 2.3, 'tree');
    this.add('tree', { s, side, x, kind: o.kind || 'round', seed: Math.floor(this.rng() * 1e6) });
  }
  signal(s, o = {}) {
    for (const side of [-1, 1]) this.box(s, side * 13.7, 3.3, 0.25, 3.3, 0.25, 'gantry');
    this.box(s, 0, 6.6, 13.7, 0.3, 0.25, 'gantry');
    for (const x of [-6.5, 6.5]) this.box(s, x, 5.7, 0.38, 0.6, 0.3, 'gantry');
    this.add('signal', { s, sign: !!o.sign });
  }
  busStop(s, side) { this.box(s, side * 14.6, 1.4, 1.0, 1.4, 2.5, 'prop'); this.add('busstop', { s, side }); }
  subway(s, side) { this.box(s, side * 14.8, 1.6, 1.3, 1.6, 1.8, 'prop'); this.add('subway', { s, side }); }
  billboard(s, side, o = {}) {
    this.box(s, side * 14.6, 6, 0.25, 6, 0.25, 'prop');
    this.box(s, side * 14.6, 11.5, 0.3, 2.3, 4.2, 'prop');
    this.add('billboard', { s, side, text: o.text || 'TEMU', hue: o.hue !== undefined ? o.hue : Math.floor(this.rng() * 360) });
  }
  sign(s, side, text, o = {}) { this.add('sign', { s, side, text, color: o.color || '#39ff88', big: !!o.big }); }
  crosswalk(s) { this.add('xwalk', { s }); }
  intersection(s, o = {}) { this.add('xstreet', { s, w: o.w || 22 }); }

  // 도시 거리: 가로등/가로수/신호등/횡단보도/정류장/광고판 (+선택: 건물 줄)
  street(s0, s1, o = {}) {
    const rng = this.rng, inter = o.intersections || [];
    const near = (s, pad) => inter.some((i) => Math.abs(i - s) < pad);
    if (o.lamps !== false) for (let s = s0 + 14, k = 0; s < s1 - 4; s += o.lampEvery || 34, k++) this.lamp(s, k % 2 ? 1 : -1);
    if (o.trees) for (let s = s0 + 20; s < s1 - 4; s += o.treeEvery || 26) for (const side of [-1, 1]) if (!near(s, 14) && rng.chance(0.8)) this.tree(s + rng.range(-3, 3), side);
    for (const i of inter) { this.intersection(i); this.crosswalk(i - 14); this.crosswalk(i + 14); if (o.signals !== false) this.signal(i + 18); }
    if (o.busstops) for (let s = s0 + 60; s < s1 - 30; s += o.busEvery || 190) if (!near(s, 30) && !this.inZone(s - 3, s + 3)) this.busStop(s, rng.chance(0.5) ? 1 : -1);
    if (o.subway) for (let s = s0 + 120; s < s1 - 30; s += o.subEvery || 300) if (!near(s, 30)) this.subway(s, rng.chance(0.5) ? 1 : -1);
    if (o.billboards) for (let s = s0 + 40; s < s1 - 30; s += o.billEvery || 120) { const side = rng.chance(0.5) ? 1 : -1; this.billboard(s, side, { text: rng.pick(o.billTexts || ['TEMU', 'NEON', 'RAMEN', 'HOTEL', 'CINEMA', 'TAXI', 'BANK', 'OPEN 24']) }); }
    if (o.buildings) {
      const skip = inter.map((i) => [i - 12, i + 12]);
      for (const side of [-1, 1]) this.buildingRow(s0 - rng.range(0, 10), s1, side, { ...o, skip });
    }
  }
  inZone(a, b) { return this.zones.some((z) => b > z.s0 && a < z.s1); }

  // ───────── 동적 장애물 편의 함수 (s → z 변환) ─────────
  birds(s, o) { return this.dyn('birds', { z0: -s, n: 7, spread: 1.2, pat: 'sine', per: 7, ph: 0, r: 0.5, kind: 'dove', ...o }); }
  laserTrip(s, o) { return this.dyn('laser', { mode: 'trip', z: -s, x0: -CORR, x1: CORR, ys: [1.0], ...o }); }
  laserScan(s, o) { return this.dyn('laser', { mode: 'scan', z: -s, x: -12, y: 0.9, L: 25, a0: 0, w: 0.9, arms: 1, ...o }); }
  laserGrid(s, o) { return this.dyn('laser', { mode: 'grid', z: -s, x0: -CORR, x1: CORR, H: 12, gw: 7, gh: 3, cx: 0, ax: 7, cy: 2, ay: 0, per: 6, ...o }); }
  vents(s, o) { return this.dyn('column', { kind: 'fire', z: -s, n: 1, x0: 0, dx: 2.4, H: 7, w: 2.0, P: 5, on: 1.4, warn: 1.1, ph: 0, phStep: 0, ...o }); }
  fireRain(s0, s1, o) { return this.dyn('rain', { z0: -s0, z1: -s1, x0: -11, x1: 11, P: 3.2, cnt: 3, fall: 1.5, Y0: 28, r: 0.9, ph: 0, seed: this.nextId * 31, ...o }); }
  traffic(s, o) { return this.dyn('traffic', { z0: -s, dir: 1, v: 12, P: 12, len: 120, ph: 0, vk: 'sedan', color: this.rng.pick(VEH_COLORS), x: -6, ...o }); }
  crossTraffic(s, o) { return this.dyn('traffic', { ax: 'x', z0: -s, xs: -48, dir: 1, v: 11, P: 9, len: 96, ph: 0, vk: 'bus', color: this.rng.pick(VEH_COLORS), ...o }); }
  ceilPlate(s, o) { return this.dyn('ceil', { z: -s, x0: -12, x1: 12, d: 3, yTop: 12, yHigh: 6, yLow: 0, P: 6, hold: 3, drop: 0.35, stay: 0.7, rise: 1.4, ph: 0, ...o }); }
  saw(s, o) { return this.dyn('saw', { z: -s, x0: -10, x1: 10, y: 1.1, r: 1.15, per: 6, ph: 0, ...o }); }
  ball(s, o) {
    const e = this.dyn('ball', { z: -s, px: 0, py: 20, L: 15, amp: 0.95, per: 4.6, ph: 0, axis: 'x', r: 2.2, ...o });
    if (e.kind !== 'coffin') {      // 철거 크레인 기둥 + 팔 (화면에 그려지는 그대로 충돌)
      this.box(s, -15.6, (e.py + 3) / 2, 0.6, (e.py + 3) / 2, 0.6, 'crane');
      const jl = Math.abs(e.px + 15.6) + 1; this.box(s, -15.6 + jl / 2, e.py + 0.3, jl / 2, 0.3, 0.3, 'crane');
    }
    return e;
  }
  debris(s, o) { return this.dyn('debris', { z0: -s, x0: 0, xr: 18, zs: 8, y0: 32, P: 4, n: 1, ph: 0, size: [0.9, 0.6, 0.9], kind: 'ac', seed: this.nextId * 17, ...o }); }
  press(s, o) { return this.dyn('press', { z: -s, d: 5, hgt: 7, xo: 13, gapMax: 22, gapMin: 0.8, P: 9, open: 4, close: 0.6, closed: 1.4, openT: 1.5, ph: 0, ...o }); }
  train(s, o) { const e = this.dyn('train', { z: -s, P: 26, ph: 0, v: 24, cars: 5, carLen: 11, warn: 3.2, ...o }); for (const sd of [-1, 1]) this.box(s - 4, sd * 12.9, 1.7, 0.15, 1.7, 0.15, 'gantry'); return e; }
  barrels(s, o) { return this.dyn('barrels', { z: -s, ax: 'x', xs: -15, dir: 1, v: 8, len: 32, r: 0.62, P: 4, ph: 0, ...o }); }
  drone(s, o) { return this.dyn('drone', { cz: -s, cx: 0, cy: 8, ax: 9, ay: 2, az: 6, per: 9, ph: 0, r: 0.9, ...o }); }
  barricade(s, o) { return this.dyn('barricade', { z: -s, x0: -8, x1: 8, w: 3.2, h: 1.4, per: 6, ph: 0, ...o }); }
  // 놀이공원 전용
  wheel(s, o) { return this.dyn('wheel', { z: -s, cx: 0, cy: 22, R: 19, n: 12, w: 0.12, ph: 0, gs: [1.3, 1.1, 1.3], hue: 200, ...o }); }
  coaster(s, o) { return this.dyn('coaster', { z: -s, y: 6, dir: 1, v: 26, P: 6, ph: 0, cars: 4, len: 70, hue: 330, ...o }); }
  swing(s, o) { return this.dyn('swing', { z: -s, py: 16, L: 12, amp: 1.0, per: 5.2, ph: 0, hw: 5.5, ...o }); }
  carousel(s, o) { return this.dyn('carousel', { z: -s, cx: 0, R: 9, n: 8, w: 0.5, ph: 0, y: 1.3, bob: 0.9, ...o }); }

  // 정차 차량 슬라롬: 매 행마다 gapW 폭의 통로가 좌우로 움직인다
  slalom(s0, s1, o = {}) {
    const rng = this.rng, step = o.step || 24, gapW = o.gapW || 8, lanes = o.lanes || [-10, -6, -2, 2, 6, 10];
    let g = o.start !== undefined ? o.start : rng.range(-6, 6), dir = rng.chance(0.5) ? 1 : -1;
    for (let s = s0; s <= s1; s += step) {
      for (const xc of lanes) {
        if (Math.abs(xc - g) < gapW / 2 + 1.3) continue;
        const vk = rng.pick(o.kinds || ['sedan', 'sedan', 'suv', 'taxi', 'sedan', 'police']);
        this.parked(s + rng.range(-1.5, 1.5), xc + rng.range(-0.35, 0.35), vk, { yaw: rng.range(-0.1, 0.1) + (rng.chance(0.15) ? Math.PI : 0), burn: o.burn ? rng.chance(o.burn) : false });
      }
      const maxShift = Math.min(step * 0.3, o.maxShift || 7.5);
      g += dir * rng.range(maxShift * 0.5, maxShift);
      if (g > 7.5) { g = 7.5; dir = -1; } else if (g < -7.5) { g = -7.5; dir = 1; }
      if (rng.chance(0.3)) dir = -dir;
    }
  }
  // 상자 장애물 슬라롬(가판대/화물 등 정적 상자). kinds = [[hx,hy,hz,deco], ...]
  boxSlalom(s0, s1, o = {}) {
    const rng = this.rng, step = o.step || 22, gapW = o.gapW || 8.5, lanes = o.lanes || [-10, -5.5, -1, 3.5, 8, 11.5];
    let g = o.start !== undefined ? o.start : rng.range(-6, 6), dir = rng.chance(0.5) ? 1 : -1;
    for (let s = s0; s <= s1; s += step) {
      for (const xc of lanes) {
        if (Math.abs(xc - g) < gapW / 2 + 1.6) continue;
        const k = rng.pick(o.kinds), ss = s + rng.range(-1.2, 1.2), x = xc + rng.range(-0.3, 0.3);
        this.box(ss, x, k[1], k[0], k[1], k[2], o.tag || 'prop');
        this.add('crate', { s: ss, x, hx: k[0], hy: k[1], hz: k[2], kind: k[3] || o.kind || 'crate', hue: Math.floor(rng() * 360) });
      }
      g += dir * rng.range(3, 6.5);
      if (g > 7.5) { g = 7.5; dir = -1; } else if (g < -7.5) { g = -7.5; dir = 1; }
      if (rng.chance(0.3)) dir = -dir;
    }
  }
}
