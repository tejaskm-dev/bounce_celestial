import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HEX } from '../rendering/Palette';
import { CelShaders } from '../rendering/CelShaders';
import { TextureGenerator } from '../rendering/TextureGenerator';
import { CONSTANTS } from '../config/constants';

export interface CollisionResult {
  hit: boolean;
  isLethal: boolean;
  isBouncePad: boolean;
  isSpring: boolean;
  isBumper: boolean;
  isSpeedPad: boolean;
  isBreakable: boolean;
  isBroken?: boolean;
  isBonusGem: boolean;
  isFinishLine?: boolean;
  isGravityShift?: boolean;
  gravityDir?: number; // 1 = normal down, -1 = inverted ceiling
  bounceHeight: number;
  isPerfect: boolean;
  isGood?: boolean;
  bouncePos?: THREE.Vector3;
  reboundForce?: THREE.Vector3;
}

/**
 * Base Interactive Obstacle
 */
export abstract class Obstacle {
  public group: THREE.Group = new THREE.Group();
  public position: THREE.Vector3 = new THREE.Vector3();
  public boundingBox: THREE.Box3 = new THREE.Box3();
  public isLethal: boolean = false;
  public isActive: boolean = true;
  public nearMissTriggered: boolean = false;

  public abstract update(delta: number): void;
  public abstract checkCollision(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult;
}

/**
 * High-Stylization Cel-Shaded Track Platform Slab
 */
export class TrackPlatform extends Obstacle {
  public width: number;
  public length: number;
  private mesh: THREE.Mesh;

  constructor(x: number, y: number, z: number, width: number, length: number, colorHex: number = HEX.alabaster) {
    super();
    this.width = width;
    this.length = length;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Bridge deck: a richly moulded classical stone cornice entablature
    // with stepped cyma/fascia profiles, gold lip inlays, and classical baluster posts.
    //
    // All static parts are merged into one BufferGeometry per material.
    const stoneParts: THREE.BufferGeometry[] = [];
    const goldParts: THREE.BufferGeometry[] = [];

    // 1. Primary Deck Stone Slab (top at y = 0.50)
    const deckGeo = new THREE.BoxGeometry(width, 0.40, length);
    deckGeo.translate(0, 0.30, 0);
    stoneParts.push(deckGeo);

    // 2. Moulded Cyma & Bevel Trim (projecting tier)
    const cyma = new THREE.BoxGeometry(width + 0.32, 0.20, length + 0.32);
    cyma.translate(0, 0.08, 0);
    stoneParts.push(cyma);

    // 3. Projecting Corona / Fascia Moulding
    const fascia = new THREE.BoxGeometry(width + 0.60, 0.24, length + 0.60);
    fascia.translate(0, -0.12, 0);
    stoneParts.push(fascia);

    // 4. Stepped Cavetto Under-Trim
    const cavetto = new THREE.BoxGeometry(width + 0.36, 0.22, length + 0.36);
    cavetto.translate(0, -0.32, 0);
    stoneParts.push(cavetto);

    // 5. Corbelled Foot Foundation Block
    const foot = new THREE.BoxGeometry(width * 0.84, 1.4, length * 0.92);
    foot.translate(0, -1.05, 0);
    stoneParts.push(foot);

    // 6. Classical Moulded Baluster Posts along lips
    const posts = Math.max(2, Math.round(length / 6));
    for (let i = 0; i < posts; i++) {
      const pz = -length / 2 + (i + 0.5) * (length / posts);
      for (const side of [-1, 1]) {
        const px = side * (width / 2 + 0.16);

        // Plinth Base
        const pBase = new THREE.BoxGeometry(0.40, 0.24, 0.40);
        pBase.translate(px, 0.45, pz);
        stoneParts.push(pBase);

        // Tapered Shaft
        const pShaft = new THREE.CylinderGeometry(0.14, 0.17, 0.90, 8);
        pShaft.translate(px, 1.02, pz);
        stoneParts.push(pShaft);

        // Stepped Capital Disc
        const pCap = new THREE.BoxGeometry(0.36, 0.16, 0.36);
        pCap.translate(px, 1.55, pz);
        stoneParts.push(pCap);

        // Gold Finial Bead
        const pGold = new THREE.OctahedronGeometry(0.08, 0);
        pGold.scale(1.2, 1.2, 1.2);
        pGold.translate(px, 1.70, pz);
        goldParts.push(pGold);
      }
    }

    // 7. Gold Lip Inlay along both playable edges
    for (const side of [-1, 1]) {
      const inlay = new THREE.BoxGeometry(0.45, 0.08, length * 0.98);
      inlay.translate(side * (width / 2 - 0.45), 0.52, 0);
      goldParts.push(inlay);

      // Gold astragal bead on outer fascia
      const goldBead = new THREE.BoxGeometry(0.08, 0.08, length + 0.62);
      goldBead.translate(side * (width / 2 + 0.31), -0.12, 0);
      goldParts.push(goldBead);
    }

    // Normalise and merge geometries
    const flatStone = stoneParts.map((g) => (g.index ? g.toNonIndexed() : g));
    const flatGold = goldParts.map((g) => (g.index ? g.toNonIndexed() : g));
    const stoneGeo = mergeGeometries(flatStone, false) ?? deckGeo;
    const goldGeo = mergeGeometries(flatGold, false)!;
    flatStone.forEach((g, i) => { if (g !== stoneParts[i]) g.dispose(); });
    flatGold.forEach((g, i) => { if (g !== goldParts[i]) g.dispose(); });
    stoneParts.forEach((g) => { if (g !== deckGeo) g.dispose(); });
    goldParts.forEach((g) => g.dispose());

    if (stoneGeo) stoneGeo.computeVertexNormals();
    if (goldGeo) goldGeo.computeVertexNormals();

    const deckMat = CelShaders.createStoneMaterial({
      color: colorHex, shadow: HEX.marbleDim, highlight: HEX.white,
      flutes: 0.0001, veining: 0.32, courses: 0.35,
    });
    this.mesh = new THREE.Mesh(stoneGeo, deckMat);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    const goldMesh = new THREE.Mesh(goldGeo, CelShaders.createCelMaterial({
      color: HEX.gilt, shadowColor: HEX.giltDeep, highlightColor: HEX.giltBright,
      rimColor: HEX.sun, rimPower: 0.55,
    }));
    this.group.add(goldMesh);

    // Engraved Celestial Stone Centre Panel
    const panelGeo = new THREE.BoxGeometry(width * 0.74, 0.06, length * 0.94);
    panelGeo.translate(0, 0.52, 0);
    const panel = new THREE.Mesh(panelGeo, CelShaders.createCelMaterial({
      color: HEX.tilePale, map: TextureGenerator.getComicTileTexture(),
      shadowColor: HEX.marbleDim, highlightColor: HEX.white,
      rimColor: HEX.skyHigh, rimPower: 0.25,
    }));
    this.group.add(panel);

    this.updateBounds();
  }

