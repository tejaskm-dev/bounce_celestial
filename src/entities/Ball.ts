import * as THREE from 'three';
import { HEX, hexCss } from '../rendering/Palette';
import { CelShaders } from '../rendering/CelShaders';
import { SKINS, SkinDefinition } from '../config/palettes';
import { CONSTANTS } from '../config/constants';

/**
 * Protagonist Kinetic Ball Entity with Deformable Mesh & Inertia Gyro Suspension
 * Features:
 * - Dynamic volume-preserving squash & stretch spring physics with impact-scaled stiffness
 * - Secondary slower harmonic wobble for organic shell oscillation
 * - Inertia-lagged gyro hoop and satellite nubs (compliantly follows deformation with soft catch-up)
 * - Directional aerodynamic silhouettes for Air Dash and Heavy Ground Slam
 * - Smoothly blended expressive anime face with real-time gaze / pupil tracking
 * - Pre-launch compression coil and steering lean anticipation
 * - 100% simulation-driven timers (zero setTimeout / wall-clock bugs)
 */
export class Ball {
  public group: THREE.Group;
  public deformGroup: THREE.Group;
  public gyroGroup: THREE.Group;
  public mesh: THREE.Mesh;
  public outlineMesh: THREE.Mesh;
  public gyroHoop: THREE.Mesh;
  public nubGroup: THREE.Group;
  public faceMesh: THREE.Mesh;

  // Physics state
  public position: THREE.Vector3 = new THREE.Vector3(0, 5, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, CONSTANTS.BASE_SPEED);
  public isGrounded: boolean = false;
  public radius: number = CONSTANTS.BALL_RADIUS;

  // Boost Floats / Dash Currency
  public boostFloats: number = CONSTANTS.STARTING_BOOST_FLOATS;

  // Ability states
  public isDashing: boolean = false;
  public dashTimer: number = 0;
  public dashCooldown: number = 0;
  public dashDirection: number = 0;

  public isSlamming: boolean = false;
  public slamCooldown: number = 0;

  // Airborne & Trick Tracking
  public airTime: number = 0;
  public rollRotation: number = 0;
  public trickSpinAngle: number = 0;
  public trickFlipAngle: number = 0;
  public trickNames: string[] = [];

  // Volume-Preserving Squash & Stretch Spring Physics
  private stretch: number = 1.0;
  private stretchVel: number = 0.0;
  private springK: number = 420;
  private springC: number = 22;

  // Secondary Slower Harmonic Oscillator (Wobble)
  private wobble: number = 0.0;
  private wobbleVel: number = 0.0;

  // Gyro Hoop Suspension Lag
  private hoopScaleY: number = 1.0;
  private hoopOffsetY: number = 0.0;
  private rollAngle: number = 0;
  private hoopSpinAngle: number = 0;
  private precessAngle: number = 0;
  private leanAngle: number = 0;
  private prevSteerInput: number = 0;

  // Face Decal, Expressions & Pupil Tracking
  private faceAnchor: THREE.Group;
  private faceCanvas: HTMLCanvasElement;
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: THREE.CanvasTexture;
  private faceMat: THREE.MeshBasicMaterial;

  public currentExpression: 'normal' | 'squint' | 'shock' | 'dizzy' | 'cool' | 'happy' | 'focus' = 'normal';
  private expressionTimer: number = 0;
  private blinkTimer: number = 2.5;
  private blinkAmount: number = 0;
  private squintWeight: number = 0;
  private happyWeight: number = 0;
  private shockWeight: number = 0;
  private dizzyWeight: number = 0;
  private coolWeight: number = 0;
  private dizzyAngle: number = 0;
  private pupilX: number = 0;
  private pupilY: number = 0;

  // Timing Ring Visual
  private timingRing: THREE.Mesh;
  private timingMat: THREE.ShaderMaterial;

  // Speed Streak Light Beams
  private speedStreakGroup: THREE.Group;
  private streakMeshes: THREE.Mesh[] = [];
  private streakMaterials: THREE.ShaderMaterial[] = [];

  // Skin & Visual Customization
  public currentSkin: SkinDefinition;

