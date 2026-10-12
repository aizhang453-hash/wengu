import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeQuestion } from '../js/questions.js';
import { LearnSession, LEARNING } from '../js/learn.js';
import { makeCard } from '../js/store.js';

test('听写题: 念词、写词, 解释当提示; 没有词的改成打字题', () => {
  const card = makeCard('ephemeral', '短暂的');
  const q = makeQuestion('listen', card, [card], { answerWith: 'def' });
  assert.deepEqual([q.type, q.side, q.answer, q.prompt], ['listen', 'term', 'ephemeral', '短暂的']);
  const blank = makeCard('', '只有解释');
  assert.equal(makeQuestion('listen', blank, [blank]).type, 'written');
});

test('学习模式: 听写算「写」的题; 念不出来的卡片不出听写', () => {
  const cards = [makeCard('a', '一'), makeCard('b', '二'), makeCard('c', '三'), makeCard('d', '四')];
  const only = new LearnSession(cards, {}, { types: { mc: false, written: false, listen: true }, canListen: (c) => c.term !== 'b' });
  assert.equal(only.typeFor(cards[0]), 'listen');
  assert.equal(only.typeFor(cards[1]), 'written');

  const mixed = new LearnSession(cards, { [cards[2].id]: LEARNING }, { types: { mc: true, written: false, listen: true } });
  assert.equal(mixed.typeFor(cards[0]), 'mc'); // 没学过的先认
  assert.equal(mixed.typeFor(cards[2]), 'listen'); // 认得了的写出来
  // 答对了升级, 跟打字题一样
  mixed.startRound();
  while (mixed.queue[0] !== cards[2]) mixed.queue.push(mixed.queue.shift());
  const q = mixed.next();
  assert.equal(q.type, 'listen');
  assert.equal(mixed.answer(true), 2);
});
