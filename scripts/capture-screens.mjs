import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const outDir = path.resolve('tests/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // High-DPI Retina
  });

  const page = await context.newPage();

  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[BROWSER ERROR]', err));

  console.log('Navigating to http://127.0.0.1:5180...');
  await page.goto('http://127.0.0.1:5180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // 1. Title Screen with Game Modes and Skin Selector
  console.log('Capturing Title Screen with Modes...');
  await page.screenshot({ path: path.join(outDir, '01_title_screen_modes.png') });

  // Select Time Attack Mode & Skin
  console.log('Selecting Time Attack Mode...');
  await page.click('.mode-tab[data-mode="time_attack"]');
  await page.click('.skin-btn[data-skin="magenta"]');
  await page.waitForTimeout(300);

  // 2. Start Game -> Countdown
  console.log('Clicking Start Button...');
  await page.click('#btn-start');
  await page.waitForTimeout(400);
  console.log('Capturing Countdown / Intro Flythrough...');
  await page.screenshot({ path: path.join(outDir, '02_countdown_intro.png') });

  // 3. Wait for Countdown to complete and game to start (~4.5s)
  console.log('Waiting for Countdown to complete and gameplay to start...');
  await page.waitForTimeout(4400);

  // 4. Kinetic Movement: Roll & Active Jump
  console.log('Triggering Ground Jump...');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(350);
  console.log('Capturing Jump Action...');
  await page.screenshot({ path: path.join(outDir, '03_kinetic_jump.png') });

  // 5. Mid-Air Dash & Trick Rotation
  console.log('Triggering Air Dash & Trick Spin...');
  await page.keyboard.press('KeyK');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  console.log('Capturing Air Dash & Trick...');
  await page.screenshot({ path: path.join(outDir, '04_air_dash_trick.png') });

  // 6. High-Speed Boost Overdrive
  console.log('Triggering Nitro Boost Overdrive...');
  await page.keyboard.down('Space');
  await page.waitForTimeout(1600);
  console.log('Capturing High-Speed Boost...');
  await page.screenshot({ path: path.join(outDir, '05_high_speed_boost.png') });
  await page.keyboard.up('Space');

  // 7. Slam / Speed Break through barriers
  console.log('Navigating into Obstacle Modules and Destructible Barriers...');
  await page.waitForTimeout(1800);
  console.log('Capturing Obstacle Set Piece...');
  await page.screenshot({ path: path.join(outDir, '06_mechanical_setpiece.png') });

  // 8. Ground Pound Slam
  console.log('Triggering Ground Pound Slam...');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyS');
  await page.screenshot({ path: path.join(outDir, '07_slam_impact.png') });

  // 9. Steering off track into abyss to trigger Results Screen
  console.log('Steering off edge to trigger Run Results...');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(3800);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(1500);

  console.log('Waiting for Results Screen...');
  await page.waitForSelector('#screen-results.active', { timeout: 10000 });
  await page.waitForTimeout(600);

  console.log('Capturing Results & Medals Screen...');
  await page.screenshot({ path: path.join(outDir, '08_results_medals.png') });

  // 10. Test Quick Replay with 'R'
  console.log('Testing Quick Replay (R key)...');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(outDir, '09_quick_replay.png') });

  console.log('All screenshots captured successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
