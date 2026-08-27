import { Game } from './core/Game';

/**
 * BOUNCE - Entry Point
 */

/**
 * The strata the camera passes through on the way up.
 *
 * A percentage tells you how long is left; these tell you where you are. A
 * climb with named layers reads as a journey through somewhere, which is the
 * whole reason the load screen is a camera move and not a progress card.
 */
const STRATA: { at: number; name: string }[] = [
  { at: 0.00, name: 'Below the cloud deck' },
  { at: 0.22, name: 'Entering the lower strata' },
  { at: 0.46, name: 'Breaking the cloud line' },
  { at: 0.68, name: 'The colonnade, in sight' },
  { at: 0.86, name: 'Arriving at the causeway' },
];

/** Altitude shown at the top of the climb. */
const SUMMIT_FT = 12400;

function init() {
  const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Failed to locate WebGL canvas element');
    return;
  }

  // Held until the ascent lands: the title is what the climb arrives at, so it
  // must not already be on screen during it.
  document.body.classList.add('loading');

  const game = new Game(canvas);
  game.start();

  const preloader = document.getElementById('preloader');
  if (preloader) {
    const pct = document.getElementById('preloader-pct');
    const alt = document.getElementById('preloader-alt');
    const fill = document.getElementById('preloader-fill') as HTMLElement | null;
    const strata = document.getElementById('preloader-strata');

    // Ease the readout rather than jumping: the actual work finishes almost
    // immediately, so a truthful counter would flash 0 then 100. This paces the
    // climb instead, and only completes once a frame has actually rendered.
    let shown = 0;
    let ready = false;
    let stratum = -1;

    const setStratum = (i: number) => {
      if (i === stratum || !strata) return;
      stratum = i;
      // Fade the old line out before swapping the text, so the layer names
      // read as passing rather than as a value being overwritten.
      strata.classList.add('swap');
      window.setTimeout(() => {
        strata.textContent = STRATA[i].name;
        strata.classList.remove('swap');
      }, 260);
    };
    setStratum(0);

    const tick = () => {
      const ceiling = ready ? 100 : 88;
      shown += Math.max(0.45, (ceiling - shown) * 0.038);
      if (shown > ceiling) shown = ceiling;

      const k = shown / 100;
      game.introAscent(k);

      if (pct) pct.textContent = `${Math.floor(shown)}%`;
      if (alt) alt.textContent = Math.round(k * SUMMIT_FT).toLocaleString('en-US');
      if (fill) fill.style.width = `${shown}%`;

      for (let i = STRATA.length - 1; i >= 0; i--) {
        if (k >= STRATA[i].at) { setStratum(i); break; }
      }

      if (shown >= 99.4) {
        if (pct) pct.textContent = '100%';
        if (alt) alt.textContent = SUMMIT_FT.toLocaleString('en-US');
        if (fill) fill.style.width = '100%';
        game.introAscent(1);
        // The mark lands, holds, and only then does the layer clear — arriving
        // and being dismissed are two moments, not one.
        preloader.classList.add('arrived');
        window.setTimeout(() => {
          game.endIntroAscent();
          document.body.classList.remove('loading');
          // Offered once the title has actually arrived, so it is an offer
          // about the game rather than an interruption of the load.
          game.offerHomeScreenInstall();
          preloader.classList.add('dismissed');
          window.setTimeout(() => preloader.remove(), 1100);
        }, 1250);
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
