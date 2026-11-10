// 맵 레지스트리: 새 맵을 추가하려면 build 함수를 등록한다.
import { buildCity } from './maps/city.js';
import { buildPark } from './maps/park.js';

const REGISTRY = { city: buildCity, park: buildPark };
// 로비/차고에서 보여 줄 맵 정보
export const MAP_INFO = {
  city: { name: '도시', desc: '골목 → 도심 → 공사장 → 고가도로 → 네온 시장 → 공업 지구 → 현수교 → 터널 → 마천루 → 새벽 해안', len: 9000, sections: 10 },
  park: { name: '놀이공원', desc: '정문 → 먹거리 거리 → 회전목마 → 롤러코스터 → 대관람차·바이킹 → 유령의 집 → 불꽃놀이 성', len: 6300, sections: 7 },
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