  constructor(skinId: string = 'cyan') {
    this.group = new THREE.Group();
    this.deformGroup = new THREE.Group();
    this.group.add(this.deformGroup);

    this.gyroGroup = new THREE.Group();
    this.group.add(this.gyroGroup);

    this.currentSkin = SKINS[skinId] || SKINS.cyan;

    // 1. Base Ball Shell (Sphere geometry inside deformGroup)
    const geo = new THREE.SphereGeometry(this.radius, 32, 24);
    const celMat = CelShaders.createCelMaterial({
      color: this.currentSkin.primaryColor,
      shadowColor: HEX.marbleShadow,
      highlightColor: HEX.white,
      rimColor: HEX.giltBright,
      rimPower: 0.7,
      specularColor: HEX.white,
      shininess: 40,
      isEmissive: true,
    });
    this.mesh = new THREE.Mesh(geo, celMat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.deformGroup.add(this.mesh);

    // Inverted-Hull Ink Outline
    const outlineMat = CelShaders.createOutlineMaterial(0.10, HEX.voidDeep);
    this.outlineMesh = new THREE.Mesh(geo, outlineMat);
    this.mesh.add(this.outlineMesh);

    // 2. Gyro Hoop Ring (Inertia suspension inside gyroGroup)
    const hoopGeo = new THREE.TorusGeometry(this.radius * 1.03, this.radius * 0.085, 8, 48);
    const hoopMat = CelShaders.createCelMaterial({
      color: HEX.marbleDeep,
      shadowColor: HEX.marbleShadow,
      highlightColor: HEX.gilt,
      rimColor: HEX.giltBright,
      rimPower: 0.6,
    });
    this.gyroHoop = new THREE.Mesh(hoopGeo, hoopMat);
    this.gyroGroup.add(this.gyroHoop);
    this.gyroHoop.add(new THREE.Mesh(hoopGeo, CelShaders.createOutlineMaterial(0.06, HEX.voidDeep)));

    // 4 Rotating Kinetic Nubs along the hoop
    this.nubGroup = new THREE.Group();
    const nubGeo = new THREE.OctahedronGeometry(this.radius * 0.16, 0);
    const nubMat = CelShaders.createCelMaterial({
      color: HEX.gilt,
      highlightColor: HEX.white,
      isEmissive: true,
    });

    for (let i = 0; i < 4; i++) {
      const nub = new THREE.Mesh(nubGeo, nubMat);
      const angle = (i / 4) * Math.PI * 2;
      nub.position.set(Math.cos(angle) * this.radius * 1.03, Math.sin(angle) * this.radius * 1.03, 0);
      this.nubGroup.add(nub);
    }
    this.gyroGroup.add(this.nubGroup);

    // 3. Expressive Canvas-Backed Face Decal Anchor
    this.faceAnchor = new THREE.Group();
    this.deformGroup.add(this.faceAnchor);

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 256;
    this.faceCanvas.height = 256;
    this.faceCtx = this.faceCanvas.getContext('2d')!;

    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.generateMipmaps = true;
    this.faceTex.minFilter = THREE.LinearMipmapLinearFilter;

    const faceGeo = new THREE.PlaneGeometry(1.85, 1.85);
    this.faceMat = new THREE.MeshBasicMaterial({
      map: this.faceTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.faceMesh = new THREE.Mesh(faceGeo, this.faceMat);
    this.faceMesh.position.set(0, 0.05, this.radius * 1.02);
    this.faceAnchor.add(this.faceMesh);

    // Render initial face frame
    this.renderFaceCanvas();

    // 4. Shrinking Timing Ring for Perfect Landing
    const ringGeo = new THREE.RingGeometry(0.72, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2);

    this.timingMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAmount: { value: 0.0 },
        uHot: { value: 0.0 },
        uColor: { value: new THREE.Color(HEX.giltBright) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAmount;
        uniform float uHot;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          if (uAmount <= 0.005) discard;
          float r = length(vPos.xz);
          float edge = 1.0 - smoothstep(0.86, 1.0, r);
          float inner = smoothstep(0.70, 0.88, r);
          float band = edge * inner;

          // Mechanical tick marks
          float ang = atan(vPos.z, vPos.x);
          float tick = smoothstep(0.55, 0.95, abs(fract(ang / 0.523598 + 0.5) - 0.5) * 2.0);
          band *= (0.55 + 0.45 * tick);

          vec3 gold = vec3(2.4, 2.0, 0.6);
          vec3 c = mix(uColor, gold, uHot) * (1.3 + uHot * 2.5);
          band *= (1.0 + uHot * 1.3);
          gl_FragColor = vec4(c, band * uAmount);
        }
      `,
    });

    this.timingRing = new THREE.Mesh(ringGeo, this.timingMat);
    this.timingRing.frustumCulled = false;
    this.timingRing.position.set(0, -this.radius * 0.3, 0);
    this.group.add(this.timingRing);

    // 5. Stylized Speed Streak Light Beams
    this.speedStreakGroup = new THREE.Group();
    this.group.add(this.speedStreakGroup);
    this.initSpeedStreaks();
  }

  private initSpeedStreaks(): void {
    const streakConfigs = [
      { offsetX: 0, offsetY: -0.15, length: 9.5, width: 0.45, rotZ: 0, rotY: 0, isCenter: true },
      { offsetX: -0.26, offsetY: -0.08, length: 8.2, width: 0.32, rotZ: 0.08, rotY: 0.05, isCenter: false },
      { offsetX: 0.26, offsetY: -0.08, length: 8.2, width: 0.32, rotZ: -0.08, rotY: -0.05, isCenter: false },
      { offsetX: -0.50, offsetY: 0.02, length: 6.8, width: 0.24, rotZ: 0.16, rotY: 0.10, isCenter: false },
      { offsetX: 0.50, offsetY: 0.02, length: 6.8, width: 0.24, rotZ: -0.16, rotY: -0.10, isCenter: false },
    ];

    streakConfigs.forEach((cfg) => {
      const shape = new THREE.Shape();
      shape.moveTo(-cfg.width / 2, 0);
      shape.lineTo(cfg.width / 2, 0);
      shape.lineTo(0.01, -cfg.length);
      shape.lineTo(-0.01, -cfg.length);
      shape.closePath();

      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);

      const streakMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCoreColor: { value: new THREE.Color(cfg.isCenter ? '#FFFFFF' : '#80F4FF') },
          uEdgeColor: { value: new THREE.Color(this.currentSkin.trailColor) },
          uOpacity: { value: 0.95 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uCoreColor;
          uniform vec3 uEdgeColor;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            float tailFalloff = pow(1.0 - vUv.y, 1.2);
            float edgeFade = 1.0 - abs(vUv.x - 0.5) * 2.0;
            vec3 color = mix(uEdgeColor, uCoreColor, edgeFade * 0.9);
            gl_FragColor = vec4(color, tailFalloff * edgeFade * uOpacity);
          }
        `,
      });

      const mesh = new THREE.Mesh(geo, streakMat);
      mesh.position.set(cfg.offsetX, cfg.offsetY, -0.4);
      mesh.rotation.z = cfg.rotZ;
      mesh.rotation.y = cfg.rotY;

      this.streakMeshes.push(mesh);
      this.streakMaterials.push(streakMat);
      this.speedStreakGroup.add(mesh);
    });
  }

  public setSkin(skinId: string): void {
    const skin = SKINS[skinId];
    if (!skin) return;
    this.currentSkin = skin;

    (this.mesh.material as THREE.ShaderMaterial).uniforms.uBaseColor.value.set(skin.primaryColor);
    this.streakMaterials.forEach((mat) => {
      mat.uniforms.uEdgeColor.value.set(skin.trailColor);
    });

    this.renderFaceCanvas();
  }

  /**
   * Sets face expression with a simulation-driven duration (zero setTimeout).
   */
  public setFaceExpression(
    expression: 'normal' | 'squint' | 'shock' | 'dizzy' | 'cool' | 'happy' | 'focus',
    duration: number = 0.35
  ): void {
    this.currentExpression = expression;
    this.expressionTimer = duration;
  }

  /**
   * Procedurally draws smoothly blended button-eye face with gaze/pupil tracking.
   */
  private renderFaceCanvas(): void {
    const ctx = this.faceCtx;
    const size = 256;
    ctx.clearRect(0, 0, size, size);

    const eyeY = 108;
    const eyeSpacing = 48;
    const eyeRadius = 20;
    const cx = size / 2;

    const squint = Math.max(0, Math.min(1, this.squintWeight));
    const happy = Math.max(0, Math.min(1, this.happyWeight));
    const shock = Math.max(0, Math.min(1, this.shockWeight));
    const dizzy = Math.max(0, Math.min(1, this.dizzyWeight));
    const cool = Math.max(0, Math.min(1, this.coolWeight));
    const effectiveBlink = Math.max(this.blinkAmount, squint, happy * 0.85);

    // 1. Cheek Blushes (expand and brighten on happy/cool)
    const blushAlpha = 0.45 + happy * 0.35 + cool * 0.15;
    const blushR = 17 + happy * 6;
    ctx.fillStyle = `rgba(201, 154, 160, ${blushAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx - 60, eyeY + 34, blushR, 10 + happy * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx + 60, eyeY + 34, blushR, 10 + happy * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Eyes
    const eyeLeftX = cx - eyeSpacing;
    const eyeRightX = cx + eyeSpacing;

    const drawEye = (ex: number, ey: number, isRight: boolean) => {
      // Dizzy: spinning stitched crosses with spiral arcs
      if (dizzy > 0.15) {
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(this.dizzyAngle * (isRight ? -1 : 1));

        ctx.strokeStyle = hexCss(HEX.ink);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        const cross = 12 + dizzy * 4;

        ctx.beginPath();
        ctx.moveTo(-cross, -cross);
        ctx.lineTo(cross, cross);
        ctx.moveTo(cross, -cross);
        ctx.lineTo(-cross, cross);
        ctx.stroke();

        ctx.strokeStyle = hexCss(HEX.inkSoft);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // Shock: wide shocked eye with tiny pupil
      if (shock > 0.4) {
        const shockRadius = eyeRadius * (1.1 + shock * 0.25);
        ctx.fillStyle = hexCss(HEX.ink);
        ctx.beginPath();
        ctx.arc(ex, ey, shockRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexCss(HEX.marbleDim);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, ey, shockRadius - 3, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny cross
        ctx.strokeStyle = hexCss(HEX.white);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        const cross = 4;
        ctx.beginPath();
        ctx.moveTo(ex - cross, ey - cross);
        ctx.lineTo(ex + cross, ey + cross);
        ctx.moveTo(ex + cross, ey - cross);
        ctx.lineTo(ex - cross, ey + cross);
        ctx.stroke();
        return;
      }

      // Cool wink (right eye winks)
      if (cool > 0.4 && isRight) {
        ctx.strokeStyle = hexCss(HEX.ink);
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, ey + 4, 15, Math.PI * 1.1, Math.PI * 1.9, false);
        ctx.stroke();
        return;
      }

      // Blink / Squint / Happy closed arc
      if (effectiveBlink > 0.5) {
        const t = (effectiveBlink - 0.5) * 2.0;
        ctx.strokeStyle = hexCss(HEX.ink);
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const startAng = happy > 0.3 ? Math.PI * 1.15 : Math.PI * 0.9;
        const endAng = happy > 0.3 ? Math.PI * 1.85 : Math.PI * 2.1;
        ctx.arc(ex, ey + 3 * t, 15, startAng, endAng, false);
        ctx.stroke();
        return;
      }

      // Normal button eye with dynamic gaze/pupil tracking
      const px = this.pupilX * 6.0;
      const py = this.pupilY * 4.5;

      // Button base
      ctx.fillStyle = hexCss(HEX.ink);
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Inset ring
      ctx.strokeStyle = hexCss(HEX.marbleDim);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius - 3, 0, Math.PI * 2);
      ctx.stroke();

      // White stitched cross shifted by gaze
      ctx.strokeStyle = hexCss(HEX.white);
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      const crossSize = 7.5;

      ctx.beginPath();
      ctx.moveTo(ex + px - crossSize, ey + py - crossSize);
      ctx.lineTo(ex + px + crossSize, ey + py + crossSize);
      ctx.moveTo(ex + px + crossSize, ey + py - crossSize);
      ctx.lineTo(ex + px - crossSize, ey + py + crossSize);
      ctx.stroke();

      // Glint dot
      ctx.fillStyle = hexCss(HEX.white);
      ctx.beginPath();
      ctx.arc(ex + px * 0.6 - 7, ey + py * 0.6 - 7, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    drawEye(eyeLeftX, eyeY, false);
    drawEye(eyeRightX, eyeY, true);

    // 3. Stitched Mouth
    ctx.strokeStyle = hexCss(HEX.ink);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shock > 0.3) {
      // Small cute shocked 'O' mouth
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 22, 9, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (dizzy > 0.3) {
      // Wavy zigzag dizzy mouth
      ctx.beginPath();
      ctx.moveTo(cx - 18, eyeY + 24);
      ctx.lineTo(cx - 9, eyeY + 18);
      ctx.lineTo(cx, eyeY + 26);
      ctx.lineTo(cx + 9, eyeY + 18);
      ctx.lineTo(cx + 18, eyeY + 24);
      ctx.stroke();
    } else if (squint > 0.6 && happy < 0.2) {
      // Tightened impact line
      ctx.beginPath();
      ctx.moveTo(cx - 16, eyeY + 22);
      ctx.lineTo(cx + 16, eyeY + 22);
      ctx.stroke();
    } else {
      // Cute stitched smile arc
      const smileR = 24 + happy * 6;
      ctx.beginPath();
      ctx.arc(cx, eyeY + 12, smileR, 0.15 * Math.PI, 0.85 * Math.PI, false);
      ctx.stroke();

      // Smile corner dimples
      ctx.beginPath();
      ctx.moveTo(cx - smileR * 0.9, eyeY + 28);
      ctx.lineTo(cx - smileR * 0.98, eyeY + 22);
      ctx.moveTo(cx + smileR * 0.9, eyeY + 28);
      ctx.lineTo(cx + smileR * 0.98, eyeY + 22);
      ctx.stroke();
    }

    this.faceTex.needsUpdate = true;
  }

  /**
   * Kicks the volume-preserving squash spring.
   * `amount` 0..1 (positive squashes flat, negative stretches tall)
   */
  public impact(amount: number): void {
    this.stretch = THREE.MathUtils.clamp(this.stretch - amount, 0.32, 2.2);
    this.stretchVel -= amount * 8.5;
  }

  // --- Boost Floats Economy ---
  public addBoostFloat(): boolean {
    if (this.boostFloats < CONSTANTS.MAX_BOOST_FLOATS) {
      this.boostFloats++;
      return true;
    }
    return false;
  }

  public canAirDash(): boolean {
    return this.boostFloats > 0 && this.dashCooldown <= 0;
  }

  public triggerAirDash(dir: number): boolean {
    if (!this.canAirDash()) return false;

    this.boostFloats--;
    this.isDashing = true;
    this.dashTimer = CONSTANTS.AIR_DASH_DURATION;
    this.dashCooldown = CONSTANTS.AIR_DASH_COOLDOWN;
    this.dashDirection = dir !== 0 ? dir : 0;

    if (dir !== 0) {
      this.velocity.x = dir * CONSTANTS.AIR_DASH_SPEED_LATERAL;
    }
    this.velocity.z += CONSTANTS.AIR_DASH_SPEED_FORWARD;
    this.velocity.y = Math.max(this.velocity.y * 0.3, 4.5);

    this.impact(-0.42); // Elongate along supersonic thrust
    this.trickNames.push('AIR DASH');
    this.setFaceExpression('cool', 0.45);
    return true;
  }

  public canSlam(): boolean {
    return !this.isGrounded && !this.isSlamming && this.slamCooldown <= 0;
  }

  public triggerSlam(): boolean {
    if (!this.canSlam()) return false;

    this.isSlamming = true;
    this.slamCooldown = CONSTANTS.SLAM_COOLDOWN;
    this.velocity.y = CONSTANTS.SLAM_DOWN_VELOCITY;
    this.impact(-0.50); // Elongate downward into spearhead pose
    this.setFaceExpression('squint', 0.50);
    return true;
  }

  /**
   * Hardness-dependent dynamic squash with subtle secondary harmonic wobble.
   * @param hardness 0..1 — impact speed scaling.
   */
  public triggerLandingSquash(isPerfect: boolean = false, isSlam: boolean = false, hardness: number = 0.5): void {
    const h = THREE.MathUtils.clamp(hardness, 0, 1);
    const squashDepth = isSlam ? 0.55
      : isPerfect ? 0.44
      : 0.18 + h * 0.26;

    // Vary spring stiffness and damping with impact
    if (isSlam || h > 0.65) {
      this.springK = 480;
      this.springC = 18;
    } else if (h < 0.30) {
      this.springK = 400;
      this.springC = 26;
    } else {
      this.springK = 420;
      this.springC = 22;
    }

    this.impact(squashDepth);

    // Excite subtle secondary slower harmonic wobble for hard landings
    const wobbleKick = isSlam ? 0.08 : (0.02 + h * 0.05);
    this.wobbleVel -= wobbleKick * 7.5;

    this.isSlamming = false;
    this.isDashing = false;

    this.setFaceExpression(isPerfect ? 'happy' : 'squint', isPerfect ? 0.35 : 0.22);
  }

  public triggerLaunchStretch(isSpring: boolean = false): void {
    this.impact(isSpring ? -0.55 : -0.32);
    if (isSpring) {
      this.wobbleVel += 0.22 * 10.0;
    }
  }

  public finalizeAirTricks(): { airTime: number; spins: number; tricks: string[] } {
    const spins = Math.floor(Math.abs(this.trickSpinAngle) / (Math.PI * 2));
    const result = {
      airTime: this.airTime,
      spins,
      tricks: [...this.trickNames],
    };

    if (spins >= 2) {
      result.tricks.push(`${spins * 360}° HYPER SPIN`);
    } else if (spins >= 1) {
      result.tricks.push('360° SPIN');
    }

    if (this.airTime >= 1.8) {
      result.tricks.push('BIG AIR');
    }

    // Reset accumulator
    this.airTime = 0;
    this.trickSpinAngle = 0;
    this.trickFlipAngle = 0;
    this.trickNames = [];

    return result;
  }

  public update(
    delta: number,
    steerInput: number,
    timeToLand: number,
    isArmed: boolean,
    inWindow: boolean,
    cameraPos?: THREE.Vector3,
    trickLeft: boolean = false,
    trickRight: boolean = false
  ): void {
    // 1. Air Dash Timer & Cooldown
    if (this.dashTimer > 0) {
      this.dashTimer -= delta;
      if (this.dashTimer <= 0) {
        this.isDashing = false;
      }
    }
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    }
    if (this.slamCooldown > 0) {
      this.slamCooldown = Math.max(0, this.slamCooldown - delta);
    }

    // 2. Airtime & Trick Tracking
    if (!this.isGrounded) {
      this.airTime += delta;
      let spinRate = 0;
      if (trickLeft) spinRate -= 14;
      if (trickRight) spinRate += 14;
      if (Math.abs(steerInput) > 0.4 && !this.isDashing) {
        spinRate += steerInput * 4.5;
      }
      this.trickSpinAngle += spinRate * delta;
      this.mesh.rotation.y += spinRate * delta;
    } else {
      this.airTime = 0;
    }

    // 3. Volume-Preserving Squash & Stretch Spring Physics with Dynamic Hardness & Dual Harmonic Wobble
    const vy = this.velocity.y;
    const airStretch = !this.isGrounded ? THREE.MathUtils.clamp(1.0 + Math.abs(vy) * 0.0075, 1.0, 1.32) : 1.0;

    // Anticipation: Pre-launch compression coil when approaching ground while holding jump/action
    let target = this.isGrounded ? 0.92 : airStretch;
    if (!this.isGrounded && timeToLand > 0 && timeToLand < 0.085 && isArmed) {
      target = 0.88; // Coil like a compressed spring before launch
    }

    // Air Dash tuck windup vs aerodynamic streak surge
    if (this.isDashing && this.dashTimer > CONSTANTS.AIR_DASH_DURATION - 0.04) {
      target = 0.84; // Spherical tuck windup
    } else if (this.isDashing) {
      target = 1.45; // Aerodynamic supersonic elongation
    }

    // Slam downward plunge profile
    if (this.isSlamming) {
      target = 1.55;
    }

    // Dynamic restorative stiffness & damping
    this.stretchVel += (-(this.stretch - target) * this.springK - this.stretchVel * this.springC) * delta;
    this.stretch += this.stretchVel * delta;
    this.stretch = THREE.MathUtils.clamp(this.stretch, 0.32, 2.0);

    // Spring parameter recovery to baseline
    this.springK = THREE.MathUtils.damp(this.springK, 420, 12, delta);
    this.springC = THREE.MathUtils.damp(this.springC, 22, 12, delta);

    // Secondary Slower Harmonic Oscillator (Wobble)
    this.wobbleVel += (-this.wobble * 120 - this.wobbleVel * 9.5) * delta;
    this.wobble += this.wobbleVel * delta;
    this.wobble = THREE.MathUtils.clamp(this.wobble, -0.35, 0.35);

    // Exact volume conservation: wide = 1 / sqrt(totalStretch)
    const totalStretch = THREE.MathUtils.clamp(this.stretch + this.wobble, 0.32, 2.2);
    const wide = 1.0 / Math.sqrt(Math.max(0.15, totalStretch));
    this.deformGroup.scale.set(wide, totalStretch, wide);

    // 4. Gyro Hoop Suspension Lag, Rotation & Steering Anticipation Lean
    this.hoopScaleY = THREE.MathUtils.damp(this.hoopScaleY, totalStretch, 22, delta);
    const hoopWide = 1.0 / Math.sqrt(Math.max(0.15, this.hoopScaleY));
    this.hoopOffsetY = THREE.MathUtils.damp(this.hoopOffsetY, (1.0 - totalStretch) * 0.28, 18, delta);
    this.gyroGroup.scale.set(hoopWide, this.hoopScaleY, hoopWide);
    this.gyroGroup.position.set(0, this.hoopOffsetY, 0);

    const rollSpeed = (this.velocity.z / this.radius) * (this.isDashing ? 1.5 : 0.55);
    this.rollAngle += rollSpeed * delta;
    this.hoopSpinAngle -= (this.velocity.z / this.radius) * delta * (this.isDashing ? 2.5 : 0.5);
    this.precessAngle += delta * 0.7;

    // Steering Anticipation: calculate rate of steering change to bank into turn before lateral speed
    const steerRate = (steerInput - this.prevSteerInput) / Math.max(0.001, delta);
    this.prevSteerInput = steerInput;
    const anticipatedLean = -steerInput * 0.38 - THREE.MathUtils.clamp(steerRate * 0.035, -0.22, 0.22);
    this.leanAngle = THREE.MathUtils.damp(this.leanAngle, anticipatedLean, 18, delta);

    // Gyro hoop silhouette orientation
    let tilt = 0.30 + Math.sin(this.precessAngle) * 0.06;
    if (this.isDashing) {
      tilt = Math.PI * 0.5; // Rotate 90 degrees back like a supersonic thruster
    } else if (this.isSlamming) {
      tilt = -0.25; // Pull upward towards crown
    }
    this.gyroHoop.rotation.set(tilt, this.leanAngle * 0.5, this.leanAngle);
    this.nubGroup.rotation.set(tilt, this.leanAngle * 0.5, this.leanAngle);

    (this.nubGroup.children as THREE.Mesh[]).forEach((nub, i) => {
      const a = (i / 4) * Math.PI * 2 + this.hoopSpinAngle;
      nub.position.set(Math.cos(a) * this.radius * 1.03, Math.sin(a) * this.radius * 1.03, 0);
    });

    this.mesh.rotation.z = this.leanAngle;

    // 5. Face Orientation, Expression Blending & Gaze Tracking
    if (cameraPos) {
      this.faceAnchor.lookAt(cameraPos);
    } else {
      this.faceAnchor.rotation.y = Math.PI;
    }

    // Natural blinking cycle
    this.blinkTimer -= delta;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2.2 + Math.random() * 3.2;
      this.blinkAmount = 1.0;
    }
    this.blinkAmount = Math.max(0, this.blinkAmount - delta * 9);

    // Simulation-driven expression timer (zero setTimeout)
    if (this.expressionTimer > 0) {
      this.expressionTimer -= delta;
      if (this.expressionTimer <= 0) {
        this.currentExpression = 'normal';
      }
    }

    // Gaze tracking: pupils lead direction of travel
    let targetPupilX = THREE.MathUtils.clamp(-steerInput * 0.75 + this.velocity.x * 0.03, -1, 1);
    let targetPupilY = 0;
    if (timeToLand > 0 && timeToLand < 0.6) {
      targetPupilY = -THREE.MathUtils.clamp((0.6 - timeToLand) / 0.6, 0, 0.85); // Glance down at touchdown
    }
    if (this.isDashing) {
      targetPupilX = this.dashDirection !== 0 ? this.dashDirection * 0.9 : targetPupilX;
      targetPupilY = 0.25;
    }
    this.pupilX = THREE.MathUtils.damp(this.pupilX, targetPupilX, 14, delta);
    this.pupilY = THREE.MathUtils.damp(this.pupilY, targetPupilY, 14, delta);

    // Auto-focus expression when approaching touchdown in timing window
    const targetExpr = this.currentExpression !== 'normal'
      ? this.currentExpression
      : (inWindow && !this.isGrounded) ? 'focus' : 'normal';

    const targetSquint = (targetExpr === 'squint' || targetExpr === 'focus') ? 1.0 : 0.0;
    const targetHappy = targetExpr === 'happy' ? 1.0 : 0.0;
    const targetShock = targetExpr === 'shock' ? 1.0 : 0.0;
    const targetDizzy = targetExpr === 'dizzy' ? 1.0 : 0.0;
    const targetCool = targetExpr === 'cool' ? 1.0 : 0.0;

    this.squintWeight = THREE.MathUtils.damp(this.squintWeight, targetSquint, 16, delta);
    this.happyWeight = THREE.MathUtils.damp(this.happyWeight, targetHappy, 16, delta);
    this.shockWeight = THREE.MathUtils.damp(this.shockWeight, targetShock, 16, delta);
    this.dizzyWeight = THREE.MathUtils.damp(this.dizzyWeight, targetDizzy, 16, delta);
    this.coolWeight = THREE.MathUtils.damp(this.coolWeight, targetCool, 16, delta);

    if (this.dizzyWeight > 0.05) {
      this.dizzyAngle += delta * 8.0;
    }

    // Render blended procedural face
    this.renderFaceCanvas();

    // 6. Update Timing Ring Visual (Converges on ball at touchdown)
    const centre = CONSTANTS.PERFECT_WINDOW_EARLY * 0.5;
    const ringVisible = timeToLand > 0 && timeToLand < 0.95 && !this.isGrounded;
    if (ringVisible) {
      const ringRadius = Math.max(this.radius * 0.96, this.radius + (timeToLand - centre) * 5.4);
      this.timingRing.scale.set(ringRadius, 1, ringRadius);
      this.timingMat.uniforms.uAmount.value = THREE.MathUtils.clamp((0.90 - timeToLand) / 0.45, 0, 1) * (isArmed ? 1.0 : 0.85);
      this.timingMat.uniforms.uHot.value = isArmed ? 1.0 : inWindow ? 0.85 : 0.0;
    } else {
      this.timingMat.uniforms.uAmount.value = THREE.MathUtils.damp(this.timingMat.uniforms.uAmount.value, 0, 16, delta);
    }

    // 7. Update Speed Streaks
    const speedRatio = Math.max(0.6, Math.min(2.4, this.velocity.z / CONSTANTS.BASE_SPEED));
    const dashMult = this.isDashing ? 2.2 : 1.0;

    this.streakMeshes.forEach((mesh, idx) => {
      const stretchZ = speedRatio * dashMult;
      mesh.scale.set(1.0, 1.0, stretchZ);
      const mat = this.streakMaterials[idx];
      mat.uniforms.uOpacity.value = this.isDashing ? 1.0 : 0.85;
    });

    // 8. Update Group Position
    this.group.position.copy(this.position);
  }

  public reset(startZ: number = 0): void {
    this.position.set(0, CONSTANTS.BALL_RADIUS + 4.0, startZ);
    this.velocity.set(0, 0, CONSTANTS.BASE_SPEED);
    this.isGrounded = false;
    this.boostFloats = CONSTANTS.STARTING_BOOST_FLOATS;
    this.isDashing = false;
    this.isSlamming = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.slamCooldown = 0;
    this.airTime = 0;
    this.trickSpinAngle = 0;
    this.trickFlipAngle = 0;
    this.trickNames = [];
    this.stretch = 1.0;
    this.stretchVel = 0.0;
    this.springK = 420;
    this.springC = 22;
    this.wobble = 0.0;
    this.wobbleVel = 0.0;
    this.hoopScaleY = 1.0;
    this.hoopOffsetY = 0.0;
    this.deformGroup.scale.set(1, 1, 1);
    this.gyroGroup.scale.set(1, 1, 1);
    this.gyroGroup.position.set(0, 0, 0);
    this.leanAngle = 0;
    this.prevSteerInput = 0;
    this.expressionTimer = 0;
    this.setFaceExpression('normal');
    this.group.position.copy(this.position);
  }
}
