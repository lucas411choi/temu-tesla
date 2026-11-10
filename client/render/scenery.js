// 구간별 주변 풍경 / 날먹 방지 구조물 / 놀이공원 장식의 정점 지오메트리.
// 충돌 상자는 shared/maps 쪽에서 같은 치수로 만든다 (보이는 것 = 닿으면 터지는 것).
import { mulc, mixc, hex } from './mesh.js';
import { makeRng } from '../../shared/math.js';
import { cableY } from '../../shared/maps/scenery.js';
import { K, neon, paint, Z, clipOf, every } from './palette.js';

const CORR = 16.6;

// ───────── 골목 / 공원 ─────────
function pole(B, d) {
  const x = d.side * 16.1, z = Z(d.s);
  B.prop.cyl(x, 0, z, 0.18, 9.2, 7, mulc(K.conc, 0.85), { r2: 0.15 });
  B.metal.box(x, 8.6, z, 0.9, 0.06, 0.06, K.dark);
  B.metal.box(x - d.side * 0.35, 7.2, z, 0.25, 0.45, 0.25, mulc(K.steel, 0.6));
  if (d.prev !== null && d.prev !== undefined) B.metal.beam([x, 8.3, Z(d.prev)], [x, 8.3, z], 0.05, 0.05, K.dark);
}
function bench(B, d) {
  const z = Z(d.s);
  B.prop.box(d.x, 0.45, z, 0.32, 0.06, 1.05, K.brown); B.prop.box(d.x + Math.sign(d.x) * 0.3, 0.75, z, 0.04, 0.3, 1.05, K.brown);
  for (const dz of [-0.9, 0.9]) B.metal.box(d.x, 0.22, z + dz, 0.3, 0.22, 0.05, K.dark);
}
function fountain(B, d) {
  const z = Z(d.s);
  B.prop.cyl(d.x, 0, z, 4.2, 1.0, 16, mulc(K.conc, 1.1), { bottom: false });
  B.water.cyl(d.x, 0.9, z, 3.8, 0.05, 16, [0.05, 0.25, 0.4]);
  B.prop.cyl(d.x, 0, z, 0.7, 4.0, 8, mulc(K.conc, 1.15), { r2: 0.5 });
  B.prop.cyl(d.x, 3.2, z, 1.6, 0.25, 12, mulc(K.conc, 1.15));
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; B.glow.box(d.x + Math.cos(a) * 3.4, 1.0, z + Math.sin(a) * 3.4, 0.12, 0.05, 0.12, [0.6, 2.6, 3.4]); }
}
function parkgate(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) { B.prop.box(s * (d.half + 0.6), 2.4, z, 0.6, 2.4, 0.6, mulc(K.rust, 1.4), { bevel: 0.08 }); B.glow.box(s * (d.half + 0.6), 4.95, z, 0.4, 0.15, 0.4, K.lamp); }
  for (const s of [-1, 1]) for (let x = 17.5; x < d.half - 0.2; x += 1.2) B.metal.box(s * x, 0.6, z, 0.03, 0.6, 0.03, K.dark);
  ctx.signs.push({ x: (d.half - 4) * (d.s > 600 ? -1 : 1), y: 3.2, z: z + 0.7, w: 6, h: 1.2, ry: 0, text: 'TEMU 근린공원', color: '#9dff7a', fixed: true });
}

