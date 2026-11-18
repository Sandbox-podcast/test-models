let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function setup(): AudioContext | null {
  if (context) return context;
  const AudioCtor = window.AudioContext;
  if (!AudioCtor) return null;
  context = new AudioCtor();
  master = context.createGain();
  master.gain.value = muted ? 0 : .65;
  master.connect(context.destination);

  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 310;
  low.connect(master);
  const humGain = context.createGain();
  humGain.gain.value = .04;
  humGain.connect(low);
  const hum = context.createOscillator();
  hum.type = 'sine';
  hum.frequency.value = 47;
  hum.connect(humGain);
  hum.start();

  const overtoneGain = context.createGain();
  overtoneGain.gain.value = .014;
  overtoneGain.connect(low);
  const overtone = context.createOscillator();
  overtone.type = 'triangle';
  overtone.frequency.value = 96;
  overtone.connect(overtoneGain);
  overtone.start();

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * .25;
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const trafficFilter = context.createBiquadFilter();
  trafficFilter.type = 'lowpass';
  trafficFilter.frequency.value = 520;
  const trafficGain = context.createGain();
  trafficGain.gain.value = .025;
  noise.connect(trafficFilter);
  trafficFilter.connect(trafficGain);
  trafficGain.connect(master);
  noise.start();
  return context;
}

export function startSoundscape(): void {
  const audio = setup();
  if (audio?.state === 'suspended') void audio.resume();
}

export function toggleSound(): boolean {
  muted = !muted;
  if (master && context) master.gain.setTargetAtTime(muted ? 0 : .65, context.currentTime, .035);
  return !muted;
}

function tone(frequency: number, duration: number, volume: number, shape: OscillatorType = 'triangle', endFrequency = frequency): void {
  const audio = setup();
  if (!audio || !master) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = shape;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(18, endFrequency), audio.currentTime + duration);
  gain.gain.setValueAtTime(Math.max(.0001, volume), audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration + .02);
}

function noiseBurst(duration: number, volume: number, cutoff: number): void {
  const audio = setup();
  if (!audio || !master) return;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * duration)), audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
}

export function playShot(): void {
  noiseBurst(.16, .19, 850);
  tone(92, .19, .1, 'sawtooth', 39);
}

export function playImpact(): void {
  noiseBurst(.1, .09, 1250);
  tone(180, .11, .08, 'triangle', 64);
}

export function playAlarm(): void {
  tone(660, .25, .075, 'square', 790);
  window.setTimeout(() => tone(495, .28, .07, 'square', 610), 120);
}

export function playImplant(): void {
  tone(410, .1, .035, 'sine', 840);
}

export function playSuccess(): void {
  tone(330, .18, .055, 'triangle', 470);
  window.setTimeout(() => tone(495, .24, .06, 'triangle', 660), 150);
}
