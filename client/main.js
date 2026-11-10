// Temu Tesla 클라이언트 진입점
import * as THREE from 'three';
import { Net, Interp } from './net.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';
import { Engine } from './render/engine.js';
import { CityView } from './render/city.js';
import { HazardView } from './render/hazards.js';
import { CarView } from './render/car.js';
import { Effects } from './render/fx.js';
import { DebugTools } from './debug.js';
import { MenuScene } from './render/menu3d.js';
import { getMap } from '../shared/mapData.js';
import { createWorld } from '../shared/world.js';
import { CFG } from '../shared/config.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const CAUSE = { wall: '장벽', spike: '가시', car: '차량', 'fire-car': '불타는 차', building: '건물/구조물', laser: '레이저', column: '불/증기/분수', rain: '낙하물', traffic: '달려오는 차', birds: '새 떼', ceil: '내려오는 판', ceiling: '낮은 천장', saw: '톱날', ball: '흔들리는 추', debris: '낙하물', press: '압착 벽', train: '열차', barrels: '굴러오는 물체', drone: '드론/풍선/유령', barricade: '바리케이드', wire: '전선', pole: '전봇대', lamp: '가로등', tree: '나무', gantry: '신호등/표지판', pipe: '배관', cable: '케이블', rail: '난간', prop: '구조물', fall: '추락', suicide: '자폭', ledge: '절벽', laserfix: '레이저', overpass: '육교', banner: '전광판', skybridge: '연결 통로', laundry: '빨랫줄', lantern: '등불줄', bunting: '깃발줄(가랜드)', lights: '전구줄', support: '받침 기둥', sign: '표지판', crane: '크레인', pylon: '송전탑', conveyor: '컨베이어', tower: '주탑', rock: '바위', gate: '정문', tank: '저장 탱크', stack: '굴뚝', pillar: '기둥', wheel: '대관람차', coaster: '롤러코스터', swing: '바이킹', carousel: '회전목마', cup: '찻잔', booth: '매표소', planter: '화단', swinger: '회전 그네', track: '코스터 선로', droptower: '자이로드롭', bench: '벤치', fountain: '분수', container: '컨테이너' };

const net = new Net(), interp = new Interp(), audio = new GameAudio();
let ui, input, engine, fx, carView, city, hazards, debug, map, world, init = null, menu3d = null;
let running = false, paused = false, rafId = 0, lastT = 0, firstFrame = true, screenName = 'none', inGame = false;
let suicideStart = 0, goTimer = 0, pingMs = 0, lastStateObj = null, soloStarting = false, roomSize = null;
const canvas = document.getElementById('gl');

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
const pop = (n) => ((n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));

