// 阅读 (书库): 唐诗宋词、论语、古文观止和古代启蒙读物的原文 (想法在 ../reading.js)
//   #/read                书架 (按 SHELVES 分层, 书竖着立着露出书脊): 每日一首、接着读、搜索、所有的书、收藏
//   #/read/<书>           一本书的目录
//   #/read/<书>/<第几篇>  读一篇 (从 1 数): 收藏、做成卡片背、朗读、简体 / 繁体、字号; ← → 换篇
//   首页「今日」的「每日一首」也在这里画 (dailyCard)
// 书的正文要等拿来 (import) 才画, 先画架子; 拿来时已经换页了就不画

import { h, fill, toast, icon, openDialog } from '../dom.js';
import { BOOKS, SOURCE, SHELVES, bookOf, loadBook, pieceId, makeCards, setTitle, DAILY_BOOK, dailyIndex, searchLibrary, isFav, favList, recentBooks, readingsOf, splitMarks, spokenText, loadYizhu, notesOf } from '../reading.js';
import { makeSet, makeCard } from '../store.js';
import { dayKey } from '../srs.js';
import { speak, canSpeak } from '../speech.js';

// 这台设备上的: hant 看繁体原文, size 字号 (0 小 1 中 2 大), zhu 标注释 (默认标), yi 每段下面显示译文 (默认不显示)
const PREFS_KEY = 'wengu:read';
function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return { hant: Boolean(raw?.hant), size: [0, 1, 2].includes(raw?.size) ? raw.size : 1, zhu: raw?.zhu !== false, yi: raw?.yi === true };
  } catch {
    return { hant: false, size: 1, zhu: true, yi: false };
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
// 「〔唐〕孟浩然」「〔先秦〕左丘明 《左传》」; 没有作者的 (三字经的一段) 是空的
const byline = (p) => (p.a ? `${p.e ? `〔${p.e}〕` : ''}${p.a}${p.s ? ` ${p.s}` : ''}` : '');
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
        h('strong', { class: 'read-daily-title' }, p.t, h('span', { class: 'muted' }, ` ${byline(p)}`)),
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
                    h('span', { class: 'muted small' }, ` ${book.title}${byline(x.piece) ? ` · ${byline(x.piece)}` : ''}`),
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
            return h('li', {}, h('a', { href: pieceHref(f.book, f.i) }, h('strong', {}, p.t), h('span', { class: 'muted small' }, ` ${book.title}${byline(p) ? ` · ${byline(p)}` : ''}`), h('span', { class: 'read-hit' }, p.p[0] ?? '')));
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
      h('div', { class: 'list-head' }, h('h2', {}, '书架'), h('span', { class: 'muted small' }, `${BOOKS.length} 本 · 点书看简介和目录`)),
      h('div', { class: 'read-shelves' }, SHELVES.map((s, row) => shelf(s, BOOKS.filter((b) => b.cat === s.key), row))),
      favs.length ? [h('div', { class: 'list-head' }, h('h2', {}, '收藏'), h('span', { class: 'muted small' }, `${favs.length} 篇`)), favBox] : null,
      sourceNote(),
    ),
  };
}

// 一层书架: 书竖着立着, 露出书脊 (书名竖着写); 篇数多的书厚一点、高一点, 颜色一层里轮着来 (挨着的不一样)
const CLOTH = ['#b8372e', '#3f6f8f', '#5d7d3a', '#8a6236', '#6b4f8a', '#2f6b66', '#a0522d', '#4a5a7a'];
function shelf(s, books, row) {
  if (!books.length) return null;
  const size = (n) => Math.log2(n + 1);
  return h(
    'section',
    { class: 'read-shelf', 'aria-label': s.name },
    h('div', { class: 'read-shelf-head' }, h('h3', {}, s.name), h('span', { class: 'muted small' }, `${books.length} 本`)),
    h(
      'ul',
      { class: 'read-spines' },
      books.map((b, i) =>
        h(
          'li',
          {},
          h(
            'a',
            {
              class: 'read-spine-book',
              href: `#/read/${b.id}`,
              title: `《${b.title}》${b.era} · ${b.author}\n${b.intro}`,
              'aria-label': `《${b.title}》，${b.era}，${b.count} ${b.unit}`,
              style: `--c: ${CLOTH[(row * 3 + i) % CLOTH.length]}; --w: ${Math.round(46 + Math.min(16, size(b.count) * 2))}px; --h: ${Math.round(122 + Math.min(34, size(b.count) * 4))}px`,
            },
            h('span', { class: 'read-spine-title' }, b.title),
            h('span', { class: 'read-spine-count' }, `${b.count}${b.unit}`),
          ),
        ),
      ),
    ),
  );
}

