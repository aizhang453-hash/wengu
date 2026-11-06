// 阅读 (书库): 唐诗宋词和古代启蒙读物的原文 (想法在 ../reading.js)
//   #/read                书架: 每日一首、接着读、搜索、所有的书、收藏
//   #/read/<书>           一本书的目录
//   #/read/<书>/<第几篇>  读一篇 (从 1 数): 收藏、做成卡片背、朗读、简体 / 繁体、字号; ← → 换篇
//   首页「今日」的「每日一首」也在这里画 (dailyCard)
// 书的正文要等拿来 (import) 才画, 先画架子; 拿来时已经换页了就不画

import { h, fill, toast, icon, openDialog } from '../dom.js';
import { BOOKS, SOURCE, bookOf, loadBook, pieceId, makeCards, setTitle, DAILY_BOOK, dailyIndex, searchLibrary, isFav, favList, recentBooks } from '../reading.js';
import { makeSet, makeCard } from '../store.js';
import { dayKey } from '../srs.js';
import { speak, canSpeak } from '../speech.js';

// 这台设备上的: hant 看繁体原文, size 字号 (0 小 1 中 2 大)
const PREFS_KEY = 'wengu:read';
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return { hant: Boolean(raw?.hant), size: [0, 1, 2].includes(raw?.size) ? raw.size : 1 };
  } catch {
    return { hant: false, size: 1 };
  }
}
function savePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // 存不下就只管这次
  }
}

const pieceHref = (book, i) => `#/read/${book}/${i + 1}`;
const byline = (book, p) => (book.kind === 'poem' ? [p.e ? `〔${p.e}〕` : '', p.a ?? ''].join('') : '');
const unitOf = (book, i) => (book.count > 1 ? `第 ${i + 1} ${book.unit}` : '');

// 正文拿不来 (第一次打开时没网)
const offline = () => h('p', { class: 'muted' }, '没能打开这本书，请连上网再试一次（打开过一次以后断网也能读）。');

// 拿到书的正文再画进 box; 拿来时 box 已经不在页面上了就算了
function whenLoaded(box, id, opts, draw) {
  loadBook(id, opts).then(
    (data) => box.isConnected && data && fill(box, draw(data)),
    () => box.isConnected && fill(box, offline()),
  );
}

// ---- 每日一首 (首页、书架上) ----
export function dailyCard({ compact = false } = {}) {
  const book = bookOf(DAILY_BOOK);
  const box = h('a', { class: `read-daily${compact ? ' compact' : ''}`, href: '#/read', 'aria-label': '每日一首' });
  const i = dailyIndex(dayKey(), book.count);
  loadBook(DAILY_BOOK).then(
    (data) => {
      const p = data.pieces[i];
      box.href = pieceHref(DAILY_BOOK, i);
      fill(
        box,
        h('span', { class: 'read-daily-tag' }, `每日一首 · ${book.title}`),
        h('strong', { class: 'read-daily-title' }, p.t, h('span', { class: 'muted' }, ` ${byline(book, p)}`)),
        h(
          'span',
          { class: 'read-daily-lines' },
          p.p.slice(0, compact ? 2 : 4).map((l) => h('span', {}, l)),
        ),
      );
    },
    () => box.remove(),
  );
  return box;
}

