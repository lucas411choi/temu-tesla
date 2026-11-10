// 구간 1~4 콘텐츠: 튜토리얼 골목(→공원) / 도심 대로 / 공사장 / 고가도로
// blocks = 충전 구역 사이의 장애물 배치 가능 구간 [[s시작, s끝], ...]
import { alleyScene, parkScene, downtownScene, siteScene, highwayScene } from './scenery.js';
const mid = (b) => (b[0] + b[1]) / 2;
const CORR_S = 16.6;

// 도심 '날먹 방지' 묶음: 육교(9m) + 전광판 다리(17~22m) + 스카이브리지(29~33m). 사이 틈(약 3.5~6m)으로는 정밀 비행으로 통과 가능.
function cityStack(B, s, o = {}) {
  B.overpass(s, o.y || 9, { sign: o.sign || '' });
  B.banner(s + (o.dz || 0), 17, 22, { text: o.text || 'TEMU' });
  B.skybridge(s - (o.dz || 0), 28.5, 4.2);
}

// ───────── 구간 1: 튜토리얼 골목 (0~600m) → 동네 공원 ─────────
export function sec1(B) {
  alleyScene(B, -40, 596);
  parkScene(B, 596, 662, { half: 40, fountainSide: 1 });
  B.street(0, 596, { trees: false, busstops: true, lampEvery: 30, intersections: [] });
  B.checkpoint(14, { noPad: true });
  B.pad(0, 82);
  B.checkpoint(190);          // 충전 구역 182~222
  B.checkpoint(392);
  B.checkpoint(520);
  B.hint(0, 100, 'start'); B.hint(100, 175, 'wheels'); B.hint(175, 228, 'fuel'); B.hint(228, 290, 'single');
  B.hint(290, 346, 'lift'); B.hint(346, 392, 'four'); B.hint(392, 448, 'tilt'); B.hint(448, 512, 'tiltgap'); B.hint(512, 600, 'free');
  B.sign(40, 1, 'Q W A S : 바퀴 (지면 주행)', { big: true });
  B.sign(112, -1, '정차 차량 사이로 달려 보세요', {});
  B.sign(236, 1, 'E R D F : 배출구 (한 개만 눌러 보기)', { big: true });
  B.sign(284, -1, '둘 이상 누르면 이륙!', {});
  B.sign(338, 1, '네 개 동시: 수평 상승 (연료가 빨리 닳아요)', { big: true });
  B.sign(432, -1, '앞쪽을 들면 뒤로, 뒤쪽을 들면 앞으로', {});
  B.sign(500, 1, '착지해서 멈춰 있으면 연료 충전', { big: true });
  B.slalom(104, 156, { step: 26, gapW: 11, maxShift: 5, start: 0 });
  B.hop(300, 1.0, { label: '낮은 장벽(이륙 연습)', v0: 7 });
  B.hop(352, 3.0, { label: '높은 장벽(4개 상승)', v0: 7 });
  B.gapFlight(455, 14, { label: '도로 틈(기울여 이동)', v0: 9, style: 'street' });
  B.slalom(566, 566, { step: 26, gapW: 10, maxShift: 5, start: 2 });
  B.hop(588, 2.0, { label: '튜토리얼 마지막 장벽', v0: 8 });
}

