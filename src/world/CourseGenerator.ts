import * as THREE from 'three';
import { HEX } from '../rendering/Palette';
import { CourseSegment } from './CourseSegment';
import { ModuleFactory } from './Modules';
import { CollisionResult, TrackPlatform, BouncePad, SpringPad, CollapsingPlatform } from './Obstacles';
import { CONSTANTS } from '../config/constants';
import { GameModeId, GAME_MODES, getDailySeed } from '../config/modes';

/**
 * Modular Dynamic Course Generator
 * Spawns progressing challenge modules, serpentine stepping paths,
 * moving hazard gauntlets, and finish lines.
 */
export class CourseGenerator {
  public group: THREE.Group = new THREE.Group();
  private activeSegments: CourseSegment[] = [];
  private nextSpawnZ: number = 0;
  private segmentCount: number = 0;
  private currentMode: GameModeId = 'arcade';
  private randomSeed: number = 123456;
  private hasSpawnedFinishLine: boolean = false;
  private currentSpeed: number = CONSTANTS.BASE_SPEED;
  private difficulty: number = 0;

  constructor(mode: GameModeId = 'arcade') {
    this.currentMode = mode;
    this.initInitialTrack();
  }

  public setMode(mode: GameModeId, seed?: number): void {
    this.currentMode = mode;
    if (mode === 'daily') {
      this.randomSeed = getDailySeed();
    } else if (seed !== undefined) {
      this.randomSeed = seed;
    } else {
      this.randomSeed = Math.floor(Math.random() * 1000000);
    }
    this.reset();
  }

  /**
   * Deterministic Pseudo-Random Number Generator (PRNG)
   */
  private nextRandom(): number {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }

  private initInitialTrack(): void {
    this.nextSpawnZ = -30;
    this.segmentCount = 0;
    this.hasSpawnedFinishLine = false;

    // Segment 0: Warm-up Starter runway
    const startSeg = ModuleFactory.createStarterRunway();
    this.attachSegment(startSeg);

    // Populate initial forward track
    for (let i = 0; i < CONSTANTS.SPAWN_AHEAD_COUNT; i++) {
      this.spawnNextSegment();
    }
  }

  private spawnNextSegment(): void {
    const dist = this.nextSpawnZ;
    const modeConfig = GAME_MODES[this.currentMode];
    let seg: CourseSegment;

    // Check if we should spawn the Finish Line in level-based modes
    if (modeConfig.hasFinishLine && !this.hasSpawnedFinishLine && dist >= modeConfig.finishDistance - 100) {
      this.hasSpawnedFinishLine = true;
      seg = ModuleFactory.createFinishLine();
      this.attachSegment(seg);
      return;
    }

    if (this.hasSpawnedFinishLine) {
      // Endless runway after victory gate
      seg = ModuleFactory.createStarterRunway();
      this.attachSegment(seg);
      return;
    }

    const r = this.nextRandom();

    // Road first, platforms as punctuation.
    //
    // Every tier used to be island-hopping, so the game was one correct line
    // from start to finish with nowhere to move. The causeway is now the
    // default surface and the platform modules are the exception — they read
    // as a deliberate change of terrain instead of being the whole game.
    const causewayVariant = this.segmentCount % 3;

    if (dist < 180) {
      // Opening: road only, so the player learns to move before they learn to
      // survive. One island module at the end as a first taste.
      if (r < 0.7) seg = ModuleFactory.createCauseway(causewayVariant);
      else seg = ModuleFactory.createOpenPlaza();
    } else if (dist < 450) {
      if (r < 0.45) seg = ModuleFactory.createCauseway(causewayVariant);
      else if (r < 0.60) seg = ModuleFactory.createOpenPlaza();
      else if (r < 0.75) seg = ModuleFactory.createSlalomHazard();
      else if (r < 0.90) seg = ModuleFactory.createSawline();
      else seg = ModuleFactory.createSerpentineIslands();
    } else if (dist < 800) {
      if (r < 0.38) seg = ModuleFactory.createCauseway(causewayVariant);
      else if (r < 0.50) seg = ModuleFactory.createOpenPlaza();
      else if (r < 0.62) seg = ModuleFactory.createSplitRisk();
      else if (r < 0.74) seg = ModuleFactory.createSweepBarChamber();
      else if (r < 0.86) seg = ModuleFactory.createPinballAlley();
      else seg = ModuleFactory.createAirtimeLeap();
    } else {
      if (r < 0.32) seg = ModuleFactory.createCauseway(causewayVariant);
      else if (r < 0.42) seg = ModuleFactory.createOpenPlaza();
      else if (r < 0.58) seg = ModuleFactory.createChaosGauntlet();
      else if (r < 0.72) seg = ModuleFactory.createGauntlet();
      else if (r < 0.86) seg = ModuleFactory.createSpeedRunway();
      else seg = ModuleFactory.createSerpentineIslands();
    }

    this.attachSegment(seg);
  }

