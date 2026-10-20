// 左边的菜单: 顶上的 ☰ 点开, 所有地方都在这里 ——
// 主页、今天的复习 (几张)、统计、错题集 (今天该做几道); 游戏、新建、导入、题目集; 你的文件夹; 多设备同步

import { h, icon } from '../dom.js';
import { todayAll } from './plan.js';
import { dueMistakes } from '../mistakes.js';
import { loadConfig } from '../sync.js';
import { newFolder } from './folder.js';

export function setupMenu({ store, go, syncer }) {
  const btn = document.getElementById('menu-btn');
  if (!btn) return;
  let drawer = null;
  btn.addEventListener('click', () => (drawer?.open ? close() : open()));

  function open() {
    drawer?.remove();
    drawer = build();
    document.body.append(drawer);
    drawer.showModal();
    btn.setAttribute('aria-expanded', 'true');
  }

  function close() {
    if (drawer?.open) drawer.close();
  }

  function build() {
    const hash = location.hash || '#/';
    const today = todayAll(store);
    const due = today.reviews.length + today.fresh.length;
    const mistakes = dueMistakes(store.data.mistakes).length;

    // 一行: 图标、字、右边的数; match: 现在在不在这一页
    const item = (href, ic, text, { badge = 0, sub = null, match = (x) => x === href } = {}) => {
      const on = match(hash);
      return h(
        'a',
        { class: `menu-item${on ? ' on' : ''}`, href, 'aria-current': on ? 'page' : null, onclick: close },
        icon(ic, 22),
        h('span', { class: 'menu-text' }, text, sub ? h('span', { class: 'menu-sub' }, sub) : null),
        badge ? h('span', { class: 'menu-badge', 'aria-label': `${badge} 个` }, badge > 999 ? '999+' : String(badge)) : null,
      );
    };
    const starts = (prefix) => (x) => x === prefix || x.startsWith(`${prefix}/`);
    const sep = () => h('div', { class: 'menu-sep', role: 'separator' });
    const title = (text) => h('div', { class: 'menu-title' }, text);

    const folders = store.allFolders();
    const folderItems = folders.map((f) =>
      item(`#/folder/${encodeURIComponent(f.id)}`, 'folder', f.name || '未命名文件夹', {
        sub: `${f.setIds.length} 个卡片集`,
        match: (x) => x === `#/folder/${encodeURIComponent(f.id)}` || x.startsWith(`#/set/folder%3A${encodeURIComponent(f.id)}`),
      }),
    );
    const config = loadConfig();
    const syncText = !config ? '设置多设备同步' : syncer?.state.status === 'error' ? '同步出错了' : '多设备同步';

    const d = h(
      'dialog',
      { class: 'drawer', 'aria-label': '菜单' },
      h(
        'nav',
        { class: 'drawer-inner' },
        h(
          'div',
          { class: 'drawer-head' },
          h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': '关上菜单', onclick: close }, icon('menu', 24)),
          h('a', { class: 'logo', href: '#/', onclick: close }, h('span', { class: 'seal', 'aria-hidden': 'true' }, '温'), h('span', {}, '温故')),
        ),
        item('#/', 'home', '主页', { match: (x) => x === '#/' || x === '#' }),
        item('#/review', 'cards', '今天的复习', { badge: due, match: starts('#/review') }),
        item('#/stats', 'chart', '统计', { match: starts('#/stats') }),
        item('#/mistakes', 'book', '错题集', { badge: mistakes, match: starts('#/mistakes') }),
        sep(),
        title('学习、新建'),
        item('#/games', 'game', '游戏', { match: starts('#/games') }),
        item('#/new', 'plus', '新建卡片集'),
        item('#/import', 'import', '导入'),
        item('#/new-quiz', 'quiz', '新建题目集', { sub: '选择题、判断题, 限时答' }),
        sep(),
        title('你的文件夹'),
        folderItems,
        h(
          'button',
          {
            class: 'menu-item',
            type: 'button',
            onclick: () => {
              close();
              newFolder(store, (f) => go(`#/folder/${encodeURIComponent(f.id)}`));
            },
          },
          icon('plus', 22),
          h('span', { class: 'menu-text' }, '新文件夹'),
        ),
        sep(),
        item('#/sync', 'cloud', syncText, { match: starts('#/sync') }),
      ),
    );
    // 点旁边灰色的地方关上 (换页时 app.js 也会关)
    d.addEventListener('click', (e) => {
      if (e.target === d) close();
    });
    d.addEventListener('close', () => {
      d.remove();
      btn.setAttribute('aria-expanded', 'false');
    });
    return d;
  }
}
