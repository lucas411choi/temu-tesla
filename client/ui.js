// UI: 메뉴, 로비, 설정, HUD(연료/배출구/키/고도/진행률), 일시정지, 결과 화면
import { maskToKeys } from '../shared/keys.js';
import { MAP_INFO } from '../shared/mapData.js';
import { CFG } from '../shared/config.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`; };
const SETTINGS_KEY = 'tt-settings';
const KEYS9 = ['q', 'w', 'a', 's', 'e', 'r', 'd', 'f', 'space'];

function loadSettings() {
  const d = { quality: 'high', auto: true, volume: 0.8, muted: false, name: '', camera: 'chase', map: 'city' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return d; }
}

const HINTS = {
  start: (m) => `출발 준비! 내 담당 키: ${m.all}\n${m.n > 1 ? '친구들과 키를 나눠 맡았어요. 서로 호흡을 맞춰 보세요!' : '혼자서 키를 모두 맡았어요.'}`,
  wheels: () => 'Q = 왼쪽 바퀴 전진, W = 오른쪽 바퀴 전진. 둘 다 누르면 직진!\nA · S 는 같은 쪽 바퀴 후진. Q만 누르면 오른쪽, W만 누르면 왼쪽으로 꺾여요.',
  turn: () => '길이 꺾여요! 스페이스(브레이크)로 속도를 줄이고\n한쪽 바퀴만 굴려서 방향을 바꾸세요. 길 밖으로 떨어지면 폭발!',
  fuel: () => '착지해서 가만히 서 있거나 굴러가면 연료가 충전됩니다 (지면 초당 약 8%).\n초록색 충전 구역에는 장애물이 없어요.',
  single: (m) => `배출구 키${m.exh ? ` (${m.exh})` : ''}를 한 개만 눌러 보세요.\n그쪽 모서리만 위로 들리며 차가 크게 기웁니다.`,
  lift: () => '배출구를 둘 이상 동시에 누르면 이륙합니다!\n낮은 장벽을 날아서 넘어 보세요.',
  four: () => '네 개를 모두 누르면 수평으로 상승합니다 (연료가 약 2.5초 만에 바닥나요).\n짧게 끊어 누르며 높이를 조절하세요.',
  tilt: () => '앞쪽 배출구를 누르면 차가 뒤로 밀리고, 뒤쪽을 누르면 앞으로 나아갑니다.\n"어디를 눌러 기울여서 어디로 날아가느냐"가 핵심 기술!',
  tiltgap: () => '길이 끊겼어요! 달려서 속도를 낸 뒤 날아서 건너세요.\n뒤쪽 배출구로 앞으로 기울이면 앞으로 나아갑니다.',
  free: () => '체크포인트(청록 게이트)를 지나면 부활 지점이 저장됩니다.\n이제부터 길이 구불구불하고 좁아져요. 꺾이는 곳에서는 미리 감속!',
};

