import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeQuestion, distractors, makeMatchGroup } from '../js/questions.js';
import { LearnSession, NEW, LEARNING, MASTERED } from '../js/learn.js';

// 每次结果一样的「随机数」
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const cards = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, term: `term${i}`, def: `def${i}` }));

test('选择题: 4 个选项, 只有一个对, 不重复', () => {
  const q = makeQuestion('mc', cards[0], cards, { rng: seeded(3) });
  assert.equal(q.type, 'mc');
  assert.equal(q.prompt, 'term0');
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4);
  assert.equal(q.options[q.correctIndex], 'def0');
});

test('看解释答词', () => {
  const q = makeQuestion('mc', cards[2], cards, { answerWith: 'term', rng: seeded(5) });
  assert.equal(q.prompt, 'def2');
  assert.equal(q.options[q.correctIndex], 'term2');
});

test('错的选项不跟对的一样 (哪怕别的卡片解释一样)', () => {
  const dupes = [
    { id: 'a', term: 'big', def: '大' },
    { id: 'b', term: 'large', def: '大' },
    { id: 'c', term: 'small', def: '小' },
  ];
  assert.deepEqual(distractors(dupes[0], dupes, 'def', 3, seeded(2)), ['小']);
});

test('判断题: 有对有错, 显示的答案跟 isTrue 对得上', () => {
  const rng = seeded(7);
  let t = 0;
  let f = 0;
  for (let i = 0; i < 40; i++) {
    const q = makeQuestion('tf', cards[1], cards, { rng });
    assert.equal(q.type, 'tf');
    assert.equal(q.isTrue, q.shown === 'def1');
    if (q.isTrue) t++;
    else f++;
  }
  assert.ok(t > 0 && f > 0);
});

test('只有一张卡片, 选择题、判断题改成打字', () => {
  assert.equal(makeQuestion('mc', cards[0], [cards[0]]).type, 'written');
  assert.equal(makeQuestion('tf', cards[0], [cards[0]]).type, 'written');
});

test('配对题: 每个题目的答案都在选项里', () => {
  const g = makeMatchGroup(cards.slice(0, 5), { rng: seeded(4) });
  assert.equal(g.items.length, 5);
  assert.deepEqual([...g.options].sort(), g.items.map((x) => x.answer).sort());
});

test('学习: 一轮最多 7 张, 先选择后打字, 两次答对就掌握', () => {
  const s = new LearnSession(cards, {}, {}, seeded(11));
  assert.equal(s.startRound(), 7);
  const q = s.next();
  assert.equal(q.type, 'mc'); // 没学过的先认
  assert.equal(s.answer(true), LEARNING);
  // 把这一轮答完
  while (s.next()) s.answer(true);
  assert.deepEqual(s.counts(), { new: 3, learning: 7, mastered: 0, total: 10 });

  // 第二轮: 认得了的先出打字
  s.startRound();
  const q2 = s.next();
  assert.equal(q2.type, 'written');
  assert.equal(s.level(q2.card), LEARNING);
  assert.equal(s.answer(true), MASTERED);
});

test('答错: 程度不升, 这一轮后面再问一次 (只再问一次)', () => {
  const s = new LearnSession(cards.slice(0, 3), {}, {}, seeded(2));
  s.startRound();
  const first = s.next().card;
  s.answer(false);
  assert.equal(s.level(first), NEW);
  assert.equal(s.queue.at(-1), first);
  // 答完剩下的, 再碰到它时又答错, 就不再排了
  let asked = 0;
  while (s.next()) {
    if (s.current.card === first) s.answer(false);
    else s.answer(true);
    asked++;
  }
  assert.equal(asked, 3);
});

test('掌握了的答错退回认得了', () => {
  const s = new LearnSession(cards.slice(0, 2), { c0: MASTERED, c1: LEARNING }, {}, seeded(9));
  s.levels.c0 = MASTERED;
  s.queue = [cards[0]];
  s.next();
  assert.equal(s.answer(false), LEARNING);
});

test('「我答对了」: 改成对的, 不再重问', () => {
  const s = new LearnSession(cards.slice(0, 4), { c0: LEARNING, c1: LEARNING, c2: LEARNING, c3: LEARNING }, {}, seeded(5));
  s.startRound();
  const q = s.next();
  assert.equal(q.type, 'written');
  s.answer(false);
  assert.equal(s.queue.length, 4);
  assert.equal(s.override(), MASTERED);
  assert.equal(s.queue.length, 3);
  assert.ok(!s.queue.includes(q.card));
  assert.equal(s.roundResults.at(-1).correct, true);
  assert.equal(s.override(), null); // 改过就不能再改
});

test('只开打字: 答对一次就掌握', () => {
  const s = new LearnSession(cards.slice(0, 2), {}, { types: { mc: false, tf: false, written: true } }, seeded(1));
  s.startRound();
  assert.equal(s.next().type, 'written');
  assert.equal(s.answer(true), MASTERED);
});

test('不开打字: 认两次就掌握', () => {
  const s = new LearnSession(cards.slice(0, 4), {}, { types: { mc: true, tf: false, written: false } }, seeded(1));
  s.startRound();
  while (s.next()) s.answer(true);
  s.startRound();
  assert.equal(s.next().type, 'mc');
  assert.equal(s.answer(true), MASTERED);
});

test('全部掌握了就 done', () => {
  const s = new LearnSession(cards.slice(0, 3), {}, {}, seeded(8));
  let rounds = 0;
  while (!s.done() && rounds < 10) {
    s.startRound();
    while (s.next()) s.answer(true);
    rounds++;
  }
  assert.ok(s.done());
  assert.equal(rounds, 2);
  assert.equal(s.startRound(), 0);
});
