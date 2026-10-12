// 用浏览器自带的朗读 (speechSynthesis), 不用联网下载声音。
// 卡片上有自己录的音就放录音。

import { stripMarks } from './rich.js';
import { mediaURL } from './media.js';
import { primeAudio } from './unlock.js';

export const LANGS = [
  ['auto', '自动'],
  ['en-US', '英语'],
  ['zh-CN', '中文'],
  ['ja-JP', '日语'],
  ['ko-KR', '韩语'],
  ['fr-FR', '法语'],
  ['de-DE', '德语'],
  ['es-ES', '西班牙语'],
  ['it-IT', '意大利语'],
  ['ru-RU', '俄语'],
];

// 别处来的语言代码 (Quizlet 的 en、es、zh-TW……) 换成上面有的; 没有的当「自动」
export function normalizeLang(code) {
  const c = String(code ?? '').trim();
  if (LANGS.some(([k]) => k === c)) return c;
  const base = c.split(/[-_]/)[0].toLowerCase();
  return LANGS.find(([k]) => k !== 'auto' && k.split('-')[0] === base)?.[0] ?? 'auto';
}

// 「自动」时看字猜: 有假名是日语, 有谚文是韩语, 有汉字是中文,
// 有西里尔字母是俄语, 别的当英语
export function guessLang(text) {
  if (/[぀-ヿ]/.test(text)) return 'ja-JP';
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko-KR';
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh-CN';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru-RU';
  return 'en-US';
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let playing = null; // 正在放的录音
let current = null; // 正在念的那一句 (留着引用: iOS 上不留, 可能念到一半就被回收、没声了)

function stopAll() {
  playing?.pause();
  playing = null;
  current = null;
  if (canSpeak()) window.speechSynthesis.cancel();
}

// iPhone、iPad (所有浏览器都是 Safari 的内核) 和电脑上的 Safari
function isAppleWebKit() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return true;
  return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);
}

// 选哪个声音。苹果的: 不选, 只告诉它语言, 用系统默认的声音
// (列表里有些声音其实用不了, 比如没下载的、Siri 的, 选上了一点声音都没有)。
// 别的浏览器: 有的光设语言不够, 要选一个; 先挑本机就有的 (安卓写成 en_US)
function pickVoice(synth, code) {
  if (isAppleWebKit()) return null;
  const base = code.split('-')[0];
  const voices = synth.getVoices().map((v) => [v, v.lang.replace('_', '-')]);
  const exact = voices.filter(([, l]) => l === code);
  const near = voices.filter(([, l]) => l.split('-')[0] === base);
  return (exact.find(([v]) => v.localService) ?? exact[0] ?? near.find(([v]) => v.localService) ?? near[0])?.[0] ?? null;
}

// rate: 语速, 1 是正常, 小于 1 慢一点 (听写时「慢一点」)
export function speak(raw, lang = 'auto', { rate = 1 } = {}) {
  const text = stripMarks(raw);
  if (!canSpeak() || !text.trim()) return;
  primeAudio(); // iPhone 静音开关开着也要有声
  playing?.pause();
  playing = null;
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const code = lang === 'auto' ? guessLang(text) : lang;
  u.lang = code;
  u.rate = rate;
  try {
    const voice = pickVoice(synth, code);
    if (voice) u.voice = voice;
  } catch {
    // 选不了就用默认的声音
  }
  u.onend = u.onerror = () => {
    if (current === u) current = null;
  };
  const busy = current && (synth.speaking || synth.pending);
  current = u;
  const go = () => {
    if (current !== u) return; // 这期间又点了别的
    synth.resume?.(); // iOS 有时会把朗读卡在「暂停」
    synth.speak(u);
  };
  // 正在念上一句: 先停, 隔一下再念 (停了马上念, iOS 上会没声)。没在念就直接念 (要在点的那一下里念, iOS 才让出声)
  if (busy) {
    synth.cancel();
    setTimeout(go, 80);
  } else go();
}

// 念卡片的一面 (side 是 'term' 或 'def'): 有录音放录音, 没有就朗读
export async function sayCard(card, side, set, { slow = false } = {}) {
  const id = side === 'term' ? card.termAudio : card.defAudio;
  if (id) {
    const url = await mediaURL(id);
    if (url) {
      stopAll();
      playing = new Audio(url);
      if (slow) playing.playbackRate = 0.7;
      playing.play().catch(() => {});
      return;
    }
  }
  speak(card[side], side === 'term' ? set.termLang : set.defLang, { rate: slow ? 0.6 : 1 });
}

// 这一面能不能念 (有录音, 或者有字而且浏览器能朗读)
export function canSay(card, side) {
  return Boolean(side === 'term' ? card.termAudio : card.defAudio) || (canSpeak() && stripMarks(card[side]).trim() !== '');
}

export function stopSpeaking() {
  stopAll();
}
