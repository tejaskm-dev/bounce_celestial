import { test, expect } from '@playwright/test';

test.describe('BOUNCE Supabase Backend & Offline-First Sync Suite', () => {
  test('1. Anonymous sign-in, initial state, and username onboarding modal typing', async ({ page }) => {
    // Clear localStorage to simulate fresh visitor
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Check title screen loads
    await page.waitForSelector('#screen-title.active', { timeout: 15000 });

    // Verify username onboarding modal appears on first run
    await page.waitForSelector('#modal-username.active', { timeout: 6000 });

    // Test callsign randomization button (SVG dice icon, zero emoji)
    const input = page.locator('#input-username');
    const btnDice = page.locator('#btn-random-username');
    await btnDice.click();
    const nextVal = await input.inputValue();
    expect(nextVal.length).toBeGreaterThanOrEqual(2);

    // Test individual letter-by-letter typing with game control keys ('A', 'S', 'D', 'Space', etc.)
    await input.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    // Type characters that used to be blocked by game inputs: 'A', 'e', 'g', 'i', 's', ' ', 'D', 'a', 's', 'h'
    await page.keyboard.type('Aegis Dash');
    expect(await input.inputValue()).toBe('Aegis Dash');

    // Verify typing Space or A/D did not start the game
    const isPlaying = await page.evaluate(() => {
      const g = (window as any).__BOUNCE_GAME__;
      return g ? g.state.getState() : -1;
    });
    expect(isPlaying).toBe('TITLE');

    // Press Enter to confirm callsign
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await expect(page.locator('#modal-username')).not.toHaveClass(/active/);

    // Verify saved to localStorage
    const savedName = await page.evaluate(() => localStorage.getItem('bounce.profile.displayName'));
    expect(savedName).toBe('Aegis Dash');

    await page.screenshot({ path: 'tests/screenshots/10_username_confirmed.png' });
  });

  test('2. Profile Settings in Settings Menu (Display name change & natural typing)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bounce.profile.prompted', '1');
      localStorage.setItem('bounce.profile.displayName', 'TestPilot');
    });
    await page.goto('/');
    await page.waitForSelector('#screen-title.active');

    // Open settings
    await page.click('#btn-settings');
    await page.waitForSelector('#page-settings.on');

    // Verify profile section exists
    const profileNameInput = page.locator('#set-profile-name');
    await expect(profileNameInput).toBeVisible();

    // Focus and type letter by letter including 'A', 'S', 'P', 'Space'
    await profileNameInput.click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Apex Striker');
    expect(await profileNameInput.inputValue()).toBe('Apex Striker');

    // Save with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const updatedName = await page.evaluate(() => localStorage.getItem('bounce.profile.displayName'));
    expect(updatedName).toBe('Apex Striker');

    // Verify cloud sync badge is visible
    const syncBadge = page.locator('#sync-status-badge');
    await expect(syncBadge).toBeVisible();

    await page.screenshot({ path: 'tests/screenshots/11_profile_settings.png' });

    // Close settings
    await page.click('[data-close="page-settings"]');
    await expect(page.locator('#page-settings')).not.toHaveClass(/on/);
  });

  test('3. Dynamic Multi-Tab Leaderboard & True Player Rank', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bounce.profile.prompted', '1');
      localStorage.setItem('bounce.stat.bestTime', '52.120');
      localStorage.setItem('bounce_best_time_time_attack', '52.120');
    });
    await page.goto('/');
    await page.waitForSelector('#screen-title.active');

    // Open leaderboard
    await page.click('#btn-leaderboard');
    await page.waitForSelector('#page-leaderboard.on');

    // Verify mode tabs exist
    const modeTabs = page.locator('.board-mode-tab');
    expect(await modeTabs.count()).toBe(6);

    // Verify scope tabs (Global, Friends, Me) exist
    const scopeTabs = page.locator('#lb-scope-tabs .board-tab');
    expect(await scopeTabs.count()).toBe(3);

    // Verify window tabs (All-Time, Week, Today) exist
    const winTabs = page.locator('.board-win-tab');
    expect(await winTabs.count()).toBe(3);

    // Click Time Attack tab and verify header switches to "Best Time"
    await page.click('.board-mode-tab[data-mode="time_attack"]');
    await page.waitForTimeout(300);
    const metricHeader = page.locator('#lb-metric-header');
    await expect(metricHeader).toHaveText('Best Time');

    // Click Friends tab
    await page.click('#lb-scope-tabs .board-tab[data-scope="friends"]');
    await page.waitForTimeout(200);

    // Click Me tab
    await page.click('#lb-scope-tabs .board-tab[data-scope="me"]');
    await page.waitForTimeout(200);

    await page.screenshot({ path: 'tests/screenshots/12_leaderboard_tabs.png' });

    // Close leaderboard
    await page.click('[data-close="page-leaderboard"]');
    await expect(page.locator('#page-leaderboard')).not.toHaveClass(/on/);
  });

  test('4. Run submission, coin persistence & offline resilience', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bounce.profile.prompted', '1');
    });
    await page.goto('/');
    await page.waitForSelector('#screen-title.active');

    // Test API submission via page.evaluate
    const validRunResult = await page.evaluate(async () => {
      const { Api } = await import('/src/net/Api.ts');
      return await Api.submitRun({
        mode: 'arcade',
        score: 15400,
        distance: 620,
        coins: 45,
        maxCombo: 12,
        runTime: 32.5,
        perfects: 8,
        nearMisses: 4,
        topSpeed: 52,
      });
    });

    expect(validRunResult.success).toBe(true);
    expect(validRunResult.progression.lifetimeCoins).toBeGreaterThanOrEqual(45);

    // Verify localStorage coins survive
    const savedCoins = await page.evaluate(() => Number(localStorage.getItem('bounce.coins.lifetime')));
    expect(savedCoins).toBeGreaterThanOrEqual(45);

    // Refresh and check that lifetime coins persist across reload
    await page.reload();
    await page.waitForSelector('#screen-title.active');
    const reloadedCoins = await page.evaluate(() => Number(localStorage.getItem('bounce.coins.lifetime')));
    expect(reloadedCoins).toBe(savedCoins);
  });
});
