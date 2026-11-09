// 테무 로드스터: 커스텀 단면 곡선(측면 프로파일 × 평면 폭 × 휀더 볼륨)을 정점으로 직접 설계한 각진 저폴리 모델
// 좌표: x=오른쪽, y=위, z=뒤쪽(앞쪽=-z), 원점=질량중심(지상 0.55m). 전장 4.6m, 전폭 약 2.0m, 전고 1.1m
import { MeshBuilder, hex, mulc } from './mesh.js';

export const CAR_COLORS = {
  paint: hex(0xf3f6f9), paintShade: hex(0xc9d1da), glass: hex(0x0c131c), trim: hex(0x15181d), under: hex(0x2a2d33),
  tire: hex(0x0e0e10), rim: hex(0xd5dae1), spoke: hex(0x30343b), orange: [4.2, 1.1, 0.12],
  tail: [5.0, 0.12, 0.16], head: [3.6, 4.2, 5.0], nozzle: hex(0x6b7078),
};
export const WHEEL_POS = [[-0.86, -0.21, -1.375], [0.86, -0.21, -1.375], [-0.86, -0.21, 1.375], [0.86, -0.21, 1.375]];   // 좌앞 우앞 좌뒤 우뒤
export const NOZZLE_POS = [[-1.04, -0.14, -1.92], [1.04, -0.14, -1.92], [-1.04, -0.14, 1.92], [1.04, -0.14, 1.92]];

// 하부 차체 정거장: [z, 바닥y, 반폭, 데크y]
const ST = [
  [-2.30, -0.36, 0.76, -0.10], [-2.20, -0.41, 0.86, -0.06], [-1.95, -0.43, 0.93, 0.00], [-1.62, -0.43, 0.975, 0.06],
  [-1.28, -0.43, 0.985, 0.10], [-0.95, -0.43, 0.97, 0.12], [-0.60, -0.43, 0.96, 0.14], [-0.20, -0.43, 0.97, 0.17],
  [0.30, -0.43, 0.97, 0.19], [0.85, -0.43, 0.98, 0.20], [1.30, -0.43, 0.99, 0.19], [1.70, -0.42, 0.98, 0.16],
  [2.05, -0.40, 0.93, 0.12], [2.30, -0.34, 0.82, 0.08],
];
// 글래스 하우스 정거장: [z, 지붕y, 지붕 반폭, 밑 반폭]
const GL = [
  [-0.66, 0.17, 0.68, 0.86], [-0.40, 0.33, 0.57, 0.90], [-0.05, 0.47, 0.52, 0.91], [0.38, 0.55, 0.51, 0.92],
  [0.85, 0.53, 0.50, 0.91], [1.28, 0.41, 0.48, 0.88], [1.72, 0.23, 0.62, 0.82],
];
const deckY = (z) => {
  for (let i = 0; i < ST.length - 1; i++) if (z >= ST[i][0] && z <= ST[i + 1][0]) { const t = (z - ST[i][0]) / (ST[i + 1][0] - ST[i][0]); return ST[i][3] + (ST[i + 1][3] - ST[i][3]) * t; }
  return ST[ST.length - 1][3];
};

function bodyRing(z, yb, hw, yd) {
  const hwb = hw - 0.14;
  return [[-hwb, yb, z], [hwb, yb, z], [hw, yb + 0.11, z], [hw, yd - 0.12, z], [hw - 0.09, yd, z], [hw * 0.5, yd + 0.025, z], [0, yd + 0.035, z], [-hw * 0.5, yd + 0.025, z], [-(hw - 0.09), yd, z], [-hw, yd - 0.12, z], [-hw, yb + 0.11, z]];
}

