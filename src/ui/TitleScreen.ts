import { GameModeId, GAME_MODES } from '../config/modes';

export const SKIN_UNLOCK_SCORES: Record<string, number> = {
  cyan: 0,
  magenta: 10000,
  gold: 25000,
  violet: 50000,
  mint: 100000,
  ghost: 250000,
  inferno: 500000,
  obsidian: 1000000,
};

/**
 * Title Screen UI Controller for BOUNCE
 * Controls clean title screen, Ball Chassis selector with Unlock Locks, and Game Mode popup modal
 */
export class TitleScreen {
  private screenEl: HTMLElement;
  private btnStart: HTMLElement;
  private btnInfo: HTMLElement | null;
  private btnModeSelect: HTMLElement | null;
  private btnModeLabel: HTMLElement | null;
  private modalModes: HTMLElement | null;
  private btnCloseModes: HTMLElement | null;
  private skinSelector: HTMLElement;
  private modeSelector: HTMLElement | null;
  private titleBest: HTMLElement | null;
  private audioToggleBtn: HTMLElement | null;
  private currentBestScore: number = 0;

  private onStartCallback?: () => void;
  private onInfoCallback?: () => void;
  private onSkinSelectCallback?: (skinId: string) => void;
  private onSkinLockedCallback?: (skinId: string, reqScore: number) => void;
  private onModeSelectCallback?: (modeId: GameModeId) => void;
  private onAudioToggleCallback?: () => void;

  constructor() {
    this.screenEl = document.getElementById('screen-title')!;
    this.btnStart = document.getElementById('btn-start')!;
    this.btnInfo = document.getElementById('btn-title-info');
    this.btnModeSelect = document.getElementById('btn-mode-select');
    this.btnModeLabel = document.getElementById('btn-mode-label');
    this.modalModes = document.getElementById('modal-modes');
    this.btnCloseModes = document.getElementById('btn-close-modes');
    this.skinSelector = document.getElementById('skin-selector') || document.getElementById('skins') || document.body;
    this.modeSelector = document.getElementById('mode-selector');
    this.titleBest = document.getElementById('title-best-val');
    this.audioToggleBtn = document.getElementById('audio-toggle');

    this.initListeners();
  }

  private initListeners(): void {
    if (this.btnStart) {
      this.btnStart.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onStartCallback) this.onStartCallback();
      });
    }

    if (this.btnInfo) {
      this.btnInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onInfoCallback) this.onInfoCallback();
      });
    }

    // Mode Selector Popup Modal
    if (this.btnModeSelect && this.modalModes) {
      this.btnModeSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModeModal();
      });
    }

    if (this.btnCloseModes && this.modalModes) {
      this.btnCloseModes.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeModeModal();
      });
    }

    if (this.modalModes) {
      this.modalModes.addEventListener('click', (e) => {
        if (e.target === this.modalModes) {
          this.closeModeModal();
        }
      });
    }

    // Skin Selection Buttons with Lock Logic
    const skinButtons = this.skinSelector.querySelectorAll('.skin-btn');
    skinButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const skinId = target.dataset.skin;
        if (!skinId) return;

        const req = SKIN_UNLOCK_SCORES[skinId] ?? 0;
        if (this.currentBestScore < req) {
          target.classList.remove('shake');
          void target.offsetWidth;
          target.classList.add('shake');

          if (this.onSkinLockedCallback) {
            this.onSkinLockedCallback(skinId, req);
          }
          return;
        }

        skinButtons.forEach((b) => b.classList.remove('selected'));
        target.classList.add('selected');

        if (this.onSkinSelectCallback) {
          this.onSkinSelectCallback(skinId);
        }
      });
    });

    // Game Mode Cards inside Popup Modal
    if (this.modeSelector) {
      const modeCards = this.modeSelector.querySelectorAll('.mode-card');
      modeCards.forEach((card) => {
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = e.currentTarget as HTMLElement;
          const modeId = target.dataset.mode as GameModeId;
          if (!modeId) return;

          modeCards.forEach((c) => c.classList.remove('selected'));
          target.classList.add('selected');

          const modeConfig = GAME_MODES[modeId];
          if (this.btnModeLabel && modeConfig) {
            this.btnModeLabel.textContent = modeConfig.name.toUpperCase();
          }

          this.closeModeModal();

          if (this.onModeSelectCallback) {
            this.onModeSelectCallback(modeId);
          }
        });
      });
    }

    // Audio Toggle
    if (this.audioToggleBtn) {
      this.audioToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onAudioToggleCallback) {
          this.onAudioToggleCallback();
        }
      });
    }
  }

  public openModeModal(): void {
    if (this.modalModes) {
      this.modalModes.classList.add('active');
    }
  }

  public closeModeModal(): void {
    if (this.modalModes) {
      this.modalModes.classList.remove('active');
    }
  }

  public isModeModalOpen(): boolean {
    return this.modalModes ? this.modalModes.classList.contains('active') : false;
  }

  public setOnStart(cb: () => void): void {
    this.onStartCallback = cb;
  }

  public setOnInfo(cb: () => void): void {
    this.onInfoCallback = cb;
  }

  public setOnSkinSelect(cb: (skinId: string) => void): void {
    this.onSkinSelectCallback = cb;
  }

  public setOnSkinLocked(cb: (skinId: string, reqScore: number) => void): void {
    this.onSkinLockedCallback = cb;
  }

  public setOnModeSelect(cb: (modeId: GameModeId) => void): void {
    this.onModeSelectCallback = cb;
  }

  public setOnAudioToggle(cb: () => void): void {
    this.onAudioToggleCallback = cb;
  }

  public setAudioLabel(isMuted: boolean): void {
    if (this.audioToggleBtn) {
      this.audioToggleBtn.textContent = isMuted ? 'AUDIO OFF' : 'AUDIO ON';
    }
  }

  public updateBest(bestScore: number): void {
    this.currentBestScore = bestScore;
    if (this.titleBest) {
      this.titleBest.textContent = bestScore > 0 ? bestScore.toLocaleString('en-US') : '0';
    }

    // Update lock status on skin buttons
    const skinButtons = this.skinSelector.querySelectorAll('.skin-btn');
    skinButtons.forEach((btn) => {
      const el = btn as HTMLElement;
      const skinId = el.dataset.skin || '';
      const req = SKIN_UNLOCK_SCORES[skinId] ?? 0;
      if (bestScore >= req) {
        el.classList.remove('locked');
        el.title = `${skinId.toUpperCase()} (UNLOCKED)`;
      } else {
        el.classList.add('locked');
        el.title = `LOCKED — SCORE ${req.toLocaleString()} PTS TO UNLOCK`;
      }
    });
  }

  public updateModeBest(modeId: GameModeId, bestScore: number): void {
    const el = document.querySelector(`.mode-best[data-mode-best="${modeId}"]`);
    if (el) {
      el.textContent = bestScore > 0 ? bestScore.toLocaleString('en-US') : '0';
    }
  }

  public show(bestScore: number = 0): void {
    this.updateBest(bestScore);
    this.screenEl.classList.add('active');
  }

  public hide(): void {
    this.screenEl.classList.remove('active');
    this.closeModeModal();
  }
}
