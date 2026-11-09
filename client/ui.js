// UI: 메뉴, 로비, 설정, HUD(연료/배출구/키/고도/진행률), 일시정지, 결과 화면
import { maskToKeys } from '../shared/keys.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
const SETTINGS_KEY = 'tt-settings';

function loadSettings() {
  const d = { quality: 'high', auto: true, volume: 0.8, muted: false, name: '', camera: 'chase' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return d; }
}

const HINTS = {
  start: (m) => `출발 준비! 내 담당 키: ${m.all}\n${m.n > 1 ? '친구들과 키를 나눠 맡았어요. 서로 호흡을 맞춰 보세요!' : '혼자서 8개 키를 모두 맡았어요.'}`,
  wheels: (m) => `바퀴 키${m.wheels ? ` (${m.wheels})` : ''}를 눌러 달려 보세요.\n눌린 바퀴만 굴러서 차가 반대쪽으로 돕니다 (예: Q만 누르면 오른쪽으로). 지면에서는 연료가 닳지 않아요.`,
  fuel: () => '착지해서 가만히 서 있거나 굴러가면 연료가 충전됩니다 (지면 초당 약 8%).\n초록색 충전 구역에는 장애물이 없어요.',
  single: (m) => `배출구 키${m.exh ? ` (${m.exh})` : ''}를 한 개만 눌러 보세요.\n그쪽 모서리만 위로 들리며 차가 크게 기웁니다. 연료가 줄어드는 걸 보세요.`,
  lift: () => '배출구를 둘 이상 동시에 누르면 이륙합니다!\n낮은 장벽을 날아서 넘어 보세요. 착지는 안전해요.',
  four: () => '네 개를 모두 누르면 수평으로 안정적으로 상승합니다 (연료는 4배로 빨리 닳아요).\n짧게 끊어 누르며 높이를 조절하세요.',
  tilt: () => '앞쪽 배출구를 누르면 차가 뒤로 밀리고, 뒤쪽을 누르면 앞으로 나아갑니다.\n"어디를 눌러 기울여서 어디로 날아가느냐"가 핵심 기술!',
  tiltgap: () => '도로가 끊겼어요! 달려서 속도를 낸 뒤 날아서 건너세요.\n뒤쪽 배출구로 앞으로 기울이면 앞으로 나아갑니다.',
  free: () => '체크포인트(청록 게이트)를 지나면 부활 지점이 저장됩니다.\n폭발해도 2.5초 뒤 마지막 체크포인트에서 연료 100%로 부활!',
};