  public updateBounds(): void {
    const halfW = this.width / 2;
    const halfL = this.length / 2;
    this.boundingBox.min.set(this.position.x - halfW, this.position.y - 0.85, this.position.z - halfL);
    this.boundingBox.max.set(this.position.x + halfW, this.position.y + 0.5, this.position.z + halfL);
  }

  public update(_delta: number): void {}

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: CONSTANTS.BOUNCE_VELOCITY,
      isPerfect: false,
      isGood: true,
    };

    const topY = this.position.y + 0.5;
    const halfW = this.width / 2;
    const halfL = this.length / 2;

    if (
      ballPos.x >= this.position.x - halfW &&
      ballPos.x <= this.position.x + halfW &&
      ballPos.z >= this.position.z - halfL &&
      ballPos.z <= this.position.z + halfL
    ) {
      if (ballVel.y <= 0 && ballPos.y - ballRadius <= topY + 0.6 && ballPos.y >= topY - 2.5) {
        res.hit = true;
        res.bouncePos = new THREE.Vector3(ballPos.x, topY, ballPos.z);

        const centerOffset = Math.abs(ballPos.x - this.position.x);
        if (centerOffset < 1.4) {
          res.isPerfect = true;
          res.bounceHeight = CONSTANTS.SUPER_BOUNCE_VELOCITY;
        } else if (centerOffset < halfW - 0.8) {
          res.isGood = true;
        } else {
          res.isGood = false; // Near hazard edge
        }
      }
    }

    return res;
  }
}

/**
 * Concentric Target Bounce Pad
 */
export class BouncePad extends Obstacle {
  public constructor(x: number, y: number, z: number) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const padGeo = new THREE.CylinderGeometry(2.6, 2.8, 0.35, 32);
    const padMat = CelShaders.createCelMaterial({
      color: HEX.blush,
      map: TextureGenerator.getBounceTargetTexture(),
      rimColor: HEX.gilt,
      rimPower: 0.55,
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.receiveShadow = true;
    this.group.add(padMesh);

    const outlineMesh = new THREE.Mesh(padGeo, CelShaders.createOutlineMaterial(0.08, HEX.ink));
    padMesh.add(outlineMesh);

    // Yellow Outer Hazard Collar
    const collarGeo = new THREE.TorusGeometry(2.9, 0.22, 8, 32);
    const collarMat = CelShaders.createNeonMaterial(HEX.gilt, 1.6);
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.08;
    this.group.add(collar);
  }

  public update(_delta: number): void {}

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: true,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: CONSTANTS.SUPER_BOUNCE_VELOCITY,
      isPerfect: true,
      isGood: true,
    };

