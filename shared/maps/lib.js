// 맵 빌더 (구불구불한 경로 버전)
//
// 1) 경로를 만든다: run(길이) / turn(각도) / ramp / stepUp / jump(틈) ... → 직선 조각(piece)들이 이어진 '트랙'
// 2) 장애물/장식은 예전처럼 '펼친 좌표' (s=경로 거리, x=옆, y=노면 위 높이)로 놓는다. (z = -s)
// 3) finalize() 가 모든 충돌체를 각 조각의 변환으로 월드에 옮기고, 검증 도구용 '펼친' 사본도 남긴다.
//
// 원칙: "보이는 것 = 닿으면 터지는 것". 도로(노면) 밖은 낭떠러지 → 바닥(floorY)까지 떨어지면 폭발.
import { makeBox, makeSphere } from '../collision.js';
import { makeRng, m3MulV, rotY } from '../math.js';
import { VEH, VEH_COLORS } from '../vehicles.js';
import { entityZRange, entityBounds } from '../obstacles.js';
import { Track, frameOf, toWorld, shapeToWorld, straightGround, arcAt } from '../track.js';

const NO_ZONE_CHECK = new Set(['lamp', 'tree', 'prop', 'ledge', 'bldg', 'building', 'rock', 'tank', 'stack', 'tower', 'crane', 'gate', 'planter']);
export const CAR_HALF_H = 0.55;       // 질량중심 ~ 지붕/바퀴 바닥 거리
export const CORR = 16.6;             // 예전 넓은 도로의 반폭 (기본값)

