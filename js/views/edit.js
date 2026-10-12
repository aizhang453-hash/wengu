// 新建 / 编辑卡片集, 包括从 Quizlet 粘贴导入

import { h, toast } from '../dom.js';
import { makeSet, makeCard } from '../store.js';
import { parseCards, guessTermSep, guessCardSep } from '../parse.js';
import { LANGS } from '../speech.js';

export function renderEdit({ store, go }, id, { openImport = false } = {}) {
  const existing = id ? store.getSet(id) : null;
  if (id && !existing) {
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
  const rows = []; // { id, termEl, defEl, li }

  function addRow(card = makeCard(), { focus = false } = {}) {
    const termEl = h('textarea', {
      class: 'input grow',
      rows: 1,
      placeholder: '词',
      value: card.term,
      'aria-label': '词',
      oninput: onInput,
    });
    const defEl = h('textarea', {
      class: 'input grow',
      rows: 1,
      placeholder: '解释',
      value: card.def,
      'aria-label': '解释',
      oninput: onInput,
      onkeydown: (e) => {
        // 在最后一张的「解释」里按 Tab, 自动加一张新的 (跟 Quizlet 一样)
        if (e.key === 'Tab' && !e.shiftKey && rows.at(-1)?.defEl === defEl) {
          e.preventDefault();
          addRow(makeCard(), { focus: true });
          markDirty();
        }
      },
    });
    const row = { id: card.id, termEl, defEl, li: null };
    row.li = h(
      'li',
      { class: 'edit-row' },
      h('span', { class: 'row-num' }),
      h('div', { class: 'edit-sides' }, termEl, defEl),
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
    return !row.termEl.value.trim() && !row.defEl.value.trim();
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
      .map((r) => ({ id: r.id, term: r.termEl.value.trim(), def: r.defEl.value.trim() }));
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
    // 用户在别的页面 (比如单词卡) 改过的进度, 以存着的为准
    const latest = store.getSet(draft.id);
    if (latest) {
      set.known = latest.known;
      set.starred = latest.starred;
    }
    try {
      store.putSet(set);
    } catch {
      toast('存不下了: 浏览器给的空间满了');
      return;
    }
    dirty = false;
    toast('保存好了');
    go(`#/set/${encodeURIComponent(draft.id)}`);
  }

  function swapAll() {
    for (const r of rows) {
      [r.termEl.value, r.defEl.value] = [r.defEl.value, r.termEl.value];
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
  };
}

function autoGrow(el) {
  el.style.height = 'auto';
  if (el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`;
}
