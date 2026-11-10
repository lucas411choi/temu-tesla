// 맵 검증 스크립트:  node tools/validate-map.js [--fast] [--no-write]
//  1) 맵 빌드 경고(충전구역 침범 등)  2) 정적 장애물 통과 가능성  3) 동적 장애물 지상/공중 통과 가능성
//  4) 비행 구간별 필요 연료 (서버와 같은 물리로 자동조종 시뮬레이션, 1.3배 안전 여유)  5) 연속 비행/충전 발판
//  6) 만땅 한 번의 최대 상승 고도·체공 거리  7) 최단 완주 시간 추정(15분 이상)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../shared/config.js';
import { getMap } from '../shared/mapData.js';
import { createStraightWorld } from '../shared/world.js';
import { createCar, stepCar, carOBBs } from '../shared/physics.js';
import { CarSim } from '../shared/sim.js';
import { MapBuilder, straightGround } from '../shared/maps/lib.js';
import { bestFlight } from './autopilot.js';

const FAST = process.argv.includes('--fast');
const NOWRITE = process.argv.includes('--no-write');
const MAP_ID = (process.argv.find((a) => a.startsWith('--map=')) || '--map=city').slice(6);
const SAFETY = 1.3;                 // 안전 여유 (필요 연료 × 1.3 ≤ 100%)
const errors = [], warns = [];
const err = (m) => { errors.push(m); console.log('  ✗', m); };
const warn = (m) => { warns.push(m); console.log('  △', m); };
const ok = (m) => console.log('  ✓', m);
const head = (t) => console.log(`\n━━ ${t}`);

const map = getMap(MAP_ID);
const MIN_TIME = map.minTime || 0;  // 최단 완주 시간 기준(초)
const here = path.dirname(fileURLToPath(import.meta.url));

// ───────────────── 0) 요약 ─────────────────
head('0) 맵 요약');
const typeCount = {};
for (const e of map.dynamics) typeCount[e.type] = (typeCount[e.type] || 0) + 1;
const tagCount = {};
for (const s of map.statics) tagCount[s.tag] = (tagCount[s.tag] || 0) + 1;
console.log(`  이름 ${map.name} | 길이 ${map.length}m | 구간 ${map.sections.length}개 | 체크포인트 ${map.checkpoints.length}개 | 충전구역 ${map.pads.length}개 | 비행구간 ${map.flights.length}개`);
console.log(`  정적 충돌체 ${map.statics.length} | 동적 장애물 ${map.dynamics.length} | 장식 ${map.decor.length}`);
console.log('  동적 종류:', Object.entries(typeCount).map(([k, v]) => `${k}×${v}`).join(' '));
console.log('  정적 태그:', Object.entries(tagCount).map(([k, v]) => `${k}×${v}`).join(' '));
for (const sec of map.sections) {
  const cps = map.checkpoints.filter((c) => c.sec === sec.idx).length;
  const fl = map.flights.filter((f) => f.sec === sec.idx).length;
  const dy = map.dynamics.filter((e) => e.sec === sec.idx).length;
  const pads = map.pads.filter((p) => p.sec === sec.idx).length;
  console.log(`  구간${String(sec.idx).padStart(2)} ${sec.name.padEnd(8)} s=${sec.s0}~${sec.s1}  체크포인트 ${cps}  충전구역 ${pads}  비행 ${fl}  동적 ${dy}`);
  if (cps < 3 || cps > 5) err(`구간${sec.idx}의 체크포인트 수가 3~5개가 아님 (${cps})`);
}
const kinds = new Set(Object.keys(typeCount)); ['wall', 'spike', 'car', 'wire', 'ceiling', 'laser', 'pipe'].forEach((t) => tagCount[t] && kinds.add(t));
console.log(`  장애물 종류 수(동적 ${Object.keys(typeCount).length} + 정적 ${Object.keys(tagCount).length})`);

