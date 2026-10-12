// 用浏览器自带的朗读 (speechSynthesis), 不用联网下载声音。
// 卡片上有自己录的音就放录音。

import { stripMarks } from './rich.js';
import { mediaURL } from './media.js';

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

let playing = null;

function stopAll() {
  playing?.pause();
  playing = null;
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speak(raw, lang = 'auto') {
  const text = stripMarks(raw);
  if (!canSpeak() || !text.trim()) return;
  stopAll();
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const code = lang === 'auto' ? guessLang(text) : lang;
  u.lang = code;
  // 有这个语言的声音就用它 (有的浏览器光设 lang 不够; 安卓写成 en_US)
  const base = code.split('-')[0];
  const voices = synth.getVoices().map((v) => [v, v.lang.replace('_', '-')]);
  const voice =
    voices.find(([, l]) => l === code)?.[0] ?? voices.find(([, l]) => l.startsWith(base))?.[0];
  if (voice) u.voice = voice;
  synth.speak(u);
}

// 念卡片的一面 (side 是 'term' 或 'def'): 有录音放录音, 没有就朗读
export async function sayCard(card, side, set) {
  const id = side === 'term' ? card.termAudio : card.defAudio;
  if (id) {
    const url = await mediaURL(id);
    if (url) {
      stopAll();
      playing = new Audio(url);
      playing.play().catch(() => {});
      return;
    }
  }
  speak(card[side], side === 'term' ? set.termLang : set.defLang);
}

// 这一面能不能念 (有录音, 或者有字而且浏览器能朗读)
export function canSay(card, side) {
  return Boolean(side === 'term' ? card.termAudio : card.defAudio) || (canSpeak() && stripMarks(card[side]).trim() !== '');
}

export function stopSpeaking() {
  stopAll();
}
