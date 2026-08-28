import { ScoreManager } from '../core/ScoreManager';
import { AbilityState, ABILITIES } from '../game/Abilities';

/**
 * Performance Rank Breakdown
 */
/**
 * Rank bands. The colours here were the last of the scrapped neon palette —
 * acid yellow, cyan, spring green — landing on a screen built in gold, ivory
 * and navy. They are now drawn from the celestial set, warming from stone
 * through to gilt as the run gets better.
 */
function getRankForScore(score: number): { letter: string; color: string; label: string } {
  if (score >= 3800) return { letter: 'S', color: '#C8A868', label: 'ASCENDANT' };
  if (score >= 2600) return { letter: 'A', color: '#B88F4A', label: 'CELESTIAL' };
  if (score >= 1600) return { letter: 'B', color: '#8FB07C', label: 'SUREFOOTED' };
  if (score >= 900)  return { letter: 'C', color: '#7C93B0', label: 'STEADY PACE' };
  if (score >= 400)  return { letter: 'D', color: '#C99AA0', label: 'FIRST FLIGHT' };
  return { letter: 'E', color: '#9AA3B2', label: 'SCRATCH' };
}

/**
 * Game Over & Results Screen UI Controller for BOUNCE
 * Features:
 * - Pure arcade typography (0 emojis)
 * - Dynamic Rank Letter (S / A / B / C / D / E)
 * - Animated score roll-up payout
 * - 6-way performance grid
 * - Instant retry / title return
 */
export class GameOverScreen {
  private screenEl: HTMLElement;
  private btnReplay: HTMLElement | null;
  private btnTitle: HTMLElement | null;
  private resHeading: HTMLElement | null;
  private resRankLetter: HTMLElement | null;
  private resRankLabel: HTMLElement | null;
  private resScore: HTMLElement | null;
  private resDist: HTMLElement | null;
  private resCombo: HTMLElement | null;
  private resPerfect: HTMLElement | null;
  private resBreaks: HTMLElement | null;
  private resBest: HTMLElement | null;
  private newRecordBadge: HTMLElement | null;
  private unlockPanel: HTMLElement | null;
  private unlockLabel: HTMLElement | null;
  private unlockCount: HTMLElement | null;
  private unlockFill: HTMLElement | null;
  private unlockNote: HTMLElement | null;
  /** Set by Game so the results screen can report unlock progress. */
  public abilities: AbilityState | null = null;

  private onReplayCallback?: () => void;
  private onTitleCallback?: () => void;

