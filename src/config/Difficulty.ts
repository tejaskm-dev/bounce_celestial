/**
 * The difficulty curve.
 *
 * Everything that gets harder over a run reads from here, and the shape of the
 * run lives in one table rather than being spread across four files.
 *
 * Three problems this replaces:
 *
 * 1. **Two clocks.** Speed ramped on `runTime / SPEED_RAMP_SECONDS` while module
 *    selection ramped on `distance / finishDistance`. Those are not the same
 *    number — the ball covers the back half of a course far faster than the
 *    front half, so the two drifted apart by a third of the run, and a player
 *    who died and restarted got a different pairing again.
 *
 * 2. **A ceiling reached at 58%.** The speed ramp completed at 170s of a 290s
 *    run, so the last 42% of every course was played at a flat difficulty. The
 *    part of the run that should climb hardest was the part that stopped
 *    climbing at all.
 *
 * 3. **A front-loaded curve.** `pow(p, 0.85)` sits *above* linear for p < 1, so
 *    the opening ramped faster than the middle. The first thing a new player met
 *    was the steepest part of the curve.
 *
 * The shape now: gentle through the opening, crossing what used to be the top
 * speed at around 85% of the way in, and finishing a little beyond it. The
 * middle of the run is where the game has always been; the front is softer and
 * the last stretch is the only part that is genuinely harder than before.
 */

/** Control points of the curve, progress → difficulty. Both 0..1. */
const CURVE: readonly (readonly [number, number])[] = [
  [0.00, 0.00],
  [0.10, 0.08],   // First tenth is a runway: learn the bounce, meet one hazard.
  [0.25, 0.26],
  [0.45, 0.52],   // Halfway is genuinely mid-difficulty, not already maxed.
  [0.65, 0.75],
  [0.85, 0.92],   // Around here is where the old ceiling used to sit.
  [1.00, 1.00],
];

/**
 * Every value difficulty moves, as [floor, ceiling].
 *
 * Read against the old constants: the floors are lower and the ceilings a
 * little higher, which widens the run rather than steepening it. Speed used to
 * be 32→78; a 28 start is a visibly calmer opening and 82 is about 5% past
 * where the game topped out before.
 */
export const BANDS = {
  /** Forward speed, world units per second. */
  speed: [28, 82],
  /** Seconds of flight the generator sizes gaps against. Lower is tighter. */
  airtime: [0.88, 0.50],
  /** Fraction of the true maximum hop a bridged gap may use. */
  gapHeadroom: [0.66, 0.90],
  /** Aerial hazards per segment before the crowding discount. */
  aerialBudget: [0.30, 3.60],
} as const;

export type Band = keyof typeof BANDS;

/**
 * Reference course length for modes with no finish line.
 *
 * Endless has no progress fraction to read, so it ramps against this and then
 * holds at full difficulty — the same climb as Arcade, without an end.
 */
export const NOMINAL_RUN = 15300;

/** Where a run is, 0..1, measured in distance rather than in seconds. */
export function progressOf(distance: number, finishDistance: number): number {
  const target = finishDistance > 0 ? finishDistance : NOMINAL_RUN;
  const p = distance / target;
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

/** The curve itself: progress in, difficulty out. */
export function difficultyAt(progress: number): number {
  const p = progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  for (let i = 1; i < CURVE.length; i++) {
    const [p1, d1] = CURVE[i];
    if (p > p1) continue;
    const [p0, d0] = CURVE[i - 1];
    const span = p1 - p0;
    return span <= 0 ? d1 : d0 + (d1 - d0) * ((p - p0) / span);
  }
  return 1;
}

/** A band's value at the given difficulty. */
export function bandAt(name: Band, difficulty: number): number {
  const [lo, hi] = BANDS[name];
  const d = difficulty <= 0 ? 0 : difficulty >= 1 ? 1 : difficulty;
  return lo + (hi - lo) * d;
}
