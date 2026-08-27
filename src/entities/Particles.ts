import * as THREE from 'three';
import { HEX } from '../rendering/Palette';
import { TextureGenerator } from '../rendering/TextureGenerator';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  maxLife: number;
  life: number;
  active: boolean;
}

interface RingShockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  active: boolean;
}

/**
 * Clean Stylized Comic Particle System for BOUNCE
 */
export class ParticleSystem {
  public group: THREE.Group = new THREE.Group();

  private maxParticles: number = 160;
  private particles: Particle[] = [];
  private pointsMesh!: THREE.Points;
  private geom!: THREE.BufferGeometry;
  private posAttr!: THREE.BufferAttribute;
  private colAttr!: THREE.BufferAttribute;
  private sizeAttr!: THREE.BufferAttribute;

  // Expanding Shockwave Rings Pool
  private shockwavePool: RingShockwave[] = [];

  constructor() {
    this.initParticlePool();
    this.initShockwaves();
  }

  private initParticlePool(): void {
    this.geom = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxParticles * 3);
    const colors = new Float32Array(this.maxParticles * 3);
    const sizes = new Float32Array(this.maxParticles);

    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.colAttr = new THREE.BufferAttribute(colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(sizes, 1);

    this.geom.setAttribute('position', this.posAttr);
    this.geom.setAttribute('color', this.colAttr);
    this.geom.setAttribute('size', this.sizeAttr);

    const starTex = TextureGenerator.getStarburstParticleTexture();
    const mat = new THREE.PointsMaterial({
      size: 1.6,
      map: starTex,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.pointsMesh = new THREE.Points(this.geom, mat);
    this.pointsMesh.frustumCulled = false;
    this.group.add(this.pointsMesh);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        size: 0.8,
        maxLife: 0.6,
        life: 0,
        active: false,
      });
    }
  }

  private initShockwaves(): void {
    const ringGeo = new THREE.RingGeometry(0.8, 1.4, 32);
    ringGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: HEX.giltBright,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.shockwavePool.push({
        mesh,
        life: 0,
        maxLife: 0.3,
        startScale: 0.4,
        endScale: 5.5,
        active: false,
      });
    }
  }

  public emitBounce(pos: THREE.Vector3, isPerfect: boolean = false): void {
    const count = isPerfect ? 14 : 7;
    const baseColor = new THREE.Color(isPerfect ? HEX.gilt : HEX.white);

    for (let i = 0; i < count; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = isPerfect ? (6 + Math.random() * 9) : (3 + Math.random() * 5);

      p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4));
      p.velocity.set(
        Math.cos(angle) * speed,
        3 + Math.random() * 6,
        Math.sin(angle) * speed
      );
      p.color.copy(baseColor);
      p.size = isPerfect ? (1.4 + Math.random() * 0.6) : (0.9 + Math.random() * 0.4);
      p.maxLife = 0.45 + Math.random() * 0.2;
      p.life = p.maxLife;
      p.active = true;
    }

    this.spawnShockwave(pos, isPerfect ? HEX.gilt : HEX.giltBright, isPerfect ? 7.0 : 4.5);
  }

  /**
   * Ground dust kick on touchdown: low radial cloud of alabaster mist
   */
  public emitLandingDust(pos: THREE.Vector3, hardness: number = 0.5): void {
    const count = Math.round(5 + hardness * 9);
    const dustColor = new THREE.Color(HEX.alabasterDim);

    for (let i = 0; i < count; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 2.5 + hardness * 6.5 + Math.random() * 2.0;

      p.position.set(
        pos.x + Math.cos(angle) * 0.4,
        pos.y + 0.08,
        pos.z + Math.sin(angle) * 0.4
      );
      p.velocity.set(
        Math.cos(angle) * speed,
        0.5 + Math.random() * 1.5,
        Math.sin(angle) * speed
      );
      p.color.copy(dustColor);
      p.size = 1.0 + hardness * 0.8 + Math.random() * 0.5;
      p.maxLife = 0.35 + hardness * 0.25;
      p.life = p.maxLife;
      p.active = true;
    }
  }

  /**
   * Escalating Chain Visual Signature based on combo count
   */
  public emitChainBurst(pos: THREE.Vector3, combo: number): void {
    const isOverdrive = combo >= 15;
    const isGreat = combo >= 8;
    const count = isOverdrive ? 24 : isGreat ? 16 : 10;
    const ringColor = isOverdrive ? HEX.giltBright : isGreat ? HEX.gilt : HEX.giltBright;

    for (let i = 0; i < count; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = (i / count) * Math.PI * 2;
      const speed = isOverdrive ? (10 + Math.random() * 12) : isGreat ? (7 + Math.random() * 8) : (5 + Math.random() * 6);

      p.position.copy(pos).add(new THREE.Vector3(Math.cos(angle) * 0.5, 0.15, Math.sin(angle) * 0.5));
      p.velocity.set(
        Math.cos(angle) * speed,
        4 + Math.random() * 8,
        Math.sin(angle) * speed
      );
      p.color.set(isOverdrive ? (i % 2 === 0 ? HEX.giltBright : HEX.white) : HEX.gilt);
      p.size = isOverdrive ? 1.8 : isGreat ? 1.4 : 1.1;
      p.maxLife = isOverdrive ? 0.6 : 0.45;
      p.life = p.maxLife;
      p.active = true;
    }

    // Primary expanding shockwave
    this.spawnShockwave(pos, ringColor, isOverdrive ? 10.5 : isGreat ? 8.0 : 6.0);

    // High tier secondary echo shockwave
    if (isGreat) {
      setTimeout_internal: {
        const sw = this.shockwavePool.find(s => !s.active);
        if (sw) {
          sw.active = true;
          sw.life = -0.06; // Delay slightly
          sw.maxLife = 0.36;
          sw.startScale = 0.8;
          sw.endScale = isOverdrive ? 13.0 : 9.5;
          sw.mesh.position.set(pos.x, pos.y + 0.12, pos.z);
          sw.mesh.scale.setScalar(sw.startScale);
          (sw.mesh.material as THREE.MeshBasicMaterial).color.set(HEX.giltBright);
          (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95;
          sw.mesh.visible = true;
        }
      }
    }
  }

  /**
   * Supersonic Air Dash thrust rings & jet flare
   */
  public emitAirDashThrust(pos: THREE.Vector3, dir: number, trailColorHex: number): void {
    for (let i = 0; i < 14; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const spread = (Math.random() - 0.5) * 1.5;
      p.position.set(
        pos.x - dir * 0.5 + spread * 0.3,
        pos.y + (Math.random() - 0.5) * 0.6,
        pos.z - 0.8 - Math.random() * 0.5
      );
      p.velocity.set(
        -dir * (6 + Math.random() * 8) + spread * 2,
        (Math.random() - 0.5) * 3,
        -18 - Math.random() * 12
      );
      p.color.set(Math.random() > 0.4 ? trailColorHex : HEX.white);
      p.size = 1.3 + Math.random() * 0.7;
      p.maxLife = 0.32;
      p.life = p.maxLife;
      p.active = true;
    }

    // Cone shockwave behind dash
    this.spawnShockwave(
      new THREE.Vector3(pos.x, pos.y, pos.z - 0.6),
      trailColorHex,
      6.5
    );
  }

  /**
   * Clean, crisp shards that feel like parts of the ball (amber shell, gold studs, spark embers)
   */
  public emitBallDebris(pos: THREE.Vector3, skinColorHex: number): void {
    const debrisColors = [skinColorHex, HEX.gilt, HEX.marbleDim, HEX.danger, HEX.white];

    for (let i = 0; i < 12; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 5 + Math.random() * 9;
      const col = debrisColors[i % debrisColors.length];

      p.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4
      ));
      p.velocity.set(
        Math.cos(angle) * speed,
        4 + Math.random() * 8,
        Math.sin(angle) * speed
      );
      p.color.set(col);
      p.size = 0.9 + Math.random() * 0.6;
      p.maxLife = 0.5 + Math.random() * 0.25;
      p.life = p.maxLife;
      p.active = true;
    }

    this.spawnShockwave(pos, skinColorHex, 7.0);
  }

  public emitSlamImpact(pos: THREE.Vector3): void {
    for (let i = 0; i < 24; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 12 + Math.random() * 16;
      p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5));
      p.velocity.set(Math.cos(angle) * speed, 5 + Math.random() * 10, Math.sin(angle) * speed);
      p.color.set(Math.random() > 0.4 ? HEX.blush : HEX.gilt);
      p.size = 1.6 + Math.random() * 0.6;
      p.maxLife = 0.55;
      p.life = p.maxLife;
      p.active = true;
    }

    this.spawnShockwave(pos, HEX.blush, 11.0);
    this.spawnShockwave(pos, HEX.giltBright, 6.0);
  }

  public emitSpeedWake(pos: THREE.Vector3, isBoosting: boolean): void {
    if (Math.random() > (isBoosting ? 0.7 : 0.4)) return;

    const p = this.getAvailableParticle();
    if (!p) return;

    const offsetRange = isBoosting ? 0.8 : 0.5;
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * offsetRange, (Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.8));
    p.velocity.set((Math.random() - 0.5) * 2.0, (Math.random() - 0.5) * 1.5, -6 - Math.random() * 8);
    p.color.set(Math.random() > 0.3 ? HEX.white : HEX.giltBright);
    p.size = isBoosting ? (1.2 + Math.random() * 0.6) : (0.8 + Math.random() * 0.5);
    p.maxLife = 0.35;
    p.life = p.maxLife;
    p.active = true;
  }

  public emitNearMiss(pos: THREE.Vector3): void {
    for (let i = 0; i < 8; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      p.position.copy(pos);
      p.velocity.set(Math.cos(angle) * 8, (Math.random() - 0.5) * 6, Math.sin(angle) * 8);
      p.color.set(HEX.gilt);
      p.size = 1.0;
      p.maxLife = 0.35;
      p.life = p.maxLife;
      p.active = true;
    }
  }

  public emitExplosion(pos: THREE.Vector3): void {
    for (let i = 0; i < 24; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 14;
      p.position.copy(pos);
      p.velocity.set(
        Math.cos(angle) * speed,
        3 + Math.random() * 10,
        Math.sin(angle) * speed
      );
      p.color.set(Math.random() > 0.5 ? HEX.blush : HEX.gilt);
      p.size = 1.3 + Math.random() * 0.8;
      p.maxLife = 0.6 + Math.random() * 0.3;
      p.life = p.maxLife;
      p.active = true;
    }

    this.spawnShockwave(pos, HEX.blush, 10.5);
  }

  public emitVictoryConfetti(pos: THREE.Vector3): void {
    const colors = [HEX.giltBright, HEX.blush, HEX.gilt, HEX.verdant, HEX.white];
    for (let i = 0; i < 35; i++) {
      const p = this.getAvailableParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 8 + Math.random() * 16;
      p.position.copy(pos);
      p.velocity.set(
        Math.cos(angle) * speed,
        8 + Math.random() * 14,
        Math.sin(angle) * speed
      );
      p.color.set(colors[i % colors.length]);
      p.size = 1.4 + Math.random() * 0.6;
      p.maxLife = 1.2 + Math.random() * 0.6;
      p.life = p.maxLife;
      p.active = true;
    }
  }

  private spawnShockwave(pos: THREE.Vector3, colorHex: number, maxScale: number): void {
    const sw = this.shockwavePool.find(s => !s.active);
    if (!sw) return;

    sw.active = true;
    sw.life = 0;
    sw.maxLife = 0.32;
    sw.startScale = 0.4;
    sw.endScale = maxScale;
    sw.mesh.position.set(pos.x, pos.y + 0.1, pos.z);
    sw.mesh.scale.setScalar(sw.startScale);
    (sw.mesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
    (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.88;
    sw.mesh.visible = true;
  }

  private getAvailableParticle(): Particle | null {
    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.particles[i].active) return this.particles[i];
    }
    return null;
  }

  public update(delta: number): void {
    const posArr = this.posAttr.array as Float32Array;
    const colArr = this.colAttr.array as Float32Array;
    const sizeArr = this.sizeAttr.array as Float32Array;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) {
        posArr[i * 3 + 1] = -999;
        continue;
      }

      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
        posArr[i * 3 + 1] = -999;
        continue;
      }

      p.velocity.y -= 10 * delta;
      p.position.addScaledVector(p.velocity, delta);

      const progress = p.life / p.maxLife;
      posArr[i * 3] = p.position.x;
      posArr[i * 3 + 1] = p.position.y;
      posArr[i * 3 + 2] = p.position.z;

      colArr[i * 3] = p.color.r * progress;
      colArr[i * 3 + 1] = p.color.g * progress;
      colArr[i * 3 + 2] = p.color.b * progress;

      sizeArr[i] = p.size * progress;
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;

    this.shockwavePool.forEach(sw => {
      if (!sw.active) return;
      sw.life += delta;
      if (sw.life >= sw.maxLife) {
        sw.active = false;
        sw.mesh.visible = false;
        return;
      }
      if (sw.life < 0) return; // Delayed shockwave

      const t = sw.life / sw.maxLife;
      const s = sw.startScale + t * (sw.endScale - sw.startScale);
      sw.mesh.scale.set(s, s, s);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1.0 - t) * 0.88;
    });
  }
}
