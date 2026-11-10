// 도시 맵 경로 (구불구불한 루트). 각 구간 함수는 커서(B.s)에서 이어서 경로를 만들고, 만든 구간 위에 장애물을 놓는다.
// 길 폭: 반폭 w (8 = 16m 도로, 4.5 = 골목, 3 = 비계/철골, 2.4 = 크레인 지브/유리 다리)
import { cityScene, siteScene, industrialScene, rocks, palms } from './scenery.js';

const mid = (r) => (r[0] + r[1]) / 2;
// 직선 구간 양옆 난간 (꺾이는 모서리 근처는 비워 둔다)
function rails(B, r, style) { const w = B.wAt(mid(r)), a = r[0] + w * 1.3, b = r[1] - w * 1.3; if (b - a > 8) for (const sd of [-1, 1]) B.guardrail(a, b, sd, { style }); }
// 지그재그 비계 오르막: n 개의 경사로를 U턴으로 잇는다 (옆으로 겹치지 않게 간격 = 2w+2)
function switchback(B, n, L, rise, w, dir, surf) {
  for (let i = 0; i < n; i++) {
    B.ramp(L, rise, { w, surf });
    if (i < n - 1) { const d = (i % 2 ? -1 : 1) * dir; B.turn(90 * d); B.run(2 * w + 2, { w }); B.turn(90 * d); }
  }
}
// 도심 날먹 방지 묶음: 육교 + 전광판 + 스카이브리지
function cityStack(B, s, o = {}) { B.overpass(s, o.y || 9, { sign: o.sign || '' }); B.banner(s + 3, 17, 22, { text: o.text || 'TEMU' }); B.skybridge(s - 3, 28.5, 4.2); }
const LAUNDRY = [8, 12.5, 17, 21.5, 26, 30.5, 35, 39.5];
const LANTERN = [9, 14, 19, 24, 29, 34, 39];
const FLAGS = [9, 14, 19, 24, 29, 34, 39];

// ───────── 1. 튜토리얼 골목 (튜토리얼은 도시 맵에만) ─────────
export function c1(B) {
  const s0 = B.s;
  B.run(90, { w: 8, surf: 'road' });
  B.checkpoint(14, { noPad: true }); B.pad(0, 82);
  B.hint(0, 50, 'start'); B.hint(50, 92, 'wheels');
  B.sign(40, 1, 'Q W : 전진   A S : 후진', { big: true });
  B.turn(90);
  const r2 = B.run(80);
  B.hint(92, 175, 'turn');
  B.sign(r2[0] + 6, -1, '꺾기 전에 스페이스로 감속!', {});
  B.slalom(r2[0] + 22, r2[1] - 14, { step: 26, gapW: 9, start: 0 });
  B.turn(-90);
  B.plaza(44, 8);
  B.hint(175, 222, 'fuel');
  const r4 = B.run(110);
  B.hint(r4[0], r4[0] + 40, 'single'); B.hint(r4[0] + 40, r4[0] + 74, 'lift'); B.hint(r4[0] + 74, r4[1], 'four');
  B.sign(r4[0] + 12, 1, 'E R D F : 배출구 (한 개만 눌러 보기)', { big: true });
  B.hop(r4[0] + 56, 1.0, { label: '낮은 장벽(이륙 연습)', v0: 7 });
  B.hop(r4[0] + 96, 3.0, { label: '높은 장벽(4개 상승)', v0: 7 });
  B.turn(90);
  const r5 = B.run(60);
  B.hint(r5[0], r5[1], 'tilt');
  B.sign(r5[0] + 10, -1, '앞쪽을 들면 뒤로, 뒤쪽을 들면 앞으로', {});
  B.jump(14, { label: '골목 틈(기울여 이동)', v0: 9, style: 'street' });
  B.hint(r5[1] - 20, r5[1] + 30, 'tiltgap');
  const r6 = B.run(50);
  B.checkpoint(r6[0] + 16, { padLen: 26 });
  B.hint(r6[0], r6[1] + 120, 'free');
  B.turn(-45); B.run(40); B.turn(-45);
  const r7 = B.run(70);
  B.slalom(r7[0] + 14, r7[0] + 14, { step: 26, gapW: 9, start: 2 });
  B.hop(r7[0] + 50, 2.0, { label: '튜토리얼 마지막 장벽', v0: 8 });
  B.lamps(s0, B.s, 30);
  const sEnd = B.s;
  // 골목 → 동네 공원 (넓은 잔디 광장)
  B.turn(90);
  B.plaza(60, 14, { surf: 'park' });
  const sEndJob = B.s;
  B.scenery((B, T) => { cityScene(B, T, s0, sEnd, 'alley'); cityScene(B, T, sEnd, sEndJob, 'park', { hmin: 18, hmax: 30, gap: 6, jitter: 10 }); });
}

