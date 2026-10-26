import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiPrompt, parseMistakeImport, choiceIndex, kindName, findSame, ImportError, FORMAT } from '../js/mistakeimport.js';
import { findJson, fixBackslashes, plainMath } from '../js/aitext.js';
import { KINDS, mistakeProblem } from '../js/mistakes.js';
import { Store } from '../js/store.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const ids = () => {
  let n = 0;
  return () => `t${++n}`;
};
const parse = (text) => parseMistakeImport(text, ids()).map((x) => x.mistake);

// AI 照着格式回的: 前后有话, ```json 包着
const reply = `好的, 两道题整理好了:

\`\`\`json
{
  "wengu": "${FORMAT}",
  "mistakes": [
    {
      "type": "choice",
      "passage": "The following text is adapted from a 1913 novel.",
      "question": "As used in the text, what does the word \\"__candid__\\" most nearly mean?",
      "options": ["Frank", "Hidden", "Bitter", "Calm"],
      "answer": "A",
      "mine": "D",
      "note": "candid 是坦率",
      "kind": "词汇题"
    },
    { "type": "input", "passage": "", "question": "If 3x + 5 = 20, what is x?", "options": [], "answer": "5", "mine": "15", "note": "", "kind": "代数" }
  ]
}
\`\`\`
有问题再告诉我。`;

test('给 AI 的话: 写着格式、SAT 的题型, 自己认得出来', () => {
  const p = aiPrompt();
  for (const k of Object.values(KINDS).flat()) assert.ok(p.includes(k), k);
  assert.match(p, /```json/);
  assert.match(p, /不要用 LaTeX/);
  // 里面的例子照着格式写, 自己读得出来 (但不当成错题: 见下面「粘贴的是给 AI 的话」)
  const example = findJson(p.slice(p.indexOf('```json')))[0];
  assert.equal(example.wengu, FORMAT);
  assert.equal(example.mistakes.length, 2);
});

test('AI 回的整段: 认出两道, 选择题、填空题都写完整了', () => {
  const items = parseMistakeImport(reply, ids());
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((x) => x.problem),
    ['', ''],
  );
  const [a, b] = items.map((x) => x.mistake);
  assert.equal(a.id, 't1');
  assert.equal(a.type, 'choice');
  assert.equal(a.passage, 'The following text is adapted from a 1913 novel.');
  assert.equal(a.question, 'As used in the text, what does the word "__candid__" most nearly mean?');
  assert.deepEqual(a.options, ['Frank', 'Hidden', 'Bitter', 'Calm']);
  assert.equal(a.correct, 0);
  assert.equal(a.mine, 3);
  assert.equal(a.kind, '词汇题');
  assert.equal(a.review, null); // 存的时候 (putMistake) 才排复习
  assert.deepEqual([b.type, b.answer, b.mineText, b.options, b.correct], ['input', '5', '15', [], -1]);
});

test('不太规矩的也认: 没有代码块、只有一道、一个数组、一道一段', () => {
  assert.equal(parse('{"question": "Q?", "options": ["a", "b"], "answer": "B"}')[0].correct, 1);
  assert.equal(parse('[{"question": "Q1", "answer": "1"}, {"question": "Q2", "answer": "2"}]').length, 2);
  // 一道题一个代码块
  const two = parse('第一道:\n```json\n{"question": "Q1", "answer": "1"}\n```\n第二道:\n```\n{"question": "Q2", "answer": "2"}\n```');
  assert.deepEqual(
    two.map((m) => m.question),
    ['Q1', 'Q2'],
  );
  // 代码块没复制全 (少了后面的 ```)、前后有话
  assert.equal(parse('```json\n{"mistakes": [{"question": "Q", "answer": "x"}]}')[0].answer, 'x');
  assert.equal(parse('这是结果: {"question": "Q", "answer": "x"} 希望有用')[0].question, 'Q');
  // 好几个 { } 挨着, 没放进 [ ]
  assert.equal(parse('{"question": "Q1", "answer": "1"}\n{"question": "Q2", "answer": "2"}').length, 2);
  // 最后多了逗号
  assert.equal(parse('{"question": "Q", "options": ["a", "b",], "answer": "A",}')[0].correct, 0);
});

