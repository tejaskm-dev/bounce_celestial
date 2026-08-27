/**
 * Input Manager for BOUNCE
 * Arcade Controls:
 * - A / D / Left / Right Arrow: Steer (A = Left, D = Right)
 * - Space / Enter / Pointer Tap: Perfect Landing Action Tap
 * - Shift / K / X: Air Dash (mid-air kinetic burst using Boost Float)
 * - S / C / Down Arrow: Ground Pound / Slam (downward plunge)
 * - P / Escape: Pause / Resume
 * - R: Instant Quick Retry
 * - Touch / Mouse: Drag to steer, tap to action, swipe down to slam, swipe left/right to dash
 */
export class InputManager {
  private keys: Record<string, boolean> = {};

  public steerAxis: number = 0; // Positive = Left, Negative = Right
  public actionTriggered: boolean = false;
  /** Level, not edge: the jump needs to know how long the button is held. */
  public actionHeld: boolean = false;
  public slamTriggered: boolean = false;
  public airDashTriggered: boolean = false;
  public airDashDir: number = 0; // +1 = left, -1 = right, 0 = forward
  public trickLeft: boolean = false;
  public trickRight: boolean = false;
  public quickRetryPressed: boolean = false;
  public startPressed: boolean = false;
  public pausePressed: boolean = false;

  // Double tap detection for air dash
  private lastTapA: number = 0;
  private lastTapD: number = 0;
  private doubleTapThreshold: number = 280; // ms


  constructor() {
    this.initKeyboardListeners();
    this.initPointerListeners();
  }

  private initKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      // Never intercept keystrokes when typing into text inputs, textareas, or form controls
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      const isRepeat = this.keys[e.code];
      this.keys[e.code] = true;

      // Prevent default page scroll on game keys
      if ([
        'Space', 'Enter', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyJ', 'KeyK', 'KeyZ', 'KeyX', 'KeyC', 'KeyQ', 'KeyE', 'KeyR', 'KeyP', 'Escape',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'
      ].includes(e.code)) {
        e.preventDefault();
      }

      if (e.code === 'KeyE' || e.code === 'KeyQ') this.abilityTriggered = true;
      if (e.code === 'Space' || e.code === 'Enter') {
        this.actionHeld = true;
        this.startPressed = true;
        if (!isRepeat) {
          this.actionTriggered = true;
          this.actionHeld = true;
        }
      }

      // Pause toggle: P or Escape
      if ((e.code === 'KeyP' || e.code === 'Escape') && !isRepeat) {
        this.pausePressed = true;
      }

      // Instant Quick Retry with R
      if (e.code === 'KeyR' && !isRepeat) {
        this.quickRetryPressed = true;
      }

