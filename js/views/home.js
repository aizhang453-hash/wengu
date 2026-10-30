// 首页「今日」: 今天要做的 (新词、复习、错题, 连续学习几天)、各卡片集今天的份 (只有定了计划的), 下面是所有卡片集和文件夹。
// 备份、同步、复习的设置都在设置页 (settings.js)

import { examBanner } from './examlist.js';
import { h } from '../dom.js';
import { dueTomorrow, streak, lastDays } from '../srs.js';
import { reviewedToday, newToday, planOf, shareOf } from '../plan.js';
import { planLine, todayAll, openCapDialog } from './plan.js';
import { FOLDER_PREFIX, COLLAPSED_KEY } from '../store.js';
import { loadConfig, expiryInfo, expiryUnknown } from '../sync.js';
import { dueMistakes } from '../mistakes.js';
import { inApp } from '../platform.js';

const WEEKDAYS = '日一二三四五六';
const num = (n) => n.toLocaleString('zh-CN');

function dateLine(now = new Date()) {
  return `${now.getMonth() + 1}月${now.getDate()}日 星期${WEEKDAYS[now.getDay()]}`;
}

// 最上面: 今天的新词、复习、错题, 开始的按钮; 下面连续学习几天
function todayCard(store, sets, go) {
  const today = todayAll(store);
  const fresh = today.fresh.length;
  const reviews = today.reviews.length;
  const mistakes = dueMistakes(store.data.mistakes).length;
  const cards = fresh + reviews;
  const days = streak(store.data.activity);
  const week = lastDays(store.data.activity, 7);

  const stat = (n, label, cls, href) => h(n ? 'a' : 'div', { class: `today-stat ${cls}${n ? '' : ' zero'}`, href: n ? href : null }, h('span', { class: 'today-num' }, num(n)), h('span', { class: 'today-label' }, label));
  const tomorrow = dueTomorrow(store.dailySets());
  const doneText = reviewedToday(sets) || sets.some((s) => newToday(s).learned) ? '今日任务已完成' : '今日没有待复习的内容';

  return h(
    'section',
    { class: 'today-card' },
    h(
      'div',
      { class: 'today-main' },
      h('div', { class: 'today-stats' }, stat(fresh, '新词', 'new', '#/review'), stat(reviews, '复习', 'due', '#/review'), store.data.mistakes.length ? stat(mistakes, '错题', 'mistake', '#/mistakes/review') : null),
      h(
        'div',
        { class: 'today-actions' },
        cards ? h('a', { class: 'btn primary', href: '#/review' }, '开始学习') : null,
        mistakes ? h('a', { class: `btn${cards ? '' : ' primary'}`, href: '#/mistakes/review' }, '重做错题') : null,
        !cards && !mistakes ? h('span', { class: 'today-done' }, doneText, tomorrow ? h('span', { class: 'muted' }, `明日待复习 ${num(tomorrow)} 张`) : null) : null,
      ),
    ),
    today.held
      ? h(
          'p',
          { class: 'today-note' },
          `另有 ${num(today.held)} 张超出每日复习上限，已顺延。`,
          h('a', { href: '#/review' }, '继续复习'),
          ' · ',
          h('button', { class: 'link-btn', type: 'button', onclick: () => openCapDialog({ store, onSaved: () => go('#/') }) }, '调整上限'),
        )
      : null,
    h(
      'div',
      { class: 'today-foot' },
      h('span', { class: 'muted' }, days ? `已连续学习 ${days} 天` : '今日尚未学习'),
      h(
        'span',
        { class: 'week', 'aria-label': '最近 7 天' },
        week.map((d) => h('span', { class: `day${d.count ? ' on' : ''}`, title: `${d.key}：${d.count} 题` }, WEEKDAYS[d.date.getDay()])),
      ),
    ),
    deckList(store, sets, today, go),
  );
}

function loadCollapsed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

