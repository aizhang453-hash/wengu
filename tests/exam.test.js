import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExam, gradeExam, countAnswered, splitCount, matchGroups } from '../js/exam.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const cards = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, term: `term${i}`, def: `def${i}` }));

function allQuestions(exam) {
  return exam.sections.flatMap((s) => (s.type === 'match' ? s.questions.flatMap((g) => g.items) : s.questions));
}

test('分题数', () => {
  assert.deepEqual(splitCount(10, 4), [3, 3, 2, 2]);
  assert.deepEqual(splitCount(3, 4), [1, 1, 1, 0]);
  assert.deepEqual(matchGroups([1, 2, 3, 4, 5, 6]).map((g) => g.length), [3, 3]);
  assert.deepEqual(matchGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).map((g) => g.length), [4, 4, 3]);
});

test('20 题, 四种题型都有, 每张卡片只出一次, qid 不重复', () => {
  const exam = buildExam(cards, { count: 20 }, cards, seeded(3));
  assert.equal(exam.total, 20);
  assert.deepEqual(
    exam.sections.map((s) => s.type),
    ['tf', 'mc', 'match', 'written'],
  );
  const qs = allQuestions(exam);
  assert.equal(qs.length, 20);
  assert.equal(new Set(qs.map((q) => q.card.id)).size, 20);
  assert.equal(new Set(qs.map((q) => q.qid)).size, 20);
});

test('题数比卡片多就全出', () => {
  const exam = buildExam(cards.slice(0, 6), { count: 50 }, undefined, seeded(1));
  assert.equal(exam.total, 6);
});

test('配对只分到一张时给打字', () => {
  // 3 题分给 4 种: 判断 1、选择 1、配对 1 → 配对那张给打字
  const exam = buildExam(cards, { count: 3 }, cards, seeded(2));
  assert.deepEqual(
    exam.sections.map((s) => [s.type, s.questions.length]),
    [
      ['tf', 1],
      ['mc', 1],
      ['written', 1],
    ],
  );
});

test('只开配对、只有一张: 变成打字', () => {
  const exam = buildExam(cards.slice(0, 1), { types: { tf: false, mc: false, match: true, written: false } }, undefined, seeded(2));
  assert.deepEqual(
    exam.sections.map((s) => s.type),
    ['written'],
  );
});

test('打分: 全对、全错、没答', () => {
  const exam = buildExam(cards, { count: 12 }, cards, seeded(5));
  const right = {};
  const wrongAns = {};
  for (const s of exam.sections) {
    for (const q of s.questions) {
      if (s.type === 'tf') {
        right[q.qid] = q.isTrue;
        wrongAns[q.qid] = !q.isTrue;
      } else if (s.type === 'mc') {
        right[q.qid] = q.correctIndex;
        wrongAns[q.qid] = (q.correctIndex + 1) % q.options.length;
      } else if (s.type === 'match') {
        for (const item of q.items) {
          right[item.qid] = q.options.indexOf(item.answer);
          wrongAns[item.qid] = (q.options.indexOf(item.answer) + 1) % q.options.length;
        }
      } else {
        right[q.qid] = q.answer.toUpperCase();
        wrongAns[q.qid] = 'nope';
      }
    }
  }
  assert.ok(gradeExam(exam, right).every((r) => r.correct));
  assert.ok(gradeExam(exam, wrongAns).every((r) => !r.correct));
  assert.ok(gradeExam(exam, {}).every((r) => !r.correct));
  assert.equal(countAnswered(exam, right), 12);
  assert.equal(countAnswered(exam, {}), 0);
  assert.equal(countAnswered(exam, { q1: false, q2: '  ' }), 1);
});

test('打字题用智能判分', () => {
  const exam = buildExam(
    [
      { id: 'a', term: 'river', def: '河 (一条河)' },
      { id: 'b', term: 'elephant', def: '大象' },
    ],
    { types: { tf: false, mc: false, match: false, written: true }, answerWith: 'def' },
    undefined,
    seeded(1),
  );
  const qs = exam.sections[0].questions;
  const ans = Object.fromEntries(qs.map((q) => [q.qid, q.card.id === 'a' ? '河' : '大象']));
  assert.ok(gradeExam(exam, ans).every((r) => r.correct));
  assert.ok(gradeExam(exam, ans, { smart: false }).some((r) => !r.correct));
});