    const dist = Math.hypot(ballPos.x - this.position.x, ballPos.z - this.position.z);
    const topY = this.position.y + 0.2;

    if (dist <= 2.8 && ballVel.y <= 0 && ballPos.y - ballRadius <= topY + 0.6 && ballPos.y >= topY - 2.5) {
      res.hit = true;
      res.bouncePos = new THREE.Vector3(ballPos.x, topY, ballPos.z);
      res.isPerfect = dist <= CONSTANTS.PERFECT_BOUNCE_RADIUS;
    }

    return res;
  }
}

/**
 * Giant Coiled Spring Launch Pad
 */
export class SpringPad extends Obstacle {
  private coilMesh: THREE.Mesh;
  private capMesh: THREE.Mesh;
  private animTimer: number = 0;

  constructor(x: number, y: number, z: number) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Octagonal Hazard Collar Base
    const baseGeo = new THREE.CylinderGeometry(3.2, 3.4, 0.5, 8);
    const baseMat = CelShaders.createCelMaterial({
      color: HEX.gilt,
      map: TextureGenerator.getHazardTexture(),
      rimColor: HEX.blush,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    this.group.add(baseMesh);
    baseMesh.add(new THREE.Mesh(baseGeo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));

    // Coiled Heavy Steel Spring
    const curvePoints: THREE.Vector3[] = [];
    const coils = 4;
    const height = 2.0;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const angle = t * Math.PI * 2 * coils;
      const r = 1.3;
      curvePoints.push(new THREE.Vector3(Math.cos(angle) * r, 0.25 + t * height, Math.sin(angle) * r));
    }
    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const coilGeo = new THREE.TubeGeometry(curve, 64, 0.32, 8, false);
    const coilMat = CelShaders.createCelMaterial({
      color: HEX.marbleDeep,
      shadowColor: HEX.marbleShadow,
      highlightColor: HEX.gilt,
      rimColor: HEX.blush,
      rimPower: 0.55,
    });
    this.coilMesh = new THREE.Mesh(coilGeo, coilMat);
    this.group.add(this.coilMesh);

    // Thick Hot Pink Cap with Concentric Target
    const capGeo = new THREE.CylinderGeometry(2.6, 2.8, 0.5, 24);
    const capMat = CelShaders.createCelMaterial({
      color: HEX.blush,
      map: TextureGenerator.getBounceTargetTexture(),
      rimColor: HEX.gilt,
      rimPower: 0.65,
    });
    this.capMesh = new THREE.Mesh(capGeo, capMat);
    this.capMesh.position.y = 2.4;
    this.group.add(this.capMesh);
    this.capMesh.add(new THREE.Mesh(capGeo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));
  }

  public update(delta: number): void {
    if (this.animTimer > 0) {
      this.animTimer -= delta;
      const scaleY = 0.4 + (1.0 - this.animTimer / 0.35) * 0.6;
      this.coilMesh.scale.set(1, scaleY, 1);
      this.capMesh.position.y = 0.8 + scaleY * 1.6;
    }
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: true,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: CONSTANTS.SPRING_BOUNCE_VELOCITY,
      isPerfect: true,
      isGood: true,
    };

    const dist = Math.hypot(ballPos.x - this.position.x, ballPos.z - this.position.z);
    const topY = this.position.y + this.capMesh.position.y + 0.25;

    if (dist <= 2.8 && ballVel.y <= 0 && ballPos.y - ballRadius <= topY + 0.6 && ballPos.y >= topY - 2.5) {
      res.hit = true;
      res.bouncePos = new THREE.Vector3(ballPos.x, topY, ballPos.z);
      this.animTimer = 0.35;
    }

    return res;
  }
}

/**
 * Destructible Barrier - Speed Break Object
 * Crashes through at high speed (> 55 km/h) or during Slam, otherwise deflects with a bounce.
 */
export class DestructibleBarrier extends Obstacle {
  private barrierMesh: THREE.Mesh;
  private shards: THREE.Mesh[] = [];
  public isBroken: boolean = false;
  private breakTimer: number = 0;

  constructor(x: number, y: number, z: number, width: number = 8.0, height: number = 4.5) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Glass / Crystal Cel Mesh with Warning Cross Pattern
    const geo = new THREE.BoxGeometry(width, height, 0.6);
    const mat = CelShaders.createCelMaterial({
      color: HEX.giltBright,
      shadowColor: HEX.marbleShadow,
      highlightColor: HEX.white,
      rimColor: HEX.blush,
      rimPower: 0.8,
      isEmissive: true,
    });
    mat.transparent = true;
    mat.opacity = 0.88;

    this.barrierMesh = new THREE.Mesh(geo, mat);
    this.barrierMesh.position.y = height / 2;
    this.group.add(this.barrierMesh);
    this.barrierMesh.add(new THREE.Mesh(geo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));

