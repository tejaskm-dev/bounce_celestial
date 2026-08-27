import { CONSTANTS } from '../config/constants';
import { GameModeId, GAME_MODES } from '../config/modes';

export type LandingQuality = 'MISS' | 'POOR' | 'GOOD' | 'PERFECT';

export interface TrickResult {
  airTime: number;
  spins: number;
  tricks: string[];
}

export type MedalTier = 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'MASTER';

/**
 * Score, Landing Quality, Combo & Mastery Manager for BOUNCE
 */
export class ScoreManager {
  public score: number = 0;
  public distance: number = 0;
  public coins: number = 0;
  public combo: number = 1;
  /** Multiplier applied to skill actions only. Capped so it stays readable. */
  public get multiplier(): number {
    return Math.min(CONSTANTS.COMBO_MAX_MULTIPLIER, 1 + (this.combo - 1) * CONSTANTS.COMBO_STEP);
  }
  public maxCombo: number = 1;
  public comboTimer: number = 0;
  public runTime: number = 0;
  public highScore: number = 0;
  public bestTime: number = 9999;
  public isNewRecord: boolean = false;

  // Granular Gameplay Metrics
  public perfectLandings: number = 0;
  public goodLandings: number = 0;
  public poorLandings: number = 0;
  public nearMisses: number = 0;
  public speedBreaks: number = 0;
  public totalTricks: number = 0;
  public topSpeedKmh: number = 0;

  // Active Mode
  public currentMode: GameModeId = 'arcade';

  private onComboChangeCallback?: (combo: number) => void;

  constructor(mode: GameModeId = 'arcade') {
    this.currentMode = mode;
    this.loadHighScore();
  }

  public setMode(mode: GameModeId): void {
    this.currentMode = mode;
    this.loadHighScore();
    this.reset();
  }

  private loadHighScore(): void {
    const saved = localStorage.getItem(`bounce_high_score_${this.currentMode}`);
    if (saved) {
      this.highScore = parseInt(saved, 10) || 0;
    } else {
      this.highScore = 0;
    }

    const savedTime = localStorage.getItem(`bounce_best_time_${this.currentMode}`);
    if (savedTime) {
      this.bestTime = parseFloat(savedTime) || 9999;
    } else {
      this.bestTime = 9999;
    }
  }

  public setOnComboChange(cb: (combo: number) => void): void {
    this.onComboChangeCallback = cb;
  }

