import { AbilityState, AbilityId, ABILITIES } from '../game/Abilities';
import { CONSTANTS } from '../config/constants';
import { InputManager } from '../core/Input';

/**
 * The in-run control deck: three movement moves and the equipped ability,
 * bottom right.
 *
 * This replaces a bar of labelled key caps that sat in the bottom centre. That
 * version was readable but it was documentation — a list of what the keys are —
 * rather than instrumentation telling you what each move can do *right now*.
 * You could not see that the dash was on cooldown, that boost floats had run
 * out, or how close the ability was to charged; the only live readout was a
 * separate meter in another corner.
 *
 * Every control here is one object in one of five states, and the state is
 * carried by a single `data-state` attribute rather than a set of independent
 * classes. That is deliberate: with classes, a control could be `.active` and
 * `.cooldown` at once and paint whichever rule happened to win the cascade. One
 * attribute makes that unrepresentable.
 */
type CtlState = 'ready' | 'active' | 'charging' | 'cooldown' | 'depleted' | 'locked';

/** 2πr for the r=21.4 ring in the markup. */
const RING_CIRCUMFERENCE = 134.46;

/** Display names, which differ from the ids used everywhere else in the code. */
const ABILITY_LABEL: Record<AbilityId, string> = {
  featherfall: 'Feather Fall',
  tempo: 'Tempo',
  comet: 'Comet',
  echo: 'Echo',
  aegis: 'Aegis',
};

const ABILITY_ICON: Record<AbilityId, string> = {
  featherfall: 'ic-feather',
  tempo: 'ic-tempo',
  comet: 'ic-comet',
  echo: 'ic-echo',
  aegis: 'ic-aegis',
};

class Control {
  readonly root: HTMLElement | null;
  private readonly arc: SVGCircleElement | null;
  private state: CtlState | null = null;
  private progress = -1;
  private readonly pipHost: HTMLElement | null;
  private pipCount = -1;
  private pipLit = -1;
  private readonly segFills: SVGCircleElement[] = [];
  private segCount = -1;
  private segLen = 0;
  private segState = -1;

  constructor(id: string) {
    this.root = document.getElementById(id);
    this.arc = this.root?.querySelector<SVGCircleElement>('.ctl-ring-arc') ?? null;
    this.pipHost = this.root?.querySelector<HTMLElement>('.ctl-pips') ?? null;
  }

