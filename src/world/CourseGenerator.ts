import * as THREE from 'three';
import { HEX } from '../rendering/Palette';
import { CourseSegment } from './CourseSegment';
import { ModuleFactory, MID_IDLE, HIGH_COMMIT } from './Modules';
import {
  CollisionResult, TrackPlatform, BouncePad, SpringPad, CollapsingPlatform,
  CenserPendulum, VeilBanner, HaloRing,
} from './Obstacles';
import { CONSTANTS } from '../config/constants';
import { difficultyAt, bandAt, progressOf } from '../config/Difficulty';
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

  /**
   * Weighted module selection.
   *
   * This used to be a ladder of four `if (dist < N)` tiers with hard-coded
   * probabilities, which had three problems. It could not follow a change in
   * course length without every threshold being retuned by hand. It let one
   * module dominate — causeway was 11 of 40 segments, 27% of a course whose
   * whole complaint was sameness. And `createCollapsingBridge` was authored,
   * exported, and appeared in no tier at all, so it had never once been played.
   *
   * A weight curve per module fixes all three: `progress` is 0..1 through the
   * run whatever its length, each module lerps between an early and a late
   * weight, and adding one is a row rather than a rebalance.
   */
  private static readonly MODULE_TABLE: {
    id: string;
    make: (g: CourseGenerator) => CourseSegment;
    /** Weight at the start of the run, and at the end. */
    early: number; late: number;
    /** Not offered before this fraction of the course. */
    from?: number;
  }[] = [
    // Road. Still the connective tissue, but it can no longer be a third of
    // the course — and it thins out as the run goes on.
    { id: 'causeway',   early: 30, late: 6,  make: (g) => ModuleFactory.createCauseway(g.segmentCount % 3) },
    { id: 'plaza',      early: 14, late: 5,  make: () => ModuleFactory.createOpenPlaza() },

    // Early teachers.
    { id: 'serpentine', early: 10, late: 8,  make: () => ModuleFactory.createSerpentineIslands() },
    { id: 'slalom',     early: 9,  late: 9,  make: () => ModuleFactory.createSlalomHazard(), from: 0.04 },
    { id: 'airtime',    early: 7,  late: 8,  make: () => ModuleFactory.createAirtimeLeap(), from: 0.06 },

    // Middle game.
    { id: 'sawline',    early: 4,  late: 10, make: () => ModuleFactory.createSawline(), from: 0.10 },
    { id: 'collapsing', early: 3,  late: 10, make: () => ModuleFactory.createCollapsingBridge(), from: 0.12 },
    { id: 'split',      early: 2,  late: 9,  make: () => ModuleFactory.createSplitRisk(), from: 0.16 },
    { id: 'pinball',    early: 2,  late: 9,  make: () => ModuleFactory.createPinballAlley(), from: 0.18 },
    { id: 'sweep',      early: 1,  late: 9,  make: () => ModuleFactory.createSweepBarChamber(), from: 0.22 },

    // Late game.
    { id: 'speed',      early: 0,  late: 10, make: () => ModuleFactory.createSpeedRunway(), from: 0.34 },
    { id: 'gauntlet',   early: 0,  late: 13, make: () => ModuleFactory.createGauntlet(), from: 0.42 },
    { id: 'chaos',      early: 0,  late: 16, make: () => ModuleFactory.createChaosGauntlet(), from: 0.55 },
  ];

  /** The last two module ids played, for the repeat rule. */
  private recent: string[] = [];

  private pickModule(progress: number): CourseSegment {
    // Through the curve, not the raw fraction. Weights lerped on raw progress
    // ramped linearly while speed and gaps ramped on a shaped curve, so the
    // module mix and the pace they were tuned against pulled apart.
    const t = difficultyAt(progress);
    const table = CourseGenerator.MODULE_TABLE;

    let total = 0;
    const weights: number[] = [];
    for (const m of table) {
      let w = (m.from !== undefined && t < m.from) ? 0 : m.early + (m.late - m.early) * t;
      // No module twice in a row, and none three times in the last three. A
      // weighted draw without this produces visible clumps — two causeways
      // back to back reads as the generator having stopped.
      if (w > 0 && this.recent[this.recent.length - 1] === m.id) w *= 0.06;
      else if (w > 0 && this.recent.includes(m.id)) w *= 0.45;
      weights.push(w);
      total += w;
    }

    let r = this.nextRandom() * total;
    let pick = table[0];
    for (let i = 0; i < table.length; i++) {
      r -= weights[i];
      if (r <= 0) { pick = table[i]; break; }
    }

    this.recent.push(pick.id);
    if (this.recent.length > 3) this.recent.shift();
    return pick.make(this);
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

    seg = this.pickModule(progressOf(dist, modeConfig.finishDistance));

    this.attachSegment(seg);
  }

  /**
   * Scatter aerial hazards across a freshly-placed segment.
   *
   * Authoring them into individual modules left only a quarter of segments
   * with anything in the air, and — worse — the three modules the player meets
   * most (causeway, plaza, serpentine, which between them are over half the
   * course) had none at all. The result was that the flat road, where you
   * spend the most time, was also the place where holding for height cost
   * nothing.
   *
   * Making this a pass over every segment rather than a property of some
   * modules means coverage is a number we choose instead of a lottery the
   * module table happens to run. Density scales with difficulty, and modules
   * that are already dense on the ground get proportionally less, so the total
   * threat curve stays smooth instead of spiking on the busy modules.
   */
  private garnishAerial(seg: CourseSegment): void {
    // The opening runway teaches movement, and the finish is a victory lap.
    if (seg.moduleType === 'starter' || seg.moduleType === 'finish') return;

    const d = this.difficulty;
    // How crowded the floor already is, as a share of a "busy" module.
    const groundLoad = Math.min(1, seg.obstacles.filter((o) => o.isLethal).length / 6);
    const budget = bandAt('aerialBudget', d) * (1 - groundLoad * 0.55);

    let count = Math.floor(budget);
    if (this.nextRandom() < budget - count) count++;
    if (count <= 0) return;

    // Spread across the segment with a margin at each seam, so two adjacent
    // segments cannot stack hazards on top of each other at the boundary.
    const usable = seg.length - 24;
    for (let i = 0; i < count; i++) {
      const z = 12 + usable * ((i + 0.5 + (this.nextRandom() - 0.5) * 0.5) / count);
      if (this.hasHazardNear(seg, z, 11)) continue;
      this.placeAerial(seg, z, d);
    }
  }

  /** Is there already a lethal obstacle within `span` of this z in-segment? */
  private hasHazardNear(seg: CourseSegment, z: number, span: number): boolean {
    for (const o of seg.obstacles) {
      if (o.isLethal && Math.abs(o.position.z - z) < span) return true;
    }
    return false;
  }

  private placeAerial(seg: CourseSegment, z: number, d: number): void {
    const r = this.nextRandom();
    const lane = (this.nextRandom() - 0.5) * 16;

    // The mix moves up the arc as the run goes on. Censers first, because a
    // swinging object teaches "the air is not safe" without demanding a new
    // input; rings next, which ask for a specific apex; banners last, which
    // are the ones that punish holding for height and only make sense once
    // holding for height is a habit.
    const ringOdds = 0.20 + d * 0.22;
    const bannerOdds = d < 0.28 ? 0 : 0.12 + d * 0.30;

    if (r < bannerOdds) {
      // Never span the full width: a banner is meant to cost you altitude or a
      // lane, never to be an unavoidable wall.
      const side = this.nextRandom() < 0.5 ? -1 : 1;
      const bands: [number, number][] = this.nextRandom() < 0.45
        ? [[side * 9.5, 3.6]]
        : [[side * 11, 3.2], [side * -1.5, 3.0]];
      seg.addObstacle(new VeilBanner(
        z, HIGH_COMMIT - 2.0 - this.nextRandom() * 2.5, 26, bands,
        0.45, this.nextRandom() * 6));
    } else if (r < bannerOdds + ringOdds) {
      seg.addObstacle(new HaloRing(
        lane * 0.6, MID_IDLE + (this.nextRandom() - 0.4) * 4, z,
        3.3 + this.nextRandom() * 0.8, 0.85,
        d > 0.5 ? this.nextRandom() * 5 : 0,
        1.0 + this.nextRandom() * 0.5, this.nextRandom() * 6));
    } else {
      seg.addObstacle(new CenserPendulum(
        lane * 0.4, MID_IDLE - 1.5 + this.nextRandom() * 3, z,
        4.4 + this.nextRandom() * 1.4,
        0.65 + d * 0.4, 1.3 + this.nextRandom() * 0.7,
        this.nextRandom() * 6));
    }
  }

  private attachSegment(seg: CourseSegment): void {
    this.garnishAerial(seg);
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
    const airtime = bandAt('airtime', this.difficulty);
    // Headroom against the true maximum hop. Early gaps stay forgiving for a
    // player still off the ideal line; late ones close to within 12%, so the
    // same generator produces a demanding course without a second ruleset.
    const headroom = bandAt('gapHeadroom', this.difficulty);
    const maxHop = this.currentSpeed * airtime * headroom;
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

  /**
   * Is a lethal hazard occupying (x, z) at height `y`?
   *
   * `y` defaults to the deck, because every caller that predates the aerial
   * hazards is asking about the floor.
   */
  public isLethalHazardAt(
    x: number, z: number,
    y: number = CONSTANTS.ROAD_Y + CONSTANTS.BALL_RADIUS,
  ): boolean {
    for (let i = 0; i < this.activeSegments.length; i++) {
      const seg = this.activeSegments[i];
      if (z < seg.startZ - 4 || z > seg.endZ + 4) continue;
      const localZ = z - seg.startZ;
      for (const obs of seg.obstacles) {
        if (!obs.isActive || !obs.isLethal) continue;
        if (y < obs.hazardMinY || y > obs.hazardMaxY) continue;
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
