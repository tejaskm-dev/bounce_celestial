import * as THREE from 'three';
import { TextureGenerator } from './TextureGenerator';
import { worldUniforms } from './WorldUniforms';
import { HEX, col, shadowOf, highlightOf } from './Palette';

/**
 * Distance haze, shared by every world material.
 *
 * The colour is the sky's horizon band rather than black, so geometry
 * dissolves into *sky* and the course appears to materialise out of the
 * distance as the player closes on it. Fading to black instead — which is
 * what this used to do — is invisible against a dark backdrop and reads as
 * "everything is drawn at once, then things wink out".
 */
const FOG_FS = /* glsl */ `
uniform vec3 uFogColor;
uniform vec2 uFogRange;

vec3 applyFog(vec3 c, float viewDist, float worldY) {
  float f = smoothstep(uFogRange.x, uFogRange.y, viewDist);
  // Curved rather than linear: the first stretch of air barely touches a
  // surface, then it goes quickly. A straight ramp greys everything evenly
  // and reads as a dirty lens instead of distance.
  f = f * f * (3.0 - 2.0 * f);
  // The mist sits in a layer. Things below the deck drown in it, things high
  // above rise clear of it — which is what makes the towers read as towers
  // rather than as tall smudges.
  float layer = smoothstep(-24.0, 52.0, worldY);
  f *= mix(1.0, 0.45, layer);
  return mix(c, uFogColor, clamp(f, 0.0, 1.0) * 0.94);
}
`;

/**
 * Output tail for every raw ShaderMaterial in the project.
 *
 * All shading here happens in linear space, but three.js hands us an sRGB
 * framebuffer and — because these are hand-written ShaderMaterials rather
 * than derived from three's own — it does not insert the conversion for us.
 * Without this, ColorManagement quietly converts every authored colour
 * sRGB->linear on the way in and nothing converts it back, so mid-tones land
 * on screen roughly half as bright as authored. Saturated neons survive
 * (they sit near 1.0 where gamma barely bites); everything else crushes.
 */
const SHADER_TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;


/**
 * Instancing preamble for the hand-written vertex shaders.
 *
 * three injects `instanceMatrix` and the USE_INSTANCING define for an
 * InstancedMesh, but it only *applies* them inside its own shader chunks. A
 * hand-written vertex stage that multiplies by modelMatrix alone therefore
 * draws every instance stacked at the origin — which is exactly what happened
 * to the colonnade the moment it was pooled.
 */
/**
 * The "coming into place" reveal.
 *
 * Distance haze alone only makes far things *paler*; the world still arrives
 * fully formed and merely faint. Sinking distant geometry into the cloud and
 * letting it rise as the player closes makes the world visibly assemble ahead
 * of them, which is the difference between fog and a sense of the unknown.
 *
 * Driven per material by uSink, because the play surface must never do this —
 * a deck that reads lower than it actually is would be a lie the player pays
 * for. Scenery sinks; the road the ball lands on does not.
 */
const SINK_VS = /* glsl */ `
uniform float uSink;
uniform vec2 uFogRange;
vec3 applySink(vec3 worldPos) {
  if (uSink <= 0.0) return worldPos;
  float d = distance(worldPos, cameraPosition);
  float t = smoothstep(uFogRange.x * 0.55, uFogRange.y * 0.95, d);
  // Cubed so the last stretch of the approach does most of the rising: things
  // hold low and far away, then lift into place over the final approach.
  worldPos.y -= uSink * t * t * t;
  return worldPos;
}
`;

const INSTANCE_VS = /* glsl */ `
#ifdef USE_INSTANCING
  #define OBJ_POS   (instanceMatrix * vec4(position, 1.0)).xyz
  #define OBJ_NRM   (mat3(instanceMatrix) * normal)
#else
  #define OBJ_POS   position
  #define OBJ_NRM   normal
#endif
`;

/** Uniform entries every fogged material must carry. */
function fogUniforms() {
  return {
    uFogColor: worldUniforms.uFogColor,
    uFogRange: worldUniforms.uFogRange,
  };
}

export interface CelMaterialOptions {
  color: number | string;
  shadowColor?: number | string;
  highlightColor?: number | string;
  map?: THREE.Texture | null;
  rimColor?: number | string;
  rimPower?: number;
  specularColor?: number | string;
  shininess?: number;
  ambientFactor?: number;
  isEmissive?: boolean;
}

/**
 * High-Stylization 4-Band Anime Cel-Shading & Graphic Ink Shaders
 */
