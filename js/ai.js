// AI 功能 (选填): 用你自己的 Anthropic API 密钥, 浏览器直接连 Claude, 中间不经过别的服务器。
// 密钥只存在这个浏览器里 (localStorage 'wengu:ai'), 不会同步到 GitHub。
// 用 Anthropic 官方的 SDK (js/vendor/anthropic-sdk.js), 第一次用 AI 的时候才加载。
//   出卡片: 笔记、PDF、图片 → 卡片
//   判分: 打字题判错了, 让 AI 看看是不是同一个意思
//   讲解: 一张卡片的意思、例子、怎么记
//   练习题: 根据卡片集出理解、运用的选择题

export const AI_KEY = 'wengu:ai';
const API_OVERRIDE = 'wengu:ai-api'; // 只给测试用 (换成假的服务器)
export const MODEL = 'claude-opus-5-5';
// Claude 因为安全原因不回答时, 服务器按原因自动换一个合适的模型再答一次
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

export function loadAI(storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage?.getItem(AI_KEY) ?? 'null');
    return c && typeof c.apiKey === 'string' && c.apiKey ? c : null;
  } catch {
    return null;
  }
}

export function saveAI(config, storage = globalThis.localStorage) {
  try {
    if (config) storage?.setItem(AI_KEY, JSON.stringify(config));
    else storage?.removeItem(AI_KEY);
  } catch {
    // 存不了就算了
  }
}

export const aiReady = () => Boolean(loadAI());

function apiBase() {
  try {
    return globalThis.localStorage?.getItem(API_OVERRIDE) || undefined;
  } catch {
    return undefined;
  }
}

let sdkPromise = null;
const sdk = () => (sdkPromise ??= import('./vendor/anthropic-sdk.js'));

export class AIError extends Error {
  constructor(message, kind = 'other') {
    super(message);
    this.kind = kind;
  }
}

// SDK 的错误 → 看得懂的话 (按错误的种类, 从具体到笼统)
function friendly(e, A) {
  if (e instanceof AIError) return e;
  if (e instanceof A.APIUserAbortError) return new AIError('取消了', 'abort');
  if (e instanceof A.AuthenticationError) return new AIError('API 密钥不对, 或者已经删掉了 (401)', 'auth');
  if (e instanceof A.PermissionDeniedError) return new AIError('这个密钥没有权限 (403)', 'auth');
  if (e instanceof A.NotFoundError) return new AIError(`这个账户用不了 ${MODEL} (404)`, 'model');
  if (e instanceof A.RateLimitError) return new AIError('用得太快了, 或者到了用量上限, 等一会儿再试 (429)', 'rate');
  if (e instanceof A.BadRequestError) return new AIError(`请求有问题: ${e.error?.error?.message ?? e.message}`, 'bad');
  if (e instanceof A.InternalServerError) return new AIError(`Claude 那边太忙或者出错了 (${e.status}), 过一会儿再试`, 'server');
  if (e instanceof A.APIConnectionError) return new AIError('连不上 Claude, 看看网络', 'network');
  if (e instanceof A.APIError) return new AIError(`出错了 (${e.status ?? '?'}): ${e.error?.error?.message ?? e.message}`, 'other');
  return new AIError('出错了', 'other');
}

async function withClient(fn, config = loadAI()) {
  if (!config?.apiKey) throw new AIError('还没填 API 密钥', 'nokey');
  const mod = await sdk();
  const A = mod.Anthropic;
  const base = apiBase();
  const client = new A({ apiKey: config.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, ...(base ? { baseURL: base } : {}) });
  try {
    return await fn(client, mod);
  } catch (e) {
    throw friendly(e, A);
  }
}

// 先看 stop_reason 再读内容
function check(message) {
  if (message.stop_reason === 'refusal') throw new AIError('Claude 因为安全原因没有回答, 换个说法试试', 'refusal');
  if (message.stop_reason === 'max_tokens') throw new AIError('内容太多, 回答被截断了, 少一点再试', 'length');
}

// 试试密钥能不能用: 查一下模型的信息 (不生成内容, 不花钱)
export function testKey(apiKey) {
  return withClient((client) => client.models.retrieve(MODEL), { apiKey });
}

// ---- 出卡片 ----
const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: { term: { type: 'string' }, def: { type: 'string' } },
        required: ['term', 'def'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'cards'],
  additionalProperties: false,
};

const CARDS_SYSTEM = `你帮学生把学习材料做成复习用的单词卡, 一面是「词」(要记住的词、概念、人名、日期、问题), 一面是「解释」(意思、定义或答案)。
解释简洁准确, 一般一两句话。外语词汇的词用原文, 解释用材料里的语言, 材料没有解释时用中文。
只用材料里有的内容, 卡片之间不重复。title 是这组卡片的简短标题, 用材料的语言。`;

