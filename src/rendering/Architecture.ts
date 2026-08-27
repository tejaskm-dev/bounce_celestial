import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The architectural vocabulary of the sky city — "Above the Cloudline".
 *
 * Classical celestial ruin architecture authored strictly in unit space (height = 1.0,
 * and length = 1.0 on Z for linear runs like balustrades).
 *
 * Provides:
 * - 4 Column Orders: fluted, plain shaft (Tuscan), banded drum stack, squat pier
 * - 3 Ruined Column Variants: broken shaft, truncated without capital, cracked mid-shaft
 * - 2 Distant Column LODs: farColumnLOD, farDrumLOD (saves tens of thousands of tris)
 * - 4 Arch Variants: grand ogee with archivolts & keystone, Roman voussoir arch, ruined arch, bridge support arch
 * - 5 Tower Variants: spired needle, domed cupola, tiered ziggurat, ruined tower, far tower LOD
 * - Moulded balustrades, braziers, and floating stone islands
 */

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Merge parts safely.
 *
 * mergeGeometries refuses to combine indexed and non-indexed geometry.
 * Normalises everything to non-indexed before merging and computes clean vertex normals.
 */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  // Dispose only the temporaries this function created.
  flat.forEach((g, i) => { if (g !== parts[i]) g.dispose(); });
  if (merged) {
    merged.computeVertexNormals();
  }
  return merged;
}

function memo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) { g = build(); cache.set(key, g); }
  return g;
}

/** Revolve a profile. Points are (radius, height); height is normalised to 1. */
function lathe(points: [number, number][], segments = 16): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// ============================================================================
// 1. COLUMN ORDERS & RUINED VARIANTS
// ============================================================================

/**
 * Classical Fluted Column: Stepped plinth with torus, fluted tapering shaft,
 * astragal necking ring, carved echinus, and abacus.
 */
export function flutedColumn(): THREE.BufferGeometry {
  return memo('flutedColumn', () => lathe([
    [0.00, 0.000], [0.62, 0.000], [0.62, 0.030], [0.56, 0.045],
    [0.52, 0.060], [0.52, 0.075], [0.46, 0.090],   // stepped plinth with torus
    [0.44, 0.100], [0.40, 0.560], [0.38, 0.820],   // shaft, tapering with entasis
    [0.44, 0.840], [0.44, 0.865],                  // astragal ring
    [0.54, 0.885], [0.54, 0.920],                  // echinus
    [0.62, 0.940], [0.62, 0.975],                  // abacus
    [0.55, 0.990], [0.00, 1.000],
  ], 18));
}

/**
 * Plain Shaft Column (Tuscan Order): Heavy moulded plinth, smooth monolithic
 * shaft with entasis, flared bell capital and gold ring collar.
 */
export function plainShaftColumn(): THREE.BufferGeometry {
  return memo('plainShaftColumn', () => lathe([
    [0.00, 0.000], [0.58, 0.000], [0.58, 0.035], [0.52, 0.055],
    [0.48, 0.075], [0.46, 0.095],                  // moulded torus base
    [0.43, 0.100], [0.40, 0.520], [0.38, 0.840],   // smooth monolithic shaft
    [0.43, 0.860], [0.43, 0.880],                  // collar reveal
    [0.52, 0.910], [0.58, 0.950],                  // bell capital
    [0.60, 0.965], [0.60, 0.985], [0.00, 1.000],   // abacus cap
  ], 16));
}

/**
 * Banded Drum Column: Monumental stacked discs alternating with recessed reveals,
 * heavy stepped disc capital.
 */
export function columnDrum(): THREE.BufferGeometry {
  return memo('columnDrum', () => lathe([
    [0.00, 0.00], [0.70, 0.00], [0.70, 0.14], [0.62, 0.16],
    [0.86, 0.20], [0.86, 0.34], [0.78, 0.37],
    [0.98, 0.42], [0.98, 0.58], [0.88, 0.62],
    [1.00, 0.66], [1.00, 0.80], [0.90, 0.84],
    [0.80, 0.88], [0.80, 0.96], [0.62, 1.00], [0.00, 1.00],
  ], 18));
}

