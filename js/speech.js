// 用浏览器自带的朗读 (speechSynthesis), 不用联网下载声音。

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

export function speak(text, lang = 'auto') {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
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
