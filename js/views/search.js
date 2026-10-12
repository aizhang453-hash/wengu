// 搜索页: 顶上搜索框按回车到这里, 边打边找

import { h } from '../dom.js';
import { search, highlight } from '../search.js';

function marked(text, query) {
  return highlight(text, query).map((part) => (part.hit ? h('mark', {}, part.text) : part.text));
}

export function renderSearch({ store }, query = '') {
  const results = h('div', { class: 'search-results' });
  const input = h('input', {
    class: 'input big',
    type: 'search',
    placeholder: '搜卡片集的名字、词、解释',
    value: query,
    'aria-label': '搜索',
    oninput: () => {
      draw(input.value);
      // 网址跟着改, 刷新或者返回还在这里 (不重新画页面)
      history.replaceState(null, '', `#/search/${encodeURIComponent(input.value)}`);
    },
  });

  function draw(q) {
    if (!q.trim()) {
      results.replaceChildren(h('p', { class: 'muted' }, '打几个字, 在所有卡片集里找。'));
      return;
    }
    const { sets, cards } = search(store.allSets(), q);
    const parts = [];
    if (sets.length) {
      parts.push(
        h('h2', {}, `卡片集 (${sets.length})`),
        h(
          'ul',
          { class: 'set-grid' },
          sets.map((set) =>
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
      );
    }
    if (cards.length) {
      parts.push(
        h('h2', {}, `卡片 (${cards.length}${cards.length >= 200 ? '+' : ''})`),
        h(
          'ul',
          { class: 'card-list' },
          cards.map(({ set, card }) =>
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
      );
    }
    if (!parts.length) parts.push(h('p', { class: 'muted' }, `没找到「${q}」。`));
    results.replaceChildren(...parts);
  }

  draw(query);
  return {
    title: query ? `搜索 ${query}` : '搜索',
    el: h('section', {}, h('h1', {}, '搜索'), input, results),
    focus: input,
  };
}
