// 入口: 按网址 # 后面的部分决定显示哪一页
//   #/                    首页 (所有卡片集)
//   #/new                 新建卡片集
//   #/import              新建卡片集, 打开「导入」
//   #/set/<id>            一个卡片集
//   #/set/<id>/edit       编辑
//   #/set/<id>/cards      单词卡

import { Store } from './store.js';
import { h } from './dom.js';
import { renderHome } from './views/home.js';
import { renderSet } from './views/set.js';
import { renderEdit } from './views/edit.js';
import { renderCards } from './views/cards.js';

const store = new Store();
const main = document.getElementById('main');

let current = null; // 当前页 { cleanup, canLeave }
let shownHash = null;

function parse(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { page: 'home' };
  if (parts[0] === 'new') return { page: 'edit', id: null };
  if (parts[0] === 'import') return { page: 'edit', id: null, openImport: true };
  if (parts[0] === 'set' && parts[1]) {
    const sub = parts[2] ?? '';
    if (sub === '') return { page: 'set', id: parts[1] };
    if (sub === 'edit') return { page: 'edit', id: parts[1] };
    if (sub === 'cards') return { page: 'cards', id: parts[1] };
  }
  return { page: 'missing' };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function render() {
  const hash = location.hash || '#/';
  // 编辑到一半要离开: 先问一下, 不走就把网址改回去
  if (current?.canLeave && shownHash !== null && hash !== shownHash && !current.canLeave()) {
    history.replaceState(null, '', shownHash);
    return;
  }
  current?.cleanup?.();
  current = null;
  shownHash = hash;

  const route = parse(hash);
  const ctx = { store, go };
  let view;
  if (route.page === 'home') view = renderHome(ctx);
  else if (route.page === 'edit') view = renderEdit(ctx, route.id, { openImport: route.openImport });
  else if (route.page === 'set') view = renderSet(ctx, route.id);
  else if (route.page === 'cards') view = renderCards(ctx, route.id);
  else view = missing();

  current = view;
  main.replaceChildren(view.el);
  document.title = view.title ? `${view.title} · 温故` : '温故';
  window.scrollTo(0, 0);
  view.focus?.focus();
}

function missing() {
  return {
    title: '找不到',
    el: h(
      'section',
      { class: 'empty' },
      h('h1', {}, '找不到这一页'),
      h('p', {}, '可能这个卡片集已经删掉了。'),
      h('a', { class: 'btn primary', href: '#/' }, '回首页'),
    ),
  };
}

window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', (e) => {
  if (current?.isDirty?.()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// 请浏览器别在空间紧的时候自己清掉卡片 (不一定答应, 答不答应都不影响用)
navigator.storage?.persist?.().catch(() => {});

render();
