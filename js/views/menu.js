// 左边的菜单 (顶上的 ☰ 点开): 今日、错题集、统计; 更多 (学习游戏、游戏厅、文件夹、温温); 设置。
// 顶上的「新建」: 新建卡片集、导入卡片、记录错题、拍照录入错题、新建文件夹, 都在这一个菜单里

import { h, icon, menuButton } from '../dom.js';
import { todayAll } from './plan.js';
import { dueMistakes } from '../mistakes.js';
import { loadConfig } from '../sync.js';
import { newFolder } from './folder.js';

// 顶上的「新建」换成点开的菜单 (没开 JavaScript 时还是个去 #/new 的链接)
function setupNewMenu({ store, go }) {
  const old = document.getElementById('new-btn');
  if (!old) return;
  old.replaceWith(
    menuButton(
      [
        { label: '新建卡片集', icon: 'plus', href: '#/new' },
        { label: '导入卡片', icon: 'import', href: '#/import' },
        null,
        { label: '记录错题', icon: 'edit', href: '#/mistakes/new' },
        { label: '拍照录入错题', icon: 'camera', href: '#/mistakes/import' },
        null,
        { label: '新建文件夹', icon: 'folder', onclick: () => newFolder(store, (f) => go(`#/folder/${encodeURIComponent(f.id)}`)) },
      ],
      { label: '新建', text: '新建', cls: 'btn primary small new-btn', iconName: 'plus' },
    ),
  );
}

export function setupMenu({ store, go, syncer, pet = null }) {
  setupNewMenu({ store, go });
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
    const item = (href, ic, text, { badge = 0, note = '', match = (x) => x === href } = {}) => {
      const on = match(hash);
      return h(
        'a',
        { class: `menu-item${on ? ' on' : ''}`, href, 'aria-current': on ? 'page' : null, onclick: close },
        icon(ic, 20),
        h('span', { class: 'menu-text' }, text),
        note ? h('span', { class: 'menu-note' }, note) : null,
        badge ? h('span', { class: 'menu-badge', 'aria-label': `${badge} 项` }, badge > 999 ? '999+' : String(badge)) : null,
      );
    };
    const action = (ic, text, onclick) => h('button', { class: 'menu-item', type: 'button', onclick: () => (close(), onclick()) }, icon(ic, 20), h('span', { class: 'menu-text' }, text));
    const starts = (prefix) => (x) => x === prefix || x.startsWith(`${prefix}/`);
    const sep = () => h('div', { class: 'menu-sep', role: 'separator' });
    const title = (text) => h('div', { class: 'menu-title' }, text);

    const folders = store.allFolders();
    const config = loadConfig();
    const syncError = Boolean(config) && syncer?.state.status === 'error';

    const d = h(
      'dialog',
      { class: 'drawer', 'aria-label': '菜单' },
      h(
        'nav',
        { class: 'drawer-inner' },
        h(
          'div',
          { class: 'drawer-head' },
          h('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': '关闭菜单', onclick: close }, icon('menu', 24)),
          h('a', { class: 'logo', href: '#/', onclick: close }, h('span', { class: 'seal', 'aria-hidden': 'true' }, '温'), h('span', {}, '温故')),
        ),
        item('#/', 'home', '今日', { badge: due, match: (x) => x === '#/' || x === '#' || starts('#/review')(x) }),
        item('#/mistakes', 'book', '错题集', { badge: mistakes, match: starts('#/mistakes') }),
        item('#/stats', 'chart', '统计', { match: starts('#/stats') }),
        folders.length
          ? [
              sep(),
              title('文件夹'),
              folders.map((f) =>
                item(`#/folder/${encodeURIComponent(f.id)}`, 'folder', f.name || '未命名文件夹', {
                  match: (x) => x === `#/folder/${encodeURIComponent(f.id)}` || x.startsWith(`#/set/folder%3A${encodeURIComponent(f.id)}`),
                }),
              ),
            ]
          : null,
        sep(),
        title('更多'),
        item('#/games', 'game', '学习游戏', { match: starts('#/games') }),
        item('#/arcade', 'arcade', '游戏厅', { match: starts('#/arcade') }),
        pet ? action('turtle', `小乌龟${pet.name()}`, () => pet.openPanel()) : null,
        h('div', { class: 'menu-spacer' }),
        sep(),
        item('#/settings', 'gear', '设置', { note: syncError ? '同步出错' : '', match: (x) => starts('#/settings')(x) || starts('#/sync')(x) }),
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
