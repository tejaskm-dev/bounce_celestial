/**
 * BOUNCE - Core Gameplay & Physics Tuning Constants
 * Precision Arcade Rhythm & Kinetic Physics Configuration
 */

export interface ArcParams {
  v0: number; // Initial upward velocity
  g: number;  // Gravity acceleration
}

/**
 * Derives upward launch velocity and gravity from perceived Apex and Airtime.
 *   T = airtime (seconds), h = apex height (world units)
 *   v0 = 4h / T
 *   g  = 8h / T^2
 */
export function arcFrom(apex: number, airtime: number): ArcParams {
  const safeT = Math.max(0.1, airtime);
  return {
    v0: (4 * apex) / safeT,
    g: (8 * apex) / (safeT * safeT),
  };
}

export const CONSTANTS = {
  // World Layout
  BALL_RADIUS: 1.25,
  ROAD_Y: 0,
  KILL_Y: -22,
  // Widened with the platforms. The old 14.5 was barely wider than the widest
  // single platform, so there was never anywhere to *be* except on the line —
  // no room to set up a trick, take a wide entry, or pick between routes.
  MAX_COURSE_WIDTH: 26.0,

  // Speed & Motion (Calibrated arcade pacing)
  // Speed, airtime and the ramp now live in config/Difficulty.ts as bands on
  // one curve. BASE_SPEED and MAX_SPEED are kept because the coin arcs, the
  // fairness probe and the run validator all reference them as the outer
  // bounds of what the ball can ever do — they are limits, not the ramp.
  BASE_SPEED: 32,               // Reference speed for authored coin arcs
  MAX_SPEED: 78,                // Top forward speed ramp (~180 km/h)
  // Seconds of survival to reach max baseline speed.
  //
  // Was 145, against an arcade run that finishes in about 35 seconds. Measured
  // mid-run: at t=10s the ball was doing 37 u/s of a possible 78, and it
  // crossed the finish line around 46 — so players never met the back 60% of
  // the speed range the whole game is tuned around. The ramp now completes
  // inside a full run, which is what makes the last third feel like the last
  // third.
  // 62 was tuned against a 49-second course. A five-minute run reaching top
  // speed a fifth of the way in would spend the other four minutes on a flat
  // difficulty line, so the ramp now completes around the three-minute mark:
  // the first 60% of the run is the climb, the last 40% is flat out.
  SPEED_RAMP_SECONDS: 170,
  PERFECT_BOOST_SURGE: 5.2,     // Speed added by a Perfect Bounce
  BOOST_CAP: 16,                // Max bonus boost above baseline
  BOOST_DECAY: 2.6,             // Boost decay per second

  // Bounce Arc Dimensions
  APEX_START: 6.4,              // Initial bounce apex height
  APEX_END: 5.2,                // High-speed bounce apex height
  AIRTIME_START: 0.82,          // Initial airtime (seconds)
  AIRTIME_END: 0.48,            // High-speed airtime (seconds)

  // --- The Jump -----------------------------------------------------------
  // The ball used to bounce on its own forever and the player only steered.
  // That reads as watching a ball bounce rather than playing one: the single
  // most important verb in a platformer is deciding *when* to leave the ground.
  // Now the ball rolls, and jumps only when asked.
  // The ball ALWAYS bounces — it is the name of the game and the whole read of
  // the thing. What the player controls is how high. Landing with the button
  // down commits to a full-height bounce; landing without it gives the small
  // idle bounce that keeps the ball alive and moving.
  // Sized so the flight is long enough to *think* in. At 0.66s of idle airtime
  // against a 0.22s window, the whole read-and-press happened inside two thirds
  // of a second — a reflex test rather than a rhythm, and the hop barely
  // travelled far enough to be worth aiming. The arc is now near a second on
  // the idle bounce and comfortably over one when committed, which is what
  // gives the perfect bounce room to be a decision.
  BOUNCE_MIN_APEX: 8.0,         // The bounce that happens whether you ask or not
  JUMP_APEX: 16.0,              // Apex of a full-commitment bounce
  JUMP_AIRTIME: 1.30,           // Airtime of a full-commitment bounce
  JUMP_CUT: 0.50,               // Velocity kept when the button is released while rising
  COYOTE_TIME: 0.12,            // Grace to still jump just after running off an edge
  JUMP_BUFFER: 0.14,            // Grace for pressing just before touching down
  GROUND_STICK: 0.75,           // Snap distance that keeps the ball glued to the deck
  CHAIN_WINDOW: 0.22,           // Jumping this soon after landing chains momentum
  CHAIN_BOOST: 4.0,             // Speed gained by a chained jump
  ROLL_FRICTION: 0.4,           // Speed bled per second while simply rolling

  // Modifiers
  PERFECT_APEX_MUL: 1.50,       // Apex multiplier on Perfect Landing
  PERFECT_AIRTIME_MUL: 1.26,    // Airtime multiplier on Perfect Landing
  SPRING_APEX_MUL: 2.40,        // Apex multiplier on Spring Pad
  SPRING_AIRTIME_MUL: 1.85,     // Airtime multiplier on Spring Pad
  // Rebound out of a Ground Slam.
  //
  // SLAM_BOUNCE_IMPULSE was declared here and never read by anything, so a slam
  // landed on exactly the same rebound as a gentle touchdown — and worse, since
  // the plunge usually ends with the action key released, it dropped you to the
  // *idle* apex of 8. Slamming actively cost you height, which is the opposite
  // of what a slam should feel like.
  //
  // These are apexes rather than impulses so the rebound shares the one gravity
  // every other arc uses; the launch speed is derived. Impact speed scales
  // between them, so a slam from the top of a big arc pops higher than one
  // tapped just above the deck — the superball rule, which teaches itself.
  SLAM_REBOUND_APEX: 20.0,      // Floor: still above the 16 of a held bounce
  SLAM_REBOUND_APEX_MAX: 27.0,  // Ceiling, reached slamming from full height

  // Scuffed Landings
  // Clipping the outer edge of a platform bleeds height and speed. Without
  // this, landings are binary hit-or-miss and *where* along a platform you
  // touch down is worth nothing — only the timing is. Scuff makes every
  // landing a positioning decision as well as a timing one.
  SCUFF_EDGE_THRESHOLD: 0.62,   // 0 = centre of available floor, 1 = at the edge
  SCUFF_APEX_MUL: 0.72,         // Apex multiplier on a scuffed landing
  SCUFF_SPEED_PENALTY: 4.5,     // Speed bled off by a scuff

  // Timing Windows for Perfect Landing
  PERFECT_WINDOW_EARLY: 0.165,  // Seconds before touchdown player can tap Space
  PERFECT_WINDOW_LATE: 0.055,   // Grace seconds after touchdown
  CENTRE_BONUS_WINDOW: 0.045,   // Timing window extension for hitting center platform
  MASH_LOCKOUT: 0.34,           // Whiff penalty lockout cooldown on early spam

  // Boost Floats & Air Dash System
  MAX_BOOST_FLOATS: 3,          // Max stored dash charges
  STARTING_BOOST_FLOATS: 1,     // Initial float charge on run start
  AIR_DASH_SPEED_FORWARD: 20,   // Forward surge impulse on air dash
  AIR_DASH_SPEED_LATERAL: 36,   // Lateral thrust velocity on directional dash
  AIR_DASH_DURATION: 0.22,      // Duration of dash state (seconds)
  AIR_DASH_HOVER_GRAVITY: 0.06, // Gravity damping multiplier during active dash hover
  AIR_DASH_COOLDOWN: 0.42,      // Minimum delay between air dashes

  // Ground Pound Slam
  SLAM_DOWN_VELOCITY: -42,      // Downward plunge velocity
  SLAM_GRAVITY: 300,            // Downward acceleration during active slam
  SLAM_COOLDOWN: 0.60,          // Cooldown before slam can be activated again

  // Steering & Lateral Agility
  STEER_BASE: 19,               // Base lateral speed
  STEER_PER_SPEED: 0.22,        // Extra lateral speed scaling with forward velocity
  STEER_ACCEL: 165,             // Steering acceleration
  STEER_GROUND_ACCEL_MUL: 1.35, // Grip bonus when touching ground
  STEER_DRAG: 12,               // Decay when steering released
  MAX_STEER_TILT: 0.42,         // Visual lean angle (radians)

  // --- Scoring -------------------------------------------------------------
  // Rebalanced so the number stays legible. Previously *everything* was
  // multiplied by a combo that reached 50, so a single perfect was worth
  // 50,000 against ~85 for a metre — the score raced away from the player and
  // stopped telling them which of their actions had earned anything.
  //
  // Now: distance is the flat baseline and is never multiplied. Skill actions
  // are worth a readable amount and only *those* take the multiplier, which is
  // capped much lower. A good run reads in the thousands, not the millions.
  SCORE_PER_METRE: 1,           // Flat. Surviving is the floor, not the payout.
  PERFECT_SCORE: 120,           // The core skill action
  GOOD_SCORE: 25,               // An ordinary clean landing
  SCUFF_SCORE: 5,               // Still something, so a bad landing is not a void
  COIN_SCORE: 60,               // Coins are the reason to leave the centre line
  SPIN_TRICK_SCORE: 90,
  NEAR_MISS_SCORE: 70,
  SPEED_BREAK_SCORE: 200,
  BOLT_SCORE: 60,
  // Two separate caps, which were previously conflated into one.
  //
  // COMBO_COUNT_MAX bounds the *counter* — the x24 the player sees and chases.
  // COMBO_MAX_MULTIPLIER bounds the *payout* derived from it. Clamping the
  // counter with the multiplier cap froze the combo at x8 no matter how well
  // the player was doing, which is why it looked like it had stopped counting.
  COMBO_COUNT_MAX: 99,
  COMBO_STEP: 0.25,
  COMBO_MAX_MULTIPLIER: 8,
  COMBO_DECAY_TIME: 3.4,

  // Bounce velocity & obstacle aliases
  BOUNCE_VELOCITY: 32,
  SUPER_BOUNCE_VELOCITY: 44,
  SPRING_BOUNCE_VELOCITY: 54,
  PERFECT_BOUNCE_RADIUS: 2.3,
  SPEED_BREAK_MIN_SPEED: 45,

  // Near Miss
  NEAR_MISS_RADIUS: 3.2,

  // Hit-Stop Micro Freezes (seconds)
  HIT_STOP_PERFECT: 0.042,
  HIT_STOP_SPEED_BREAK: 0.055,
  HIT_STOP_SPRING_LAUNCH: 0.048,
  HIT_STOP_DASH: 0.030,
  HIT_STOP_DEATH: 0.085,

  // World Generation & Track
  SEGMENT_LENGTH: 80,
  SPAWN_AHEAD_COUNT: 7,
  REMOVE_BEHIND_DIST: 120,
  COURSE_FINISH_DISTANCE: 1400,

  // --- Camera Chase Rig ----------------------------------------------------
  // Retuned for the longer arc. The old values were set when a bounce peaked
  // at 7 units and travelled ~21; it now peaks at 16 and travels 42-101, so
  // the camera was sitting too low and looking at ground the ball had already
  // flown over. Pulled back and up, with much more look-ahead at speed.
  CAM_OFFSET_Y: 8.4,
  CAM_OFFSET_Z: -16.5,
  CAM_OFFSET_FAST_Y: 9.6,
  CAM_OFFSET_FAST_Z: -21.0,
  // Look-ahead scales roughly with how far a committed bounce actually goes.
  CAM_LOOK_AHEAD: 26.0,
  CAM_LOOK_AHEAD_FAST: 46.0,
  CAM_LOOK_HEIGHT: 6.2,
  CAM_STIFFNESS: 12.5,
  CAM_VERTICAL_STIFFNESS: 6.2,
  CAM_BASE_FOV: 68,
  CAM_MAX_FOV: 84,
  CAM_PERFECT_FOV_KICK: 7.5,
  CAM_DASH_FOV_KICK: 9.0,
  CAM_ROLL_AMOUNT: 0.085,
};
