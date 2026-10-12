import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards, formatCards, guessTermSep, guessCardSep } from '../js/parse.js';

test('Quizlet 默认导出: Tab 和换行', () => {
  const text = 'apple\t苹果\nbanana\t香蕉\n';
  assert.deepEqual(parseCards(text), [
    { term: 'apple', def: '苹果' },
    { term: 'banana', def: '香蕉' },
  ]);
});

test('Windows 换行 (\\r\\n) 也认', () => {
  assert.deepEqual(parseCards('a\t1\r\nb\t2\r\n'), [
    { term: 'a', def: '1' },
    { term: 'b', def: '2' },
  ]);
});

test('逗号只在第一个拆开, 解释里的逗号留着', () => {
  assert.deepEqual(parseCards('run, 跑, 奔跑', { termSep: 'comma' }), [{ term: 'run', def: '跑, 奔跑' }]);
});

test('分号隔开卡片时, 解释里可以换行', () => {
  const text = 'river\t河\n(一条河);mountain\t山;';
  assert.deepEqual(parseCards(text, { cardSep: 'semicolon' }), [
    { term: 'river', def: '河\n(一条河)' },
    { term: 'mountain', def: '山' },
  ]);
});

test('自定义分隔', () => {
  assert.deepEqual(parseCards('猫 - cat || 狗 - dog', { termSep: ' - ', cardSep: ' || ' }), [
    { term: '猫', def: 'cat' },
    { term: '狗', def: 'dog' },
  ]);
});

test('空行跳过, 没有解释的也留着', () => {
  assert.deepEqual(parseCards('\n\nlonely\n\n  \nx\ty\n'), [
    { term: 'lonely', def: '' },
    { term: 'x', def: 'y' },
  ]);
});

test('分隔是空的就什么也不认', () => {
  assert.deepEqual(parseCards('a\tb', { termSep: '' }), []);
  assert.deepEqual(parseCards('a\tb', { cardSep: '' }), []);
});

test('猜分隔方式', () => {
  assert.equal(guessTermSep('a\tb'), 'tab');
  assert.equal(guessTermSep('a,b'), 'comma');
  assert.equal(guessCardSep('a\tb\nc\td'), 'newline');
  assert.equal(guessCardSep('a\tb;c\td;'), 'semicolon');
  assert.equal(guessCardSep('a\tb;c\td;\n'), 'semicolon');
});

test('导出再导入, 一样', () => {
  const cards = [
    { term: 'one', def: '一' },
    { term: 'two', def: '二, 两' },
  ];
  assert.deepEqual(parseCards(formatCards(cards)), cards);
});
