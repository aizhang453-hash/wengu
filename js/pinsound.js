// 弹珠台的声音 (自己合成, 不用下载): 挡板、小行星、弹弓、坡道、黑洞、跃迁、多球、任务、危机、着陆……
// play(事件) 照着 pinball.js 发出来的事件响; 声音开关跟学习游戏共用

import { soundOn } from './views/match.js';
import { holdAudio } from './unlock.js';

let actx = null;
let noise = null;
let hum = null; // 坡道上、黑洞里那种「嗡——」, 记着好停

function audio() {
  if (!soundOn()) return null;
  try {
    holdAudio(2000); // iPhone 静音开关开着也要有声
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!noise) {
      noise = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return actx;
  } catch {
    return null;
  }
}

function tone(ctx, { f0, f1 = f0, at = 0, len = 0.1, type = 'sine', vol = 0.1 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
  return osc;
}

function hiss(ctx, { at = 0, len = 0.06, freq = 1800, f1 = freq, q = 1, vol = 0.15, type = 'bandpass' }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = len > 0.45;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (f1 !== freq) filter.frequency.exponentialRampToValueAtTime(f1, t + len);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + len + 0.02);
}

const notes = (ctx, list, { gap = 0.08, len = 0.14, type = 'triangle', vol = 0.1, at = 0 } = {}) => list.forEach((f, i) => tone(ctx, { f0: f, at: at + i * gap, len, type, vol }));

// 一段往上的「嗡」(坡道上): 球下来了或者滚回来了就停
function startHum(ctx) {
  stopHum();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(90, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 1.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.1);
  osc.connect(filter).connect(g).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 2);
  hum = { osc, g };
}

export function stopHum() {
  if (!hum || !actx) return;
  try {
    hum.g.gain.cancelScheduledValues(actx.currentTime);
    hum.g.gain.setValueAtTime(hum.g.gain.value, actx.currentTime);
    hum.g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.08);
    hum.osc.stop(actx.currentTime + 0.1);
  } catch {
    // 已经停了
  }
  hum = null;
}