  private attachSegment(seg: CourseSegment): void {
    seg.setPosition(this.nextSpawnZ);
    this.activeSegments.push(seg);
    this.group.add(seg.group);
    this.nextSpawnZ += seg.length;
    this.segmentCount++;

    // Reach back into the previous segment so seam gaps are caught too — the
    // worst holes in this course are at module boundaries, not inside modules.
    this.guaranteeCoverage(seg.startZ - 60, seg.endZ);
  }

  /** Current forward speed and difficulty, pushed in by the game each frame. */
  public setRuntimeState(speed: number, difficulty: number): void {
    this.currentSpeed = speed;
    this.difficulty = difficulty;
  }

  /** Is there standable floor anywhere across the course width at this z? */
  private hasFloorAnywhereAt(z: number): boolean {
    for (let x = -CONSTANTS.MAX_COURSE_WIDTH; x <= CONSTANTS.MAX_COURSE_WIDTH; x += 0.5) {
      if (this.isSolidFloorAt(x, z)) return true;
    }
    return false;
  }

  /** Nearest standable x to `preferX` at this z, or null if the slice is empty. */
  private solidXNear(z: number, preferX: number): number | null {
    const limit = CONSTANTS.MAX_COURSE_WIDTH;
    for (let r = 0; r <= limit * 2; r += 0.5) {
      for (const x of [preferX + r, preferX - r]) {
        if (x < -limit || x > limit) continue;
        if (this.isSolidFloorAt(x, z)) return x;
      }
    }
    return null;
  }

  /**
   * Reachability guarantee.
   *
   * The authored modules only fill roughly half of their 80-unit segment slot,
   * so the generator was leaving voids at nearly every module seam — including
   * a 46-unit hole right after the starter runway, against a maximum hop of
   * about 26 units. That is unclearable at any skill level, which is why runs
   * were ending at ~45m every single time.
   *
   * This walks the newly-placed span, finds any stretch with no standable floor
   * at any x, and if it is longer than the ball can actually fly, drops stepping
   * platforms across it. One extra platform always beats one impossible jump.
   */
  private guaranteeCoverage(fromZ: number, toZ: number): void {
    const airtime = THREE.MathUtils.lerp(
      CONSTANTS.AIRTIME_START, CONSTANTS.AIRTIME_END, this.difficulty);
    // 0.72 leaves headroom for a player who is off the ideal line or mistimed.
    const maxHop = this.currentSpeed * airtime * 0.72;
    const step = 2;

    let gapStart: number | null = null;
    for (let z = fromZ; z <= toZ; z += step) {
      const solid = this.hasFloorAnywhereAt(z);
      if (!solid) {
        if (gapStart === null) gapStart = z;
      } else if (gapStart !== null) {
        this.bridgeGap(gapStart - step, z, maxHop);
        gapStart = null;
      }
    }
    // A gap still open at toZ is left alone: the next segment has not been
    // generated yet, and its own pass will close it once it exists.
  }

  private bridgeGap(takeoffZ: number, landZ: number, maxHop: number): void {
    const span = landZ - takeoffZ;
    if (span <= maxHop) return;

    const hops = Math.ceil(span / maxHop);
    const x0 = this.solidXNear(takeoffZ, 0);
    const x1 = this.solidXNear(landZ, x0 ?? 0);
    const startX = x0 ?? 0;
    const endX = x1 ?? startX;

    for (let i = 1; i < hops; i++) {
      const t = i / hops;
      this.addBridgePlatform(startX + (endX - startX) * t, takeoffZ + span * t);
    }
  }

  private addBridgePlatform(x: number, worldZ: number): void {
    const seg = this.activeSegments.find((s) => worldZ >= s.startZ && worldZ < s.endZ);
    if (!seg) return;
    const localZ = worldZ - seg.startZ;
    seg.addObstacle(new TrackPlatform(x, 0, localZ, 7.5, 10, HEX.alabaster));
    seg.addObstacle(new BouncePad(x, 0.5, localZ));
  }