// ───────── 2. 도심 대로 (블록마다 꺾이는 시내 + 육교 우회) ─────────
export function c2(B) {
  const s0 = B.s;
  B.turn(-90);
  B.plaza(44, 9);
  const r1 = B.run(130, { w: 9, surf: 'road' });
  B.traffic(r1[1] - 4, { x: -4.5, v: 13, len: 110, P: 9.5, ph: 0, vk: 'taxi' });
  B.traffic(r1[1] - 4, { x: 4.5, v: 11, len: 110, P: 11, ph: 4, vk: 'suv' });
  cityStack(B, mid(r1), { sign: '시청역 ↗', text: 'DOWNTOWN' });
  B.turn(90);
  const r2 = B.run(100);
  B.slalom(r2[0] + 22, r2[1] - 16, { step: 22, gapW: 8.5 });
  B.turn(-90);
  B.plaza(44, 9);
  // 육교 우회: 좁은 다리로 올라가 버스가 다니는 길을 건넌다
  B.ramp(30, 7, { w: 3, surf: 'bridge' });
  const rb = B.run(44, { w: 2.6, surf: 'bridge' });
  B.platform(mid(rb), 0, 12, 34, -7, { surf: 'road' });             // 다리 아래 가로 도로
  B.birds(mid(rb), { y0: 1.6, pat: 'sine', amp: 2.2, per: 5, n: 5, spread: 1.0, kind: 'dove' });
  B.ramp(30, -7, { w: 3, surf: 'bridge' });
  B.turn(-90);
  const r3 = B.run(110, { w: 9, surf: 'road' });
  B.hop(r3[0] + 40, 3.0, { spikes: 0.8, label: '가시 장벽 3.0m' });
  B.platform(r3[0] + 86, 0, 14, 44, 0, { surf: 'road' });            // 교차로
  B.crossTraffic(r3[0] + 84, { vk: 'bus', v: 10, P: 9, ph: 0, xs: -44, len: 88 });
  B.crossTraffic(r3[0] + 88, { vk: 'truck', v: 12, P: 9, ph: 4.5, xs: 44, dir: -1, len: 88 });
  B.turn(90);
  const r4 = B.run(120);
  B.traffic(r4[1] - 4, { x: -4.5, v: 18, len: 100, P: 8, ph: 0, vk: 'police', siren: true });
  B.traffic(r4[1] - 4, { x: 4.5, v: 18, len: 100, P: 8, ph: 4, vk: 'police', siren: true });
  cityStack(B, r4[0] + 30, { sign: '금융가', text: 'BANK 24' });
  B.turn(-90);
  B.plaza(44, 9);
  const r5 = B.run(70);
  B.hop(mid(r5), 1.6, { label: '낮은 장벽 1.6m', v0: 9 });
  B.lamps(s0, B.s, 34);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'city'));
}