test('字段名写成中文、换了说法也认', () => {
  const [m] = parse('{"文章": "P", "题目": "Q", "选项": {"A": "甲", "B": "乙", "C": "丙"}, "正确答案": "选 C", "我选的": "B. 乙", "解析": "N", "题型": "词汇"}');
  assert.deepEqual([m.passage, m.question, m.options, m.correct, m.mine, m.note, m.kind], ['P', 'Q', ['甲', '乙', '丙'], 2, 1, 'N', '词汇题']);
  const [e] = parse('{"stem": "Q", "choices": [{"label": "A", "text": "x"}, {"label": "B", "text": "y"}], "correct_answer": "(B)", "explanation": "N", "skill": "Command of Evidence: Quantitative"}');
  assert.deepEqual([e.question, e.options, e.correct, e.note, e.kind], ['Q', ['x', 'y'], 1, 'N', '图表证据']);
  // type 里写的是题型
  assert.equal(parse('{"question": "Q", "options": ["a", "b"], "answer": "A", "type": "Words in Context"}')[0].kind, '词汇题');
  // 填空题的各种叫法
  for (const type of ['fill-in', 'grid-in', 'student-produced response', '填空题', 'free response']) assert.equal(parse(`{"question": "Q", "answer": "3", "type": "${type}"}`)[0].type, 'input', type);
});

test('选项前面的 A. B. 去掉; 只有第一个像的不去', () => {
  assert.deepEqual(parse('{"question": "Q", "options": ["A. Frank", "B) Hidden", "(C) Bitter", "D：Calm"], "answer": "A"}')[0].options, ['Frank', 'Hidden', 'Bitter', 'Calm']);
  assert.deepEqual(parse('{"question": "Q", "options": ["A. Lincoln", "Grant"], "answer": "A"}')[0].options, ['A. Lincoln', 'Grant']);
  assert.deepEqual(parse('{"question": "Q", "options": "A. 2\\nB. 4\\nC. 8", "answer": "B"}')[0].options, ['2', '4', '8']);
});

test('答案写成什么样都找得到是哪个', () => {
  const words = ['Frank', 'Hidden', 'Bitter', 'Calm'];
  const nums = ['2', '4', '8', '16'];
  assert.equal(choiceIndex('B', words), 1);
  assert.equal(choiceIndex('b', words), 1);
  assert.equal(choiceIndex('(C)', words), 2);
  assert.equal(choiceIndex('答案是 D', words), 3);
  assert.equal(choiceIndex('Choice A', words), 0);
  assert.equal(choiceIndex('B. Hidden', words), 1);
  assert.equal(choiceIndex('bitter', words), 2); // 写的是选项的字
  assert.equal(choiceIndex('**Calm**', words), 3);
  assert.equal(choiceIndex('E', words), -1); // 没有 E
  assert.equal(choiceIndex('不知道', words), -1);
  assert.equal(choiceIndex('', words), -1);
  // 选项是数字: 按数比, 不当成第几个
  assert.equal(choiceIndex('8', nums), 2);
  assert.equal(choiceIndex(4, nums), 1);
  assert.equal(choiceIndex('16.0', nums), 3);
  // 选项不是数字: 写的是第几个 (从 1 数); 字段名带 index 的从 0 数
  assert.equal(choiceIndex(2, words), 1);
  assert.equal(choiceIndex('4', words), 3);
  assert.equal(choiceIndex(0, words), 0);
  assert.equal(choiceIndex(2, words, true), 2);
  assert.equal(parse('{"question": "Q", "options": ["a", "b", "c"], "correctIndex": 2, "mineIndex": 0}')[0].correct, 2);
  // 我选的跟对的一样: 不算选错
  assert.equal(parse('{"question": "Q", "options": ["a", "b"], "answer": "A", "mine": "A"}')[0].mine, -1);
});

test('没写完的说差什么 (存的时候一道道打开补上)', () => {
  const items = parseMistakeImport('{"mistakes": [{"question": "Q", "options": ["a", "b", "c", "d"], "answer": "", "mine": "B"}, {"question": "Q2", "type": "input"}, {"question": "Q3", "type": "choice"}]}', ids());
  assert.deepEqual(
    items.map((x) => x.problem),
    ['请标出正确答案', '请填写正确答案', '至少需要 2 个选项'],
  );
  assert.equal(items[0].mistake.mine, 1);
  assert.deepEqual(items[2].mistake.options, ['', '']); // 后面空着的去掉了, 编辑时再加
  assert.equal(items.every((x) => x.problem === mistakeProblem(x.mistake)), true);
});

