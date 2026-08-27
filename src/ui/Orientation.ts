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