export class MapBuilder {
  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.statics = []; this.dynamics = []; this.decor = []; this.checkpoints = []; this.pads = [];
    this.flights = []; this.hints = []; this.sections = []; this.zones = []; this.warnings = []; this.ceils = [];
    this.route = []; this.platforms = []; this.sceneryJobs = []; this.foot = [];
    this.cursor = { s: 0, x: 0, z: 0, h: 0, y: 0, w: 9, surf: 'road' };
    this.floorY = -24;
    this.nextId = 1; this.cur = 0; this.flightCount = {};
  }

  // ───────── 구간 ─────────
  begin(idx, name, theme = {}) { this.cur = idx; this.sections.push({ idx, name, s0: this.cursor.s, s1: this.cursor.s, theme }); }
  end() { const q = this.sections[this.sections.length - 1]; q.s1 = this.cursor.s; }
  secOf(s) { for (const q of this.sections) if (s >= q.s0 && s < q.s1) return q; return this.sections[this.sections.length - 1]; }
  warn(msg) { this.warnings.push(`[구간${this.cur}] ${msg}`); }
  zone(s0, s1, kind) { this.zones.push({ s0, s1, kind }); }
  checkFree(s0, s1, what) {
    if (NO_ZONE_CHECK.has(what)) return;
    for (const z of this.zones) if (s1 > z.s0 && s0 < z.s1) { this.warn(`${what} (s=${s0.toFixed(0)}~${s1.toFixed(0)})가 안전지대(${z.kind} ${z.s0.toFixed(0)}~${z.s1.toFixed(0)})와 겹침`); return; }
  }

  // ───────── 경로 만들기 ─────────
  get s() { return this.cursor.s; }
  // 직선 조각. o.w=반폭(이후 기본값이 됨), o.y=끝 높이(경사로), o.surf=노면 종류, o.gap=틈(노면 없음)
  run(L, o = {}) {
    const c = this.cursor, w = o.w !== undefined ? o.w : c.w;
    const p = { s0: c.s, L, x0: c.x, z0: c.z, h: c.h, w, y0: c.y, y1: o.y !== undefined ? o.y : c.y, solid: !o.gap, surf: o.surf || (o.gap ? c.surf : c.surf), sec: this.cur };
    this.route.push(p);
    c.s += L; c.x += Math.sin(c.h) * L; c.z -= Math.cos(c.h) * L; c.y = p.y1;
    if (!o.gap) { c.w = w; if (o.surf) c.surf = o.surf; }
    return [p.s0, p.s0 + L];
  }
  ramp(L, dy, o = {}) { return this.run(L, { ...o, y: this.cursor.y + dy }); }
  // 꺾기: +는 오른쪽, -는 왼쪽 (도). 이음매에는 모서리 판이 깔린다
  // 원호 곡선으로 꺾기: +는 오른쪽, -는 왼쪽 (도). R = 도로 중심선 반지름 (기본: 폭에 맞춰 자동)
  turn(deg, R) {
    const c = this.cursor, th = Math.abs(deg) * Math.PI / 180, d = deg >= 0 ? 1 : -1;
    if (!th) return;
    R = R || Math.max(10, c.w * 1.8);
    const L = R * th;
    const p = { kind: 'arc', s0: c.s, L, x0: c.x, z0: c.z, h: c.h, R, d, th, w: c.w, y0: c.y, y1: c.y, solid: true, surf: c.surf, sec: this.cur };
    p.cx = c.x + d * R * Math.cos(c.h); p.cz = c.z + d * R * Math.sin(c.h);
    this.route.push(p);
    const e = arcAt(p, L);
    c.s += L; c.x = e.x; c.z = e.z; c.h = e.h;
    return [p.s0, p.s0 + L];
  }
  // 헤어핀(180° U턴): 옆 길과 겹치지 않는 가장 작은 반지름
  uturn(dir = 1) { return this.turn(180 * dir, this.cursor.w + 1); }
  surf(name) { this.cursor.surf = name; }
  pieceAt(s) { const R = this.route; for (let i = R.length - 1; i >= 0; i--) if (s >= R[i].s0) return R[i]; return R[0]; }
  wAt(s) { if (!this.route.length || s >= this.cursor.s) return this.cursor.w; return this.pieceAt(s).w; }
  yAt(s) { if (!this.route.length || s >= this.cursor.s) return this.cursor.y; const p = this.pieceAt(s), a = s - p.s0; return p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L)); }
  // 경로 옆의 발판(로컬 좌표: s 중심, x 중심, 길이 len, 반폭 hw, 노면 위 높이 dy)
  platform(s, x, len, hw, dy = 0, o = {}) {
    this.platforms.push({ ls: s, lx: x, len, hw, dy, surf: o.surf || 'deck', sec: this.cur });
    this.add('platform', { s, x, len, hw, dy, style: o.surf || 'deck' });
  }

  box(s, x, y, hx, hy, hz, tag, yaw = 0) {
    const b = makeBox(x, y, -s, hx, hy, hz, yaw);
    b.tag = tag; b.sec = this.cur; if (this.fid) b.fid = this.fid;
    this.statics.push(b);
    if (Math.abs(x) - hx < this.wAt(s) - 1) this.checkFree(s - hz, s + hz, tag);
    return b;
  }
  sph(s, x, y, r, tag) { const b = makeSphere(x, y, -s, r); b.tag = tag; b.sec = this.cur; this.statics.push(b); if (Math.abs(x) - r < this.wAt(s) - 1) this.checkFree(s - r, s + r, tag); return b; }
  dyn(type, p) {
    const e = Object.assign({ type, id: this.nextId++, sec: this.cur }, p);
    e.zr = entityZRange(e);
    this.dynamics.push(e);
    this.checkFree(-e.zr[1], -e.zr[0], type);
    return e;
  }
  // 장식 추가. 주의: o 에 t 라는 키를 넣으면 종류(t)를 덮어쓰므로 두께는 th 로 쓴다.
  add(t, o) { const d = Object.assign({ sec: this.cur }, o, { t }); this.decor.push(d); return d; }

  // ───────── 체크포인트 / 충전 구역 / 힌트 ─────────
  pad(s0, s1, o = {}) { this.pads.push({ s0, s1, sec: this.cur }); this.zone(s0 - 6, s1 + 6, '충전구역'); this.add('pad', { s0, s1, w: this.wAt((s0 + s1) / 2), ...o }); }
  checkpoint(s, o = {}) {
    const id = this.checkpoints.length;
    this.checkpoints.push({ id, s, x: 0, sec: this.cur });
    if (!o.noPad) this.pad(s - 6, s + Math.min(30, o.padLen || 30), { cp: id });
    this.add('cp', { s, id, w: this.wAt(s), style: o.style });
    for (const sd of [-1, 1]) this.anchor(s, sd * (this.wAt(s) + 0.5), 0.3, 8, { tag: 'gate', style: 'steel' });
    return id;
  }
  // 넓은 쉼터(체크포인트 + 충전): 길이 L, 반폭 w
  plaza(L = 44, w = 10, o = {}) { const [a] = this.run(L, { w, surf: o.surf }); this.checkpoint(a + 8, { padLen: Math.max(12, L - 22) }); return [a, a + L]; }
  hint(s0, s1, key) { this.hints.push({ s0, s1, key }); }

  // ───────── 비행 구간 등록 (밴드 높이는 절대 높이) ─────────
  startFlight() { const n = (this.flightCount[this.cur] || 0) + 1; this.fid = `${this.cur}-${n}`; }
  flight(o) {
    const n = (this.flightCount[this.cur] = (this.flightCount[this.cur] || 0) + 1);
    this.fid = null;
    const first = Math.min(...o.bands.map((b) => b.s0)), last = Math.max(...o.bands.map((b) => b.s1));
    const f = {
      id: `${this.cur}-${n}`, sec: this.cur, kind: o.kind, name: `구간${this.cur} · ${o.label}`,
      v0: o.v0 || 9, x: o.x || 0, bands: o.bands, sStart: first - (o.run || 40), sEnd: o.endS || last + 10,
      gap: o.gap || null, platform: o.platform || null, fuelNeed: null,
    };
    this.flights.push(f);
    return f;
  }

  // ───────── 정적 장애물 (경로 위) ─────────
  span(s, o) { const W = this.wAt(s) + 0.1; return [o.x0 !== undefined ? o.x0 : -W, o.x1 !== undefined ? o.x1 : W]; }
  // 받침 기둥: 길 가장자리 밖(낭떠러지 위)에 있는 구조물의 다리를 바닥(floorY)까지 내린다 (보이는 그대로 충돌)
  // s, x = 기둥 위치(로컬), hw = 반폭, top = 기둥 윗면 높이(노면 기준)
  anchor(s, x, hw = 0.4, top = 0, o = {}) {
    if (Math.abs(x) - hw < this.wAt(s) - 0.05) return;            // 길 위에 서 있으면 필요 없음
    const base = this.floorY - this.yAt(s);
    if (top - base < 0.5) return;
    const b = makeBox(x, (base + top) / 2, -s, hw, (top - base) / 2, o.hz || hw); b.tag = o.tag || 'support'; b.sec = this.cur; this.statics.push(b);
    this.add('support', { s, x, hw, hz: o.hz || hw, base, top, style: o.style || 'concrete' });
  }
  // 길을 가로막는 장벽. h=높이, spikes=위쪽 가시 높이, wire=전선 간격
  wall(s, o = {}) {
    const h = o.h, t = o.t || 1.2, sp = o.spikes || 0, [x0, x1] = this.span(s, o);
    const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
    this.box(s, cx, h / 2, hx, h / 2, t / 2, 'wall');
    if (sp) this.box(s, cx, h + sp / 2, hx, sp / 2, t / 2 - 0.1, 'spike');
    let wireY = 0;
    if (o.wire) { wireY = h + sp + o.wire; this.box(s, cx, wireY, hx, 0.06, 0.06, 'wire'); }
    this.add('wall', { s, x0, x1, h, th: t, spikes: sp, wireY, style: o.style || this.secOf(s).theme.wall || 'barrier' });
  }
  // 벽 넘기 (벽 + 비행 구간)
  hop(s, h, o = {}) {
    const t = o.t || 1.2, sp = o.spikes || 0, top = h + sp, base = this.yAt(s);
    this.startFlight();
    this.wall(s, { h, t, spikes: sp, wire: o.wire, x0: o.x0, x1: o.x1, style: o.style });
    const wg = o.wire || 0;
    this.flight({ kind: 'hop', label: o.label || `장벽 ${h.toFixed(1)}m${sp ? '+가시' : ''}${wg ? '+전선' : ''}`, v0: o.v0 || 9,
      bands: [{ s0: s - 3.4, s1: s + t + 3.4, lo: base + top + 1.0, hi: wg ? base + top + wg - 0.95 : Infinity }], endS: s + t + 14, run: o.run });
  }
  // 경로 끊김(날아서 건너기): 지금 커서에서 len 만큼 틈. o.dy = 건너편 높이 차
  jump(len, o = {}) {
    const s = this.cursor.s, y = this.cursor.y, W = this.cursor.w;
    this.startFlight();
    this.run(len, { gap: true });
    if (o.dy) this.cursor.y += o.dy;
    const y2 = this.cursor.y;
    this.box(s - 1.2, 0, -4.6, W, 4, 1.2, 'ledge');                       // 틈 양쪽 절벽 면 (노면 아래)
    this.box(s + len + 1.2, 0, -4.6, o.landW || W, 4, 1.2, 'ledge');
    this.add('gap', { s0: s, s1: s + len, w: W, dy: o.dy || 0, style: o.style || this.secOf(s).theme.gap || 'bridge' });
    this.flight({ kind: 'gap', label: o.label || `틈 ${len}m`, v0: o.v0 || 9, gap: [s, s + len],
      bands: [{ s0: s - 2, s1: s + len - 3.2, lo: Math.min(y, y2) + 0.6, hi: Infinity }, { s0: s + len - 3.2, s1: s + len + 3.4, lo: y2 + 0.95, hi: Infinity }], endS: s + len + 14, run: o.run });
    return [s, s + len];
  }
  // 커서 자리에 높이 h 의 단(벽 면)을 세우고 그 위로 경로가 이어진다 (날아서 올라타기)
  stepUp(h, o = {}) {
    const s = this.cursor.s, y = this.cursor.y;
    this.startFlight();
    this.box(s - 0.61, 0, h / 2, this.cursor.w + 0.1, h / 2, 0.6, 'wall');   // 단의 앞면 (아래 조각 기준 높이)
    this.cursor.y = y + h;
    this.add('step', { s0: s - 0.61, s1: s, h, w: this.cursor.w, style: o.style || this.secOf(s).theme.step || 'concrete' });
    this.flight({ kind: 'step', label: o.label || `단 ${h}m 올라타기`, v0: o.v0 || 9, platform: [s, s + 30, y + h],
      bands: [{ s0: s - 3.2, s1: s + 3.4, lo: y + h + 1.0, hi: Infinity }], endS: s + 26, run: o.run });
  }
  // 높은 벽의 창문(포털) 통과
  portal(s, y0, y1, o = {}) {
    const t = o.t || 1.6, H = o.H || 64, [x0, x1] = this.span(s, o), base = this.yAt(s);
    const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
    this.startFlight();
    if (y0 > 0.05) this.box(s, cx, y0 / 2, hx, y0 / 2, t / 2, 'wall');
    this.box(s, cx, (y1 + H) / 2, hx, (H - y1) / 2, t / 2, 'wall');
    this.add('portal', { s, y0, y1, th: t, x0, x1, H, style: o.style || 'sky' });
    this.flight({ kind: 'portal', label: o.label || `창문 통과 ${y0}~${y1}m`, v0: o.v0 || 8,
      bands: [{ s0: s - 3.4, s1: s + t + 3.4, lo: base + y0 + 0.95, hi: base + y1 - 0.95 }], endS: s + t + 16, run: o.run });
  }
  // 낮은 천장(터널/실내/캐노피). 가시가 매달려 있으면 spikes>0
  ceiling(s0, s1, y, o = {}) {
    const sp = o.spikes || 0, c = (s0 + s1) / 2, hz = (s1 - s0) / 2, W = this.wAt(c) + (o.wide || 0.4);
    const b = makeBox(0, y + 2.5, -c, W, 2.5, hz); b.tag = 'ceiling'; b.sec = this.cur; this.statics.push(b);
    const fl = this.floorY - this.yAt(c);
    if (o.walls !== false) for (const sd of [-1, 1]) { const wb = makeBox(sd * (W + 0.5), (fl + y + 5) / 2, -c, 0.5, (y + 5 - fl) / 2, hz); wb.tag = 'building'; wb.sec = this.cur; this.statics.push(wb); }
    if (!o.overPads) this.checkFree(s0, s1, '천장');
    if (sp) for (let s = s0 + 2; s < s1 - 1; s += o.every || 3.2) this.box(s, 0, y - sp / 2, W, sp / 2, 0.35, 'spike');
    this.ceils.push({ s0, s1, y });
    this.add('ceil', { s0, s1, y, w: W, fl, spikes: sp, every: o.every || 3.2, style: o.style || 'tunnel', walls: o.walls !== false });
  }
  // 고정 레이저 격자(항상 켜짐). ys 사이의 win번째 틈이 통과 창문
  laserWall(s, ys, o = {}) {
    const [x0, x1] = this.span(s, o), cx = (x0 + x1) / 2, hx = (x1 - x0) / 2, base = this.yAt(s);
    this.startFlight();
    for (const y of ys) this.box(s, cx, y, hx, 0.07, 0.07, 'laser');
    this.add('laserfix', { s, ys, x0, x1 });
    const k = o.win || 0, lo = base + ys[k] + 0.07 + CAR_HALF_H + 0.35, hi = ys[k + 1] !== undefined ? base + ys[k + 1] - 0.07 - CAR_HALF_H - 0.35 : Infinity;
    this.flight({ kind: 'laser', label: o.label || `레이저 격자 틈 ${ys[k]}~${ys[k + 1]}m`, v0: o.v0 || 8, bands: [{ s0: s - 3.4, s1: s + 3.4, lo, hi }], endS: s + 16, run: o.run });
  }
  pipeRack(s, y) { const [x0, x1] = this.span(s, {}); this.box(s, 0, y, x1, 0.6, 0.7, 'pipe'); this.add('piperack', { s, y, x0, x1 }); }
  arch(s, y) { const W = this.wAt(s) + 1.5; this.box(s, 0, y, W, 0.8, 0.9, 'cable'); for (const sd of [-1, 1]) this.anchor(s, sd * W, 0.6, y, { tag: 'cable', style: 'steel', hz: 0.8 }); this.add('arch', { s, y, w: W }); }
  spikeStrip(s, x0, x1, o = {}) {
    const d = o.d || 1.6, h = o.h || 0.5;
    this.box(s, (x0 + x1) / 2, h / 2, (x1 - x0) / 2, h / 2, d / 2, 'spike');
    this.add('spikes', { s, x0, x1, d, h });
  }
  wireSpan(s, y, o = {}) {
    const [x0, x1] = this.span(s, o);
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
  // 난간(가장자리 낮은 벽): 떨어짐을 막아 주지만 닿으면 폭발
  guardrail(s0, s1, side, o = {}) {
    const x = side * (o.x !== undefined ? o.x : this.wAt((s0 + s1) / 2) - 0.2), c = (s0 + s1) / 2;
    this.box(c, x, 0.55, 0.12, 0.45, (s1 - s0) / 2, 'rail');
    this.add('rail', { s0, s1, x, style: o.style || 'steel' });
  }

  // ───────── 위로 뛰어넘기(날먹) 방지 구조물: 모두 길 폭에 맞춘다 ─────────
  overpass(s, y, o = {}) {
    const W = this.wAt(s) + 0.4;
    this.box(s, 0, y + 0.65, W, 0.65, 2.0, 'overpass');
    this.box(s, 0, y + 2.3, W, 0.06, 2.0, 'overpass');
    for (const sd of [-1, 1]) this.anchor(s, sd * (W + 1.6), 1.6, y + 2.4, { tag: 'overpass', hz: 2.2 });
    this.add('overpass', { s, y, w: W, sign: o.sign || '', color: o.color || '#35f0ff' });
  }
  lines(s, ys, o = {}) {
    const kind = o.kind || 'laundry', dy = o.drop !== undefined ? o.drop : (kind === 'lantern' ? 0.9 : kind === 'laundry' ? 1.0 : 0.55), W = this.wAt(s) + 0.3;
    for (const y of ys) this.box(s, 0, y - dy / 2, W, dy / 2 + 0.05, 0.12, kind === 'laundry' ? 'laundry' : kind === 'lantern' ? 'lantern' : kind === 'lights' ? 'lights' : 'bunting');
    const tag = kind === 'laundry' ? 'laundry' : kind === 'lantern' ? 'lantern' : kind === 'lights' ? 'lights' : 'bunting';
    for (const sd of [-1, 1]) { this.box(s, sd * (W + 0.2), (ys[ys.length - 1] + 0.5) / 2, 0.18, (ys[ys.length - 1] + 0.5) / 2, 0.18, tag); this.anchor(s, sd * (W + 0.2), 0.18, 0, { tag, style: 'steel' }); }
    this.add('lines', { s, ys, kind, dy, w: W, seed: Math.floor(this.rng() * 1e6) });
  }
  jib(s, y, o = {}) {
    const side = o.side || (this.rng.chance(0.5) ? 1 : -1), hook = o.hook || 0, W = this.wAt(s), hx = -side * Math.min(5, W * 0.4);
    this.box(s, 0, y + 0.9, W + 0.2, 0.9, 0.9, 'crane');
    this.box(s, side * (W + 6), (y + 9) / 2, 1.0, (y + 9) / 2, 1.0, 'crane'); this.anchor(s, side * (W + 6), 1.0, 0, { tag: 'crane', style: 'steel' });
    if (hook) { this.box(s, hx, y - hook / 2, 0.06, hook / 2, 0.06, 'crane'); this.box(s, hx, y - hook - 0.5, 2.4, 0.5, 0.7, 'crane'); }
    this.add('crane', { s, y, side, x: side * (W + 6), w: W, hook, hx, top: y + 9 });
  }
  skybridge(s, y0, h = 4, o = {}) {
    const W = this.wAt(s) + 0.4;
    this.box(s, 0, y0 + h / 2, W, h / 2, (o.d || 4) / 2, 'skybridge');
    for (const sd of [-1, 1]) this.anchor(s, sd * (W + 1.2), 1.2, y0 + h, { tag: 'skybridge', hz: (o.d || 4) / 2 + 0.2 });
    this.add('skybridge', { s, y: y0, h, w: W, d: o.d || 4, hue: o.hue !== undefined ? o.hue : Math.floor(this.rng() * 360) });
  }
  banner(s, y0, y1, o = {}) {
    const W = this.wAt(s);
    this.box(s, 0, (y0 + y1) / 2, W, (y1 - y0) / 2, 0.5, 'banner');
    for (const sd of [-1, 1]) { this.box(s, sd * (W + 0.25), (y1 + 0.2) / 2, 0.2, (y1 + 0.2) / 2, 0.5, 'banner'); this.anchor(s, sd * (W + 0.25), 0.2, 0, { tag: 'banner', style: 'steel', hz: 0.5 }); }
    this.add('banner', { s, y0, y1, w: W, text: o.text || 'TEMU', hue: o.hue !== undefined ? o.hue : Math.floor(this.rng() * 360) });
  }
  powerline(s, ys) {
    const W = this.wAt(s) + 6;
    for (const y of ys) this.box(s, 0, y, W, 0.09, 0.09, 'wire');
    for (const sd of [-1, 1]) { this.box(s, sd * (W - 4), ys[ys.length - 1] / 2 + 1, 1.4, ys[ys.length - 1] / 2 + 1, 1.4, 'pylon'); this.anchor(s, sd * (W - 4), 1.4, 0, { tag: 'pylon', style: 'steel' }); }
    this.add('powerline', { s, ys, w: W });
  }
  pipeBridge(s, y, o = {}) {
    const W = this.wAt(s) + 1;
    this.box(s, 0, y, W, o.kind === 'conveyor' ? 0.9 : 0.7, o.kind === 'conveyor' ? 1.6 : 0.8, o.kind === 'conveyor' ? 'conveyor' : 'pipe');
    for (const sd of [-1, 1]) { this.box(s, sd * (W + 0.5), y / 2, 0.5, y / 2, 0.6, 'pipe'); this.anchor(s, sd * (W + 0.5), 0.5, 0, { tag: 'pipe', style: 'steel', hz: 0.6 }); }
    this.add('pipebridge', { s, y, w: W, kind: o.kind || 'pipe' });
  }

  // ───────── 옆 건물 (보이는 그대로 충돌). 로컬 좌표: 도로 쪽 면 x0, 바닥 base(노면 기준) ─────────
  building(s, side, w, d, h, o = {}) {
    const rng = this.rng, x0 = o.x0 || 17, hz = w / 2, base = o.base || 0;
    const h0 = o.flat ? h : Math.min(h, 20 + rng() * 18), h1 = o.flat ? h : Math.max(h0, Math.min(h, 44 + rng() * 20));
    const tiers = [[0, h0, 0, 0, 0]];
    if (h > h0) tiers.push([h0, h1, 1.0, 0, 1.2]);
    if (h > h1) tiers.push([h1, h, 2.6, 2.4, 3.0]);
    for (const [y0, y1, si, ri, bi] of tiers) {
      const xa = x0 + ri, xb = x0 + d - bi;
      const b = makeBox(side * (xa + xb) / 2, base + (y0 + y1) / 2, -s, (xb - xa) / 2, (y1 - y0) / 2, hz - si);
      b.tag = 'building'; b.sec = this.cur; this.statics.push(b);
    }
    return this.add('bldg', { s, side, w: w - 1.2, d, h, x0, tiers, base, style: o.style || 'city', seed: Math.floor(rng() * 1e9), tex: o.tex !== undefined ? o.tex : rng.int(0, 3), neon: rng.chance(o.neon || 0.3), roof: rng.int(0, 3), shop: o.shop !== undefined ? o.shop : rng() < 0.75 });
  }
  // 풍경 배치 작업: 경로가 다 만들어진 뒤(겹침 검사 가능) 실행된다
  scenery(fn) { this.sceneryJobs.push({ sec: this.cur, fn }); }

  // ───────── 소품 ─────────
  lamp(s, side) {
    const x = side * (this.wAt(s) - 0.35);
    this.box(s, x, 4.5, 0.17, 4.5, 0.17, 'lamp');
    this.box(s, x - side * 1.5, 8.95, 1.5, 0.1, 0.12, 'lamp');
    this.add('lamp', { s, side, x });
  }
  tree(s, side, o = {}) {
    const x = side * (o.x || 15.3);
    this.box(s, x, 1.7, 0.3, 1.7, 0.3, 'tree');
    this.sph(s, x, 5.0, 2.3, 'tree');
    this.add('tree', { s, side, x, kind: o.kind || 'round', seed: Math.floor(this.rng() * 1e6) });
  }
  sign(s, side, text, o = {}) { const x = side * (this.wAt(s) + 1.2); this.anchor(s, x, 0.3, 0, { tag: 'sign', style: 'steel' }); this.add('sign', { s, side, x, text, color: o.color || '#39ff88', big: !!o.big }); }
  billboard(s, side, o = {}) { this.add('billboard', { s, side, x: side * (this.wAt(s) + 2), text: o.text || 'TEMU', hue: o.hue !== undefined ? o.hue : Math.floor(this.rng() * 360) }); }
  // 가로등을 일정 간격으로
  lamps(s0, s1, every = 32) {
    for (let s = s0 + 8, k = 0; s < s1 - 4; s += every, k++) {
      const p = this.pieceAt(s);
      if (!p.solid || p.kind === 'arc' || this.wAt(s) < 3.5 || s - p.s0 < p.w + 3 || p.s0 + p.L - s < p.w + 3) continue;     // 곡선/모서리 근처는 비움
      this.lamp(s, k % 2 ? 1 : -1);
    }
  }
  inZone(a, b) { return this.zones.some((z) => b > z.s0 && a < z.s1); }

  // ───────── 동적 장애물 편의 함수 (s → z 변환) ─────────
  birds(s, o) { return this.dyn('birds', { z0: -s, n: 7, spread: 1.2, pat: 'sine', per: 7, ph: 0, r: 0.5, kind: 'dove', x0: 0, amp: Math.min(9, this.wAt(s)), ...o }); }
  laserTrip(s, o) { const [x0, x1] = this.span(s, {}); return this.dyn('laser', { mode: 'trip', z: -s, x0, x1, ys: [1.0], ...o }); }
  laserScan(s, o) { const W = this.wAt(s); return this.dyn('laser', { mode: 'scan', z: -s, x: -W + 0.5, y: 0.9, L: 2 * W - 1, a0: 0, w: 0.9, arms: 1, ...o }); }
  laserGrid(s, o) { const [x0, x1] = this.span(s, {}); return this.dyn('laser', { mode: 'grid', z: -s, x0, x1, H: 12, gw: 7, gh: 3, cx: 0, ax: Math.max(0, x1 - 4), cy: 2, ay: 0, per: 6, ...o }); }
  vents(s, o) { return this.dyn('column', { kind: 'fire', z: -s, n: 1, x0: 0, dx: 2.4, H: 7, w: 2.0, P: 5, on: 1.4, warn: 1.1, ph: 0, phStep: 0, ...o }); }
  fireRain(s0, s1, o) { const W = this.wAt(s0) - 1; return this.dyn('rain', { z0: -s0, z1: -s1, x0: -W, x1: W, P: 3.2, cnt: 3, fall: 1.5, Y0: 28, r: 0.9, ph: 0, seed: this.nextId * 31, ...o }); }
  traffic(s, o) { return this.dyn('traffic', { z0: -s, dir: 1, v: 12, P: 12, len: 120, ph: 0, vk: 'sedan', color: this.rng.pick(VEH_COLORS), x: -3, ...o }); }
  crossTraffic(s, o) { return this.dyn('traffic', { ax: 'x', z0: -s, xs: -48, dir: 1, v: 11, P: 9, len: 96, ph: 0, vk: 'bus', color: this.rng.pick(VEH_COLORS), ...o }); }
  ceilPlate(s, o) { const W = this.wAt(s); return this.dyn('ceil', { z: -s, x0: -W, x1: W, d: 3, yTop: 12, yHigh: 6, yLow: 0, P: 6, hold: 3, drop: 0.35, stay: 0.7, rise: 1.4, ph: 0, ...o }); }
  saw(s, o) { const W = this.wAt(s) - 1.5; return this.dyn('saw', { z: -s, x0: -W, x1: W, y: 1.1, r: 1.15, per: 6, ph: 0, ...o }); }
  ball(s, o) {
    const e = this.dyn('ball', { z: -s, px: 0, py: 20, L: 15, amp: 0.95, per: 4.6, ph: 0, axis: 'x', r: 2.2, ...o });
    if (e.kind !== 'coffin') {      // 철거 크레인 기둥 + 팔 (화면에 그려지는 그대로 충돌)
      const tx = -(this.wAt(s) + 2);
      this.box(s, tx, (e.py + 3) / 2, 0.6, (e.py + 3) / 2, 0.6, 'crane');
      const jl = Math.abs(e.px - tx) + 1; this.box(s, tx + jl / 2, e.py + 0.3, jl / 2, 0.3, 0.3, 'crane');
      this.anchor(s, tx, 0.6, 0, { tag: 'crane', style: 'steel' });
      e.tx = tx;
    }
    return e;
  }
  debris(s, o) { return this.dyn('debris', { z0: -s, x0: 0, xr: 2 * this.wAt(s), zs: 8, y0: 32, P: 4, n: 1, ph: 0, size: [0.9, 0.6, 0.9], kind: 'ac', seed: this.nextId * 17, ...o }); }
  press(s, o) { const W = this.wAt(s); return this.dyn('press', { z: -s, d: 5, hgt: 7, xo: W + 0.3, gapMax: 2 * W, gapMin: 0.8, P: 9, open: 4, close: 0.6, closed: 1.4, openT: 1.5, ph: 0, ...o }); }
  train(s, o) { const e = this.dyn('train', { z: -s, P: 26, ph: 0, v: 24, cars: 5, carLen: 11, warn: 3.2, ...o }); const W = this.wAt(s); for (const sd of [-1, 1]) this.box(s - 4, sd * (W - 0.3), 1.7, 0.15, 1.7, 0.15, 'gantry'); e.post = W - 0.3; return e; }
  barrels(s, o) { const W = this.wAt(s) + 1; return this.dyn('barrels', { z: -s, ax: 'x', xs: -W, dir: 1, v: 8, len: 2 * W, r: 0.62, P: 4, ph: 0, ...o }); }
  drone(s, o) { return this.dyn('drone', { cz: -s, cx: 0, cy: 8, ax: Math.max(1, this.wAt(s) - 1.5), ay: 2, az: 6, per: 9, ph: 0, r: 0.9, ...o }); }
  barricade(s, o) { const W = this.wAt(s) - 3.5; return this.dyn('barricade', { z: -s, x0: -W, x1: W, w: 3.2, h: 1.4, per: 6, ph: 0, ...o }); }
  // 놀이공원 전용
  wheel(s, o) { return this.dyn('wheel', { z: -s, cx: 0, cy: 22, R: 19, n: 12, w: 0.12, ph: 0, gs: [1.3, 1.1, 1.3], hue: 200, ...o }); }
  coaster(s, o) { return this.dyn('coaster', { z: -s, y: 6, dir: 1, v: 26, P: 6, ph: 0, cars: 4, len: 70, hue: 330, ...o }); }
  swing(s, o) { return this.dyn('swing', { z: -s, py: 16, L: 12, amp: 1.0, per: 5.2, ph: 0, hw: 5.5, ...o }); }
  carousel(s, o) { return this.dyn('carousel', { z: -s, cx: 0, R: 9, n: 8, w: 0.5, ph: 0, y: 1.3, bob: 0.9, ...o }); }

  // 정차 차량 슬라롬: 매 행마다 gapW 폭의 통로가 좌우로 움직인다
  slalom(s0, s1, o = {}) {
    const rng = this.rng, step = o.step || 24, gapW = o.gapW || 8, W = this.wAt(s0);
    const lanes = o.lanes || [-W + 2, -W / 2, 0, W / 2, W - 2].filter((v, i, a) => a.indexOf(v) === i);
    let g = o.start !== undefined ? o.start : rng.range(-W / 2, W / 2), dir = rng.chance(0.5) ? 1 : -1;
    for (let s = s0; s <= s1; s += step) {
      for (const xc of lanes) {
        if (Math.abs(xc - g) < gapW / 2 + 1.3) continue;
        const vk = rng.pick(o.kinds || ['sedan', 'sedan', 'suv', 'taxi', 'sedan', 'police']);
        this.parked(s + rng.range(-1.5, 1.5), xc + rng.range(-0.3, 0.3), vk, { yaw: rng.range(-0.1, 0.1) + (rng.chance(0.15) ? Math.PI : 0), burn: o.burn ? rng.chance(o.burn) : false });
      }
      g += dir * rng.range(2, Math.max(2.5, W * 0.45));
      const lim = Math.max(0, W - gapW / 2 - 0.5);
      if (g > lim) { g = lim; dir = -1; } else if (g < -lim) { g = -lim; dir = 1; }
      if (rng.chance(0.3)) dir = -dir;
    }
  }
  // 상자 장애물 슬라롬(가판대/화물 등 정적 상자). kinds = [[hx,hy,hz,deco], ...]
  boxSlalom(s0, s1, o = {}) {
    const rng = this.rng, step = o.step || 22, gapW = o.gapW || 8.5, W = this.wAt(s0);
    const lanes = o.lanes || [-W + 1.5, -W / 3, W / 3, W - 1.5];
    let g = o.start !== undefined ? o.start : rng.range(-W / 2, W / 2), dir = rng.chance(0.5) ? 1 : -1;
    for (let s = s0; s <= s1; s += step) {
      for (const xc of lanes) {
        if (Math.abs(xc - g) < gapW / 2 + 1.6) continue;
        const k = rng.pick(o.kinds), ss = s + rng.range(-1.2, 1.2), x = xc + rng.range(-0.3, 0.3);
        this.box(ss, x, k[1], k[0], k[1], k[2], o.tag || 'prop');
        this.add('crate', { s: ss, x, hx: k[0], hy: k[1], hz: k[2], kind: k[3] || o.kind || 'crate', hue: Math.floor(rng() * 360) });
      }
      g += dir * rng.range(2, Math.max(2.5, W * 0.45));
      const lim = Math.max(0, W - gapW / 2 - 0.5);
      if (g > lim) { g = lim; dir = -1; } else if (g < -lim) { g = -lim; dir = 1; }
      if (rng.chance(0.3)) dir = -dir;
    }
  }

  // ───────── 마무리: 월드 변환 ─────────
  finalize() {
    const track = new Track(this.route, []);
    this.track = track;
    // 옆 발판 → 월드 지면 판
    const plats = this.platforms.map((q) => {
      const fr = track.frameAt(q.ls), yb = this.yAt(q.ls) + q.dy;
      const w = toWorld(fr, q.lx, 0, -q.ls), fx = Math.sin(fr.h), fz = -Math.cos(fr.h);
      return { x0: w[0], z0: w[2], fx, fz, rx: Math.cos(fr.h), rz: Math.sin(fr.h), a0: -q.len / 2, a1: q.len / 2, w: q.hw, y0: yb, y1: yb, surf: q.surf, piece: -1, s0: q.ls };
    });
    this.track = new Track(this.route, plats);
    // 풍경 (경로가 확정된 뒤 겹침 검사하며 배치)
    for (const job of this.sceneryJobs) { this.cur = job.sec; job.fn(this, this.track); }
    // 정적 충돌체: 조각 경계를 넘는 긴 상자는 조각마다 잘라서 옮긴다
    const world = [], local = [];
    const P = this.route;
    for (const b of this.statics) {
      const s = -b.c[2];
      const yb = this.yAt(s);
      const loc = { ...b, c: [b.c[0], b.c[1] + yb, b.c[2]] }; local.push(loc);
      const aligned = b.k === 'b' && b.R[0] === 1 && b.R[4] === 1 && b.R[8] === 1;
      if (aligned && b.h[2] > 3) {
        const a = s - b.h[2], z = s + b.h[2];
        let covered = 0;
        for (const p of P) {
          const lo = Math.max(a, p.s0), hi = Math.min(z, p.s0 + p.L);
          if (hi - lo < 0.01) continue;
          covered += hi - lo;
          // 곡선 조각 위에서는 4m 이하로 잘라 곡선을 따라가게 한다
          const n = p.kind === 'arc' ? Math.max(1, Math.ceil((hi - lo) / 4)) : 1, step = (hi - lo) / n;
          for (let j = 0; j < n; j++) {
            const l0 = lo + j * step, l1 = l0 + step;
            const sub = makeBox(b.c[0], b.c[1], -(l0 + l1) / 2, b.h[0], b.h[1], (l1 - l0) / 2 + (n > 1 ? 0.15 : 0));
            const w = shapeToWorld(frameOf(p, (l0 + l1) / 2), sub); w.tag = b.tag; w.sec = b.sec; if (b.fid) w.fid = b.fid; world.push(w);
          }
        }
        if (!covered) { const w = shapeToWorld(track.frameAt(s), b); w.tag = b.tag; w.sec = b.sec; world.push(w); }
      } else {
        const w = shapeToWorld(track.frameAt(s), b); w.tag = b.tag; w.sec = b.sec; if (b.fid) w.fid = b.fid; world.push(w);
      }
    }
    // 동적 장애물: 기준 s 의 조각 변환을 달아 두고, 월드 경계 상자(wb)를 계산
    for (const e of this.dynamics) {
      const s = -(e.zr[0] + e.zr[1]) / 2, fr = track.frameAt(s);
      e.fr = fr;
      const bd = entityBounds(e);
      const xs = [], zs = [];
      for (const x of [bd.x[0], bd.x[1]]) for (const z of [bd.z[0], bd.z[1]]) { const w = toWorld(fr, x, 0, z); xs.push(w[0]); zs.push(w[2]); }
      e.wb = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...zs) - 1, Math.max(...zs) + 1];
      const p0 = track.pieceAt(-e.zr[1]), p1 = track.pieceAt(-e.zr[0]);
      if (p0 !== p1 && Math.abs(p0.h - p1.h) > 1e-3) this.warnings.push(`[구간${e.sec}] ${e.type}#${e.id} 가 꺾이는 이음매(s≈${s.toFixed(0)})를 넘어감`);
    }
    for (const q of this.ceils) q.yw = q.y + this.yAt((q.s0 + q.s1) / 2);
    for (const c of this.checkpoints) { const p = track.point(c.s, 0, 0); c.p = p; c.yaw = -track.headingAt(c.s); }
    return { track, statics: world, localStatics: local };
  }
}

// 2D 직사각형 겹침 (풍경 배치용). r = { cx, cz, fx, fz, rx, rz, a, w } (반길이 a, 반폭 w)
export function rectOverlap(A, B) {
  const axes = [[A.fx, A.fz], [A.rx, A.rz], [B.fx, B.fz], [B.rx, B.rz]];
  const dx = B.cx - A.cx, dz = B.cz - A.cz;
  for (const [ax, az] of axes) {
    const ra = A.a * Math.abs(A.fx * ax + A.fz * az) + A.w * Math.abs(A.rx * ax + A.rz * az);
    const rb = B.a * Math.abs(B.fx * ax + B.fz * az) + B.w * Math.abs(B.rx * ax + B.rz * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
  }
  return true;
}
export { straightGround };