// ───────── 공사장 ─────────
function skel(B, d, ctx) {
  const rng = makeRng(d.seed), side = d.side, z = Z(d.s), hz = d.w / 2, x0 = 17, x1 = 17 + d.d, cx = side * (x0 + x1) / 2, hx = d.d / 2;
  const done = d.h * d.done, fl = 3.6;
  // 기둥 (전체 높이)
  for (let x = x0 + 0.6; x <= x1 - 0.5; x += Math.max(5, d.d / 4)) for (let k = -hz + 0.6; k <= hz - 0.5; k += Math.max(5, d.w / 5)) {
    B.prop.box(side * x, d.h / 2, z + k, 0.4, d.h / 2, 0.4, mulc(K.conc, 0.95));
  }
  // 슬래브 (완성된 층까지)
  for (let y = fl; y <= done; y += fl) B.prop.box(cx, y, z, hx, 0.18, hz, mulc(K.concD, 0.9 + rng() * 0.15));
  // 미완성 층: 철골 보만
  for (let y = Math.ceil(done / fl) * fl; y <= d.h; y += fl) { B.metal.box(cx, y, z - hz + 0.3, hx, 0.12, 0.12, mulc(K.orange, 0.8)); B.metal.box(cx, y, z + hz - 0.3, hx, 0.12, 0.12, mulc(K.orange, 0.8)); B.metal.box(side * (x0 + 0.3), y, z, 0.12, 0.12, hz, mulc(K.orange, 0.8)); }
  // 내부 어두운 코어 + 작업등
  B.prop.box(cx + side * 2, done / 2, z, hx * 0.5, done / 2, hz * 0.45, mulc(K.dark, 0.8));
  for (let y = fl * 1.5; y < done; y += fl * (2 + Math.floor(rng() * 3))) B.glow.box(side * (x0 + 1.5), y, z + (rng() - 0.5) * hz, 0.2, 0.1, 0.5, [5, 4.2, 2.6]);
  // 도로 쪽 비계 + 안전망
  const fx = side * (x0 - 0.08);
  for (let k = -hz; k <= hz + 0.01; k += 2.5) B.metal.box(fx, done / 2, z + k, 0.05, done / 2, 0.05, K.steel);
  for (let y = 2; y < done; y += 2) B.metal.box(fx, y, z, 0.05, 0.05, hz, K.steel);
  if (d.net) {
    const col = rng() < 0.5 ? [0.05, 0.28, 0.12] : [0.06, 0.16, 0.36];
    B.net.box(side * (x0 - 0.18), done / 2, z, 0.02, done / 2, hz, col);
  } else B.prop.box(side * (x0 + 0.2), Math.min(done, 8) / 2, z, 0.05, Math.min(done, 8) / 2, hz, mulc(K.white, 0.75));
  // 옥상 경고등
  B.glow.box(side * (x0 + 0.5), d.h + 0.3, z - hz + 0.5, 0.18, 0.18, 0.18, K.red3); ctx.beacons.push([side * (x0 + 0.5), d.h + 0.3, z - hz + 0.5]);
}
function hoard(B, d) {
  const [a, b] = clipOf(d), zc = Z((a + b) / 2), hz = (b - a) / 2;
  for (const side of [-1, 1]) {
    B.prop.box(side * 16.75, 1.5, zc, 0.1, 1.5, hz, mulc(K.white, 0.85));
    B.prop.box(side * 16.64, 2.6, zc, 0.02, 0.25, hz, mulc(K.blue, 1.2));
    B.prop.box(side * 16.64, 0.35, zc, 0.02, 0.15, hz, mulc(K.yellow, 0.9));
    for (const s of every(d, 4, 18, a, b)) B.glow.box(side * 16.62, 3.1, Z(s), 0.03, 0.1, 0.2, K.orange3);
  }
}
function sitegate(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) B.prop.box(s * 17.2, 6.75, z, 0.55, 6.75, 0.6, mulc(K.yellow, 0.9), { bevel: 0.06 });
  B.stripe.box(0, 12.6, z, 16.8, 0.9, 0.6, [1, 1, 1], { uv: [2.6, 2.6] });
  ctx.signs.push({ x: 0, y: 12.6, z: z + 0.62, w: 14, h: 1.5, ry: 0, text: 'TEMU 건설 현장 · 안전제일', color: '#ffd24a', fixed: true });
  for (let x = -15; x <= 15; x += 5) B.glow.box(x, 11.62, z + 0.4, 0.15, 0.06, 0.15, K.orange3);
}
function crane(B, d, ctx) {
  const z = Z(d.s), sd = d.side, mx = d.x, y = d.y, top = d.top + 6, col = mulc(K.yellow, 0.95);
  // 마스트 (격자: 4개 기둥 + 사선)
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.metal.box(mx + ox * 0.9, top / 2, z + oz * 0.9, 0.09, top / 2, 0.09, col);
  for (let yy = 0; yy < top - 2; yy += 2.4) { B.metal.beam([mx - 0.9, yy, z - 0.9], [mx + 0.9, yy + 2.4, z - 0.9], 0.05, 0.05, col); B.metal.beam([mx - 0.9, yy, z + 0.9], [mx + 0.9, yy + 2.4, z + 0.9], 0.05, 0.05, col); }
  // 지브 (도로 위 트러스: y ~ y+1.8)
  const xa = mx + sd * 11, xb = -sd * 19.5;
  for (const [yy, zz] of [[y, -0.85], [y, 0.85], [y + 1.8, 0]]) B.metal.beam([xa, yy, z + zz], [xb, yy, z + zz], 0.12, 0.12, col);
  for (let t = 0; t < 1; t += 0.05) { const x0 = xa + (xb - xa) * t, x1 = xa + (xb - xa) * (t + 0.05); B.metal.beam([x0, y, z - 0.85], [x1, y + 1.8, z], 0.05, 0.05, col); B.metal.beam([x0, y, z + 0.85], [x1, y + 1.8, z], 0.05, 0.05, col); }
  B.stripe.box(-sd * 15, y + 0.9, z, 1.4, 0.9, 0.9, [1, 1, 1], { uv: [2.6, 2.6] });
  // 꼭대기(에이프레임) + 당김줄 + 운전석 + 평형추
  B.metal.beam([mx, y + 1.8, z], [mx, y + 8, z], 0.2, 0.2, col);
  B.metal.beam([mx, y + 8, z], [xb, y + 1.8, z], 0.04, 0.04, K.dark); B.metal.beam([mx, y + 8, z], [xa, y + 1.8, z], 0.04, 0.04, K.dark);
  B.prop.box(mx - sd * 1.4, y - 1.0, z, 1.0, 1.0, 1.0, mulc(K.white, 0.9)); B.glass.box(mx - sd * 2.42, y - 0.9, z, 0.02, 0.7, 0.8, hex(0x16324a));
  B.prop.box(xa - sd * 1.5, y - 1.2, z, 1.4, 1.2, 1.1, K.concD);
  B.glow.box(xb, y + 0.9, z, 0.2, 0.2, 0.2, K.red3); B.glow.box(mx, y + 8.2, z, 0.2, 0.2, 0.2, K.red3);
  ctx.beacons.push([xb, y + 0.9, z], [mx, y + 8.2, z]);
  if (d.hook) {
    B.metal.beam([d.hx, y, z], [d.hx, y - d.hook, z], 0.05, 0.05, K.dark);
    B.metal.box(d.hx, y - d.hook + 0.2, z, 0.3, 0.25, 0.3, K.yellow);
    for (let k = -2; k <= 2; k++) B.metal.beam([d.hx - 2.3, y - d.hook - 0.5 + k * 0.08, z + k * 0.28], [d.hx + 2.3, y - d.hook - 0.5 + k * 0.08, z + k * 0.28], 0.14, 0.14, mulc(K.rust, 1.3));
  }
}
function pit(B, d) {
  const len = d.s1 - d.s0, zc = Z((d.s0 + d.s1) / 2), hz = len / 2, h = d.half;
  B.prop.box(0, -10.2, zc, 16.6, 0.2, hz + 1.5, hex(0x4a3a2c));
  for (const s of [-1, 1]) {
    B.prop.box(s * 16.4, -5, zc, 0.2, 5, hz + 1.5, mulc(K.concD, 0.8));
    for (let k = d.s0 + 2; k < d.s1; k += 4) B.metal.box(s * 16.15, -5, Z(k), 0.08, 5, 0.12, mulc(K.orange, 0.7));
    // I빔 가장자리 + 기둥
    B.metal.box(s * (h - 0.2), -0.4, zc, 0.2, 0.4, hz, mulc(K.orange, 0.9));
    B.metal.box(s * (h - 0.2), -0.05, zc, 0.35, 0.05, hz, mulc(K.orange, 0.8));
    for (let k = d.s0 + 4; k < d.s1; k += 9) B.metal.box(s * (h - 0.6), -5.4, Z(k), 0.3, 4.6, 0.3, mulc(K.orange, 0.65));
    for (let k = d.s0 + 1; k < d.s1; k += 3) B.glow.box(s * (h - 0.05), 0.08, Z(k), 0.05, 0.05, 0.3, K.orange3);
  }
  for (let k = d.s0 + 5; k < d.s1; k += 6.5) { B.water.box(((k * 7) % 9) - 4.5 + (k % 2 ? 8 : -8), -9.98, Z(k), 2.2, 0.01, 1.4, [0.05, 0.1, 0.12]); for (let r = 0; r < 4; r++) B.metal.beam([-12 + r * 1.3 + (k % 5), -10, Z(k) - 1], [-11.5 + r * 1.3 + (k % 5), -8.4, Z(k) - 1.3], 0.04, 0.04, K.rust); }
}
function slabfloor(B, d) {
  const len = d.s1 - d.s0, zc = Z((d.s0 + d.s1) / 2), hz = len / 2, y0 = d.y + 5;
  for (let y = y0 + 3.6; y < d.top; y += 3.6) B.prop.box(0, y, zc, CORR, 0.18, hz, mulc(K.concD, 0.9));
  for (let x = -14; x <= 14; x += 7) for (const k of [d.s0 + 2, (d.s0 + d.s1) / 2, d.s1 - 2]) B.prop.box(x, (y0 + d.top) / 2, Z(k), 0.4, (d.top - y0) / 2, 0.4, mulc(K.conc, 0.95));
  B.prop.box(0, (y0 + d.top) / 2, zc, 10, (d.top - y0) / 2, hz * 0.6, mulc(K.dark, 0.7));
  for (const e of [d.s0, d.s1]) {
    const ze = Z(e) + (e === d.s0 ? 0.3 : -0.3);
    B.net.box(0, (y0 + d.top) / 2, ze, CORR, (d.top - y0) / 2, 0.02, [0.05, 0.28, 0.12]);
    B.stripe.box(0, d.y + 0.5, ze, CORR, 0.5, 0.05, [1, 1, 1], { uv: [2.6, 2.6] });
  }
}

