// 用浏览器自带的朗读 (speechSynthesis), 不用联网下载声音。
// 卡片上有自己录的音就放录音。

import { stripMarks } from './rich.js';
import { mediaURL } from './media.js';
import { toast } from './dom.js';
import { isIOS, holdAudio, releaseAudio, noteSpeech } from './unlock.js';

export const LANGS = [
  ['auto', '自动'],
  ['en-US', '英语 (美国)'],
  ['en-GB', '英语 (英国)'],
  ['zh-CN', '中文 (普通话)'],
  ['zh-TW', '中文 (台湾)'],
  ['zh-HK', '粤语'],
  ['ja-JP', '日语'],
  ['ko-KR', '韩语'],
  ['fr-FR', '法语'],
  ['de-DE', '德语'],
  ['es-ES', '西班牙语 (西班牙)'],
  ['es-MX', '西班牙语 (拉美)'],
  ['it-IT', '意大利语'],
  ['pt-BR', '葡萄牙语 (巴西)'],
  ['pt-PT', '葡萄牙语 (葡萄牙)'],
  ['ru-RU', '俄语'],
  ['ar-SA', '阿拉伯语'],
  ['nl-NL', '荷兰语'],
  ['pl-PL', '波兰语'],
  ['tr-TR', '土耳其语'],
  ['sv-SE', '瑞典语'],
  ['el-GR', '希腊语'],
  ['he-IL', '希伯来语'],
  ['hi-IN', '印地语'],
  ['th-TH', '泰语'],
  ['vi-VN', '越南语'],
  ['id-ID', '印尼语'],
];

// 别处来的语言代码 (导入时带的 en、es、zh-TW……) 换成上面有的; 没有的当「自动」
export function normalizeLang(code) {
  const c = String(code ?? '').trim().replace('_', '-');
  const exact = LANGS.find(([k]) => k.toLowerCase() === c.toLowerCase());
  if (exact) return exact[0];
  const base = c.split('-')[0].toLowerCase();
  return LANGS.find(([k]) => k !== 'auto' && k.split('-')[0] === base)?.[0] ?? 'auto';
}

// ---- 「自动」: 猜是什么语言 ----
// 1. 一看文字就知道的: 假名 → 日语 (日语也有汉字, 先看假名), 谚文 → 韩语, 汉字 → 中文, 西里尔字母 → 俄语,
//    阿拉伯文、希伯来文、泰文、希腊文、天城文 (印地语)
const SCRIPTS = [
  [/[぀-ヿ]/, 'ja-JP'],
  [/[가-힯ᄀ-ᇿ]/, 'ko-KR'],
  [/[一-鿿㐀-䶿]/, 'zh-CN'],
  [/[Ѐ-ӿ]/, 'ru-RU'],
  [/[؀-ۿ]/, 'ar-SA'],
  [/[֐-׿]/, 'he-IL'],
  [/[฀-๿]/, 'th-TH'],
  [/[Ͱ-Ͽ]/, 'el-GR'],
  [/[ऀ-ॿ]/, 'hi-IN'],
];

export function scriptLang(text) {
  return SCRIPTS.find(([re]) => re.test(text))?.[1] ?? null;
}

