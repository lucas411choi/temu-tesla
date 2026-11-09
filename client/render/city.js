// 도시 뷰: 맵 decor + 지면을 약 300m 청크로 나눠 필요한 구간만 만들고(로드) 지나간 구간은 해제(언로드)한다.
import { newBuilders, EMIT, decorS } from './props.js';
import { hex } from './mesh.js';

export const CHUNK = 300;
const WHITE = [1, 1, 1];

export class CityView {
  constructor(THREE, scene, map, mats, tex) {
    this.THREE = THREE; this.scene = scene; this.map = map; this.mats = mats; this.tex = tex;
    this.chunks = new Map(); this.byChunk = new Map();
    this.maxChunk = Math.floor(map.length / CHUNK);
    for (const d of map.decor) {
      const ci = Math.max(0, Math.floor(decorS(d) / CHUNK));
      if (!this.byChunk.has(ci)) this.byChunk.set(ci, []);
      this.byChunk.get(ci).push(d);
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

  load(ci) {
    const THREE = this.THREE, mats = this.mats, B = newBuilders();
    const ctx = { lamps: [], signs: [], sparks: [], fires: [], beacons: [] };
    const s0 = ci * CHUNK, s1 = s0 + CHUNK;
    this.roadGeometry(B, s0, s1);
    for (const d of this.byChunk.get(ci) || []) { const f = EMIT[d.t]; if (f) f(B, d, ctx); }
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
    mk(B.road, mats.road, false); mk(B.side, mats.side, false);
    mk(B.prop, mats.prop, true); mk(B.metal, mats.metal, true); mk(B.glass, mats.glass, false);
    mk(B.glow, mats.glow, false, false); mk(B.stripe, mats.stripe, true);
    B.bldg.forEach((b, i) => mk(b, mats.bldg[i], false));
    // 간판(글자 텍스처)
    const signMats = [];
    for (const sg of ctx.signs) {
      const t = this.tex.sign(sg.text, { fg: sg.color || '#39ff88', hue: sg.hue, w: 512, h: Math.round(512 * sg.h / sg.w) });
      const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide });
      const g = new THREE.PlaneGeometry(sg.w, sg.h), mesh = new THREE.Mesh(g, m);
      mesh.position.set(sg.x, sg.y, sg.z); mesh.rotation.y = sg.ry || 0; group.add(mesh); geoms.push(g); signMats.push(m);
    }
    // 강 위의 다리: 수면
    const sec = this.map.sections.find((q) => q.theme && q.theme.style === 'bridge');
    if (sec && s1 > sec.s0 && s0 < sec.s1) {
      const a = Math.max(s0, sec.s0), b = Math.min(s1, sec.s1);
      const g = new THREE.PlaneGeometry(400, b - a); g.rotateX(-Math.PI / 2);
      const w = new THREE.Mesh(g, mats.water); w.position.set(0, -12, -(a + b) / 2); group.add(w); geoms.push(g);
    }
    this.group.add(group);
    this.chunks.set(ci, { group, geoms, signMats, lamps: ctx.lamps, sparks: ctx.sparks, fires: ctx.fires, beacons: ctx.beacons });
    this.dirty = true;
  }

  unload(ci) {
    const ch = this.chunks.get(ci);
    if (!ch) return;
    this.group.remove(ch.group);
    for (const g of ch.geoms) g.dispose();
    for (const m of ch.signMats) m.dispose();
    this.chunks.delete(ci);
    this.dirty = true;
  }

  // 지면 세그먼트 → 도로/인도/상판 정점
  roadGeometry(B, s0, s1) {
    for (const g of this.map.ground) {
      const a = Math.max(g.s0, s0), b = Math.min(g.s1, s1);
      if (b <= a || !g.solid) continue;
      const y = g.y, zc = -(a + b) / 2, hz = (b - a) / 2;
      B.road.quadOut([-12, y, -a], [12, y, -a], [12, y, -b], [-12, y, -b], [0, 1, 0], WHITE, (p) => [(p[0] + 12) / 24, -p[2] / 12]);
      if (g.half > 12.5) {
        for (const sd of [-1, 1]) {
          const w = (g.half - 12) / 2;
          B.side.box(sd * (12 + w), y + 0.06, zc, w, 0.06, hz, WHITE, { uv: [4, 4] });
        }
      }
      if (g.half < 16 || y > 0.5) B.prop.box(0, y - 0.7, zc, g.half, 0.7, hz, hex(0x6b6e75), { bevel: 0.1 });
    }
  }

  dispose() {
    for (const ci of [...this.chunks.keys()]) this.unload(ci);
    this.scene.remove(this.group);
  }
}
