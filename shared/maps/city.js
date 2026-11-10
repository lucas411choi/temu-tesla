// 도시 맵 정의: 10개 구간, 약 9,000m. 맵 데이터(여기)와 엔진 코드는 분리되어 있어 다른 맵을 추가하려면
// 같은 형태의 객체를 반환하는 파일을 만들고 shared/mapData.js 에 등록하면 된다.
import { MapBuilder } from './lib.js';
import { sec1, sec2, sec3, sec4 } from './secA.js';
import { sec5, sec6, sec7 } from './secB.js';
import { sec8, sec9, sec10 } from './secC.js';
import fuelTable from './city.fuel.js';

export const CITY_LENGTH = 9000;

// 구간 정의: 이름, 시작s, 끝s, 체크포인트 오프셋, 중간 충전구역 오프셋, 지면 속성, 테마(style: 풍경/조명, wall: 장벽 모양, under: 도로 아래 지면 높이)
const SECTIONS = [
  { name: '튜토리얼 골목', s0: 0, s1: 600, tut: true, style: 'alley', fn: sec1 },
  { name: '도심 대로', style: 'city', s0: 600, s1: 1500, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: sec2 },
  { name: '공사장', style: 'site', wall: 'concrete', s0: 1500, s1: 2400, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: sec3 },
  { name: '고가도로', style: 'highway', under: -16, s0: 2400, s1: 3300, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], ground: { half: 13.3, wall: Infinity }, fn: sec4 },
  { name: '네온 골목 시장', style: 'neon', s0: 3300, s1: 4200, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: sec5 },
  { name: '공업/가스 지구', style: 'industrial', wall: 'pipe', s0: 4200, s1: 5100, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], fn: sec6 },
  { name: '강 위의 현수교', style: 'bridge', water: -12, s0: 5100, s1: 6100, cps: [20, 270, 520, 770], mids: [150, 400, 650, 900], ground: { half: 13.0, wall: Infinity }, fn: sec7 },
  { name: '지하 터널', style: 'tunnel', s0: 6100, s1: 7000, cps: [20, 250, 480, 710], mids: [140, 370, 600, 820], ground: { half: 13.8, wall: 13.8 }, fn: sec8 },
  { name: '마천루 협곡', style: 'canyon', s0: 7000, s1: 8000, cps: [20, 270, 520, 770], mids: [150, 400, 650, 900], fn: sec9 },
  { name: '새벽 해안 피날레', style: 'dawn', s0: 8000, s1: 9000, cps: [20, 270, 520, 770], mids: [150, 400, 650, 900], fn: sec10 },
];

// 시간대/날씨 키프레임 (황혼 → 밤 → 새벽). 클라이언트가 s에 따라 보간한다.
export const ENV_KEYS = [
  { s: 0,    top: 0x24366b, hor: 0xe8895a, fog: 0x6a5a6e, fogD: 0.0042, sun: 0xffb27a, sunI: 1.35, hemi: 0x8aa0d8, hemiG: 0x3a3040, hemiI: 0.95, lamp: 0.5, win: 0.35, exp: 1.0, rain: 0, bloom: 0.55 },
  { s: 1500, top: 0x151d45, hor: 0xb25a6a, fog: 0x2e2a48, fogD: 0.0050, sun: 0x9a8cff, sunI: 0.9, hemi: 0x6070b8, hemiG: 0x20203a, hemiI: 0.8, lamp: 0.8, win: 0.6, exp: 1.0, rain: 0, bloom: 0.6 },
  { s: 2400, top: 0x070b1f, hor: 0x1b2552, fog: 0x0e1230, fogD: 0.0046, sun: 0x7f9bff, sunI: 0.75, hemi: 0x4a5ca8, hemiG: 0x151a30, hemiI: 0.75, lamp: 1.0, win: 0.85, exp: 1.0, rain: 0, bloom: 0.65 },
  { s: 3600, top: 0x0a0618, hor: 0x3a1450, fog: 0x14082a, fogD: 0.0062, sun: 0xc060ff, sunI: 0.7, hemi: 0x5a3c9a, hemiG: 0x1a1030, hemiI: 0.75, lamp: 1.0, win: 1.0, exp: 1.0, rain: 0.35, bloom: 0.85 },
  { s: 4200, top: 0x1a0d10, hor: 0x5a2a1a, fog: 0x2a1812, fogD: 0.0075, sun: 0xff8a50, sunI: 0.75, hemi: 0x8a5a48, hemiG: 0x2a1810, hemiI: 0.8, lamp: 1.0, win: 0.7, exp: 1.0, rain: 0, bloom: 0.8 },
  { s: 5100, top: 0x05102a, hor: 0x1a3a66, fog: 0x0c1c38, fogD: 0.0040, sun: 0x8ab4ff, sunI: 0.85, hemi: 0x5078b8, hemiG: 0x142030, hemiI: 0.8, lamp: 1.0, win: 0.8, exp: 1.0, rain: 0.2, bloom: 0.65 },
  { s: 6100, top: 0x0a0e18, hor: 0x1a2030, fog: 0x10141e, fogD: 0.0095, sun: 0x8090a8, sunI: 0.5, hemi: 0x6a7890, hemiG: 0x181c28, hemiI: 0.9, lamp: 1.0, win: 0.6, exp: 1.05, rain: 0, bloom: 0.7 },
  { s: 7000, top: 0x0c1030, hor: 0x2a3466, fog: 0x161c3c, fogD: 0.0050, sun: 0xa0b4ff, sunI: 0.9, hemi: 0x6070c0, hemiG: 0x1c2038, hemiI: 0.85, lamp: 0.9, win: 0.8, exp: 1.0, rain: 0, bloom: 0.65 },
  { s: 7800, top: 0x2a3a78, hor: 0xe09a78, fog: 0x4a4468, fogD: 0.0045, sun: 0xffc08a, sunI: 1.3, hemi: 0x9ab0e0, hemiG: 0x4a4050, hemiI: 1.0, lamp: 0.55, win: 0.5, exp: 1.0, rain: 0, bloom: 0.6 },
  { s: 9000, top: 0x4a6aa8, hor: 0xffcf9a, fog: 0x8a8098, fogD: 0.0040, sun: 0xffd9a8, sunI: 1.6, hemi: 0xb8cdf0, hemiG: 0x6a5a58, hemiI: 1.1, lamp: 0.25, win: 0.3, exp: 1.05, rain: 0, bloom: 0.5 },
];

