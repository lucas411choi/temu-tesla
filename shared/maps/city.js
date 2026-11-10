// 도시 맵: 10개 구간의 구불구불한 경로. 맵 데이터(여기)와 엔진 코드는 분리되어 있어 다른 맵을 추가하려면
// 같은 형태의 객체를 반환하는 파일을 만들고 shared/mapData.js 에 등록하면 된다.
import { MapBuilder, straightGround } from './lib.js';
import { c1, c2, c3, c4, c5, c6, c7, c8, c9, c10 } from './cityRoute.js';
import fuelTable from './city.fuel.js';

// 구간: 이름, 테마(style: 풍경/조명, wall: 장벽 모양, floor: 바닥(낭떠러지 아래) 모습, gap: 틈 모양)
const SECTIONS = [
  { name: '튜토리얼 골목', style: 'alley', floor: 'asphalt', fn: c1 },
  { name: '도심 대로', style: 'city', floor: 'asphalt', fn: c2 },
  { name: '공사장', style: 'site', wall: 'concrete', floor: 'dirt', gap: 'site', fn: c3 },
  { name: '고가도로', style: 'highway', floor: 'city', fn: c4 },
  { name: '네온 골목 시장', style: 'neon', floor: 'asphalt', fn: c5 },
  { name: '공업/가스 지구', style: 'industrial', wall: 'pipe', floor: 'dirt', fn: c6 },
  { name: '강 위의 현수교', style: 'bridge', floor: 'water', fn: c7 },
  { name: '지하 터널', style: 'tunnel', floor: 'rock', fn: c8 },
  { name: '마천루 협곡', style: 'canyon', floor: 'asphalt', fn: c9 },
  { name: '새벽 해안 피날레', style: 'dawn', floor: 'water', gap: 'pier', fn: c10 },
];

// 시간대/날씨 키프레임 (황혼 → 밤 → 새벽). at = 맵 전체 길이 대비 위치(0~1)
export const ENV_KEYS = [
  { at: 0,    top: 0x24366b, hor: 0xe8895a, fog: 0x6a5a6e, fogD: 0.0042, sun: 0xffb27a, sunI: 1.35, hemi: 0x8aa0d8, hemiG: 0x3a3040, hemiI: 0.95, lamp: 0.5, win: 0.35, exp: 1.0, rain: 0, bloom: 0.55 },
  { at: 0.16, top: 0x151d45, hor: 0xb25a6a, fog: 0x2e2a48, fogD: 0.0050, sun: 0x9a8cff, sunI: 0.9, hemi: 0x6070b8, hemiG: 0x20203a, hemiI: 0.8, lamp: 0.8, win: 0.6, exp: 1.0, rain: 0, bloom: 0.6 },
  { at: 0.27, top: 0x070b1f, hor: 0x1b2552, fog: 0x0e1230, fogD: 0.0046, sun: 0x7f9bff, sunI: 0.75, hemi: 0x4a5ca8, hemiG: 0x151a30, hemiI: 0.75, lamp: 1.0, win: 0.85, exp: 1.0, rain: 0, bloom: 0.65 },
  { at: 0.42, top: 0x0a0618, hor: 0x3a1450, fog: 0x14082a, fogD: 0.0062, sun: 0xc060ff, sunI: 0.7, hemi: 0x5a3c9a, hemiG: 0x1a1030, hemiI: 0.75, lamp: 1.0, win: 1.0, exp: 1.0, rain: 0.35, bloom: 0.85 },
  { at: 0.5,  top: 0x1a0d10, hor: 0x5a2a1a, fog: 0x2a1812, fogD: 0.0075, sun: 0xff8a50, sunI: 0.75, hemi: 0x8a5a48, hemiG: 0x2a1810, hemiI: 0.8, lamp: 1.0, win: 0.7, exp: 1.0, rain: 0, bloom: 0.8 },
  { at: 0.6,  top: 0x05102a, hor: 0x1a3a66, fog: 0x0c1c38, fogD: 0.0040, sun: 0x8ab4ff, sunI: 0.85, hemi: 0x5078b8, hemiG: 0x142030, hemiI: 0.8, lamp: 1.0, win: 0.8, exp: 1.0, rain: 0.2, bloom: 0.65 },
  { at: 0.7,  top: 0x0a0e18, hor: 0x1a2030, fog: 0x10141e, fogD: 0.0095, sun: 0x8090a8, sunI: 0.5, hemi: 0x6a7890, hemiG: 0x181c28, hemiI: 0.9, lamp: 1.0, win: 0.6, exp: 1.05, rain: 0, bloom: 0.7 },
  { at: 0.8,  top: 0x0c1030, hor: 0x2a3466, fog: 0x161c3c, fogD: 0.0050, sun: 0xa0b4ff, sunI: 0.9, hemi: 0x6070c0, hemiG: 0x1c2038, hemiI: 0.85, lamp: 0.9, win: 0.8, exp: 1.0, rain: 0, bloom: 0.65 },
  { at: 0.88, top: 0x2a3a78, hor: 0xe09a78, fog: 0x4a4468, fogD: 0.0045, sun: 0xffc08a, sunI: 1.3, hemi: 0x9ab0e0, hemiG: 0x4a4050, hemiI: 1.0, lamp: 0.55, win: 0.5, exp: 1.0, rain: 0, bloom: 0.6 },
  { at: 1,    top: 0x4a6aa8, hor: 0xffcf9a, fog: 0x8a8098, fogD: 0.0040, sun: 0xffd9a8, sunI: 1.6, hemi: 0xb8cdf0, hemiG: 0x6a5a58, hemiI: 1.1, lamp: 0.25, win: 0.3, exp: 1.05, rain: 0, bloom: 0.5 },
];