export function buildRoadster() {
  const C = CAR_COLORS;
  const paint = new MeshBuilder(), glass = new MeshBuilder(), trim = new MeshBuilder(), glow = new MeshBuilder();

  // ── 하부 차체 (긴 쐐기형 노즈, 낮은 후드, 짧고 날렵한 뒷부분) ──
  const rings = ST.map((s) => bodyRing(s[0], s[1], s[2], s[3]));
  paint.loft(rings, C.paint, { capStart: true, capEnd: true, colors: (i, k) => (k === 0 ? C.under : k === 1 || k === 10 ? mulc(C.paint, 0.78) : k === 2 || k === 9 ? mulc(C.paint, 0.9) : C.paint) });

  // ── 글래스 캐노피 (앞으로 쏠린 윈드실드, 패스트백 유리 루프) ──
  const grings = GL.map((g) => {
    const yb = deckY(g[0]) - 0.02;
    return [[-g[3], yb, g[0]], [g[3], yb, g[0]], [g[2] + 0.07, g[1] - 0.14, g[0]], [g[2], g[1], g[0]], [-g[2], g[1], g[0]], [-(g[2] + 0.07), g[1] - 0.14, g[0]]];
  });
  glass.loft(grings, C.glass, { capStart: true, capEnd: true });
  // A필러/루프 레일 (어두운 프레임)
  for (const s of [-1, 1]) {
    trim.beam([s * 0.86, deckY(-0.66), -0.66], [s * 0.57, 0.335, -0.4], 0.035, 0.03, C.trim);
    trim.beam([s * 0.57, 0.335, -0.4], [s * 0.52, 0.475, -0.05], 0.035, 0.03, C.trim);
    trim.beam([s * 0.52, 0.475, -0.05], [s * 0.50, 0.545, 0.85], 0.035, 0.03, C.trim);
    trim.beam([s * 0.50, 0.545, 0.85], [s * 0.62, 0.235, 1.72], 0.035, 0.03, C.trim);
  }

  // ── 휀더 아치(플레어 립 + 어두운 휠 웰), 사이드 스커트, 도어 라인, 공기 흡입구 ──
  for (let i = 0; i < 4; i++) {
    const w = WHEEL_POS[i], s = w[0] < 0 ? -1 : 1, z = w[2];
    // 아치 립: 바퀴 위쪽 반원을 따라 올라가는 띠 (각진 8면)
    const segs = 8, R0 = 0.43, R1 = 0.5;
    for (let k = 0; k < segs; k++) {
      const a0 = Math.PI * (k / segs), a1 = Math.PI * ((k + 1) / segs);
      const p = (R, a, x) => [s * x, w[1] + Math.sin(a) * R, z + Math.cos(a) * R];
      const xi = 0.95, xo = 1.02;
      paint.quadOut(p(R0, a0, xi), p(R0, a1, xi), p(R1, a1, xo), p(R1, a0, xo), [s * 1, 0.4, 0], k === 0 || k === segs - 1 ? mulc(C.paint, 0.9) : C.paint);
      paint.quadOut(p(R1, a0, xo), p(R1, a1, xo), p(R1, a1, xi - 0.02), p(R1, a0, xi - 0.02), [0, 1, 0], C.paint);
      trim.quadOut(p(R0 - 0.02, a0, 0.9), p(R0 - 0.02, a1, 0.9), p(R0 - 0.02, a1, xi), p(R0 - 0.02, a0, xi), [0, -1, 0], C.trim);   // 웰 안쪽
    }
    trim.box(s * 0.935, w[1] - 0.17, z, 0.012, 0.2, 0.42, C.trim, {});          // 휠 웰 어두운 면
  }
  for (const s of [-1, 1]) {
    paint.box(s * 0.975, -0.37, 0.0, 0.035, 0.045, 0.98, mulc(C.paint, 0.85), { bevel: 0.012 });   // 사이드 스커트
    trim.box(s * 0.99, -0.30, 0.0, 0.012, 0.02, 0.92, C.trim);
    trim.box(s * 0.985, 0.02, -0.46, 0.006, 0.13, 0.008, C.trim);              // 도어 라인
    trim.box(s * 0.985, 0.03, 0.78, 0.006, 0.13, 0.008, C.trim);
    trim.box(s * 0.985, 0.06, 0.88, 0.008, 0.045, 0.22, C.trim);               // 리어 사이드 흡입구
    trim.box(s * 0.975, -0.12, -1.0, 0.008, 0.035, 0.16, C.trim);              // 프런트 브레이크 덕트
    // 사이드 미러
    trim.beam([s * 0.9, 0.2, -0.52], [s * 1.0, 0.24, -0.56], 0.02, 0.02, C.trim);
    paint.box(s * 1.04, 0.255, -0.56, 0.035, 0.032, 0.085, C.paint, { bevel: 0.012 });
  }

  // ── 프런트 스플리터 / 흡입구 / 슬릿 헤드램프 ──
  trim.box(0, -0.415, -2.24, 0.78, 0.014, 0.1, C.trim);
  for (const s of [-1, 1]) {
    trim.box(s * 0.5, -0.2, -2.27, 0.19, 0.035, 0.012, C.trim);
    glow.save().translate(s * 0.5, -0.02, -2.245).rotY(s * 0.12).box(0, 0, 0, 0.3, 0.011, 0.009, C.head).restore();
    glow.box(s * 0.5, -0.045, -2.236, 0.14, 0.006, 0.008, mulc(C.head, 0.6));
  }
  // 주황색 TEMU 배지 (작게)
  glow.box(0, 0.088, -1.9, 0.075, 0.003, 0.026, C.orange);
  trim.box(0, 0.086, -1.9, 0.09, 0.002, 0.036, C.trim);

  // ── 뒷부분: 가로 테일램프 바, 리어 스포일러 립, 디퓨저 ──
  glow.box(0, 0.075, 2.306, 0.735, 0.017, 0.004, C.tail);
  for (const s of [-1, 1]) glow.save().translate(s * 0.8, 0.07, 2.262).rotY(s * 0.55).box(0, 0, 0, 0.1, 0.017, 0.008, C.tail).restore();
  trim.box(0, 0.035, 2.305, 0.74, 0.018, 0.008, C.trim);
  paint.box(0, 0.178, 2.1, 0.64, 0.011, 0.115, C.paint, { bevel: 0.006 });
  for (const s of [-1, 1]) paint.box(s * 0.5, 0.15, 2.08, 0.012, 0.03, 0.05, C.paint);
  trim.box(0, -0.31, 2.22, 0.62, 0.07, 0.1, C.trim);
  for (let k = -2; k <= 2; k++) trim.box(k * 0.23, -0.36, 2.3, 0.01, 0.06, 0.07, mulc(C.trim, 1.6));

  // ── 연기 배출구 노즐 포드 (네 모서리, 누르면 이 아래로 분사) ──
  const nozzle = new MeshBuilder();
  nozzle.cyl(0, -0.15, 0, 0.1, 0.15, 8, C.nozzle, { bottom: false });
  nozzle.cyl(0, -0.27, 0, 0.14, 0.12, 8, mulc(C.nozzle, 0.7), { r2: 0.1 });
  nozzle.cyl(0, -0.275, 0, 0.1, 0.012, 8, [0.05, 0.05, 0.06], { r2: 0.1, top: false, bottom: true });
  nozzle.box(0, 0.0, 0, 0.13, 0.02, 0.13, mulc(C.nozzle, 1.3), { bevel: 0.008 });
  const pods = new MeshBuilder();                       // 차체에 붙는 지지대 (4개 모두)
  for (let i = 0; i < 4; i++) {
    const n = NOZZLE_POS[i], s = n[0] < 0 ? -1 : 1;
    pods.beam([s * 0.92, -0.12, n[2]], [n[0], n[1], n[2]], 0.07, 0.05, mulc(C.nozzle, 0.8));
  }
  trim.append(pods);

  return { paint, glass, trim, glow, nozzle };
}

