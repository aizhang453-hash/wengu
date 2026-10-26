// 拍照让 AI 记错题 (#/mistakes/import): ① 复制给 AI 的话, 跟题目照片一起发给 AI;
// ② AI 回的贴进来 (或者选 / 拖进来它给的文件); ③ 看一遍认出来的, 加进错题集。
// 没写完的 (比如 AI 不知道对的答案) 和想一道道看过的, 打开「记一道错题」一道道补上再存 (mistakeedit.js 的 queueMistakes)

import { h, fill, toast } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { putMedia, shrinkImage } from '../media.js';
import { LETTERS, MAX_IMAGES, mistakeProblem, kindOf } from '../mistakes.js';
import { aiPrompt, parseMistakeImport, findSame, ImportError } from '../mistakeimport.js';
import { queueMistakes } from './mistakeedit.js';
import { promptControls } from './aiprompt.js';

const ACCEPT = '.json,.txt,.md,application/json,text/plain';
const MAX_FILE = 5_000_000;

export function renderMistakeImport({ store, go }) {
  const ask = promptControls(aiPrompt());
  let items = []; // 认出来的: [{ mistake, problem 还差什么, same 错题集里一样的那道, on 勾没勾 }]
  let added = false;

  // ---- ② AI 回的 ----
  const pasteEl = h('textarea', { class: 'input mi-paste', rows: 6, placeholder: '粘贴 AI 的完整回复', 'aria-label': 'AI 的回复', oninput: () => read(pasteEl.value) });
  const fileInput = h('input', { type: 'file', accept: ACCEPT, hidden: true, onchange: () => fileInput.files[0] && loadFile(fileInput.files[0]) });
  async function loadFile(file) {
    fileInput.value = '';
    if (file.type.startsWith('image/')) return takeImages([file]);
    if (file.size > MAX_FILE) return toast('文件过大，无法识别');
    try {
      pasteEl.value = await file.text();
    } catch {
      return toast('无法读取该文件');
    }
    read(pasteEl.value);
  }

  // 照片温故自己认不了字; 只认出一道的话就放进那道题里
  function takeImages(files) {
    if (items.length === 1) return addImages(items[0], files);
    toast(items.length ? '请在对应题目下点击「添加照片」' : '请先将照片发给 AI，再把回复粘贴到这里');
  }

  // ---- ③ 认出来的 ----
  const resultEl = h('div', { class: 'mi-result', 'aria-live': 'polite' });
  const listEl = h('ul', { class: 'mk-list' });
  const addBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => add(false) });
  const eachBtn = h('button', { class: 'btn', type: 'button', onclick: () => add(true) }, '逐题核对');
  const countEl = h('p', { class: 'muted small' });

  function read(text) {
    items = [];
    if (!text.trim()) return fill(resultEl);
    try {
      const existing = store.allMistakes();
      items = parseMistakeImport(text).map((x) => {
        const same = findSame(x.mistake, existing);
        return { ...x, same, on: !same };
      });
    } catch (e) {
      if (!(e instanceof ImportError)) console.warn(e);
      return fill(resultEl, h('p', { class: 'qe-problem' }, `${e instanceof ImportError ? e.message : '无法识别'}`));
    }
    fill(listEl, items.map(itemEl));
    fill(
      resultEl,
      h('h2', {}, `识别到 ${items.length} 道`),
      listEl,
      countEl,
      h('div', { class: 'row' }, addBtn, eachBtn),
      h('p', { class: 'muted small' }, '逐题核对：依次打开每道题，可修改并添加照片后保存。'),
    );
    drawCount();
  }

  function drawCount() {
    const chosen = items.filter((x) => x.on);
    const unfinished = chosen.filter((x) => x.problem).length;
    addBtn.textContent = `加入错题集（${chosen.length} 道）`;
    addBtn.disabled = eachBtn.disabled = !chosen.length;
    countEl.textContent = unfinished ? `已选中的题目中有 ${unfinished} 道信息不完整，加入时将逐题打开补充。` : '';
  }

  function itemEl(x, i) {
    const m = x.mistake;
    const box = h('input', {
      type: 'checkbox',
      checked: x.on,
      'aria-label': `选择第 ${i + 1} 道`,
      onchange: () => {
        x.on = box.checked;
        li.classList.toggle('off', !x.on);
        drawCount();
      },
    });
    const imgInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: () => (addImages(x, imgInput.files), (imgInput.value = '')) });
    const li = h(
      'li',
      { class: `mk-item mi-item${x.on ? '' : ' off'}` },
      h(
        'label',
        { class: 'mk-item-head mi-head' },
        box,
        h('strong', {}, `第 ${i + 1} 道`),
        h('span', { class: `qi-tag mk-kind${m.kind ? '' : ' guess'}`, title: m.kind ? '题型' : '自动识别的题型，可在编辑中修改' }, kindOf(m)),
        h('span', { class: 'qi-tag' }, m.type === 'input' ? '填空题' : '选择题'),
      ),
      x.same ? h('p', { class: 'muted small' }, '错题集中已有此题，默认不加入') : null,
      m.passage ? h('div', { class: 'mi-passage' }, rich(m.passage)) : null,
      m.question ? h('div', { class: 'mk-question' }, rich(m.question)) : null,
      m.type === 'choice'
        ? h(
            'ol',
            { class: 'mi-opts' },
            m.options.map((o, k) =>
              h(
                'li',
                { class: k === m.correct ? 'right' : k === m.mine ? 'mine' : null },
                h('span', { class: 'mk-letter' }, LETTERS[k]),
                o ? rich(o) : h('span', { class: 'muted' }, '（空）'),
                k === m.correct ? h('span', { class: 'mi-mark' }, '正确答案') : k === m.mine ? h('span', { class: 'mi-mark' }, '我的答案') : null,
              ),
            ),
          )
        : [
            m.answer ? h('div', { class: 'mk-line ok' }, h('span', { class: 'mk-line-label' }, '正确答案'), rich(m.answer)) : null,
            m.mineText ? h('div', { class: 'mk-line bad' }, h('span', { class: 'mk-line-label' }, '我的答案'), rich(m.mineText)) : null,
          ],
      m.note ? h('div', { class: 'mk-note' }, rich(m.note)) : null,
      x.problem ? h('p', { class: 'qe-problem' }, `待补充：${x.problem}`) : null,
      h(
        'div',
        { class: 'mk-images-edit' },
        m.images.map((id) => cardImage(id, 'mk-thumb')),
        m.images.length < MAX_IMAGES ? h('button', { class: 'tool-btn', type: 'button', onclick: () => imgInput.click() }, m.images.length ? '继续添加' : '添加照片') : null,
        m.images.length ? null : h('span', { class: 'muted small' }, '含图表的题目建议添加照片'),
        imgInput,
      ),
    );
    x.el = li;
    return li;
  }

  async function addImages(x, files) {
    const m = x.mistake;
    for (const file of [...(files ?? [])].filter((f) => f.type.startsWith('image/'))) {
      if (m.images.length >= MAX_IMAGES) {
        toast(`每道题最多 ${MAX_IMAGES} 张图片`);
        break;
      }
      try {
        // 文章、图表要看得清字, 跟「记一道错题」一样大
        m.images.push(await putMedia(await shrinkImage(file, 1600)));
      } catch {
        toast('图片保存失败，存储空间可能已满');
        break;
      }
    }
    // 整道题截了图的, 题目可以不打字: 还差什么重新看
    x.problem = mistakeProblem(m);
    x.el.replaceWith(itemEl(x, items.indexOf(x)));
    drawCount();
  }

  // 写完整的直接记好; 没写完的 (还有「一道道看过再加」的全部) 打开「记一道错题」一道道来
  function add(eachOne) {
    const chosen = items.filter((x) => x.on);
    if (!chosen.length) return;
    const ready = eachOne ? [] : chosen.filter((x) => !x.problem).map((x) => x.mistake);
    const later = chosen.filter((x) => eachOne || x.problem).map((x) => x.mistake);
    if (ready.length) {
      try {
        store.transaction(() => ready.forEach((m) => store.putMistake(m)));
      } catch {
        toast('存储空间已满，无法保存');
        return;
      }
    }
    added = true;
    if (!later.length) {
      toast(`已加入 ${ready.length} 道，明日开始安排重做`);
      return go('#/mistakes');
    }
    queueMistakes(later);
    toast(ready.length ? `已加入 ${ready.length} 道，另有 ${later.length} 道待补充` : `共 ${later.length} 道，逐题核对`);
    go('#/mistakes/new');
  }

  const isText = (target) => target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
  return {
    title: '拍照录入错题',
    el: h(
      'section',
      {
        class: 'mistake-import',
        // 照片粘贴进来: 放进认出来的那道题里 (或者说怎么做); 没点输入框就粘贴的字: 放进 ② 的框里
        onpaste: (e) => {
          const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (files.length) {
            e.preventDefault();
            return takeImages(files);
          }
          const text = e.clipboardData?.getData('text') ?? '';
          if (text && !isText(e.target)) {
            e.preventDefault();
            pasteEl.value = text;
            read(text);
          }
        },
        ondragover: (e) => {
          if ([...(e.dataTransfer?.types ?? [])].some((t) => t === 'Files' || t === 'text/plain')) e.preventDefault();
        },
        ondrop: (e) => {
          const file = e.dataTransfer?.files?.[0];
          if (file) {
            e.preventDefault();
            return loadFile(file);
          }
          const text = e.dataTransfer?.getData('text') ?? '';
          if (!text) return;
          e.preventDefault();
          pasteEl.value = text;
          read(text);
        },
      },
      h('a', { class: 'back', href: '#/mistakes' }, '← 错题集'),
      h('h1', {}, '拍照录入错题'),
      h('p', { class: 'muted' }, '将题目照片发给 AI 识别，再把结果粘贴到这里，即可批量录入。'),
      h(
        'ol',
        { class: 'mi-steps' },
        h(
          'li',
          {},
          h('strong', {}, '复制提示词'),
          h('p', { class: 'muted small' }, '在 Claude、ChatGPT 等支持图片的 AI 中粘贴提示词，并发送题目照片。如照片中看不出答案，请注明「我选的是 C」「答案是 B」。'),
          h('div', { class: 'row' }, ask.button),
          ask.details,
        ),
        h(
          'li',
          {},
          h('strong', {}, '粘贴 AI 的回复'),
          h('p', { class: 'muted small' }, '复制完整回复后粘贴；若 AI 返回文件（.json、.txt），可选择或拖入。'),
          pasteEl,
          h('div', { class: 'file-pick-row' }, h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, '选择文件'), h('span', { class: 'muted small' }, '.json、.txt'), fileInput),
        ),
        h('li', {}, h('strong', {}, '核对并加入'), resultEl),
      ),
    ),
    focus: null,
    isDirty: () => !added && items.length > 0,
    canLeave: () => added || !items.length || confirm(`识别到的 ${items.length} 道题尚未加入，确定离开吗？`),
  };
}
