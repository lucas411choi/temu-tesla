// 도로 위 일반 차량 6종 (세단/SUV/택시/버스/트럭/경찰차): 각각 고유한 각진 저폴리 모델
// emitVehicle(builders, kind, {x,y,z,yaw,color}) : builders = { paint, glass, trim, glow } (MeshBuilder 4종)에 정점을 추가한다.
import { MeshBuilder, hex, mulc, mixc } from './mesh.js';
import { VEH } from '../../shared/vehicles.js';

const GLASS = hex(0x0d1620), TRIM = hex(0x16181c), TIRE = hex(0x0d0d0f), RIM = hex(0xbfc5cc), HEAD = [3.4, 3.8, 4.6], TAIL = [4.6, 0.1, 0.14];

// (z,y) 윤곽선을 x 방향으로 압출. profile은 [[z,y],...] 반시계 무관(바깥 방향 자동 보정)
function extrudeZY(mb, profile, xl, xr, col) {
  const n = profile.length;
  let cz = 0, cy = 0; for (const p of profile) { cz += p[0]; cy += p[1]; } cz /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const a = profile[i], b = profile[(i + 1) % n];
    mb.quadOut([xl, a[1], a[0]], [xr, a[1], a[0]], [xr, b[1], b[0]], [xl, b[1], b[0]], [0, (a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cz], col);
    mb.triOut([xr, cy, cz], [xr, a[1], a[0]], [xr, b[1], b[0]], [1, 0, 0], col);
    mb.triOut([xl, cy, cz], [xl, a[1], a[0]], [xl, b[1], b[0]], [-1, 0, 0], col);
  }
}
function wheel(mb, x, y, z, r, w) {
  mb.save().translate(x, y, z).rotZ(Math.PI / 2);
  mb.cyl(0, -w / 2, 0, r, w, 12, TIRE, { bottom: true });
  mb.cyl(0, w / 2 - 0.01, 0, r * 0.62, 0.02, 10, RIM, { top: true });
  mb.restore();
}

