// 맵 decor 항목 → 정점 지오메트리. 모두 각진 저폴리 + 베벨. 좌표: x=좌우, y=높이, z=-s
import { MeshBuilder, hex, mulc, mixc } from './mesh.js';
import { makeRng } from '../../shared/math.js';
import { emitVehicle } from './vehicles.js';
import { SCENE_EMIT } from './scenery.js';
import { K, neon, paint, Z, clipOf, every } from './palette.js';
import { PARK_EMIT, parkWall, parkGap, parkStep, parkPortal, parkCeil } from './parkProps.js';

export const newBuilders = () => ({
  prop: new MeshBuilder(), metal: new MeshBuilder(), glass: new MeshBuilder(), glow: new MeshBuilder(), stripe: new MeshBuilder(), net: new MeshBuilder(),
  road: new MeshBuilder(), side: new MeshBuilder(), grass: new MeshBuilder(), water: new MeshBuilder(), bldg: [0, 1, 2, 3, 4, 5].map(() => new MeshBuilder()),
});

// ───────────────── 건물 ─────────────────
const STYLE_TINT = { city: 1, office: 1.05, glass: 1.1, house: 1.0, hotel: 1.25, site: 0.85, highway: 0.95, neon: 0.8, industrial: 0.8, canyon: 1.05, dawn: 1.1 };
function bldg(B, d, ctx) {
  const rng = makeRng(d.seed), mb = B.bldg[d.tex], side = d.side, z = Z(d.s), hz = d.w / 2, x0 = d.x0 || 17, base = d.base || 0;
  const toon = d.style === 'toon' || d.style === 'stall' || d.style === 'coaster';
  const hue = d.hue !== undefined ? d.hue : Math.floor(rng() * 360);
  const tint = toon ? mulc(paint(hue, 1.0, 0.55), 2.0) : d.style === 'castle' ? mixc([0.95, 0.9, 0.82], [0.7, 0.68, 0.66], rng()) : d.style === 'hotel' ? mixc([1, 1, 1], [1.2, 1.05, 0.9], rng() * 0.6) : mulc([1, 1, 1], (0.72 + rng() * 0.5) * (STYLE_TINT[d.style] || 1));
  const off = [rng() * 25, rng() * 28];
  const tiers = d.tiers || [[0, d.h, 0, 0, 0]];
  let top = null;
  for (const [y0, y1, si, ri, bi] of tiers) {
    const xa = side * (x0 + ri), xb = side * (x0 + d.d - bi), cx = (xa + xb) / 2, hx = Math.abs(xb - xa) / 2, hzz = hz - si;
    mb.box(cx, base + (y0 + y1) / 2, z, hx, (y1 - y0) / 2, hzz, tint, { bevel: 0.3, uv: [25.6, 28.8], uvOff: off, skip: ['+y'] });
    B.prop.box(cx, base + y1 + 0.12, z, hx - 0.05, 0.12, hzz - 0.05, mulc(K.concD, 0.8 + rng() * 0.3), { bevel: 0.05 });
    top = { cx, hx, hz: hzz, y: base + y1 + 0.24 };
  }
  // 도로 쪽 면 바로 앞(두께 t 인 장식의 중심 x)
  const fx = (t) => side * (x0 - t - 0.02);
  if (toon || d.style === 'castle') {
    const H = tiers[tiers.length - 1][1];
    if (d.style === 'castle') {
      for (let k = -hz + 0.8; k < hz - 0.4; k += 2.2) B.prop.box(top.cx, top.y + 0.7, z + k, top.hx, 0.7, 0.6, mulc(tint, 0.8));
      for (let y = 9; y < H - 4; y += 13) for (let k = -hz + 4; k < hz - 3; k += 11) { B.glow.box(fx(0.03), base + y, z + k, 0.03, 0.9, 0.35, [4, 2.2, 0.6]); B.prop.box(fx(0.06), base + y + 1.0, z + k, 0.06, 0.12, 0.5, mulc(tint, 0.6)); }
      for (const sz of [-1, 1]) B.prop.box(fx(-1.25), base + H / 2 + 0.75, z + sz * (hz - 1.2), 1.2, H / 2 + 0.75, 1.2, mulc(tint, 0.85), { bevel: 0.2 });
      B.prop.box(fx(0.3), base + 0.9, z, 0.3, 0.9, hz * 0.9, mulc(tint, 0.7));
      return;
    }
    // 동화풍 파사드: 색 띠 + 창문 테 + 지붕 장식(높이 안쪽) + 가판대/간판
    const c2 = paint(hue + 150, 0.95, 0.75), c3 = mulc([1, 1, 1], 0.95);
    if (d.tex !== 4) for (let y = 4.2; y < H - 1; y += 4.6) B.prop.box(fx(0.12), base + y, z, 0.12, 0.18, hz - 0.1, c2);
    else { B.prop.box(fx(0.15), base + H - 1.2, z, 0.15, 1.2, hz - 0.1, c2); for (let k = -hz + 1.5; k < hz - 1; k += 3) B.glow.box(fx(0.04), base + H - 0.5, z + k, 0.04, 0.25, 0.25, neon(hue + k * 25, 2.8)); }
    B.prop.box(top.cx, top.y + 0.3, z, top.hx + 0.2, 0.3, top.hz + 0.2, c3);
    for (let k = -hz + 1; k < hz - 0.5; k += 1.4) B.glow.box(fx(0.05), base + Math.min(H - 0.6, 3.9), z + k, 0.05, 0.08, 0.08, neon(hue + k * 20, 2.4));
    if (d.style === 'stall') {
      // 가판대: 줄무늬 차양 + 카운터 + 음식 간판
      for (let k = -hz + 0.6; k < hz - 0.3; k += 1.2) { B.prop.save().translate(fx(0.32), 3.0, z + k + 0.3).rotZ(side * 0.4); B.prop.box(0, 0, 0, 0.3, 0.04, 0.3, (Math.round(k / 1.2) % 2) ? mulc(K.white, 1) : paint(hue, 0.95, 0.85)); B.prop.restore(); }
      B.prop.box(fx(0.25), 0.55, z, 0.25, 0.55, hz * 0.8, mulc(K.brown, 1.2)); B.glass.box(fx(0.04), 1.7, z, 0.03, 0.6, hz * 0.75, hex(0x2a3a4a));
      if (d.food) ctx.signs.push({ x: fx(0.02), y: 4.4, z, w: Math.min(d.w * 0.8, 6), h: 1.0, ry: -side * Math.PI / 2, text: d.food, color: '#ffe27a', fixed: true });
    } else {
      B.prop.save().translate(fx(0.26), 2.9, z).rotZ(side * 0.45); B.prop.box(0, 0, 0, 0.26, 0.04, hz * 0.85, c2); B.prop.restore();
      B.glass.box(fx(0.04), 1.5, z, 0.03, 1.1, hz * 0.6, hex(0x2a4a6a));
    }
    return;
  }
  if (d.style === 'house') {
    // 저층 상가: 어닝(차양), 가로/세로 간판, 셔터, 실외기
    const hue = Math.floor(rng() * 360);
    B.glow.box(fx(0.06), 3.75, z, 0.06, 0.32, hz * 0.8, neon(hue, 2.6));
    const aw = [[0.85, 0.18, 0.2], [0.15, 0.45, 0.75], [0.9, 0.62, 0.1], [0.2, 0.55, 0.3]][Math.floor(rng() * 4)];
    B.prop.save().translate(fx(0.24), 2.95, z).rotZ(side * 0.45);
    B.prop.box(0, 0, 0, 0.26, 0.04, hz * 0.85, aw, { bevel: 0.02 }); B.prop.restore();
    if (rng() < 0.7) { const vh = Math.min(d.h - 6, 4 + rng() * 5); B.glow.box(fx(0.08), 5 + vh / 2, z + (rng() - 0.5) * hz, 0.08, vh / 2, 0.55, neon((hue + 140) % 360, 3.0)); }
    B.metal.box(fx(0.04), 1.1, z, 0.04, 1.1, hz * 0.6, mulc(K.steel, 0.55));
    for (let y = 1.3; y < 2.2; y += 0.22) B.metal.box(fx(0.06), y, z, 0.02, 0.03, hz * 0.6, mulc(K.dark, 1.6));
    B.prop.box(top.cx, top.y + 0.45, z + hz - 0.15, top.hx, 0.45, 0.12, K.concD); B.prop.box(top.cx, top.y + 0.45, z - hz + 0.15, top.hx, 0.45, 0.12, K.concD);
    if (rng() < 0.6) B.metal.box(fx(0.2), 5.5 + rng() * Math.max(1, d.h - 8), z + (rng() - 0.5) * hz, 0.2, 0.32, 0.42, mulc(K.steel, 0.8));
    return;
  }
  // 옥상 디테일: 실외기, 물탱크, 안테나, 광고판
  const n = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const px = top.cx + (rng() - 0.5) * (top.hx * 1.5), pz = z + (rng() - 0.5) * (top.hz * 1.5);
    const k = Math.floor(rng() * 3);
    if (k === 0) B.metal.box(px, top.y + 0.6, pz, 0.9 + rng() * 0.6, 0.6, 0.7 + rng() * 0.5, mulc(K.steel, 0.7), { bevel: 0.06 });
    else if (k === 1) { B.metal.cyl(px, top.y + 1.4, pz, 1.5, 2.2, 8, K.rust, { r2: 1.4 }); for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.metal.box(px + lx, top.y + 0.7, pz + lz, 0.1, 0.7, 0.1, K.dark); }
    else { const hh = 6 + rng() * 12; B.metal.beam([px, top.y, pz], [px, top.y + hh, pz], 0.25, 0.25, K.dark); B.glow.box(px, top.y + hh + 0.2, pz, 0.22, 0.22, 0.22, K.red3); ctx.beacons.push([px, top.y + hh + 0.2, pz]); }
  }
  if (d.roof === 1) { const hue = Math.floor(rng() * 360); B.glow.box(top.cx - side * (top.hx - 0.6), top.y + 3.5, z, 0.2, 1.6, Math.min(top.hz * 0.7, 7), neon(hue, 4.5)); }
  // 네온 모서리 띠
  if (d.neon) {
    const hue = [180, 300, 330, 40, 140][Math.floor(rng() * 5)], th = Math.min(d.h, 24 + rng() * 40);
    for (const sz of [-1, 1]) B.glow.box(fx(0.1), base + 4 + th / 2, z + sz * (hz - 0.2), 0.1, th / 2, 0.09, neon(hue, 4));
    B.glow.box(fx(0.08), base + 6.4, z, 0.08, 0.1, hz - 0.3, neon(hue, 3.6));
  }
  // 호텔: 발코니 띠 / 유리 타워: 세로 멀리언
  if (d.style === 'hotel') for (let y = 8; y < tiers[0][1] - 2; y += 3.6) B.prop.box(fx(0.22), base + y, z, 0.22, 0.08, hz * 0.92, mulc(K.white, 0.9));
  if (d.style === 'glass') for (let k = -hz + 2; k < hz - 1; k += 3.2) B.metal.box(fx(0.08), base + tiers[0][1] / 2, z + k, 0.08, tiers[0][1] / 2, 0.06, mulc(K.steel, 0.9));
  // 1층 상점 간판(도로 쪽)
  if (base === 0 && (d.shop === undefined ? rng() < 0.75 : d.shop)) {
    const hue = Math.floor(rng() * 360);
    B.glow.box(fx(0.12), 3.3, z, 0.12, 0.45, hz * (0.4 + rng() * 0.3), neon(hue, 3.2));
    B.metal.box(fx(0.06), 0.9, z, 0.06, 0.9, hz * 0.55, mulc(K.dark, 1.4));
  }
}

