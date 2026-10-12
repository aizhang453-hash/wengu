// 两个游戏用的东西: 配对 (Match) 的牌, 打陨石 (Blast) 的关卡

import { normalize } from './grade.js';
import { shuffle } from './questions.js';

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