export class CelShaders {
  /**
   * 4-Band Quantized Anime Cel Shader
   */
  public static createCelMaterial(options: CelMaterialOptions): THREE.ShaderMaterial {
    const baseCol = new THREE.Color(options.color);
    // Shadow is the surface carried toward the sky, not toward black. Mixing
    // a surface with black is what makes cel shading read as posterised 3D;
    // tinting it is what makes it read as drawn — and on a luminous field a
    // darkened shadow band punches a hole in the frame.
    const shadowCol = options.shadowColor
      ? new THREE.Color(options.shadowColor)
      : shadowOf(options.color as number, 0.5);
    // Highlight is a paler, *desaturated* tint rather than a brighter one.
    // Mixing a fixed amount of white into everything lifts dark surfaces to
    // grey and turns the whole image pastel.
    const lightCol = options.highlightColor
      ? new THREE.Color(options.highlightColor)
      : highlightOf(options.color as number, 0.4);
    const rimCol = new THREE.Color(options.rimColor !== undefined ? options.rimColor : HEX.skyGlow);
    const specCol = new THREE.Color(options.specularColor !== undefined ? options.specularColor : HEX.sun);
    const tarnishCol = col(HEX.goldTarnish);

    const vertexShader = `
      ${INSTANCE_VS}
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(OBJ_POS, 1.0);
        vWorldPosition = worldPosition.xyz;

        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        vNormal = normalize(normalMatrix * OBJ_NRM);

        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      ${FOG_FS}
      uniform vec3 uBaseColor;
      uniform vec3 uShadowColor;
      uniform vec3 uLightColor;
      uniform vec3 uSpecularColor;
      uniform vec3 uRimColor;
      uniform vec3 uTarnishColor;
      uniform float uRimPower;
      uniform float uAmbientFactor;
      uniform float uIsEmissive;
      uniform sampler2D uTexture;
      uniform bool uHasTexture;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);

        // Key direction, matching the low morning sun in the sky dome.
        vec3 L = normalize(vec3(0.34, 0.42, 0.84));

        // Stepped Diffuse Intensity (4 Bands)
        float NdotL = dot(N, L);
        float diffuseStep = 0.0;

        if (NdotL > 0.7) {
          diffuseStep = 1.0; // Highlight band
        } else if (NdotL > 0.25) {
          diffuseStep = 0.7; // Main Lit band
        } else if (NdotL > -0.2) {
          diffuseStep = 0.4; // Midtone band
        } else {
          diffuseStep = 0.0; // Deep Shadow band
        }

        // Sample texture map if present
        vec3 surfaceColor = uBaseColor;
        if (uHasTexture) {
          vec4 texColor = texture2D(uTexture, vUv);
          surfaceColor = mix(surfaceColor, texColor.rgb, texColor.a);
        }

        // Interpolate through 4-step comic palette ramp with shadow tarnish
        vec3 finalDiffuse;
        if (diffuseStep >= 1.0) {
          finalDiffuse = mix(surfaceColor, uLightColor, 0.55);
        } else if (diffuseStep >= 0.7) {
          finalDiffuse = surfaceColor;
        } else if (diffuseStep >= 0.4) {
          finalDiffuse = mix(surfaceColor, uShadowColor, 0.5);
        } else {
          // Shadow tarnish: deep shadow shifts subtly towards warm tarnish rather than flat darkness
          vec3 tarnished = mix(uShadowColor, uTarnishColor, 0.25);
          finalDiffuse = mix(surfaceColor, tarnished, 0.85);
        }

        // Stepped Specular Pop
        vec3 H = normalize(L + V);
        float NdotH = dot(N, H);
        float spec = step(0.965, NdotH) * 0.9;

        // Comic Rim Lighting along silhouette edges
        float rimDot = 1.0 - max(0.0, dot(N, V));
        float rim = step(0.68, rimDot) * uRimPower;

        // Combine composite shading
        vec3 color = finalDiffuse + spec * uSpecularColor + rim * uRimColor;

        if (uIsEmissive > 0.5) {
          color = mix(color, surfaceColor * 1.35, 0.4);
        }

        color = applyFog(color, length(vViewPosition), vWorldPosition.y);

        gl_FragColor = vec4(color, 1.0);
        ${SHADER_TAIL}
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uBaseColor: { value: baseCol },
        uShadowColor: { value: shadowCol },
        uLightColor: { value: lightCol },
        uSpecularColor: { value: specCol },
        uRimColor: { value: rimCol },
        uTarnishColor: { value: tarnishCol },
        uRimPower: { value: options.rimPower !== undefined ? options.rimPower : 0.4 },
        uAmbientFactor: { value: options.ambientFactor !== undefined ? options.ambientFactor : 0.25 },
        uIsEmissive: { value: options.isEmissive ? 1.0 : 0.0 },
        uTexture: { value: options.map || null },
        uHasTexture: { value: !!options.map },
        ...fogUniforms(),
      },
    });
  }


  /**
   * Carved stone: fluting, course lines, crevice AO, edge wear, and dual marble veining,
   * evaluated procedurally in object space.
   *
   * Features:
   * - Crevice ambient occlusion & weathering darkening pooling in joints and flutes
   * - Subtle worn edge highlights along block corners and high geometric curvature
   * - Dual-harmonic procedural marble veining
   * - Four-band cel ramp with sky bounce rim
   */
  public static createStoneMaterial(options: {
    color: number; shadow?: number; highlight?: number;
    flutes?: number; veining?: number; courses?: number;
    /** World units this surface sinks into the mist at full distance. */
    sink?: number;
  }): THREE.ShaderMaterial {
    const base = new THREE.Color(options.color);
    const shadow = options.shadow !== undefined ? new THREE.Color(options.shadow) : shadowOf(options.color, 0.5);
    const light = options.highlight !== undefined ? new THREE.Color(options.highlight) : highlightOf(options.color, 0.4);
    const crevice = col(HEX.marbleCrevice);

    const vertexShader = `
      ${INSTANCE_VS}
      ${SINK_VS}
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      varying vec3 vObjPos;
      void main() {
        vObjPos = position;
        vec4 worldPosition = modelMatrix * vec4(OBJ_POS, 1.0);
        worldPosition.xyz = applySink(worldPosition.xyz);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        vNormal = normalize(normalMatrix * OBJ_NRM);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      ${FOG_FS}
      uniform vec3 uBaseColor, uShadowColor, uLightColor, uRimColor, uCreviceColor;
      uniform float uFlutes, uVeining, uCourses;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      varying vec3 vObjPos;

      uniform sampler2D uNoise;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);
        vec3 L = normalize(vec3(0.34, 0.42, 0.84));

        vec3 surface = uBaseColor;

        // 1. Vertical fluting around object axis
        float ang = atan(vObjPos.z, vObjPos.x);
        float flute = 0.5 + 0.5 * cos(ang * uFlutes);
        float fw = fwidth(ang * uFlutes) * 0.6 + 0.001;
        flute = smoothstep(0.18 - fw, 0.72 + fw, flute);
        surface = mix(mix(surface, uShadowColor, 0.30), surface, flute);

        // 2. Horizontal course lines between masonry blocks
        float course = abs(fract(vObjPos.y * uCourses) - 0.5) * 2.0;
        float cw = fwidth(vObjPos.y * uCourses) * 1.5 + 0.002;
        surface = mix(uShadowColor, surface, smoothstep(0.06 - cw, 0.20 + cw, course));

        // 3. Crevice Ambient Occlusion & Weathering pooling in joints and flutes
        float creviceAO = smoothstep(0.04 - cw, 0.22 + cw, course) * (0.80 + 0.20 * flute);
        surface = mix(mix(uCreviceColor, uShadowColor, 0.5), surface, creviceAO);

        // 4. Worn Edge Highlighting: block edges and geometric silhouettes lighten
        float edgeWear = smoothstep(0.24 + cw, 0.10 - cw, course) * smoothstep(0.04 - cw, 0.12 + cw, course);
        float geomEdge = clamp(length(fwidth(N)) * 1.2, 0.0, 1.0);
        surface = mix(surface, uLightColor, edgeWear * 0.40 + geomEdge * 0.20);

        // 5. Dual-harmonic marble veining.
        // Both harmonics come from one pre-baked fetch at two scales, in place
        // of the two 4-octave hash stacks this used to run per pixel.
        vec2 vuv = vObjPos.xy * 0.11 + vObjPos.zy * 0.05;
        float veinBroad = texture2D(uNoise, vuv).r;
        float veinFine = texture2D(uNoise, vuv * 3.1 + 0.37).b;
        float vein = mix(veinBroad, veinFine, 0.35);
        surface = mix(surface, uShadowColor, smoothstep(0.55, 0.85, vein) * uVeining);
        surface = mix(surface, uLightColor, smoothstep(0.62, 0.30, vein) * uVeining * 0.45);

        // 6. Four-band cel ramp
        float NdotL = dot(N, L);
        vec3 lit;
        if (NdotL > 0.62)       lit = mix(surface, uLightColor, 0.45);
        else if (NdotL > 0.18)  lit = surface;
        else if (NdotL > -0.28) lit = mix(surface, uShadowColor, 0.48);
        else                    lit = mix(surface, uShadowColor, 0.82);

        // Sky bounce along the upper faces
        lit += uRimColor * max(0.0, N.y) * 0.10;

        float rimDot = 1.0 - max(0.0, dot(N, V));
        lit += uRimColor * smoothstep(0.62, 0.95, rimDot) * 0.30;

        lit = applyFog(lit, length(vViewPosition), vWorldPosition.y);
        gl_FragColor = vec4(lit, 1.0);
        ${SHADER_TAIL}
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uBaseColor: { value: base },
        uShadowColor: { value: shadow },
        uLightColor: { value: light },
        uCreviceColor: { value: crevice },
        uRimColor: { value: new THREE.Color(HEX.skyHigh) },
        uNoise: { value: TextureGenerator.getNoiseTexture() },
        uSink: { value: options.sink ?? 0 },
        uFlutes: { value: options.flutes ?? 16 },
        uVeining: { value: options.veining ?? 0.35 },
        uCourses: { value: options.courses ?? 0.35 },
        ...fogUniforms(),
      },
    });
  }

  /**
   * Inverted Hull Comic Ink Outline Material
   */
  public static createOutlineMaterial(thickness: number = 0.06, colorHex: number = HEX.ink): THREE.ShaderMaterial {
    const vertexShader = `
      ${INSTANCE_VS}
      uniform float uThickness;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      void main() {
        // Displace vertices outward along normals
        vec3 displaced = OBJ_POS + normalize(OBJ_NRM) * uThickness;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      ${FOG_FS}
      uniform vec3 uColor;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      void main() {
        // Ink fogs with everything else, or outlines float in the haze as
        // hard black wireframes over a dissolved world.
        vec3 color = applyFog(uColor, length(vViewPosition), vWorldPosition.y);
        gl_FragColor = vec4(color, 1.0);
        ${SHADER_TAIL}
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uThickness: { value: thickness },
        uColor: { value: new THREE.Color(colorHex) },
        ...fogUniforms(),
      },
      side: THREE.BackSide,
      depthWrite: true,
    });
  }

  /**
   * Specialized Deep Mechanical Tunnel Shader
   * Maintains deep midnight navy contrast while rendering vivid structural glow lines and rib reflections.
   */
  public static createTunnelMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        vNormal = normalize(normalMatrix * -normal); // Invert normal for inside cylinder view

        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      ${FOG_FS}
      uniform sampler2D uTexture;
      uniform vec3 uBaseNavy;
      uniform vec3 uGridColor;
      uniform vec3 uCyanGlow;
      uniform vec3 uMagentaGlow;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec4 texColor = texture2D(uTexture, vUv);
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);

        // Deep rich navy base
        vec3 color = texColor.rgb;

        // Subtle specular glint along ribs
        vec3 L = normalize(vec3(0.0, 1.0, 0.4));
        vec3 H = normalize(L + V);
        float spec = pow(max(0.0, dot(N, H)), 16.0) * 0.45;
        color += spec * uCyanGlow;

        // Atmospheric depth falloff, now sharing the world's haze rather than
        // fading to its own near-black constant.
        color = applyFog(color, length(vViewPosition), vWorldPosition.y);

        gl_FragColor = vec4(color, 1.0);
        ${SHADER_TAIL}
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      uniforms: {
        uTexture: { value: texture },
        uBaseNavy: { value: new THREE.Color(0x060414) },
        uGridColor: { value: new THREE.Color(0x1B1244) },
        uCyanGlow: { value: new THREE.Color(0x00F0FF) },
        uMagentaGlow: { value: new THREE.Color(0xFF2A85) },
        ...fogUniforms(),
      },
    });
  }

  /**
   * Specialized Neon Glowing Emissive Material
   */
  public static createNeonMaterial(colorHex: number | string, glowBoost: number = 1.4): THREE.ShaderMaterial {
    const col = new THREE.Color(colorHex);
    const vertexShader = `
      ${INSTANCE_VS}
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      void main() {
        vNormal = normalize(normalMatrix * OBJ_NRM);
        vec4 worldPosition = modelMatrix * vec4(OBJ_POS, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      ${FOG_FS}
      uniform vec3 uColor;
      uniform float uGlowBoost;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPosition;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);
        float rim = 1.0 - max(0.0, dot(N, V));
        vec3 color = uColor * (0.9 + rim * 0.8) * uGlowBoost;
        // Emissives fog at half rate: a light source seen through haze dims,
        // but it is still legibly a light, and these are the player's read on
        // where the course goes next.
        vec3 hazed = applyFog(color, length(vViewPosition), vWorldPosition.y);
        color = mix(color, hazed, 0.5);
        gl_FragColor = vec4(color, 1.0);
        ${SHADER_TAIL}
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uColor: { value: col },
        uGlowBoost: { value: glowBoost },
        ...fogUniforms(),
      },
    });
  }
}
