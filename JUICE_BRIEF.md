# BOUNCE — Juice Brief

**For: Antigravity. Three jobs, in this order: ball animation & tricks, ball
personality, sound.**

BOUNCE is a Three.js endless runner in a heavenly high-altitude ruin — marble,
gold, cloud sea, crimson lacquer for anything lethal. It is now genuinely fast:
the speed ramp completes inside a run, so the last third is played at 78 u/s
with hazards at three different altitudes.

What it does not yet have is **flair**. The ball moves correctly and expresses
almost nothing about it. Everything below is about that gap.

Read the whole brief first. §1 and §3 are where the value is; §2 is small but
easy to overdo.

---

## 0. What already exists — do not rebuild it

- **`src/entities/Ball.ts`** — a spring-damper squash/stretch rig (`springK`,
  `springC`, `wobbleVel`), `triggerLandingSquash(isPerfect, isSlam, hardness)`,
  `triggerLaunchStretch()`, `impact(depth)`, and an air-trick tracker
  (`trickSpinAngle`, `finalizeAirTricks()`) that already reports `360° SPIN`,
  `{n}° HYPER SPIN` and `BIG AIR`.
- **`src/entities/Particles.ts`** — pooled GPU particles with ten emitters:
  `emitBounce`, `emitLandingDust`, `emitChainBurst`, `emitAirDashThrust`,
  `emitBallDebris`, `emitSlamImpact`, `emitSpeedWake`, `emitNearMiss`,
  `emitExplosion`, `emitVictoryConfetti`.
- **`src/audio/SoundEngine.ts`** — 18 procedural cues built on
  `SynthVoice.playTone()` / `playNoise()`. **All synthesis, no samples.** Keep it
  that way: it is why the whole game is a few hundred KB.
- **`src/rendering/Palette.ts`** — the colour grammar. ALABASTER standable,
  MARBLE architecture, GILT direction and reward, BLUSH machinery, VERDANT life,
  **CRIMSON death**. Never put crimson on something safe.

The moves the ball has: steer (A/D), bounce (Space, hold for a taller arc),
air dash (Shift), ground slam (S, which now pays back a launch), and one
equipped ability (E).

---

## 1. Ball animation and tricks

The reference feel is traversal flair — the ball should look like it is *enjoying*
a fast line, and a good run should look different from a bad one without reading
the HUD. Right now every hop looks the same as every other hop.

### 1.1 Give the ball a heading

It is a sphere with a face, and it currently faces forward always. Bank it.

- **Lateral lean** — roll into a steer by up to ~22°, proportional to
  `steerAxis`, eased in over ~140ms and out over ~260ms so it leads the turn
  rather than following it.
- **Pitch on the arc** — nose up as it rises, nose down as it falls, ~12° each
  way, driven off `velocity.y` normalised against the committed launch speed.
- **Anticipation** — a short counter-lean (~4°) in the frame or two before a
  commanded bounce, which is what makes a jump read as *decided* rather than
  as something that happened to the ball.

None of this should fight the existing squash rig; it is rotation, that is
deformation, and they compose.

### 1.2 Air tricks with actual poses

`finalizeAirTricks()` already counts spins. Make them visible and make more of
them possible:

| Trick | Input | Pose |
|---|---|---|
| **Corkscrew** | steer held through a full arc | continuous roll about Z, 1–3 turns, speed scaling with `steerAxis` |
| **Backflip** | dash while rising | one clean rotation about X, landing squared up |
| **Comet spin** | dash at apex | fast Y spin with the trail wrapping into a helix |
| **Slam tuck** | slam from above ~12 units | compress hard, tuck, then the launch snaps it open |
| **Rail grind** | landing within ~1.5 of a road edge | lean out over the drop, sparks off the balustrade |

Rules that keep this from becoming noise:

- **Every trick must be recoverable.** The ball is always square to the road on
  touchdown, no matter what it was doing a frame earlier. Use a short blend
  (~120ms) into the landing pose. A trick that costs a landing is a trick nobody
  uses twice.
- **Tricks pay.** Route them through the existing `score.addTricks()`; do not
  invent a second scoring path.
- **Chain them.** A second trick in one flight should read as a combo — hold the
  rotation axis and add to it rather than restarting.

### 1.3 Speed reads on the body, not just the HUD

Above roughly 60 u/s: stretch the ball ~8% along travel, pull the trail longer,
add a faint motion smear. Below 40: none of it. The transition should be
continuous, so the player feels the ramp arriving rather than seeing a switch.

### 1.4 Landing weight

`emitLandingDust` fires at one intensity. Split it by how the landing was earned:
a scuff at the road edge throws a thin lateral spray, a perfect bounce rings a
clean gold shock circle, a slam cracks a radial dust plate and kicks the camera.
Same emitter, different arguments — do not add three more emitters.