// ───────── 3. 공사장: 비계 → 크레인 지브 → 짓는 중인 건물 층 → 철골 내리막 ─────────
export function c3(B) {
  const s0 = B.s;
  B.plaza(44, 8, { surf: 'dirt' });
  B.add('sitegate', { s: s0 + 2, w: 8 });
  B.box(s0 + 2, 0, 12.6, 8.4, 0.9, 0.6, 'gate');
  const r1 = B.run(60, { w: 7, surf: 'dirt' });
  B.hop(r1[0] + 18, 3.0, { label: '콘크리트 장벽 3.0m', style: 'concrete' });
  for (let i = 0; i < 2; i++) B.spikeStrip(r1[0] + 38 + i * 11, i % 2 ? -7 : -1, i % 2 ? 1 : 7, { d: 2.0 });
  // 비계 지그재그 오르막 (높이 15m)
  const sb = B.s;
  switchback(B, 3, 34, 5, 3.2, 1, 'scaffold');
  B.add('scaffold', { s0: sb, s1: B.s });
  // 크레인 지브 위 (폭 4.8m, 15m 높이). 갈고리에 매달린 철근 다발이 좌우로 흔들린다
  B.turn(90);
  const rj = B.run(56, { w: 2.4, surf: 'jib' });
  B.ball(rj[0] + 30, { py: 14, L: 11, amp: 0.55, per: 4.2, r: 1.1, kind: 'load' });
  // 짓는 중인 건물 1층으로 (천장 5.6m, 기둥 숲)
  B.turn(-90);
  const rf = B.run(70, { w: 9, surf: 'slab' });
  B.checkpoint(rf[0] + 8, { padLen: 18 });
  B.ceiling(rf[0] + 1, rf[1] - 1, 5.6, { style: 'slab', overPads: true });
  B.add('slabfloor', { s0: rf[0] + 1, s1: rf[1] - 1, y: 5.6, top: 32, w: 9 });
  for (const [d, xs] of [[34, [-6, 0, 6]], [46, [-3, 3]], [58, [-6, 0, 6]]]) for (const x of xs) B.pillar(rf[0] + d, x, 1.1, 5.6, { style: 'column' });
  B.barricade(rf[0] + 40, { per: 4.6, ph: 0 });
  // 옆 골조로 점프 (12m) → 철골 내리막
  B.jump(12, { label: '골조 사이 12m', style: 'site' });
  const rg = B.run(40, { w: 7, surf: 'slab' });
  B.debris(mid(rg), { xr: 12, zs: 10, y0: 26, P: 3.2, n: 2, size: [1.4, 0.35, 0.5], kind: 'beam' });
  B.turn(90);
  B.ramp(44, -7, { w: 3, surf: 'girder' });
  B.turn(-90);
  B.ramp(44, -8, { w: 6, surf: 'dirt' });
  B.plaza(44, 8, { surf: 'dirt' });
  const r9 = B.run(70, { w: 8 });
  B.ball(r9[0] + 16, { py: 19, L: 15, per: 4.6, ph: 0, amp: 0.6 });
  B.saw(r9[0] + 36, { per: 5.5, ph: 0.2 });
  B.jib(r9[0] + 44, 22, { side: 1, hook: 8 });
  B.hop(r9[0] + 58, 2.6, { wire: 3.6, label: '전선 아래 장벽 2.6m', style: 'concrete' });
  B.lamps(s0, B.s, 40);
  const sEndJob = B.s;
  B.scenery((B, T) => siteScene(B, T, s0, sEndJob));
}

