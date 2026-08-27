/**
 * Course fairness probe.
 *
 * Scans the generated course for holes with no standable floor, and for
 * slices that lethal hazards have sealed shut. Both are unwinnable states,
 * and both used to be common: run this after touching generation.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('pageerror', e => console.error('[ERR]', e.message));
await page.goto('http://127.0.0.1:5180', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const map = await page.evaluate(() => {
  const g = window.__BOUNCE_GAME__;
  const W = 14.5, STEP = 1;
  // The course is now ~19,000 units. At DZ=1 the reachability DP is over 100M
  // lane transitions; DZ=2 halves the grid in both the sweep and the hop
  // window, which is a 4x saving for a resolution still finer than the ball.
  const Z0 = 0, Z1 = 15400, DZ = 2;
  const LANES = Math.round((W * 2) / 0.5) + 1;
  const laneX = (i) => -W + i * 0.5;
  const nz = Math.floor((Z1 - Z0) / DZ);

  // --- walk the whole course ------------------------------------------------
  // The generator only keeps a handful of segments alive around the player, so
  // sampling once at spawn reads about 400 units and everything past that looks
  // like a hole. This drives the course forward the way a run does — advancing
  // the player, feeding it the speed and difficulty it would really have at
  // that point — and samples each slice while it is still resident.
  const floor = [];
  for (let zi = 0; zi < nz; zi++) floor.push(new Uint8Array(LANES));
  const sampled = new Uint8Array(nz);

  // Mirrors config/Difficulty.ts. The probe has to walk the course with the
  // same speed and difficulty a real run would have at each point, or it
  // validates a course nobody plays.
  const CURVE = [[0,0],[0.10,0.08],[0.25,0.26],[0.45,0.52],[0.65,0.75],[0.85,0.92],[1,1]];
  const dAt = (p) => {
    const q = p <= 0 ? 0 : p >= 1 ? 1 : p;
    for (let i = 1; i < CURVE.length; i++) {
      const [p1, d1] = CURVE[i];
      if (q > p1) continue;
      const [p0, d0] = CURVE[i - 1];
      return d0 + (d1 - d0) * ((q - p0) / (p1 - p0));
    }
    return 1;
  };
  const SPEED = [28, 82];
  let t = 0, pz = -60, lastSpeed = SPEED[0];
  const LEAD_LO = 30, LEAD_HI = 130;       // generated, and not yet recycled

  while (pz < Z1 + 40) {
    const difficulty = dAt(pz / Z1);
    const speed = SPEED[0] + (SPEED[1] - SPEED[0]) * difficulty;
    lastSpeed = speed;
    g.course.setRuntimeState(speed, difficulty);
    g.course.update(pz, 1 / 60);

    for (let z = Math.max(Z0, pz + LEAD_LO); z < Math.min(Z1, pz + LEAD_HI); z += DZ) {
      const zi = Math.floor((z - Z0) / DZ);
      if (zi < 0 || zi >= nz || sampled[zi]) continue;
      sampled[zi] = 1;
      const row = floor[zi];
      for (let i = 0; i < LANES; i++) {
        const x = laneX(i);
        row[i] = (g.course.isSolidFloorAt(x, z) && !g.course.isLethalHazardAt(x, z)) ? 1 : 0;
      }
    }
    pz += 24;
    t += 24 / speed;
  }

  const unsampled = (() => { let n = 0; for (let i = 0; i < nz; i++) if (!sampled[i]) n++; return n; })();

  const segs = g.course.activeSegments.map(s => ({
    type: s.moduleType, startZ: Math.round(s.startZ), endZ: Math.round(s.endZ),
    obstacles: s.obstacles.length,
  }));

  const holes = [], sealed = [];
  let inHole = false, holeStart = 0;
  for (let zi = 0; zi < nz; zi++) {
    const z = Z0 + zi * DZ;
    const row = floor[zi];
    let widest = 0, run = 0, anySafe = false;
    for (let i = 0; i < LANES; i++) {
      if (row[i]) { anySafe = true; run += 0.5; if (run > widest) widest = run; }
      else run = 0;
    }
    if (!anySafe && !inHole) { inHole = true; holeStart = z; }
    if (anySafe && inHole) { inHole = false; holes.push([holeStart, z - STEP, z - holeStart]); }
    if (anySafe && widest < 3.0) sealed.push([z, +widest.toFixed(1)]);
  }
  if (inHole) holes.push([holeStart, Z1, Z1 - holeStart]);

  // ---- reachability DP --------------------------------------------------
  // A player does not land on a fixed stride — they choose a touchdown point
  // anywhere within one hop, and can steer laterally in proportion to the
  // time that hop takes. So this is a forward sweep over (z, lane) states:
  // a lane is reachable if ANY reachable lane within one hop behind it was
  // close enough to steer across in the flight time. The furthest z with a
  // reachable lane is how far the course can actually be played.
  const speed = lastSpeed;
  // Full-commitment bounce: apex 7.2 under the shared gravity.
  const air = 2 * Math.sqrt(2 * 16.0 / 75.7);   // full-commitment bounce
  const hop = speed * air;
  const steerMax = 19 + 0.22 * speed;
  const maxShift = steerMax * air * 0.72;

  const reach = [];
  for (let zi = 0; zi < nz; zi++) reach.push(new Uint8Array(LANES));
  // Seed: wherever the ball can legitimately start.
  for (let zi = 0; zi < Math.min(nz, Math.ceil(8 / DZ)); zi++)
    for (let i = 0; i < LANES; i++) if (floor[zi][i]) reach[zi][i] = 1;

  const hopSteps = Math.floor(hop / DZ);
  let furthest = 0;
  for (let zi = 0; zi < nz; zi++) {
    const cur = reach[zi];
    let any = false;
    for (let i = 0; i < LANES; i++) if (cur[i]) { any = true; break; }
    if (!any) continue;
    furthest = Z0 + zi * DZ;
    for (let d = 1; d <= hopSteps; d++) {
      const zj = zi + d;
      if (zj >= nz) break;
      const shiftLanes = Math.floor((maxShift * (d / hopSteps)) / 0.5);
      const dst = reach[zj], f = floor[zj];
      for (let i = 0; i < LANES; i++) {
        if (!f[i] || dst[i]) continue;
        const lo = Math.max(0, i - shiftLanes), hi = Math.min(LANES - 1, i + shiftLanes);
        for (let k = lo; k <= hi; k++) if (cur[k]) { dst[i] = 1; break; }
      }
    }
  }

  const solvedTo = furthest;
  // Count how constrained the reachable corridor is, hop by hop.
  const tight = [];
  for (let z = 20; z < Math.min(solvedTo, Z1); z += Math.round(hop)) {
    const zi = Math.floor((z - Z0) / DZ);
    let n = 0; for (let i = 0; i < LANES; i++) if (reach[zi][i]) n++;
    if (n > 0 && n <= 6) tight.push([z, +(n * 0.5).toFixed(1)]);
  }

  return { segs, holes, sealed, maxHop: +hop.toFixed(1), maxShift: +maxShift.toFixed(1),
           solvedTo, limit: Z1, tight, unsampled };
});

console.log('SEGMENTS:');
for (const s of map.segs)
  console.log(`  ${String(s.type).padEnd(12)} z ${String(s.startZ).padStart(5)} .. ${String(s.endZ).padStart(5)}  (${s.obstacles} obs)`);

console.log(`\nMax hop at current speed: ${map.maxHop} units\n`);
console.log('HOLES — no standable floor at any x:');
if (!map.holes.length) console.log('  none');
for (const h of map.holes) {
  const bad = h[2] > map.maxHop * 0.8;
  console.log(`  z ${String(h[0]).padStart(5)} .. ${String(h[1]).padStart(5)}   ${String(h[2]).padStart(3)} units ${bad ? '  <-- UNCLEARABLE' : ''}`);
}
console.log('\nSEALED SLICES — floor exists but hazards leave no lane wider than 3.0:');
if (!map.sealed.length) console.log('  none');
for (const s of map.sealed.slice(0, 25)) console.log(`  z ${String(s[0]).padStart(5)}   widest free lane ${s[1]}`);
if (map.sealed.length > 25) console.log(`  ... and ${map.sealed.length - 25} more`);

console.log(`\nREACHABILITY SWEEP  (hop ${map.maxHop}u, max lateral shift per hop ${map.maxShift}u)`);
if (map.solvedTo >= map.limit - 30)
  console.log(`  solvable to z=${map.solvedTo} (scan limit ${map.limit}) — no dead end found`);
else
  console.log(`  DEAD END: playable only to z=${map.solvedTo} of ${map.limit}`);
if (map.tight.length) {
  console.log(`  tight corridors (<=3 units of safe width at a landing):`);
  for (const t of map.tight.slice(0, 10)) console.log(`    z ${String(t[0]).padStart(4)}  ${t[1]} units wide`);
}
await browser.close();