// ───────── 구간 2: 도심 대로 (교통 혼잡) ─────────
export function sec2(B, bk) {
  const inter = [mid(bk[3])];
  downtownScene(B, 662, 1500, { skip: inter.map((i) => [i - 12, i + 12]) });
  B.street(600, 1500, { trees: true, busstops: true, subway: true, billboards: true, billEvery: 150, intersections: inter });
  // b0: 정차 차량 슬라롬 + 육교
  B.slalom(bk[0][0] + 8, bk[0][1] - 8, { step: 22, gapW: 8.5 });
  cityStack(B, bk[0][0] + 40, { sign: '시청역 ↗', text: 'DOWNTOWN' });
  // b1: 낮은 장벽 + 마주 오는 택시
  B.hop(mid(bk[1]), 2.4, { label: '중앙분리 장벽 2.4m' });
  B.traffic(bk[1][1] - 5, { x: -2, v: 12, len: 38, P: 9, ph: 1, vk: 'taxi' });
  // b2: 마주 오는 차량 3대 + 차선 변경 택시 + 우측 정차 차량 + 전광판
  B.traffic(bk[2][1] - 5, { x: -10, v: 12, len: 58, P: 9, ph: 0, vk: 'suv' });
  B.traffic(bk[2][1] - 5, { x: -6, v: 15, len: 58, P: 10, ph: 3, vk: 'sedan' });
  B.traffic(bk[2][1] - 5, { x: -2, v: 13, len: 58, P: 10, ph: 6, vk: 'taxi', lc: { x1: 4.5, t0: 1.7, dur: 1.2 } });
  B.parked(bk[2][0] + 34, 8.5, 'sedan'); B.parked(bk[2][0] + 36, 11, 'suv');
  cityStack(B, bk[2][0] + 18, { y: 9.5, sign: '중앙광장', text: 'TEMU SALE', dz: 3 });
  // b3: 교차로 횡단 차량 (버스/트럭)
  B.crossTraffic(mid(bk[3]) - 2, { vk: 'bus', v: 10, P: 9, ph: 0 });
  B.crossTraffic(mid(bk[3]) + 2, { vk: 'truck', v: 12, P: 9, ph: 4.5, xs: 48, dir: -1 });
  // b4: 경찰 추격차 2대 (사이렌) + 육교 묶음
  B.traffic(bk[4][1] - 5, { x: -6, v: 20, len: 58, P: 8, ph: 0, vk: 'police', siren: true });
  B.traffic(bk[4][1] - 5, { x: 6, v: 20, len: 58, P: 8, ph: 4, vk: 'police', siren: true });
  B.parked(mid(bk[4]), -10, 'taxi'); B.parked(mid(bk[4]) + 20, 10, 'taxi');
  cityStack(B, bk[4][0] + 14, { sign: '금융가', text: 'BANK 24' });
  // b5: 가시 달린 장벽
  B.hop(mid(bk[5]), 3.0, { spikes: 0.8, label: '가시 장벽 3.0m' });
  // b6: 급가속 차량 + 느린 버스 + 차선 변경 + 전광판
  B.traffic(bk[6][0] + 6, { x: 6, dir: -1, acc: 7, v: 19, len: 44, P: 11, ph: 0, vk: 'sedan' });
  B.traffic(bk[6][0] + 9, { x: -6, dir: -1, v: 4.5, len: 38, P: 14, ph: 3, vk: 'bus' });
  B.traffic(bk[6][1] - 5, { x: -2, v: 14, len: 46, P: 9, ph: 5, vk: 'taxi', lc: { x1: -9, t0: 1.2, dur: 1.1 } });
  cityStack(B, bk[6][0] + 30, { y: 9, sign: '공사장 방면 →', text: 'NEXT: SITE' });
  // b7 (공사장 정문 직전)
  B.hop(mid(bk[7]), 1.6, { label: '낮은 장벽 1.6m', v0: 9 });
}

