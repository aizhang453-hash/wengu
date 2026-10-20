// 文件夹: 几个卡片集放一起, 可以合起来学

import { h, toast, openDialog, askText, switchRow } from '../dom.js';
import { FOLDER_PREFIX, makeFolder } from '../store.js';
import { planPanel } from './plan.js';

export function renderFolder({ store, go }, id) {
  const folder = store.getFolder(id);
  if (!folder) {
    return {
      title: '找不到',
      el: h('section', { class: 'empty' }, h('h1', {}, '找不到这个文件夹'), h('a', { class: 'btn primary', href: '#/' }, '回首页')),
    };
  }
  const combo = store.getSet(FOLDER_PREFIX + folder.id);
  const base = `#/set/${encodeURIComponent(combo.id)}`;
  const sets = folder.setIds.map((sid) => store.getSet(sid)).filter(Boolean);
  const total = combo.cards.length;
  const redraw = () => go(`#/folder/${encodeURIComponent(folder.id)}`);

  const mode = (name, hint, href, enabled) =>
    enabled
      ? h('a', { class: 'mode', href }, h('span', { class: 'mode-name' }, name), h('span', { class: 'muted small' }, hint))
      : h('div', { class: 'mode disabled', 'aria-disabled': 'true' }, h('span', { class: 'mode-name' }, name), h('span', { class: 'muted small' }, '先放卡片集进来'));

  function addSets() {
    const others = store.allSets().filter((s) => s.kind !== 'quiz'); // 题目集不放进文件夹
    if (!others.length) return toast('还没有卡片集');
    const picked = new Set(folder.setIds);
    const d = openDialog({
      title: '放卡片集进来',
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
          '好了',
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
              h('span', { class: 'muted' }, `${set.cards.length} 张卡片`),
            ),
            h(
              'button',
              {
                class: 'icon-btn remove-from-folder',
                title: '从文件夹拿出去 (卡片集不会删)',
                'aria-label': '从文件夹拿出去',
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
                  h('button', { class: 'icon-btn', title: '往前挪', 'aria-label': `${set.title || '未命名卡片集'} 往前挪`, disabled: i === 0, onclick: () => (store.moveInFolder(folder.id, set.id, -1), redraw()) }, '↑'),
                  h('button', { class: 'icon-btn', title: '往后挪', 'aria-label': `${set.title || '未命名卡片集'} 往后挪`, disabled: i === sets.length - 1, onclick: () => (store.moveInFolder(folder.id, set.id, 1), redraw()) }, '↓'),
                )
              : null,
          ),
        ),
      )
    : h('p', { class: 'muted' }, '文件夹是空的。把几个卡片集放进来, 就能合起来一起学。');

  return {
    title: folder.name || '未命名文件夹',
    el: h(
      'section',
      {},
      h('a', { class: 'back', href: '#/' }, '← 主页'),
      h('h1', {}, `📁 ${folder.name || '未命名文件夹'}`),
      h('p', { class: 'muted' }, `${sets.length} 个卡片集 · 一共 ${total} 张卡片`),
      total ? planPanel({ store, go }, combo) : null, // 每天背新词 (整个文件夹一起定)、今天要背的
      h('h2', { class: 'games-title' }, '合起来一起学'),
      h(
        'div',
        { class: 'modes' },
        mode('单词卡', '翻面背, 标记会不会', `${base}/cards`, total > 0),
        mode('学习', '选择题加打字, 答对为止', `${base}/learn`, total > 0),
        mode('测试', '出一套卷子打分', `${base}/test`, total > 0),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn primary', onclick: addSets }, '＋ 放卡片集进来'),
        h('a', { class: 'btn', href: `#/stats/${encodeURIComponent(combo.id)}` }, '📊 统计'),
        h(
          'button',
          {
            class: 'btn',
            onclick: () =>
              askText({
                title: '文件夹改名',
                label: '新名字',
                value: folder.name,
                onOk: (name) => {
                  store.putFolder({ ...folder, name });
                  redraw();
                },
              }),
          },
          '改名',
        ),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              if (!confirm(`删掉文件夹「${folder.name}」? 里面的卡片集不会删。`)) return;
              store.deleteFolder(folder.id);
              toast('文件夹删掉了');
              go('#/');
            },
          },
          '删除文件夹',
        ),
      ),
      h('h2', {}, `卡片集 (${sets.length})`),
      list,
    ),
  };
}

// 新建文件夹 (首页、卡片集页都用); 建好以后调 then(folder)
export function newFolder(store, then) {
  askText({
    title: '新建文件夹',
    label: '文件夹叫什么',
    placeholder: '比如「期末考试」',
    okText: '建好了',
    onOk: (name) => {
      const folder = store.putFolder(makeFolder(name));
      if (folder) then(folder);
    },
  });
}
