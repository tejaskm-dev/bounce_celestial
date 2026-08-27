import * as THREE from 'three';
import { HEX, hexCss } from '../rendering/Palette';
import { CelShaders } from '../rendering/CelShaders';
import { SKINS, SkinDefinition } from '../config/palettes';
import { CONSTANTS } from '../config/constants';

export type ExpressionType =
  | 'normal'
  | 'squint'
  | 'shock'
  | 'dizzy'
  | 'cool'
  | 'happy'
  | 'focus'
  | 'determined'
  | 'strain'
  | 'delight'
  | 'smug'
  | 'panic'
  | 'sleepy';

/**
 * Protagonist Kinetic Ball Entity with Deformable Mesh & Inertia Gyro Suspension
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
  public trickRollAngle: number = 0;
  public trickNames: string[] = [];
  public activeTrick: 'none' | 'corkscrew' | 'backflip' | 'comet' | 'slam' | 'grind' = 'none';
  public trickRecoveryWeight: number = 0.0;

  // Heading, Lean, Pitch & Anticipation Rig
  public leanAngle: number = 0;
  public pitchAngle: number = 0;
  public anticipationLean: number = 0;
  public railGrindLean: number = 0;
  public railGrindSide: number = 0;
  private prevSteerInput: number = 0;
  public committedLaunchVy: number = 22;

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

  // Face Decal, Expressions & Pupil Tracking
  private faceAnchor: THREE.Group;
  private faceCanvas: HTMLCanvasElement;
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: THREE.CanvasTexture;
  private faceMat: THREE.MeshBasicMaterial;

  public currentExpression: ExpressionType = 'normal';
  private expressionTimer: number = 0;
  private expressionCooldown: number = 0;
  private blinkTimer: number = 2.5;
  private blinkAmount: number = 0;

  // Expression blend weights
  private squintWeight: number = 0;
  private happyWeight: number = 0;
  private shockWeight: number = 0;
  private dizzyWeight: number = 0;
  private coolWeight: number = 0;
  private determinedWeight: number = 0;
  private strainWeight: number = 0;
  private delightWeight: number = 0;
  private smugWeight: number = 0;
  private panicWeight: number = 0;
  private sleepyWeight: number = 0;

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
   * Sets face expression with rate-limiting and hold duration.
   */
  public setFaceExpression(
    expression: ExpressionType,
    force = false,
    duration: number = 0.35
  ): void {
    if (!force && this.expressionCooldown > 0 && expression === 'normal') return;
    if (this.currentExpression === expression && this.expressionTimer > 0) return;
    this.currentExpression = expression;
    this.expressionTimer = duration;
    this.expressionCooldown = 0.25;
  }

  /**
   * Procedurally draws smoothly blended anime button-eye face with gaze/pupil tracking.
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
    const determined = Math.max(0, Math.min(1, this.determinedWeight));
    const strain = Math.max(0, Math.min(1, this.strainWeight));
    const delight = Math.max(0, Math.min(1, this.delightWeight));
    const smug = Math.max(0, Math.min(1, this.smugWeight));
    const panic = Math.max(0, Math.min(1, this.panicWeight));
    const sleepy = Math.max(0, Math.min(1, this.sleepyWeight));

    const effectiveBlink = Math.max(
      this.blinkAmount,
      squint,
      happy * 0.85,
      delight * 0.9,
      strain * 0.95,
      sleepy * 0.65
    );

    // 1. Cheek Blushes (expand and brighten on happy/cool/delight)
    const blushAlpha = 0.45 + happy * 0.35 + delight * 0.4 + cool * 0.15 + smug * 0.2;
    const blushR = 17 + happy * 6 + delight * 8;
    ctx.fillStyle = `rgba(201, 154, 160, ${blushAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(cx - 60, eyeY + 34, blushR, 10 + happy * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(cx + 60, eyeY + 34, blushR, 10 + happy * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Eyebrows (Determined / Strain / Smug / Panic)
    if (determined > 0.2 || strain > 0.2 || smug > 0.2 || panic > 0.2) {
      ctx.strokeStyle = hexCss(HEX.ink);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';

      // Left Brow
      ctx.beginPath();
      if (smug > 0.3) {
        // High arched smug left eyebrow
        ctx.arc(cx - eyeSpacing, eyeY - 22, 16, Math.PI * 1.15, Math.PI * 1.85, false);
      } else if (panic > 0.3) {
        // Upward arched panic eyebrows
        ctx.moveTo(cx - eyeSpacing - 14, eyeY - 18);
        ctx.lineTo(cx - eyeSpacing + 14, eyeY - 26);
      } else {
        // Angled determined / strain sharp brow
        ctx.moveTo(cx - eyeSpacing - 16, eyeY - 24);
        ctx.lineTo(cx - eyeSpacing + 14, eyeY - 18);
      }
      ctx.stroke();

      // Right Brow
      ctx.beginPath();
      if (panic > 0.3) {
        ctx.moveTo(cx + eyeSpacing - 14, eyeY - 26);
        ctx.lineTo(cx + eyeSpacing + 14, eyeY - 18);
      } else {
        ctx.moveTo(cx + eyeSpacing - 14, eyeY - 18);
        ctx.lineTo(cx + eyeSpacing + 16, eyeY - 24);
      }
      ctx.stroke();
    }

    // 3. Eyes
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

      // Panic / Shock: giant wide shocked eye with dilated or tiny pupil
      if (shock > 0.4 || panic > 0.4) {
        const rad = eyeRadius * (1.15 + (shock + panic) * 0.2);
        ctx.fillStyle = hexCss(HEX.ink);
        ctx.beginPath();
        ctx.arc(ex, ey, rad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexCss(HEX.marbleDim);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, ey, rad - 3, 0, Math.PI * 2);
        ctx.stroke();

        if (panic > 0.4) {
          // Giant trembling dilated pupil with tiny glint
          ctx.fillStyle = hexCss(HEX.white);
          ctx.beginPath();
          ctx.arc(ex - 4, ey - 4, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Shock tiny cross
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
        }
        return;
      }

      // Delight / Happy / Strain closed eyes
      if (delight > 0.4 || (effectiveBlink > 0.5 && strain <= 0.3)) {
        ctx.strokeStyle = hexCss(HEX.ink);
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const startAng = Math.PI * 1.15;
        const endAng = Math.PI * 1.85;
        ctx.arc(ex, ey + 4, 16, startAng, endAng, false);
        ctx.stroke();
        return;
      }

      // Strain: tight clenched horizontal slit
      if (strain > 0.4) {
        ctx.strokeStyle = hexCss(HEX.ink);
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - 15, ey);
        ctx.lineTo(ex + 15, ey);
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

      // Normal button eye with dynamic gaze/pupil tracking
      const px = this.pupilX * 6.0;
      const py = this.pupilY * 4.5 + (sleepy > 0.3 ? 3 : 0);

      // Button base
      ctx.fillStyle = hexCss(HEX.ink);
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Sleepy eyelid cover
      if (sleepy > 0.3) {
        ctx.fillStyle = hexCss(HEX.marbleDim);
        ctx.beginPath();
        ctx.arc(ex, ey, eyeRadius, Math.PI * 0.9, Math.PI * 2.1, false);
        ctx.fill();
      }

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

    // 4. Stitched Mouth
    ctx.strokeStyle = hexCss(HEX.ink);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (delight > 0.3) {
      // Wide open happy D-shaped grin
      ctx.fillStyle = hexCss(HEX.ink);
      ctx.beginPath();
      ctx.arc(cx, eyeY + 16, 20, 0, Math.PI, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pink tongue
      ctx.fillStyle = 'rgba(235, 130, 150, 0.9)';
      ctx.beginPath();
      ctx.arc(cx, eyeY + 28, 10, Math.PI, 0, false);
      ctx.fill();
    } else if (smug > 0.3) {
      // Asymmetric smug smirk
      ctx.beginPath();
      ctx.moveTo(cx - 10, eyeY + 24);
      ctx.quadraticCurveTo(cx + 8, eyeY + 26, cx + 20, eyeY + 16);
      ctx.stroke();
    } else if (strain > 0.3) {
      // Clenched teeth grimace
      ctx.beginPath();
      ctx.moveTo(cx - 16, eyeY + 22);
      ctx.lineTo(cx + 16, eyeY + 22);
      ctx.stroke();
      // Vertical tooth stitches
      [-8, 0, 8].forEach((tx) => {
        ctx.moveTo(cx + tx, eyeY + 18);
        ctx.lineTo(cx + tx, eyeY + 26);
      });
      ctx.stroke();
    } else if (panic > 0.3) {
      // Trembling wavy panic mouth
      ctx.beginPath();
      ctx.moveTo(cx - 14, eyeY + 24);
      ctx.lineTo(cx - 7, eyeY + 20);
      ctx.lineTo(cx, eyeY + 26);
      ctx.lineTo(cx + 7, eyeY + 20);
      ctx.lineTo(cx + 14, eyeY + 24);
      ctx.stroke();
    } else if (determined > 0.3) {
      // Firm determined straight mouth
      ctx.beginPath();
      ctx.moveTo(cx - 14, eyeY + 24);
      ctx.lineTo(cx + 14, eyeY + 24);
      ctx.stroke();
    } else if (shock > 0.3) {
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
    this.triggerCorkscrew(dir || 1);
    this.trickNames.push('AIR DASH');
    this.setFaceExpression('cool', true, 0.45);
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
    this.triggerSlamTuck();
    this.impact(-0.50); // Elongate downward into spearhead pose
    this.setFaceExpression('strain', true, 0.50);
    return true;
  }

  // --- Air Trick Triggers ---
  public triggerCorkscrew(dir: number = 1): void {
    if (this.isGrounded) return;
    this.activeTrick = 'corkscrew';
    this.trickRollAngle = (dir >= 0 ? 1 : -1) * Math.PI * 2;
    if (!this.trickNames.includes('CORKSCREW')) this.trickNames.push('CORKSCREW');
  }

  public triggerBackflip(): void {
    if (this.isGrounded) return;
    this.activeTrick = 'backflip';
    this.trickFlipAngle = Math.PI * 2;
    if (!this.trickNames.includes('BACKFLIP')) this.trickNames.push('BACKFLIP');
  }

  public triggerCometSpin(): void {
    if (this.isGrounded) return;
    this.activeTrick = 'comet';
    this.trickSpinAngle += Math.PI * 4;
    if (!this.trickNames.includes('COMET SPIN')) this.trickNames.push('COMET SPIN');
  }

  public triggerSlamTuck(): void {
    this.activeTrick = 'slam';
    this.impact(-0.35);
  }

  public triggerRailGrind(side: number = 1): void {
    this.activeTrick = 'grind';
    this.railGrindSide = side;
    this.railGrindLean = side * 0.32;
    if (!this.trickNames.includes('RAIL GRIND')) this.trickNames.push('RAIL GRIND');
    this.setFaceExpression('smug', true, 0.40);
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
    this.activeTrick = 'none';

    this.setFaceExpression(
      isPerfect ? 'delight' : isSlam ? 'happy' : 'normal',
      true,
      isPerfect ? 0.45 : 0.25
    );
  }

  public triggerLaunchStretch(isSpring: boolean = false): void {
    this.impact(isSpring ? -0.55 : -0.32);
    if (isSpring) {
      this.wobbleVel += 0.22 * 10.0;
    }
  }

  public finalizeAirTricks(): { airTime: number; spins: number; tricks: string[]; points: number } {
    const spins = Math.floor(Math.abs(this.trickSpinAngle) / (Math.PI * 2));
    const result = {
      airTime: this.airTime,
      spins,
      tricks: [...this.trickNames],
      points: 0,
    };

    if (spins >= 2) {
      result.tricks.push(`${spins * 360}° HYPER SPIN`);
      result.points += 400 * spins;
    } else if (spins >= 1) {
      result.tricks.push('360° SPIN');
      result.points += 250;
    }

    if (this.airTime >= 1.8) {
      result.tricks.push('BIG AIR');
      result.points += 300;
    }

    if (this.trickNames.includes('CORKSCREW')) result.points += 200;
    if (this.trickNames.includes('BACKFLIP')) result.points += 250;
    if (this.trickNames.includes('COMET SPIN')) result.points += 350;
    if (this.trickNames.includes('RAIL GRIND')) result.points += 300;

    // Reset accumulator
    this.airTime = 0;
    this.trickSpinAngle = 0;
    this.trickFlipAngle = 0;
    this.trickRollAngle = 0;
    this.trickNames = [];
    this.activeTrick = 'none';

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
    trickRight: boolean = false,
    lookTarget?: { x: number; y: number }
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
    if (this.expressionCooldown > 0) {
      this.expressionCooldown = Math.max(0, this.expressionCooldown - delta);
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

    // 3. Volume-Preserving Squash & Stretch Spring Physics with Dynamic Hardness & Speed Stretch
    const vy = this.velocity.y;
    const airStretch = !this.isGrounded ? THREE.MathUtils.clamp(1.0 + Math.abs(vy) * 0.0075, 1.0, 1.32) : 1.0;

    // Anticipation pre-launch coil
    let target = this.isGrounded ? 0.92 : airStretch;
    if (!this.isGrounded && timeToLand > 0 && timeToLand < 0.085 && isArmed) {
      target = 0.86; // Coil like a compressed spring before launch
    }

    // Speed stretch along travel (>40 u/s up to 65+ u/s)
    const speedRatio = this.velocity.z;
    const speedStretchFactor = THREE.MathUtils.smoothstep(speedRatio, 40, 68) * 0.08;
    target += speedStretchFactor;

    if (this.isDashing && this.dashTimer > CONSTANTS.AIR_DASH_DURATION - 0.04) {
      target = 0.84;
    } else if (this.isDashing) {
      target = 1.45;
    }

    if (this.isSlamming) {
      target = 1.55;
    }

    this.stretchVel += (-(this.stretch - target) * this.springK - this.stretchVel * this.springC) * delta;
    this.stretch += this.stretchVel * delta;
    this.stretch = THREE.MathUtils.clamp(this.stretch, 0.32, 2.0);

    this.springK = THREE.MathUtils.damp(this.springK, 420, 12, delta);
    this.springC = THREE.MathUtils.damp(this.springC, 22, 12, delta);

    // Secondary Wobble
    this.wobbleVel += (-this.wobble * 120 - this.wobbleVel * 9.5) * delta;
    this.wobble += this.wobbleVel * delta;
    this.wobble = THREE.MathUtils.clamp(this.wobble, -0.35, 0.35);

    const totalStretch = THREE.MathUtils.clamp(this.stretch + this.wobble, 0.32, 2.2);
    const wide = 1.0 / Math.sqrt(Math.max(0.15, totalStretch));
    this.deformGroup.scale.set(wide, totalStretch, wide);

    // 4. Gyro Hoop & Heading Rig: Lateral Lean (22° max), Arc Pitch (12° max), Anticipation (~4°)
    this.hoopScaleY = THREE.MathUtils.damp(this.hoopScaleY, totalStretch, 22, delta);
    const hoopWide = 1.0 / Math.sqrt(Math.max(0.15, this.hoopScaleY));
    this.hoopOffsetY = THREE.MathUtils.damp(this.hoopOffsetY, (1.0 - totalStretch) * 0.28, 18, delta);
    this.gyroGroup.scale.set(hoopWide, this.hoopScaleY, hoopWide);
    this.gyroGroup.position.set(0, this.hoopOffsetY, 0);

    const rollSpeed = (this.velocity.z / this.radius) * (this.isDashing ? 1.5 : 0.55);
    this.rollAngle += rollSpeed * delta;
    this.hoopSpinAngle -= (this.velocity.z / this.radius) * delta * (this.isDashing ? 2.5 : 0.5);
    this.precessAngle += delta * 0.7;

    // Eased Lateral Lean (~22° / 0.384 rad max, 140ms in / 260ms out)
    const steerTarget = -steerInput * 0.384;
    const steerRate = (steerInput - this.prevSteerInput) / Math.max(0.001, delta);
    this.prevSteerInput = steerInput;
    const anticipate = -THREE.MathUtils.clamp(steerRate * 0.035, -0.07, 0.07);
    const leanSpeed = Math.abs(steerInput) > Math.abs(this.leanAngle) ? 7.1 : 3.8; // 140ms in vs 260ms out
    this.leanAngle = THREE.MathUtils.damp(this.leanAngle, steerTarget + anticipate, leanSpeed, delta);

    // Arc Pitch (~12° / 0.21 rad based on normalized vertical speed)
    const normVy = THREE.MathUtils.clamp(this.velocity.y / Math.max(15, this.committedLaunchVy), -1, 1);
    const targetPitch = this.isGrounded ? 0 : normVy * 0.21;
    this.pitchAngle = THREE.MathUtils.damp(this.pitchAngle, targetPitch, 14, delta);

    // Rail grind edge lean
    this.railGrindLean = THREE.MathUtils.damp(this.railGrindLean, 0, 4, delta);

    // Landing recovery blend: When approaching touchdown (<120ms) or grounded, blend trick rotations to 0!
    const inLandingRecovery = timeToLand > 0 && timeToLand < 0.12;
    if (this.isGrounded || inLandingRecovery) {
      this.trickRecoveryWeight = THREE.MathUtils.damp(this.trickRecoveryWeight, 1.0, 24, delta);
    } else {
      this.trickRecoveryWeight = 0.0;
    }

    // Apply active trick animations
    if (this.activeTrick === 'corkscrew') {
      this.trickRollAngle = THREE.MathUtils.damp(this.trickRollAngle, 0, 6, delta);
    } else if (this.activeTrick === 'backflip') {
      this.trickFlipAngle = THREE.MathUtils.damp(this.trickFlipAngle, 0, 8, delta);
    }

    const rec = 1.0 - this.trickRecoveryWeight;
    const totalRoll = this.leanAngle + this.railGrindLean + this.trickRollAngle * rec;
    const totalPitch = this.pitchAngle + this.trickFlipAngle * rec;

    // Apply rotations to ball mesh and gyro hoop
    this.mesh.rotation.x = totalPitch;
    this.mesh.rotation.z = totalRoll;

    let tilt = 0.30 + Math.sin(this.precessAngle) * 0.06;
    if (this.isDashing) {
      tilt = Math.PI * 0.5;
    } else if (this.isSlamming) {
      tilt = -0.25;
    }
    this.gyroHoop.rotation.set(tilt + totalPitch * 0.5, totalRoll * 0.5, totalRoll);
    this.nubGroup.rotation.set(tilt + totalPitch * 0.5, totalRoll * 0.5, totalRoll);

    (this.nubGroup.children as THREE.Mesh[]).forEach((nub, i) => {
      const a = (i / 4) * Math.PI * 2 + this.hoopSpinAngle;
      nub.position.set(Math.cos(a) * this.radius * 1.03, Math.sin(a) * this.radius * 1.03, 0);
    });

    // 5. Face Decal Orientation & Look-Ahead Gaze Tracking
    if (cameraPos) {
      this.faceAnchor.lookAt(cameraPos);
    } else {
      this.faceAnchor.rotation.y = Math.PI;
    }

    this.blinkTimer -= delta;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2.2 + Math.random() * 3.2;
      this.blinkAmount = 1.0;
    }
    this.blinkAmount = Math.max(0, this.blinkAmount - delta * 9);

    if (this.expressionTimer > 0) {
      this.expressionTimer -= delta;
      if (this.expressionTimer <= 0) {
        this.currentExpression = 'normal';
      }
    }

    // Gaze tracking + lookTarget offset
    let targetPupilX = THREE.MathUtils.clamp(-steerInput * 0.75 + this.velocity.x * 0.03, -1, 1);
    let targetPupilY = 0;
    if (lookTarget) {
      targetPupilX = THREE.MathUtils.clamp(targetPupilX + lookTarget.x * 0.8, -1, 1);
      targetPupilY = THREE.MathUtils.clamp(targetPupilY + lookTarget.y * 0.8, -1, 1);
    }
    if (timeToLand > 0 && timeToLand < 0.6) {
      targetPupilY = -THREE.MathUtils.clamp((0.6 - timeToLand) / 0.6, 0, 0.85);
    }
    if (this.isDashing) {
      targetPupilX = this.dashDirection !== 0 ? this.dashDirection * 0.9 : targetPupilX;
      targetPupilY = 0.25;
    }
    this.pupilX = THREE.MathUtils.damp(this.pupilX, targetPupilX, 14, delta);
    this.pupilY = THREE.MathUtils.damp(this.pupilY, targetPupilY, 14, delta);

    // Expression blending
    const targetExpr = this.currentExpression !== 'normal'
      ? this.currentExpression
      : (inWindow && !this.isGrounded) ? 'focus' : 'normal';

    this.squintWeight = THREE.MathUtils.damp(this.squintWeight, (targetExpr === 'squint' || targetExpr === 'focus') ? 1.0 : 0.0, 16, delta);
    this.happyWeight = THREE.MathUtils.damp(this.happyWeight, targetExpr === 'happy' ? 1.0 : 0.0, 16, delta);
    this.shockWeight = THREE.MathUtils.damp(this.shockWeight, targetExpr === 'shock' ? 1.0 : 0.0, 16, delta);
    this.dizzyWeight = THREE.MathUtils.damp(this.dizzyWeight, targetExpr === 'dizzy' ? 1.0 : 0.0, 16, delta);
    this.coolWeight = THREE.MathUtils.damp(this.coolWeight, targetExpr === 'cool' ? 1.0 : 0.0, 16, delta);
    this.determinedWeight = THREE.MathUtils.damp(this.determinedWeight, targetExpr === 'determined' ? 1.0 : 0.0, 16, delta);
    this.strainWeight = THREE.MathUtils.damp(this.strainWeight, targetExpr === 'strain' ? 1.0 : 0.0, 16, delta);
    this.delightWeight = THREE.MathUtils.damp(this.delightWeight, targetExpr === 'delight' ? 1.0 : 0.0, 16, delta);
    this.smugWeight = THREE.MathUtils.damp(this.smugWeight, targetExpr === 'smug' ? 1.0 : 0.0, 16, delta);
    this.panicWeight = THREE.MathUtils.damp(this.panicWeight, targetExpr === 'panic' ? 1.0 : 0.0, 16, delta);
    this.sleepyWeight = THREE.MathUtils.damp(this.sleepyWeight, targetExpr === 'sleepy' ? 1.0 : 0.0, 16, delta);

    if (this.dizzyWeight > 0.05) {
      this.dizzyAngle += delta * 8.0;
    }

    this.renderFaceCanvas();

    // 6. Timing Ring
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

    // 7. Speed Streaks
    const speedRatioClamped = Math.max(0.6, Math.min(2.4, this.velocity.z / CONSTANTS.BASE_SPEED));
    const dashMult = this.isDashing ? 2.2 : 1.0;

    this.streakMeshes.forEach((mesh, idx) => {
      const stretchZ = speedRatioClamped * dashMult;
      mesh.scale.set(1.0, 1.0, stretchZ);
      const mat = this.streakMaterials[idx];
      mat.uniforms.uOpacity.value = this.isDashing ? 1.0 : 0.85;
    });

    // 8. Group Position
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
    this.trickRollAngle = 0;
    this.trickNames = [];
    this.activeTrick = 'none';
    this.trickRecoveryWeight = 0;
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
    this.pitchAngle = 0;
    this.anticipationLean = 0;
    this.railGrindLean = 0;
    this.prevSteerInput = 0;
    this.expressionTimer = 0;
    this.expressionCooldown = 0;
    this.setFaceExpression('normal', true);
    this.group.position.copy(this.position);
  }
}
