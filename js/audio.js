// audio.js — små syntetiske lyde. Ingen lydfiler, ingen ekstra netværkskald.

let ctx = null;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
}

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function tone({ freq = 440, to = null, dur = 0.15, type = 'sine', gain = 0.15, delay = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  jump:    () => tone({ freq: 320, to: 620, dur: 0.16, type: 'triangle', gain: 0.12 }),
  land:    () => tone({ freq: 180, to: 110, dur: 0.10, type: 'sine', gain: 0.10 }),
  portal:  () => { tone({ freq: 520, dur: 0.20, type: 'sine', gain: 0.10 });
                   tone({ freq: 780, dur: 0.28, type: 'sine', gain: 0.08, delay: 0.08 }); },
  correct: () => { tone({ freq: 660, dur: 0.13, type: 'triangle', gain: 0.13 });
                   tone({ freq: 880, dur: 0.16, type: 'triangle', gain: 0.13, delay: 0.11 });
                   tone({ freq: 1180, dur: 0.24, type: 'sine', gain: 0.10, delay: 0.22 }); },
  wrong:   () => tone({ freq: 220, to: 150, dur: 0.22, type: 'sawtooth', gain: 0.07 }),
  death:   () => { tone({ freq: 440, to: 90, dur: 0.55, type: 'sawtooth', gain: 0.10 });
                   tone({ freq: 220, to: 60, dur: 0.7, type: 'sine', gain: 0.08, delay: 0.05 }); },
};
