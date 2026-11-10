// 장식 공용 색/도우미 (props.js 와 scenery.js 가 함께 쓴다)
import { hex } from './mesh.js';

export const K = {
  conc: hex(0x8d9096), concD: hex(0x62656c), dark: hex(0x24272e), metal: hex(0x454a54), steel: hex(0x9aa3ae), yellow: hex(0xf2b10a), red: hex(0xd8392c),
  green: hex(0x2f6b3f), brown: hex(0x5a4030), white: hex(0xe6e9ee), asphalt: hex(0x2a2c32), orange: hex(0xe8722a), rust: hex(0x7a4a36),
  grass: hex(0x3d6e34), rock: hex(0x5e5a55), sand: hex(0xc9b48a), blue: hex(0x2f6fb5), pink: hex(0xe86aa8), purple: hex(0x7a4ac8),
  lamp: [7.5, 5.2, 2.6], cyan: [0.4, 5.5, 6.5], red3: [7, 0.5, 0.6], green3: [0.5, 6.5, 2.2], orange3: [7, 2.6, 0.4], white3: [5.5, 5.5, 6],
};
export function neon(hue, k = 5) {
  const h = (((hue % 360) + 360) % 360) / 60, c = 1, x = c * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r * k, g * k, b * k];
}
// 낮은 채도 색 (hue 0~360, 밝기 v)
export function paint(hue, v = 0.7, sat = 0.75) { const n = neon(hue, 1); return [((1 - sat) + sat * n[0]) * v * v, ((1 - sat) + sat * n[1]) * v * v, ((1 - sat) + sat * n[2]) * v * v]; }
export const Z = (s) => -s;
// 청크로 잘린 긴 장식의 실제 그릴 범위 [a,b]
export const clipOf = (d) => [d.c0 !== undefined ? d.c0 : d.s0, d.c1 !== undefined ? d.c1 : d.s1];
// 원래 시작점(d.s0 + off) 기준 step 간격 위치 중 [a, min(b, s1-endPad)) 에 드는 것
export function every(d, off, step, a, b, endPad = 0) {
  const out = [], first = d.s0 + off + Math.max(0, Math.ceil((a - d.s0 - off) / step)) * step;
  for (let k = first; k < Math.min(b, d.s1 - endPad); k += step) out.push(k);
  return out;
}
