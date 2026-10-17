// 游戏里出的题 (方块、宝石): 照 Quizlet 摆在棋盘旁边, 不弹窗口 (手机上从下面升上来)。
// 选择题或打字题; 不会就点「不知道」看答案。答对了一会儿自己往下走, 答错了看一眼答案再点「继续」。

import { h, fill, dialogOpen } from '../dom.js';
import { makeQuestion, otherSide } from '../questions.js';
import { grade } from '../grade.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { quizCards, textSize } from '../games.js';
import { sound } from './match.js';

export { quizCards };

// prefs: { answerWith: 'def' | 'term', type: 'mc' | 'written' }, 改了下一题就用新的
export function quizPanel({ store, set, prefs }) {
  const pool = quizCards(set.cards);
  const el = h('div', { class: 'quiz-panel', hidden: true });
  let keys = null; // 现在这题的键盘: { choose(i), next() }
  let timer = null;

  // 出一题; 答完 (答对一会儿后, 答错点了继续) 调 onAnswer(答对没有)
  function ask({ title = '', onAnswer }) {
    clearTimeout(timer);
    const card = pool[Math.floor(Math.random() * pool.length)];
    const q = makeQuestion(prefs.type, card, set.cards, { answerWith: prefs.answerWith });
    const image = q.side === 'term' ? card.image : '';
    let answered = false;
    const feedback = h('div', { class: 'qp-feedback', 'aria-live': 'polite' });
    const foot = h('div', { class: 'qp-foot' });

    const finish = (correct, { skipped = false } = {}) => {
      if (answered) return;
      answered = true;
      store.recordAnswer(set.id, card.id, correct);
      sound(correct ? 'right' : 'wrong');
      el.classList.add(correct ? 'good' : 'bad');
      let gone = false;
      const go = () => {
        if (gone) return; // 点两下「继续」只算一次
        gone = true;
        clearTimeout(timer);
        keys = null;
        onAnswer(correct);
      };
      if (correct) {
        fill(feedback, h('strong', { class: 'qp-good' }, '答对了!'));
        foot.replaceChildren();
        timer = setTimeout(go, 750);
        keys = { next: go };
        return;
      }
      fill(
        feedback,
        h('strong', { class: 'qp-bad' }, skipped ? '没关系, 记一下' : '答错了'),
        q.type === 'mc' ? null : h('div', { class: 'qp-answer' }, h('span', { class: 'muted small' }, '正确答案'), h('div', {}, rich(q.answer))),
      );
      const next = h('button', { class: 'btn primary', onclick: go }, '继续');
      foot.replaceChildren(next);
      keys = { next: go };
      next.focus();
    };

    let answers;
    let skip; // 「不知道」
    if (q.type === 'mc') {
      const buttons = q.options.map((opt, i) =>
        h(
          'button',
          {
            class: `qp-option ${textSize(opt, [18, 40, 90])}`,
            onclick: () => {
              if (answered) return;
              for (const b of buttons) b.disabled = true;
              buttons[q.correctIndex].classList.add('right');
              if (i !== q.correctIndex) buttons[i].classList.add('wrong');
              finish(i === q.correctIndex);
            },
          },
          h('span', { class: 'qp-key', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', { class: 'qp-option-text' }, rich(opt)),
        ),
      );
      answers = h('div', { class: 'qp-options' }, buttons);
      keys = {
        choose: (i) => buttons[i]?.click(),
      };
      skip = () => {
        for (const b of buttons) b.disabled = true;
        buttons[q.correctIndex].classList.add('right');
        finish(false, { skipped: true });
      };
    } else {
      const input = h('input', { class: 'input', type: 'text', placeholder: `写出${q.side === 'def' ? '解释' : '词'}`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '答案' });
      const submit = () => {
        if (answered || !input.value.trim()) return;
        input.disabled = true;
        finish(grade(input.value, q.answer).correct);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          if (answered) keys?.next?.();
          else submit();
        }
      });
      answers = h('div', { class: 'qp-written' }, input, h('button', { class: 'btn primary', onclick: submit }, '答'));
      keys = {};
      skip = () => {
        input.disabled = true;
        finish(false, { skipped: true });
      };
      setTimeout(() => input.focus({ preventScroll: true }), 0);
    }
    foot.replaceChildren(h('button', { class: 'btn qp-skip', onclick: skip }, '不知道'));

    el.className = 'quiz-panel';
    el.hidden = false;
    fill(
      el,
      title ? h('div', { class: 'qp-title' }, title) : null,
      h(
        'div',
        { class: `qp-prompt ${textSize(q.prompt, [20, 60, 140])}` },
        cardImage(image, 'qp-img'),
        h('div', { class: 'qp-prompt-text' }, rich(q.prompt)),
        sayButton(card, otherSide(q.side), set),
      ),
      h('div', { class: 'qp-label muted small' }, `${q.type === 'mc' ? '选出' : '写出'}${q.side === 'def' ? '对的解释' : '对的词'}`),
      answers,
      feedback,
      foot,
    );
  }

  function hide() {
    clearTimeout(timer);
    keys = null;
    el.hidden = true;
    el.replaceChildren();
  }

  // 键盘: 1–4 选, 回车继续 (焦点在输入框里时输入框自己管)
  function onKey(e) {
    if (!keys || el.hidden || dialogOpen() || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return false;
    if (keys.choose && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      keys.choose(Number(e.key) - 1);
      return true;
    }
    if (keys.next && e.key === 'Enter' && !e.target.closest?.('button')) {
      e.preventDefault();
      keys.next();
      return true;
    }
    return false;
  }

  return { el, ask, hide, onKey, stop: () => clearTimeout(timer) };
}
