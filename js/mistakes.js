// 错题集: 做错的题 (比如 SAT) 打字记下来, 以后重做。每道错题:
//   { id, type: 'choice' | 'input',
//     passage   文章 / 材料 (可以没有)      question  题目
//     options   选项 (选择题, A B C D……)    correct   对的是第几个 (-1 是还没选)
//     mine      当时选错的是第几个 (-1 是没记)
//     answer    填空题对的答案 (几个都对的用逗号隔开; 数字 3/4 和 0.75 算一样)    mineText  当时写的
//     note      为什么错 / 解析
//     kind      题型 (自己写的; 空着的按题目猜, 见 guessKind)
//     review    { right, wrong, streak (连对几次), interval, s, d, due, at, mastered }  重做的记录, 用 FSRS 排 (srs.js)
//     images    图片 (media.js 的 id): 题目截图、函数图像、几何图……
//     createdAt, updatedAt (改了题目) }
// 重做连对 3 次算掌握, 不再排进复习。

import { schedule, daysLater } from './srs.js';
import { grade } from './grade.js';

export const LETTERS = 'ABCDEF';
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MASTER_STREAK = 3;
export const PREFIX = 'mistake:'; // 删除记录里的 id 前缀 (同步时用)
export const MAX_IMAGES = 6;
export const MAX_KIND = 20;

const str = (v) => (typeof v === 'string' ? v : '');
const index = (v, n) => (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < n ? Number(v) : -1);

export function newMistake(id, now = Date.now()) {
  return { id, type: 'choice', passage: '', question: '', images: [], options: ['', '', '', ''], correct: -1, mine: -1, answer: '', mineText: '', note: '', kind: '', review: null, createdAt: now, updatedAt: now };
}

function cleanReview(r) {
  if (!r || typeof r !== 'object' || !(Number(r.due) > 0)) return null;
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  const out = { right: n(r.right), wrong: n(r.wrong), streak: n(r.streak), interval: Math.max(0, Number(r.interval) || 0), due: Number(r.due), at: Number(r.at) || 0, mastered: Boolean(r.mastered) };
  if (Number(r.s) > 0 && Number(r.d) >= 1) Object.assign(out, { s: Number(r.s), d: Math.min(10, Number(r.d)) });
  return out;
}

// 存着的、同步来的、备份里的: 补齐、去掉坏的; 不像错题返回 null
export function cleanMistake(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const now = Date.now();
  const options = (Array.isArray(raw.options) ? raw.options : []).slice(0, MAX_OPTIONS).map((o) => (o == null || typeof o === 'object' ? '' : String(o)));
  return {
    id: raw.id,
    type: raw.type === 'input' ? 'input' : 'choice',
    passage: str(raw.passage),
    question: str(raw.question),
    images: [...new Set((Array.isArray(raw.images) ? raw.images : []).filter((x) => typeof x === 'string' && /^m_[\w-]+$/.test(x)))].slice(0, MAX_IMAGES),
    options,
    correct: index(raw.correct, options.length),
    mine: index(raw.mine, options.length),
    answer: str(raw.answer),
    mineText: str(raw.mineText),
    note: str(raw.note),
    kind: str(raw.kind).trim().slice(0, MAX_KIND),
    review: cleanReview(raw.review),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
}

// 写完整了没有: 好了返回 '', 不然说差什么
export function mistakeProblem(m) {
  if (!m.question.trim() && !m.images.length) return '题目还没写 (或者放一张题目的图片)';
  if (m.type === 'input') return m.answer.trim() ? '' : '写上对的答案';
  const last = m.options.findLastIndex((o) => o.trim());
  if (last + 1 < MIN_OPTIONS) return `至少写 ${MIN_OPTIONS} 个选项`;
  const empty = m.options.slice(0, last + 1).findIndex((o) => !o.trim());
  if (empty >= 0) return `选项 ${LETTERS[empty]} 是空的`;
  if (m.correct < 0 || m.correct > last) return '点一下哪个是对的';
  return '';
}

// 保存前: 字的前后空白去掉, 最后面空着的选项不要 (中间的不动, 免得字母对不上)
export function tidyMistake(m) {
  const out = { ...m, passage: m.passage.trim(), question: m.question.trim(), answer: m.answer.trim(), mineText: m.mineText.trim(), note: m.note.trim(), kind: String(m.kind ?? '').trim().slice(0, MAX_KIND) };
  if (m.type === 'choice') {
    const options = m.options.map((o) => o.trim());
    while (options.length > MIN_OPTIONS && !options.at(-1)) options.pop();
    out.options = options;
    if (out.mine >= options.length) out.mine = -1;
  } else {
    out.options = [];
    out.correct = -1;
    out.mine = -1;
  }
  return out;
}

// ---- 判对错 ----
// 数字: 3/4、.75、0.75、-2、1.5e3 都认; 不是数字返回 null
export function parseNumber(text) {
  const t = String(text ?? '').trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (!t) return null;
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : null;
  }
  return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(t) ? Number(t) : null;
}