  /**
   * @param fill 0..1 of the ring to draw. A cooldown passes its *recovery*, so
   *   the arc grows back rather than draining — the thing you are waiting for
   *   is the ring closing.
   */
  set(state: CtlState, fill = 1): void {
    if (!this.root) return;
    if (state !== this.state) {
      this.state = state;
      this.root.dataset.state = state;
    }
    const clamped = fill <= 0 ? 0 : fill >= 1 ? 1 : fill;
    // Quantised, because writing a float to the DOM every frame for a value
    // that moves a fraction of a pixel is pure layout churn.
    const q = Math.round(clamped * 120);
    if (q !== this.progress && this.arc) {
      this.progress = q;
      this.arc.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - q / 120));
    }
  }

  /** Pulse the ring when the meter gains. */
  gain(): void {
    if (!this.root) return;
    this.root.classList.remove('gained');
    void this.root.offsetWidth;
    this.root.classList.add('gained');
    window.setTimeout(() => this.root?.classList.remove('gained'), 480);
  }

  /**
   * Build the segmented charge ring: `n` arcs with a gap between each.
   *
   * Laid out from twelve o'clock clockwise. Each segment gets a background arc
   * and a fill arc over it, so a partially-charged segment shows its fraction
   * directly rather than needing a separate meter somewhere else.
   */
  buildSegments(n: number): void {
    const host = this.root?.querySelector<SVGGElement>('.ctl-ring-segs');
    if (!host || this.segCount === n) return;
    this.segCount = n;
    this.segFills.length = 0;
    host.innerHTML = '';

    const span = RING_CIRCUMFERENCE / n;
    const gap = Math.min(9, span * 0.24);
    this.segLen = span - gap;
    const NS = 'http://www.w3.org/2000/svg';

    for (let i = 0; i < n; i++) {
      const off = -(i * span + gap / 2);
      for (const cls of ['', 'fill']) {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', '24'); c.setAttribute('cy', '24'); c.setAttribute('r', '21.4');
        c.setAttribute('stroke-dashoffset', String(off));
        c.setAttribute('stroke-dasharray',
          cls ? `0 ${RING_CIRCUMFERENCE}` : `${this.segLen} ${RING_CIRCUMFERENCE}`);
        if (cls) { c.setAttribute('class', cls); this.segFills.push(c); }
        host.appendChild(c);
      }
    }
    this.segState = -1;
  }

  /** `full` complete segments, plus `partial` (0..1) of the next one. */
  setSegments(full: number, partial: number): void {
    const key = full * 1000 + Math.round(partial * 120);
    if (key === this.segState) return;
    this.segState = key;
    for (let i = 0; i < this.segFills.length; i++) {
      const f = i < full ? 1 : i === full ? partial : 0;
      this.segFills[i].setAttribute('stroke-dasharray',
        `${(this.segLen * f).toFixed(2)} ${RING_CIRCUMFERENCE}`);
    }
  }

  /**
   * Render N pips, `lit` of them filled.
   *
   * The row is rebuilt only when the count changes; lighting is a class toggle,
   * so a coin landing does not churn the DOM.
   */
  pips(total: number, lit: number): void {
    if (!this.pipHost) return;
    if (this.pipCount !== total) {
      this.pipCount = total;
      this.pipHost.innerHTML = '<i></i>'.repeat(total);
    }
    if (this.pipLit === lit) return;
    this.pipLit = lit;
    const dots = this.pipHost.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < lit);
  }

  /** One-shot activation pulse. */
  flash(): void {
    if (!this.root) return;
    this.root.classList.remove('fired');
    void this.root.offsetWidth;
    this.root.classList.add('fired');
    window.setTimeout(() => this.root?.classList.remove('fired'), 640);
  }
}

export class ControlDeck {
  private readonly deck: HTMLElement | null;
  private readonly bounce: Control;
  private readonly dash: Control;
  private readonly slam: Control;
  private readonly ability: Control;
  private readonly steer: HTMLElement | null;
  private readonly abilityUse: SVGUseElement | null;
  private readonly abilityName: HTMLElement | null;
  private readonly fx: HTMLElement | null;

  private shownAbility: AbilityId | null = null;
  private lastFill = 0;
  private steerOn = false;

  constructor(input?: InputManager) {
    this.deck = document.getElementById('hud-deck');
    if (input) this.wireTouch(input);
    this.bounce = new Control('ctl-bounce');
    this.dash = new Control('ctl-dash');
    this.slam = new Control('ctl-slam');
    this.ability = new Control('ctl-ability');
    this.steer = document.getElementById('ctl-steer');
    this.abilityUse = document.getElementById('ctl-ability-use') as SVGUseElement | null;
    this.abilityName = document.getElementById('ctl-ability-name');
    this.fx = document.getElementById('ability-fx');
  }

