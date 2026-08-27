import { HEX } from '../rendering/Palette';
import { CONSTANTS } from '../config/constants';
import { CourseSegment } from './CourseSegment';
import {
  TrackPlatform,
  BouncePad,
  SpringPad,
  IndustrialPiston,
  PinballBumper,
  BonusScoreGem,
  CollapsingPlatform,
  SpeedBoosterStrip,
  GravityShiftZone,
  FinishLineGate,
  SlidingHazardBlock,
  SpinningSawDisc,
  SweepBarHazard,
} from './Obstacles';

/**
 * Authored High-Stakes Level Modules Library
 * Designed for dynamic reflex platforming, narrow serpentine paths,
 * active moving hazards, chasm leaps, and high-speed precision (No AFK).
 */

/**
 * Lay coins along the ball's actual flight path.
 *
 * Coins used to sit at a fixed y=3.2 in a flat line. The ball is only near
 * that height for a moment at each end of a hop and spends the entire middle
 * of every arc far above it, so a whole run of them could not be collected no
 * matter how well you played — the one tool for coming down early is the slam,
 * and that has a cooldown.
 *
 * These trace the bounce instead: same gravity the player is under, launched
 * from the deck, so a coin arc *is* a hop. Landing on the first coin means
 * taking the whole string.
 *
 * @param apex   arc height — 8 matches the idle bounce, 16 the committed one
 * @param lane   x, or a [from, to] pair to drift across the road mid-flight
 */
function coinArc(
  seg: CourseSegment,
  z0: number,
  count: number,
  apex: number = 8,
  lane: number | [number, number] = 0,
  speed: number = CONSTANTS.BASE_SPEED,
): void {
  const g = (8 * CONSTANTS.JUMP_APEX) / (CONSTANTS.JUMP_AIRTIME * CONSTANTS.JUMP_AIRTIME);
  const v0 = Math.sqrt(2 * g * apex);
  const airtime = (2 * v0) / g;
  const rest = CONSTANTS.ROAD_Y + 0.5 + CONSTANTS.BALL_RADIUS;
  const [xa, xb] = Array.isArray(lane) ? lane : [lane, lane];

  for (let i = 0; i < count; i++) {
    // Skip the very ends: a coin at deck height reads as sitting on the floor.
    const f = (i + 0.7) / (count + 0.4);
    const t = f * airtime;
    const y = rest + v0 * t - 0.5 * g * t * t;
    const x = xa + (xb - xa) * f;
    seg.addObstacle(new BonusScoreGem(x, y, z0 + speed * t));
  }
}

export class ModuleFactory {
  /**
   * 0. Starter Runway (Warm-Up Entry)
   */
  public static createStarterRunway(): CourseSegment {
    const seg = new CourseSegment('starter', 'THE CAUSEWAY', 'lightning');

    // A continuous approach span rather than a short strip in empty air: the
    // first thing the player sees should be the bridge they are standing on
    // running away into the mist, not a gap with scenery in the distance.
    seg.addObstacle(new TrackPlatform(0, 0, 10, 16, 44, HEX.alabaster));
    seg.addObstacle(new TrackPlatform(0, 0, 48, 14, 34, HEX.alabaster));
    seg.addObstacle(new BouncePad(0, 0.5, 14));
    seg.addObstacle(new BouncePad(0, 0.5, 32));
    seg.addObstacle(new BonusScoreGem(0, 4.5, 14));
    seg.addObstacle(new BonusScoreGem(0, 4.5, 32));

    return seg;
  }


