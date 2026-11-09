// 구간 8~10 콘텐츠: 지하 터널 / 마천루 협곡 / 피날레
const mid = (b) => (b[0] + b[1]) / 2;

// ───────── 구간 8: 지하 터널 (좁고 낮음, 마주 오는 차, 프레스) ─────────
export function sec8(B, bk) {
  B.street(6100, 7000, { style: 'tunnel', lamps: false, trees: false, buildings: false, intersections: [] });
  B.ceiling(6100, 7000, 7.5, { overPads: true, style: 'tunnel' });
  // b0: 고속 마주 오는 차 + 역주행 택시
  B.traffic(bk[0][1] - 5, { x: -2, v: 18, len: 58, P: 8, ph: 0, vk: 'sedan' });
  B.traffic(bk[0][1] - 5, { x: -6, v: 20, len: 58, P: 8, ph: 3.5, vk: 'police', siren: true });
  B.traffic(bk[0][1] - 5, { x: -10, v: 16, len: 58, P: 8, ph: 5.8, vk: 'suv' });
  B.traffic(bk[0][1] - 5, { x: 2, v: 17, len: 58, P: 11, ph: 2, vk: 'taxi', lc: { x1: -4, t0: 1.0, dur: 1.2 } });
  // b1: 천장에서 내려오는 압착판 2개
  B.ceilPlate(bk[1][0] + 14, { x0: -13.5, x1: 13.5, d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 0 });
  B.ceilPlate(bk[1][0] + 36, { x0: -13.5, x1: 13.5, d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 6, hold: 2.6, drop: 0.3, stay: 0.8, rise: 1.6, ph: 3 });
  // b2: 좁아지는 좌우 압착 벽 2개 + 바닥 톱날
  B.press(bk[2][0] + 16, { d: 5, hgt: 7, xo: 13.8, gapMax: 24, gapMin: 0.8, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4, ph: 0 });
  B.saw(bk[2][0] + 33, { x0: -11, x1: 11, per: 5.5, ph: 0.3 });
  B.press(bk[2][0] + 50, { d: 5, hgt: 7, xo: 13.8, gapMax: 24, gapMin: 0.8, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4, ph: 4 });
  // b3: 터널 배관 아래 장벽 + 증기
  B.hop(bk[3][0] + 12, 1.4, { wire: 3.0, style: 'pipe', label: '터널 배관 아래 장벽 1.4m' });
  B.vents(bk[3][0] + 36, { kind: 'steam', n: 3, x0: -8, dx: 8, H: 3.8, w: 2.2, P: 4.2, on: 1.5, warn: 1.0, phStep: 1.4 });
  // b4: 트럭/버스 + 역주행 경찰
  B.traffic(bk[4][1] - 8, { x: -6, v: 12, len: 50, P: 9, ph: 0, vk: 'truck' });
  B.traffic(bk[4][1] - 8, { x: -2, v: 10, len: 50, P: 9, ph: 4.5, vk: 'bus' });
  B.traffic(bk[4][1] - 5, { x: 6, v: 20, len: 58, P: 9, ph: 2, vk: 'police', siren: true });
  // b5: 좌/우 반쪽 가시판이 번갈아 내려옴
  for (const [d, p0, p1] of [[12, 0, 2.5], [32, 2.5, 0]]) {
    B.ceilPlate(bk[5][0] + d, { x0: -13.5, x1: 0, d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 5, hold: 2.0, drop: 0.3, stay: 0.7, rise: 1.4, ph: p0 });
    B.ceilPlate(bk[5][0] + d, { x0: 0, x1: 13.5, d: 4, yTop: 7.5, yHigh: 5.2, yLow: 0, P: 5, hold: 2.0, drop: 0.3, stay: 0.7, rise: 1.4, ph: p1 });
  }
  // b6: 감전 전선 + 전기 아크
  B.wireSpan(bk[6][0] + 10, 1.6, { x0: -13.8, x1: 13.8, sparks: true });
  B.wireSpan(bk[6][0] + 22, 1.6, { x0: -13.8, x1: 13.8, sparks: true });
  B.vents(bk[6][0] + 40, { kind: 'arc', n: 4, x0: -9, dx: 6, H: 4.5, w: 1.4, P: 3.6, on: 1.0, warn: 0.9, phStep: 0.9 });
  // b7
  B.hop(bk[7][0] + 14, 1.2, { wire: 3.2, style: 'pipe', label: '터널 마지막 장벽 1.2m' });
}