// ───────────────── 가로등/가로수/신호등/정류장 ─────────────────
function lamp(B, d, ctx) {
  const x = d.side * 13.9, z = Z(d.s);
  B.metal.box(x, 0.35, z, 0.3, 0.35, 0.3, K.metal, { bevel: 0.05 });
  B.metal.box(x, 4.5, z, 0.14, 4.5, 0.14, mulc(K.metal, 1.2), { bevel: 0.03 });
  B.metal.beam([x, 8.7, z], [d.side * 12.4, 9.0, z], 0.16, 0.14, K.metal);
  B.metal.beam([d.side * 12.4, 9.0, z], [d.side * 10.9, 8.85, z], 0.16, 0.12, K.metal);
  B.glow.box(d.side * 10.8, 8.72, z, 0.55, 0.08, 0.26, K.lamp);
  B.metal.box(d.side * 10.8, 8.84, z, 0.6, 0.05, 0.3, K.dark);
  ctx.lamps.push([d.side * 10.8, 8.5, z]);
}
function tree(B, d, ctx) {
  const rng = makeRng(d.seed), x = d.x !== undefined ? d.x : d.side * 15.3, z = Z(d.s);
  if (d.kind === 'palm') {
    // 야자수: 휜 줄기 + 잎 8장 (충돌 구 r=2.3, y=5 안에 들어감)
    let px = x, py = 0;
    for (let k = 0; k < 6; k++) { const nx = x + Math.sin(k * 0.25) * 0.5 * -d.side, ny = py + 1.05; B.prop.beam([px, py, z], [nx, ny, z], 0.3 - k * 0.02, 0.3 - k * 0.02, mulc(K.brown, 1.2 - k * 0.05)); px = nx; py = ny; }
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + rng() * 0.3; B.prop.save().translate(px, py, z).rotY(a).rotZ(-0.5); B.prop.box(1.1, 0, 0, 1.15, 0.04, 0.32, mulc(K.green, 1.1 + rng() * 0.4)); B.prop.restore(); }
    return;
  }
  B.prop.cyl(x, 0, z, 0.26, 3.2, 6, K.brown, { r2: 0.2 });
  const g = mulc(K.green, 0.7 + rng() * 0.6), g2 = mixc(g, [0.5, 0.65, 0.2], 0.3);
  B.prop.cyl(x, 2.6, z, 2.3, 1.9, 7, g, { r2: 1.1, bottom: true });
  B.prop.cyl(x, 4.1, z, 1.7, 1.7, 7, g2, { r2: 0.5 });
  B.prop.cyl(x, 5.4, z, 1.0, 1.4, 6, mulc(g, 1.15), { r2: 0 });
}
function signal(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) B.metal.box(s * 13.7, 3.3, z, 0.25, 3.3, 0.25, K.metal, { bevel: 0.04 });
  B.metal.box(0, 6.6, z, 13.7, 0.3, 0.25, K.metal, { bevel: 0.04 });
  for (const x of [-6.5, 6.5]) {
    B.metal.box(x, 5.7, z, 0.38, 0.6, 0.3, K.dark, { bevel: 0.04 });
    B.glow.box(x, 6.1, z + 0.32, 0.13, 0.13, 0.02, K.red3); B.glow.box(x, 5.7, z + 0.32, 0.13, 0.13, 0.02, [1.2, 1.0, 0.1]); B.glow.box(x, 5.3, z + 0.32, 0.13, 0.13, 0.02, K.green3);
  }
}
function busstop(B, d) {
  const x = d.side * 14.6, z = Z(d.s);
  B.metal.box(x, 2.6, z, 1.0, 0.07, 2.5, K.metal, { bevel: 0.03 });
  for (const sz of [-2.3, 2.3]) B.metal.box(x + d.side * 0.9, 1.3, z + sz, 0.07, 1.3, 0.07, K.metal);
  B.glass.box(x + d.side * 0.92, 1.4, z, 0.03, 1.1, 2.3, hex(0x16324a));
  B.glow.box(x - d.side * 0.4, 1.4, z, 0.04, 0.8, 1.0, neon(190, 2.6));
  B.metal.box(x, 0.45, z - 1.0, 0.45, 0.07, 0.8, K.dark);
}
function subway(B, d) {
  const x = d.side * 14.8, z = Z(d.s);
  B.prop.box(x, 0.5, z, 1.3, 0.5, 1.8, K.concD, { bevel: 0.05 });
  B.metal.box(x, 3.2, z, 1.4, 0.08, 1.9, K.metal, { bevel: 0.03 });
  for (const sz of [-1.7, 1.7]) for (const sx of [-1.2, 1.2]) B.metal.box(x + sx, 1.7, z + sz, 0.07, 1.5, 0.07, K.metal);
  B.glow.box(x, 3.65, z, 0.5, 0.35, 0.05, neon(120, 3.5));
  B.prop.box(x, 0.02, z, 0.9, 0.02, 1.2, K.dark);
}
function billboard(B, d, ctx) {
  const x = d.side * 14.6, z = Z(d.s);
  for (const sz of [-3, 3]) B.metal.box(x, 6, z + sz, 0.25, 6, 0.25, K.metal, { bevel: 0.04 });
  B.metal.box(x, 11.5, z, 0.3, 2.3, 4.2, K.dark, { bevel: 0.05 });
  ctx.signs.push({ x: x - d.side * 0.36, y: 11.5, z, w: 7.6, h: 4.2, ry: d.side > 0 ? -Math.PI / 2 : Math.PI / 2, text: d.text, hue: d.hue, neon: true });
}
function sign(B, d, ctx) {
  const x = d.side * 14.2, z = Z(d.s), w = d.big ? 6.4 : 5.2, h = d.big ? 2.0 : 1.5, y = d.big ? 4.4 : 3.6;
  for (const sz of [-w / 2 + 0.3, w / 2 - 0.3]) B.metal.box(x, y / 2, z + sz, 0.08, y / 2, 0.08, K.metal);
  B.metal.box(x, y, z, 0.07, h / 2 + 0.08, w / 2 + 0.08, K.dark);
  ctx.signs.push({ x: x, y, z, w, h, ry: 0, text: d.text, color: d.color, fixed: true, nx: -d.side });
}
function xwalk(B, d) {
  const z = Z(d.s);
  for (let x = -11; x <= 11; x += 2) B.prop.box(x, 0.022, z, 0.5, 0.012, 1.6, K.white);
}
function xstreet(B, d) {
  const z = Z(d.s), w = d.w / 2;
  for (const s of [-1, 1]) {
    B.prop.box(s * 41.5, 0.0, z, 24.6, 0.02, w, K.asphalt);
    B.metal.box(s * 17.2, 0.45, z, 0.5, 0.45, w, K.yellow, { bevel: 0.05 });          // 옆길 입구 방벽
    B.glow.box(s * 17.0, 1.0, z, 0.05, 0.08, w, K.orange3);
    for (let k = 0; k < 6; k++) B.prop.box(s * (22 + k * 8), 0.03, z, 2, 0.01, 0.12, mulc(K.yellow, 0.8));
  }
}

