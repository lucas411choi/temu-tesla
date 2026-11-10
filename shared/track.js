// 구불구불한 경로(트랙). 서버/클라이언트/검증 도구 공용.
//
// 경로 = 조각(piece)들의 연결. 조각은 직선(kind 없음) 또는 원호(kind:'arc', 반지름 R, 방향 d=+1 오른쪽/-1 왼쪽, 각 th).
// 조각마다 시작점(x0,z0), 시작 방향 h, 길이 L, 반폭 w, 시작/끝 높이 y0/y1(경사로), solid(틈이면 false).
// (직선끼리 방향이 갑자기 바뀌는 이음매에는 정사각형 '모서리 판'을 깐다 — 지금 맵은 원호 곡선을 쓴다)
//
// 좌표 약속
//  - 진행 방향 벡터 f = (sin h, -cos h), 오른쪽 벡터 r = (cos h, sin h).  h=0 이면 -z 방향. h 가 커지면 오른쪽으로 꺾인다.
//  - 맵 제작은 '펼친 좌표' (s=경로 거리, x=오른쪽(+)/왼쪽(-), y=노면 위 높이)로 하고, 그 자리의 변환(frame)으로 월드에 옮긴다.
//    곡선 위에서는 그 지점의 접선 방향 변환을 쓴다 (작은 물체용. 긴 물체는 잘라서 놓는다).
import { rotY, m3Mul, m3MulV } from './math.js';

const CELL = 24, TAU = Math.PI * 2;
const wrapPos = (a) => ((a % TAU) + TAU) % TAU;

// 원호 위 거리 a, 옆 x 의 월드 위치와 방향
export function arcAt(p, a, x = 0) {
  const hh = p.h + p.d * a / p.R, c = Math.cos(hh), s = Math.sin(hh), k = x - p.d * p.R;
  return { x: p.cx + k * c, z: p.cz + k * s, h: hh };
}
export function frameOf(p, s) {
  const a = s - p.s0, y = p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L));
  if (p.kind === 'arc') { const q = arcAt(p, Math.max(0, Math.min(p.L, a))); return { ox: q.x, oz: q.z, h: q.h, s0: s, y, R: rotY(-q.h) }; }
  return { ox: p.x0, oz: p.z0, h: p.h, s0: p.s0, y, R: rotY(-p.h) };
}
// 로컬 점 → 월드 점 (fr = frameOf 결과). 로컬 y 는 '노면 위 높이'
export function toWorld(fr, x, y, zl) {
  const a = -zl - fr.s0, c = Math.cos(fr.h), s = Math.sin(fr.h);
  return [fr.ox + a * s + x * c, y + fr.y, fr.oz - a * c + x * s];
}
// 로컬 도형(box/sphere) → 월드 도형
export function shapeToWorld(fr, sh) {
  const c = toWorld(fr, sh.c[0], sh.c[1], sh.c[2]);
  if (sh.k === 's') return { k: 's', c, r: sh.r, br: sh.r, tag: sh.tag, lethal: sh.lethal };
  return { k: 'b', c, h: sh.h, R: m3Mul(fr.R, sh.R), br: sh.br, tag: sh.tag, lethal: sh.lethal };
}

