import { SynthVoice } from './SynthVoice';

/**
 * Procedural Arcade Sound Engine for BOUNCE
 * Web Audio API synthesizer for all dynamic kinetic effects.
 */
export class SoundEngine {
  private static instance: SoundEngine;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  public static getInstance(): SoundEngine {
    if (!this.instance) {
      this.instance = new SoundEngine();
    }
    return this.instance;
  }

  constructor() {
    this.initWindAmbience();
  }

  private initWindAmbience(): void {
    try {
      const ctx = SynthVoice.getContext();
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windFilter.frequency.setValueAtTime(200, ctx.currentTime);

      this.windGain = ctx.createGain();
      this.windGain.gain.setValueAtTime(0.0001, ctx.currentTime);

      whiteNoise.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(SynthVoice.getMasterNode());

      whiteNoise.start();
    } catch {
      // AudioContext activated on first user touch/key
    }
  }

  public updateSpeedAmbience(speedRatio: number): void {
    if (!this.windGain || !this.windFilter) return;
    const ctx = SynthVoice.getContext();
    const targetVol = Math.max(0.0001, Math.min(0.12, (speedRatio - 0.5) * 0.22));
    const targetCutoff = 250 + speedRatio * 1200;

    this.windGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.15);
    this.windFilter.frequency.setTargetAtTime(targetCutoff, ctx.currentTime, 0.15);
  }

  /**
   * Timing Whiff / Miss Sound: Subtle dry buzz
   */
  public playWhiff(): void {
    SynthVoice.playTone(110, 0.08, 'sawtooth', {
      volume: 0.18,
      pitchBend: 55,
      decay: 0.07,
      filterFreq: 600,
      bus: 'pickup',
    });
  }

  /**
   * Ground Jump Sound: Crisp gentle upward blip
   */
  public playJump(): void {
    SynthVoice.playTone(260, 0.09, 'sine', {
      volume: 0.20,
      pitchBend: 520,
      decay: 0.07,
      bus: 'sfx',
    });
  }

  /**
   * Air Dash: High-speed Doppler whoosh - crisp, short and punchy
   */
  public playAirDash(): void {
    SynthVoice.playNoise(0.14, {
      volume: 0.28,
      filterFreqStart: 3200,
      filterFreqEnd: 800,
      filterQ: 3.0,
      filterType: 'bandpass',
      bus: 'pickup',
    });
    SynthVoice.playTone(480, 0.12, 'triangle', {
      volume: 0.18,
      pitchBend: 960,
      filterFreq: 2400,
      bus: 'pickup',
    });
  }

  /**
   * Ground Pound Slam: Deep sub-bass drop and sonic boom
   */
  public playSlam(): void {
    SynthVoice.playTone(75, 0.30, 'sine', {
      volume: 0.45,
      pitchBend: 28,
      decay: 0.25,
      bus: 'impact',
    });
    SynthVoice.playNoise(0.20, {
      volume: 0.24,
      filterFreqStart: 1200,
      filterFreqEnd: 100,
      filterType: 'lowpass',
      bus: 'impact',
    });
  }

  /**
   * Slam Launch Rebound: Deep punchy sub boom + snappy upward whip
   */
  public playSlamLaunch(hardness = 0.8): void {
    SynthVoice.playTone(55, 0.35, 'sine', {
      volume: 0.45 + hardness * 0.15,
      pitchBend: 25,
      decay: 0.30,
      bus: 'impact',
    });
    SynthVoice.playTone(240, 0.18, 'triangle', {
      volume: 0.22,
      pitchBend: 680,
      decay: 0.15,
      bus: 'impact',
    });
  }

  /**
   * Air Tricks: Distinct procedural synthesis tones on trick landing
   */
  public playTrick(name: string, spins = 1): void {
    const s = Math.min(3, Math.max(1, spins));
    const octaveMult = Math.pow(2, (s - 1) * 0.5);
    const ctx = SynthVoice.getContext();
    const t = ctx.currentTime;

    if (name.includes('CORKSCREW') || name.includes('BACKFLIP')) {
      [440, 554.37, 659.25].forEach((freq, idx) => {
        SynthVoice.playTone(freq * octaveMult, 0.14, 'sine', {
          startTime: t + idx * 0.030,
          volume: 0.18 - idx * 0.03,
          attack: 0.001,
          decay: 0.10,
          bus: 'pickup',
        });
      });
    } else if (name.includes('COMET') || name.includes('HYPER')) {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        SynthVoice.playTone(freq * octaveMult, 0.18, 'sine', {
          startTime: t + idx * 0.024,
          volume: 0.16 - idx * 0.02,
          attack: 0.001,
          decay: 0.14,
          bus: 'pickup',
        });
      });
    } else {
      SynthVoice.playTone(523.25 * octaveMult, 0.16, 'triangle', {
        startTime: t,
        volume: 0.18,
        attack: 0.001,
        decay: 0.12,
        bus: 'pickup',
      });
    }
  }

  /**
   * Ability Charge & Ready Cues
   */
  public playAbilityCharge(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const freq = 261.63 * Math.pow(2, p);
    SynthVoice.playTone(freq, 0.10, 'sine', {
      volume: 0.12 + p * 0.08,
      attack: 0.001,
      bus: 'pickup',
    });
  }

  public playAbilityReady(): void {
    const ctx = SynthVoice.getContext();
    const t = ctx.currentTime;
    [392.00, 523.25, 659.25, 783.99].forEach((freq, idx) => {
      SynthVoice.playTone(freq, 0.32, 'triangle', {
        startTime: t + idx * 0.028,
        volume: 0.18,
        attack: 0.001,
        decay: 0.25,
        bus: 'pickup',
      });
    });
  }

  /**
   * Bolt / Gem Pickup: Crisp, glassy, pure crystal chime
   */
  public playBoltArc(streak: number, _total = 5, completed = false, xOffset = 0): void {
    const pan = Math.max(-0.7, Math.min(0.7, xOffset / 12));
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00]; // C5, D5, E5, G5, A5 pentatonic
    const deg = scale[streak % scale.length];
    const ctx = SynthVoice.getContext();
    const t = ctx.currentTime;

    SynthVoice.playTone(deg, 0.12, 'sine', {
      startTime: t,
      volume: 0.18,
      attack: 0.001,
      decay: 0.09,
      pan,
      bus: 'pickup',
    });

    if (completed) {
      // Clean resolving triad on completion
      [659.25, 783.99, 1046.50].forEach((freq, idx) => {
        SynthVoice.playTone(freq, 0.28, 'sine', {
          startTime: t + (idx + 1) * 0.025,
          volume: 0.18 - idx * 0.03,
          attack: 0.001,
          decay: 0.22,
          pan,
          bus: 'pickup',
        });
      });
    }
  }

  /**
   * Normal Bounce Sound: Soft, subtle, satisfying dry marble thud (never fatiguing)
   */
  public playBounce(velocityRatio: number = 1.0): void {
    const freq = 140 + velocityRatio * 40;
    SynthVoice.playTone(freq, 0.06, 'sine', {
      volume: 0.12,
      attack: 0.001,
      pitchBend: 40,
      decay: 0.05,
      bus: 'sfx',
      noJitter: true,
    });
  }

  /**
   * Perfect Bounce: Luminous, pure gold crystal triad (C5, E5, G5, C6) + tight sub punch
   */
  public playPerfectBounce(): void {
    const ctx = SynthVoice.getContext();
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      SynthVoice.playTone(freq, 0.24, 'sine', {
        startTime: t + idx * 0.022,
        volume: 0.24 - idx * 0.03,
        attack: 0.001,
        decay: 0.18,
        filterFreq: 7000,
        bus: 'impact',
      });
    });

    SynthVoice.playTone(65, 0.22, 'sine', {
      startTime: t,
      volume: 0.38,
      attack: 0.001,
      pitchBend: 30,
      decay: 0.18,
      bus: 'impact',
    });
  }

  /**
   * Spring Launch: Pitch-rising clean boing
   */
  public playSpringLaunch(): void {
    SynthVoice.playTone(180, 0.28, 'triangle', {
      volume: 0.32,
      pitchBend: 720,
      attack: 0.002,
      decay: 0.22,
      bus: 'impact',
    });
  }

  /**
   * Speed Break: Crisp arcade crunch
   */
  public playSpeedBreak(): void {
    SynthVoice.playNoise(0.25, {
      volume: 0.35,
      attack: 0.002,
      filterFreqStart: 5000,
      filterFreqEnd: 400,
      filterType: 'bandpass',
      filterQ: 2.0,
      bus: 'impact',
    });
    SynthVoice.playTone(180, 0.18, 'triangle', {
      volume: 0.25,
      attack: 0.002,
      pitchBend: 60,
      decay: 0.15,
      bus: 'impact',
    });
  }

  /**
   * Near Miss: High-speed jet whistle with Doppler pitch drop
   */
  public playNearMiss(xOffset = 0): void {
    const pan = Math.max(-0.8, Math.min(0.8, xOffset / 10));
    SynthVoice.playNoise(0.20, {
      volume: 0.24,
      attack: 0.002,
      filterFreqStart: 2800,
      filterFreqEnd: 600,
      filterQ: 3.5,
      filterType: 'bandpass',
      pan,
      bus: 'sfx',
    });
    SynthVoice.playTone(880, 0.12, 'triangle', {
      volume: 0.14,
      attack: 0.002,
      pitchBend: 330,
      pan,
      bus: 'sfx',
    });
  }

  /**
   * Bumper hit: High arcade bell ring
   */
  public playBumperHit(): void {
    SynthVoice.playTone(880, 0.18, 'sine', { volume: 0.35, attack: 0.001, pitchBend: 1760, bus: 'impact' });
    SynthVoice.playTone(1320, 0.15, 'triangle', { volume: 0.25, attack: 0.001, bus: 'impact' });
    SynthVoice.playNoise(0.08, { volume: 0.2, attack: 0.001, filterFreqStart: 2000, bus: 'impact' });
  }

  /**
   * Speed Boost lane: Jet whoosh
   */
  public playSpeedBoost(): void {
    SynthVoice.playTone(300, 0.4, 'sawtooth', {
      volume: 0.28,
      attack: 0.002,
      pitchBend: 950,
      filterFreq: 4200,
      bus: 'pickup',
    });
    SynthVoice.playNoise(0.4, {
      volume: 0.32,
      attack: 0.002,
      filterFreqStart: 1200,
      filterFreqEnd: 5000,
      bus: 'pickup',
    });
  }

  /**
   * Combo Escalation: Fanfare flourish
   */
  public playComboUp(multiplier: number): void {
    const base = 440;
    const steps = [1, 1.25, 1.5, 1.75, 2.0, 2.25];
    const step = steps[Math.min(steps.length - 1, Math.floor(multiplier / 5))];
    SynthVoice.playTone(base * step, 0.2, 'sine', {
      volume: 0.26,
      attack: 0.001,
      decay: 0.15,
      bus: 'pickup',
    });
    SynthVoice.playTone(base * step * 1.5, 0.25, 'triangle', {
      volume: 0.22,
      attack: 0.001,
      decay: 0.2,
      bus: 'pickup',
    });
  }

  /**
   * Victory Fanfare
   */
  public playVictory(): void {
    const ctx = SynthVoice.getContext();
    const t = ctx.currentTime;
    const chords = [
      [523.25, 659.25, 783.99],  // C Major
      [587.33, 739.99, 880.00],  // D Major
      [659.25, 830.61, 987.77],  // E Major
      [1046.50, 1318.51, 1567.98] // High C octave
    ];
    chords.forEach((chord, i) => {
      chord.forEach(freq => {
        SynthVoice.playTone(freq, 0.45, 'triangle', {
          startTime: t + i * 0.14,
          volume: 0.25,
          attack: 0.002,
          decay: 0.35,
          bus: 'pickup',
        });
      });
    });
  }

  /**
   * Death / Crash: Heavy crunch + pitch drop
   */
  public playDeath(): void {
    SynthVoice.duck(0.75, 1.4);
    SynthVoice.playNoise(0.65, {
      volume: 0.52,
      filterFreqStart: 2500,
      filterFreqEnd: 60,
      filterType: 'lowpass',
      bus: 'impact',
    });
    SynthVoice.playTone(180, 0.5, 'sawtooth', {
      volume: 0.42,
      pitchBend: 25,
      filterFreq: 1200,
      bus: 'impact',
    });
  }

  /**
   * Countdown ticks & start fanfare
   */
  public playCountdownTick(count: number): void {
    const freq = count === 1 ? 587.33 : 440;
    SynthVoice.playTone(freq, 0.12, 'sine', { volume: 0.3, pitchBend: freq * 1.2, bus: 'pickup' });
  }

  public playCountdownGo(): void {
    SynthVoice.playTone(880, 0.35, 'triangle', { volume: 0.4, filterFreq: 6000, bus: 'pickup' });
    SynthVoice.playTone(1174.66, 0.4, 'sine', { volume: 0.35, bus: 'pickup' });
  }

  public playUIClick(): void {
    SynthVoice.playTone(700, 0.05, 'sine', { volume: 0.2, pitchBend: 1200, bus: 'pickup' });
  }
}