// ---- 书架 ----
export function renderLibrary({ store }) {
  const reading = store.data.reading;
  const recent = recentBooks(reading).slice(0, 3);
  const favs = favList(reading);
  const results = h('div', { class: 'read-results', 'aria-live': 'polite' });
  let searchN = 0;
  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: '搜题目、作者或句子，比如：春眠、孟浩然、一寸光阴',
    'aria-label': '在书库里搜',
    oninput: async () => {
      const n = ++searchN;
      const q = search.value.trim();
      if (!q) return fill(results);
      const hits = await searchLibrary(q).catch(() => null);
      if (n !== searchN || !results.isConnected) return; // 又打了字
      if (!hits) return fill(results, offline());
      fill(
        results,
        hits.length
          ? h(
              'ul',
              { class: 'read-list' },
              hits.map((x) => {
                const book = bookOf(x.book);
                return h(
                  'li',
                  {},
                  h(
                    'a',
                    { href: pieceHref(x.book, x.i) },
                    h('strong', {}, x.piece.t),
                    h('span', { class: 'muted small' }, ` ${book.title}${byline(book, x.piece) ? ` · ${byline(book, x.piece)}` : ''}`),
                    h('span', { class: 'read-hit' }, x.line),
                  ),
                );
              }),
            )
          : h('p', { class: 'muted' }, '没找到。可以少打几个字试试。'),
        hits.length === 60 ? h('p', { class: 'muted small' }, '只列出前 60 个。') : null,
      );
    },
  });

  // 收藏: 要拿到书才知道题目
  const favBox = h('ul', { class: 'read-list' });
  if (favs.length) {
    const books = [...new Set(favs.map((f) => f.book))];
    Promise.all(books.map((id) => loadBook(id))).then(
      (list) => {
        if (!favBox.isConnected) return;
        const data = Object.fromEntries(books.map((id, k) => [id, list[k]]));
        fill(
          favBox,
          favs.map((f) => {
            const book = bookOf(f.book);
            const p = data[f.book].pieces[f.i];
            return h('li', {}, h('a', { href: pieceHref(f.book, f.i) }, h('strong', {}, p.t), h('span', { class: 'muted small' }, ` ${book.title}${byline(book, p) ? ` · ${byline(book, p)}` : ''}`), h('span', { class: 'read-hit' }, p.p[0] ?? '')));
          }),
        );
      },
      () => favBox.isConnected && fill(favBox, offline()),
    );
  }

  return {
    title: '阅读',
    el: h(
      'section',
      { class: 'read-page' },
      h('div', { class: 'page-head' }, h('h1', {}, '阅读'), h('span', { class: 'muted' }, '唐诗宋词和古代启蒙读物，原文免费读')),
      dailyCard(),
      recent.length
        ? h(
            'div',
            { class: 'read-recent' },
            h('span', { class: 'muted small' }, '接着读'),
            recent.map((r) => h('a', { class: 'chip', href: pieceHref(r.book, r.i) }, `${bookOf(r.book).title}${unitOf(bookOf(r.book), r.i) ? ` · ${unitOf(bookOf(r.book), r.i)}` : ''}`)),
          )
        : null,
      h('div', { class: 'read-search' }, search),
      results,
      h('div', { class: 'list-head' }, h('h2', {}, '书架'), h('span', { class: 'muted small' }, `${BOOKS.length} 本`)),
      h(
        'ul',
        { class: 'read-shelf' },
        BOOKS.map((b) =>
          h(
            'li',
            {},
            h(
              'a',
              { class: 'read-book', href: `#/read/${b.id}` },
              h('span', { class: 'read-spine', 'aria-hidden': 'true' }, b.title),
              h('span', { class: 'read-book-text' }, h('strong', {}, `《${b.title}》`), h('span', { class: 'muted small' }, `${b.era} · ${b.author} · ${b.count} ${b.unit}`), h('span', { class: 'small read-intro' }, b.intro)),
            ),
          ),
        ),
      ),
      favs.length ? [h('div', { class: 'list-head' }, h('h2', {}, '收藏'), h('span', { class: 'muted small' }, `${favs.length} 篇`)), favBox] : null,
      sourceNote(),
    ),
  };
}

const sourceNote = () =>
  h(
    'p',
    { class: 'muted small read-source' },
    '原文来自开源项目 ',
    h('a', { href: SOURCE.url, target: '_blank', rel: 'noopener' }, SOURCE.name),
    `（${SOURCE.license} 许可），原书是繁体，简体是自动转换的，个别字可能有出入，读一篇时可以切换成繁体看原文。`,
  );

// ---- 一本书的目录 ----
export function renderBook({ store }, id) {
  const book = bookOf(id);
  if (!book) return notFound();
  const last = store.data.reading?.last[id];
  const list = h('div', { class: 'read-toc' }, h('p', { class: 'muted' }, '正在打开……'));
  whenLoaded(list, id, {}, (data) => {
    const item = (p, i) =>
      h(
        'li',
        { class: last?.i === i ? 'on' : '' },
        h('a', { href: pieceHref(id, i) }, book.kind === 'poem' ? null : h('span', { class: 'read-no' }, `${i + 1}`), h('span', {}, p.t), book.kind === 'poem' && p.a ? h('span', { class: 'muted small' }, ` ${p.a}`) : null),
      );
    const items = data.pieces.map((p, i) => ({ p, i }));
    if (!data.groups.length) return h('ol', { class: `read-list read-toc-list ${book.kind}` }, items.map(({ p, i }) => item(p, i)));
    return data.groups.map((g, gi) => [h('h2', {}, g), h('ol', { class: `read-list read-toc-list ${book.kind}` }, items.filter(({ p }) => p.g === gi).map(({ p, i }) => item(p, i)))]);
  });
  return {
    title: book.title,
    el: h(
      'section',
      { class: 'read-page' },
      h('a', { class: 'back', href: '#/read' }, '← 阅读'),
      h('h1', {}, `《${book.title}》`),
      h('p', { class: 'muted' }, `${book.era} · ${book.author} · ${book.count} ${book.unit}`),
      h('p', {}, book.intro),
      h(
        'div',
        { class: 'row' },
        last
          ? h('a', { class: 'btn primary', href: pieceHref(id, last.i) }, `接着读${unitOf(book, last.i) ? `（${unitOf(book, last.i)}）` : ''}`)
          : h('a', { class: 'btn primary', href: pieceHref(id, 0) }, '从头读'),
        last ? h('a', { class: 'btn', href: pieceHref(id, 0) }, '从头读') : null,
      ),
      list,
    ),
  };
}