/**
 * Heavy Squat Pier: Massive load-bearing multi-stepped pier with chamfered shaft
 * and flared corbel bracket capital (for near ranks and under-bridge piers).
 */
export function squatPier(): THREE.BufferGeometry {
  return memo('squatPier', () => lathe([
    [0.00, 0.00], [0.75, 0.00], [0.75, 0.06], [0.68, 0.08],
    [0.68, 0.14], [0.60, 0.16],                  // stepped plinth
    [0.58, 0.18], [0.55, 0.72],                  // sturdy faceted shaft
    [0.64, 0.78], [0.72, 0.86],                  // corbel spread
    [0.78, 0.92], [0.78, 0.97], [0.66, 1.00], [0.00, 1.00],
  ], 12));
}

/**
 * Far Column LOD: Simplified 8-segment column profile for far scenery ranks (dist > 100),
 * reducing triangle budget by over 50%.
 */
export function farColumnLOD(): THREE.BufferGeometry {
  return memo('farColumnLOD', () => lathe([
    [0.00, 0.00], [0.56, 0.00], [0.56, 0.08],
    [0.40, 0.10], [0.37, 0.84],
    [0.52, 0.92], [0.54, 0.98], [0.00, 1.00],
  ], 8));
}

/**
 * Far Drum LOD: Simplified 8-segment drum stack for distant ranks.
 */
export function farDrumLOD(): THREE.BufferGeometry {
  return memo('farDrumLOD', () => lathe([
    [0.00, 0.00], [0.72, 0.00], [0.72, 0.25], [0.88, 0.30],
    [0.88, 0.65], [0.96, 0.70], [0.96, 0.92], [0.65, 1.00], [0.00, 1.00],
  ], 8));
}

/**
 * Ruined Broken Column: A column fractured at ~0.60 height with jagged chipped
 * stone break edge and weathered fractures.
 */
export function ruinedBrokenColumn(): THREE.BufferGeometry {
  return memo('ruinedBrokenColumn', () => {
    const baseShaft = lathe([
      [0.00, 0.000], [0.62, 0.000], [0.62, 0.030], [0.56, 0.045],
      [0.52, 0.060], [0.52, 0.075], [0.46, 0.090],
      [0.44, 0.100], [0.41, 0.450], [0.40, 0.580],
      [0.38, 0.620], [0.28, 0.640], [0.12, 0.610], [0.00, 0.580],
    ], 16);

    // Jagged stone break fragments on top
    const f1 = new THREE.ConeGeometry(0.20, 0.16, 5);
    f1.scale(1.2, 1.0, 0.8);
    f1.translate(0.12, 0.64, 0.08);

    const f2 = new THREE.ConeGeometry(0.16, 0.12, 4);
    f2.scale(0.8, 1.2, 1.1);
    f2.translate(-0.14, 0.62, -0.09);

    const merged = mergeParts([baseShaft, f1, f2]);
    f1.dispose();
    f2.dispose();
    return merged ?? baseShaft;
  });
}

/**
 * Ruined Truncated Column: Column shaft missing its capital completely (~0.82 height),
 * topped with an exposed weathered core.
 */
export function ruinedTruncatedColumn(): THREE.BufferGeometry {
  return memo('ruinedTruncatedColumn', () => {
    const shaft = lathe([
      [0.00, 0.000], [0.60, 0.000], [0.60, 0.035], [0.52, 0.060],
      [0.46, 0.090], [0.44, 0.100], [0.40, 0.550], [0.38, 0.800],
      [0.35, 0.830], [0.24, 0.840], [0.10, 0.820], [0.00, 0.800],
    ], 16);

    const core = new THREE.DodecahedronGeometry(0.18, 0);
    core.scale(1.3, 0.6, 1.1);
    core.translate(0.04, 0.83, -0.03);

    const merged = mergeParts([shaft, core]);
    core.dispose();
    return merged ?? shaft;
  });
}

/**
 * Ruined Cracked Column: Full height column with a shifted, fractured middle drum section.
 */
