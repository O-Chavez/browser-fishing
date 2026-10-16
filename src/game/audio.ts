import type { Rarity } from '../data/content';

/** All sounds are synthesised with Web Audio so the game ships no audio assets. */
class AudioFX {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private creakGain?: GainNode;
  private creakOsc?: OscillatorNode;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 3;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.ambience();
    this.setupCreak();
  }

  private loopNoise(type: BiquadFilterType, freq: number, q: number, gain: number, lfoRate: number, lfoDepth: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = ctx.createGain();
    lg.gain.value = lfoDepth;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    lfo.start();
  }

  private ambience(): void {
    this.loopNoise('lowpass', 420, 0.7, 0.06, 0.13, 0.03);
    this.loopNoise('bandpass', 1100, 0.6, 0.02, 0.35, 0.012);
    const chirp = () => {
      if (this.ctx) {
        const t = this.ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(2200 + Math.random() * 1500, 3200 + Math.random() * 1200, 0.09, 0.025, t + i * 0.13);
      }
      setTimeout(chirp, 5000 + Math.random() * 9000);
    };
    setTimeout(chirp, 3000);
  }

  private setupCreak(): void {
    const ctx = this.ctx!;
    this.creakOsc = ctx.createOscillator();
    this.creakOsc.type = 'sawtooth';
    this.creakOsc.frequency.value = 120;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 5;
    this.creakGain = ctx.createGain();
    this.creakGain.gain.value = 0;
    this.creakOsc.connect(f).connect(this.creakGain).connect(this.master!);
    this.creakOsc.start();
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, q = 1, at = 0): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, when?: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = when ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whoosh(): void {
    this.noise(0.4, 'bandpass', 400, 2200, 0.35, 1.5);
  }

  splash(power = 1): void {
    this.noise(0.6, 'lowpass', 3000, 500, 0.5 * power);
    this.noise(0.25, 'highpass', 2500, 5000, 0.12 * power);
  }

  plunk(): void {
    this.tone(260, 90, 0.18, 0.4);
  }

  bite(): void {
    this.plunk();
    this.splash(0.6);
    this.tone(880, 660, 0.12, 0.12, undefined, 'triangle');
  }

  tick(gain = 0.08): void {
    this.noise(0.03, 'highpass', 3500, 5000, gain);
  }

  snap(): void {
    this.noise(0.15, 'highpass', 2000, 6000, 0.5);
    this.tone(500, 120, 0.2, 0.2, undefined, 'sawtooth');
  }

  setCreak(tension: number): void {
    if (!this.ctx || !this.creakGain || !this.creakOsc) return;
    const t = this.ctx.currentTime;
    this.creakGain.gain.setTargetAtTime(Math.pow(Math.max(0, tension - 0.3), 2) * 0.12, t, 0.06);
    this.creakOsc.frequency.setTargetAtTime(110 + tension * 220, t, 0.08);
  }

  jingle(rarity: Rarity): void {
    if (!this.ctx) return;
    const count = { common: 2, uncommon: 3, rare: 4, epic: 5, legendary: 6 }[rarity];
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const t = this.ctx.currentTime;
    for (let i = 0; i < count; i++) this.tone(notes[i], notes[i], 0.5, 0.14, t + i * 0.09, 'triangle');
  }
}

export const audio = new AudioFX();
