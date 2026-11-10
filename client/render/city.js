// 도시 뷰: 맵 decor + 노면을 경로 거리(s) 기준 약 300m 청크로 나눠 필요한 구간만 만들고(로드) 지나간 구간은 해제(언로드)한다.
// 장식은 '펼친 좌표'로 그린 뒤, 그 자리 경로 조각의 변환(위치/방향/높이)을 적용해 구불구불한 경로 위에 놓는다.
// 긴 장식(터널 천장, 난간 ...)은 조각마다 잘라서 각 조각의 변환으로 그린다.
import { newBuilders, EMIT, decorS } from './props.js';
import { LONG_TYPES } from './scenery.js';
import { hex, mulc } from './mesh.js';
import { Track, arcAt } from '../../shared/track.js';

export const CHUNK = 300;
const WHITE = [1, 1, 1];
const SURF = {
  road: { mat: 'road' }, bridge: { mat: 'road' }, plaza: { mat: 'side' }, park: { mat: 'side' }, alley: { mat: 'side' }, stone: { mat: 'side', tint: hex(0x9a9288) },
  dirt: { col: hex(0x6a543e) }, slab: { col: hex(0x8a8d92) }, roof: { col: hex(0x3a3c44) }, stairs: { col: hex(0x7a7d84) }, terrace: { col: hex(0xb08a60) }, station: { col: hex(0x5a7aa0) },
  scaffold: { metal: hex(0x8a6a3a) }, jib: { metal: hex(0xe0a818), truss: true }, girder: { metal: hex(0xd0662a), truss: true }, pipe: { metal: hex(0x8a929c), pipe: true },
  glass: { glass: hex(0x5a8ab0) }, boardwalk: { col: hex(0x8a6a48), planks: true }, coaster: { metal: hex(0xd83a6a), rails: true }, haunt: { col: hex(0x3a2a34), planks: true },
  rail: { col: hex(0x4a3a30), rails: true }, deck: { col: hex(0x6b6e75) },
};
const FLOOR = { asphalt: hex(0x1c1e24), dirt: hex(0x3e3024), city: hex(0x15171d), rock: hex(0x24221f), grass: hex(0x2f5a2a), void: hex(0x05040a) };

export class CityView {
  constructor(THREE, scene, map, mats, tex) {
    this.THREE = THREE; this.scene = scene; this.map = map; this.mats = mats; this.tex = tex;
    this.track = map._track || (map._track = new Track(map.route, map.platforms || []));
    this.chunks = new Map(); this.byChunk = new Map();
    this.maxChunk = Math.floor(map.length / CHUNK);
    const put = (ci, d) => { if (!this.byChunk.has(ci)) this.byChunk.set(ci, []); this.byChunk.get(ci).push(d); };
    for (const d of map.decor) {
      if (LONG_TYPES.has(d.t) && d.s0 !== undefined) {
        // 조각 경계 + 청크 경계에서 잘라 둔다
        for (const p of this.track.pieces) {
          const a = Math.max(d.s0, p.s0), b = Math.min(d.s1, p.s1);
          if (b - a < 0.05) continue;
          // 곡선 조각에서는 4m 이하로 잘라서 각 조각을 그 자리 접선 방향으로 그린다
          const n = p.kind === 'arc' ? Math.max(1, Math.ceil((b - a) / 4)) : 1, st = (b - a) / n;
          for (let j = 0; j < n; j++) {
            const a2 = a + j * st, b2 = a2 + st;
            for (let ci = Math.floor(Math.max(0, a2) / CHUNK); ci <= Math.floor(Math.max(0, b2 - 1e-6) / CHUNK); ci++) {
              const c0 = Math.max(a2, ci * CHUNK), c1 = Math.min(b2, (ci + 1) * CHUNK);
              if (c1 - c0 > 0.05) put(ci, { ...d, c0, c1 });
            }
          }
        }
      } else put(Math.max(0, Math.floor(decorS(d) / CHUNK)), d);
    }
    this.lamps = []; this.sparks = []; this.fires = []; this.beacons = [];
    this.dirty = true;
    this.group = new THREE.Group(); scene.add(this.group);
  }

  // 현재 위치 주변 청크를 보장. immediate=true 이면 한 번에 모두 만든다(시작/순간이동)
  update(sCar, immediate = false) {
    const c = Math.floor(Math.max(0, sCar) / CHUNK);
    const want = [];
    for (let k = c - 1; k <= c + 2; k++) if (k >= 0 && k <= this.maxChunk) want.push(k);
    for (const ci of [...this.chunks.keys()]) if (!want.includes(ci)) this.unload(ci);
    for (const ci of want) {
      if (this.chunks.has(ci)) continue;
      this.load(ci);
      if (!immediate) break;      // 프레임당 청크 1개만 만들어 끊김을 줄인다
    }
    if (this.dirty) {
      this.lamps = []; this.sparks = []; this.fires = []; this.beacons = [];
      for (const ch of this.chunks.values()) { this.lamps.push(...ch.lamps); this.sparks.push(...ch.sparks); this.fires.push(...ch.fires); this.beacons.push(...ch.beacons); }
      this.dirty = false;
    }
  }

