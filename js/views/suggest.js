// 顶上搜索框边打字边出结果 (v1.71): 打字时下面弹出一个框, 文件夹、卡片集、卡片、题目、书斋各列几个, 点了直接去;
// 回车 (没选哪一个时) 还是到搜索页看全部。上下键选, Esc 关掉。
// 用拼音输入法还没选字时不搜 (框里是拼音字母, 搜了也不对)。

import { h, fill, icon } from '../dom.js';
import { search, highlight } from '../search.js';
import { stripMarks } from '../rich.js';
import { matchesSearch } from '../mistakes.js';
import { searchLibrary, searchAuthors, bookOf } from '../reading.js';
import { qsetHref } from './mistakes.js';
import { pieceHref, byline, authorHref } from './read.js';

const MAX = { folders: 3, sets: 3, cards: 4, qsets: 2, mistakes: 3, authors: 3, library: 6 }; // 每类最多列几个

const fold = (text) => String(text ?? '').normalize('NFKC').toLowerCase();

// 长的字: 找到的字在后面看不见时, 从它前面几个字开始; 省略的地方写「⋯」
// (不用「…」: 它在比较大小写时会变成三个点, 标出找到的字就对不上了)
export function snippet(text, query, max = 36) {
  const plain = stripMarks(String(text ?? '')).replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const word = fold(query).split(/\s+/).find(Boolean) ?? '';
  const at = word ? fold(plain).indexOf(word) : -1;
  const start = at >= 0 && at + word.length > max - 6 ? at - 8 : 0;
  const part = plain.slice(start, start + max);
  return `${start ? '⋯' : ''}${part}${start + max < plain.length ? '⋯' : ''}`;
}

const marked = (text, query) => highlight(text, query).map((part) => (part.hit ? h('mark', {}, part.text) : part.text));

// 卡片和题目里找 (不用等, 都在本机): [{ title, items: [{ href, icon, main, sub }] }]
export function localSuggestions(store, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const has = (text) => words.every((w) => fold(stripMarks(String(text ?? ''))).includes(w));
  const groups = [];
  const folders = store
    .folderTree()
    .map(({ folder }) => folder)
    .filter((f) => has(f.name))
    .slice(0, MAX.folders);
  if (folders.length) {
    groups.push({
      title: '文件夹',
      items: folders.map((f) => ({ href: `#/folder/${encodeURIComponent(f.id)}`, icon: 'folder', main: f.name || '未命名文件夹', sub: store.folderPath(f.id) === (f.name || '未命名文件夹') ? `${store.treeSetIds(f.id).length} 个卡片集` : store.folderPath(f.id) })),
    });
  }
  const { sets, cards } = search(store.allSets(), query, { limit: MAX.cards });
  if (sets.length) {
    groups.push({
      title: '卡片集',
      items: sets.slice(0, MAX.sets).map((set) => ({ href: `#/set/${encodeURIComponent(set.id)}`, icon: 'cards', main: set.title || '未命名卡片集', sub: `${set.cards.length} 张卡片` })),
    });
  }
  if (cards.length) {
    groups.push({
      title: '卡片',
      items: cards.map(({ set, card }) => ({ href: `#/set/${encodeURIComponent(set.id)}`, main: snippet(card.term, query), sub: `${snippet(card.def, query, 24)} · ${set.title || '未命名卡片集'}` })),
    });
  }
  const qsets = store
    .allQsets()
    .filter((q) => has(q.title))
    .slice(0, MAX.qsets);
  if (qsets.length) {
    groups.push({ title: '题目集', items: qsets.map((q) => ({ href: qsetHref(q.id), icon: 'book', main: q.title || '未命名题目集', sub: '' })) });
  }
  const mistakes = [];
  for (const m of store.allMistakes()) {
    if (mistakes.length >= MAX.mistakes) break;
    if (matchesSearch(m, query)) mistakes.push(m);
  }
  if (mistakes.length) {
    groups.push({
      title: '题目',
      items: mistakes.map((m) => ({ href: qsetHref(m.set), main: snippet(m.question || m.passage || m.answer || '（图片题）', query), sub: store.getQset(m.set)?.title || '题目集' })),
    });
  }
  return groups;
}

// 书斋里的作者 → 一组 (点了到作者页)
export function authorGroup(authors) {
  return {
    title: '作者',
    items: authors.slice(0, MAX.authors).map((x) => ({ href: authorHref(x.name), icon: 'user', main: x.name, sub: `${x.era ? `〔${x.era}〕` : ''}书斋里有 ${x.count} 篇` })),
  };
}