// ───────────────── 1) 빌드 경고 ─────────────────
head('1) 맵 빌드 검사 (충전 구역 침범 등)');
if (map.warnings.length) map.warnings.forEach((w) => err(w)); else ok('충전구역/체크포인트 근처에 장애물 없음');
// 체크포인트 간격
const cpS = map.checkpoints.map((c) => c.s);
for (let i = 1; i < cpS.length; i++) if (cpS[i] - cpS[i - 1] > 320) warn(`체크포인트 간격이 넓음: ${cpS[i - 1]} → ${cpS[i]}`);

// ───────────────── 2) 정적 통과 가능성 ─────────────────
head('2) 정적 장애물 통과 가능성 (모든 s에서 2.3m×1.3m 이상 빈 단면이 있는가)');
{
  const items = [];
  for (const s of map.localStatics) {
    if (s.tag === 'ledge') continue;
    if (s.k === 's') items.push({ x0: s.c[0] - s.r, x1: s.c[0] + s.r, y0: s.c[1] - s.r, y1: s.c[1] + s.r, s0: -s.c[2] - s.r, s1: -s.c[2] + s.r });
    else {
      const R = s.R, h = s.h, ex = Math.abs(R[0]) * h[0] + Math.abs(R[1]) * h[1] + Math.abs(R[2]) * h[2];
      const ey = Math.abs(R[3]) * h[0] + Math.abs(R[4]) * h[1] + Math.abs(R[5]) * h[2], ez = Math.abs(R[6]) * h[0] + Math.abs(R[7]) * h[1] + Math.abs(R[8]) * h[2];
      items.push({ x0: s.c[0] - ex, x1: s.c[0] + ex, y0: s.c[1] - ey, y1: s.c[1] + ey, s0: -s.c[2] - ez, s1: -s.c[2] + ez });
    }
  }
  items.sort((a, b) => a.s0 - b.s0);
  const CW = 1.15, CH = 0.65;
  let checked = 0, bad = 0, worstRun = 0;
  const badRanges = [];
  for (let s = 0; s <= map.length; s += 0.5) {
    const near = items.filter((it) => it.s0 <= s && it.s1 >= s);
    if (!near.length) continue;
    checked++;
    const g = map.ground.find((q) => s >= q.s0 && s < q.s1) || map.ground[map.ground.length - 1];
    const lim = Math.max(0, g.half - CW - 0.1);
    let free = false;
    for (let x = -lim; x <= lim + 1e-6 && !free; x += 0.25) {
      const gy = g.y1 !== undefined ? g.y + (g.y1 - g.y) * (s - g.s0) / (g.s1 - g.s0) : g.y;
      const yBase = gy + 0.55;
      for (let y = yBase; y <= yBase + 40 && !free; y += 0.5) {
        let hit = false;
        for (const it of near) if (x + CW > it.x0 && x - CW < it.x1 && y + CH > it.y0 && y - CH < it.y1) { hit = true; break; }
        if (!hit) free = true;
      }
    }
    if (!free) { bad++; badRanges.push(s); }
  }
  if (bad) { err(`통과할 틈이 없는 위치 ${bad}곳 (예: s=${badRanges.slice(0, 5).join(', ')})`); } else ok(`정적 장애물 단면 ${checked}곳 모두 통과 가능한 틈 존재`);
}

