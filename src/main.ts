import { Game } from './core/Game';

/**
 * BOUNCE - Entry Point
 */
function init() {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Failed to locate WebGL canvas element');
    return;
  }

  const game = new Game(canvas);
  game.start();

  // Hold the plate until the first frames are actually on screen, then lift
  // it. Dismissing on DOMContentLoaded shows the preloader for a few
  // milliseconds and then flashes an unbuilt world.
  const preloader = document.getElementById('preloader');
  if (preloader) {
    const pct = document.getElementById('preloader-pct');
    // Ease the readout to 100 rather than jumping: the actual work finishes
    // almost immediately, so a truthful counter would flash 0 then 100. This
    // paces the reveal instead, and only completes once a frame has rendered.
    let shown = 0;
    let ready = false;
    const tick = () => {
      const ceiling = ready ? 100 : 88;
      shown += Math.max(0.6, (ceiling - shown) * 0.055);
      if (shown > ceiling) shown = ceiling;
      if (pct) pct.textContent = `${Math.floor(shown)}%`;
      if (shown >= 99.4) {
        if (pct) pct.textContent = '100%';
        window.setTimeout(() => {
          preloader.classList.add('dismissed');
          window.setTimeout(() => preloader.remove(), 1100);
        }, 260);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => { ready = true; }));
    requestAnimationFrame(tick);
  }

  // Expose game instance for testing harness
  (window as unknown as { __BOUNCE_GAME__: Game }).__BOUNCE_GAME__ = game;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
