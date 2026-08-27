export type AudioBusType = 'impact' | 'pickup' | 'sfx' | 'music' | 'ambient';

export class SynthVoice {
  private static ctx: AudioContext | null = null;
  private static masterGain: GainNode | null = null;
  private static compressor: DynamicsCompressorNode | null = null;

  // Priority Hierarchy Buses
  private static sfxBus: GainNode | null = null;
  private static impactBus: GainNode | null = null;
  private static pickupBus: GainNode | null = null;
  private static pickupDucker: GainNode | null = null;
  private static musicBus: GainNode | null = null;
  private static musicDucker: GainNode | null = null;
  private static ambientBus: GainNode | null = null;

  // Mobile Voice Capping
  private static activeVoices = 0;
  private static readonly MAX_VOICES = 26;

  public static getContext(): AudioContext {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();

      // Master Compressor
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-10, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(10, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // SFX Bus
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.setValueAtTime(0.92, this.ctx.currentTime);
      this.sfxBus.connect(this.masterGain);

      // Impact Bus (High Priority)
      this.impactBus = this.ctx.createGain();
      this.impactBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.impactBus.connect(this.sfxBus);

      // Pickup Bus (Ducked by Impact)
      this.pickupDucker = this.ctx.createGain();
      this.pickupDucker.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.pickupBus = this.ctx.createGain();
      this.pickupBus.gain.setValueAtTime(0.95, this.ctx.currentTime);
      this.pickupBus.connect(this.pickupDucker);
      this.pickupDucker.connect(this.sfxBus);

      // Music Bus (Ducked by Impact and Death)
      this.musicDucker = this.ctx.createGain();
      this.musicDucker.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.musicBus.connect(this.musicDucker);
      this.musicDucker.connect(this.masterGain);

      // Ambient Bus (Wind Bed)
      this.ambientBus = this.ctx.createGain();
      this.ambientBus.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.ambientBus.connect(this.masterGain);
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

  public static getBus(bus: AudioBusType = 'sfx'): GainNode {
    this.getContext();
    if (bus === 'impact') return this.impactBus!;
    if (bus === 'pickup') return this.pickupBus!;
    if (bus === 'music') return this.musicBus!;
    if (bus === 'ambient') return this.ambientBus!;
    return this.sfxBus!;
  }

  public static duck(amount: number = 0.5, seconds: number = 1.0): void {
    if (!this.ctx || !this.musicDucker) return;
    const t = this.ctx.currentTime;
    const g = this.musicDucker.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1.0 - amount, t + 0.04);
    g.linearRampToValueAtTime(1.0, t + seconds);

    if (this.pickupDucker) {
      const pg = this.pickupDucker.gain;
      pg.cancelScheduledValues(t);
      pg.setValueAtTime(pg.value, t);
      pg.linearRampToValueAtTime(0.45, t + 0.02);
      pg.linearRampToValueAtTime(1.0, t + 0.18);
    }
  }

  private static jitterPitch(freq: number): number {
    return freq * (1 + (Math.random() - 0.5) * 0.06); // ±3%
  }

  private static jitterGain(gain: number): number {
    return gain * (1 + (Math.random() - 0.5) * 0.16); // ±8%
  }

  /**
   * Play an FM synthesized tonal beep / chime with ADSR envelope, spatial panning & jitter
   */
  public static playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    options: {
      startTime?: number;
      attack?: number;
      decay?: number;
      sustain?: number;
      release?: number;
      volume?: number;
      pitchBend?: number;
      filterFreq?: number;
      filterType?: BiquadFilterType;
      pan?: number;
      bus?: AudioBusType;
      noJitter?: boolean;
    } = {}
  ): void {
    if (this.activeVoices >= this.MAX_VOICES) return;
    const ctx = this.getContext();
    const now = options.startTime ?? ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = type;
    const baseFreq = options.noJitter ? freq : this.jitterPitch(freq);
    osc.frequency.setValueAtTime(baseFreq, now);

    if (options.pitchBend) {
      const targetPitch = options.noJitter ? options.pitchBend : this.jitterPitch(options.pitchBend);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, targetPitch),
        now + duration
      );
    }

    const rawVol = options.volume ?? 0.3;
    const vol = options.noJitter ? rawVol : this.jitterGain(rawVol);
    const attack = options.attack ?? 0.002;
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

    let outNode: AudioNode = gain;
    if (options.pan !== undefined && (ctx as any).createStereoPanner) {
      const panner = (ctx as any).createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.pan)), now);
      gain.connect(panner);
      outNode = panner;
    }

    const destBus = this.getBus(options.bus ?? 'sfx');
    outNode.connect(destBus);

    if (options.bus === 'impact') {
      this.duck(0.35, 0.45);
    }

    this.activeVoices++;
    osc.start(now);
    osc.stop(now + duration + 0.05);
    osc.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
  }

  /**
   * Play synthesized filtered noise burst (impacts, air rush, explosions) with spatial panning
   */
  public static playNoise(
    duration: number,
    options: {
      startTime?: number;
      volume?: number;
      attack?: number;
      decay?: number;
      filterFreqStart?: number;
      filterFreqEnd?: number;
      filterQ?: number;
      filterType?: BiquadFilterType;
      pan?: number;
      bus?: AudioBusType;
    } = {}
  ): void {
    if (this.activeVoices >= this.MAX_VOICES) return;
    const ctx = this.getContext();
    const now = options.startTime ?? ctx.currentTime;

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
    filter.frequency.setValueAtTime(this.jitterPitch(options.filterFreqStart ?? 1200), now);
    if (options.filterFreqEnd) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(30, this.jitterPitch(options.filterFreqEnd)),
        now + duration
      );
    }

    const gain = ctx.createGain();
    const rawVol = options.volume ?? 0.35;
    const vol = this.jitterGain(rawVol);
    const attack = options.attack ?? 0.005;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    whiteNoise.connect(filter);
    filter.connect(gain);

    let outNode: AudioNode = gain;
    if (options.pan !== undefined && (ctx as any).createStereoPanner) {
      const panner = (ctx as any).createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.pan)), now);
      gain.connect(panner);
      outNode = panner;
    }

    const destBus = this.getBus(options.bus ?? 'sfx');
    outNode.connect(destBus);

    if (options.bus === 'impact') {
      this.duck(0.35, 0.45);
    }

    this.activeVoices++;
    whiteNoise.start(now);
    whiteNoise.stop(now + duration + 0.05);
    whiteNoise.onended = () => { this.activeVoices = Math.max(0, this.activeVoices - 1); };
  }
}
