// 重做错题: 先不给答案, 再做一遍。做完看对没对、对的答案、当时选错的、为什么错。
// 做对了隔得越来越久再出, 连对 3 次算掌握; 又错了很快再来。
//   #/mistakes/review       今天该重做的
//   #/mistakes/review/all   还没掌握的全做一遍
//   #/mistakes/review/<id>  只做这一道
//   #/mistakes/review/kind:<题型>  这类还没掌握的全做一遍

import { h, fill, dialogOpen, openDialog, icon } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { shuffle } from '../questions.js';
import { LETTERS, MASTER_STREAK, dueMistakes, checkMistake, answerLabel, mineLabel, kindOf } from '../mistakes.js';
import { sound } from './match.js';

export function renderMistakeReview({ store }, which = null) {
  const all = store.allMistakes();
  let list;
  if (!which) list = dueMistakes(all);
  else if (which === 'all') list = shuffle(all.filter((m) => !m.review?.mastered));
  else if (which.startsWith('kind:')) list = shuffle(all.filter((m) => !m.review?.mastered && kindOf(m) === which.slice(5)));
  else list = all.filter((m) => m.id === which);

  const root = h('section', { class: 'mk-review' });
  if (!list.length) {
    root.append(
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '✓'),
        h('h1', {}, which === 'all' ? '没有未掌握的错题' : which?.startsWith('kind:') ? `「${which.slice(5)}」已全部掌握` : which ? '错题不存在' : '今日没有待重做的错题'),
        h('div', { class: 'row center' }, h('a', { class: 'btn primary', href: '#/mistakes' }, '返回错题集')),
      ),
    );
    return { title: '重做错题', el: root };
  }

  // 题目的图片: 点一下放大看
  const images = (ids) =>
    ids.length
      ? h(
          'div',
          { class: 'mk-images' },
          ids.map((id) => h('button', { class: 'mk-image-btn', type: 'button', title: '查看大图', onclick: () => openDialog({ title: '图片', body: cardImage(id, 'mk-img-big') }) }, cardImage(id, 'mk-img'))),
        )
      : null;

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
      const next = h('button', { class: 'btn primary', onclick: () => goNext() }, last ? '查看结果' : '下一题');
      feedback.className = `mk-feedback ${correct ? 'good' : 'bad'}`;
      feedback.hidden = false;
      fill(
        feedback,
        h('strong', {}, correct ? (review?.mastered ? '回答正确，已连续答对 3 次，此题已掌握' : `回答正确，再连续答对 ${left} 次即为掌握`) : '回答错误，此题将很快再次出现'),
        h('div', { class: 'mk-line ok' }, h('span', { class: 'mk-line-label' }, '正确答案'), rich(answerLabel(m))),
        mine ? h('div', { class: 'mk-line bad' }, h('span', { class: 'mk-line-label' }, '上次答案'), rich(mine)) : null,
        m.note ? h('div', { class: 'mk-note' }, h('div', { class: 'mk-line-label' }, '解析'), rich(m.note)) : null,
        h('div', { class: 'row end' }, h('a', { class: 'btn', href: `#/mistakes/${encodeURIComponent(m.id)}/edit` }, '编辑'), next),
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
      const input = h('input', { class: 'input', type: 'text', placeholder: '输入答案（可填分数或小数）', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': '答案' });
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
      answerArea = h('div', { class: 'written' }, h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: submit }, '提交')));
      keys = {};
      setTimeout(() => input.focus({ preventScroll: true }), 0);
    }

    // 有文章: 左边文章 (图片跟着文章), 右边题目; 没文章: 图片放在题目上面
    const side = m.passage ? h('div', { class: 'mk-passage-side' }, h('div', { class: 'mk-passage' }, rich(m.passage)), images(m.images)) : null;
    const questionBlock = h('div', { class: 'mk-q-side' }, m.passage ? null : images(m.images), m.question ? h('div', { class: 'mk-question big' }, rich(m.question)) : null, answerArea, feedback);
    root.replaceChildren(
      h('div', { class: 'cards-head' }, h('a', { class: 'back', href: '#/mistakes' }, '← 错题集'), counter),
      h('div', { class: `mk-paper${m.passage ? ' with-passage' : ''}` }, side, questionBlock),
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
        h('div', { class: 'done-mark', 'aria-hidden': 'true' }, icon('check', 28)),
        h('h1', {}, '重做完成'),
        h('div', { class: `big-score ${right === results.length ? 'good' : 'mid'}` }, `${right} / ${results.length}`),
        h('p', { class: 'muted' }, `${newlyMastered ? `新掌握 ${newlyMastered} 道 · ` : ''}答错的题将很快再次出现，答对的按间隔安排`),
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
                `重做答错的 ${wrong.length} 道`,
              )
            : null,
          h('a', { class: `btn${wrong.length ? '' : ' primary'}`, href: '#/mistakes' }, '返回错题集'),
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