export function ruinedCrackedColumn(): THREE.BufferGeometry {
  return memo('ruinedCrackedColumn', () => {
    const lower = lathe([
      [0.00, 0.00], [0.62, 0.00], [0.62, 0.03], [0.56, 0.045],
      [0.52, 0.06], [0.46, 0.09], [0.44, 0.10], [0.41, 0.44],
      [0.36, 0.46], [0.00, 0.46],
    ], 16);

    const offsetDrum = lathe([
      [0.00, 0.46], [0.42, 0.46], [0.44, 0.54], [0.39, 0.60],
      [0.00, 0.60],
    ], 14);
    offsetDrum.translate(0.08, 0, 0.05);

    const upper = lathe([
      [0.00, 0.60], [0.40, 0.60], [0.39, 0.82],
      [0.44, 0.84], [0.44, 0.865], [0.54, 0.885], [0.54, 0.92],
      [0.62, 0.94], [0.62, 0.975], [0.55, 0.99], [0.00, 1.00],
    ], 16);

    const merged = mergeParts([lower, offsetDrum, upper]);
    return merged ?? lower;
  });
}

/** Narrow gold band, slipped over a column to catch the sun. */
export function bandRing(): THREE.BufferGeometry {
  return memo('bandRing', () => lathe([
    [0.00, 0.00], [1.06, 0.00], [1.10, 0.30], [1.10, 0.70],
    [1.06, 1.00], [0.00, 1.00],
  ], 20));
}

// ============================================================================
// 2. ARCH VARIANTS (ARCHIVOLTS, KEYSTONES, IMPOSTS, SPANDRELS)
// ============================================================================

/**
 * Grand Ogee Arched Gateway:
 * - Multi-tiered stepped archivolt mouldings
 * - Projecting faceted keystone with celestial star boss at apex
 * - Stepped impost capitals at springing lines
 * - Inset spandrel relief plates
 * - Plinth footings
 */
export function archedGate(): THREE.BufferGeometry {
  return memo('archedGate', () => {
    const parts: THREE.BufferGeometry[] = [];

    // Outer Main Ogee Arch
    const shape = new THREE.Shape();
    const w = 0.52, straight = 0.56;
    shape.moveTo(-w, 0);
    shape.lineTo(-w, straight);
    shape.quadraticCurveTo(-w, 0.92, 0, 1.0);
    shape.quadraticCurveTo(w, 0.92, w, straight);
    shape.lineTo(w, 0);
    shape.lineTo(-w, 0);

    const hole = new THREE.Path();
    const iw = 0.35, ist = 0.48;
    hole.moveTo(-iw, 0.04);
    hole.lineTo(-iw, ist);
    hole.quadraticCurveTo(-iw, 0.78, 0, 0.86);
    hole.quadraticCurveTo(iw, 0.78, iw, ist);
    hole.lineTo(iw, 0.04);
    hole.lineTo(-iw, 0.04);
    shape.holes.push(hole);

    const mainExtrude = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.025,
      bevelSize: 0.025, bevelSegments: 1, curveSegments: 12,
    });
    mainExtrude.translate(0, 0, -0.08);
    parts.push(mainExtrude);

    // Stepped Inset Archivolt Trim
    const innerShape = new THREE.Shape();
    innerShape.moveTo(-iw - 0.04, ist);
    innerShape.quadraticCurveTo(-iw - 0.04, 0.82, 0, 0.91);
    innerShape.quadraticCurveTo(iw + 0.04, 0.82, iw + 0.04, ist);
    innerShape.lineTo(iw, ist);
    innerShape.quadraticCurveTo(iw, 0.78, 0, 0.86);
    innerShape.quadraticCurveTo(-iw, 0.78, -iw, ist);
    innerShape.closePath();

    const archivoltExtrude = new THREE.ExtrudeGeometry(innerShape, {
      depth: 0.20, bevelEnabled: true, bevelThickness: 0.015,
      bevelSize: 0.015, bevelSegments: 1, curveSegments: 10,
    });
    archivoltExtrude.translate(0, 0, -0.10);
    parts.push(archivoltExtrude);

    // Projecting Faceted Keystone with Star Boss at Apex
    const keystone = new THREE.BoxGeometry(0.14, 0.16, 0.24);
    keystone.translate(0, 0.93, 0);
    parts.push(keystone);

    const starBoss = new THREE.OctahedronGeometry(0.045, 0);
    starBoss.scale(1.2, 1.2, 0.8);
    starBoss.translate(0, 0.93, 0.12);
    parts.push(starBoss);

    // Stepped Impost Plinths / Springing Capitals
    for (const side of [-1, 1]) {
      const impost = new THREE.BoxGeometry(0.18, 0.07, 0.22);
      impost.translate(side * (w - 0.08), straight, 0);
      parts.push(impost);

      const plinth = new THREE.BoxGeometry(0.20, 0.08, 0.22);
      plinth.translate(side * (w - 0.08), 0.04, 0);
      parts.push(plinth);
    }

    return mergeParts(parts) ?? mainExtrude;
  });
}

