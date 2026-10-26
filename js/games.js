// 游戏用的东西: 有哪几个游戏、这个卡片集能不能玩; 配对 (Match) 的牌, 打陨石 (Blast) 的关卡

import { normalize } from './grade.js';
import { shuffle } from './questions.js';
import { stripMarks } from './rich.js';
import { playable } from './wordle.js';

// ---- 有哪几个游戏 ----
export const GAMES = [
  { key: 'match', emoji: '🧩', name: '配对', hint: '将词语与释义配对，计时' },
  { key: 'blast', emoji: '☄️', name: '打陨石', hint: '根据释义击中正确词语' },
  { key: 'blocks', emoji: '🧱', name: '方块', hint: '答题获得方块，填满一行即消除' },
  { key: 'gems', emoji: '💎', name: '宝石', hint: '三消玩法，答题增加步数' },
  { key: 'wordle', emoji: '🟩', name: 'Wordle', hint: '6 次内猜出卡片集中的单词' },
];
export const GAME_KEYS = GAMES.map((g) => g.key);
export const gameOf = (key) => GAMES.find((g) => g.key === key) ?? null;

// 词和解释都有字的卡片才拿来出题
export function quizCards(cards) {
  return cards.filter((c) => c.term.trim() && c.def.trim());
}

// 这个卡片集玩不玩得了这个游戏: 能玩返回 '', 不能玩返回为什么
export function whyNotPlayable(key, set) {
  const cards = set?.cards ?? [];
  if (key === 'wordle') return playable(cards).items.length ? '' : '需要包含 3–10 个字母的英文单词';
  const pool = key === 'blocks' || key === 'gems' ? quizCards(cards) : cards;
  return pickDistinct(pool, 2).length >= 2 ? '' : '至少需要两张不同的卡片';
}

// 最好成绩怎么说; 还没玩过返回 ''
export function bestText(key, best) {
  const v = best?.[key];
  if (!v) return '';
  if (key === 'match') return `最好 ${formatTime(v)}`;
  if (key === 'wordle') return `最长连胜 ${v}`;
  return `最高 ${v} 分`;
}

// 字多字少分几档, 字多的用小一点的字 (陨石、选项、题目都用): '' / 'long' / 'longer' / 'longest'
export function textSize(text, steps = [14, 32, 70]) {
  const n = Array.from(stripMarks(String(text ?? '')).trim()).length;
  if (n > steps[2]) return 'longest';
  if (n > steps[1]) return 'longer';
  if (n > steps[0]) return 'long';
  return '';
}

// 挑几张能玩的卡片: 词和解释都有字, 而且彼此不重复 (不然配对时分不清)
export function pickDistinct(cards, n, rng = Math.random) {
  const terms = new Set();
  const defs = new Set();
  const out = [];
  for (const c of shuffle(cards, rng)) {
    if (out.length >= n) break;
    const t = normalize(c.term);
    const d = normalize(c.def);
    if (!t || !d || terms.has(t) || defs.has(d)) continue;
    terms.add(t);
    defs.add(d);
    out.push(c);
  }
  return out;
}

// 配对: 6 对 = 12 张牌, 打乱
export const MATCH_PAIRS = 6;

export function makeBoard(cards, pairs = MATCH_PAIRS, rng = Math.random) {
  const picked = pickDistinct(cards, pairs, rng);
  const tiles = picked.flatMap((c) => [
    { key: `${c.id}:term`, cardId: c.id, side: 'term', text: c.term },
    { key: `${c.id}:def`, cardId: c.id, side: 'def', text: c.def },
  ]);
  return shuffle(tiles, rng);
}

export function isPair(a, b) {
  return a.cardId === b.cardId && a.side !== b.side;
}

// 配对点错一次加 1 秒
export const MATCH_PENALTY_MS = 1000;

export function formatTime(ms) {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

// 打陨石: 第几关飞多快 (每秒走过屏幕高度的几分之一), 答对几题升一关
export const BLAST_PER_LEVEL = 5;
export const BLAST_LIVES = 3;

export function blastSpeed(level) {
  return Math.min(0.07 + (level - 1) * 0.015, 0.2);
}

export function blastPoints(level) {
  return 10 * level;
}

export function blastLevel(correctCount) {
  return 1 + Math.floor(correctCount / BLAST_PER_LEVEL);
}

// 打陨石: n 块陨石摆在哪 (x 是中心离左边的比例, y 是起点高低)。宽屏排成一排;
// 窄屏 (手机竖着) 两块一排、摆两排, 每块能宽一点, 字长也放得下。编号从左到右、从上到下
export function rockSlots(n, narrow, rng = Math.random) {
  const cols = narrow ? Math.min(2, n) : n;
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const inRow = Math.min(cols, n - row * cols);
    return { key: i + 1, x: (col + 0.5) / inRow, y: row * 0.32 + rng() * (narrow ? 0.05 : 0.14), width: 1 / cols };
  });
}