  /**
   * The Causeway — the default stretch of road.
   *
   * A single wide continuous deck rather than a chain of islands. The game was
   * entirely island-hopping, which forces one correct line and leaves the
   * player no room to move; this is somewhere to actually *be*. Challenge comes
   * from hazards and from where the coins are, not from the floor running out.
   *
   * Coins are laid in lateral arcs and diagonals so that taking them means
   * leaving the middle. That is the whole point: the road is wide, and the
   * reward is off to the side of it.
   */
  public static createCauseway(variant: number = 0): CourseSegment {
    const seg = new CourseSegment('causeway', 'THE CAUSEWAY', 'lightning');
    const W = 26;              // wide enough to roam across

    // Continuous roadway in two overlapping spans, so the deck never has a
    // seam the player can fall through.
    seg.addObstacle(new TrackPlatform(0, 0, 20, W, 44, HEX.alabaster));
    seg.addObstacle(new TrackPlatform(0, 0, 58, W, 40, HEX.alabaster));

    const half = W / 2 - 2.5;

    if (variant === 0) {
      // Three hops' worth, weaving across the road so each arc also asks for
      // a lane change rather than only a well-timed bounce.
      coinArc(seg, 8, 7, 8, [-half * 0.7, half * 0.5]);
      coinArc(seg, 38, 7, 8, [half * 0.5, -half * 0.6]);
      coinArc(seg, 66, 6, 8, [-half * 0.6, 0]);
      seg.addObstacle(new BouncePad(0, 0.5, 40));
    } else if (variant === 1) {
      // Outer arcs with hazards guarding the middle: the safe line is the
      // poor line, and each side is a full hop's worth.
      coinArc(seg, 10, 7, 8, -half);
      coinArc(seg, 44, 7, 8, half);
      seg.addObstacle(new SpinningSawDisc(0, 2.2, 34));
      seg.addObstacle(new SpinningSawDisc(0, 2.2, 60));
      seg.addObstacle(new BouncePad(-half, 0.5, 24));
      seg.addObstacle(new BouncePad(half, 0.5, 52));
    } else {
      // A committed-bounce arc straight over the hazards: only reachable if
      // you hold for height off the spring.
      coinArc(seg, 16, 9, 16, [-half * 0.4, half * 0.4]);
      seg.addObstacle(new SlidingHazardBlock(-half * 0.5, 1.6, 30));
      seg.addObstacle(new SlidingHazardBlock(half * 0.5, 1.6, 56));
      seg.addObstacle(new SpringPad(0, 0.5, 14));
    }

    return seg;
  }

  /**
   * Open Plaza — a very wide arena with coins scattered across it and no
   * forced line at all. Used as the release beat between harder modules.
   */
  public static createOpenPlaza(): CourseSegment {
    const seg = new CourseSegment('plaza', 'OPEN PLAZA', 'lightning');
    seg.addObstacle(new TrackPlatform(0, 0, 40, 40, 82, HEX.alabaster));

    // Four arcs fanned across the plaza. There is no single line that takes
    // them all, so the plaza is a choice about which two you can chain.
    coinArc(seg, 10, 6, 8, [-15, -6]);
    coinArc(seg, 14, 6, 8, [15, 5]);
    coinArc(seg, 40, 6, 8, [-8, 8]);
    coinArc(seg, 44, 7, 16, [9, -9]);
    seg.addObstacle(new BouncePad(0, 0.5, 24));
    seg.addObstacle(new BouncePad(-11, 0.5, 54));
    seg.addObstacle(new BouncePad(11, 0.5, 54));
    return seg;
  }

  /**
   * 1. Serpentine Island Weave (Narrow Stepping Stones across the Abyss)
   * Impossible to AFK: player MUST steer left and right between disjoint islands!
   */
  public static createSerpentineIslands(): CourseSegment {
    const seg = new CourseSegment('serpentine', 'SERPENTINE WEAVE', 'hazard');

    // Disjoint Narrow Floating Islands (Width 4.8m)
    seg.addObstacle(new TrackPlatform(-6.75, 0, 14, 10, 14, HEX.alabaster));
    seg.addObstacle(new BouncePad(-6.75, 0.5, 14));
    seg.addObstacle(new BonusScoreGem(-6.75, 4.5, 14));

    seg.addObstacle(new TrackPlatform(6.75, 0, 32, 10, 14, HEX.blush));
    seg.addObstacle(new BouncePad(6.75, 0.5, 32));
    seg.addObstacle(new BonusScoreGem(6.75, 4.5, 32));

    seg.addObstacle(new TrackPlatform(-6, 0, 50, 10, 14, HEX.alabaster));
    seg.addObstacle(new BouncePad(-6, 0.5, 50));
    seg.addObstacle(new BonusScoreGem(-6, 4.5, 50));

    seg.addObstacle(new TrackPlatform(5.7, 0, 68, 10, 14, HEX.blush));
    seg.addObstacle(new BouncePad(5.7, 0.5, 68));
    seg.addObstacle(new BonusScoreGem(5.7, 4.5, 68));

    return seg;
  }