export class Track {
  // pieces: [{ s0, L, x0, z0, h, w, y0, y1, solid, surf, sec, kind?, R?, d?, th? }]
  constructor(pieces, extra = []) {
    this.pieces = pieces;
    for (const p of pieces) {
      p.fx = Math.sin(p.h); p.fz = -Math.cos(p.h); p.rx = Math.cos(p.h); p.rz = Math.sin(p.h); p.s1 = p.s0 + p.L;
      if (p.kind === 'arc') { p.cx = p.x0 + p.d * p.R * Math.cos(p.h); p.cz = p.z0 + p.d * p.R * Math.sin(p.h); p.h1 = p.h + p.d * p.th; } else p.h1 = p.h;
    }
    this.length = pieces.length ? pieces[pieces.length - 1].s1 : 0;
    const slabs = [];
    pieces.forEach((p, i) => {
      if (p.solid) {
        if (p.kind === 'arc') slabs.push({ arc: true, cx: p.cx, cz: p.cz, R: p.R, d: p.d, h: p.h, L: p.L, w: p.w, y0: p.y0, y1: p.y1, surf: p.surf, piece: i, s0: p.s0, a0: 0, a1: p.L });
        else slabs.push({ x0: p.x0, z0: p.z0, fx: p.fx, fz: p.fz, rx: p.rx, rz: p.rz, a0: 0, a1: p.L, w: p.w, y0: p.y0, y1: p.y1, surf: p.surf, piece: i, s0: p.s0 });
      }
      const q = pieces[i + 1];
      if (q && p.solid && q.solid && p.kind !== 'arc' && q.kind !== 'arc' && Math.abs(q.h - p.h1) > 1e-3) {
        const jx = p.x0 + p.fx * p.L, jz = p.z0 + p.fz * p.L, w = Math.max(p.w, q.w);
        slabs.push({ x0: jx, z0: jz, fx: p.fx, fz: p.fz, rx: p.rx, rz: p.rz, a0: -w, a1: w, w, y0: p.y1, y1: p.y1, surf: p.surf, corner: true, piece: i, s0: p.s1, turn: q.h - p.h });
      }
    });
    for (const e of extra) slabs.push(e);
    this.slabs = slabs;
    this.grid = new Map();
    slabs.forEach((sl, k) => {
      let pts;
      if (sl.arc) {
        // 원호 판: 4m 정도 간격의 작은 사각형들(풍경 겹침 검사용) + 경계 상자
        const n = Math.max(2, Math.ceil(sl.L / 4)), seg = sl.L / n;
        sl.subs = []; pts = [];
        for (let j = 0; j < n; j++) {
          const q = arcAt(sl, (j + 0.5) * seg), fx = Math.sin(q.h), fz = -Math.cos(q.h);
          sl.subs.push({ cx: q.x, cz: q.z, fx, fz, rx: Math.cos(q.h), rz: Math.sin(q.h), a: seg / 2 + 0.3, w: sl.w });
        }
        for (let j = 0; j <= n; j++) for (const x of [-sl.w, sl.w]) { const q = arcAt(sl, j * seg, x); pts.push([q.x, q.z]); }
      } else pts = [[sl.a0, -sl.w], [sl.a0, sl.w], [sl.a1, -sl.w], [sl.a1, sl.w]].map(([a, l]) => [sl.x0 + a * sl.fx + l * sl.rx, sl.z0 + a * sl.fz + l * sl.rz]);
      const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1]);
      sl.box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      for (let cx = Math.floor(sl.box[0] / CELL); cx <= Math.floor(sl.box[1] / CELL); cx++) for (let cz = Math.floor(sl.box[2] / CELL); cz <= Math.floor(sl.box[3] / CELL); cz++) {
        const key = cx * 100003 + cz; let a = this.grid.get(key); if (!a) this.grid.set(key, a = []); a.push(k);
      }
    });
  }
  pieceAt(s) {
    const P = this.pieces; let lo = 0, hi = P.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m].s0 <= s) lo = m; else hi = m - 1; }
    return P[Math.max(0, lo)];
  }
  frameAt(s) { return frameOf(this.pieceAt(s), s); }
  // 경로 위 점 (s, x, y) → 월드
  point(s, x = 0, y = 0) {
    const p = this.pieceAt(s), a = s - p.s0, yy = p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L));
    if (p.kind === 'arc') { const q = arcAt(p, Math.max(0, Math.min(p.L, a)), x); return [q.x, yy + y, q.z]; }
    const aa = Math.max(-50, a);
    return [p.x0 + aa * p.fx + x * p.rx, yy + y, p.z0 + aa * p.fz + x * p.rz];
  }
  headingAt(s) { const p = this.pieceAt(s); return p.kind === 'arc' ? p.h + p.d * Math.max(0, Math.min(p.L, s - p.s0)) / p.R : p.h; }
  surfY(s) { const p = this.pieceAt(s), a = s - p.s0; return p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L)); }
  // 원호 위 점의 (거리 a, 옆 x). a 는 원호 범위 밖이면 음수/큰 값
  static arcLocal(p, X, Z) {
    const vx = X - p.cx, vz = Z - p.cz, rho = Math.hypot(vx, vz);
    const hh = Math.atan2(-p.d * vz, -p.d * vx);
    let t = wrapPos(p.d * (hh - p.h));
    const span = p.L / p.R;
    if (t > span) t = t - span > (TAU - span) / 2 ? t - TAU : t;      // 시작 전(음수) / 끝 지남 중 가까운 쪽
    return { a: t * p.R, x: p.d * (p.R - rho) };
  }
  // 월드 (X,Z) 에서 높이 Y+tol 이하인 노면 중 가장 높은 것. 없으면 -Infinity
  groundY(X, Y, Z, tol = 1.0) {
    const a = this.grid.get(Math.floor(X / CELL) * 100003 + Math.floor(Z / CELL));
    if (!a) return -Infinity;
    let best = -Infinity;
    for (let i = 0; i < a.length; i++) {
      const sl = this.slabs[a[i]];
      let u, top;
      if (sl.arc) {
        const q = Track.arcLocal(sl, X, Z);
        if (q.a < 0 || q.a > sl.L || q.x < -sl.w || q.x > sl.w) continue;
        u = q.a; top = sl.y0 + (sl.y1 - sl.y0) * (u / sl.L);
      } else {
        const dx = X - sl.x0, dz = Z - sl.z0;
        u = dx * sl.fx + dz * sl.fz; if (u < sl.a0 || u > sl.a1) continue;
        const l = dx * sl.rx + dz * sl.rz; if (l < -sl.w || l > sl.w) continue;
        top = sl.y0 + (sl.y1 - sl.y0) * ((u - sl.a0) / ((sl.a1 - sl.a0) || 1));
      }
      if (top <= Y + tol && top > best) best = top;
    }
    return best;
  }
  // 월드 점이 경로의 어디쯤인지: { s, x(옆), y(노면 높이), i(조각) }. hint(직전 s)가 있으면 그 근처를 우선한다 (위아래로 겹친 경로 구분)
  locate(X, Y, Z, hint = null) {
    let best = null, bestScore = Infinity;
    const P = this.pieces;
    let i0 = 0, i1 = P.length - 1;
    const hasHint = hint !== null && hint !== undefined;
    if (hasHint) { const k = P.indexOf(this.pieceAt(hint)); i0 = Math.max(0, k - 8); i1 = Math.min(P.length - 1, k + 8); }
    for (let pass = 0; pass < 2 && !best; pass++) {
      for (let i = i0; i <= i1; i++) {
        const p = P[i];
        let a, l;
        if (p.kind === 'arc') { const q = Track.arcLocal(p, X, Z); a = q.a; l = q.x; }
        else { const dx = X - p.x0, dz = Z - p.z0; a = dx * p.fx + dz * p.fz; l = dx * p.rx + dz * p.rz; }
        const ac = Math.max(0, Math.min(p.L, a));
        const yy = p.y0 + (p.y1 - p.y0) * (ac / p.L);
        const out = Math.abs(a - ac), side = Math.max(0, Math.abs(l) - p.w);
        const score = out * 2 + side + Math.max(0, yy - Y - 2) * 1.5 + Math.max(0, Y - yy - 30) * 0.5 + (hasHint ? Math.abs(p.s0 + ac - hint) * 0.002 : 0);
        if (score < bestScore) { bestScore = score; best = { s: p.s0 + ac, x: l, y: yy, i, score }; }
      }
      if (!best || bestScore > 60) { best = null; bestScore = Infinity; i0 = 0; i1 = P.length - 1; }
    }
    return best;
  }
}

// 직선으로 '펼친' 경로의 지면 (검증 도구/자동조종 전용): 예전의 s 기반 지면과 같은 인터페이스
export function straightGround(pieces) {
  return pieces.map((p) => ({ s0: p.s0, s1: p.s0 + p.L, y: p.y0, y1: p.y1 !== p.y0 ? p.y1 : undefined, ref: Math.min(p.y0, p.y1), solid: p.solid, half: p.w, wall: Infinity }));
}
export { m3MulV };
