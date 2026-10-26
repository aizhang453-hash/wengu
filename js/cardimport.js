// 拍照让 AI 做卡片: 单词表、课本、笔记的照片和 aiCardPrompt() 这段话一起发给 AI (Claude、ChatGPT……),
// AI 回一段 JSON (或者一个 .json 文件), 粘贴到编辑页的「导入」里就认成卡片, 不用一张一张打。
// AI 没照格式、画成表格 (| 单词 | 意思 |) 的也认; 字段名换了说法 (word / meaning / 单词 / 意思) 也认。
// 不像 AI 写的 (Quizlet 导出的文字、Excel 复制来的) 返回 null, 照原来的分隔方式拆 (parse.js)。

import { findJson, picker, clean } from './aitext.js';

export const FORMAT = 'wengu-cards';

// 给 AI 看的格式 (照着写)
const EXAMPLE = {
  wengu: FORMAT,
  title: 'Unit 3 单词',
  cards: [
    { term: 'abundant', def: '(adj.) 大量的; 丰富的' },
    { term: 'be aware of', def: '意识到; 知道\nAre you aware of the risk?' },
  ],
};

// 复制给 AI 的话
export function aiCardPrompt() {
  return `请把照片里要背的东西做成单词卡, 照下面的格式写成 JSON, 我要导入卡片集。

要求:
- 每个词 (或者每个要背的知识点) 一张卡片, 顺序跟照片上一样, 不要漏
- term: 正面, 要背的词或短语。照着照片抄, 不要加编号、音标
- def: 背面, 解释:
  - 照片上有解释的照着抄, 不要翻译、不要改写
  - 只有词没有解释的, 你写一个简短的意思 (默认写中文; 我说了要英文解释就写英文)
  - 词性写在最前面的括号里, 比如 "(adj.) 大量的; 丰富的"; 几个意思用分号隔开
  - 照片上有例句的, 换一行写在后面
- 不是单词的 (课本、笔记上的知识点): term 写问题或者名词, def 写答案, 都写短一点
- title: 给这组卡片起个短名字 (比如课本第几单元)
- 数学、化学不要用 LaTeX, 写成普通的字: 3/4、x^2、√2、π、H2O
- 要加粗的用 ** 包起来 (**像这样**)

只回一个 \`\`\`json 代码块 (或者做成一个 .json 文件), 照这个格式:

\`\`\`json
${JSON.stringify(EXAMPLE, null, 2)}
\`\`\`

照片在下面 (只要哪些、解释用什么语言, 我写在这里):
`;
}

// 字段名的各种说法
const TERM = ['term', 'word', 'front', 'vocab', 'phrase', 'question', 'q', '词', '单词', '词语', '短语', '正面', '问题'];
const DEF = ['def', 'definition', 'meaning', 'meanings', 'translation', 'back', 'answer', 'a', 'explanation', '解释', '意思', '释义', '中文', '翻译', '背面', '答案'];
const POS = ['pos', 'partOfSpeech', '词性'];
const EXAMPLE_KEYS = ['example', 'examples', 'sentence', '例句'];
const LIST = ['cards', 'flashcards', 'words', 'vocabulary', 'terms', 'items', 'list', '卡片', '单词表'];
const TITLE = ['title', 'name', 'deck', 'set', '标题', '名字', '卡片集'];
const META = ['wengu', 'app', 'version', 'description', 'desc', 'lang', 'language', '说明', '语言', ...TITLE];

// 词性、例句接到解释上: (adj.) 大量的 \n 例句
function joinDef(def, pos, example) {
  let out = def;
  if (pos && !out.startsWith('(') && !out.startsWith('（')) out = out ? `(${pos.replace(/^[(（]|[)）]$/g, '')}) ${out}` : pos;
  if (example) out = out ? `${out}\n${example}` : example;
  return out;
}