// ───────── 날먹 방지 구조물 ─────────
function overpass(B, d, ctx) {
  const z = Z(d.s), y = d.y;
  B.prop.box(0, y + 0.65, z, CORR + 0.4, 0.65, 2.0, mulc(K.conc, 0.9), { bevel: 0.08 });
  B.metal.box(0, y + 0.05, z, CORR + 0.3, 0.05, 1.9, K.dark);
  for (const sz of [-1.9, 1.9]) { B.glass.box(0, y + 1.8, z + sz, CORR + 0.3, 0.5, 0.03, hex(0x1d3350)); B.metal.box(0, y + 2.3, z + sz, CORR + 0.4, 0.06, 0.06, K.steel); }
  B.metal.box(0, y + 2.3, z, CORR + 0.4, 0.06, 2.0, K.steel);
  for (let x = -14; x <= 14; x += 4) B.glow.box(x, y - 0.02, z, 0.6, 0.03, 0.2, K.white3);
  for (const s of [-1, 1]) { B.prop.box(s * 19.5, (y + 2.4) / 2, z, 2.4, (y + 2.4) / 2, 2.4, mulc(K.concD, 1.1), { bevel: 0.1 }); B.glass.box(s * 17.05, (y + 2.4) / 2, z, 0.04, (y + 2.4) / 2 - 0.3, 2.0, hex(0x16324a)); }
  B.glow.box(0, y + 0.65, z + 2.02, CORR, 0.04, 0.02, neon(190, 2.4));
  if (d.sign) ctx.signs.push({ x: 0, y: y + 0.66, z: z + 2.03, w: 10, h: 1.0, ry: 0, text: d.sign, color: d.color || '#35f0ff', fixed: true });
}
function banner(B, d, ctx) {
  const z = Z(d.s), yc = (d.y0 + d.y1) / 2, hy = (d.y1 - d.y0) / 2;
  B.metal.box(0, yc, z - 0.1, CORR, hy, 0.4, K.dark, { bevel: 0.05 });
  for (const yy of [d.y0, d.y1]) B.metal.box(0, yy, z, CORR + 0.2, 0.12, 0.5, K.steel);
  for (const s of [-1, 1]) B.metal.box(s * 16.75, yc, z, 0.15, hy + 0.2, 0.5, K.steel);
  ctx.signs.push({ x: 0, y: yc, z: z + 0.52, w: 2 * CORR - 1, h: 2 * hy - 0.5, ry: 0, text: d.text, hue: d.hue, neon: true });
}
function skybridge(B, d) {
  const z = Z(d.s), y = d.y, h = d.h, hz = d.d / 2, c = neon(d.hue, 2.4);
  B.glass.box(0, y + h / 2, z, CORR + 0.4, h / 2 - 0.15, hz - 0.1, hex(0x28466a));
  B.prop.box(0, y + 0.15, z, CORR + 0.4, 0.15, hz, mulc(K.white, 0.8)); B.prop.box(0, y + h - 0.15, z, CORR + 0.4, 0.15, hz, mulc(K.white, 0.8));
  for (let x = -15; x <= 15; x += 3) B.metal.box(x, y + h / 2, z, 0.07, h / 2, hz + 0.02, K.steel);
  B.glow.box(0, y + 0.32, z + hz + 0.02, CORR, 0.05, 0.02, c); B.glow.box(0, y + h - 0.32, z + hz + 0.02, CORR, 0.05, 0.02, c);
  for (let x = -12; x <= 12; x += 6) B.glow.box(x, y + h - 0.35, z, 0.8, 0.04, 0.25, [4, 4, 3.6]);
}
function powerline(B, d) {
  const z = Z(d.s), ys = d.ys, top = ys[ys.length - 1] + 2;
  for (const s of [-1, 1]) {
    const x = s * 18.5;
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.metal.beam([x + ox * 1.4, 0, z + oz * 1.4], [x + ox * 0.4, top, z + oz * 0.4], 0.12, 0.12, mulc(K.steel, 0.8));
    for (let yy = 2; yy < top; yy += 3) { const w = 1.4 - (yy / top) * 1.0; B.metal.beam([x - w, yy, z - w], [x + w, yy + 3, z + w], 0.05, 0.05, mulc(K.steel, 0.7)); B.metal.beam([x + w, yy, z - w], [x - w, yy + 3, z + w], 0.05, 0.05, mulc(K.steel, 0.7)); }
    for (const yy of ys) { B.metal.box(x, yy + 0.3, z, 3.2, 0.1, 0.1, mulc(K.steel, 0.8)); B.glass.cyl(x - s * 2.6, yy + 0.05, z, 0.12, 0.35, 6, hex(0x8a6a4a)); }
    B.glow.box(x, top + 0.2, z, 0.18, 0.18, 0.18, K.red3);
  }
  for (const yy of ys) B.metal.beam([-24, yy, z], [24, yy, z], 0.08, 0.08, K.dark);
}
function pipebridge(B, d) {
  const z = Z(d.s), y = d.y;
  if (d.kind === 'conveyor') {
    B.prop.box(0, y, z, CORR + 2, 0.9, 1.6, mulc(K.rust, 1.1), { bevel: 0.05 });
    B.prop.box(0, y + 0.95, z, CORR + 2, 0.06, 1.7, mulc(K.dark, 1.2));
    for (let x = -15; x <= 15; x += 2.5) B.glow.box(x, y + 0.15, z + 1.62, 0.5, 0.18, 0.02, [4.5, 3.6, 1.6]);
    B.metal.box(0, y - 0.95, z, CORR + 2, 0.06, 1.4, K.dark);
  } else {
    for (const [dy, dz, r] of [[-0.35, -0.4, 0.34], [-0.35, 0.4, 0.34], [0.38, 0, 0.3]]) B.metal.beam([-CORR - 2, y + dy, z + dz], [CORR + 2, y + dy, z + dz], r * 2, r * 2, mixc(K.steel, K.orange, 0.2 + dy * 0.3));
    for (let x = -14; x <= 14; x += 7) B.metal.box(x, y, z, 0.1, 0.75, 0.85, K.yellow);
  }
  for (const s of [-1, 1]) B.metal.box(s * 17.6, y / 2, z, 0.5, y / 2, 0.6, K.metal);
}
function lines(B, d) {
  const z = Z(d.s), rng = makeRng(d.seed);
  for (const s of [-1, 1]) for (const y of d.ys) B.metal.box(s * 16.75, y, z, 0.15, 0.12, 0.12, K.dark);
  for (const y of d.ys) {
    B.metal.beam([-CORR - 0.2, y, z], [CORR + 0.2, y, z], 0.035, 0.035, K.dark);
    if (d.kind === 'laundry') {
      for (let x = -15.5; x < 15.5; x += 0.85 + rng() * 0.6) {
        const w = 0.25 + rng() * 0.35, h = d.dy * (0.6 + rng() * 0.4), col = paint(Math.floor(rng() * 360), 0.85, 0.5 + rng() * 0.4);
        B.prop.box(x, y - h / 2, z + (rng() - 0.5) * 0.06, w, h / 2, 0.02, col);
        x += w;
      }
    } else if (d.kind === 'lantern') {
      for (let x = -15; x <= 15; x += 1.6) { const c = neon(rng() < 0.75 ? 0 : 40, 3.2); B.metal.beam([x, y, z], [x, y - 0.2, z], 0.02, 0.02, K.dark); B.glow.cyl(x, y - d.dy + 0.05, z, 0.28, d.dy - 0.25, 8, c, { r2: 0.28 }); B.metal.box(x, y - d.dy + 0.05, z, 0.18, 0.03, 0.18, K.dark); }
    } else if (d.kind === 'lights') {
      for (let x = -15.6; x <= 15.6; x += 0.8) { B.metal.beam([x, y, z], [x, y - d.dy + 0.2, z], 0.02, 0.02, K.dark); B.glow.box(x, y - d.dy + 0.12, z, 0.1, 0.13, 0.1, neon(Math.floor(rng() * 6) * 60, 3.4)); }
    } else {
      for (let x = -15.6; x <= 15.6; x += 0.9) { const c = paint([0, 45, 200, 120, 300][Math.floor(rng() * 5)], 0.95, 0.85); B.prop.triOut([x - 0.35, y, z], [x + 0.35, y, z], [x, y - d.dy, z], [0, 0, 1], c); B.prop.triOut([x - 0.35, y, z], [x + 0.35, y, z], [x, y - d.dy, z], [0, 0, -1], c); }
      for (let x = -15; x <= 15; x += 2.2) B.glow.box(x, y - 0.05, z, 0.07, 0.07, 0.07, [5, 4.4, 2.6]);
    }
  }
}

