// 키 배분: 인원수에 따라 누가 어떤 키(바퀴/배출구)를 담당하는지
// 비트: q=1 w=2 a=4 s=8 (바퀴: 좌앞 우앞 좌뒤 우뒤)  e=16 r=32 d=64 f=128 (배출구: 좌앞 우앞 좌뒤 우뒤)
import { KEY_BITS } from './config.js';

export const KEY_ORDER = ['q', 'w', 'a', 's', 'e', 'r', 'd', 'f', 'space'];
export const VALID_COUNTS = [1, 2, 4];

// 브레이크(스페이스)는 모든 플레이어가 누를 수 있다
export function layoutFor(n) {
  const b = KEY_BITS, br = b.space;
  if (n === 1) return [0x1ff];
  if (n === 2) return [b.q | b.a | b.e | b.d | br, b.w | b.s | b.r | b.f | br];       // 왼쪽 / 오른쪽
  if (n === 4) return [b.q | b.e | br, b.w | b.r | br, b.a | b.d | br, b.s | b.f | br];  // 좌상 / 우상 / 좌하 / 우하
  return null;
}
export const SLOT_NAMES = {
  1: ['전체 (8키 + 스페이스)'],
  2: ['왼쪽 (Q A E D)', '오른쪽 (W S R F)'],
  4: ['왼쪽 전진·앞 분사 (Q E)', '오른쪽 전진·앞 분사 (W R)', '왼쪽 후진·뒤 분사 (A D)', '오른쪽 후진·뒤 분사 (S F)'],
};
export const maskToKeys = (m) => KEY_ORDER.filter((k, i) => m & (1 << i));
export function lobbyMessage(n) {
  if (n === 3) return '3명은 플레이할 수 없습니다. 1, 2, 4명이 되어야 시작할 수 있어요';
  if (n < 1 || n > 4) return '인원이 맞지 않습니다';
  return '';
}