export class UI {
  constructor(h) {
    this.h = h; this.settings = loadSettings(); this.last = {}; this.map = null; this.lobbyState = null; this.myReady = false; this.toastTimer = 0;
    this.players = 1;
    if (!MAP_INFO[this.settings.map]) this.settings.map = 'city';
    this.bind();
    $('in-name').value = this.settings.name || '';
    $('set-quality').value = this.settings.quality; $('set-cam').value = this.settings.camera || 'chase'; $('set-auto').checked = this.settings.auto; $('set-vol').value = Math.round(this.settings.volume * 100); $('set-mute').checked = this.settings.muted;
    this.renderMapCards();
    this.renderStats();
  }
  save() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }
  name() { const n = $('in-name').value.trim().slice(0, 12) || '플레이어'; this.settings.name = n; this.save(); return n; }

  // ───── 메인 로비: 플레이 → 1P/2P/4P → 설정 패널 ─────
  closePanels() { for (const id of ['play-setup', 'how']) $(id).classList.add('hidden'); document.querySelectorAll('.mode').forEach((b) => b.classList.remove('on')); }
  openPlay(on) {
    $('play-modes').classList.toggle('hidden', !on); $('nav-play').classList.toggle('on', on);
    if (!on) this.closePanels();
  }
  openSetup(n) {
    this.players = n; this.closePanels();
    document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', +b.dataset.n === n));
    $('setup-title').textContent = n === 1 ? '1P · 솔로 (8키 전부)' : n === 2 ? '2P · 왼쪽 / 오른쪽' : '4P · 모서리 하나씩';
    $('setup-solo').classList.toggle('hidden', n !== 1); $('setup-multi').classList.toggle('hidden', n === 1);
    this.menuMsg(''); $('play-setup').classList.remove('hidden');
    setTimeout(() => $('in-name').focus(), 30);
  }
  renderMapCards() {
    const el = $('map-cards');
    el.innerHTML = Object.entries(MAP_INFO).map(([id, m]) => `<button class="map-card ${id === this.settings.map ? 'on' : ''}" data-map="${id}"><b>${m.name}</b><em>${(m.len / 1000).toFixed(1)} km · ${m.sections}구간</em><small>${m.desc}</small></button>`).join('');
    el.querySelectorAll('.map-card').forEach((b) => { b.onclick = () => { this.settings.map = b.dataset.map; this.save(); this.renderMapCards(); }; });
  }
  // 차고: 현재 로드스터 능력치 (config 값에서 계산)
  renderStats() {
    const top = 9.33 * 3.6, thrust = CFG.THRUST.perExhaust / (CFG.CAR.mass * CFG.G), burn4 = 100 / (4 * CFG.FUEL.burnPerExhaust), burn1 = 100 / CFG.FUEL.burnPerExhaust;
    const rows = [
      ['최고 속도', top / 60, `${top.toFixed(0)} km/h`],
      ['배출구 추력', thrust * 4 / 4, `${(thrust * 4).toFixed(1)} G`],
      ['연료 지속', burn4 / 5, `${burn4.toFixed(1)} s`],
      ['연료 충전', CFG.FUEL.rechargeGround / 12, `${(100 / CFG.FUEL.rechargeGround).toFixed(1)} s`],
      ['최고 고도', 40 / 50, '≈ 40 m'],
      ['차체 무게', CFG.CAR.mass / 2500, `${CFG.CAR.mass} kg`],
    ];
    $('car-stats').innerHTML = rows.map(([k, v, t]) => `<div class="stat-row"><span>${k}</span><div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div><b>${t}</b></div>`).join('')
      + `<div class="specs">바퀴 4개 (차동 조향, 지면 전용) · 제트 배출구 4개 (모서리별 분사)<br>배출구 1개만 켜면 ${burn1.toFixed(0)}초, 4개 전부 켜면 ${burn4.toFixed(1)}초 동안 분사<br>지면 충전 초당 ${CFG.FUEL.rechargeGround}% · 공중 충전 초당 ${CFG.FUEL.rechargeAir}%</div>`;
  }

  bind() {
    const h = this.h;
    $('nav-play').onclick = () => { h.unlock(); this.openPlay($('play-modes').classList.contains('hidden')); };
    document.querySelectorAll('.mode').forEach((b) => { b.onclick = () => this.openSetup(+b.dataset.n); });
    $('setup-close').onclick = () => this.closePanels();
    $('nav-garage').onclick = () => { h.unlock(); h.garage(true); };
    $('garage-back').onclick = () => h.garage(false);
    $('nav-how').onclick = () => { const on = $('how').classList.contains('hidden'); this.closePanels(); this.openPlay(false); $('how').classList.toggle('hidden', !on); };
    $('how-close').onclick = () => this.closePanels();
    $('btn-solo').onclick = () => { h.unlock(); h.solo(this.name(), this.settings.map); };
    $('btn-create').onclick = () => { h.unlock(); h.create(this.name(), this.players, this.settings.map); };
    $('btn-join').onclick = () => { h.unlock(); const c = $('in-code').value.trim().toUpperCase(); if (c.length !== 4) return this.menuMsg('방 코드는 4글자예요'); h.join(c, this.name()); };
    $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
    $('in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    $('in-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') (this.players === 1 ? $('btn-solo') : $('btn-create')).click(); });
    $('nav-settings').onclick = () => this.toggleSettings(true);
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
    // 게임 중 메뉴 (☰ 버튼 / Esc)
    $('btn-menu').onclick = () => this.togglePause(true);
    $('pm-resume').onclick = () => this.togglePause(false);
    $('pm-settings').onclick = () => { this.togglePause(false); this.toggleSettings(true); };
    $('pm-lobby').onclick = () => { this.togglePause(false); h.toLobby(); };
    $('pm-quit').onclick = () => { this.togglePause(false); h.leave(); };
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('modal-settings').classList.contains('hidden')) return this.toggleSettings(false);
      if (h.inGame()) return this.togglePause($('modal-pause').classList.contains('hidden'));
      this.toggleSettings(true);
    });
  }
  toggleSettings(on) { $('modal-settings').classList.toggle('hidden', !on); this.h.settingsOpen(on); }
  togglePause(on) { $('modal-pause').classList.toggle('hidden', !on); this.h.settingsOpen(on); }
  syncCamera() { $('set-cam').value = this.settings.camera || 'chase'; }
  menuMsg(t) { $('menu-msg').textContent = t || ''; }
  lobbyMsg(t) { const el = $('lobby-warn'); el.textContent = t; el.classList.remove('warn'); }

  screen(name) {
    for (const [k, id] of [['menu', 'screen-menu'], ['lobby', 'screen-lobby'], ['garage', 'screen-garage']]) $(id).classList.toggle('hidden', k !== name);
    $('hud').classList.toggle('hidden', name !== 'game');
    $('gl').style.visibility = name === 'game' ? 'visible' : 'hidden';
    $('menu-gl').style.visibility = name === 'menu' || name === 'garage' ? 'visible' : 'hidden';
    if (name === 'menu') { this.openPlay(false); }
  }
  wake(on, msg) { $('overlay-wake').classList.toggle('hidden', !on); if (msg) $('wake-msg').textContent = msg; }
  mobile() { $('overlay-wake').classList.add('hidden'); $('overlay-mobile').classList.remove('hidden'); }
  showError(text) { const e = $('errbox'); e.textContent = text; e.classList.remove('hidden'); }

  // ───── 로비 ─────
  setLobby(st) {
    this.lobbyState = st;
    $('lobby-code').textContent = st.code;
    const me = st.you, isHost = st.players[me] && st.players[me].host;
    $('lobby-size').textContent = st.size ? `${st.size}P` : '1·2·4P';
    $('lobby-maps').innerHTML = (st.maps || ['city']).map((id) => `<button class="map-card ${id === st.map ? 'on' : ''}" data-map="${id}" ${isHost ? '' : 'disabled'}><b>${(MAP_INFO[id] || { name: id }).name}</b><em>${MAP_INFO[id] ? (MAP_INFO[id].len / 1000).toFixed(1) + ' km' : ''}</em></button>`).join('');
    if (isHost) $('lobby-maps').querySelectorAll('.map-card').forEach((b) => { b.onclick = () => this.h.setMap(b.dataset.map); });
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
    document.querySelectorAll('#hud-keys .cap').forEach((c) => { const b = KEYS9.indexOf(c.dataset.k); c.classList.toggle('mine', !!(mine & (1 << b))); c.classList.remove('on'); });
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
    set('prog', Math.round(pct * 2000), () => { $('prog-fill').style.width = `${pct * 100}%`; $('prog-car').style.left = `${pct * 100}%`; $('prog-meta').textContent = `${Math.max(0, Math.round(v.sCar))} m / ${Math.round(map.length)} m`; });
    let si = 0; for (const s of map.sections) if (v.sCar >= s.s0) si = s.idx;
    set('sec', si + ':' + st.cp, () => { const s = map.sections[Math.max(0, si - 1)]; $('sec-name').textContent = `구간 ${s.idx}/${map.sections.length} · ${s.name}   ·   체크포인트 ${st.cp + 1}/${map.checkpoints.length}`; this.ticks.forEach((t, i) => t.classList.toggle('done', i <= st.cp)); });
    // 키 UI: 내가 누른 키는 즉시 켜짐
    set('keys', v.pressed + ':' + st.ex + ':' + st.k.join(','), () => {
      document.querySelectorAll('#hud-keys .cap').forEach((c) => { const b = KEYS9.indexOf(c.dataset.k); c.classList.toggle('on', !!(v.pressed & (1 << b))); });
      const all = st.k.reduce((a, b) => a | b, 0) | v.pressed;
      document.querySelectorAll('#carmap .ex').forEach((c) => c.classList.toggle('on', !!((st.ex | (v.pressed >> 4 & 15)) & (1 << +c.dataset.i)) && v.alive));
      // 바퀴 표시: 왼쪽(0,2) = Q/A, 오른쪽(1,3) = W/S
      document.querySelectorAll('#carmap .wh').forEach((c) => { const left = +c.dataset.i % 2 === 0; c.classList.toggle('on', !!(all & (left ? 5 : 10))); });
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