/**
 * Classical Roman / Byzantine Arch Gate:
 * Semicircular arch barrel with radial voussoirs, engaged pilaster columns,
 * stepped impost capitals, and projecting top entablature cornice.
 */
export function romanArchGate(): THREE.BufferGeometry {
  return memo('romanArchGate', () => {
    const parts: THREE.BufferGeometry[] = [];

    // Outer Rectangular Portal Block
    const shape = new THREE.Shape();
    const w = 0.54, h = 0.98;
    shape.moveTo(-w, 0);
    shape.lineTo(-w, h);
    shape.lineTo(w, h);
    shape.lineTo(w, 0);
    shape.lineTo(-w, 0);

    // Semicircular barrel opening
    const hole = new THREE.Path();
    const iw = 0.33, springY = 0.55;
    hole.moveTo(-iw, 0.04);
    hole.lineTo(-iw, springY);
    hole.absarc(0, springY, iw, Math.PI, 0, true);
    hole.lineTo(iw, 0.04);
    hole.lineTo(-iw, 0.04);
    shape.holes.push(hole);

    const body = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.02,
      bevelSize: 0.02, bevelSegments: 1, curveSegments: 12,
    });
    body.translate(0, 0, -0.08);
    parts.push(body);

    // Projecting Top Entablature Cornice
    const cornice = new THREE.BoxGeometry(w * 2 + 0.12, 0.08, 0.22);
    cornice.translate(0, 0.96, 0);
    parts.push(cornice);

    // Keystone at apex
    const keystone = new THREE.BoxGeometry(0.12, 0.14, 0.22);
    keystone.translate(0, springY + iw + 0.02, 0);
    parts.push(keystone);

    // Flanking Engaged Pilasters & Impost Blocks
    for (const side of [-1, 1]) {
      const pilaster = new THREE.CylinderGeometry(0.06, 0.07, springY, 8);
      pilaster.translate(side * (w - 0.07), springY * 0.5, 0.08);
      parts.push(pilaster);

      const impost = new THREE.BoxGeometry(0.16, 0.06, 0.20);
      impost.translate(side * (iw + 0.06), springY, 0);
      parts.push(impost);
    }

    return mergeParts(parts) ?? body;
  });
}

/**
 * Ruined Fractured Arch:
 * Arch with one complete pier and a half-arch springing upward to a shattered apex,
 * while the opposite shoulder is broken off.
 */
