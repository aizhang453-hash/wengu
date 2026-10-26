import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCardPrompt, parseCardImport, FORMAT } from '../js/cardimport.js';
import { findJson, plainMath } from '../js/aitext.js';
import { parseMistakeImport, ImportError } from '../js/mistakeimport.js';

const cards = (text) => parseCardImport(text)?.cards;

test('给 AI 的话: 写着格式, 里面的例子自己读得出来', () => {
  const p = aiCardPrompt();
  assert.match(p, /```json/);
  assert.match(p, /几个意思用分号隔开/);
  assert.match(p, /不要用 LaTeX/);
  const example = findJson(p.slice(p.indexOf('```json')))[0];
  assert.equal(example.wengu, FORMAT);
  assert.ok(example.cards.length >= 2);
  // 粘贴的是这段话本身: 不当成卡片
  assert.match(parseCardImport(p).error, /给 AI 的那段话/);
});

test('AI 照着格式回的: 前后有话也认, 标题也带上', () => {
  const r = parseCardImport(`好的, 照片里一共 3 个词:

\`\`\`json
{
  "wengu": "${FORMAT}",
  "title": "Unit 5 单词",
  "cards": [
    { "term": "abundant", "def": "(adj.) 大量的; 丰富的" },
    { "term": "be aware of", "def": "意识到\\nAre you aware of the risk?" },
    { "term": "H_{2}O", "def": "水" }
  ]
}
\`\`\`
要我再加例句吗?`);
  assert.equal(r.title, 'Unit 5 单词');
  assert.deepEqual(r.cards, [
    { term: 'abundant', def: '(adj.) 大量的; 丰富的' },
    { term: 'be aware of', def: '意识到\nAre you aware of the risk?' },
    { term: 'H₂O', def: '水' },
  ]);
});

test('不太规矩的 JSON 也认: 换了字段名、词性例句分开写、一对一对的、词 → 意思', () => {
  assert.deepEqual(cards('{"words": [{"word": "cat", "meaning": "猫", "pos": "n.", "example": "A cat sat."}]}'), [{ term: 'cat', def: '(n.) 猫\nA cat sat.' }]);
  assert.deepEqual(cards('[{"单词": "狗", "意思": "dog"}, {"front": "2+2", "back": "4"}]'), [
    { term: '狗', def: 'dog' },
    { term: '2+2', def: '4' },
  ]);
  assert.deepEqual(cards('[["apple", "苹果"], ["run", "跑"]]'), [
    { term: 'apple', def: '苹果' },
    { term: 'run', def: '跑' },
  ]);
  assert.deepEqual(cards('{"apple": "苹果", "banana": "香蕉"}'), [
    { term: 'apple', def: '苹果' },
    { term: 'banana', def: '香蕉' },
  ]);
  // 一张一个代码块; 词性已经写在解释里的不再加
  assert.deepEqual(cards('```json\n{"term": "a", "def": "(n.) x", "pos": "n."}\n```\n```json\n{"term": "b", "def": "y"}\n```'), [
    { term: 'a', def: '(n.) x' },
    { term: 'b', def: 'y' },
  ]);
  // 数学写成 LaTeX
  assert.deepEqual(cards('{"cards": [{"term": "\\\\frac{1}{2} + \\\\frac{1}{4}", "def": "$\\\\frac{3}{4}$"}]}'), [{ term: '1/2 + 1/4', def: '3/4' }]);
});

test('AI 画成表格的也认: 按列名挑词和解释, 编号、音标那几列不要', () => {
  const r = parseCardImport(`| # | 单词 | 音标 | 词性 | 意思 | 例句 |
|---|---|---|---|---|---|
| 1 | **apple** | /ˈæpl/ | n. | 苹果 | I eat an apple. |
| 2 | run | /rʌn/ | v. | 跑<br>奔跑 | |`);
  assert.deepEqual(r.cards, [
    { term: 'apple', def: '(n.) 苹果\nI eat an apple.' },
    { term: 'run', def: '(v.) 跑\n奔跑' },
  ]);
  // 列名认不得: 第一列是词, 第二列是解释
  assert.deepEqual(cards('| Word | Definition |\n|:--|:--|\n| abate | subside |'), [{ term: 'abate', def: 'subside' }]);
  assert.deepEqual(cards('| English | Chinese |\n| --- | --- |\n| cat | 猫 |'), [{ term: 'cat', def: '猫' }]);
  // 没有列名的表格: 第一行也是卡片
  assert.deepEqual(cards('| apple | 苹果 |\n|---|---|\n| banana | 香蕉 |'), [
    { term: 'apple', def: '苹果' },
    { term: 'banana', def: '香蕉' },
  ]);
});

test('不像 AI 写的: 返回 null, 照原来的分隔方式拆', () => {
  assert.equal(parseCardImport(''), null);
  assert.equal(parseCardImport('apple\t苹果\nbanana\t香蕉'), null);
  assert.equal(parseCardImport('apple,苹果;banana,香蕉'), null);
  assert.equal(parseCardImport('[n.] thing\t东西'), null); // 方括号不是 JSON
  assert.equal(parseCardImport('set\t{x | x > 0}'), null);
  assert.equal(parseCardImport('42'), null);
});

test('像 AI 写的又读不出来: 说怎么办, 不拆成一堆怪卡片', () => {
  assert.match(parseCardImport('```json\n{"cards": [{"term": "a", "def": }\n```').error, /格式有点问题/);
  assert.match(parseCardImport('{"title": "空的", "description": "x"}').error, /没有卡片/);
  assert.match(parseCardImport(JSON.stringify({ app: 'wengu', version: 1, sets: [] })).error, /备份/);
  // 错题和卡片放错了地方: 说该去哪
  assert.match(parseCardImport('{"wengu": "wengu-mistakes", "mistakes": [{"question": "Q", "answer": "1"}]}').error, /错题集/);
  assert.throws(() => parseMistakeImport(`{"wengu": "${FORMAT}", "cards": [{"term": "a", "def": "b"}]}`), (e) => e instanceof ImportError && /卡片集/.test(e.message));
});

test('下标是数字的写成 H₂O、log₂; 上标照写 x^2', () => {
  assert.equal(plainMath('H_{2}SO_{4}, \\log_{2} 8, x^{2}, a_{n+1}'), 'H₂SO₄, log₂ 8, x^2, a_(n+1)');
});