// ───────── 고가도로 ─────────
function lowcity(B, d) {
  const [a, b] = clipOf(d), zc = Z((a + b) / 2), hz = (b - a) / 2, y = d.y, rng = makeRng(Math.floor(a));
  B.prop.box(0, y - 0.1, zc, 260, 0.1, hz, mulc(K.asphalt, 0.75));
  for (const x of [-30, 30, -90, 90]) { B.prop.box(x, y + 0.01, zc, 6, 0.01, hz, mulc(K.asphalt, 1.2)); B.glow.box(x - 3, y + 0.03, zc, 0.04, 0.01, hz, [1.6, 1.4, 0.8]); }
  for (const k of every(d, 20, 70, a, b)) B.prop.box(0, y + 0.01, Z(k), 260, 0.01, 5, mulc(K.asphalt, 1.2));
  // 아래 거리의 차 불빛(흐르는 점) + 저층 건물(지붕이 -10m 보다 낮다)
  for (const k of every(d, 3, 9, a, b)) for (const x of [-31.5, -28.5, 28.5, 31.5]) if (rng() < 0.6) B.glow.box(x, y + 0.3, Z(k), 0.35, 0.12, 0.6, x < 0 ? [5, 0.4, 0.3] : [4, 4, 3.6]);
  for (const k of every(d, 0, 26, a, b)) for (const s of [-1, 1]) {
    const x = s * (17 + rng() * 8), w = 4 + rng() * 6, h = 2.5 + rng() * 3.5;
    B.bldg[1].box(x, y + h / 2, Z(k + rng() * 10), w / 2, h / 2, 5 + rng() * 4, mulc([1, 1, 1], 0.6 + rng() * 0.3), { uv: [25.6, 28.8] });
  }
}
function pier(B, d) {
  const z = Z(d.s), y = d.y;
  B.prop.box(0, (y - 1.4) / 2, z, 1.4, (-1.4 - y) / 2, 1.4, mulc(K.conc, 0.9), { bevel: 0.1 });
  B.prop.box(0, -2.0, z, 11, 0.6, 1.6, mulc(K.conc, 0.85), { bevel: 0.08 });
  B.glow.box(0, y + 6, z + 1.45, 0.3, 0.3, 0.03, [0.4, 2.4, 3]);
}

