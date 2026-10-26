import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestion, quizToMistakes } from '../js/quiz.js';
import { cleanData, makeSet, makeCard, Store } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { decodeShare } from '../js/share.js';
import { mistakeProblem, PREFIX } from '../js/mistakes.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const choice = (options, correct, time = 20) => ({ type: 'choice', options, correct, time });
// v1.42 以前的题目集
const oldQuiz = (extra = {}) => ({
  ...makeSet({ id: 'quiz1', title: '诗歌小测', updatedAt: 10 }),
  kind: 'quiz',
  runs: [{ at: 5, score: 900, correct: 1, total: 1 }],
  cards: [
    makeCard('Which is a simile?', 'Simile', { id: 'c1', q: choice(['Simile', 'Metaphor', 'Stanza'], [0]), image: 'm_pic' }),
    makeCard('A quatrain has six lines.', '错', { id: 'c2', q: { type: 'tf', options: [], correct: [1], time: 10 } }),
    makeCard('Which are figures of speech?', 'Simile; Metaphor', { id: 'c3', q: choice(['Simile', 'Metaphor', 'Stanza'], [0, 1]) }),
  ],
  ...extra,
});

test('老的题目: 坏的、怪的补齐或者不要', () => {
  assert.equal(cleanQuestion(null), null);
  assert.equal(cleanQuestion({ type: 'essay' }), null);
  assert.deepEqual(cleanQuestion({ type: 'tf', correct: [1] }), { type: 'tf', options: [], correct: [1] });
  assert.deepEqual(cleanQuestion(choice(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [3, 1, 1, 9, -1, 'x'])), { type: 'choice', options: ['a', 'b', 'c', 'd', 'e', 'f'], correct: [1, 3] });
});

test('题目集 → 错题: 选择题、判断题 (对 / 错)、多选题 (第一个对的, 别的写在笔记里); 题目集的名字当题型', () => {
  const list = quizToMistakes(oldQuiz(), 1000);
  assert.deepEqual(
    list.map((m) => m.id),
    ['q_quiz1_c1', 'q_quiz1_c2', 'q_quiz1_c3'],
  );
  const [a, b, c] = list;
  assert.deepEqual([a.type, a.question, a.options, a.correct, a.mine, a.images, a.kind], ['choice', 'Which is a simile?', ['Simile', 'Metaphor', 'Stanza'], 0, -1, ['m_pic'], '诗歌小测']);
  assert.deepEqual([b.options, b.correct], [['对', '错'], 1]);
  assert.deepEqual([c.correct, c.note], [0, '多选题，正确答案：A、B']);
  assert.ok(list.every((m) => mistakeProblem(m) === ''));
  assert.ok(list.every((m) => m.review && !m.review.mastered)); // 明天开始排进重做
});

test('读进来时题目集变成错题, 题目集记成删掉了; 普通卡片集不动', () => {
  const plain = makeSet({ id: 'plain', title: '单词', cards: [makeCard('a', 'b')] });
  const data = cleanData({ sets: [oldQuiz(), plain], mistakes: [] });
  assert.deepEqual(
    data.sets.map((s) => s.id),
    ['plain'],
  );
  assert.equal(data.mistakes.length, 3);
  assert.ok(data.deleted.quiz1 > 0);
  assert.equal('kind' in data.sets[0], false);
  // 再读一次 (比如同步回来的还带着老的题目集): 不会多出一份
  const again = cleanData({ ...data, sets: [...data.sets, oldQuiz()] });
  assert.equal(again.mistakes.length, 3);
  // 变过以后又删掉的错题: 不再加回来
  const deleted = cleanData({ ...data, mistakes: data.mistakes.slice(1), deleted: { ...data.deleted, [PREFIX + 'q_quiz1_c1']: Date.now() }, sets: [oldQuiz()] });
  assert.deepEqual(
    deleted.mistakes.map((m) => m.id),
    ['q_quiz1_c2', 'q_quiz1_c3'],
  );
});

test('两台设备各自把同一个题目集变成错题: 合起来还是一份', () => {
  const a = cleanData({ sets: [oldQuiz()] });
  const b = cleanData({ sets: [oldQuiz()] });
  const merged = cleanData(mergeData(a, b));
  assert.equal(merged.mistakes.length, 3);
  assert.equal(merged.sets.length, 0);
});

test('老的题目集的分享链接: 读得出选项和对错 (打开时导入成错题)', async () => {
  const payload = { v: 1, t: '诗歌小测', d: '', l: ['auto', 'auto'], k: 'quiz', c: [['Which?', 'Simile', '', choice(['Simile', 'Metaphor'], [0])]] };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const back = await decodeShare(`j${b64}`);
  assert.equal(back.kind, 'quiz');
  assert.deepEqual(back.cards[0].q, { type: 'choice', options: ['Simile', 'Metaphor'], correct: [0] });
  const [m] = quizToMistakes({ id: 'shared', title: back.title, cards: back.cards.map((c, i) => ({ ...c, id: `c${i}` })) });
  assert.deepEqual([m.question, m.options, m.correct, m.kind], ['Which?', ['Simile', 'Metaphor'], 0, '诗歌小测']);
});