// ───────── UI 핸들러 ─────────
const handlers = {
  unlock: () => audio.unlock(),
  async create(name, size, mapId) { roomSize = size; const r = await net.create(name, DEBUG, size, mapId); if (!r.ok) ui.menuMsg(r.err); else { ui.menuMsg(''); goScreen('lobby'); } },
  async join(code, name) { roomSize = null; const r = await net.join(code, name); if (!r.ok) ui.menuMsg(r.err); else { ui.menuMsg(''); goScreen('lobby'); } },
  // 1P: 방을 만들고 바로 출발 (대기실을 거치지 않음)
  async solo(name, mapId) {
    soloStarting = true; roomSize = 1; ui.wake(true, '게임을 준비하는 중…');
    const r = await net.create(name, DEBUG, 1, mapId);
    if (!r.ok) { soloStarting = false; ui.wake(false); return ui.menuMsg(r.err); }
    const s = await net.call('room:start');
    if (!s.ok) { soloStarting = false; ui.wake(false); goScreen('lobby'); ui.lobbyMsg(s.err); }
  },
  setMap: (id) => net.send('room:map', { map: id }),
  garage(on) { goScreen(on ? 'garage' : 'menu'); },
  ready: (v) => net.send('room:ready', { ready: v }),
  async start() { const r = await net.call('room:start'); if (!r.ok) ui.lobbyMsg(r.err); },
  leave() { net.send('room:leave'); net.clear(); stopGame(); roomSize = null; goScreen('menu'); },
  async again() {
    ui.hideOverlays(); net.send('room:again');
    if (roomSize === 1) { soloStarting = true; const s = await net.call('room:start'); if (!s.ok) soloStarting = false; }
  },
  quality: (q) => { if (engine) engine.setQuality(q); },
  auto: () => {}, camera: (m) => { ui.settings.camera = m; ui.save(); if (engine) engine.setCamMode(m); ui.toast(m === 'chase' ? '시점: 추격(그란 투리스모식)' : '시점: 탑뷰', false); ui.syncCamera(); }, volume: (v) => audio.setVolume(v), mute: (m) => audio.setMuted(m),
  settingsOpen: (on) => { if (input) input.enable(!on && inGame); },
  inGame: () => inGame,
  toLobby() { net.send('room:toLobby'); },
};
function goScreen(n) {
  screenName = n; ui.screen(n);
  // 로비/차고에서는 3D 메뉴 장면을 돌리고, 그 밖에서는 멈춘다
  if (n === 'menu' || n === 'garage') {
    try { if (!menu3d) menu3d = new MenuScene(document.getElementById('menu-gl')); menu3d.start(); menu3d.setMode(n === 'garage' ? 'garage' : 'lobby'); } catch (e) { console.warn('메뉴 3D 장면을 시작하지 못함:', e); }
  } else if (menu3d) menu3d.stop();
}

function stopGame() {
  running = false; inGame = false; paused = false;
  if (input) input.enable(false);
  ui.hideOverlays(); ui.setSuicide(0);
  if (fx) fx.clearAll();
  if (hazards) hazards.clear();
}

// ───────── 엔진/뷰 준비 (처음 한 번) ─────────
async function ensureEngine() {
  if (engine) return;
  engine = new Engine(canvas, ui.settings);
  await engine.init();
  fx = new Effects(THREE, engine.scene, engine.quality, engine.mats);
  carView = new CarView(THREE, engine.scene, engine.mats, engine.tex, fx);
  fx.setFragments(carView.fragments(), carView.wheelData);
}
// 맵이 바뀌면 도시 뷰/장애물 뷰/월드를 새로 만든다
function ensureMap(id) {
  if (map && map.id === id) return;
  if (city) city.dispose();
  if (hazards) hazards.dispose();
  map = getMap(id); world = createWorld(map);
  engine.setEnvKeys(map.env);
  city = new CityView(THREE, engine.scene, map, engine.mats, engine.tex);
  hazards = new HazardView(THREE, engine.scene, map, engine.mats, engine.tex, fx);
  if (DEBUG) { if (!debug) debug = new DebugTools({ net, engine, world, map, getState: () => lastStateObj }); else { debug.world = world; debug.map = map; debug.build(); } }
}

async function startGame(data) {
  init = data; soloStarting = false;
  ui.hideOverlays(); ui.wake(true, '게임을 불러오는 중…');
  try { await ensureEngine(); ensureMap(data.map || 'city'); } catch (e) { ui.wake(false); ui.showError('그래픽을 시작하지 못했습니다: ' + (e && e.message)); return; }
  hazards.clear(); fx.clearAll(); interp.reset();
  input.setAllowed(data.assign[data.slot]); input.enable(true);
  ui.initHud(data, map);
  firstFrame = true; engine.snapCamera();
  inGame = true; running = true; paused = false; lastT = performance.now() / 1000;
  goScreen('game'); ui.wake(false);
  audio.unlock();
  if (!rafId) rafId = requestAnimationFrame(frame);
}