// ───────── 구간 3: 공사장 — 짓다 만 골조 사이, 철골 빔 위, 공사 중인 건물 안을 지난다 ─────────
export function sec3(B, bk) {
  siteScene(B, 1500, 2400);
  B.add('sitegate', { s: 1500 });
  B.box(1500, 0, 12.6, 16.8, 0.9, 0.6, 'gate');          // 현장 정문 상단 보 (12~13.5m)
  B.street(1500, 2400, { lamps: true, lampEvery: 40, trees: false, intersections: [] });
  // b0: 콘크리트 장벽 + 지그재그 철근 가시판 + 크레인 지브
  B.hop(bk[0][0] + 14, 3.5, { label: '콘크리트 장벽 3.5m', style: 'concrete' });
  for (let i = 0; i < 3; i++) B.spikeStrip(bk[0][0] + 36 + i * 11, i % 2 ? -16.6 : -1.5, i % 2 ? 1.5 : 16.6, { d: 2.0 });
  B.jib(bk[0][0] + 62, 24, { side: 1, hook: 9 });
  B.jib(bk[0][0] + 62.5, 33, { side: -1 });
  // b1: 터파기 구덩이 위 '철골 빔 다리' (폭 8.8m) + 철거 철구
  B.ground(bk[1][0] + 4, bk[1][1] - 4, { half: 4.4, surf: 'girder' });
  B.add('pit', { s0: bk[1][0] + 4, s1: bk[1][1] - 4, half: 4.4 });
  B.ball(mid(bk[1]), { py: 19, L: 15, per: 4.6, ph: 0, amp: 0.7 });
  // b2: 공사 중인 건물 1층 관통 (천장 슬래브 6.2m + 기둥 숲 + 이동 바리케이드)
  {
    const a = bk[2][0] + 6, b = bk[2][1] - 4;
    B.ceiling(a, b, 6.2, { style: 'slab' });
    B.box((a + b) / 2, 0, (11.2 + 48) / 2, CORR_S, (48 - 11.2) / 2, (b - a) / 2, 'building');   // 슬래브 위로 올라가는 골조(위로 넘어갈 수 없음)
    B.add('slabfloor', { s0: a, s1: b, y: 6.2, top: 48 });
    const rows = [[a + 10, [-12, -4, 4, 12]], [a + 24, [-8, 0, 8]], [a + 38, [-12, -4, 4, 12]], [a + 52, [-8, 0, 8]]];
    for (const [s, xs] of rows) if (s < b - 3) for (const x of xs) B.pillar(s, x, 1.2, 6.2, { style: 'column' });
    B.barricade(a + 17, { x0: -9, x1: 9, per: 5.2, ph: 0 });
    B.barricade(a + 45, { x0: 9, x1: -9, per: 4.4, ph: 1.3 });
  }
  // b3: 크레인이 떨어뜨리는 자재 + 전선 아래 장벽
  B.debris(mid(bk[3]) - 6, { xr: 20, zs: 10, y0: 30, P: 3.0, n: 2, size: [1.4, 0.35, 0.5], kind: 'beam' });
  B.jib(bk[3][0] + 6, 22, { side: -1, hook: 8 });
  B.hop(bk[3][1] - 10, 2.2, { wire: 3.6, label: '전선 아래 장벽 2.2m', style: 'concrete' });
  // b4: 굴러오는 드럼통 + 가시판 + 크레인 2대
  B.barrels(bk[4][0] + 12, { xs: -17, dir: 1, v: 8, len: 34, P: 4.2, ph: 0 });
  B.barrels(bk[4][0] + 26, { xs: 17, dir: -1, v: 8.5, len: 34, P: 4.2, ph: 2 });
  B.spikeStrip(bk[4][0] + 40, -16.6, -2, { d: 2.4 });
  B.barrels(bk[4][0] + 54, { xs: -17, dir: 1, v: 9, len: 34, P: 4.2, ph: 1 });
  B.jib(bk[4][0] + 33, 16, { side: 1, hook: 0 });
  B.jib(bk[4][0] + 34, 27, { side: -1, hook: 0 });
  B.jib(bk[4][0] + 33, 37, { side: 1, hook: 0 });
  // b5: 크레인이 들어 올린 철골 데크 위로 올라타기 (4.5m)
  B.stepFlight(bk[5][0] + 6, 38, 4.5, { label: '철골 데크 4.5m 올라타기', style: 'girder' });
  // b6: 철구 2개 + 바닥 톱날 + 크레인
  B.ball(bk[6][0] + 14, { py: 19, L: 15, per: 4.6, ph: 0 });
  B.ball(bk[6][0] + 34, { py: 19, L: 15, per: 4.6, ph: 2.3 });
  B.saw(bk[6][0] + 50, { x0: -11, x1: 11, per: 5.5, ph: 0.2 });
  B.jib(bk[6][0] + 24, 30, { side: 1 });
  // b7 (고가 진입로 직전)
  B.hop(mid(bk[7]), 2.6, { wire: 3.6, label: '전선 아래 장벽 2.6m', style: 'concrete' });
}