// ───────── 네온 시장 ─────────
function neonsign(B, d) {
  const z = Z(d.s), x = d.side * 16.88, c = neon(d.hue, 3.6), h = 3 + (d.hue % 4);
  B.metal.box(x, d.y + h / 2, z, 0.08, h / 2 + 0.1, 0.6, K.dark);
  B.glow.box(x - d.side * 0.1, d.y + h / 2, z, 0.02, h / 2, 0.5, c);
  for (let k = 0; k < 4; k++) B.glow.box(x - d.side * 0.12, d.y + 0.5 + k * (h / 4), z, 0.02, 0.06, 0.42, neon(d.hue + 160, 4));
}
function marketgate(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) { B.prop.box(s * 17.2, 7.5, z, 0.6, 7.5, 0.6, mulc(K.red, 0.7), { bevel: 0.08 }); B.glow.box(s * 16.58, 7.5, z, 0.02, 6.8, 0.2, neon(330, 3)); }
  B.prop.box(0, 13.6, z, 16.8, 1.6, 0.6, mulc(K.red, 0.6), { bevel: 0.1 });
  B.prop.box(0, 15.4, z, 18.5, 0.25, 0.6, mulc(K.dark, 1.2), { bevel: 0.1 });
  for (let x = -15; x <= 15; x += 2.5) B.glow.cyl(x, 11.3, z + 0.2, 0.28, 0.6, 8, neon(10, 3.2), { r2: 0.28 });
  ctx.signs.push({ x: 0, y: 13.6, z: z + 0.62, w: 18, h: 2.4, ry: 0, text: d.text || '야시장', color: '#ff4ad8', fixed: true });
}