      // Air Dash: K, X, Shift
      if ((e.code === 'KeyK' || e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !isRepeat) {
        this.airDashTriggered = true;
        this.airDashDir = this.steerAxis > 0.2 ? 1 : this.steerAxis < -0.2 ? -1 : 0;
      }

      // Slam / Ground Pound: S, C, Down Arrow
      if ((e.code === 'KeyS' || e.code === 'KeyC' || e.code === 'ArrowDown') && !isRepeat) {
        this.slamTriggered = true;
      }

      // Double tap A (Left) / D (Right) for Air Dash
      if (e.code === 'KeyA' && !isRepeat) {
        const now = performance.now();
        if (now - this.lastTapA < this.doubleTapThreshold) {
          this.airDashTriggered = true;
          this.airDashDir = 1; // Left
        }
        this.lastTapA = now;
      }
      if (e.code === 'KeyD' && !isRepeat) {
        const now = performance.now();
        if (now - this.lastTapD < this.doubleTapThreshold) {
          this.airDashTriggered = true;
          this.airDashDir = -1; // Right
        }
        this.lastTapD = now;
      }
    });

    window.addEventListener('keyup', (e) => {
      // Never intercept keystrokes when typing into text inputs, textareas, or form controls
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }

      this.keys[e.code] = false;
      if (e.code === 'Space' || e.code === 'Enter') {
        this.actionHeld = false;
        this.startPressed = false;
      }
    });
  }

  /**
   * Touch controls.
   *
   * The design goal is that a phone screen shows the *game*, not a control
   * panel. So there is no visible d-pad, no fixed joystick and no button row:
   * the screen is divided into two invisible gesture zones that sit exactly
   * where thumbs already rest, and the only thing ever drawn is a small ring
   * under the steering thumb while it is down.
   *
   *   LEFT  45%  — steering. Floating origin: wherever the thumb lands becomes
   *                centre, and horizontal displacement from there is the axis.
   *                A fixed stick would make the player find it; a floating one
   *                is always already under the thumb.
   *   RIGHT 55%  — actions, all from one thumb:
   *                  tap        bounce (this is the perfect-bounce timing)
   *                  hold       commit to a full-height bounce
   *                  swipe up   air dash
   *                  swipe down slam
   *
   * Both zones track their own pointerId, so steering and acting are genuinely
   * simultaneous rather than one cancelling the other.
   */
  private steerPointerId: number | null = null;
  private actionPointerId: number | null = null;
  private steerOriginX: number = 0;
  private steerCurrentX: number = 0;
  private actionStartX: number = 0;
  private actionStartY: number = 0;
  private actionStartTime: number = 0;
  private actionGestureFired: boolean = false;
  /** Set while a steering thumb is down, for the on-screen ring. */
  public steerRing: { active: boolean; originX: number; originY: number; x: number } =
    { active: false, originX: 0, originY: 0, x: 0 };

  /** Full deflection at this fraction of the viewport width. */
  private static readonly STEER_RANGE = 0.16;
  private static readonly TAP_MS = 200;
  private static readonly TAP_SLOP = 22;
  private static readonly SWIPE_MIN = 42;

  private isUiTarget(e: PointerEvent): boolean {
    return !!(e.target as HTMLElement)?.closest(
      'button, input, select, textarea, .skin-btn, .mode-tab, .modal-backdrop, .modal-dialog, #info-modal, .info-content, .ability-slot, .page, .page-card, .board, .board-panel');
  }

  private initPointerListeners(): void {
    window.addEventListener('pointerdown', (e) => {
      if (this.isUiTarget(e)) return;

      const leftZone = e.clientX < window.innerWidth * 0.45;

      if (leftZone && this.steerPointerId === null) {
        this.steerPointerId = e.pointerId;
        this.steerOriginX = e.clientX;
        this.steerCurrentX = e.clientX;
        this.steerRing = { active: true, originX: e.clientX, originY: e.clientY, x: e.clientX };
      } else if (!leftZone && this.actionPointerId === null) {
        this.actionPointerId = e.pointerId;
        this.actionStartX = e.clientX;
        this.actionStartY = e.clientY;
        this.actionStartTime = performance.now();
        this.actionGestureFired = false;
        // Hold begins immediately; the tap is decided on release.
        this.actionHeld = true;
      }
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.steerPointerId) {
        this.steerCurrentX = e.clientX;
        this.steerRing.x = e.clientX;
        return;
      }
      if (e.pointerId === this.actionPointerId && !this.actionGestureFired) {
        const dx = e.clientX - this.actionStartX;
        const dy = e.clientY - this.actionStartY;
        if (Math.abs(dy) > InputManager.SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
          // Swipes resolve on the move, not on release, so a dash or slam
          // fires the instant the intent is unambiguous.
          if (dy < 0) { this.airDashTriggered = true; this.airDashDir = 0; }
          else { this.slamTriggered = true; }
          this.actionGestureFired = true;
          this.actionHeld = false;
        }
      }
    }, { passive: true });

    const endPointer = (e: PointerEvent) => {
      if (e.pointerId === this.steerPointerId) {
        this.steerPointerId = null;
        this.steerRing.active = false;
        return;
      }
      if (e.pointerId === this.actionPointerId) {
        const held = performance.now() - this.actionStartTime;
        const moved = Math.hypot(e.clientX - this.actionStartX, e.clientY - this.actionStartY);
        // A short, still touch is a tap: that is the perfect-bounce input.
        if (!this.actionGestureFired && held < InputManager.TAP_MS && moved < InputManager.TAP_SLOP) {
          // A tap while the other thumb is steering is the ability: it needs a
          // deliberate two-handed gesture so it can never be fired by accident
          // in the middle of a bounce rhythm.
          if (this.steerPointerId !== null && e.clientY > window.innerHeight * 0.55) {
            this.abilityTriggered = true;
          } else {
            this.actionTriggered = true;
          }
        }
        this.actionPointerId = null;
        this.actionHeld = false;
      }
    };
    window.addEventListener('pointerup', endPointer, { passive: true });
    window.addEventListener('pointercancel', endPointer, { passive: true });
  }

  /** Steering contribution from touch, -1..1. */
  private touchSteer(): number {
    if (this.steerPointerId === null) return 0;
    const range = window.innerWidth * InputManager.STEER_RANGE;
    const d = (this.steerCurrentX - this.steerOriginX) / range;
    // Screen-right is world -X, so the sign flips here rather than at the
    // call site, keeping every steering source in one convention.
    return -Math.max(-1, Math.min(1, d));
  }

  public update(): void {
    let rawSteer = 0;

    // 1. Keyboard Steering: A/Left = Left (+X), D/Right = Right (-X)
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) rawSteer += 1.0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) rawSteer -= 1.0;

    // 2. Touch: floating steering zone on the left of the screen.
    rawSteer += this.touchSteer();

    this.steerAxis = Math.max(-1.0, Math.min(1.0, rawSteer));

    // Mid-air tricks: Q (spin left), E (spin right)
    this.trickLeft = !!this.keys['KeyQ'];
    this.trickRight = !!this.keys['KeyE'];
  }

  /** Ability trigger: E / Q on desktop, a second thumb tap on touch. */
  public abilityTriggered: boolean = false;
  public consumeAbility(): boolean {
    if (this.abilityTriggered) { this.abilityTriggered = false; return true; }
    return false;
  }

  public consumeAction(): boolean {
    if (this.actionTriggered) {
      this.actionTriggered = false;
      return true;
    }
    return false;
  }

  public consumeSlam(): boolean {
    if (this.slamTriggered) {
      this.slamTriggered = false;
      return true;
    }
    return false;
  }

  public consumeAirDash(): { triggered: boolean; dir: number } {
    if (this.airDashTriggered) {
      this.airDashTriggered = false;
      return { triggered: true, dir: this.airDashDir };
    }
    return { triggered: false, dir: 0 };
  }

  public consumeQuickRetry(): boolean {
    if (this.quickRetryPressed) {
      this.quickRetryPressed = false;
      return true;
    }
    return false;
  }

  public consumeStart(): boolean {
    if (this.startPressed) {
      this.startPressed = false;
      return true;
    }
    return false;
  }

  public consumePause(): boolean {
    if (this.pausePressed) {
      this.pausePressed = false;
      return true;
    }
    return false;
  }

  public reset(): void {
    this.steerAxis = 0;
    this.actionTriggered = false;
    this.slamTriggered = false;
    this.airDashTriggered = false;
    this.airDashDir = 0;
    this.trickLeft = false;
    this.trickRight = false;
    this.quickRetryPressed = false;
    this.startPressed = false;
    this.pausePressed = false;
    this.abilityTriggered = false;
    this.steerPointerId = null;
    this.actionPointerId = null;
    this.actionHeld = false;
    this.steerRing.active = false;
  }
}
