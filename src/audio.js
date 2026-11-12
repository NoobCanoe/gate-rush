// Sound effects synthesised with the Web Audio API. No audio files.

const MIN_GAP = 0.05; // seconds between repeats of the same sound
const MAX_VOICES = 8;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  const lastPlayed = {};
  let voiceEnds = [];

  function ensure() {
    if (ctx) return true;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return false;
    try {
      ctx = new Ctor();
    } catch {
      return false;
    }
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(comp);
    comp.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    return delay + dur;
  }

  function noise(dur, vol, freq, delay = 0, type = 'lowpass') {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
    return delay + dur;
  }

  const notes = (type, freqs, step, dur, vol) => {
    freqs.forEach((f, i) => tone(type, f, f, dur, vol, i * step));
    return (freqs.length - 1) * step + dur;
  };

  // Each sound returns its length in seconds.
  const SOUNDS = {
    'shot-rifle': () => Math.max(noise(0.07, 0.25, 2600), tone('square', 520, 180, 0.07, 0.12)),
    'shot-mg': () => Math.max(noise(0.04, 0.18, 3200), tone('square', 700, 320, 0.04, 0.08)),
    'shot-shotgun': () => Math.max(noise(0.18, 0.4, 1400), tone('sawtooth', 220, 60, 0.16, 0.2)),
    'shot-rocket': () => Math.max(noise(0.3, 0.25, 900, 0, 'bandpass'), tone('sawtooth', 160, 420, 0.28, 0.14)),
    'shot-laser': () => tone('sawtooth', 1500, 500, 0.09, 0.07),
    explosion: () => Math.max(noise(0.4, 0.5, 700), tone('sine', 120, 35, 0.4, 0.4)),
    'gate-good': () => notes('triangle', [523, 784, 1047], 0.06, 0.14, 0.3),
    'gate-bad': () => notes('sawtooth', [330, 233, 165], 0.08, 0.16, 0.18),
    kill: () => tone('triangle', 420, 140, 0.09, 0.18),
    barrel: () => Math.max(noise(0.25, 0.4, 900), tone('sine', 150, 50, 0.22, 0.35)),
    coin: () => notes('square', [1319, 1760], 0.05, 0.09, 0.1),
    weapon: () => notes('square', [392, 523, 659, 1047], 0.07, 0.14, 0.14),
    'boss-hit': () => tone('sine', 110, 60, 0.08, 0.3),
    'boss-down': () => Math.max(noise(0.9, 0.55, 600), tone('sine', 140, 28, 0.9, 0.5)),
    win: () => notes('triangle', [523, 659, 784, 1047, 1319], 0.11, 0.3, 0.3),
    lose: () => notes('triangle', [392, 330, 262, 196], 0.16, 0.3, 0.25),
    tap: () => tone('triangle', 660, 880, 0.06, 0.2),
    'soldier-lost': () => tone('square', 260, 110, 0.1, 0.12),
  };
  // Sounds that must never be dropped by the voice limit.
  const IMPORTANT = new Set(['win', 'lose', 'boss-down', 'weapon', 'gate-good', 'gate-bad', 'tap']);

  return {
    names: Object.keys(SOUNDS),

    // Call from a tap: browsers only allow sound to start from a user gesture.
    unlock() {
      if (!ensure()) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
    },

    play(name) {
      if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return false;
      const now = ctx.currentTime;
      if (lastPlayed[name] !== undefined && now - lastPlayed[name] < MIN_GAP) return false;
      voiceEnds = voiceEnds.filter((end) => end > now);
      if (voiceEnds.length >= MAX_VOICES && !IMPORTANT.has(name)) return false;
      lastPlayed[name] = now;
      voiceEnds.push(now + SOUNDS[name]());
      return true;
    },

    setMuted(value) {
      muted = !!value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },

    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },

    resume() {
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    },
  };
}
