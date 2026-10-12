// 入口: 按网址 # 后面的部分决定显示哪一页
//   #/                    首页 (所有卡片集)
//   #/new                 新建卡片集
//   #/import              新建卡片集, 打开「导入」
//   #/search/<字>         搜索
//   #/set/<id>            一个卡片集
//   #/set/<id>/edit       编辑
//   #/set/<id>/cards      单词卡
//   #/set/<id>/learn      学习
//   #/set/<id>/test       测试
//   #/set/<id>/match      配对游戏
//   #/set/<id>/blast      打陨石游戏

import { Store, KEY } from './store.js';
import { cleanMedia } from './media.js';
import { h } from './dom.js';
import { renderHome } from './views/home.js';
import { renderSet } from './views/set.js';
import { renderEdit } from './views/edit.js';
import { renderCards } from './views/cards.js';
import { renderLearn } from './views/learn.js';
import { renderExam } from './views/exam.js';
import { renderMatch } from './views/match.js';
import { renderBlast } from './views/blast.js';
import { renderSearch } from './views/search.js';

const store = new Store();
const main = document.getElementById('main');

let current = null; // 当前页 { cleanup, canLeave }
let shownHash = null;

function parse(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { page: 'home' };
  if (parts[0] === 'new') return { page: 'edit', id: null };
  if (parts[0] === 'import') return { page: 'edit', id: null, openImport: true };
  if (parts[0] === 'search') return { page: 'search', query: parts.slice(1).join('/') };
  if (parts[0] === 'set' && parts[1]) {
    const sub = parts[2] ?? '';
    if (sub === '') return { page: 'set', id: parts[1] };
    if (sub === 'edit') return { page: 'edit', id: parts[1] };
    if (sub === 'cards') return { page: 'cards', id: parts[1] };
    if (sub === 'learn') return { page: 'learn', id: parts[1] };
    if (sub === 'test') return { page: 'test', id: parts[1] };
    if (sub === 'match') return { page: 'match', id: parts[1] };
    if (sub === 'blast') return { page: 'blast', id: parts[1] };
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
  else if (route.page === 'learn') view = renderLearn(ctx, route.id);
  else if (route.page === 'test') view = renderExam(ctx, route.id);
  else if (route.page === 'match') view = renderMatch(ctx, route.id);
  else if (route.page === 'blast') view = renderBlast(ctx, route.id);
  else if (route.page === 'search') view = renderSearch(ctx, route.query);
  else view = missing();

  view.page = route.page;
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

// 顶上的搜索框
document.getElementById('search-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const q = input.value.trim();
  input.value = '';
  input.blur();
  go(`#/search/${encodeURIComponent(q)}`);
});

// 同时开了好几个标签页: 别的标签页存了东西, 这边重新读, 免得这边一存把那边的盖掉。
// 首页和卡片集页直接重画; 正在背、正在编辑的不打断 (它们存的时候按 id 找, 用的是新读的)
window.addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== KEY) return;
  store.reload();
  if (current?.page === 'home' || current?.page === 'set') {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }
});
window.addEventListener('beforeunload', (e) => {
  if (current?.isDirty?.()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// 请浏览器别在空间紧的时候自己清掉卡片 (不一定答应, 答不答应都不影响用)
navigator.storage?.persist?.().catch(() => {});

// 断网也能用 (sw.js 把网页的文件存下来)。只有 https 或者自己电脑上才能开
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// 没有卡片用的图片、录音 (比如编辑时加了又没保存), 过一会儿删掉
setTimeout(() => cleanMedia(store), 5000);

render();
