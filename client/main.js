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
import { getMap } from '../shared/mapData.js';
import { createWorld } from '../shared/world.js';
import { CFG } from '../shared/config.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const CAUSE = { wall: '장벽', spike: '가시', car: '차량', 'fire-car': '불타는 차', building: '건물 벽', laser: '레이저', column: '불/증기', rain: '불 비', traffic: '달려오는 차', birds: '새 떼', ceil: '천장 가시판', ceiling: '낮은 천장', saw: '톱날', ball: '철구', debris: '낙하물', press: '압착 벽', train: '열차', barrels: '드럼통', drone: '드론', barricade: '바리케이드', wire: '전선', pole: '가로등', lamp: '가로등', tree: '가로수', gantry: '신호등', pipe: '배관', cable: '케이블', rail: '난간', prop: '구조물', fall: '추락', suicide: '자폭', ledge: '절벽', laserfix: '레이저' };

const net = new Net(), interp = new Interp(), audio = new GameAudio();
let ui, input, engine, fx, carView, city, hazards, debug, map, world, init = null;
let running = false, paused = false, rafId = 0, lastT = 0, firstFrame = true, screenName = 'none', inGame = false;
let suicideStart = 0, goTimer = 0, pingMs = 0, lastStateObj = null;
const canvas = document.getElementById('gl');

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
const pop = (n) => ((n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));

// ───────── UI 핸들러 ─────────
const handlers = {
  unlock: () => audio.unlock(),
  async create(name) { const r = await net.create(name, DEBUG); if (!r.ok) ui.menuMsg(r.err); else { ui.menuMsg(''); goScreen('lobby'); } },
  async join(code, name) { const r = await net.join(code, name); if (!r.ok) ui.menuMsg(r.err); else { ui.menuMsg(''); goScreen('lobby'); } },
  ready: (v) => net.send('room:ready', { ready: v }),
  async start() { const r = await net.call('room:start'); if (!r.ok) ui.lobbyMsg(r.err); },
  leave() { net.send('room:leave'); net.clear(); stopGame(); goScreen('menu'); },
  again() { ui.hideOverlays(); net.send('room:again'); },
  quality: (q) => { if (engine) engine.setQuality(q); },
  auto: () => {}, camera: (m) => { ui.settings.camera = m; ui.save(); if (engine) engine.setCamMode(m); ui.toast(m === 'chase' ? '시점: 추격(그란 투리스모식)' : '시점: 탑뷰', false); ui.syncCamera(); }, volume: (v) => audio.setVolume(v), mute: (m) => audio.setMuted(m),
  settingsOpen: (on) => { if (input) input.enable(!on && inGame); },
};
function goScreen(n) { screenName = n; ui.screen(n); }

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
  map = getMap('city'); world = createWorld(map);
  city = new CityView(THREE, engine.scene, map, engine.mats, engine.tex);
  hazards = new HazardView(THREE, engine.scene, map, engine.mats, engine.tex, fx);
  if (DEBUG) debug = new DebugTools({ net, engine, world, map, getState: () => lastStateObj });
}

async function startGame(data) {
  init = data;
  ui.hideOverlays(); ui.wake(true, '게임을 불러오는 중…');
  try { await ensureEngine(); } catch (e) { ui.wake(false); ui.showError('그래픽을 시작하지 못했습니다: ' + (e && e.message)); return; }
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
  net.on('room:state', (st) => { ui.setLobby(st); if (!inGame && screenName !== 'lobby') goScreen('lobby'); });
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
  const alive = st.ph !== 2, sCar = Math.max(0, -st.p[2]);
  let gy = world.groundY(st.p[0], st.p[2]); if (!Number.isFinite(gy)) gy = world.refY(st.p[2]);
  const alt = Math.max(0, st.p[1] - world.refY(st.p[2]));
  const slow = fx.slowmo > 0 ? 0.25 : 1;
  const secIdx = (map.sections.find((s) => sCar >= s.s0 && sCar < s.s1) || map.sections[map.sections.length - 1]).idx;

  engine.applyEnv(sCar);
  city.update(sCar, firstFrame);
  hazards.update(st.T, sCar, paused ? 0 : dt);
  const localEx = alive && !st.lk && st.f > 0 ? (input.mask >> 4) & 15 : 0;
  carView.update({ p: st.p, q: st.q, v: st.v, ex: st.ex, f: st.f, inv: st.inv, alive, groundY: gy, alt }, dt, now, localEx);
  const camPos = engine.camera.position;
  if (engine.envNow.rain > 0.05) fx.rain([camPos.x, camPos.y, camPos.z], engine.envNow.rain);
  // 불타는 차 / 전선 스파크는 가까울 때만
  for (const f of city.fires) if (Math.abs(f[2] - st.p[2]) < 70 && Math.random() < 0.6) fx.flame([f[0], f[1] - 0.2, f[2]], 1.0, 2.2);
  for (const sp of city.sparks) if (Math.abs(sp[2] - st.p[2]) < 60 && Math.random() < 0.04) fx.spark([sp[3] + Math.random() * (sp[4] - sp[3]), sp[1], sp[2]], 3, 4);
  fx.update(paused ? 0 : dt * slow);
  engine.updateCamera(dt, { p: st.p, v: st.v, q: st.q, alt }, fx, { wall: world.wallHalf(st.p[2]), ceil: secIdx === 8 ? 7.5 : 0, ground: gy });
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
  audio.tension = secIdx / 10;
  audio.update({ ex: st.ex | localEx, wheels: pop(input.mask & 15), speed: Math.hypot(st.v[0], st.v[2]), grounded: st.g === 1, fuel: st.f, alive, car: st.p, hz: hazards.audio, rain: engine.envNow.rain, tunnel: secIdx === 8, now });
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