**Budget:** the particle pool is fixed size and the game holds ~344 draw calls.
Trick VFX must reuse the existing pool. No new render passes, no post-processing
chain.

---

## 2. Ball personality

`currentExpression` already supports `normal | squint | shock | dizzy | cool |
happy | focus`, blended by weights in `Ball.update()`. It is driven from exactly
four places, so most of the run the face is blank.

### 2.1 More expressions

Add: `determined` (brows in, mouth flat), `strain` (big air, cheeks puffed),
`delight` (a coin run cleared, eyes closed and curved), `smug` (after a trick
chain), `panic` (edge proximity high, eyes wide, pupils shrunk), `sleepy` (idle
on the title screen for 8+ seconds).

### 2.2 Drive them from state the game already computes

This is the part that matters — expressions should be a *readout*, never a
scripted sequence:

- combo ≥ 10 → `determined`; ≥ 25 → `smug`
- `edgeProximity()` above the scuff threshold → `panic`
- airborne longer than ~1.1s → `strain`, resolving to `delight` on a clean land
- ability fires → `cool` for its duration
- three near misses inside 5s → `shock`
- nothing eventful for 6s → drift back to `normal`

### 2.3 Restraint

Expressions hold for 0.2–0.5s and blend, they do not snap. Never more than one
change per second. The face is seasoning: a ball that mugs constantly stops
being charming inside one run, and the game is played on the road, not on the
face.

Eyes can also **look** — a short glance toward the next hazard or the coin arc
ahead is worth more than any new mouth shape, because it tells the player where
to look too.

---

## 3. Sound

Currently 18 cues, all procedural, and the mix has three real problems:

**Everything plays at once and nothing ducks.** A perfect bounce during a combo
during a coin pickup is three cues at full level on top of the wind bed. Add a
small bus with priority ducking: impacts over pickups, pickups over ambience.

**Nothing varies.** `playBounce()` takes a velocity ratio and moves the pitch by
80Hz; every other cue is byte-identical every time. Add per-shot jitter — ±3%
pitch, ±8% level, and where a cue has multiple partials, vary their balance. The
ear finds an exactly repeated sample within about five plays.

**There is no music that responds to the run.** Wind ambience scales with speed
and that is all.

### 3.1 Cues to add

- **Trick set** — one per trick in §1.2, pitched by rotation count so a triple
  reads as higher than a single.
- **Slam launch** — the rebound has a banner (`SLAM POP` / `SLAM LAUNCH!`) and no
  sound of its own; it currently borrows the perfect-bounce cue.
- **Aerial hazard proximity** — the censer, banner and ring each want a signature:
  a censer chain rattle that pans and dopplers past, a silk snap for the banner,
  a struck-bell tone for the ring that rings clean when you thread it.
- **Ability charge and ready** — a rising partial per coin banked, resolving to a
  chord when a charge completes.
- **Coin arc completion** — collecting a whole arc should resolve; collecting
  part of one should not. Pitch each coin up the scale and land the last one on
  the tonic.

### 3.2 Adaptive layers

Build the music as stems that come in with the run, not a track that loops:

1. **Base** — a slow drone, always present.
2. **Pulse** — enters above 45 u/s.
3. **Lead** — enters at combo ≥ 8, transposes up a third at ≥ 20.
4. **Choir** — only while an ability is active.

Crossfade on bar boundaries, not on the event, or it sounds like a mistake.
Duck everything by ~6dB during the death hit-stop and bring it back over ~1.2s.

### 3.3 Space

Cues are mono and centred. Pan hazards by their x offset and attenuate by
distance — an approaching censer on the left should be audible on the left.
That turns audio into information, which on a course with three hazard altitudes
is worth more than any new sound.

### 3.4 Constraints

- Stay procedural. No sample files.
- Respect the existing audio settings in the pause menu; they persist to
  `localStorage` and are exposed on `window`.
- Never start audio before a user gesture, and keep the whole engine behind the
  existing mute toggle.
- Mobile: cap simultaneous voices. Phones will glitch before they clip.

---

## 4. Out of scope

Do not touch course generation, the HUD deck, the ability unlock system, or
anything in `src/world/`. Do not add post-processing. Do not replace the
procedural audio with samples.

## 5. Definition of done

- A fast, clean run looks visibly different from a slow, scrappy one, with the
  HUD hidden.
- Every trick lands square, every time. Test this specifically.
- The face reacts to combo, edge proximity and airtime without ever mugging
  twice in one second.
- Two consecutive bounces do not sound identical.
- An approaching censer is audible on the correct side before it is visible.
- Draw calls stay under ~380 and the particle pool is not enlarged.
