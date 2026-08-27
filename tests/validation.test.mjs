// Unit Tests: Run Validation Anti-Cheat Engine (§5)

import assert from 'node:assert/strict';

const MAX_SPEED = 78;
const MAX_SPEED_CEILING = MAX_SPEED * 1.05; // 81.9 u/s
const COMBO_COUNT_MAX = 99;
const MIN_AIRTIME = 0.4;
const VALID_MODES = ['arcade', 'time_attack', 'score_attack', 'endless', 'daily', 'master'];

function validateRun(payload) {
  const {
    mode,
    score,
    distance,
    coins = 0,
    maxCombo = 1,
    runTime,
    perfects = 0,
    nearMisses = 0,
    topSpeed = 0,
  } = payload;

  // Mode check
  if (!mode || !VALID_MODES.includes(mode)) {
    return { valid: false, reason: 'Invalid mode' };
  }

  // 1. runTime <= 0 or > 2 hours (7200s)
  if (typeof runTime !== 'number' || runTime <= 0 || runTime > 7200 || isNaN(runTime)) {
    return { valid: false, reason: 'Invalid runTime' };
  }

  // 2. distance > MAX_SPEED * runTime
  if (typeof distance !== 'number' || distance < 0 || distance > (MAX_SPEED * runTime) + 5 || isNaN(distance)) {
    return { valid: false, reason: 'Distance exceeds physical speed ceiling' };
  }

  // 3. topSpeed > MAX_SPEED * 1.05
  if (typeof topSpeed === 'number' && topSpeed > MAX_SPEED_CEILING + 0.1) {
    return { valid: false, reason: 'Top speed exceeds physical velocity limit' };
  }

  // 4. maxCombo > COMBO_COUNT_MAX (99)
  if (typeof maxCombo !== 'number' || maxCombo < 1 || maxCombo > COMBO_COUNT_MAX) {
    return { valid: false, reason: 'Max combo exceeds 99' };
  }

  // 5. score ceiling: score > 480 * coins + 900 * perfects + 40 * distance + 5000
  const maxPlausibleScore = Math.ceil(480 * coins + 900 * perfects + 40 * distance + 5000);
  if (typeof score !== 'number' || score < 0 || (score > maxPlausibleScore && mode !== 'master')) {
    return { valid: false, reason: 'Score exceeds plausible calculation bounds' };
  }

  // Soft flags
  const flags = [];
  if (coins > (distance / 4) + 25) {
    flags.push('SUSPICIOUS_COIN_DENSITY');
  }
  if (perfects > (runTime / MIN_AIRTIME) + 2) {
    flags.push('IMPLAUSIBLE_PERFECT_FREQUENCY');
  }

  return { valid: true, flags };
}

// ----------------------------------------------------------------------------
// Test Cases
// ----------------------------------------------------------------------------

console.log('Running BOUNCE Run Validation Anti-Cheat Tests...');

// 1. Valid runs
{
  const res = validateRun({
    mode: 'arcade',
    score: 18500,
    distance: 720,
    coins: 35,
    maxCombo: 14,
    runTime: 36.4,
    perfects: 9,
    nearMisses: 5,
    topSpeed: 58.2,
  });
  assert.equal(res.valid, true, 'Standard legitimate run must be accepted');
  assert.equal(res.flags.length, 0, 'Standard legitimate run should have no flags');
}

// 2. Reject: runTime <= 0
{
  const res = validateRun({
    mode: 'arcade',
    score: 1000,
    distance: 100,
    coins: 5,
    maxCombo: 2,
    runTime: 0,
    perfects: 1,
  });
  assert.equal(res.valid, false, 'runTime <= 0 must be rejected');
}

// 3. Reject: impossible distance (teleportation/speed hacking)
{
  const res = validateRun({
    mode: 'arcade',
    score: 10000,
    distance: 5000, // 5000m in 10s = 500m/s >> 78m/s
    coins: 10,
    maxCombo: 2,
    runTime: 10,
    perfects: 1,
    topSpeed: 70,
  });
  assert.equal(res.valid, false, 'Distance exceeding MAX_SPEED * runTime must be rejected');
}

// 4. Reject: impossible top speed
{
  const res = validateRun({
    mode: 'arcade',
    score: 10000,
    distance: 500,
    coins: 10,
    maxCombo: 2,
    runTime: 20,
    perfects: 1,
    topSpeed: 150, // >> 81.9
  });
  assert.equal(res.valid, false, 'Top speed exceeding MAX_SPEED * 1.05 must be rejected');
}

// 5. Reject: combo > 99
{
  const res = validateRun({
    mode: 'arcade',
    score: 10000,
    distance: 500,
    coins: 10,
    maxCombo: 150,
    runTime: 20,
    perfects: 1,
  });
  assert.equal(res.valid, false, 'Max combo > 99 must be rejected');
}

// 6. Reject: tampered million score in devtools
{
  const res = validateRun({
    mode: 'arcade',
    score: 9999999, // tampered in devtools
    distance: 200,
    coins: 5,
    maxCombo: 4,
    runTime: 15,
    perfects: 2,
    topSpeed: 40,
  });
  assert.equal(res.valid, false, 'Tampered devtools score must be hard rejected');
}

// 7. Soft flag: suspicious coin density
{
  const res = validateRun({
    mode: 'arcade',
    score: 15000,
    distance: 100,
    coins: 120, // 120 coins in 100m is abnormal
    maxCombo: 8,
    runTime: 15,
    perfects: 2,
    topSpeed: 40,
  });
  assert.equal(res.valid, true, 'High coin density accepted with soft flag');
  assert.ok(res.flags.includes('SUSPICIOUS_COIN_DENSITY'), 'Flag SUSPICIOUS_COIN_DENSITY must be set');
}

// 8. Soft flag: implausible perfect frequency
{
  const res = validateRun({
    mode: 'arcade',
    score: 25000,
    distance: 300,
    coins: 20,
    maxCombo: 20,
    runTime: 5, // 5 seconds
    perfects: 30, // 30 perfects in 5 seconds is impossible without bots
    topSpeed: 40,
  });
  assert.equal(res.valid, true, 'Implausible perfect frequency accepted with soft flag');
  assert.ok(res.flags.includes('IMPLAUSIBLE_PERFECT_FREQUENCY'), 'Flag IMPLAUSIBLE_PERFECT_FREQUENCY must be set');
}

console.log('✓ All 8 Run Validation anti-cheat unit tests passed successfully!');
