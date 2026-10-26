// 记一道错题 / 改错题: 文章 (可以不写)、题目、图片 (截图、函数图像……); 选择题写选项, 点「对」和「我选的」;
// 填空题写对的答案和当时写的; 为什么错; 题型 (不写就按题目猜)。
// 拍照让 AI 记的 (mistakeimport.js) 没写完的、想一道道看过的: 一道道打开, 补上存了再下一道 (queueMistakes)

import { h, fill, toast } from '../dom.js';
import { newId } from '../store.js';
import { putMedia, shrinkImage } from '../media.js';
import { cardImage } from '../cardview.js';
import { LETTERS, MIN_OPTIONS, MAX_OPTIONS, MAX_IMAGES, MAX_KIND, KINDS, newMistake, mistakeProblem, tidyMistake, guessKind } from '../mistakes.js';

// 导入的错题先放这里, 下次打开「记一道错题」(#/mistakes/new) 时一道道拿出来
let queued = [];
export function queueMistakes(list) {
  queued = list.map((m) => structuredClone(m));
}

export function renderMistakeEdit({ store, go }, id = null) {
  const existing = id ? store.getMistake(id) : null;
  if (id && !existing) {
    return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '错题不存在'), h('a', { class: 'btn primary', href: '#/mistakes' }, '返回错题集')) };
  }
  const queue = existing ? [] : queued;
  queued = [];
  const total = queue.length; // 导入的一共几道 (0: 不是导入的)
  let draft = existing ? structuredClone(existing) : total ? queue.shift() : newMistake(newId());
  let dirty = total > 0; // 导入的还没存
  const markDirty = () => {
    dirty = true;
    if (total) drawNote();
  };

  const typeBtns = [
    ['choice', '选择题'],
    ['input', '填空题'],
  ].map(([type, label]) => h('button', { class: 'chip', type: 'button', onclick: () => ((draft.type = type), markDirty(), draw()) }, label));
  const passageEl = h('textarea', { class: 'input mk-passage-input', rows: 5, placeholder: '阅读材料、题干条件等', 'aria-label': '材料', oninput: () => ((draft.passage = passageEl.value), markDirty(), drawKindHint()) });
  const questionEl = h('textarea', { class: 'input', rows: 3, placeholder: '题目', 'aria-label': '题目', oninput: () => ((draft.question = questionEl.value), markDirty(), drawKindHint()) });
  const noteEl = h('textarea', { class: 'input', rows: 3, placeholder: '错误原因或解析', 'aria-label': '解析', oninput: () => ((draft.note = noteEl.value), markDirty()) });
  const answerEl = h('input', { class: 'input', placeholder: '如 3/4；多个答案用逗号分隔', 'aria-label': '正确答案', autocomplete: 'off', oninput: () => ((draft.answer = answerEl.value), markDirty()) });
  const mineTextEl = h('input', { class: 'input', placeholder: '选填', 'aria-label': '我的答案', autocomplete: 'off', oninput: () => ((draft.mineText = mineTextEl.value), markDirty()) });
  const answersEl = h('div', { class: 'mk-answers' });
  // 题型: 自己写, 或者从列表里挑 (SAT 的几类、以前写过的); 空着就按题目猜, 下面写着猜的是什么
  const kindList = h(
    'datalist',
    { id: 'mk-kinds' },
    [...new Set([...Object.values(KINDS).flat(), ...store.allMistakes().map((m) => m.kind).filter(Boolean)])].map((k) => h('option', { value: k })),
  );
  const kindHint = h('span', { class: 'muted small' });
  const kindEl = h('input', { class: 'input mk-kind-input', list: 'mk-kinds', maxlength: MAX_KIND, placeholder: '选填，如 词汇题、几何三角', 'aria-label': '题型', autocomplete: 'off', oninput: () => ((draft.kind = kindEl.value), markDirty(), drawKindHint()) });
  function drawKindHint() {
    const guess = guessKind(draft);
    kindHint.textContent = draft.kind.trim() ? '' : guess ? `自动识别为「${guess}」` : '未填写时归为「其他」';
  }

  // ---- 图片: 点按钮选、直接粘贴截图、拖进来 ----
  const imagesEl = h('div', { class: 'mk-images-edit' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => (addImages(fileInput.files), (fileInput.value = '')) });
  async function addImages(files) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return false;
    for (const file of list) {
      if (draft.images.length >= MAX_IMAGES) {
        toast(`每道题最多 ${MAX_IMAGES} 张图片`);
        break;
      }
      try {
        // 文章、图表要看得清字, 比卡片上的图大一点
        draft.images.push(await putMedia(await shrinkImage(file, 1600)));
        markDirty();
      } catch {
        toast('图片保存失败，存储空间可能已满');
        break;
      }
    }
    drawImages();
    return true;
  }
  function drawImages() {
    fill(
      imagesEl,
      ...draft.images.map((id, i) =>
        h(
          'span',
          { class: 'media-chip image-chip' },
          cardImage(id, 'mk-thumb'),
          h('button', { class: 'chip-x', type: 'button', title: '移除图片', 'aria-label': `移除第 ${i + 1} 张图片`, onclick: () => (draft.images.splice(i, 1), markDirty(), drawImages()) }, '✕'),
        ),
      ),
      draft.images.length < MAX_IMAGES ? h('button', { class: 'tool-btn', type: 'button', onclick: () => fileInput.click() }, '添加图片') : null,
      h('span', { class: 'muted small' }, '支持截图、函数图像等，可直接粘贴或拖入'),
      fileInput,
    );
  }
  const problemEl = h('p', { class: 'qe-problem', hidden: true });
  const headEl = h('h1', {});
  const importNote = h('p', { class: 'muted' });
  const footEl = h('div', { class: 'row end' });
  function drawHead() {
    headEl.textContent = existing ? '编辑错题' : total > 1 ? `核对导入（${total - queue.length} / ${total}）` : total ? '核对导入' : '记录错题';
    if (!total) return;
    drawNote();
    fill(
      footEl,
      h('a', { class: 'btn', href: '#/mistakes' }, '取消'),
      h('button', { class: 'btn', onclick: () => next(false) }, '跳过'),
      h('button', { class: 'btn primary', onclick: () => save(false) }, queue.length ? `保存并继续（剩余 ${queue.length} 道）` : '保存'),
    );
  }

  function fillInputs() {
    passageEl.value = draft.passage;
    questionEl.value = draft.question;
    noteEl.value = draft.note;
    answerEl.value = draft.answer;
    mineTextEl.value = draft.mineText;
    kindEl.value = draft.kind ?? '';
    drawKindHint();
  }

  function draw() {
    typeBtns.forEach((b, i) => b.classList.toggle('on', ['choice', 'input'][i] === draft.type));
    problemEl.hidden = true;
    if (draft.type === 'input') {
      answersEl.replaceChildren(h('label', { class: 'ask-label' }, '正确答案'), answerEl, h('label', { class: 'ask-label' }, '我的答案'), mineTextEl);
      return;
    }
    if (draft.options.length < MIN_OPTIONS) draft.options = ['', '', '', ''];
    const rows = draft.options.map((text, i) => {
      const input = h('input', { class: 'qe-opt-input', value: text, placeholder: `选项 ${LETTERS[i]}`, 'aria-label': `选项 ${LETTERS[i]}`, autocomplete: 'off', oninput: () => ((draft.options[i] = input.value), markDirty(), drawKindHint()) });
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
            title: '标为正确答案',
            onclick: () => {
              draft.correct = right ? -1 : i;
              if (draft.mine === i) draft.mine = -1;
              markDirty();
              draw();
            },
          },
          '正确',
        ),
        h(
          'button',
          {
            type: 'button',
            class: `mk-mark bad${mine ? ' on' : ''}`,
            'aria-pressed': String(mine),
            title: '标为我的答案',
            onclick: () => {
              if (draft.correct === i) return toast('该选项已标为正确答案');
              draft.mine = mine ? -1 : i;
              markDirty();
              draw();
            },
          },
          '我的答案',
        ),
        draft.options.length > MIN_OPTIONS
          ? h(
              'button',
              {
                type: 'button',
                class: 'qe-opt-x',
                title: '删除选项',
                'aria-label': `删除选项 ${LETTERS[i]}`,
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
        h('span', { class: 'muted small' }, '分别标出正确答案和我的答案'),
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
      toast('存储空间已满，无法保存');
      return;
    }
    dirty = false;
    if (total) return next(true);
    if (!again) {
      toast(existing ? '已保存' : '已记录，明日开始安排重做');
      return go('#/mistakes');
    }
    // 接着记下一道: 题型留着, 别的清空
    toast('已记录');
    draft = { ...newMistake(newId()), type: draft.type };
    fillInputs();
    draw();
    drawImages();
    window.scrollTo(0, 0);
    (draft.passage ? questionEl : passageEl).focus();
  }

  // 导入的: 写着还差什么 (改着改着就更新)
  function drawNote() {
    const problem = mistakeProblem(tidyMistake(draft));
    fill(importNote, '请核对 AI 识别的内容；含图表的题目可添加照片。', problem ? h('strong', { class: 'qe-problem' }, ` 待补充：${problem}`) : null);
  }

  // 导入的: 下一道 (saved: 这道存了还是跳过了); 没有了回错题集
  function next(saved) {
    if (!queue.length) {
      dirty = false;
      toast(saved ? '已记录，明日开始安排重做' : '已跳过');
      return go('#/mistakes');
    }
    toast(saved ? '已记录' : '已跳过');
    draft = queue.shift();
    dirty = true;
    fillInputs();
    draw();
    drawImages();
    drawHead();
    window.scrollTo(0, 0);
  }

  fillInputs();
  draw();
  drawImages();
  drawHead();
  if (!total) {
    fill(
      footEl,
      h('a', { class: 'btn', href: '#/mistakes' }, '取消'),
      existing ? null : h('button', { class: 'btn', onclick: () => save(true) }, '保存并新建'),
      h('button', { class: 'btn primary', onclick: () => save(false) }, '保存'),
    );
  }
  return {
    title: existing ? '编辑错题' : total ? '核对导入' : '记录错题',
    el: h(
      'section',
      {
        class: 'edit mistake-edit',
        // 在这一页哪里粘贴、拖进来图片都行 (粘贴文字照常)
        onpaste: (e) => {
          if ([...(e.clipboardData?.files ?? [])].some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            addImages(e.clipboardData.files);
          }
        },
        ondragover: (e) => {
          if ([...(e.dataTransfer?.items ?? [])].some((i) => i.type.startsWith('image/'))) e.preventDefault();
        },
        ondrop: (e) => {
          if (![...(e.dataTransfer?.files ?? [])].some((f) => f.type.startsWith('image/'))) return;
          e.preventDefault();
          addImages(e.dataTransfer.files);
        },
      },
      h('a', { class: 'back', href: '#/mistakes' }, '← 错题集'),
      h('div', { class: 'page-head' }, headEl, h('div', { class: 'row' }, h('div', { class: 'chips', role: 'group', 'aria-label': '题型' }, typeBtns))),
      total ? importNote : existing ? null : h('p', { class: 'muted small' }, '也可以', h('a', { href: '#/mistakes/import' }, '拍照录入'), '。'),
      h('label', { class: 'ask-label' }, '材料（选填）'),
      passageEl,
      h('label', { class: 'ask-label' }, '题目'),
      questionEl,
      h('label', { class: 'ask-label' }, '图片（选填）'),
      imagesEl,
      answersEl,
      h('label', { class: 'ask-label' }, '解析'),
      noteEl,
      h('label', { class: 'ask-label' }, '题型'),
      kindEl,
      kindList,
      kindHint,
      problemEl,
      footEl,
    ),
    focus: existing || total ? null : passageEl,
    isDirty: () => dirty,
    canLeave: () => !dirty || confirm(total ? `还有 ${queue.length + 1} 道导入的错题未保存，确定离开吗？` : '修改尚未保存，确定离开吗？'),
  };
}
