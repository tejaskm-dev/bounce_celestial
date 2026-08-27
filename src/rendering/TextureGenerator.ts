import * as THREE from 'three';
import { HEX, hexCss } from './Palette';

/**
 * Procedural Canvas Texture Generator — "Above the Cloudline"
 * Generates high-fidelity carved stone, celestial inscriptions, and architectural textures
 * using 100% code-based canvas rendering and the strict palette grammar.
 */
export class TextureGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  /**
   * Stitched Button-Eye Ball Face Decal
   */
  public static getBallFaceTexture(style: string = 'button_smile', expression: 'normal' | 'squint' = 'normal'): THREE.CanvasTexture {
    const key = `face_${style}_${expression}_v4`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, size, size);

    const eyeY = 215;
    const eyeSpacing = 95;
    const eyeRadius = 40;

    // 1. Cheek Blushes (tinted with blush)
    ctx.fillStyle = 'rgba(201, 154, 160, 0.65)';
    ctx.beginPath();
    ctx.ellipse(size / 2 - 120, eyeY + 65, 34, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(size / 2 + 120, eyeY + 65, 34, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Button Eyes with Stitched 'X's
    const eyeLeftX = size / 2 - eyeSpacing;
    const eyeRightX = size / 2 + eyeSpacing;

    const drawButtonEye = (cx: number, cy: number) => {
      // Button Base
      ctx.fillStyle = hexCss(HEX.ink);
      ctx.beginPath();
      ctx.arc(cx, cy, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      // Outer Inset Ring
      ctx.strokeStyle = hexCss(HEX.marbleDim);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, eyeRadius - 6, 0, Math.PI * 2);
      ctx.stroke();

      // White Stitched 'X' in center
      ctx.strokeStyle = hexCss(HEX.white);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      const crossSize = 14;

      ctx.beginPath();
      ctx.moveTo(cx - crossSize, cy - crossSize);
      ctx.lineTo(cx + crossSize, cy + crossSize);
      ctx.moveTo(cx + crossSize, cy - crossSize);
      ctx.lineTo(cx - crossSize, cy + crossSize);
      ctx.stroke();

      // Top-Left Glint Dot
      ctx.fillStyle = hexCss(HEX.white);
      ctx.beginPath();
      ctx.arc(cx - eyeRadius * 0.45, cy - eyeRadius * 0.45, 6, 0, Math.PI * 2);
      ctx.fill();
    };

    if (expression === 'squint') {
      ctx.strokeStyle = hexCss(HEX.ink);
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.arc(eyeLeftX, eyeY + 5, 30, Math.PI * 0.9, Math.PI * 2.1, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(eyeRightX, eyeY + 5, 30, Math.PI * 0.9, Math.PI * 2.1, false);
      ctx.stroke();
    } else {
      drawButtonEye(eyeLeftX, eyeY);
      drawButtonEye(eyeRightX, eyeY);
    }

    // 3. Cute Stitched Smile
    ctx.strokeStyle = hexCss(HEX.ink);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(size / 2, eyeY + 30, 48, 0.12 * Math.PI, 0.88 * Math.PI, false);
    ctx.stroke();

    // Smile corner dimples
    ctx.beginPath();
    ctx.moveTo(size / 2 - 44, eyeY + 60);
    ctx.lineTo(size / 2 - 48, eyeY + 48);
    ctx.moveTo(size / 2 + 44, eyeY + 60);
    ctx.lineTo(size / 2 + 48, eyeY + 48);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Track Platform Carved Stone Tile — "Above the Cloudline"
   * Real carved celestial alabaster panel:
   * - Key-fret / Greek meander border in engraved gold & slate shadow
   * - Masonry course joints with bevelled highlights
   * - Central worn astrolabe star-chart inscription & glyph ribbon
   * - Inset 8-point gold celestial star rosettes
   */

  /**
   * Tileable fBm noise, baked once.
   *
   * The stone and sky shaders were evaluating value noise per pixel — up to
   * ~220 hash operations per fragment across the sky, and ~48 on every column
   * surface. On overlapping full-screen geometry that put the frame at 130ms.
   * A single texture fetch replaces the whole octave stack, and the result is
   * visually identical because none of it was animated in the first place.
   */
  private static noiseTex: THREE.DataTexture | null = null;
  public static getNoiseTexture(): THREE.DataTexture {
    if (this.noiseTex) return this.noiseTex;

    const S = 256;
    const data = new Uint8Array(S * S * 4);

    // Value noise on a wrapping lattice, so the texture tiles seamlessly.
    const lattice: number[][] = [];
    const P = 32;
    for (let y = 0; y < P; y++) {
      lattice[y] = [];
      for (let x = 0; x < P; x++) lattice[y][x] = Math.random();
    }
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const sample = (fx: number, fy: number, freq: number) => {
      const gx = fx * freq, gy = fy * freq;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = smooth(gx - x0), ty = smooth(gy - y0);
      const wrap = (v: number) => ((v % P) + P) % P;
      const a = lattice[wrap(y0)][wrap(x0)], b = lattice[wrap(y0)][wrap(x0 + 1)];
      const c = lattice[wrap(y0 + 1)][wrap(x0)], d = lattice[wrap(y0 + 1)][wrap(x0 + 1)];
      return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    };

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        // R: 4-octave fBm (marble veining, cloud body)
        let f = 0, amp = 0.5, freq = 4;
        for (let o = 0; o < 4; o++) { f += amp * sample(u, v, freq); freq *= 2; amp *= 0.5; }
        // G: 3-octave billow (puffy cumulus lobes)
        let b = 0; amp = 0.5; freq = 3;
        for (let o = 0; o < 3; o++) { b += amp * (1 - Math.abs(sample(u, v, freq) * 2 - 1)); freq *= 2.07; amp *= 0.5; }
        // B: single low frequency, for broad drift
        const l = sample(u, v, 2);
        const i = (y * S + x) * 4;
        data[i] = Math.max(0, Math.min(255, f * 255));
        data[i + 1] = Math.max(0, Math.min(255, b * 255));
        data[i + 2] = Math.max(0, Math.min(255, l * 255));
        data[i + 3] = 255;
      }
    }

    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    this.noiseTex = tex;
    return tex;
  }

  public static getComicTileTexture(): THREE.CanvasTexture {
    const key = 'celestial_carved_deck_v5';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Base Alabaster Stone Slab
    ctx.fillStyle = hexCss(HEX.alabaster);
    ctx.fillRect(0, 0, size, size);

    // Micro-stippled stone grain
    ctx.fillStyle = hexCss(HEX.alabasterDim);
    for (let i = 0; i < 6000; i++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const rw = 1 + Math.random() * 2.5;
      ctx.fillRect(rx, ry, rw, rw * 0.8);
    }

    // 2. Masonry Course Inset Panels (2x2 major course blocks)
    const margin = 28;
    const midX = size / 2;
    const midY = size / 2;
    const seamW = 6;

    // Course panel backgrounds
    const drawBlock = (x0: number, y0: number, w: number, h: number, toneHex: number) => {
      ctx.fillStyle = hexCss(toneHex);
      ctx.fillRect(x0, y0, w, h);

      // Deep crevice shadow
      ctx.strokeStyle = hexCss(HEX.marbleShadow);
      ctx.lineWidth = 3;
      ctx.strokeRect(x0, y0, w, h);

      // Lit bevel top/left
      ctx.strokeStyle = hexCss(HEX.white);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, y0 + h - 2);
      ctx.lineTo(x0 + 2, y0 + 2);
      ctx.lineTo(x0 + w - 2, y0 + 2);
      ctx.stroke();
    };

    drawBlock(margin, margin, midX - margin - seamW, midY - margin - seamW, HEX.tilePale);
    drawBlock(midX + seamW, margin, midX - margin - seamW, midY - margin - seamW, HEX.tileWarm);
    drawBlock(margin, midY + seamW, midX - margin - seamW, midY - margin - seamW, HEX.tileWarm);
    drawBlock(midX + seamW, midY + seamW, midX - margin - seamW, midY - margin - seamW, HEX.tilePale);

    // 3. Greek Key / Meander Fretwork Border
    // Outer fret track
    const fretPad = 48;
    const fretW = size - fretPad * 2;
    const fretH = size - fretPad * 2;

    ctx.save();
    ctx.strokeStyle = hexCss(HEX.giltDeep);
    ctx.lineWidth = 4;
    ctx.strokeRect(fretPad, fretPad, fretW, fretH);

    ctx.strokeStyle = hexCss(HEX.gilt);
    ctx.lineWidth = 2;
    ctx.strokeRect(fretPad + 8, fretPad + 8, fretW - 16, fretH - 16);

    // Draw stepped meander along horizontal and vertical borders
    const step = 32;
    ctx.strokeStyle = hexCss(HEX.gilt);
    ctx.lineWidth = 3;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    // Top & bottom meander run
    for (let x = fretPad + 24; x < size - fretPad - 24; x += step) {
      // Top
      ctx.beginPath();
      ctx.moveTo(x, fretPad + 2);
      ctx.lineTo(x + step * 0.75, fretPad + 2);
      ctx.lineTo(x + step * 0.75, fretPad + 14);
      ctx.lineTo(x + step * 0.35, fretPad + 14);
      ctx.lineTo(x + step * 0.35, fretPad + 8);
      ctx.stroke();

      // Bottom
      ctx.beginPath();
      ctx.moveTo(x, size - fretPad - 2);
      ctx.lineTo(x + step * 0.75, size - fretPad - 2);
      ctx.lineTo(x + step * 0.75, size - fretPad - 14);
      ctx.lineTo(x + step * 0.35, size - fretPad - 14);
      ctx.lineTo(x + step * 0.35, size - fretPad - 8);
      ctx.stroke();
    }

    // Left & right meander run
    for (let y = fretPad + 24; y < size - fretPad - 24; y += step) {
      // Left
      ctx.beginPath();
      ctx.moveTo(fretPad + 2, y);
      ctx.lineTo(fretPad + 14, y);
      ctx.lineTo(fretPad + 14, y + step * 0.75);
      ctx.lineTo(fretPad + 8, y + step * 0.75);
      ctx.lineTo(fretPad + 8, y + step * 0.35);
      ctx.stroke();

      // Right
      ctx.beginPath();
      ctx.moveTo(size - fretPad - 2, y);
      ctx.lineTo(size - fretPad - 14, y);
      ctx.lineTo(size - fretPad - 14, y + step * 0.75);
      ctx.lineTo(size - fretPad - 8, y + step * 0.75);
      ctx.lineTo(size - fretPad - 8, y + step * 0.35);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Central Astrolabe / Celestial Star-Chart Inscription (Direction of travel)
    const drawAstrolabeCenter = (cx: number, cy: number, radius: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Concentric astronomical rings
      ctx.strokeStyle = hexCss(HEX.inkFaint);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = hexCss(HEX.gilt);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = hexCss(HEX.inkSoft);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      // Radial dial ticks (16 celestial divisions)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r1 = i % 4 === 0 ? radius * 0.72 : radius * 0.85;
        ctx.strokeStyle = i % 4 === 0 ? hexCss(HEX.giltDeep) : hexCss(HEX.inkFaint);
        ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.stroke();
      }

      // Crossed orbital axes
      ctx.strokeStyle = hexCss(HEX.giltDeep);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-radius * 1.15, 0);
      ctx.lineTo(radius * 1.15, 0);
      ctx.moveTo(0, -radius * 1.15);
      ctx.lineTo(0, radius * 1.15);
      ctx.stroke();

      // 8-pointed gold star in center
      drawStar8(0, 0, radius * 0.38, radius * 0.14);

      ctx.restore();
    };

    // 8-Point Faceted Celestial Star Rosette
    const drawStar8 = (cx: number, cy: number, outerR: number, innerR: number) => {
      ctx.save();
      ctx.translate(cx, cy);

      // Gold facet fill
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const aMid = a0 + Math.PI / 8;
        const a1 = a0 + Math.PI / 4;

        // Lit facet
        ctx.fillStyle = i % 2 === 0 ? hexCss(HEX.giltBright) : hexCss(HEX.gilt);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a0) * outerR, Math.sin(a0) * outerR);
        ctx.lineTo(Math.cos(aMid) * innerR, Math.sin(aMid) * innerR);
        ctx.closePath();
        ctx.fill();

        // Shadow facet
        ctx.fillStyle = i % 2 === 0 ? hexCss(HEX.gilt) : hexCss(HEX.giltDeep);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(aMid) * innerR, Math.sin(aMid) * innerR);
        ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
        ctx.closePath();
        ctx.fill();
      }

      // Center gold jewel / boss
      ctx.fillStyle = hexCss(HEX.giltShine);
      ctx.beginPath();
      ctx.arc(0, 0, innerR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexCss(HEX.giltDeep);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    };

    // Draw central astrolabes (two rhythm nodes along Z)
    drawAstrolabeCenter(midX, size * 0.28, 115);
    drawAstrolabeCenter(midX, size * 0.72, 115);

    // 5. Connecting Celestial Axis Lines & Inscriptions
    ctx.strokeStyle = hexCss(HEX.gilt);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(midX, fretPad + 20);
    ctx.lineTo(midX, size * 0.28 - 130);
    ctx.moveTo(midX, size * 0.28 + 130);
    ctx.lineTo(midX, size * 0.72 - 130);
    ctx.moveTo(midX, size * 0.72 + 130);
    ctx.lineTo(midX, size - fretPad - 20);
    ctx.stroke();

    // 6. Corner Star Rosettes
    const cornerOffset = fretPad + 46;
    drawStar8(cornerOffset, cornerOffset, 32, 12);
    drawStar8(size - cornerOffset, cornerOffset, 32, 12);
    drawStar8(cornerOffset, size - cornerOffset, 32, 12);
    drawStar8(size - cornerOffset, size - cornerOffset, 32, 12);

    // 7. Outer Carved Frame & Seam Groove
    ctx.strokeStyle = hexCss(HEX.marbleShadow);
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, size - 8, size - 8);

    ctx.strokeStyle = hexCss(HEX.white);
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, size - 20, size - 20);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * High-Visibility Diagonal Hazard Stripe Texture — "Above the Cloudline"
   * Pure Lacquer Crimson (danger) & Obsidian Void with carved stone border.
   */
  public static getHazardTexture(): THREE.CanvasTexture {
    const key = 'hazard_stripes_v4';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Void background
    ctx.fillStyle = hexCss(HEX.voidDeep);
    ctx.fillRect(0, 0, size, size);

    // Diagonal Lacquer Crimson Warning Stripes
    ctx.fillStyle = hexCss(HEX.danger);
    const stripeW = 48;
    for (let x = -size; x < size * 2; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x + stripeW + size, size);
      ctx.lineTo(x + size, size);
      ctx.closePath();
      ctx.fill();

      // Top highlight edge on crimson stripe
      ctx.fillStyle = hexCss(HEX.dangerBright);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x + 6 + size, size);
      ctx.lineTo(x + size, size);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexCss(HEX.danger);
    }

    // Carved Frame & Inset Rivet Accents
    ctx.strokeStyle = hexCss(HEX.void);
    ctx.lineWidth = 18;
    ctx.strokeRect(0, 0, size, size);

    ctx.strokeStyle = hexCss(HEX.voidRim);
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    // Gold Corner Bosses
    const rivets = [
      [24, 24], [size - 24, 24], [24, size - 24], [size - 24, size - 24],
    ];
    rivets.forEach(([rx, ry]) => {
      ctx.fillStyle = hexCss(HEX.gilt);
      ctx.beginPath();
      ctx.arc(rx, ry, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hexCss(HEX.giltBright);
      ctx.beginPath();
      ctx.arc(rx - 2, ry - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Concentric Celestial Target Bullseye Texture
   * Blush machinery disc with gold inlay rings, 8-point compass starburst, and astrolabe markings.
   */
  public static getBounceTargetTexture(): THREE.CanvasTexture {
    const key = 'target_bullseye_v4';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    // Outer Gilt Bevel Ring
    ctx.fillStyle = hexCss(HEX.gilt);
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hexCss(HEX.giltBright);
    ctx.beginPath();
    ctx.arc(cx, cy, 232, 0, Math.PI * 2);
    ctx.fill();

    // Astrolabe Dial Ticks
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const r0 = i % 4 === 0 ? 210 : 222;
      ctx.strokeStyle = hexCss(HEX.giltDeep);
      ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * 232, cy + Math.sin(a) * 232);
      ctx.stroke();
    }

    // Middle Blush Machinery Ring
    ctx.fillStyle = hexCss(HEX.blush);
    ctx.beginPath();
    ctx.arc(cx, cy, 206, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexCss(HEX.blushDeep);
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner Alabaster Disc
    ctx.fillStyle = hexCss(HEX.alabaster);
    ctx.beginPath();
    ctx.arc(cx, cy, 140, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexCss(HEX.gilt);
    ctx.lineWidth = 4;
    ctx.stroke();

    // Gold Center Core with 8-Point Compass Star
    ctx.fillStyle = hexCss(HEX.gilt);
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hexCss(HEX.giltBright);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const a1 = a0 + Math.PI / 8;
      const a2 = a0 + Math.PI / 4;
      const rOut = i % 2 === 0 ? 115 : 85;
      const rIn = 40;

      ctx.fillStyle = i % 2 === 0 ? hexCss(HEX.giltBright) : hexCss(HEX.giltShine);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * rOut, cy + Math.sin(a0) * rOut);
      ctx.lineTo(cx + Math.cos(a1) * rIn, cy + Math.sin(a1) * rIn);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = hexCss(HEX.giltDeep);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a1) * rIn, cy + Math.sin(a1) * rIn);
      ctx.lineTo(cx + Math.cos(a2) * rOut, cy + Math.sin(a2) * rOut);
      ctx.closePath();
      ctx.fill();
    }

    // Center jewel
    ctx.fillStyle = hexCss(HEX.white);
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    // Crosshairs
    ctx.strokeStyle = hexCss(HEX.inkSoft);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 230, cy);
    ctx.lineTo(cx - 85, cy);
    ctx.moveTo(cx + 85, cy);
    ctx.lineTo(cx + 230, cy);
    ctx.moveTo(cx, cy - 230);
    ctx.lineTo(cx, cy - 85);
    ctx.moveTo(cx, cy + 85);
    ctx.lineTo(cx, cy + 230);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Enclosed Celestial Vaulted Tunnel Wall Texture
   */
  public static getTunnelWallTexture(): THREE.CanvasTexture {
    const key = 'tunnel_wall_tex_v5';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Marble Deep Base
    ctx.fillStyle = hexCss(HEX.marbleDeep);
    ctx.fillRect(0, 0, size, size);

    // Stepped Ashlar Masonry Courses
    ctx.fillStyle = hexCss(HEX.marbleDim);
    ctx.fillRect(8, 8, size - 16, size / 2 - 14);
    ctx.fillRect(8, size / 2 + 8, size - 16, size / 2 - 16);

    // Fluted Vertical Pilaster Ribs
    ctx.strokeStyle = hexCss(HEX.marbleShadow);
    ctx.lineWidth = 3;
    for (let x = 32; x < size; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    // Gilded Entablature & String Courses
    ctx.fillStyle = hexCss(HEX.gilt);
    ctx.fillRect(0, size / 2 - 6, size, 12);
    ctx.fillStyle = hexCss(HEX.giltBright);
    ctx.fillRect(0, size / 2 - 3, size, 4);

    // Soft Slate Seams
    ctx.strokeStyle = hexCss(HEX.ink);
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, size, size);
    ctx.strokeRect(8, 8, size - 16, size / 2 - 14);
    ctx.strokeRect(8, size / 2 + 8, size - 16, size / 2 - 16);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 12);
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * 4-Point Anime Comic Starburst Particle
   */
  public static getStarburstParticleTexture(): THREE.CanvasTexture {
    const key = 'starburst_particle_v4';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // 4-Point Star in Gilt / Sun
    ctx.fillStyle = hexCss(HEX.white);
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.quadraticCurveTo(cx, cy, size - 4, cy);
    ctx.quadraticCurveTo(cx, cy, cx, size - 4);
    ctx.quadraticCurveTo(cx, cy, 4, cy);
    ctx.quadraticCurveTo(cx, cy, cx, 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hexCss(HEX.giltBright);
    ctx.lineWidth = 4;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    this.cache.set(key, tex);
    return tex;
  }

  /**
   * Celestial Diamond Sparkle Particle Texture
   */
  public static getDiamondParticleTexture(): THREE.CanvasTexture {
    const key = 'diamond_particle_v4';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Outer Gilt Diamond
    ctx.fillStyle = hexCss(HEX.giltBright);
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(size - 10, cy);
    ctx.lineTo(cx, size - 10);
    ctx.lineTo(10, cy);
    ctx.closePath();
    ctx.fill();

    // Inner White Core
    ctx.fillStyle = hexCss(HEX.white);
    ctx.beginPath();
    ctx.moveTo(cx, 32);
    ctx.lineTo(size - 32, cy);
    ctx.lineTo(cx, size - 32);
    ctx.lineTo(32, cy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = hexCss(HEX.giltDeep);
    ctx.lineWidth = 3;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    this.cache.set(key, tex);
    return tex;
  }
}
