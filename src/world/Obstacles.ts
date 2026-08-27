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

  /**
   * Vertical band this hazard actually threatens, for queries that ask "is x,z
   * safe" without simulating a collision.
   *
   * Every hazard used to be treated as an infinitely tall column, which was
   * harmless while they all stood on the deck. Now that some hang seventeen
   * units up, a banner would otherwise report the floor beneath it as sealed —
   * and the fairness probe would fail a course that plays fine.
   *
   * The default covers a hazard standing on the road.
   */
  public hazardMinY: number = -3;
  public hazardMaxY: number = 6;

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

  public readonly length: number;

  constructor(x: number, y: number, z: number, length: number = 20.0) {
    super();
    this.length = length;
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
      // The bed is `length` units long — 60 at the one call site — but this
      // tested a fixed 10, so two thirds of a strip the player can plainly see
      // did nothing. The visible thing and the working thing are now the same
      // thing.
      Math.abs(ballPos.x - this.position.x) < 2.5 &&
      Math.abs(ballPos.z - this.position.z) < this.length / 2 &&
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

    // The blade is extruded 0.35 deep and this tested 1.4 + the ball radius —
    // a 5.3-unit-deep kill volume around a paper-thin disc, which is what
    // "it got me and I wasn't near it" looks like from inside the code.
    //
    // 0.75 rather than 0.18 because the simulation steps at 1/120s and the ball
    // tops out at 78 u/s: anything under a 0.33 half-depth can be tunnelled
    // straight through. This is the tightest honest value, not the thinnest.
    if (distXY <= this.radius + ballRadius * 0.6 && distZ <= 0.75 + ballRadius * 0.5) {
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
  private readonly armLength: number;

  constructor(x: number, y: number, z: number, armLength: number = 8.5, rotSpeed: number = 2.2) {
    super();
    this.isLethal = true;
    this.rotSpeed = rotSpeed;
    this.armLength = armLength;
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

    // 8.5 was hard-coded here while armLength is a constructor parameter, and
    // every call site passes 6.0 or 6.5 — so the bar killed you two units past
    // where it visibly ended, on both sides. An invisible wall on a hazard the
    // player is timing by eye.
    if (Math.abs(localX) <= this.armLength + ballRadius && Math.abs(localZ) <= 0.6 + ballRadius) {
      res.hit = true;
    }

    return res;
  }
}


/* ============================================================================
   AERIAL HAZARDS
   ----------------------------------------------------------------------------
   Every hazard in this file above this line sits at deck level with a height
   of roughly 3.5 to 4.5 units. The ball's idle bounce peaks at 8 and its
   committed bounce at 16, so the entire hazard set could be cleared by holding
   the action key and never touching it — the course was a floor plan being
   flown over rather than a space being moved through.

   These three occupy the flight path instead, and each one asks for a
   different answer rather than the same jump higher:

     CENSER PENDULUM  mid arc   — swings across the lane; time it or go round
     VEIL BANNER      high      — hangs down from a beam; you must bounce LOW
     HALO RING        threading — rim kills, centre is safe; hit one exact apex

   Together they close the "hold for height and win" line: going higher now
   walks you into the banner, and going flat walks you into the deck hazards.
   ========================================================================= */

/** Every lethal hazard reports the same shape; this saves restating it. */
function lethalResult(): CollisionResult {
  return {
    hit: false, isLethal: true, isBouncePad: false, isSpring: false,
    isBumper: false, isSpeedPad: false, isBreakable: false, isBonusGem: false,
    bounceHeight: 0, isPerfect: false, isGood: false,
  };
}

/**
 * A censer swinging on a chain from a beam overhead.
 *
 * Occupies the middle of the arc, where the ball spends most of its airtime.
 * The swing is a real pendulum rather than a sine on x, so it slows at the
 * extremes and whips through the centre — the lane is briefly safe on a rhythm
 * the player can read, which is the difference between a hazard and a tax.
 */
export class CenserPendulum extends Obstacle {
  private readonly arm: THREE.Group;
  private readonly chainLength: number;
  private readonly swing: number;
  private readonly rate: number;
  private phase: number;
  private readonly pivotY: number;
  private readonly bowlR: number;
  private censerX = 0;
  private censerY = 0;

  constructor(
    x: number, y: number, z: number,
    chainLength = 5.0, swing = 0.85, rate = 1.6, phase = 0,
  ) {
    super();
    this.isLethal = true;
    this.chainLength = chainLength;
    this.swing = swing;
    this.rate = rate;
    this.phase = phase;
    this.bowlR = 1.5;
    // y is the height of the ball's path this is meant to intersect; the beam
    // hangs the chain from above it so the censer arrives at that height.
    this.pivotY = y + chainLength;
    // The censer swings through a band around its rest height, not the chain.
    this.hazardMinY = y - this.bowlR - 1.0;
    this.hazardMaxY = y + this.bowlR + chainLength * (1 - Math.cos(swing)) + 1.0;

    this.position.set(x, y, z);
    this.group.position.set(x, 0, z);

    const marbleMat = CelShaders.createCelMaterial({
      color: HEX.marble, highlightColor: HEX.tilePale, rimColor: HEX.marbleDim,
    });
    const giltMat = CelShaders.createCelMaterial({
      color: HEX.gilt, highlightColor: HEX.giltBright, rimColor: HEX.giltBright,
    });
    const lacquerMat = CelShaders.createCelMaterial({
      color: HEX.danger, highlightColor: HEX.dangerBright,
      rimColor: HEX.dangerBright, rimPower: 0.8, isEmissive: true,
    });

    // Beam overhead, with a boss where the chain is fixed.
    const beamGeo = new THREE.BoxGeometry(30, 0.9, 1.5);
    beamGeo.translate(0, this.pivotY + 1.2, 0);
    this.group.add(new THREE.Mesh(beamGeo, marbleMat));
    const bossGeo = new THREE.CylinderGeometry(0.55, 0.75, 1.1, 10);
    bossGeo.translate(0, this.pivotY + 0.4, 0);
    this.group.add(new THREE.Mesh(bossGeo, giltMat));

    // The arm swings; everything below the pivot is parented to it.
    this.arm = new THREE.Group();
    this.arm.position.y = this.pivotY;
    this.group.add(this.arm);

    // Chain: a stack of thin links, baked into one geometry. As separate
    // meshes this was eight draw calls per censer and there are two per
    // segment — the links never move relative to each other, so there is no
    // reason for them to be separate objects.
    const links = Math.max(3, Math.round(chainLength / 0.62));
    const linkParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < links; i++) {
      const g = new THREE.TorusGeometry(0.24, 0.075, 5, 9);
      g.rotateX(Math.PI * 0.5);
      g.rotateY((i % 2) * Math.PI * 0.5);
      g.translate(0, -(i + 0.5) * (chainLength / links), 0);
      linkParts.push(g);
    }
    const chainGeo = mergeGeometries(linkParts, false);
    for (const g of linkParts) g.dispose();
    if (chainGeo) this.arm.add(new THREE.Mesh(chainGeo, giltMat));

    // The censer itself: a lacquered bowl with a pierced lid and a finial.
    const bowlPts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      bowlPts.push(new THREE.Vector2(Math.sin(t * Math.PI * 0.62) * this.bowlR, -t * this.bowlR * 1.05));
    }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 14), lacquerMat);
    bowl.position.y = -chainLength;
    this.arm.add(bowl);

    const lidGeo = new THREE.ConeGeometry(this.bowlR * 0.98, 1.0, 14).toNonIndexed();
    lidGeo.translate(0, -chainLength + 0.5, 0);
    const finialGeo = new THREE.OctahedronGeometry(0.34).toNonIndexed();
    finialGeo.translate(0, -chainLength + 1.15, 0);
    const capGeo = mergeGeometries([lidGeo, finialGeo], false);
    lidGeo.dispose(); finialGeo.dispose();
    if (capGeo) this.arm.add(new THREE.Mesh(capGeo, giltMat));

    this.applySwing();
  }

  private applySwing(): void {
    const a = Math.sin(this.phase) * this.swing;
    this.arm.rotation.z = a;
    // Where the bowl actually is, for the collision test.
    this.censerX = this.position.x - Math.sin(a) * this.chainLength;
    this.censerY = this.pivotY - Math.cos(a) * this.chainLength;
  }

  public update(delta: number): void {
    this.phase += this.rate * delta;
    this.applySwing();
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number): CollisionResult {
    const res = lethalResult();
    const dxy = Math.hypot(ballPos.x - this.censerX, ballPos.y - this.censerY);
    const dz = Math.abs(ballPos.z - this.position.z);
    if (dxy <= this.bowlR + ballRadius * 0.7 && dz <= 1.5 + ballRadius) res.hit = true;
    return res;
  }
}