// 书斋找到的 → 一组
export function libraryGroup(hits) {
  return {
    title: '书斋',
    items: hits.slice(0, MAX.library).map((x) => ({
      href: pieceHref(x.book, x.i),
      icon: 'read',
      main: x.piece.t,
      sub: `${bookOf(x.book)?.title ?? ''}${byline(x.piece) ? ` · ${byline(x.piece)}` : ''}${x.where === 'title' || x.where === 'author' ? '' : ` · ${x.line}`}`,
    })),
  };
}

export function setupSuggest({ store, go }) {
  const form = document.getElementById('search-form');
  const input = form?.querySelector('input');
  if (!input) return;
  const box = h('div', { class: 'suggest', id: 'search-suggest', role: 'listbox', 'aria-label': '搜索结果', hidden: true });
  document.body.append(box);
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'search-suggest');
  input.setAttribute('aria-expanded', 'false');

  let seq = 0;
  let timer = null;
  let active = -1;
  let links = [];

  function close() {
    clearTimeout(timer);
    seq++;
    box.hidden = true;
    active = -1;
    links = [];
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  // 框放在搜索框下面; 窄的屏幕 (手机) 两边留一点, 别超出屏幕
  function place() {
    const r = input.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(Math.max(r.width, 420), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    box.style.top = `${r.bottom + 6}px`;
    box.style.left = `${left}px`;
    box.style.width = `${width}px`;
  }

  // 点了一个: 框收起来、字清掉 (跟按回车去搜索页一样)
  function picked() {
    input.value = '';
    close();
    input.blur();
  }

  // library: 书斋那几组 (作者、诗文), 还没找完是 null
  function draw(query, groups, library) {
    const all = [...groups, ...(library ?? []).filter((g) => g.items.length)];
    let n = 0;
    const row = (item) =>
      h(
        'a',
        { class: 'suggest-item', href: item.href, role: 'option', id: `suggest-${n++}`, onclick: picked },
        item.icon ? icon(item.icon, 18) : h('span', { class: 'suggest-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'suggest-text' }, h('span', { class: 'suggest-main' }, marked(item.main, query)), item.sub ? h('span', { class: 'suggest-sub' }, marked(item.sub, query)) : null),
      );
    fill(
      box,
      all.map((g) => h('div', { class: 'suggest-group', role: 'group', 'aria-label': g.title }, h('div', { class: 'suggest-title' }, g.title), g.items.map(row))),
      library === null ? h('div', { class: 'suggest-wait' }, '书斋还在找……') : null,
      !all.length && library !== null ? h('div', { class: 'suggest-wait' }, `没找到「${query}」`) : null,
      h('a', { class: 'suggest-item suggest-all', href: `#/search/${encodeURIComponent(query)}`, role: 'option', id: `suggest-${n++}`, onclick: picked }, icon('search', 18), h('span', { class: 'suggest-text' }, h('span', { class: 'suggest-main' }, `搜索「${query}」的全部结果`))),
    );
    links = [...box.querySelectorAll('.suggest-item')];
    if (active >= links.length) active = -1;
    mark();
    place();
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function mark() {
    links.forEach((a, i) => a.classList.toggle('on', i === active));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', links[active].id);
      links[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  async function run() {
    const query = input.value.trim();
    const n = ++seq;
    if (!query) return close();
    active = -1;
    const groups = localSuggestions(store, query);
    draw(query, groups, null);
    // 书斋要先把书拿来 (第一次慢一点), 晚一点补上
    const [authors, hits] = await Promise.all([searchAuthors(query, { limit: MAX.authors }).catch(() => []), searchLibrary(query, { limit: MAX.library }).catch(() => [])]);
    if (n !== seq || document.activeElement !== input) return;
    draw(query, groups, [authorGroup(authors), libraryGroup(hits)]);
  }

  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  };
  input.addEventListener('input', (e) => {
    if (e.isComposing) return;
    later();
  });
  input.addEventListener('compositionend', later);
  input.addEventListener('focus', () => {
    if (input.value.trim()) later();
  });
  // 点框里的东西时别让搜索框失去焦点 (不然框先关了, 点不到)
  box.addEventListener('mousedown', (e) => e.preventDefault());
  input.addEventListener('blur', () => setTimeout(() => document.activeElement !== input && close(), 200));
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || box.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      active = active < 0 ? (step > 0 ? 0 : links.length - 1) : (active + step + links.length) % links.length;
      mark();
    } else if (e.key === 'Enter' && active >= 0) {
      // 选着一个: 去那里 (没选就照旧去搜索页)
      e.preventDefault();
      const href = links[active].getAttribute('href');
      picked();
      go(href);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  window.addEventListener('resize', () => !box.hidden && place());
  window.addEventListener('hashchange', close);
}
