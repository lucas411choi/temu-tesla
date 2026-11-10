// 개발/테스트 전용 가짜 three.js (진짜 렌더링은 하지 않음): 클라이언트 코드가 예외 없이 실행되는지 Node/브라우저에서 점검하는 용도
export const SRGBColorSpace = 'srgb', RepeatWrapping = 1000, AdditiveBlending = 2, NormalBlending = 1, DoubleSide = 2, BackSide = 1, FrontSide = 0, ACESFilmicToneMapping = 4, PCFSoftShadowMap = 2, DynamicDrawUsage = 35048, HalfFloatType = 1016, NoToneMapping = 0;
export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); } clone() { return new Vector3(this.x, this.y, this.z); }
  setScalar(s) { return this.set(s, s, s); } applyQuaternion() { return this; } addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; } normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; return this.multiplyScalar(1 / l); } dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
export class Quaternion { constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; } set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } copy(q) { return this.set(q.x, q.y, q.z, q.w); } }
export class Color {
  constructor(r = 1, g, b) { this.set(r, g, b); }
  set(r, g, b) { if (g === undefined) { const h = typeof r === 'number' ? r : 0xffffff; this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; } else { this.r = r; this.g = g; this.b = b; } return this; }
  setRGB(r, g, b) { return this.set(r, g, b); } copy(c) { return this.set(c.r, c.g, c.b); } clone() { return new Color(this.r, this.g, this.b); }
  lerp(c, t) { this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  setHSL(h, s, l) { return this.set(l, l, l); } multiplyScalar(k) { this.r *= k; this.g *= k; this.b *= k; return this; }
}
class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }
export class Object3D {
  constructor() { this.position = new Vector3(); this.scale = new Vector3(1, 1, 1); this.rotation = new Euler(); this.quaternion = new Quaternion(); this.children = []; this.parent = null; this.visible = true; this.matrix = { set() {} }; this.matrixAutoUpdate = true; this.renderOrder = 0; this.castShadow = false; this.receiveShadow = false; this.frustumCulled = true; }
  add(...o) { for (const x of o) { if (x.parent) x.parent.remove(x); x.parent = this; this.children.push(x); } return this; }
  remove(...o) { for (const x of o) { const i = this.children.indexOf(x); if (i >= 0) { this.children.splice(i, 1); x.parent = null; } } return this; }
  lookAt() {} localToWorld(v) { return v.set(v.x + this.position.x, v.y + this.position.y, v.z + this.position.z); } updateMatrixWorld() {} traverse(fn) { fn(this); this.children.forEach((c) => c.traverse(fn)); }
}
export class Group extends Object3D {}
export class Scene extends Object3D { constructor() { super(); this.fog = null; this.environment = null; this.background = null; this.environmentIntensity = 1; } }
export class PerspectiveCamera extends Object3D { constructor(fov, aspect) { super(); this.fov = fov; this.aspect = aspect; } updateProjectionMatrix() {} }
export class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
export class InstancedMesh extends Mesh {}
class Light extends Object3D { constructor(c, i) { super(); this.color = new Color(c); this.intensity = i ?? 1; this.target = new Object3D(); this.shadow = { mapSize: new Vector2(), camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 }, bias: 0, normalBias: 0, map: null }; this.castShadow = false; } dispose() {} }
export class DirectionalLight extends Light {} export class PointLight extends Light {} export class SpotLight extends Light {}
export class HemisphereLight extends Light { constructor(a, b, i) { super(a, i); this.groundColor = new Color(b); } }
export class BufferAttribute { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } setUsage() { return this; } }
export class InstancedBufferAttribute extends BufferAttribute {}
export class BufferGeometry { constructor() { this.attributes = {}; this.index = null; } setAttribute(n, a) { this.attributes[n] = a; return this; } getAttribute(n) { return this.attributes[n]; } setIndex(i) { this.index = i; return this; } computeBoundingSphere() {} dispose() {} translate() { return this; } rotateX() { return this; } }
export class InstancedBufferGeometry extends BufferGeometry { constructor() { super(); this.instanceCount = 0; } }
class ArgGeometry extends BufferGeometry { constructor(...a) { super(); this.args = a; } }
export class BoxGeometry extends ArgGeometry {} export class PlaneGeometry extends ArgGeometry {} export class CylinderGeometry extends ArgGeometry {} export class ConeGeometry extends ArgGeometry {}
export class RingGeometry extends ArgGeometry {} export class CircleGeometry extends ArgGeometry {} export class SphereGeometry extends ArgGeometry {} export class IcosahedronGeometry extends ArgGeometry {}
export class TorusGeometry extends ArgGeometry {}
class Material {
  constructor(p = {}) { this.isMaterial = true; this.opacity = 1; this.map = null; Object.assign(this, p); this._p = p; this.color = p.color instanceof Color ? p.color : new Color(p.color === undefined ? 0xffffff : p.color); }
  clone() { return new this.constructor({ ...this._p, color: this.color.clone() }); } dispose() {} set needsUpdate(v) {}
}
export class MeshStandardMaterial extends Material {} export class MeshPhysicalMaterial extends Material {} export class MeshBasicMaterial extends Material {} export class ShaderMaterial extends Material {}
export class CanvasTexture { constructor(image) { this.image = image; this.repeat = new Vector2(1, 1); } clone() { return new CanvasTexture(this.image); } dispose() {} set needsUpdate(v) {} }
export class FogExp2 { constructor(c, d) { this.color = new Color(c); this.density = d; } }
export class WebGLRenderTarget { constructor(w, h, o) { this.width = w; this.height = h; this.o = o; } }
export class PMREMGenerator { fromScene() { return { texture: {} }; } dispose() {} }
export class WebGLRenderer {
  constructor(p) { this.domElement = p && p.canvas; this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 8 }; this.renders = 0; this.dpr = 1; }
  setPixelRatio(v) { this.dpr = v; } getPixelRatio() { return this.dpr; } setSize() {} render() { this.renders++; } dispose() {}
}
