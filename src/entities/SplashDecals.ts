import * as THREE from 'three';
import { worldUniforms } from '../rendering/WorldUniforms';

/**
 * Paint splats left on the deck wherever the ball lands.
 *
 * They persist for a few seconds and fade, so a run leaves a visible trail of
 * where you have been — the stone remembers the line you took. Colour comes
 * from the ball's own skin, which is the only saturated thing in this palette
 * and therefore reads instantly against white marble.
 *
 * One InstancedMesh, one draw call, fixed capacity, oldest-first recycling.
 * Age and colour ride as per-instance attributes so the whole pool animates
 * from a single uniform (`uTime`) with no per-frame CPU work.
 */
export class SplashDecals {
  readonly mesh: THREE.InstancedMesh;

  private static readonly CAPACITY = 48;
  /** Seconds a splat lives before it has fully faded. */
  private static readonly LIFE = 4.2;

  private next = 0;
  private aSpawn: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aSeed: THREE.InstancedBufferAttribute;
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _p = new THREE.Vector3();
  private _s = new THREE.Vector3();

  constructor() {
    const N = SplashDecals.CAPACITY;

    // A plane lying in XZ. Kept low-poly because the shape is drawn in the
    // fragment stage, not built from geometry.
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.rotateX(-Math.PI / 2);

    this.aSpawn = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.aSeed = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    // Spawned far in the past so nothing is visible until a real landing.
    for (let i = 0; i < N; i++) this.aSpawn.setX(i, -999);
    geo.setAttribute('aSpawn', this.aSpawn);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aSeed', this.aSeed);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Sits a hair above the deck without z-fighting it.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        uTime: worldUniforms.uTime,
        uLife: { value: SplashDecals.LIFE },
      },
      vertexShader: /* glsl */ `
        attribute float aSpawn;
        attribute vec3 aColor;
        attribute float aSeed;
        uniform float uTime;
        uniform float uLife;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vAge;
        varying float vSeed;

        void main() {
          vUv = uv;
          vCol = aColor;
          vSeed = aSeed;
          vAge = clamp((uTime - aSpawn) / uLife, 0.0, 1.0);

          // Splats bloom outward fast on impact, then hold. easeOutBack-ish
          // overshoot gives the spread a bit of snap.
          float t = clamp((uTime - aSpawn) / 0.22, 0.0, 1.0);
          float grow = 1.0 - pow(1.0 - t, 3.0);
          float spread = mix(0.35, 1.0, grow) * (1.0 + 0.08 * sin(aSeed * 31.0));

          vec3 p = position * spread;
          vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vAge;
        varying float vSeed;

        float hash(vec2 p) {
          p = fract(p * vec2(233.34, 851.73));
          p += dot(p, p + 23.45);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }

        void main() {
          if (vAge >= 1.0) discard;

          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float ang = atan(d.y, d.x);

          // Irregular rim: a splat, not a decal circle. The lobes are seeded
          // per instance so no two landings leave the same mark.
          float lobes = noise(vec2(ang * 2.4 + vSeed * 17.0, vSeed * 5.0)) * 0.34
                      + noise(vec2(ang * 5.1 + vSeed * 41.0, 2.0)) * 0.16;
          float edge = 0.62 + lobes;

          float body = 1.0 - smoothstep(edge - 0.16, edge, r);
          if (body <= 0.001) discard;

          // A few satellite droplets flung clear of the main mass.
          float drops = smoothstep(0.55, 0.9,
            noise(vec2(ang * 3.0 + vSeed * 9.0, r * 6.0)));
          body = max(body, drops * (1.0 - smoothstep(edge, edge + 0.28, r)) * 0.75);

          // Wet centre reads brighter, drying to the rim.
          vec3 c = mix(vCol, vCol * 1.35 + 0.12, 1.0 - smoothstep(0.0, 0.7, r));

          // Holds, then fades over the back half of its life.
          float alpha = body * (1.0 - smoothstep(0.45, 1.0, vAge)) * 0.72;
          gl_FragColor = vec4(c, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.mesh = new THREE.InstancedMesh(geo, material, N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = N;

    // Park every instance out of sight until it is first used.
    for (let i = 0; i < N; i++) {
      this._m.makeTranslation(0, -9999, 0);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Mark the deck at a landing. `hardness` 0..1 scales the splat. */
  spawn(x: number, y: number, z: number, color: THREE.Color, hardness = 0.5): void {
    const i = this.next;
    this.next = (this.next + 1) % SplashDecals.CAPACITY;

    const size = 3.4 + hardness * 3.6;
    this._p.set(x, y + 0.06, z);
    this._q.setFromAxisAngle(_up, Math.random() * Math.PI * 2);
    this._s.set(size, 1, size);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;

    this.aSpawn.setX(i, worldUniforms.uTime.value);
    this.aColor.setXYZ(i, color.r, color.g, color.b);
    this.aSeed.setX(i, Math.random());
    this.aSpawn.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aSeed.needsUpdate = true;
  }

  /** Clear every mark, for the start of a run. */
  reset(): void {
    for (let i = 0; i < SplashDecals.CAPACITY; i++) this.aSpawn.setX(i, -999);
    this.aSpawn.needsUpdate = true;
    this.next = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

const _up = new THREE.Vector3(0, 1, 0);
