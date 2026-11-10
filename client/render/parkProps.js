// 놀이공원 장식 지오메트리 (정적). 충돌 상자는 shared/maps/park.js 가 같은 치수로 만든다.
import { mulc, mixc, hex } from './mesh.js';
import { makeRng } from '../../shared/math.js';
import { K, neon, paint, Z, clipOf, every } from './palette.js';

const CORR = 16.6;

function canopy(B, d) {
  const z = Z(d.s), R = d.R + 1.5, y = d.y, c1 = paint(d.hue, 0.95, 0.7), c2 = mulc(K.white, 0.95);
  // 지붕: 12각 줄무늬 원뿔 + 테두리 (충돌: y-0.6 ~ y+0.6, 반경 R 정사각)
  for (let k = 0; k < 12; k++) {
    const a0 = k * Math.PI / 6, a1 = (k + 1) * Math.PI / 6, col = k % 2 ? c1 : c2;
    B.prop.triOut([Math.cos(a0) * R, y + 0.6, z + Math.sin(a0) * R], [Math.cos(a1) * R, y + 0.6, z + Math.sin(a1) * R], [0, y + 4.5, z], [0, 1, 0], col);
    B.prop.quadOut([Math.cos(a0) * R, y - 0.6, z + Math.sin(a0) * R], [Math.cos(a1) * R, y - 0.6, z + Math.sin(a1) * R], [Math.cos(a1) * R, y + 0.6, z + Math.sin(a1) * R], [Math.cos(a0) * R, y + 0.6, z + Math.sin(a0) * R], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], mulc(K.yellow, 1.05));
    B.prop.triOut([Math.cos(a0) * R, y - 0.6, z + Math.sin(a0) * R], [Math.cos(a1) * R, y - 0.6, z + Math.sin(a1) * R], [0, y - 0.6, z], [0, -1, 0], mulc(c1, 0.6));
    B.glow.box(Math.cos(a0) * R * 0.98, y - 0.65, z + Math.sin(a0) * R * 0.98, 0.15, 0.08, 0.15, [6, 4.6, 2]);
  }
  B.prop.cyl(0, 0, z, 1.6, 7, 12, mulc(K.gold || K.yellow, 0.9), { r2: 1.6 });
  B.glow.cyl(0, 2, z, 1.65, 0.15, 12, [5, 3.4, 1.2]); B.glow.cyl(0, 5, z, 1.65, 0.15, 12, [5, 3.4, 1.2]);
  B.prop.cyl(0, 0, z, R - 0.8, 0.25, 24, mulc(K.white, 0.75));
  // 매표소(양옆)
  const bx0 = d.R + 1.0, bhx = ((d.w || CORR) - bx0) / 2;
  if (bhx > 0.3) for (const s of [-1, 1]) { B.prop.box(s * (bx0 + bhx), 1.5, z, bhx, 1.5, d.R, mulc(c1, 0.8), { bevel: 0.1 }); B.prop.box(s * (bx0 + bhx), 3.1, z, bhx + 0.1, 0.1, d.R + 0.1, c2); for (let k = -d.R + 2; k < d.R; k += 4) B.glow.box(s * bx0 - s * 0.02, 2.4, z + k, 0.02, 0.2, 0.8, neon(d.hue + 40, 2.4)); }
}
function cupbase(B, d) {
  const z = Z(d.s), W = d.w || 15;
  for (const cx of [-W * 0.47, W * 0.47]) { B.prop.cyl(cx, 0.01, z, 6.0, 0.05, 24, paint(cx > 0 ? 200 : 320, 0.9, 0.5)); B.prop.cyl(cx, 0, z, 0.8, 0.7, 10, mulc(K.yellow, 0.9)); }
}
function wheelbase(B, d) {
  const z = Z(d.s), cy = d.cy;
  const X = d.X || 15.5;
  for (const dz of [-3.2, 3.2]) for (const side of [-1, 1]) B.metal.beam([side * X, 0, z + dz], [0, cy, z + dz], 0.7, 0.7, mulc(K.white, 0.9));
  B.metal.beam([0, cy, z - 3.6], [0, cy, z + 3.6], 1.2, 1.2, mulc(K.steel, 0.9));
  for (const side of [-1, 1]) B.prop.box(side * X, -2, z, 1.4, 2.1, 4.2, paint(d.hue, 0.6, 0.4));
  B.glow.box(0, cy, z + 3.65, 0.8, 0.8, 0.02, neon(d.hue, 3));
}
function swingframe(B, d) {
  const z = Z(d.s), py = d.py;
  const X = d.X || 15.2;
  for (const dz of [-3.4, 3.4]) for (const side of [-1, 1]) B.metal.beam([side * X, 0, z + dz], [0, py, z + dz], 0.6, 0.6, mulc(K.red, 0.9));
  B.metal.beam([0, py, z - 3.8], [0, py, z + 3.8], 0.8, 0.8, mulc(K.steel, 0.8));
  for (const side of [-1, 1]) B.glow.box(side * X * 0.45, py * 0.55, z + 3.75, 0.2, 0.2, 0.02, K.orange3);
}
function track(B, d) {
  const z = Z(d.s), y = d.y, col = paint(d.hue, 0.95, 0.85), W = d.w || 20;
  if (d.ground) {
    for (const dz of [-0.6, 0.6]) B.metal.box(0, 0.06, z + dz, W, 0.06, 0.08, mulc(K.steel, 1.1));
    B.stripe.box(0, 0.015, z + 2.3, Math.min(W, 12), 0.012, 0.2, [1, 1, 1], { uv: [2.6, 2.6] }); B.stripe.box(0, 0.015, z - 2.3, Math.min(W, 12), 0.012, 0.2, [1, 1, 1], { uv: [2.6, 2.6] });
    return;
  }
  B.metal.box(0, y - 0.25, z, W, 0.25, 0.8, col);
  for (const dz of [-0.55, 0.55]) B.metal.beam([-W, y + 0.05, z + dz], [W, y + 0.05, z + dz], 0.14, 0.14, mulc(K.steel, 1.1));
  for (const side of [-1, 1]) B.metal.box(side * (W - 1.2), (y - 0.5) / 2, z, 0.4, (y - 0.5) / 2, 0.4, col);
  for (let x = -W + 2; x <= W - 2; x += 3.5) B.glow.box(x, y - 0.52, z + 0.82, 0.25, 0.06, 0.02, neon(d.hue, 2.6));
}
function droptower(B, d) {
  const z = Z(d.s), top = d.top;
  const X = d.X || 13.6;
  for (const side of [-1, 1]) { B.metal.box(side * X, 16, z, 1.2, 16, 1.2, mulc(K.white, 0.85)); for (let y = 2; y < 32; y += 3) B.glow.box(side * X - side * 1.22, y, z, 0.02, 0.18, 0.5, neon(y * 12, 2.6)); B.glow.box(side * X, top + 0.3, z, 0.4, 0.3, 0.4, K.red3); }
}
function swinger(B, d) {
  const z = Z(d.s), y = d.y;
  B.prop.cyl(0, 0, z, 1.2, y, 10, mulc(K.white, 0.85), { r2: 1.0 });
  B.prop.cyl(0, y - 0.6, z, 11, 1.2, 20, paint(280, 0.9, 0.7), { r2: 11 });
  B.prop.cyl(0, y + 0.6, z, 11, 2.2, 20, paint(50, 0.95, 0.8), { r2: 1.5 });
  for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10; B.glow.box(Math.cos(a) * 10.9, y - 0.7, z + Math.sin(a) * 10.9, 0.15, 0.1, 0.15, neon(k * 18, 3)); }
  const bx0 = 11.2, bhx = ((d.w || 16.6) - bx0) / 2;
  if (bhx > 0.3) for (const s of [-1, 1]) B.prop.box(s * (bx0 + bhx), 1.5, z, bhx, 1.5, 10.5, paint(280, 0.7, 0.6), { bevel: 0.1 });
}
function parkentry(B, d, ctx) {
  const z = Z(d.s), W = (d.w || 16.6) + 1;
  for (const s of [-1, 1]) { B.prop.box(s * W, 11, z, 1.0, 11, 1.2, paint(330, 0.95, 0.6), { bevel: 0.15 }); B.prop.cyl(s * W, 22, z, 1.5, 4, 8, paint(200, 0.9, 0.7), { r2: 0 }); }
  B.prop.box(0, 19, z, W, 3, 1.2, paint(45, 0.95, 0.8), { bevel: 0.2 });
  for (let x = -W + 1; x <= W - 1; x += 1.5) B.glow.box(x, 15.95, z + 1.21, 0.18, 0.12, 0.02, neon(x * 20, 3.2));
  ctx.signs.push({ x: 0, y: 19.2, z: z + 1.22, w: Math.min(18, 2 * W - 2), h: 4.2, ry: 0, text: 'TEMU LAND 테무랜드', color: '#ff4ad8', fixed: true });
}
function hauntface(B, d, ctx) {
  const z = Z(d.s), entry = d.dir > 0, off = entry ? 0.2 : -0.2, W = (d.w || 13) + 4, col = hex(0x3a2a48);
  B.prop.box(0, (7 + 24) / 2, z + off, W, (24 - 7) / 2, 0.6, col, { bevel: 0.2 });
  for (const s of [-1, 1]) B.prop.box(s * (W - 1.5), 3.5, z + off, 1.5, 3.5, 0.6, col);
  for (let x = -W + 3; x <= W - 3; x += 6) { B.glow.box(x, 16, z + off * 4.5, 1.0, 1.4, 0.02, [2.6, 2.2, 0.6]); B.prop.box(x, 16, z + off * 4.4, 1.2, 1.6, 0.02, hex(0x120a18)); }
  for (let x = -W + 2; x <= W - 2; x += 4) B.prop.cone(x, 24, z + off, 0.5, 2.5, 5, hex(0x2a1a34));
  if (entry) ctx.signs.push({ x: 0, y: 10.4, z: z + 1.0, w: 16, h: 2.8, ry: 0, text: '👻 유령의 집 HAUNTED', color: '#b06aff', fixed: true });
}
function crate(B, d) {
  const z = Z(d.s), x = d.x, c = paint(d.hue, 0.9, 0.7);
  if (d.kind === 'cart') {
    B.prop.box(x, d.hy * 0.8, z, d.hx, d.hy * 0.8, d.hz, c, { bevel: 0.06 });
    B.prop.box(x, d.hy * 2 - 0.05, z, d.hx + 0.25, 0.05, d.hz + 0.25, mulc(K.white, 0.95));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.metal.box(x + sx * (d.hx - 0.1), d.hy * 1.8, z + sz * (d.hz - 0.1), 0.04, d.hy * 0.2, 0.04, K.steel);
    B.glow.box(x, d.hy * 1.3, z + d.hz + 0.01, d.hx * 0.7, 0.18, 0.01, neon(d.hue + 120, 2.6));
  } else if (d.kind === 'truck') {
    B.prop.box(x, d.hy, z, d.hx, d.hy, d.hz, c, { bevel: 0.1 });
    B.glass.box(x, d.hy * 1.3, z - d.hz + 0.02, d.hx * 0.85, d.hy * 0.4, 0.02, hex(0x1d3350));
    B.prop.save().translate(x + d.hx + 0.2, d.hy * 1.6, z).rotZ(-0.4); B.prop.box(0, 0, 0, 0.6, 0.04, d.hz * 0.8, mulc(K.red, 0.9)); B.prop.restore();
  } else if (d.kind === 'picnic') {
    B.prop.box(x, d.hy * 1.6, z, d.hx, 0.06, d.hz, mulc(K.brown, 1.2));
    for (const sz of [-1, 1]) B.prop.box(x, d.hy * 0.9, z + sz * (d.hz + 0.35), d.hx, 0.05, 0.2, mulc(K.brown, 1.1));
    for (const sx of [-1, 1]) B.prop.box(x + sx * (d.hx - 0.2), d.hy * 0.8, z, 0.06, d.hy * 0.8, d.hz, mulc(K.brown, 0.8));
    B.prop.cyl(x, d.hy * 1.6, z, 0.05, 2.2, 5, K.white); B.prop.cyl(x, d.hy * 1.6 + 2.0, z, 1.4, 0.5, 8, paint(d.hue, 0.95, 0.75), { r2: 0.1 });
  } else B.prop.box(x, d.hy, z, d.hx, d.hy, d.hz, c, { bevel: 0.05 });
}

