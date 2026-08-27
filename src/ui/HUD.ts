import { ScoreManager } from '../core/ScoreManager';
import { CourseSegment } from '../world/CourseSegment';

export type BannerType = 'perfect' | 'near-miss' | 'trick' | 'combo-streak' | 'warn';

const GAUGE_R = 48;
const GAUGE_SWEEP = 250;
const GAUGE_START = 145;

function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = ((startDeg + sweepDeg) * Math.PI) / 180;
  const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Arcade Kinetic Graphic HUD Controller for BOUNCE
 * 100% bespoke machined arcade aesthetics, custom SVG gauges, zero emojis
 */
export class HUD {
  private hudLayer: HTMLElement;
  private comboCard: HTMLElement;
  private comboVal: HTMLElement;
  private comboSubtext: HTMLElement;
  private comboBarFill: HTMLElement | null;
  private scoreVal: HTMLElement;
  private distanceVal: HTMLElement;
  private bestVal: HTMLElement;
  private timeVal: HTMLElement;
  private speedVal: HTMLElement;
  private nextUpDesc: HTMLElement | null;
  private floaterContainer: HTMLElement;
  private ghostDeltaBadge: HTMLElement;
  private flashVignette: HTMLElement | null;

  // Persistent Controls Badges

  // Animated rolling score & last values
  private dialArc: SVGCircleElement | null = null;
  private progressFill: HTMLElement | null = null;
  private progressPip: HTMLElement | null = null;
  private sectionName: HTMLElement | null = null;
  private bestTimeVal: HTMLElement | null = null;
  private boostSegs: HTMLElement[] = [];
  private progressPct: HTMLElement | null = null;
  private minimapPip: HTMLElement | null = null;
  private minimapRoute: SVGPathElement | null = null;

  private last = {
    score: -1,
    dist: -1,
    time: -1,
    combo: -1,
    speed: -1,
    best: -1,
    tier: -1,
    boost: -1,
  };

  constructor() {
    this.hudLayer = document.getElementById('hud-layer')!;
    this.comboCard = document.getElementById('combo-card')!;
    this.comboVal = document.getElementById('combo-val')!;
    this.comboSubtext = document.getElementById('combo-subtext')!;
    this.comboBarFill = document.getElementById('combo-bar-fill');
    this.scoreVal = document.getElementById('score-val')!;
    this.distanceVal = document.getElementById('distance-val')!;
    this.bestVal = document.getElementById('best-val')!;
    this.timeVal = document.getElementById('time-val')!;
    this.speedVal = document.getElementById('speed-val')!;
    this.dialArc = document.getElementById('dial-arc') as unknown as SVGCircleElement | null;
    this.progressFill = document.getElementById('progress-fill');
    this.progressPip = document.getElementById('progress-pip');
    this.sectionName = document.getElementById('section-name');
    this.bestTimeVal = document.getElementById('best-time-val');
    this.boostSegs = Array.from(document.querySelectorAll('#boost-segs .boost-seg')) as HTMLElement[];
    this.progressPct = document.getElementById('progress-pct');
    this.minimapPip = document.getElementById('minimap-pip');
    this.minimapRoute = document.getElementById('minimap-route') as unknown as SVGPathElement | null;
    this.nextUpDesc = document.getElementById('next-up-desc');
    this.floaterContainer = document.getElementById('floater-container')!;
    this.ghostDeltaBadge = document.getElementById('ghost-delta-badge')!;
    this.flashVignette = document.getElementById('flash-vignette');

    this.buildSpeedometerDial();
  }

