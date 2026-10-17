import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newQuestion, cleanQuestion, optionsOf, isMulti, answerText, questionProblem, tidyQuestion, checkAnswer, questionPoints, cleanRuns, mergeRuns, topRuns, MAX_RUNS } from '../js/quiz.js';
import { cleanData, makeSet, makeCard, Store } from '../js/store.js';
import { mergeData } from '../js/merge.js';
import { encodeShare, decodeShare } from '../js/share.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

const choice = (options, correct, time = 20) => ({ type: 'choice', options, correct, time });
const card = (term, q, extra = {}) => ({ id: 'c1', term, def: '', image: '', termAudio: '', defAudio: '', q, ...extra });

test('题目: 新的选择题不标对的, 判断题默认「对」', () => {
  assert.deepEqual(newQuestion(), { type: 'choice', options: ['', '', '', ''], correct: [], time: 20 });
  assert.deepEqual(newQuestion('tf', 30), { type: 'tf', options: [], correct: [0], time: 30 });
});

test('题目: 坏的、怪的补齐或者不要', () => {
  assert.equal(cleanQuestion(null), null);
  assert.equal(cleanQuestion({ type: 'essay' }), null);
  assert.deepEqual(cleanQuestion({ type: 'tf', correct: [1], time: 7 }), { type: 'tf', options: [], correct: [1], time: 20 });
  // 选项最多 6 个, 对的序号去重、排好、出界的不要
  const q = cleanQuestion(choice(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [3, 1, 1, 9, -1, 'x'], 10));
  assert.deepEqual(q, { type: 'choice', options: ['a', 'b', 'c', 'd', 'e', 'f'], correct: [1, 3], time: 10 });
});

test('题目: 单选、多选、判断; 对的答案那一行', () => {
  const single = choice(['Tone', 'Voice'], [0]);
  const multi = choice(['比喻', '拟人', '押韵'], [0, 1]);
  const tf = { type: 'tf', options: [], correct: [1], time: 20 };
  assert.equal(isMulti(single), false);
  assert.equal(isMulti(multi), true);
  assert.equal(isMulti(tf), false);
  assert.deepEqual(optionsOf(tf), ['对', '错']);
  assert.equal(answerText(single), 'Tone');
  assert.equal(answerText(multi), '比喻; 拟人');
  assert.equal(answerText(tf), '错');
});

test('题目: 没写完的说差什么', () => {
  assert.equal(questionProblem(card('', choice(['a', 'b'], [0]))), '题目还没写');
  assert.equal(questionProblem(card('', choice(['a', 'b'], [0]), { image: 'm_x' })), ''); // 只有图片也行
  assert.match(questionProblem(card('Q', choice(['a', ''], [0]))), /至少写 2 个/);
  assert.match(questionProblem(card('Q', choice(['a', 'b'], []))), /对的答案/);
  assert.match(questionProblem(card('Q', choice(['a', 'b', ''], [2]))), /空的/);
  assert.equal(questionProblem(card('Q', { type: 'tf', options: [], correct: [0], time: 20 })), '');
});

test('题目: 保存前去掉空选项, 对的序号跟着挪, 写好答案那一行', () => {
  const out = tidyQuestion(card('  What?  ', choice(['', 'Tone ', '', 'Voice', 'Mood'], [1, 4])));
  assert.equal(out.term, 'What?');
  assert.deepEqual(out.q.options, ['Tone', 'Voice', 'Mood']);
  assert.deepEqual(out.q.correct, [0, 2]);
  assert.equal(out.def, 'Tone; Mood');
});

test('判对错: 多选题一个不多一个不少才算对', () => {
  const multi = choice(['a', 'b', 'c', 'd'], [1, 3]);
  assert.equal(checkAnswer(multi, [3, 1]), true);
  assert.equal(checkAnswer(multi, [1]), false);
  assert.equal(checkAnswer(multi, [1, 2, 3]), false);
  assert.equal(checkAnswer(multi, []), false);
  assert.equal(checkAnswer(choice(['a', 'b'], [0]), [0, 0]), true);
});

test('得分: 越快越多 (最少一半), 连对加分有上限; 答错 0 分; 不限时每题 1000', () => {
  assert.equal(questionPoints({ correct: true, ms: 0, time: 20 }), 1000);
  assert.equal(questionPoints({ correct: true, ms: 10000, time: 20 }), 750);
  assert.equal(questionPoints({ correct: true, ms: 20000, time: 20 }), 500);
  assert.equal(questionPoints({ correct: true, ms: 99999, time: 20 }), 500);
  assert.equal(questionPoints({ correct: true, ms: 0, time: 20, streak: 2 }), 1100);
  assert.equal(questionPoints({ correct: true, ms: 0, time: 20, streak: 9 }), 1500);
  assert.equal(questionPoints({ correct: false, ms: 0, time: 20, streak: 5 }), 0);
  assert.equal(questionPoints({ correct: true, ms: 15000, time: 20, timed: false }), 1000);
});