// 2. 拉丁字母写的: 看特别的字母 (ñ ¿ ¡ 是西班牙语, ß 是德语, œ 是法语, ã õ 是葡萄牙语……) 和常见的小词 (el、der、le、the……)
//    几种语言都有的字母 (é à ç……) 每种都加一点 (在哪种语言里常见, 哪种加得多)
const L = { es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL', pl: 'pl-PL', tr: 'tr-TR', sv: 'sv-SE', vi: 'vi-VN', id: 'id-ID', en: 'en-US' };
const CHARS = {
  ñ: { es: 3 }, '¿': { es: 3 }, '¡': { es: 3 },
  á: { es: 1, pt: 0.7 }, í: { es: 1, pt: 0.7 }, ó: { es: 1, pt: 0.7, pl: 0.5 }, ú: { es: 1, pt: 0.7 },
  é: { fr: 1, es: 0.8, pt: 0.4, it: 0.4 }, è: { fr: 1.5, it: 1 }, ê: { fr: 1.5, pt: 0.5 }, à: { fr: 1, it: 1, pt: 0.3 },
  â: { fr: 1, pt: 0.5 }, î: { fr: 2 }, ï: { fr: 2 }, ô: { fr: 1, pt: 0.5 }, û: { fr: 2 }, ù: { fr: 1.5, it: 1 },
  ë: { fr: 2, nl: 1 }, œ: { fr: 3 }, æ: { fr: 1 }, ç: { fr: 1.5, pt: 1, tr: 1 }, ÿ: { fr: 2 },
  ì: { it: 3 }, ò: { it: 3 }, ã: { pt: 3 }, õ: { pt: 3 },
  ä: { de: 2, sv: 1 }, ö: { de: 2, sv: 1, tr: 1 }, ü: { de: 2, tr: 1 }, ß: { de: 3 }, å: { sv: 3 },
  ą: { pl: 3 }, ę: { pl: 3 }, ł: { pl: 3 }, ś: { pl: 3 }, ź: { pl: 3 }, ż: { pl: 3 }, ć: { pl: 3 }, ń: { pl: 3 },
  ğ: { tr: 3 }, ı: { tr: 3 }, ş: { tr: 3 }, đ: { vi: 3 }, ơ: { vi: 3 }, ư: { vi: 3 }, ă: { vi: 2 },
};
const WORDS = {
  es: 'el los las del y por para una es muy pero con está son al lo como más también',
  fr: 'le les des du et est une je il nous vous pas avec pour dans sur ce qui au aux ne',
  de: 'der die das und ist ein eine nicht ich mit zu auf den dem sie von für auch sich',
  it: 'il gli della di che non sono per molto anche questo nella del',
  pt: 'o os não uma um do da em com você são muito também',
  nl: 'het een niet ik zijn van voor wat maar ook naar',
  id: 'yang ini itu dengan untuk tidak saya akan juga adalah',
  en: 'the and of to is are was with for that this you it in on be',
};
const WORD_SCORES = new Map();
for (const [lang, list] of Object.entries(WORDS)) {
  for (const w of list.split(' ')) WORD_SCORES.set(w, [...(WORD_SCORES.get(w) ?? []), lang]);
}

// 一段字每种语言几分 (只看拉丁字母的)
function latinScores(text) {
  const score = {};
  const add = (lang, n) => (score[lang] = (score[lang] ?? 0) + n);
  const lower = text.toLowerCase();
  for (const ch of lower) {
    const w = CHARS[ch];
    if (w) for (const [lang, n] of Object.entries(w)) add(lang, n);
    else if (ch >= 'ạ' && ch <= 'ỹ') add('vi', 3); // 越南语那些带两个符号的
  }
  if (/güe|güi/.test(lower)) add('es', 2); // pingüino (西班牙语的 ü)
  for (const w of lower.split(/[^\p{L}]+/u)) for (const lang of WORD_SCORES.get(w) ?? []) add(lang, 1);
  return score;
}

const top2 = (score) => Object.entries(score).sort((a, b) => b[1] - a[1]);

// 一个词 / 一句话自己就看得出来的 (特别的字母, 明显领先): 返回语言代码, 看不出来是 null
function ownLatin(text, min = 2) {
  const [[lang, n] = [], [, m = 0] = []] = top2(latinScores(text));
  return lang && lang !== 'en' && n >= min && n >= m * 2 ? L[lang] : null;
}

export function guessLang(text) {
  return scriptLang(text) ?? ownLatin(text) ?? 'en-US';
}

// 3. 一整个卡片集的一面大多是什么语言 (单看一个词常常看不出来: 西班牙语的 perro、casa 没有特别的字母)。
//    有特别的字母、小词的卡片够多 (至少两张、一成半以上), 又明显比别的语言多, 才算; 不然当英语
export function guessLangOf(texts) {
  const list = texts.map((t) => stripMarks(String(t ?? ''))).filter((t) => t.trim());
  if (!list.length) return 'en-US';
  const scripts = {};
  for (const t of list) {
    const s = scriptLang(t);
    if (s) scripts[s] = (scripts[s] ?? 0) + 1;
  }
  const [script] = top2(scripts)[0] ?? [];
  if (script && scripts[script] >= list.length / 2) return script;
  const total = {};
  const hits = {};
  for (const t of list) {
    for (const [lang, n] of Object.entries(latinScores(t))) {
      total[lang] = (total[lang] ?? 0) + n;
      hits[lang] = (hits[lang] ?? 0) + 1;
    }
  }
  const ranked = top2(total).filter(([lang]) => lang !== 'en');
  const [lang, n] = ranked[0] ?? [];
  if (!lang) return 'en-US';
  const second = ranked[1]?.[1] ?? 0;
  const enough = hits[lang] >= Math.max(2, list.length * 0.15);
  return enough && n >= second * 1.5 && n > (total.en ?? 0) ? L[lang] : 'en-US';
}

// 卡片集这一面「自动」的话是什么语言 (按卡片现算, 卡片变了才重算; 卡片太多的挑几百张看)
const setLangCache = new Map();
export function setLang(set, side) {
  if (!set?.cards) return null;
  const sig = `${set.cards.length}:${set.updatedAt ?? ''}:${set.cards[0]?.[side] ?? ''}:${set.cards.at(-1)?.[side] ?? ''}`;
  const key = `${set.id}:${side}`;
  const hit = setLangCache.get(key);
  if (hit?.sig === sig) return hit.lang;
  const step = Math.max(1, Math.floor(set.cards.length / 400));
  const texts = set.cards.filter((_, i) => i % step === 0).map((c) => c[side]);
  const lang = guessLangOf(texts);
  setLangCache.set(key, { sig, lang });
  return lang;
}

// 「自动」时这一段字用什么语言念: 不是拉丁字母的看文字; 拉丁字母的听卡片集的 (这个词自己有特别明显的字母除外,
// 比如英语卡片集里的 jalapeño); 没有卡片集的看这段字自己
export function autoLang(text, hint = null) {
  return scriptLang(text) ?? (hint ? ownLatin(text, 3) ?? hint : guessLang(text));
}

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let playing = null; // 正在放的录音
let current = null; // 正在念的那一句 (留着引用: iOS 上不留, 可能念到一半就被回收、没声了)
let watchdog = 0;

function stopAll() {
  playing?.pause();
  playing = null;
  current = null;
  clearTimeout(watchdog);
  if (canSpeak()) window.speechSynthesis.cancel();
  releaseAudio(0);
}

// iPhone、iPad 和电脑上的 Safari
function isAppleWebKit() {
  if (typeof navigator === 'undefined') return false;
  if (isIOS()) return true;
  const ua = navigator.userAgent;
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

// 念不出来时说一声, 不然一点动静都没有, 不知道怎么回事
const PROBLEMS = {
  'not-allowed': '浏览器不让朗读, 再点一下 🔊 试试',
  'language-unavailable': '这台设备上没有这种语言的声音',
  'voice-unavailable': '这台设备上没有这种语言的声音',
  'synthesis-unavailable': '这台设备上的朗读用不了',
};
function problem(code) {
  if (code === 'interrupted' || code === 'canceled') return; // 自己停的
  toast(code ? (PROBLEMS[code] ?? `朗读出错了 (${code})`) : '朗读没反应, 再点一下 🔊 试试');
}

function say(text, code, rate, retried) {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = code;
  u.rate = rate;
  try {
    const voice = pickVoice(synth, code);
    if (voice) u.voice = voice;
  } catch {
    // 选不了就用默认的声音
  }
  let started = false;
  u.onstart = () => (started = true);
  u.onend = () => {
    if (current !== u) return;
    current = null;
    clearTimeout(watchdog);
    releaseAudio();
  };
  u.onerror = (e) => {
    if (current !== u) return;
    current = null;
    clearTimeout(watchdog);
    releaseAudio();
    problem(e.error);
  };
  // 正在念别的 (上一句, 或者卡住了): 先停, 隔一下再念 (停了马上念, iOS 上会没声)。
  // 没在念就直接念 (要在点的那一下里念, iOS 才让出声)
  const busy = synth.speaking || synth.pending;
  current = u;
  const go = () => {
    if (current !== u) return; // 这期间又点了别的
    synth.resume?.(); // iOS 有时会把朗读卡在「暂停」
    synth.speak(u);
    // 过了好一会儿还没开始念: 卡住了, 停掉重念一次; 还不行就说一声
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (current !== u || started) return;
      if (retried) {
        current = null;
        synth.cancel();
        releaseAudio(0);
        problem();
      } else say(text, code, rate, true);
    }, 3000);
  };
  if (busy) {
    synth.cancel();
    setTimeout(go, 80);
  } else go();
}

// rate: 语速, 1 是正常, 小于 1 慢一点 (听写时「慢一点」); hint: 「自动」时卡片集大多是什么语言 (setLang)
export function speak(raw, lang = 'auto', { rate = 1, hint = null } = {}) {
  const text = stripMarks(raw);
  if (!canSpeak() || !text.trim()) return;
  noteSpeech();
  holdAudio(); // iPhone: 念的时候一直放着无声音频, 静音开关开着也能听到
  playing?.pause();
  playing = null;
  say(text, lang === 'auto' ? autoLang(text, hint) : lang, rate);
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
  const lang = side === 'term' ? set.termLang : set.defLang;
  speak(card[side], lang, { rate: slow ? 0.6 : 1, hint: lang === 'auto' || !lang ? setLang(set, side) : null });
}

// 这一面能不能念 (有录音, 或者有字而且浏览器能朗读)
export function canSay(card, side) {
  return Boolean(side === 'term' ? card.termAudio : card.defAudio) || (canSpeak() && stripMarks(card[side]).trim() !== '');
}

export function stopSpeaking() {
  stopAll();
}