// 바퀴 하나(오른쪽 기준: 바깥면 +x). 축은 x. 왼쪽은 y축으로 180도 돌려서 사용.
export function buildWheel() {
  const C = CAR_COLORS, R = 0.34, tire = new MeshBuilder(), rim = new MeshBuilder();
  tire.save().rotZ(-Math.PI / 2);
  tire.cyl(0, -0.125, 0, R, 0.25, 20, C.tire, { bottom: true });
  tire.cyl(0, 0.125, 0, R, 0.02, 20, mulc(C.tire, 1.4), { r2: 0.295, bottom: false, top: false });
  tire.cyl(0, -0.145, 0, 0.295, 0.02, 20, mulc(C.tire, 1.4), { r2: R, bottom: false, top: false });
  tire.restore();
  rim.save().rotZ(-Math.PI / 2);
  rim.cyl(0, 0.115, 0, 0.255, 0.03, 20, C.rim, { r2: 0.235 });
  rim.cyl(0, 0.06, 0, 0.2, 0.06, 12, C.spoke, { top: false });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    rim.beam([Math.cos(a) * 0.05, 0.13, Math.sin(a) * 0.05], [Math.cos(a) * 0.235, 0.13, Math.sin(a) * 0.235], 0.05, 0.022, C.rim);
  }
  rim.cyl(0, 0.13, 0, 0.055, 0.02, 8, mulc(C.rim, 1.15));
  rim.restore();
  return { tire, rim };
}