  // 모든 빌더에 같은 변환을 건다
  withFrame(B, fr, fn) {
    const all = [B.prop, B.metal, B.glass, B.glow, B.stripe, B.net, B.road, B.side, B.grass, B.water, ...B.bldg];
    for (const b of all) b.save().translate(fr.ox, fr.y, fr.oz).rotY(-fr.h).translate(0, 0, fr.s0);
    try { fn(); } finally { for (const b of all) b.restore(); }
  }

  load(ci) {
    const THREE = this.THREE, mats = this.mats, B = newBuilders();
    const ctx = { lamps: [], signs: [], sparks: [], fires: [], beacons: [] };
    const s0 = ci * CHUNK, s1 = s0 + CHUNK;
    const box = this.roadGeometry(B, s0, s1);
    for (const d of this.byChunk.get(ci) || []) {
      const f = EMIT[d.t]; if (!f) continue;
      const anchor = d.c0 !== undefined ? (d.c0 + d.c1) / 2 : decorS(d);
      const fr = this.track.frameAt(Math.min(this.map.length, Math.max(0, anchor)));
      const n0 = { l: ctx.lamps.length, s: ctx.signs.length, p: ctx.sparks.length, f: ctx.fires.length, b: ctx.beacons.length };
      this.withFrame(B, fr, () => f(B, d, ctx));
      const T = (p) => this.toW(fr, p);
      for (let i = n0.l; i < ctx.lamps.length; i++) ctx.lamps[i] = T(ctx.lamps[i]);
      for (let i = n0.f; i < ctx.fires.length; i++) ctx.fires[i] = T(ctx.fires[i]);
      for (let i = n0.b; i < ctx.beacons.length; i++) ctx.beacons[i] = T(ctx.beacons[i]);
      for (let i = n0.p; i < ctx.sparks.length; i++) { const sp = ctx.sparks[i], a = T([sp[3], sp[1], sp[2]]), b = T([sp[4], sp[1], sp[2]]); ctx.sparks[i] = { a, b }; }
      for (let i = n0.s; i < ctx.signs.length; i++) { const sg = ctx.signs[i], w = T([sg.x, sg.y, sg.z]); sg.x = w[0]; sg.y = w[1]; sg.z = w[2]; sg.ry = (sg.ry || 0) - fr.h; }
    }
    const group = new THREE.Group(), geoms = [];
    const mk = (mb, mat, cast, recv = true) => {
      if (mb.empty) return;
      const a = mb.arrays(), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
      g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = recv; group.add(m); geoms.push(g);
    };
    mk(B.road, mats.road, false); mk(B.side, mats.side, false); mk(B.grass, mats.prop, false);
    mk(B.prop, mats.prop, true); mk(B.metal, mats.metal, true); mk(B.glass, mats.glass, false);
    mk(B.glow, mats.glow, false, false); mk(B.stripe, mats.stripe, true); mk(B.net, mats.net, false); mk(B.water, mats.water, false);
    B.bldg.forEach((b, i) => mk(b, mats.bldg[i], false));
    // 간판(글자 텍스처)
    const signMats = [];
    for (const sg of ctx.signs) {
      const t = this.tex.sign(sg.text, { fg: sg.color || '#39ff88', hue: sg.hue, w: 512, h: Math.max(32, Math.round(512 * sg.h / sg.w)) });
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide });
      const g = new THREE.PlaneGeometry(sg.w, sg.h), mesh = new THREE.Mesh(g, m);
      mesh.position.set(sg.x, sg.y, sg.z); mesh.rotation.y = sg.ry || 0; group.add(mesh); geoms.push(g); signMats.push(m);
    }
    // 바닥(경로 아래 낭떠러지): 이 청크 구간 테마의 바닥 (물이면 수면)
    if (box) {
      const sec = this.map.sections.find((q) => (s0 + s1) / 2 >= q.s0 && (s0 + s1) / 2 < q.s1) || this.map.sections[this.map.sections.length - 1];
      const fl = (sec.theme && sec.theme.floor) || 'asphalt', pad = 420, w = box[1] - box[0] + 2 * pad, h = box[3] - box[2] + 2 * pad;
      const g = new THREE.PlaneGeometry(w, h); g.rotateX(-Math.PI / 2);
      const mat = fl === 'water' ? mats.water : (this.floorMats || (this.floorMats = {}))[fl] || (this.floorMats[fl] = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(FLOOR[fl] || FLOOR.asphalt)), roughness: 0.95, metalness: 0.05 }));
      const m = new THREE.Mesh(g, mat); m.position.set((box[0] + box[1]) / 2, this.map.floorY + (fl === 'water' ? 0.2 : 0), (box[2] + box[3]) / 2); m.receiveShadow = true; m.renderOrder = -5;
      group.add(m); geoms.push(g);
    }
    this.group.add(group);
    // 스파크는 [x,y,z,x0,x1] 형식으로 되돌린다(main 이 쓰는 형식): 월드 두 점 사이 임의 점
    const sparks = ctx.sparks.map((q) => q.a ? [q.a, q.b] : q);
    this.chunks.set(ci, { group, geoms, signMats, lamps: ctx.lamps, sparks, fires: ctx.fires, beacons: ctx.beacons });
    this.dirty = true;
  }
  toW(fr, p) { const a = -p[2] - fr.s0, c = Math.cos(fr.h), s = Math.sin(fr.h); return [fr.ox + a * s + p[0] * c, p[1] + fr.y, fr.oz - a * c + p[0] * s]; }

  unload(ci) {
    const ch = this.chunks.get(ci);
    if (!ch) return;
    this.group.remove(ch.group);
    for (const g of ch.geoms) g.dispose();
    for (const m of ch.signMats) m.dispose();
    this.chunks.delete(ci);
    this.dirty = true;
  }

  // 노면 판(조각/모서리/발판) → 정점. 높이 떠 있는 판은 바닥까지 기둥을 세운다. 반환: 이 청크의 xz 경계
  roadGeometry(B, s0, s1) {
    let bx = null;
    const grow = (x, z) => { if (!bx) bx = [x, x, z, z]; else { bx[0] = Math.min(bx[0], x); bx[1] = Math.max(bx[1], x); bx[2] = Math.min(bx[2], z); bx[3] = Math.max(bx[3], z); } };
    const floor = this.map.floorY;
    // 곡선 판은 짧은 직선 판(약 2.5m)들로 쪼개서 그린다
    const list = [];
    for (const sl of this.track.slabs) {
      if (!sl.arc) { list.push(sl); continue; }
      if (sl.s0 + sl.L < s0 || sl.s0 >= s1) continue;
      const n = Math.max(2, Math.ceil(sl.L / 2.5)), seg = sl.L / n, every = Math.max(1, Math.round(20 / seg));
      for (let j = 0; j < n; j++) {
        const q = arcAt(sl, (j + 0.5) * seg), ya = sl.y0 + (sl.y1 - sl.y0) * (j / n), yb = sl.y0 + (sl.y1 - sl.y0) * ((j + 1) / n);
        // 바깥쪽 가장자리 틈이 생기지 않게 바깥 반지름 기준으로 살짝 길게
        const ext = seg * (1 + sl.w / sl.R) / 2 + 0.03;
        list.push({ x0: q.x, z0: q.z, fx: Math.sin(q.h), fz: -Math.cos(q.h), rx: Math.cos(q.h), rz: Math.sin(q.h), a0: -ext, a1: ext, w: sl.w, y0: ya, y1: yb, surf: sl.surf, piece: sl.piece, s0: sl.s0 + j * seg, arcSeg: true, pillar: j % every === Math.floor(every / 2) });
      }
    }
    for (const sl of list) {
      const sa = sl.s0 + (sl.corner || sl.piece < 0 || sl.arcSeg ? 0 : sl.a0), sb = sl.s0 + (sl.corner || sl.piece < 0 || sl.arcSeg ? 0.01 : sl.a1);
      if (sb < s0 || sa >= s1) continue;
      const st = SURF[sl.surf] || SURF.road;
      const P = (a, l, dy = 0) => [sl.x0 + a * sl.fx + l * sl.rx, sl.y0 + (sl.y1 - sl.y0) * ((a - sl.a0) / ((sl.a1 - sl.a0) || 1)) + dy, sl.z0 + a * sl.fz + l * sl.rz];
      const up = [0, 1, 0], w = sl.w, a0 = sl.a0, a1 = sl.a1, len = a1 - a0;
      for (const [a, l] of [[a0, -w], [a0, w], [a1, -w], [a1, w]]) { const p = P(a, l); grow(p[0], p[2]); }
      // 윗면
      const quad = (mb, col, uvf) => mb.quadOut(P(a0, -w), P(a0, w), P(a1, w), P(a1, -w), up, col, uvf);
      if (st.mat === 'road' && w >= 6 && !sl.corner && !sl.arcSeg) quad(B.road, WHITE, (p) => { const l = (p[0] - sl.x0) * sl.rx + (p[2] - sl.z0) * sl.rz, a = (p[0] - sl.x0) * sl.fx + (p[2] - sl.z0) * sl.fz; return [(l / w) * 0.5 * (w / 12) + 0.5, a / 12]; });
      else if (st.mat === 'road') quad(B.prop, hex(0x2c2f36));
      else if (st.mat === 'side') quad(B.side, st.tint || WHITE, (p) => [(p[0] + p[2] * 0.0001) / 4, p[2] / 4]);
      else if (st.metal) quad(B.metal, st.metal);
      else if (st.glass) quad(B.glass, st.glass);
      else quad(B.prop, st.col || hex(0x6b6e75));
      // 옆면/아랫면 (두께 0.8)
      const th = st.metal || st.glass ? 0.35 : 0.8;
      for (const sd of [-1, 1]) B.prop.quadOut(P(a0, sd * w), P(a1, sd * w), P(a1, sd * w, -th), P(a0, sd * w, -th), [sd * sl.rx, 0, sd * sl.rz], st.metal ? mulc(st.metal, 0.7) : hex(0x5a5d64));
      if (!sl.arcSeg) for (const a of [a0, a1]) B.prop.quadOut(P(a, -w), P(a, w), P(a, w, -th), P(a, -w, -th), [a === a0 ? -sl.fx : sl.fx, 0, a === a0 ? -sl.fz : sl.fz], hex(0x4a4d54));
      B.prop.quadOut(P(a0, -w, -th), P(a0, w, -th), P(a1, w, -th), P(a1, -w, -th), [0, -1, 0], hex(0x33363c));
      // 가장자리 표시 / 노면 무늬
      for (const sd of [-1, 1]) B.glow.quadOut(P(a0, sd * (w - 0.08), 0.02), P(a1, sd * (w - 0.08), 0.02), P(a1, sd * (w - 0.3), 0.02), P(a0, sd * (w - 0.3), 0.02), up, st.metal ? [1.4, 1.0, 0.3] : [0.9, 0.9, 0.95]);
      if (st.planks || st.rails) for (let a = a0 + 0.6; a < a1; a += st.rails ? 1.4 : 0.9) B.prop.quadOut(P(a - 0.12, -w, 0.01), P(a - 0.12, w, 0.01), P(a + 0.12, w, 0.01), P(a + 0.12, -w, 0.01), up, st.rails ? hex(0x2a2018) : mulc(st.col, 0.75));
      if (st.rails) for (const l of [-w * 0.55, w * 0.55]) B.metal.quadOut(P(a0, l - 0.1, 0.12), P(a1, l - 0.1, 0.12), P(a1, l + 0.1, 0.12), P(a0, l + 0.1, 0.12), up, st.metal || hex(0x9aa3ae));
      if (st.truss) for (let a = a0 + 1; a < a1; a += 3) for (const sd of [-1, 1]) { const p0 = P(a, sd * w, -th), p1 = P(a + 1.5, sd * w, -2.2), p2 = P(a + 3, sd * w, -th); B.metal.beam(p0, p1, 0.12, 0.12, st.metal); B.metal.beam(p1, p2, 0.12, 0.12, st.metal); }
      if (st.pipe) for (let a = a0; a < a1 - 0.5; a += 2) { const k = [0, 0.6, 0.85, 0.6, 0]; for (let i = 0; i < 4; i++) { const l0 = -w + i * w / 2, l1 = l0 + w / 2; B.metal.quadOut(P(a, l0, -k[i] * 1.6 - th), P(a + 2, l0, -k[i] * 1.6 - th), P(a + 2, l1, -k[i + 1] * 1.6 - th), P(a, l1, -k[i + 1] * 1.6 - th), [0, -1, 0], mulc(st.metal, 0.8)); } }
      // 떠 있는 판: 바닥까지 기둥
      const cy = Math.min(sl.y0, sl.y1);
      if (cy - floor > 3 && !sl.corner && (!sl.arcSeg || sl.pillar)) {
        const step = st.metal ? 14 : 22;
        for (let a = sl.arcSeg ? 0 : a0 + Math.min(6, len / 2); a < a1; a += step) {
          const p = P(a, 0, -th), hgt = p[1] - floor;
          if (w >= 5) for (const sd of [-0.6, 0.6]) { const q = P(a, sd * w, -th); B.prop.box(q[0], floor + (q[1] - floor) / 2, q[2], 0.6, (q[1] - floor) / 2, 0.6, hex(0x6a6d74), { bevel: 0.08 }); }
          else B.metal.box(p[0], floor + hgt / 2, p[2], 0.35, hgt / 2, 0.35, st.metal ? mulc(st.metal, 0.75) : hex(0x6a6d74));
        }
      }
    }
    return bx;
  }

  dispose() {
    for (const ci of [...this.chunks.keys()]) this.unload(ci);
    this.scene.remove(this.group);
    if (this.floorMats) for (const m of Object.values(this.floorMats)) m.dispose();
  }
}
