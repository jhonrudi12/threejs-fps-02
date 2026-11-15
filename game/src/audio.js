// Synthesised sound only — no audio files. Every effect is a short WebAudio
// graph (oscillator / filtered noise) built on first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }
  function noiseBuf(dur) {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function burst(dur, freq, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
  }
  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'sniper') { burst(0.28, 900, 0, 0.9, 120); tone(160, 0.18, 'sawtooth', 0.25, 40); }
      else if (kind === 'smg') burst(0.09, 1400, 0, 0.5, 300);
      else if (kind === 'pistol') burst(0.12, 1100, 0, 0.6, 200);
      else burst(0.16, 800, 0, 0.75, 150);
    },
    dry() { tone(1200, 0.05, 'square', 0.12); },
    reload() { tone(500, 0.07, 'square', 0.14); setTimeout(() => tone(700, 0.07, 'square', 0.14), 180); },
    hit() { tone(1900, 0.06, 'sine', 0.25); },
    kill() { tone(880, 0.09, 'sine', 0.25); setTimeout(() => tone(1320, 0.12, 'sine', 0.22), 80); },
    hurt() { tone(220, 0.15, 'sawtooth', 0.22, 90); },
    boom() { burst(0.7, 220, 0, 1.0, 40); tone(70, 0.5, 'sine', 0.5, 30); },
    plant() { tone(660, 0.08, 'square', 0.18); },
    beep() { tone(1100, 0.1, 'sine', 0.25); },
    round() { tone(523, 0.12, 'triangle', 0.25); setTimeout(() => tone(784, 0.2, 'triangle', 0.25), 130); },
    step() { burst(0.05, 300, 0, 0.08, 150); },
  };
}