// ───────── 4. 고가도로: 도시 위 10m, 완만한 커브 + 끊어진 고가 ─────────
export function c4(B) {
  const s0 = B.s;
  B.ramp(60, 10, { w: 10, surf: 'road' });
  B.plaza(44, 10);
  const r1 = B.run(140);
  rails(B, r1, 'parapet');
  B.ceiling(r1[0] + 20, r1[0] + 64, 4.7, { spikes: 1.2, style: 'canopy', walls: false });
  B.birds(r1[0] + 90, { y0: 1.5, pat: 'sine', amp: 9, per: 6, n: 7, spread: 1.4, kind: 'crow' });
  B.powerline(r1[0] + 120, [10, 17, 24, 31, 38]);
  B.turn(30);
  const r2 = B.run(100);
  rails(B, r2, 'parapet');
  B.hop(r2[0] + 30, 1.5, { label: '낮은 장벽 1.5m(새 떼 아래)' });
  B.birds(r2[0] + 30, { y0: 6.5, pat: 'circle', amp: 7, per: 7, n: 8, spread: 1, kind: 'crow' });
  B.powerline(r2[0] + 80, [17, 24, 31, 38]);
  B.turn(30);
  B.plaza(44, 10);
  B.jump(30, { label: '끊어진 고가 30m' });
  const r3 = B.run(90);
  rails(B, r3, 'parapet');
  B.box(r3[0] + 30, 0, 7.0, 10.3, 0.9, 0.5, 'gantry'); for (const sd of [-1, 1]) B.box(r3[0] + 30, sd * 10.3, 3.5, 0.3, 3.5, 0.3, 'gantry');
  B.add('signgantry', { s: r3[0] + 30, w: 10 });
  B.birds(r3[0] + 60, { y0: 2.0, pat: 'shuttle', amp: 7, per: 5, n: 5, x0: -4, kind: 'crow', spread: 1.6 });
  B.turn(-60);
  const r4 = B.run(110);
  rails(B, r4, 'parapet');
  B.hop(r4[0] + 50, 4.3, { spikes: 0.8, wire: 3.6, label: '가시·전선 장벽 4.3m' });
  B.powerline(r4[0] + 84, [14, 21, 28, 35]);
  B.plaza(44, 10);
  B.ramp(60, -10);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'highway'));
}

// ───────── 5. 네온 골목 시장: 미로 같은 좁은 골목 → 옥상 건너뛰기 ─────────
export function c5(B) {
  const s0 = B.s;
  B.plaza(44, 7);
  B.add('marketgate', { s: s0 + 2, w: 7, text: '야시장 NIGHT MARKET' });
  B.box(s0 + 2, 0, 13.6, 7.2, 1.6, 0.6, 'gate');
  const r1 = B.run(56, { w: 4.5, surf: 'alley' });
  [14, 30].forEach((d, i) => B.laserTrip(r1[0] + d, { ys: [0.55, 1.45], blink: { P: 3.4, on: 1.4, warn: 0.8, ph: -i * 1.7 } }));
  B.lines(r1[0] + 44, LANTERN, { kind: 'lantern' });
  B.turn(90);
  const r2 = B.run(44);
  B.lines(r2[0] + 14, LAUNDRY, { kind: 'laundry' });
  B.laserScan(r2[0] + 30, { y: 0.9, w: 0.6, a0: 0.4 });
  B.turn(-90);
  const r3 = B.run(56);
  B.laserWall(r3[0] + 30, [0.7, 3.4], { win: 0, label: '레이저 격자 틈 0.7~3.4m' });
  B.turn(-90);
  const r4 = B.run(44);
  B.lines(r4[0] + 10, LANTERN, { kind: 'lantern' });
  [24, 36].forEach((d, i) => B.laserTrip(r4[0] + d, { ys: [0.5, 1.3], blink: { P: 2.6, on: 1.0, warn: 0.6, ph: -i * 1.1 } }));
  B.turn(90);
  B.plaza(44, 7);
  B.run(14, { w: 6 });
  // 옥상 길: 4m 위로 올라타서 지붕을 건너뛴다
  B.stepUp(4, { style: 'roof', label: '시장 지붕 4m 올라타기' });
  const ro = B.run(40, { w: 6, surf: 'roof' });
  B.lines(ro[0] + 30, [12, 17, 22, 27, 32, 37], { kind: 'laundry' });
  B.jump(10, { dy: -1, label: '지붕 사이 10m' });
  B.run(30, { w: 4, surf: 'roof' });
  B.turn(90);
  B.run(30);
  B.jump(12, { dy: 1, label: '지붕 사이 12m' });
  B.run(40, { w: 6 });
  B.ramp(32, -4, { w: 3, surf: 'stairs' });
  B.plaza(44, 7, { surf: 'alley' });
  const r9 = B.run(70, { w: 5, surf: 'alley' });
  B.laserGrid(r9[0] + 22, { H: 12, gw: 5, gh: 3.2, cx: 0, ax: 2.5, cy: 1.6, ay: 0, per: 6.4 });
  B.lines(r9[0] + 34, LANTERN, { kind: 'lantern' });
  B.laserWall(r9[0] + 56, [0.7, 3.4], { win: 0, label: '레이저 격자 마지막 관문' });
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'neon', { gap: 0.4 }));
}