// ───────── 장벽/틈/단상/창문/천장 스타일 ─────────
export function parkWall(B, d) {
  const z = Z(d.s), cx = (d.x0 + d.x1) / 2, hx = (d.x1 - d.x0) / 2, h = d.h, t = d.th || 1.2;
  if (d.style === 'hedge') {
    B.grass.box(cx, h / 2, z, hx, h / 2, t / 2, hex(0x2f6b2c), { bevel: 0.2 });
    for (let x = d.x0 + 1; x < d.x1; x += 1.3) B.glow.box(x, h + 0.08, z + ((x * 7) % 1 - 0.5) * t * 0.6, 0.12, 0.08, 0.12, neon(x * 37, 2.2));
  } else if (d.style === 'turnstile') {
    B.prop.box(cx, h / 2, z, hx, h / 2, t / 2, mulc(K.white, 0.9), { bevel: 0.08 });
    for (let x = d.x0 + 1.5; x < d.x1; x += 3) { B.metal.box(x, h + 0.25, z, 0.5, 0.25, t / 2, K.steel); B.glow.box(x, h + 0.55, z + t / 2, 0.12, 0.08, 0.02, K.green3); }
  } else if (d.style === 'stallwall') {
    B.prop.box(cx, h / 2, z, hx, h / 2, t / 2, paint(20, 0.85, 0.7), { bevel: 0.08 });
    for (let x = d.x0 + 2; x < d.x1; x += 4) B.prop.box(x, h / 2, z + t / 2 + 0.01, 1.4, h / 2 - 0.2, 0.01, paint(x * 30, 0.95, 0.6));
    B.prop.box(cx, h + 0.06, z, hx, 0.06, t / 2 + 0.1, mulc(K.white, 0.95));
  } else if (d.style === 'fence') {
    B.prop.box(cx, h - 0.15, z, hx, 0.15, t / 2, mulc(K.yellow, 1.05));
    B.prop.box(cx, 0.15, z, hx, 0.15, t / 2, mulc(K.yellow, 1.05));
    for (let x = d.x0 + 0.3; x < d.x1; x += 0.6) B.metal.box(x, h / 2, z, 0.07, h / 2, t / 2 - 0.05, paint(x * 25, 0.9, 0.7));
    B.prop.box(cx, h / 2, z, hx, h / 2 - 0.3, t / 2 - 0.15, mulc(K.dark, 0.6));
  } else if (d.style === 'grave') {
    B.prop.box(cx, h / 2, z, hx, h / 2, t / 2, hex(0x4a4a52), { bevel: 0.1 });
    for (let x = d.x0 + 1; x < d.x1; x += 2.2) { B.prop.box(x, h + 0.35, z, 0.55, 0.35, 0.18, hex(0x6a6a72), { bevel: 0.1 }); B.glow.box(x, h + 0.1, z + t / 2 + 0.02, 0.06, 0.1, 0.02, [1.6, 3.6, 1.8]); }
  } else if (d.style === 'castle') {
    B.prop.box(cx, h / 2, z, hx, h / 2, t / 2, hex(0x8a8278), { bevel: 0.1 });
    for (let x = d.x0 + 0.6; x < d.x1; x += 1.6) B.prop.box(x, h - 0.2, z, 0.5, 0.2, t / 2 + 0.05, hex(0x9a9288));
    for (let x = d.x0 + 3; x < d.x1; x += 6) B.glow.box(x, h * 0.55, z + t / 2 + 0.02, 0.25, 0.4, 0.02, [6, 3.2, 1]);
  } else return false;
  if (d.spikes) for (let x = d.x0 + 0.5; x < d.x1; x += 0.8) B.metal.cone(x, h + 0.1, z, 0.28, d.spikes, 5, mixc(K.steel, K.red, 0.25));
  if (d.wireY) {
    B.metal.beam([d.x0, d.wireY, z], [d.x1, d.wireY, z], 0.11, 0.11, K.dark);
    B.metal.box(d.x0 + 0.2, (d.wireY + h) / 2, z, 0.15, (d.wireY - h) / 2, 0.15, K.dark); B.metal.box(d.x1 - 0.2, (d.wireY + h) / 2, z, 0.15, (d.wireY - h) / 2, 0.15, K.dark);
    for (let x = d.x0 + 3; x < d.x1; x += 5) B.glow.box(x, d.wireY - 0.25, z, 0.14, 0.2, 0.14, [1.6, 3.6, 1.8]);
  }
  return true;
}
export function parkGap(B, d) {
  const len = d.s1 - d.s0, zc = Z((d.s0 + d.s1) / 2), hz = len / 2;
  if (d.style === 'pool' || d.style === 'lake' || d.style === 'moat') {
    const wy = d.style === 'pool' ? -1.2 : -2.2;
    B.water.box(0, wy, zc, 18, 0.02, hz + 1, d.style === 'moat' ? [0.03, 0.08, 0.1] : [0.05, 0.3, 0.45]);
    B.prop.box(0, -9.8, zc, 18, 0.2, hz + 1, d.style === 'pool' ? mulc(K.blue, 0.8) : hex(0x2a3a30));
    for (const e of [d.s0, d.s1]) {
      const ze = Z(e) + (e === d.s0 ? -0.4 : 0.4);
      B.prop.box(0, -5, ze, 16.6, 5, 0.4, d.style === 'moat' ? hex(0x8a8278) : mulc(K.white, 0.85));
      B.glow.box(0, 0.06, ze, 12, 0.03, 0.06, d.style === 'moat' ? [6, 3, 1] : [0.6, 3, 4]);
    }
    for (const s of [-1, 1]) B.prop.box(s * 16.4, -5, zc, 0.2, 5, hz, d.style === 'moat' ? hex(0x7a7268) : mulc(K.white, 0.8));
    if (d.style === 'pool') for (let k = 0; k < 6; k++) { const x = -10 + k * 4, zz = zc + ((k * 37) % 9 - 4.5); B.glow.cyl(x, wy, zz, 0.3, 2.0 + (k % 3), 6, [1.2, 3.2, 4.2], { r2: 0.05 }); }
    if (d.style === 'moat') { for (const e of [d.s0]) { B.prop.save().translate(0, 0, Z(e)).rotX(-1.1); B.prop.box(0, 0, -6, 12, 0.3, 6, hex(0x5a3a26)); B.prop.restore(); } }
    if (d.style === 'lake') for (let k = 0; k < 3; k++) { const x = -8 + k * 8, zz = zc + (k - 1) * 8; B.prop.box(x, wy + 0.5, zz, 1.0, 0.5, 1.6, mulc(K.white, 1.0)); B.prop.box(x, wy + 1.4, zz - 1.2, 0.3, 0.9, 0.3, mulc(K.white, 1.0)); B.prop.box(x, wy + 2.2, zz - 1.4, 0.2, 0.15, 0.4, mulc(K.orange, 1)); }
    return true;
  }
  if (d.style === 'trap') {
    B.prop.box(0, -9.6, zc, 17, 0.2, hz + 1, hex(0x100810));
    for (let x = -12; x <= 12; x += 1.5) B.metal.cone(x, -9.4, zc + ((x * 13) % 5 - 2.5), 0.3, 1.8, 4, mixc(K.steel, K.red, 0.4));
    for (const e of [d.s0, d.s1]) { B.prop.save().translate(0, 0, Z(e)).rotX(e === d.s0 ? 1.2 : -1.2); B.prop.box(0, 0, e === d.s0 ? -1.2 : 1.2, 13.8, 0.1, 1.2, hex(0x3a2418)); B.prop.restore(); }
    for (const s of [-1, 1]) B.glow.box(s * 13.6, 0.1, zc, 0.06, 0.06, hz, [6, 0.4, 0.6]);
    return true;
  }
  return false;
}
export function parkStep(B, d) {
  const len = d.s1 - d.s0, z = Z((d.s0 + d.s1) / 2), h = d.h;
  if (d.style !== 'terrace' && d.style !== 'station') return false;
  const col = d.style === 'terrace' ? paint(30, 0.85, 0.5) : paint(200, 0.85, 0.6);
  B.prop.box(0, h / 2 - 0.02, z, 16.5, h / 2 - 0.02, len / 2, col, { bevel: 0.1 });
  B.prop.box(0, h - 0.02, z, 16.5, 0.03, len / 2, mulc(K.white, 0.85));
  for (let x = -15; x <= 15; x += 3) B.glow.box(x, h - 0.3, Z(d.s0) + 0.03, 0.4, 0.12, 0.02, neon(x * 30, 2.6));
  if (d.style === 'terrace') for (let s = d.s0 + 6; s < d.s1 - 3; s += 9) for (const x of [-11, 11]) { B.prop.cyl(x, h, Z(s), 0.05, 2.4, 5, K.white); B.prop.cyl(x, h + 2.2, Z(s), 1.6, 0.6, 8, paint(s * 9, 0.95, 0.8), { r2: 0.1 }); }
  return true;
}
export function parkPortal(B, d) {
  if (d.style !== 'castle' && d.style !== 'station') return false;
  const z = Z(d.s), cx = (d.x0 + d.x1) / 2, hx = (d.x1 - d.x0) / 2, t = d.th || 1.6, col = d.style === 'castle' ? hex(0x8a8278) : paint(200, 0.85, 0.65);
  const mk = (y0, y1) => B.prop.box(cx, (y0 + y1) / 2, z, hx, (y1 - y0) / 2, t / 2, col, { bevel: 0.15 });
  if (d.y0 > 0.05) mk(0, d.y0);
  mk(d.y1, d.H);
  const c = d.style === 'castle' ? [6, 3, 0.8] : neon(330, 3);
  B.glow.box(cx, d.y0, z + t / 2 + 0.03, hx, 0.08, 0.04, c); B.glow.box(cx, d.y1, z + t / 2 + 0.03, hx, 0.08, 0.04, c);
  if (d.style === 'castle') for (let x = d.x0 + 0.8; x < d.x1; x += 1.8) B.prop.box(x, d.H + 0.5, z, 0.6, 0.5, t / 2, col);
  for (let y = d.y1 + 4; y < d.H - 2; y += 6) for (let x = -12; x <= 12; x += 6) B.glow.box(x, y, z + t / 2 + 0.03, 0.5, 0.8, 0.02, d.style === 'castle' ? [4, 2.6, 0.8] : [3, 3, 3.4]);
  return true;
}
export function parkCeil(B, d) {
  if (d.style !== 'haunt') return false;
  const [a, b] = clipOf(d), len = b - a, z = Z((a + b) / 2), y = d.y;
  B.prop.box(0, y + 2.5, z, 16.6, 2.5, len / 2, hex(0x1e1426), { bevel: 0.1 });
  for (const s of [-1, 1]) {
    B.prop.box(s * 14.5, (y + 5) / 2, z, 0.5, (y + 5) / 2, len / 2, hex(0x3a2440));
    for (const k of every(d, 5, 10, a, b)) { B.prop.box(s * 13.98, 3.6, Z(k), 0.02, 1.0, 0.8, hex(0x6a4a2a)); B.prop.box(s * 13.96, 3.6, Z(k), 0.02, 0.8, 0.6, hex(0x14101c)); B.glow.box(s * 13.95, 3.75, Z(k) + 0.15, 0.01, 0.06, 0.06, [5, 0.3, 0.3]); B.glow.box(s * 13.95, 3.75, Z(k) - 0.15, 0.01, 0.06, 0.06, [5, 0.3, 0.3]); }
    for (const k of every(d, 0, 7, a, b)) { B.prop.cyl(s * 13.7, 1.4, Z(k), 0.08, 0.3, 5, mulc(K.white, 0.9)); B.glow.box(s * 13.7, 1.85, Z(k), 0.05, 0.1, 0.05, [6, 3.4, 0.8]); }
  }
  for (const k of every(d, 3, 9, a, b)) { const x = ((k * 7) % 20) - 10; B.net.triOut([x - 0.9, y - 0.02, Z(k)], [x + 0.9, y - 0.02, Z(k)], [x, y - 0.8, Z(k)], [0, 0, 1], [0.16, 0.16, 0.2]); B.metal.beam([x + 3, y, Z(k) + 2], [x + 3, y - 1.2, Z(k) + 2], 0.04, 0.04, K.dark); }
  for (const k of every(d, 10, 30, a, b)) B.glow.box(0, y - 0.1, Z(k), 0.6, 0.05, 0.6, [1.4, 3.6, 2]);
  return true;
}

export const PARK_EMIT = { canopy, cupbase, wheelbase, swingframe, track, droptower, swinger, parkentry, hauntface, crate };
