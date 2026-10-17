// 首页: 所有卡片集, 还有备份

import { h, toast, download, today } from '../dom.js';
import { exportBackup, importBackup } from '../backup.js';
import { newFolder } from './folder.js';
import { dueTomorrow, streak, lastDays } from '../srs.js';
import { todayQueue, reviewedToday, plannedSets, newToday, planOf } from '../plan.js';
import { todayText, planLine } from './plan.js';
import { loadConfig, expiryInfo, expiryUnknown } from '../sync.js';
import { dueMistakes } from '../mistakes.js';

const WEEKDAYS = '日一二三四五六';

// 首页最上面: 连续学了几天、最近 7 天、今天该复习几张
function todayPanel(store, sets) {
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
    reviewToday(store, sets),
    mistakesToday(store),
  );
}

// 今天要背的: 到日子的复习 (每天有上限) + 定了计划的卡片集的新词; 下面一个一个说计划走到哪了
function reviewToday(store, sets) {
  const reviewed = reviewedToday(sets);
  const groups = store.plannedFolders();
  const { reviews, fresh, held } = todayQueue(sets, { cap: store.reviewCap, reviewed, groups });
  const text = todayText(reviews.length, fresh.length);
  const planned = [...groups, ...plannedSets(sets)];
  const tomorrow = dueTomorrow(sets);
  let head;
  if (text) {
    head = [
      h(
        'div',
        {},
        h('strong', {}, `今天: ${text}`),
        h('div', { class: 'muted small' }, held ? `还有 ${held} 张到日子的超过了每天 ${store.reviewCap} 张的上限, 明天再来` : '照遗忘的规律排好的, 趁快忘了再看一眼'),
      ),
      h('a', { class: 'btn primary', href: '#/review' }, '开始'),
    ];
  } else {
    const hint = held ? `今天复习够 ${store.reviewCap} 张了, 还有 ${held} 张明天再来` : tomorrow ? `明天有 ${tomorrow} 张要复习` : planned.length ? '明天接着学新词' : '在卡片集里定个「每天背新词」的计划, 每天自动给你几个新词';
    head = [h('div', {}, h('strong', {}, reviewed || planned.some((s) => newToday(s).learned) ? '今天的背完了 ✓' : '今天没有要复习的 ✓'), h('div', { class: 'muted small' }, hint)), held ? h('a', { class: 'btn', href: '#/review' }, '接着复习') : null];
  }
  return h(
    'div',
    { class: `today-review today-plan${planned.length ? ' wide' : ''}` },
    h('div', { class: 'today-head' }, head),
    planned.length
      ? h(
          'ul',
          { class: 'plan-list' },
          planned.map((set) => {
            const info = newToday(set);
            const href = set.virtual ? `#/folder/${encodeURIComponent(set.folderId)}` : `#/set/${encodeURIComponent(set.id)}`;
            return h('li', {}, h('a', { href }, set.virtual ? `📁 ${set.title}` : set.title || '未命名卡片集'), h('span', { class: 'muted small' }, planLine(info, planOf(set))));
          }),
        )
      : null,
  );
}

// 错题集里今天该重做的 (有错题才显示)
function mistakesToday(store) {
  if (!store.data.mistakes.length) return null;
  const due = dueMistakes(store.data.mistakes).length;
  return h(
    'div',
    { class: 'today-review' },
    due
      ? [h('div', {}, h('strong', {}, `📕 错题: 今天该重做 ${due} 道`), h('div', { class: 'muted small' }, '先不看答案再做一遍, 连对 3 次算掌握')), h('a', { class: 'btn primary', href: '#/mistakes/review' }, '去重做')]
      : [h('div', {}, h('strong', {}, '📕 错题: 今天不用重做 ✓'), h('div', { class: 'muted small' }, `错题集里 ${store.data.mistakes.length} 道`)), h('a', { class: 'btn', href: '#/mistakes' }, '看错题集')],
  );
}

// 背到哪了: 背过的 (排进了复习的, 连从 Anki 搬来的; 单词卡标了会了的、学习里学过的也算) 和会了的
function progressOf(sets) {
  let total = 0;
  let studied = 0;
  let known = 0;
  for (const set of sets) {
    const knownIds = new Set(set.known);
    for (const [cid, level] of Object.entries(set.learn)) if (level === 2) knownIds.add(cid);
    for (const card of set.cards) {
      total++;
      if (knownIds.has(card.id)) known++;
      if (set.stats[card.id]?.due > 0 || knownIds.has(card.id) || set.learn[card.id] >= 1) studied++;
    }
  }
  return { total, studied, known };
}

