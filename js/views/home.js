// 首页: 所有卡片集, 还有备份

import { h, toast, download, today } from '../dom.js';
import { exportBackup, importBackup } from '../backup.js';
import { newFolder } from './folder.js';
import { dueCards, dueTomorrow, streak, lastDays } from '../srs.js';
import { loadConfig, expiryInfo, expiryUnknown } from '../sync.js';

const WEEKDAYS = '日一二三四五六';

// 首页最上面: 连续学了几天、最近 7 天、今天该复习几张
function todayPanel(store, sets) {
  const due = dueCards(sets).length;
  const days = streak(store.data.activity);
  const week = lastDays(store.data.activity, 7);
  const studiedToday = week.at(-1).count > 0;
  return h(
    'section',
    { class: 'today' },
    h(
      'div',
      { class: 'today-streak' },
      h('span', { class: `flame${days ? ' on' : ''}`, 'aria-hidden': 'true' }, '🔥'),
      h(
        'div',
        {},
        h('strong', {}, days ? `连续学了 ${days} 天` : '今天开始打卡吧'),
        h('div', { class: 'muted small' }, studiedToday ? `今天答了 ${week.at(-1).count} 题` : days ? '今天还没学, 学一下就不断' : '学一题就算今天学过'),
      ),
      h(
        'div',
        { class: 'week', 'aria-label': '最近 7 天' },
        week.map((d) => h('span', { class: `day${d.count ? ' on' : ''}`, title: `${d.key}: ${d.count} 题` }, WEEKDAYS[d.date.getDay()])),
      ),
    ),
    h(
      'div',
      { class: 'today-review' },
      due
        ? [h('div', {}, h('strong', {}, `今天该复习 ${due} 张`), h('div', { class: 'muted small' }, '照遗忘的规律排好的, 趁快忘了再看一眼')), h('a', { class: 'btn primary', href: '#/review' }, '开始复习')]
        : [h('div', {}, h('strong', {}, '今天没有要复习的 ✓'), h('div', { class: 'muted small' }, dueTomorrow(sets) ? `明天有 ${dueTomorrow(sets)} 张` : '答过的卡片会自动排进以后的复习'))],
    ),
  );
}

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

  // 文件夹
  const folders = store.allFolders();
  const folderSection = h(
    'section',
    { class: 'folders' },
    h('div', { class: 'list-head' }, h('h2', {}, `文件夹${folders.length ? ` (${folders.length})` : ''}`), h('button', { class: 'btn small', onclick: () => newFolder(store, (f) => go(`#/folder/${encodeURIComponent(f.id)}`)) }, '＋ 新建文件夹')),
    folders.length
      ? h(
          'ul',
          { class: 'set-grid' },
          folders.map((f) => {
            const n = f.setIds.length;
            const cards = f.setIds.reduce((sum, sid) => sum + (store.getSet(sid)?.cards.length ?? 0), 0);
            return h(
              'li',
              {},
              h(
                'a',
                { class: 'set-tile folder-tile', href: `#/folder/${encodeURIComponent(f.id)}` },
                h('span', { class: 'set-tile-title' }, `📁 ${f.name || '未命名文件夹'}`),
                h('span', { class: 'muted' }, `${n} 个卡片集 · ${cards} 张卡片`),
              ),
            );
          }),
        )
      : h('p', { class: 'muted small' }, '把几个卡片集放进一个文件夹, 就能合起来一起学 (比如期末要考的几课)。'),
  );

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
    h('p', { class: 'muted small sync-hint' }, '电脑、手机都想用? ', h('a', { href: '#/sync' }, '设置多设备同步'), ', 以后自动同步, 不用再导来导去。'),
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
              h('a', { class: 'btn', href: '#/import', title: 'Quizlet 的文字、Excel、CSV、Anki 卡组' }, '导入'),
              h('a', { class: 'btn primary', href: '#/new' }, '＋ 新建'),
            )
          : null,
      ),
      expiryNotice(),
      sets.length ? todayPanel(store, sets) : null,
      list,
      sets.length ? folderSection : null,
      backup,
    ),
  };
}

// 同步用的密钥快过期了 (还剩两周以内): 首页提醒一下; 不知道哪天过期: 提醒去填
function expiryNotice() {
  const config = loadConfig();
  if (expiryUnknown(config)) {
    return h('a', { class: 'expiry-notice ask', href: '#/sync' }, h('strong', {}, '同步用的 GitHub 密钥哪天过期?'), h('span', {}, ' 填一下, 快到了提醒你换 →'));
  }
  const info = expiryInfo(config);
  if (!info?.warn) return null;
  return h(
    'a',
    { class: 'expiry-notice', href: '#/sync' },
    h('strong', {}, info.expired ? '⚠ 同步用的 GitHub 密钥可能已经过期了' : info.days === 0 ? '⚠ 同步用的 GitHub 密钥今天就过期了' : `⚠ 同步用的 GitHub 密钥还有 ${info.days} 天就过期了`),
    h('span', {}, ' 点这里换一个, 两分钟就好 →'),
  );
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
      h('a', { class: 'btn', href: '#/import' }, '导入 (Quizlet、Excel、Anki)'),
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
        h('li', {}, '回到这里点「导入」, 粘贴进去, 点「加进来」, 再保存'),
      ),
      h('p', { class: 'muted small' }, '更省事: 装一个 ', h('a', { href: '#/quizlet' }, '「一键搬」书签'), ', 在 Quizlet 的卡片集页面上点一下就搬过来。'),
      h('p', { class: 'muted small' }, '用 Excel 或者 Anki 的: 点「导入」里的「选文件」, 选 .xlsx、.csv 或者 Anki 卡组 (.apkg)。'),
    ),
  );
}
