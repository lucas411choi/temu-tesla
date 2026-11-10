// 구간 5~7 콘텐츠: 네온 골목 시장(레이저 + 빨랫줄/등불줄) / 공업·가스 지구(불 + 배관 다리) → 부두 / 강 위의 현수교
import { marketScene, industrialScene, dockScene, bridgeScene } from './scenery.js';
const mid = (b) => (b[0] + b[1]) / 2;

// 골목 '날먹 방지': 건물 사이에 여러 단으로 걸린 줄 (가장 낮은 줄도 7m 이상 → 지상 주행은 항상 가능)
const LAUNDRY = [8, 12.5, 17, 21.5, 26, 30.5, 35, 39.5];
const LANTERN = [9, 14, 19, 24, 29, 34, 39];

// ───────── 구간 5: 네온 골목 시장 ─────────
export function sec5(B, bk) {
  marketScene(B, 3300, 4200);
  B.add('marketgate', { s: 3301, text: '야시장 NIGHT MARKET' });
  B.box(3301, 0, 13.6, 16.8, 1.6, 0.6, 'gate');
  B.box(3301, 0, 15.4, 18.5, 0.25, 0.6, 'gate');
  B.street(3300, 4200, { lamps: false, trees: false, intersections: [], billboards: true, billEvery: 64,
    billTexts: ['NEON', 'RAMEN', 'HOTEL', 'ARCADE', 'TEMU', '분식', '노래방', 'SUSHI'] });
  // b0: 박자형 점멸 트립 레이저 4개 + 등불줄
  [12, 28, 44, 60].forEach((d, i) => B.laserTrip(bk[0][0] + d, { ys: [0.55, 1.45], blink: { P: 3.6, on: 1.5, warn: 0.8, ph: -i * 1.9 } }));
  B.lines(bk[0][0] + 36, LANTERN, { kind: 'lantern' });
  // b1: 회전 스캔 레이저 + 빨랫줄
  B.laserScan(mid(bk[1]), { x: -12.5, y: 0.9, L: 23.5, w: 0.55, a0: 0.4 });
  B.lines(bk[1][1] - 6, LAUNDRY, { kind: 'laundry' });
  // b2: 틈이 좌우로 움직이는 레이저 격자벽 2개 + 등불줄(격자 위)
  B.laserGrid(bk[2][0] + 18, { H: 12, gw: 7.5, gh: 3.2, cx: 0, ax: 7.5, cy: 1.6, ay: 0, per: 6.4, phx: 0 });
  B.laserGrid(bk[2][0] + 50, { H: 12, gw: 7.5, gh: 3.2, cx: 0, ax: 7.5, cy: 1.6, ay: 0, per: 6.4, phx: 2.4 });
  B.lines(bk[2][0] + 34, [17, 22, 27, 32, 37], { kind: 'lantern' });
  // b3: 빠른 박자의 펄스 레이저 4개 + 빨랫줄
  [8, 20, 32, 44].forEach((d, i) => B.laserTrip(bk[3][0] + d, { ys: [0.5, 1.3], blink: { P: 2.4, on: 1.0, warn: 0.6, ph: -i * 0.8 } }));
  B.lines(bk[3][0] + 26, LAUNDRY, { kind: 'laundry' });
  // b4: 고정 레이저 격자 (틈으로 날아서 통과)
  B.laserWall(bk[4][0] + 22, [0.7, 3.4], { win: 0, label: '레이저 격자 틈 0.7~3.4m' });
  B.laserWall(bk[4][0] + 52, [0.7, 3.4, 6.1], { win: 1, label: '레이저 격자 틈 3.4~6.1m' });
  // b5: 양팔 스캔 레이저 + 등불줄
  B.laserScan(mid(bk[5]), { x: -12.5, y: 1.3, L: 23.5, w: -0.45, a0: 1.6, arms: 2 });
  B.lines(bk[5][0] + 6, LANTERN, { kind: 'lantern' });
  // b6: 틈이 위아래로 움직이는 격자벽 (틈이 바닥에 닿는 동안 지상 통과 가능) + 빨랫줄
  B.laserGrid(mid(bk[6]), { H: 14, gw: 12, gh: 3.4, cx: 0, ax: 0, cy: 3.0, ay: 4.4, per: 5.5, per2: 5.5, phy: 0 });
  B.lines(bk[6][0] + 8, LAUNDRY, { kind: 'laundry' });
  // b7
  B.laserWall(bk[7][0] + 20, [0.7, 3.4], { win: 0, label: '레이저 격자 마지막 관문' });
}