  update(s: {
    inWindow: boolean;
    isDashing: boolean;
    dashCooldown: number;
    boostFloats: number;
    isSlamming: boolean;
    slamCooldown: number;
    steerAxis: number;
    abilities: AbilityState;
  }): void {
    // PERFECT BOUNCE — always available, so it only ever says "now" or nothing.
    this.bounce.set(s.inWindow ? 'active' : 'ready', 1);

    // AIR DASH — three things can be true, and they rank. Mid-dash beats
    // cooling down beats having nothing left to spend.
    if (s.isDashing) {
      this.dash.set('active', 1);
    } else if (s.dashCooldown > 0) {
      this.dash.set('cooldown', 1 - s.dashCooldown / CONSTANTS.AIR_DASH_COOLDOWN);
    } else if (s.boostFloats <= 0) {
      this.dash.set('depleted', 1);
    } else {
      this.dash.set('ready', 1);
    }
    // Dashes are a stock, not a cooldown. The count lived in a separate card in
    // the opposite corner, which is nowhere near where the decision is made.
    this.dash.pips(CONSTANTS.MAX_BOOST_FLOATS, s.boostFloats);

    // GROUND SLAM
    if (s.isSlamming) {
      this.slam.set('active', 1);
    } else if (s.slamCooldown > 0) {
      this.slam.set('cooldown', 1 - s.slamCooldown / CONSTANTS.SLAM_COOLDOWN);
    } else {
      this.slam.set('ready', 1);
    }

    // ABILITY — the ring carries charge, which is the number the player is
    // actually watching. Locked comes first: an ability you have not earned
    // should never look like one that is merely uncharged.
    const a = s.abilities;
    const id = a.equipped;
    if (id !== this.shownAbility) {
      this.shownAbility = id;
      this.abilityUse?.setAttribute('href', `#${ABILITY_ICON[id]}`);
      if (this.abilityName) this.abilityName.textContent = ABILITY_LABEL[id];
      if (this.fx) {
        // The field is tinted from the ability's own colour, so the palette
        // never has to be restated in CSS when an ability is retuned.
        const d = ABILITIES[id];
        const hex = d.tint.toString(16).padStart(6, '0');
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        this.fx.dataset.ability = id;
        this.fx.style.setProperty('--afx-tint', `rgba(${r},${g},${b},0.34)`);
        this.fx.style.setProperty('--afx-line', `rgba(${r},${g},${b},0.85)`);
      }
    }

    if (!a.isUnlocked(id)) this.ability.set('locked', 1);
    else if (a.isActive) this.ability.set('active', 1);
    else if (a.ready) this.ability.set('ready', 1);
    // Charging, not cooling down. At zero coins the ability is equipped and
    // waiting — painting it in the dimmed cooldown treatment made a perfectly
    // usable slot look broken for the first half of every run.
    else this.ability.set('charging', a.fill);
    this.ability.buildSegments(a.maxCharges);
    this.ability.setSegments(a.charges, a.charges < a.maxCharges ? a.fill : 0);
    this.ability.pips(a.maxCharges, a.charges);

    // Acknowledge each coin as it banks. The arc itself moves a twelfth of a
    // turn per coin at most, which is real but easy to miss mid-run.
    if (a.fill > this.lastFill + 0.0001) this.ability.gain();
    this.lastFill = a.fill;

    // The field is on for exactly as long as the ability is.
    if (this.fx) this.fx.classList.toggle('on', a.isActive);

    // STEER has no state to report, so it only lights while it is being used.
    const steering = Math.abs(s.steerAxis) > 0.15;
    if (steering !== this.steerOn) {
      this.steerOn = steering;
      this.steer?.classList.toggle('active', steering);
    }
  }

  /**
   * Make the discs pressable.
   *
   * Bounce is press-and-hold — the same as holding the key, which is what buys
   * the taller arc — so it tracks pointerdown/up. The other three are one-shot.
   * Bound on every device, not just touch: a mouse player who reaches for them
   * should not find them inert.
   */
  private wireTouch(input: InputManager): void {
    const bind = (id: string, key: 'bounce' | 'dash' | 'slam' | 'ability') => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e: PointerEvent) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('pressed');
        input.pressDeck(key, true);
      };
      const up = () => {
        el.classList.remove('pressed');
        input.pressDeck(key, false);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    bind('ctl-bounce', 'bounce');
    bind('ctl-dash', 'dash');
    bind('ctl-slam', 'slam');
    bind('ctl-ability', 'ability');
  }

  /** Called when the ability actually goes off. */
  flashAbility(): void { this.ability.flash(); }

  /**
   * The deck teaches for the first few seconds of a run, then steps back.
   * It never disappears — a control you cannot see is a control you forget you
   * have — it just stops competing with the road.
   */
  setFaded(faded: boolean): void {
    this.deck?.classList.toggle('faded', faded);
  }
}