    // Top / Bottom Hazard Brackets
    const bracketGeo = new THREE.BoxGeometry(width + 0.4, 0.4, 0.8);
    const bracketMat = CelShaders.createCelMaterial({
      color: HEX.gilt,
      map: TextureGenerator.getHazardTexture(),
      rimColor: HEX.blush,
    });
    const topBracket = new THREE.Mesh(bracketGeo, bracketMat);
    topBracket.position.y = height;
    this.group.add(topBracket);

    const bottomBracket = new THREE.Mesh(bracketGeo, bracketMat);
    bottomBracket.position.y = 0.2;
    this.group.add(bottomBracket);
  }

  public update(delta: number): void {
    if (this.isBroken) {
      this.breakTimer += delta;
      // Explode shattered shards outward
      this.shards.forEach((shard) => {
        shard.position.addScaledVector(shard.userData.velocity, delta);
        shard.rotation.x += shard.userData.rotSpeed.x * delta;
        shard.rotation.y += shard.userData.rotSpeed.y * delta;
        shard.userData.velocity.y -= 25 * delta; // Gravity
        shard.scale.multiplyScalar(Math.max(0, 1 - delta * 1.5));
      });
      if (this.breakTimer > 1.2) {
        this.group.visible = false;
        this.isActive = false;
      }
    }
  }

  public shatter(): void {
    if (this.isBroken) return;
    this.isBroken = true;
    this.barrierMesh.visible = false;

    // Spawn 12 kinetic 3D shards
    const shardGeo = new THREE.TetrahedronGeometry(0.8, 0);
    const shardMat = CelShaders.createCelMaterial({
      color: HEX.giltBright,
      highlightColor: HEX.white,
      rimColor: HEX.blush,
      isEmissive: true,
    });

    for (let i = 0; i < 12; i++) {
      const shard = new THREE.Mesh(shardGeo, shardMat);
      shard.position.set(
        (Math.random() - 0.5) * 6,
        2.0 + (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 0.5
      );
      shard.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          6 + Math.random() * 12,
          10 + Math.random() * 20
        ),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15
        ),
      };
      this.shards.push(shard);
      this.group.add(shard);
    }
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: true,
      isBroken: this.isBroken,
      isBonusGem: false,
      bounceHeight: CONSTANTS.BOUNCE_VELOCITY,
      isPerfect: false,
      isGood: true,
    };

    if (this.isBroken || !this.isActive) return res;

    const distX = Math.abs(ballPos.x - this.position.x);
    const distZ = Math.abs(ballPos.z - this.position.z);
    const distY = ballPos.y - this.position.y;

    if (distX < 4.2 && distZ < 1.0 + ballRadius && distY > -0.5 && distY < 5.0) {
      res.hit = true;
      const speedKmh = ballVel.z * 2.4;
      const isHighSpeed = speedKmh >= CONSTANTS.SPEED_BREAK_MIN_SPEED || ballVel.y < -25; // High speed or Slam

      if (isHighSpeed) {
        this.shatter();
        res.isBroken = true;
      } else {
        // Deflect back slightly
        res.isBroken = false;
        res.reboundForce = new THREE.Vector3(0, 10, -15);
      }
    }

    return res;
  }
}

/**
 * Collapsing Platform - Shudders on bounce and drops into abyss after 0.35s
 */
export class CollapsingPlatform extends Obstacle {
  private mesh: THREE.Mesh;
  private width: number;
  private length: number;
  private isCollapsing: boolean = false;
  private collapseTimer: number = 0;
  private fallSpeed: number = 0;

  constructor(x: number, y: number, z: number, width: number = 8.0, length: number = 14.0) {
    super();
    this.width = width;
    this.length = length;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const geo = new THREE.BoxGeometry(width, 0.45, length);
    const mat = CelShaders.createCelMaterial({
      color: HEX.blush,
      map: TextureGenerator.getHazardTexture(),
      shadowColor: HEX.voidDeep,
      highlightColor: HEX.gilt,
      rimColor: HEX.gilt,
      rimPower: 0.6,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = 0.25;
    this.group.add(this.mesh);
    this.mesh.add(new THREE.Mesh(geo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));
  }

  public update(delta: number): void {
    if (this.isCollapsing) {
      this.collapseTimer += delta;
      if (this.collapseTimer < 0.35) {
        // Shake shudder
        this.mesh.position.x = (Math.random() - 0.5) * 0.25;
        this.mesh.position.z = (Math.random() - 0.5) * 0.25;
      } else {
        // Drop down into abyss
        this.fallSpeed += 60 * delta;
        this.mesh.position.y -= this.fallSpeed * delta;
        this.mesh.rotation.x += 1.5 * delta;
      }
    }
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: CONSTANTS.BOUNCE_VELOCITY,
      isPerfect: false,
      isGood: true,
    };

    if (this.collapseTimer > 0.4) return res;

    const topY = this.position.y + 0.5;
    const halfW = this.width / 2;
    const halfL = this.length / 2;

    if (
      ballPos.x >= this.position.x - halfW &&
      ballPos.x <= this.position.x + halfW &&
      ballPos.z >= this.position.z - halfL &&
      ballPos.z <= this.position.z + halfL
    ) {
      if (ballVel.y <= 0 && ballPos.y - ballRadius <= topY + 0.6 && ballPos.y >= topY - 2.5) {
        res.hit = true;
        res.bouncePos = new THREE.Vector3(ballPos.x, topY, ballPos.z);
        this.isCollapsing = true;
        const centerOffset = Math.abs(ballPos.x - this.position.x);
        if (centerOffset < 1.4) {
          res.isPerfect = true;
          res.bounceHeight = CONSTANTS.SUPER_BOUNCE_VELOCITY;
        }
      }
    }

    return res;
  }
}

/**
 * Speed Booster Chevron Strip - Supercharges velocity by +35%
 */
export class SpeedBoosterStrip extends Obstacle {
  private chevronGroup: THREE.Group;