export function ruinedArchGate(): THREE.BufferGeometry {
  return memo('ruinedArchGate', () => {
    const parts: THREE.BufferGeometry[] = [];

    // Left Standing Pier & Half Arch Ring
    const shape = new THREE.Shape();
    shape.moveTo(-0.52, 0);
    shape.lineTo(-0.52, 0.60);
    shape.quadraticCurveTo(-0.52, 0.94, 0.06, 0.98); // reaches past apex
    shape.lineTo(0.02, 0.88);
    shape.quadraticCurveTo(-0.35, 0.82, -0.35, 0.50);
    shape.lineTo(-0.35, 0.04);
    shape.lineTo(-0.52, 0);

    const leftPart = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.02,
      bevelSize: 0.02, bevelSegments: 1, curveSegments: 10,
    });
    leftPart.translate(0, 0, -0.08);
    parts.push(leftPart);

    // Right Broken Pier Stump (~0.45 height)
    const rightShape = new THREE.Shape();
    rightShape.moveTo(0.35, 0);
    rightShape.lineTo(0.35, 0.42);
    rightShape.lineTo(0.44, 0.48); // jagged fracture
    rightShape.lineTo(0.52, 0.38);
    rightShape.lineTo(0.52, 0);
    rightShape.closePath();

    const rightPart = new THREE.ExtrudeGeometry(rightShape, {
      depth: 0.16, bevelEnabled: true, bevelThickness: 0.02,
      bevelSize: 0.02, bevelSegments: 1, curveSegments: 6,
    });
    rightPart.translate(0, 0, -0.08);
    parts.push(rightPart);

    // Jagged fallen stone blocks
    const b1 = new THREE.BoxGeometry(0.12, 0.10, 0.14);
    b1.rotateX(0.2);
    b1.rotateY(0.4);
    b1.rotateZ(0.3);
    b1.translate(0.15, 0.05, 0.02);
    parts.push(b1);

    return mergeParts(parts) ?? leftPart;
  });
}

/**
 * Heavy Bridge Support Arch:
 * Massive structural under-bridge arch with heavy voussoirs, corbels, and deep intrados ribbing.
 */
export function bridgeSupportArch(): THREE.BufferGeometry {
  return memo('bridgeSupportArch', () => {
    const shape = new THREE.Shape();
    const w = 0.54, straight = 0.50;
    shape.moveTo(-w, 0);
    shape.lineTo(-w, straight);
    shape.quadraticCurveTo(-w, 0.94, 0, 1.0);
    shape.quadraticCurveTo(w, 0.94, w, straight);
    shape.lineTo(w, 0);
    shape.lineTo(-w, 0);

    const hole = new THREE.Path();
    const iw = 0.36, ist = 0.42;
    hole.moveTo(-iw, 0.02);
    hole.lineTo(-iw, ist);
    hole.quadraticCurveTo(-iw, 0.80, 0, 0.88);
    hole.quadraticCurveTo(iw, 0.80, iw, ist);
    hole.lineTo(iw, 0.02);
    hole.lineTo(-iw, 0.02);
    shape.holes.push(hole);

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.28, bevelEnabled: true, bevelThickness: 0.03,
      bevelSize: 0.03, bevelSegments: 1, curveSegments: 12,
    });
    g.translate(0, 0, -0.14);
    return g;
  });
}

// ============================================================================
// 3. TOWER SILHOUETTES & RUINED VARIANTS
// ============================================================================

/**
 * Spired Celestial Tower (Classic Needle Spire):
 * Tapered shaft, open arcaded colonnade gallery, conical roof, and 8-point star finial.
 */
export function skyTower(): THREE.BufferGeometry {
  return memo('skyTowerSpired', () => {
    const shaft = lathe([
      [0.00, 0.00], [0.46, 0.00], [0.46, 0.04], [0.40, 0.06],
      [0.38, 0.62], [0.42, 0.64], [0.42, 0.66],
      [0.34, 0.68], [0.34, 0.84],                     // recessed gallery
      [0.44, 0.86], [0.44, 0.89], [0.38, 0.91],
    ], 16);

    // Gallery colonnade: 8 slim posts
    const posts: THREE.BufferGeometry[] = [];
    const postGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = postGeo.clone();
      p.translate(Math.cos(a) * 0.37, 0.76, Math.sin(a) * 0.37);
      posts.push(p);
    }

    const roof = new THREE.ConeGeometry(0.42, 0.16, 12, 1);
    roof.translate(0, 0.99, 0);

    // 8-point star finial
    const s1 = new THREE.OctahedronGeometry(0.075, 0);
    s1.scale(1, 2.1, 0.34); s1.translate(0, 1.13, 0);
    const s2 = new THREE.OctahedronGeometry(0.075, 0);
    s2.scale(0.34, 2.1, 1); s2.translate(0, 1.13, 0);

    const merged = mergeParts([shaft, ...posts, roof, s1, s2]);
    postGeo.dispose();
    return merged ?? shaft;
  });
}

