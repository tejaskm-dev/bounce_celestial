# Animation brief — BOUNCE

You are improving the **animation and game feel** of an existing, working
Three.js game. The physics, world and rendering are done and must not regress.
Your job is how things *move*: timing, weight, squash, secondary motion,
reaction, and the readability of every state change.

---

## The game

A ball bounces along a ruined marble causeway above a sea of cloud. It bounces
continuously and automatically; **holding SPACE at the moment of landing
commits to a full-height bounce** (apex 11) instead of the small idle one
(apex 5). Steering is A/D. There is an air dash and a ground slam. Landing on
the lip of a deck is a "scuff" and costs speed; bouncing again within 0.16s of
landing is a "chain" and gains it.

Art direction is a bright, calm, ethereal sky-temple — near-white marble, gold
banding, crimson for anything lethal. The ball is warm amber and is the most
saturated thing on screen. Animation should feel **light, buoyant and
weighted**, not twitchy or cartoonish-frantic.

---

## HARD CONSTRAINTS — violating these produces silently broken output

**1. The simulation is a fixed 120Hz timestep.** `Game.simulate(dt)` runs with
`dt = 1/120`, possibly several times per rendered frame; `Game.present(raw)`
runs once per frame with the real delta. Animation that must stay in lockstep
with physics belongs in the former. Animation that should stay smooth
regardless of step count belongs in the latter. **Never** use `setTimeout` or
wall-clock time for anything gameplay-visible — there are a few legacy uses in
`Ball.ts` and they are bugs, because they keep running through pause, hit-stop
and slow-motion.

**2. `timeScale` must be respected.** Hit-stop sets `timeScale = 0.02` and
death ramps slow-motion. Anything driven off `worldUniforms.uTime` or raw
frame delta will run at full speed through a freeze and break the punch.

**3. Frame-rate independence.** Use the exponential form
`a = THREE.MathUtils.damp(a, target, lambda, dt)`, never `a += (b - a) * 0.1`.
The latter is a different animation at 60Hz and 144Hz.

**4. The squash spring is volume-preserving and must stay so.**
`Ball.deformGroup.scale.set(wide, stretch, wide)` where
`wide = 1 / sqrt(stretch)`. Breaking that makes the ball visibly change size,
which reads as a rendering bug rather than as deformation.

**5. Do not add per-object meshes for effects.** Draw calls are 219 and hard
won. Effects go in shaders, in the existing instanced pools
(`src/rendering/InstancePool.ts`), or into `ParticleSystem`.

**6. Custom shaders have three non-obvious requirements** — instancing macros
(`OBJ_POS` / `OBJ_NRM`), the output tail (`<tonemapping_fragment>` +
`<colorspace_fragment>`), and `applyFog(...)`. See `ASSET_BRIEF.md` in this
repo for the details; all three have already caused invisible-output bugs.

---

## Where the animation lives

| File | Contains |
| --- | --- |
| `src/entities/Ball.ts` | Squash/stretch spring, gyro hoop, face expressions, blink, speed streaks, `impact()`, `triggerLandingSquash()`, `triggerLaunchStretch()` |
| `src/entities/CameraRig.ts` | Chase spring, smoothed height, roll, FOV kick, trauma shake |
| `src/entities/Particles.ts` | Burst emitters: bounce, explosion, near-miss, slam, confetti |
| `src/entities/SplashDecals.ts` | Persistent paint marks left at each landing |
| `src/core/Game.ts` | `onTouchdown()`, `triggerDeath()`, `updateDying()`, hit-stop and slow-motion |
| `src/ui/HUD.ts` | Banner pops, combo pulse, hint states |

---

## What to improve, in priority order

**1. The squash needs a curve, not a constant.** `triggerLandingSquash` takes a
`hardness` and picks a depth, and the spring (k=420, c=22) resolves it. But
every landing still resolves the *same way* — same frequency, same settling.
A soft touchdown should barely ripple; a hard one should flatten, overshoot,
and wobble for a beat. Consider varying spring stiffness with impact, adding a
second slower harmonic for the wobble, and letting the gyro hoop and the studs
lag behind the body instead of deforming in perfect lockstep. That lag is what
sells a soft shell.

**2. There is no anticipation anywhere.** Nothing in this game winds up before
it acts. The ball should compress slightly *just before* a committed bounce
launches, lean into a steer before the lateral velocity arrives, and tuck
before an air dash. A few frames of anticipation is the single biggest
readability win available here.

**3. The death is newly rewritten and still thin.** The ball now takes a hit,
deforms, tumbles and falls for 1.5s under slow motion. What it lacks: a
distinct *reaction* pose, debris that feels like part of the ball rather than
generic particles, deformation that responds to the tumble, and any sense of
the world reacting — the camera holds but nothing else acknowledges it.

**4. Expressions are switched, not blended.** `setFaceExpression` swaps a
texture. Blending expression weights over a few frames, and letting the eyes
lead the direction of travel, would give the character enormously more life for
very little cost. There is already pupil-tracking scaffolding in `Ball.ts`.

**5. Landings need follow-through in the world.** A hard landing should push
the splash decal outward, kick dust, and briefly bend the deck's gold inlay
light. Right now the impact affects only the ball.

**6. The chain is the game's best moment and is under-celebrated.** Bouncing
again within 0.16s of landing gains speed and scores. It currently fires a
sound, an FOV kick and a banner. It should have a *visual signature* the player
learns to crave — something that escalates with the combo count.

**7. Air dash and slam have almost no animation.** The dash is a velocity
change with a stretch; the slam is a downward impulse. Both should read as
deliberate, powerful moves with distinct silhouettes.

---

## Verifying your work

```bash
npm run dev                    # localhost:5180
npx tsc --noEmit               # must stay clean
npm run playtest               # autopilot; prints draw calls and triangles
npm run playtest -- --shots    # frames into tests/screenshots/playtest/
```

Animation cannot be verified from source. **Capture frames and look at them**,
and where timing is the question, trace the actual value over time rather than
reading the code — for example sampling `ball.position.y` per frame to confirm
an arc, or `deformGroup.scale.y` to see the spring's real settling curve. Every
animation bug found in this codebase so far typecheck-passed and looked
correct in the source.