export class UI {
  constructor(h) {
    this.h = h; this.settings = loadSettings(); this.last = {}; this.map = null; this.lobbyState = null; this.myReady = false; this.toastTimer = 0;
    this.bind();
    $('in-name').value = this.settings.name || '';
    $('set-quality').value = this.settings.quality; $('set-cam').value = this.settings.camera || 'chase'; $('set-auto').checked = this.settings.auto; $('set-vol').value = Math.round(this.settings.volume * 100); $('set-mute').checked = this.settings.muted;
  }
  save() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }
  name() { const n = $('in-name').value.trim().slice(0, 12) || '플레이어'; this.settings.name = n; this.save(); return n; }

  bind() {
    const h = this.h;
    $('btn-create').onclick = () => { h.unlock(); h.create(this.name()); };
    $('btn-join').onclick = () => { h.unlock(); const c = $('in-code').value.trim().toUpperCase(); if (c.length !== 4) return this.menuMsg('방 코드는 4글자예요'); h.join(c, this.name()); };
    $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
    $('in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    $('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });
    $('btn-how').onclick = () => $('how').classList.toggle('hidden');
    $('btn-settings').onclick = () => this.toggleSettings(true);
    $('btn-set-close').onclick = () => this.toggleSettings(false);
    $('btn-full').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
    $('set-quality').onchange = (e) => { this.settings.quality = e.target.value; this.save(); h.quality(e.target.value); };
    $('set-cam').onchange = (e) => h.camera(e.target.value);
    $('set-auto').onchange = (e) => { this.settings.auto = e.target.checked; this.save(); h.auto(e.target.checked); };
    $('set-vol').oninput = (e) => { this.settings.volume = e.target.value / 100; this.save(); h.volume(this.settings.volume); };
    $('set-mute').onchange = (e) => { this.settings.muted = e.target.checked; this.save(); h.mute(e.target.checked); };
    $('btn-ready').onclick = () => { this.myReady = !this.myReady; h.ready(this.myReady); $('btn-ready').textContent = this.myReady ? '준비 취소' : '준비 완료'; };
    $('btn-start').onclick = () => h.start();
    $('btn-leave').onclick = () => h.leave();
    $('btn-copy').onclick = () => { const c = $('lobby-code').textContent; (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => this.lobbyMsg('방 코드를 복사했어요'), () => this.lobbyMsg('복사할 수 없어요. 직접 알려 주세요: ' + c)); };
    $('btn-again').onclick = () => h.again();
    $('btn-quit').onclick = () => h.leave();
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.toggleSettings($('modal-settings').classList.contains('hidden')); });
  }
  toggleSettings(on) { $('modal-settings').classList.toggle('hidden', !on); this.h.settingsOpen(on); }
  syncCamera() { $('set-cam').value = this.settings.camera || 'chase'; }
  menuMsg(t) { $('menu-msg').textContent = t || ''; }
  lobbyMsg(t) { const el = $('lobby-warn'); el.textContent = t; el.classList.remove('warn'); }

  screen(name) {
    for (const [k, id] of [['menu', 'screen-menu'], ['lobby', 'screen-lobby']]) $(id).classList.toggle('hidden', k !== name);
    $('hud').classList.toggle('hidden', name !== 'game');
    $('gl').style.visibility = name === 'game' ? 'visible' : 'hidden';
  }
  wake(on, msg) { $('overlay-wake').classList.toggle('hidden', !on); if (msg) $('wake-msg').textContent = msg; }
  mobile() { $('overlay-wake').classList.add('hidden'); $('overlay-mobile').classList.remove('hidden'); }
  showError(text) { const e = $('errbox'); e.textContent = text; e.classList.remove('hidden'); }

  // ───── 로비 ─────
  setLobby(st) {
    this.lobbyState = st;
    $('lobby-code').textContent = st.code;
    const me = st.you, isHost = st.players[me] && st.players[me].host;
    $('lobby-players').innerHTML = st.players.map((p, i) => `<div class="prow ${i === me ? 'me' : ''}"><span class="dot ${p.connected ? '' : 'off'}"></span><span class="nm">${esc(p.name)}${i === me ? ' (나)' : ''}</span>${p.host ? '<span class="tag host">방장</span>' : ''}<span class="tag ${p.ready ? 'ok' : ''}">${p.ready ? '준비 완료' : '대기 중'}</span>${p.connected ? '' : '<span class="tag off">연결 끊김</span>'}</div>`).join('');
    $('lobby-layout').innerHTML = st.layout ? `<b>키 배분 (${st.n}명)</b><br>` + st.layout.map((l, i) => `${i + 1}번 ${esc(st.players[i] ? st.players[i].name : '')}: ${l}`).join('<br>') : '<b>키 배분</b><br>인원이 1, 2, 4명이 되면 자리가 배정됩니다';
    const w = $('lobby-warn'); w.classList.add('warn'); w.textContent = st.warn || st.msg || '';
    $('btn-ready').classList.toggle('hidden', !!isHost);
    $('btn-start').classList.toggle('hidden', !isHost);
    $('btn-start').disabled = !st.canStart;
    if (!st.players[me] || st.players[me].host || !st.players[me].ready) { this.myReady = !!(st.players[me] && st.players[me].ready); $('btn-ready').textContent = this.myReady ? '준비 취소' : '준비 완료'; }
  }

  // ───── 일시정지 / 결과 ─────
  pause(name, left) { $('overlay-pause').classList.remove('hidden'); $('pause-msg').textContent = `${name}님의 연결이 끊겼습니다. 돌아오면 이어서 시작해요.\n${left}초 안에 돌아오지 않으면 로비로 돌아가 인원을 다시 맞춥니다.`; $('pause-count').textContent = left; }
  resume() { $('overlay-pause').classList.add('hidden'); }
  result(r) { $('res-time').textContent = fmtTime(r.time); $('res-deaths').textContent = r.deaths; $('res-names').textContent = `함께한 사람: ${(r.names || []).join(', ')}`; $('overlay-result').classList.remove('hidden'); }
  hideOverlays() { for (const id of ['overlay-pause', 'overlay-result']) $(id).classList.add('hidden'); }

  // ───── HUD ─────
  initHud(init, map) {
    this.map = map; this.slot = init.slot; this.n = init.n; this.assign = init.assign; this.names = init.names; this.last = {};
    const mine = init.assign[init.slot];
    const ks = maskToKeys(mine).map((k) => k.toUpperCase());
    const wheels = maskToKeys(mine & 0x0f).map((k) => k.toUpperCase()).join(' '), exh = maskToKeys(mine & 0xf0).map((k) => k.toUpperCase()).join(' ');
    this.info = { all: ks.join(' '), wheels, exh, n: init.n };
    $('keys-who').textContent = `(${ks.join(' ')})`;
    document.querySelectorAll('#hud-keys .cap').forEach((c) => { const b = 'qwaserdf'.indexOf(c.dataset.k); c.classList.toggle('mine', !!(mine & (1 << b))); c.classList.remove('on'); });
    document.querySelectorAll('#carmap .ex').forEach((c) => { const i = +c.dataset.i; c.classList.toggle('mine', !!(mine & (16 << i))); c.classList.remove('on'); });
    this.renderPlayers(null);
    const t = $('prog-ticks'); t.innerHTML = '';
    for (const s of map.sections) { const i = document.createElement('i'); i.className = 'sec'; i.style.left = `${(s.s0 / map.length) * 100}%`; t.appendChild(i); }
    this.ticks = map.checkpoints.map((c) => { const i = document.createElement('i'); i.style.left = `${(c.s / map.length) * 100}%`; t.appendChild(i); return i; });
    $('hint').classList.add('hidden'); $('center-msg').classList.add('hidden'); $('suicide').classList.add('hidden');
    document.body.classList.toggle('debug', !!init.debug);
  }
  renderPlayers(offName) {
    $('hud-players').innerHTML = this.names.map((nm, i) => `<div class="pl ${i === this.slot ? 'me' : ''} ${nm === offName ? 'off' : ''}"><span class="dot"></span><b>${esc(nm)}</b><span class="ks">${maskToKeys(this.assign[i]).map((k) => k.toUpperCase()).join('')}</span></div>`).join('');
  }
  offline(name) { this.renderPlayers(name); }
  toast(text, bad) { const t = $('toast'); t.className = bad ? 'bad' : ''; t.textContent = text; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; t.classList.remove('hidden'); clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.add('hidden'), 1700); }
  setSuicide(p) { const el = $('suicide'); el.classList.toggle('hidden', p <= 0); $('suicide-fill').style.width = `${Math.min(1, p) * 100}%`; }

  // 매 프레임: v = { st, sCar, alt, kmh, pressed(내가 누른 키), fps, ping, fuelLock }
  hud(v) {
    const L = this.last, st = v.st, map = this.map;
    const set = (k, val, fn) => { if (L[k] !== val) { L[k] = val; fn(val); } };
    set('time', Math.floor(st.el * 10), () => { $('st-time').textContent = fmtTime(st.el); });
    set('deaths', st.d, (d) => { $('st-deaths').textContent = d; });
    set('fps', Math.round(v.fps), (f) => { $('st-fps').textContent = f; });
    set('ping', Math.round(v.ping || 0), (p) => { $('st-ping').textContent = p + ' ms'; });
    const fuel = Math.round(st.f);
    set('fuel', fuel + ':' + st.lk, () => { $('fuel-pct').innerHTML = `${fuel}<small>%</small>`; $('fuel-fill').style.width = `${st.f}%`; const el = $('hud-fuel'); el.classList.toggle('low', st.f <= 20); el.classList.toggle('lock', !!st.lk); $('fuel-note').textContent = st.lk ? '— 고갈! 충전 중 (5% 회복 전엔 점화 불가)' : st.f <= 20 ? '— 부족!' : ''; });
    set('alt', Math.round(v.alt * 5), () => { $('alt-val').textContent = `${v.alt.toFixed(1)} m`; const k = Math.min(1, v.alt / 45); $('alt-fill').style.height = `${k * 100}%`; $('alt-mark').style.bottom = `${k * 100}%`; });
    set('kmh', Math.round(v.kmh), (k) => { $('speed-val').textContent = `${k} km/h`; });
    const pct = Math.min(1, Math.max(0, v.sCar / map.length));
    set('prog', Math.round(pct * 2000), () => { $('prog-fill').style.width = `${pct * 100}%`; $('prog-car').style.left = `${pct * 100}%`; $('prog-meta').textContent = `${Math.max(0, Math.round(v.sCar))} m / ${map.length} m`; });
    let si = 0; for (const s of map.sections) if (v.sCar >= s.s0) si = s.idx;
    set('sec', si + ':' + st.cp, () => { const s = map.sections[Math.max(0, si - 1)]; $('sec-name').textContent = `구간 ${s.idx}/${map.sections.length} · ${s.name}   ·   체크포인트 ${st.cp + 1}/${map.checkpoints.length}`; this.ticks.forEach((t, i) => t.classList.toggle('done', i <= st.cp)); });
    // 키 UI: 내가 누른 키는 즉시 켜짐
    set('keys', v.pressed + ':' + st.ex + ':' + st.k.join(','), () => {
      document.querySelectorAll('#hud-keys .cap').forEach((c) => { const b = 'qwaserdf'.indexOf(c.dataset.k); c.classList.toggle('on', !!(v.pressed & (1 << b))); });
      const all = st.k.reduce((a, b) => a | b, 0) | v.pressed;
      document.querySelectorAll('#carmap .ex').forEach((c) => c.classList.toggle('on', !!((st.ex | (v.pressed >> 4 & 15)) & (1 << +c.dataset.i)) && v.alive));
      document.querySelectorAll('#carmap .wh').forEach((c) => c.classList.toggle('on', !!(all & (1 << +c.dataset.i))));
    });
  }
  hint(key) {
    const el = $('hint');
    if (this.last.hintKey === key) return;
    this.last.hintKey = key;
    if (!key || !HINTS[key]) { el.classList.add('hidden'); return; }
    el.textContent = HINTS[key](this.info); el.classList.remove('hidden');
  }
  centerMsg(text, small) { const el = $('center-msg'); if (this.last.cm === text) return; this.last.cm = text; if (!text) { el.classList.add('hidden'); return; } el.textContent = text; el.classList.toggle('small', !!small); el.classList.remove('hidden'); }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