// ───────── 구간 4: 고가도로 — 도시 위 16m 를 달린다 ─────────
export function sec4(B, bk) {
  highwayScene(B, 2400, 3300);
  B.guardrail(2400, 3300, -1, { x: 13.0, style: 'parapet' });
  B.guardrail(2400, 3300, 1, { x: 13.0, style: 'parapet' });
  B.street(2400, 3300, { lamps: true, lampEvery: 40, trees: false, intersections: [] });
  // b0: 가시 캐노피(낮은 천장) + 낮은 새 떼
  B.ceiling(bk[0][0] + 6, bk[0][1] - 6, 4.7, { spikes: 1.2, style: 'canopy' });
  B.birds(mid(bk[0]), { y0: 1.5, pat: 'sine', amp: 9, per: 6, n: 6, spread: 1.4, kind: 'crow' });
  // b1: 낮은 새 떼(지면 대역) + 고압 송전선
  B.birds(mid(bk[1]), { y0: 1.4, pat: 'sine', amp: 10, per: 6.4, n: 9, spread: 1.5, ph: 1.3 });
  B.powerline(bk[1][0] + 8, [10, 17, 24, 31, 38]);
  // b2: 전선 아래 장벽 + 높은 전선
  B.hop(bk[2][0] + 20, 2.6, { wire: 3.6, label: '전선 아래 장벽 2.6m' });
  B.wireSpan(bk[2][0] + 46, 11, { x0: -13, x1: 13, sparks: true });
  B.wireSpan(bk[2][0] + 52, 13.5, { x0: -13, x1: 13 });
  B.powerline(bk[2][1] - 6, [17, 24, 31, 38]);
  // b3: 중간 고도 새 떼 + 낮은 장벽(너무 높이 뜨면 새 떼)
  B.hop(bk[3][0] + 16, 1.5, { label: '낮은 장벽 1.5m(새 떼 아래)' });
  B.birds(bk[3][0] + 16, { y0: 6.5, pat: 'circle', amp: 8, per: 7, n: 8, spread: 1, kind: 'crow' });
  // b4: 표지판 구조물 + 가시 캐노피 + 새 떼
  B.box(bk[4][0] + 12, 0, 7.0, 13, 0.9, 0.5, 'gantry'); B.add('signgantry', { s: bk[4][0] + 12 });
  B.ceiling(bk[4][0] + 40, bk[4][1] - 6, 4.4, { spikes: 1.3, style: 'canopy' });
  B.birds(bk[4][0] + 28, { y0: 2.0, pat: 'shuttle', amp: 7, per: 5, n: 5, x0: -6, kind: 'crow', spread: 1.6 });
  // b5: 가시+전선 장벽 + 송전선
  B.hop(mid(bk[5]), 4.3, { spikes: 0.8, wire: 3.6, label: '가시·전선 장벽 4.3m' });
  B.powerline(bk[5][1] - 5, [14, 21, 28, 35]);
  // b6: 높이대가 다른 새 떼 3개
  B.birds(bk[6][0] + 10, { y0: 1.4, pat: 'sine', amp: 9, per: 6, n: 8, spread: 1.4, ph: 0.5 });
  B.birds(bk[6][0] + 28, { y0: 6.5, pat: 'circle', amp: 7, per: 6.5, n: 8, spread: 1, ph: 2 });
  B.birds(bk[6][0] + 46, { y0: 15, pat: 'vcircle', amp: 9, per: 6, n: 8, spread: 1.2, ph: 1 });
  B.wireSpan(bk[6][0] + 38, 11.5, { x0: -13, x1: 13 });
  B.powerline(bk[6][0] + 56, [22, 29, 36]);
  // b7: 단상(고가 출구 램프) 올라타기
  B.stepFlight(bk[7][0] + 6, 28, 3.5, { label: '고가 상단부 3.5m 올라타기' });
}