// ───────────────── 3) 동적 장애물 통과 가능성 ─────────────────
head('3) 동적 장애물 통과 가능성 (지상 직선 주행/고정 고도 비행 프로브, 장애물 단독)');
{
  const probeSpeed = 7, dt = 1 / 20;
  const period = (e) => Math.max(e.P || 0, e.per || 0, e.blink ? e.blink.P : 0, e.type === 'laser' && e.mode === 'scan' ? (2 * Math.PI) / Math.abs(e.w) : 0, 8);
  const typeStat = {};
  const altsA = [2.6, 4, 6, 8, 11, 15, 20, 28];
  let flagged = 0;
  const t0 = Date.now();
  for (const e of map.dynamics) {
    const w = createStraightWorld({ statics: [], dynamics: [e], ground: [{ s0: -1000, s1: 1e6, y: 0, solid: true, half: 40, wall: Infinity }] });
    const sa = -e.zr[1] - 30, sb = -e.zr[0] + 30, P = period(e);
    const gHalf = (map.ground.find((q) => -(e.zr[0] + e.zr[1]) / 2 >= q.s0 && -(e.zr[0] + e.zr[1]) / 2 < q.s1) || { half: 8 }).half;
    const lanesG = [...Array(8)].map((_, i) => -gHalf + 1.05 + (i * (2 * gHalf - 2.1)) / 7), lanesA = [-gHalf + 1.2, 0, gHalf - 1.2];
    const run = (x, y, tau0) => {
      const sim = new CarSim(w);
      sim.car.p = [x, y, -sa]; sim.car.q = [0, 0, 0, 1];
      for (let T = tau0, s = sa; s < sb; T += dt, s += probeSpeed * dt) {
        sim.car.p[2] = -s; sim.car.p[0] = x; sim.car.p[1] = y;
        const hit = w.collide(carOBBs(sim.car), sim.car.p, T);
        if (hit) return false;
      }
      return true;
    };
    let g = 0, gTot = 0, a = 0, aTot = 0;
    const step = Math.max(0.4, P / 16);
    for (const x of lanesG) for (let tau = 0; tau < P; tau += step) { gTot++; if (run(x, 0.48, tau)) g++; }
    if (g === 0) for (const y of altsA) for (const x of lanesA) for (let tau = 0; tau < P; tau += step * 1.5) { aTot++; if (run(x, y, tau)) a++; }
    const st = (typeStat[e.type] = typeStat[e.type] || { n: 0, minG: 1, air: 0, none: 0 });
    st.n++; st.minG = Math.min(st.minG, g / gTot);
    if (g === 0 && a > 0) st.air++;
    if (g === 0 && a === 0) { st.none++; flagged++; err(`${e.type}#${e.id} (구간${e.sec}, s≈${(-(e.zr[0] + e.zr[1]) / 2).toFixed(0)})는 지상/공중 모두 통과 불가`); }
    else if (g / gTot < 0.04 && g > 0) warn(`${e.type}#${e.id} (구간${e.sec}) 지상 통과 기회가 매우 좁음 (${(100 * g / gTot).toFixed(1)}%)`);
  }
  for (const [k, v] of Object.entries(typeStat)) console.log(`  ${k.padEnd(10)} ×${String(v.n).padStart(2)}  지상 통과율 최저 ${(100 * v.minG).toFixed(0)}%  비행 필요 ${v.air}  불가 ${v.none}`);
  if (!flagged) ok(`동적 장애물 ${map.dynamics.length}개 모두 지상 또는 공중으로 통과 가능 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// ───────────────── 4) 비행 구간 연료 ─────────────────
head(`4) 비행 구간 필요 연료 (자동조종 시뮬레이션, 필요 연료 × ${SAFETY} ≤ 100%)`);
const fuelTable = {};
{
  let pass = 0;
  const flights = FAST ? map.flights.slice(0, 6) : map.flights;
  for (const f of flights) {
    const r = bestFlight(map, f);
    if (!r.ok) { err(`${f.name}: 자동조종 통과 실패 (${r.reason})`); continue; }
    const plan = r.fuelUsed * SAFETY;
    fuelTable[f.id] = { fuel: +r.fuelUsed.toFixed(1), time: +r.time.toFixed(1), alt: +r.maxAlt.toFixed(1) };
    f.fuelNeed = r.fuelUsed; f.simTime = r.time;
    const line = `${f.id.padEnd(5)} ${f.name.padEnd(34)} 필요 ${r.fuelUsed.toFixed(1).padStart(5)}%  (×${SAFETY} = ${plan.toFixed(1)}%)  최고 ${r.maxAlt.toFixed(1)}m`;
    if (plan > 100) err(`${f.name}: 연료 부족 ${(plan - 100).toFixed(1)}%p (필요 ${r.fuelUsed.toFixed(1)}% × ${SAFETY} = ${plan.toFixed(1)}% > 100%)`);
    else { pass++; console.log('  ✓', line); }
  }
  console.log(`  → ${pass}/${flights.length} 통과`);
  if (!FAST && !NOWRITE) {
    const out = `// 자동 생성 파일 - tools/validate-map.js 가 갱신합니다. 비행 구간별 필요 연료량(%)\n// fuel=자동조종 시뮬레이션 소모량, time=소요시간(s), alt=최고고도(m)\nexport default ${JSON.stringify(fuelTable, null, 1)};\n`;
    fs.writeFileSync(path.join(here, `../shared/maps/${MAP_ID}.fuel.js`), out);
    console.log(`  → shared/maps/${MAP_ID}.fuel.js 기록`);
  }
}

