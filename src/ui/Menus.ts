import { AbilityState, ABILITIES, ABILITY_ORDER, ABILITY_GLYPH, AbilityId } from '../game/Abilities';
import { SKINS, SKIN_UNLOCK } from '../config/palettes';
import { GameModeId } from '../config/modes';
import { Api, LeaderboardScope, LeaderboardWindow } from '../net/Api';

export { ABILITY_GLYPH };

interface Achievement {
  id: string;
  name: string;
  desc: string;
  glyph: string;
  /** Current progress toward `goal`, read from persisted stats. */
  value: (s: Stats) => number;
  goal: number;
}

interface Stats {
  bestScore: number;
  bestDistance: number;
  bestCombo: number;
  lifetimeCoins: number;
  totalRuns: number;
  perfects: number;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first',    name: 'First Light',      desc: 'Finish a run',                       glyph: '✦', value: s => s.totalRuns,     goal: 1 },
  { id: 'far',      name: 'Long Causeway',    desc: 'Reach 500m in a single run',         glyph: '➤', value: s => s.bestDistance,  goal: 500 },
  { id: 'farther',  name: 'Beyond the Mist',  desc: 'Reach 1500m in a single run',        glyph: '✧', value: s => s.bestDistance,  goal: 1500 },
  { id: 'combo',    name: 'Unbroken',         desc: 'Hold a x15 combo',                   glyph: '∞', value: s => s.bestCombo,     goal: 15 },
  { id: 'perfect',  name: 'On the Beat',      desc: 'Land 100 perfect bounces',           glyph: '✹', value: s => s.perfects,      goal: 100 },
  { id: 'coins',    name: 'Gilded',           desc: 'Collect 500 coins',                  glyph: '◆', value: s => s.lifetimeCoins, goal: 500 },
  { id: 'score',    name: 'Ascendant',        desc: 'Score 50,000 in a run',              glyph: '★', value: s => s.bestScore,     goal: 50000 },
  { id: 'devoted',  name: 'Devoted',          desc: 'Complete 50 runs',                   glyph: '❁', value: s => s.totalRuns,     goal: 50 },
  { id: 'steps',    name: 'First Steps',      desc: 'Travel 100m in one run',             glyph: '·', value: s => s.bestDistance,  goal: 100 },
  { id: 'mile',     name: 'The Long Mile',    desc: 'Reach 3000m in a single run',        glyph: '⟶', value: s => s.bestDistance,  goal: 3000 },
  { id: 'combo30',  name: 'Metronome',        desc: 'Hold a x30 combo',                   glyph: '◈', value: s => s.bestCombo,     goal: 30 },
  { id: 'perf10',   name: 'Finding Rhythm',   desc: 'Land 10 perfect bounces',            glyph: '✷', value: s => s.perfects,      goal: 10 },
  { id: 'perf500',  name: 'Clockwork',        desc: 'Land 500 perfect bounces',           glyph: '⧗', value: s => s.perfects,      goal: 500 },
  { id: 'coin50',   name: 'Magpie',           desc: 'Collect 50 coins',                   glyph: '◇', value: s => s.lifetimeCoins, goal: 50 },
  { id: 'coin2k',   name: 'Treasury',         desc: 'Collect 2,000 coins',                glyph: '❖', value: s => s.lifetimeCoins, goal: 2000 },
  { id: 'score10k', name: 'Rising Star',      desc: 'Score 10,000 in a run',              glyph: '✩', value: s => s.bestScore,     goal: 10000 },
  { id: 'score200k',name: 'Empyrean',         desc: 'Score 200,000 in a run',             glyph: '✵', value: s => s.bestScore,     goal: 200000 },
  { id: 'runs10',   name: 'Regular',          desc: 'Complete 10 runs',                   glyph: '❂', value: s => s.totalRuns,     goal: 10 },
  { id: 'runs200',  name: 'Pilgrim',          desc: 'Complete 200 runs',                  glyph: '✜', value: s => s.totalRuns,     goal: 200 },
  { id: 'abil',     name: 'Attuned',          desc: 'Unlock every ability',               glyph: '❈', value: s => (s.lifetimeCoins >= 1400 ? 5 : Math.min(4, [0,150,400,800,1400].filter(t => s.lifetimeCoins >= t).length)), goal: 5 },
  { id: 'skins',    name: 'Collector',        desc: 'Unlock 8 chassis',                   glyph: '◐', value: s => Object.values(SKIN_UNLOCK).filter(v => s.lifetimeCoins >= v).length, goal: 16 },
];