// ───────── 공업 지구 / 부두 ─────────
function plantwall(B, d) {
  const [a, b] = clipOf(d), zc = Z((a + b) / 2), hz = (b - a) / 2, h = d.h;
  for (const side of [-1, 1]) {
    B.prop.box(side * 17.0, h / 2, zc, 0.4, h / 2, hz, mulc(K.steel, 0.42));
    for (const k of every(d, 0, 1.2, a, b)) B.prop.box(side * 16.62, h / 2, Z(k), 0.02, h / 2 - 0.1, 0.05, mulc(K.steel, 0.32));
    for (const yy of [3.2, 6.4, 9.6]) B.metal.beam([side * 16.75, yy, Z(a)], [side * 16.75, yy, Z(b)], 0.25, 0.25, mixc(K.steel, K.orange, yy / 14));
    B.stripe.box(side * 16.62, 0.4, zc, 0.02, 0.4, hz, [1, 1, 1], { uv: [2.6, 2.6] });
    B.prop.box(side * 17.0, h + 0.1, zc, 0.5, 0.1, hz, K.dark);
    for (const k of every(d, 8, 24, a, b)) { B.glow.box(side * 16.62, h - 1.2, Z(k), 0.04, 0.12, 0.5, [5.5, 3.6, 1.4]); B.metal.box(side * 16.68, h - 1.0, Z(k), 0.06, 0.08, 0.6, K.dark); }
  }
}
function tank(B, d) {
  const z = Z(d.s), col = paint(d.hue, 0.9, 0.25);
  B.metal.cyl(d.x, 0, z, d.r, d.h, 20, col);
  B.metal.cyl(d.x, d.h, z, d.r, d.r * 0.25, 20, mulc(col, 0.9), { r2: d.r * 0.3 });
  for (const yy of [d.h * 0.3, d.h * 0.7]) B.metal.cyl(d.x, yy, z, d.r + 0.05, 0.6, 20, mulc(K.red, 0.7), { top: false });
  for (let yy = 1; yy < d.h; yy += 1.6) { const a = yy * 0.25; B.metal.box(d.x + Math.cos(a) * (d.r + 0.4), yy, z + Math.sin(a) * (d.r + 0.4), 0.5, 0.05, 0.5, K.yellow); }
  B.glow.box(d.x, d.h + d.r * 0.25 + 0.3, z, 0.2, 0.2, 0.2, K.red3);
}
function stack(B, d, ctx) {
  const z = Z(d.s);
  B.prop.cyl(d.x, 0, z, d.r * 1.25, d.h, 12, mulc(K.conc, 0.9), { r2: d.r * 0.9 });
  for (let yy = d.h * 0.6; yy < d.h; yy += d.h * 0.12) B.prop.cyl(d.x, yy, z, d.r * 1.02, d.h * 0.05, 12, mulc(K.red, 0.9), { r2: d.r * 1.0, top: false });
  B.glow.box(d.x, d.h + 0.4, z, d.r * 0.7, 0.2, d.r * 0.7, K.orange3);
  ctx.fires.push([d.x, d.h + 1.2, z]); ctx.beacons.push([d.x, d.h + 1.0, z]);
}
function containers(B, d) {
  const rng = makeRng(d.seed), z = Z(d.s);
  for (let k = 0; k < d.n; k++) {
    const col = paint([0, 25, 200, 140, 210, 30][Math.floor(rng() * 6)], 0.8, 0.7), y = k * 2.6 + 1.3;
    B.prop.box(d.x, y, z, 1.25, 1.27, 3.05, col, { bevel: 0.04 });
    for (let j = -2.8; j <= 2.8; j += 0.45) B.prop.box(d.x - Math.sign(d.x) * 1.26, y, z + j, 0.02, 1.15, 0.06, mulc(col, 0.7));
  }
}
function gantry(B, d) {
  const z = Z(d.s);
  for (const side of [-1, 1]) {
    const x = side * d.x;
    for (const dz of [-7, 7]) B.metal.box(x, 21, z + dz, 0.8, 21, 0.8, mulc(K.red, 0.85));
    B.metal.box(x, 41, z, 1.2, 1.4, 8, mulc(K.red, 0.8));
    B.metal.box(x + side * 8, 39.5, z, 9, 0.6, 0.8, mulc(K.red, 0.75));
    B.glow.box(x, 42.6, z, 0.25, 0.25, 0.25, K.red3);
  }
}
function plantgate(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) B.metal.box(s * 17.4, 24, z, 0.8, 24, 0.8, mulc(K.steel, 0.6));
  B.metal.box(0, 47, z, CORR + 1.2, 2, 0.8, mulc(K.steel, 0.55));
  ctx.signs.push({ x: 0, y: 47, z: z + 0.82, w: 22, h: 2.8, ry: 0, text: 'TEMU 화학단지 · 화기 엄금', color: '#ffb02e', fixed: true });
}

