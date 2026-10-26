// 文件夹: 几个卡片集放一起, 可以合起来学

import { h, toast, openDialog, askText, switchRow, menuButton, icon } from '../dom.js';
import { FOLDER_PREFIX, makeFolder } from '../store.js';
import { planPanel } from './plan.js';
import { mode } from './set.js';

export function renderFolder({ store, go }, id) {
  const folder = store.getFolder(id);
  if (!folder) {
    return {
      title: '找不到',
      el: h('section', { class: 'empty' }, h('h1', {}, '文件夹不存在'), h('a', { class: 'btn primary', href: '#/' }, '返回首页')),
    };
  }
  const combo = store.getSet(FOLDER_PREFIX + folder.id);
  const base = `#/set/${encodeURIComponent(combo.id)}`;
  const sets = folder.setIds.map((sid) => store.getSet(sid)).filter(Boolean);
  const total = combo.cards.length;
  const redraw = () => go(`#/folder/${encodeURIComponent(folder.id)}`);

  function addSets() {
    const others = store.allSets();
    if (!others.length) return toast('暂无卡片集');
    const picked = new Set(folder.setIds);
    const d = openDialog({
      title: '添加卡片集',
      body: others.map((s) =>
        switchRow({
          label: s.title || '未命名卡片集',
          desc: `${s.cards.length} 张卡片`,
          checked: picked.has(s.id),
          onchange: (v) => (v ? picked.add(s.id) : picked.delete(s.id)),
        }),
      ),
      footer: [
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              // 原来的顺序不动 (每天背新词照这个顺序), 新放进来的接在后面
              const kept = folder.setIds.filter((sid) => picked.has(sid));
              const added = others.map((s) => s.id).filter((sid) => picked.has(sid) && !kept.includes(sid));
              store.putFolder({ ...folder, setIds: [...kept, ...added] });
              d.close();
              redraw();
            },
          },
          '确定',
        ),
      ],
    });
  }

  const list = sets.length
    ? h(
        'ul',
        { class: 'set-grid' },
        sets.map((set, i) =>
          h(
            'li',
            { class: 'folder-item' },
            h(
              'a',
              { class: 'set-tile', href: `#/set/${encodeURIComponent(set.id)}` },
              h('span', { class: 'set-tile-title' }, set.title || '未命名卡片集'),
              h('span', { class: 'set-tile-meta' }, `${set.cards.length.toLocaleString('zh-CN')} 张`),
            ),
            h(
              'button',
              {
                class: 'icon-btn remove-from-folder',
                title: '移出文件夹（不删除卡片集）',
                'aria-label': '移出文件夹',
                onclick: () => {
                  store.setInFolder(folder.id, set.id, false);
                  redraw();
                },
              },
              '✕',
            ),
            // 挪顺序 (每天背新词照文件夹里的顺序, 一个背完再下一个)
            sets.length > 1
              ? h(
                  'span',
                  { class: 'folder-move' },
                  h('button', { class: 'icon-btn', title: '上移', 'aria-label': `${set.title || '未命名卡片集'} 上移`, disabled: i === 0, onclick: () => (store.moveInFolder(folder.id, set.id, -1), redraw()) }, '↑'),
                  h('button', { class: 'icon-btn', title: '下移', 'aria-label': `${set.title || '未命名卡片集'} 下移`, disabled: i === sets.length - 1, onclick: () => (store.moveInFolder(folder.id, set.id, 1), redraw()) }, '↓'),
                )
              : null,
          ),
        ),
      )
    : h('p', { class: 'muted' }, '文件夹为空。添加卡片集后可合并学习。');

  const more = menuButton(
    [
      { label: '统计', icon: 'chart', href: `#/stats/${encodeURIComponent(combo.id)}` },
      {
        label: '重命名',
        icon: 'edit',
        onclick: () =>
          askText({
            title: '重命名文件夹',
            label: '名称',
            value: folder.name,
            onOk: (name) => {
              store.putFolder({ ...folder, name });
              redraw();
            },
          }),
      },
      null,
      {
        label: '删除文件夹',
        icon: 'trash',
        danger: true,
        onclick: () => {
          if (!confirm(`删除文件夹「${folder.name}」？其中的卡片集不会被删除。`)) return;
          store.deleteFolder(folder.id);
          toast('已删除文件夹');
          go('#/');
        },
      },
    ],
    { label: '更多操作', cls: 'btn icon-only' },
  );

  return {
    title: folder.name || '未命名文件夹',
    el: h(
      'section',
      { class: 'set-page' },
      h('a', { class: 'back', href: '#/' }, '← 首页'),
      h('div', { class: 'set-head' }, h('h1', {}, folder.name || '未命名文件夹'), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: addSets }, icon('plus', 16), '添加卡片集'), more)),
      h('p', { class: 'set-meta' }, `${sets.length} 个卡片集 · ${total.toLocaleString('zh-CN')} 张卡片`),
      total ? planPanel({ store, go }, combo) : null, // 每天背新词 (整个文件夹一起定)、今天要背的
      h(
        'div',
        { class: 'modes' },
        mode('cards', '单词卡', '翻卡记忆', `${base}/cards`, total > 0),
        mode('learn', '学习', '选择、拼写，逐张掌握', `${base}/learn`, total > 0),
        mode('test', '测试', '生成试卷并评分', `${base}/test`, total > 0),
      ),
      h('div', { class: 'list-head' }, h('h2', {}, `卡片集 · ${sets.length}`)),
      list,
    ),
  };
}

// 新建文件夹 (首页、卡片集页都用); 建好以后调 then(folder)
export function newFolder(store, then) {
  askText({
    title: '新建文件夹',
    label: '名称',
    placeholder: '如「期末复习」',
    okText: '创建',
    onOk: (name) => {
      const folder = store.putFolder(makeFolder(name));
      if (folder) then(folder);
    },
  });
}
