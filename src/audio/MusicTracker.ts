import { SynthVoice } from './SynthVoice';

/**
 * Procedural Dynamic Music Engine for BOUNCE
 * 136 BPM arcade electro tracker with dynamic intensity layers responsive to combos and velocity.
 */
export class MusicTracker {
  private isPlaying: boolean = false;
  private bpm: number = 136;
  private step: number = 0;
  private timer: number | null = null;
  private intensity: number = 1.0; // 1.0 to 4.0

  // Musical Scale: F Minor Cyber Pentatonic [F, Ab, Bb, C, Eb]
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

  public setIntensity(intensity: number): void {
    this.intensity = Math.max(1.0, Math.min(4.0, intensity));
  }

  private tick(): void {
    if (!this.isPlaying) return;
    const s = this.step % 16;
    SynthVoice.getContext();

    // 1. Kick Drum: on every quarter note (step 0, 4, 8, 12)
    if (s % 4 === 0) {
      SynthVoice.playTone(130, 0.09, 'sine', {
        volume: 0.38,
        pitchBend: 35,
        decay: 0.06,
      });
    }

    // 2. Snare / Clap: on beats 2 & 4 (step 4, 12)
    if (s === 4 || s === 12) {
      SynthVoice.playNoise(0.08, {
        volume: 0.22,
        filterFreqStart: 1800,
        filterFreqEnd: 400,
      });
    }

    // 3. Hi-Hat: 16th notes with velocity accent
    if (s % 2 === 0 || this.intensity >= 1.8) {
      const isAccent = s % 4 === 2;
      SynthVoice.playNoise(0.03, {
        volume: isAccent ? 0.12 : 0.06,
        filterFreqStart: 7500,
        filterFreqEnd: 10000,
        filterType: 'highpass',
      });
    }

    // 4. Synth Bassline
    const bassFreq = this.bassNotes[s];
    if (bassFreq) {
      SynthVoice.playTone(bassFreq, 0.1, 'sawtooth', {
        volume: 0.24,
        decay: 0.08,
        filterFreq: 400 + this.intensity * 380,
      });
    }

    // 5. Arpeggio Lead (Layers unlock with combo intensity)
    if (this.intensity >= 2.0) {
      const leadIdx = (s * 3) % this.leadNotes.length;
      const leadFreq = this.leadNotes[leadIdx];
      const octaveMult = this.intensity >= 3.0 ? 1.0 : 0.5;

      SynthVoice.playTone(leadFreq * octaveMult, 0.08, 'triangle', {
        volume: 0.18,
        decay: 0.06,
        filterFreq: 1200 + this.intensity * 600,
      });
    }

    // 6. High Sparkle Chime (at high combo intensity)
    if (this.intensity >= 3.2 && s % 4 === 2) {
      SynthVoice.playTone(this.leadNotes[s] * 2, 0.14, 'sine', {
        volume: 0.15,
        decay: 0.12,
        filterFreq: 5200,
      });
    }

    this.step++;
  }
}
