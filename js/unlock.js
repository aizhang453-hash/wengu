// iPhone、iPad 上让声音出得来:
//   1. 静音开关会把网页朗读、合成的音效都静音 (放视频、放录音不受影响)。
//      先放一小段无声的音频, 系统就把这个网页当成「在放媒体」, 静音开关就不管了;
//      浏览器支持的话, 也直接说这个网页是「播放」。
//   2. 要用户点过屏幕、按过键以后才让出声。第一次点的时候就把声音解锁, 后面自动朗读才有声。

let primed = false;
let silentUrl = null;

// 0.1 秒的无声 WAV
function silentWav() {
  const rate = 8000;
  const n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 单声道
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); // 8 位
  str(36, 'data');
  v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 8 位的「没声音」是 128
  return new Blob([buf], { type: 'audio/wav' });
}

export function primeAudio() {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
  } catch {
    // 不支持就算了
  }
  if (primed || typeof Audio === 'undefined') return;
  try {
    silentUrl ??= URL.createObjectURL(silentWav());
    const a = new Audio(silentUrl);
    a.setAttribute('playsinline', '');
    const p = a.play();
    if (p && typeof p.then === 'function') p.then(() => (primed = true)).catch(() => {});
    else primed = true;
  } catch {
    // 放不了 (没点过屏幕): 下次点的时候再试
  }
}

export const audioPrimed = () => primed;

// 第一次点屏幕 / 按键时解锁 (放无声音频, 朗读念一个空句子)。解锁成功以后就不再管了
export function installAudioUnlock() {
  if (typeof document === 'undefined') return;
  const events = ['touchend', 'click', 'keydown'];
  const unlock = () => {
    if (primed) {
      for (const e of events) document.removeEventListener(e, unlock, true);
      return;
    }
    primeAudio();
    try {
      if ('speechSynthesis' in window && !window.speechSynthesis.speaking) window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    } catch {
      // 不能朗读就算了
    }
  };
  for (const e of events) document.addEventListener(e, unlock, true);
}
