// iPhone、iPad 上让声音出得来 (iPhone 上的 Chrome 也是 Safari 的内核, 一样):
//   1. 静音开关会把网页朗读、合成的音效都静音 (放视频、放录音不受影响)。
//      网页「正在放」媒体的时候, 系统把它当成在放媒体, 静音开关就不管了。
//      所以要出声的时候一直放着一段循环的无声音频, 念完过一会儿再停。
//      (v1.11.1 只在第一次点屏幕时放 0.1 秒, 放完又被静音了。)
//      浏览器支持的话, 也直接说这个网页是「播放」。
//   2. 要在点屏幕、按键的那一下里出过声, 后面才让出声。第一次点的时候把无声音频和朗读都解锁,
//      后面自动朗读 (单词卡自动念、听写一出题就念) 才有声。

// iPhone、iPad (所有浏览器都是 Safari 的内核)
export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let keep = null; // 循环放的无声音频
let stopTimer = 0;
let until = 0; // 放到什么时候
let speechUnlocked = false;
let inGesture = false; // 正在处理点屏幕、按键

// 1 秒的无声 WAV (16 位, 单声道)
function silentWav() {
  const rate = 8000;
  const n = rate * 2;
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
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); // 16 位, 全是 0 就是没声音
  str(36, 'data');
  v.setUint32(40, n, true);
  return new Blob([buf], { type: 'audio/wav' });
}

function silentAudio() {
  if (!keep) {
    keep = new Audio(URL.createObjectURL(silentWav()));
    keep.loop = true;
    keep.setAttribute('playsinline', '');
    keep.disableRemotePlayback = true;
  }
  return keep;
}

function stopAt(at) {
  until = at;
  clearTimeout(stopTimer);
  stopTimer = setTimeout(() => keep?.pause(), Math.max(0, at - Date.now()));
}

// 要出声了 (iPhone 上): 放着无声音频, 静音开关就不管了。
// 至少放 ms 毫秒; 朗读不知道念多久, 先说一分钟, 念完了 releaseAudio
export function holdAudio(ms = 60000) {
  if (!isIOS() || typeof Audio === 'undefined') return;
  try {
    if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
  } catch {
    // 不支持就算了
  }
  try {
    const a = silentAudio();
    a.muted = false;
    if (a.paused) a.play()?.catch?.(() => {});
    stopAt(Math.max(until, Date.now() + ms));
  } catch {
    // 放不了就算了
  }
}

// 念完了: 过一会儿停掉无声音频 (马上又要出声就接着放, 不用停了又开)
export function releaseAudio(after = 1500) {
  if (keep) stopAt(Date.now() + after);
}

// 朗读是在点屏幕、按键的那一下里开始的: 朗读解锁了, 不用另外解锁
export function noteSpeech() {
  if (inGesture) speechUnlocked = true;
}

// 第一次点屏幕、按键时解锁:
//   无声音频静音着放一下就停 (这时不出声, 也不打断在听的音乐; 以后不在点的那一下也能放);
//   朗读: 这一下没念东西的话, 念一个听不见的字 (音量 0)。不念空句子, 空句子可能一直「念不完」, 后面的全卡住
export function installAudioUnlock() {
  if (typeof document === 'undefined' || !isIOS()) return;
  let audioPrimed = false;
  const start = () => {
    inGesture = true;
    setTimeout(() => (inGesture = false));
    if (audioPrimed || typeof Audio === 'undefined') return;
    try {
      const a = silentAudio();
      if (!a.paused) return (audioPrimed = true);
      a.muted = true;
      const p = a.play();
      const done = () => {
        audioPrimed = true;
        if (a.muted) a.pause();
      };
      if (p && typeof p.then === 'function') p.then(done, () => {});
      else done();
    } catch {
      // 放不了: 下次点的时候再试
    }
  };
  // 点的东西处理完了 (要念的已经念了) 再看朗读解锁了没有
  const finish = () => {
    if (speechUnlocked || !inGesture) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      if (!synth.speaking && !synth.pending) {
        const u = new SpeechSynthesisUtterance('a');
        u.volume = 0;
        synth.speak(u);
      }
      speechUnlocked = true;
    } catch {
      // 不能朗读就算了
    }
  };
  for (const e of ['touchend', 'click', 'keydown']) {
    document.addEventListener(e, start, true);
    if (e !== 'touchend') window.addEventListener(e, finish);
  }
}
