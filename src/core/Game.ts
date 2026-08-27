import * as THREE from 'three';
import { HEX } from '../rendering/Palette';
import { RenderPipeline } from '../rendering/Renderer';
import { Skybox } from '../rendering/Skybox';
import {
  updateWorldUniforms, worldUniforms, FOG_NEAR_BASE, FOG_FAR_BASE,
} from '../rendering/WorldUniforms';
import { CourseGenerator } from '../world/CourseGenerator';
import { BridgeSpine } from '../world/BridgeSpine';
import { Ball } from '../entities/Ball';
import { GhostRig } from '../entities/GhostRig';
import { CameraRig } from '../entities/CameraRig';
import { ParticleSystem } from '../entities/Particles';
import { LandingReticle } from '../entities/LandingReticle';
import { SplashDecals } from '../entities/SplashDecals';
import { InputManager } from './Input';
import { ScoreManager } from './ScoreManager';
import { GameStateManager, GameStateEnum } from './GameState';
import { SoundEngine } from '../audio/SoundEngine';
import { MusicTracker } from '../audio/MusicTracker';
import { HUD } from '../ui/HUD';
import { TitleScreen } from '../ui/TitleScreen';
import { GameOverScreen } from '../ui/GameOverScreen';
import { InfoModal } from '../ui/InfoModal';
import { CONSTANTS, arcFrom } from '../config/constants';
import { progressOf, difficultyAt, bandAt } from '../config/Difficulty';
import { GameModeId, GAME_MODES } from '../config/modes';
import { AbilityState, ABILITIES, ABILITY_GLYPH } from '../game/Abilities';
import { Menus } from '../ui/Menus';
import { ControlDeck } from '../ui/ControlDeck';
import { Orientation } from '../ui/Orientation';
import { Api, RunSubmissionPayload } from '../net/Api';

const enum ArmState {
  Idle = 0,
  Armed = 1,
  Whiffed = 2,
}

/** Simulation step. 120Hz so a 60Hz frame is exactly two steps. */
const FIXED_DT = 1 / 120;

/** Ceiling on catch-up steps, so a long stall cannot spiral the loop. */
const MAX_STEPS_PER_FRAME = 8;

/**
 * Master Game Controller for BOUNCE
 * Pure arcade game loop: Rhythmic Arc Physics, Timing System, Boost Floats, Audio & Polish
 */
export class Game {
  private pipeline: RenderPipeline;
  private skybox: Skybox;
  private course: CourseGenerator;
  private bridge: BridgeSpine;
  private ball: Ball;
  private ghost: GhostRig;
  private cameraRig: CameraRig;
  private particles: ParticleSystem;
  private landingReticle: LandingReticle;
  private splashes: SplashDecals;
  private input: InputManager;
  private score: ScoreManager;
  private abilities: AbilityState = new AbilityState();
  private deck!: ControlDeck;
  private orientation = new Orientation();
  /** True while the load ascent is driving the camera. */
  private introActive = true;
  private menus!: Menus;
  private state: GameStateManager;
  private sound: SoundEngine;
  private music: MusicTracker;

  // UI
  private hud: HUD;
  private titleScreen: TitleScreen;
  private gameOverScreen: GameOverScreen;
  private infoModal: InfoModal;
  private countdownEl: HTMLElement;
  private countdownText: HTMLElement;
  private countdownTimer: number = 3;

  // Gameplay Dynamic State
  private currentMode: GameModeId = 'arcade';
  private currentSpeed: number = CONSTANTS.BASE_SPEED;
  private baseSpeed: number = CONSTANTS.BASE_SPEED;
  private bonusBoost: number = 0;
  private difficulty: number = 0;

  // Arc physics state
  private currentGravity: number = 60;
  private timeToLand: number = -1;

  // Jump state
  private jumpBuffer: number = 0;
  private coyote: number = 0;
  private isRising: boolean = false;
  private landedTimer: number = 99;
  /** Seconds since the last fresh action press; drives the perfect window. */
  private pressAge: number = 99;

  // Perfect Landing Timing
  private armState: ArmState = ArmState.Idle;
  private armLockoutTimer: number = 0;

  private deathTimer: number = 0;
  private victoryTimer: number = 0;
  private hitStopTimer: number = 0;
  private accumulator: number = 0;
  private timeScale: number = 1;
  /** 0..1, decays after a death to drive the slow-motion ramp. */
  private slowMo: number = 0;
  private deathSpin: THREE.Vector3 = new THREE.Vector3();
  private gravityDir: number = 1;
  private titleBallT: number = 0;
  private controlsHintTimer: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  private nearMissHistory: number[] = [];
  private idleTimer: number = 0;
  private worldTime: number = 0;
  private touchRing: HTMLElement | null = null;
  private touchNub: HTMLElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // 1. Rendering Pipeline
    this.pipeline = new RenderPipeline(canvas);

    // 2. Skybox & Tunnel
    this.skybox = new Skybox();
    this.pipeline.scene.add(this.skybox.group);

    // 3. Course Generator
    this.course = new CourseGenerator(this.currentMode);
    this.pipeline.scene.add(this.course.group);

    // The causeway the decks sit on. Continuous even where the roadway is not.
    this.bridge = new BridgeSpine();
    this.pipeline.scene.add(this.bridge.group);

    // 4. Particles & VFX
    this.particles = new ParticleSystem();
    this.pipeline.scene.add(this.particles.group);

    // 5. Landing Reticle & Takeoff Markers
    this.landingReticle = new LandingReticle();
    this.pipeline.scene.add(this.landingReticle.group);

    // Marks left on the deck at every landing, in the ball's own colour.
    this.splashes = new SplashDecals();
    this.pipeline.scene.add(this.splashes.mesh);

    // 6. Protagonist Ball Entity
    this.ball = new Ball('cyan');
    this.pipeline.scene.add(this.ball.group);

    // 7. Ghost Rig ("Race Your Ghost")
    this.ghost = new GhostRig();
    this.pipeline.scene.add(this.ghost.group);

    // 8. Camera Rig
    this.cameraRig = new CameraRig(this.pipeline.camera);

    // 9. Input, Scoring, State & Audio
    this.input = new InputManager();
    this.score = new ScoreManager(this.currentMode);
    this.state = new GameStateManager(GameStateEnum.TITLE);
    this.sound = SoundEngine.getInstance();
    this.music = new MusicTracker();

    // 10. UI Screens & Modals
    this.hud = new HUD();
    this.titleScreen = new TitleScreen();
    this.deck = new ControlDeck(this.input);
    this.gameOverScreen = new GameOverScreen();
    this.gameOverScreen.abilities = this.abilities;
    this.infoModal = new InfoModal();
    this.countdownEl = document.getElementById('screen-countdown')!;
    this.countdownText = document.getElementById('countdown-text')!;

    this.hud.show(false);

    // Menus own the pause panel and every page outside the run.
    this.menus = new Menus(this.abilities);
    this.menus.onResume = () => { /* state is driven by menus.isPaused */ };
    this.menus.onRestart = () => this.startIntroOrCountdown();
    this.menus.onQuit = () => this.returnToTitle();
    this.menus.onSelectSkin = (id) => {
      this.sound.playUIClick();
      this.ball.setSkin(id);
      Api.setEquippedSkin(id);
    };

    this.setupCallbacks();
    this.cameraRig.setCinematicMode(true);

    const initialArc = arcFrom(CONSTANTS.APEX_START, CONSTANTS.AIRTIME_START);
    this.currentGravity = initialArc.g;

    // Show title screen immediately on launch
    this.titleScreen.show(this.score.highScore);

