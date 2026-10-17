// 重做错题: 先不给答案, 再做一遍。做完看对没对、对的答案、当时选错的、为什么错。
// 做对了隔得越来越久再出, 连对 3 次算掌握; 又错了很快再来。
//   #/mistakes/review       今天该重做的
//   #/mistakes/review/all   还没掌握的全做一遍
//   #/mistakes/review/<id>  只做这一道

import { h, fill, dialogOpen } from '../dom.js';
import { rich } from '../cardview.js';
import { shuffle } from '../questions.js';
import { LETTERS, MASTER_STREAK, dueMistakes, checkMistake, answerLabel, mineLabel } from '../mistakes.js';
import { sound } from './match.js';

export function renderMistakeReview({ store }, which = null) {
  const all = store.allMistakes();
  let list;
  if (!which) list = dueMistakes(all);
  else if (which === 'all') list = shuffle(all.filter((m) => !m.review?.mastered));
  else list = all.filter((m) => m.id === which);

  const root = h('section', { class: 'mk-review' });
  if (!list.length) {
    root.append(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '✓'),
        h('h1', {}, which === 'all' ? '没有还没掌握的错题' : which ? '找不到这道错题' : '今天没有要重做的错题'),
        h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: '#/mistakes' }, '回错题集')),
      ),
    );
    return { title: '重做错题', el: root };
  }

  let i = 0;
  const results = []; // { m, correct }
  let keys = null;

  function show() {
    const m = list[i];
    let answered = false;
    const counter = h('span', { class: 'muted' }, `${i + 1} / ${list.length}`);
    const feedback = h('div', { class: 'mk-feedback', hidden: true });

    function finish(given) {
      if (answered) return;
      answered = true;
      const correct = checkMistake(m, given);
      const review = store.recordMistake(m.id, correct);
      results.push({ m, correct, mastered: review?.mastered });
      sound(correct ? 'right' : 'wrong');
      const left = MASTER_STREAK - (review?.streak ?? 0);
      const mine = mineLabel(m);
      const last = i + 1 >= list.length;
      const next = h('button', { class: 'btn primary', onclick: () => goNext() }, last ? '看结果' : '下一题');
      feedback.className = `mk-feedback ${correct ? 'good' : 'bad'}`;
      feedback.hidden = false;
      fill(
        feedback,
        h('strong', {}, correct ? (review?.mastered ? '答对了! 连对 3 次, 这道掌握了 🎉' : `答对了! 再连对 ${left} 次算掌握`) : '又错了, 很快会再出这道'),
        h('div', { class: 'mk-line ok' }, h('span', { class: 'mk-line-label' }, '✓ 对的'), rich(answerLabel(m))),
        mine ? h('div', { class: 'mk-line bad' }, h('span', { class: 'mk-line-label' }, '✕ 上次选的'), rich(mine)) : null,
        m.note ? h('div', { class: 'mk-note' }, h('div', { class: 'mk-line-label' }, '为什么错'), rich(m.note)) : null,
        h('div', { class: 'row end' }, h('a', { class: 'btn', href: `#/mistakes/${encodeURIComponent(m.id)}/edit` }, '改这道题'), next),
      );
      keys = { next: goNext };
      next.focus({ preventScroll: true });
      feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    let answerArea;
    if (m.type === 'choice') {
      const buttons = m.options.map((opt, j) =>
        h(
          'button',
          {
            class: 'option',
            onclick: () => {
              if (answered) return;
              for (const b of buttons) b.disabled = true;
              buttons[m.correct]?.classList.add('right');
              if (j !== m.correct) buttons[j].classList.add('wrong');
              finish(j);
            },
          },
          h('span', { class: 'key' }, LETTERS[j]),
          h('span', { class: 'option-text' }, rich(opt)),
        ),
      );
      answerArea = h('div', { class: 'mk-options' }, buttons);
      keys = { pick: (j) => buttons[j]?.click() };
    } else {
      const input = h('input', { class: 'input', type: 'text', placeholder: '写答案 (分数、小数都行)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '答案' });
      const submit = () => {
        if (answered || !input.value.trim()) return;
        input.disabled = true;
        finish(input.value);
        if (!results.at(-1).correct) input.classList.add('wrong');
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          submit();
        }
      });
      answerArea = h('div', { class: 'written' }, h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: submit }, '答')));
      keys = {};
      setTimeout(() => input.focus({ preventScroll: true }), 0);
    }

    const questionBlock = h('div', { class: 'mk-q-side' }, h('div', { class: 'mk-question big' }, rich(m.question)), answerArea, feedback);
    root.replaceChildren(
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: '#/mistakes' }, '← 错题集'), counter),
      h('div', { class: `mk-paper${m.passage ? ' with-passage' : ''}` }, m.passage ? h('div', { class: 'mk-passage' }, rich(m.passage)) : null, questionBlock),
    );
    window.scrollTo(0, 0);
  }

  function goNext() {
    keys = null;
    i++;
    if (i < list.length) show();
    else done();
  }

  function done() {
    const right = results.filter((r) => r.correct).length;
    const newlyMastered = results.filter((r) => r.mastered).length;
    const wrong = results.filter((r) => !r.correct).map((r) => r.m);
    sound('done');
    root.replaceChildren(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, right === results.length ? '🎉' : '📕'),
        h('h1', {}, '重做完了'),
        h('div', { class: `big-score ${right === results.length ? 'good' : 'mid'}` }, `${right} / ${results.length}`),
        h('p', { class: 'muted' }, `${newlyMastered ? `新掌握 ${newlyMastered} 道 · ` : ''}做错的会很快再出, 做对的隔几天再来`),
        h(
          'div',
          { class: 'row center' },
          wrong.length
            ? h(
                'button',
                {
                  class: 'btn primary',
                  onclick: () => {
                    list = wrong;
                    i = 0;
                    results.length = 0;
                    show();
                  },
                },
                `做错的 ${wrong.length} 道再来一次`,
              )
            : null,
          h('a', { class: `btn${wrong.length ? '' : ' primary'}`, href: '#/mistakes' }, '回错题集'),
        ),
      ),
    );
  }

  // 键盘: 1–6 或 A–F 选, 回车下一题
  function onKey(e) {
    if (!keys || dialogOpen() || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const letter = LETTERS.indexOf(e.key.toUpperCase());
    if (keys.pick && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      keys.pick(Number(e.key) - 1);
    } else if (keys.pick && e.key.length === 1 && letter >= 0) {
      e.preventDefault();
      keys.pick(letter);
    } else if (keys.next && e.key === 'Enter' && !e.target.closest?.('button, a')) {
      e.preventDefault();
      keys.next();
    }
  }
  document.addEventListener('keydown', onKey);
  show();
  return { title: '重做错题', el: root, cleanup: () => document.removeEventListener('keydown', onKey) };
}