const BUILD = {
  sedan(b, c, o) {
    extrudeZY(b.paint, [[-2.3, 0.3], [-2.3, 0.7], [-1.75, 0.92], [-0.95, 0.98], [1.35, 0.98], [2.0, 0.94], [2.3, 0.76], [2.3, 0.3]], -0.92, 0.92, c);
    extrudeZY(b.glass, [[-0.98, 0.98], [-0.45, 1.42], [0.85, 1.45], [1.4, 1.2], [1.65, 0.98]], -0.78, 0.78, GLASS);
    b.paint.box(0, 1.46, 0.2, 0.74, 0.02, 0.62, c, { bevel: 0.01 });
    for (const [x, z] of [[-0.86, -1.45], [0.86, -1.45], [-0.86, 1.4], [0.86, 1.4]]) wheel(b.trim, x, 0.33, z, 0.33, 0.22);
    for (const s of [-1, 1]) { b.glow.box(s * 0.68, 0.62, -2.31, 0.16, 0.05, 0.01, HEAD); b.glow.box(s * 0.7, 0.66, 2.31, 0.15, 0.04, 0.01, TAIL); }
    b.trim.box(0, 0.4, -2.31, 0.55, 0.06, 0.01, TRIM);
  },
  suv(b, c, o) {
    extrudeZY(b.paint, [[-2.45, 0.35], [-2.45, 0.85], [-1.9, 1.08], [-1.0, 1.15], [2.2, 1.15], [2.45, 1.05], [2.45, 0.35]], -1.0, 1.0, c);
    extrudeZY(b.glass, [[-1.05, 1.15], [-0.55, 1.78], [2.1, 1.85], [2.3, 1.15]], -0.88, 0.88, GLASS);
    b.paint.box(0, 1.87, 0.7, 0.86, 0.02, 1.3, c, { bevel: 0.01 });
    b.trim.box(0, 1.9, 0.7, 0.85, 0.02, 1.2, TRIM);
    for (const [x, z] of [[-0.95, -1.55], [0.95, -1.55], [-0.95, 1.55], [0.95, 1.55]]) wheel(b.trim, x, 0.4, z, 0.4, 0.26);
    for (const s of [-1, 1]) { b.glow.box(s * 0.75, 0.95, -2.46, 0.18, 0.07, 0.01, HEAD); b.glow.box(s * 0.78, 0.98, 2.46, 0.12, 0.1, 0.01, TAIL); }
  },
  taxi(b, c, o) {
    BUILD.sedan(b, hex(0xf2b705), o);
    b.paint.box(0, 1.56, 0.2, 0.3, 0.1, 0.45, hex(0xf6f0d8), { bevel: 0.02 });
    b.glow.box(0, 1.6, 0.2, 0.28, 0.05, 0.43, [2.6, 2.4, 1.2]);
    b.trim.box(0, 0.78, 0.0, 0.93, 0.03, 1.2, TRIM);
  },
  police(b, c, o) {
    extrudeZY(b.paint, [[-2.35, 0.3], [-2.35, 0.72], [-1.8, 0.94], [-1.0, 1.0], [1.4, 1.0], [2.05, 0.96], [2.35, 0.78], [2.35, 0.3]], -0.94, 0.94, hex(0xeef1f4));
    b.paint.box(0, 0.5, 0, 0.955, 0.2, 2.36, hex(0x15181d), { bevel: 0.02 });
    extrudeZY(b.glass, [[-1.02, 1.0], [-0.5, 1.45], [0.85, 1.48], [1.45, 1.22], [1.7, 1.0]], -0.8, 0.8, GLASS);
    b.paint.box(0, 1.49, 0.2, 0.76, 0.02, 0.62, hex(0xeef1f4), { bevel: 0.01 });
    b.glow.box(-0.3, 1.58, 0.15, 0.28, 0.07, 0.12, [0.4, 0.5, 6]); b.glow.box(0.3, 1.58, 0.15, 0.28, 0.07, 0.12, [6, 0.3, 0.3]);
    for (const [x, z] of [[-0.88, -1.5], [0.88, -1.5], [-0.88, 1.42], [0.88, 1.42]]) wheel(b.trim, x, 0.33, z, 0.33, 0.22);
    for (const s of [-1, 1]) { b.glow.box(s * 0.7, 0.64, -2.36, 0.16, 0.05, 0.01, HEAD); b.glow.box(s * 0.72, 0.68, 2.36, 0.15, 0.04, 0.01, TAIL); }
  },
  bus(b, c, o) {
    b.paint.box(0, 1.45, 0, 1.27, 1.15, 5.5, c, { bevel: 0.07 });
    b.paint.box(0, 0.5, 0, 1.28, 0.3, 5.45, mulc(c, 0.6), { bevel: 0.05 });
    for (const s of [-1, 1]) {
      b.glass.box(s * 1.275, 1.9, 0, 0.012, 0.5, 5.1, GLASS);
      for (let k = -4; k <= 4; k++) b.trim.box(s * 1.28, 1.9, k * 1.1, 0.015, 0.52, 0.04, TRIM);
    }
    b.glass.box(0, 1.95, -5.52, 1.1, 0.55, 0.012, GLASS);
    b.glow.box(0, 2.7, -5.53, 0.9, 0.12, 0.01, [5, 3.0, 0.4]);
    b.paint.box(0, 3.3, 0, 1.0, 0.04, 5.0, mulc(c, 0.85));
    for (const z of [-3.4, 3.4]) for (const s of [-1, 1]) wheel(b.trim, s * 1.1, 0.48, z, 0.48, 0.3);
    for (const s of [-1, 1]) { b.glow.box(s * 1.0, 0.85, -5.52, 0.18, 0.08, 0.01, HEAD); b.glow.box(s * 1.0, 0.95, 5.52, 0.14, 0.12, 0.01, TAIL); }
  },
  truck(b, c, o) {
    b.paint.box(0, 1.55, -3.3, 1.2, 1.15, 1.0, c, { bevel: 0.06 });
    b.glass.box(0, 2.0, -4.31, 1.0, 0.55, 0.012, GLASS);
    b.paint.box(0, 2.35, 1.1, 1.25, 1.65, 3.25, hex(0xc9ced4), { bevel: 0.05 });
    b.trim.box(0, 0.62, -0.2, 1.1, 0.18, 4.2, TRIM);
    for (const z of [-3.4, 1.0, 2.6]) for (const s of [-1, 1]) wheel(b.trim, s * 1.0, 0.45, z, 0.45, 0.3);
    for (const s of [-1, 1]) { b.glow.box(s * 0.85, 1.0, -4.31, 0.16, 0.08, 0.01, HEAD); b.glow.box(s * 0.9, 1.2, 4.36, 0.14, 0.1, 0.01, TAIL); }
  },
};

export function emitVehicle(B, kind, o = {}) {
  const col = hex(o.color !== undefined ? o.color : 0x8a8f98);
  const tmp = { paint: new MeshBuilder(), glass: new MeshBuilder(), trim: new MeshBuilder(), glow: new MeshBuilder() };
  (BUILD[kind] || BUILD.sedan)(tmp, col, o);
  for (const k of ['paint', 'glass', 'trim', 'glow']) {
    if (!B[k]) continue;
    B[k].save().translate(o.x || 0, o.y || 0, o.z || 0).rotY(o.yaw || 0).append(tmp[k]).restore();
  }
}
export const vehicleBuilders = () => ({ paint: new MeshBuilder(), glass: new MeshBuilder(), trim: new MeshBuilder(), glow: new MeshBuilder() });