  /**
   * 2. Mega Chasm Leap (Spring Pad Launch across 38m Void)
   */
  public static createAirtimeLeap(): CourseSegment {
    const seg = new CourseSegment('airtime', 'CHASM SPRING LEAP', 'rocket');

    // Takeoff Pad
    seg.addObstacle(new TrackPlatform(0, 0, 10, 10, 18, HEX.blush));
    seg.addObstacle(new SpringPad(0, 0.5, 14));

    // Mid-air Floating Stepping Island
    seg.addObstacle(new TrackPlatform(0, 3.2, 44, 10, 12, HEX.alabaster));
    seg.addObstacle(new BouncePad(0, 3.7, 44));
    seg.addObstacle(new BonusScoreGem(0, 7.5, 44));

    // High Bonus Gem Arc in the apex of the leap
    seg.addObstacle(new BonusScoreGem(0, 9.5, 28));
    seg.addObstacle(new BonusScoreGem(0, 9.5, 36));

    // Landing Runway
    seg.addObstacle(new TrackPlatform(0, 0, 70, 10, 18, HEX.alabaster));
    seg.addObstacle(new BouncePad(0, 0.5, 70));

    return seg;
  }

  /**
   * 3. Slalom Hazard Gauntlet (Horizontally Sliding Blocks)
   */
  public static createSlalomHazard(): CourseSegment {
    const seg = new CourseSegment('slalom', 'SLIDING GAUNTLET', 'hazard');

    // Track Deck
    seg.addObstacle(new TrackPlatform(0, 0, 20, 11, 38, 0x140E34));
    seg.addObstacle(new TrackPlatform(0, 0, 58, 11, 38, 0x140E34));

    // Moving Hazard Blocks sliding horizontally across lanes
    seg.addObstacle(new SlidingHazardBlock(0, 0, 16, 4.2, 3.8, 4.0, 3.8, 2.4, 0));
    seg.addObstacle(new SlidingHazardBlock(0, 0, 34, 4.2, 3.8, 4.0, 3.8, 2.8, Math.PI));
    seg.addObstacle(new SlidingHazardBlock(0, 0, 52, 4.2, 3.8, 4.0, 3.8, 2.4, Math.PI / 2));
    seg.addObstacle(new SlidingHazardBlock(0, 0, 70, 4.2, 3.8, 4.0, 3.8, 3.0, (Math.PI * 3) / 2));

    // Bounce Pads in safe gaps
    seg.addObstacle(new BouncePad(0, 0.5, 25));
    seg.addObstacle(new BouncePad(0, 0.5, 43));
    seg.addObstacle(new BouncePad(0, 0.5, 61));

    seg.addObstacle(new BonusScoreGem(4.5, 4.5, 25));
    seg.addObstacle(new BonusScoreGem(-4.5, 4.5, 43));

    return seg;
  }

  /**
   * 4. Sawline Horizon (Oscillating Spinning Saws)
   */
  public static createSawline(): CourseSegment {
    const seg = new CourseSegment('sawline', 'SAWLINE HORIZON', 'hazard');

    seg.addObstacle(new TrackPlatform(0, 0, 20, 10, 40, 0x120C2E));
    seg.addObstacle(new TrackPlatform(0, 0, 60, 10, 40, 0x120C2E));

    // Patrolling Circular Saws
    seg.addObstacle(new SpinningSawDisc(0, 0, 18, 3.0, 4.0, 2.8, 0));
    seg.addObstacle(new SpinningSawDisc(0, 0, 38, 3.0, 4.0, 3.2, Math.PI));
    seg.addObstacle(new SpinningSawDisc(0, 0, 58, 3.0, 4.0, 3.0, Math.PI / 2));

    seg.addObstacle(new BouncePad(-3.75, 0.5, 28));
    seg.addObstacle(new BouncePad(3.75, 0.5, 48));
    seg.addObstacle(new BouncePad(0, 0.5, 68));

    seg.addObstacle(new BonusScoreGem(0, 5.0, 28));
    seg.addObstacle(new BonusScoreGem(0, 5.0, 48));

    return seg;
  }

