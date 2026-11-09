// 구간 5~7 콘텐츠: 네온 야간 거리(레이저) / 공업·가스 지구(불) / 강 위의 다리(끊긴 다리와 드론)
const mid = (b) => (b[0] + b[1]) / 2;

// ───────── 구간 5: 네온 야간 거리 ─────────
export function sec5(B, bk) {
  B.street(3300, 4200, { style: 'neon', neon: 0.95, billboards: true, billEvery: 64, trees: false, intersections: [], hmin: 50, hmax: 170,
    billTexts: ['NEON', 'RAMEN', 'HOTEL', 'ARCADE', 'TEMU', 'BAR', 'CLUB', 'SUSHI'] });
  // b0: 박자형 점멸 트립 레이저 4개 (이중 빔, 경고 후 켜짐) - 위상이 어긋나 있어 리듬을 읽어야 함
  [12, 28, 44, 60].forEach((d, i) => B.laserTrip(bk[0][0] + d, { ys: [0.55, 1.45], blink: { P: 3.6, on: 1.5, warn: 0.8, ph: -i * 1.9 } }));
  // b1: 회전 스캔 레이저 (도로 왼쪽 가장자리를 축으로 도로 전체를 훑음)
  B.laserScan(mid(bk[1]), { x: -12.5, y: 0.9, L: 23.5, w: 0.55, a0: 0.4 });
  // b2: 틈이 좌우로 움직이는 레이저 격자벽 2개
  B.laserGrid(bk[2][0] + 18, { H: 12, gw: 7.5, gh: 3.2, cx: 0, ax: 7.5, cy: 1.6, ay: 0, per: 6.4, phx: 0 });
  B.laserGrid(bk[2][0] + 50, { H: 12, gw: 7.5, gh: 3.2, cx: 0, ax: 7.5, cy: 1.6, ay: 0, per: 6.4, phx: 2.4 });
  // b3: 빠른 박자의 펄스 레이저 4개
  [8, 20, 32, 44].forEach((d, i) => B.laserTrip(bk[3][0] + d, { ys: [0.5, 1.3], blink: { P: 2.4, on: 1.0, warn: 0.6, ph: -i * 0.8 } }));
  // b4: 고정 레이저 격자 (틈으로 날아서 통과)
  B.laserWall(bk[4][0] + 22, [0.7, 3.4], { win: 0, label: '레이저 격자 틈 0.7~3.4m' });
  B.laserWall(bk[4][0] + 52, [0.7, 3.4, 6.1], { win: 1, label: '레이저 격자 틈 3.4~6.1m' });
  // b5: 양팔 스캔 레이저
  B.laserScan(mid(bk[5]), { x: -12.5, y: 1.3, L: 23.5, w: -0.45, a0: 1.6, arms: 2 });
  // b6: 틈이 위아래로 움직이는 격자벽 (틈이 바닥에 닿는 동안 지상 통과 가능)
  B.laserGrid(mid(bk[6]), { H: 14, gw: 12, gh: 3.4, cx: 0, ax: 0, cy: 3.0, ay: 4.4, per: 5.5, per2: 5.5, phy: 0 });
  // b7
  B.laserWall(bk[7][0] + 20, [0.7, 3.4], { win: 0, label: '레이저 격자 마지막 관문' });
}

// ───────── 구간 6: 공업/가스 지구 ─────────
export function sec6(B, bk) {
  B.street(4200, 5100, { style: 'industrial', lamps: true, trees: false, intersections: [], hmin: 46, hmax: 110, neon: 0.05 });
  // b0: 맨홀/가스관 화염 분출 5개 (엇갈린 위상)
  [[12, -8], [24, 0], [36, 8], [48, -4], [60, 4]].forEach(([d, x], i) => B.vents(bk[0][0] + d, { x0: x, P: 5, on: 1.3, warn: 1.2, ph: i * 1.1 }));
  // b1: 불의 벽 (순서대로 번지는 화염열)
  B.vents(mid(bk[1]), { n: 8, x0: -10.5, dx: 3, phStep: 0.55, P: 4.4, on: 1.2, warn: 1.0, w: 2.2 });
  // b2: 불타는 폐차 슬라롬 + 가스 배관
  B.slalom(bk[2][0] + 8, bk[2][0] + 30, { step: 22, gapW: 9, burn: 0.5 });
  B.hop(bk[2][0] + 56, 2.2, { style: 'pipe', label: '가스 배관 2.2m' });
  // b3: 불 비
  B.fireRain(bk[3][0] + 4, bk[3][1] - 4, { x0: -11, x1: 11, cnt: 3, P: 3.4, fall: 1.5 });
  // b4: 파이프 랙 + 증기 분출
  B.pipeRack(bk[4][0] + 14, 4.6); B.pipeRack(bk[4][0] + 44, 4.6);
  B.vents(bk[4][0] + 14, { kind: 'steam', n: 2, x0: -6, dx: 12, H: 3.8, w: 2.2, P: 4.2, on: 1.6, warn: 1.0, ph: 0 });
  B.vents(bk[4][0] + 44, { kind: 'steam', n: 2, x0: -6, dx: 12, H: 3.8, w: 2.2, P: 4.2, on: 1.6, warn: 1.0, ph: 2.0 });
  // b5: 높은 배관 + 착지 직후 화염
  B.hop(bk[5][0] + 14, 3.0, { style: 'pipe', label: '가스 배관 3.0m' });
  B.vents(bk[5][0] + 36, { x0: 0, H: 8, w: 2.8, P: 5, on: 1.5, warn: 1.4 });
  // b6: 폭발성 파이프(대형 분출) 3개
  [[14, -6, 0], [30, 6, 2], [46, 0, 4]].forEach(([d, x, ph]) => B.vents(bk[6][0] + d, { x0: x, H: 9, w: 3, P: 6, on: 1.5, warn: 1.6, ph }));
  // b7
  B.hop(bk[7][0] + 8, 2.4, { style: 'pipe', label: '가스 배관 2.4m' });
  B.train(bk[7][0] + 30, { P: 26, ph: 3 });                           // 철도 건널목: 차단기가 내려오고 열차가 지나간다
}

// ───────── 구간 7: 강 위의 다리 ─────────
export function sec7(B, bk) {
  B.street(5100, 6100, { style: 'bridge', lamps: false, trees: false, intersections: [], buildings: false });
  // [블록, 시작 오프셋, 틈 길이]  틈이 길수록 연료를 많이 쓴다
  const plan = [[0, 8, 44], [1, 6, 34], [2, 8, 56], [3, 6, 36], [4, 6, 66], [5, 5, 40], [6, 3, 68], [7, 5, 40]];
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
  // 착지 구역을 노리는 순찰 드론 (60m 블록 b1/b3/b5/b7)
  [[1, 50], [3, 50], [5, 51], [7, 51]].forEach(([b, d], i) => B.drone(bk[b][0] + d, { cx: 0, cy: 4.2, ax: 9, ay: 1.4, az: 3, per: 7.5, ph: i * 1.7 }));
  B.drone(bk[0][0] + 66, { cx: 0, cy: 5, ax: 9, ay: 1.6, az: 5, per: 8, ph: 0.5 });
  // 현수교 아치 (고도 제한)
  [[0, 30], [2, 40], [4, 36], [6, 50]].forEach(([b, d]) => B.arch(bk[b][0] + d, 27));
}
