/**
 * Autopilot playtest.
 *
 * Drives the game with a steering bot that aims at the ball's *predicted*
 * touchdown point, and reports where and why it dies. This is how the
 * difficulty curve and the generator's fairness guarantees get tuned — a
 * course that a competent bot cannot survive is not a hard course, it is a
 * broken one.
 *
 *   node scripts/playtest.mjs            report deaths, no rescuing
 *   node scripts/playtest.mjs --shots    survive on rescue, capture frames
 */
import { chromium } from 'playwright';
import path from 'path'; import fs from 'fs';

const SHOTS = process.argv.includes('--shots');
const outDir = process.env.SHOT_DIR || 'tests/screenshots/playtest';
if (SHOTS) fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('[ERR]', e.message));
await page.goto('http://127.0.0.1:5180', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
if (SHOTS) await page.screenshot({ path: path.join(outDir, 'a_title.png') });
await page.click('#btn-start');

await page.evaluate((rescue) => {
  const g = window.__BOUNCE_GAME__;
  window.__EVENTS = [];
  const W = 14.5;

  const origDeath = g.triggerDeath.bind(g);
  let lastLog = -1e9;
  g.triggerDeath = function () {
    const b = g.ball.position;
    // In rescue mode death is suppressed, so a hazard the bot is sitting in
    // fires every frame. Only record one event per contact.
    if (b.z - lastLog < 6) { if (!rescue) return origDeath(); return; }
    lastLog = b.z;
    window.__EVENTS.push({
      kind: b.y < -5 ? 'fall' : 'hazard',
      z: +b.z.toFixed(0), x: +b.x.toFixed(1),
      t: +g.score.runTime.toFixed(1), speed: +g.currentSpeed.toFixed(0),
      module: g.course.getUpcomingSegment(b.z)?.moduleType ?? '?',
    });
    if (!rescue) return origDeath();
  };

  /**
   * Centre of the widest hazard-free stretch of floor at this z, biased
   * toward the lane the ball is already in. Aiming at the nearest *edge*
   * of a platform — which is what a naive nearest-solid search returns —
   * puts the bot on the lip of every landing and scuffs constantly.
   */
  function safeX(z, preferX) {
    const spans = [];
    let runStart = null;
    for (let x = -W; x <= W + 0.001; x += 0.5) {
      const ok = g.course.isSolidFloorAt(x, z) && !g.course.isLethalHazardAt(x, z);
      if (ok && runStart === null) runStart = x;
      if (!ok && runStart !== null) { spans.push([runStart, x - 0.5]); runStart = null; }
    }
    if (runStart !== null) spans.push([runStart, W]);
    if (!spans.length) return null;
    let best = null, bestScore = -1e9;
    for (const [a, b] of spans) {
      const mid = (a + b) * 0.5, width = b - a;
      // Prefer wide landings, then ones close to the current line.
      const score = width * 1.6 - Math.abs(mid - preferX);
      if (score > bestScore) { bestScore = score; best = mid; }
    }
    return best;
  }

  // The game recomputes steerAxis from the keyboard inside input.update()
  // every frame, so the bot has to drive *through* that call rather than
  // racing it from a separate rAF.
  const origUpdate = g.input.update.bind(g.input);
  g.input.update = function () {
    origUpdate();
    const b = g.ball.position;

    if (rescue && b.y < -6) {
      for (let dz = 0; dz < 260; dz += 2) {
        const x = safeX(b.z + dz, b.x);
        if (x !== null) { b.set(x, 3, b.z + dz); g.ball.velocity.set(0, 0, g.currentSpeed); break; }
      }
    }

    // Aim at where the ball is actually going to touch down, not a fixed
    // distance ahead — a constant lookahead misreads every change of speed.
    const ttl = g.timeToLand;
    const landZ = ttl >= 0 ? b.z + g.ball.velocity.z * ttl
                           : b.z + Math.max(12, g.currentSpeed * 0.55);
    const target = safeX(landZ, b.x) ?? safeX(landZ + 12, b.x);
    if (target !== null) g.input.steerAxis = Math.max(-1, Math.min(1, (target - b.x) * 2.0));
    // Jump when the deck is about to run out, and chain-jump on touchdown.
    const b2 = g.ball;
    const lookahead = Math.max(9, g.currentSpeed * 0.42);
    const groundNow = g.course.surfaceYAt(b2.position.x, b2.position.z) !== null;
    let gapAhead = false;
    for (let dz = 4; dz < lookahead; dz += 2) {
      const tx2 = safeX(b2.position.z + dz, b2.position.x);
      if (g.course.surfaceYAt(b2.position.x, b2.position.z + dz) === null &&
          (tx2 === null || Math.abs(tx2 - b2.position.x) > 6)) { gapAhead = true; break; }
    }
    // Hold through a gap to commit to a full-height bounce; ride the small
    // idle bounce otherwise.
    g.input.actionHeld = gapAhead;
    if (gapAhead) g.input.actionTriggered = true;
  };
}, SHOTS);

const marks = SHOTS ? ['b_play_early', 'c_play_mid', 'd_play_far'] : [];
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(i === 0 ? 6000 : 10000);
  if (SHOTS) await page.screenshot({ path: path.join(outDir, marks[i] + '.png') });
}

const r = await page.evaluate(() => {
  const g = window.__BOUNCE_GAME__;
  return { drawCalls: g.pipeline.renderer.info.render.calls,
           tris: g.pipeline.renderer.info.render.triangles,
           reachedZ: +g.ball.position.z.toFixed(0),
           speed: +g.currentSpeed.toFixed(1), events: window.__EVENTS };
});
console.log(`reached z=${r.reachedZ} at ${r.speed} u/s   ${r.drawCalls} draw calls, ${r.tris} tris`);
console.log(`deaths: ${r.events.length}`);
for (const e of r.events)
  console.log(`  ${e.kind.padEnd(6)} t=${String(e.t).padStart(5)}s  z=${String(e.z).padStart(4)}  x=${String(e.x).padStart(6)}  ${e.speed} u/s  next:${e.module}`);
await browser.close();