// ───────────────── 5) 연속 비행 + 충전 발판 ─────────────────
head('5) 연속 비행 구간 사이의 충전 발판');
{
  const fl = [...map.flights].sort((a, b) => a.bands[0].s0 - b.bands[0].s0);
  let issues = 0;
  for (let i = 1; i < fl.length; i++) {
    const a = fl[i - 1], b = fl[i];
    const a1 = Math.max(...a.bands.map((x) => x.s1)), b0 = Math.min(...b.bands.map((x) => x.s0));
    const gap = b0 - a1;
    const padBetween = map.pads.some((p) => p.s1 > a1 && p.s0 < b0);
    if (gap < 90 && !padBetween && a.fuelNeed && b.fuelNeed && (a.fuelNeed + b.fuelNeed) * SAFETY > 100) { issues++; err(`${a.name} → ${b.name}: 간격 ${gap.toFixed(0)}m, 충전 발판 없음, 연료 합 ${(a.fuelNeed + b.fuelNeed).toFixed(0)}%`); }
  }
  if (!issues) ok('연료를 많이 쓰는 연속 비행 사이에는 항상 충전 구역이 있음');
  // 가장 가까운 충전 구역 간격
  let worst = 0, at = 0;
  const pads = [...map.pads].sort((a, b) => a.s0 - b.s0);
  for (let i = 1; i < pads.length; i++) { const d = pads[i].s0 - pads[i - 1].s1; if (d > worst) { worst = d; at = pads[i - 1].s1; } }
  console.log(`  충전 구역 최대 간격 ${worst.toFixed(0)}m (s=${at.toFixed(0)} 부근), 충전 구역 ${pads.length}개`);
}

// ───────────────── 6) 만땅 한 번의 한계 ─────────────────
head('6) 연료 100% 한 번으로 갈 수 있는 한계 (서버 물리 시뮬레이션)');
let vTop = 0;
{
  const w = { groundY: () => 0, refY: () => 0 };
  const c = createCar(0, 0.6, 0, 0), dt = 1 / 240;
  for (let i = 0; i < 25 / dt; i++) stepCar(c, { whl: [1, 1, 1, 1], exh: [false, false, false, false] }, dt, w);
  vTop = Math.hypot(c.v[0], c.v[2]);
  console.log(`  지면 최고속도 ${vTop.toFixed(2)} m/s (${(vTop * 3.6).toFixed(0)} km/h)`);
  // 4개 전부 최대 상승: 연료가 바닥날 때까지
  const sim = new CarSim({ groundY: () => 0, refY: () => 0, collide: () => null, wallHalf: () => Infinity });
  sim.spawn(0, 0.5, 0, 0);
  let T = 0, apex = 0, tBurn = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const burning = !sim.lock && sim.fuel > 0;
    sim.step(burning ? 0xf0 : 0, 1 / 60, T, false); T += 1 / 60; if (burning) tBurn += 1 / 60;
    apex = Math.max(apex, sim.car.p[1]);
    if (!burning && sim.car.p[1] < 1) break;
  }
  console.log(`  배출구 4개 전부 켜고 연료 소진: ${tBurn.toFixed(1)}초 분사 → 최고 고도 ${apex.toFixed(1)}m (고도 약 40m에서 추력 감소)`);
  // 자동조종 기준 최대 체공 거리 (틈 길이를 늘려가며 100% 이내인 최대값)
  let best = 0;
  for (let len = 40; len <= 140; len += 5) {
    const B = new MapBuilder(1); B.begin(1, 'cal', {}); B.run(300, { w: 8 }); B.jump(len, { v0: 9 }); B.run(80); B.end();
    const fin = B.finalize();
    const m = { localStatics: fin.localStatics, ground: straightGround(B.route), flights: B.flights };
    const r = bestFlight(m, m.flights[0]);
    if (r.ok && r.fuelUsed <= 100) best = len; else if (!r.ok || r.fuelUsed > 100) break;
  }
  console.log(`  자동조종 기준 한 번의 만땅으로 건널 수 있는 최대 틈 길이: 약 ${best}m (연료 100%)`);
  console.log(`  설계 상한: 틈 ${Math.max(0, ...map.flights.filter((f) => f.gap).map((f) => f.gap[1] - f.gap[0]))}m, 창문 최고 ${Math.max(...map.flights.filter((f) => f.kind === 'portal').map((f) => f.bands[0].hi))}m`);
}