// ───────── 6. 공업 지구: 거대 배관 위를 달리기 → 불 지대 → 화물열차 건널목 ─────────
export function c6(B) {
  const s0 = B.s;
  B.plaza(44, 8, { surf: 'dirt' });
  const r1 = B.run(70, { w: 8, surf: 'dirt' });
  [[12, -5], [26, 0], [40, 5], [54, -2]].forEach(([d, x], i) => B.vents(r1[0] + d, { x0: x, P: 5, on: 1.3, warn: 1.2, ph: i * 1.1 }));
  B.pipeBridge(r1[0] + 33, 13); B.pipeBridge(r1[0] + 34, 24, { kind: 'conveyor' });
  // 배관 위로 (폭 5.2m)
  B.ramp(30, 6, { w: 2.6, surf: 'pipe' });
  const p1 = B.run(50, { w: 2.6 });
  B.vents(p1[0] + 26, { kind: 'steam', n: 1, x0: 0, H: 3.8, w: 2.2, P: 4.2, on: 1.5, warn: 1.0 });
  B.turn(45);
  B.run(40);
  B.turn(45);
  const p3 = B.run(46);
  B.vents(p3[0] + 22, { kind: 'steam', n: 1, x0: 0, H: 3.8, w: 2.2, P: 3.6, on: 1.3, warn: 0.9, ph: 1.5 });
  B.ramp(30, -6, { w: 2.6 });
  B.plaza(44, 8, { surf: 'dirt' });
  const r2 = B.run(80, { w: 8 });
  B.slalom(r2[0] + 10, r2[0] + 32, { step: 22, gapW: 8.5, burn: 0.5 });
  B.hop(r2[0] + 60, 2.2, { style: 'pipe', label: '가스 배관 2.2m' });
  B.turn(-90);
  const r3 = B.run(70);
  B.fireRain(r3[0] + 6, r3[1] - 6, { cnt: 3, P: 3.4, fall: 1.5 });
  B.turn(90);
  B.plaza(44, 8, { surf: 'dirt' });
  const r4 = B.run(80);
  B.platform(r4[0] + 30, 0, 6, 34, 0, { surf: 'rail' });
  B.train(r4[0] + 30, { P: 26, ph: 3 });
  B.hop(r4[0] + 62, 2.4, { style: 'pipe', label: '가스 배관 2.4m' });
  B.lamps(s0, B.s, 38);
  const sEndJob = B.s;
  B.scenery((B, T) => industrialScene(B, T, s0, sEndJob));
}

// ───────── 7. 강 위의 현수교: S자 진입 + 끊어진 상판 ─────────
export function c7(B) {
  const s0 = B.s;
  B.plaza(44, 7, { surf: 'bridge' });
  B.turn(-25); B.run(50, { w: 7 }); B.turn(25);
  const d1 = B.run(50);
  B.jump(30, { label: '끊어진 다리 30m' });
  const d2 = B.run(70);
  B.pad(d2[0] + 6, d2[0] + 34);
  B.drone(d2[0] + 54, { cy: 4.2, ay: 1.4, az: 3, per: 7.5 });
  B.jump(28, { label: '끊어진 다리 28m' });
  B.run(40);
  B.plaza(44, 7);
  const d3 = B.run(40);
  B.jump(36, { label: '끊어진 다리 36m' });
  const d4 = B.run(70);
  B.pad(d4[0] + 6, d4[0] + 34);
  B.drone(d4[0] + 54, { cy: 4.2, ay: 1.4, az: 3, per: 7.5, ph: 1.7 });
  B.jump(32, { label: '끊어진 다리 32m' });
  B.run(40);
  B.plaza(44, 7);
  B.turn(20); B.run(50); B.turn(-20);
  B.run(30);
  for (const [r, d] of [[d1, 20], [d2, 20], [d3, 20], [d4, 20]]) {
    const s = r[0] + d;
    for (const sd of [-1, 1]) B.box(s, sd * 9.2, 29, 1.3, 29 + 12, 1.6, 'tower');
    B.box(s, 0, 32.5, 10.5, 1.5, 1.6, 'tower'); B.box(s, 0, 54, 10.5, 2, 1.6, 'tower');
    B.add('btower', { s, H: 58, x: 9.2 });
  }
  B.arch(d2[1] - 6, 22); B.arch(d4[1] - 6, 22);
}