  constructor(x: number, y: number, z: number, length: number = 20.0) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Bed Platform
    const bedGeo = new THREE.BoxGeometry(5.0, 0.2, length);
    const bedMat = CelShaders.createCelMaterial({ color: HEX.marbleShadow, rimColor: HEX.giltBright });
    const bed = new THREE.Mesh(bedGeo, bedMat);
    bed.position.y = 0.1;
    this.group.add(bed);

    // Animated Glowing Chevrons
    this.chevronGroup = new THREE.Group();
    this.group.add(this.chevronGroup);

    const chevronMat = CelShaders.createNeonMaterial(HEX.giltBright, 2.2);
    const chevronGeo = new THREE.ConeGeometry(1.2, 2.0, 3);
    chevronGeo.rotateX(-Math.PI / 2);

    for (let i = -length / 2 + 2; i <= length / 2 - 2; i += 4.5) {
      const ch = new THREE.Mesh(chevronGeo, chevronMat);
      ch.position.set(0, 0.25, i);
      ch.scale.set(1.2, 0.15, 1.0);
      this.chevronGroup.add(ch);
    }
  }

  public update(_delta: number): void {
    this.chevronGroup.children.forEach((ch, idx) => {
      const pulse = Math.sin(Date.now() * 0.01 + idx * 0.8) * 0.15 + 1.0;
      ch.scale.set(1.2 * pulse, 0.15, 1.0 * pulse);
    });
  }

  public checkCollision(ballPos: THREE.Vector3, _ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: true,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: 0,
      isPerfect: false,
      isGood: true,
    };

    if (
      Math.abs(ballPos.x - this.position.x) < 2.5 &&
      Math.abs(ballPos.z - this.position.z) < 10.0 &&
      Math.abs(ballPos.y - this.position.y) < 2.0
    ) {
      res.hit = true;
    }

    return res;
  }
}

/**
 * Hyper Warp Acceleration Zone - High speed boost with cosmic warp ring
 */
export class GravityShiftZone extends Obstacle {
  private ringMesh: THREE.Mesh;
  public targetGravityDir: number;

  constructor(x: number, y: number, z: number, targetDir: number = 1) {
    super();
    this.targetGravityDir = targetDir;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Glowing Gravitational Warp Ring Portal
    const ringGeo = new THREE.TorusGeometry(8.5, 0.6, 8, 32);
    const ringMat = CelShaders.createNeonMaterial(HEX.giltBright, 2.5);
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.y = 6.0;
    this.group.add(this.ringMesh);
  }

  public update(delta: number): void {
    this.ringMesh.rotation.z += 1.8 * delta;
  }

  public checkCollision(ballPos: THREE.Vector3, _ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: true, // Gives speed pad super-acceleration
      isBreakable: false,
      isBonusGem: false,
      isGravityShift: false,
      gravityDir: 1,
      bounceHeight: 0,
      isPerfect: false,
      isGood: true,
    };

    const dist = Math.hypot(ballPos.x - this.position.x, ballPos.z - this.position.z);
    if (dist < 8.0 && Math.abs(ballPos.y - (this.position.y + 6.0)) < 6.0) {
      res.hit = true;
    }

    return res;
  }
}

/**
 * Grand Finish Line Victory Gate
 */
export class FinishLineGate extends Obstacle {
  private archMesh: THREE.Mesh;

