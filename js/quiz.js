// 题目集 (照 Kahoot / Quizizz): 每道题自己写题目和选项, 一个人限时答, 答得快分高。
// 题目集也是一个卡片集 (kind: 'quiz'), 每道题是一张卡片:
//   term  题目 (可以带格式)       image  题目的图片
//   def   对的答案 (自动写的, 搜索、列表里显示用)
//   q     { type: 'choice' | 'tf', options: [选项...] (判断题没有), correct: [对的选项序号...], time: 秒 }
// 选择题 2–6 个选项, 对的不止一个就是多选题 (全选对才算对); 判断题 correct 是 [0] (对) 或 [1] (错)。

export const QUIZ_TIMES = [5, 10, 20, 30, 60, 90, 120];
export const DEFAULT_TIME = 20;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const TF_OPTIONS = ['对', '错'];
export const MAX_RUNS = 20; // 记最近几次的成绩
// 选项的形状 (颜色在 css 里 .opt-c0 – .opt-c5), 分不清颜色也认得出
export const SHAPES = ['▲', '◆', '●', '■', '⬟', '★'];

export function newQuestion(type = 'choice', time = DEFAULT_TIME) {
  // 选择题一开始不标对的, 免得自己勾了两个、加上默认那个变成三个都对
  return type === 'tf' ? { type: 'tf', options: [], correct: [0], time } : { type: 'choice', options: ['', '', '', ''], correct: [], time };
}

// 存着的、同步来的、分享来的题目: 补齐、去掉坏的; 完全不像题目返回 null
export function cleanQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const time = QUIZ_TIMES.includes(Number(raw.time)) ? Number(raw.time) : DEFAULT_TIME;
  if (raw.type === 'tf') return { type: 'tf', options: [], correct: [Number(raw.correct?.[0]) === 1 ? 1 : 0], time };
  if (raw.type !== 'choice' || !Array.isArray(raw.options)) return null;
  const options = raw.options.slice(0, MAX_OPTIONS).map((o) => String(o ?? ''));
  const correct = [...new Set((Array.isArray(raw.correct) ? raw.correct : []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < options.length).sort((a, b) => a - b);
  return { type: 'choice', options, correct, time };
}

export const optionsOf = (q) => (q.type === 'tf' ? TF_OPTIONS : q.options);
export const isMulti = (q) => q.type === 'choice' && q.correct.length > 1;

// 对的答案写成一行 (题目集的列表、搜索用)
export function answerText(q) {
  return q.correct.map((i) => optionsOf(q)[i]).filter(Boolean).join('; ');
}

// 这道题写完整了没有: 好了返回 '', 不然返回差什么
export function questionProblem(card) {
  const q = card.q;
  if (!card.term.trim() && !card.image) return '题目还没写';
  if (!q) return '不是题目';
  if (q.type === 'tf') return '';
  const filled = q.options.filter((o) => o.trim()).length;
  if (filled < MIN_OPTIONS) return `至少写 ${MIN_OPTIONS} 个选项`;
  if (!q.correct.length) return '选一个对的答案';
  if (q.correct.some((i) => !q.options[i]?.trim())) return '对的那个选项是空的';
  return '';
}

// 保存前整理: 空的选项去掉 (对的序号跟着挪), 写好对的答案那一行
export function tidyQuestion(card) {
  const q = cleanQuestion(card.q) ?? newQuestion();
  if (q.type === 'choice') {
    const keep = q.options.map((o, i) => [o.trim(), i]).filter(([o]) => o);
    q.correct = keep.map(([, i], j) => (q.correct.includes(i) ? j : -1)).filter((j) => j >= 0);
    q.options = keep.map(([o]) => o);
  }
  return { ...card, term: card.term.trim(), q, def: answerText(q) };
}

// 答对没有: picked 是选的序号 (多选题要一个不多一个不少)
export function checkAnswer(q, picked) {
  const a = [...new Set(picked)].sort((x, y) => x - y);
  return a.length === q.correct.length && a.every((v, i) => v === q.correct[i]);
}

// 得分 (照 Kahoot): 答对最多 1000 分, 用的时间越多越少, 时间用完那一刻还有 500;
// 连对加分: 连对第 2 题起每题多 100, 最多多 500。不限时练习只看对几题, 每题 1000
export function questionPoints({ correct, ms = 0, time = DEFAULT_TIME, streak = 1, timed = true }) {
  if (!correct) return 0;
  const used = Math.min(1, Math.max(0, ms / (time * 1000)));
  const base = timed ? Math.round(1000 * (1 - used / 2)) : 1000;
  return base + Math.min(Math.max(streak - 1, 0), 5) * 100;
}

// ---- 成绩 ----
// 一次: { at: 时间, score, correct, total, timed }
export function cleanRuns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && Number(r.at) > 0 && Number(r.total) > 0)
    .map((r) => ({ at: Number(r.at), score: Math.max(0, Math.round(Number(r.score) || 0)), correct: Math.max(0, Math.round(Number(r.correct) || 0)), total: Math.round(Number(r.total)), timed: r.timed !== false }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_RUNS);
}

// 两台设备的成绩合起来 (同一次只留一份)
export function mergeRuns(a = [], b = []) {
  const byAt = new Map([...a, ...b].map((r) => [r.at, r]));
  return cleanRuns([...byAt.values()]);
}

// 排行榜: 限时的按分数, 一样多的按对几题、再按先后
export function topRuns(runs, n = 5) {
  return [...(runs ?? [])].filter((r) => r.timed).sort((a, b) => b.score - a.score || b.correct - a.correct || a.at - b.at).slice(0, n);
}