// ───────────────── 도로 위 장애물 ─────────────────
function wall(B, d, ctx) {
  if (parkWall(B, d)) return;
  const z = Z(d.s), cx = (d.x0 + d.x1) / 2, hx = (d.x1 - d.x0) / 2, h = d.h, t = d.th || 1.2;
  if (d.style === 'concrete') {
    // 공사장 콘크리트 장벽: 회색 벽 + 노랑/검정 띠 + 경고등
    B.prop.box(cx, h / 2, z, hx, h / 2, t / 2, mulc(K.conc, 0.95), { bevel: 0.12 });
    B.stripe.box(cx, Math.min(h - 0.35, 0.9), z, hx, 0.3, t / 2 + 0.03, [1, 1, 1], { uv: [2.6, 2.6] });
    B.prop.box(cx, h + 0.06, z, hx, 0.06, t / 2 + 0.05, K.dark, { bevel: 0.03 });
    for (let x = d.x0 + 2; x < d.x1; x += 4) { B.glow.box(x, h + 0.25, z + t / 2 + 0.05, 0.14, 0.14, 0.04, K.orange3); B.metal.box(x, h / 2, z + t / 2 + 0.02, 0.05, h / 2 - 0.2, 0.02, mulc(K.dark, 1.3)); }
  } else if (d.style === 'pipe') {
    B.metal.box(cx, h / 2, z, hx, h / 2, t / 2, mulc(K.steel, 0.6), { bevel: 0.1 });
    for (let x = d.x0 + 2; x < d.x1; x += 6) { B.prop.box(x, h / 2, z, 0.35, h / 2 + 0.05, t / 2 + 0.05, K.yellow, { bevel: 0.04 }); B.metal.box(x, h + 0.35, z, 0.3, 0.1, 0.3, K.red); }
  } else {
    B.stripe.box(cx, h / 2, z, hx, h / 2, t / 2, [1, 1, 1], { bevel: 0.1, uv: [2.6, 2.6] });
    B.prop.box(cx, h + 0.06, z, hx, 0.06, t / 2 + 0.05, K.dark, { bevel: 0.03 });
    for (let x = d.x0 + 3; x < d.x1; x += 5) B.glow.box(x, h + 0.2, z + t / 2 + 0.05, 0.12, 0.12, 0.03, K.orange3);
  }
  if (d.spikes) for (let x = d.x0 + 0.5; x < d.x1; x += 0.8) B.metal.cone(x, h + 0.1, z, 0.28, d.spikes, 5, mixc(K.steel, K.red, 0.25));
  if (d.wireY) {
    B.metal.beam([d.x0, d.wireY, z], [d.x1, d.wireY, z], 0.11, 0.11, K.dark);
    for (let x = d.x0 + 4; x < d.x1; x += 8) B.glow.box(x, d.wireY, z, 0.1, 0.1, 0.1, K.cyan);
    B.metal.box(d.x0 + 0.2, (d.wireY + h) / 2, z, 0.15, (d.wireY - h) / 2, 0.15, K.dark); B.metal.box(d.x1 - 0.2, (d.wireY + h) / 2, z, 0.15, (d.wireY - h) / 2, 0.15, K.dark);
    ctx.sparks.push([0, d.wireY, z, d.x0, d.x1]);
  }
}
function spikes(B, d) {
  const z = Z(d.s), cx = (d.x0 + d.x1) / 2, hx = (d.x1 - d.x0) / 2;
  B.metal.box(cx, 0.04, z, hx, 0.04, d.d / 2, K.dark);
  for (let x = d.x0 + 0.3; x < d.x1 - 0.1; x += 0.6) for (let k = 0; k < Math.floor(d.d / 0.6); k++) B.metal.cone(x, 0.08, z - d.d / 2 + 0.3 + k * 0.6, 0.2, d.h, 4, mixc(K.steel, K.red, 0.3));
  B.glow.box(cx, 0.1, z + d.d / 2 + 0.1, hx, 0.04, 0.05, K.red3);
}
function veh(B, d, ctx) {
  emitVehicle({ paint: B.prop, glass: B.glass, trim: B.metal, glow: B.glow }, d.vk, { x: d.x, z: Z(d.s), yaw: d.yaw, color: d.color });
  if (d.burn) {
    ctx.fires.push([d.x, 1.3, Z(d.s)]); for (let k = 0; k < 4; k++) B.glow.cone(d.x + (k - 1.5) * 0.4, 1.4, Z(d.s) + (k % 2 ? 0.4 : -0.4), 0.28, 0.9 + (k % 3) * 0.4, 5, K.orange3); }
}
function pad(B, d) {
  const z = Z((d.s0 + d.s1) / 2), hz = (d.s1 - d.s0) / 2, col = d.finish ? [3, 2.4, 0.5] : [0.18, 1.5, 0.9];
  B.glow.box(0, 0.03, z, 11.6, 0.012, hz, mulc(col, 0.35));
  for (const s of [-1, 1]) { B.glow.box(s * 11.6, 0.06, z, 0.12, 0.03, hz, mulc(col, 2.2)); }
  B.glow.box(0, 0.06, Z(d.s0), 11.7, 0.03, 0.1, mulc(col, 2.2)); B.glow.box(0, 0.06, Z(d.s1), 11.7, 0.03, 0.1, mulc(col, 2.2));
  for (let s = d.s0 + 6; s < d.s1 - 3; s += 8) for (const x of [-6, 0, 6]) {
    B.glow.save().translate(x, 0.07, Z(s)).rotY(0);
    B.glow.quadOut([-1.6, 0, 0.9], [0, 0, -1.0], [0, 0, -0.35], [-1.6, 0, 1.55], [0, 1, 0], mulc(col, 1.6));
    B.glow.quadOut([1.6, 0, 0.9], [0, 0, -1.0], [0, 0, -0.35], [1.6, 0, 1.55], [0, 1, 0], mulc(col, 1.6));
    B.glow.restore();
  }
  for (const s of [-1, 1]) for (const e of [d.s0, d.s1]) { B.metal.box(s * 12.3, 0.9, Z(e), 0.14, 0.9, 0.14, K.metal); B.glow.box(s * 12.3, 1.9, Z(e), 0.2, 0.12, 0.2, mulc(col, 3)); }
}
function cp(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) { B.metal.box(s * 12.5, 4, z, 0.3, 4, 0.3, K.metal, { bevel: 0.05 }); B.glow.box(s * 12.5, 4, z + 0.32, 0.08, 3.6, 0.04, K.cyan); }
  B.metal.box(0, 8.1, z, 12.8, 0.35, 0.3, K.metal, { bevel: 0.06 });
  B.glow.box(0, 7.7, z + 0.2, 12.4, 0.07, 0.05, K.cyan);
  for (let x = -11.5; x <= 11.5; x += 1.5) B.glow.box(x, 5.6, z, 0.015, 2.1, 0.015, [0.2, 1.6, 2.0]);
  ctx.signs.push({ x: 0, y: 9.4, z, w: 6, h: 1.5, ry: 0, text: `CHECKPOINT ${d.id}`, color: '#35f0ff', fixed: true, nx: 1 });
}
function finish(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) B.metal.box(s * 13, 6, z, 0.5, 6, 0.5, K.metal, { bevel: 0.08 });
  B.metal.box(0, 12.2, z, 13.5, 0.7, 0.5, K.metal, { bevel: 0.08 });
  for (let i = 0; i < 28; i++) for (let j = 0; j < 2; j++) B.glow.box(-13 + i * 0.95 + 0.47, 11.9 + j * 0.6, z + 0.52, 0.45, 0.28, 0.02, (i + j) % 2 ? [5, 5, 5] : [0.1, 0.1, 0.1]);
  for (let x = -11; x <= 11; x += 1) B.glow.box(x, 8.2, z, 0.015, 3.6, 0.015, [3, 2.4, 0.4]);
  ctx.signs.push({ x: 0, y: 14.2, z, w: 10, h: 2.2, ry: 0, text: 'FINISH', color: '#ffd24a', fixed: true, nx: 1 });
}
function gap(B, d) {
  if (parkGap(B, d)) return;
  const len = d.s1 - d.s0, z = Z((d.s0 + d.s1) / 2);
  B.prop.box(0, -9.6, z, 17, 0.2, len / 2 + 2, mulc(K.dark, 0.5));
  for (const e of [d.s0, d.s1]) {
    B.metal.beam([-16, -0.5, Z(e)], [16, -0.5, Z(e)], 0.6, 0.8, K.rust);
    for (let x = -15; x < 15; x += 1.7) B.prop.box(x + ((x * 7) % 1) * 0.3, -0.1, Z(e) + (e === d.s0 ? 0.35 : -0.35), 0.55, 0.12, 0.3 + (((x * 13) % 1) + 1) % 1 * 0.3, K.concD, { bevel: 0.05 });
    for (let x = -14; x < 14; x += 3.1) B.metal.beam([x, -0.2, Z(e)], [x + 0.4, 0.5 + (((x * 3) % 1) + 1) % 1 * 0.5, Z(e) + (e === d.s0 ? 0.6 : -0.6)], 0.06, 0.06, K.rust);
  }
  for (const x of [-13.5, 13.5]) B.metal.beam([x, -0.5, Z(d.s0)], [x, -0.5, Z(d.s1)], 0.5, 0.6, mulc(K.rust, 0.7));
}
function step(B, d) {
  if (parkStep(B, d)) return;
  const len = d.s1 - d.s0, z = Z((d.s0 + d.s1) / 2);
  if (d.style === 'girder') {
    // 크레인이 들어 올린 철골 데크: I빔 + 데크 플레이트 + 기둥
    B.metal.box(0, d.h - 0.2, z, 16.5, 0.2, len / 2, mulc(K.steel, 0.55), { bevel: 0.03 });
    for (let x = -14; x <= 14; x += 7) { B.metal.box(x, d.h - 0.75, z, 0.18, 0.35, len / 2, mulc(K.orange, 0.9)); B.metal.box(x, d.h - 0.4, z, 0.5, 0.04, len / 2, mulc(K.orange, 0.8)); }
    for (let s = d.s0 + 3; s < d.s1; s += 9) for (const x of [-12, 0, 12]) B.metal.box(x, (d.h - 1.1) / 2, Z(s), 0.25, (d.h - 1.1) / 2, 0.25, mulc(K.orange, 0.7));
    B.stripe.box(0, d.h / 2, Z(d.s0) + 0.62, 16.6, d.h / 2, 0.02, [1, 1, 1], { uv: [2.6, 2.6] });
    for (let x = -15; x <= 15; x += 5) B.glow.box(x, d.h + 0.15, Z(d.s0) + 0.7, 0.14, 0.14, 0.05, K.orange3);
    return;
  }
  B.prop.box(0, d.h / 2 - 0.02, z, 16.5, d.h / 2 - 0.02, len / 2, K.concD, { bevel: 0.1 });
  B.stripe.box(0, d.h / 2, Z(d.s0) + 0.62, 16.6, d.h / 2, 0.02, [1, 1, 1], { uv: [2.6, 2.6] });
  for (let x = -15; x <= 15; x += 5) B.glow.box(x, d.h + 0.15, Z(d.s0) + 0.7, 0.14, 0.14, 0.05, K.orange3);
}
function portal(B, d) {
  if (parkPortal(B, d)) return;
  const z = Z(d.s), cx = (d.x0 + d.x1) / 2, hx = (d.x1 - d.x0) / 2, t = d.th || 1.6, col = [0.8, 0.85, 0.95];
  const mk = (y0, y1) => B.bldg[0].box(cx, (y0 + y1) / 2, z, hx, (y1 - y0) / 2, t / 2, col, { bevel: 0.15, uv: [25.6, 28.8] });
  if (d.y0 > 0.05) mk(0, d.y0);
  mk(d.y1, d.H);
  const c = d.style === 'sky' ? K.cyan : K.orange3;
  B.glow.box(cx, d.y0, z + t / 2 + 0.03, hx, 0.08, 0.04, c); B.glow.box(cx, d.y1, z + t / 2 + 0.03, hx, 0.08, 0.04, c);
  for (const x of [d.x0 + 0.1, d.x1 - 0.1]) B.glow.box(x, (d.y0 + d.y1) / 2, z + t / 2 + 0.03, 0.08, (d.y1 - d.y0) / 2, 0.04, c);
  for (let y = d.y0 + 2; y < d.y1; y += 4) B.glow.box(cx, y, z + t / 2 + 0.03, 0.04, 0.04, 0.04, c);
}
function ceil(B, d) {
  if (parkCeil(B, d)) return;
  const [a, b] = clipOf(d), len = b - a, z = Z((a + b) / 2), y = d.y;
  if (d.style === 'slab') {
    // 공사 중 건물의 콘크리트 슬래브 천장 + 보 + 작업등
    B.prop.box(0, y + 2.5, z, 16.6, 2.5, len / 2, mulc(K.conc, 0.75), { bevel: 0.08 });
    for (const k of every(d, 3, 7, a, b)) { B.prop.box(0, y - 0.35, Z(k), 16.6, 0.35, 0.3, mulc(K.concD, 0.9)); }
    for (const k of every(d, 6, 14, a, b)) for (const x of [-7, 7]) { B.glow.box(x, y - 0.75, Z(k), 0.5, 0.06, 0.2, [6, 5.2, 3.6]); B.metal.beam([x, y - 0.7, Z(k)], [x, y - 0.05, Z(k)], 0.03, 0.03, K.dark); }
    return;
  }
  B.prop.box(0, y + 2.5, z, 16.6, 2.5, len / 2, d.style === 'tunnel' ? hex(0x30343c) : K.dark, { bevel: 0.1 });
  if (d.style === 'tunnel') {
    for (const s of [-1, 1]) {
      B.prop.box(s * 14.3, (y + 5) / 2, z, 0.5, (y + 5) / 2, len / 2, hex(0x474b54), { bevel: 0.08 });
      for (const k of every(d, 6, 12, a, b)) B.glow.box(s * 13.75, 3.4, Z(k), 0.04, 0.12, 2.2, [4.5, 4.2, 3.4]);
      for (const k of every(d, 0, 4, a, b)) B.prop.box(s * 13.78, 0.6, Z(k), 0.02, 0.6, 1.9, (Math.round(k / 4) % 2) ? mulc(K.yellow, 0.7) : K.dark);
    }
    for (const k of every(d, 4, 14, a, b)) for (const x of [-6, 6]) B.glow.box(x, y - 0.06, Z(k), 0.3, 0.04, 2.4, [6, 6, 5.6]);
    for (const k of every(d, 20, 60, a, b)) { B.metal.beam([-13.8, y - 0.3, Z(k)], [13.8, y - 0.3, Z(k)], 0.5, 0.5, K.metal); B.glow.box(0, y - 0.65, Z(k), 3, 0.25, 0.05, [0.3, 3.2, 1.2]); }
  } else {
    for (const k of every(d, 2, d.every || 3.2, a, b, 1)) for (let x = -15.5; x <= 15.5; x += 1.55) { B.metal.save().translate(x, y, Z(k)).rotX(Math.PI).cone(0, 0, 0, 0.3, d.spikes || 1.1, 4, mixc(K.steel, K.red, 0.25)); B.metal.restore(); }
    for (const k of every(d, 5, 9, a, b)) B.glow.box(0, y - 0.05, Z(k), 14, 0.04, 0.12, K.orange3);
  }
}
function laserfix(B, d) {
  const z = Z(d.s), cx = (d.x0 + d.x1) / 2, hx = (d.x1 - d.x0) / 2;
  for (const y of d.ys) { B.glow.box(cx, y, z, hx, 0.035, 0.035, [9, 0.4, 0.5]); }
  for (const s of [-1, 1]) { B.metal.box(s * (hx - 0.2), (d.ys[d.ys.length - 1] + 1) / 2, z, 0.3, (d.ys[d.ys.length - 1] + 1) / 2, 0.3, K.metal, { bevel: 0.05 }); for (const y of d.ys) B.glow.box(s * (hx - 0.2), y, z + 0.33, 0.1, 0.1, 0.03, K.red3); }
}
function piperack(B, d) {
  const z = Z(d.s);
  for (const dy of [-0.38, 0, 0.38]) B.metal.beam([d.x0, d.y + dy, z], [d.x1, d.y + dy, z], 0.4, 0.34, mixc(K.steel, K.orange, 0.15 + dy));
  for (const s of [-1, 1]) B.metal.box(s * 16, d.y / 2, z, 0.3, d.y / 2, 0.4, K.metal);
  for (let x = -14; x <= 14; x += 7) { B.metal.box(x, d.y, z, 0.12, 0.7, 0.55, K.yellow); }
}
function arch(B, d) {
  const z = Z(d.s), y = d.y;
  B.metal.box(0, y, z, 14.5, 0.8, 0.9, K.steel, { bevel: 0.1 });
  for (const s of [-1, 1]) {
    B.metal.beam([s * 14.5, y, z], [s * 12.6, 0.6, z], 0.35, 0.35, K.steel);
    B.metal.beam([s * 14.5, y, z], [s * 9, y + 14, z], 0.5, 0.5, K.steel);
    for (const x of [4, 8, 11]) B.metal.beam([s * x, y, z], [s * x, 0.8, z], 0.08, 0.08, mulc(K.steel, 0.7));
  }
  B.glow.box(0, y - 0.9, z, 14, 0.05, 0.05, [6, 0.6, 0.6]);
}
function wire(B, d, ctx) {
  const z = Z(d.s);
  B.metal.beam([d.x0, d.y, z], [d.x1, d.y, z], 0.1, 0.1, K.dark);
  for (const x of [d.x0 + 0.3, d.x1 - 0.3]) { B.metal.box(x, d.y / 2, z, 0.15, d.y / 2, 0.15, K.metal); B.glow.box(x, d.y, z, 0.2, 0.15, 0.2, K.cyan); }
  if (d.sparks) ctx.sparks.push([0, d.y, z, d.x0, d.x1]);
}
function signgantry(B, d, ctx) {
  const z = Z(d.s);
  for (const s of [-1, 1]) B.metal.box(s * 13, 3.5, z, 0.3, 3.5, 0.3, K.metal, { bevel: 0.05 });
  B.metal.box(0, 7, z, 13, 0.9, 0.5, K.dark, { bevel: 0.06 });
  ctx.signs.push({ x: 0, y: 7, z: z + 0.52, w: 22, h: 1.5, ry: 0, text: '▶ DOWNTOWN  12 km', color: '#39ff88', fixed: true, nx: 1 });
}
function rail(B, d) {
  const [a, b] = clipOf(d), c = Z((a + b) / 2), hz = (b - a) / 2;
  if (d.style === 'parapet' || d.style === 'bridge') {
    B.prop.box(d.x, 0.55, c, 0.28, 0.55, hz, K.concD, { bevel: 0.06 });
    B.metal.box(d.x, 1.15, c, 0.12, 0.05, hz, K.steel);
    for (const s of every(d, 2, 10, a, b)) B.glow.box(d.x - Math.sign(d.x) * 0.3, 0.8, Z(s), 0.03, 0.05, 0.4, K.orange3);
  } else {
    B.metal.box(d.x, 0.62, c, 0.06, 0.18, hz, K.steel);
    for (const s of every(d, 1, 3.8, a, b)) B.metal.box(d.x, 0.4, Z(s), 0.06, 0.4, 0.06, K.dark);
  }
}
function pillar(B, d) {
  if (d.style === 'track') { B.metal.box(d.x, d.h / 2, Z(d.s), d.w / 2, d.h / 2, d.w / 2, mulc(K.white, 0.9), { bevel: 0.08 }); B.glow.box(d.x, d.h - 0.4, Z(d.s) + d.w / 2 + 0.01, d.w * 0.3, 0.1, 0.01, K.orange3); return; }
  if (d.style === 'column') { B.prop.box(d.x, d.h / 2, Z(d.s), d.w / 2, d.h / 2, d.w / 2, mulc(K.conc, 0.95), { bevel: 0.05 }); B.stripe.box(d.x, 0.6, Z(d.s), d.w / 2 + 0.02, 0.6, d.w / 2 + 0.02, [1, 1, 1], { uv: [2.6, 2.6] }); return; }
  B.prop.box(d.x, d.h / 2, Z(d.s), d.w / 2, d.h / 2, d.w / 2, K.concD, { bevel: 0.1 });
}

export const EMIT = { bldg, lamp, tree, signal, busstop, subway, billboard, sign, xwalk, xstreet, wall, spikes, veh, pad, cp, finish, gap, step, portal, ceil, laserfix, piperack, arch, wire, signgantry, rail, pillar, ...SCENE_EMIT, ...PARK_EMIT };

// 장식 항목의 대표 s (청크 배정용). 청크로 잘린 항목은 잘린 시작점(c0)
export const decorS = (d) => (d.c0 !== undefined ? d.c0 : d.s !== undefined ? d.s : d.s0 !== undefined ? d.s0 : 0);
