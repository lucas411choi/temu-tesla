// 차 시뮬레이션: 키 입력 → 연료 → 강체 물리 → 충돌. 서버 / 검증도구 공용.
import { CFG, BRAKE_BIT } from './config.js';
import { createCar, resetCar, stepCar, carOBBs } from './physics.js';

// q/a = 왼쪽 바퀴 전진/후진, w/s = 오른쪽 바퀴 전진/후진 (탱크식 조향). 바퀴 순서 [좌앞, 우앞, 좌뒤, 우뒤]
export const decodeKeys = (mask) => {
  const L = ((mask & 1) ? 1 : 0) - ((mask & 4) ? 1 : 0), R = ((mask & 2) ? 1 : 0) - ((mask & 8) ? 1 : 0);
  return { whl: [L, R, L, R], exh: [!!(mask & 16), !!(mask & 32), !!(mask & 64), !!(mask & 128)], brake: !!(mask & BRAKE_BIT) };
};

export class CarSim {
  constructor(world) {
    this.world = world;
    this.car = createCar();
    this.fuel = 100;
    this.lock = false;        // 연료 0 → 충전 재개까지 점화 금지
    this.exFiring = 0;        // 실제로 켜진 배출구 수(비트마스크)
    this.fuelUsed = 0;        // 누적 소모량(검증용)
  }
  spawn(x, y, z, yaw = 0) { resetCar(this.car, x, y, z, yaw); this.fuel = 100; this.lock = false; this.exFiring = 0; }
  get grounded() { return this.car.air < 0.12; }

  // 1틱(1/60초). T = 틱 시작 시각(서버 게임 시간). collide=false 이면 장애물 충돌 무시(무적)
  step(mask, dt, T, collide = true) {
    const { whl, exh, brake } = decodeKeys(mask);
    const canFire = !this.lock && this.fuel > 0;
    const exEff = [exh[0] && canFire, exh[1] && canFire, exh[2] && canFire, exh[3] && canFire];
    const n = exEff.filter(Boolean).length;
    this.exFiring = (exEff[0] ? 1 : 0) | (exEff[1] ? 2 : 0) | (exEff[2] ? 4 : 0) | (exEff[3] ? 8 : 0);
    const sub = CFG.SUBSTEPS, sdt = dt / sub, inp = { whl, exh: exEff, brake };
    let hit = null;
    for (let i = 0; i < sub; i++) {
      stepCar(this.car, inp, sdt, this.world);
      if ((i + 1) % CFG.COLLIDE_EVERY === 0) {
        if (this.car.p[1] < (this.world.killY !== undefined ? this.world.killY : CFG.RULES.killY)) { hit = { tag: 'fall' }; break; }
        if (collide) {
          hit = this.world.collide(carOBBs(this.car), this.car.p, T + (i + 1) * sdt);
          if (hit) break;
        }
      }
    }
    const F = CFG.FUEL;
    if (n > 0) { const d = n * F.burnPerExhaust * dt; this.fuel -= d; this.fuelUsed += d; }
    else this.fuel += (this.grounded ? F.rechargeGround : F.rechargeAir) * dt;
    if (this.fuel <= 0) { this.fuel = 0; this.lock = true; }
    if (this.lock && this.fuel >= F.relight) this.lock = false;
    if (this.fuel > 100) this.fuel = 100;
    return hit;
  }
}