  /**
   * 5. Collapsing Bridge Run (Tiles break & drop after contact)
   */
  public static createCollapsingBridge(): CourseSegment {
    const seg = new CourseSegment('collapse', 'COLLAPSING RUNWAY', 'hazard');

    // Solid Starter
    seg.addObstacle(new TrackPlatform(0, 0, 8, 10, 16, HEX.alabaster));

    // Array of Fragile Stepping Tiles
    seg.addObstacle(new CollapsingPlatform(-4.5, 0, 22, 5.0, 10));
    seg.addObstacle(new CollapsingPlatform(4.5, 0, 34, 5.0, 10));
    seg.addObstacle(new CollapsingPlatform(-3.75, 0, 46, 5.0, 10));
    seg.addObstacle(new CollapsingPlatform(3.75, 0, 58, 5.0, 10));

    // Solid Landing Runway
    seg.addObstacle(new TrackPlatform(0, 0, 72, 10, 16, HEX.alabaster));
    seg.addObstacle(new BouncePad(0, 0.5, 72));

    // Bonus Gems on the collapsing tiles
    seg.addObstacle(new BonusScoreGem(-4.5, 4.5, 22));
    seg.addObstacle(new BonusScoreGem(4.5, 4.5, 34));
    seg.addObstacle(new BonusScoreGem(-3.75, 4.5, 46));
    seg.addObstacle(new BonusScoreGem(3.75, 4.5, 58));

    return seg;
  }

  /**
   * 6. Split Risk & Reward (Narrow Gold High-Speed Ridge vs Safe Path)
   */
  public static createSplitRisk(): CourseSegment {
    const seg = new CourseSegment('split', 'RISK & REWARD', 'lightning');

    // Safe Path on Left (Wider, slower)
    seg.addObstacle(new TrackPlatform(-7.5, 0, 38, 10, 74, 0x1A1244));
    seg.addObstacle(new BouncePad(-7.5, 0.5, 20));
    seg.addObstacle(new BouncePad(-7.5, 0.5, 40));
    seg.addObstacle(new BouncePad(-7.5, 0.5, 60));

    // Risky High-Speed Gold Path on Right (Narrow 3.2m with Speed Strip & Gems)
    seg.addObstacle(new TrackPlatform(8.25, 0, 38, 10, 74, HEX.gilt));
    seg.addObstacle(new SpeedBoosterStrip(8.25, 0.2, 38, 60));
    seg.addObstacle(new BonusScoreGem(8.25, 4.0, 18));
    seg.addObstacle(new BonusScoreGem(8.25, 4.0, 32));
    seg.addObstacle(new BonusScoreGem(8.25, 4.0, 46));
    seg.addObstacle(new BonusScoreGem(8.25, 4.0, 60));

    // Moving Hazard on the safe path to keep it interesting
    seg.addObstacle(new SlidingHazardBlock(-7.5, 0, 40, 3.5, 3.5, 3.5, 1.8, 2.0, 0));

    return seg;
  }

  /**
   * 7. Pinball Alley (Bumper Deflection Corridor)
   */
  public static createPinballAlley(): CourseSegment {
    const seg = new CourseSegment('pinball', 'PINBALL BUMPERS', 'hazard');

    seg.addObstacle(new TrackPlatform(0, 0, 20, 14, 38, 0x1A103D));
    seg.addObstacle(new TrackPlatform(0, 0, 58, 14, 38, 0x1A103D));

    // Pinball Bumpers
    seg.addObstacle(new PinballBumper(-6.75, 0, 18));
    seg.addObstacle(new PinballBumper(6.75, 0, 28));
    seg.addObstacle(new PinballBumper(-5.25, 0, 42));
    seg.addObstacle(new PinballBumper(5.25, 0, 54));
    seg.addObstacle(new PinballBumper(0, 0, 66));

    seg.addObstacle(new BouncePad(0, 0.5, 22));
    seg.addObstacle(new BouncePad(0, 0.5, 48));

    seg.addObstacle(new BonusScoreGem(0, 5.0, 35));

    return seg;
  }

  /**
   * 8. Sweep Bar Horizon (Rotating Barrier Arms)
   */
  public static createSweepBarChamber(): CourseSegment {
    const seg = new CourseSegment('sweep', 'KINETIC SWEEP BARS', 'hazard');

    seg.addObstacle(new TrackPlatform(0, 0, 20, 12, 38, 0x120C2E));
    seg.addObstacle(new TrackPlatform(0, 0, 58, 12, 38, 0x120C2E));

    // Rotating Sweep Bars
    seg.addObstacle(new SweepBarHazard(0, 0, 22, 6.5, 2.2));
    seg.addObstacle(new SweepBarHazard(0, 0, 54, 6.5, -2.5));

    seg.addObstacle(new BouncePad(-5.25, 0.5, 34));
    seg.addObstacle(new BouncePad(5.25, 0.5, 42));
    seg.addObstacle(new BouncePad(0, 0.5, 68));

    seg.addObstacle(new BonusScoreGem(-5.25, 4.5, 34));
    seg.addObstacle(new BonusScoreGem(5.25, 4.5, 42));

    return seg;
  }