// 폭발 파편: 차체 삼각형을 영역별로 쪼갠다. 반환: [{ mat, arrays(중심 기준), center }]
export function buildFragments(car) {
  const regions = {};
  const regionOf = (c, isGlass) => {
    const [x, y, z] = c;
    if (isGlass) return z < -0.1 ? 'glassF' : z < 1.0 ? 'roof' : 'glassR';
    if (y < -0.33) return 'under';
    if (z < -1.9) return 'nose';
    if (z < -0.7) return Math.abs(x) < 0.55 ? 'hood' : x < 0 ? 'fenderFL' : 'fenderFR';
    if (z < 0.9) return x < 0 ? 'doorL' : 'doorR';
    if (z > 1.9) return 'tail';
    return Math.abs(x) < 0.55 ? 'trunk' : x < 0 ? 'fenderRL' : 'fenderRR';
  };
  const feed = (mb, mat) => {
    for (let t = 0; t < mb.p.length / 9; t++) {
      const i = t * 9;
      const c = [(mb.p[i] + mb.p[i + 3] + mb.p[i + 6]) / 3, (mb.p[i + 1] + mb.p[i + 4] + mb.p[i + 7]) / 3, (mb.p[i + 2] + mb.p[i + 5] + mb.p[i + 8]) / 3];
      const key = `${regionOf(c, mat === 'glass')}:${mat}`;
      const r = regions[key] || (regions[key] = { mat, mb: new MeshBuilder(), sum: [0, 0, 0], n: 0, tris: [] });
      r.tris.push(t); r.sum[0] += c[0]; r.sum[1] += c[1]; r.sum[2] += c[2]; r.n++;
      r.src = mb;
    }
  };
  feed(car.paint, 'paint'); feed(car.glass, 'glass'); feed(car.trim, 'trim');
  const out = [];
  for (const key of Object.keys(regions)) {
    const r = regions[key];
    if (r.n < 2) continue;
    const ctr = [r.sum[0] / r.n, r.sum[1] / r.n, r.sum[2] / r.n], p = [], n = [], c = [];
    for (const t of r.tris) {
      for (let k = 0; k < 9; k += 3) {
        const i = t * 9 + k;
        p.push(r.src.p[i] - ctr[0], r.src.p[i + 1] - ctr[1], r.src.p[i + 2] - ctr[2]);
        n.push(r.src.n[i], r.src.n[i + 1], r.src.n[i + 2]); c.push(r.src.c[i], r.src.c[i + 1], r.src.c[i + 2]);
      }
    }
    out.push({ mat: r.mat, center: ctr, arrays: { position: new Float32Array(p), normal: new Float32Array(n), color: new Float32Array(c) }, name: key });
  }
  return out;
}
