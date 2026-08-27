import * as THREE from 'three';
import { CONSTANTS } from '../config/constants';

/**
 * Spring-Damped Kinetic Third-Person Chase Camera Rig
 * Features:
 * - Smoothed ground-follow height (avoids whipping camera on vertical hops)
 * - Dynamic FOV kick on Perfect Landings & Air Dash bursts
 * - Predictive look-ahead and lateral lag
 * - Velocity-based banking roll
 * - Impact trauma shake with quadratic decay
 */
export class CameraRig {
  public camera: THREE.PerspectiveCamera;
  private currentPos: THREE.Vector3 = new THREE.Vector3(0, 8, -15);
  private currentLookAt: THREE.Vector3 = new THREE.Vector3(0, 0, 25);
  private smoothY: number = 0;
  private trauma: number = 0;
  private shakeTime: number = 0;
  private fovKick: number = 0;

  // Camera Roll / Bank Angle
  private rollAngle: number = 0;
  private targetGravityRoll: number = 0;

  // Cinematic Intro Flythrough state
  private isIntro: boolean = false;
  private introProgress: number = 0;

  // Cinematic Title Orbit state
  private isCinematic: boolean = false;
  private orbitAngle: number = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.up.set(0, 1, 0);
  }

  public addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  public kickFov(amount: number): void {
    this.fovKick = Math.min(22, this.fovKick + amount);
  }

  public setCinematicMode(enabled: boolean): void {
    this.isCinematic = enabled;
  }

  public startIntro(): void {
    this.isIntro = true;
    this.introProgress = 0;
    this.isCinematic = false;
    this.rollAngle = 0;
    this.targetGravityRoll = 0;
    this.camera.up.set(0, 1, 0);
  }

  public setGravityOrientation(isInverted: boolean): void {
    this.targetGravityRoll = isInverted ? Math.PI : 0;
  }

  public update(
    targetPos: THREE.Vector3,
    targetSpeed: number,
    isDashing: boolean,
    delta: number,
    steerInput: number = 0,
    ballVelocityX: number = 0
  ): void {
    if (this.isCinematic) {
      this.updateCinematic(targetPos, delta);
      return;
    }

    if (this.isIntro) {
      this.updateIntro(targetPos, delta);
      return;
    }

    // 1. Smoothed ground-follow height.
    //
    // The point of the low stiffness is that the ball rises and falls *within*
    // the frame instead of the world bobbing under it. That is the filter's
    // job on its own — there used to be a hard Math.min(y, 6.0) on top, which
    // clipped the camera target for 47% of every hop and, worse, pinned it
    // entirely during spring launches and slams where the ball reaches y=16.
    // The ball then climbed to the top of frame with the camera refusing to
    // follow. Clamping a signal you are already low-passing just rectifies it.
    // Vertical follow is asymmetric on purpose. Rising is followed loosely so
    // the ball climbs *within* the frame and the height reads as height;
    // falling is followed faster so the camera is already low and looking at
    // the deck by the time the landing decision matters. A single stiffness
    // has to compromise between those two and does neither well.
    const rising = targetPos.y > this.smoothY;
    const vStiff = CONSTANTS.CAM_VERTICAL_STIFFNESS * (rising ? 0.62 : 1.5);
    this.smoothY = THREE.MathUtils.damp(this.smoothY, targetPos.y, vStiff, delta);

    const speedRatio = Math.max(0, Math.min(1.0, (targetSpeed - CONSTANTS.BASE_SPEED) / (CONSTANTS.MAX_SPEED - CONSTANTS.BASE_SPEED)));
    const offY = THREE.MathUtils.lerp(CONSTANTS.CAM_OFFSET_Y, CONSTANTS.CAM_OFFSET_FAST_Y, speedRatio);
    const offZ = THREE.MathUtils.lerp(CONSTANTS.CAM_OFFSET_Z, CONSTANTS.CAM_OFFSET_FAST_Z, speedRatio);
    const aheadZ = THREE.MathUtils.lerp(CONSTANTS.CAM_LOOK_AHEAD, CONSTANTS.CAM_LOOK_AHEAD_FAST, speedRatio);

    // 2. Desired camera position with lateral lag
    const desiredPos = new THREE.Vector3(
      targetPos.x * 0.74,
      this.smoothY + offY + (isDashing ? 0.4 : 0),
      targetPos.z + offZ
    );

    // 3. Desired look-at target
    // The look target carries a little of the ball's real height, so a big
    // bounce visibly lifts the framing instead of the ball just drifting up
    // out of a static shot.
    const lookY = THREE.MathUtils.lerp(
      this.smoothY + CONSTANTS.CAM_LOOK_HEIGHT, targetPos.y, 0.18);
    const desiredLookAt = new THREE.Vector3(
      targetPos.x * 0.45 + steerInput * 1.5,
      lookY,
      targetPos.z + aheadZ
    );

    // 4. Smooth interpolation
    const stiffness = CONSTANTS.CAM_STIFFNESS;
    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, desiredPos.x, stiffness, delta);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, desiredPos.y, stiffness * 0.85, delta);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, desiredPos.z, stiffness * 2.2, delta);

    this.currentLookAt.x = THREE.MathUtils.damp(this.currentLookAt.x, desiredLookAt.x, 9, delta);
    this.currentLookAt.y = THREE.MathUtils.damp(this.currentLookAt.y, desiredLookAt.y, 8, delta);
    this.currentLookAt.z = THREE.MathUtils.damp(this.currentLookAt.z, desiredLookAt.z, 14, delta);

    // 5. Camera banking.
    //
    // Roll follows lateral *velocity* rather than input, so it settles
    // honestly when the player lets go instead of snapping back. There used
    // to be an additional `sin(z * 0.0032) * 0.12` term here — a ±7 degree
    // horizon tilt driven by world position, with no cause the player could
    // see or predict. The track does not actually curve, so it read as drift.
    const steerBank = THREE.MathUtils.clamp((-ballVelocityX / 34) * 0.75 + (-steerInput * 0.25), -1, 1) * CONSTANTS.CAM_ROLL_AMOUNT;
    const rollTarget = this.targetGravityRoll + steerBank;
    this.rollAngle = THREE.MathUtils.damp(this.rollAngle, rollTarget, 7, delta);

    // 6. Camera Shake Trauma
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (this.trauma > 0.001) {
      this.shakeTime += delta * 45;
      const shakePower = this.trauma * this.trauma;
      shakeOffsetX = Math.sin(this.shakeTime * 1.3) * 0.75 * shakePower;
      shakeOffsetY = Math.cos(this.shakeTime * 1.7) * 0.75 * shakePower;
      this.trauma = Math.max(0, this.trauma - delta * 2.8);
    }

    // Set camera up vector to apply roll correctly
    // Sign matches the sibling prototype's chase camera: with the same roll
    // target, the inverted form banked away from the turn instead of into it.
    const upX = Math.sin(this.rollAngle);
    const upY = Math.cos(this.rollAngle);
    this.camera.up.set(upX, upY, 0);

    this.camera.position.set(
      this.currentPos.x + shakeOffsetX,
      this.currentPos.y + shakeOffsetY,
      this.currentPos.z
    );
    this.camera.lookAt(this.currentLookAt);

    // 7. Dynamic FOV + FOV Kick
    this.fovKick = THREE.MathUtils.damp(this.fovKick, 0, 4.5, delta);
    const targetFOV = THREE.MathUtils.lerp(CONSTANTS.CAM_BASE_FOV, CONSTANTS.CAM_MAX_FOV, speedRatio) + this.fovKick;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFOV, 6, delta);
    this.camera.updateProjectionMatrix();
  }

  private updateIntro(targetPos: THREE.Vector3, delta: number): void {
    this.introProgress += delta * 0.55;
    const t = Math.min(1.0, this.introProgress);

    const startCam = new THREE.Vector3(targetPos.x + 8, targetPos.y + 14, targetPos.z + 32);
    const endCam = new THREE.Vector3(targetPos.x, targetPos.y + CONSTANTS.CAM_OFFSET_Y, targetPos.z + CONSTANTS.CAM_OFFSET_Z);

    const smoothT = t * t * (3 - 2 * t);
    this.camera.up.set(0, 1, 0);
    this.camera.position.lerpVectors(startCam, endCam, smoothT);
    this.camera.lookAt(targetPos.x, targetPos.y + 2.0, targetPos.z + 14);

    if (t >= 1.0) {
      this.isIntro = false;
      this.smoothY = targetPos.y;
    }
  }

  private updateCinematic(targetPos: THREE.Vector3, delta: number): void {
    this.orbitAngle += delta;
    this.smoothY = THREE.MathUtils.damp(this.smoothY, targetPos.y, 3.5, delta);
    const drift = Math.sin(this.orbitAngle * 0.26) * 1.3;
    
    // Attract mode off-axis chase: Camera sits to the left (b.x - 4.6) looking right (b.x + 2.4),
    // cleanly framing the ball in the lower-right quadrant while leaving left clear for title card.
    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, targetPos.x - 4.6 + drift, 3.2, delta);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, this.smoothY + 5.2 + Math.sin(this.orbitAngle * 0.4) * 0.4, 3.0, delta);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, targetPos.z - 13.0, 8.0, delta);

    this.currentLookAt.x = THREE.MathUtils.damp(this.currentLookAt.x, targetPos.x + 2.4 + drift, 3.0, delta);
    this.currentLookAt.y = THREE.MathUtils.damp(this.currentLookAt.y, this.smoothY + 2.4, 3.0, delta);
    this.currentLookAt.z = THREE.MathUtils.damp(this.currentLookAt.z, targetPos.z + 16.0, 8.0, delta);

    const rollTarget = Math.sin(this.orbitAngle * 0.22) * 0.02;
    this.rollAngle = THREE.MathUtils.damp(this.rollAngle, rollTarget, 6, delta);

    // Sign matches the sibling prototype's chase camera: with the same roll
    // target, the inverted form banked away from the turn instead of into it.
    const upX = Math.sin(this.rollAngle);
    const upY = Math.cos(this.rollAngle);
    this.camera.up.set(upX, upY, 0);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);

    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 62, 3, delta);
    this.camera.updateProjectionMatrix();
  }

  public reset(targetPos: THREE.Vector3): void {
    this.smoothY = targetPos.y;
    this.currentPos.set(targetPos.x, targetPos.y + CONSTANTS.CAM_OFFSET_Y, targetPos.z + CONSTANTS.CAM_OFFSET_Z);
    this.currentLookAt.set(targetPos.x, targetPos.y + CONSTANTS.CAM_LOOK_HEIGHT, targetPos.z + CONSTANTS.CAM_LOOK_AHEAD);
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
    this.camera.fov = CONSTANTS.CAM_BASE_FOV;
    this.camera.updateProjectionMatrix();
    this.trauma = 0;
    this.fovKick = 0;
    this.rollAngle = 0;
    this.targetGravityRoll = 0;
    this.isCinematic = false;
    this.isIntro = false;
  }
}