function meter({ total, studied }) {
  const pct = total ? Math.round((studied / total) * 100) : 0;
  return h('span', { class: 'meter', title: `背过 ${studied} / ${total}` }, h('span', { class: 'meter-fill', style: `width:${pct}%` }));
}

const progressText = ({ total, studied, known }) => (!total ? '还没有卡片' : studied ? `背过 ${studied} 张${known ? ` · 会了 ${known} 张` : ''}` : '还没背过');

function setTile(set) {
  const total = set.cards.length;
  if (set.kind === 'quiz') {
    return h(
      'li',
      {},
      h(
        'a',
        { class: 'set-tile quiz-tile', href: `#/set/${encodeURIComponent(set.id)}` },
        h('span', { class: 'set-tile-title' }, set.title || '未命名题目集'),
        h('span', { class: 'muted' }, h('span', { class: 'kind-tag' }, '📝 题目集'), ` ${total} 道题`),
        h('span', { class: 'muted small' }, set.best.quiz ? `最高 ${set.best.quiz} 分 · 答过 ${set.runs.length} 次` : '还没答过'),
      ),
    );
  }
  const p = progressOf([set]);
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'set-tile', href: `#/set/${encodeURIComponent(set.id)}` },
      h('span', { class: 'set-tile-title' }, set.title || '未命名卡片集'),
      h('span', { class: 'muted' }, `${total} 张卡片`),
      meter(p),
      h('span', { class: 'muted small' }, progressText(p)),
    ),
  );
}

// 文件夹 (像 Anki 的大牌组): 里面的卡片集列在下面, 首页就不再单独摆一遍
function folderTile(store, folder) {
  const members = folder.setIds.map((sid) => store.getSet(sid)).filter(Boolean);
  const p = progressOf(members);
  return h(
    'li',
    { class: 'folder-card' },
    h(
      'a',
      { class: 'set-tile folder-tile', href: `#/folder/${encodeURIComponent(folder.id)}` },
      h('span', { class: 'set-tile-title' }, `📁 ${folder.name || '未命名文件夹'}`),
      h('span', { class: 'muted' }, `${members.length} 个卡片集 · ${p.total} 张卡片`),
      meter(p),
      h('span', { class: 'muted small' }, progressText(p)),
    ),
    members.length
      ? h(
          'ul',
          { class: 'folder-members' },
          members.map((set) => h('li', {}, h('a', { href: `#/set/${encodeURIComponent(set.id)}` }, set.title || '未命名卡片集'))),
        )
      : null,
  );
}

export function renderHome({ store, go }) {
  const sets = store.allSets();
  const folders = store.allFolders();
  const inFolder = new Set(folders.flatMap((f) => f.setIds));
  const loose = sets.filter((s) => !inFolder.has(s.id));
  const newFolderBtn = h('button', { class: 'btn small', onclick: () => newFolder(store, (f) => go(`#/folder/${encodeURIComponent(f.id)}`)) }, '＋ 新建文件夹');

  const list = sets.length
    ? [
        h('div', { class: 'list-head' }, h('h2', {}, folders.length ? '文件夹和卡片集' : '卡片集'), newFolderBtn),
        h('ul', { class: 'set-grid' }, folders.map((f) => folderTile(store, f)), loose.map(setTile)),
        folders.length ? null : h('p', { class: 'muted small' }, '把几个卡片集放进一个文件夹, 就能合起来一起学 (比如期末要考的几课); 从 Anki 搬来的大牌组会自动变成文件夹。'),
      ]
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
              h('a', { class: 'btn', href: '#/mistakes' }, '📕 错题集'),
              h('a', { class: 'btn', href: '#/games' }, '🎮 游戏'),
              h('a', { class: 'btn', href: '#/new-quiz', title: '像 Kahoot 那样每道题自己写选项, 限时答' }, '📝 新建题目集'),
              h('a', { class: 'btn', href: '#/import', title: 'Quizlet 的文字、Excel、CSV、Anki 卡组' }, '导入'),
              h('a', { class: 'btn primary', href: '#/new' }, '＋ 新建'),
            )
          : null,
      ),
      expiryNotice(),
      sets.length || store.data.mistakes.length ? todayPanel(store, sets) : null,
      list,
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
      h('a', { class: 'btn', href: '#/new-quiz' }, '📝 新建题目集 (像 Kahoot)'),
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