  /**
   * 9. Industrial Piston Gauntlet (Overhead Rhythm Hammers)
   */
  public static createGauntlet(): CourseSegment {
    const seg = new CourseSegment('gauntlet', 'PISTON GAUNTLET', 'hazard');

    seg.addObstacle(new TrackPlatform(0, 0, 20, 12, 38, 0x140E34));
    seg.addObstacle(new TrackPlatform(0, 0, 58, 12, 38, 0x140E34));

    // Stamping Industrial Pistons
    seg.addObstacle(new IndustrialPiston(-5.4, 0, 18, 3.6, 0));
    seg.addObstacle(new IndustrialPiston(5.4, 0, 28, 3.6, Math.PI));
    seg.addObstacle(new IndustrialPiston(0, 0, 44, 4.0, Math.PI / 2));
    seg.addObstacle(new IndustrialPiston(-5.4, 0, 56, 3.6, Math.PI));
    seg.addObstacle(new IndustrialPiston(5.4, 0, 66, 3.6, 0));

    seg.addObstacle(new BouncePad(0, 0.5, 14));
    seg.addObstacle(new BouncePad(0, 0.5, 36));
    seg.addObstacle(new BouncePad(0, 0.5, 72));

    seg.addObstacle(new BonusScoreGem(0, 5.0, 36));

    return seg;
  }

  /**
   * 10. Hyper Chaos Gauntlet (Compound Saws, Pistons, and Sliding Blocks)
   */
  public static createChaosGauntlet(): CourseSegment {
    const seg = new CourseSegment('chaos', 'STRATOSPHERE CHAOS', 'hazard');

    seg.addObstacle(new TrackPlatform(0, 0, 20, 11, 38, 0x180D3A));
    seg.addObstacle(new TrackPlatform(0, 0, 58, 11, 38, 0x180D3A));

    seg.addObstacle(new SlidingHazardBlock(0, 0, 16, 4.0, 3.5, 3.5, 3.5, 2.5, 0));
    seg.addObstacle(new SpinningSawDisc(0, 0, 34, 3.0, 3.8, 3.0, Math.PI));
    seg.addObstacle(new IndustrialPiston(0, 0, 52, 4.0, Math.PI / 2));
    seg.addObstacle(new SweepBarHazard(0, 0, 68, 6.0, 2.4));

    seg.addObstacle(new BouncePad(-4.2, 0.5, 24));
    seg.addObstacle(new BouncePad(4.2, 0.5, 42));
    seg.addObstacle(new BouncePad(0, 0.5, 60));

    seg.addObstacle(new BonusScoreGem(-4.2, 4.5, 24));
    seg.addObstacle(new BonusScoreGem(4.2, 4.5, 42));

    return seg;
  }

  /**
   * 11. Hyper Warp Speed Runway
   */
  public static createSpeedRunway(): CourseSegment {
    const seg = new CourseSegment('speed', 'WARP ACCELERATION', 'lightning');

    seg.addObstacle(new TrackPlatform(0, 0, 20, 10, 38, HEX.alabaster));
    seg.addObstacle(new TrackPlatform(0, 0, 58, 10, 38, HEX.alabaster));

    seg.addObstacle(new SpeedBoosterStrip(0, 0.2, 20, 32));
    seg.addObstacle(new GravityShiftZone(0, 0, 48, 1));
    seg.addObstacle(new SpeedBoosterStrip(0, 0.2, 58, 32));

    seg.addObstacle(new BonusScoreGem(0, 4.5, 20));
    seg.addObstacle(new BonusScoreGem(0, 4.5, 40));
    seg.addObstacle(new BonusScoreGem(0, 4.5, 60));

    return seg;
  }

  /**
   * Victory Finish Line
   */
  public static createFinishLine(): CourseSegment {
    const seg = new CourseSegment('finish', 'VICTORY GATE', 'rocket');
    seg.addObstacle(new TrackPlatform(0, 0, 20, 14, 40, HEX.gilt));
    seg.addObstacle(new FinishLineGate(0, 0.5, 30));
    seg.addObstacle(new BouncePad(0, 0.5, 14));
    return seg;
  }
}
