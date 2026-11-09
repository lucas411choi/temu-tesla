// 정점 단위 모델링 도구 (three.js에 의존하지 않음 → Node에서도 실행/미리보기 가능)
// 모든 면은 개별 삼각형(플랫 셰이딩용 면 법선) + 정점 색 + 선택적 UV. 변환 스택(이동/회전)을 지원한다.
import { m3Mul, rotX, rotY, rotZ } from '../../shared/math.js';

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const hex = (h) => [srgb((h >> 16) & 255), srgb((h >> 8) & 255), srgb(h & 255)];
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.R = [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.t = [0, 0, 0]; this.stack = []; this.group = []; }
  get triCount() { return this.p.length / 9; }

  // ───── 변환 스택 ─────
  save() { this.stack.push([this.R.slice(), this.t.slice()]); return this; }
  restore() { const s = this.stack.pop(); this.R = s[0]; this.t = s[1]; return this; }
  translate(x, y, z) { const R = this.R; this.t[0] += R[0] * x + R[1] * y + R[2] * z; this.t[1] += R[3] * x + R[4] * y + R[5] * z; this.t[2] += R[6] * x + R[7] * y + R[8] * z; return this; }
  rotY(a) { this.R = m3Mul(this.R, rotY(a)); return this; }
  rotX(a) { this.R = m3Mul(this.R, rotX(a)); return this; }
  rotZ(a) { this.R = m3Mul(this.R, rotZ(a)); return this; }
  tp(p) { const R = this.R, t = this.t; return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2]]; }

  // ───── 기본 도형 ─────
  // col: [r,g,b] 또는 정점별 [[r,g,b]x3]
  tri(a, b, c, col, ua, ub, uc) {
    const A = this.tp(a), B = this.tp(b), C = this.tp(c);
    const n = cross(sub(B, A), sub(C, A));
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) return this;
    const nn = [n[0] / l, n[1] / l, n[2] / l];
    const cols = Array.isArray(col[0]) ? col : [col, col, col];
    for (let i = 0; i < 3; i++) {
      const P = i === 0 ? A : i === 1 ? B : C;
      this.p.push(P[0], P[1], P[2]); this.n.push(nn[0], nn[1], nn[2]); this.c.push(cols[i][0], cols[i][1], cols[i][2]);
    }
    const uu = ua ? [ua, ub, uc] : [[0, 0], [0, 0], [0, 0]];
    for (const q of uu) this.u.push(q[0], q[1]);
    return this;
  }
  quad(a, b, c, d, col, ua, ub, uc, ud) { this.tri(a, b, c, col, ua, ub, uc); return this.tri(a, c, d, col, ua, uc, ud); }
  // 바깥 방향(out)을 기준으로 감는 방향을 자동 보정하는 사각형 (로컬 좌표 기준)
  quadOut(a, b, c, d, out, col, uvf) {
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, out) < 0) { const t = b; b = d; d = t; }
    const f = uvf || null;
    return this.quad(a, b, c, d, col, f && f(a), f && f(b), f && f(c), f && f(d));
  }
  triOut(a, b, c, out, col, uvf) {
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, out) < 0) { const t = b; b = c; c = t; }
    const f = uvf || null;
    return this.tri(a, b, c, col, f && f(a), f && f(b), f && f(c));
  }

  // 베벨(모서리 깎기) 박스. o.bevel, o.uv = [미터당 UV 가로, 세로 타일 크기], o.uvOff = [du,dv], o.skip = ['+y',...] 생략 면
  box(cx, cy, cz, hx, hy, hz, col, o = {}) {
    const b = Math.min(o.bevel || 0, hx * 0.9, hy * 0.9, hz * 0.9);
    const uvs = o.uv, off = o.uvOff || [0, 0];
    const skip = o.skip || [];
    const uvf = uvs ? (axis) => (p) => axis === 'x' ? [(p[2] + off[0]) / uvs[0], (p[1] + off[1]) / uvs[1]] : axis === 'z' ? [(p[0] + off[0]) / uvs[0], (p[1] + off[1]) / uvs[1]] : [(p[0] + off[0]) / uvs[0], (p[2] + off[1]) / uvs[1]] : () => null;
    const X0 = cx - hx, X1 = cx + hx, Y0 = cy - hy, Y1 = cy + hy, Z0 = cz - hz, Z1 = cz + hz;
    const x0 = X0 + b, x1 = X1 - b, y0 = Y0 + b, y1 = Y1 - b, z0 = Z0 + b, z1 = Z1 - b;
    const face = (id, a, bb, c, d, out, ax) => { if (!skip.includes(id)) this.quadOut(a, bb, c, d, out, col, uvs ? uvf(ax) : null); };
    face('+x', [X1, y0, z0], [X1, y1, z0], [X1, y1, z1], [X1, y0, z1], [1, 0, 0], 'x');
    face('-x', [X0, y0, z0], [X0, y1, z0], [X0, y1, z1], [X0, y0, z1], [-1, 0, 0], 'x');
    face('+y', [x0, Y1, z0], [x1, Y1, z0], [x1, Y1, z1], [x0, Y1, z1], [0, 1, 0], 'y');
    face('-y', [x0, Y0, z0], [x1, Y0, z0], [x1, Y0, z1], [x0, Y0, z1], [0, -1, 0], 'y');
    face('+z', [x0, y0, Z1], [x1, y0, Z1], [x1, y1, Z1], [x0, y1, Z1], [0, 0, 1], 'z');
    face('-z', [x0, y0, Z0], [x1, y0, Z0], [x1, y1, Z0], [x0, y1, Z0], [0, 0, -1], 'z');
    if (b > 0) {
      const f2 = uvs ? uvf('z') : null;
      const sx = [-1, 1], P = (sxv, syv, szv) => [sxv > 0 ? X1 : X0, syv > 0 ? Y1 : Y0, szv > 0 ? Z1 : Z0];
      const inn = (sxv, syv, szv) => [sxv > 0 ? x1 : x0, syv > 0 ? y1 : y0, szv > 0 ? z1 : z0];
      // 12개 모서리 띠
      for (const sa of sx) for (const sb of sx) {
        // x-y 모서리 (z 방향으로 뻗음)
        this.quadOut([sa > 0 ? X1 : X0, sb > 0 ? y1 : y0, z0], [sa > 0 ? X1 : X0, sb > 0 ? y1 : y0, z1], [sa > 0 ? x1 : x0, sb > 0 ? Y1 : Y0, z1], [sa > 0 ? x1 : x0, sb > 0 ? Y1 : Y0, z0], [sa, sb, 0], col, f2);
        // x-z 모서리 (y 방향)
        this.quadOut([sa > 0 ? X1 : X0, y0, sb > 0 ? z1 : z0], [sa > 0 ? X1 : X0, y1, sb > 0 ? z1 : z0], [sa > 0 ? x1 : x0, y1, sb > 0 ? Z1 : Z0], [sa > 0 ? x1 : x0, y0, sb > 0 ? Z1 : Z0], [sa, 0, sb], col, f2);
        // y-z 모서리 (x 방향)
        this.quadOut([x0, sa > 0 ? Y1 : Y0, sb > 0 ? z1 : z0], [x1, sa > 0 ? Y1 : Y0, sb > 0 ? z1 : z0], [x1, sa > 0 ? y1 : y0, sb > 0 ? Z1 : Z0], [x0, sa > 0 ? y1 : y0, sb > 0 ? Z1 : Z0], [0, sa, sb], col, f2);
      }
      // 8개 모서리 점 삼각형
      for (const a of sx) for (const bb of sx) for (const c of sx) {
        this.triOut([a > 0 ? X1 : X0, bb > 0 ? y1 : y0, c > 0 ? z1 : z0], [a > 0 ? x1 : x0, bb > 0 ? Y1 : Y0, c > 0 ? z1 : z0], [a > 0 ? x1 : x0, bb > 0 ? y1 : y0, c > 0 ? Z1 : Z0], [a, bb, c], col, f2);
      }
    }
    return this;
  }

  // 다각형(x,z) 기둥: poly = [[x,z],...] (방향 무관), y0~y1
  prism(poly, y0, y1, col, o = {}) {
    let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
    const n = poly.length, topCol = o.topCol || col, uvs = o.uv;
    const uvf = uvs ? (p) => [(p[0] + p[2]) / uvs[0], p[1] / uvs[1]] : null;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
      this.quadOut([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [mx, 0, mz], col, uvf);
      if (o.top !== false) this.triOut([cx, y1, cz], [a[0], y1, a[1]], [b[0], y1, b[1]], [0, 1, 0], topCol);
      if (o.bottom) this.triOut([cx, y0, cz], [a[0], y0, a[1]], [b[0], y0, b[1]], [0, -1, 0], col);
    }
    return this;
  }
  // 세로 원기둥/원뿔대. 밑면 중심 (cx,cy,cz)
  cyl(cx, cy, cz, r, h, segs, col, o = {}) {
    const r2 = o.r2 !== undefined ? o.r2 : r, topCol = o.topCol || col;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const A = [cx + c0 * r, cy, cz + s0 * r], B = [cx + c1 * r, cy, cz + s1 * r], C = [cx + c1 * r2, cy + h, cz + s1 * r2], D = [cx + c0 * r2, cy + h, cz + s0 * r2];
      this.quadOut(A, B, C, D, [(c0 + c1) / 2, 0, (s0 + s1) / 2], col);
      if (o.top !== false && r2 > 0) this.triOut([cx, cy + h, cz], D, C, [0, 1, 0], topCol);
      if (o.bottom) this.triOut([cx, cy, cz], A, B, [0, -1, 0], col);
    }
    return this;
  }
  // 가시/원뿔: 밑면 중심에서 위로 뾰족
  cone(cx, cy, cz, r, h, segs, col) { return this.cyl(cx, cy, cz, r, h, segs, col, { r2: 0, top: false, bottom: true }); }
  // 두 점 사이 직육면체(케이블/파이프/레일 등). w=옆 두께, h=위 두께
  beam(a, b, w, h, col, o = {}) {
    const d = normalize(sub(b, a)), up = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const s = normalize(cross(up, d)), u = normalize(cross(d, s));
    const P = (t, ss, uu) => [(t ? b : a)[0] + s[0] * ss * w / 2 + u[0] * uu * h / 2, (t ? b : a)[1] + s[1] * ss * w / 2 + u[1] * uu * h / 2, (t ? b : a)[2] + s[2] * ss * w / 2 + u[2] * uu * h / 2];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const faces = [[[0, -1, -1], [0, 1, -1], [0, 1, 1], [0, -1, 1]]];
    // 옆면 4개 + 끝 2개
    const corners = (t) => [P(t, -1, -1), P(t, 1, -1), P(t, 1, 1), P(t, -1, 1)];
    const A4 = corners(0), B4 = corners(1);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const m = [(A4[i][0] + A4[j][0] + B4[i][0] + B4[j][0]) / 4 - mid[0], (A4[i][1] + A4[j][1] + B4[i][1] + B4[j][1]) / 4 - mid[1], (A4[i][2] + A4[j][2] + B4[i][2] + B4[j][2]) / 4 - mid[2]];
      this.quadOut(A4[i], A4[j], B4[j], B4[i], m, col);
    }
    if (!o.open) { this.quadOut(A4[0], A4[1], A4[2], A4[3], [-d[0], -d[1], -d[2]], col); this.quadOut(B4[0], B4[1], B4[2], B4[3], d, col); }
    return this;
  }
  // 로프트: rings[i] = [[x,y,z],...] (닫힌 고리). 고리는 +z에서 봤을 때 반시계, z가 증가하는 방향으로 쌓을 때 바깥 법선.
  loft(rings, col, o = {}) {
    const flip = o.flip ? -1 : 1;
    for (let i = 0; i < rings.length - 1; i++) {
      const r0 = rings[i], r1 = rings[i + 1], n = r0.length;
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const cc = o.colors ? o.colors(i, k) : col;
        if (flip > 0) this.quad(r0[k], r0[k2], r1[k2], r1[k], cc); else this.quad(r0[k], r1[k], r1[k2], r0[k2], cc);
      }
    }
    const cap = (ring, facing) => {
      let c = [0, 0, 0]; for (const p of ring) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c = [c[0] / ring.length, c[1] / ring.length, c[2] / ring.length];
      for (let k = 0; k < ring.length; k++) this.triOut(c, ring[k], ring[(k + 1) % ring.length], [0, 0, facing], col);
    };
    if (o.capStart) cap(rings[0], -flip);
    if (o.capEnd) cap(rings[rings.length - 1], flip);
    return this;
  }
  // 다른 빌더의 내용을 현재 변환을 적용해 붙인다
  append(mb) {
    for (let i = 0; i < mb.p.length; i += 3) {
      const P = this.tp([mb.p[i], mb.p[i + 1], mb.p[i + 2]]), R = this.R;
      this.p.push(P[0], P[1], P[2]);
      const nx = mb.n[i], ny = mb.n[i + 1], nz = mb.n[i + 2];
      this.n.push(R[0] * nx + R[1] * ny + R[2] * nz, R[3] * nx + R[4] * ny + R[5] * nz, R[6] * nx + R[7] * ny + R[8] * nz);
      this.c.push(mb.c[i], mb.c[i + 1], mb.c[i + 2]);
    }
    for (let i = 0; i < mb.u.length; i++) this.u.push(mb.u[i]);
    return this;
  }
  // three.js BufferGeometry 에 쓸 TypedArray 묶음
  arrays() {
    return { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), uv: new Float32Array(this.u) };
  }
  get empty() { return this.p.length === 0; }
}
