// 拍照让 AI 记错题: 题目的照片和 aiPrompt() 这段话一起发给 AI (Claude、ChatGPT……), AI 回一段 JSON
// (或者一个 .json 文件), 粘贴 / 拖进来就认成错题, 不用一个字一个字打。
// AI 写得不太规矩的也尽量认: 前后有别的话、```json 包着、一道题一段; 选项前面带「A.」; 答案写字母、写选项的字、写「选 B」;
// 字段名写成中文; 数学写成 LaTeX (\frac{3}{4}、$x^2$) —— 换成普通的字 (3/4、x^2)。

import { newMistake, tidyMistake, mistakeProblem, parseNumber, LETTERS, MAX_OPTIONS, KINDS } from './mistakes.js';
import { stripMarks } from './rich.js';
import { newId } from './store.js';
import { findJson, picker, clean } from './aitext.js';

export const FORMAT = 'wengu-mistakes';
export const MAX_IMPORT = 100; // 一次最多认这么多道

export class ImportError extends Error {}

// 给 AI 看的格式 (照着写), 两道: 一道选择题、一道填空题
const EXAMPLE = {
  wengu: FORMAT,
  mistakes: [
    { type: 'choice', passage: '题目前面的文章 / 材料 (没有就空着)', question: '题目', options: ['选项 A 的字', '选项 B 的字', '选项 C 的字', '选项 D 的字'], answer: 'B', mine: 'C', note: '为什么错 / 解析', kind: '词汇题' },
    { type: 'input', passage: '', question: '填空题的题目', options: [], answer: '3/4', mine: '0.5', note: '为什么错 / 解析', kind: '代数' },
  ],
};
const EXAMPLE_QUESTIONS = new Set(EXAMPLE.mistakes.map((m) => m.question));

// 复制给 AI 的话
export function aiPrompt() {
  const kinds = Object.entries(KINDS)
    .map(([exam, list]) => `  ${exam}: ${list.join('、')}`)
    .join('\n');
  return `请把照片里我做错的题抄成下面格式的 JSON, 我要导入错题集。

要求:
- 照着照片一字不差地抄, 英文题就写英文, 不要翻译; 文章 / 材料整段抄完, 不要省略
- 一张照片里有好几道题的, 每道都写进 mistakes 里
- type: 选择题写 "choice", 填空题 (自己写答案的) 写 "input"
- passage: 题目前面的文章、材料、表格 (表格写成文字); 没有就写 ""
- question: 题目
- options: 选项的字, 前面不要带 A. B.; 填空题写 []
- answer: 对的答案。选择题写字母 (比如 "B"); 填空题写答案 (比如 "3/4", 几个都对的用逗号隔开)。
  照片上看得出来就照着写; 看不出来、我也没说的, 你自己做一遍, 并且在 note 开头写「⚠ 答案是 AI 做的, 核对一下」
- mine: 我当时选的字母 (填空题写我当时写的); 照片上没标、我也没说就写 ""
- note: 用中文简短讲讲 (两三句): 对的为什么对, 我选的错在哪, 下次怎么避开
- kind: 题型。SAT 的从这些里挑一个:
${kinds}
  别的考试写个短的 (20 个字以内); 拿不准就写 ""
- 下划线的字用 __ 包起来 (__像这样__), 加粗的用 ** 包起来; 填空的空写成 ______
- 数学不要用 LaTeX, 写成普通的字: 3/4、x^2、√(x+1)、π、≤、≥、°
- 题目里有图 (函数图像、几何图) 的, 在 question 最后写「(见图)」, 照片我自己放

只回一个 \`\`\`json 代码块 (或者做成一个 .json 文件), 照这个格式:

\`\`\`json
${JSON.stringify(EXAMPLE, null, 2)}
\`\`\`

题目的照片在下面 (照片上看不出我选的、对的答案的话, 我写在这里):
`;
}

// ---- 一道一道换成错题 ----
// 选项前面的「A.」「(A)」「A)」「A：」
const prefixOf = (letter) => new RegExp(`^(?:[(（]\\s*${letter}\\s*[)）]|${letter}\\s*[.．:：、)）])\\s*`, 'i');

function optionList(v) {
  let list;
  if (Array.isArray(v)) list = v;
  else if (v && typeof v === 'object') {
    // { A: '…', B: '…' }
    const entries = Object.entries(v);
    const letterKeys = entries.every(([k]) => /^[A-F]$/i.test(k.trim()));
    list = (letterKeys ? entries.sort(([a], [b]) => a.trim().toUpperCase().localeCompare(b.trim().toUpperCase())) : entries).map(([, t]) => t);
  } else if (typeof v === 'string' && v.trim()) list = v.split('\n').filter((line) => line.trim());
  else return [];
  list = list.slice(0, MAX_OPTIONS).map((o) => (o && typeof o === 'object' ? clean(o.text ?? o.content ?? o.value ?? o.option ?? '') : clean(o)));
  // 每个选项前面都带着自己的字母 (A. B. C.……): 去掉
  if (list.some(Boolean) && list.every((o, i) => !o || prefixOf(LETTERS[i]).test(o))) list = list.map((o, i) => o.replace(prefixOf(LETTERS[i]), ''));
  return list;
}

