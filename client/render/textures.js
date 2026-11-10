// 외부 이미지 없이 캔버스로 만드는 프로시저럴 텍스처 (도로/인도/건물 창문/경고 줄무늬/간판/글로우)
import { makeRng } from '../../shared/math.js';

const FONT = '"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR","Segoe UI",Arial,sans-serif';
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function tex(THREE, canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// 24m(x) × 12m(z) 한 타일: 차선/중앙선/가장자리선이 있는 젖은 아스팔트. 가로는 반복 안 함, 세로(z)만 반복.
function roadTextures(THREE, aniso) {
  const W = 768, H = 384, ppm = 32;
  const c = cv(W, H), g = c.getContext('2d');
  const r = cv(W, H), gr = r.getContext('2d');
  const rng = makeRng(77);
  g.fillStyle = '#30343b'; g.fillRect(0, 0, W, H);
  gr.fillStyle = '#c0c0c0'; gr.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rng() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 1.05; }
  g.putImageData(img, 0, 0);
  // 바퀴 자국(차선 중앙)
  for (const lx of [-10, -6, -2, 2, 6, 10]) for (const off of [-0.75, 0.75]) { g.fillStyle = 'rgba(10,12,16,0.22)'; g.fillRect((lx + off + 12) * ppm - 14, 0, 28, H); gr.fillStyle = 'rgba(70,70,70,0.5)'; gr.fillRect((lx + off + 12) * ppm - 14, 0, 28, H); }
  // 웅덩이 (거칠기 낮음 = 반사)
  for (let i = 0; i < 26; i++) {
    const x = rng() * W, y = rng() * H, rx = 18 + rng() * 60, ry = 8 + rng() * 26;
    gr.fillStyle = `rgba(${40 + rng() * 40},${40 + rng() * 40},${40 + rng() * 40},0.8)`; gr.beginPath(); gr.ellipse(x, y, rx, ry, rng() * 3, 0, 7); gr.fill();
    g.fillStyle = 'rgba(14,18,26,0.35)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill();
  }
  // 균열
  g.strokeStyle = 'rgba(8,8,10,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { let x = rng() * W, y = rng() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
  // 차선: x=-8,-4,4,8 흰 점선(3m 선 / 9m 공백), 중앙 노란 이중선, 가장자리 흰 실선
  const xp = (x) => (x + 12) * ppm;
  g.fillStyle = '#d8dbe0';
  for (const lx of [-8, -4, 4, 8]) g.fillRect(xp(lx) - 3.5, 0, 7, 3 * ppm);
  g.fillRect(xp(-11.55) - 3.5, 0, 7, H); g.fillRect(xp(11.55) - 3.5, 0, 7, H);
  g.fillStyle = '#e7b923'; g.fillRect(xp(-0.2) - 3, 0, 6, H); g.fillRect(xp(0.2) - 3, 0, 6, H);
  gr.fillStyle = '#9a9a9a'; for (const lx of [-8, -4, 4, 8]) gr.fillRect(xp(lx) - 3.5, 0, 7, 3 * ppm);
  return { map: tex(THREE, c, { aniso }), rough: tex(THREE, r, { srgb: false, aniso }) };
}

