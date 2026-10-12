// 新建 / 编辑卡片集, 包括从 Quizlet 粘贴导入。
// 每张卡片: 词、解释 (能加粗、斜体、下划线、高亮), 解释那面能放图片, 两面都能录音。

import { h, toast, fill } from '../dom.js';
import { makeSet, makeCard } from '../store.js';
import { parseCards, guessTermSep, guessCardSep } from '../parse.js';
import { LANGS } from '../speech.js';
import { MARKS, toggleMark } from '../rich.js';
import { putMedia, mediaURL, shrinkImage, cleanMedia } from '../media.js';
import { canRecord, record } from '../recorder.js';
import { cardImage } from '../cardview.js';

const FORMATS = [
  ['bold', 'B', '加粗 (Ctrl+B)'],
  ['italic', 'I', '斜体 (Ctrl+I)'],
  ['underline', 'U', '下划线 (Ctrl+U)'],
  ['highlight', '高亮', '高亮 (Ctrl+Shift+H)'],
];

export function renderEdit({ store, go }, id, { openImport = false } = {}) {
  const existing = id ? store.getSet(id) : null;
  // 合起来学的临时卡片集不能编辑
  if (id && (!existing || existing.virtual)) {
    return {
      title: '找不到',
      el: h(
        'section',
        { class: 'empty' },
        h('h1', {}, '找不到这个卡片集'),
        h('a', { class: 'btn primary', href: '#/' }, '回首页'),
      ),
    };
  }
  const draft = existing ? structuredClone(existing) : makeSet();
  let dirty = false;
  const markDirty = () => {
    dirty = true;
  };

  // ---- 标题、简介、语言 ----
  const titleInput = h('input', {
    class: 'input big',
    placeholder: '标题, 比如「托福核心词 第 1 单元」',
    value: draft.title,
    maxlength: 200,
    oninput: markDirty,
  });
  const descInput = h('textarea', {
    class: 'input',
    rows: 2,
    placeholder: '简介 (可以不写)',
    value: draft.description,
    oninput: markDirty,
  });
  const langSelect = (value) =>
    h(
      'select',
      { class: 'input', value, onchange: markDirty },
      LANGS.map(([code, name]) => h('option', { value: code }, name)),
    );
  const termLang = langSelect(draft.termLang);
  const defLang = langSelect(draft.defLang);

  // ---- 卡片一行一行 ----
  const rowsEl = h('ol', { class: 'edit-rows' });
  const rows = []; // { id, termEl, defEl, image, termAudio, defAudio, li, drawMedia }
  let recording = null; // 正在录的 { stop }

  // 格式快捷键: Ctrl/⌘ + B / I / U, Ctrl/⌘ + Shift + H 高亮
  function formatKeys(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const kind = !e.shiftKey && { b: 'bold', i: 'italic', u: 'underline' }[k];
    const marker = kind ? MARKS[kind] : e.shiftKey && k === 'h' ? MARKS.highlight : null;
    if (!marker) return;
    e.preventDefault();
    toggleMark(e.target, marker);
  }

  function addRow(card = makeCard(), { focus = false } = {}) {
    const termEl = h('textarea', {
      class: 'input grow',
      rows: 1,
      placeholder: '词',
      value: card.term,
      'aria-label': '词',
      oninput: onInput,
      onkeydown: formatKeys,
    });
    const defEl = h('textarea', {
      class: 'input grow',
      rows: 1,
      placeholder: '解释',
      value: card.def,
      'aria-label': '解释',
      oninput: onInput,
      onkeydown: (e) => {
        formatKeys(e);
        // 在最后一张的「解释」里按 Tab, 自动加一张新的 (跟 Quizlet 一样)
        if (e.key === 'Tab' && !e.shiftKey && rows.at(-1)?.defEl === defEl) {
          e.preventDefault();
          addRow(makeCard(), { focus: true });
          markDirty();
        }
      },
    });
    const row = { id: card.id, termEl, defEl, image: card.image ?? '', termAudio: card.termAudio ?? '', defAudio: card.defAudio ?? '', li: null };

    // 图片 (解释那面)
    const imageSlot = h('span', { class: 'media-slot' });
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      hidden: true,
      onchange: () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (file) setImage(row, file);
      },
    });
    const imageBtn = h('button', { class: 'tool-btn', type: 'button', title: '加图片 (也可以直接粘贴或拖进来)', onclick: () => fileInput.click() }, '🖼 图片');

    const audioSlots = { term: h('span', { class: 'media-slot' }), def: h('span', { class: 'media-slot' }) };
    const micBtns = {
      term: h('button', { class: 'tool-btn', type: 'button', title: '给词录音', onclick: () => toggleRecord(row, 'term') }, '🎤 录音'),
      def: h('button', { class: 'tool-btn', type: 'button', title: '给解释录音', onclick: () => toggleRecord(row, 'def') }, '🎤 录音'),
    };
    row.micBtns = micBtns;

    row.drawMedia = () => {
      fill(
        imageSlot,
        row.image
          ? h(
              'span',
              { class: 'media-chip image-chip' },
              cardImage(row.image, 'edit-thumb'),
              h('button', { class: 'chip-x', type: 'button', title: '去掉图片', 'aria-label': '去掉图片', onclick: () => ((row.image = ''), row.drawMedia(), markDirty()) }, '✕'),
            )
          : null,
      );
      imageBtn.hidden = Boolean(row.image);
      for (const side of ['term', 'def']) {
        const key = side === 'term' ? 'termAudio' : 'defAudio';
        fill(
          audioSlots[side],
          row[key]
            ? h(
                'span',
                { class: 'media-chip' },
                h('button', { class: 'chip-play', type: 'button', title: '听录音', onclick: () => playMedia(row[key]) }, '▶ 录音'),
                h('button', { class: 'chip-x', type: 'button', title: '删掉录音', 'aria-label': '删掉录音', onclick: () => ((row[key] = ''), row.drawMedia(), markDirty()) }, '✕'),
              )
            : null,
        );
        micBtns[side].hidden = Boolean(row[key]) || !canRecord();
      }
    };

    // 格式按钮放最后: 它们只在写这一面时出来, 放前面会把录音、图片按钮挤走
    const sideTools = (textarea, side) =>
      h(
        'div',
        { class: 'side-tools' },
        micBtns[side],
        audioSlots[side],
        side === 'def' ? [imageBtn, fileInput, imageSlot] : null,
        h(
          'span',
          { class: 'fmt' },
          FORMATS.map(([kind, label, title]) =>
            h(
              'button',
              {
                class: `fmt-btn ${kind}`,
                type: 'button',
                title,
                'aria-label': title,
                // 按下时不让文字框失去焦点, 选中的字还在
                onmousedown: (e) => e.preventDefault(),
                onclick: () => toggleMark(textarea, MARKS[kind]),
              },
              label,
            ),
          ),
        ),
      );

    // 粘贴、拖进来的图片
    const takeImage = (files) => {
      const file = [...(files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return false;
      setImage(row, file);
      return true;
    };

    row.li = h(
      'li',
      {
        class: 'edit-row',
        onpaste: (e) => {
          if (takeImage(e.clipboardData?.files)) e.preventDefault();
        },
        ondragover: (e) => {
          if ([...(e.dataTransfer?.items ?? [])].some((i) => i.type.startsWith('image/'))) {
            e.preventDefault();
            row.li.classList.add('drop');
          }
        },
        ondragleave: () => row.li.classList.remove('drop'),
        ondrop: (e) => {
          row.li.classList.remove('drop');
          if (takeImage(e.dataTransfer?.files)) e.preventDefault();
        },
      },
      h('span', { class: 'row-num' }),
      h('div', { class: 'edit-sides' }, h('div', { class: 'edit-side' }, termEl, sideTools(termEl, 'term')), h('div', { class: 'edit-side' }, defEl, sideTools(defEl, 'def'))),
      h(
        'button',
        {
          class: 'icon-btn',
          title: '删掉这张',
          'aria-label': '删掉这张',
          onclick: () => {
            rows.splice(rows.indexOf(row), 1);
            row.li.remove();
            if (rows.length === 0) addRow();
            markDirty();
          },
        },
        '✕',
      ),
    );
    rows.push(row);
    rowsEl.append(row.li);
    row.drawMedia();
    autoGrow(termEl);
    autoGrow(defEl);
    if (focus) termEl.focus();
    return row;
  }

  function onInput(e) {
    autoGrow(e.target);
    markDirty();
  }

  function isBlank(row) {
    return !row.termEl.value.trim() && !row.defEl.value.trim() && !row.image && !row.termAudio && !row.defAudio;
  }

  async function setImage(row, file) {
    try {
      row.image = await putMedia(await shrinkImage(file));
      row.drawMedia();
      markDirty();
    } catch {
      toast('图片存不进去, 可能浏览器空间满了');
    }
  }

  let player = null;
  async function playMedia(id) {
    const url = await mediaURL(id);
    if (!url) return toast('录音找不到了');
    player?.pause();
    player = new Audio(url);
    player.play().catch(() => {});
  }

  // 点一下开始录, 再点一下停 (正在录时点哪个录音按钮都是停)
  async function toggleRecord(row, side) {
    if (recording) {
      recording.stop();
      return;
    }
    const btn = row.micBtns[side];
    let rec;
    try {
      rec = await record({ onTick: (ms) => (btn.textContent = `⏹ 停 ${Math.floor(ms / 1000)} 秒`) });
    } catch {
      toast('用不了麦克风 (要在浏览器里允许温故用麦克风)');
      return;
    }
    recording = rec;
    btn.classList.add('recording');
    btn.textContent = '⏹ 停 0 秒';
    const blob = await rec.done;
    recording = null;
    btn.classList.remove('recording');
    btn.textContent = '🎤 录音';
    if (!blob.size) return toast('没录到声音');
    try {
      row[side === 'term' ? 'termAudio' : 'defAudio'] = await putMedia(blob);
      row.drawMedia();
      markDirty();
    } catch {
      toast('录音存不进去, 可能浏览器空间满了');
    }
  }

  for (const card of draft.cards) addRow(card);
  // 新建时先给几行空的
  while (rows.length < (existing ? 1 : 3)) addRow();

  // ---- 导入 ----
  let sepTouched = false;
  const pasteEl = h('textarea', {
    class: 'input mono',
    rows: 6,
    placeholder: '把 Quizlet 导出的文字粘贴到这里\n比如:\napple\t苹果\nbanana\t香蕉',
    oninput: () => {
      if (!sepTouched) {
        pick(termSepGroup, guessTermSep(pasteEl.value));
        pick(cardSepGroup, guessCardSep(pasteEl.value));
      }
      preview();
    },
  });
  const termSepGroup = sepGroup('termSep', '词和解释之间', [
    ['tab', 'Tab'],
    ['comma', '逗号'],
  ]);
  const cardSepGroup = sepGroup('cardSep', '卡片之间', [
    ['newline', '换行'],
    ['semicolon', '分号'],
  ]);
  const previewEl = h('div', { class: 'preview muted' });
  const importBtn = h(
    'button',
    {
      class: 'btn primary',
      disabled: true,
      onclick: () => {
        const cards = currentImport();
        if (!cards.length) return;
        // 后面空着的行先去掉, 再加
        while (rows.length && isBlank(rows.at(-1))) {
          rows.pop().li.remove();
        }
        for (const c of cards) addRow(makeCard(c.term, c.def));
        pasteEl.value = '';
        preview();
        markDirty();
        importBox.open = false;
        toast(`加进来 ${cards.length} 张卡片, 记得保存`);
        rows.at(-cards.length)?.termEl.scrollIntoView({ block: 'center' });
      },
    },
    '加进来',
  );
  const importBox = h(
    'details',
    { class: 'import-box', open: openImport },
    h('summary', {}, '从 Quizlet 导入 (粘贴文字)'),
    h(
      'p',
      { class: 'muted small' },
      '在 Quizlet 上打开卡片集, 点「…」→「导出」→「复制文字」, 再粘贴到下面。Excel、Word 里一列词一列解释的表格, 复制过来也行。',
    ),
    pasteEl,
    h('div', { class: 'sep-groups' }, termSepGroup.el, cardSepGroup.el),
    previewEl,
    importBtn,
  );

  function sepGroup(name, label, options) {
    const custom = h('input', {
      class: 'input tiny',
      placeholder: '自定义',
      'aria-label': `${label}: 自定义`,
      oninput: () => {
        sepTouched = true;
        radios.at(-1).checked = true;
        preview();
      },
    });
    const radios = [];
    const el = h(
      'fieldset',
      { class: 'sep-group' },
      h('legend', {}, label),
      options.map(([value, text], i) => {
        const r = h('input', {
          type: 'radio',
          name,
          value,
          checked: i === 0,
          onchange: () => {
            sepTouched = true;
            preview();
          },
        });
        radios.push(r);
        return h('label', {}, r, ` ${text}`);
      }),
      (() => {
        const r = h('input', {
          type: 'radio',
          name,
          value: 'custom',
          onchange: () => {
            sepTouched = true;
            custom.focus();
            preview();
          },
        });
        radios.push(r);
        return h('label', {}, r, ' ', custom);
      })(),
    );
    return {
      el,
      radios,
      value() {
        const r = radios.find((x) => x.checked);
        if (!r) return options[0][0];
        if (r.value !== 'custom') return r.value;
        // 自定义里写 \t 当 Tab, \n 当换行
        return custom.value.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
      },
    };
  }

  function pick(group, value) {
    for (const r of group.radios) r.checked = r.value === value;
  }

  function currentImport() {
    return parseCards(pasteEl.value, { termSep: termSepGroup.value(), cardSep: cardSepGroup.value() });
  }

  function preview() {
    const cards = currentImport();
    importBtn.disabled = cards.length === 0;
    if (!pasteEl.value.trim()) {
      previewEl.replaceChildren();
      return;
    }
    if (!cards.length) {
      previewEl.replaceChildren('没认出卡片, 换个分隔方式试试。');
      return;
    }
    const noDef = cards.filter((c) => !c.def).length;
    previewEl.replaceChildren(
      h('p', {}, `认出 ${cards.length} 张卡片` + (noDef ? `, 其中 ${noDef} 张没有解释 (分隔方式可能不对)` : '') + '。前几张:'),
      h(
        'table',
        { class: 'preview-table' },
        h(
          'tbody',
          {},
          cards.slice(0, 3).map((c) => h('tr', {}, h('td', {}, c.term), h('td', {}, c.def))),
        ),
      ),
    );
  }

  // ---- 保存 ----
  function save() {
    const cards = rows
      .filter((r) => !isBlank(r))
      .map((r) => ({
        id: r.id,
        term: r.termEl.value.trim(),
        def: r.defEl.value.trim(),
        image: r.image,
        termAudio: r.termAudio,
        defAudio: r.defAudio,
      }));
    if (cards.length === 0) {
      toast('至少写一张卡片');
      rows[0]?.termEl.focus();
      return;
    }
    const set = {
      ...draft,
      title: titleInput.value.trim() || '未命名卡片集',
      description: descInput.value.trim(),
      termLang: termLang.value,
      defLang: defLang.value,
      cards,
    };
    // 进度在别的页面 (单词卡、学习) 也会变, 以存着的为准
    const latest = store.getSet(draft.id);
    if (latest) {
      for (const key of ['known', 'starred', 'learn', 'stats', 'best']) set[key] = latest[key];
    }
    try {
      store.putSet(set);
    } catch {
      toast('存不下了: 浏览器给的空间满了');
      return;
    }
    dirty = false;
    toast('保存好了');
    cleanMedia(store); // 不用的图片、录音删掉
    go(`#/set/${encodeURIComponent(draft.id)}`);
  }

  // 图片还是跟着解释那面, 录音跟着字走
  function swapAll() {
    for (const r of rows) {
      [r.termEl.value, r.defEl.value] = [r.defEl.value, r.termEl.value];
      [r.termAudio, r.defAudio] = [r.defAudio, r.termAudio];
      r.drawMedia();
      autoGrow(r.termEl);
      autoGrow(r.defEl);
    }
    [termLang.value, defLang.value] = [defLang.value, termLang.value];
    markDirty();
  }

  const cancelHref = existing ? `#/set/${encodeURIComponent(existing.id)}` : '#/';
  const saveBtn = () => h('button', { class: 'btn primary', onclick: save }, existing ? '保存' : '建好了');

  const el = h(
    'section',
    { class: 'edit' },
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, existing ? '编辑卡片集' : '新建卡片集'),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: cancelHref }, '取消'), saveBtn()),
    ),
    titleInput,
    descInput,
    h(
      'div',
      { class: 'lang-row' },
      h('label', {}, '词的语言 (朗读用) ', termLang),
      h('label', {}, '解释的语言 ', defLang),
      h('button', { class: 'btn small', onclick: swapAll, title: '所有卡片的词和解释对调' }, '⇄ 词和解释对调'),
    ),
    importBox,
    rowsEl,
    h(
      'button',
      { class: 'btn add-row', onclick: () => (addRow(makeCard(), { focus: true }), markDirty()) },
      '＋ 加一张卡片',
    ),
    h('div', { class: 'row end' }, saveBtn()),
  );

  // 放进页面以后才量得出高度
  requestAnimationFrame(() => rows.forEach((r) => (autoGrow(r.termEl), autoGrow(r.defEl))));

  return {
    title: existing ? `编辑 ${existing.title}` : '新建卡片集',
    el,
    focus: openImport ? pasteEl : existing ? null : titleInput,
    isDirty: () => dirty,
    canLeave: () => !dirty || confirm('改的东西还没保存, 确定要走吗?'),
    cleanup: () => {
      recording?.stop();
      player?.pause();
    },
  };
}

function autoGrow(el) {
  el.style.height = 'auto';
  if (el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`;
}