export function play(e) {
  const ctx = audio();
  if (!ctx) return;
  switch (e.type) {
    case 'flip':
      tone(ctx, { f0: 150, f1: 55, len: 0.06, type: 'square', vol: 0.05 });
      hiss(ctx, { len: 0.03, freq: 3000, vol: 0.05 });
      break;
    case 'bumper':
      tone(ctx, { f0: 620 - e.i * 70, f1: 240, len: 0.14, type: 'sine', vol: 0.13 });
      tone(ctx, { f0: 1240 - e.i * 140, len: 0.05, type: 'triangle', vol: 0.05 });
      hiss(ctx, { len: 0.05, freq: 900, vol: 0.08, type: 'lowpass' });
      break;
    case 'sling':
      hiss(ctx, { len: 0.07, freq: 1600, q: 2, vol: 0.2 });
      tone(ctx, { f0: 300, f1: 120, len: 0.06, type: 'square', vol: 0.04 });
      break;
    case 'lane':
      notes(ctx, [880, 1320], { gap: 0.06, len: 0.09, type: 'sine', vol: 0.08 });
      break;
    case 'drop':
      tone(ctx, { f0: 340, f1: 120, len: 0.1, type: 'square', vol: 0.06 });
      break;
    case 'target':
      tone(ctx, { f0: 900, f1: 700, len: 0.07, type: 'square', vol: 0.05 });
      break;
    case 'inlane':
    case 'outlane':
      tone(ctx, { f0: 440, len: 0.07, type: 'sine', vol: 0.06 });
      break;
    case 'spinner':
      for (let i = 0; i < Math.min(14, e.spins); i++) tone(ctx, { f0: 1400 - i * 30, at: i * 0.045, len: 0.03, type: 'square', vol: 0.03 });
      break;
    case 'orbit':
      tone(ctx, { f0: 300, f1: 1200, len: 0.35, type: 'sawtooth', vol: 0.04 });
      notes(ctx, [784, 988, 1175], { gap: 0.07, len: 0.12, at: 0.2, vol: 0.07 });
      break;
    case 'rampEnter':
      startHum(ctx);
      break;
    case 'rampFail':
      stopHum();
      tone(ctx, { f0: 300, f1: 90, len: 0.3, type: 'sawtooth', vol: 0.04 });
      break;
    case 'ramp':
      stopHum();
      notes(ctx, [523, 659, 784, 1047], { gap: 0.06, len: 0.16, vol: 0.09 });
      break;
    case 'hole':
      stopHum();
      tone(ctx, { f0: 420, f1: 50, len: 0.7, type: 'sine', vol: 0.14 });
      hiss(ctx, { len: 0.6, freq: 2000, f1: 200, q: 3, vol: 0.12 });
      break;
    case 'wormhole':
    case 'eject':
      hiss(ctx, { len: 0.2, freq: 300, f1: 2400, q: 2, vol: 0.12 });
      tone(ctx, { f0: 160, f1: 700, len: 0.22, type: 'sine', vol: 0.07 });
      break;
    case 'launch':
      hiss(ctx, { len: 0.18 + e.power * 0.25, freq: 500 + e.power * 1800, q: 0.7, vol: 0.12 + e.power * 0.1 });
      tone(ctx, { f0: 80, f1: 260, len: 0.25, type: 'sine', vol: 0.08 });
      break;
    case 'skill':
      notes(ctx, [784, 1047, 1319, 1568, 2093], { gap: 0.06, len: 0.18, vol: 0.09 });
      break;
    case 'mult':
    case 'lockLit':
    case 'missionReady':
      notes(ctx, [523, 784, 1047], { gap: 0.08, len: 0.16 });
      break;
    case 'constellation':
      notes(ctx, [659, 784, 988, 1319, 1568], { gap: 0.07, len: 0.2, type: 'sine', vol: 0.09 });
      break;
    case 'missionStart':
      notes(ctx, [392, 392, 523, 659], { gap: 0.12, len: 0.18, type: 'square', vol: 0.05 });
      break;
    case 'missionStep':
      tone(ctx, { f0: 1047, len: 0.08, type: 'triangle', vol: 0.07 });
      break;
    case 'missionDone':
      // 小号那样的一段
      notes(ctx, [523, 659, 784, 1047], { gap: 0.13, len: 0.2, type: 'sawtooth', vol: 0.045 });
      notes(ctx, [784, 1047], { gap: 0.15, len: 0.5, type: 'square', vol: 0.04, at: 0.55 });
      break;
    case 'missionFail':
      notes(ctx, [440, 370, 311], { gap: 0.12, len: 0.2, type: 'square', vol: 0.045 });
      break;
    case 'pickStart':
    case 'pick':
      tone(ctx, { f0: 1320, len: 0.05, type: 'square', vol: 0.04 });
      break;
    case 'combo':
      notes(ctx, [784 + e.n * 60, 1175 + e.n * 90], { gap: 0.05, len: 0.1, type: 'square', vol: 0.05 });
      break;
    case 'mystery':
      notes(ctx, [1568, 1319, 1760, 2093], { gap: 0.06, len: 0.1, type: 'sine', vol: 0.07 });
      break;
    case 'bossReady':
    case 'finalReady':
    case 'landingReady':
      // 警报
      for (let i = 0; i < 3; i++) tone(ctx, { f0: 520, f1: 880, at: i * 0.3, len: 0.25, type: 'sawtooth', vol: 0.04 });
      break;
    case 'bossStart':
      tone(ctx, { f0: 55, f1: 40, len: 1.2, type: 'sawtooth', vol: 0.08 });
      notes(ctx, [196, 233, 196, 311], { gap: 0.18, len: 0.22, type: 'square', vol: 0.05, at: 0.2 });
      break;
    case 'bossHit':
      hiss(ctx, { len: 0.25, freq: 1200, f1: 200, q: 1, vol: 0.18 });
      tone(ctx, { f0: 160, f1: 50, len: 0.3, type: 'square', vol: 0.08 });
      break;
    case 'bossDown':
      hiss(ctx, { len: 1.4, freq: 2400, f1: 80, q: 0.6, vol: 0.22, type: 'lowpass' });
      tone(ctx, { f0: 90, f1: 30, len: 1.2, type: 'sine', vol: 0.15 });
      notes(ctx, [523, 659, 784, 1047, 1319], { gap: 0.1, len: 0.3, type: 'triangle', vol: 0.08, at: 0.9 });
      break;
    case 'travel':
      tone(ctx, { f0: 80, f1: 2400, len: 1.6, type: 'sawtooth', vol: 0.05 });
      hiss(ctx, { len: 1.6, freq: 200, f1: 7000, q: 1, vol: 0.1 });
      break;
    case 'finalStart':
      notes(ctx, [392, 523, 659, 784, 1047], { gap: 0.14, len: 0.35, type: 'sawtooth', vol: 0.045 });
      break;
    case 'finalJackpot':
      notes(ctx, [1047, 1568, 2093], { gap: 0.06, len: 0.2, type: 'square', vol: 0.05 });
      break;
    case 'landing':
      hiss(ctx, { len: 2, freq: 3000, f1: 150, q: 0.7, vol: 0.14, type: 'lowpass' });
      notes(ctx, [523, 659, 784, 1047, 784, 1047, 1319, 1568], { gap: 0.16, len: 0.4, type: 'triangle', vol: 0.09, at: 0.6 });
      break;
    case 'finalEnd':
      notes(ctx, [659, 523, 392], { gap: 0.15, len: 0.25, vol: 0.07 });
      break;
    case 'medic':
      notes(ctx, [880, 1175, 1568], { gap: 0.08, len: 0.18, type: 'sine', vol: 0.08 });
      break;
    case 'lock':
      tone(ctx, { f0: 200, f1: 80, len: 0.3, type: 'square', vol: 0.06 });
      notes(ctx, [659, 988], { gap: 0.1, len: 0.2, at: 0.25 });
      break;
    case 'multiball':
      hiss(ctx, { len: 1.2, freq: 200, f1: 3000, q: 1.5, vol: 0.1 });
      notes(ctx, [392, 523, 659, 784, 1047, 1319], { gap: 0.1, len: 0.25, type: 'sawtooth', vol: 0.045, at: 0.3 });
      break;
    case 'jackpot':
      notes(ctx, [1047, 1319, 1568, 2093, 1568, 2093], { gap: 0.07, len: 0.16, type: 'square', vol: 0.05 });
      hiss(ctx, { len: 0.6, freq: 6000, q: 0.5, vol: 0.06, type: 'highpass' });
      break;
    case 'hyperspace':
      tone(ctx, { f0: 60, f1: 1800, len: 1.4, type: 'sawtooth', vol: 0.06 });
      hiss(ctx, { len: 1.4, freq: 300, f1: 6000, q: 1, vol: 0.12 });
      notes(ctx, [1047, 1568, 2093], { gap: 0.1, len: 0.4, at: 1.3, vol: 0.08 });
      break;
    case 'multiballEnd':
      notes(ctx, [784, 659, 523], { gap: 0.1, len: 0.18, vol: 0.07 });
      break;
    case 'kickback':
    case 'save':
      notes(ctx, [392, 784], { gap: 0.07, len: 0.12, type: 'square', vol: 0.05 });
      break;
    case 'drain':
      stopHum();
      notes(ctx, [392, 330, 262, 196], { gap: 0.16, len: 0.26, vol: 0.09 });
      break;
    case 'over':
      notes(ctx, [523, 440, 349, 294, 262], { gap: 0.18, len: 0.3, vol: 0.09 });
      break;
    case 'bump':
    case 'nudge':
      hiss(ctx, { len: 0.08, freq: 220, vol: 0.18, type: 'lowpass' });
      tone(ctx, { f0: 70, f1: 40, len: 0.12, type: 'sine', vol: 0.12 });
      break;
    case 'tiltWarn':
      tone(ctx, { f0: 220, len: 0.15, type: 'square', vol: 0.06 });
      break;
    case 'tilt':
      tone(ctx, { f0: 110, len: 0.8, type: 'square', vol: 0.07 });
      break;
  }
}