// ───────── 8. 지하 터널: 꺾일 때마다 하늘이 보이는 굴뚝(환기 마당)이 있는 터널 ─────────
export function c8(B) {
  const s0 = B.s;
  B.plaza(44, 8);
  const t1 = B.run(150, { w: 7, surf: 'road' });
  B.ceiling(t1[0], t1[1] - 5, 7.5, { style: 'tunnel' });
  B.add('tportal', { s: t1[0], dir: 1, y: 7.5, w: 7 });
  B.traffic(t1[1] - 4, { x: -3.5, v: 18, len: 130, P: 8, ph: 0, vk: 'sedan' });
  B.traffic(t1[1] - 4, { x: 3.5, v: 16, len: 130, P: 11, ph: 4, vk: 'police', siren: true });
  B.turn(45);
  const t2 = B.run(140);
  B.ceiling(t2[0] + 8, t2[1] - 8, 7.5, { style: 'tunnel' });
  B.ceilPlate(t2[0] + 40, { d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 0 });
  B.press(t2[0] + 70, { d: 5, hgt: 7, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4, ph: 0 });
  B.ceilPlate(t2[0] + 100, { d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 3 });
  B.turn(-45);
  B.plaza(44, 8);
  const t3 = B.run(120);
  B.ceiling(t3[0] + 8, t3[1] - 8, 7.5, { style: 'tunnel' });
  B.hop(t3[0] + 30, 1.4, { wire: 3.0, style: 'pipe', label: '터널 배관 아래 장벽 1.4m' });
  B.saw(t3[0] + 60, { per: 5.5, ph: 0.3 });
  B.vents(t3[0] + 90, { kind: 'steam', n: 3, x0: -4.5, dx: 4.5, H: 3.8, w: 2.2, P: 4.2, on: 1.5, warn: 1.0, phStep: 1.4 });
  B.turn(-45);
  const t4 = B.run(130);
  B.ceiling(t4[0] + 8, t4[1] - 5, 7.5, { style: 'tunnel' });
  for (const [d, p0, p1] of [[30, 0, 2.5], [52, 2.5, 0]]) {
    B.ceilPlate(t4[0] + d, { x0: -7, x1: 0, d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 5, hold: 2.0, drop: 0.3, stay: 0.7, rise: 1.4, ph: p0 });
    B.ceilPlate(t4[0] + d, { x0: 0, x1: 7, d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 5, hold: 2.0, drop: 0.3, stay: 0.7, rise: 1.4, ph: p1 });
  }
  B.wireSpan(t4[0] + 80, 1.6, { sparks: true });
  B.vents(t4[0] + 104, { kind: 'arc', n: 3, x0: -4.5, dx: 4.5, H: 4.5, w: 1.4, P: 3.6, on: 1.0, warn: 0.9, phStep: 0.9 });
  B.add('tportal', { s: t4[1] - 5, dir: -1, y: 7.5, w: 7 });
  B.turn(45);
  B.plaza(44, 8);
  const sEndJob = B.s;
  B.scenery((B, T) => rocks(B, T, s0, sEndJob, { hmin: 14, hmax: 30 }));
}