function toCard(raw) {
  // ["apple", "苹果"]
  if (Array.isArray(raw)) {
    if (raw.length < 1 || raw.length > 3 || raw.some((x) => x && typeof x === 'object')) return null;
    const [term, def, example] = raw.map(clean);
    return term || def ? { term, def: joinDef(def, '', example) } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const pick = picker(raw);
  const term = clean(pick(...TERM));
  const def = joinDef(clean(pick(...DEF)), clean(pick(...POS)), clean(pick(...EXAMPLE_KEYS)));
  return term || def ? { term, def } : null;
}

// 一段 JSON 里的卡片和标题
function cardsIn(v, out) {
  if (Array.isArray(v)) {
    for (const x of v) {
      if (x && typeof x === 'object' && !Array.isArray(x) && Array.isArray(picker(x)(...LIST))) cardsIn(x, out);
      else {
        const card = toCard(x);
        if (card) out.cards.push(card);
      }
    }
    return;
  }
  if (!v || typeof v !== 'object') return;
  const pick = picker(v);
  out.title ||= typeof pick(...TITLE) === 'string' ? clean(pick(...TITLE)) : '';
  const list = pick(...LIST);
  if (Array.isArray(list)) return cardsIn(list, out);
  // 一张卡片
  if (pick(...TERM) !== undefined || pick(...DEF) !== undefined) {
    const card = toCard(v);
    if (card) out.cards.push(card);
    return;
  }
  // { "apple": "苹果", "banana": "香蕉" }
  const entries = Object.entries(v).filter(([k]) => !META.includes(k.toLowerCase()));
  if (entries.length && entries.every(([, d]) => typeof d === 'string')) for (const [term, d] of entries) out.cards.push({ term: clean(term), def: clean(d) });
}

// ---- Markdown 的表格: | 单词 | 意思 | ----
const COLUMN = {
  term: /^(词|单词|词语|短语|生词|英文|english|word|words|term|vocab|vocabulary|phrase|正面|问题|question|front)$/i,
  def: /^(解释|意思|释义|词义|中文|中文意思|翻译|meaning|meanings|definition|translation|chinese|背面|答案|answer|back)$/i,
  pos: /^(词性|pos|part of speech)$/i,
  example: /^(例句|example|examples|sentence)$/i,
  skip: /^(#|no\.?|序号|编号|音标|phonetic|pronunciation|ipa)$/i,
};

function tableCards(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  const sep = lines.findIndex((l) => /^[|\s:-]+$/.test(l) && l.includes('-'));
  if (sep < 1) return [];
  // 整格都加粗的 (AI 爱把词那一列加粗) 不要加粗
  const cells = (line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => clean(c.replace(/<br\s*\/?>/gi, '\n')).replace(/^\*\*([^*]+)\*\*$/, '$1'));
  const head = cells(lines[sep - 1]);
  const find = (re) => head.findIndex((c) => re.test(c));
  // 第一行不是列名 (一个都认不得): 也是卡片
  const named = head.some((c) => Object.values(COLUMN).some((re) => re.test(c)));
  // 列名认得的按列名; 认不得的: 去掉编号、音标那几列, 第一列是词, 第二列是解释
  const rest = head.map((_, i) => i).filter((i) => !COLUMN.skip.test(head[i]) && !COLUMN.pos.test(head[i]) && !COLUMN.example.test(head[i]));
  let term = find(COLUMN.term);
  let def = find(COLUMN.def);
  if (term < 0) term = rest.find((i) => i !== def) ?? -1;
  if (def < 0) def = rest.find((i) => i !== term) ?? -1;
  if (term < 0) return [];
  const pos = find(COLUMN.pos);
  const example = find(COLUMN.example);
  return lines
    .slice(named ? sep + 1 : sep - 1)
    .filter((_, i) => named || i !== 1)
    .map(cells)
    .map((row) => ({ term: row[term] ?? '', def: joinDef(row[def] ?? '', row[pos] ?? '', row[example] ?? '') }))
    .filter((c) => c.term || c.def);
}

const isExample = (r) => r.title === EXAMPLE.title && r.cards.length === EXAMPLE.cards.length && r.cards.every((c, i) => c.term === EXAMPLE.cards[i].term);

// 返回 null: 不像 AI 写的, 照原来的分隔方式拆; { title, cards: [{ term, def }] }: 认出来了;
// { error }: 像 AI 写的, 但是读不出来 (error 写着怎么办)
export function parseCardImport(text) {
  const t = String(text ?? '');
  if (!t.trim()) return null;
  const values = findJson(t);
  const objects = values.filter((v) => v && typeof v === 'object' && !Array.isArray(v));
  if (objects.some((v) => v.app === 'wengu' || Array.isArray(v.sets))) return { error: '这是温故的备份文件。恢复备份在首页最下面的「导入备份」。' };
  if (objects.some((v) => v.wengu === 'wengu-mistakes' || Array.isArray(v.mistakes))) return { error: '这是错题, 要放进错题集: 错题集页上的「📷 拍照让 AI 记」。' };
  const out = { title: '', cards: [] };
  for (const v of values) cardsIn(v, out);
  if (!out.cards.length) out.cards = tableCards(t);
  if (out.cards.length) return isExample(out) ? { error: '粘贴的是给 AI 的那段话。要粘贴的是 AI 回你的。' } : out;
  // 看着像 JSON 又读不出来: 别照分隔方式拆成一堆怪卡片
  if (/```/.test(t) || /^\s*[{[]\s*["{[]/.test(t) || /"(cards|term|def|word)"\s*:/.test(t)) {
    return { error: values.length ? '里面没有卡片。' : 'AI 写的格式有点问题, 读不出来。让它「只回一个 JSON 代码块」再来一次, 把整个代码块复制过来。' };
  }
  return null;
}