// files: [{ kind: 'pdf' | 'image', mediaType, data: base64, name }]
export function generateCards({ text = '', files = [], count = 0, extra = '', signal } = {}) {
  const ask = [
    text.trim() ? `学习材料:\n<material>\n${text.trim()}\n</material>` : '学习材料在上面的文件里。',
    `请把要记住的内容做成单词卡${count > 0 ? `, 大约 ${count} 张` : ''}。`,
    extra.trim() ? `我的要求: ${extra.trim()}` : '',
  ].filter(Boolean);
  const content = [
    ...files.map((f) =>
      f.kind === 'pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data }, title: f.name }
        : { type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.data } },
    ),
    { type: 'text', text: ask.join('\n\n') },
  ];
  return withClient(async (client, { jsonSchemaOutputFormat }) => {
    const message = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        ...FALLBACK,
        system: CARDS_SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: jsonSchemaOutputFormat(CARDS_SCHEMA) },
      },
      { signal },
    );
    check(message);
    const out = message.parsed_output;
    if (!out || !Array.isArray(out.cards)) throw new AIError('Claude 的回答看不懂, 再试一次');
    return {
      title: String(out.title ?? '').trim(),
      cards: out.cards.map((c) => ({ term: String(c.term ?? '').trim(), def: String(c.def ?? '').trim() })).filter((c) => c.term || c.def),
    };
  });
}

// ---- 判分 ----
const JUDGE_SCHEMA = {
  type: 'object',
  properties: { correct: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['correct', 'reason'],
  additionalProperties: false,
};

const JUDGE_SYSTEM = `你给背单词的学生判打字题。看学生写的和标准答案是不是同一个意思: 同义词、换个说法、顺序不同、小的拼写错误算对; 意思不同、说反了、漏了关键的意思算错。
reason 用中文, 一两句话, 说清楚为什么。`;

export function judgeAnswer({ prompt, answer, typed, signal }) {
  return withClient(async (client, { jsonSchemaOutputFormat }) => {
    const message = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 4000,
        ...FALLBACK,
        system: JUDGE_SYSTEM,
        messages: [{ role: 'user', content: `题目: ${prompt}\n标准答案: ${answer}\n学生写的: ${typed}` }],
        output_config: { effort: 'low', format: jsonSchemaOutputFormat(JUDGE_SCHEMA) },
      },
      { signal },
    );
    check(message);
    const out = message.parsed_output;
    if (!out || typeof out.correct !== 'boolean') throw new AIError('Claude 的回答看不懂, 再试一次');
    return { correct: out.correct, reason: String(out.reason ?? '').trim() };
  });
}

// ---- 讲解 (一边写一边显示) ----
const EXPLAIN_SYSTEM = `你是耐心的老师, 帮学生理解并记住一张单词卡。用中文, 200 字以内: 先说清楚意思, 再给一两个例子 (外语词给例句和翻译), 最后给一个好记的方法。
不要用标题、表格和代码块; 可以用 **加粗**, 列表每行用「- 」开头。`;

// onText(到现在为止的全部文字)
export function explainCard({ term, def, title = '', onText = () => {}, signal }) {
  return withClient(async (client) => {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 4000,
        ...FALLBACK,
        system: EXPLAIN_SYSTEM,
        messages: [{ role: 'user', content: `${title ? `卡片集: ${title}\n` : ''}词: ${term}\n解释: ${def}` }],
        output_config: { effort: 'low' },
      },
      { signal },
    );
    let text = '';
    for await (const event of stream) {
      // 前一个模型半路不答、换了模型重新答: 前面那半截不要了
      if (event.type === 'content_block_start' && event.content_block.type === 'fallback') text = '';
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        text += event.delta.text;
        onText(text);
      }
    }
    check(await stream.finalMessage());
    return text;
  });
}

// ---- 练习题 ----
const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['question', 'options', 'answer', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

const QUIZ_SYSTEM = `你根据学生的单词卡出选择题。考理解和运用, 不只是背: 比如用法、例句填空、辨析相近的词、举例判断、概念之间的关系。
每题 4 个选项, 只有一个对, 错的选项要像样、不能一眼看出来。answer 是正确选项的序号 (从 0 开始)。
题目和选项用卡片本身的语言; explanation 用中文, 一两句话说明为什么。`;

export const QUIZ_MAX_CARDS = 150;

export function practiceQuiz({ title, cards, count = 10, signal }) {
  const list = cards
    .slice(0, QUIZ_MAX_CARDS)
    .map((c) => `- ${c.term} → ${c.def}`)
    .join('\n');
  return withClient(async (client, { jsonSchemaOutputFormat }) => {
    const message = await client.beta.messages.parse(
      {
        model: MODEL,
        max_tokens: 16000,
        ...FALLBACK,
        system: QUIZ_SYSTEM,
        messages: [{ role: 'user', content: `卡片集「${title || '未命名'}」(词 → 解释):\n${list}\n\n出 ${count} 道题。` }],
        output_config: { effort: 'medium', format: jsonSchemaOutputFormat(QUIZ_SCHEMA) },
      },
      { signal },
    );
    check(message);
    const qs = (message.parsed_output?.questions ?? []).filter(
      (q) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length,
    );
    if (!qs.length) throw new AIError('没出成题, 再试一次');
    return qs.map((q) => ({ question: q.question.trim(), options: q.options.map((o) => String(o).trim()), answer: q.answer, explanation: String(q.explanation ?? '').trim() }));
  });
}

// 文件 → base64 (给 PDF、图片用)
export async function fileToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
