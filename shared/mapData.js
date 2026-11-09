// 맵 레지스트리: 새 맵을 추가하려면 build 함수를 등록한다.
import { buildCity } from './maps/city.js';

const REGISTRY = { city: buildCity };
const cache = {};
export function getMap(id = 'city') {
  if (!cache[id]) {
    if (!REGISTRY[id]) throw new Error(`알 수 없는 맵: ${id}`);
    cache[id] = REGISTRY[id]();
  }
  return cache[id];
}
export const MAP_LIST = Object.keys(REGISTRY);