// ───────── 구간 9: 마천루 협곡 (수직 상승 + 정밀 비행) ─────────
export function sec9(B, bk) {
  B.street(7000, 8000, { style: 'canyon', hmin: 90, hmax: 240, neon: 0.5, lamps: true, trees: false, intersections: [] });
  B.portal(bk[0][0] + 40, 12, 18, { label: '고층 창문 12~18m', v0: 8 });
  B.debris(mid(bk[1]), { kind: 'sign', size: [2.6, 0.9, 0.35], y0: 40, xr: 20, zs: 10, P: 4.6, n: 2 });
  B.drone(bk[2][0] + 18, { cy: 5, ax: 9, ay: 1.5, az: 6, per: 8 });
  B.portal(bk[2][0] + 46, 20, 26, { label: '고층 창문 20~26m', v0: 8 });
  B.stepFlight(bk[3][0] + 6, 36, 8, { label: '고층 발코니 8m 올라타기', v0: 8 });
  B.portal(bk[4][0] + 14, 8, 14, { label: '창문 8~14m', v0: 8 });
  B.portal(bk[4][0] + 56, 16, 22, { label: '창문 16~22m', v0: 8 });
  B.laserGrid(mid(bk[5]), { H: 40, gw: 12, gh: 3.6, cx: 0, ax: 0, cy: 6, ay: 8, per: 7, per2: 7, phy: 0 });
  B.drone(bk[6][0] + 20, { cy: 6, ax: 9, ay: 2, az: 6, per: 9, ph: 1 });
  B.portal(bk[6][0] + 50, 28, 34, { label: '최고층 창문 28~34m', v0: 8 });
  B.stepFlight(bk[7][0] + 6, 40, 12, { label: '옥상 정원 12m 올라타기', v0: 8 });
}

// ───────── 구간 10: 피날레 (모든 장애물이 섞인 최종 관문) ─────────
export function sec10(B, bk) {
  B.street(8000, 9000, { style: 'dawn', hmin: 60, hmax: 200, neon: 0.2, trees: true, billboards: true, billEvery: 90, intersections: [] });
  B.gapFlight(bk[0][0] + 8, 52, { label: '피날레 틈 52m', v0: 9 });
  B.drone(bk[0][0] + 70, { cy: 5, ax: 9, ay: 1.6, az: 5, per: 8, ph: 0.5 });
  [10, 26, 42].forEach((d, i) => B.laserTrip(bk[1][0] + d, { ys: [0.55, 1.45], blink: { P: 3.2, on: 1.4, warn: 0.8, ph: -i * 1.6 } }));
  B.vents(bk[2][0] + 12, { n: 6, x0: -7.5, dx: 3, phStep: 0.6, P: 4.2, on: 1.1, warn: 1.0, w: 2.0 });
  B.fireRain(bk[2][0] + 28, bk[2][0] + 46, { cnt: 2, P: 3.0, fall: 1.4 });
  B.hop(bk[2][0] + 62, 4.0, { spikes: 0.8, label: '가시 벽 4.0m' });
  B.traffic(bk[3][1] - 5, { x: -2, v: 16, len: 50, P: 8, ph: 0, vk: 'police', siren: true });
  B.traffic(bk[3][1] - 8, { x: -8, v: 14, len: 44, P: 9, ph: 4, vk: 'bus' });
  B.traffic(bk[3][0] + 6, { x: 6, dir: -1, acc: 7, v: 19, len: 42, P: 10, ph: 1, vk: 'suv' });
  B.debris(bk[4][0] + 20, { kind: 'sign', size: [2.6, 0.9, 0.35], y0: 38, xr: 20, zs: 10, P: 4.6, n: 2 });
  B.portal(bk[4][0] + 54, 22, 28, { label: '피날레 창문 22~28m', v0: 8 });
  B.press(bk[5][0] + 14, { d: 5, hgt: 7, xo: 16.4, gapMax: 24, gapMin: 0.8, P: 8, open: 3.5, close: 0.7, closed: 1.3, openT: 1.4, ph: 0 });
  B.ball(bk[5][0] + 40, { py: 19, L: 15, per: 4.6, ph: 1 });
  B.laserScan(bk[6][0] + 24, { x: -12.5, y: 1.0, L: 23.5, w: 0.6, a0: 0 });
  B.gapFlight(bk[6][0] + 54, 22, { label: '피날레 틈 22m', v0: 9 });
  B.hop(bk[7][0] + 18, 6.0, { spikes: 0.8, wire: 3.6, label: '최종 관문: 가시·전선 장벽 6.0m' });
}
