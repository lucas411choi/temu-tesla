// 맵 레지스트리: 새 맵을 추가하려면 build 함수를 등록한다.
import { buildCity } from './maps/city.js';
import { buildPark } from './maps/park.js';

const REGISTRY = { city: buildCity, park: buildPark };
// 로비/차고에서 보여 줄 맵 정보
export const MAP_INFO = {
  city: { name: '도시', desc: '튜토리얼 골목 → 도심 → 비계·크레인·공사 중인 건물 → 고가도로 → 시장 옥상 → 배관 위 → 현수교 → 터널 → 유리 다리 → 해안 부두', len: 6500, sections: 10 },
  park: { name: '놀이공원', desc: '정문 → 먹거리 거리 → 회전목마 → 코스터 레일 위 주행 → 대관람차·바이킹 → 유령의 집 → 성벽 길', len: 4150, sections: 7 },
};
const cache = {};
export function getMap(id = 'city') {
  if (!cache[id]) {
    if (!REGISTRY[id]) throw new Error(`알 수 없는 맵: ${id}`);
    cache[id] = REGISTRY[id]();
  }
  return cache[id];
}
export const MAP_LIST = Object.keys(REGISTRY);
