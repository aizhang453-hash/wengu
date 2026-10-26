// 新建 / 编辑卡片集, 包括从 Quizlet 粘贴导入、拍照让 AI 做 (AI 回的粘贴进来, cardimport.js 认)。
// 每张卡片: 词、解释 (能加粗、斜体、下划线、高亮), 解释那面能放图片, 两面都能录音。

import { h, toast, fill } from '../dom.js';
import { makeSet, makeCard, makeFolder, FOLDER_PREFIX } from '../store.js';
import { deckFolders } from '../cardfile.js';
import { planOf, newSeed } from '../plan.js';
import { parseCards, guessTermSep, guessCardSep } from '../parse.js';
import { parseCardImport, aiCardPrompt } from '../cardimport.js';
import { LANGS, guessLangOf } from '../speech.js';
import { MARKS, toggleMark } from '../rich.js';
import { putMedia, mediaURL, shrinkImage, cleanMedia } from '../media.js';
import { canRecord, record } from '../recorder.js';
import { cardImage } from '../cardview.js';
import { fileImportPanel } from './fileimport.js';
import { diagramEditor } from './diagram.js';
import { promptControls } from './aiprompt.js';

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
        h('h1', {}, '卡片集不存在'),
        h('a', { class: 'btn primary', href: '#/' }, '返回首页'),
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
    placeholder: '标题',
    value: draft.title,
    maxlength: 200,
    oninput: markDirty,
  });
  const descInput = h('textarea', {
    class: 'input',
    rows: 2,
    placeholder: '简介（选填）',
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
  // 「自动」后面写着按现在的卡片猜是什么语言 (单看一个词常看不出来, 看整个卡片集)
  function drawAutoLangs() {
    for (const [select, key] of [
      [termLang, 'termEl'],
      [defLang, 'defEl'],
    ]) {
      const texts = rows.slice(0, 400).map((r) => r[key].value);
      const name = texts.some((t) => t.trim()) ? LANGS.find(([code]) => code === guessLangOf(texts))?.[1] : null;
      select.options[0].textContent = name ? `自动（${name.replace(/ \(.*\)$/, '')}）` : '自动';
    }
  }
  for (const select of [termLang, defLang]) {
    select.addEventListener('focus', drawAutoLangs);
    select.addEventListener('pointerdown', drawAutoLangs);
  }
  // 每天背新词时先背哪些 (plan.js): 照卡片的顺序 (导入的就是文件里的顺序), 或者打乱
  const orderSel = h('select', { class: 'input', onchange: markDirty }, h('option', { value: 'set' }, '按卡片顺序'), h('option', { value: 'random' }, '随机'));
  orderSel.value = planOf(draft).order;
  const orderAtOpen = orderSel.value;

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

  function addRow(card = makeCard(), { focus = false, grow = true } = {}) {
    const termEl = h('textarea', {
      class: 'input grow',
      rows: 1,
      placeholder: '词语',
      value: card.term,
      'aria-label': '词语',
      oninput: onInput,
      onkeydown: formatKeys,
    });
    const defEl = h('textarea', {
      class: 'input grow',
      rows: 1,
      placeholder: '释义',
      value: card.def,
      'aria-label': '释义',
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
    row.pinSlot = h('span', { class: 'pin-slot' });

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
    const imageBtn = h('button', { class: 'tool-btn', type: 'button', title: '添加图片（可直接粘贴或拖入）', onclick: () => fileInput.click() }, '图片');

    const audioSlots = { term: h('span', { class: 'media-slot' }), def: h('span', { class: 'media-slot' }) };
    const micBtns = {
      term: h('button', { class: 'tool-btn', type: 'button', title: '为词语录音', onclick: () => toggleRecord(row, 'term') }, '录音'),
      def: h('button', { class: 'tool-btn', type: 'button', title: '为释义录音', onclick: () => toggleRecord(row, 'def') }, '录音'),
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
              h('button', { class: 'chip-x', type: 'button', title: '移除图片', 'aria-label': '移除图片', onclick: () => ((row.image = ''), row.drawMedia(), markDirty()) }, '✕'),
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
                h('button', { class: 'chip-play', type: 'button', title: '播放录音', onclick: () => playMedia(row[key]) }, '▶ 播放'),
                h('button', { class: 'chip-x', type: 'button', title: '删除录音', 'aria-label': '删除录音', onclick: () => ((row[key] = ''), row.drawMedia(), markDirty()) }, '✕'),
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
        side === 'def' ? [imageBtn, fileInput, imageSlot] : row.pinSlot,
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
          title: '删除此卡',
          'aria-label': '删除此卡',
          onclick: () => {
            rows.splice(rows.indexOf(row), 1);
            row.li.remove();
            if (rows.length === 0) addRow();
            diagramChanged();
            markDirty();
          },
        },
        '✕',
      ),
    );
    rows.push(row);
    rowsEl.append(row.li);
    row.drawMedia();
    drawPin(row);
    if (grow) autoGrowAll([termEl, defEl]);
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
      toast('图片保存失败，存储空间可能已满');
    }
  }

  let player = null;
  async function playMedia(id) {
    const url = await mediaURL(id);
    if (!url) return toast('录音不存在');
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
      rec = await record({ onTick: (ms) => (btn.textContent = `停止 ${Math.floor(ms / 1000)}″`) });
    } catch {
      toast('无法使用麦克风，请在浏览器中允许访问');
      return;
    }
    recording = rec;
    btn.classList.add('recording');
    btn.textContent = '停止 0″';
    const blob = await rec.done;
    recording = null;
    btn.classList.remove('recording');
    btn.textContent = '录音';
    if (!blob.size) return toast('未录到声音');
    try {
      row[side === 'term' ? 'termAudio' : 'defAudio'] = await putMedia(blob);
      row.drawMedia();
      markDirty();
    } catch {
      toast('录音保存失败，存储空间可能已满');
    }
  }

  // ---- 标注图 (可以不用): 一张图, 图上的点各是一张卡片 ----
  let editor = null; // 有图的时候是 diagramEditor
  const quick = h('div', { class: 'diagram-quick', hidden: true });
  const diagramBody = h('div', {});
  const diagramFile = h('input', {
    type: 'file',
    accept: 'image/*',
    hidden: true,
    onchange: async () => {
      const file = diagramFile.files?.[0];
      diagramFile.value = '';
      if (!file) return;
      try {
        const image = await putMedia(await shrinkImage(file, 1600));
        if (draft.diagram) draft.diagram.image = image;
        else draft.diagram = { image, pins: [] };
      } catch {
        toast('图片保存失败，存储空间可能已满');
        return;
      }
      buildDiagram();
      markDirty();
    },
  });
  const diagramBox = h('details', { class: 'import-box diagram-edit-box', open: Boolean(draft.diagram) }, h('summary', {}, '标注图（选用）'), diagramBody);

  function drawPin(row) {
    if (!editor) {
      fill(row.pinSlot);
      return;
    }
    const n = editor.numberOf(row.id);
    fill(
      row.pinSlot,
      n
        ? h(
            'span',
            { class: 'media-chip pin-chip' },
            h('button', { class: 'chip-play', type: 'button', title: '在图中查看', onclick: () => (diagramBox.scrollIntoView({ block: 'center', behavior: 'smooth' }), showQuick(row.id)) }, `📍 ${n}`),
            h('button', { class: 'chip-x', type: 'button', title: '从图中移除', 'aria-label': '从图中移除', onclick: () => editor.unpin(row.id) }, '✕'),
          )
        : h('button', { class: 'tool-btn', type: 'button', title: '在标注图中标记', onclick: () => editor.place(row.id) }, '标注'),
    );
  }

  function diagramChanged() {
    editor?.redraw();
    rows.forEach(drawPin);
  }

  // 刚放的点 (或者点了一个点): 图下面直接写它叫什么, 不用往下翻
  function showQuick(id) {
    const r = rows.find((x) => x.id === id);
    if (!r || !editor) return;
    const n = editor.numberOf(id);
    const done = () => {
      quick.hidden = true;
      editor.redraw();
    };
    const t = h('input', {
      class: 'input',
      value: r.termEl.value,
      placeholder: '名称',
      'aria-label': `第 ${n} 个标注：名称`,
      oninput: () => {
        r.termEl.value = t.value;
        autoGrow(r.termEl);
        markDirty();
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          d.focus();
        }
      },
    });
    const d = h('input', {
      class: 'input',
      value: r.defEl.value,
      placeholder: '释义（选填）',
      'aria-label': `第 ${n} 个标注：释义`,
      oninput: () => {
        r.defEl.value = d.value;
        autoGrow(r.defEl);
        markDirty();
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          done();
        }
      },
    });
    fill(quick, h('strong', { class: 'quick-num' }, `📍 ${n}`), t, d, h('button', { class: 'btn small', type: 'button', onclick: done }, '完成'));
    quick.hidden = false;
    t.focus();
  }

  function buildDiagram() {
    quick.hidden = true;
    if (!draft.diagram) {
      editor = null;
      fill(
        diagramBody,
        h('p', { class: 'muted small' }, '上传地图、结构图等图片，标注需要记忆的位置，每个标注对应一张卡片，可用于识图练习。'),
        h('button', { class: 'btn', type: 'button', onclick: () => diagramFile.click() }, '添加图片'),
        diagramFile,
      );
      rows.forEach(drawPin);
      return;
    }
    editor = diagramEditor({
      diagram: draft.diagram,
      rows: () => rows.map((r) => ({ id: r.id, label: r.termEl.value.trim() })),
      addCard: () => {
        // 先用空着的行, 没有再加一行
        const free = rows.find((r) => isBlank(r) && !editor.numberOf(r.id)) ?? addRow(makeCard(), { grow: true });
        return free.id;
      },
      focusCard: showQuick,
      onChange: () => {
        rows.forEach(drawPin);
        markDirty();
      },
    });
    fill(
      diagramBody,
      editor.el,
      quick,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => diagramFile.click() }, '更换图片'),
        h(
          'button',
          {
            class: 'btn small danger',
            type: 'button',
            onclick: () => {
              if (!confirm('移除标注图？标注将被删除，卡片保留。')) return;
              draft.diagram = null;
              buildDiagram();
              markDirty();
            },
          },
          '移除标注图',
        ),
        diagramFile,
      ),
    );
    rows.forEach(drawPin);
  }

  // Esc 取消「标到图上」
  const onEsc = (e) => {
    if (e.key === 'Escape' && editor?.cancelPlacing()) e.preventDefault();
  };
  document.addEventListener('keydown', onEsc);

  for (const card of draft.cards) addRow(card, { grow: false });
  drawAutoLangs();
  // 新建时先给几行空的
  while (rows.length < (existing ? 1 : 3)) addRow();
  buildDiagram();

  // ---- 导入 ----
  let sepTouched = false;
  const pasteEl = h('textarea', {
    class: 'input mono',
    rows: 6,
    placeholder: '粘贴 Quizlet 导出的文本或 AI 的回复\n例如：\napple\t苹果\nbanana\t香蕉',
    oninput: () => {
      if (!sepTouched) {
        pick(termSepGroup, guessTermSep(pasteEl.value));
        pick(cardSepGroup, guessCardSep(pasteEl.value));
      }
      preview();
    },
  });
  const termSepGroup = sepGroup('termSep', '词语与释义之间', [
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
        const { cards = [], title = '' } = currentImport();
        if (!cards.length) return;
        pasteEl.value = '';
        preview();
        addImported(cards, title);
      },
    },
    '添加',
  );

  // 从 Anki 搬来的复习记录、暂停了没有 (卡片 id → [[{ at, rating }], 暂停了]), 保存以后接上
  const importedReviews = new Map();

  // 存不下的时候说清楚 (size: 一共要存多少字)
  const tooBig = (size) =>
    `存储空间不足${size ? `（约需 ${(size / 1e6).toFixed(1)} MB，浏览器通常上限约 5 MB）` : ''}。请减少导入的牌组，或删除不需要的卡片集。`;
  const mediaNote = (failed) => (failed ? `；${failed} 个图片或音频无法获取，已跳过` : '');

  // 导入的卡片加到最后 (cards: [{ term, def, image?, termAudio?, defAudio?, reviews? }])
  function addImported(cards, title = '', failed = 0) {
    // 后面空着的行先去掉, 再加
    while (rows.length && isBlank(rows.at(-1))) {
      rows.pop().li.remove();
    }
    for (const c of cards) {
      const card = makeCard(c.term, c.def, { image: c.image || '', termAudio: c.termAudio || '', defAudio: c.defAudio || '' });
      if (c.reviews?.length || c.suspended) importedReviews.set(card.id, [c.reviews, c.suspended]);
      addRow(card, { grow: false });
    }
    autoGrowAll(rows.slice(-cards.length).flatMap((r) => [r.termEl, r.defEl]));
    if (title && !titleInput.value.trim()) titleInput.value = title;
    markDirty();
    importBox.open = false;
    toast(`已添加 ${cards.length} 张卡片，请保存${mediaNote(failed)}`);
    rows.at(-cards.length)?.termEl.scrollIntoView({ block: 'center' });
  }

  const fileImport = fileImportPanel({
    onText: (text, title) => {
      pasteEl.value = text;
      sepTouched = false;
      pick(termSepGroup, guessTermSep(text));
      pick(cardSepGroup, guessCardSep(text));
      preview();
      if (title && !titleInput.value.trim()) (titleInput.value = title), markDirty();
      pasteEl.focus();
    },
    onCards: (cards, title, { random = false, failed = 0 } = {}) => {
      if (random) orderSel.value = 'random';
      addImported(cards, title, failed);
    },
    onSets: (list, { random = false, failed = 0 } = {}) => {
      const made = [];
      const folders = [];
      // 一起存: 存不下就全不要 (不会只建了一半、文件夹没建、复习记录没接上)
      try {
        store.transaction(() => {
          // Anki 的「大牌组::小牌组」: 大牌组建成文件夹, 小牌组是里面的卡片集
          for (const entry of deckFolders(list)) {
            const ids = [];
            for (const g of entry.sets) {
              const cards = g.cards.map((c) => makeCard(c.term, c.def, { image: c.image, termAudio: c.termAudio, defAudio: c.defAudio }));
              const set = store.putSet({ title: g.title || '未命名卡片集', cards });
              // 带着 Anki 复习记录的: 接着 Anki 的进度排复习
              store.importReviews(set.id, cards.map((card, i) => [card.id, g.cards[i].reviews, g.cards[i].suspended]));
              if (random) store.setPlan(set.id, { order: 'random', seed: newSeed() });
              made.push(set);
              ids.push(set.id);
            }
            if (entry.folder && ids.length) {
              const folder = store.putFolder({ ...makeFolder(entry.folder), setIds: ids });
              if (random) store.setPlan(FOLDER_PREFIX + folder.id, { order: 'random', seed: newSeed() });
              folders.push(folder);
            }
          }
        });
      } catch (e) {
        console.warn(e);
        toast(e?.size !== undefined ? tooBig(e.size) : `导入失败：${e?.message ?? e}`);
        return;
      }
      if (!made.length) return;
      toast(
        (folders.length === 1 ? `已创建 ${made.length} 个卡片集，并放入文件夹「${folders[0].name}」` : `已创建 ${made.length} 个卡片集${folders.length ? `，分入 ${folders.length} 个文件夹` : ''}`) + mediaNote(failed),
      );
      if (!existing && rows.every(isBlank)) dirty = false;
      const inOne = folders.length === 1 && folders[0].setIds.length === made.length;
      go(inOne ? `#/folder/${encodeURIComponent(folders[0].id)}` : made.length === 1 ? `#/set/${encodeURIComponent(made[0].id)}` : '#/');
    },
  });
  // 拍照让 AI 做: 复制给 AI 的话, 跟照片一起发过去, AI 回的粘贴到下面的框里
  const ask = promptControls(aiCardPrompt(), { primary: false });
  const sepGroupsEl = h('div', { class: 'sep-groups' }, termSepGroup.el, cardSepGroup.el);
  const importBox = h(
    'details',
    {
      class: 'import-box',
      open: openImport,
      ondragover: (e) => {
        importBox.open = true;
        fileImport.drop.dragover(e);
      },
      ondragleave: fileImport.drop.dragleave,
      ondrop: fileImport.drop.drop,
    },
    h('summary', {}, '导入'),
    h(
      'div',
      { class: 'ai-cards' },
      h('strong', {}, '拍照生成'),
      h('p', { class: 'muted small' }, '将单词表、课本或笔记的照片连同提示词发给 Claude、ChatGPT 等 AI，再把回复粘贴到下方。'),
      ask.button,
      ask.details,
    ),
    fileImport.el,
    h(
      'p',
      { class: 'muted small' },
      '也可粘贴文本：Quizlet 卡片集「…」›「导出」›「复制文字」；或从 Excel、Word 复制两列表格。',
      ' ',
      h('a', { href: '#/quizlet' }, 'Quizlet 一键导入书签'),
    ),
    pasteEl,
    sepGroupsEl,
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

  // AI 回的 (JSON、表格) 先认; 不像的照分隔方式拆。返回 { cards, title?, error?, ai }
  function currentImport() {
    const ai = parseCardImport(pasteEl.value);
    if (ai) return { ...ai, ai: true };
    return { cards: parseCards(pasteEl.value, { termSep: termSepGroup.value(), cardSep: cardSepGroup.value() }) };
  }

  function preview() {
    const { cards = [], title = '', error = '', ai = false } = currentImport();
    importBtn.disabled = cards.length === 0;
    sepGroupsEl.hidden = ai; // AI 写的用不着选分隔方式
    if (!pasteEl.value.trim()) {
      previewEl.replaceChildren();
      return;
    }
    if (error) {
      previewEl.replaceChildren(h('p', { class: 'qe-problem' }, `⚠ ${error}`));
      return;
    }
    if (!cards.length) {
      previewEl.replaceChildren('未识别到卡片，请尝试其他分隔方式。');
      return;
    }
    const noDef = cards.filter((c) => !c.def).length;
    previewEl.replaceChildren(
      h('p', {}, (ai ? `AI 生成${title ? `「${title}」` : ''}：识别到 ${cards.length} 张卡片` : `识别到 ${cards.length} 张卡片`) + (noDef ? `，其中 ${noDef} 张缺少释义${ai ? '' : '（分隔方式可能有误）'}` : '') + '。预览：'),
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
      toast('请至少填写一张卡片');
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
      for (const key of ['known', 'starred', 'learn', 'stats', 'best', 'plan']) set[key] = latest[key];
    }
    const plan = planOf(set);
    // 新词的顺序: 在这里改了才算 (别的地方、别的设备改过的不盖掉)
    if (orderSel.value !== orderAtOpen && orderSel.value !== plan.order) set.plan = { ...plan, order: orderSel.value, seed: orderSel.value === 'random' ? newSeed() : plan.seed, at: Date.now() };
    // 卡片和导入时带着的 Anki 复习记录一起存 (保存前删掉的不算), 存不下就都不存
    let resumed = 0;
    try {
      resumed = store.transaction(() => {
        store.putSet(set);
        return importedReviews.size ? store.importReviews(set.id, [...importedReviews].map(([id, [reviews, suspended]]) => [id, reviews, suspended])) : 0;
      });
    } catch (e) {
      toast(e?.size !== undefined ? tooBig(e.size) : `保存失败：${e?.message ?? e}`);
      return;
    }
    importedReviews.clear();
    dirty = false;
    toast(resumed ? `已保存，${resumed} 张沿用 Anki 的复习进度` : '已保存');
    cleanMedia(store); // 不用的图片、录音删掉
    go(`#/set/${encodeURIComponent(draft.id)}`);
  }

  // 图片还是跟着解释那面, 录音跟着字走
  function swapAll() {
    for (const r of rows) {
      [r.termEl.value, r.defEl.value] = [r.defEl.value, r.termEl.value];
      [r.termAudio, r.defAudio] = [r.defAudio, r.termAudio];
      r.drawMedia();
    }
    autoGrowAll(rows.flatMap((r) => [r.termEl, r.defEl]));
    [termLang.value, defLang.value] = [defLang.value, termLang.value];
    markDirty();
  }

  const cancelHref = existing ? `#/set/${encodeURIComponent(existing.id)}` : '#/';
  const saveBtn = () => h('button', { class: 'btn primary', onclick: save }, existing ? '保存' : '创建');

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
      h('label', {}, '词语语言 ', termLang),
      h('label', {}, '释义语言 ', defLang),
      h('label', {}, '新词顺序 ', orderSel),
      h('button', { class: 'btn small', onclick: swapAll, title: '交换所有卡片的词语与释义' }, '⇄ 交换正反面'),
    ),
    importBox,
    diagramBox,
    rowsEl,
    h(
      'button',
      { class: 'btn add-row', onclick: () => (addRow(makeCard(), { focus: true }), markDirty()) },
      '添加卡片',
    ),
    h('div', { class: 'row end' }, saveBtn()),
  );

  // 放进页面以后才量得出高度
  requestAnimationFrame(() => autoGrowAll(rows.flatMap((r) => [r.termEl, r.defEl])));

  return {
    title: existing ? `编辑 ${existing.title}` : '新建卡片集',
    el,
    focus: openImport ? pasteEl : existing ? null : titleInput,
    // 正在存导入的图片声音时也算没保存 (走了就不导入了)
    isDirty: () => dirty || fileImport.busy(),
    canLeave: () => (!dirty && !fileImport.busy()) || confirm(fileImport.busy() ? '导入尚未完成，离开将取消导入。确定离开吗？' : '修改尚未保存，确定离开吗？'),
    cleanup: () => {
      fileImport.cancel();
      document.removeEventListener('keydown', onEsc);
      recording?.stop();
      player?.pause();
    },
  };
}

function autoGrow(el) {
  el.style.height = 'auto';
  if (el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`;
}

// 很多个一起量: 先全部改、再全部量、再全部设, 浏览器只排一次版 (一个一个量, 几千张卡片会卡死)
function autoGrowAll(els) {
  for (const el of els) el.style.height = 'auto';
  const heights = els.map((el) => el.scrollHeight);
  els.forEach((el, i) => {
    if (heights[i]) el.style.height = `${heights[i] + 2}px`;
  });
}