    // Initialize backend networking & offline sync
    Api.init().then((profile) => {
      if (profile.equippedSkin) {
        this.ball.setSkin(profile.equippedSkin);
      }
      if (profile.equippedAbility) {
        this.abilities.equip(profile.equippedAbility as any);
      }
      this.menus.refresh();
    }).catch((err) => {
      console.warn('[BOUNCE] Api init caught:', err);
    });
  }

  private setupCallbacks(): void {
    // Title Start Button
    this.titleScreen.setOnStart(() => {
      this.sound.playUIClick();
      this.startIntroOrCountdown();
    });

    // Title Info / Controls Button
    this.titleScreen.setOnInfo(() => {
      this.sound.playUIClick();
      this.infoModal.show();
    });

    // Skin Selection
    this.titleScreen.setOnSkinSelect((skinId) => {
      this.sound.playUIClick();
      this.ball.setSkin(skinId);
      Api.setEquippedSkin(skinId);
    });

    this.titleScreen.setOnSkinLocked((_skinId, reqScore) => {
      this.sound.playWhiff();
      this.hud.showBanner(`LOCKED · SCORE ${reqScore.toLocaleString()} PTS TO UNLOCK`, 'near-miss');
    });

    // Mode Selection
    this.titleScreen.setOnModeSelect((modeId) => {
      this.sound.playUIClick();
      this.currentMode = modeId;
      this.score.setMode(modeId);
      this.course.setMode(modeId);
      this.ghost.loadBestGhost(modeId);
      this.titleScreen.updateBest(this.score.highScore);
      this.menus.setLeaderboardMode(modeId);
    });

    // Audio Toggle
    this.titleScreen.setOnAudioToggle(() => {
      // Toggle audio state if applicable
      this.sound.playUIClick();
    });

    // Results Replay Button
    this.gameOverScreen.setOnReplay(() => {
      this.sound.playUIClick();
      this.startIntroOrCountdown();
    });

    // Results Return to Title
    this.gameOverScreen.setOnTitle(() => {
      this.sound.playUIClick();
      this.returnToTitle();
    });

    // Combo Escalation Fanfare & Adaptive Music (0 emojis)
    this.score.setOnComboChange((combo) => {
      this.hud.pulseCombo();
      if (combo > 1 && combo % 5 === 0) {
        this.sound.playComboUp(combo);
        this.hud.showBanner(`COMBO x${combo}`, 'combo-streak');
      }
      this.music.setIntensity(1.0 + (combo / CONSTANTS.COMBO_MAX_MULTIPLIER) * 3.0);
    });
  }

  /**
   * Bring every recycled world pool back around a given z.
   *
   * The scenery, the bridge spine and the course all recycle forward: nothing
   * ever moves backwards on its own. So any time the ball is teleported — to
   * the title, to the start of a run — the world has to be told, or it stays
   * parked hundreds of units down-course while the ball sits at zero. That is
   * the "empty map" bug: road and sky dome (which follows the camera) still
   * render, and every column, tower, gate and span is somewhere behind you.
   *
   * It read as intermittent because starting a run repaired it and quitting to
   * the title reintroduced it. One helper, called from both, so the next place
   * that moves the ball cannot forget half of it.
   */
  private recenterWorld(z: number): void {
    this.course.reset();
    this.skybox.reset(z);
    this.bridge.reset(z);
  }

  private returnToTitle(): void {
    this.gameOverScreen.hide();
    this.infoModal.hide();
    this.hud.show(false);
    this.hud.setDanger(false);
    this.landingReticle.reset();
    this.splashes.reset();
    this.abilities.resetRun();
    this.state.setState(GameStateEnum.TITLE);
    this.cameraRig.setCinematicMode(true);
    this.titleBallT = 0;
    this.ball.reset(0);
    this.recenterWorld(this.ball.position.z);
    this.ball.group.rotation.set(0, 0, 0);
    this.deathSpin.set(0, 0, 0);
    this.titleScreen.show(this.score.highScore);
  }

  private startIntroOrCountdown(): void {
    void this.orientation.requestLock();
    this.titleScreen.hide();
    this.gameOverScreen.hide();
    this.infoModal.hide();
    this.ghost.loadBestGhost(this.currentMode);

    this.ball.mesh.visible = true;
    this.resetRun();
    this.hud.reset();
    this.hud.show(false);

    this.startCountdown();
  }

  private startCountdown(): void {
    this.state.setState(GameStateEnum.COUNTDOWN);
    this.countdownTimer = 3.0;
    this.countdownText.textContent = '3';
    this.countdownText.className = 'pop';
    this.countdownEl.classList.add('active');
    this.cameraRig.reset(this.ball.position);
    this.sound.playCountdownTick(3);
  }


  private beginPlay(): void {
    this.countdownEl.classList.remove('active');
    this.countdownText.textContent = '';
    this.countdownText.className = '';
    this.state.setState(GameStateEnum.PLAYING);
    this.resetRun();

    // Hand off *into the rhythm* rather than dropping the ball in.
    //
    // The countdown held it hovering, then play began and it fell from a dead
    // stop onto the deck — a slam with a full impact burst before the player
    // had touched anything. Instead it starts exactly where a normal bounce
    // would be at the top of its arc, with the run speed already applied, so
    // the first thing that happens is an ordinary descent into an ordinary
    // landing. There is no discontinuity to hide because there isn't one.
    const apexY = CONSTANTS.ROAD_Y + 0.5 + this.ball.radius + CONSTANTS.BOUNCE_MIN_APEX;
    this.ball.position.set(0, apexY, 4);
    this.ball.velocity.set(0, 0, CONSTANTS.BASE_SPEED);
    this.ball.isGrounded = false;
    this.cameraRig.reset(this.ball.position);
    this.hud.reset();
    this.hud.show(true);
    this.controlsHintTimer = 6.0;
    this.deck.setFaded(false);
    this.music.start();
    this.ghost.startRecording();
  }

  /**
   * Ability activation callout.
   *
   * Abilities fired with a generic banner, so there was no way to tell *which*
   * one had gone off or that anything special had happened at all. This gives
   * each one its own plate, tinted to the ability and stamped with its glyph.
   */
  private announceAbility(name: string, glyph: string, tint: number, eyebrow = ''): void {
    const host = document.getElementById('ability-callout');
    if (!host) return;
    const hex = '#' + tint.toString(16).padStart(6, '0');
    host.innerHTML =
      `<span class="ac-glyph" style="color:${hex}">${glyph}</span>` +
      (eyebrow ? `<span class="ac-eyebrow">${eyebrow}</span>` : '') +
      `<span class="ac-name">${name}</span>` +
      `<span class="ac-rule" style="background:${hex}"></span>`;
    host.classList.remove('on');
    void host.offsetWidth;      // restart the animation
    host.classList.add('on');
    window.setTimeout(() => host.classList.remove('on'), 1500);
  }

  private resetRun(): void {
    this.score.reset();
    this.ball.mesh.visible = true;
    this.ball.reset(0);
    this.ball.group.rotation.set(0, 0, 0);
    this.deathSpin.set(0, 0, 0);
    this.recenterWorld(this.ball.position.z);
    this.landingReticle.reset();
    this.splashes.reset();
    this.abilities.resetRun();
    this.baseSpeed = CONSTANTS.BASE_SPEED;
    this.bonusBoost = 0;
    this.currentSpeed = CONSTANTS.BASE_SPEED;
    this.difficulty = 0;
    this.deathTimer = 0;
    this.victoryTimer = 0;
    this.hitStopTimer = 0;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.isRising = false;
    this.landedTimer = 99;
    this.pressAge = 99;
    this.slowMo = 0;
    this.timeScale = 1;
    this.accumulator = 0;
    this.gravityDir = 1;
    this.armState = ArmState.Idle;
    this.armLockoutTimer = 0;
    this.timeToLand = -1;

    const initialArc = arcFrom(CONSTANTS.APEX_START, CONSTANTS.AIRTIME_START);
    this.currentGravity = initialArc.g;
    this.ball.velocity.set(0, initialArc.v0, CONSTANTS.BASE_SPEED);
    this.cameraRig.reset(this.ball.position);
  }

  /**
   * How close to the edge of the standable floor a point is.
   * 0 = comfortably centred, 1 = right on the lip.
   *
   * Probed against the course rather than a specific platform so it works for
   * every floor type — authored platforms, bridges, collapsing spans alike.
   */
  private edgeProximity(x: number, z: number): number {
    const reach = this.ball.radius * 2.2;
    let toPlus = reach, toMinus = reach;
    for (let d = 0.5; d <= reach; d += 0.5) {
      if (!this.course.isSolidFloorAt(x + d, z)) { toPlus = d; break; }
    }
    for (let d = 0.5; d <= reach; d += 0.5) {
      if (!this.course.isSolidFloorAt(x - d, z)) { toMinus = d; break; }
    }
    return 1 - Math.min(1, Math.min(toPlus, toMinus) / reach);
  }

  /**
   * The frame the ball comes back down onto the deck.
   *
   * Landing quality is the payoff for a well-judged jump: a flat, centred
   * touchdown keeps your speed, a scuffed one on the lip of a platform bleeds
   * it. The player then has a CHAIN_WINDOW to jump again for a momentum bonus.
   */
  private onTouchdown(impactVy: number, surfaceY: number, big: boolean, isPerfect = false, isSlam = false): void {
    const nominal = arcFrom(CONSTANTS.JUMP_APEX, CONSTANTS.JUMP_AIRTIME).v0;
    const hardness = Math.min(1, Math.abs(impactVy) / Math.max(1, nominal * 1.2));

    const edge = this.edgeProximity(this.ball.position.x, this.ball.position.z);
    const isScuff = edge > CONSTANTS.SCUFF_EDGE_THRESHOLD;

    if (isScuff) {
      this.bonusBoost = Math.max(0, this.bonusBoost - CONSTANTS.SCUFF_SPEED_PENALTY);
      this.hud.showBanner('SCUFF', 'trick');
      this.particles.emitScuff(this.ball.position, Math.sign(this.ball.position.x) || 1);
      this.ball.setFaceExpression('strain', true, 0.35);
    } else if (!isPerfect) {
      this.score.addLanding('GOOD');
    }

    if (edge > 0.68) {
      this.ball.triggerRailGrind(Math.sign(this.ball.position.x) || 1);
    }

    this.splashes.spawn(
      this.ball.position.x, surfaceY, this.ball.position.z,
      new THREE.Color(this.ball.currentSkin.primaryColor), hardness);

    // Follow-through in the world: ground dust cloud
    this.particles.emitLandingDust(this.ball.position, hardness);

    this.ball.triggerLandingSquash(isPerfect, isSlam, hardness);
    this.particles.emitBounce(this.ball.position, isPerfect);
    if (isSlam) {
      this.sound.playSlamLaunch(hardness);
      this.particles.emitSlamImpact(this.ball.position);
    } else if (isPerfect) {
      this.sound.playPerfectBounce();
    } else {
      this.sound.playBounce(0.6 + hardness * 0.6);
    }
    this.cameraRig.addTrauma(0.08 + hardness * 0.25);
    if (hardness > 0.6) this.cameraRig.kickFov(2.5);

    const trickResults = this.ball.finalizeAirTricks();
    const trickPts = this.score.addTricks(trickResults);
    if (trickPts > 0) {
      this.sound.playTrick(trickResults.tricks.join(' '), trickResults.spins);
      this.particles.emitTrickComplete(this.ball.position, trickResults.tricks.join(' '));
      this.hud.showBanner(`TRICK +${trickPts}`, 'trick');
      this.ball.setFaceExpression('delight', true, 0.45);
    }

    this.landingReticle.triggerTakeoff(this.ball.position.x, surfaceY, this.ball.position.z, big);
  }

  private triggerDeath(): void {
    if (this.state.getState() === GameStateEnum.DYING || this.state.getState() === GameStateEnum.RESULTS) return;

    this.state.setState(GameStateEnum.DYING);
    this.deathTimer = 0;
    this.sound.playDeath();
    this.music.stop();

    this.hitStopTimer = CONSTANTS.HIT_STOP_DEATH;
    // A death is the one moment worth slowing down for: the freeze lands the
    // hit, then the world comes back at a third speed and decays to normal.
    this.slowMo = 0.95;

    // Ball-specific debris shards matching skin and gold studs
    const skinHex = parseInt(this.ball.currentSkin.primaryColor.replace('#', ''), 16) || HEX.gilt;
    this.particles.emitBallDebris(this.ball.position, skinHex);
    this.cameraRig.addTrauma(0.95);
    this.hud.setDanger(true);
    this.ball.setFaceExpression('dizzy', true, 2.0);

    // The ball deforms heavily on lethal hit and is thrown clear
    this.ball.impact(0.88);
    this.deathSpin.set(
      (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 18);
    // Knocked up and back along its own travel, with a lateral kick.
    this.ball.velocity.set(
      this.ball.velocity.x * 0.4 + (Math.random() - 0.5) * 9,
      20 + Math.random() * 5,
      this.ball.velocity.z * 0.45);
    this.score.saveScore();
    this.submitCurrentRun();
    this.ghost.saveGhostRun(this.currentMode, false);
  }

  private triggerVictory(): void {
    if (this.state.getState() === GameStateEnum.VICTORY || this.state.getState() === GameStateEnum.RESULTS) return;

    this.state.setState(GameStateEnum.VICTORY);
    this.victoryTimer = 0;
    this.sound.playVictory();
    this.music.stop();

    this.particles.emitVictoryConfetti(this.ball.position);
    this.cameraRig.addTrauma(0.4);
    this.ball.setFaceExpression('cool');
    this.hud.showBanner('VICTORY CLEAR', 'perfect');
    this.score.saveScore();
    this.submitCurrentRun();
    this.ghost.saveGhostRun(this.currentMode, true);
  }

  private submitCurrentRun(): void {
    const payload: RunSubmissionPayload = {
      mode: this.currentMode,
      score: this.score.score,
      distance: this.score.distance,
      coins: this.score.coins,
      maxCombo: this.score.maxCombo,
      runTime: this.score.runTime,
      perfects: this.score.perfectLandings,
      nearMisses: this.score.nearMisses,
      topSpeed: this.score.topSpeedKmh / 2.3,
    };

    Api.submitRun(payload).then((res) => {
      if (res.newlyUnlocked && res.newlyUnlocked.length > 0) {
        res.newlyUnlocked.forEach((slug) => {
          this.hud.showBanner(`ACHIEVEMENT: ${slug.toUpperCase()}`, 'perfect');
        });
      }
      if (res.progression) {
        this.abilities.lifetimeCoins = res.progression.lifetimeCoins;
        this.menus.refresh();
      }
    }).catch((err) => {
      console.warn('[BOUNCE] Run submission error:', err);
    });
  }

  public start(): void {
    this.clock.start();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  private gameLoop(): void {
    requestAnimationFrame(this.gameLoop.bind(this));

    const raw = Math.min(this.clock.getDelta(), 0.25);
    this.input.update();

    // The load ascent owns the camera and the render while it runs. Without
    // this the loop's own camera update lands after it every frame and the
    // climb is invisible — the ascent was being drawn and then immediately
    // overwritten by the attract framing.
    if (this.introActive) return;

    // ---- time scaling -----------------------------------------------------
    // Hit stop is a near-freeze rather than a hard skip: the old code returned
    // out of the update entirely, which stopped the camera and FX dead and
    // read as a stutter instead of a punch.
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= raw;
      this.timeScale = 0.02;
    } else {
      this.slowMo = Math.max(0, this.slowMo - raw * 1.15);
      const target = this.state.getState() === GameStateEnum.DYING
        ? THREE.MathUtils.lerp(1, 0.32, this.slowMo)
        : 1;
      this.timeScale = THREE.MathUtils.damp(this.timeScale, target, 16, raw);
    }

    if (this.menus?.isPaused) {
      // Frozen, but still presented: the world is visibly pushed aside behind
      // the panel rather than stopped dead.
      this.menus.setPauseStats(
        this.score.score, this.score.distance, this.score.combo,
        this.course.getUpcomingSegment(this.ball.position.z)?.displayName ?? 'The Causeway');
      this.present(raw);
      return;
    }

    // ---- fixed-step simulation -------------------------------------------
    // Physics runs on a fixed step so a landing always resolves at the same
    // sub-frame position. On a variable step the apex height and the perfect
    // window drift frame to frame, and the game behaves differently on a
    // 120Hz display than a 60Hz one.
    this.accumulator += raw * this.timeScale;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps++ < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      this.simulate(FIXED_DT);
    }
    // Drop any backlog we could not afford, rather than spiralling.
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.present(raw);
  }

  /** One fixed simulation step. */
  private simulate(delta: number): void {

    // Instant Quick Retry with 'R'
    if (this.input.consumeQuickRetry()) {
      this.sound.playUIClick();
      this.startIntroOrCountdown();
      return;
    }

    // Toggle Info Modal or Close with Escape
    if (this.input.consumePause()) {
      if (this.infoModal.isVisible()) {
        this.infoModal.hide();
      } else if (this.state.getState() === GameStateEnum.PLAYING || this.menus.isPaused) {
        this.menus.setPaused(!this.menus.isPaused);
      } else if (this.state.getState() === GameStateEnum.TITLE) {
        this.infoModal.show();
      }
    }

    switch (this.state.getState()) {
      case GameStateEnum.TITLE:
        this.updateTitle(delta);
        break;
      case GameStateEnum.CINEMATIC_INTRO:
        this.updateIntro(delta);
        break;
      case GameStateEnum.COUNTDOWN:
        this.updateCountdown(delta);
        break;
      case GameStateEnum.PLAYING:
        this.updatePlaying(delta);
        break;
      case GameStateEnum.DYING:
        this.updateDying(delta);
        break;
      case GameStateEnum.VICTORY:
        this.updateVictory(delta);
        break;
      case GameStateEnum.RESULTS:
        this.updateResults(delta);
        break;
    }

  }

  /**
   * Once-per-frame presentation: FX and rendering.
   *
   * Runs on the real frame delta rather than the fixed step, so particles and
   * shader time stay smooth regardless of how many simulation steps the frame
   * happened to consume.
   */
  /** Position the steering affordance. The only touch chrome in the game. */
  /** Drive the control deck from live simulation state. */
  private updateControlDeck(): void {
    this.deck.update({
      inWindow: this.armState === ArmState.Armed,
      isDashing: this.ball.isDashing,
      dashCooldown: this.ball.dashCooldown,
      boostFloats: this.ball.boostFloats,
      isSlamming: this.ball.isSlamming,
      slamCooldown: this.ball.slamCooldown,
      steerAxis: this.input.steerAxis,
      abilities: this.abilities,
    });
  }

  private updateTouchRing(): void {
    if (!this.touchRing) {
      this.touchRing = document.getElementById('touch-ring');
      this.touchNub = document.getElementById('touch-nub');
    }
    const r = this.input.steerRing;
    if (!this.touchRing || !this.touchNub) return;
    if (r.active) {
      this.touchRing.style.left = `${r.originX}px`;
      this.touchRing.style.top = `${r.originY}px`;
      const clamped = Math.max(-54, Math.min(54, r.x - r.originX));
      this.touchNub.style.left = `${r.originX + clamped}px`;
      this.touchNub.style.top = `${r.originY}px`;
      this.touchRing.classList.add('on');
      this.touchNub.classList.add('on');
    } else {
      this.touchRing.classList.remove('on');
      this.touchNub.classList.remove('on');
    }
  }

  private present(raw: number): void {
    this.updateTouchRing();
    this.updateControlDeck();
    const speed01 = Math.max(0, Math.min(1,
      (this.currentSpeed - CONSTANTS.BASE_SPEED) / (CONSTANTS.MAX_SPEED - CONSTANTS.BASE_SPEED)));
    updateWorldUniforms(raw, speed01, this.currentSpeed / CONSTANTS.BASE_SPEED);

    this.particles.update(raw * this.timeScale);
    this.pipeline.updateLightPosition(this.ball.position);
    this.pipeline.render();
  }

  /**
   * The load ascent.
   *
   * The old preloader was a gold card with a percentage on it — a website
   * preloader, and it sat *in front of* the game rather than being any part of
   * it. This is the engine instead: the camera starts far below the cloud sea
   * and climbs, so the progress bar is an altimeter and the reveal is the
   * player breaking through the cloud layer into the ruin.
   *
   * It costs nothing to run, because these are frames the renderer is drawing
   * during load anyway — the world is being warmed either way, so it may as
   * well be watched.
   *
   * @param t 0..1 of the climb. 1 is the title framing exactly, so the handover
   *          to the attract camera has nothing to blend.
   */
  public introAscent(t: number): void {
    const k = Math.max(0, Math.min(1, t));
    // Ease out hard: most of the climb happens early, and the last stretch
    // drifts, which is what makes arriving feel like arriving.
    const e = 1 - Math.pow(1 - k, 2.4);

    // Grounded in where the world actually is. The column bases sit at y=-34
    // and the deck at y=0, so a climb that starts at -300 is 270 units below
    // anything to look at — which is exactly what the first attempt did, and
    // why it rendered as flat sky. Starting just under the piers means the
    // architecture is in frame from the first second.
    const startY = -78, endY = CONSTANTS.CAM_OFFSET_Y + 4;
    const y = startY + (endY - startY) * e;

    // A slow arc inward: wide and off-axis at the bottom, squared up on the
    // causeway by the top, so the last frame is already the title framing.
    const swing = (1 - e) * (1 - e);
    const cam = this.pipeline.camera;
    cam.position.set(
      Math.sin(1.9 + e * 1.6) * 34 * swing,
      y,
      this.ball.position.z + CONSTANTS.CAM_OFFSET_Z - swing * 26,
    );
    // Looking up the colonnade at the start, levelling onto the road at the top.
    cam.lookAt(0, y + 34 * swing + 2, this.ball.position.z + 34);
    cam.updateProjectionMatrix();

    // Fog closes in low and opens as the camera clears the deck, so the world
    // resolves out of the murk rather than fading up from nothing.
    worldUniforms.uFogRange.value.set(
      26 + e * (FOG_NEAR_BASE - 26),
      150 + e * (FOG_FAR_BASE - 150),
    );

    this.skybox.update(this.ball.position.z, 0);
    this.bridge.update(this.ball.position.z);
    this.pipeline.render();
  }

  /** Hand the camera back to the attract rig once the climb finishes. */
  public endIntroAscent(): void {
    this.introActive = false;
    worldUniforms.uFogRange.value.set(FOG_NEAR_BASE, FOG_FAR_BASE);
    this.cameraRig.reset(this.ball.position);
  }

  private updateTitle(delta: number): void {
    if (this.menus.isMenuOpen() || this.infoModal.isVisible() || this.titleScreen.isModeModalOpen()) {
      // Never start the game while interacting with username modal, settings, or guide
      this.input.consumeStart();
    } else if (this.input.consumeStart()) {
      this.sound.playUIClick();
      this.startIntroOrCountdown();
      return;
    }

    // Attract mode: The demo ball cruises forward along the solid course,
    // streaming the environment in the background with zero HUD clutter.
    this.titleBallT += delta;
    const t = this.titleBallT;
    const period = 1.15;
    const ph = (t % period) / period;
    const h = Math.sin(ph * Math.PI) * 5.8;
    const speed = 22;
    const x = Math.sin(t * 0.4) * 2.2;
    const prevZ = this.ball.position.z;
    this.ball.position.set(x, CONSTANTS.BALL_RADIUS + h, prevZ + speed * delta);
    this.ball.velocity.set(Math.cos(t * 0.4) * 1.2, Math.cos(ph * Math.PI) * 18, speed);

    if (ph < delta / period) {
      this.ball.triggerLandingSquash(false, false);
      this.particles.emitBounce(this.ball.position, false);
      this.sound.playBounce(0.35);
    }

    this.ball.update(delta, 0, -1, false, false, this.pipeline.camera.position);
    this.course.update(this.ball.position.z, delta);
    this.skybox.update(this.ball.position.z, delta);
    this.bridge.update(this.ball.position.z);
    this.cameraRig.update(this.ball.position, speed, false, delta);
  }

  private updateIntro(delta: number): void {
    this.ball.update(delta, 0, -1, false, false, this.pipeline.camera.position);
    this.skybox.update(this.ball.position.z, delta);
    this.bridge.update(this.ball.position.z);
    this.course.update(this.ball.position.z, delta);
    this.cameraRig.update(this.ball.position, CONSTANTS.BASE_SPEED, false, delta);
    this.state.update(delta);

    if (this.state.getStateTime() >= 1.1 || this.input.consumeStart()) {
      this.startCountdown();
    }
  }

  private updateCountdown(delta: number): void {
    this.skybox.update(this.ball.position.z, delta);
    this.bridge.update(this.ball.position.z);
    this.course.update(this.ball.position.z, delta);

    const prevInt = Math.ceil(this.countdownTimer);
    this.countdownTimer -= delta * 1.35;
    const curInt = Math.ceil(this.countdownTimer);

    if (curInt !== prevInt && curInt > 0) {
      this.countdownText.textContent = curInt.toString();
      this.countdownText.classList.remove('pop');
      void this.countdownText.offsetWidth; // Reflow to replay CSS pop animation
      this.countdownText.classList.add('pop');
      this.sound.playCountdownTick(curInt);
    } else if (this.countdownTimer <= 0 && this.countdownText.textContent !== 'BOUNCE') {
      this.countdownText.textContent = 'BOUNCE';
      this.countdownText.classList.remove('pop');
      void this.countdownText.offsetWidth;
      this.countdownText.classList.add('pop');
      this.sound.playCountdownGo();
      this.countdownTimer = -0.001;
    } else if (this.countdownTimer < 0 && this.state.getState() === GameStateEnum.COUNTDOWN) {
      if (this.countdownTimer <= -0.35) {
        this.beginPlay();
      }
    }

    // Anticipation: the ball hovers smoothly in place, breathing, then drops on BOUNCE!
    // Hover at exactly the height play will begin from, so the transition is
    // continuous in position as well as in time.
    const apexY = CONSTANTS.ROAD_Y + 0.5 + this.ball.radius + CONSTANTS.BOUNCE_MIN_APEX;
    const hover = Math.sin(this.countdownTimer * 5.0) * 0.35;
    this.ball.position.set(0, apexY + hover, 4);
    this.ball.velocity.set(0, hover * 1.4, 0.01);
    this.ball.update(delta, 0, -1, false, false, this.pipeline.camera.position);
    this.cameraRig.update(this.ball.position, CONSTANTS.BASE_SPEED, false, delta);
  }

  /**
   * Closed-form trajectory prediction: time until ball's bottom reaches road deck level
   */
  private solveTimeToLand(): number {
    const h = this.ball.position.y - this.ball.radius - CONSTANTS.ROAD_Y;
    const v = this.ball.velocity.y;
    const g = this.currentGravity;
    // h + v t - 0.5 g t^2 = 0
    const disc = v * v + 2 * g * h;
    if (disc < 0) return -1;
    const t = (v + Math.sqrt(disc)) / g;
    return t > 0 ? t : -1;
  }



  private updatePlaying(delta: number): void {
    // Hit stop is handled by the time scale in the main loop, so the world
    // keeps moving at 2% speed rather than stopping outright.

    // 1. Controls Hint Fade Timer
    if (this.controlsHintTimer > 0) {
      this.controlsHintTimer -= delta;
      if (this.controlsHintTimer <= 0) this.deck.setFaded(true);
    }

    // Cooldowns & Timers
    this.armLockoutTimer = Math.max(0, this.armLockoutTimer - delta);

    // 2. Solve Landing Prediction
    this.timeToLand = this.solveTimeToLand();
    // The ring must teach the rule the perfect actually uses. A press counts
    // if it is at most CHAIN_WINDOW old at the moment of contact, so the ring
    // goes hot exactly when a tap would still be inside that window on landing.
    const inTimingWindow =
      this.timeToLand >= 0 && this.timeToLand <= CONSTANTS.CHAIN_WINDOW;

    // Note: the action press is consumed once, further down, in the jump
    // block. A second consumeAction() used to sit here and swallowed the press
    // before that block ever saw it — which silently disabled the perfect
    // bounce entirely, because the press timer it keys off was never reset.

    // Ability trigger.
    this.abilities.update(delta);
    if (this.input.consumeAbility() && this.abilities.trigger()) {
      const d = this.abilities.def;
      this.sound.playSpeedBoost();
      this.cameraRig.kickFov(9);
      this.cameraRig.addTrauma(0.3);
      this.announceAbility(d.name, ABILITY_GLYPH[d.id] ?? '\u2726', d.tint);
      this.deck.flashAbility();
      this.particles.emitBounce(this.ball.position, true);
      if (d.id === 'comet') this.ball.setFaceExpression('cool');
    }

    // --- active ability effects -------------------------------------------
    const ab = this.abilities;
    const abActive = ab.active > 0;

    // TEMPO slows the world but not the player's authority over it: the time
    // scale drops while steering and the perfect window stay at full rate,
    // which is what makes it feel like clarity rather than sluggishness.
    if (abActive && ab.equipped === 'tempo') this.timeScale = Math.min(this.timeScale, 0.34);

    // COMET: speed, immunity, and coins pulled in.
    if (abActive && ab.equipped === 'comet') {
      this.bonusBoost = Math.min(CONSTANTS.BOOST_CAP, this.bonusBoost + 22 * delta);
    }

    // 4. Air Dash Action (Shift / K / X)
    const airDash = this.input.consumeAirDash();
    if (airDash.triggered) {
      if (this.ball.canAirDash()) {
        const dir = airDash.dir !== 0 ? airDash.dir : this.input.steerAxis > 0.2 ? 1 : this.input.steerAxis < -0.2 ? -1 : 0;
        if (this.ball.triggerAirDash(dir)) {
          this.sound.playAirDash();
          this.cameraRig.addTrauma(0.35);
          this.cameraRig.kickFov(CONSTANTS.CAM_DASH_FOV_KICK);
          this.hitStopTimer = CONSTANTS.HIT_STOP_DASH;
          const trailHex = parseInt(this.ball.currentSkin.trailColor.replace('#', ''), 16) || HEX.giltBright;
          this.particles.emitAirDashThrust(this.ball.position, dir, trailHex);
          this.hud.showBanner('AIR DASH', 'trick');
          this.score.addTricks({ airTime: 0, spins: 0, tricks: ['AIR DASH'] });
        }
      }
    }

    // 5. Slam Action (S / Down Arrow)
    if (this.input.consumeSlam()) {
      if (this.ball.canSlam()) {
        if (this.ball.triggerSlam()) {
          this.sound.playSlam();
          this.cameraRig.addTrauma(0.42);
          this.hud.showBanner('SLAM', 'trick');
        }
      }
    }

    // 6. Calibrated Speed Ramp & Pacing
    // Distance, not seconds. Difficulty and module selection used to ramp on
    // different clocks — one on runTime, one on distance travelled — and since
    // the ball covers the back of a course far faster than the front, the two
    // drifted apart by about a third of the run.
    const progress = progressOf(this.ball.position.z, GAME_MODES[this.currentMode].finishDistance);
    this.difficulty = difficultyAt(progress);
    this.baseSpeed = bandAt('speed', this.difficulty);
    this.bonusBoost = Math.max(0, this.bonusBoost - CONSTANTS.BOOST_DECAY * delta);
    this.currentSpeed = this.baseSpeed + this.bonusBoost;
    this.ball.velocity.z = this.currentSpeed;

    // The generator sizes its reachability guarantee off the speed and arc the
    // player will actually meet the new geometry with.
    this.course.setRuntimeState(this.currentSpeed, this.difficulty);

    // 7. Steering Physics (A = Left/+X, D = Right/-X)
    const steerMax = CONSTANTS.STEER_BASE + CONSTANTS.STEER_PER_SPEED * this.currentSpeed;
    const targetSteerVel = this.input.steerAxis * steerMax;
    const accel = CONSTANTS.STEER_ACCEL * (this.ball.isGrounded ? CONSTANTS.STEER_GROUND_ACCEL_MUL : 1.0);

    if (Math.abs(this.input.steerAxis) < 0.02) {
      this.ball.velocity.x *= Math.exp(-CONSTANTS.STEER_DRAG * delta);
    } else {
      const diff = targetSteerVel - this.ball.velocity.x;
      const step = accel * delta;
      this.ball.velocity.x += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    }

    // Lateral boundary clamp
    this.ball.position.x = Math.max(
      -CONSTANTS.MAX_COURSE_WIDTH,
      Math.min(CONSTANTS.MAX_COURSE_WIDTH, this.ball.position.x + this.ball.velocity.x * delta)
    );

    // ---- 8. Jump and ground state ----------------------------------------
    //
    // The ball rolls. It leaves the deck only when the player says so, and how
    // long they hold decides how far it goes. Three pieces of grace make that
    // feel fair rather than fussy, and all three are standard platformer
    // furniture that this game was missing entirely:
    //
    //   coyote time — you can still jump for a moment after running off an edge
    //   jump buffer — pressing just before you land still jumps on touchdown
    //   jump cut    — releasing while rising ends the climb early
    //
    // Without them a player who presses one frame late simply falls, and blames
    // the game rather than themselves. Correctly, in that case.
    if (this.input.consumeAction()) {
      this.jumpBuffer = CONSTANTS.JUMP_BUFFER;
      // Age of the most recent *fresh* press. Holding the button does not
      // refresh it, which is the whole point: a held bounce is powerful but
      // unskilled, a tapped one on the beat is the perfect.
      this.pressAge = 0;
    }
    this.pressAge += delta;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - delta);
    this.landedTimer += delta;

    if (this.ball.isGrounded) {
      this.coyote = CONSTANTS.COYOTE_TIME;
    } else {
      this.coyote = Math.max(0, this.coyote - delta);
    }

    const jumpArc = arcFrom(CONSTANTS.JUMP_APEX, CONSTANTS.JUMP_AIRTIME);
    this.currentGravity = jumpArc.g;

    // Coyote jump: if the ball has just run off the end of a deck without
    // touching down, a press still buys one full-height bounce out of thin air.
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.ball.isGrounded && !this.ball.isSlamming) {
      this.ball.velocity.y = jumpArc.v0;
      this.isRising = true;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.sound.playBounce(0.9);
      this.ball.triggerLaunchStretch(false);
    }

    // Releasing the button while still rising cuts the climb short.
    if (this.isRising && this.ball.velocity.y > 0 && !this.input.actionHeld) {
      this.ball.velocity.y *= CONSTANTS.JUMP_CUT;
      this.isRising = false;
    }
    if (this.ball.velocity.y <= 0) this.isRising = false;

    // ---- vertical integration --------------------------------------------
    // FEATHERFALL cuts gravity to a sixth while airborne and descending, so
    // the ball hangs and the player chooses a landing instead of accepting one.
    const feather = abActive && ab.equipped === 'featherfall'
      && !this.ball.isGrounded && this.ball.velocity.y < 2;
    if (feather) this.ball.velocity.y = Math.max(this.ball.velocity.y, -9);

    const effGravity = feather ? this.currentGravity * 0.16
      : this.ball.isSlamming
      ? CONSTANTS.SLAM_GRAVITY
      : this.ball.isDashing
      ? this.currentGravity * CONSTANTS.AIR_DASH_HOVER_GRAVITY
      : this.currentGravity;

    // Where the ball's underside was before this step. Landing is a swept
    // test against this: you can only come to rest on a surface you were
    // already above, which is what stops the ball being yanked up onto decks
    // it is falling past.
    const prevFootY = this.ball.position.y - this.ball.radius;

    if (!this.ball.isGrounded) {
      this.ball.velocity.y -= effGravity * this.gravityDir * delta;
      this.ball.position.y += this.ball.velocity.y * delta;
    }
    this.ball.position.z += this.ball.velocity.z * delta;

    // ---- touchdown: the ball always leaves again ---------------------------
    //
    // A bouncing ball that comes to rest is just a ball. The previous pass
    // replaced the automatic bounce with a jump and, in doing so, threw the
    // game's whole identity out with it: the ball rolled along the deck and
    // only left the ground on command.
    //
    // So the bounce is unconditional and the *height* is what the player owns.
    // Land with the button down and you commit to a full-height arc; land
    // without it and you get the small idle bounce. One gravity, two launch
    // speeds, and jump-cut fills in everything between them.
    const surfaceY = this.course.surfaceYAt(
      this.ball.position.x, this.ball.position.z, prevFootY + 0.35);
    const footY = this.ball.position.y - this.ball.radius;

    if (surfaceY !== null && this.ball.velocity.y <= 0 &&
        footY <= surfaceY + CONSTANTS.GROUND_STICK) {
      const impactVy = this.ball.velocity.y;
      this.ball.position.y = surfaceY + this.ball.radius;

      const wantsBig = this.jumpBuffer > 0 || this.input.actionHeld;
      // PERFECT BOUNCE: the press landed inside the window around touchdown.
      //
      // This used to test `landedTimer <= CHAIN_WINDOW` — time since the *last*
      // landing — which at a landing is always the full flight time, so the
      // condition could never be true and the perfect bounce silently did not
      // exist. What it should measure, and now does, is how close the player's
      // press was to the moment of contact.
      const chained = this.pressAge <= CONSTANTS.CHAIN_WINDOW;

      // Same gravity for both, so the arc a player learns stays the arc they
      // trust — only the launch speed changes.
      const bigV0 = arcFrom(CONSTANTS.JUMP_APEX, CONSTANTS.JUMP_AIRTIME).v0;
      const minV0 = Math.sqrt(2 * jumpArc.g * CONSTANTS.BOUNCE_MIN_APEX);

      // A slam overrides both launch speeds: the plunge is paid back as a
      // pop. `isSlamming` is still set at this point — onTouchdown clears it.
      //
      // Scaled by impact speed, so dropping from the top of a big arc pops
      // higher than a slam tapped just above the deck. That turns the slam
      // from a pure descent tool into a setup move: dive through a low coin
      // run, then get launched into the high one on the way out.
      const slammed = this.ball.isSlamming;
      const slamPop = THREE.MathUtils.clamp(
        (Math.abs(impactVy) - Math.abs(CONSTANTS.SLAM_DOWN_VELOCITY)) / 42, 0, 1);

      this.ball.velocity.y = slammed
        ? Math.sqrt(2 * jumpArc.g * THREE.MathUtils.lerp(
            CONSTANTS.SLAM_REBOUND_APEX, CONSTANTS.SLAM_REBOUND_APEX_MAX, slamPop))
        : (wantsBig || chained)
        ? bigV0 * (chained ? 1.10 : 1.0)
        : minV0;
      this.ball.isGrounded = false;
      // Only a commanded bounce can be cut short; the idle one is already
      // at its floor and cutting it would stall the ball dead. The slam pop is
      // committed too — the player has almost always released the key by the
      // time they land, so making it cuttable would cancel it on arrival.
      this.isRising = !slammed && (wantsBig || chained);
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.landedTimer = 0;
      if (chained) this.pressAge = 99;

      if (chained) {
        this.bonusBoost = Math.min(CONSTANTS.BOOST_CAP, this.bonusBoost + CONSTANTS.CHAIN_BOOST);
        this.score.addLanding('PERFECT');
        this.cameraRig.kickFov(CONSTANTS.CAM_PERFECT_FOV_KICK + Math.min(4.5, this.score.combo * 0.25));
        this.particles.emitChainBurst(this.ball.position, this.score.combo);
        this.hud.showBanner(
          this.score.combo >= 5 ? `PERFECT BOUNCE  x${this.score.combo}` : 'PERFECT BOUNCE!', 'perfect');
        this.hud.pulseCombo();
        this.ball.setFaceExpression('happy', true, 0.40);
      }
      if (slammed) {
        this.cameraRig.kickFov(CONSTANTS.CAM_PERFECT_FOV_KICK * (0.8 + slamPop * 0.7));
        this.particles.emitChainBurst(this.ball.position, 3 + Math.round(slamPop * 6));
        this.hud.showBanner(slamPop > 0.6 ? 'SLAM LAUNCH!' : 'SLAM POP', 'trick');
        this.score.addTricks({ airTime: 0, spins: 0, tricks: ['SLAM POP'] });
      }

      this.onTouchdown(impactVy, surfaceY, wantsBig, chained, slammed);
    }

    // Rolling bleeds a little speed, so holding a line is not free and the
    // chain jump has something to give back.
    if (this.ball.isGrounded) {
      this.bonusBoost = Math.max(0, this.bonusBoost - CONSTANTS.ROLL_FRICTION * delta);
    }

    // 9. Collision & Landing Detection
    const hits = this.course.checkCollisions(this.ball.position, this.ball.radius, this.ball.velocity);

    let hasInteractedWithGround = false;
    for (const hit of hits) {
      if (hit.isFinishLine) {
        this.triggerVictory();
        return;
      }

      if (hit.isLethal && !this.ball.isDashing) {
        const cometUp = this.abilities.active > 0 && this.abilities.equipped === 'comet';
        if (cometUp) {
          // Hazards shatter instead of killing, and pay out.
          this.particles.emitExplosion(this.ball.position);
          this.score.addBonusGem();
          this.cameraRig.addTrauma(0.35);
          continue;
        }
        if (this.abilities.consumeArmed()) {
          this.particles.emitExplosion(this.ball.position);
          this.hud.showBanner('AEGIS', 'perfect');
          this.sound.playSpeedBreak();
          for (let i = 0; i < 4; i++) this.score.addBonusGem();
          this.cameraRig.addTrauma(0.5);
          continue;
        }
        this.triggerDeath();
        return;
      }

      if (hit.isGravityShift && hit.gravityDir !== undefined) {
        if (this.gravityDir !== hit.gravityDir) {
          this.gravityDir = hit.gravityDir;
          this.cameraRig.setGravityOrientation(this.gravityDir === -1);
          this.hud.showBanner(this.gravityDir === -1 ? 'GRAVITY FLIP' : 'GRAVITY NORMAL', 'trick');
          this.sound.playSpeedBoost();
        }
        continue;
      }

      if (hit.isSpeedPad) {
        this.bonusBoost = Math.min(CONSTANTS.BOOST_CAP, this.bonusBoost + 8);
        this.sound.playSpeedBoost();
        this.cameraRig.kickFov(4.5);
        this.hud.showBanner('SPEED BOOST', 'perfect');
        continue;
      }

      if (hit.isBreakable && (this.ball.isDashing || this.ball.isSlamming || this.currentSpeed > 45)) {
        if (!hit.isBroken) {
          this.sound.playSpeedBreak();
          this.score.addSpeedBreak();
          this.particles.emitExplosion(this.ball.position);
          this.cameraRig.addTrauma(0.55);
          this.hitStopTimer = CONSTANTS.HIT_STOP_SPEED_BREAK;
          this.hud.showBanner('SPEED BREAK +1500', 'perfect');
        }
        continue;
      }

      if (hit.isBonusGem) {
        const wasReady = this.abilities.ready;
        this.score.addBonusGem();
        const unlocked = this.abilities.addCoin();
        this.ball.addBoostFloat();
        this.particles.emitBounce(this.ball.position, true);
        this.sound.playBounce(1.5);

        // What a coin actually does was never said anywhere: the banner
        // announced a boost float and the ability meter filled silently, so
        // the connection between picking coins up and earning abilities was
        // invisible. Both ends of it are now called out as they happen.
        if (unlocked) {
          const d = ABILITIES[unlocked];
          this.announceAbility(d.name, ABILITY_GLYPH[unlocked] ?? '\u2726', d.tint, 'Ability Unlocked');
          this.sound.playSpeedBoost();
          this.cameraRig.kickFov(7);
          this.particles.emitChainBurst(this.ball.position, 8);
          this.menus.refresh();
        } else if (!wasReady && this.abilities.ready) {
          this.hud.showBanner(`${this.abilities.def.name} READY`, 'perfect');
          this.sound.playPerfectBounce();
        } else {
          this.hud.showBanner('+1 BOOST FLOAT', 'trick');
        }
        continue;
      }

      if (hit.isBumper && hit.reboundForce) {
        this.ball.velocity.x += hit.reboundForce.x;
        this.ball.velocity.y = Math.max(this.ball.velocity.y, hit.reboundForce.y);
        this.cameraRig.addTrauma(0.38);
        this.sound.playBumperHit();
        this.score.addBumperHit();
        continue;
      }

      // Check standard platform landing
      // Ordinary landings are resolved by the ground-stick step above; the
      // only thing left for the collision pass is the spring pad, which
      // overrides the player's jump with a launch of its own.
      if (hit.hit && hit.isSpring && !hasInteractedWithGround && this.ball.velocity.y <= 0) {
        hasInteractedWithGround = true;
        const springArc = arcFrom(
          CONSTANTS.JUMP_APEX * CONSTANTS.SPRING_APEX_MUL,
          CONSTANTS.JUMP_AIRTIME * CONSTANTS.SPRING_AIRTIME_MUL);
        this.currentGravity = springArc.g;
        this.ball.position.y = (hit.bouncePos?.y ?? CONSTANTS.ROAD_Y) + this.ball.radius;
        this.ball.velocity.y = springArc.v0;
        this.ball.isGrounded = false;
        this.isRising = false;

        this.sound.playSpringLaunch();
        this.ball.triggerLaunchStretch(true);
        this.score.addSpringLaunch();
        this.cameraRig.kickFov(10);
        this.cameraRig.addTrauma(0.4);
        this.hitStopTimer = CONSTANTS.HIT_STOP_SPRING_LAUNCH;
        this.hud.showBanner('SPRING LAUNCH', 'perfect');
        this.landingReticle.triggerTakeoff(this.ball.position.x, CONSTANTS.ROAD_Y, this.ball.position.z, true);
      }
    }


    // 10. Proximity Near Miss Check
    if (this.course.checkNearMiss(this.ball.position, CONSTANTS.NEAR_MISS_RADIUS)) {
      this.nearMissHistory.push(this.worldTime);
      this.sound.playNearMiss(this.ball.position.x);
      this.particles.emitNearMiss(this.ball.position);
      this.cameraRig.addTrauma(0.3);
      this.score.addNearMiss();
      this.hud.showBanner('NEAR MISS +600', 'near-miss');
    }

    // 11. Abyss Falling Check
    if (this.ball.position.y < CONSTANTS.KILL_Y) {
      this.triggerDeath();
      return;
    }

    // 12. Update Projected Landing Reticle & Takeoff Origin Marker
    const predX = this.ball.position.x + this.ball.velocity.x * Math.max(0, this.timeToLand);
    const predZ = this.ball.position.z + this.ball.velocity.z * Math.max(0, this.timeToLand);
    const isSafe = this.course.isSolidFloorAt(predX, predZ) && !this.course.isLethalHazardAt(predX, predZ);

    this.landingReticle.update(
      delta,
      this.timeToLand,
      predX,
      predZ,
      isSafe,
      this.ball.mesh.visible
    );

    // 13. Ghost Trajectory Recording & Playback
    this.ghost.recordFrame(
      this.score.runTime,
      this.ball.position,
      this.ball.mesh.rotation.z,
      this.ball.mesh.scale,
      this.currentSpeed
    );
    const ghostDelta = this.ghost.updatePlayback(this.score.runTime, this.ball.position.z);

    // 14. Air Tricks Triggering
    if (!this.ball.isGrounded) {
      if (Math.abs(this.input.steerAxis) > 0.65 && this.ball.activeTrick === 'none') {
        this.ball.triggerCorkscrew(this.input.steerAxis > 0 ? 1 : -1);
      } else if (this.currentSpeed > 62 && this.ball.activeTrick === 'none') {
        this.ball.triggerCometSpin();
      }
    }

    // 15. Personality Expression State Machine
    this.worldTime += delta;
    this.nearMissHistory = this.nearMissHistory.filter((t) => this.worldTime - t < 5.0);
    if (Math.abs(this.input.steerAxis) < 0.05 && this.ball.isGrounded) {
      this.idleTimer += delta;
    } else {
      this.idleTimer = 0;
    }
    const edge = this.edgeProximity(this.ball.position.x, this.ball.position.z);

    if (this.nearMissHistory.length >= 3) {
      this.ball.setFaceExpression('shock', false, 0.6);
    } else if (this.ball.airTime > 1.1) {
      this.ball.setFaceExpression('strain', false, 0.4);
    } else if (edge > 0.82) {
      this.ball.setFaceExpression('panic', false, 0.4);
    } else if (this.abilities.active > 0) {
      this.ball.setFaceExpression('cool', false, 0.5);
    } else if (this.score.combo >= 25) {
      this.ball.setFaceExpression('smug', false, 0.6);
    } else if (this.score.combo >= 10) {
      this.ball.setFaceExpression('determined', false, 0.5);
    } else if (this.currentSpeed > 62) {
      this.ball.setFaceExpression('focus', false, 0.4);
    } else if (this.idleTimer > 8.0) {
      this.ball.setFaceExpression('sleepy', false, 0.6);
    } else {
      this.ball.setFaceExpression('normal', false, 0.3);
    }

    // 16. Look-Ahead Hazard Gaze Tracking
    let lookX = 0, lookY = 0;
    let closestDist = 999;
    const upcomingSeg = this.course.getUpcomingSegment(this.ball.position.z);
    if (upcomingSeg) {
      for (const obs of upcomingSeg.obstacles) {
        const dz = obs.position.z - this.ball.position.z;
        if (dz > 0 && dz < closestDist) {
          closestDist = dz;
          lookX = THREE.MathUtils.clamp((obs.position.x - this.ball.position.x) * 0.12, -0.4, 0.4);
          lookY = THREE.MathUtils.clamp((obs.position.y - this.ball.position.y) * 0.12, -0.3, 0.3);
        }
      }
    }

    // 17. Update Entities, Camera & HUD
    const forwardDist = this.ball.velocity.z * delta;
    const speedKmh = this.currentSpeed * 2.3;
    this.score.addDistance(forwardDist, speedKmh);
    this.score.update(delta);

    this.ball.update(
      delta,
      this.input.steerAxis,
      this.timeToLand,
      this.pressAge <= CONSTANTS.CHAIN_WINDOW,
      inTimingWindow,
      this.pipeline.camera.position,
      this.input.trickLeft,
      this.input.trickRight,
      { x: lookX, y: lookY }
    );

    this.particles.emitSpeedWake(this.ball.position, this.ball.isDashing);
    this.course.update(this.ball.position.z, delta);
    this.skybox.update(this.ball.position.z, delta);
    this.bridge.update(this.ball.position.z);
    this.cameraRig.update(
      this.ball.position,
      this.currentSpeed,
      this.ball.isDashing,
      delta,
      this.input.steerAxis,
      this.ball.velocity.x
    );

    const modeConfig = GAME_MODES[this.currentMode];
    const nextSeg = this.course.getUpcomingSegment(this.ball.position.z);
    this.sound.updateSpeedAmbience(this.currentSpeed / CONSTANTS.MAX_SPEED);
    this.music.update(this.currentSpeed, this.score.combo, this.abilities.active > 0, true);

    this.hud.update(
      this.score,
      speedKmh,
      this.ball.boostFloats,
      nextSeg,
      this.ball.dashCooldown,
      this.ball.slamCooldown,
      this.ball.isSlamming,
      this.armState === ArmState.Armed,
      this.armState === ArmState.Whiffed,
      inTimingWindow,
      ghostDelta,
      modeConfig.finishDistance
    );
  }

  private updateDying(delta: number): void {
    this.deathTimer += delta;

    // Ballistic tumble. Gravity is lighter than in play so the arc hangs and
    // the slow-motion ramp has something to linger on.
    this.ball.velocity.y -= 46 * delta;
    this.ball.position.addScaledVector(this.ball.velocity, delta);

    this.ball.group.rotation.x += this.deathSpin.x * delta;
    this.ball.group.rotation.y += this.deathSpin.y * delta;
    this.ball.group.rotation.z += this.deathSpin.z * delta;
    // Tumble bleeds off, so the body settles rather than spinning forever.
    this.deathSpin.multiplyScalar(Math.exp(-1.6 * delta));

    // Dynamic tumble deformation along angular motion
    const spinSpeed = this.deathSpin.length();
    if (spinSpeed > 1.5) {
      this.ball.impact(-0.06 * delta * spinSpeed);
    }

    this.ball.update(delta, 0, -1, false, false, this.pipeline.camera.position);
    this.cameraRig.update(this.ball.position, 10, false, delta);
    this.skybox.update(this.ball.position.z, delta);
    this.bridge.update(this.ball.position.z);
    this.course.update(this.ball.position.z, delta);

    // Long enough to read as a fall, not so long the player is waiting.
    if (this.deathTimer >= 1.5) {
      this.state.setState(GameStateEnum.RESULTS);
      this.hud.show(false);
      this.hud.setDanger(false);
      this.landingReticle.reset();
      this.splashes.reset();
      this.gameOverScreen.show(this.score, false);
      this.ball.group.rotation.set(0, 0, 0);
      this.ball.mesh.visible = true;
    }
  }

  private updateVictory(delta: number): void {
    this.victoryTimer += delta;
    this.ball.position.z += 18 * delta; // Slow-mo drift past finish
    this.cameraRig.update(this.ball.position, 18, false, delta * 0.6);

    if (this.victoryTimer >= 1.2) {
      this.state.setState(GameStateEnum.RESULTS);
      this.hud.show(false);
      this.landingReticle.reset();
    this.splashes.reset();
    this.abilities.resetRun();
      this.gameOverScreen.show(this.score, true);
    }
  }

  private updateResults(_delta: number): void {
    if (this.input.consumeStart()) {
      this.sound.playUIClick();
      this.startIntroOrCountdown();
    }
  }
}
