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
   * Ask the browser to hold landscape. Only meaningful from a user gesture and
   * usually only inside fullscreen, so failures are expected and ignored — the
   * overlay covers every case this does not.
   */
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
