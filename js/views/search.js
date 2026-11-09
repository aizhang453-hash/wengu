// 搜索页: 顶上搜索框按回车到这里, 边打边找。
// v1.63 起什么都搜: 卡片集和卡片、题目集和里面的题、书斋里的诗文 (题目、作者、句子、成语), 一栏一栏列出来;
// 每栏先列前几个, 多的点「显示全部」。书斋页、题目集页里各自的搜索框还在 (只搜那一页里的)。

import { h, fill, icon } from '../dom.js';
import { search, highlight } from '../search.js';
import { matchesSearch } from '../mistakes.js';
import { searchLibrary, searchAuthors } from '../reading.js';
import { qsetTile, itemEl } from './mistakes.js';
import { libraryHits, authorList } from './read.js';

const FIRST = { cards: 10, mistakes: 5, library: 10 }; // 每栏先列几个

function marked(text, query) {
  return highlight(text, query).map((part) => (part.hit ? h('mark', {}, part.text) : part.text));
}

// 一栏: 标题 · 几个; 多的先收起来, 点「显示全部」再列
function section(title, items, first, draw, capped = false) {
  const box = h('div', {});
  const show = (all) => {
    const list = all ? items : items.slice(0, first);
    fill(
      box,
      draw(list),
      list.length < items.length ? h('button', { class: 'btn small search-more', type: 'button', onclick: () => show(true) }, `显示全部 ${items.length} 个`) : null,
    );
  };
  show(false);
  return [h('h2', {}, `${title} · ${items.length}${capped ? '+' : ''}`), box];
}

export function renderSearch({ store }, query = '') {
  const results = h('div', { class: 'search-results' });
  let seq = 0; // 又打了字: 书斋晚到的结果不要了
  const input = h('input', {
    class: 'input big',
    type: 'search',
    placeholder: '搜卡片、题目，或者书斋里的诗文、成语',
    value: query,
    'aria-label': '搜索',
    oninput: () => {
      draw(input.value);
      // 网址跟着改, 刷新或者返回还在这里 (不重新画页面)
      history.replaceState(null, '', `#/search/${encodeURIComponent(input.value)}`);
    },
  });

  function draw(q) {
    const n = ++seq;
    if (!q.trim()) {
      results.replaceChildren(h('p', { class: 'muted' }, '输入关键词，卡片、题目集和书斋里的诗文一起搜。'));
      return;
    }
    const { sets, cards } = search(store.allSets(), q, { limit: 1000 });
    const qsets = store.allQsets();
    const mistakes = store.allMistakes();
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const foundQsets = qsets.filter((x) => words.every((w) => (x.title || '').toLowerCase().includes(w)));
    const foundMistakes = mistakes.filter((m) => matchesSearch(m, q));
    const now = Date.now();
    const parts = [];
    // 文件夹 (v1.71): 名字里有的
    const folders = store
      .folderTree()
      .map((x) => x.folder)
      .filter((f) => words.every((w) => (f.name || '').toLowerCase().includes(w)));
    if (folders.length) {
      parts.push(
        section('文件夹', folders, Infinity, (list) =>
          h(
            'ul',
            { class: 'set-grid' },
            list.map((f) =>
              h(
                'li',
                {},
                h(
                  'a',
                  { class: 'set-tile folder-tile', href: `#/folder/${encodeURIComponent(f.id)}` },
                  h('span', { class: 'set-tile-title' }, icon('folder', 18), marked(f.name || '未命名文件夹', q)),
                  h('span', { class: 'muted' }, store.ancestorsOf(f.id).length ? store.folderPath(f.id) : `${store.treeSetIds(f.id).length} 个卡片集`),
                ),
              ),
            ),
          ),
        ),
      );
    }
    if (sets.length) {
      parts.push(
        section('卡片集', sets, Infinity, (list) =>
          h(
            'ul',
            { class: 'set-grid' },
            list.map((set) =>
              h(
                'li',
                {},
                h(
                  'a',
                  { class: 'set-tile', href: `#/set/${encodeURIComponent(set.id)}` },
                  h('span', { class: 'set-tile-title' }, marked(set.title || '未命名卡片集', q)),
                  h('span', { class: 'muted' }, `${set.cards.length} 张卡片`),
                ),
              ),
            ),
          ),
        ),
      );
    }
    if (cards.length) {
      parts.push(
        section('卡片', cards, FIRST.cards, (list) =>
          h(
            'ul',
            { class: 'card-list' },
            list.map(({ set, card }) =>
              h(
                'li',
                {},
                h(
                  'a',
                  { class: 'card-row search-hit', href: `#/set/${encodeURIComponent(set.id)}` },
                  h('div', { class: 'card-side term' }, h('span', { class: 'text' }, marked(card.term, q))),
                  h('div', { class: 'card-side def' }, h('span', { class: 'text' }, marked(card.def, q))),
                  h('span', { class: 'muted small hit-set' }, set.title || '未命名卡片集'),
                ),
              ),
            ),
          ),
          cards.length >= 1000,
        ),
      );
    }
    if (foundQsets.length) {
      parts.push(
        section('题目集', foundQsets, Infinity, (list) =>
          h(
            'ul',
            { class: 'set-grid qset-grid' },
            list.map((x) => qsetTile(x, mistakes.filter((m) => m.set === x.id), now)),
          ),
        ),
      );
    }
    if (foundMistakes.length) {
      parts.push(
        section('题目', foundMistakes, FIRST.mistakes, (list) =>
          h('ul', { class: 'mk-list' }, list.map((m) => itemEl(store, m, now, { setTag: true, onDelete: () => draw(input.value) }).li)),
        ),
      );
    }
    // 书斋要先把书拿来 (第一次搜慢一点), 晚一点到
    const lib = h('div', { 'aria-live': 'polite' }, parts.length ? null : h('p', { class: 'muted' }, '正在搜……'));
    results.replaceChildren(...parts.flat(), lib);
    Promise.all([searchLibrary(q, { limit: 200 }).catch(() => null), searchAuthors(q).catch(() => [])])
      .then(([hits, authors]) => {
        if (n !== seq || !lib.isConnected) return;
        const who = authors.length ? section('作者', authors, Infinity, (list) => authorList(list, q)) : null;
        if (hits?.length) fill(lib, who, section('书斋', hits, FIRST.library, (list) => libraryHits(list, q), hits.length >= 200));
        else if (parts.length || who) fill(lib, who, hits ? null : h('p', { class: 'muted small' }, '书斋没搜成，连上网再试一次。'));
        else fill(lib, h('p', { class: 'muted' }, hits ? `没找到「${q}」。可以少打几个字试试。` : `卡片和题目里没找到「${q}」；书斋没搜成，连上网再试一次。`));
      });
  }

  draw(query);
  return {
    title: query ? `搜索 ${query}` : '搜索',
    el: h('section', {}, h('h1', {}, '搜索'), input, results),
    focus: input,
  };
}