  constructor() {
    this.screenEl = document.getElementById('screen-results')!;
    this.btnReplay = document.getElementById('btn-restart');
    this.btnTitle = document.getElementById('btn-results-title');
    this.resHeading = document.getElementById('results-heading');
    this.resRankLetter = document.getElementById('results-rank-letter');
    this.resRankLabel = document.getElementById('results-rank-label');
    this.resScore = document.getElementById('results-score');
    this.resDist = document.getElementById('results-distance');
    this.resCombo = document.getElementById('results-combo');
    this.resPerfect = document.getElementById('results-perfects');
    this.resBreaks = document.getElementById('results-breaks');
    this.resBest = document.getElementById('results-best');
    this.newRecordBadge = document.getElementById('results-record-badge');
    this.unlockPanel = document.getElementById('results-unlock');
    this.unlockLabel = document.getElementById('results-unlock-label');
    this.unlockCount = document.getElementById('results-unlock-count');
    this.unlockFill = document.getElementById('results-unlock-fill');
    this.unlockNote = document.getElementById('results-unlock-note');

    if (this.btnReplay) {
      this.btnReplay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onReplayCallback) this.onReplayCallback();
      });
    }

    if (this.btnTitle) {
      this.btnTitle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onTitleCallback) this.onTitleCallback();
      });
    }
  }

  /**
   * Where this run's coins left the player on the unlock track. The bar starts
   * at where they began the run and animates to where they finished, so the
   * contribution is visible rather than inferred.
   */
  private showUnlockTrack(earnedThisRun: number): void {
    const ab = this.abilities;
    if (!this.unlockPanel) return;
    if (!ab) { this.unlockPanel.style.display = 'none'; return; }
    this.unlockPanel.style.display = '';

    const next = ab.nextLocked();
    const total = ab.lifetimeCoins;

    if (!next) {
      this.unlockPanel.classList.remove('earned');
      if (this.unlockLabel) this.unlockLabel.textContent = 'All Abilities Unlocked';
      if (this.unlockCount) this.unlockCount.textContent = `+${earnedThisRun} this run`;
      if (this.unlockFill) this.unlockFill.style.width = '100%';
      if (this.unlockNote) {
        this.unlockNote.textContent = `${total.toLocaleString('en-US')} coins collected all-time`;
      }
      return;
    }

    const d = ABILITIES[next.id];
    // Did this run cross the line? `earnedThisRun` coins ago we were below it.
    const justEarned = total - earnedThisRun < d.unlockAt && total >= d.unlockAt;
    this.unlockPanel.classList.toggle('earned', justEarned);

    if (this.unlockLabel) {
      this.unlockLabel.textContent = justEarned ? `Unlocked \u2014 ${d.name}` : `Next Unlock \u2014 ${d.name}`;
    }
    if (this.unlockCount) {
      this.unlockCount.textContent =
        `${total.toLocaleString('en-US')} / ${d.unlockAt.toLocaleString('en-US')}`;
    }
    if (this.unlockFill) {
      const from = Math.min(100, ((total - earnedThisRun) / d.unlockAt) * 100);
      const to = Math.min(100, (total / d.unlockAt) * 100);
      this.unlockFill.style.transition = 'none';
      this.unlockFill.style.width = `${from.toFixed(1)}%`;
      void this.unlockFill.offsetWidth;
      this.unlockFill.style.transition = '';
      this.unlockFill.style.width = `${to.toFixed(1)}%`;
    }
    if (this.unlockNote) {
      this.unlockNote.textContent = earnedThisRun > 0
        ? `+${earnedThisRun} this run \u00B7 ${next.remaining.toLocaleString('en-US')} to go`
        : `${next.remaining.toLocaleString('en-US')} coins to go`;
    }
  }

  public setOnReplay(cb: () => void): void {
    this.onReplayCallback = cb;
  }

  public setOnTitle(cb: () => void): void {
    this.onTitleCallback = cb;
  }

  public show(scoreManager: ScoreManager, isVictory: boolean = false): void {
    if (this.resHeading) {
      this.resHeading.textContent = isVictory ? 'COURSE CLEARED' : 'RUN OVER';
    }

    this.showUnlockTrack(scoreManager.coins);

    const rank = getRankForScore(scoreManager.score);
    if (this.resRankLetter) {
      this.resRankLetter.textContent = rank.letter;
      this.resRankLetter.style.color = rank.color;
      this.resRankLetter.style.textShadow = `0 0 30px ${rank.color}`;
    }
    if (this.resRankLabel) {
      this.resRankLabel.textContent = rank.label;
      this.resRankLabel.style.color = rank.color;
    }

    // Animated score payout
    const targetScore = scoreManager.score;
    if (this.resScore) {
      const t0 = performance.now();
      const dur = Math.min(1100, 300 + targetScore / 800);
      const tick = () => {
        const k = Math.min(1.0, (performance.now() - t0) / dur);
        const ease = 1 - Math.pow(1 - k, 3);
        if (this.resScore) {
          this.resScore.textContent = Math.floor(targetScore * ease).toLocaleString('en-US');
        }
        if (k < 1.0 && this.screenEl.classList.contains('active')) {
          requestAnimationFrame(tick);
        } else if (this.resScore) {
          this.resScore.textContent = targetScore.toLocaleString('en-US');
        }
      };
      tick();
    }

    if (this.resDist) {
      if (scoreManager.currentMode === 'time_attack') {
        this.resDist.textContent = `${scoreManager.runTime.toFixed(2)}s`;
      } else {
        this.resDist.textContent = `${Math.floor(scoreManager.distance).toLocaleString('en-US')}m`;
      }
    }
    if (this.resCombo) this.resCombo.textContent = `x${scoreManager.maxCombo}`;
    if (this.resPerfect) this.resPerfect.textContent = scoreManager.perfectLandings.toString();
    // The grid labels this cell "Coins"; it was printing speed breaks and near
    // misses, so the number that drives every unlock never appeared on the one
    // screen a player reads after a run.
    if (this.resBreaks) this.resBreaks.textContent = scoreManager.coins.toLocaleString('en-US');
    if (this.resBest) this.resBest.textContent = scoreManager.highScore.toLocaleString('en-US');

    if (this.newRecordBadge) {
      this.newRecordBadge.style.display = scoreManager.isNewRecord ? 'inline-block' : 'none';
    }

    this.screenEl.classList.add('active');
  }

  public hide(): void {
    this.screenEl.classList.remove('active');
  }
}