// ───────── 9. 마천루: 발코니 → 유리 다리 → 빌딩 층 → 옥상 점프 ─────────
export function c9(B) {
  const s0 = B.s;
  const r1 = B.run(70, { w: 8, surf: 'road' });
  B.portal(r1[0] + 40, 8, 14, { label: '고층 창문 8~14m', v0: 8 });
  B.stepUp(8, { style: 'balcony', label: '발코니 8m 올라타기', v0: 8 });
  const b1 = B.run(40, { w: 6, surf: 'roof' });
  B.turn(90);
  const g1 = B.run(50, { w: 2.4, surf: 'glass' });
  B.drone(mid(g1), { cy: 2.2, ax: 1.6, ay: 0.8, az: 4, per: 7 });
  B.turn(-90);
  const f1 = B.run(60, { w: 8, surf: 'slab' });
  B.checkpoint(f1[0] + 8, { padLen: 18 });
  B.ceiling(f1[0] + 1, f1[1] - 1, 5.2, { style: 'office', overPads: true });
  B.add('slabfloor', { s0: f1[0] + 1, s1: f1[1] - 1, y: 5.2, top: 60, w: 8, style: 'office' });
  B.laserTrip(f1[0] + 40, { ys: [0.55, 1.45], blink: { P: 3.0, on: 1.2, warn: 0.7, ph: 0 } });
  B.jump(16, { dy: -2, label: '옥상으로 16m' });
  const r2 = B.run(44, { w: 7, surf: 'roof' });
  B.laserGrid(r2[0] + 24, { H: 14, gw: 6, gh: 3.4, cx: 0, ax: 0, cy: 3.0, ay: 4.4, per: 5.5, per2: 5.5 });
  B.turn(-90);
  B.run(44, { w: 2.4, surf: 'glass' });
  B.turn(90);
  B.run(30, { w: 7, surf: 'roof' });
  B.ramp(60, -6, { w: 4, surf: 'stairs' });
  B.plaza(44, 8, { surf: 'road' });
  const r4 = B.run(70, { w: 8 });
  B.skybridge(r4[0] + 10, 14, 4); B.skybridge(r4[0] + 11, 26, 4); B.skybridge(r4[0] + 10, 37, 3.5);
  B.portal(r4[0] + 50, 14, 20, { label: '창문 14~20m', v0: 8 });
  B.plaza(44, 8);
  const sEndJob = B.s;
  B.scenery((B, T) => cityScene(B, T, s0, sEndJob, 'canyon'));
}

// ───────── 10. 새벽 해안 피날레: 바닷가 산책로 지그재그 + 부두 점프 ─────────
export function c10(B) {
  const s0 = B.s;
  B.plaza(44, 7, { surf: 'boardwalk' });
  B.add('canyongate', { s: s0 + 2, w: 7 });
  const r1 = B.run(60, { w: 6, surf: 'boardwalk' });
  B.vents(r1[0] + 20, { n: 4, x0: -4.5, dx: 3, phStep: 0.6, P: 4.2, on: 1.1, warn: 1.0, w: 2.0 });
  B.lines(r1[0] + 46, FLAGS, { kind: 'bunting' });
  B.turn(-45);
  const r2 = B.run(50);
  [14, 30].forEach((d, i) => B.laserTrip(r2[0] + d, { ys: [0.55, 1.45], blink: { P: 3.2, on: 1.4, warn: 0.8, ph: -i * 1.6 } }));
  B.jump(26, { label: '부두 사이 26m', style: 'pier' });
  B.run(40);
  B.turn(90);
  B.plaza(44, 7);
  const r3 = B.run(60);
  B.press(r3[0] + 20, { d: 5, hgt: 7, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4 });
  B.lines(r3[0] + 44, FLAGS, { kind: 'bunting' });
  B.turn(-45);
  const r4 = B.run(50);
  B.ball(r4[0] + 26, { py: 19, L: 15, per: 4.6, ph: 1, amp: 0.45 });
  B.jump(20, { label: '부두 사이 20m', style: 'pier' });
  B.run(40);
  B.plaza(44, 7);
  const r5 = B.run(60);
  B.fireRain(r5[0] + 8, r5[0] + 30, { cnt: 2, P: 3.0, fall: 1.4 });
  B.hop(r5[0] + 46, 6.0, { spikes: 0.8, wire: 3.6, label: '최종 관문: 가시·전선 장벽 6.0m' });
  B.run(50, { w: 8 });
  B.lamps(s0, B.s, 36);
  const sEndJob = B.s;
  B.scenery((B, T) => { cityScene(B, T, s0, sEndJob, 'dawn', { sides: [-1] }); palms(B, T, s0, sEndJob); });
}
