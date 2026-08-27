import * as THREE from 'three';
import { HEX } from '../rendering/Palette';
import { CelShaders } from '../rendering/CelShaders';
import { GameModeId } from '../config/modes';

export interface GhostFrame {
  t: number;      // timestamp in seconds
  x: number;
  y: number;
  z: number;
  rotZ: number;
  sqX: number;
  sqY: number;
  sqZ: number;
  speed: number;
}

/**
 * Ghost Rig - "Race Your Ghost" System
 * Records player performance and replays a translucent holographic ghost ball.
 */
export class GhostRig {
  public group: THREE.Group = new THREE.Group();
  private ghostMesh: THREE.Mesh;
  private outlineMesh: THREE.Mesh;

  // Recording buffer
  private currentRecording: GhostFrame[] = [];
  private sampleInterval: number = 0.05; // 20 Hz recording rate
  private lastSampleTime: number = 0;

  // Playback buffer
  private activeGhostData: GhostFrame[] = [];
  public hasGhostData: boolean = false;
  private isVisible: boolean = true;

  constructor() {
    const geo = new THREE.SphereGeometry(1.15, 24, 16);

    // Translucent Holographic Material
    const ghostMat = CelShaders.createCelMaterial({
      color: HEX.giltBright,
      shadowColor: HEX.marbleShadow,
      highlightColor: HEX.white,
      rimColor: 0x9D00FF,
      rimPower: 0.9,
      isEmissive: true,
    });
    ghostMat.transparent = true;
    ghostMat.opacity = 0.45;
    ghostMat.depthWrite = false;

    this.ghostMesh = new THREE.Mesh(geo, ghostMat);
    this.group.add(this.ghostMesh);

    // Glowing Hologram Outline
    const outlineMat = CelShaders.createOutlineMaterial(0.08, HEX.giltBright);
    outlineMat.transparent = true;
    outlineMat.opacity = 0.6;
    this.outlineMesh = new THREE.Mesh(geo, outlineMat);
    this.ghostMesh.add(this.outlineMesh);

    this.group.visible = false;
  }

  public loadBestGhost(mode: GameModeId): void {
    const saved = localStorage.getItem(`bounce_ghost_${mode}`);
    if (saved) {
      try {
        this.activeGhostData = JSON.parse(saved);
        this.hasGhostData = this.activeGhostData.length > 10;
        this.group.visible = this.hasGhostData && this.isVisible;
      } catch {
        this.activeGhostData = [];
        this.hasGhostData = false;
        this.group.visible = false;
      }
    } else {
      this.activeGhostData = [];
      this.hasGhostData = false;
      this.group.visible = false;
    }
  }

  public startRecording(): void {
    this.currentRecording = [];
    this.lastSampleTime = 0;
    this.group.visible = this.hasGhostData && this.isVisible;
  }

  public recordFrame(
    runTime: number,
    pos: THREE.Vector3,
    rotZ: number,
    scale: THREE.Vector3,
    speed: number
  ): void {
    if (runTime - this.lastSampleTime >= this.sampleInterval) {
      this.lastSampleTime = runTime;
      this.currentRecording.push({
        t: Math.round(runTime * 1000) / 1000,
        x: Math.round(pos.x * 100) / 100,
        y: Math.round(pos.y * 100) / 100,
        z: Math.round(pos.z * 100) / 100,
        rotZ: Math.round(rotZ * 100) / 100,
        sqX: Math.round(scale.x * 100) / 100,
        sqY: Math.round(scale.y * 100) / 100,
        sqZ: Math.round(scale.z * 100) / 100,
        speed: Math.round(speed * 10) / 10,
      });
    }
  }

  /**
   * Saves current recording if it's the best run
   */
  public saveGhostRun(mode: GameModeId, shouldSave: boolean): void {
    if (!shouldSave || this.currentRecording.length < 10) return;

    try {
      localStorage.setItem(`bounce_ghost_${mode}`, JSON.stringify(this.currentRecording));
      this.activeGhostData = [...this.currentRecording];
      this.hasGhostData = true;
    } catch {
      // Storage quota exceeded or private mode
    }
  }

  /**
   * Update Ghost Playback and return delta time/distance relative to player
   */
  public updatePlayback(playerTime: number, playerZ: number): { deltaDist: number; deltaTime: number } | null {
    if (!this.hasGhostData || this.activeGhostData.length === 0) {
      this.group.visible = false;
      return null;
    }

    this.group.visible = this.isVisible;

    // Find bounding frames for playerTime
    let prevFrame = this.activeGhostData[0];
    let nextFrame = this.activeGhostData[this.activeGhostData.length - 1];

    if (playerTime <= prevFrame.t) {
      this.group.position.set(prevFrame.x, prevFrame.y, prevFrame.z);
      this.ghostMesh.scale.set(prevFrame.sqX, prevFrame.sqY, prevFrame.sqZ);
      this.ghostMesh.rotation.z = prevFrame.rotZ;
      return { deltaDist: playerZ - prevFrame.z, deltaTime: 0 };
    }

    if (playerTime >= nextFrame.t) {
      this.group.position.set(nextFrame.x, nextFrame.y, nextFrame.z);
      return { deltaDist: playerZ - nextFrame.z, deltaTime: playerTime - nextFrame.t };
    }

    // Binary search for closest index
    let low = 0;
    let high = this.activeGhostData.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.activeGhostData[mid].t <= playerTime) {
        prevFrame = this.activeGhostData[mid];
        low = mid + 1;
      } else {
        nextFrame = this.activeGhostData[mid];
        high = mid - 1;
      }
    }

    const tSpan = Math.max(0.0001, nextFrame.t - prevFrame.t);
    const alpha = Math.min(1.0, Math.max(0.0, (playerTime - prevFrame.t) / tSpan));

    // Smooth lerp
    this.group.position.set(
      THREE.MathUtils.lerp(prevFrame.x, nextFrame.x, alpha),
      THREE.MathUtils.lerp(prevFrame.y, nextFrame.y, alpha),
      THREE.MathUtils.lerp(prevFrame.z, nextFrame.z, alpha)
    );

    this.ghostMesh.scale.set(
      THREE.MathUtils.lerp(prevFrame.sqX, nextFrame.sqX, alpha),
      THREE.MathUtils.lerp(prevFrame.sqY, nextFrame.sqY, alpha),
      THREE.MathUtils.lerp(prevFrame.sqZ, nextFrame.sqZ, alpha)
    );
    this.ghostMesh.rotation.z = THREE.MathUtils.lerp(prevFrame.rotZ, nextFrame.rotZ, alpha);

    const deltaDist = playerZ - this.group.position.z;
    const ghostSpeed = prevFrame.speed || 40;
    const deltaTime = -deltaDist / Math.max(10, ghostSpeed);

    return { deltaDist, deltaTime };
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = this.hasGhostData && this.isVisible;
  }
}
