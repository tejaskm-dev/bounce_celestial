import * as THREE from 'three';
import { HEX, col } from './Palette';

/**
 * Shared world uniform block.
 *
 * Every world-space material references these *same uniform objects*, so
 * time, speed, fog and light state only ever have to be written once per
 * frame instead of walked over every material in the scene.
 *
 * Colours here are LINEAR. The raw ShaderMaterials in this project do their
 * own lighting in linear space and convert to sRGB at the very end of the
 * fragment shader (see SHADER_TAIL in CelShaders), so a fog colour authored
 * as sRGB hex would come out roughly twice as dark as intended.
 */
export const worldUniforms = {
  uTime: { value: 0 },

  /** 0 at base speed, 1 at max speed. Drives sky sparkle and fog reach. */
  uSpeed01: { value: 0 },

  /**
   * Distance haze colour — true aerial perspective now, not a veil.
   *
   * In a luminous world distance makes things *lighter*, not darker: the air
   * between you and a far object scatters sky into it. So this is the sky's
   * own horizon tone, and far geometry washes out toward it. That is both
   * physically what happens and the single strongest depth cue available on
   * a bright field, where the old trick of fading toward dark does nothing.
   */
  uFogColor: { value: col(HEX.skyHigh).clone() },

  /**
   * (start, end) in world units. Geometry is untouched before `start` and
   * fully hazed by `end`. Re-derived every frame from speed so that the
   * player always gets a comparable number of *seconds* of visible road —
   * see updateFog().
   */
  uFogRange: { value: new THREE.Vector2(150, 470) },

  /** Direction toward the key light / sun, used by sky and specular. */
  uLightDir: { value: new THREE.Vector3(0.4, 0.35, 0.85).normalize() },
};

/** Fog range at base speed, in world units. */
// Thick and close. The reference frames get almost all of their depth from
// mist: a colonnade recedes through four or five distinct value steps and the
// far rank is barely a silhouette. That only happens if haze starts early and
// climbs fast, so the near edge sits just past the play corridor.
// Pushed back again now that there is real architecture to see. At 90/430 the
// haze was doing its job so well it dissolved the entire colonnade before the
// player ever met it: the mist has to reveal the world, not replace it.
// Tightened for the reveal. The player still gets a clear read of the next
// two bounces — at base speed 110 units is roughly three seconds of road —
// but everything past that is committed to the mist and assembles as they
// close on it, which is the whole "into the unknown" intent.
const FOG_NEAR_BASE = 110;
const FOG_FAR_BASE = 520;

/**
 * How far to push fog out as speed climbs.
 *
 * Fog fixed in world units means a player at 180 km/h reads only ~40% as many
 * seconds of road as one at 74 km/h — the course gets harder to *read* exactly
 * as it gets harder to play. Scaling the range all the way with speed would
 * hold reaction time constant but kill the sense of acceleration, so we go
 * partway: enough to stay fair, not so much that speed stops feeling fast.
 */
const FOG_SPEED_COMPENSATION = 0.6;

/** Call once per frame. `speed01` is 0 at base speed, 1 at max. */
export function updateWorldUniforms(delta: number, speed01: number, speedRatioToBase: number): void {
  worldUniforms.uTime.value += delta;
  worldUniforms.uSpeed01.value = speed01;

  const stretch = 1 + (speedRatioToBase - 1) * FOG_SPEED_COMPENSATION;
  worldUniforms.uFogRange.value.set(FOG_NEAR_BASE * stretch, FOG_FAR_BASE * stretch);
}
