import * as THREE from 'three';

/**
 * BOUNCE's colour grammar — "Above the Cloudline".
 *
 * The world is a high-altitude morning: a luminous sky, sunlit stone, and gold.
 * This is a *light field with soft marks*, the inverse of the neon direction it
 * replaces. There, the world was near-black and every visible thing emitted its
 * own light. Here the sky is the light source and objects are read as values
 * standing in it. That distinction drives every choice below — it is why the
 * shadows are tinted rather than darkened, and why almost nothing is emissive.
 *
 * The grammar is as strict as the old one, and inverted:
 *
 *   ALABASTER = the ground you can stand on
 *   MARBLE    = structure — arches, colonnades, the architecture itself
 *   GILT      = direction, reward, and the edge of the floor
 *   BLUSH     = machinery: it moves, it may shove you, it never kills
 *   VERDANT   = life — island tops, growing things, purely decorative
 *   CRIMSON   = it will kill you. Nothing else in the game is red.
 *
 * That last line is the load-bearing one, and it is deliberately a *pigment*
 * rather than a light. Lacquer red belongs in this world — it is the temple
 * red on the railings and gate posts of the reference — so it can shout
 * without looking pasted in from somewhere else, which is exactly what a neon
 * red would do. Against near-white stone under a near-white mist it is the
 * only saturated thing in frame, and it carries at any distance.
 */
export const HEX = {
  // --- sky ---------------------------------------------------------------
  // A real blue at the zenith washing to near-white at the horizon. The
  // contrast between a saturated top and a white bottom is what makes the
  // reference frames feel airy; an evenly pale sky just reads as washed out.
  skyZenith: 0x2F6FBE,
  skyMid: 0x77AEDF,
  skyHigh: 0xA3C4E2,
  skyHorizon: 0xC9DCEC,
  skyLow: 0xDCE9F4,
  skyGlow: 0xF2E2C4,
  sun: 0xFBF4E4,

  /**
   * The cloud sea. These need a real value range — the first version put every
   * tone within 9% of the sky behind it, so a fully-working cloud layer was
   * rendering and reading as flat empty blue. Cumulus is only legible when its
   * shadowed underside is genuinely much darker than its sunlit top.
   */
  cloudTop: 0xF4F8FC,
  cloudBody: 0xDBE6F1,
  cloudShade: 0xA7BFD6,
  cloudDeep: 0x8AA9C8,
  cloudTrough: 0x6E90B4,

  // --- the play surface: pale engraved stone -----------------------------
  alabaster: 0xE3DED0,
  alabasterDim: 0xC9C2AE,
  alabasterDeep: 0xA8A498,
  tilePale: 0xEDE8DC,
  tileWarm: 0xD6CDB6,
  tileCool: 0xC3CCD9,

  // --- architecture ------------------------------------------------------
  marble: 0xD3D9E6,
  marbleDim: 0xA6B3C8,
  marbleDeep: 0x7E8EA9,
  marbleShadow: 0x5A6B87,
  /** Distant stone desaturates into the mist rather than darkening. */
  stoneFar: 0xB2C4D9,
  stoneFarther: 0xC6D6E6,

  // --- gold: narrow banding, finials, inlay ------------------------------
  gilt: 0xC8A868,
  giltBright: 0xE3CE9E,
  giltDeep: 0xA07B39,
  giltShadow: 0x8A6524,

  // --- machinery: moves you, never kills ---------------------------------
  blush: 0xC99AA0,
  blushBright: 0xE6C3C6,
  blushDeep: 0x9E6E75,

  // --- life: the pastoral edge -------------------------------------------
  verdant: 0x8FB07C,
  verdantDeep: 0x5F7F5E,
  water: 0xC3DEEC,
  waterDeep: 0x8CBAD4,

  // --- danger ------------------------------------------------------------
  // Lacquer crimson, the temple red of the reference railings — saturated
  // enough to shout at any distance, but a *pigment* rather than a light, so
  // it belongs to the same painted world as the stone around it. Neon red
  // would read as an object from a different game pasted into the frame.
  danger: 0xC0413E,
  dangerBright: 0xCF5A53,
  dangerDeep: 0x8A2320,
  /** Reserved for the deepest hazard cores and cast shadow. */
  void: 0x3B3348,
  voidDeep: 0x241C31,
  voidRim: 0xC0413E,

  // --- ink and shadow ----------------------------------------------------
  /**
   * Outlines are a soft slate rather than black. A hard black line against a
   * near-white sky reads as enormous weight and turns the frame into a
   * colouring book.
   */
  ink: 0x6E7890,
  inkSoft: 0x9AA3B6,

  /**
   * Shadows are *tinted*, not darkened — a surface carried toward the sky.
   * Mixing toward black is what makes cel shading read as posterised 3D.
   */
  shadowCool: 0x93AECE,
  shadowWarm: 0xE0D2BC,

  white: 0xFFFFFF,
  bone: 0xF7FAFD,
  marbleCrevice: 0x5C6D8A,
  alabasterCarved: 0xE8E2D2,
  goldTarnish: 0x9B783E,
  giltShine: 0xFFF3D1,
  inkFaint: 0xB5BECE,
} as const;

export type HexName = keyof typeof HEX;

/** Convert a HEX constant number to CSS hex string for canvas 2D rendering. */
export function hexCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** Cached THREE.Color per hex, so shared materials never re-allocate. */
const cache = new Map<number, THREE.Color>();

/** A shared, immutable-by-convention Color for a palette entry. */
export function col(hex: number): THREE.Color {
  let c = cache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    cache.set(hex, c);
  }
  return c;
}

/** A fresh Color, for the rare case something needs to mutate one. */
export function colOwned(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

/**
 * The shadow tone for a surface: its own colour carried toward the sky rather
 * than toward black, so shadowed stone stays stone.
 */
export function shadowOf(hex: number, amount = 0.45): THREE.Color {
  return new THREE.Color(hex).lerp(col(HEX.shadowCool), amount);
}

/**
 * The lit tone for a surface: a paler, *desaturated* tint of the surface
 * rather than a brighter one. Adding white to everything is what turns a
 * stylised frame pastel; this keeps highlights reading as light on a material.
 */
export function highlightOf(hex: number, amount = 0.38): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * 0.55, Math.min(1, hsl.l + amount * 0.55));
}

