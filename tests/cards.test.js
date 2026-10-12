import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintOf } from '../js/views/cards.js';

test('显示提示: 每个词只露第一个字', () => {
  assert.equal(hintOf('apple'), 'a____');
  assert.equal(hintOf('apple pie'), 'a____ p__');
  assert.equal(hintOf("don't stop!"), "d__'_ s___!");
  assert.equal(hintOf('中华人民共和国'), '中______');
  assert.equal(hintOf('a'), '_');
  assert.equal(hintOf('狗'), '_'); // 只有一个字, 不能露出来
  assert.equal(hintOf('I am'), '_ a_');
});
