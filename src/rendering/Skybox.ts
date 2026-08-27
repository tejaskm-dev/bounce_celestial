import * as THREE from 'three';
import { CelShaders } from './CelShaders';
import { worldUniforms } from './WorldUniforms';
import { HEX, col } from './Palette';
import { TextureGenerator } from './TextureGenerator';
import { InstancePool } from './InstancePool';
import {
  flutedColumn, plainShaftColumn, columnDrum, squatPier, farColumnLOD, farDrumLOD,
  ruinedBrokenColumn, ruinedTruncatedColumn, ruinedCrackedColumn,
  bandRing, skyTower, skyTowerDomed, skyTowerTiered, skyTowerRuined, skyTowerFarLOD,
  archedGate, romanArchGate, ruinedArchGate, balustrade, brazier, floatingIsland,
} from './Architecture';

/**
 * Scenery density, 0..1.
 *
 * A longer loop and a fourth rank took the scene from 220k to 437k triangles.
 * That is a fair trade on a desktop GPU and a bad one on a phone, which is
 * already rendering at a capped pixel ratio for the same reason. Rather than
 * two scene descriptions to keep in sync, every rank reads its spacing through
 * this: the world is the same world, just thinner.
 */
const SCENERY_DENSITY = (typeof window !== 'undefined'
  && window.matchMedia?.('(pointer: coarse)').matches) ? 0.62 : 1;

/** Distance over which every scenery layer recycles behind the player. */
// The scenery recycles on this span. At 620 against a 49-second course the
// player saw it about twice; the course is now ~19,000 units, which meant the
// same arrangement of columns, towers and gates thirty times over. That is the
// real shape of "not enough artifacts" — the density was fine, the *period*
// was not. Instancing means a longer loop costs instances, not draw calls.
const LOOP_SPAN = 1720;

/**
 * Grand Expansive Open-World Stratosphere Skybox & Celestial City Scenery — "Above the Cloudline"
 */
export class Skybox {
  public group: THREE.Group;
  private skyMesh!: THREE.Mesh;
  private pools: InstancePool[] = [];
  private tracked: Array<{ pool: InstancePool; i: number }> = [];
  private flames: Array<{ i: number; x: number; y: number; phase: number }> = [];
  private flamePool?: InstancePool;

  constructor() {
    this.group = new THREE.Group();
    this.createAtmosphericSkyDome();
    this.buildScenery();
  }

