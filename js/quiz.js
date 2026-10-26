// 题目集 (v1.42 以前有的): 并进错题集了, 这里只留把老的题目集变成错题的部分。
// 老的题目集是一个卡片集 (kind: 'quiz'), 每道题是一张卡片:
//   term  题目 (可以带格式)       image  题目的图片
//   q     { type: 'choice' | 'tf', options: [选项...] (判断题没有), correct: [对的选项序号...], time: 秒 }
// 存着的、同步来的、备份里的、分享链接里的题目集, 读进来时都变成错题 (store.js 的 cleanData、views/share.js)。

import { newMistake, cleanMistake, firstReview, LETTERS, MAX_OPTIONS, MAX_KIND } from './mistakes.js';

export const TF_OPTIONS = ['对', '错'];

export function newQuestion(type = 'choice') {
  return type === 'tf' ? { type: 'tf', options: [], correct: [0] } : { type: 'choice', options: ['', '', '', ''], correct: [] };
}

// 存着的、同步来的、分享来的题目: 补齐、去掉坏的; 完全不像题目返回 null
export function cleanQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'tf') return { type: 'tf', options: [], correct: [Number(raw.correct?.[0]) === 1 ? 1 : 0] };
  if (raw.type !== 'choice' || !Array.isArray(raw.options)) return null;
  const options = raw.options.slice(0, MAX_OPTIONS).map((o) => String(o ?? ''));
  const correct = [...new Set((Array.isArray(raw.correct) ? raw.correct : []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < options.length).sort((a, b) => a - b);
  return { type: 'choice', options, correct };
}

export const optionsOf = (q) => (q.type === 'tf' ? TF_OPTIONS : q.options);

const mediaId = (v) => (typeof v === 'string' && /^m_[\w-]+$/.test(v) ? v : '');

// 一个老的题目集 → 错题: 题目集的名字当题型, 判断题是「对 / 错」两个选项;
// 多选题记第一个对的, 别的写在笔记里。id 跟着题目集和题目走, 几台设备各自变也合得上
export function quizToMistakes(set, now = Date.now()) {
  if (!set || typeof set !== 'object' || typeof set.id !== 'string' || !set.id) return [];
  const kind = String(set.title ?? '').trim().slice(0, MAX_KIND);
  return (Array.isArray(set.cards) ? set.cards : [])
    .filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id)
    .map((c) => {
      const q = cleanQuestion(c.q) ?? newQuestion();
      const image = mediaId(c.image);
      return cleanMistake({
        ...newMistake(`q_${set.id}_${c.id}`, now),
        question: String(c.term ?? ''),
        images: image ? [image] : [],
        options: optionsOf(q).map(String),
        correct: q.correct[0] ?? -1,
        note: q.correct.length > 1 ? `多选题，正确答案：${q.correct.map((i) => LETTERS[i]).join('、')}` : '',
        kind,
        review: firstReview(now),
      });
    })
    .filter(Boolean);
}
