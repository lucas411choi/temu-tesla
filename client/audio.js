// 외부 음원 없이 Web Audio API로 모두 합성한다. 위험물 소리는 가장 가까운 것 하나를 거리 감쇠 + 좌우 패닝으로 들려준다.
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class GameAudio {
  constructor() { this.ctx = null; this.vol = 0.8; this.muted = false; this.tension = 0; this.hv = {}; this.lastWarn = 0; this.lastBell = 0; this.lastChirp = 0; this.prev = {}; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    try { this.build(); } catch (e) { console.warn('오디오 초기화 실패', e); this.ctx = null; }
  }
  setVolume(v) { this.vol = v; this.apply(); }
  setMuted(m) { this.muted = m; this.apply(); }
  apply() { if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.03); }

  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.2; this.mus.connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const loopNoise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const chain = (src, nodes, dest) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } n.connect(dest); return n; };
    const filt = (type, f, q = 0.7) => { const x = c.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
    const gain = (v = 0) => { const g = c.createGain(); g.gain.value = v; return g; };
    // 배출구 4개 (좌우 패닝)
    this.ex = [];
    for (let i = 0; i < 4; i++) {
      const g = gain(0), bp = filt('bandpass', 800, 0.6), pan = c.createStereoPanner(); pan.pan.value = (i % 2 ? 1 : -1) * 0.6;
      chain(loopNoise(), [bp, g, pan], this.sfx);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58 + i * 3; const g2 = gain(0), lp = filt('lowpass', 220);
      o.connect(lp); lp.connect(g2); g2.connect(pan); o.start();
      this.ex.push({ g, bp, g2 });
    }
    // 바퀴 구동음
    this.wh = { o: c.createOscillator(), g: gain(0), lp: filt('lowpass', 520) };
    this.wh.o.type = 'sawtooth'; this.wh.o.frequency.value = 50; this.wh.o.connect(this.wh.lp); this.wh.lp.connect(this.wh.g); this.wh.g.connect(this.sfx); this.wh.o.start();
    // 도시 환경음 / 비
    this.amb = gain(0.05); chain(loopNoise(), [filt('lowpass', 260)], this.amb); this.amb.connect(this.sfx);
    this.rain = gain(0); chain(loopNoise(), [filt('highpass', 2600)], this.rain); this.rain.connect(this.sfx);
    this.hum = c.createOscillator(); this.hum.type = 'sine'; this.hum.frequency.value = 50; const hg = gain(0.02); this.hum.connect(hg); hg.connect(this.sfx); this.hum.start();
    this.buildHazardVoices(loopNoise, chain, filt, gain);
    this.nextNote = c.currentTime + 0.2; this.step = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }

  buildHazardVoices(loopNoise, chain, filt, gain) {
    const c = this.ctx, H = this.hv, mk = (name, build) => { const g = gain(0), pan = c.createStereoPanner(); g.connect(pan); pan.connect(this.sfx); H[name] = { g, pan, ...build(g) }; };
    mk('laser', (g) => { const a = c.createOscillator(), b = c.createOscillator(), lp = filt('lowpass', 800); a.type = b.type = 'sawtooth'; a.frequency.value = 110; b.frequency.value = 113.5; a.connect(lp); b.connect(lp); lp.connect(g); a.start(); b.start(); return { a, b }; });
    mk('fire', (g) => { chain(loopNoise(), [filt('bandpass', 950, 0.5)], g); return {}; });
    mk('steam', (g) => { chain(loopNoise(), [filt('highpass', 3200)], g); return {}; });
    mk('arc', (g) => { const bp = filt('bandpass', 3400, 2); chain(loopNoise(), [bp], g); return { bp }; });
    mk('siren', (g) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 800; const lp = filt('lowpass', 2400); o.connect(lp); lp.connect(g); o.start(); return { o }; });
    mk('car', (g) => { const o = c.createOscillator(), lp = filt('lowpass', 420); o.type = 'sawtooth'; o.frequency.value = 70; o.connect(lp); lp.connect(g); o.start(); return { o }; });
    mk('saw', (g) => { const o = c.createOscillator(), bp = filt('bandpass', 1800, 1.2); o.type = 'sawtooth'; o.frequency.value = 320; o.connect(bp); bp.connect(g); o.start(); return { o }; });
    mk('drone', (g) => { const a = c.createOscillator(), b = c.createOscillator(); a.type = b.type = 'square'; a.frequency.value = 150; b.frequency.value = 156; const lp = filt('lowpass', 900); a.connect(lp); b.connect(lp); lp.connect(g); a.start(); b.start(); return {}; });
    mk('ball', (g) => { chain(loopNoise(), [filt('lowpass', 420)], g); return {}; });
    mk('barrel', (g) => { chain(loopNoise(), [filt('lowpass', 260)], g); return {}; });
    mk('press', (g) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 900; o.connect(g); o.start(); return { o }; });
    mk('debris', (g) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1600; o.connect(g); o.start(); return { o }; });
    mk('barricade', (g) => { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 740; o.connect(g); o.start(); return { o }; });
  }

  // ───── 일회성 효과음 ─────
  tone(f, dur, type = 'sine', vol = 0.25, f2 = null, when = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, f0, f1, vol = 0.6, type = 'lowpass') {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; lp.type = type; lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(lp); lp.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.1);
  }
  explosion() { this.noiseBurst(1.8, 4200, 70, 1.0); this.noiseBurst(0.5, 9000, 800, 0.5, 'highpass'); this.tone(95, 0.7, 'sine', 0.9, 28); for (let i = 0; i < 6; i++) this.tone(300 + Math.random() * 900, 0.08, 'square', 0.08, null, 0.1 + i * 0.12 + Math.random() * 0.05); }
  checkpoint() { [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.22, null, i * 0.07)); }
  go() { this.tone(1100, 0.5, 'square', 0.18); }
  tick() { this.tone(620, 0.1, 'square', 0.15); }
  respawn() { this.tone(180, 0.55, 'sine', 0.3, 1400); }
  finish() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.25, null, i * 0.13)); }
  click() { this.tone(900, 0.05, 'square', 0.1); }
  crash() { this.noiseBurst(0.4, 1800, 200, 0.4); }

  // ───── 매 프레임 ─────
  // s: { ex(4bit), wheels(눌린 바퀴 수), speed, grounded, fuel, alive, car:[x,y,z], hz:[...audio], rain, dt, now }
  update(s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    const n = [0, 1, 2, 3].filter((i) => (s.ex >> i) & 1).length;
    this.ex.forEach((e, i) => {
      const on = s.alive && (s.ex >> i) & 1;
      e.g.gain.setTargetAtTime(on ? 0.2 : 0, t, 0.04); e.g2.gain.setTargetAtTime(on ? 0.08 : 0, t, 0.05);
      e.bp.frequency.setTargetAtTime(520 + (4 - n) * 140, t, 0.1);
    });
    const spd = s.speed;
    this.wh.o.frequency.setTargetAtTime(42 + spd * 8, t, 0.08);
    this.wh.g.gain.setTargetAtTime(s.alive && s.grounded ? Math.min(0.1, s.wheels * 0.022 + spd * 0.003) : 0, t, 0.08);
    this.rain.gain.setTargetAtTime((s.rain || 0) * 0.07, t, 0.5);
    this.amb.gain.setTargetAtTime(0.045 + (s.tunnel ? 0.03 : 0), t, 0.5);
    // 연료 경고음
    if (s.alive && s.fuel <= 20 && s.fuel > 0 && s.now - this.lastWarn > 0.25 + s.fuel * 0.02) { this.lastWarn = s.now; this.tone(920, 0.07, 'square', 0.12); }
    // 위험물 소리: 종류별로 가장 가까운 소스 1개
    const best = {};
    for (const a of s.hz) { const d = Math.hypot(a.x - s.car[0], (a.y - s.car[1]) * 0.5, a.z - s.car[2]); if (!best[a.k] || d < best[a.k].d) best[a.k] = { a, d }; }
    for (const k of Object.keys(this.hv)) {
      const v = this.hv[k], b = best[k], tt = s.now;
      if (!b || b.d > 110 || !s.alive) { v.g.gain.setTargetAtTime(0, t, 0.1); continue; }
      const a = b.a, att = 1 / (1 + Math.pow(b.d / 16, 2)), pan = clamp((a.x - s.car[0]) / 24, -1, 1);
      v.pan.pan.setTargetAtTime(pan, t, 0.05);
      let g = 0;
      switch (k) {
        case 'laser': g = a.lvl === 2 ? 0.16 : a.lvl === 1 ? (Math.floor(tt * 14) % 2 ? 0.1 : 0) : 0.02; v.a.frequency.value = a.lvl === 1 ? 220 : 110; break;
        case 'fire': g = a.lvl === 2 ? 0.34 : a.warn ? 0.1 + 0.06 * Math.sin(tt * 30) : 0; break;
        case 'steam': g = a.lvl === 2 ? 0.2 : a.warn ? 0.06 : 0; break;
        case 'arc': g = a.lvl === 2 ? 0.14 * Math.random() : a.warn ? 0.04 * Math.random() : 0; break;
        case 'siren': g = 0.12; v.o.frequency.setTargetAtTime(850 + 280 * Math.sin(tt * 8), t, 0.02); break;
        case 'car': g = 0.07; v.o.frequency.setTargetAtTime(48 + (a.spd || 0) * 3.2, t, 0.1); break;
        case 'saw': g = 0.1; v.o.frequency.setTargetAtTime(280 + 80 * Math.sin(tt * 40), t, 0.02); break;
        case 'drone': g = 0.05; break;
        case 'ball': g = 0.12; break;
        case 'barrel': g = 0.14; break;
        case 'press': g = a.warn ? (Math.floor(tt * 12) % 2 ? 0.1 : 0) : 0; break;
        case 'debris': g = a.warn ? 0.07 : 0; v.o.frequency.setTargetAtTime(1900 - 1500 * (a.f || 0), t, 0.02); break;
        case 'barricade': g = Math.floor(tt * 4) % 2 ? 0.04 : 0; break;
        default: break;
      }
      v.g.gain.setTargetAtTime(g * att * 1.6, t, 0.04);
    }
    // 이벤트성 소리 (열차 종, 새, 부서짐)
    const tr = best.train; if (tr && tr.d < 90 && tr.a.bell && s.now - this.lastBell > 0.5) { this.lastBell = s.now; this.tone(1250, 0.4, 'sine', 0.16 / (1 + tr.d / 25)); this.tone(1860, 0.3, 'sine', 0.08 / (1 + tr.d / 25)); }
    const bd = best.bird; if (bd && bd.d < 55 && s.now - this.lastChirp > 0.35) { this.lastChirp = s.now + Math.random() * 0.5; this.tone(2200 + Math.random() * 1400, 0.09, 'sine', 0.05 / (1 + bd.d / 20), 3400 + Math.random() * 800); }
    const cr = best.crash; if (cr && cr.d < 60 && s.now - (this.prev.crash || 0) > 0.3) { this.prev.crash = s.now; this.crash(); }
  }

  // ───── 배경 음악 (신스웨이브 루프) ─────
  scheduleMusic() {
    const c = this.ctx; if (!c) return;
    const spb = 60 / 108 / 4;                         // 16분음표
    while (this.nextNote < c.currentTime + 0.35) { this.playStep(this.step, this.nextNote); this.nextNote += spb; this.step++; }
  }
  playStep(step, t) {
    const c = this.ctx, bar = Math.floor(step / 16) % 4, pos = step % 16;
    const roots = [45, 41, 48, 43], chords = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
    const ch = chords[bar], root = roots[bar];
    const env = (g, a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    const note = (f, type, dur, vol, cut) => { const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = cut; env(g, 0.01, dur, vol); o.connect(lp); lp.connect(g); g.connect(this.mus); o.start(t); o.stop(t + dur + 0.05); };
    if (pos % 2 === 0) note(mtof(root + (pos % 8 === 6 ? 12 : 0)), 'sawtooth', 0.22, 0.5, 520);       // 베이스
    const arp = [0, 1, 2, 1, 0, 2, 1, 2][pos % 8]; if (pos % 1 === 0) note(mtof(ch[arp] + 12), 'square', 0.1, 0.07 + this.tension * 0.05, 1800 + this.tension * 1500);
    if (pos === 0) for (const n of ch) for (const det of [-7, 7]) { const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(n) * Math.pow(2, det / 1200); o.detune.value = det; lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.6); g.gain.setValueAtTime(0.06, t + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2); o.connect(lp); lp.connect(g); g.connect(this.mus); o.start(t); o.stop(t + 2.3); }
    if (pos % 4 === 0) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14); env(g, 0.005, 0.2, 0.9); o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + 0.3); }
    if (pos % 8 === 4 || (pos % 16 === 14 && this.tension > 0.4)) { const s = c.createBufferSource(), g = c.createGain(), hp = c.createBiquadFilter(); s.buffer = this.noiseBuf; hp.type = 'highpass'; hp.frequency.value = 1500; env(g, 0.002, 0.14, 0.35); s.connect(hp); hp.connect(g); g.connect(this.mus); s.start(t); s.stop(t + 0.2); }
    if (pos % 2 === 1) { const s = c.createBufferSource(), g = c.createGain(), hp = c.createBiquadFilter(); s.buffer = this.noiseBuf; hp.type = 'highpass'; hp.frequency.value = 7000; env(g, 0.001, 0.04, 0.18); s.connect(hp); hp.connect(g); g.connect(this.mus); s.start(t); s.stop(t + 0.08); }
  }
}