  public addDistance(deltaDist: number, currentSpeedKmh: number): void {
    this.distance += deltaDist;
    if (currentSpeedKmh > this.topSpeedKmh) {
      this.topSpeedKmh = currentSpeedKmh;
    }

    // Distance is flat and unmultiplied: it is the floor of the run, not the
    // payout. Multiplying it was what made the score run away from the player.
    this.score += Math.floor(deltaDist * CONSTANTS.SCORE_PER_METRE);

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewRecord = true;
    }
  }

  /**
   * Process Landing Quality
   */
  public addLanding(quality: LandingQuality): void {
    switch (quality) {
      case 'PERFECT':
        this.perfectLandings++;
        this.incrementCombo(2);
        this.score += Math.round(CONSTANTS.PERFECT_SCORE * this.multiplier);
        this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
        break;
      case 'GOOD':
        this.goodLandings++;
        this.incrementCombo(1);
        this.score += Math.round(CONSTANTS.GOOD_SCORE * this.multiplier);
        this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
        break;
      case 'POOR':
        this.poorLandings++;
        // Minor penalty to combo timer
        this.comboTimer = Math.min(this.comboTimer, 1.5);
        this.score += 100;
        break;
      case 'MISS':
        // Lost run
        break;
    }
  }

  /**
   * Process Completed Aerial Tricks
   */
  public addTricks(trickData: TrickResult): number {
    let trickScore = 0;
    if (trickData.tricks.length === 0 && trickData.spins === 0 && trickData.airTime < 1.0) {
      return 0;
    }

    trickScore += trickData.spins * CONSTANTS.SPIN_TRICK_SCORE;
    trickScore += Math.floor(trickData.airTime * 300);

    if (trickData.tricks.includes('AIR DASH')) trickScore += 400;
    if (trickData.tricks.includes('BIG AIR')) trickScore += 800;
    if (trickData.tricks.includes('CORKSCREW')) trickScore += 400;
    if (trickData.tricks.includes('BACKFLIP')) trickScore += 500;
    if (trickData.tricks.includes('COMET SPIN')) trickScore += 700;
    if (trickData.tricks.includes('RAIL GRIND')) trickScore += 600;

    const totalAward = Math.round(trickScore * this.multiplier);
    this.score += totalAward;
    this.totalTricks += Math.max(1, trickData.tricks.length + trickData.spins);
    this.incrementCombo(1);
    this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;

    return totalAward;
  }

  public addNearMiss(): void {
    this.nearMisses++;
    this.incrementCombo(1);
    this.score += Math.round(CONSTANTS.NEAR_MISS_SCORE * this.multiplier);
    this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
  }

  public addSpeedBreak(): void {
    this.speedBreaks++;
    this.incrementCombo(2);
    this.score += Math.round(CONSTANTS.SPEED_BREAK_SCORE * this.multiplier);
    this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
  }

  public addBonusGem(): void {
    this.score += Math.round(CONSTANTS.COIN_SCORE * this.multiplier);
    this.coins++;
    this.incrementCombo(1);
    this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
  }

  public addBumperHit(): void {
    this.score += 350 * this.combo;
    this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
  }

  public addSpringLaunch(): void {
    this.score += 500 * this.combo;
    this.incrementCombo(1);
    this.comboTimer = CONSTANTS.COMBO_DECAY_TIME;
  }

  private incrementCombo(amount: number = 1): void {
    const prev = this.combo;
    // The counter is bounded by its own cap, not by the multiplier's.
    this.combo = Math.min(CONSTANTS.COMBO_COUNT_MAX, this.combo + amount);
    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }
    if (this.combo !== prev && this.onComboChangeCallback) {
      this.onComboChangeCallback(this.combo);
    }
  }

  public update(delta: number): void {
    this.runTime += delta;

    // Combo decay timer
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        if (this.onComboChangeCallback) {
          this.onComboChangeCallback(this.combo);
        }
      }
    }
  }

  /**
   * Determine Medal Tier for the run
   */
  public getMedal(): MedalTier {
    const cfg = GAME_MODES[this.currentMode];
    if (!cfg) return 'NONE';

    if (this.currentMode === 'time_attack') {
      if (this.runTime <= cfg.medals.master) return 'MASTER';
      if (this.runTime <= cfg.medals.gold) return 'GOLD';
      if (this.runTime <= cfg.medals.silver) return 'SILVER';
      if (this.runTime <= cfg.medals.bronze) return 'BRONZE';
      return 'NONE';
    } else {
      const metric = this.currentMode === 'endless' || this.currentMode === 'daily' ? this.distance : this.score;
      if (metric >= cfg.medals.master) return 'MASTER';
      if (metric >= cfg.medals.gold) return 'GOLD';
      if (metric >= cfg.medals.silver) return 'SILVER';
      if (metric >= cfg.medals.bronze) return 'BRONZE';
      return 'NONE';
    }
  }

  /**
   * Persist the lifetime stats the achievements and leaderboard read.
   * These were being displayed from keys nothing ever wrote.
   */
  private saveLifetimeStats(): void {
    const bump = (k: string, v: number) => {
      const cur = Number(localStorage.getItem(k) ?? 0) || 0;
      if (v > cur) localStorage.setItem(k, String(v));
    };
    const add = (k: string, v: number) => {
      localStorage.setItem(k, String((Number(localStorage.getItem(k) ?? 0) || 0) + v));
    };
    bump('bounce.stat.bestDistance', Math.floor(this.distance));
    bump('bounce.stat.bestCombo', this.maxCombo);
    add('bounce.stat.runs', 1);
    add('bounce.stat.perfects', this.perfectLandings);
    // Best time is a minimum, and only counts a run that actually went somewhere.
    if (this.runTime > 3 && this.distance > 60) {
      const cur = Number(localStorage.getItem('bounce.stat.bestTime') ?? 0) || 0;
      if (cur === 0 || this.runTime < cur) {
        localStorage.setItem('bounce.stat.bestTime', String(this.runTime));
      }
    }
  }

  public saveScore(): void {
    this.saveLifetimeStats();
    if (this.score >= this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(`bounce_high_score_${this.currentMode}`, this.highScore.toString());
    }
    if (this.runTime > 0 && this.runTime < this.bestTime) {
      this.bestTime = this.runTime;
      localStorage.setItem(`bounce_best_time_${this.currentMode}`, this.bestTime.toString());
    }
  }

  public reset(): void {
    this.score = 0;
    this.distance = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.comboTimer = 0;
    this.runTime = 0;
    this.perfectLandings = 0;
    this.goodLandings = 0;
    this.poorLandings = 0;
    this.nearMisses = 0;
    this.speedBreaks = 0;
    this.coins = 0;
    this.totalTricks = 0;
    this.topSpeedKmh = 0;
    this.isNewRecord = false;
    this.loadHighScore();
  }
}