/**
 * A crossbeam spanning the road with silk banners hanging beneath it.
 *
 * This is the one that answers "you can just speed-jump over everything": it
 * occupies the *top* of the committed arc and leaves the space underneath open.
 * The only way through is to stop holding for height — the same key that has
 * been the correct answer to everything up to now becomes the wrong one.
 *
 * Banners have gaps between them, so a player who reads the lane can keep their
 * height by moving sideways instead.
 */
export class VeilBanner extends Obstacle {
  private readonly hemY: number;
  private readonly beamY: number;
  private readonly bands: { x: number; halfW: number; mesh: THREE.Mesh }[] = [];
  private readonly sway: number;
  private phase: number;
  private giltParts: THREE.BufferGeometry[] = [];

  constructor(
    z: number,
    hemY = 9.5,
    beamY = 20,
    lanes: [number, number][] = [[-9, 3.2], [0, 3.2], [9, 3.2]],
    sway = 0.5, phase = 0,
  ) {
    super();
    this.isLethal = true;
    this.hemY = hemY;
    this.beamY = beamY;
    this.sway = sway;
    this.phase = phase;

    this.hazardMinY = hemY;
    this.hazardMaxY = beamY;

    this.position.set(0, hemY, z);
    this.group.position.set(0, 0, z);

    const marbleMat = CelShaders.createCelMaterial({
      color: HEX.marble, highlightColor: HEX.tilePale, rimColor: HEX.marbleDim,
    });
    const giltMat = CelShaders.createCelMaterial({
      color: HEX.gilt, highlightColor: HEX.giltBright, rimColor: HEX.giltBright,
    });
    const silkMat = CelShaders.createCelMaterial({
      color: HEX.danger, highlightColor: HEX.dangerBright,
      rimColor: HEX.dangerBright, rimPower: 0.7, isEmissive: true,
    });

    const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 1.6), marbleMat);
    beam.position.y = beamY;
    this.group.add(beam);
    const capParts: THREE.BufferGeometry[] = [];
    for (const sx of [-16, 16]) {
      const g = new THREE.CylinderGeometry(1.0, 1.3, 2.0, 10).toNonIndexed();
      g.translate(sx, beamY, 0);
      capParts.push(g);
    }
    this.giltParts = capParts;

    const drop = beamY - hemY;
    for (const [x, halfW] of lanes) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, drop, 0.28), silkMat);
      cloth.position.set(x, hemY + drop / 2, 0);
      this.group.add(cloth);

      // A weighted gilt hem, so the eye lands exactly where the danger stops.
      const hemGeo = new THREE.BoxGeometry(halfW * 2 + 0.5, 0.55, 0.5).toNonIndexed();
      hemGeo.translate(x, hemY, 0);
      this.giltParts.push(hemGeo);

      this.bands.push({ x, halfW, mesh: cloth });
    }

    const giltGeo = mergeGeometries(this.giltParts, false);
    for (const g of this.giltParts) g.dispose();
    this.giltParts = [];
    if (giltGeo) this.group.add(new THREE.Mesh(giltGeo, giltMat));
  }

  public update(delta: number): void {
    this.phase += this.sway * delta;
    for (let i = 0; i < this.bands.length; i++) {
      // A slow lean, offset per banner so the row breathes rather than marching.
      this.bands[i].mesh.rotation.z = Math.sin(this.phase + i * 1.1) * 0.045;
    }
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number): CollisionResult {
    const res = lethalResult();
    if (Math.abs(ballPos.z - this.position.z) > 1.1 + ballRadius) return res;
    if (ballPos.y + ballRadius < this.hemY) return res;      // passed underneath
    if (ballPos.y - ballRadius > this.beamY) return res;     // over the beam
    for (const b of this.bands) {
      if (Math.abs(ballPos.x - b.x) <= b.halfW + ballRadius * 0.7) { res.hit = true; return res; }
    }
    return res;
  }
}

