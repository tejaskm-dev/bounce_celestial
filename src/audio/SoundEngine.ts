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
    const targetVol = Math.max(0.0001, Math.min(0.24, (speedRatio - 0.4) * 0.38));
    const targetCutoff = 300 + speedRatio * 1800;

    this.windGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.08);
    this.windFilter.frequency.setTargetAtTime(targetCutoff, ctx.currentTime, 0.08);
  }

  /**
   * Timing Whiff / Miss Sound: Low buzz when tapping too early
   */
  public playWhiff(): void {
    SynthVoice.playTone(130, 0.14, 'sawtooth', {
      volume: 0.26,
      pitchBend: 70,
      decay: 0.12,
      filterFreq: 800,
    });
    SynthVoice.playNoise(0.08, {
      volume: 0.18,
      filterFreqStart: 800,
      filterFreqEnd: 150,
      filterType: 'lowpass',
    });
  }

  /**
   * Ground Jump Sound: Crisp upward blip
   */
  public playJump(): void {
    SynthVoice.playTone(280, 0.12, 'sine', {
      volume: 0.32,
      pitchBend: 560,
      decay: 0.1,
    });
  }

  /**
   * Air Dash: High-speed Doppler whoosh
   */
  public playAirDash(): void {
    SynthVoice.playNoise(0.22, {
      volume: 0.42,
      filterFreqStart: 4200,
      filterFreqEnd: 600,
      filterQ: 5.0,
      filterType: 'bandpass',
    });
    SynthVoice.playTone(600, 0.16, 'sawtooth', {
      volume: 0.22,
      pitchBend: 1200,
      filterFreq: 3200,
    });
  }

  /**
   * Ground Pound Slam: Deep sub-bass drop and sonic boom
   */
  public playSlam(): void {
    SynthVoice.playTone(90, 0.45, 'sine', {
      volume: 0.55,
      pitchBend: 28,
      decay: 0.38,
    });
    SynthVoice.playNoise(0.35, {
      volume: 0.38,
      filterFreqStart: 1800,
      filterFreqEnd: 120,
      filterType: 'lowpass',
    });
  }

  /**
   * Normal Bounce Sound
   */
  public playBounce(velocityRatio: number = 1.0): void {
    const freq = 180 + velocityRatio * 80;
    SynthVoice.playTone(freq, 0.12, 'sine', {
      volume: 0.35,
      pitchBend: 45,
      decay: 0.08,
    });
    SynthVoice.playTone(freq * 3, 0.04, 'triangle', {
      volume: 0.15,
      attack: 0.002,
      decay: 0.03,
    });
  }

  /**
   * Perfect Bounce: Resonant ascending 4-note chord + crystal sparkle + sub-boom
   */
  public playPerfectBounce(): void {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        SynthVoice.playTone(freq, 0.28, 'sine', {
          volume: 0.28,
          attack: 0.003,
          decay: 0.22,
          filterFreq: 6000,
        });
      }, idx * 28);
    });

    SynthVoice.playTone(95, 0.32, 'sine', {
      volume: 0.48,
      pitchBend: 32,
      decay: 0.26,
    });

    SynthVoice.playNoise(0.2, {
      volume: 0.25,
      filterFreqStart: 4500,
      filterFreqEnd: 9000,
      filterType: 'bandpass',
    });
  }

  /**
   * Spring Launch: Pitch-rising boing
   */
  public playSpringLaunch(): void {
    SynthVoice.playTone(160, 0.35, 'triangle', {
      volume: 0.42,
      pitchBend: 650,
      attack: 0.01,
      decay: 0.28,
    });
    SynthVoice.playNoise(0.25, {
      volume: 0.2,
      filterFreqStart: 800,
      filterFreqEnd: 3500,
    });
  }

  /**
   * Speed Break: Shattering glass & metal crunch
   */
  public playSpeedBreak(): void {
    SynthVoice.playNoise(0.45, {
      volume: 0.5,
      filterFreqStart: 6500,
      filterFreqEnd: 300,
      filterType: 'bandpass',
      filterQ: 2.0,
    });
    SynthVoice.playTone(220, 0.25, 'sawtooth', {
      volume: 0.35,
      pitchBend: 80,
      decay: 0.2,
    });
  }

  /**
   * Near Miss: High-speed jet whistle
   */
  public playNearMiss(): void {
    SynthVoice.playNoise(0.35, {
      volume: 0.38,
      filterFreqStart: 3400,
      filterFreqEnd: 400,
      filterQ: 4.0,
      filterType: 'bandpass',
    });
    SynthVoice.playTone(880, 0.15, 'sawtooth', {
      volume: 0.18,
      pitchBend: 220,
      filterFreq: 2400,
    });
  }

  /**
   * Bumper hit: High arcade bell ring
   */
  public playBumperHit(): void {
    SynthVoice.playTone(880, 0.18, 'sine', { volume: 0.35, pitchBend: 1760 });
    SynthVoice.playTone(1320, 0.15, 'triangle', { volume: 0.25 });
    SynthVoice.playNoise(0.08, { volume: 0.2, filterFreqStart: 2000 });
  }

  /**
   * Speed Boost lane: Jet whoosh
   */
  public playSpeedBoost(): void {
    SynthVoice.playTone(300, 0.4, 'sawtooth', {
      volume: 0.28,
      pitchBend: 950,
      filterFreq: 4200,
    });
    SynthVoice.playNoise(0.4, {
      volume: 0.32,
      filterFreqStart: 1200,
      filterFreqEnd: 5000,
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
      decay: 0.15,
    });
    SynthVoice.playTone(base * step * 1.5, 0.25, 'triangle', {
      volume: 0.22,
      decay: 0.2,
    });
  }

  /**
   * Victory Fanfare
   */
  public playVictory(): void {
    const chords = [
      [523.25, 659.25, 783.99],  // C Major
      [587.33, 739.99, 880.00],  // D Major
      [659.25, 830.61, 987.77],  // E Major
      [1046.50, 1318.51, 1567.98] // High C octave
    ];
    chords.forEach((chord, i) => {
      setTimeout(() => {
        chord.forEach(freq => {
          SynthVoice.playTone(freq, 0.45, 'triangle', { volume: 0.25, decay: 0.35 });
        });
      }, i * 140);
    });
  }

  /**
   * Death / Crash: Heavy crunch + pitch drop
   */
  public playDeath(): void {
    SynthVoice.playNoise(0.65, {
      volume: 0.52,
      filterFreqStart: 2500,
      filterFreqEnd: 60,
      filterType: 'lowpass',
    });
    SynthVoice.playTone(180, 0.5, 'sawtooth', {
      volume: 0.42,
      pitchBend: 25,
      filterFreq: 1200,
    });
  }

  /**
   * Countdown ticks & start fanfare
   */
  public playCountdownTick(count: number): void {
    const freq = count === 1 ? 587.33 : 440;
    SynthVoice.playTone(freq, 0.12, 'sine', { volume: 0.3, pitchBend: freq * 1.2 });
  }

  public playCountdownGo(): void {
    SynthVoice.playTone(880, 0.35, 'triangle', { volume: 0.4, filterFreq: 6000 });
    SynthVoice.playTone(1174.66, 0.4, 'sine', { volume: 0.35 });
  }

  public playUIClick(): void {
    SynthVoice.playTone(700, 0.05, 'sine', { volume: 0.2, pitchBend: 1200 });
  }
}
