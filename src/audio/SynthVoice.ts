/**
 * Web Audio API Synthesizer Voice & Signal Generators
 * 100% Procedural synthesis - zero external audio assets.
 */

export class SynthVoice {
  private static ctx: AudioContext | null = null;
  private static masterGain: GainNode | null = null;
  private static compressor: DynamicsCompressorNode | null = null;

  public static getContext(): AudioContext {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();

      // Master Compressor to prevent clipping and give arcade punch
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.65, this.ctx.currentTime);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  public static getMasterNode(): GainNode {
    this.getContext();
    return this.masterGain!;
  }

  /**
   * Play an FM synthesized tonal beep / chime with ADSR envelope
   */
  public static playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    options: {
      attack?: number;
      decay?: number;
      sustain?: number;
      release?: number;
      volume?: number;
      pitchBend?: number;
      filterFreq?: number;
      filterType?: BiquadFilterType;
    } = {}
  ): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    if (options.pitchBend) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, options.pitchBend),
        now + duration
      );
    }

    const vol = options.volume ?? 0.3;
    const attack = options.attack ?? 0.005;
    const decay = options.decay ?? 0.05;
    const sustain = options.sustain ?? 0.4;
    const release = options.release ?? 0.05;

    // ADSR
    const sustainStart = Math.min(now + duration, Math.max(now + attack + decay, now + duration - release));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.linearRampToValueAtTime(vol * sustain, Math.min(now + attack + decay, sustainStart));
    gain.gain.setValueAtTime(vol * sustain, sustainStart);
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);

    // Filter
    filter.type = options.filterType ?? 'lowpass';
    filter.frequency.setValueAtTime(options.filterFreq ?? 8000, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterNode());

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /**
   * Play synthesized filtered noise burst (impacts, air rush, explosions)
   */
  public static playNoise(
    duration: number,
    options: {
      volume?: number;
      attack?: number;
      decay?: number;
      filterFreqStart?: number;
      filterFreqEnd?: number;
      filterQ?: number;
      filterType?: BiquadFilterType;
    } = {}
  ): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    // Generate 1 sec white noise buffer
    const bufferSize = ctx.sampleRate * Math.min(duration, 2.0);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = options.filterType ?? 'bandpass';
    filter.Q.setValueAtTime(options.filterQ ?? 2.5, now);
    filter.frequency.setValueAtTime(options.filterFreqStart ?? 1200, now);
    if (options.filterFreqEnd) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(30, options.filterFreqEnd),
        now + duration
      );
    }

    const gain = ctx.createGain();
    const vol = options.volume ?? 0.35;
    const attack = options.attack ?? 0.01;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.getMasterNode());

    whiteNoise.start(now);
    whiteNoise.stop(now + duration + 0.05);
  }
}
