import * as THREE from 'three';
import { HEX } from '../rendering/Palette';
import { CONSTANTS } from '../config/constants';

/**
 * Precision Landing Reticle & Takeoff Origin Marker
 * Visualizes the exact parabolic touchdown point with safety status (Cyan = Safe / Red = Danger)
 * and leaves a stylized ripple marker at the takeoff location.
 */
export class LandingReticle {
  public group: THREE.Group = new THREE.Group();

  // 1. Projected Landing Reticle
  private landingMesh: THREE.Mesh;
  private landingMat: THREE.ShaderMaterial;

  // 2. Takeoff Origin Marker
  private takeoffMesh: THREE.Mesh;
  private takeoffMat: THREE.ShaderMaterial;
  private takeoffLife: number = 0;
  private takeoffMaxLife: number = 1.0;

  // Animation states
  private safeLerp: number = 1.0;
  private opacityLerp: number = 0.0;
  private worldTime: number = 0;

  constructor() {
    // --- Landing Reticle Mesh & Shader ---
    const ringGeo = new THREE.RingGeometry(0.8, 1.4, 48);
    ringGeo.rotateX(-Math.PI / 2);

    this.landingMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSafe: { value: 1.0 }, // 1.0 = safe (cyan), 0.0 = danger (red)
        uAmount: { value: 0.0 },
        uPulse: { value: 0.0 },
        uSafeColor: { value: new THREE.Color(HEX.giltBright) },
        uDangerColor: { value: new THREE.Color(HEX.void) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vLocalPos;
        void main() {
          vUv = uv;
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uSafe;
        uniform float uAmount;
        uniform float uPulse;
        uniform vec3 uSafeColor;
        uniform vec3 uDangerColor;
        varying vec2 vUv;
        varying vec3 vLocalPos;

        void main() {
          if (uAmount <= 0.005) discard;

          float r = length(vLocalPos.xz);
          // Concentric outer ring
          float outerRing = (1.0 - smoothstep(1.22, 1.40, r)) * smoothstep(0.95, 1.15, r);
          // Inner center reticle ring
          float innerRing = (1.0 - smoothstep(0.55, 0.75, r)) * smoothstep(0.35, 0.50, r);

          // 4-way crosshair ticks
          float ang = atan(vLocalPos.z, vLocalPos.x);
          float tick = step(0.78, abs(fract(ang / 1.570796 + 0.5) - 0.5) * 2.0);
          float cross = (1.0 - smoothstep(0.2, 0.9, r)) * step(0.88, abs(fract(ang / 1.570796 + 0.5) - 0.5) * 2.0);

          float alpha = (outerRing * (0.4 + 0.6 * tick) + innerRing * 0.8 + cross * 0.7) * uAmount;
          vec3 baseCol = mix(uDangerColor, uSafeColor, uSafe);
          vec3 finalColor = baseCol * (1.6 + uPulse * 2.2);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
    });

    this.landingMesh = new THREE.Mesh(ringGeo, this.landingMat);
    this.landingMesh.renderOrder = 4;
    this.landingMesh.frustumCulled = false;
    this.group.add(this.landingMesh);

    // --- Takeoff Origin Marker Mesh & Shader ---
    const takeoffGeo = new THREE.RingGeometry(0.6, 1.1, 36);
    takeoffGeo.rotateX(-Math.PI / 2);

    this.takeoffMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uOpacity: { value: 0.0 },
        uColor: { value: new THREE.Color(HEX.gilt) },
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
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          if (uOpacity <= 0.005) discard;
          float r = length(vPos.xz);
          float ring = (1.0 - smoothstep(0.9, 1.1, r)) * smoothstep(0.6, 0.8, r);
          gl_FragColor = vec4(uColor * 1.5, ring * uOpacity);
        }
      `,
    });

    this.takeoffMesh = new THREE.Mesh(takeoffGeo, this.takeoffMat);
    this.takeoffMesh.renderOrder = 3;
    this.takeoffMesh.frustumCulled = false;
    this.takeoffMesh.position.set(0, CONSTANTS.ROAD_Y + 0.03, 0);
    this.group.add(this.takeoffMesh);
  }

  /**
   * Sets the origin anchor where the ball just launched/bounced
   */
  public triggerTakeoff(x: number, y: number, z: number, isPerfect: boolean = false): void {
    this.takeoffMesh.position.set(x, y + 0.04, z);
    this.takeoffLife = this.takeoffMaxLife;
    this.takeoffMat.uniforms.uColor.value.set(isPerfect ? HEX.gilt : HEX.giltBright);
  }

  public update(
    delta: number,
    timeToLand: number,
    predictedX: number,
    predictedZ: number,
    isSafe: boolean,
    isAlive: boolean
  ): void {
    this.worldTime += delta;

    // 1. Update Takeoff Origin Ripple
    if (this.takeoffLife > 0) {
      this.takeoffLife = Math.max(0, this.takeoffLife - delta);
      const life01 = this.takeoffLife / this.takeoffMaxLife;
      const expand = 1.0 + (1.0 - life01) * 1.6;
      this.takeoffMesh.scale.set(expand, 1, expand);
      this.takeoffMat.uniforms.uOpacity.value = life01 * 0.75;
    } else {
      this.takeoffMat.uniforms.uOpacity.value = 0;
    }

    // 2. Update Landing Reticle
    const u = this.landingMat.uniforms;

    if (timeToLand <= 0 || !isAlive) {
      this.opacityLerp = THREE.MathUtils.damp(this.opacityLerp, 0, 14, delta);
      u.uAmount.value = this.opacityLerp;
      return;
    }

    // Position marker at road level at projected coordinate
    this.landingMesh.position.set(predictedX, CONSTANTS.ROAD_Y + 0.06, predictedZ);
    this.landingMesh.rotation.y += delta * 1.2;

    // Scale dynamically as landing nears
    const s = 2.4 + Math.min(1.2, Math.max(0, timeToLand * 0.9));
    this.landingMesh.scale.set(s, 1, s);

    // Smooth state transitions
    const targetSafe = isSafe ? 1.0 : 0.0;
    this.safeLerp = THREE.MathUtils.damp(this.safeLerp, targetSafe, 18, delta);
    this.opacityLerp = THREE.MathUtils.damp(this.opacityLerp, timeToLand > 0.04 ? 1.0 : 0.4, 12, delta);

    u.uSafe.value = this.safeLerp;
    u.uAmount.value = this.opacityLerp;
    u.uPulse.value = isSafe ? 0 : 0.6 + 0.4 * Math.sin(this.worldTime * 24);
  }

  public reset(): void {
    this.takeoffLife = 0;
    this.safeLerp = 1.0;
    this.opacityLerp = 0.0;
    this.landingMat.uniforms.uAmount.value = 0;
    this.takeoffMat.uniforms.uOpacity.value = 0;
  }
}
