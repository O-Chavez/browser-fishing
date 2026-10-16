import type { Rarity } from '../data/content';

/** Background music level; kept low so it sits under the lake ambience. */
const MUSIC_VOL = 0.17;

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
    this.startMusic();
    this.setupCreak();
  }

  private musicGain?: GainNode;
  private musicOn = localStorage.getItem('fishing-music') !== 'off';

  get music(): boolean {
    return this.musicOn;
  }

  /** Toggles the background music and remembers the choice. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    localStorage.setItem('fishing-music', this.musicOn ? 'on' : 'off');
    if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.musicOn ? MUSIC_VOL : 0, this.ctx.currentTime, 0.4);
    return this.musicOn;
  }

  private strings = new Map<number, AudioBuffer>();

  /** Karplus-Strong plucked string, rendered once per pitch. */
  private string(midi: number): AudioBuffer {
    let buf = this.strings.get(midi);
    if (buf) return buf;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const n = Math.round(sr / (440 * Math.pow(2, (midi - 69) / 12)));
    buf = ctx.createBuffer(1, Math.round(sr * 3.2), sr);
    const d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < n; i++) d[i] = prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5;
    for (let i = n; i < d.length; i++) d[i] = 0.4992 * (d[i - n] + d[i - n + 1]);
    this.strings.set(midi, buf);
    return buf;
  }

  /** Slow fingerpicked acoustic guitar with a soft whistle and a faint campfire, all synthesised (no audio files, no licensing). */
  private startMusic(): void {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = this.musicOn ? MUSIC_VOL : 0;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 300;
    body.gain.value = 5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4800;
    const room = ctx.createDelay(0.5);
    room.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    room.connect(fb).connect(room);
    room.connect(wet).connect(out);
    body.connect(tone).connect(out);
    body.connect(room);
    out.connect(this.master!);
    this.musicGain = out;

    const pick = (midi: number, t: number, vel: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.string(midi);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      src.connect(g).connect(body);
      src.start(t);
    };
    const whistle = (midi: number, t: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5;
      const vg = ctx.createGain();
      vg.gain.value = 5;
      vib.connect(vg).connect(o.detune);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06, t + 0.12);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(out);
      g.connect(room);
      o.start(t);
      vib.start(t);
      o.stop(t + dur + 0.1);
      vib.stop(t + dur + 0.1);
    };

    // Timber Hearth-style: a lilting 6/8 roll over open, major-leaning chords
    const chords = [
      { bass: 38, up: [57, 62, 66, 69] }, // D
      { bass: 43, up: [55, 62, 67, 71] }, // G
      { bass: 45, up: [57, 61, 64, 69] }, // A
      { bass: 38, up: [57, 62, 66, 69] }, // D
      { bass: 47, up: [54, 62, 66, 71] }, // Bm
      { bass: 43, up: [55, 62, 67, 71] }, // G
      { bass: 38, up: [57, 62, 66, 69] }, // D
      { bass: 45, up: [57, 61, 64, 69] }, // A
    ];
    const pattern = [-1, 1, 2, 0, 3, 2];
    // D major pentatonic, kept in a gentle whistle range
    const motifs = [
      [81, 83, 85, 83],
      [78, 81, 83, 81],
      [85, 83, 81, 78],
      [83, 81, 83, 85],
    ];
    const EIGHTH = 0.36;
    const BAR = EIGHTH * 6;

    // Warm, barely-there drone for a sense of wide open sky
    for (const [m, v] of [[38, 0.02], [45, 0.014], [50, 0.01]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      const g = ctx.createGain();
      g.gain.value = v;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + m * 0.001;
      const lg = ctx.createGain();
      lg.gain.value = v * 0.6;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(out);
      o.start();
      lfo.start();
    }

    let next = ctx.currentTime + 0.4;
    let bar = 0;
    const schedule = () => {
      while (next < ctx.currentTime + 6) {
        const c = chords[bar % chords.length];
        pattern.forEach((k, i) => {
          const t = next + i * EIGHTH + (Math.random() - 0.5) * 0.015;
          pick(k < 0 ? c.bass : c.up[k], t, k < 0 ? 0.3 : 0.14 + Math.random() * 0.06);
        });
        if (bar % 4 === 2 && Math.random() < 0.8) {
          const motif = motifs[Math.floor(Math.random() * motifs.length)];
          motif.forEach((m, i) => whistle(m - 12, next + i * EIGHTH * 2, EIGHTH * 3.2));
        }
        next += BAR;
        bar++;
      }
    };
    schedule();
    setInterval(schedule, 2000);

    const crackle = () => {
      if (this.ctx && this.noiseBuf) {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800 + Math.random() * 3000;
        f.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.012 + Math.random() * 0.02, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
        src.connect(f).connect(g).connect(out);
        src.start(t, Math.random() * 2, 0.1);
      }
      setTimeout(crackle, 150 + Math.random() * 900);
    };
    crackle();
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