const norm = (s) => stripMarks(String(s ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();

// 选的哪个: 「B」「(B)」「选 B」「B. 选项的字」, 或者直接写选项的字、数字。
// 写的是第几个 (选项不是数字时): 从 1 数 (2 是 B); 字段名带 index 的 (answerIndex) 和 0 从 0 数
export function choiceIndex(v, options, zeroBased = false) {
  if (v === undefined || v === null || v === '') return -1;
  const nth = (n) => {
    const i = zeroBased || n === 0 ? n : n - 1;
    return Number.isInteger(i) && i >= 0 && i < options.length ? i : -1;
  };
  if (typeof v === 'number') return zeroBased || !options.some((o) => parseNumber(o) !== null) ? nth(v) : options.findIndex((o) => parseNumber(o) === v);
  if (Array.isArray(v)) return choiceIndex(v[0], options, zeroBased);
  if (typeof v === 'object') return choiceIndex(v.letter ?? v.label ?? v.text ?? v.value, options, zeroBased);
  const s = clean(v);
  if (!s) return -1;
  const byLetter = (ch) => {
    const i = LETTERS.indexOf(ch.toUpperCase());
    return i < options.length ? i : -1;
  };
  const same = options.findIndex((o) => o && norm(o) === norm(s));
  if (same >= 0) return same;
  const only = s.match(/^(?:选项|选|正确答案是?|答案是?|choice|option|answer(?:\s+is)?)?\s*[(（]?\s*([A-F])\s*[)）.．:：、]?\s*(?:选项|项)?$/i);
  if (only) return byLetter(only[1]);
  const lead = s.match(/^[(（]?([A-F])\s*[)）.．:：、]\s*\S/i);
  if (lead) return byLetter(lead[1]);
  const n = parseNumber(s);
  if (n === null) return -1;
  return options.some((o) => parseNumber(o) !== null) ? options.findIndex((o) => parseNumber(o) === n) : nth(n);
}

const answerText = (v) => (typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(answerText).filter(Boolean).join(', ') : clean(v));

// SAT 题型的英文名 (College Board 的叫法) → 我们的叫法
const KIND_NAMES = [
  [/words? in context|vocab/, '词汇题'],
  [/form,? structure,? and sense/, '语法·词形'],
  [/text structure|purpose/, '目的和结构'],
  [/cross[- ]text/, '双篇对比'],
  [/central ideas?|main idea/, '主旨细节'],
  [/quantitative|graph|table|chart/, '图表证据'],
  [/command of evidence|textual evidence|evidence/, '文本证据'],
  [/inference/, '推理题'],
  [/boundar|punctuation/, '语法·标点'],
  [/grammar|standard english|conventions/, '语法·词形'],
  [/transition/, '过渡词'],
  [/rhetorical synthesis|notes/, '笔记整合'],
  [/advanced math/, '高级数学'],
  [/problem[- ]solving|data analysis|statistics|probability/, '数据分析'],
  [/geometry|trigonometry/, '几何三角'],
  [/algebra|linear/, '代数'],
];
const ALL_KINDS = Object.values(KINDS).flat();

export function kindName(text) {
  const s = clean(text);
  if (!s) return '';
  if (ALL_KINDS.includes(s)) return s;
  if (!/\p{Script=Han}/u.test(s)) return KIND_NAMES.find(([re]) => re.test(s.toLowerCase()))?.[1] ?? s;
  // 「词汇」→「词汇题」: 只像一个的才换
  const near = ALL_KINDS.filter((k) => k.includes(s) || s.includes(k));
  return near.length === 1 ? near[0] : s;
}

const INPUT_TYPE = /input|fill|blank|填空|grid|spr|free|short|open|produced|numeric|written|简答|计算/i;
const CHOICE_TYPE = /choice|select|选择|单选|^mcq?$|multiple/i;

function toMistake(raw, id) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const pick = picker(raw);
  const options = optionList(pick('options', '选项', 'choices', 'answerChoices'));
  const typeText = clean(pick('type', '类型', 'format', 'questionType'));
  const m = newMistake(id);
  m.type = INPUT_TYPE.test(typeText) ? 'input' : CHOICE_TYPE.test(typeText) ? 'choice' : options.some(Boolean) ? 'choice' : 'input';
  m.passage = clean(pick('passage', '文章', '材料', '文章材料', 'context', 'stimulus', 'text', 'reading'));
  m.question = clean(pick('question', '题目', '问题', 'stem', 'prompt', 'q'));
  m.note = clean(pick('note', 'notes', '解析', '为什么错', '笔记', '讲解', 'explanation', 'why', 'reason', 'analysis', 'solution'));
  // type 里写的是题型 (比如 "Words in Context") 也认
  m.kind = kindName(pick('kind', '题型', 'category', 'skill', 'topic', 'domain') ?? (INPUT_TYPE.test(typeText) || CHOICE_TYPE.test(typeText) ? '' : typeText));
  const answer = pick('answer', 'correct', '答案', '正确答案', '对的', '对的答案', 'correctAnswer', 'right', 'key', 'answerKey');
  const mine = pick('mine', '我选的', '我的答案', '我写的', '当时选的', '我当时选的', 'myAnswer', 'chosen', 'selected', 'picked', 'userAnswer', 'yourAnswer', 'wrongAnswer', 'wrong');
  if (m.type === 'choice') {
    m.options = options.length ? options : ['', '', '', ''];
    const answerIndex = pick('answerIndex', 'correctIndex');
    const mineIndex = pick('mineIndex', 'myAnswerIndex', 'chosenIndex', 'selectedIndex');
    m.correct = answerIndex !== undefined ? choiceIndex(answerIndex, m.options, true) : choiceIndex(answer, m.options);
    m.mine = mineIndex !== undefined ? choiceIndex(mineIndex, m.options, true) : choiceIndex(mine, m.options);
    if (m.mine === m.correct) m.mine = -1;
  } else {
    m.answer = answerText(answer);
    m.mineText = answerText(mine);
  }
  if (!m.question && !m.passage && !m.options.some(Boolean)) return null;
  return tidyMistake(m);
}

// 一段 JSON 里的每道题
function questionsIn(v) {
  if (Array.isArray(v)) return v.flatMap((x) => (x && typeof x === 'object' && !Array.isArray(x) && listIn(x) ? questionsIn(x) : [x]));
  if (!v || typeof v !== 'object') return [];
  return listIn(v) ? questionsIn(listIn(v)) : [v];
}

function listIn(v) {
  const pick = picker(v);
  const list = pick('mistakes', '错题', 'questions', 'items', 'problems', '题目');
  return Array.isArray(list) ? list : null;
}

// text: AI 回的整段 (或者文件里的字)。返回 [{ mistake, problem }]:
//   mistake 是新的错题 (id 用 makeId 起), problem 是还差什么 (mistakeProblem; '' 是写完整了)
// 一道都认不出来时抛 ImportError, message 写着怎么办
export function parseMistakeImport(text, makeId = newId) {
  if (!String(text ?? '').trim()) throw new ImportError('还没有粘贴东西');
  const values = findJson(text);
  if (!values.length) {
    throw new ImportError(/[{[]/.test(text) ? 'AI 写的格式有点问题, 读不出来。让它「只回一个 JSON 代码块」再来一次, 把整个代码块复制过来。' : '没找到 AI 写的题目 (要有 { 和 } 的那一段)。把 AI 回的整段都复制过来。');
  }
  if (values.some((v) => v && typeof v === 'object' && !Array.isArray(v) && (v.app === 'wengu' || Array.isArray(v.sets)))) {
    throw new ImportError('这是温故的备份文件。恢复备份在首页最下面的「导入备份」。');
  }
  if (values.some((v) => v && typeof v === 'object' && v.wengu === 'wengu-cards')) {
    throw new ImportError('这是单词卡, 要放进卡片集: 新建卡片集 (或者编辑), 在「导入」里粘贴。');
  }
  const raws = values.flatMap(questionsIn);
  const items = raws
    .map((raw) => toMistake(raw, makeId()))
    .filter((m) => m && !EXAMPLE_QUESTIONS.has(m.question));
  if (!items.length) {
    throw new ImportError(raws.some((r) => r && typeof r === 'object' && EXAMPLE_QUESTIONS.has(r.question)) ? '粘贴的是给 AI 的那段话。要粘贴的是 AI 回你的。' : '里面没有题目。');
  }
  return items.slice(0, MAX_IMPORT).map((mistake) => ({ mistake, problem: mistakeProblem(mistake) }));
}

// 错题集里是不是已经有这道了 (同样的题目和选项): 返回那道, 没有返回 null
export function findSame(m, list) {
  const key = (x) => [x.passage, x.question, ...(x.type === 'choice' ? x.options : [x.answer])].map(norm).join('\n');
  if (!m.question.trim() && !m.passage.trim()) return null;
  const k = key(m);
  return list.find((x) => key(x) === k) ?? null;
}