// 구간 정의 배열 → 맵 객체 (도시/놀이공원 공용 조립기)
export function assembleMap({ id, name, seed, length, sections, env, fuel, start = 14, extra }) {
  const B = new MapBuilder(seed);
  // 1) 구간 등록 + 체크포인트/충전구역 배치
  sections.forEach((S, i) => {
    B.cur = i + 1;
    B.begin(i + 1, S.name, S.s0, S.s1, { style: S.style, wall: S.wall, under: S.under, water: S.water, gap: S.gap, step: S.step }, S.ground || {});
    if (!S.tut) {
      S.cps.forEach((o) => B.checkpoint(S.s0 + o));
      S.mids.forEach((o) => B.pad(S.s0 + o, S.s0 + o + 34));
    }
  });
  // 튜토리얼(첫 구간)의 충전구역/체크포인트는 그 구간 함수가 직접 등록하므로 먼저 실행
  if (sections[0].tut) { B.cur = 1; sections[0].fn(B); }
  // 2) 각 구간의 장애물 배치 가능 블록 계산 (충전구역 사이의 빈 구간)
  const zones = B.zones.map((z) => [z.s0, z.s1]).sort((a, b) => a[0] - b[0]);
  sections.forEach((S, i) => {
    if (S.tut) return;
    B.cur = i + 1;
    const bk = [];
    let cursor = S.s0;
    for (const [a, b] of zones) {
      if (b <= S.s0) continue;
      if (a >= S.s1) break;
      if (a - cursor >= 30) bk.push([cursor, a]);
      cursor = Math.max(cursor, b);
    }
    if (S.s1 - cursor >= 30) bk.push([cursor, S.s1]);
    S.blocks = bk;
    S.fn(B, bk);
  });
  // 3) 도착 게이트
  B.cur = sections.length;
  B.add('finish', { s: length - 15, style: extra && extra.finishStyle });
  // 검증 도구가 기록한 비행 구간별 필요 연료량을 데이터에 합친다
  for (const f of B.flights) { const t = fuel[f.id]; if (t) { f.fuelNeed = t.fuel; f.simTime = t.time; f.fuelPlan = +(t.fuel * 1.3).toFixed(1); } }
  // 체크포인트를 진행 거리 순으로 정렬하고 번호를 다시 매긴다
  const order = B.checkpoints.map((c, i) => ({ c, i })).sort((a, b) => a.c.s - b.c.s);
  const remap = {};
  order.forEach((o, k) => { remap[o.c.id] = k; o.c.id = k; });
  B.checkpoints = order.map((o) => o.c);
  for (const d of B.decor) { if (d.t === 'cp') d.id = remap[d.id]; if (d.t === 'pad' && d.cp !== undefined) d.cp = remap[d.cp]; }
  const ground = B.finalizeGround(length);
  return {
    id, name, length, start: { s: start, x: 0 }, finish: { s: length - 15 },
    sections: B.sections.map((s) => ({ ...s })), checkpoints: B.checkpoints, pads: B.pads,
    ground, statics: B.statics, dynamics: B.dynamics, decor: B.decor, flights: B.flights, hints: B.hints, ceils: B.ceils,
    env, warnings: B.warnings, blocks: sections.map((s) => s.blocks || null), minTime: extra && extra.minTime,
  };
}

export function buildCity() {
  return assembleMap({ id: 'city', name: '도시', seed: 20261105, length: CITY_LENGTH, sections: SECTIONS, env: ENV_KEYS, fuel: fuelTable, extra: { minTime: 15 * 60 } });
}