// ───────── 구간 6: 공업/가스 지구 → 부두 ─────────
export function sec6(B, bk) {
  industrialScene(B, 4200, 5040);
  dockScene(B, 5040, 5100);
  B.add('plantgate', { s: 4200 });
  B.box(4200, 0, 47, 17.8, 2, 0.8, 'gate');
  for (const side of [-1, 1]) B.box(4200, side * 17.4, 24, 0.8, 24, 0.8, 'gate');
  B.street(4200, 5100, { lamps: true, lampEvery: 38, trees: false, intersections: [] });
  // b0: 맨홀/가스관 화염 분출 5개 (엇갈린 위상)
  [[12, -8], [24, 0], [36, 8], [48, -4], [60, 4]].forEach(([d, x], i) => B.vents(bk[0][0] + d, { x0: x, P: 5, on: 1.3, warn: 1.2, ph: i * 1.1 }));
  B.pipeBridge(bk[0][0] + 30, 13); B.pipeBridge(bk[0][0] + 31, 24, { kind: 'conveyor' }); B.pipeBridge(bk[0][0] + 30, 35);
  // b1: 불의 벽 (순서대로 번지는 화염열) + 컨베이어
  B.vents(mid(bk[1]), { n: 8, x0: -10.5, dx: 3, phStep: 0.55, P: 4.4, on: 1.2, warn: 1.0, w: 2.2 });
  B.pipeBridge(mid(bk[1]) + 14, 15, { kind: 'conveyor' }); B.pipeBridge(mid(bk[1]) + 15, 27);
  // b2: 불타는 폐차 슬라롬 + 가스 배관
  B.slalom(bk[2][0] + 8, bk[2][0] + 30, { step: 22, gapW: 9, burn: 0.5 });
  B.hop(bk[2][0] + 56, 2.2, { style: 'pipe', label: '가스 배관 2.2m' });
  B.pipeBridge(bk[2][0] + 38, 12); B.pipeBridge(bk[2][0] + 39, 22, { kind: 'conveyor' }); B.pipeBridge(bk[2][0] + 38, 33);
  // b3: 불 비 (굴뚝 불똥)
  B.fireRain(bk[3][0] + 4, bk[3][1] - 4, { x0: -11, x1: 11, cnt: 3, P: 3.4, fall: 1.5 });
  // b4: 파이프 랙 + 증기 분출 + 상부 배관
  B.pipeRack(bk[4][0] + 14, 4.6); B.pipeRack(bk[4][0] + 44, 4.6);
  B.vents(bk[4][0] + 14, { kind: 'steam', n: 2, x0: -6, dx: 12, H: 3.8, w: 2.2, P: 4.2, on: 1.6, warn: 1.0, ph: 0 });
  B.vents(bk[4][0] + 44, { kind: 'steam', n: 2, x0: -6, dx: 12, H: 3.8, w: 2.2, P: 4.2, on: 1.6, warn: 1.0, ph: 2.0 });
  B.pipeBridge(bk[4][0] + 29, 16); B.pipeBridge(bk[4][0] + 30, 26, { kind: 'conveyor' }); B.pipeBridge(bk[4][0] + 29, 36);
  // b5: 높은 배관 + 착지 직후 화염
  B.hop(bk[5][0] + 14, 3.0, { style: 'pipe', label: '가스 배관 3.0m' });
  B.vents(bk[5][0] + 36, { x0: 0, H: 8, w: 2.8, P: 5, on: 1.5, warn: 1.4 });
  // b6: 폭발성 파이프(대형 분출) 3개 + 상부 배관
  [[14, -6, 0], [30, 6, 2], [46, 0, 4]].forEach(([d, x, ph]) => B.vents(bk[6][0] + d, { x0: x, H: 9, w: 3, P: 6, on: 1.5, warn: 1.6, ph }));
  B.pipeBridge(bk[6][0] + 54, 18); B.pipeBridge(bk[6][0] + 55, 30, { kind: 'conveyor' });
  // b7 (부두)
  B.hop(bk[7][0] + 8, 2.4, { style: 'pipe', label: '가스 배관 2.4m' });
  B.train(bk[7][0] + 30, { P: 26, ph: 3 });                           // 부두 화물열차 건널목
}

// ───────── 구간 7: 강 위의 현수교 ─────────
export function sec7(B, bk) {
  B.street(5100, 6100, { lamps: false, trees: false, intersections: [] });
  const towers = [bk[2][0] + 6, bk[4][0] + 10, bk[6][0] + 8];
  bridgeScene(B, 5100, 6100, towers);
  // 주탑 가로보 2단 (31~34m, 52~56m) — 다리 위 '날먹' 방지
  for (const ts of towers) { B.box(ts, 0, 32.5, 16.9, 1.5, 1.6, 'tower'); B.box(ts, 0, 54, 16.9, 2, 1.6, 'tower'); }
  // [블록, 시작 오프셋, 틈 길이]  연료 소모가 빨라져서 틈을 줄였다 (예전 최대 68m → 40m)
  const plan = [[0, 8, 34], [1, 6, 28], [2, 14, 36], [3, 6, 28], [4, 18, 40], [5, 5, 32], [6, 16, 40], [7, 5, 30]];
  const gaps = [];
  for (const [b, off, len] of plan) {
    const s = bk[b][0] + off;
    B.gapFlight(s, len, { label: `끊어진 다리 ${len}m`, v0: 9 });
    gaps.push([s, s + len]);
  }
  // 난간 (틈에서는 끊김)
  let cur = 5100;
  for (const [a, b] of gaps.concat([[6100, 6100]])) {
    if (a - cur > 6) for (const side of [-1, 1]) B.guardrail(cur, a, side, { x: 12.6, style: 'bridge' });
    cur = b;
  }
  // 착지 구역을 노리는 순찰 드론
  [[1, 50], [3, 50], [5, 51], [7, 46]].forEach(([b, d], i) => B.drone(bk[b][0] + d, { cx: 0, cy: 4.2, ax: 9, ay: 1.4, az: 3, per: 7.5, ph: i * 1.7 }));
  B.drone(bk[0][0] + 66, { cx: 0, cy: 5, ax: 9, ay: 1.6, az: 5, per: 8, ph: 0.5 });
  // 현수교 아치 (고도 제한)
  [[0, 30], [2, 64], [4, 66], [6, 66]].forEach(([b, d]) => B.arch(bk[b][0] + d, 22));
}
