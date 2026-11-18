/**
 * Audio procédural — Lot 7. Tout est synthétisé via WebAudio : aucun asset externe.
 * - moteur (oscillateur + filtre, hauteur liée à la vitesse)
 * - tirs, impacts, gore, alarme, UI, train, nappe d'ambiance
 */
export class AudioSys {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private ambientGain!: GainNode;
  muted = false;

  /** À appeler sur un geste utilisateur (clic sur Jouer). */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    // Nappe d'ambiance : deux oscillateurs désaccordés + filtre lent.
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.05;
    const ambFilter = ctx.createBiquadFilter();
    ambFilter.type = 'lowpass';
    ambFilter.frequency.value = 220;
    const a1 = ctx.createOscillator(); a1.type = 'sawtooth'; a1.frequency.value = 55;
    const a2 = ctx.createOscillator(); a2.type = 'sawtooth'; a2.frequency.value = 55.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 90;
    lfo.connect(lfoGain); lfoGain.connect(ambFilter.frequency);
    a1.connect(ambFilter); a2.connect(ambFilter);
    ambFilter.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    a1.start(); a2.start(); lfo.start();

    // Moteur (démarré silencieux).
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 25;
    const eg2 = ctx.createGain(); eg2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(eg2); eg2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  private now() { return this.ctx ? this.ctx.currentTime : 0; }

  private noiseBuffer(dur: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private burst(opts: { dur: number; gain: number; type?: BiquadFilterType; freq?: number; q?: number; attack?: number }) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(opts.dur);
    const f = this.ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq ?? 1000;
    f.Q.value = opts.q ?? 0.8;
    const g = this.ctx.createGain();
    const atk = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + opts.dur + 0.05);
  }

  private tone(opts: { freq: number; endFreq?: number; dur: number; gain: number; type?: OscillatorType }) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.endFreq !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.endFreq), t + opts.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + opts.dur + 0.05);
  }

  gunshot() {
    this.burst({ dur: 0.16, gain: 0.55, type: 'bandpass', freq: 1400, q: 0.4 });
    this.tone({ freq: 190, endFreq: 60, dur: 0.12, gain: 0.35, type: 'square' });
  }
  enemyShot() {
    this.burst({ dur: 0.14, gain: 0.3, type: 'bandpass', freq: 1100, q: 0.5 });
  }
  hitFlesh() {
    this.burst({ dur: 0.1, gain: 0.4, type: 'lowpass', freq: 500 });
    this.tone({ freq: 90, endFreq: 40, dur: 0.1, gain: 0.3, type: 'triangle' });
  }
  crashHeavy() {
    this.burst({ dur: 0.4, gain: 0.6, type: 'lowpass', freq: 300 });
    this.tone({ freq: 70, endFreq: 30, dur: 0.35, gain: 0.5, type: 'square' });
  }
  thud() {
    this.burst({ dur: 0.18, gain: 0.35, type: 'lowpass', freq: 220 });
  }
  pickup() { this.tone({ freq: 620, endFreq: 920, dur: 0.12, gain: 0.25 }); }
  uiClick() { this.tone({ freq: 800, dur: 0.05, gain: 0.12, type: 'triangle' }); }
  uiOpen() { this.tone({ freq: 320, endFreq: 480, dur: 0.1, gain: 0.15, type: 'triangle' }); }
  implantCast() { this.tone({ freq: 300, endFreq: 1400, dur: 0.3, gain: 0.22, type: 'sine' }); }
  implantDeny() { this.tone({ freq: 220, endFreq: 160, dur: 0.18, gain: 0.2, type: 'square' }); }
  grateOpen() {
    this.burst({ dur: 0.5, gain: 0.3, type: 'bandpass', freq: 700, q: 2, attack: 0.08 });
    this.tone({ freq: 130, endFreq: 90, dur: 0.6, gain: 0.2, type: 'triangle' });
  }
  alarmOn() {
    this.tone({ freq: 880, dur: 0.25, gain: 0.3, type: 'square' });
    setTimeout(() => this.tone({ freq: 660, dur: 0.35, gain: 0.3, type: 'square' }), 260);
  }
  confirmed() { this.tone({ freq: 500, endFreq: 300, dur: 0.2, gain: 0.25, type: 'sawtooth' }); }
  hurt() { this.tone({ freq: 200, endFreq: 90, dur: 0.15, gain: 0.3, type: 'sawtooth' }); }
  deliverSuccess() {
    this.tone({ freq: 520, dur: 0.14, gain: 0.25 });
    setTimeout(() => this.tone({ freq: 660, dur: 0.14, gain: 0.25 }), 140);
    setTimeout(() => this.tone({ freq: 880, dur: 0.3, gain: 0.3 }), 280);
  }
  missionFail() {
    this.tone({ freq: 300, endFreq: 80, dur: 1.1, gain: 0.35, type: 'sawtooth' });
  }
  trainPass() {
    this.burst({ dur: 4.5, gain: 0.22, type: 'lowpass', freq: 160, attack: 0.8 });
    this.tone({ freq: 55, endFreq: 45, dur: 4.5, gain: 0.18, type: 'sawtooth' });
  }
  trainHorn() {
    this.tone({ freq: 310, dur: 0.7, gain: 0.2, type: 'sawtooth' });
    this.tone({ freq: 370, dur: 0.7, gain: 0.2, type: 'sawtooth' });
  }

  /** Moteur : vitesse 0..1, False = à l'arrêt. */
  engine(speed01: number, active: boolean) {
    if (!this.ctx) return;
    const t = this.now();
    const target = active && !this.muted ? 0.06 + speed01 * 0.1 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const f = 40 + speed01 * 160;
    this.engineOsc?.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2?.frequency.setTargetAtTime(f / 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 1400, t, 0.1);
  }
}
