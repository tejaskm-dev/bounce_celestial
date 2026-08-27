/**
 * Landscape gating for touch devices.
 *
 * The run is a wide, fast read down a road that recedes to a vanishing point.
 * In portrait there is barely any road on screen: the camera's horizontal field
 * is what gives the player time to see a hazard and choose a lane, and a tall
 * narrow window removes most of it. So rather than let the game play badly, we
 * ask for the rotation.
 *
 * The Screen Orientation API is the nice path, but it only resolves inside
 * fullscreen and only on some browsers, so it is attempted and never relied on.
 * The overlay is the real mechanism — it works everywhere, including iOS Safari
 * where locking is not available at all.
 *
 * Desktop is never gated: a narrow desktop window is the user's own choice, and
 * a mouse player can resize.
 */
export class Orientation {
  private readonly isTouch: boolean;
  private gated = false;

  constructor() {
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;

    const sync = () => this.sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    // iOS reports the old size on the orientationchange event itself, so the
    // visual viewport is the only signal that lands after the rotation has
    // actually settled.
    window.visualViewport?.addEventListener('resize', sync);
    this.sync();
  }

  /** True while the game should be paused behind the rotate prompt. */
  get blocked(): boolean { return this.gated; }

  /**
   * Go fullscreen and hold landscape.
   *
   * Called from the PLAY press, and deliberately not from the first touch
   * anywhere. Both APIs need a user gesture, so it has to hang off a click
   * either way — but a player poking at settings, picking a chassis or reading
   * the guide has not asked to lose their browser chrome, and taking it from
   * them for that is hostile. Pressing PLAY is unambiguous.
   *
   * Order matters: on Android the orientation lock only resolves *inside*
   * fullscreen, so the lock is attempted after the request settles rather than
   * alongside it.
   *
   * Every step here is allowed to fail. iOS Safari has no Fullscreen API on
   * iPhone at all, and no browser guarantees the lock — the rotate gate is the
   * mechanism that actually holds landscape, and this is the upgrade on top.
   */
  async enterImmersive(): Promise<void> {
    await this.requestFullscreen();
    await this.requestLock();
  }

  /**
   * Offer the Add to Home Screen route, on the title screen.
   *
   * Deliberately not on the PLAY press. Hanging it off PLAY put a modal over
   * the countdown of the run the player had just asked for — the exact wall
   * that entering fullscreen on first tap would have been. The title screen is
   * where someone is still deciding; that is where an offer belongs.
   */
  maybeOfferHomeScreen(): void {
    if (!Orientation.needsHomeScreenForFullscreen()) return;
    this.showIosHint();
  }

  /**
   * Is this a device where Add to Home Screen is the *only* route to fullscreen?
   *
   * iPhone Safari exposes no Fullscreen API — `requestFullscreen` is undefined
   * on every element and `webkitRequestFullscreen` is not there either; only
   * `<video>` can go fullscreen, via `webkitEnterFullscreen`. iPad Safari does
   * support it, so this cannot be "is it iOS" — it has to be a capability test.
   *
   * Feature-detecting rather than sniffing also means the hint disappears by
   * itself the day Safari ships the API.
   */
  private static needsHomeScreenForFullscreen(): boolean {
    if (!window.matchMedia('(pointer: coarse)').matches) return false;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
    const hasApi = typeof el.requestFullscreen === 'function'
      || typeof el.webkitRequestFullscreen === 'function';
    return !hasApi && !Orientation.isStandalone();
  }

  /** Already launched from the home screen, so there is nothing to ask for. */
  private static isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || nav.standalone === true;
  }

  /**
   * Ask once, ever. A prompt that returns every session is worse than no
   * prompt: the player has already decided, and repeating it just puts a wall
   * between them and the run they pressed PLAY for.
   */
  private showIosHint(): void {
    const KEY = 'bounce.ios.hintSeen';
    if (localStorage.getItem(KEY) === '1') return;
    const host = document.getElementById('ios-hint');
    if (!host) return;
    host.hidden = false;
    const dismiss = () => {
      host.hidden = true;
      localStorage.setItem(KEY, '1');
    };
    document.getElementById('ios-hint-close')?.addEventListener('click', dismiss, { once: true });
    host.addEventListener('click', (e) => { if (e.target === host) dismiss(); }, { once: true });
  }

  private async requestFullscreen(): Promise<void> {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    if (document.fullscreenElement || doc.webkitFullscreenElement) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      /* Refused, unsupported, or the gesture had already been spent. */
    }
  }

  async requestLock(): Promise<void> {
    if (!this.isTouch) return;
    type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };
    const o = screen.orientation as LockableOrientation | undefined;
    try {
      await o?.lock?.('landscape');
    } catch {
      /* Not supported, or not in fullscreen. The overlay handles it. */
    }
  }

  private sync(): void {
    // Compare the viewport rather than reading screen.orientation.type: a
    // split-screen or floating window can be landscape by orientation and
    // portrait by shape, and shape is what the camera actually cares about.
    const portrait = window.innerHeight > window.innerWidth;
    const next = this.isTouch && portrait;
    if (next === this.gated) return;
    this.gated = next;
    document.body.classList.toggle('needs-landscape', next);
  }
}