// ---- 读一篇 ----
export function renderPiece({ store, go }, id, n) {
  const book = bookOf(id);
  const i = Number(n) - 1;
  if (!book || !Number.isInteger(i) || i < 0 || i >= book.count) return notFound();
  const prefs = loadPrefs();
  const pid = pieceId(id, i);
  store.markRead(id, i);

  const body = h('article', { class: `read-piece ${book.kind} size-${prefs.size}`, lang: prefs.hant ? 'zh-Hant' : 'zh-Hans' }, h('p', { class: 'muted' }, '正在打开……'));
  const favBtn = h('button', { class: 'btn small', type: 'button', 'aria-pressed': 'false', onclick: () => toggleFav() });
  const drawFav = () => {
    const on = isFav(store.data.reading, pid);
    favBtn.setAttribute('aria-pressed', String(on));
    favBtn.classList.toggle('on', on);
    fill(favBtn, on ? '★ 已收藏' : '☆ 收藏');
  };
  const toggleFav = () => {
    const on = !isFav(store.data.reading, pid);
    store.setFav(pid, on);
    drawFav();
    toast(on ? '收藏了，在「阅读」页能找到' : '取消收藏了');
  };
  drawFav();

  let text = null; // 拿到的这一篇 (简体), 做卡片、朗读用
  const draw = () =>
    whenLoaded(body, id, { hant: prefs.hant }, (data) => {
      const p = data.pieces[i];
      if (!prefs.hant) text = { data, p };
      return [
        h('h1', { class: 'read-title' }, p.t),
        h('p', { class: 'read-by muted' }, [byline(book, p), book.kind === 'poem' ? '' : `《${data.title}》${data.groups[p.g] ? ` · ${data.groups[p.g]}` : ''}${unitOf(book, i) ? ` · ${unitOf(book, i)}` : ''}`].filter(Boolean).join(' ')),
        // 一行一行都短的 (三字经、千字文、增广贤文……) 像诗一样居中, 不缩进; 长段落的 (幼学琼林、声律启蒙) 首行缩进
        h(
          'div',
          { class: `read-text${p.p.every((l) => l.length <= 24) ? ' verse' : ''}` },
          p.p.map((l) => h('p', {}, l)),
        ),
        // 版本注释 (唐诗三百首里的「明年 一作：年年」)
        p.n?.length ? h('p', { class: 'read-notes muted small' }, `注：${p.n.join('；')}`) : null,
      ];
    });
  draw();
  // 做卡片、朗读用简体的 (看繁体时另外拿)
  const simple = () => (text ? Promise.resolve(text) : loadBook(id).then((data) => ({ data, p: data.pieces[i] })));

  const hantBtn = h('button', { class: 'btn small', type: 'button', title: '简体 / 繁体原文', onclick: () => ((prefs.hant = !prefs.hant), savePrefs(prefs), (body.lang = prefs.hant ? 'zh-Hant' : 'zh-Hans'), (hantBtn.textContent = prefs.hant ? '简体' : '繁体'), draw()) }, prefs.hant ? '简体' : '繁体');
  const sizeBtn = (d, label, name) =>
    h('button', {
      class: 'btn small',
      type: 'button',
      'aria-label': name,
      title: name,
      onclick: () => {
        prefs.size = Math.max(0, Math.min(2, prefs.size + d));
        savePrefs(prefs);
        body.classList.remove('size-0', 'size-1', 'size-2');
        body.classList.add(`size-${prefs.size}`);
      },
    }, label);
  const say = canSpeak()
    ? h('button', { class: 'btn small', type: 'button', onclick: () => simple().then(({ p }) => speak(`${p.t}。${byline(book, p) ? `${p.a}。` : ''}${p.p.join('')}`, 'zh-CN', { rate: 0.85 })) }, icon('volume', 16), ' 朗读')
    : null;

  const prev = i > 0 ? i - 1 : null;
  const next = i + 1 < book.count ? i + 1 : null;
  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')) return;
    if (e.key === 'ArrowLeft' && prev !== null) go(pieceHref(id, prev));
    if (e.key === 'ArrowRight' && next !== null) go(pieceHref(id, next));
  };
  document.addEventListener('keydown', onKey);

  return {
    title: `${book.title}${unitOf(book, i) ? ` ${unitOf(book, i)}` : ''}`,
    cleanup: () => {
      document.removeEventListener('keydown', onKey);
      globalThis.speechSynthesis?.cancel?.();
    },
    el: h(
      'section',
      { class: 'read-page' },
      h('div', { class: 'read-top' }, h('a', { class: 'back', href: `#/read/${id}` }, `← 《${book.title}》目录`), h('span', { class: 'muted small' }, `${i + 1} / ${book.count}`)),
      body,
      h(
        'div',
        { class: 'read-tools' },
        favBtn,
        h('button', { class: 'btn small primary', type: 'button', onclick: () => simple().then(({ data, p }) => cardsDialog({ store, go }, book, data, p)) }, '做成卡片背'),
        say,
        hantBtn,
        sizeBtn(-1, 'A−', '字小一点'),
        sizeBtn(1, 'A+', '字大一点'),
      ),
      h(
        'nav',
        { class: 'read-nav', 'aria-label': '换篇' },
        prev !== null ? h('a', { class: 'btn', href: pieceHref(id, prev) }, `← 上一${book.unit}`) : h('span'),
        next !== null ? h('a', { class: 'btn', href: pieceHref(id, next) }, `下一${book.unit} →`) : h('a', { class: 'btn', href: `#/read/${id}` }, '读完了，回目录'),
      ),
    ),
  };
}

