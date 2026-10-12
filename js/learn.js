// 学习模式怎么排题 (照 Quizlet 的 Learn):
// 每张卡片有个程度: 0 没学过, 1 认得了, 2 掌握了。
//   - 没学过的先出选择题 / 判断题 (认), 答对变「认得了」
//   - 认得了的出打字题 (写), 答对就「掌握了」
//   - 答错程度不升 (掌握了的答错退回认得了), 这一轮后面再问一次
// 一轮最多 7 张, 一轮完了歇一下看看进度, 直到全部掌握。

import { makeQuestion, shuffle } from './questions.js';

export const NEW = 0;
export const LEARNING = 1;
export const MASTERED = 2;

export const DEFAULT_LEARN_OPTIONS = {
  types: { mc: true, tf: false, written: true },
  answerWith: 'def',
  smart: true,
  roundSize: 7,
};

export class LearnSession {
  // levels: { 卡片 id: 0 | 1 | 2 }
  constructor(cards, levels = {}, options = {}, rng = Math.random) {
    this.cards = cards;
    this.pool = cards;
    this.levels = { ...levels };
    this.options = { ...DEFAULT_LEARN_OPTIONS, ...options, types: { ...DEFAULT_LEARN_OPTIONS.types, ...options.types } };
    this.rng = rng;
    this.order = shuffle(cards, rng); // 每次打开顺序不一样
    this.queue = [];
    this.retried = new Set();
    this.round = 0;
    this.roundCards = [];
    this.roundResults = []; // { card, correct }
    this.current = null;
  }

  level(card) {
    return this.levels[card.id] ?? NEW;
  }

  counts() {
    const out = { new: 0, learning: 0, mastered: 0, total: this.cards.length };
    for (const c of this.cards) {
      const l = this.level(c);
      if (l >= MASTERED) out.mastered++;
      else if (l === LEARNING) out.learning++;
      else out.new++;
    }
    return out;
  }

  done() {
    return this.cards.every((c) => this.level(c) >= MASTERED);
  }

  // 开新的一轮: 先挑认得了的 (快掌握了), 再挑没学过的
  startRound() {
    const open = this.order.filter((c) => this.level(c) < MASTERED);
    const learning = open.filter((c) => this.level(c) === LEARNING);
    const fresh = open.filter((c) => this.level(c) === NEW);
    this.roundCards = [...learning, ...fresh].slice(0, this.options.roundSize);
    this.queue = shuffle(this.roundCards, this.rng);
    this.retried = new Set();
    this.roundResults = [];
    this.round++;
    return this.roundCards.length;
  }

  // 这张卡片该出什么题
  typeFor(card) {
    const { mc, tf, written } = this.options.types;
    const recognize = [mc && 'mc', tf && 'tf'].filter(Boolean);
    const pickRecognize = () => recognize[Math.floor(this.rng() * recognize.length)];
    if (this.level(card) === NEW) return recognize.length ? pickRecognize() : 'written';
    return written ? 'written' : recognize.length ? pickRecognize() : 'written';
  }

  // 下一道题; 这一轮完了返回 null
  next() {
    const card = this.queue[0];
    if (!card) {
      this.current = null;
      return null;
    }
    this.current = makeQuestion(this.typeFor(card), card, this.pool, {
      answerWith: this.options.answerWith,
      rng: this.rng,
    });
    return this.current;
  }

  // 答对升一级; 不出认的题时 (只开了打字), 答对一次就算掌握
  promote(before) {
    const { mc, tf } = this.options.types;
    return !mc && !tf ? MASTERED : Math.min(MASTERED, before + 1);
  }

  // 答完当前这题。返回卡片新的程度
  answer(correct) {
    const q = this.current;
    if (!q) return null;
    const card = this.queue.shift();
    const before = this.level(card);
    let after = before;
    let requeued = false;
    if (correct) {
      after = this.promote(before);
    } else {
      if (before >= MASTERED) after = LEARNING;
      // 这一轮后面再问一次 (只再问一次, 不然一直卡在这张)
      if (!this.retried.has(card.id)) {
        this.retried.add(card.id);
        this.queue.push(card);
        requeued = true;
      }
    }
    this.levels[card.id] = after;
    this.roundResults.push({ card, correct, type: q.type, before, requeued });
    this.current = null;
    return after;
  }

  // 答错了但用户说「我答对了」: 把刚才那次改成对的
  override() {
    const last = this.roundResults.at(-1);
    if (!last || last.correct) return null;
    last.correct = true;
    if (last.requeued) {
      const i = this.queue.lastIndexOf(last.card);
      if (i !== -1) this.queue.splice(i, 1);
      this.retried.delete(last.card.id);
    }
    this.levels[last.card.id] = this.promote(last.before);
    return this.levels[last.card.id];
  }
}
