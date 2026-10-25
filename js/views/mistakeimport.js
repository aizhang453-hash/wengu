// 拍照让 AI 记错题 (#/mistakes/import): ① 复制给 AI 的话, 跟题目照片一起发给 AI;
// ② AI 回的贴进来 (或者选 / 拖进来它给的文件); ③ 看一遍认出来的, 加进错题集。
// 没写完的 (比如 AI 不知道对的答案) 和想一道道看过的, 打开「记一道错题」一道道补上再存 (mistakeedit.js 的 queueMistakes)

import { h, fill, toast } from '../dom.js';
import { rich, cardImage } from '../cardview.js';
import { putMedia, shrinkImage } from '../media.js';
import { LETTERS, MAX_IMAGES, mistakeProblem, kindOf } from '../mistakes.js';
import { aiPrompt, parseMistakeImport, findSame, ImportError } from '../mistakeimport.js';
import { queueMistakes } from './mistakeedit.js';

const ACCEPT = '.json,.txt,.md,application/json,text/plain';
const MAX_FILE = 5_000_000;

export function renderMistakeImport({ store, go }) {
  const prompt = aiPrompt();
  let items = []; // 认出来的: [{ mistake, problem 还差什么, same 错题集里一样的那道, on 勾没勾 }]
  let added = false;

  // ---- ① 给 AI 的话 ----
  const promptBox = h('textarea', { class: 'input mi-prompt', rows: 12, readonly: true, 'aria-label': '给 AI 的话' });
  promptBox.value = prompt;
  const promptDetails = h('details', { class: 'mi-prompt-box' }, h('summary', {}, '看看这段话'), promptBox);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      toast('复制好了: 去 AI 那儿粘贴, 再发题目照片');
    } catch {
      promptDetails.open = true;
      promptBox.focus();
      promptBox.select();
      toast('复制不了, 下面的字选好了, 自己复制一下');
    }
  }

  // ---- ② AI 回的 ----
  const pasteEl = h('textarea', { class: 'input mi-paste', rows: 6, placeholder: 'AI 回的整段直接粘贴进来 (前后多的话不要紧)', 'aria-label': 'AI 回的', oninput: () => read(pasteEl.value) });
  const fileInput = h('input', { type: 'file', accept: ACCEPT, hidden: true, onchange: () => fileInput.files[0] && loadFile(fileInput.files[0]) });
  async function loadFile(file) {
    fileInput.value = '';
    if (file.type.startsWith('image/')) return takeImages([file]);
    if (file.size > MAX_FILE) return toast('这个文件太大了, 不像 AI 写的错题');
    try {
      pasteEl.value = await file.text();
    } catch {
      return toast('读不了这个文件');
    }
    read(pasteEl.value);
  }

  // 照片温故自己认不了字; 只认出一道的话就放进那道题里
  function takeImages(files) {
    if (items.length === 1) return addImages(items[0], files);
    toast(items.length ? '要把照片放进错题里, 点那道题下面的「🖼 放照片」' : '温故自己认不了照片上的字: 照片发给 AI, 再把 AI 回的贴到这里');
  }

  // ---- ③ 认出来的 ----
  const resultEl = h('div', { class: 'mi-result', 'aria-live': 'polite' });
  const listEl = h('ul', { class: 'mk-list' });
  const addBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => add(false) });
  const eachBtn = h('button', { class: 'btn', type: 'button', onclick: () => add(true) }, '一道道看过再加');
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
      return fill(resultEl, h('p', { class: 'qe-problem' }, `⚠ ${e instanceof ImportError ? e.message : '读不出来'}`));
    }
    fill(listEl, items.map(itemEl));
    fill(
      resultEl,
      h('h2', {}, `认出 ${items.length} 道`),
      listEl,
      countEl,
      h('div', { class: 'row' }, addBtn, eachBtn),
      h('p', { class: 'muted small' }, '「一道道看过再加」: 每道打开「记一道错题」看一遍, 能改、能放照片, 存了再下一道。'),
    );
    drawCount();
  }

  function drawCount() {
    const chosen = items.filter((x) => x.on);
    const unfinished = chosen.filter((x) => x.problem).length;
    addBtn.textContent = `加进错题集 (${chosen.length} 道)`;
    addBtn.disabled = eachBtn.disabled = !chosen.length;
    countEl.textContent = unfinished ? `勾上的有 ${unfinished} 道没写完 (标着 ⚠), 加的时候一道道打开让你补上; 别的直接记好。` : '';
  }

  function itemEl(x, i) {
    const m = x.mistake;
    const box = h('input', {
      type: 'checkbox',
      checked: x.on,
      'aria-label': `加第 ${i + 1} 道`,
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
        h('span', { class: `qi-tag mk-kind${m.kind ? '' : ' guess'}`, title: m.kind ? '题型' : '按题目猜的题型, 以后在「改」里可以换' }, kindOf(m)),
        h('span', { class: 'qi-tag' }, m.type === 'input' ? '填空题' : '选择题'),
      ),
      x.same ? h('p', { class: 'muted small' }, '错题集里已经有这道了, 所以没勾上 (要再记一遍就勾上)') : null,
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
                o ? rich(o) : h('span', { class: 'muted' }, '(空的)'),
                k === m.correct ? h('span', { class: 'mi-mark' }, '✓ 对的') : k === m.mine ? h('span', { class: 'mi-mark' }, '✕ 我选的') : null,
              ),
            ),
          )
        : [
            m.answer ? h('div', { class: 'mk-line ok' }, h('span', { class: 'mk-line-label' }, '✓ 对的'), rich(m.answer)) : null,
            m.mineText ? h('div', { class: 'mk-line bad' }, h('span', { class: 'mk-line-label' }, '✕ 我写的'), rich(m.mineText)) : null,
          ],
      m.note ? h('div', { class: 'mk-note' }, rich(m.note)) : null,
      x.problem ? h('p', { class: 'qe-problem' }, `⚠ ${x.problem} —— 加的时候打开让你补上`) : null,
      h(
        'div',
        { class: 'mk-images-edit' },
        m.images.map((id) => cardImage(id, 'mk-thumb')),
        m.images.length < MAX_IMAGES ? h('button', { class: 'tool-btn', type: 'button', onclick: () => imgInput.click() }, m.images.length ? '🖼 再放一张' : '🖼 放照片') : null,
        m.images.length ? null : h('span', { class: 'muted small' }, '有函数图像、几何图的, 把照片也放进去'),
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
        toast(`一道题最多放 ${MAX_IMAGES} 张图片`);
        break;
      }
      try {
        // 文章、图表要看得清字, 跟「记一道错题」一样大
        m.images.push(await putMedia(await shrinkImage(file, 1600)));
      } catch {
        toast('图片存不进去, 可能浏览器空间满了');
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
        toast('存不下了: 浏览器给的空间满了');
        return;
      }
    }
    added = true;
    if (!later.length) {
      toast(`记好了 ${ready.length} 道, 明天开始排进复习`);
      return go('#/mistakes');
    }
    queueMistakes(later);
    toast(ready.length ? `记好了 ${ready.length} 道; 还有 ${later.length} 道要补上` : `一共 ${later.length} 道, 一道道看`);
    go('#/mistakes/new');
  }

  const isText = (target) => target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
  return {
    title: '拍照让 AI 记错题',
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
      h('h1', {}, '📷 拍照让 AI 记错题'),
      h('p', { class: 'muted' }, '不用一个字一个字打: 题目拍照发给 AI, AI 照着温故认得的格式写出来, 贴到这里就记好了。一次可以好几道。'),
      h(
        'ol',
        { class: 'mi-steps' },
        h(
          'li',
          {},
          h('strong', {}, '复制给 AI 的话'),
          h('p', { class: 'muted small' }, '打开 Claude (或者别的能看图的 AI: ChatGPT、豆包、Kimi……), 粘贴这段话, 再把题目的照片 / 截图发过去。照片上看不出来的, 加一句「我选的是 C」「答案是 B」。'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: copyPrompt }, '📋 复制给 AI 的话')),
          promptDetails,
        ),
        h(
          'li',
          {},
          h('strong', {}, '把 AI 回的贴进来'),
          h('p', { class: 'muted small' }, 'AI 回的整段复制过来粘贴就行。AI 给的是文件 (.json、.txt) 的话, 点「选文件」或者拖进来。'),
          pasteEl,
          h('div', { class: 'file-pick-row' }, h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, '选文件'), h('span', { class: 'muted small' }, '.json、.txt'), fileInput),
        ),
        h('li', {}, h('strong', {}, '看一遍, 加进错题集'), resultEl),
      ),
    ),
    focus: null,
    isDirty: () => !added && items.length > 0,
    canLeave: () => added || !items.length || confirm(`认出来的 ${items.length} 道还没加进错题集, 确定要走吗?`),
  };
}