test('认不出来的说怎么办', () => {
  const message = (text) => {
    try {
      parseMistakeImport(text, ids());
    } catch (e) {
      assert.ok(e instanceof ImportError);
      return e.message;
    }
    return '';
  };
  assert.match(message(''), /请粘贴/);
  assert.match(message('照片太模糊了, 看不清'), /未找到/);
  assert.match(message('{"question": "Q", "options": ['), /格式无法识别/);
  assert.match(message('{"mistakes": []}'), /未包含题目/);
  assert.match(message('{"mistakes": [{"note": "只有笔记"}]}'), /未包含题目/);
  assert.match(message(aiPrompt()), /提示词/);
  assert.match(message(JSON.stringify({ app: 'wengu', version: 1, sets: [], mistakes: [{ id: 'x', question: 'Q' }] })), /备份/);
});

test('LaTeX 写进 JSON 没多打 \\ 也读得出来, 换成普通的字', () => {
  // \f \t 是 JSON 的换页、Tab, \s 读不了: 补成 \\; 真的换行 (\n 后面是字) 不动
  assert.equal(JSON.parse(fixBackslashes('"\\frac{1}{2} \\times \\sqrt{x} \\nThe \\neq"')), '\\frac{1}{2} \\times \\sqrt{x} \nThe \\neq');
  assert.equal(fixBackslashes('"\\\\frac \\" \\u00e9"'), '"\\\\frac \\" \\u00e9"'); // 本来就对的不动
  const [m] = parse('{"question": "If $3x + 5 = 20$, what is $x$? Find \\frac{a+1}{2} and \\sqrt{16}, angle $ABC$ = 30^{\\circ}", "options": ["\\(x \\leq 5\\)", "$x^{2}$", "\\dfrac{3}{4}", "$5-$10"], "answer": "C"}');
  assert.equal(m.question, 'If 3x + 5 = 20, what is x? Find (a+1)/2 and √16, angle ABC = 30°');
  assert.deepEqual(m.options, ['x ≤ 5', 'x^2', '3/4', '$5-$10']);
  assert.equal(m.correct, 2);
  assert.equal(plainMath('costs $5 and $10'), 'costs $5 and $10'); // 钱不动
  assert.equal(plainMath('\\sqrt[3]{x+1} \\left( a \\cdot b \\right) \\pi r^2 \\underline{word} \\text{cm}'), '3√(x+1) ( a · b ) π r^2 __word__ cm');
  assert.equal(plainMath('no math here: snake_case, x^2'), 'no math here: snake_case, x^2');
  assert.equal(plainMath('\\unknown{x}'), '\\unknown{x}'); // 不认得的照原样
});

test('题型: SAT 的英文叫法、差一点的中文换成我们的; 别的照写', () => {
  assert.equal(kindName('Words in Context'), '词汇题');
  assert.equal(kindName('Text Structure and Purpose'), '目的和结构');
  assert.equal(kindName('Form, Structure, and Sense'), '语法·词形');
  assert.equal(kindName('Boundaries'), '语法·标点');
  assert.equal(kindName('Command of Evidence: Textual'), '文本证据');
  assert.equal(kindName('Problem-Solving and Data Analysis'), '数据分析');
  assert.equal(kindName('Advanced Math'), '高级数学');
  assert.equal(kindName('Geometry and Trigonometry'), '几何三角');
  assert.equal(kindName('Algebra'), '代数');
  assert.equal(kindName('过渡'), '过渡词');
  assert.equal(kindName('语法'), '语法'); // 像两个, 不猜
  assert.equal(kindName('文言文'), '文言文');
  assert.equal(kindName('Organic chemistry'), 'Organic chemistry');
  assert.equal(kindName(''), '');
});

test('错题集里已经有的认得出来; 存进去明天开始重做', () => {
  const store = new Store(memoryStorage());
  const [a, b] = parse(reply);
  store.transaction(() => store.putMistake(a));
  assert.equal(findSame(a, store.allMistakes())?.id, 't1');
  assert.equal(findSame(b, store.allMistakes()), null);
  // 换了个 id、多了空格和格式记号也算同一道
  const again = parse(reply.replace('1913 novel.', '1913  novel. '))[0];
  assert.equal(findSame(again, store.allMistakes())?.id, 't1');
  const saved = store.getMistake('t1');
  assert.ok(saved.review.due > Date.now());
  assert.equal(saved.review.mastered, false);
});
