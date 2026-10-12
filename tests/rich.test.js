import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarks, stripMarks, hasMarks } from '../js/rich.js';
import { grade, normalize } from '../js/grade.js';

test('认出加粗、斜体、下划线、高亮', () => {
  assert.deepEqual(parseMarks('a **b** c'), [
    { text: 'a ', b: false, i: false, u: false, hl: false },
    { text: 'b', b: true, i: false, u: false, hl: false },
    { text: ' c', b: false, i: false, u: false, hl: false },
  ]);
  const t = parseMarks('*斜* __下__ ==亮==');
  assert.deepEqual(
    t.filter((x) => x.i || x.u || x.hl).map((x) => x.text),
    ['斜', '下', '亮'],
  );
});

test('可以套着用', () => {
  const t = parseMarks('**加粗 *又斜* 的**');
  assert.equal(stripMarks('**加粗 *又斜* 的**'), '加粗 又斜 的');
  assert.ok(t.find((x) => x.text === '又斜').b);
  assert.ok(t.find((x) => x.text === '又斜').i);
});

test('落单的记号照原样', () => {
  assert.equal(stripMarks('5 * 3 = 15'), '5 * 3 = 15');
  assert.equal(stripMarks('a ** b'), 'a ** b');
  assert.ok(!hasMarks('5 * 3'));
  assert.ok(hasMarks('**x**'));
  assert.equal(stripMarks(''), '');
});

test('判分不管格式', () => {
  assert.equal(normalize('**apple**'), 'apple');
  assert.ok(grade('apple', '**apple**').correct);
  assert.ok(grade('苹果', '==苹果== (水果)').correct);
});
