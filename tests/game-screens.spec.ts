import { test, expect } from '@playwright/test';

test.describe('BOUNCE Arcade Experience & Screenshot Verification', () => {
  test('Capture Preloader, Title Screen, Info Modal, Gameplay, Abilities, and Results', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.addInitScript(() => {
      localStorage.setItem('bounce.profile.prompted', '1');
    });

    // 1. Open Game & Capture Title Screen
    await page.goto('/');
    await page.waitForSelector('#screen-title.active', { timeout: 20000 });
    await page.waitForTimeout(600);

    // Capture Title Screen
    await page.screenshot({ path: 'tests/screenshots/01_title_screen.png' });

    // 2. Test Info / How To Play Modal
    await page.click('#btn-title-info');
    await page.waitForSelector('#modal-info.active');
    await page.waitForTimeout(300);

    // Capture Controls tab
    await page.screenshot({ path: 'tests/screenshots/02_info_modal_controls.png' });

    // Switch to Mechanics tab
    await page.click('.info-tab-btn[data-tab="mechanics"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'tests/screenshots/02_info_modal_mechanics.png' });

    // Switch to Color Grammar tab
    await page.click('.info-tab-btn[data-tab="colors"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'tests/screenshots/02_info_modal_colors.png' });

    // Close Info Modal
    await page.click('#btn-close-info');
    await expect(page.locator('#modal-info')).not.toHaveClass(/active/);
    await page.waitForTimeout(300);

    // Test Game Mode Selector Popup Modal
    await page.click('#btn-mode-select');
    await page.waitForSelector('#modal-modes.active');
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'tests/screenshots/02_mode_selector_modal.png' });
    await page.click('.mode-card[data-mode="arcade"]');
    await expect(page.locator('#modal-modes')).not.toHaveClass(/active/);
    await page.waitForTimeout(200);

    // Select Ball Skin
    await page.click('.skin-btn[data-skin="cyan"]');

    // 3. Start Game -> Countdown
    await page.click('#btn-start');
    await page.waitForSelector('#screen-countdown.active');
    await page.waitForTimeout(350);

    // Capture Countdown
    await page.screenshot({ path: 'tests/screenshots/03_countdown.png' });

    // 4. Wait for Countdown to finish and Gameplay to start
    await page.waitForSelector('#screen-countdown', { state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(800);

    // Capture In-Game HUD, Speedometer Dial, and Timing Ring
    await page.screenshot({ path: 'tests/screenshots/04_gameplay_action.png' });

    // 5. Test Perfect Landing Timing Tap (Space)
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'tests/screenshots/05_perfect_bounce.png' });

    // 6. Test Air Dash using Boost Float (K)
    await page.keyboard.press('KeyK');
    await page.waitForTimeout(180);
    await page.screenshot({ path: 'tests/screenshots/06_air_dash.png' });

    // 7. Test Ground Slam (S)
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'tests/screenshots/07_slam_impact.png' });

    // 8. Steer through track
    await page.keyboard.press('KeyD');
    await page.waitForTimeout(800);

    // 9. Trigger end of run to test Results Screen
    await page.evaluate(() => {
      (window as any).__BOUNCE_GAME__?.triggerDeath();
    });

    // Wait for Results screen
    await page.waitForSelector('#screen-results.active', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Capture Results Screen with Letter Rank & Stats
    await page.screenshot({ path: 'tests/screenshots/08_results_screen.png' });

    // Verify stats in Results screen
    const finalScore = await page.locator('#results-score').textContent();
    const finalDist = await page.locator('#results-distance').textContent();
    const rankLetter = await page.locator('#results-rank-letter').textContent();
    expect(finalScore).toBeTruthy();
    expect(finalDist).toBeTruthy();
    expect(rankLetter).toBeTruthy();
  });
});