// ───────── 서버 이벤트 ─────────
function handleEvent(e) {
  switch (e.t) {
    case 'explode':
      if (fx) fx.explode(e.p, e.v, e.q, e.seed);
      audio.explosion(); ui.toast(`폭발! ${CAUSE[e.src || e.cause] || CAUSE[e.cause] || '장애물'}`, true); break;
    case 'respawn': firstFrame = true; if (engine) engine.snapCamera(); audio.respawn(); ui.toast('부활! 2초간 무적', false); if (fx) fx.shake = 0; break;
    case 'cp': audio.checkpoint(); ui.toast(`체크포인트 ${e.i + 1} 저장`, false); break;
    case 'go': audio.go(); ui.centerMsg('GO!'); goTimer = 0.9; break;
    case 'tp': firstFrame = true; if (engine) engine.snapCamera(); break;
    default: break;
  }
}

function bindNet() {
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyC' && inGame && !e.repeat && !/INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) { handlers.camera(engine && engine.camMode === 'chase' ? 'top' : 'chase'); } });
  net.on('room:state', (st) => { ui.setLobby(st); if (st.size) roomSize = st.size; if (!inGame && !soloStarting && screenName !== 'lobby') goScreen('lobby'); });
  net.on('game:init', (d) => { startGame(d); });
  net.on('snap', (s) => { interp.push(s, performance.now() / 1000); });
  net.on('evt', (list) => list.forEach(handleEvent));
  net.on('game:pause', (d) => { paused = true; ui.pause(d.name, d.left); ui.offline(d.name); if (input) input.release(); });
  net.on('game:resume', () => { paused = false; ui.resume(); ui.offline(null); lastT = performance.now() / 1000; });
  net.on('game:abort', (d) => { stopGame(); goScreen('lobby'); });
  net.on('game:end', (d) => { audio.finish(); if (input) input.enable(false); ui.result(d); });
  net.on('disconnected', () => { if (inGame) ui.wake(true, '연결이 끊겼어요. 다시 연결하는 중…'); });
  net.on('connected', (d) => { if (d.again) ui.wake(false); });
  net.on('rejoined', () => { ui.wake(false); });
  setInterval(() => { if (net.socket && net.socket.connected) { const t = performance.now(); net.socket.emit('ping2', 0, () => { pingMs = performance.now() - t; }); } }, 2000);
}

