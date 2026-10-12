// 测试模式: 出一套卷子, 交卷后打分 (照 Quizlet 的 Test)。
// 题型按 判断 → 选择 → 配对 → 打字 排, 每张卡片只出一次。

import { makeQuestion, makeMatchGroup, shuffle } from './questions.js';
import { grade } from './grade.js';

export const EXAM_TYPES = ['tf', 'mc', 'match', 'written'];
export const MATCH_GROUP = 5; // 一组配对最多几个

export const DEFAULT_EXAM_OPTIONS = {
  count: 20,
  types: { tf: true, mc: true, match: true, written: true },
  answerWith: 'def',
  smart: true,
};

// 把 n 道题分给几种题型, 前面的多分一道
export function splitCount(n, k) {
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

// 把 m 个配对分成几组, 每组差不多大, 不超过 MATCH_GROUP
export function matchGroups(items) {
  const g = Math.ceil(items.length / MATCH_GROUP);
  const sizes = splitCount(items.length, g);
  const out = [];
  let at = 0;
  for (const size of sizes) {
    out.push(items.slice(at, at + size));
    at += size;
  }
  return out;
}

// 返回 { sections: [{ type, questions }] }, 每道题 (配对是每个小题) 有 qid
export function buildExam(cards, options = {}, pool = cards, rng = Math.random) {
  const opts = { ...DEFAULT_EXAM_OPTIONS, ...options, types: { ...DEFAULT_EXAM_OPTIONS.types, ...options.types } };
  const picked = EXAM_TYPES.filter((t) => opts.types[t]);
  const enabled = picked.length ? picked : ['written'];
  const n = Math.max(1, Math.min(opts.count, cards.length));
  const chosen = shuffle(cards, rng).slice(0, n);

  const counts = splitCount(n, enabled.length);
  // 配对至少要两张, 只分到一张的给打字 (没开打字就给别的题型)
  // (只开了配对又只有一张, 下面会变成打字)
  const mi = enabled.indexOf('match');
  if (mi !== -1 && counts[mi] === 1 && enabled.length > 1) {
    const wi = enabled.indexOf('written');
    counts[wi !== -1 ? wi : enabled.findIndex((t) => t !== 'match')]++;
    counts[mi] = 0;
  }

  const byType = Object.fromEntries(EXAM_TYPES.map((t) => [t, []]));
  let at = 0;
  enabled.forEach((type, i) => {
    const slice = chosen.slice(at, at + counts[i]);
    at += counts[i];
    if (type === 'match') {
      for (const group of matchGroups(slice)) {
        if (group.length < 2) {
          byType.written.push(makeQuestion('written', group[0], pool, { answerWith: opts.answerWith, rng }));
        } else {
          byType.match.push(makeMatchGroup(group, { answerWith: opts.answerWith, rng }));
        }
      }
    } else {
      for (const card of slice) {
        const q = makeQuestion(type, card, pool, { answerWith: opts.answerWith, rng });
        byType[q.type].push(q); // 卡片太少出不了的, 已经变成打字
      }
    }
  });

  let id = 0;
  const sections = [];
  for (const type of EXAM_TYPES) {
    if (byType[type].length === 0) continue;
    for (const q of byType[type]) {
      if (type === 'match') for (const item of q.items) item.qid = `q${++id}`;
      else q.qid = `q${++id}`;
    }
    sections.push({ type, questions: byType[type] });
  }
  return { sections, total: id, options: opts };
}

// 每个小题: [{ qid, card, given, correct, close }]。answers 是 { qid: 答案 }:
// 判断题 true / false, 选择题、配对是选项的序号, 打字是写的字
export function gradeExam(exam, answers, { smart = exam.options?.smart ?? true } = {}) {
  const results = [];
  for (const section of exam.sections) {
    for (const q of section.questions) {
      if (section.type === 'match') {
        for (const item of q.items) {
          const given = answers[item.qid];
          const correct = given !== undefined && given !== null && q.options[given] === item.answer;
          results.push({ qid: item.qid, card: item.card, given, correct, close: false });
        }
        continue;
      }
      const given = answers[q.qid];
      let correct = false;
      let close = false;
      if (section.type === 'tf') correct = given === q.isTrue;
      else if (section.type === 'mc') correct = given === q.correctIndex;
      else if (typeof given === 'string') ({ correct, close } = grade(given, q.answer, { smart }));
      results.push({ qid: q.qid, card: q.card, given, correct, close });
    }
  }
  return results;
}

export function countAnswered(exam, answers) {
  let n = 0;
  for (const section of exam.sections) {
    for (const q of section.questions) {
      const qids = section.type === 'match' ? q.items.map((x) => x.qid) : [q.qid];
      for (const qid of qids) {
        const v = answers[qid];
        if (v === undefined || v === null) continue;
        if (typeof v === 'string' && !v.trim()) continue;
        n++;
      }
    }
  }
  return n;
}
