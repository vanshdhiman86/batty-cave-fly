let audioCtx: AudioContext | null = null;

const getCtx = (): AudioContext => {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
};

export const playFlap = () => {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
};

export const playScore = () => {
  const ctx = getCtx();
  [600, 900].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.08);
    osc.stop(ctx.currentTime + i * 0.08 + 0.15);
  });
};

export const playGameOver = () => {
  const ctx = getCtx();
  [400, 300, 200].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + i * 0.15);
    osc.stop(ctx.currentTime + i * 0.15 + 0.2);
  });
};

// Ambient drone background music
let bgNodes: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

export const startBgMusic = () => {
  const ctx = getCtx();
  if (bgNodes) return;

  const master = ctx.createGain();
  master.gain.value = 0.04;
  master.connect(ctx.destination);

  const freqs = [55, 82.5, 110, 165];
  const oscs = freqs.map((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = i < 2 ? "sine" : "triangle";
    osc.frequency.value = f;
    osc.detune.value = Math.random() * 6 - 3;
    osc.connect(master);
    osc.start();
    return osc;
  });

  // LFO for subtle pulsing
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.3;
  lfoGain.gain.value = 0.015;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();
  oscs.push(lfo);

  bgNodes = { oscs, gain: master };
};

export const stopBgMusic = () => {
  if (!bgNodes) return;
  bgNodes.oscs.forEach((o) => { try { o.stop(); } catch {} });
  bgNodes.gain.disconnect();
  bgNodes = null;
};