// ───────── 렌더 루프 ─────────
function frame(nowMs) {
  rafId = requestAnimationFrame(frame);
  if (!running) return;
  const now = nowMs / 1000, dt = Math.min(0.05, Math.max(0.0005, now - lastT)); lastT = now;
  const st = interp.get(now, paused);
  if (!st) { ui.centerMsg('연결 중…', true); return; }
  lastStateObj = st;
  const alive = st.ph !== 2, sCar = Math.max(0, st.s !== undefined ? st.s : -st.p[2]);
  // 경로 노면 높이(고도 기준) / 바로 아래 지면(그림자). 낭떠러지 위면 바닥까지
  const road = world.track ? world.track.locate(st.p[0], st.p[1], st.p[2], sCar) : null;
  const roadY = road ? road.y : 0;
  let gy = world.groundY(st.p[0], st.p[1] + 0.5, st.p[2]); if (!Number.isFinite(gy)) gy = map.floorY !== undefined ? map.floorY : roadY;
  const alt = Math.max(0, st.p[1] - roadY);
  const slow = fx.slowmo > 0 ? 0.25 : 1;
  const sec = map.sections.find((s) => sCar >= s.s0 && sCar < s.s1) || map.sections[map.sections.length - 1], secIdx = sec.idx;
  const ceilY = world.ceilAt(sCar), indoor = ceilY > 0 && (sec.theme.style === 'tunnel' || sec.theme.style === 'haunt');

  engine.applyEnv(sCar);
  city.update(sCar, firstFrame);
  hazards.update(st.T, sCar, paused ? 0 : dt);
  const localEx = alive && !st.lk && st.f > 0 ? (input.mask >> 4) & 15 : 0;
  carView.update({ p: st.p, q: st.q, v: st.v, ex: st.ex, f: st.f, inv: st.inv, alive, groundY: gy, alt }, dt, now, localEx);
  const camPos = engine.camera.position;
  if (engine.envNow.rain > 0.05) fx.rain([camPos.x, camPos.y, camPos.z], engine.envNow.rain);
  // 불타는 차 / 전선 스파크는 가까울 때만
  const near = (p, r) => Math.abs(p[0] - st.p[0]) < r && Math.abs(p[2] - st.p[2]) < r;
  for (const f of city.fires) if (near(f, 70) && Math.random() < 0.6) fx.flame([f[0], f[1] - 0.2, f[2]], 1.0, 2.2);
  for (const sp of city.sparks) if (near(sp[0], 60) && Math.random() < 0.04) { const k = Math.random(), a = sp[0], b = sp[1]; fx.spark([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], 3, 4); }
  fx.update(paused ? 0 : dt * slow);
  engine.updateCamera(dt, { p: st.p, v: st.v, q: st.q, alt }, fx, { wall: Infinity, ceil: ceilY, ground: Math.max(gy, roadY - 30), roadYaw: world.track ? -world.track.headingAt(sCar) : 0 });
  engine.updateLamps(city.lamps, { x: st.p[0], z: st.p[2] });
  engine.flashLight.position.set(fx.flashPos[0], fx.flashPos[1] + 3, fx.flashPos[2]); engine.flashLight.intensity = fx.flash * 9000;
  if (debug) debug.update(dt, st, st.T);
  engine.render(dt);

  // HUD / 소리
  const kmh = Math.hypot(st.v[0], st.v[2]) * 3.6;
  ui.hud({ st: { ...st, lk: st.lk }, sCar, alt, kmh, pressed: input.mask, alive, fps: engine.fps(), ping: pingMs });
  const hz = map.hints.find((h) => sCar >= h.s0 && sCar < h.s1);
  ui.hint(hz && alive ? hz.key : null);
  if (goTimer > 0) { goTimer -= dt; if (goTimer <= 0) ui.centerMsg(''); } else ui.centerMsg(st.cd > 0 ? String(st.cd) : '');
  if (st.cd > 0 && st.cd !== frame.lastCd) { frame.lastCd = st.cd; audio.tick(); }
  ui.setSuicide(input.suicide && alive ? (now - suicideStart) / CFG.RULES.suicideHold : 0);
  audio.tension = secIdx / map.sections.length;
  audio.update({ ex: st.ex | localEx, wheels: pop((input.mask | (input.mask >> 2)) & 3) * 2, speed: Math.hypot(st.v[0], st.v[2]), grounded: st.g === 1, fuel: st.f, alive, car: st.p, hz: hazards.audio, rain: engine.envNow.rain, tunnel: indoor, now });
  firstFrame = false;
}

// ───────── 부팅 ─────────
async function boot() {
  const onErr = (m) => { console.error(m); if (ui) ui.showError(String(m)); };
  window.addEventListener('error', (e) => onErr(`${e.message}\n${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => onErr('처리되지 않은 오류: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  ui = new UI(handlers);
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { passive: true });
  audio.setVolume(ui.settings.volume); audio.setMuted(ui.settings.muted);
  input = new Input((m) => net.send('input', m), (on) => { if (on) suicideStart = performance.now() / 1000; net.send('suicide', on); });
  if (isMobile()) { ui.mobile(); return; }
  bindNet();
  ui.wake(true, '무료 서버는 잠들어 있다가 처음 접속하면 30~60초쯤 걸릴 수 있어요.');
  const ok = await net.waitServer((sec) => ui.wake(true, `서버를 깨우는 중… ${sec}초 경과 (무료 서버는 처음에 30~60초 걸릴 수 있어요)`));
  if (!ok) { ui.wake(true, '서버에 연결할 수 없습니다. 잠시 뒤 새로고침(F5) 해 주세요.'); return; }
  try { await net.connect(); } catch (e) { ui.wake(true, '실시간 연결에 실패했습니다: ' + (e && e.message)); return; }
  ui.wake(false);
  if (net.session) { const r = await net.rejoin(); if (!r.ok) goScreen('menu'); } else goScreen('menu');
  if (screenName === 'none') goScreen('menu');
}
boot();
