import * as THREE from 'three';
import { InstancePool } from '../rendering/InstancePool';
import { CelShaders } from '../rendering/CelShaders';
import { HEX } from '../rendering/Palette';
import { balustrade, bridgeSupportArch, squatPier } from '../rendering/Architecture';
import { CONSTANTS } from '../config/constants';

/**
 * The causeway the whole game happens on.
 *
 * The course was a chain of disconnected slabs, which is why it never read as
 * the thing the references are built around — a single lone bridge running out
 * into cloud. The playable decks still come and go with gaps between them,
 * because the gaps are the game; what was missing was the *structure* around
 * them, which in a real bridge is continuous even where the roadway is broken.
 *
 * So this runs the full length of the world regardless of where the decks are:
 * balustrades down both edges, arched supports underneath, and piers dropping
 * away into the mist. The deck gaps then read as a ruined span rather than as
 * platforms floating in unrelated air.
 *
 * Everything is instanced and recycled, so continuity costs four draw calls.
 */
export class BridgeSpine {
  readonly group = new THREE.Group();

  /** How far the structure runs before it recycles behind the player. */
  private static readonly SPAN = 900;
  /** Just outside the play corridor, so it frames without obstructing. */
  private static readonly EDGE = 23;

  private pools: InstancePool[] = [];
  private tracked: Array<{ pool: InstancePool; i: number }> = [];

  constructor() {
    const railMat = CelShaders.createStoneMaterial({
      color: HEX.alabaster, shadow: HEX.marbleDim, highlight: HEX.white,
      flutes: 10, veining: 0.24, courses: 1.6, sink: 26,
    });
    const archMat = CelShaders.createStoneMaterial({
      color: HEX.marbleDim, shadow: HEX.marbleShadow, highlight: HEX.marble,
      flutes: 5, veining: 0.34, courses: 0.5, sink: 26,
    });
    const pierMat = CelShaders.createStoneMaterial({
      color: HEX.marbleDeep, shadow: HEX.marbleShadow, highlight: HEX.marbleDim,
      flutes: 14, veining: 0.20, courses: 0.18, sink: 26,
    });

    const S = BridgeSpine.SPAN;
    const E = BridgeSpine.EDGE;

    // --- balustrades, continuous down both edges --------------------------
    const RUN = 30;
    const runs = Math.ceil(S / RUN);
    const rails = new InstancePool(balustrade(), railMat, runs * 2);
    for (let i = 0; i < runs; i++) {
      for (const side of [-1, 1]) {
        const k = rails.claim();
        // Slight overlap on Z so the run reads as one rail, not as segments.
        rails.set(k, side * E, -1.6, i * RUN, 2.2, 4.4, RUN + 0.6);
        this.tracked.push({ pool: rails, i: k });
      }
    }

    // --- arched supports under the roadway --------------------------------
    const ARCH = 46;
    const arches = Math.ceil(S / ARCH);
    const arch = new InstancePool(bridgeSupportArch(), archMat, arches);
    for (let i = 0; i < arches; i++) {
      const k = arch.claim();
      // Inverted and sunk, so the opening reads as the span between piers.
      arch.set(k, 0, -3.0, i * ARCH + ARCH * 0.5, E * 2.1, 26, 9, Math.PI, 0, 0);
      this.tracked.push({ pool: arch, i: k });
    }

    // --- piers falling away into the cloud --------------------------------
    const piers = new InstancePool(squatPier(), pierMat, arches * 2);
    for (let i = 0; i < arches; i++) {
      for (const side of [-1, 1]) {
        const k = piers.claim();
        piers.set(k, side * (E - 1.5), -76, i * ARCH + ARCH * 0.5, 4.8, 74, 4.8);
        this.tracked.push({ pool: piers, i: k });
      }
    }

    for (const p of [rails, arch, piers]) {
      p.flush();
      this.group.add(p.mesh);
      this.pools.push(p);
    }
  }

  update(playerZ: number): void {
    const S = BridgeSpine.SPAN;
    for (const t of this.tracked) {
      if (t.pool.getZ(t.i) < playerZ - 120) t.pool.offsetZ(t.i, S);
    }
    for (const p of this.pools) p.flush();
  }

  /**
   * Put the structure back under the player at the start of a run.
   *
   * update() only pushes instances forward, so after a long run the whole
   * causeway sits far ahead of a freshly-reset player and never returns. This
   * wraps by whole spans, which works in both directions.
   */
  reset(playerZ: number): void {
    const S = BridgeSpine.SPAN;
    const base = playerZ - 120;
    for (const t of this.tracked) {
      const z = t.pool.getZ(t.i);
      const k = Math.floor((z - base) / S);
      if (k !== 0) t.pool.offsetZ(t.i, -k * S);
    }
    for (const p of this.pools) p.flush();
  }

  dispose(): void {
    for (const p of this.pools) p.dispose();
    this.pools.length = 0;
  }
}

/** Kept for callers that want the corridor edge without importing the class. */
export const BRIDGE_EDGE = 18;
export const BRIDGE_SAFE_HALF_WIDTH = Math.min(CONSTANTS.MAX_COURSE_WIDTH, 17);
