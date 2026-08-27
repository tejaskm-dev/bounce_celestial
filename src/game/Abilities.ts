/**
 * Abilities.
 *
 * The brief was "Mario Kart fun, tailored to this game". What makes a Mario
 * Kart item good is not that it is powerful — it is that it creates a *swing*,
 * it is situational enough that you save it for the right moment, and using it
 * changes how you play for a few seconds rather than just adding a number.
 *
 * So none of these are stat boosts. Each one takes a verb the game already has
 * and breaks it in a specific way:
 *
 *   FEATHERFALL  breaks the arc      — you stop falling and choose where to land
 *   TEMPO        breaks the clock    — the world slows, your inputs do not
 *   COMET        breaks the road     — nothing can stop you, briefly
 *   ECHO         breaks the line     — you are in two places, collecting both
 *   AEGIS        breaks the stakes   — one mistake becomes a reward instead
 *
 * You equip one before a run. Coins charge it. That makes coins matter beyond
 * score and gives the lateral roaming a purpose in the moment, not just at the
 * results screen.
 */

export type AbilityId = 'featherfall' | 'tempo' | 'comet' | 'echo' | 'aegis';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** One line the player reads on the select screen. */
  blurb: string;
  /** Coins required to fill the meter once. */
  charge: number;
  /** Seconds the effect lasts. 0 = instant. */
  duration: number;
  /** Lifetime coins needed to unlock. 0 = available from the start. */
  unlockAt: number;
  /** Hex tint used for the meter and the activation flash. */
  tint: number;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  featherfall: {
    id: 'featherfall',
    name: 'FEATHERFALL',
    blurb: 'Hang at the top of your arc. Fall slowly, steer freely, pick your landing.',
    charge: 12,
    duration: 3.2,
    unlockAt: 0,
    tint: 0xB2D2EE,
  },
  tempo: {
    id: 'tempo',
    name: 'TEMPO',
    blurb: 'The world slows to a third. You do not. Every bounce becomes perfect.',
    charge: 20,
    duration: 4.0,
    unlockAt: 150,
    tint: 0xE0BC6E,
  },
  comet: {
    id: 'comet',
    name: 'COMET',
    blurb: 'Overdrive. Hazards shatter, coins come to you, nothing lands a hit.',
    charge: 28,
    duration: 5.0,
    unlockAt: 400,
    tint: 0xE0645C,
  },
  echo: {
    id: 'echo',
    name: 'ECHO',
    blurb: 'A double runs your mirror line and collects everything you cannot reach.',
    charge: 24,
    duration: 7.0,
    unlockAt: 800,
    tint: 0xC99AA0,
  },
  aegis: {
    id: 'aegis',
    name: 'AEGIS',
    blurb: 'The next thing that would kill you shatters into coins instead.',
    charge: 16,
    duration: 0,
    unlockAt: 1400,
    tint: 0x8FB07C,
  },
};

export const ABILITY_ORDER: AbilityId[] = ['featherfall', 'tempo', 'comet', 'echo', 'aegis'];

/** Glyph per ability. Shared by the select rows and the in-run callout. */
export const ABILITY_GLYPH: Record<AbilityId, string> = {
  featherfall: '✦', tempo: '⧗', comet: '★',
  echo: '◎', aegis: '❖',
};

const STORE_EQUIPPED = 'bounce.ability.equipped';
const STORE_COINS = 'bounce.coins.lifetime';

/**
 * Charge, activation and unlock state. Deliberately owns no rendering and no
 * gameplay — the Game asks it what is active and applies the consequences, so
 * adding an ability never means touching the physics.
 */
export class AbilityState {
  equipped: AbilityId = 'featherfall';
  /** Coins banked toward the *next* use. Resets each time one is banked. */
  charge = 0;
  /**
   * Completed uses in hand.
   *
   * Coins used to fill one meter that stopped at full, so every coin collected
   * past that point was wasted and there was no way to hold a use in reserve
   * for the segment you could see coming. Banking them makes a full meter worth
   * something, and gives the deck a number to show that a progress ring cannot:
   * not how close the next use is, but how many you already have.
   */
  charges = 0;
  readonly maxCharges = 3;
  /** Seconds left on the active effect, 0 when idle. */
  active = 0;
  /** True on the frame the ability fires, for one-shot effects. */
  justFired = false;
  /** Armed but not yet consumed — used by instant abilities like Aegis. */
  armed = false;