/**
 * A standing ring across the road: the rim kills, the opening is safe.
 *
 * Where the banner says "not that high" and the deck hazards say "not that
 * low", this one names a single height and asks the player to hit it. It is the
 * only hazard in the game that can be passed by being *more* precise rather
 * than by avoiding a lane, which is what makes the bounce-height control worth
 * having.
 */
export class HaloRing extends Obstacle {
  private readonly innerR: number;
  private readonly outerR: number;
  private readonly thickness: number;
  private readonly centreY: number;
  private readonly baseX: number;
  private readonly drift: number;
  private readonly rate: number;
  private phase: number;
  private readonly ring: THREE.Group;

  constructor(
    x: number, centreY: number, z: number,
    innerR = 3.4, thickness = 0.85, drift = 0, rate = 1.1, phase = 0,
  ) {
    super();
    this.isLethal = true;
    this.innerR = innerR;
    this.outerR = innerR + thickness * 2;
    this.thickness = Math.max(0.9, thickness);
    this.centreY = centreY;
    this.baseX = x;
    this.drift = drift;
    this.rate = rate;
    this.phase = phase;

    this.hazardMinY = centreY - this.outerR;
    this.hazardMaxY = centreY + this.outerR;

    this.position.set(x, centreY, z);
    this.group.position.set(x, centreY, z);

    const giltMat = CelShaders.createCelMaterial({
      color: HEX.gilt, highlightColor: HEX.giltBright, rimColor: HEX.giltBright,
    });
    const lacquerMat = CelShaders.createCelMaterial({
      color: HEX.danger, highlightColor: HEX.dangerBright,
      rimColor: HEX.dangerBright, rimPower: 0.85, isEmissive: true,
    });

    this.ring = new THREE.Group();
    this.group.add(this.ring);

    // Lacquered torus with a gilt inner lip, so the safe opening is the part
    // that reads as gold and the lethal band is the part that reads as red.
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(innerR + thickness, thickness, 10, 28), lacquerMat);
    this.ring.add(torus);

