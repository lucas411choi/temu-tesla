// 구불구불한 경로(트랙). 서버/클라이언트/검증 도구 공용.
//
// 경로 = 직선 조각(piece)들의 연결. 조각마다 시작점(x0,z0), 방향 h, 길이 L, 반폭 w, 시작/끝 높이 y0/y1(경사로), solid(틈이면 false).
// 조각 사이에서 방향이 바뀌면(꺾임) 이음매에 정사각형 '모서리 판'을 깔아 빈틈 없이 잇는다.
//
// 좌표 약속
//  - 진행 방향 벡터 f = (sin h, -cos h), 오른쪽 벡터 r = (cos h, sin h).  h=0 이면 예전과 같이 -z 방향으로 달린다. h 가 커지면 오른쪽으로 꺾인다.
//  - 맵 제작은 '펼친 좌표' (s=경로를 따라 간 거리, x=오른쪽(+)/왼쪽(-), y=그 자리 노면 위 높이) 로 하고,
//    각 조각의 변환(frame)으로 월드 좌표에 옮긴다. 예전의 직선 맵 좌표(z = -s)와 같은 꼴이라 장애물 코드는 그대로 쓴다.
import { rotY, m3Mul, m3MulV } from './math.js';

const CELL = 24;

export function frameOf(p, s) {
  // 조각 p 안의 거리 s 에서의 변환: 로컬 점 (x, y, z=-s') → 월드
  const a = s - p.s0, y = p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L));
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
  // pieces: [{ s0, L, x0, z0, h, w, y0, y1, solid, surf, sec }]
  constructor(pieces, extra = []) {
    this.pieces = pieces;
    for (const p of pieces) { p.fx = Math.sin(p.h); p.fz = -Math.cos(p.h); p.rx = Math.cos(p.h); p.rz = Math.sin(p.h); p.s1 = p.s0 + p.L; }
    this.length = pieces.length ? pieces[pieces.length - 1].s1 : 0;
    // 지면 판(slab): 단단한 조각 + 꺾인 이음매의 모서리 판 + 추가 발판
    const slabs = [];
    pieces.forEach((p, i) => {
      if (p.solid) slabs.push({ x0: p.x0, z0: p.z0, fx: p.fx, fz: p.fz, rx: p.rx, rz: p.rz, a0: 0, a1: p.L, w: p.w, y0: p.y0, y1: p.y1, surf: p.surf, piece: i, s0: p.s0 });
      const q = pieces[i + 1];
      if (q && p.solid && q.solid && Math.abs(q.h - p.h) > 1e-3) {
        const jx = p.x0 + p.fx * p.L, jz = p.z0 + p.fz * p.L, w = Math.max(p.w, q.w);
        slabs.push({ x0: jx, z0: jz, fx: p.fx, fz: p.fz, rx: p.rx, rz: p.rz, a0: -w, a1: w, w, y0: p.y1, y1: p.y1, surf: p.surf, corner: true, piece: i, s0: p.s1, turn: q.h - p.h });
      }
    });
    for (const e of extra) slabs.push(e);
    this.slabs = slabs;
    this.grid = new Map();
    slabs.forEach((sl, k) => {
      const pts = [[sl.a0, -sl.w], [sl.a0, sl.w], [sl.a1, -sl.w], [sl.a1, sl.w]].map(([a, l]) => [sl.x0 + a * sl.fx + l * sl.rx, sl.z0 + a * sl.fz + l * sl.rz]);
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
  point(s, x = 0, y = 0) { const p = this.pieceAt(s), a = Math.max(-50, s - p.s0), yy = p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L)); return [p.x0 + a * p.fx + x * p.rx, yy + y, p.z0 + a * p.fz + x * p.rz]; }
  headingAt(s) { return this.pieceAt(s).h; }
  surfY(s) { const p = this.pieceAt(s), a = s - p.s0; return p.y0 + (p.y1 - p.y0) * Math.max(0, Math.min(1, a / p.L)); }
  // 월드 (X,Z) 에서 높이 Y+tol 이하인 노면 중 가장 높은 것. 없으면 -Infinity
  groundY(X, Y, Z, tol = 1.0) {
    const a = this.grid.get(Math.floor(X / CELL) * 100003 + Math.floor(Z / CELL));
    if (!a) return -Infinity;
    let best = -Infinity;
    for (let i = 0; i < a.length; i++) {
      const sl = this.slabs[a[i]], dx = X - sl.x0, dz = Z - sl.z0;
      const u = dx * sl.fx + dz * sl.fz; if (u < sl.a0 || u > sl.a1) continue;
      const l = dx * sl.rx + dz * sl.rz; if (l < -sl.w || l > sl.w) continue;
      const top = sl.y0 + (sl.y1 - sl.y0) * ((u - sl.a0) / ((sl.a1 - sl.a0) || 1));
      if (top <= Y + tol && top > best) best = top;
    }
    return best;
  }
  // 월드 점이 경로의 어디쯤인지: { s, x(옆), y(노면 높이), i(조각) }. hint(직전 s)가 있으면 그 근처를 우선한다 (위아래로 겹친 경로 구분)
  locate(X, Y, Z, hint = null) {
    let best = null, bestScore = Infinity;
    const P = this.pieces;
    let i0 = 0, i1 = P.length - 1;
    if (hint !== null && hint !== undefined) { const ph = this.pieceAt(hint); const k = P.indexOf(ph); i0 = Math.max(0, k - 8); i1 = Math.min(P.length - 1, k + 8); }
    for (let pass = 0; pass < 2 && !best; pass++) {
      for (let i = i0; i <= i1; i++) {
        const p = P[i], dx = X - p.x0, dz = Z - p.z0;
        const a = dx * p.fx + dz * p.fz;
        const ac = Math.max(0, Math.min(p.L, a)), l = dx * p.rx + dz * p.rz;
        const yy = p.y0 + (p.y1 - p.y0) * (ac / p.L);
        const out = Math.abs(a - ac), side = Math.max(0, Math.abs(l) - p.w);
        const score = out * 2 + side + Math.max(0, yy - Y - 2) * 1.5 + Math.max(0, Y - yy - 30) * 0.5 + (hint !== null && hint !== undefined ? Math.abs(p.s0 + ac - hint) * 0.002 : 0);
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
