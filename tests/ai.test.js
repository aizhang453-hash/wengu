import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// localStorage (测试时把 API 换成下面的假服务器)
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

// 假的 Claude API: 记下收到的请求, 按 behavior 回答
const seen = [];
let behavior = {};
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = body ? JSON.parse(body) : null;
    seen.push({ method: req.method, url: req.url, headers: req.headers, body: json });
    const send = (status, obj, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(obj));
    };
    if (req.headers['x-api-key'] === 'bad') return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    if (behavior.status) return send(behavior.status, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { 'retry-after-ms': '1' });
    if (req.url.startsWith('/v1/models/')) return send(200, { id: 'claude-opus-5-5', type: 'model', display_name: 'Claude Opus 5.5' });
    const message = (content, stop = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: json.model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 20 } });
    if (json.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: message([], null) });
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      for (const piece of ['**apple** ', '是苹果', '。']) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: piece } });
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } });
      ev('message_stop', {});
      return res.end();
    }
    if (behavior.refusal) return send(200, message([], 'refusal'));
    return send(200, message([{ type: 'text', text: JSON.stringify(behavior.output) }]));
  });
});

let ai;
before(async () => {
  await new Promise((r) => server.listen(0, r));
  store.set('wengu:ai-api', `http://127.0.0.1:${server.address().port}`);
  ai = await import('../js/ai.js');
});
after(() => server.close());

test('密钥存在本机; 试密钥: 查模型 (带浏览器直连的头)', async () => {
  assert.equal(ai.aiReady(), false);
  ai.saveAI({ apiKey: 'sk-ant-test' });
  assert.equal(ai.aiReady(), true);
  seen.length = 0;
  await ai.testKey('sk-ant-test');
  const r = seen[0];
  assert.equal(r.url, '/v1/models/claude-opus-5-5');
  assert.equal(r.headers['x-api-key'], 'sk-ant-test');
  assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.ok(r.headers['anthropic-version']);
  await assert.rejects(ai.testKey('bad'), (e) => e instanceof ai.AIError && e.kind === 'auth' && /401/.test(e.message));
});

test('出卡片: 请求的样子 (模型、安全换模型、JSON 格式、PDF 和图片), 读回卡片', async () => {
  behavior = { output: { title: '光合作用', cards: [{ term: ' 叶绿体 ', def: '进行光合作用的地方' }, { term: '', def: '' }, { term: 'ATP', def: '能量货币' }] } };
  seen.length = 0;
  const out = await ai.generateCards({ text: '光合作用在叶绿体里进行……', count: 2, extra: '解释用英文', files: [{ kind: 'pdf', mediaType: 'application/pdf', data: 'JVBERi0=', name: 'notes.pdf' }, { kind: 'image', mediaType: 'image/png', data: 'iVBORw==' }] });
  assert.deepEqual(out, { title: '光合作用', cards: [{ term: '叶绿体', def: '进行光合作用的地方' }, { term: 'ATP', def: '能量货币' }] });
  const { body, headers, url } = seen[0];
  assert.equal(url, '/v1/messages?beta=true');
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(body.output_config.effort, 'medium');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.deepEqual(body.output_config.format.schema.required, ['title', 'cards']);
  assert.equal(body.thinking, undefined); // Opus 5.5 思考一直开着, 不用设
  const content = body.messages[0].content;
  assert.deepEqual(content[0], { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' }, title: 'notes.pdf' });
  assert.deepEqual(content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw==' } });
  assert.match(content[2].text, /大约 2 张/);
  assert.match(content[2].text, /解释用英文/);
});

test('判分、练习题: 读回结构化的结果; 不合格的题丢掉', async () => {
  behavior = { output: { correct: true, reason: '「快速地跑」和 run quickly 一个意思' } };
  seen.length = 0;
  assert.deepEqual(await ai.judgeAnswer({ prompt: 'sprint', answer: 'run quickly', typed: '快速地跑' }), { correct: true, reason: '「快速地跑」和 run quickly 一个意思' });
  assert.equal(seen[0].body.output_config.effort, 'low');
  assert.match(seen[0].body.messages[0].content, /学生写的: 快速地跑/);

  behavior = { output: { questions: [{ question: 'Which fits: I ___ to school.', options: ['run', 'runs', 'ran', 'running'], answer: 0, explanation: '主语是 I' }, { question: '坏的', options: ['a'], answer: 3, explanation: '' }] } };
  const qs = await ai.practiceQuiz({ title: '英语', cards: [{ term: 'run', def: '跑' }], count: 5 });
  assert.equal(qs.length, 1);
  assert.equal(qs[0].answer, 0);
});

test('讲解: 一边收一边显示', async () => {
  const parts = [];
  const text = await ai.explainCard({ term: 'apple', def: '苹果', onText: (t) => parts.push(t) });
  assert.equal(text, '**apple** 是苹果。');
  assert.deepEqual(parts, ['**apple** ', '**apple** 是苹果', '**apple** 是苹果。']);
  assert.equal(seen.at(-1).body.stream, true);
});

test('出错: 不回答、太忙 (自动重试两次)、没填密钥', async () => {
  behavior = { refusal: true };
  await assert.rejects(ai.judgeAnswer({ prompt: 'a', answer: 'b', typed: 'c' }), (e) => e.kind === 'refusal');
  behavior = { status: 529 };
  seen.length = 0;
  await assert.rejects(ai.judgeAnswer({ prompt: 'a', answer: 'b', typed: 'c' }), (e) => e.kind === 'server' && /529/.test(e.message));
  assert.equal(seen.length, 3);
  behavior = {};
  ai.saveAI(null);
  await assert.rejects(ai.judgeAnswer({ prompt: 'a', answer: 'b', typed: 'c' }), (e) => e.kind === 'nokey');
});
