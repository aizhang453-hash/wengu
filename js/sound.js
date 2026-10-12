// 答对、答错的音效, 用浏览器自己合成, 不用下载声音文件
import { primeAudio } from './unlock.js';

let ctx = null;

function tone(freq, start, length, { type = 'sine', volume = 0.12 } = {}) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length + 0.02);
}

export function playSound(kind) {
  try {
    primeAudio(); // iPhone 静音开关开着也要有声
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (kind === 'right') {
      tone(659, 0, 0.12); // 叮
      tone(988, 0.09, 0.2); // 咚
    } else if (kind === 'wrong') {
      tone(220, 0, 0.22, { type: 'triangle', volume: 0.1 });
    } else if (kind === 'done') {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22));
    }
  } catch {
    // 浏览器不支持就不响
  }
}