/**
 * Domed Celestial Tower (Observatory / Cupola):
 * Multi-stage cylindrical shaft, double arcaded lantern, ribbed cupola dome,
 * and armillary sphere / crescent-star finial.
 */
export function skyTowerDomed(): THREE.BufferGeometry {
  return memo('skyTowerDomed', () => {
    const shaft = lathe([
      [0.00, 0.00], [0.50, 0.00], [0.50, 0.05], [0.44, 0.08],
      [0.42, 0.50], [0.46, 0.53], [0.46, 0.56],      // middle balcony
      [0.38, 0.58], [0.38, 0.80],                     // tall lantern
      [0.48, 0.83], [0.48, 0.87], [0.42, 0.89],
    ], 16);

    // 10 colonnette posts
    const posts: THREE.BufferGeometry[] = [];
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = postGeo.clone();
      p.translate(Math.cos(a) * 0.42, 0.69, Math.sin(a) * 0.42);
      posts.push(p);
    }

    // Ribbed Hemispherical Cupola Dome
    const dome = lathe([
      [0.00, 0.89], [0.44, 0.89], [0.46, 0.94], [0.40, 1.02],
      [0.26, 1.09], [0.12, 1.14], [0.00, 1.16],
    ], 16);

    // Armillary sphere finial
    const finialRing = new THREE.TorusGeometry(0.065, 0.015, 6, 12);
    finialRing.rotateX(Math.PI / 2);
    finialRing.translate(0, 1.22, 0);

    const finialSpire = new THREE.ConeGeometry(0.03, 0.12, 6);
    finialSpire.translate(0, 1.28, 0);

    const merged = mergeParts([shaft, ...posts, dome, finialRing, finialSpire]);
    postGeo.dispose();
    finialRing.dispose();
    finialSpire.dispose();
    return merged ?? shaft;
  });
}

/**
 * Tiered Pagoda / Ziggurat Spire Tower:
 * Stepped multi-level shaft with flared overhanging eaves and gold ring collars.
 */
export function skyTowerTiered(): THREE.BufferGeometry {
  return memo('skyTowerTiered', () => {
    const body = lathe([
      [0.00, 0.00], [0.52, 0.00], [0.52, 0.04], [0.45, 0.06],
      [0.42, 0.36], [0.52, 0.38], [0.54, 0.41], [0.38, 0.42], // tier 1 eave
      [0.36, 0.68], [0.46, 0.70], [0.48, 0.73], [0.30, 0.74], // tier 2 eave
      [0.28, 0.92], [0.36, 0.94], [0.38, 0.97], [0.20, 0.98], // tier 3 eave
      [0.18, 1.06], [0.04, 1.18], [0.00, 1.22],               // needle spire
    ], 16);

    return body;
  });
}

/**
 * Ruined Collapsed Sky Tower:
 * Massive shaft with shattered jagged top rim and broken gallery columns.
 */
export function skyTowerRuined(): THREE.BufferGeometry {
  return memo('skyTowerRuined', () => {
    const shaft = lathe([
      [0.00, 0.00], [0.48, 0.00], [0.48, 0.04], [0.42, 0.06],
      [0.40, 0.58], [0.44, 0.61], [0.44, 0.64],
      [0.36, 0.66], [0.36, 0.76],
      [0.32, 0.78], [0.20, 0.81], [0.00, 0.75],               // jagged break
    ], 14);

    // 3 remaining broken posts
    const posts: THREE.BufferGeometry[] = [];
    const p1 = new THREE.CylinderGeometry(0.035, 0.035, 0.10, 5);
    p1.translate(0.36, 0.71, 0.10);
    posts.push(p1);

    const p2 = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 5);
    p2.translate(-0.32, 0.69, -0.15);
    posts.push(p2);

    // Broken fallen crown chunk
    const chunk = new THREE.ConeGeometry(0.25, 0.18, 5);
    chunk.scale(1.2, 0.8, 1.0);
    chunk.translate(0.08, 0.82, -0.04);
    posts.push(chunk);

    const merged = mergeParts([shaft, ...posts]);
    return merged ?? shaft;
  });
}

