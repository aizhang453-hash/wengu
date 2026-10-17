// 新建 / 编辑题目集 (照 Kahoot 的编辑器): 每道题写题目, 可以放图片;
// 选择题写 2–6 个选项、勾上对的 (勾两个以上就是多选题), 判断题点对或错; 每题自己定限时几秒。

import { h, toast } from '../dom.js';
import { makeSet, makeCard } from '../store.js';
import { putMedia, shrinkImage, cleanMedia } from '../media.js';
import { cardImage } from '../cardview.js';
import { QUIZ_TIMES, DEFAULT_TIME, MAX_OPTIONS, MIN_OPTIONS, SHAPES, newQuestion, cleanQuestion, questionProblem, tidyQuestion } from '../quiz.js';

export function renderQuizEdit({ store, go }, id) {
  const existing = id ? store.getSet(id) : null;
  if (id && (!existing || existing.virtual || existing.kind !== 'quiz')) {
    return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '找不到这个题目集'), h('a', { class: 'btn primary', href: '#/' }, '回首页')) };
  }
  const draft = existing ? structuredClone(existing) : makeSet({ kind: 'quiz' });
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  const titleInput = h('input', { class: 'input big', placeholder: '标题, 比如「诗歌考试」', value: draft.title, maxlength: 200, oninput: markDirty });
  const descInput = h('textarea', { class: 'input', rows: 2, placeholder: '简介 (可以不写)', value: draft.description, oninput: markDirty });

  const listEl = h('ol', { class: 'qe-list' });
  const items = []; // { id, termEl, image, q, li, problemEl, draw }

  function renumber() {
    items.forEach((it, i) => {
      it.numEl.textContent = `第 ${i + 1} 题`;
      it.upBtn.disabled = i === 0;
      it.downBtn.disabled = i === items.length - 1;
    });
  }

  function addItem(card = makeCard('', '', { q: newQuestion('choice', items.at(-1)?.q.time ?? DEFAULT_TIME) }), { focus = false, after = null } = {}) {
    const it = { id: card.id, image: card.image ?? '', q: structuredClone(cleanQuestion(card.q) ?? newQuestion()) };
    it.termEl = h('textarea', { class: 'input qe-question', rows: 2, placeholder: '题目', value: card.term, 'aria-label': '题目', oninput: markDirty });
    it.problemEl = h('p', { class: 'qe-problem', hidden: true });
    it.numEl = h('span', { class: 'qe-num' });

    const typeSel = h(
      'select',
      {
        class: 'input small',
        'aria-label': '题型',
        onchange: () => {
          const time = it.q.time;
          // 换题型: 判断题 ↔ 选择题, 写过的选项留着 (换回来还在)
          if (typeSel.value === 'tf') {
            it.saved = it.q;
            it.q = newQuestion('tf', time);
          } else {
            it.q = it.saved ? { ...it.saved, time } : newQuestion('choice', time);
          }
          markDirty();
          drawAnswers();
        },
      },
      h('option', { value: 'choice' }, '选择题'),
      h('option', { value: 'tf' }, '判断题'),
    );
    typeSel.value = it.q.type;
    const timeSel = h(
      'select',
      { class: 'input small', 'aria-label': '限时', onchange: () => ((it.q.time = Number(timeSel.value)), markDirty()) },
      QUIZ_TIMES.map((t) => h('option', { value: String(t) }, t < 60 ? `${t} 秒` : `${t / 60} 分钟`)),
    );
    timeSel.value = String(it.q.time);

    const move = (d) => {
      const i = items.indexOf(it);
      const j = i + d;
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      if (d < 0) listEl.insertBefore(it.li, items[i].li);
      else listEl.insertBefore(items[i].li, it.li);
      renumber();
      markDirty();
    };
    it.upBtn = h('button', { class: 'icon-btn', type: 'button', title: '往上挪', 'aria-label': '往上挪', onclick: () => move(-1) }, '↑');
    it.downBtn = h('button', { class: 'icon-btn', type: 'button', title: '往下挪', 'aria-label': '往下挪', onclick: () => move(1) }, '↓');
    const copyBtn = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: '复制这道题',
        'aria-label': '复制这道题',
        onclick: () => {
          addItem(makeCard(it.termEl.value, '', { image: it.image, q: structuredClone(it.q) }), { focus: true, after: it });
          markDirty();
        },
      },
      '⧉',
    );
    const delBtn = h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: '删掉这道题',
        'aria-label': '删掉这道题',
        onclick: () => {
          if (items.length === 1) return toast('至少留一道题');
          items.splice(items.indexOf(it), 1);
          it.li.remove();
          renumber();
          markDirty();
        },
      },
      '✕',
    );

    // ---- 图片 ----
    const imageSlot = h('div', { class: 'qe-image' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => (fileInput.files?.[0] && setImage(fileInput.files[0]), (fileInput.value = '')) });
    async function setImage(file) {
      try {
        it.image = await putMedia(await shrinkImage(file));
        markDirty();
        drawImage();
      } catch {
        toast('图片存不进去, 可能浏览器空间满了');
      }
    }
    function drawImage() {
      imageSlot.replaceChildren(
        it.image
          ? h(
              'span',
              { class: 'media-chip image-chip' },
              cardImage(it.image, 'edit-thumb'),
              h('button', { class: 'chip-x', type: 'button', title: '去掉图片', 'aria-label': '去掉图片', onclick: () => ((it.image = ''), markDirty(), drawImage()) }, '✕'),
            )
          : h('button', { class: 'tool-btn', type: 'button', title: '加图片 (也可以直接粘贴进来)', onclick: () => fileInput.click() }, '🖼 加图片'),
        fileInput,
      );
    }

    // ---- 选项 ----
    const answersEl = h('div', { class: 'qe-answers' });
    function drawAnswers() {
      const q = it.q;
      if (q.type === 'tf') {
        answersEl.replaceChildren(
          h('p', { class: 'muted small' }, '这句话对不对? 点对的答案'),
          h(
            'div',
            { class: 'qe-tf' },
            ['对', '错'].map((label, i) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `qe-tf-btn opt-c${i === 0 ? 1 : 0}${q.correct[0] === i ? ' on' : ''}`,
                  'aria-pressed': String(q.correct[0] === i),
                  onclick: () => ((q.correct = [i]), markDirty(), drawAnswers()),
                },
                i === 0 ? '✓ 对' : '✕ 错',
              ),
            ),
          ),
        );
        return;
      }
      const rows = q.options.map((text, i) => {
        const input = h('input', {
          class: 'qe-opt-input',
          value: text,
          placeholder: i < MIN_OPTIONS ? `选项 ${i + 1}` : `选项 ${i + 1} (可以不写)`,
          'aria-label': `选项 ${i + 1}`,
          maxlength: 500,
          oninput: () => ((q.options[i] = input.value), markDirty()),
        });
        const right = q.correct.includes(i);
        return h(
          'div',
          { class: `qe-opt opt-c${i}${right ? ' right' : ''}` },
          h('span', { class: 'qe-shape', 'aria-hidden': 'true' }, SHAPES[i]),
          input,
          h(
            'button',
            {
              type: 'button',
              class: `qe-check${right ? ' on' : ''}`,
              title: right ? '这个是对的 (点一下取消)' : '设成对的答案',
              'aria-label': `选项 ${i + 1} 是对的`,
              'aria-pressed': String(right),
              onclick: () => {
                q.correct = right ? q.correct.filter((x) => x !== i) : [...q.correct, i].sort((a, b) => a - b);
                markDirty();
                drawAnswers();
              },
            },
            '✓',
          ),
          q.options.length > MIN_OPTIONS
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'qe-opt-x',
                  title: '删掉这个选项',
                  'aria-label': `删掉选项 ${i + 1}`,
                  onclick: () => {
                    q.options.splice(i, 1);
                    q.correct = q.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
                    markDirty();
                    drawAnswers();
                  },
                },
                '✕',
              )
            : null,
        );
      });
      answersEl.replaceChildren(
        h('div', { class: 'qe-options' }, rows),
        h(
          'div',
          { class: 'row qe-opt-foot' },
          q.options.length < MAX_OPTIONS ? h('button', { class: 'btn small', type: 'button', onclick: () => (q.options.push(''), markDirty(), drawAnswers(), answersEl.querySelectorAll('.qe-opt-input')[q.options.length - 1]?.focus()) }, '＋ 加一个选项') : null,
          h('span', { class: 'muted small' }, q.correct.length > 1 ? `多选题: ${q.correct.length} 个都对, 全选对才算对` : '点 ✓ 设成对的答案; 设两个以上就是多选题'),
        ),
      );
    }

    it.li = h(
      'li',
      {
        class: 'qe-item',
        onpaste: (e) => {
          const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
          if (file) {
            e.preventDefault();
            setImage(file);
          }
        },
      },
      h('div', { class: 'qe-head' }, it.numEl, typeSel, timeSel, h('span', { class: 'spacer' }), it.upBtn, it.downBtn, copyBtn, delBtn),
      h('div', { class: 'qe-body' }, it.termEl, imageSlot),
      answersEl,
      it.problemEl,
    );
    drawImage();
    drawAnswers();
    if (after) {
      items.splice(items.indexOf(after) + 1, 0, it);
      after.li.after(it.li);
    } else {
      items.push(it);
      listEl.append(it.li);
    }
    renumber();
    if (focus) {
      it.termEl.focus();
      it.li.scrollIntoView({ block: 'nearest' });
    }
    return it;
  }

  for (const card of draft.cards) addItem(card);
  if (!items.length) addItem();

  // 整道题都没写 (没题目、没图片、选项都空) 的保存时不要
  const isBlank = (it) => !it.termEl.value.trim() && !it.image && (it.q.type === 'tf' || it.q.options.every((o) => !o.trim()));

  function save() {
    let firstBad = null;
    const cards = [];
    for (const it of items) {
      it.problemEl.hidden = true;
      it.li.classList.remove('bad');
      if (isBlank(it)) continue;
      const card = { id: it.id, term: it.termEl.value, def: '', image: it.image, termAudio: '', defAudio: '', q: it.q };
      const problem = questionProblem(card);
      if (problem) {
        it.problemEl.textContent = `⚠ ${problem}`;
        it.problemEl.hidden = false;
        it.li.classList.add('bad');
        firstBad ??= it;
        continue;
      }
      cards.push(tidyQuestion(card));
    }
    if (firstBad) {
      toast('有的题还没写完');
      firstBad.li.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!cards.length) {
      toast('至少写一道题');
      items[0]?.termEl.focus();
      return;
    }
    const set = { ...draft, kind: 'quiz', title: titleInput.value.trim() || '未命名题目集', description: descInput.value.trim(), cards };
    // 成绩在答题页也会变, 以存着的为准
    const latest = store.getSet(draft.id);
    if (latest) for (const key of ['best', 'runs', 'stats']) set[key] = latest[key];
    try {
      store.putSet(set);
    } catch {
      toast('存不下了: 浏览器给的空间满了');
      return;
    }
    dirty = false;
    toast('保存好了');
    cleanMedia(store);
    go(`#/set/${encodeURIComponent(draft.id)}`);
  }

  const cancelHref = existing ? `#/set/${encodeURIComponent(existing.id)}` : '#/';
  const saveBtn = () => h('button', { class: 'btn primary', onclick: save }, existing ? '保存' : '建好了');
  const addBtn = (type, label) => h('button', { class: 'btn add-row', type: 'button', onclick: () => (addItem(makeCard('', '', { q: newQuestion(type, items.at(-1)?.q.time ?? DEFAULT_TIME) }), { focus: true }), markDirty()) }, label);

  return {
    title: existing ? `编辑 ${existing.title}` : '新建题目集',
    el: h(
      'section',
      { class: 'edit quiz-edit' },
      h('div', { class: 'page-head' }, h('h1', {}, existing ? '编辑题目集' : '新建题目集'), h('div', { class: 'row' }, h('a', { class: 'btn', href: cancelHref }, '取消'), saveBtn())),
      h('p', { class: 'muted' }, '像 Kahoot 那样: 每道题自己写题目和选项, 答的时候限时, 答得越快分越高。'),
      titleInput,
      descInput,
      listEl,
      h('div', { class: 'row' }, addBtn('choice', '＋ 加一道选择题'), addBtn('tf', '＋ 加一道判断题')),
      h('div', { class: 'row end' }, saveBtn()),
    ),
    focus: existing ? null : titleInput,
    isDirty: () => dirty,
    canLeave: () => !dirty || confirm('改的东西还没保存, 确定要走吗?'),
  };
}