  lifetimeCoins = 0;

  constructor() {
    const eq = localStorage.getItem(STORE_EQUIPPED) as AbilityId | null;
    if (eq && ABILITIES[eq]) this.equipped = eq;
    this.lifetimeCoins = Number(localStorage.getItem(STORE_COINS) ?? 0) || 0;
  }

  get def(): AbilityDef { return ABILITIES[this.equipped]; }
  get ready(): boolean { return this.charges > 0; }
  get fill(): number { return Math.min(1, this.charge / this.def.charge); }
  get isActive(): boolean { return this.active > 0 || this.armed; }

  isUnlocked(id: AbilityId): boolean {
    return this.lifetimeCoins >= ABILITIES[id].unlockAt;
  }

  equip(id: AbilityId): boolean {
    if (!this.isUnlocked(id)) return false;
    this.equipped = id;
    this.charge = 0;
    this.charges = 0;
    localStorage.setItem(STORE_EQUIPPED, id);
    return true;
  }

  /**
   * Called when a coin is picked up. Returns an ability id if this coin was
   * the one that unlocked it.
   *
   * Unlocks used to be silent: coins accumulated in localStorage, thresholds
   * were crossed with no acknowledgement anywhere, and the only way to learn
   * you had earned something was to open the ability page and notice a row was
   * no longer greyed out. Reporting the crossing lets the run itself tell you.
   */
  addCoin(): AbilityId | null {
    if (this.charges < this.maxCharges) {
      this.charge++;
      if (this.charge >= this.def.charge) { this.charge = 0; this.charges++; }
    } else {
      // Every use in hand: the meter sits full rather than silently eating the
      // coin, so the player can see that spending one is what unblocks it.
      this.charge = this.def.charge;
    }
    const before = this.lifetimeCoins;
    this.lifetimeCoins++;
    localStorage.setItem(STORE_COINS, String(this.lifetimeCoins));

    for (const id of ABILITY_ORDER) {
      const at = ABILITIES[id].unlockAt;
      if (at > 0 && before < at && this.lifetimeCoins >= at) return id;
    }
    return null;
  }

  /**
   * The cheapest ability still locked, with progress toward it — the single
   * fact the player needs to answer "what am I working toward?". Null once
   * everything is unlocked.
   */
  nextLocked(): { id: AbilityId; need: number; have: number; remaining: number } | null {
    let best: AbilityId | null = null;
    for (const id of ABILITY_ORDER) {
      if (this.isUnlocked(id)) continue;
      if (best === null || ABILITIES[id].unlockAt < ABILITIES[best].unlockAt) best = id;
    }
    if (best === null) return null;
    const need = ABILITIES[best].unlockAt;
    return { id: best, need, have: this.lifetimeCoins, remaining: need - this.lifetimeCoins };
  }

  /** Progress toward one ability's unlock, 0..1. */
  unlockProgress(id: AbilityId): number {
    const at = ABILITIES[id].unlockAt;
    if (at <= 0) return 1;
    return Math.min(1, this.lifetimeCoins / at);
  }

  /** Attempt to fire. Returns true if it actually went off. */
  trigger(): boolean {
    if (!this.ready || this.isActive) return false;
    this.charges--;
    this.justFired = true;
    if (this.def.duration > 0) this.active = this.def.duration;
    else this.armed = true;
    return true;
  }

  /** Consume an armed instant ability (Aegis absorbing a hit). */
  consumeArmed(): boolean {
    if (!this.armed) return false;
    this.armed = false;
    return true;
  }

  update(dt: number): void {
    this.justFired = false;
    if (this.active > 0) this.active = Math.max(0, this.active - dt);
  }

  resetRun(): void {
    this.charge = 0;
    this.charges = 0;
    this.active = 0;
    this.armed = false;
    this.justFired = false;
  }
}