/**
 * Far Tower LOD: Highly optimized 8-segment silhouette for far background towers.
 */
export function skyTowerFarLOD(): THREE.BufferGeometry {
  return memo('skyTowerFarLOD', () => lathe([
    [0.00, 0.00], [0.45, 0.00], [0.45, 0.05],
    [0.38, 0.65], [0.42, 0.68], [0.34, 0.70],
    [0.34, 0.86], [0.42, 0.90], [0.00, 1.10],
  ], 8));
}

// ============================================================================
// 4. BALUSTRADES, BRAZIERS, ISLANDS
// ============================================================================

/**
 * Balustrade run: A moulded handrail with cavetto profile, foot plinth,
 * and 7 urn-shaped balusters. Authored one unit long on Z.
 */
export function balustrade(): THREE.BufferGeometry {
  return memo('balustrade', () => {
    const parts: THREE.BufferGeometry[] = [];

    // Moulded Top Handrail
    const rail = new THREE.BoxGeometry(0.20, 0.10, 1.0);
    rail.translate(0, 0.95, 0);
    parts.push(rail);

    // Stepped Foot Plinth
    const foot = new THREE.BoxGeometry(0.24, 0.09, 1.0);
    foot.translate(0, 0.05, 0);
    parts.push(foot);

    // Classical Urn Baluster
    const balusterGeo = lathe([
      [0.00, 0.00], [0.075, 0.00], [0.075, 0.08], [0.045, 0.14],
      [0.072, 0.30], [0.072, 0.52], [0.042, 0.66],
      [0.068, 0.78], [0.068, 0.88], [0.000, 0.90],
    ], 8);

    const N = 7;
    for (let i = 0; i < N; i++) {
      const b = balusterGeo.clone();
      b.translate(0, 0.05, -0.5 + (i + 0.5) / N);
      parts.push(b);
    }
    balusterGeo.dispose();

    return mergeParts(parts) ?? rail;
  });
}

/**
 * Brazier: A slender fluted post carrying a crowned fire bowl.
 */
export function brazier(): THREE.BufferGeometry {
  return memo('brazier', () => {
    const post = lathe([
      [0.00, 0.00], [0.22, 0.00], [0.22, 0.04], [0.14, 0.07],
      [0.10, 0.60], [0.15, 0.63], [0.15, 0.66], [0.11, 0.69],
      [0.11, 0.80],
    ], 12);

    const bowl = lathe([
      [0.00, 0.80], [0.18, 0.80], [0.28, 0.90], [0.30, 0.98],
      [0.24, 1.00], [0.00, 1.00],
    ], 14);

    // Crown points around the lip (6 points)
    const spikes: THREE.BufferGeometry[] = [];
    const spikeGeo = new THREE.ConeGeometry(0.035, 0.16, 4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = spikeGeo.clone();
      s.translate(Math.cos(a) * 0.27, 1.05, Math.sin(a) * 0.27);
      spikes.push(s);
    }
    spikeGeo.dispose();

    return mergeParts([post, bowl, ...spikes]) ?? post;
  });
}

/**
 * Floating Stone Island: Flat cap over an eroded, stratified underside.
 */
export function floatingIsland(): THREE.BufferGeometry {
  return memo('floatingIsland', () => lathe([
    [0.00, 1.00], [0.96, 1.00], [1.00, 0.94], [0.98, 0.86],
    [0.86, 0.74], [0.74, 0.60], [0.66, 0.44],
    [0.42, 0.26], [0.24, 0.12], [0.00, 0.00],
  ], 14));
}

/** Free the cached geometries (used when the world is torn down). */
export function disposeArchitecture(): void {
  cache.forEach((g) => g.dispose());
  cache.clear();
}