// 对的答案可以写好几个, 用逗号、分号或者「或」隔开
export function answerChoices(text) {
  return String(text ?? '')
    .split(/[,，;；或]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 填空题: 是数字的按数字比 (3/4 = 0.75, 差一点点四舍五入的也算), 不是数字的按打字题判 (大小写、标点不算错)
export function checkInput(given, answer) {
  const g = String(given ?? '').trim();
  if (!g) return false;
  const n = parseNumber(g);
  return answerChoices(answer).some((a) => {
    const want = parseNumber(a);
    if (want !== null) return n !== null && Math.abs(n - want) <= Math.max(1e-9, Math.abs(want) * 1e-4);
    return grade(g, a).correct;
  });
}

// given: 选择题是选项序号, 填空题是写的字
export function checkMistake(m, given) {
  return m.type === 'input' ? checkInput(given, m.answer) : given === m.correct;
}

export const answerLabel = (m) => (m.type === 'input' ? m.answer : m.correct >= 0 ? `${LETTERS[m.correct]}. ${m.options[m.correct]}` : '');
export const mineLabel = (m) => (m.type === 'input' ? m.mineText : m.mine >= 0 ? `${LETTERS[m.mine]}. ${m.options[m.mine]}` : '');

// ---- 复习 ----
// 刚记下的错题: 明天开始重做 (今天想做也可以「全部重做」)
export function firstReview(now = Date.now()) {
  return { right: 0, wrong: 0, streak: 0, interval: 0, due: daysLater(now, 1), at: 0, mastered: false };
}

// 重做了一次: 排下次哪天; 连对 3 次算掌握。答错了, 掌握了的也重新排回来
export function reviewAfter(review, correct, now = Date.now()) {
  const prev = review ?? firstReview(now);
  const streak = correct ? prev.streak + 1 : 0;
  return { ...prev, ...schedule(prev, correct, now, { own: false }), right: prev.right + (correct ? 1 : 0), wrong: prev.wrong + (correct ? 0 : 1), streak, at: now, mastered: streak >= MASTER_STREAK };
}

export function mistakeStatus(m, now = Date.now()) {
  if (m.review?.mastered) return 'mastered';
  return (m.review?.due ?? 0) <= now ? 'due' : 'later';
}

export function dueMistakes(list, now = Date.now()) {
  return list.filter((m) => mistakeStatus(m, now) === 'due').sort((a, b) => (a.review?.due ?? 0) - (b.review?.due ?? 0));
}

// 搜索: 文章、题目、选项、答案、笔记里有没有这些字 (空格隔开的都要有)
export function matchesSearch(m, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [m.passage, m.question, ...m.options, m.answer, m.note, kindOf(m)].join('\n').toLowerCase();
  return words.every((w) => text.includes(w));
}

// 同步: 两边各有的都留; 同一道题, 内容听最后改过的, 重做记录听最后做过的
export function mergeMistake(a, b) {
  const content = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  const review = (b.review?.at ?? 0) > (a.review?.at ?? 0) ? b.review : a.review ?? b.review;
  return { ...content, review, createdAt: Math.min(a.createdAt, b.createdAt), updatedAt: Math.max(a.updatedAt, b.updatedAt) };
}

// ---- 题型 ----
// 自己写的 (kind) 为准; 没写的按题目猜: SAT 阅读写作每类题的问法是固定的, 数学看关键词。猜不出来的算「其他」
export const KINDS = {
  'SAT 阅读写作': ['词汇题', '目的和结构', '双篇对比', '主旨细节', '文本证据', '图表证据', '推理题', '语法·标点', '语法·词形', '过渡词', '笔记整合'],
  'SAT 数学': ['代数', '高级数学', '数据分析', '几何三角'],
};
export const OTHER_KIND = '其他';

// 选项只差标点、空格 (同样的词): 考的是标点断句
function onlyPunctuation(options) {
  const words = options.filter((o) => o.trim()).map((o) => o.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
  return words.length >= 2 && words.every((w) => w && w === words[0]);
}

const RW_RULES = [
  [/most logical and precise word or phrase|most nearly mean/, '词汇题'],
  [/conventions? of standard english/, (m) => (onlyPunctuation(m.options) ? '语法·标点' : '语法·词形')],
  [/most logical transition/, '过渡词'],
  [/information from the notes|the student wants to/, '笔记整合'],
  [/text 1[\s\S]*text 2|based on the texts|author of text [12]/, '双篇对比'],
  [/main purpose|overall structure|function of the (underlined|portion|sentence|first|second|third|last)/, '目的和结构'],
  [/(data|information) (from|in) the (graph|table|chart|figure)|uses data from/, '图表证据'],
  [/quotation|most directly (support|weaken|undermine|challenge)|most strongly support|which finding/, '文本证据'],
  [/most logically completes the text/, '推理题'],
  [/main idea|according to the text|based on the text/, '主旨细节'],
];
const MATH_RULES = [
  [/triangle|circle|radius|diameter|angle|degrees?\b|\b(sin|cos|tan)\b|\barea\b|volume|perimeter|polygon|rectangle|\bcubes?\b|cylinder|\bcones?\b|sphere|\barcs?\b|chord|三角形|圆|角度|面积|体积|周长|几何/, '几何三角'],
  [/\bmean\b|\bmedian\b|standard deviation|probability|percent|%|\bratios?\b|proportion|survey|\bsample|scatterplot|margin of error|平均|概率|百分|比例|中位数|统计/, '数据分析'],
  [/quadratic|x\^2|x²|exponential|polynomial|parabola|vertex|f\(x\)|g\(x\)|\bfunction|二次|指数|函数/, '高级数学'],
  [/linear|slope|system of|equations?\b|inequalit|一次|方程|不等式|斜率|[a-z]\s*[=<>≤≥]\s*-?\d|\d\s*[a-z]\s*[+-]/, '代数'],
];

export function guessKind(m) {
  const text = `${m.question}\n${m.passage}`.toLowerCase();
  for (const [re, kind] of [...RW_RULES, ...MATH_RULES]) if (re.test(text)) return typeof kind === 'function' ? kind(m) : kind;
  return '';
}

export const kindOf = (m) => m.kind || guessKind(m) || OTHER_KIND;

// 每种题型几道: [{ kind, total, left 还没掌握, right, wrong 重做对了几次、错了几次 }], 多的在前
export function kindStats(list) {
  const map = new Map();
  for (const m of list) {
    const kind = kindOf(m);
    const x = map.get(kind) ?? { kind, total: 0, left: 0, right: 0, wrong: 0 };
    x.total++;
    if (!m.review?.mastered) x.left++;
    x.right += m.review?.right ?? 0;
    x.wrong += m.review?.wrong ?? 0;
    map.set(kind, x);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || b.left - a.left || a.kind.localeCompare(b.kind));
}