// 구간 정의 배열 → 맵 객체 (도시/놀이공원 공용 조립기)
export function assembleMap({ id, name, seed, sections, env, fuel, floorY = -24, extra = {} }) {
  const B = new MapBuilder(seed);
  B.floorY = floorY;
  sections.forEach((S, i) => {
    B.begin(i + 1, S.name, { style: S.style, wall: S.wall, floor: S.floor, gap: S.gap, step: S.step });
    S.fn(B);
    B.end();
  });
  const length = B.s;
  B.cur = sections.length;
  B.add('finish', { s: length - 15, w: B.wAt(length - 15), style: extra.finishStyle });
  const { track, statics, localStatics } = B.finalize();
  // 검증 도구가 기록한 비행 구간별 필요 연료량을 데이터에 합친다
  for (const f of B.flights) { const t = fuel[f.id]; if (t) { f.fuelNeed = t.fuel; f.simTime = t.time; f.fuelPlan = +(t.fuel * 1.3).toFixed(1); } }
  // 체크포인트를 진행 거리 순으로 정렬하고 번호를 다시 매긴다
  const order = B.checkpoints.map((c, i) => ({ c, i })).sort((a, b) => a.c.s - b.c.s);
  const remap = {};
  order.forEach((o, k) => { remap[o.c.id] = k; o.c.id = k; });
  for (const d of B.decor) { if (d.t === 'cp') d.id = remap[d.id]; if (d.t === 'pad' && d.cp !== undefined) d.cp = remap[d.cp]; }
  return {
    id, name, length, start: { s: 14, x: 0 }, finish: { s: length - 15 },
    sections: B.sections.map((s) => ({ ...s })), checkpoints: order.map((o) => o.c), pads: B.pads,
    route: B.route, platforms: track.slabs.filter((sl) => sl.piece === -1), floorY,
    ground: straightGround(B.route), statics, localStatics, dynamics: B.dynamics, decor: B.decor, flights: B.flights, hints: B.hints, ceils: B.ceils,
    env: env.map((k) => ({ ...k, s: k.at * length })), warnings: B.warnings, minTime: extra.minTime,
  };
}

export function buildCity() {
  return assembleMap({ id: 'city', name: '도시', seed: 20261110, sections: SECTIONS, env: ENV_KEYS, fuel: fuelTable });
}
