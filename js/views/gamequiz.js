// 游戏里出的题 (方块、宝石): 一个弹出窗口, 选择题或打字题, 可以换一题。
// 答完点「继续」才关, 关的时候调 onAnswer(答对没有)。

import { h, openDialog, fill } from '../dom.js';
import { makeQuestion, otherSide } from '../questions.js';
import { grade } from '../grade.js';
import { rich, cardImage, sayButton } from '../cardview.js';
import { playSound } from '../sound.js';

// 词和解释都有字的卡片才拿来出题
export function quizCards(cards) {
  return cards.filter((c) => c.term.trim() && c.def.trim());
}

export function askGameQuestion({ store, set, title, reward = '', answerWith = 'def', type = 'mc', sound = true, onAnswer }) {
  const pool = quizCards(set.cards);
  let answered = null;
  const body = h('div', { class: 'game-quiz' });
  const footer = h('div', { class: 'row game-quiz-foot' });

  function newQuestion() {
    answered = null;
    const card = pool[Math.floor(Math.random() * pool.length)];
    const q = makeQuestion(type, card, set.cards, { answerWith });
    const imageInPrompt = q.side === 'term' ? card.image : '';
    const prompt = h(
      'div',
      { class: 'q-prompt' },
      h('div', {}, h('div', { class: 'q-label muted small' }, q.side === 'def' ? '词' : '解释'), cardImage(imageInPrompt, 'q-img small'), h('div', { class: 'q-text' }, rich(q.prompt))),
      sayButton(card, otherSide(q.side), set),
    );
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });

    const finish = (correct) => {
      answered = correct;
      store.recordAnswer(set.id, card.id, correct);
      if (sound) playSound(correct ? 'right' : 'wrong');
      feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
      fill(feedback, h('strong', {}, correct ? `答对了! ${reward}` : '答错了'), correct ? null : h('div', { class: 'answer-line' }, h('span', { class: 'muted small' }, '正确答案'), h('div', { class: 'answer-text' }, rich(q.answer))));
      footer.replaceChildren(h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: () => d.close() }, '继续'));
      footer.querySelector('.btn.primary').focus();
    };

    let answerArea;
    if (q.type === 'mc') {
      const buttons = q.options.map((opt, i) =>
        h(
          'button',
          {
            class: 'option',
            onclick: () => {
              if (answered !== null) return;
              for (const b of buttons) b.disabled = true;
              buttons[q.correctIndex].classList.add('right');
              if (i !== q.correctIndex) buttons[i].classList.add('wrong');
              finish(i === q.correctIndex);
            },
          },
          h('span', { class: 'key' }, String(i + 1)),
          h('span', { class: 'option-text' }, rich(opt)),
        ),
      );
      answerArea = h('div', { class: 'options-grid' }, buttons);
      body.choose = (i) => buttons[i]?.click();
    } else {
      const input = h('input', { class: 'input', type: 'text', placeholder: `写出${q.side === 'def' ? '解释' : '词'}`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      const submit = () => {
        if (answered !== null || !input.value.trim()) return;
        input.disabled = true;
        finish(grade(input.value, q.answer).correct);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          submit();
        }
      });
      answerArea = h('div', { class: 'written' }, h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: submit }, '答')));
      body.choose = null;
      setTimeout(() => input.focus(), 0);
    }
    body.replaceChildren(prompt, answerArea, feedback);
    footer.replaceChildren(h('button', { class: 'btn small', title: '不想答这题, 换一题', onclick: newQuestion }, '↻ 换一题'));
  }

  const d = openDialog({
    title,
    body,
    footer,
    closable: false,
    onClose: () => onAnswer(answered === true),
  });
  // 选择题按 1–4
  d.el.addEventListener('keydown', (e) => {
    if (answered === null && body.choose && /^[1-4]$/.test(e.key) && !e.target.closest('input')) {
      e.preventDefault();
      body.choose(Number(e.key) - 1);
    }
  });
  newQuestion();
  return d;
}
