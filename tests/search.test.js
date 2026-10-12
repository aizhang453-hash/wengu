import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, highlight } from '../js/search.js';

const sets = [
  { id: 'a', title: '托福核心词', description: '第一单元', cards: [{ id: '1', term: 'Apple', def: '**苹果**' }, { id: '2', term: 'banana', def: '香蕉' }] },
  { id: 'b', title: '日语', description: '', cards: [{ id: '3', term: 'りんご', def: '苹果 (apple)' }] },
];

test('找卡片: 不管大小写、格式记号', () => {
  const r = search(sets, 'APPLE');
  assert.deepEqual(
    r.cards.map((x) => x.card.id),
    ['1', '3'],
  );
  assert.deepEqual(
    search(sets, '苹果').cards.map((x) => x.card.id),
    ['1', '3'],
  );
});

test('找卡片集: 标题和简介', () => {
  assert.deepEqual(
    search(sets, '托福').sets.map((s) => s.id),
    ['a'],
  );
  assert.deepEqual(
    search(sets, '单元').sets.map((s) => s.id),
    ['a'],
  );
});

test('几个词都要有', () => {
  assert.deepEqual(
    search(sets, '苹果 apple').cards.map((x) => x.card.id),
    ['1', '3'],
  );
  assert.deepEqual(
    search(sets, '苹果 banana').cards.map((x) => x.card.id),
    [],
  );
});

test('空的什么也不找', () => {
  assert.deepEqual(search(sets, '   '), { sets: [], cards: [] });
});

test('标出找到的词', () => {
  assert.deepEqual(highlight('Big apple pie', 'APPLE'), [
    { text: 'Big ', hit: false },
    { text: 'apple', hit: true },
    { text: ' pie', hit: false },
  ]);
  assert.deepEqual(highlight('**苹果**派', '苹果'), [
    { text: '苹果', hit: true },
    { text: '派', hit: false },
  ]);
});