  constructor(x: number, y: number, z: number) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Chequered Victory Banner Arch
    const archGeo = new THREE.TorusGeometry(10.0, 0.8, 8, 32, Math.PI);
    const archMat = CelShaders.createCelMaterial({
      color: HEX.gilt,
      map: TextureGenerator.getHazardTexture(),
      highlightColor: HEX.white,
      rimColor: HEX.blush,
      rimPower: 0.8,
      isEmissive: true,
    });
    this.archMesh = new THREE.Mesh(archGeo, archMat);
    this.archMesh.position.y = 0;
    this.group.add(this.archMesh);

    // Finish Text Signboard
    const signGeo = new THREE.BoxGeometry(12, 2.5, 0.4);
    const signMat = CelShaders.createNeonMaterial(HEX.blush, 2.0);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.y = 10;
    this.group.add(sign);
  }

  public update(_delta: number): void {
    this.archMesh.rotation.y = Math.sin(Date.now() * 0.002) * 0.05;
  }

  public checkCollision(ballPos: THREE.Vector3, _ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      isFinishLine: true,
      bounceHeight: 0,
      isPerfect: false,
      isGood: true,
    };

    if (Math.abs(ballPos.z - this.position.z) < 2.5 && Math.abs(ballPos.x - this.position.x) < 10.0) {
      res.hit = true;
    }

    return res;
  }
}

/**
 * Industrial Overhead Piston Mallet
 */
export class IndustrialPiston extends Obstacle {
  private headMesh: THREE.Mesh;
  private shaftMesh: THREE.Mesh;
  private strokeHeight: number = 7.0;
  private speed: number;
  private phase: number;

  constructor(x: number, y: number, z: number, speed: number = 3.2, phase: number = 0) {
    super();
    this.isLethal = true;
    this.speed = speed;
    this.phase = phase;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const bracketGeo = new THREE.BoxGeometry(5.0, 1.8, 5.0);
    const bracketMat = CelShaders.createCelMaterial({ color: HEX.dangerDeep, rimColor: HEX.danger });
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    bracket.position.y = 12;
    this.group.add(bracket);
    bracket.add(new THREE.Mesh(bracketGeo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));

    const shaftGeo = new THREE.CylinderGeometry(0.85, 0.85, 12, 16);
    const shaftMat = CelShaders.createCelMaterial({
      color: HEX.danger,
      highlightColor: HEX.dangerBright,
      rimColor: HEX.dangerBright,
    });
    this.shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    this.shaftMesh.position.y = 6;
    this.group.add(this.shaftMesh);

    const headGeo = new THREE.CylinderGeometry(2.8, 3.0, 3.0, 16);
    const headMat = CelShaders.createCelMaterial({
      color: HEX.danger,
      map: TextureGenerator.getHazardTexture(),
      shadowColor: HEX.dangerDeep,
      highlightColor: HEX.dangerBright,
      rimColor: HEX.dangerBright,
      rimPower: 0.55,
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = 2.2;
    this.group.add(this.headMesh);
    this.headMesh.add(new THREE.Mesh(headGeo, CelShaders.createOutlineMaterial(0.09, HEX.ink)));
  }

  public update(delta: number): void {
    this.phase += this.speed * delta;
    const cycle = (Math.sin(this.phase) + 1) / 2;
    const shapedCycle = Math.pow(cycle, 3.0);
    const curY = 1.6 + shapedCycle * this.strokeHeight;

    this.headMesh.position.y = curY;
    this.shaftMesh.position.y = (12 + curY) / 2;
    this.shaftMesh.scale.y = (12 - curY) / 12;
  }

  public checkCollision(ballPos: THREE.Vector3, _ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: true,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: 0,
      isPerfect: false,
      isGood: false,
    };

    const headWorldY = this.position.y + this.headMesh.position.y;
    const distXZ = Math.hypot(ballPos.x - this.position.x, ballPos.z - this.position.z);
    const distY = Math.abs(ballPos.y - headWorldY);

    if (distXZ <= 2.8 && distY <= 1.6) {
      res.hit = true;
    }

    return res;
  }
}

/**
 * Curved Guide Rail
 */
export class CurvedGuideRail extends Obstacle {
  constructor(x: number, y: number, z: number, radius: number = 7.0, isLeft: boolean = true) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI, false);
    shape.absarc(0, 0, radius - 1.4, Math.PI, 0, true);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.0,
      bevelEnabled: true,
      bevelThickness: 0.25,
      bevelSize: 0.25,
    });
    geo.rotateX(Math.PI / 2);
    if (!isLeft) geo.rotateY(Math.PI);

    const mat = CelShaders.createCelMaterial({
      color: HEX.blush,
      shadowColor: HEX.voidDeep,
      highlightColor: 0xFFAAD0,
      rimColor: HEX.gilt,
      rimPower: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.group.add(mesh);
    mesh.add(new THREE.Mesh(geo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));
  }

  public update(_delta: number): void {}
  public checkCollision(): CollisionResult {
    return {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: 0,
      isPerfect: false,
      isGood: true,
    };
  }
}