// ---- 做成卡片: 接下句 / 整篇, 这一篇 / 整本 ----
function cardsDialog({ store, go }, book, data, piece) {
  const draft = { style: 'next', all: false };
  const preview = h('p', { class: 'muted small' });
  const choice = (key, value, label, desc) =>
    h('button', { class: `chip-toggle${draft[key] === value ? ' on' : ''}`, type: 'button', 'aria-pressed': String(draft[key] === value), title: desc, onclick: () => ((draft[key] = value), draw()) }, label);
  const box = h('div', { class: 'read-cards' });
  const pieces = () => (draft.all ? data.pieces : [piece]);
  const cards = () => makeCards(book, pieces(), draft.style);
  const title = () => setTitle(book, draft.all ? null : piece);
  function draw() {
    const list = cards();
    const sample = list[book.kind === 'poem' && draft.style === 'next' ? Math.min(1, list.length - 1) : 0];
    fill(
      box,
      h('p', { class: 'small' }, '怎么背'),
      h('div', { class: 'chip-row two' }, choice('style', 'next', '接下句', '正面一句，背面下一句'), choice('style', 'whole', book.kind === 'poem' ? '整首' : '整段', '正面题目，背面全文')),
      h('p', { class: 'muted small' }, draft.style === 'next' ? '正面是一句，想下一句是什么，翻过来对答案。适合一句一句背熟。' : `正面是题目，背面是全文。适合背完以后整${book.kind === 'poem' ? '首' : '段'}默写、复习。`),
      book.count > 1
        ? [
            h('p', { class: 'small' }, '做哪些'),
            h('div', { class: 'chip-row two' }, choice('all', false, `这一${book.unit}`, piece.t), choice('all', true, `整本（${book.count} ${book.unit}）`, book.title)),
          ]
        : null,
      sample ? h('div', { class: 'read-sample' }, h('span', { class: 'muted small' }, '卡片样子'), h('div', { class: 'read-sample-card' }, h('span', {}, sample.term), h('span', { class: 'read-sample-arrow', 'aria-hidden': 'true' }, '→'), h('span', {}, sample.def.length > 60 ? `${sample.def.slice(0, 60)}……` : sample.def))) : null,
    );
    fill(preview, `做成卡片集「${title()}」，一共 ${list.length} 张。`);
  }
  draw();
  const dialog = openDialog({
    title: '做成卡片背',
    body: [box, preview],
    footer: [
      h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, '取消'),
      h(
        'button',
        {
          class: 'btn primary',
          type: 'button',
          onclick: () => {
            const name = title();
            const same = store.allSets().find((s) => s.title === name);
            if (same && !confirm(`已经有一个「${name}」卡片集了，再做一个吗？`)) return;
            const list = cards();
            const set = makeSet({
              title: name,
              description: `从温故书库做的：《${book.title}》${draft.all ? '' : `「${piece.t}」`}，${draft.style === 'next' ? '接下句' : `整${book.unit}`}。`,
              termLang: 'zh-CN',
              defLang: 'zh-CN',
              cards: list.map((c) => makeCard(c.term, c.def)),
            });
            let saved;
            try {
              saved = store.putSet(set);
            } catch {
              return toast('存不下了：浏览器给的空间满了，先导出备份、删掉不用的卡片集再试');
            }
            dialog.close();
            toast(`做好了 ${list.length} 张卡片。在卡片集页可以开始背，也可以定每日计划`);
            go(`#/set/${encodeURIComponent(saved.id)}`);
          },
        },
        '做成卡片集',
      ),
    ],
  });
}

function notFound() {
  return {
    title: '找不到',
    el: h('section', { class: 'empty' }, h('h1', {}, '找不到这本书'), h('a', { class: 'btn primary', href: '#/read' }, '回书架')),
  };
}
