export class Sound {
  private context?: AudioContext;
  private master?: GainNode;
  private engine?: OscillatorNode;
  private engineLevel?: GainNode;
  private siren?: OscillatorNode;
  private sirenLevel?: GainNode;
  private ambience?: GainNode;
  private noise?: AudioBuffer;
  muted = false;

  async enable() {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = .48;
      this.master.connect(context.destination);
      this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = this.noise.getChannelData(0);
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        low = low * .91 + (Math.random() * 2 - 1) * .09;
        data[i] = low * 2.25;
      }
      const noise = context.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 530;
      this.ambience = context.createGain();
      this.ambience.gain.value = .15;
      noise.connect(filter).connect(this.ambience).connect(this.master);
      noise.start();
      this.engine = context.createOscillator();
      this.engine.type = 'triangle';
      this.engine.frequency.value = 32;
      this.engineLevel = context.createGain();
      this.engineLevel.gain.value = 0;
      this.engine.connect(this.engineLevel).connect(this.master);
      this.engine.start();
      this.siren=context.createOscillator();
      this.siren.type='sine';
      this.sirenLevel=context.createGain();
      this.sirenLevel.gain.value=0;
      this.siren.connect(this.sirenLevel).connect(this.master);
      this.siren.start();
    }
    await this.context.resume().catch(() => undefined);
  }

  silence(value: boolean) {
    this.muted = value;
    if (this.master && this.context) this.master.gain.setTargetAtTime(value ? 0 : .48, this.context.currentTime, .06);
  }

  update(driving: boolean, speed: number, active: boolean, siren=0) {
    if (!this.context || !this.engine || !this.engineLevel || !this.ambience) return;
    const t = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(29 + Math.abs(speed) * 2.55, t, .11);
    this.engineLevel.gain.setTargetAtTime(active && driving ? .09 + Math.abs(speed) * .003 : 0, t, .10);
    this.ambience.gain.setTargetAtTime(active ? .18 : .062, t, .14);
    this.siren?.frequency.setTargetAtTime(626+166*Math.sin(t*6.4),t,.055);
    this.sirenLevel?.gain.setTargetAtTime(active?Math.min(.15,siren*.15):0,t,.1);
  }

  beep(hz = 550, duration = .18, level = .15, to = hz * 1.13) {
    if (!this.context || !this.master) return;
    const c = this.context, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz, t);
    o.frequency.exponentialRampToValueAtTime(to, t + duration);
    g.gain.setValueAtTime(.001, t);
    g.gain.linearRampToValueAtTime(level, t + .018);
    g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + .02);
  }

  impact(strong = false, shot = false) {
    if (!this.context || !this.master || !this.noise) return;
    const c = this.context, time = c.currentTime, dur = shot ? .16 : strong ? .24 : .12;
    const o = c.createBufferSource(), g = c.createGain(), filter = c.createBiquadFilter();
    o.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.value = shot ? 3400 : strong ? 580 : 360;
    o.connect(filter).connect(g).connect(this.master);
    g.gain.setValueAtTime(strong ? .75 : .43, time);
    g.gain.exponentialRampToValueAtTime(.001, time + dur);
    o.start(time, Math.random());
    o.stop(time + dur);
    if (!shot) this.beep(strong ? 86 : 137, dur, .12, 42);
  }
}
