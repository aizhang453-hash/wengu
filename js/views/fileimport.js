// 编辑页「导入」里的选文件: Excel、CSV、Anki。选好以后挑哪一列是词、哪一列是解释, 看看前几张, 再加进来。

import { h, fill, toast } from '../dom.js';
import { readCardFile, buildCards, guessHeader, guessColumns, columnLabels, widthOf, FileError } from '../cardfile.js';
import { AnkiError, mediaType } from '../anki.js';
import { SQLiteError } from '../sqlite.js';
import { putMediaMany, shrinkImage } from '../media.js';
import { stripMarks } from '../rich.js';

export const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt,.apkg,.colpkg';
const BIG = 2000; // 卡片多过这么多张, 加进编辑页会很慢, 建议直接建成卡片集

// onText(text, title): 普通文字, 放进粘贴框
// onCards(cards, title): 加进正在编辑的卡片集 (cards 已经是 { term, def, image, termAudio, defAudio }, 图片声音存好了)
// onSets([{ title, cards }]): 每个工作表 / 牌组建一个卡片集
// 后两个还有 { random, failed }: 每天背新词时打乱顺序 (不勾就按文件里的顺序); 几个图片 / 声音拿不到
// 返回 { el, drop, load, busy() 正在存图片声音, cancel() 离开页面时: 不导入了 }
export function fileImportPanel({ onText, onCards, onSets }) {
  let busy = false;
  let cancelled = false;
  const input = h('input', { type: 'file', accept: ACCEPT, hidden: true, onchange: () => input.files[0] && load(input.files[0]) });
  const panel = h('div', { class: 'file-panel', hidden: true });
  const pickBtn = h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, '选文件');
  const el = h(
    'div',
    { class: 'file-pick' },
    h('div', { class: 'file-pick-row' }, pickBtn, h('span', { class: 'muted small' }, 'Excel (.xlsx)、CSV、Anki 卡组 (.apkg) 或者 .txt, 也可以直接拖进来')),
    input,
    panel,
  );

  async function load(file) {
    input.value = '';
    pickBtn.disabled = true;
    pickBtn.textContent = '读取中……';
    try {
      const data = await readCardFile(file);
      if (data.kind === 'text') {
        panel.hidden = true;
        onText(data.text, data.title);
      } else {
        showTable(file.name, data);
      }
    } catch (e) {
      const known = e instanceof FileError || e instanceof AnkiError;
      toast(known ? e.message : e instanceof SQLiteError ? '这个 Anki 卡组坏了, 读不了' : '读不了这个文件, 是不是坏了?');
      if (!known) console.warn(e);
    } finally {
      pickBtn.disabled = false;
      pickBtn.textContent = '选文件';
    }
  }

  function showTable(fileName, data) {
    const { sheets, html, label, media } = data;
    const fieldsNamed = sheets.some((s) => s.columns.length);
    const sheetSelect =
      sheets.length > 1
        ? h(
            'select',
            { class: 'input', 'aria-label': label, onchange: () => (resetColumns(), draw()) },
            h('option', { value: '-1' }, `全部 ${sheets.length} 个${label}合在一起`),
            sheets.map((s, i) => h('option', { value: String(i) }, `${s.name} (${s.rows.length})`)),
          )
        : null;
    if (sheetSelect) sheetSelect.value = '0';
    const headerBox = h('input', { type: 'checkbox', onchange: () => (resetColumns(false), draw()) });
    const randomBox = h('input', { type: 'checkbox' });
    const termSel = h('select', { class: 'input', 'aria-label': '词那一列', onchange: () => draw() });
    const defSel = h('select', { class: 'input', 'aria-label': '解释那一列', onchange: () => draw() });
    const extraSel = h('select', { class: 'input', 'aria-label': '解释后面再接上', onchange: () => draw() });
    const previewEl = h('div', { class: 'preview' });
    const addBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => finish('add') }, '加进来');
    const directBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => finish('direct') }, '直接建成卡片集');
    const eachBtn = sheets.length > 1 ? h('button', { class: 'btn', type: 'button', onclick: () => finish('each') }, `每个${label}建一个卡片集`) : null;

    const chosen = () => (sheetSelect && sheetSelect.value !== '-1' ? [sheets[Number(sheetSelect.value)]] : sheetSelect ? sheets : [sheets[0]]);

    function resetColumns(guess = true) {
      const first = chosen()[0];
      if (guess && !fieldsNamed) headerBox.checked = guessHeader(first.rows);
      const header = !fieldsNamed && headerBox.checked;
      const labels = columnLabels(first, header, html);
      const width = chosen().reduce((w, s) => Math.max(w, s.columns.length, widthOf(s.rows)), labels.length);
      const options = (withNone) => [
        withNone ? h('option', { value: '-1' }, '不要') : null,
        Array.from({ length: Math.max(width, 2) }, (_, c) => h('option', { value: String(c) }, labels[c] ?? `第 ${c + 1} 列`)),
      ];
      fill(termSel, ...options(false));
      fill(defSel, ...options(false));
      fill(extraSel, ...options(true));
      const g = guessColumns(first.rows, header, { names: fieldsNamed ? first.columns : null, html });
      termSel.value = String(g.term);
      defSel.value = String(g.def);
      extraSel.value = '-1';
    }

    function cardsOf(sheet) {
      return buildCards(sheet.rows, { term: Number(termSel.value), def: Number(defSel.value), extra: Number(extraSel.value), header: !fieldsNamed && headerBox.checked, html, names: fieldsNamed ? sheet.columns : null });
    }

    function draw() {
      const cards = chosen().flatMap(cardsOf);
      addBtn.disabled = cards.length === 0;
      addBtn.textContent = `加进来 (${cards.length} 张)`;
      directBtn.hidden = cards.length <= BIG;
      if (!cards.length) {
        fill(previewEl, h('p', { class: 'muted' }, '这样选没有卡片, 换一列试试。'));
        return;
      }
      const images = cards.filter((c) => c.image).length;
      const sounds = cards.filter((c) => c.termAudio || c.defAudio).length;
      const noDef = cards.filter((c) => !c.def).length;
      const suspended = cards.filter((c) => c.suspended).length;
      const extras = [images ? `${images} 张带图片` : '', sounds ? `${sounds} 张带声音` : '', noDef ? `${noDef} 张没有解释` : '', suspended ? `${suspended} 张在 Anki 里暂停了, 这里也暂停` : ''].filter(Boolean);
      // Anki 卡组: 带没带学习进度 (复习记录)
      const withReviews = cards.filter((c) => c.reviews);
      const reviewCount = withReviews.reduce((n, c) => n + c.reviews.length, 0);
      const historyNote = !data.history
        ? null
        : withReviews.length
          ? h('p', { class: 'history-note' }, `📈 ${withReviews.length} 张带着 Anki 的复习记录 (一共 ${reviewCount} 次): 导入以后接着 Anki 的进度排复习 (用 FSRS 把记录从头算一遍), 很久没背的会排进今天的复习。`)
          : h('p', { class: 'muted small' }, '这个卡组没带学习进度。想接着 Anki 的进度背: 在 Anki 里导出卡组时勾上「包含学习进度」。');
      fill(
        previewEl,
        h('p', {}, `${cards.length} 张卡片${extras.length ? ` (${extras.join(', ')})` : ''}。前几张:`),
        historyNote,
        cards.length > BIG ? h('p', { class: 'muted small' }, '卡片很多, 加进编辑页会很慢, 建议点「直接建成卡片集」(建好以后也能编辑)。') : null,
        h(
          'table',
          { class: 'preview-table' },
          h('tbody', {}, cards.slice(0, 3).map((c) => h('tr', {}, h('td', {}, stripMarks(c.term) + (c.termAudio ? ' 🔊' : '')), h('td', {}, stripMarks(c.def) + (c.image ? ' 🖼' : '') + (c.defAudio ? ' 🔊' : ''))))),
        ),
      );
    }

    // 图片声音存进浏览器, 卡片上换成 id。几十个一批: 一起读、一起存 (几千个的卡组快好几倍)
    async function withMedia(cards, progress) {
      if (!media) return { cards: cards.map((c) => ({ ...c, image: '', termAudio: '', defAudio: '' })), failed: 0 };
      const saved = new Map();
      const names = [...new Set(cards.flatMap((c) => [c.image, c.termAudio, c.defAudio]).filter(Boolean))];
      let failed = 0;
      const BATCH = 40;
      for (let i = 0; i < names.length; i += BATCH) {
        if (cancelled) throw new DOMException('不导入了', 'AbortError');
        progress(`存图片和声音 ${Math.min(i + BATCH, names.length)}/${names.length}……`);
        const batch = names.slice(i, i + BATCH);
        const blobs = await Promise.all(
          batch.map(async (name) => {
            try {
              const blob = await media.get(name);
              const type = mediaType(name);
              if (!blob || !type) return null;
              // 图片太大的缩小一点 (150KB 以下的不用看)
              return type.startsWith('image/') && type !== 'image/svg+xml' ? await shrinkImage(blob, 1000, 150_000) : blob;
            } catch {
              return null;
            }
          }),
        );
        const ok = batch.filter((_, k) => blobs[k]);
        failed += batch.length - ok.length;
        try {
          const ids = await putMediaMany(blobs.filter(Boolean));
          ok.forEach((name, k) => saved.set(name, ids[k]));
        } catch {
          failed += ok.length; // 存不进去 (浏览器空间满了)
        }
      }
      const pick = (name, kind) => {
        const id = saved.get(name);
        return id && mediaType(name).startsWith(kind) ? id : '';
      };
      return { cards: cards.map((c) => ({ ...c, image: pick(c.image, 'image/'), termAudio: pick(c.termAudio, 'audio/'), defAudio: pick(c.defAudio, 'audio/') })), failed };
    }

    // mode: 'add' 加进编辑页, 'direct' 直接建成一个卡片集, 'each' 每个工作表 / 牌组建一个
    async function finish(mode) {
      const each = mode === 'each';
      const groups = each
        ? sheets.map((s) => ({ path: s.name, title: s.name.split('::').pop().trim() || data.title, cards: cardsOf(s) })).filter((g) => g.cards.length)
        : [{ title: sheetSelect && sheetSelect.value !== '-1' ? chosen()[0].name.split('::').pop().trim() : data.title, cards: chosen().flatMap(cardsOf) }];
      const btn = { add: addBtn, direct: directBtn, each: eachBtn }[mode];
      const label0 = btn.textContent;
      for (const b of [addBtn, directBtn, eachBtn]) if (b) b.disabled = true;
      busy = true;
      try {
        const all = groups.flatMap((g) => g.cards);
        const { cards, failed } = await withMedia(all, (t) => (btn.textContent = t));
        if (cancelled) return;
        let k = 0;
        const done = groups.map((g) => ({ ...g, cards: cards.slice(k, (k += g.cards.length)) }));
        panel.hidden = true;
        const opts = { random: randomBox.checked, failed };
        if (mode === 'add') onCards(done[0].cards, done[0].title, opts);
        else onSets(done, opts);
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.warn(e);
        toast('存不进去, 可能浏览器空间满了');
      } finally {
        busy = false;
        btn.textContent = label0;
        for (const b of [addBtn, directBtn, eachBtn]) if (b) b.disabled = false;
      }
    }

    resetColumns();
    fill(
      panel,
      h('div', { class: 'file-head' }, h('strong', {}, `📄 ${fileName}`), h('button', { class: 'btn small', type: 'button', onclick: () => (panel.hidden = true) }, '不用这个文件')),
      h(
        'div',
        { class: 'file-options' },
        sheetSelect ? h('label', {}, label, sheetSelect) : null,
        h('label', {}, '词', termSel),
        h('label', {}, '解释', defSel),
        h('label', {}, '解释后面再接上', extraSel),
        fieldsNamed ? null : h('label', { class: 'check' }, headerBox, ' 第一行是标题, 不要'),
        h('label', { class: 'check', title: '每天背新词时先背哪些; 不勾就按文件里的顺序。以后在卡片集里也能改' }, randomBox, ' 新词打乱顺序背'),
      ),
      previewEl,
      h('div', { class: 'row' }, addBtn, directBtn, eachBtn),
      // Anki 里大牌组下面分小牌组的
      eachBtn && sheets.some((s) => s.name.includes('::'))
        ? h('p', { class: 'muted small' }, `「${eachBtn.textContent}」照 Anki 的样子建: 大牌组变成文件夹, 小牌组变成里面的卡片集。文件夹里能合起来学, 也能给整个大牌组定每天背多少 (照顺序一个小牌组一个小牌组来)。`)
        : null,
    );
    panel.hidden = false;
    draw();
  }

  // 拖文件进来
  const drop = {
    dragover: (e) => {
      if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
      e.preventDefault();
      el.closest('.import-box')?.classList.add('dragging');
    },
    dragleave: () => el.closest('.import-box')?.classList.remove('dragging'),
    drop: (e) => {
      const file = e.dataTransfer?.files?.[0];
      el.closest('.import-box')?.classList.remove('dragging');
      if (!file) return;
      e.preventDefault();
      load(file);
    },
  };
  return { el, drop, load, busy: () => busy, cancel: () => (cancelled = true) };
}
