// 首页: 所有卡片集, 还有备份

import { h, toast, download, today } from '../dom.js';
import { exportBackup, importBackup } from '../backup.js';

export function renderHome({ store, go }) {
  const sets = store.allSets();

  const list = sets.length
    ? h(
        'ul',
        { class: 'set-grid' },
        sets.map((set) => {
          const total = set.cards.length;
          // 学习里掌握了的, 或者单词卡里标了会了的, 都算会了
          const knownIds = new Set(set.known);
          for (const [cid, level] of Object.entries(set.learn)) if (level === 2) knownIds.add(cid);
          const known = knownIds.size;
          const pct = total ? Math.round((known / total) * 100) : 0;
          return h(
            'li',
            {},
            h(
              'a',
              { class: 'set-tile', href: `#/set/${encodeURIComponent(set.id)}` },
              h('span', { class: 'set-tile-title' }, set.title || '未命名卡片集'),
              h('span', { class: 'muted' }, `${total} 张卡片`),
              h(
                'span',
                { class: 'meter', title: `会了 ${known} / ${total}` },
                h('span', { class: 'meter-fill', style: `width:${pct}%` }),
              ),
              h('span', { class: 'muted small' }, total ? `会了 ${known} 张` : '还没有卡片'),
            ),
          );
        }),
      )
    : welcome();

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const { added, replaced } = await importBackup(store, await file.text());
        if (added + replaced === 0) {
          toast('这个文件里没找到卡片集');
          return;
        }
        toast(`导入了 ${added + replaced} 个卡片集` + (replaced ? ` (替换了 ${replaced} 个原来的)` : ''));
        go('#/');
      } catch {
        toast('读不了这个文件, 是温故导出的备份吗?');
      }
    },
  });

  const backup = h(
    'section',
    { class: 'backup' },
    h('h2', {}, '备份'),
    h(
      'p',
      { class: 'muted' },
      '卡片 (连图片、录音) 都存在这个浏览器里, 不上传。换电脑、换浏览器或者清浏览器数据之前, 先导出备份, 到那边再导入。',
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn',
          disabled: sets.length === 0,
          onclick: async () => download(`温故备份-${today()}.json`, await exportBackup(store)),
        },
        '导出备份',
      ),
      h('button', { class: 'btn', onclick: () => fileInput.click() }, '导入备份'),
      fileInput,
    ),
  );

  return {
    title: '',
    el: h(
      'section',
      {},
      h(
        'div',
        { class: 'page-head' },
        h('h1', {}, '我的卡片集'),
        sets.length
          ? h(
              'div',
              { class: 'row' },
              h('a', { class: 'btn', href: '#/import' }, '从 Quizlet 导入'),
              h('a', { class: 'btn primary', href: '#/new' }, '＋ 新建'),
            )
          : null,
      ),
      list,
      backup,
    ),
  };
}

function welcome() {
  return h(
    'div',
    { class: 'welcome' },
    h('p', { class: 'lead' }, '温故而知新。建一个卡片集, 一面写词, 一面写解释, 就可以开始背了。'),
    h(
      'div',
      { class: 'row' },
      h('a', { class: 'btn primary', href: '#/new' }, '＋ 新建卡片集'),
      h('a', { class: 'btn', href: '#/import' }, '从 Quizlet 搬过来'),
    ),
    h(
      'details',
      { class: 'howto' },
      h('summary', {}, '怎么把 Quizlet 上的卡片搬过来?'),
      h(
        'ol',
        {},
        h('li', {}, '在 Quizlet 上打开你的卡片集, 点「…」(更多), 再点「导出」'),
        h('li', {}, '「词和解释之间」选 Tab, 「卡片之间」选换行 (默认就是这样), 点「复制文字」'),
        h('li', {}, '回到这里点「从 Quizlet 搬过来」, 粘贴进去, 点「加进来」, 再保存'),
      ),
    ),
  );
}