// 各卡片集今天的份 (像 Anki 的牌组列表): 只列今天有内容的; 文件夹下面列着里面的 (能收起)。
// 张数跟上面一样: 先所有卡片集一起排好每天的上限, 最可能忘的先来, 再看各占几张
function deckList(store, sets, today, go) {
  const decks = sets.filter((s) => s.cards.length);
  const folders = store.allFolders().filter((f) => f.setIds.some((sid) => decks.some((d) => d.id === sid)));
  const inFolder = new Set(folders.flatMap((f) => f.setIds));
  const collapsed = loadCollapsed();
  const planText = (set) => (set.plan?.on ? planLine(newToday(set), planOf(set)) : '');

  function row({ title, href, reviewHref, share, plan, child = false, toggle = null }) {
    const { reviews, fresh, held } = share;
    if (!reviews.length && !fresh.length && !held && !toggle) return null;
    const counts = [fresh.length ? h('span', { class: 'new' }, `新词 ${num(fresh.length)}`) : null, reviews.length ? h('span', { class: 'due' }, `复习 ${num(reviews.length)}`) : null, held ? h('span', { class: 'held' }, `顺延 ${num(held)}`) : null];
    return h(
      'li',
      { class: `deck-row${child ? ' child' : ''}` },
      h('div', { class: 'deck-name' }, h('div', { class: 'deck-line' }, toggle, h('a', { href }, title)), plan ? h('div', { class: 'deck-plan' }, plan) : null),
      h('div', { class: 'deck-counts' }, counts),
      reviews.length + fresh.length + held ? h('a', { class: 'btn small', href: reviewHref }, '学习') : h('span'),
    );
  }
  const setRow = (set, child = false) => row({ title: set.title || '未命名卡片集', href: `#/set/${encodeURIComponent(set.id)}`, reviewHref: `#/review/${encodeURIComponent(set.id)}`, share: shareOf(today, [set]), plan: planText(set), child });

  const rows = [];
  for (const folder of folders) {
    const members = folder.setIds.map((sid) => decks.find((d) => d.id === sid)).filter(Boolean);
    const share = shareOf(today, members);
    if (!share.reviews.length && !share.fresh.length && !share.held) continue;
    const combo = store.getSet(FOLDER_PREFIX + folder.id);
    const open = !collapsed.has(folder.id);
    const toggle = h(
      'button',
      {
        class: 'deck-toggle',
        type: 'button',
        'aria-expanded': String(open),
        'aria-label': open ? '收起' : '展开',
        onclick: () => {
          if (open) collapsed.add(folder.id);
          else collapsed.delete(folder.id);
          try {
            localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
          } catch {
            // 记不住就算了
          }
          go('#/');
        },
      },
      open ? '−' : '+',
    );
    rows.push(row({ title: folder.name || '未命名文件夹', href: `#/folder/${encodeURIComponent(folder.id)}`, reviewHref: `#/review/${encodeURIComponent(combo.id)}`, share, plan: planText(combo), toggle }));
    if (open) rows.push(...members.map((set) => setRow(set, true)));
  }
  rows.push(...decks.filter((s) => !inFolder.has(s.id)).map((set) => setRow(set)));
  const shown = rows.filter(Boolean);
  return shown.length ? h('ul', { class: 'deck-list' }, shown) : null;
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
  return h('span', { class: 'meter', title: `已学 ${studied} / ${total}` }, h('span', { class: 'meter-fill', style: `width:${pct}%` }));
}

const progressText = ({ total, studied }) => (!total ? '暂无卡片' : studied ? `已学 ${Math.round((studied / total) * 100)}%` : '未开始');

function setTile(set) {
  const p = progressOf([set]);
  return h(
    'li',
    {},
    h(
      'a',
      { class: 'set-tile', href: `#/set/${encodeURIComponent(set.id)}` },
      h('span', { class: 'set-tile-title' }, set.title || '未命名卡片集'),
      h('span', { class: 'set-tile-meta' }, `${num(p.total)} 张`, h('span', {}, progressText(p))),
      meter(p),
    ),
  );
}

