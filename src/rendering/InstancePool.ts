import * as THREE from 'three';

/**
 * A fixed-capacity pool of instances sharing one geometry and one material.
 *
 * The scenery was one Mesh per column, per rail, per brazier — roughly 900 draw
 * calls for a world made of about eight distinct shapes. Everything out there
 * is the same handful of lathes repeated, which is precisely the case
 * instancing exists for: the whole colonnade becomes a single draw.
 *
 * Instances are addressed by index and can be moved freely, which is what the
 * endless world needs — recycling a column from behind the player to ahead of
 * them is a matrix write, not an allocation.
 */
export class InstancePool {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly capacity: number;
  private dirty = true;

  private static readonly _m = new THREE.Matrix4();
  private static readonly _q = new THREE.Quaternion();
  private static readonly _e = new THREE.Euler();
  private static readonly _p = new THREE.Vector3();
  private static readonly _s = new THREE.Vector3();

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    // Nothing is drawn until instances are actually claimed.
    this.mesh.count = 0;
  }

  /** Claim the next free index, or -1 if the pool is full. */
  claim(): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.mesh.count = this.count;
    return i;
  }

  set(
    i: number,
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    rx = 0, ry = 0, rz = 0,
  ): void {
    if (i < 0 || i >= this.count) return;
    const P = InstancePool;
    P._e.set(rx, ry, rz);
    P._q.setFromEuler(P._e);
    P._p.set(x, y, z);
    P._s.set(sx, sy, sz);
    P._m.compose(P._p, P._q, P._s);
    this.mesh.setMatrixAt(i, P._m);
    this.dirty = true;
  }

  /** Read an instance's Z, for recycle tests without shadowing state. */
  getZ(i: number): number {
    if (i < 0 || i >= this.count) return 0;
    this.mesh.getMatrixAt(i, InstancePool._m);
    return InstancePool._m.elements[14];
  }

  /** Shift one instance along Z, keeping its rotation and scale. */
  offsetZ(i: number, dz: number): void {
    if (i < 0 || i >= this.count) return;
    const P = InstancePool;
    this.mesh.getMatrixAt(i, P._m);
    P._m.elements[14] += dz;
    this.mesh.setMatrixAt(i, P._m);
    this.dirty = true;
  }


  /** Upload changed matrices. Cheap to call every frame; a no-op when clean. */
  flush(): void {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