  private buildSpeedometerDial(): void {
    const svg = document.getElementById('speed-svg');
    if (!svg) return;

    const fullD = arcPath(66, 66, GAUGE_R, GAUGE_START, GAUGE_SWEEP);
    const bgPath = document.getElementById('speed-bg-path');
    if (bgPath) bgPath.setAttribute('d', fullD);

    // Render radial dial tick lines
    for (let i = 0; i <= 10; i++) {
      const a = ((GAUGE_START + (i / 10) * GAUGE_SWEEP) * Math.PI) / 180;
      const r0 = GAUGE_R + 6, r1 = GAUGE_R + (i % 5 === 0 ? 12 : 9);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String((66 + Math.cos(a) * r0).toFixed(1)));
      line.setAttribute('y1', String((66 + Math.sin(a) * r0).toFixed(1)));
      line.setAttribute('x2', String((66 + Math.cos(a) * r1).toFixed(1)));
      line.setAttribute('y2', String((66 + Math.sin(a) * r1).toFixed(1)));
      line.setAttribute('stroke', i > 7 ? 'rgba(255,42,133,0.7)' : 'rgba(241,240,234,0.25)');
      line.setAttribute('stroke-width', i % 5 === 0 ? '2' : '1.2');
      svg.appendChild(line);
    }
  }

  public show(on: boolean): void {
    // The ability meter lives outside the HUD layer so it can sit centred, so
    // it needs the run state signalled separately.
    document.body.classList.toggle('playing', on);
    if (this.hudLayer) {
      if (on) {
        this.hudLayer.classList.add('on');
      } else {
        this.hudLayer.classList.remove('on');
      }
    }
  }

  public setDanger(on: boolean): void {
    if (this.flashVignette) {
      if (on) {
        this.flashVignette.classList.add('danger');
      } else {
        this.flashVignette.classList.remove('danger');
      }
    }
  }

  /**
   * Per-frame HUD refresh.
   *
   * Ordered by the spec's information hierarchy — combo, speed, time and
   * progress, next event, then supporting info — and every write is gated on a
   * changed value, because touching the DOM sixty times a second for numbers
   * that did not move is the whole cost of a HUD like this.
   */
  public update(
    scoreManager: ScoreManager,
    speedKmh: number,
    boostFloats: number,
    nextSeg: CourseSegment | null,
    _dashCooldown: number,
    _slamCooldown: number,
    _isSlamming: boolean,
    _perfectArmed: boolean,
    _isWhiffed: boolean,
    _inWindow: boolean,
    ghostDelta: { deltaDist: number; deltaTime: number } | null,
    targetFinishDist: number = 1400
  ): void {
    // 1. Combo — top of the hierarchy, so it is the only loud element.
    const combo = scoreManager.combo;
    if (combo !== this.last.combo) {
      this.last.combo = combo;
      this.comboVal.innerHTML = `<span class="x">x</span>${combo}`;
      const tier = combo >= 40 ? 'TRANSCENDENT'
        : combo >= 25 ? 'RADIANT'
        : combo >= 15 ? 'SOARING'
        : combo >= 8 ? 'RISING'
        : combo >= 3 ? 'STEADY' : 'STEADY';
      if (this.comboSubtext.textContent !== tier) this.comboSubtext.textContent = tier;
    }
    // The bar is the combo's clock: it is the only thing telling the player
    // their multiplier is draining.
    if (this.comboBarFill) {
      const frac = Math.max(0, Math.min(1, scoreManager.comboTimer / 3.4));
      this.comboBarFill.style.width = `${(frac * 100).toFixed(1)}%`;
    }

    // 2. Speed dial.
    const displaySpeed = Math.round(speedKmh);
    if (displaySpeed !== this.last.speed) {
      this.last.speed = displaySpeed;
      this.speedVal.textContent = String(displaySpeed);
      if (this.dialArc) {
        // 236 is the circle's circumference; the visible sweep is 3/4 of it.
        const frac = Math.max(0, Math.min(1, speedKmh / 200));
        this.dialArc.style.strokeDashoffset = String(236 - frac * 176);
      }
    }

    // 3. Time, and the best time it is measured against.
    const t = scoreManager.runTime;
    if (Math.abs(t - this.last.time) > 0.01) {
      this.last.time = t;
      this.timeVal.textContent = HUD.formatTime(t);
    }
    if (this.bestTimeVal) {
      const hasBest = scoreManager.bestTime > 0 && scoreManager.bestTime < 9000;
      const bt = hasBest ? HUD.formatTime(scoreManager.bestTime) : '--:--.--';
      const txt = `BEST ${bt}`;
      if (this.bestTimeVal.textContent !== txt) this.bestTimeVal.textContent = txt;
    }

    // 4. Progress along the run.
    if (this.progressFill && this.progressPip) {
      const frac = Math.max(0, Math.min(1, scoreManager.distance / targetFinishDist));
      const pct = `${(frac * 100).toFixed(1)}%`;
      this.progressFill.style.width = pct;
      this.progressPip.style.left = pct;
    }
    if (this.progressPct) {
      const pct = Math.round(Math.max(0, Math.min(1, scoreManager.distance / targetFinishDist)) * 100);
      const txt = `${pct}%`;
      if (this.progressPct.textContent !== txt) this.progressPct.textContent = txt;
    }
    // Run the minimap marker along the route path, so the little diagram is
    // actually reporting position rather than being decoration.
    if (this.minimapPip && this.minimapRoute) {
      const frac = Math.max(0, Math.min(1, scoreManager.distance / targetFinishDist));
      const len = this.minimapRoute.getTotalLength();
      const pt = this.minimapRoute.getPointAtLength(len * (1 - frac));
      this.minimapPip.setAttribute('x', String(pt.x - 3));
      this.minimapPip.setAttribute('y', String(pt.y - 3));
      this.minimapPip.setAttribute('transform', `rotate(45 ${pt.x} ${pt.y})`);
    }
    if (this.sectionName && nextSeg) {
      const nm = nextSeg.displayName.toUpperCase();
      if (this.sectionName.textContent !== nm) this.sectionName.textContent = nm;
    }

    // 5. Score, distance, best.
    const score = Math.floor(scoreManager.score);
    if (score !== this.last.score) {
      this.last.score = score;
      this.scoreVal.textContent = score.toLocaleString();
    }
    const distFloor = Math.floor(scoreManager.distance);
    if (distFloor !== this.last.dist) {
      this.last.dist = distFloor;
      this.distanceVal.innerHTML = `${distFloor}<span class="unit">m</span>`;
    }
    if (scoreManager.highScore !== this.last.best) {
      this.last.best = scoreManager.highScore;
      this.bestVal.textContent = Math.floor(scoreManager.highScore).toLocaleString();
    }

    // 6. Boost reservoir.
    const activeBoostSegs = Math.max(0, Math.min(this.boostSegs.length, boostFloats));
    if (activeBoostSegs !== this.last.boost) {
      this.last.boost = activeBoostSegs;
      this.boostSegs.forEach((seg, i) => seg.classList.toggle('on', i < activeBoostSegs));
    }

    // 7. Next up.
    if (this.nextUpDesc && nextSeg) {
      const nm = nextSeg.displayName.toUpperCase();
      if (this.nextUpDesc.textContent !== nm) this.nextUpDesc.textContent = nm;
    }

    // 8. Control states now live on the deck; see ui/ControlDeck.ts.

    // 9. Ghost delta.
    if (this.ghostDeltaBadge) {
      if (ghostDelta) {
        this.ghostDeltaBadge.style.display = '';
        const sign = ghostDelta.deltaTime <= 0 ? '+' : '-';
        this.ghostDeltaBadge.textContent = `GHOST ${sign}${Math.abs(ghostDelta.deltaTime).toFixed(2)}s`;
        this.ghostDeltaBadge.className =
          `ghost-delta-badge ${ghostDelta.deltaTime <= 0 ? 'ahead' : 'behind'}`;
      } else {
        this.ghostDeltaBadge.style.display = 'none';
      }
    }
  }

  private static formatTime(t: number): string {
    const m = Math.floor(t / 60);
    const sec = t - m * 60;
    return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
  }


  public pulseCombo(): void {
    this.comboCard.classList.remove('pulse');
    void this.comboCard.offsetWidth;
    this.comboCard.classList.add('pulse');
  }

  public showBanner(text: string, type: BannerType = 'perfect'): void {
    const banner = document.createElement('div');
    banner.className = `floating-banner ${type}`;
    banner.textContent = text;

    // Prune excessive floaters
    while (this.floaterContainer.children.length > 5) {
      this.floaterContainer.removeChild(this.floaterContainer.firstChild!);
    }

    this.floaterContainer.appendChild(banner);
    banner.addEventListener('animationend', () => {
      banner.remove();
    });
  }

  public reset(): void {
    this.last = {
      score: -1,
      dist: -1,
      time: -1,
      combo: -1,
      speed: -1,
      best: -1,
      tier: -1,
      boost: -1,
    };
    this.setDanger(false);
  }
}
