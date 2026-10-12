// 出题: 学习模式和测试模式都用这个。
// side 是要你答的那一面: 'def' 看词答解释, 'term' 看解释答词

import { normalize } from './grade.js';

export const TYPE_NAMES = {
  mc: '选择题',
  tf: '判断题',
  written: '打字',
  flash: '单词卡',
  match: '配对',
};

export function pickSide(answerWith, rng = Math.random) {
  if (answerWith === 'both') return rng() < 0.5 ? 'def' : 'term';
  return answerWith === 'term' ? 'term' : 'def';
}

export function otherSide(side) {
  return side === 'def' ? 'term' : 'def';
}

export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 从别的卡片里挑 n 个错的答案, 跟对的、跟彼此都不一样
export function distractors(card, pool, side, n, rng = Math.random) {
  const seen = new Set([normalize(card[side])]);
  const out = [];
  for (const other of shuffle(pool, rng)) {
    if (out.length >= n) break;
    if (other.id === card.id) continue;
    const key = normalize(other[side]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(other[side]);
  }
  return out;
}

// 出一道题。卡片太少出不了选择题、判断题的, 改成打字。
// 'flash' 是学习模式里的单词卡题: 看题目, 自己想, 翻过来对答案, 自己说会不会
export function makeQuestion(type, card, pool, { answerWith = 'def', rng = Math.random } = {}) {
  const side = pickSide(answerWith, rng);
  const base = {
    type,
    card,
    side,
    prompt: card[otherSide(side)],
    answer: card[side],
  };
  if (type === 'mc') {
    const wrong = distractors(card, pool, side, 3, rng);
    if (wrong.length === 0) return { ...base, type: 'written' };
    const options = shuffle([card[side], ...wrong], rng);
    return { ...base, options, correctIndex: options.indexOf(card[side]) };
  }
  if (type === 'tf') {
    const [wrong] = distractors(card, pool, side, 1, rng);
    if (wrong === undefined) return { ...base, type: 'written' };
    const isTrue = rng() < 0.5;
    return { ...base, shown: isTrue ? card[side] : wrong, isTrue };
  }
  if (type === 'flash') return base;
  return { ...base, type: 'written' };
}

// 测试里的配对题: 一组几张卡片, 每个题目从同一堆答案里选
export function makeMatchGroup(cards, { answerWith = 'def', rng = Math.random } = {}) {
  const side = pickSide(answerWith === 'both' ? 'def' : answerWith, rng);
  const items = cards.map((card) => ({ card, prompt: card[otherSide(side)], answer: card[side] }));
  return { type: 'match', side, items, options: shuffle(items.map((x) => x.answer), rng) };
}
