import * as THREE from 'three';
import { Obstacle, CollisionResult } from './Obstacles';

/**
 * Modular Track Segment Chunk
 */
export class CourseSegment {
  public group: THREE.Group = new THREE.Group();
  public obstacles: Obstacle[] = [];
  public length: number = 80;
  public startZ: number = 0;
  public endZ: number = 80;
  public moduleType: string = 'straight';
  public displayName: string = 'SPEED RUNWAY';
  public displayIcon: string = 'lightning';

  constructor(moduleType: string, displayName: string, displayIcon: string) {
    this.moduleType = moduleType;
    this.displayName = displayName;
    this.displayIcon = displayIcon;
  }

  public addObstacle(obstacle: Obstacle): void {
    this.obstacles.push(obstacle);
    this.group.add(obstacle.group);
  }

  public setPosition(z: number): void {
    this.startZ = z;
    this.endZ = z + this.length;
    this.group.position.z = z;
  }

  public update(delta: number): void {
    for (let i = 0; i < this.obstacles.length; i++) {
      this.obstacles[i].update(delta);
    }
  }

  public checkCollisions(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult[] {
    const hits: CollisionResult[] = [];
    const localBallPos = new THREE.Vector3(ballPos.x, ballPos.y, ballPos.z - this.startZ);

    for (let i = 0; i < this.obstacles.length; i++) {
      const res = this.obstacles[i].checkCollision(localBallPos, ballRadius, ballVel);
      if (res.hit) {
        if (res.bouncePos) {
          res.bouncePos.z += this.startZ;
        }
        hits.push(res);
      }
    }
    return hits;
  }

  /**
   * Proximity query for Near Misses against lethal obstacles
   */
  public checkNearMiss(ballPos: THREE.Vector3, radius: number): boolean {
    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];
      if (!obs.isLethal || obs.nearMissTriggered) continue;

      // Obstacle world position
      const obsWorldPos = obs.position.clone().add(this.group.position);
      const dist = obsWorldPos.distanceTo(ballPos);

      if (dist < radius && dist > 1.2) {
        obs.nearMissTriggered = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Release every GPU resource this segment owns.
   *
   * Segments were only ever removed from the scene graph, which drops the
   * JavaScript reference but leaves the buffers and programs alive on the GPU:
   * geometry count climbed ~5.5/second for the whole run and never came back
   * down. three does not reference-count, so this has to be explicit.
   */
  public dispose(): void {
    const seen = new Set<any>();
    this.group.traverse((o: any) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const m = o.material;
      if (!m) return;
      const list = Array.isArray(m) ? m : [m];
      for (const mat of list) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        // Textures are shared singletons from TextureGenerator — disposing
        // them here would pull them out from under every other segment.
        mat.dispose();
      }
    });
    this.group.clear();
    this.obstacles.length = 0;
  }

  public reset(): void {
    for (let i = 0; i < this.obstacles.length; i++) {
      this.obstacles[i].isActive = true;
      this.obstacles[i].nearMissTriggered = false;
      this.obstacles[i].group.visible = true;
    }
  }
}