    // Eight radial studs, which give the spin something to read against. Baked
    // into the lip's geometry: they rotate with the ring, never against it.
    const studParts: THREE.BufferGeometry[] = [
      new THREE.TorusGeometry(innerR, 0.16, 6, 30).toNonIndexed(),
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const g = new THREE.OctahedronGeometry(0.42).toNonIndexed();
      g.translate(Math.cos(a) * (innerR + thickness * 2), Math.sin(a) * (innerR + thickness * 2), 0);
      studParts.push(g);
    }
    const giltGeo = mergeGeometries(studParts, false);
    for (const g of studParts) g.dispose();
    if (giltGeo) this.ring.add(new THREE.Mesh(giltGeo, giltMat));
  }

  public update(delta: number): void {
    this.phase += this.rate * delta;
    this.ring.rotation.z += 0.55 * delta;
    if (this.drift !== 0) {
      const x = this.baseX + Math.sin(this.phase) * this.drift;
      this.position.x = x;
      this.group.position.x = x;
    }
  }

  public checkCollision(ballPos: THREE.Vector3, ballRadius: number): CollisionResult {
    const res = lethalResult();
    // Scaled off outerR, so a wider ring got a deeper kill volume even though
    // the band itself never changes thickness. On the one hazard in the game
    // that asks for precision, being killed two units after visibly passing
    // through reads as the ring cheating.
    if (Math.abs(ballPos.z - this.position.z) > this.thickness + ballRadius * 0.6) return res;
    const d = Math.hypot(ballPos.x - this.position.x, ballPos.y - this.centreY);
    // Lethal only in the band itself. Inside the opening, and outside the whole
    // ring, are both safe — the second is what stops it being an invisible wall.
    if (d >= this.innerR - ballRadius * 0.5 && d <= this.outerR + ballRadius * 0.5) res.hit = true;
    return res;
  }
}
