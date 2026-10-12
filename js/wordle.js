// Wordle: 从卡片集里挑一个词, 6 次猜出来。
// 绿: 字母对、位置也对; 黄: 有这个字母但位置不对; 灰: 没有这个字母。

import { stripMarks } from './rich.js';

export const TRIES = 6;
export const MIN_LEN = 3;
export const MAX_LEN = 10;

// 能拿来猜的: 一个词, 全是字母 (法语、德语带重音的也行), 3 到 10 个字母
export function wordOf(text) {
  const w = stripMarks(String(text ?? '')).trim().normalize('NFC').toLowerCase();
  const len = Array.from(w).length;
  if (len < MIN_LEN || len > MAX_LEN) return null;
  return /^\p{L}+$/u.test(w) && !/[぀-ヿ㐀-䶿一-鿿가-힯]/.test(w) ? w : null;
}

// 挑出能玩的卡片: 先看词那面, 一个都没有再看解释那面。返回 { side, items: [{ card, word }] }
export function playable(cards) {
  for (const side of ['term', 'def']) {
    const items = cards.map((card) => ({ card, word: wordOf(card[side]) })).filter((x) => x.word);
    if (items.length) return { side, items };
  }
  return { side: 'term', items: [] };
}

// 判一次猜的: 每个字母 'correct' | 'present' | 'absent' (同一个字母出现几次也照真 Wordle 算)
export function evaluate(guess, target) {
  const g = Array.from(guess.toLowerCase());
  const t = Array.from(target.toLowerCase());
  const result = g.map(() => 'absent');
  const left = new Map();
  t.forEach((ch, i) => {
    if (g[i] === ch) result[i] = 'correct';
    else left.set(ch, (left.get(ch) ?? 0) + 1);
  });
  g.forEach((ch, i) => {
    if (result[i] === 'correct') return;
    const n = left.get(ch) ?? 0;
    if (n > 0) {
      result[i] = 'present';
      left.set(ch, n - 1);
    }
  });
  return result;
}

// 键盘上每个字母的颜色: 取最好的那个 (绿 > 黄 > 灰)
const RANK = { absent: 1, present: 2, correct: 3 };
export function mergeKeys(keys, guess, result) {
  const next = { ...keys };
  Array.from(guess.toLowerCase()).forEach((ch, i) => {
    if (!next[ch] || RANK[result[i]] > RANK[next[ch]]) next[ch] = result[i];
  });
  return next;
}