/**
 * Master Controller for all menu panels, settings, username onboarding, and leaderboards.
 */
export class Menus {
  private pauseEl: HTMLElement | null;
  private openPage: HTMLElement | null = null;
  private paused = false;

  // Leaderboard filters
  private boardMode: GameModeId = 'arcade';
  private boardScope: LeaderboardScope = 'global';
  private boardWindow: LeaderboardWindow = 'all';

  onResume?: () => void;
  onRestart?: () => void;
  onQuit?: () => void;
  onSelectMode?: (id: GameModeId) => void;
  onSelectSkin?: (id: string) => void;

  constructor(private abilities: AbilityState) {
    this.pauseEl = document.getElementById('pause-screen');
    this.wireLinks();
    this.wirePause();
    this.wireSettings();
    this.wireSkins();
    this.wireUsernameModal();

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.openPage) { this.closePage(); e.stopPropagation(); }
    });

    // Check if initial username prompt is needed on startup
    window.setTimeout(() => {
      if (!Api.hasPromptedUsername()) {
        this.openUsernameModal();
      }
    }, 800);
  }

  // ---------------------------------------------------------------- pages

  private wireLinks(): void {
    const open = (id: string, build?: () => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      build?.();
      this.openPage?.classList.remove('on');
      el.classList.add('on');
      this.openPage = el;
    };
    document.getElementById('btn-settings')?.addEventListener('click', () => open('page-settings', () => this.refreshProfileUI()));
    document.getElementById('btn-achievements')?.addEventListener('click', () => open('page-achievements', () => this.buildAchievements()));
    document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
      this.openPage?.classList.remove('on');
      const el = document.getElementById('page-leaderboard');
      el?.classList.add('on');
      document.body.classList.add('board-open');
      this.openPage = el;
      this.buildLeaderboard();
    });
    document.getElementById('btn-abilities')?.addEventListener('click', () => this.openAbilities());
    document.getElementById('btn-pause-settings')?.addEventListener('click', () => open('page-settings', () => this.refreshProfileUI()));

    document.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => this.closePage());
    });
    // Clicking the scrim closes; clicking the card does not.
    document.querySelectorAll('.page').forEach((pg) => {
      pg.addEventListener('click', (e) => { if (e.target === pg) this.closePage(); });
    });
  }

  /** Public so the title screen can open the ability picker. */
  openAbilities(): void {
    const el = document.getElementById('page-abilities');
    if (!el) return;
    this.buildAbilities();
    this.openPage?.classList.remove('on');
    el.classList.add('on');
    this.openPage = el;
  }

  public isMenuOpen(): boolean {
    const modal = document.getElementById('modal-username');
    const isModalActive = modal?.classList.contains('active');
    return !!this.openPage || !!isModalActive;
  }

  private closePage(): void {
    this.openPage?.classList.remove('on');
    document.body.classList.remove('board-open');
    this.openPage = null;
  }

  // ---------------------------------------------------------------- username modal

  public openUsernameModal(): void {
    const modal = document.getElementById('modal-username');
    if (!modal) return;

    // Never over the load screen. Auth resolves during a cold load, so this
    // was opening while the ascent was still climbing — and its full-screen
    // blurred backdrop washed the whole thing out. Asking someone to name
    // themselves before the game has appeared is the wrong order anyway.
    const preloader = document.getElementById('preloader');
    if (preloader && !preloader.classList.contains('dismissed')) {
      window.setTimeout(() => this.openUsernameModal(), 400);
      return;
    }
    const input = document.getElementById('input-username') as HTMLInputElement | null;
    if (input) {
      input.value = Api.getProfile().displayName;
    }
    modal.classList.add('active');
  }

  public closeUsernameModal(): void {
    const modal = document.getElementById('modal-username');
    modal?.classList.remove('active');
    Api.setPromptedUsername(true);
  }

  private wireUsernameModal(): void {
    const modal = document.getElementById('modal-username');
    const input = document.getElementById('input-username') as HTMLInputElement | null;
    const btnRandom = document.getElementById('btn-random-username');
    const btnSave = document.getElementById('btn-save-username');
    const btnSkip = document.getElementById('btn-skip-username');
    const btnClose = document.getElementById('btn-close-username');

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) this.closeUsernameModal();
    });

    btnRandom?.addEventListener('click', (e) => {
      e.stopPropagation();
      const prefixes = ['Wanderer', 'Zephyr', 'Nova', 'Echo', 'Orbit', 'Vortex', 'Kaira', 'Solace', 'Aurora', 'Vesper'];
      const randPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const randNum = Math.floor(1000 + Math.random() * 9000);
      if (input) {
        input.value = `${randPrefix} ${randNum}`;
        input.focus();
      }
    });

    const submit = async () => {
      if (!input) return;
      const val = input.value.trim();
      if (val.length >= 2 && val.length <= 20) {
        await Api.updateDisplayName(val);
        this.closeUsernameModal();
        this.refreshProfileUI();
      } else {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
      }
    };

    btnSave?.addEventListener('click', (e) => {
      e.stopPropagation();
      submit();
    });

    btnSkip?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeUsernameModal();
    });

    btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeUsernameModal();
    });

    input?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    input?.addEventListener('keyup', (e) => {
      e.stopPropagation();
    });
  }

  // ---------------------------------------------------------------- pause

  private wirePause(): void {
    document.getElementById('hud-pause')?.addEventListener('click', () => this.setPaused(true));
    document.getElementById('btn-resume')?.addEventListener('click', () => { this.setPaused(false); this.onResume?.(); });
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => { this.setPaused(false); this.onRestart?.(); });
    document.getElementById('btn-pause-title')?.addEventListener('click', () => { this.setPaused(false); this.onQuit?.(); });
  }

  get isPaused(): boolean { return this.paused; }

  setPaused(on: boolean): void {
    this.paused = on;
    document.body.classList.toggle('paused', on);
    this.pauseEl?.classList.toggle('on', on);
    if (!on) this.closePage();
  }

  /** Refresh the pause panel's run summary. */
  setPauseStats(score: number, distance: number, combo: number, section: string): void {
    const set = (id: string, v: string) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== v) el.textContent = v;
    };
    set('pause-score', Math.floor(score).toLocaleString());
    set('pause-dist', `${Math.floor(distance)}m`);
    set('pause-combo', `x${combo}`);
    const t = document.querySelector('.pause-title');
    if (t && t.textContent !== section) t.textContent = section;
  }

  // ------------------------------------------------------------- settings & profile

  private refreshProfileUI(): void {
    const profile = Api.getProfile();
    const nameInput = document.getElementById('set-profile-name') as HTMLInputElement | null;
    const tagEl = document.getElementById('profile-tag');
    const authStatusEl = document.getElementById('profile-auth-status');

    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = profile.displayName;
    }
    if (tagEl) {
      tagEl.textContent = `#${profile.shortId}`;
    }
    if (authStatusEl) {
      authStatusEl.textContent = profile.isAnonymous ? 'Anonymous Guest' : 'Linked Account';
    }
  }

  private wireSettings(): void {
    // 1. Profile display name editing
    const nameInput = document.getElementById('set-profile-name') as HTMLInputElement | null;
    const saveBtn = document.getElementById('btn-profile-save');

    const saveName = async () => {
      if (!nameInput) return;
      const val = nameInput.value.trim();
      if (val.length >= 2 && val.length <= 20) {
        saveBtn && (saveBtn.textContent = '...');
        await Api.updateDisplayName(val);
        saveBtn && (saveBtn.textContent = 'SAVED');
        window.setTimeout(() => {
          if (saveBtn) saveBtn.textContent = 'SAVE';
        }, 1500);
      } else {
        nameInput.classList.remove('shake');
        void nameInput.offsetWidth;
        nameInput.classList.add('shake');
      }
    };

    saveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      saveName();
    });

    nameInput?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        saveName();
      }
    });

    nameInput?.addEventListener('keyup', (e) => {
      e.stopPropagation();
    });

    // 2. Account linking (OTP)
    const emailInput = document.getElementById('set-link-email') as HTMLInputElement | null;
    const otpInput = document.getElementById('set-link-otp') as HTMLInputElement | null;
    const sendOtpBtn = document.getElementById('btn-send-link-otp');
    const verifyOtpBtn = document.getElementById('btn-verify-link-otp');
    const stepEmail = document.getElementById('link-step-email');
    const stepOtp = document.getElementById('link-step-otp');
    const msgEl = document.getElementById('link-status-msg');

    emailInput?.addEventListener('keydown', (e) => e.stopPropagation());
    emailInput?.addEventListener('keyup', (e) => e.stopPropagation());
    otpInput?.addEventListener('keydown', (e) => e.stopPropagation());
    otpInput?.addEventListener('keyup', (e) => e.stopPropagation());

    sendOtpBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!emailInput) return;
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        if (msgEl) {
          msgEl.className = 'link-status-msg error';
          msgEl.textContent = 'Enter a valid email address';
        }
        return;
      }
      sendOtpBtn.textContent = 'Sending...';
      const { error } = await Api.linkEmail(email);
      if (error) {
        if (msgEl) {
          msgEl.className = 'link-status-msg error';
          msgEl.textContent = error;
        }
        sendOtpBtn.textContent = 'Link Email';
      } else {
        if (stepEmail) stepEmail.style.display = 'none';
        if (stepOtp) stepOtp.style.display = 'flex';
        if (msgEl) {
          msgEl.className = 'link-status-msg success';
          msgEl.textContent = 'Security code sent. Enter OTP to upgrade:';
        }
      }
    });

    verifyOtpBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!emailInput || !otpInput) return;
      const email = emailInput.value.trim();
      const otp = otpInput.value.trim();
      if (!otp) return;
      verifyOtpBtn.textContent = 'Verifying...';
      const { success, error } = await Api.verifyEmailOtp(email, otp);
      if (success) {
        if (msgEl) {
          msgEl.className = 'link-status-msg success';
          msgEl.textContent = 'Account linked successfully! Progress preserved.';
        }
        if (stepOtp) stepOtp.style.display = 'none';
        this.refreshProfileUI();
      } else {
        if (msgEl) {
          msgEl.className = 'link-status-msg error';
          msgEl.textContent = error || 'Invalid OTP';
        }
        verifyOtpBtn.textContent = 'Verify OTP';
      }
    });

    // 3. Sync status subscriber
    Api.subscribeSyncStatus(({ isOnline, pendingCount }) => {
      const badge = document.getElementById('sync-status-badge');
      const text = document.getElementById('sync-status-text');
      if (!badge || !text) return;

      if (!isOnline) {
        badge.className = 'sync-badge offline';
        text.textContent = 'Offline';
      } else if (pendingCount > 0) {
        badge.className = 'sync-badge pending';
        text.textContent = `Syncing (${pendingCount})`;
      } else {
        badge.className = 'sync-badge online';
        text.textContent = 'Cloud Synced';
      }
    });

    // 4. Audio & Gameplay sliders
    const bind = (id: string, key: string, apply: (v: number) => void) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      const saved = localStorage.getItem(`bounce.set.${key}`);
      if (saved !== null) {
        if (el.type === 'checkbox') el.checked = saved === '1';
        else el.value = saved;
      }
      const push = () => {
        const v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Number(el.value);
        localStorage.setItem(`bounce.set.${key}`, el.type === 'checkbox' ? String(v) : el.value);
        apply(v);
      };
      el.addEventListener('input', push);
      push();
    };
    bind('set-volume', 'volume', (v) => { (window as any).__BOUNCE_VOLUME__ = v / 100; });
    bind('set-music', 'music', (v) => { (window as any).__BOUNCE_MUSIC__ = v / 100; });
    bind('set-shake', 'shake', (v) => { (window as any).__BOUNCE_SHAKE__ = v / 100; });
    bind('set-blur', 'blur', (v) => { (window as any).__BOUNCE_BLUR__ = !!v; });
    bind('set-reticle', 'reticle', (v) => { (window as any).__BOUNCE_RETICLE__ = !!v; });
    bind('set-minhud', 'minhud', (v) => {
      document.body.classList.toggle('hud-min', !!v);
    });
    bind('set-reduced', 'reduced', (v) => {
      document.documentElement.classList.toggle('reduced-motion', !!v);
    });

    this.refreshProfileUI();
  }

  // --------------------------------------------------------- achievements

  private stats(): Stats {
    const n = (k: string) => Number(localStorage.getItem(k) ?? 0) || 0;
    return {
      bestScore: n('bounce_high_score_arcade'),
      bestDistance: n('bounce.stat.bestDistance'),
      bestCombo: n('bounce.stat.bestCombo'),
      lifetimeCoins: n('bounce.coins.lifetime'),
      totalRuns: n('bounce.stat.runs'),
      perfects: n('bounce.stat.perfects'),
    };
  }

  private buildAchievements(): void {
    const host = document.getElementById('ach-list');
    if (!host) return;
    const s = this.stats();
    let earned = 0;
    host.innerHTML = ACHIEVEMENTS.map((a) => {
      const v = Math.min(a.value(s), a.goal);
      const done = v >= a.goal;
      if (done) earned++;
      const pct = Math.round((v / a.goal) * 100);
      return `<div class="ach-row ${done ? '' : 'locked'}">
        <div class="ach-icon">${done ? a.glyph : '○'}</div>
        <div class="ach-text">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>
        <div class="ach-prog">
          <div class="ach-prog-bar"><div class="ach-prog-fill" style="width:${pct}%"></div></div>
          <div class="ach-prog-txt">${v.toLocaleString()} / ${a.goal.toLocaleString()}</div>
        </div>
      </div>`;
    }).join('');
    const c = document.getElementById('ach-count');
    const t = document.getElementById('ach-total');
    if (c) c.textContent = String(earned);
    if (t) t.textContent = String(ACHIEVEMENTS.length);
  }

  // ---------------------------------------------------------- leaderboard

  public setLeaderboardMode(mode: GameModeId): void {
    this.boardMode = mode;
    this.buildLeaderboard();
  }

  private async buildLeaderboard(): Promise<void> {
    const host = document.getElementById('lb-list');
    const yourBestEl = document.getElementById('lb-your-best');
    const metricHeader = document.getElementById('lb-metric-header');
    if (!host) return;

    // Update header label
    if (metricHeader) {
      metricHeader.textContent = this.boardMode === 'time_attack' ? 'Best Time' : 'Score';
    }

    // Wire up tab buttons
    this.wireLeaderboardControls();

    host.innerHTML = `<div class="board-empty">Fetching Celestial Rankings...</div>`;

    const rows = await Api.getLeaderboard(
      this.boardMode,
      this.boardWindow,
      this.boardScope,
      100
    );

    if (rows.length === 0) {
      host.innerHTML = `<div class="board-empty">No records found for this window. Be the first!</div>`;
      if (yourBestEl) yourBestEl.textContent = '--';
      return;
    }

    const fmtTime = (t: number) => {
      const m = Math.floor(t / 60);
      const s2 = t - m * 60;
      return `${String(m).padStart(2, '0')}:${s2.toFixed(3).padStart(6, '0')}`;
    };

    const isTimeAttack = this.boardMode === 'time_attack';

    let youEntry = rows.find(r => r.isYou);

    host.innerHTML = rows.slice(0, 100).map((r, i) => {
      const rank = r.rank || i + 1;
      const medal = rank <= 3
        ? `<div class="board-medal"><span>${rank}</span></div>`
        : `<div class="board-rank">${rank}</div>`;
      const shortTag = r.userId ? `<span class="board-player-tag">#${r.userId.slice(0, 4)}</span>` : '';
      const metricVal = isTimeAttack ? fmtTime(r.runTime) : r.score.toLocaleString('en-US');

      return `<div class="board-row ${r.isYou ? 'you' : ''} r${rank <= 3 ? rank : ''}" style="animation-delay:${Math.min(i, 12) * 36}ms">
        ${medal}
        <div class="board-name">${r.displayName}${shortTag}</div>
        <div class="board-time">${metricVal}</div>
      </div>`;
    }).join('');

    // Set "Your Best" footer
    if (yourBestEl) {
      if (youEntry) {
        const val = isTimeAttack ? fmtTime(youEntry.runTime) : `${youEntry.score.toLocaleString('en-US')} pts`;
        yourBestEl.textContent = `Rank #${youEntry.rank} · ${val}`;
      } else {
        const savedScore = Number(localStorage.getItem(`bounce_high_score_${this.boardMode}`) ?? 0) || 0;
        const savedTime = Number(localStorage.getItem(`bounce_best_time_${this.boardMode}`) ?? 0) || 0;
        if (isTimeAttack && savedTime > 0) {
          yourBestEl.textContent = fmtTime(savedTime);
        } else if (savedScore > 0) {
          yourBestEl.textContent = `${savedScore.toLocaleString('en-US')} pts`;
        } else {
          yourBestEl.textContent = '--';
        }
      }
    }
  }

  private wireLeaderboardControls(): void {
    // Mode tabs
    document.querySelectorAll<HTMLElement>('.board-mode-tab').forEach((tab) => {
      tab.onclick = () => {
        const mode = tab.dataset.mode as GameModeId;
        if (!mode || mode === this.boardMode) return;
        document.querySelectorAll('.board-mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.boardMode = mode;
        this.buildLeaderboard();
      };
      tab.classList.toggle('active', tab.dataset.mode === this.boardMode);
    });

    // Scope tabs (Global / Friends / Me)
    document.querySelectorAll<HTMLElement>('#lb-scope-tabs .board-tab').forEach((tab) => {
      tab.onclick = () => {
        const scope = tab.dataset.scope as LeaderboardScope;
        if (!scope || scope === this.boardScope) return;
        document.querySelectorAll('#lb-scope-tabs .board-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.boardScope = scope;
        this.buildLeaderboard();
      };
      tab.classList.toggle('active', tab.dataset.scope === this.boardScope);
    });

    // Window tabs (All-Time / Week / Today)
    document.querySelectorAll<HTMLElement>('.board-win-tab').forEach((tab) => {
      tab.onclick = () => {
        const win = tab.dataset.window as LeaderboardWindow;
        if (!win || win === this.boardWindow) return;
        document.querySelectorAll('.board-win-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.boardWindow = win;
        this.buildLeaderboard();
      };
      tab.classList.toggle('active', tab.dataset.window === this.boardWindow);
    });
  }

  // ------------------------------------------------------------ abilities

  private buildAbilities(): void {
    const host = document.getElementById('ability-list');
    if (!host) return;

    const coins = this.abilities.lifetimeCoins;
    const next = this.abilities.nextLocked();

    const bank = `
      <div class="ab-bank">
        <div class="ab-bank-main">
          <div class="ab-bank-label">Coins Collected</div>
          <div class="ab-bank-value">${coins.toLocaleString()}</div>
        </div>
        ${next ? `
        <div class="ab-bank-next">
          <div class="ab-bank-label">Next Unlock &mdash; ${ABILITIES[next.id].name}</div>
          <div class="ach-prog-bar"><div class="ach-prog-fill" style="width:${(coins / next.need * 100).toFixed(1)}%"></div></div>
          <div class="ab-bank-need">${next.remaining.toLocaleString()} more</div>
        </div>` : `
        <div class="ab-bank-next">
          <div class="ab-bank-label">All Abilities Unlocked</div>
          <div class="ab-bank-need">Coins now go straight to charge</div>
        </div>`}
      </div>
      <div class="ab-hint">
        Coins do two jobs: they add up across every run to unlock abilities, and
        within a run they fill the meter that fires the one you have equipped.
      </div>`;

    const rows = ABILITY_ORDER.map((id) => {
      const d = ABILITIES[id];
      const unlocked = this.abilities.isUnlocked(id);
      const equipped = this.abilities.equipped === id;
      const pct = Math.min(100, (coins / Math.max(1, d.unlockAt)) * 100);

      const aside = !unlocked
        ? `<div class="ach-prog">
             <div class="ach-prog-bar"><div class="ach-prog-fill" style="width:${pct.toFixed(1)}%"></div></div>
             <div class="ach-prog-txt">${coins.toLocaleString()} / ${d.unlockAt.toLocaleString()}</div>
           </div>`
        : `<div class="ab-badge ${equipped ? 'on' : ''}">${equipped ? 'Equipped' : 'Equip'}</div>`;

      const meta = unlocked
        ? `<span class="ab-meta">${d.charge} coins per use</span>`
        : `<span class="ab-meta locked">Locked &mdash; ${(d.unlockAt - coins).toLocaleString()} coins to go</span>`;

      return `<div class="ab-row ${equipped ? 'equipped' : ''} ${unlocked ? '' : 'locked'}" data-ability="${id}">
        <div class="ab-icon" style="color:#${d.tint.toString(16).padStart(6, '0')}">${ABILITY_GLYPH[id]}${
          unlocked ? '' : '<svg class="ab-lock" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-lock"/></svg>'}</div>
        <div class="ach-text">
          <div class="ab-name">${d.name}</div>
          <div class="ab-desc">${d.blurb}</div>
          ${meta}
        </div>
        ${aside}
      </div>`;
    }).join('');

    host.innerHTML = bank + rows;

    host.querySelectorAll<HTMLElement>('.ab-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.ability as AbilityId;
        if (this.abilities.equip(id)) {
          Api.setEquippedAbility(id);
          this.buildAbilities();
        } else {
          row.classList.add('shake');
          window.setTimeout(() => row.classList.remove('shake'), 420);
        }
      });
    });
  }

  /** Re-sync anything that depends on lifetime coins, after a mid-run unlock. */
  public refresh(): void {
    this.syncSkinLocks();
    if (document.getElementById('page-abilities')?.classList.contains('on')) {
      this.buildAbilities();
    }
  }

  // ----------------------------------------------------------- cosmetics

  private syncSkinLocks(): void {
    const coins = this.abilities.lifetimeCoins;
    document.querySelectorAll<HTMLElement>('.skin-btn').forEach((btn) => {
      const id = btn.dataset.skin ?? '';
      const need = SKIN_UNLOCK[id] ?? 0;
      const unlocked = coins >= need;
      btn.classList.toggle('locked', !unlocked);
      btn.title = unlocked
        ? (SKINS[id]?.name ?? id)
        : `${SKINS[id]?.name ?? id} — ${need.toLocaleString()} coins`;
    });
  }

  private wireSkins(): void {
    this.syncSkinLocks();
    document.querySelectorAll<HTMLElement>('.skin-btn').forEach((btn) => {
      const id = btn.dataset.skin ?? '';
      btn.addEventListener('click', () => {
        if (this.abilities.lifetimeCoins < (SKIN_UNLOCK[id] ?? 0)) return;
        document.querySelectorAll('.skin-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        Api.setEquippedSkin(id);
        this.onSelectSkin?.(id);
      });
    });
  }
}
