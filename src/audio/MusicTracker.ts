import { SynthVoice } from './SynthVoice';

/**
 * Procedural Dynamic Music Engine for BOUNCE
 * 136 BPM arcade electro tracker with 4 adaptive stem layers crossfaded on 16-step bar boundaries:
 *   1. Base: Ambient sub drone, always active.
 *   2. Pulse: Kicks, hats, driving bass (speed > 45 u/s).
 *   3. Lead: Melodic 16th arp motif (combo >= 8, transposes up 3 semitones at combo >= 20).
 *   4. Choir / Shimmer: Harmonic shimmer pad (active ability or top speed > 70 u/s).
 */
export class MusicTracker {
  private isPlaying: boolean = false;
  private bpm: number = 136;
  private step: number = 0;
  private timer: number | null = null;

  // Stems state (updated continuously, committed on bar boundaries)
  private currentSpeed: number = 34;
  private currentCombo: number = 0;
  private isAbilityActive: boolean = false;
  private isAlive: boolean = true;

  // Active stem states quantized to bar start (step % 16 === 0)
  private pulseActive: boolean = false;
  private leadActive: boolean = false;
  private leadTranspose: number = 0; // in semitone ratio multiplier
  private choirActive: boolean = false;

  // Musical Scale: F Minor Pentatonic [F, Ab, Bb, C, Eb]
  private bassNotes: number[] = [
    87.31, 87.31, 103.83, 87.31,
    116.54, 87.31, 130.81, 116.54,
    87.31, 87.31, 103.83, 87.31,
    116.54, 130.81, 155.56, 130.81,
  ]; // F2 -> Eb3

  private leadNotes: number[] = [
    349.23, 415.30, 466.16, 523.25,
    622.25, 523.25, 466.16, 415.30,
    349.23, 523.25, 622.25, 698.46,
    523.25, 466.16, 415.30, 349.23,
  ]; // F4 -> F5

  public start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.step = 0;

    const stepTimeMs = (60 / this.bpm / 4) * 1000;
    this.timer = window.setInterval(() => this.tick(), stepTimeMs);
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public setIntensity(_intensity: number): void {}

  public update(speed: number, combo: number, abilityActive: boolean, alive: boolean): void {
    this.currentSpeed = speed;
    this.currentCombo = combo;
    this.isAbilityActive = abilityActive;
    this.isAlive = alive;
  }

  private tick(): void {
    if (!this.isPlaying) return;
    const s = this.step % 16;
    SynthVoice.getContext();

    // Quantize stem layer transitions to bar boundaries (step 0 of 16)
    if (s === 0) {
      this.pulseActive = this.isAlive && this.currentSpeed > 45;
      this.leadActive = this.isAlive && this.currentCombo >= 8;
      this.leadTranspose = this.currentCombo >= 20 ? Math.pow(2, 3 / 12) : 1.0; // Transpose up minor third (+3 semitones)
      this.choirActive = this.isAlive && (this.isAbilityActive || this.currentSpeed > 70);
    }

    // Stem 1: Base (Sub drone on every 8 steps)
    if (s % 8 === 0) {
      SynthVoice.playTone(43.65, 0.45, 'sine', {
        volume: 0.18,
        decay: 0.40,
        bus: 'music',
        noJitter: true,
      });
    }

    // Stem 2: Pulse (Kicks, snares, hats, driving bass)
    if (this.pulseActive) {
      // Kick Drum on quarter notes (steps 0, 4, 8, 12)
      if (s % 4 === 0) {
        SynthVoice.playTone(130, 0.09, 'sine', {
          volume: 0.30,
          pitchBend: 35,
          decay: 0.06,
          bus: 'music',
          noJitter: true,
        });
      }

      // Snare / Clap on beats 2 & 4 (steps 4, 12)
      if (s === 4 || s === 12) {
        SynthVoice.playNoise(0.06, {
          volume: 0.14,
          filterFreqStart: 1600,
          filterFreqEnd: 350,
          bus: 'music',
        });
      }

      // Hi-Hat with velocity accent
      if (s % 2 === 0) {
        const isAccent = s % 4 === 2;
        SynthVoice.playNoise(0.02, {
          volume: isAccent ? 0.07 : 0.04,
          filterFreqStart: 7000,
          filterFreqEnd: 9500,
          filterType: 'highpass',
          bus: 'music',
        });
      }

      // 8th-note Synth Bassline
      if (s % 2 === 0) {
        const bassFreq = this.bassNotes[s];
        if (bassFreq) {
          SynthVoice.playTone(bassFreq, 0.09, 'sawtooth', {
            volume: 0.18,
            decay: 0.07,
            filterFreq: 600,
            bus: 'music',
            noJitter: true,
          });
        }
      }
    }

    // Stem 3: Lead Arp Motif (combo >= 8, transposes at >= 20)
    if (this.leadActive) {
      const leadIdx = (s * 3) % this.leadNotes.length;
      const leadFreq = this.leadNotes[leadIdx] * this.leadTranspose;
      const octaveMult = this.currentCombo >= 20 ? 1.0 : 0.5;

      SynthVoice.playTone(leadFreq * octaveMult, 0.08, 'triangle', {
        volume: 0.13,
        decay: 0.06,
        filterFreq: 2000,
        bus: 'music',
        noJitter: true,
      });
    }

    // Stem 4: Choir / Shimmer Pad (ability or top speed)
    if (this.choirActive && s % 4 === 0) {
      [349.23, 523.25, 698.46].forEach((freq) => {
        SynthVoice.playTone(freq * 1.5, 0.30, 'triangle', {
          volume: 0.07,
          decay: 0.25,
          attack: 0.02,
          bus: 'music',
          noJitter: true,
        });
      });
    }

    // High shimmer ping during hot streaks
    if (this.currentCombo >= 15 && s % 4 === 2) {
      SynthVoice.playTone(this.leadNotes[s] * 2, 0.12, 'sine', {
        volume: 0.08,
        decay: 0.10,
        filterFreq: 4800,
        bus: 'music',
        noJitter: true,
      });
    }

    this.step++;
  }
}