// ───────────────── 7) 최단 완주 시간 ─────────────────
head('7) 최단 완주 시간 계산 (완벽한 플레이 가정)');
{
  const L = map.finish.s - map.start.s;
  let air = 0;
  for (const f of map.flights) {
    if (f.gap) air += f.gap[1] - f.gap[0] + 6.6;
    else if (f.kind === 'step') air += 6.6;
    else air += Math.max(...f.bands.map((b) => b.s1)) - Math.min(...f.bands.map((b) => b.s0));
  }
  const vFly = 1.5 * vTop;
  const tGround = (L - air) / vTop, tAir = air / vFly;
  // 연료 대기: 비행 사이를 vTop로 달리며 8%/s 충전, 연료가 모자라면 서서 충전
  let fuel = 100, wait = 0, prevEnd = map.start.s;
  const fl = [...map.flights].sort((a, b) => a.bands[0].s0 - b.bands[0].s0);
  for (const f of fl) {
    const s0 = Math.min(...f.bands.map((b) => b.s0)), s1 = Math.max(...f.bands.map((b) => b.s1));
    fuel = Math.min(100, fuel + (CFG.FUEL.rechargeGround * Math.max(0, s0 - prevEnd)) / vTop);
    const need = (f.fuelNeed || 0) * 0.85;       // 숙련자는 자동조종보다 15% 적게 쓴다고 가정
    if (fuel < need) { wait += (need - fuel) / CFG.FUEL.rechargeGround; fuel = need; }
    fuel -= need; prevEnd = s1;
  }
  const total = tGround + tAir + wait;
  const mm = (t) => `${Math.floor(t / 60)}분 ${(t % 60).toFixed(0)}초`;
  console.log(`  주행 거리 ${L}m  (지면 ${(L - air).toFixed(0)}m + 공중 ${air.toFixed(0)}m)`);
  console.log(`  지면 최고속도 ${vTop.toFixed(2)} m/s 로 쉬지 않고 달린다고 가정: ${mm(tGround)}`);
  console.log(`  공중 구간은 지면 최고속도의 1.5배(${vFly.toFixed(1)} m/s)로 간다고 가정: ${mm(tAir)}`);
  console.log(`  연료 충전 대기(연료 소모 85% 가정): ${wait.toFixed(0)}초`);
  console.log(`  ▶ 이론상 최단 완주 시간 ≈ ${mm(total)} (${total.toFixed(0)}초)   [장애물 대기시간·사망은 포함하지 않은 하한 추정]`);
  if (!MIN_TIME) ok('이 맵은 최단 시간 기준 없음');
  else if (total < MIN_TIME) err(`최단 시간 추정 ${total.toFixed(0)}초 < ${MIN_TIME / 60}분(${MIN_TIME}초)`); else ok(`${MIN_TIME / 60}분(${MIN_TIME}초) 이상`);
}

// ───────────────── 결과 ─────────────────
head('결과');
console.log(`  오류 ${errors.length}개, 경고 ${warns.length}개`);
if (errors.length) { console.log('  ✗ 검증 실패'); process.exit(1); }
console.log('  ✓ 검증 통과');