test('成绩: 最新的在前、最多留 20 次; 两台设备合起来; 排行榜只算限时的', () => {
  const runs = Array.from({ length: 25 }, (_, i) => ({ at: i + 1, score: i * 10, correct: 1, total: 2 }));
  const clean = cleanRuns([...runs, { at: 0, total: 1 }, null]);
  assert.equal(clean.length, MAX_RUNS);
  assert.equal(clean[0].at, 25);
  assert.equal(clean[0].timed, true);
  const a = [{ at: 1, score: 100, correct: 1, total: 2, timed: true }];
  const b = [{ at: 1, score: 100, correct: 1, total: 2, timed: true }, { at: 2, score: 300, correct: 2, total: 2, timed: false }, { at: 3, score: 200, correct: 2, total: 2, timed: true }];
  assert.deepEqual(mergeRuns(a, b).map((r) => r.at), [3, 2, 1]);
  assert.deepEqual(topRuns(mergeRuns(a, b)).map((r) => r.score), [200, 100]);
});

test('存: 题目集的题目、成绩留着; 普通卡片集不带 q', () => {
  const quiz = makeSet({ kind: 'quiz', cards: [makeCard('Q?', 'a', { q: choice(['a', 'b'], [0]) }), makeCard('坏的', '', { q: 'oops' })], runs: [{ at: 5, score: 900, correct: 1, total: 1 }], best: { quiz: 900 } });
  const plain = makeSet({ cards: [makeCard('x', 'y', { q: choice(['a', 'b'], [0]) })] });
  const data = cleanData({ sets: [quiz, plain] });
  const [q, p] = data.sets;
  assert.equal(q.kind, 'quiz');
  assert.deepEqual(q.cards[0].q, choice(['a', 'b'], [0]));
  assert.deepEqual(q.cards[1].q, newQuestion()); // 坏的题目变成空的选择题, 答题时跳过
  assert.equal(q.runs.length, 1);
  assert.equal(q.best.quiz, 900);
  assert.equal(p.kind, 'cards');
  assert.equal('q' in p.cards[0], false);
});

test('答完记成绩: 限时的破纪录才算; 答了几题算进打卡', () => {
  const store = new Store(memoryStorage());
  const set = store.putSet(makeSet({ kind: 'quiz', cards: [makeCard('Q', 'a', { q: choice(['a', 'b'], [0]) })] }));
  assert.equal(store.recordRun(set.id, { score: 800, correct: 1, total: 3, timed: true }, 1000), true);
  assert.equal(store.recordRun(set.id, { score: 500, correct: 1, total: 3, timed: true }, 2000), false);
  assert.equal(store.recordRun(set.id, { score: 3000, correct: 3, total: 3, timed: false }, 3000), false);
  const s = store.getSet(set.id);
  assert.equal(s.best.quiz, 800);
  assert.deepEqual(s.runs.map((r) => r.at), [3000, 2000, 1000]);
  assert.equal(Object.values(store.data.activity).reduce((a, b) => a + b, 0), 9);
});

test('同步: 两台设备各答了一次, 合起来两次都在', () => {
  const base = makeSet({ kind: 'quiz', cards: [makeCard('Q', 'a', { q: choice(['a', 'b'], [0]) })], updatedAt: 10 });
  const a = cleanData({ sets: [{ ...base, runs: [{ at: 100, score: 500, correct: 1, total: 1 }], best: { quiz: 500 } }] });
  const b = cleanData({ sets: [{ ...base, runs: [{ at: 200, score: 900, correct: 1, total: 1 }], best: { quiz: 900 } }] });
  const merged = mergeData(a, b).sets[0];
  assert.deepEqual(merged.runs.map((r) => r.at), [200, 100]);
  assert.equal(merged.best.quiz, 900);
  assert.equal(merged.kind, 'quiz');
});

test('分享: 题目集带着选项和对错; 老的分享链接照样是卡片集', async () => {
  const quiz = { title: '诗歌小测', description: '', termLang: 'auto', defLang: 'auto', kind: 'quiz', cards: [card('Which?', choice(['Simile', 'Metaphor', 'Stanza'], [0, 1], 30), { def: 'Simile; Metaphor' }), card('A quatrain has six lines.', { type: 'tf', options: [], correct: [1], time: 10 }, { def: '错' })] };
  const back = await decodeShare(await encodeShare(quiz));
  assert.equal(back.kind, 'quiz');
  assert.deepEqual(back.cards[0].q, choice(['Simile', 'Metaphor', 'Stanza'], [0, 1], 30));
  assert.deepEqual(back.cards[1].q, { type: 'tf', options: [], correct: [1], time: 10 });
  const plain = await decodeShare(await encodeShare({ title: 't', cards: [{ term: 'a', def: 'b' }] }));
  assert.equal(plain.kind, 'cards');
  assert.equal('q' in plain.cards[0], false);
});