  /**
   * 1. Celestial Sky Dome with Multi-Lobe Cumulus Sea
   */
  private createAtmosphericSkyDome(): void {
    const skyGeo = new THREE.SphereGeometry(1, 40, 28);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: worldUniforms.uTime,
        uLightDir: worldUniforms.uLightDir,
        uSpeed01: worldUniforms.uSpeed01,
        uZenith: { value: col(HEX.skyZenith).clone() },
        uMid: { value: col(HEX.skyMid).clone() },
        uHorizon: { value: col(HEX.skyHorizon).clone() },
        uLow: { value: col(HEX.skyLow).clone() },
        uGlow: { value: col(HEX.skyGlow).clone() },
        uSun: { value: col(HEX.sun).clone() },
        uCloudTop: { value: col(HEX.cloudTop).clone() },
        uCloudBody: { value: col(HEX.cloudBody).clone() },
        uCloudShade: { value: col(HEX.cloudShade).clone() },
        uCloudDeep: { value: col(HEX.cloudDeep).clone() },
        uCloudTrough: { value: col(HEX.cloudTrough).clone() },
        uNoise: { value: TextureGenerator.getNoiseTexture() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mv = viewMatrix * vec4(position + cameraPosition, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.99995;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uLightDir;
        uniform float uSpeed01;
        uniform vec3 uZenith, uMid, uHorizon, uLow, uGlow, uSun;
        uniform vec3 uCloudTop, uCloudBody, uCloudShade, uCloudDeep, uCloudTrough;
        uniform sampler2D uNoise;
        varying vec3 vDir;

        // The sky was evaluating up to eleven multi-octave noise stacks per
        // pixel across the whole screen — on its own that was 31ms a frame.
        // Both channels are pre-baked: .r is 4-octave fBm, .g is 3-octave
        // billow. Nothing here was animated by the noise itself, only scrolled,
        // so a wrapping fetch is visually identical and ~20x cheaper.
        float fbm(vec2 p)    { return texture2D(uNoise, p * 0.25).r; }
        float billow(vec2 p) { return texture2D(uNoise, p * 0.25).g; }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 L = normalize(uLightDir);
          float sun = max(dot(d, L), 0.0);

          // 1. Vertical sky gradient
          vec3 c = mix(uHorizon, uMid, smoothstep(-0.01, 0.34, h));
          c = mix(c, uZenith, smoothstep(0.26, 0.92, h));

          // 2. Horizon dawn band
          float band = exp(-abs(h) * 6.2);
          c = mix(c, uLow, band * 0.55);

          // 3. Sun corona and disc
          c += uGlow * pow(sun, 6.0) * 0.34;
          c += uSun * pow(sun, 70.0) * 0.55;
          c += uSun * smoothstep(0.9975, 0.9994, sun) * 1.5;

          // 4. God ray shafts
          vec3 perp = normalize(cross(L, vec3(0.0, 1.0, 0.0)));
          float ang = atan(dot(d, cross(L, perp)), dot(d, perp));
          float shafts = fbm(vec2(ang * 2.6, uTime * 0.035));
          shafts = smoothstep(0.42, 0.92, shafts);
          c += uGlow * shafts * pow(sun, 2.2) * (0.20 + uSpeed01 * 0.10);

          // 5. Sunlit upper cloud banks
          vec2 cuv = vec2(atan(d.z, d.x) * 1.5, h * 2.6) + vec2(uTime * 0.008, 0.0);
          float cl = fbm(cuv * 1.35);
          cl = smoothstep(0.44, 0.80, cl) * smoothstep(0.02, 0.34, h);
          float q = floor(cl * 4.0) / 4.0;
          vec3 cloudCol = mix(uCloudShade, uCloudTop, q);
          cloudCol = mix(cloudCol, uGlow, pow(sun, 3.0) * 0.45);
          c = mix(c, cloudCol, q * 0.62);

          // 6. High-Fidelity Cumulus Cloud Sea Below
          {
            const float SEA_DEPTH = 120.0;
            float depth = SEA_DEPTH / max(0.035, 0.015 - h);
            vec2 pw = d.xz * depth;

            // Domain warping for natural swirling cumulus lobes
            vec2 warp = vec2(fbm(pw * 0.0022 + vec2(uTime * 0.005, 0.0)),
                             fbm(pw * 0.0022 + vec2(5.2, uTime * 0.007))) * 55.0;
            vec2 pWarped = pw + warp;

            float raw = billow(pWarped * 0.0040 + vec2(0.0, uTime * 0.012)) * 0.62
                      + billow(pWarped * 0.0118 + vec2(11.0, uTime * 0.020)) * 0.38;

            float form = smoothstep(0.33, 0.75, raw);

            // Wispy shreds along lobe perimeters
            float wisps = fbm(pWarped * 0.024 + vec2(uTime * 0.020, 0.0));
            form = clamp(form + (wisps - 0.5) * 0.14 * smoothstep(0.30, 0.70, form), 0.0, 1.0);

            // Structure shadow streaks along sun vector
            vec2 shadowRay = normalize(L.xz);
            float towerShadowNoise = fbm(vec2(dot(pWarped, vec2(-shadowRay.y, shadowRay.x)) * 0.014, uTime * 0.004));
            float towerShadow = smoothstep(0.42, 0.78, towerShadowNoise) * 0.24;

            // 5-Tone tonal depth
            vec3 sea = mix(uCloudTrough, uCloudDeep, smoothstep(0.08, 0.38, form));
            sea = mix(sea, uCloudShade, smoothstep(0.30, 0.56, form));
            sea = mix(sea, uCloudBody, smoothstep(0.50, 0.76, form));
            sea = mix(sea, uCloudTop, smoothstep(0.70, 0.94, form));

            // Apply soft structure cast shadow to cloud troughs/sides
            sea = mix(sea, uCloudDeep, towerShadow * (1.0 - smoothstep(0.65, 0.95, form)));

            // Sun raking across the crests
            float lift = smoothstep(0.28, 0.88, form);
            sea = mix(sea, uGlow, pow(sun, 2.0) * 0.44 * lift);

            // Atmospheric horizon fade
            sea = mix(uHorizon, sea, exp(-depth * 0.00022));

            float below = smoothstep(0.10, -0.015, h);
            c = mix(c, sea, below * 0.98);
          }

          // 7. Cumulus banks on horizon
          {
            float ang = atan(d.z, d.x);
            float bankH = billow(vec2(ang * 2.6, 0.7) + vec2(uTime * 0.004, 0.0));
            float top = 0.055 + bankH * 0.10;
            float bank = smoothstep(top, top - 0.055, h) * smoothstep(-0.02, 0.045, h);
            vec3 bankCol = mix(uCloudShade, uCloudTop, smoothstep(0.35, 0.85, bankH));
            bankCol = mix(bankCol, uGlow, pow(sun, 2.5) * 0.45);
            c = mix(c, bankCol, bank * 0.9);
          }

          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = -1000;
    this.group.add(this.skyMesh);
  }

  /**
   * 2. The Colonnade, Towers, Gates, Rails and Braziers
   */
  private buildScenery(): void {
    // Near rank: strong fluting and visible block courses — this is the one
    // the player actually passes, so it carries the detail.
    const stoneMat = CelShaders.createStoneMaterial({
      color: HEX.marble, shadow: HEX.marbleShadow, highlight: HEX.white,
      flutes: 22, veining: 0.46, courses: 0.34, sink: 34,
    });
    // Far ranks: lower detail frequency so distance does not turn the flutes
    // into moiré, but still enough veining to break the silhouette.
    const stoneFarMat = CelShaders.createStoneMaterial({
      color: HEX.stoneFar, shadow: HEX.marbleDeep, highlight: HEX.white,
      flutes: 12, veining: 0.34, courses: 0.16, sink: 34,
    });
    const goldMat = CelShaders.createCelMaterial({
      color: HEX.gilt, shadowColor: HEX.giltDeep, highlightColor: HEX.giltBright,
      rimColor: HEX.sun, rimPower: 0.5,
    });
    const railMat = CelShaders.createStoneMaterial({
      color: HEX.alabaster, shadow: HEX.marbleDim, highlight: HEX.white,
      flutes: 10, veining: 0.26, courses: 1.4, sink: 34,
    });
    const flameMat = CelShaders.createNeonMaterial(HEX.giltBright, 1.15);

    // --- Colonnade Ranks (Near: 44, 74; Far: 118, 182) ---
    // Rank 0 (dist 44): ~84 cols; Rank 1 (dist 74): ~60 cols; Total near = 144
    // Rank 2 (dist 118): ~42 cols; Rank 3 (dist 182): ~30 cols; Total far = 72
    const poolNearFluted = new InstancePool(flutedColumn(), stoneMat, 140);
    const poolNearTuscan = new InstancePool(plainShaftColumn(), stoneMat, 112);
    const poolNearDrum = new InstancePool(columnDrum(), stoneMat, 84);
    const poolNearPier = new InstancePool(squatPier(), stoneMat, 70);
    const poolNearBroken = new InstancePool(ruinedBrokenColumn(), stoneMat, 56);
    const poolNearTrunc = new InstancePool(ruinedTruncatedColumn(), stoneMat, 42);
    const poolNearCrack = new InstancePool(ruinedCrackedColumn(), stoneMat, 42);

    const poolFarLOD = new InstancePool(farColumnLOD(), stoneFarMat, 154);
    const poolFarDrum = new InstancePool(farDrumLOD(), stoneFarMat, 98);
    const poolBand = new InstancePool(bandRing(), goldMat, 440);

    const ranks = [
      { dist: 54, spacing: 22, hMin: 26, hMax: 58, r: 2.4, near: true, band: true },
      { dist: 88, spacing: 34, hMin: 38, hMax: 96, r: 3.8, near: false, band: true },
      { dist: 165, spacing: 56, hMin: 60, hMax: 145, r: 5.8, near: false, band: false },
      // A fourth rank on the horizon. Cheap LOD geometry, and it is what stops
      // the far edge of the colonnade ending in empty sky.
      ...(SCENERY_DENSITY < 1 ? [] : [
        { dist: 268, spacing: 88, hMin: 90, hMax: 210, r: 8.4, near: false, band: false },
      ]),
    ];

    ranks.forEach((rank, ri) => {
      const count = Math.ceil((LOOP_SPAN / rank.spacing) * SCENERY_DENSITY);
      for (let i = 0; i < count; i++) {
        for (const side of [-1, 1]) {
          const seed = Math.sin(i * 12.9898 + ri * 78.233 + side * 3.77) * 43758.5453;
          const rnd = seed - Math.floor(seed);
          const h = rank.hMin + rnd * (rank.hMax - rank.hMin);
          const x = side * (rank.dist + rnd * rank.dist * 0.30);
          const z = i * rank.spacing + (rnd - 0.5) * rank.spacing * 0.55;
          const ry = rnd * 6.28;

          if (rank.near) {
            // Distribute near orders and ruined variants
            let targetPool: InstancePool;
            if (rnd < 0.28) targetPool = poolNearFluted;
            else if (rnd < 0.50) targetPool = poolNearTuscan;
            else if (rnd < 0.68) targetPool = poolNearDrum;
            else if (rnd < 0.78) targetPool = poolNearPier;
            else if (rnd < 0.86) targetPool = poolNearBroken;
            else if (rnd < 0.94) targetPool = poolNearTrunc;
            else targetPool = poolNearCrack;

            const ci = targetPool.claim();
            if (ci >= 0) {
              targetPool.set(ci, x, -34, z, rank.r, h, rank.r, 0, ry, 0);
              this.tracked.push({ pool: targetPool, i: ci });
            }

            if (rnd > 0.40) {
              const bi = poolBand.claim();
              if (bi >= 0) {
                poolBand.set(bi, x, -34 + h * (0.55 + rnd * 0.2), z,
                  rank.r * 0.46, h * 0.02, rank.r * 0.46, 0, ry, 0);
                this.tracked.push({ pool: poolBand, i: bi });
              }
            }
          } else {
            // Far ranks: use LOD pools to save triangles
            const targetPool = rnd < 0.65 ? poolFarLOD : poolFarDrum;
            const ci = targetPool.claim();
            if (ci >= 0) {
              targetPool.set(ci, x, -34, z, rank.r, h, rank.r, 0, ry, 0);
              this.tracked.push({ pool: targetPool, i: ci });
            }
          }
        }
      }
    });

    // --- Floating islands ---
    // `floatingIsland()` has been in Architecture.ts since the art direction
    // changed and was never placed, so the mid-distance between the colonnade
    // and the tower silhouettes has been empty this whole time. They drift at
    // several depths, which also gives the parallax something to read against.
    const islandCount = Math.round((LOOP_SPAN / 96) * SCENERY_DENSITY);
    const poolIsland = new InstancePool(floatingIsland(), stoneFarMat, islandCount * 2 + 4);
    for (let i = 0; i < islandCount; i++) {
      for (const side of [-1, 1]) {
        const seed = Math.sin(i * 21.317 + side * 9.13) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        if (rnd < 0.34) continue;                 // gaps, so it is not a wall
        const ii = poolIsland.claim();
        if (ii < 0) continue;
        const sc = 6 + rnd * 16;
        poolIsland.set(ii,
          side * (140 + rnd * 190),
          -70 - rnd * 90,
          i * (LOOP_SPAN / islandCount) + (rnd - 0.5) * 70,
          sc, sc * (0.5 + rnd * 0.5), sc,
          0, rnd * 6.28, 0);
        this.tracked.push({ pool: poolIsland, i: ii });
      }
    }
    this.pools.push(poolIsland);
    this.group.add(poolIsland.mesh);

    // --- Towers (background silhouettes) ---
    const poolTowerSpire = new InstancePool(skyTower(), stoneFarMat, 22);
    const poolTowerDome = new InstancePool(skyTowerDomed(), stoneFarMat, 22);
    const poolTowerTier = new InstancePool(skyTowerTiered(), stoneFarMat, 17);
    const poolTowerRuin = new InstancePool(skyTowerRuined(), stoneFarMat, 14);
    const poolTowerFar = new InstancePool(skyTowerFarLOD(), stoneFarMat, 14);

    const towerCount = Math.round((LOOP_SPAN / 20) * SCENERY_DENSITY);
    for (let i = 0; i < towerCount; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const seed = Math.sin(i * 45.164) * 43758.5453;
      const rnd = seed - Math.floor(seed);
      const h = 90 + rnd * 130;

      let tPool: InstancePool;
      if (i % 5 === 0) tPool = poolTowerSpire;
      else if (i % 5 === 1) tPool = poolTowerDome;
      else if (i % 5 === 2) tPool = poolTowerTier;
      else if (i % 5 === 3) tPool = poolTowerRuin;
      else tPool = poolTowerFar;

      const ti = tPool.claim();
      if (ti >= 0) {
        tPool.set(ti, side * (140 + rnd * 190), -60,
          i * (LOOP_SPAN / towerCount) + (rnd - 0.5) * 30,
          h * 0.17, h, h * 0.17, 0, rnd * 6.28, 0);
        this.tracked.push({ pool: tPool, i: ti });
      }
    }

    // --- Gates (11 along the causeway) ---
    const poolGateOgee = new InstancePool(archedGate(), stoneMat, 17);
    const poolGateRoman = new InstancePool(romanArchGate(), stoneMat, 11);
    const poolGateRuined = new InstancePool(ruinedArchGate(), stoneMat, 9);

    const gateCount = Math.round(LOOP_SPAN / 62);
    for (let i = 0; i < gateCount; i++) {
      const h = 34 + (i % 3) * 9;
      let gPool: InstancePool;
      if (i === 3 || i === 8) gPool = poolGateRuined;
      else if (i % 2 === 0) gPool = poolGateOgee;
      else gPool = poolGateRoman;

      const gi = gPool.claim();
      if (gi >= 0) {
        gPool.set(gi, 0, -2, (i / gateCount) * LOOP_SPAN + 40, h * 1.15, h, h * 0.5);
        this.tracked.push({ pool: gPool, i: gi });
      }
    }

    // --- Flanking Rails ---
    const railRuns = Math.ceil(LOOP_SPAN / 44);
    const railPool = new InstancePool(balustrade(), railMat, railRuns * 2);
    for (let i = 0; i < railRuns; i++) {
      for (const side of [-1, 1]) {
        const ri2 = railPool.claim();
        if (ri2 >= 0) {
          railPool.set(ri2, side * 30, -3.4, i * 44, 3.2, 5.2, 46);
          this.tracked.push({ pool: railPool, i: ri2 });
        }
      }
    }

    // --- Braziers & Flames ---
    const brazSpacing = 30;
    const brazCount = Math.ceil(LOOP_SPAN / brazSpacing);
    const brazPool = new InstancePool(brazier(), stoneMat, brazCount * 2);
    this.flamePool = new InstancePool(new THREE.OctahedronGeometry(0.9, 0), flameMat, brazCount * 2);
    for (let i = 0; i < brazCount; i++) {
      for (const side of [-1, 1]) {
        const z = i * brazSpacing;
        const h = 13;
        const bi = brazPool.claim();
        if (bi >= 0) {
          brazPool.set(bi, side * 25, -1.4, z, h * 0.34, h, h * 0.34);
          this.tracked.push({ pool: brazPool, i: bi });
        }

        const fi = this.flamePool.claim();
        if (fi >= 0) {
          this.flamePool.set(fi, side * 25, -1.4 + h * 1.02, z, 1, 1.6, 1);
          this.flames.push({ i: fi, x: side * 25, y: -1.4 + h * 1.02, phase: i * 0.7 });
          this.tracked.push({ pool: this.flamePool, i: fi });
        }
      }
    }

    const allPools = [
      poolNearFluted, poolNearTuscan, poolNearDrum, poolNearPier,
      poolNearBroken, poolNearTrunc, poolNearCrack,
      poolFarLOD, poolFarDrum, poolBand,
      poolTowerSpire, poolTowerDome, poolTowerTier, poolTowerRuin, poolTowerFar,
      poolGateOgee, poolGateRoman, poolGateRuined,
      railPool, brazPool, this.flamePool,
    ];

    for (const p of allPools) {
      if (p) {
        p.flush();
        this.group.add(p.mesh);
        this.pools.push(p);
      }
    }
  }

  /**
   * Re-anchor every instance around the player.
   *
   * Recycling only ever pushes instances *forward* — that is all an endless
   * run needs. But a restart teleports the player back to z≈0 while the
   * scenery stays wherever the last run left it, hundreds of units ahead, and
   * nothing ever brings it back. The result is a world with no scenery in it
   * at all: the "empty map". Wrapping by whole loop spans fixes it in either
   * direction and costs one matrix write per instance, once.
   */
  reset(playerZ: number): void {
    const base = playerZ - 90;
    for (const t of this.tracked) {
      const z = t.pool.getZ(t.i);
      const k = Math.floor((z - base) / LOOP_SPAN);
      if (k !== 0) t.pool.offsetZ(t.i, -k * LOOP_SPAN);
    }
    for (const p of this.pools) p.flush();
  }

  public update(playerZ: number, _delta: number): void {
    for (const t of this.tracked) {
      if (t.pool.getZ(t.i) < playerZ - 90) t.pool.offsetZ(t.i, LOOP_SPAN);
    }

    const time = worldUniforms.uTime.value;
    if (this.flamePool) {
      for (const f of this.flames) {
        const z = this.flamePool.getZ(f.i);
        this.flamePool.set(f.i, f.x, f.y, z,
          0.9 + Math.sin(time * 7.0 + f.phase) * 0.10,
          1.5 + Math.sin(time * 9.3 + f.phase * 1.7) * 0.22,
          0.9 + Math.cos(time * 6.1 + f.phase) * 0.10);
      }
    }

    for (const p of this.pools) p.flush();
  }

  dispose(): void {
    for (const p of this.pools) p.dispose();
    this.pools.length = 0;
  }
}