// 注释和译文是温故自己写的 (原文的资料里没有)
const YIZHU_NOTE = '注释和译文是温故自己写的，讲法照通行的课本注释；有两种讲法的写了「一说」。难免有疏漏，欢迎指出。';

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
        h('a', { href: pieceHref(id, i) }, book.kind === 'poem' ? null : h('span', { class: 'read-no' }, `${i + 1}`), h('span', {}, p.t), p.a ? h('span', { class: 'muted small' }, ` ${p.a}`) : null),
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
  let entry = null; // 这一篇的注释和译文 (有的才有)
  // 点了注释的词: 在页面底下显示解释
  const gloss = h('div', { class: 'read-gloss', hidden: true, role: 'status' });
  const showGloss = (el, m) => {
    body.querySelectorAll('.read-term.on').forEach((x) => x.classList.remove('on'));
    el.classList.add('on');
    fill(gloss, h('span', {}, h('strong', {}, m.w), `：${m.note}`), h('button', { class: 'read-gloss-close', type: 'button', 'aria-label': '关上', onclick: () => ((gloss.hidden = true), el.classList.remove('on')) }, '×'));
    gloss.hidden = false;
  };
  // 读音特别的字上面标拼音, 注释的词下面画虚线、标号 (都按简体那份找, 繁体一行一样长时标在同样的位置); 正文下面列出读音说明、注释, 打开「译文」时每段下面跟着译文
  const render = (hans, data) => {
    const p = data.pieces[i];
    const hp = hans.pieces[i];
    const marks = readingsOf(id, hp);
    const glosses = entry && prefs.zhu ? notesOf(hp, entry) : [];
    const shown = new Map(); // 「说 yuè」→ 说明 (按页面上的字)
    // 一段字标上拼音 (off: 这段在一行里从第几个字起)
    const ruby = (str, mine, off) =>
      splitMarks(
        str,
        mine.map((m) => ({ ...m, at: m.at - off })),
      ).map((x) => {
        if (!x.mark) return x.text;
        shown.set(`${x.text} ${x.mark.py}`, x.mark.note);
        return h('ruby', { class: 'read-ruby', title: `${x.mark.py}：${x.mark.note}` }, x.text, h('rt', {}, x.mark.py));
      });
    const marked = (str, k, simple) => {
      const mine = marks.filter((m) => m.line === k);
      const terms = glosses.filter((m) => m.line === k);
      if ((!mine.length && !terms.length) || str.length !== simple.length) return str;
      let off = 0;
      return splitMarks(str, terms).map((x) => {
        const start = off;
        off += x.text.length;
        if (!x.mark) return ruby(x.text, mine, start);
        const m = x.mark;
        const term = h(
          'span',
          { class: 'read-term', role: 'button', tabindex: '0', title: `${m.w}：${m.note}`, onclick: () => showGloss(term, m), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), showGloss(term, m)) },
          ruby(x.text, mine, start),
          '\u2060', // 号跟词连着, 不单独折到下一行
          h('sup', { class: 'read-term-n' }, String(m.n)),
        );
        return term;
      });
    };
    const yi = entry && prefs.yi ? entry.yi : null;
    const title = h('h1', { class: 'read-title' }, marked(p.t, -1, hp.t));
    const lines = p.p.map((l, j) => [
      p.k?.find(([from]) => from === j) ? h('h2', { class: 'read-part' }, p.k.find(([from]) => from === j)[1]) : null,
      h('p', {}, marked(l, j, hp.p[j] ?? '')),
      yi?.[j] ? h('p', { class: 'read-yi', lang: 'zh-Hans' }, yi[j]) : null,
    ]);
    return [
      title,
      // 有作者的写作者 (和分组), 没有的写书名、分组、第几篇: 「〔唐〕孟浩然 · 五言绝句」「《三字经》 · 第 1 段」
      h('p', { class: 'read-by muted' }, [byline(p) || `《${data.title}》`, data.groups[p.g], p.a ? '' : unitOf(book, i)].filter(Boolean).join(' · ')),
      // 一行一行都短的 (三字经、千字文、增广贤文……) 像诗一样居中, 不缩进; 长段落的 (幼学琼林、古文观止) 首行缩进。
      // 组诗在每首前面写「其一」「其二」
      h('div', { class: `read-text${p.p.every((l) => l.length <= 24) ? ' verse' : ''}` }, lines),
      shown.size ? h('p', { class: 'read-notes muted small' }, `读音：${[...shown].map(([k, note]) => `${k}（${note}）`).join('；')}`) : null,
      // 版本注释 (唐诗三百首里的「明年 一作：年年」)
      p.n?.length ? h('p', { class: 'read-notes muted small' }, `注：${p.n.join('；')}`) : null,
      glosses.length
        ? h(
            'section',
            { class: 'read-zhu', lang: 'zh-Hans', 'aria-label': '注释' },
            h('h2', {}, '注释'),
            h(
              'ol',
              {},
              glosses.map((m) => h('li', {}, h('strong', {}, m.w), `：${m.note}`)),
            ),
          )
        : null,
      entry ? h('p', { class: 'read-notes muted small' }, YIZHU_NOTE) : null,
      gloss,
    ];
  };
  // 注释、译文拿不来 (没网) 就只显示原文
  const draw = () =>
    Promise.all([loadBook(id), prefs.hant ? loadBook(id, { hant: true }) : null, loadYizhu(id).catch(() => null)]).then(
      ([hans, hant, yizhu]) => {
        text = { data: hans, p: hans.pieces[i], yizhu };
        entry = yizhu?.[hans.pieces[i].t] ?? null;
        zhuBtn.hidden = yiBtn.hidden = !entry;
        gloss.hidden = true;
        if (body.isConnected) fill(body, render(hans, hant ?? hans));
      },
      () => body.isConnected && fill(body, offline()),
    );
  // 注释 (词下面的虚线和号)、译文 (每段下面): 这一篇有才显示, 开关记在这台设备上
  const toggle = (key, label, desc) => {
    const btn = h('button', {
      class: `btn small${prefs[key] ? ' on' : ''}`,
      type: 'button',
      hidden: true,
      title: desc,
      'aria-pressed': String(prefs[key]),
      onclick: () => {
        prefs[key] = !prefs[key];
        savePrefs(prefs);
        btn.classList.toggle('on', prefs[key]);
        btn.setAttribute('aria-pressed', String(prefs[key]));
        gloss.hidden = true;
        draw();
      },
    }, label);
    return btn;
  };
  const zhuBtn = toggle('zhu', '注释', '在要注释的词下面画线，点一下看解释');
  const yiBtn = toggle('yi', '译文', '每段下面显示白话译文');
  draw();
  // 做卡片、朗读用简体的
  const simple = () => (text ? Promise.resolve(text) : Promise.all([loadBook(id), loadYizhu(id).catch(() => null)]).then(([data, yizhu]) => ({ data, p: data.pieces[i], yizhu })));

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
  // 读音特别的字换成同音字念 (「不亦说乎」念「不亦悦乎」)
  const readAloud = () =>
    simple().then(({ p }) => {
      const said = spokenText(id, p);
      speak(`${said.title}。${p.a ? `${p.a}。` : ''}${said.lines.join('')}`, 'zh-CN', { rate: 0.85 });
    });
  const say = canSpeak() ? h('button', { class: 'btn small', type: 'button', onclick: readAloud }, icon('volume', 16), ' 朗读') : null;

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
        h('button', { class: 'btn small primary', type: 'button', onclick: () => simple().then(({ data, p, yizhu }) => cardsDialog({ store, go }, book, data, p, yizhu)) }, '做成卡片背'),
        say,
        zhuBtn,
        yiBtn,
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
//   有注释的书多一种「字词」: 正面注的词 (带着那一小句), 背面注释; 整本就是有注释的那几篇
function cardsDialog({ store, go }, book, data, piece, yizhu = null) {
  const draft = { style: 'next', all: false };
  const hasZhu = (p) => Boolean(yizhu?.[p.t]?.notes?.length);
  const zhuOK = () => (draft.all ? data.pieces.some(hasZhu) : hasZhu(piece));
  const preview = h('p', { class: 'muted small' });
  const choice = (key, value, label, desc) =>
    h('button', { class: `chip-toggle${draft[key] === value ? ' on' : ''}`, type: 'button', 'aria-pressed': String(draft[key] === value), title: desc, onclick: () => ((draft[key] = value), draw()) }, label);
  const box = h('div', { class: 'read-cards' });
  const pieces = () => (draft.all ? data.pieces : [piece]);
  const cards = () => makeCards(book, pieces(), draft.style, yizhu);
  const title = () => `${setTitle(book, draft.all ? null : piece)}${draft.style === 'zhu' ? ' · 字词' : ''}`;
  function draw() {
    if (draft.style === 'zhu' && !zhuOK()) draft.style = 'next';
    const list = cards();
    const sample = list[book.kind === 'poem' && draft.style === 'next' ? Math.min(1, list.length - 1) : 0];
    fill(
      box,
      h('p', { class: 'small' }, '怎么背'),
      h(
        'div',
        { class: `chip-row${yizhu && (hasZhu(piece) || data.pieces.some(hasZhu)) ? '' : ' two'}` }, // 三种是三格一行
        choice('style', 'next', '接下句', '正面一句，背面下一句'),
        choice('style', 'whole', book.kind === 'poem' ? '整首' : '整段', '正面题目，背面全文'),
        yizhu && (hasZhu(piece) || data.pieces.some(hasZhu)) ? choice('style', 'zhu', '字词', '正面是注释的词，背面是解释') : null,
      ),
      h(
        'p',
        { class: 'muted small' },
        draft.style === 'next'
          ? '正面是一句，想下一句是什么，翻过来对答案。适合一句一句背熟。'
          : draft.style === 'zhu'
            ? `正面是注释里的词（带着它在的那一小句），背面是解释。适合记实词、虚词${draft.all ? '；整本只做有注释的那几篇' : ''}。`
            : `正面是题目，背面是全文。适合背完以后整${book.kind === 'poem' ? '首' : '段'}默写、复习。`,
      ),
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
              description: `从温故书库做的：《${book.title}》${draft.all ? '' : `「${piece.t}」`}，${draft.style === 'next' ? '接下句' : draft.style === 'zhu' ? '字词（注释）' : `整${book.unit}`}。`,
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