// 文件夹 (像 Anki 的大牌组): 里面的卡片集列在下面, 就不再单独摆一遍
function folderTile(store, folder) {
  const members = folder.setIds.map((sid) => store.getSet(sid)).filter(Boolean);
  const p = progressOf(members);
  return h(
    'li',
    { class: 'folder-card' },
    h(
      'a',
      { class: 'set-tile folder-tile', href: `#/folder/${encodeURIComponent(folder.id)}` },
      h('span', { class: 'set-tile-title' }, folder.name || '未命名文件夹'),
      h('span', { class: 'set-tile-meta' }, `${members.length} 个卡片集 · ${num(p.total)} 张`, h('span', {}, progressText(p))),
      meter(p),
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
  const empty = !sets.length && !store.data.mistakes.length;

  return {
    title: '',
    el: h(
      'section',
      { class: 'home' },
      h('div', { class: 'page-head home-head' }, h('h1', {}, '今日'), h('span', { class: 'muted' }, dateLine())),
      expiryNotice(),
      examBanner(store),
      empty ? welcome() : todayCard(store, sets, go),
      sets.length
        ? [
            h('div', { class: 'list-head' }, h('h2', {}, '卡片集'), h('span', { class: 'muted small' }, `${sets.length} 个`)),
            h('ul', { class: 'set-grid' }, folders.map((f) => folderTile(store, f)), loose.map(setTile)),
          ]
        : empty
          ? null
          : h('p', { class: 'muted' }, '还没有卡片集。', h('a', { href: '#/new' }, '新建'), ' 或 ', h('a', { href: '#/import' }, '导入'), '。'),
    ),
  };
}

// 同步用的密钥快过期了 (还剩两周以内): 首页提醒一下; 不知道哪天过期: 提醒去填
function expiryNotice() {
  const config = loadConfig();
  if (expiryUnknown(config)) {
    return h('a', { class: 'expiry-notice ask', href: '#/sync' }, h('strong', {}, '请填写同步密钥的到期日期'), h('span', {}, '到期前会提醒更换'));
  }
  const info = expiryInfo(config);
  if (!info?.warn) return null;
  return h(
    'a',
    { class: 'expiry-notice', href: '#/sync' },
    h('strong', {}, info.expired ? '同步密钥可能已过期' : info.days === 0 ? '同步密钥今日到期' : `同步密钥将在 ${info.days} 天后到期`),
    h('span', {}, '点此更换'),
  );
}

function welcome() {
  return h(
    'div',
    { class: 'welcome' },
    h('p', { class: 'welcome-title' }, '温故而知新'),
    h('p', { class: 'muted' }, '新建卡片集，或从 Quizlet、Excel、Anki 导入；也可以拍照，让 AI 生成卡片。'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/new' }, '新建卡片集'), h('a', { class: 'btn', href: '#/import' }, '导入')),
    // App 里的卡片和网页版分开存: 装好 App 第一次打开是空的, 教怎么搬过来 (连上同步以后卡片自己会来, 就不用说了)
    inApp() && !loadConfig() ? moveFromWeb() : null,
  );
}

function moveFromWeb() {
  return h(
    'div',
    { class: 'welcome-move' },
    h('p', { class: 'welcome-move-title' }, '已在网页版使用过温故？'),
    h('p', { class: 'muted small' }, 'App 与网页版的卡片分开保存，可以用以下方式搬到 App：'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, h('strong', {}, '多设备同步'), '：在电脑上打开温故网页版，进入「设置 › 多设备同步」，点击「在手机上连接」；用本机相机扫描二维码，在打开的网页中点击「在 App 中连接」。网页版尚未开启同步的，请先在网页版开启。'),
      h('li', {}, h('strong', {}, '备份文件'), '：在网页版「设置」中导出备份，再在本 App 的「设置」中恢复。'),
    ),
    h('div', { class: 'row' }, h('a', { class: 'btn small', href: '#/sync' }, '同步设置'), h('a', { class: 'btn small', href: '#/settings' }, '恢复备份')),
  );
}