// ───────── 현수교 / 터널 / 협곡 / 해안 ─────────
function btower(B, d, ctx) {
  const z = Z(d.s), H = d.H;
  for (const s of [-1, 1]) { B.prop.box(s * 15.6, (H - 12) / 2, z, 1.3, (H + 12) / 2, 1.6, mulc(K.conc, 1.0), { bevel: 0.15 }); B.glow.box(s * 15.6, H + 0.4, z, 0.3, 0.3, 0.3, K.red3); ctx.beacons.push([s * 15.6, H + 0.4, z]); }
  B.prop.box(0, 32.5, z, 16.9, 1.5, 1.6, mulc(K.conc, 0.95), { bevel: 0.1 });
  B.prop.box(0, 54, z, 16.9, 2.0, 1.6, mulc(K.conc, 0.95), { bevel: 0.1 });
  for (const yy of [32.5, 54]) B.glow.box(0, yy - 1.6, z + 1.62, 14, 0.05, 0.02, [0.5, 3.4, 4.2]);
  for (const s of [-1, 1]) for (let yy = 4; yy < H; yy += 8) B.glow.box(s * 14.28, yy, z, 0.02, 0.4, 0.4, [4, 3.6, 2.8]);
}
function bcable(B, d) {
  const [a, b] = clipOf(d), span = d.s1 - d.s0;
  const yAt = (s) => cableY((s - d.s0) / span, d.H, d.lo, d.endA, d.endB);
  for (const side of [-1, 1]) {
    const x = side * 15.2;
    for (let s = a; s < b - 0.01; s += 5) { const s2 = Math.min(b, s + 5); B.metal.beam([x, yAt(s), Z(s)], [x, yAt(s2), Z(s2)], 0.4, 0.4, mulc(K.steel, 0.9)); }
    for (const s of every(d, 5, 2.5, a, b, 4)) B.metal.beam([x, 1.2, Z(s)], [x, yAt(s), Z(s)], 0.05, 0.05, mulc(K.steel, 0.8));
  }
}
function skyline(B, d) {
  const [a, b] = clipOf(d), rng = makeRng(Math.floor(a) + 7);
  for (const side of [-1, 1]) for (let s = a; s < b; s += 18 + rng() * 22) {
    const w = 10 + rng() * 20, h = 30 + rng() * 120, x = side * (d.dist + rng() * 60);
    B.bldg[rng() < 0.5 ? 0 : 3].box(x, h / 2 - 12, Z(s), 8 + rng() * 10, h / 2, w / 2, mulc([1, 1, 1], 0.5 + rng() * 0.4), { uv: [25.6, 28.8], skip: ['+y'] });
  }
}
function hill(B, d) {
  const rng = makeRng(17);
  for (const [s, x, y, hx, hy, hz] of d.rocks) {
    B.prop.box(x, y, Z(s), hx, hy, hz, mulc(K.rock, 0.8 + rng() * 0.3), { bevel: Math.min(1.2, hy * 0.2) });
    B.grass.box(x, y + hy - 0.15, Z(s), hx - 0.6, 0.18, hz - 0.6, mulc(K.grass, 0.8 + rng() * 0.3));
  }
}
function tportal(B, d, ctx) {
  const z = Z(d.s), y = d.y, entry = d.dir > 0, W = entry ? 30 : 17, top = entry ? 60 : 60;
  B.prop.box(0, (y + top) / 2, z + (entry ? 0.2 : -0.2), W, (top - y) / 2, 0.6, entry ? mulc(K.rock, 0.95) : mulc(K.conc, 0.7), { bevel: 0.2 });
  if (entry) for (const s of [-1, 1]) B.prop.box(s * (13.8 + (W - 13.8) / 2), y / 2, z + 0.2, (W - 13.8) / 2, y / 2, 0.6, mulc(K.conc, 0.85));
  // 포털 테 (콘크리트 아치 + 줄무늬 + 표지)
  B.prop.box(0, y + 1.2, z + (entry ? 0.85 : -0.85), 15.2, 1.2, 0.3, mulc(K.conc, 1.05), { bevel: 0.08 });
  for (const s of [-1, 1]) B.prop.box(s * 14.6, y / 2, z + (entry ? 0.85 : -0.85), 0.8, y / 2, 0.3, mulc(K.conc, 1.05));
  B.stripe.box(0, y + 0.25, z + (entry ? 1.16 : -1.16), 13.8, 0.25, 0.02, [1, 1, 1], { uv: [2.6, 2.6] });
  for (let x = -12; x <= 12; x += 4) B.glow.box(x, y + 0.75, z + (entry ? 1.18 : -1.18), 0.3, 0.12, 0.02, K.orange3);
  ctx.signs.push({ x: 0, y: y + 1.6, z: z + (entry ? 1.17 : -1.17), w: 9, h: 1.0, ry: entry ? 0 : Math.PI, text: entry ? '지하 터널 · 길이 900m · 전조등 켜기' : 'EXIT', color: '#ffd24a', fixed: true });
}
function canyongate(B, d, ctx) {
  const z = Z(d.s);
  B.metal.box(0, 47, z, CORR + 1.2, 2, 0.8, mulc(K.white, 0.8));
  ctx.signs.push({ x: 0, y: 47, z: z + 0.82, w: 22, h: 2.8, ry: 0, text: 'SUNRISE COAST · 해안 리조트', color: '#ffcf7a', fixed: true });
}

// 정적 '레일 위 탑승물' 대신 그려 둔 놀이공원 장식은 parkProps.js
export const SCENE_EMIT = {
  pole, bench, fountain, parkgate, skel, hoard, sitegate, crane, pit, slabfloor, overpass, banner, skybridge, powerline, pipebridge, lines,
  lowcity, pier, neonsign, marketgate, plantwall, tank, stack, containers, gantry, plantgate, btower, bcable, skyline, hill, tportal, canyongate,
};
// 청크 경계를 넘는 긴 장식(청크마다 잘라서 그림)
export const LONG_TYPES = new Set(['ceil', 'rail', 'hoard', 'plantwall', 'bcable', 'lowcity', 'skyline']);