function paveTexture(THREE, aniso) {
  const c = cv(256, 256), g = c.getContext('2d'), rng = makeRng(5);
  g.fillStyle = '#4b4d55'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rng() * 255 | 0},${rng() * 255 | 0},${rng() * 255 | 0},0.05)`; g.fillRect(rng() * 256, rng() * 256, 2, 2); }
  g.strokeStyle = 'rgba(20,20,26,0.8)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  return tex(THREE, c, { aniso });
}

// 건물 파사드(4종): 가로 3.2m × 세로 3.6m 창문 격자 8×8. emissive 맵에는 불 켜진 창문만 그린다.
function facadeTextures(THREE, aniso) {
  const out = [];
  const specs = [
    { wall: '#3b4252', frame: '#222733', glass: ['#142033', '#1d3350'], cols: ['#ffd27a', '#ffe9b8', '#bfe3ff'], lit: 0.5, w: 40, h: 46, mode: 'office' },
    { wall: '#5d6168', frame: '#3b3e44', glass: ['#1a2230', '#253144'], cols: ['#ffcf7d', '#ffb85c', '#fff1cf'], lit: 0.4, w: 26, h: 32, mode: 'flat' },
    { wall: '#6a4338', frame: '#3a231d', glass: ['#1a1d26', '#232838'], cols: ['#ffd9a0', '#ffc070', '#ffe8c8'], lit: 0.38, w: 24, h: 34, mode: 'brick' },
    { wall: '#1b1f2e', frame: '#0e1119', glass: ['#0d1624', '#122238'], cols: ['#35f0ff', '#ff3df0', '#7dffb0', '#ffd24a'], lit: 0.62, w: 44, h: 50, mode: 'neon' },
  ];
  specs.forEach((sp, si) => {
    const rng = makeRng(100 + si), S = 512, N = 8, cell = S / N;
    const c = cv(S, S), g = c.getContext('2d'), e = cv(S, S), ge = e.getContext('2d');
    g.fillStyle = sp.wall; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    if (sp.mode === 'brick') { g.strokeStyle = 'rgba(20,10,8,0.5)'; g.lineWidth = 1; for (let y = 0; y < S; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); for (let x = (y / 8 % 2) * 12; x < S; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } } }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${rng() * 60 | 0},${rng() * 60 | 0},${rng() * 70 | 0},0.07)`; g.fillRect(rng() * S, rng() * S, 3, 3); }
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      const x0 = cx * cell, y0 = cy * cell, ww = sp.w * (cell / 64), hh = sp.h * (cell / 64);
      const x = x0 + (cell - ww) / 2, y = y0 + (cell - hh) / 2 + (sp.mode === 'flat' ? 2 : 0);
      g.fillStyle = sp.frame; g.fillRect(x - 3, y - 3, ww + 6, hh + 6);
      const gg = g.createLinearGradient(x, y, x + ww, y + hh); gg.addColorStop(0, sp.glass[0]); gg.addColorStop(1, sp.glass[1]);
      g.fillStyle = gg; g.fillRect(x, y, ww, hh);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x + ww * 0.6, y); g.lineTo(x + ww, y); g.lineTo(x + ww * 0.4, y + hh); g.fill();
      if (rng() < sp.lit) {
        const col = sp.cols[rng() * sp.cols.length | 0], k = 0.5 + rng() * 0.5;
        ge.globalAlpha = k; ge.fillStyle = col; ge.fillRect(x, y, ww, hh);
        if (rng() < 0.5) { ge.globalAlpha = k * 0.6; ge.fillStyle = '#000'; ge.fillRect(x + ww * 0.5, y, ww * 0.12, hh); }
        ge.globalAlpha = 1;
        g.fillStyle = col; g.globalAlpha = 0.18 * k; g.fillRect(x, y, ww, hh); g.globalAlpha = 1;
      }
    }
    if (sp.mode === 'neon') { g.fillStyle = '#35f0ff'; for (let i = 0; i < N; i += 2) g.fillRect(i * cell + cell - 3, 0, 3, S); ge.fillStyle = '#35f0ff'; for (let i = 0; i < N; i += 2) ge.fillRect(i * cell + cell - 3, 0, 3, S); }
    out.push({ map: tex(THREE, c, { aniso }), emissive: tex(THREE, e, { aniso }) });
  });
  out.push(circusFacade(THREE, aniso), castleFacade(THREE, aniso));
  return out;
}