/**
 * Pinball Mushroom Bumper
 */
export class PinballBumper extends Obstacle {
  private capMesh: THREE.Mesh;
  private flashTimer: number = 0;

  constructor(x: number, y: number, z: number) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const capGeo = new THREE.SphereGeometry(2.0, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const capMat = CelShaders.createCelMaterial({
      color: HEX.gilt,
      shadowColor: 0x332200,
      highlightColor: HEX.white,
      rimColor: HEX.blush,
      rimPower: 0.65,
      isEmissive: true,
    });
    this.capMesh = new THREE.Mesh(capGeo, capMat);
    this.capMesh.position.y = 0.9;
    this.group.add(this.capMesh);
    this.capMesh.add(new THREE.Mesh(capGeo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));
  }

  public update(delta: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      const s = 1.0 + Math.sin(this.flashTimer * 20) * 0.25;
      this.capMesh.scale.set(s, s, s);
    }
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: true,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: CONSTANTS.BOUNCE_VELOCITY,
      isPerfect: false,
      isGood: true,
    };

    const dist = Math.hypot(ballPos.x - this.position.x, ballPos.z - this.position.z);
    if (dist < 2.3 + ballRadius && Math.abs(ballPos.y - (this.position.y + 1.1)) < 1.6) {
      res.hit = true;
      const angle = Math.atan2(ballPos.z - this.position.z, ballPos.x - this.position.x);
      res.reboundForce = new THREE.Vector3(Math.cos(angle) * 36, 24, Math.sin(angle) * 36);
      this.flashTimer = 0.25;
    }

    return res;
  }
}

/**
 * Bonus Score Gem (Golden Octahedron)
 */
export class BonusScoreGem extends Obstacle {
  private gemMesh: THREE.Mesh;

  constructor(x: number, y: number, z: number) {
    super();
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const geo = new THREE.OctahedronGeometry(1.2, 0);
    const mat = CelShaders.createCelMaterial({
      color: HEX.gilt,
      highlightColor: HEX.white,
      rimColor: HEX.giltBright,
      rimPower: 0.7,
      isEmissive: true,
    });
    this.gemMesh = new THREE.Mesh(geo, mat);
    this.group.add(this.gemMesh);
    this.gemMesh.add(new THREE.Mesh(geo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));
  }

  public update(delta: number): void {
    if (!this.isActive) return;
    this.gemMesh.rotation.y += 2.5 * delta;
    this.gemMesh.rotation.z += 1.2 * delta;
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: false,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: true,
      bounceHeight: 0,
      isPerfect: false,
      isGood: true,
    };

    if (!this.isActive) return res;

    const dist = this.position.distanceTo(ballPos);
    if (dist < 1.8 + ballRadius) {
      res.hit = true;
      this.isActive = false;
      this.group.visible = false;
    }

    return res;
  }
}

/**
 * Horizontally Sliding Heavy Hazard Block
 */
export class SlidingHazardBlock extends Obstacle {
  private mesh: THREE.Mesh;
  private baseX: number;
  private amplitude: number;
  private speed: number;
  private phase: number;
  public width: number;
  public height: number;
  public depth: number;

  constructor(x: number, y: number, z: number, width: number = 4.5, height: number = 4.0, depth: number = 5.0, amplitude: number = 4.5, speed: number = 2.2, phase: number = 0) {
    super();
    this.isLethal = true;
    this.baseX = x;
    this.amplitude = amplitude;
    this.speed = speed;
    this.phase = phase;
    this.width = width;
    this.height = height;
    this.depth = depth;

    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = CelShaders.createCelMaterial({
      color: HEX.danger,
      map: TextureGenerator.getHazardTexture(),
      shadowColor: HEX.dangerDeep,
      highlightColor: HEX.dangerBright,
      rimColor: HEX.danger,
      rimPower: 0.7,
      isEmissive: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = height / 2;
    this.group.add(this.mesh);
    this.mesh.add(new THREE.Mesh(geo, CelShaders.createOutlineMaterial(0.1, HEX.ink)));
  }

  public update(delta: number): void {
    this.phase += this.speed * delta;
    const curX = this.baseX + Math.sin(this.phase) * this.amplitude;
    this.position.x = curX;
    this.group.position.x = curX;
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: true,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: 0,
      isPerfect: false,
      isGood: false,
    };

    const halfW = this.width / 2 + ballRadius * 0.7;
    const halfH = this.height / 2 + ballRadius * 0.7;
    const halfD = this.depth / 2 + ballRadius * 0.7;
    const centerWorldY = this.position.y + this.height / 2;

    if (
      Math.abs(ballPos.x - this.position.x) <= halfW &&
      Math.abs(ballPos.y - centerWorldY) <= halfH &&
      Math.abs(ballPos.z - this.position.z) <= halfD
    ) {
      res.hit = true;
    }

    return res;
  }
}

/**
 * Spinning Circular Saw Blade Patrolling Across Track
 */
export class SpinningSawDisc extends Obstacle {
  private bladeMesh: THREE.Mesh;
  private baseX: number;
  private amplitude: number;
  private speed: number;
  private phase: number;
  public radius: number;

