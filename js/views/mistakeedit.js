// 记一道错题 / 改错题: 文章 (可以不写)、题目; 选择题写选项, 点「对」和「我选的」; 填空题写对的答案和当时写的; 为什么错。

import { h, toast } from '../dom.js';
import { newId } from '../store.js';
import { LETTERS, MIN_OPTIONS, MAX_OPTIONS, newMistake, mistakeProblem, tidyMistake } from '../mistakes.js';

export function renderMistakeEdit({ store, go }, id = null) {
  const existing = id ? store.getMistake(id) : null;
  if (id && !existing) {
    return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '找不到这道错题'), h('a', { class: 'btn primary', href: '#/mistakes' }, '回错题集')) };
  }
  let draft = existing ? structuredClone(existing) : newMistake(newId());
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  const typeBtns = [
    ['choice', '选择题'],
    ['input', '填空题'],
  ].map(([type, label]) => h('button', { class: 'chip', type: 'button', onclick: () => ((draft.type = type), markDirty(), draw()) }, label));
  const passageEl = h('textarea', { class: 'input mk-passage-input', rows: 5, placeholder: 'SAT 阅读写作题的那段文字、数学题给的条件……', 'aria-label': '文章', oninput: () => ((draft.passage = passageEl.value), markDirty()) });
  const questionEl = h('textarea', { class: 'input', rows: 3, placeholder: '比如 Which choice completes the text with the most logical and precise word or phrase?', 'aria-label': '题目', oninput: () => ((draft.question = questionEl.value), markDirty()) });
  const noteEl = h('textarea', { class: 'input', rows: 3, placeholder: '比如「没看清问的是 NOT」「把 x 当成了 y」, 或者把解析抄下来', 'aria-label': '为什么错', oninput: () => ((draft.note = noteEl.value), markDirty()) });
  const answerEl = h('input', { class: 'input', placeholder: '比如 3/4 (3/4 和 0.75 都算对; 几个都对的用逗号隔开)', 'aria-label': '对的答案', autocomplete: 'off', oninput: () => ((draft.answer = answerEl.value), markDirty()) });
  const mineTextEl = h('input', { class: 'input', placeholder: '当时写的 (可以不写)', 'aria-label': '当时写的', autocomplete: 'off', oninput: () => ((draft.mineText = mineTextEl.value), markDirty()) });
  const answersEl = h('div', { class: 'mk-answers' });
  const problemEl = h('p', { class: 'qe-problem', hidden: true });

  function fillInputs() {
    passageEl.value = draft.passage;
    questionEl.value = draft.question;
    noteEl.value = draft.note;
    answerEl.value = draft.answer;
    mineTextEl.value = draft.mineText;
  }

  function draw() {
    typeBtns.forEach((b, i) => b.classList.toggle('on', ['choice', 'input'][i] === draft.type));
    problemEl.hidden = true;
    if (draft.type === 'input') {
      answersEl.replaceChildren(h('label', { class: 'ask-label' }, '对的答案'), answerEl, h('label', { class: 'ask-label' }, '我当时写的'), mineTextEl);
      return;
    }
    if (draft.options.length < MIN_OPTIONS) draft.options = ['', '', '', ''];
    const rows = draft.options.map((text, i) => {
      const input = h('input', { class: 'qe-opt-input', value: text, placeholder: `选项 ${LETTERS[i]}`, 'aria-label': `选项 ${LETTERS[i]}`, autocomplete: 'off', oninput: () => ((draft.options[i] = input.value), markDirty()) });
      const right = draft.correct === i;
      const mine = draft.mine === i;
      return h(
        'div',
        { class: `mk-opt${right ? ' right' : ''}${mine ? ' mine' : ''}` },
        h('span', { class: 'mk-letter' }, LETTERS[i]),
        input,
        h(
          'button',
          {
            type: 'button',
            class: `mk-mark ok${right ? ' on' : ''}`,
            'aria-pressed': String(right),
            title: '这个是对的',
            onclick: () => {
              draft.correct = right ? -1 : i;
              if (draft.mine === i) draft.mine = -1;
              markDirty();
              draw();
            },
          },
          '✓ 对',
        ),
        h(
          'button',
          {
            type: 'button',
            class: `mk-mark bad${mine ? ' on' : ''}`,
            'aria-pressed': String(mine),
            title: '我当时选的 (错的)',
            onclick: () => {
              if (draft.correct === i) return toast('这个是对的答案呀; 点你当时选错的那个');
              draft.mine = mine ? -1 : i;
              markDirty();
              draw();
            },
          },
          '✕ 我选的',
        ),
        draft.options.length > MIN_OPTIONS
          ? h(
              'button',
              {
                type: 'button',
                class: 'qe-opt-x',
                title: '删掉这个选项',
                'aria-label': `删掉选项 ${LETTERS[i]}`,
                onclick: () => {
                  draft.options.splice(i, 1);
                  const shift = (x) => (x === i ? -1 : x > i ? x - 1 : x);
                  draft.correct = shift(draft.correct);
                  draft.mine = shift(draft.mine);
                  markDirty();
                  draw();
                },
              },
              '✕',
            )
          : null,
      );
    });
    answersEl.replaceChildren(
      h('div', { class: 'mk-opts' }, rows),
      h(
        'div',
        { class: 'row qe-opt-foot' },
        draft.options.length < MAX_OPTIONS ? h('button', { class: 'btn small', type: 'button', onclick: () => (draft.options.push(''), markDirty(), draw(), answersEl.querySelectorAll('.qe-opt-input')[draft.options.length - 1]?.focus()) }, '＋ 加一个选项') : null,
        h('span', { class: 'muted small' }, '点「✓ 对」标出对的答案, 点「✕ 我选的」标出当时选错的那个'),
      ),
    );
  }

  function save(again = false) {
    const m = tidyMistake(draft);
    const problem = mistakeProblem(m);
    if (problem) {
      problemEl.textContent = `⚠ ${problem}`;
      problemEl.hidden = false;
      problemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    try {
      store.putMistake(m);
    } catch {
      toast('存不下了: 浏览器给的空间满了');
      return;
    }
    dirty = false;
    if (!again) {
      toast(existing ? '改好了' : '记好了, 明天开始排进复习');
      return go('#/mistakes');
    }
    // 接着记下一道: 题型留着, 别的清空
    toast('记好了, 接着记下一道');
    draft = { ...newMistake(newId()), type: draft.type };
    fillInputs();
    draw();
    window.scrollTo(0, 0);
    (draft.passage ? questionEl : passageEl).focus();
  }

  fillInputs();
  draw();

  const saveBtn = () => h('button', { class: 'btn primary', onclick: () => save(false) }, '保存');
  return {
    title: existing ? '改错题' : '记一道错题',
    el: h(
      'section',
      { class: 'edit mistake-edit' },
      h('a', { class: 'back', href: '#/mistakes' }, '← 错题集'),
      h('div', { class: 'page-head' }, h('h1', {}, existing ? '改错题' : '记一道错题'), h('div', { class: 'row' }, h('div', { class: 'chips', role: 'group', 'aria-label': '题型' }, typeBtns))),
      h('label', { class: 'ask-label' }, '文章 / 材料 (可以不写)'),
      passageEl,
      h('label', { class: 'ask-label' }, '题目'),
      questionEl,
      answersEl,
      h('label', { class: 'ask-label' }, '为什么错 / 解析'),
      noteEl,
      problemEl,
      h('div', { class: 'row end' }, h('a', { class: 'btn', href: '#/mistakes' }, '取消'), existing ? null : h('button', { class: 'btn', onclick: () => save(true) }, '保存, 再记一道'), saveBtn()),
    ),
    focus: existing ? null : passageEl,
    isDirty: () => dirty,
    canLeave: () => !dirty || confirm('改的东西还没保存, 确定要走吗?'),
  };
}