  public update(playerZ: number, delta: number): void {
    // 1. Update all active segment obstacles (animations, rotations, moving hazards)
    for (let i = 0; i < this.activeSegments.length; i++) {
      this.activeSegments[i].update(delta);
    }

    // 2. Spawn new segments ahead
    while (this.nextSpawnZ - playerZ < CONSTANTS.SEGMENT_LENGTH * CONSTANTS.SPAWN_AHEAD_COUNT) {
      this.spawnNextSegment();
    }

    // 3. Recycle old segments behind the player
    while (this.activeSegments.length > 0 && this.activeSegments[0].endZ < playerZ - CONSTANTS.REMOVE_BEHIND_DIST) {
      const oldSeg = this.activeSegments.shift()!;
      this.group.remove(oldSeg.group);
      oldSeg.dispose();
    }
  }

  public checkCollisions(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult[] {
    const hits: CollisionResult[] = [];
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (ballPos.z >= seg.startZ - 10 && ballPos.z <= seg.endZ + 10) {
        const segHits = seg.checkCollisions(ballPos, ballRadius, ballVel);
        hits.push(...segHits);
      }
    }
    return hits;
  }

  public checkNearMiss(ballPos: THREE.Vector3, radius: number): boolean {
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (ballPos.z >= seg.startZ - 10 && ballPos.z <= seg.endZ + 10) {
        if (seg.checkNearMiss(ballPos, radius)) {
          return true;
        }
      }
    }
    return false;
  }

  public getUpcomingSegment(playerZ: number): CourseSegment | null {
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (seg.startZ > playerZ + 15) {
        return seg;
      }
    }
    return this.activeSegments[1] || null;
  }

  public isSolidFloorAt(x: number, z: number): boolean {
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (z < seg.startZ - 2 || z > seg.endZ + 2) continue;
      const localZ = z - seg.startZ;
      for (const obs of seg.obstacles) {
        if (!obs.isActive) continue;
        if (obs instanceof TrackPlatform || obs instanceof CollapsingPlatform) {
          const halfW = (obs as any).width / 2 || 4.0;
          const halfL = (obs as any).length / 2 || 10.0;
          if (
            x >= obs.position.x - halfW - 0.5 &&
            x <= obs.position.x + halfW + 0.5 &&
            localZ >= obs.position.z - halfL &&
            localZ <= obs.position.z + halfL
          ) {
            return true;
          }
        } else if (obs instanceof BouncePad || obs instanceof SpringPad) {
          const dist = Math.hypot(x - obs.position.x, localZ - obs.position.z);
          if (dist <= 3.2) return true;
        }
      }
    }
    return false;
  }

  /**
   * Height of the walkable surface under this point, or null over a gap.
   *
   * Rolling needs this: the ball has to sit *on* the deck and follow it,
   * which the old auto-bounce never had to know because it only ever queried
   * the world at the instant of a bounce.
   */
  public surfaceYAt(x: number, z: number, maxTop: number = Infinity): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (z < seg.startZ - 2 || z > seg.endZ + 2) continue;
      const localZ = z - seg.startZ;
      for (const obs of seg.obstacles) {
        if (!obs.isActive) continue;
        if (!(obs instanceof TrackPlatform || obs instanceof CollapsingPlatform)) continue;
        const halfW = ((obs as any).width ?? 8) / 2;
        const halfL = ((obs as any).length ?? 20) / 2;
        if (x < obs.position.x - halfW - 0.4 || x > obs.position.x + halfW + 0.4) continue;
        if (localZ < obs.position.z - halfL || localZ > obs.position.z + halfL) continue;
        const top = obs.position.y + 0.5;
        // Only surfaces the ball was already above. Without this bound the
        // query returns the highest deck overlapping (x, z) whatever the ball
        // is doing, so falling past the *side* of a raised platform snaps the
        // ball up onto its top — the no-clip teleport.
        if (top > maxTop) continue;
        if (best === null || top > best) best = top;
      }
    }
    return best;
  }

  public isLethalHazardAt(x: number, z: number): boolean {
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (z < seg.startZ - 4 || z > seg.endZ + 4) continue;
      const localZ = z - seg.startZ;
      for (const obs of seg.obstacles) {
        if (!obs.isActive || !obs.isLethal) continue;
        const dist = Math.hypot(x - obs.position.x, localZ - obs.position.z);
        if (dist <= 3.2) return true;
      }
    }
    return false;
  }

  public reset(): void {
    for (let i = 0; i < this.activeSegments.length; i++) {
      this.group.remove(this.activeSegments[i].group);
      this.activeSegments[i].dispose();
    }
    this.activeSegments = [];
    this.initInitialTrack();
  }
}