  constructor(x: number, y: number, z: number, radius: number = 3.2, amplitude: number = 5.0, speed: number = 2.8, phase: number = 0) {
    super();
    this.isLethal = true;
    this.baseX = x;
    this.radius = radius;
    this.amplitude = amplitude;
    this.speed = speed;
    this.phase = phase;

    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Serrated 12-tooth saw blade
    const shape = new THREE.Shape();
    const teeth = 12;
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? radius + 0.6 : radius * 0.82;
      const sx = Math.cos(a) * r;
      const sy = Math.sin(a) * r;
      if (i === 0) shape.moveTo(sx, sy);
      else shape.lineTo(sx, sy);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, radius * 0.28, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
    const mat = CelShaders.createCelMaterial({
      color: HEX.danger,
      highlightColor: HEX.dangerBright,
      rimColor: HEX.dangerBright,
      rimPower: 0.8,
      isEmissive: true,
    });
    this.bladeMesh = new THREE.Mesh(geo, mat);
    this.bladeMesh.position.y = radius + 0.3;
    this.group.add(this.bladeMesh);
  }

  public update(delta: number): void {
    this.phase += this.speed * delta;
    this.bladeMesh.rotation.z += 16 * delta; // Rapid saw spin
    const curX = this.baseX + Math.sin(this.phase) * this.amplitude;
    this.position.x = curX;
    this.group.position.x = curX;
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: true,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: 0,
      isPerfect: false,
      isGood: false,
    };

    const sawCenterY = this.position.y + this.radius + 0.3;
    const distXY = Math.hypot(ballPos.x - this.position.x, ballPos.y - sawCenterY);
    const distZ = Math.abs(ballPos.z - this.position.z);

    if (distXY <= this.radius + ballRadius * 0.6 && distZ <= 1.4 + ballRadius) {
      res.hit = true;
    }

    return res;
  }
}

/**
 * Rotating Horizontal Kinetic Sweep Bar Hazard
 */
export class SweepBarHazard extends Obstacle {
  private barGroup: THREE.Group;
  private rotSpeed: number;

  constructor(x: number, y: number, z: number, armLength: number = 8.5, rotSpeed: number = 2.2) {
    super();
    this.isLethal = true;
    this.rotSpeed = rotSpeed;
    this.position.set(x, y, z);
    this.group.position.copy(this.position);

    // Center Post Pylon
    const pylonGeo = new THREE.CylinderGeometry(0.8, 1.1, 4.5, 12);
    const pylonMat = CelShaders.createCelMaterial({ color: HEX.dangerDeep, rimColor: HEX.dangerBright });
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.y = 2.25;
    this.group.add(pylon);

    // Rotating Horizontal Arms
    this.barGroup = new THREE.Group();
    this.barGroup.position.y = 2.4;

    const armGeo = new THREE.BoxGeometry(armLength * 2, 0.6, 0.6);
    const armMat = CelShaders.createCelMaterial({
      color: HEX.dangerBright,
      map: TextureGenerator.getHazardTexture(),
      highlightColor: HEX.dangerBright,
      rimColor: HEX.danger,
      rimPower: 0.8,
      isEmissive: true,
    });
    const arm = new THREE.Mesh(armGeo, armMat);
    this.barGroup.add(arm);
    arm.add(new THREE.Mesh(armGeo, CelShaders.createOutlineMaterial(0.08, HEX.ink)));

    this.group.add(this.barGroup);
  }

  public update(delta: number): void {
    this.barGroup.rotation.y += this.rotSpeed * delta;
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number, _ballVel: THREE.Vector3): CollisionResult {
    const res: CollisionResult = {
      hit: false,
      isLethal: true,
      isBouncePad: false,
      isSpring: false,
      isBumper: false,
      isSpeedPad: false,
      isBreakable: false,
      isBonusGem: false,
      bounceHeight: 0,
      isPerfect: false,
      isGood: false,
    };

    const barY = this.position.y + 2.4;
    const distY = Math.abs(ballPos.y - barY);
    if (distY > 1.2 + ballRadius) return res;

    // Check distance to rotating segment in XZ
    const dx = ballPos.x - this.position.x;
    const dz = ballPos.z - this.position.z;
    const angle = -this.barGroup.rotation.y;
    // Rotate relative to bar coordinate system
    const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
    const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);

    if (Math.abs(localX) <= 8.5 + ballRadius && Math.abs(localZ) <= 0.6 + ballRadius) {
      res.hit = true;
    }

    return res;
  }
}