// 놀이공원 파빌리온: 창문 격자 없이 세로 줄무늬 + 아치 장식 + 전구 (색은 정점색으로 입힌다)
function circusFacade(THREE, aniso) {
  const S = 512, c = cv(S, S), g = c.getContext('2d'), e = cv(S, S), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4efe6' : '#bfb6aa'; g.fillRect(i * 64, 0, 64, S); }
  for (let row = 0; row < 2; row++) {
    const y0 = row * 256;
    g.fillStyle = '#8a7d6e'; g.fillRect(0, y0 + 236, S, 20);
    for (let k = 0; k < 4; k++) {
      const cx = k * 128 + 64;
      g.fillStyle = '#3a3440'; g.beginPath(); g.moveTo(cx - 34, y0 + 220); g.lineTo(cx - 34, y0 + 120); g.arc(cx, y0 + 120, 34, Math.PI, 0); g.lineTo(cx + 34, y0 + 220); g.fill();
      g.strokeStyle = '#e8c070'; g.lineWidth = 5; g.stroke();
      ge.fillStyle = '#ffd88a'; ge.globalAlpha = 0.35; ge.fillRect(cx - 30, y0 + 140, 60, 78); ge.globalAlpha = 1;
      for (let a = 0; a <= 12; a++) { const t = Math.PI + a * Math.PI / 12, px = cx + Math.cos(t) * 42, py = y0 + 120 + Math.sin(t) * 42; ge.fillStyle = a % 2 ? '#ffe9a0' : '#ff8ad8'; ge.beginPath(); ge.arc(px, py, 3.5, 0, 7); ge.fill(); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(px, py, 3.5, 0, 7); g.fill(); }
    }
    for (let x = 8; x < S; x += 16) { ge.fillStyle = (x / 16) % 3 < 1 ? '#ffe9a0' : (x / 16) % 3 < 2 ? '#7ae8ff' : '#ff8ad8'; ge.beginPath(); ge.arc(x, y0 + 30, 3, 0, 7); ge.fill(); g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(x, y0 + 30, 3, 0, 7); g.fill(); }
  }
  return { map: tex(THREE, c, { aniso }), emissive: tex(THREE, e, { aniso }) };
}
// 성벽: 돌 블록 + 드문 화살창(불빛)
function castleFacade(THREE, aniso) {
  const S = 512, c = cv(S, S), g = c.getContext('2d'), e = cv(S, S), ge = e.getContext('2d'), rng = makeRng(404);
  g.fillStyle = '#7d766c'; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < S; x += 64) {
    const v = 100 + rng() * 40 | 0; g.fillStyle = `rgb(${v + 10},${v + 4},${v - 6})`; g.fillRect(x + 2, y + 2, 60, 28);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 2, y + 24, 60, 6);
  }
  for (let k = 0; k < 6; k++) { const x = 40 + (k % 3) * 170 + rng() * 20, y = 60 + Math.floor(k / 3) * 256 + rng() * 40; g.fillStyle = '#1a1612'; g.fillRect(x, y, 14, 60); g.beginPath(); g.arc(x + 7, y, 7, Math.PI, 0); g.fill(); if (rng() < 0.6) { ge.fillStyle = '#ffb860'; ge.fillRect(x + 2, y, 10, 58); } }
  return { map: tex(THREE, c, { aniso }), emissive: tex(THREE, e, { aniso }) };
}

function stripeTexture(THREE, aniso) {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = '#1a1b1e'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f2b10a';
  for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 128, 128); g.lineTo(i * 32 + 128, 128); g.closePath(); g.fill(); }
  const rng = makeRng(9); for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.15})`; g.fillRect(rng() * 128, rng() * 128, 3, 3); }
  return tex(THREE, c, { aniso });
}
function concreteTexture(THREE, aniso) {
  const c = cv(256, 256), g = c.getContext('2d'), rng = makeRng(21);
  g.fillStyle = '#8a8d92'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) { const v = 100 + rng() * 80 | 0; g.fillStyle = `rgba(${v},${v},${v + 4},0.18)`; g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 4, 2 + rng() * 4); }
  return tex(THREE, c, { aniso });
}
function glowTexture(THREE) {
  const c = cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(THREE, c, { repeat: false });
}

export function makeTextures(THREE, aniso = 8) {
  const road = roadTextures(THREE, aniso);
  const cache = new Map();
  const T = {
    road: road.map, roadRough: road.rough, pave: paveTexture(THREE, aniso), facades: facadeTextures(THREE, aniso),
    stripe: stripeTexture(THREE, aniso), concrete: concreteTexture(THREE, aniso), glow: glowTexture(THREE),
    // 글자 간판: neon=true 이면 어두운 배경 + 발광 글자
    sign(text, { fg = '#39ff88', bg = '#0b1410', w = 512, h = 128, neon = true, hue } = {}) {
      const key = `${text}|${fg}|${bg}|${w}|${h}|${neon}|${hue}`;
      if (cache.has(key)) return cache.get(key);
      const c = cv(w, h), g = c.getContext('2d');
      let col = fg;
      if (hue !== undefined) col = `hsl(${hue},100%,62%)`;
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, bg); grad.addColorStop(1, '#000');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      let size = h * 0.56; g.font = `bold ${size}px ${FONT}`;
      while (g.measureText(text).width > w - 40 && size > 12) { size -= 4; g.font = `bold ${size}px ${FONT}`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (neon) { g.shadowColor = col; g.shadowBlur = 18; }
      g.fillStyle = col; g.fillText(text, w / 2, h / 2 + 3); g.fillText(text, w / 2, h / 2 + 3);
      const t = tex(THREE, c, { repeat: false });
      cache.set(key, t);
      return t;
    },
    dispose() { cache.forEach((t) => t.dispose()); },
  };
  return T;
}
