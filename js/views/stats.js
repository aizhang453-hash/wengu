// 统计 (像 Anki 的「统计」): #/stats 所有卡片集, #/stats/<卡片集或 folder:文件夹> 只看那里的 (算法在 ../stats.js)

import { h, fill, toast } from '../dom.js';
import { stripMarks } from '../rich.js';
import { DAY, dayKey, startOfDay, LEECH } from '../srs.js';
import { FOLDER_PREFIX } from '../store.js';
import { forecast, cardStates, knowledge, reviewsByDay, retentionStats, todayStats, leeches, suspendedCards, MATURE } from '../stats.js';
import { editCardDialog } from './cardedit.js';
import { openRetentionDialog, openCapDialog, percent, dateText } from './plan.js';

const num = (n) => Math.round(n).toLocaleString('zh-CN');
const WEEKDAYS = '一二三四五六日';
const LIST_MAX = 30; // 难记卡、暂停的一次列几张

export function renderStats({ store, go }, id = null) {
  const scope = id ? store.getSet(id) : null;
  if (id && !scope) {
    return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '找不到这个卡片集'), h('a', { class: 'btn primary', href: '#/stats' }, '看全部的统计')) };
  }
  const sets = (id ? store.setsOf(id) : store.allSets()).filter((s) => s.kind !== 'quiz');
  const here = `#/stats${id ? `/${encodeURIComponent(id)}` : ''}`;
  const redraw = () => {
    const y = window.scrollY;
    go(here);
    window.scrollTo(0, y);
  };
  const log = store.data.revlog;
  const now = Date.now();

  // 看哪些: 全部 / 文件夹 / 卡片集
  const picker = h(
    'select',
    { class: 'input stats-scope', 'aria-label': '看哪些的统计', onchange: (e) => go(e.target.value ? `#/stats/${encodeURIComponent(e.target.value)}` : '#/stats') },
    h('option', { value: '' }, '所有卡片集'),
    store.allFolders().map((f) => h('option', { value: FOLDER_PREFIX + f.id, selected: id === FOLDER_PREFIX + f.id }, `📁 ${f.name || '未命名文件夹'}`)),
    store
      .allSets()
      .filter((s) => s.kind !== 'quiz')
      .map((s) => h('option', { value: s.id, selected: id === s.id }, s.title || '未命名卡片集')),
  );

  const back = scope ? (scope.virtual ? `#/folder/${encodeURIComponent(scope.folderId)}` : `#/set/${encodeURIComponent(scope.id)}`) : '#/';
  return {
    title: '统计',
    el: h(
      'section',
      { class: 'stats-page' },
      h('a', { class: 'back', href: back }, `← ${scope ? scope.title || '未命名卡片集' : '首页'}`),
      h('div', { class: 'page-head' }, h('h1', {}, '📊 统计'), picker),
      sets.some((s) => s.cards.length)
        ? [
            todaySection(store, sets, log, now),
            forecastSection(sets, now),
            calendarSection(sets, log, now),
            retentionSection(store, sets, log, now, redraw),
            cardsSection(sets, now),
            leechSection(store, sets, redraw),
            suspendedSection(store, sets, redraw),
          ]
        : h('p', { class: 'muted' }, '还没有卡片。'),
    ),
  };
}

const section = (title, ...children) => h('section', { class: 'stats-card' }, h('h2', {}, title), ...children);
const figure = (value, label) => h('div', { class: 'stat-fig' }, h('strong', {}, value), h('span', { class: 'muted small' }, label));

function todaySection(store, sets, log, now) {
  const t = todayStats(sets, log, now);
  const [today] = retentionStats(sets, log, now, [1]);
  return section(
    '今天',
    t.reviews
      ? h(
          'div',
          { class: 'stat-figs' },
          figure(num(t.reviews), '翻卡几次'),
          figure(num(t.fresh), '新词'),
          figure(num(t.again), '忘了几次'),
          figure(t.minutes ? `${t.minutes} 分钟` : '不到 1 分钟', '大约用了'),
          today.n ? figure(percent(today.ok / today.n), `记住率 (${today.n} 张到日子的)`) : null,
        )
      : h('p', { class: 'muted' }, '今天还没翻卡自评过。'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary small', href: '#/review' }, '去今天的复习')),
  );
}

// 柱状图: values 每根多高, label(i) 底下写什么 (没有就不写), title(i) 指上去写什么
function bars(values, { label, title, cls = '' }) {
  const max = Math.max(1, ...values);
  return h(
    'div',
    { class: `bars ${cls}` },
    values.map((v, i) =>
      h(
        'div',
        { class: 'bar-col', title: title(i, v) },
        h('div', { class: 'bar-track' }, h('div', { class: `bar${v ? '' : ' zero'}`, style: `height:${(v / max) * 100}%` })),
        h('span', { class: 'bar-label' }, label(i) ?? ''),
      ),
    ),
  );
}

function forecastSection(sets, now) {
  let days = 30;
  const box = h('div');
  const tabs = [
    [30, '一个月'],
    [90, '三个月'],
  ].map(([n, text]) => h('button', { class: `chip${n === days ? ' on' : ''}`, type: 'button', onclick: () => ((days = n), draw()) }, text));
  function draw() {
    tabs.forEach((b, i) => b.classList.toggle('on', [30, 90][i] === days));
    const values = forecast(sets, days, now);
    const sum = values.reduce((a, b) => a + b, 0);
    const week = values.slice(0, 7).reduce((a, b) => a + b, 0);
    const step = days === 30 ? 7 : 14;
    const when = (i) => (i === 0 ? '今天' : i === 1 ? '明天' : dateText(startOfDay(now) + i * DAY + DAY / 2, now));
    fill(
      box,
      bars(values, { label: (i) => (i === 0 ? '今天' : i % step === 0 ? `${i}天` : null), title: (i, v) => `${when(i)}: ${v} 张`, cls: days > 30 ? 'dense' : '' }),
      h('p', { class: 'muted small' }, `今天 ${num(values[0])} 张 (连已经到日子的) · 明天 ${num(values[1] ?? 0)} 张 · 一周内 ${num(week)} 张 · ${days === 30 ? '一个月' : '三个月'}里平均每天 ${num(sum / days)} 张`),
    );
  }
  draw();
  return section('以后每天要复习几张', h('div', { class: 'chips' }, tabs), box, h('p', { class: 'muted small' }, '还没背过的新词不算 (每天背几个新词在卡片集的计划里定)。某几天特别多, 是同一天背的一批又一起到日子了; 以后排的日子会自己错开。'));
}

// 日历: 最近一年每天翻卡自评了几次 (像 Anki、GitHub 的那种格子), 一列一周, 星期一在上面
function calendarSection(sets, log, now) {
  const byDay = reviewsByDay(sets, log);
  const today0 = startOfDay(now);
  const monday = (t) => t - ((new Date(t).getDay() + 6) % 7) * DAY;
  const start = monday(today0 - 364 * DAY);
  const counts = [...byDay.values()].sort((a, b) => a - b);
  const q = (p) => counts[Math.floor(p * (counts.length - 1))] ?? 0;
  const levels = [q(0.25), q(0.5), q(0.75)];
  const level = (n) => (!n ? 0 : n <= levels[0] ? 1 : n <= levels[1] ? 2 : n <= levels[2] ? 3 : 4);
  const cells = [];
  // 按天走 (中午算, 换夏令时那天不会少一天)
  for (let t = start + DAY / 2; t <= today0 + DAY / 2; t += DAY) {
    const key = dayKey(t);
    const n = byDay.get(key) ?? 0;
    cells.push(h('span', { class: `cal-cell l${level(n)}`, title: `${key}: ${n} 次` }));
  }
  let days = 0;
  let total = 0;
  for (const [key, n] of byDay) {
    if (key >= dayKey(start + DAY / 2)) {
      days++;
      total += n;
    }
  }
  const grid = h('div', { class: 'cal-grid' }, cells);
  const wrap = h('div', { class: 'cal-wrap' }, h('div', { class: 'cal-days' }, [...WEEKDAYS].map((d, i) => h('span', {}, i % 2 ? '' : d))), grid);
  requestAnimationFrame(() => (wrap.scrollLeft = wrap.scrollWidth)); // 手机上放不下: 先看最近的
  return section(
    '每天背了多少',
    wrap,
    h(
      'p',
      { class: 'muted small' },
      total ? `最近一年背了 ${days} 天, 翻卡自评 ${num(total)} 次 (连从 Anki 搬来的), 背的那些天平均每天 ${num(total / days)} 次。颜色越深背得越多。` : '最近一年还没有翻卡自评的记录。',
    ),
  );
}

function retentionSection(store, sets, log, now, redraw) {
  const rows = retentionStats(sets, log, now);
  const names = { 1: '今天', 7: '最近 7 天', 30: '最近 30 天', 365: '最近一年' };
  const target = store.retention;
  return section(
    '记住率',
    h('p', { class: 'muted small' }, '到日子 (隔了一天以上) 来复习时还记得的比例 (Anki 的 True Retention)。当天又练的、新词第一次背的不算。'),
    h(
      'table',
      { class: 'opt-table stats-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '记得'), h('th', {}, '复习了'), h('th', {}, '记住率'))),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            {},
            h('th', {}, names[r.days]),
            h('td', {}, num(r.ok)),
            h('td', {}, num(r.n)),
            h('td', { class: r.n >= 20 ? (r.ok / r.n < target - 0.05 ? 'low' : 'fine') : '' }, r.n ? percent(r.ok / r.n) : '—'),
          ),
        ),
      ),
    ),
    h(
      'p',
      { class: 'small' },
      `想记住的把握是 ${percent(target)}: 排复习时按这个算, 记住率差不多就是正常的。`,
      ' ',
      h('button', { class: 'link-btn', onclick: () => openRetentionDialog({ store, onSaved: redraw }) }, '改'),
      ' · ',
      h('button', { class: 'link-btn', onclick: () => openCapDialog({ store, onSaved: redraw }) }, `每天最多复习 ${store.reviewCap} 张`),
    ),
  );
}

function cardsSection(sets, now) {
  const c = cardStates(sets);
  const k = knowledge(sets, now);
  const parts = [
    ['new', '新词', '还没背过'],
    ['learning', '学习中', '刚忘了, 今天还要再来'],
    ['young', '还嫩', `隔不到 ${MATURE} 天`],
    ['mature', '记牢了', `隔 ${MATURE} 天以上`],
    ['suspended', '暂停的', '不排进复习'],
  ];
  return section(
    '卡片背到哪了',
    h(
      'div',
      { class: 'state-bar', role: 'img', 'aria-label': parts.map(([key, name]) => `${name} ${c[key]} 张`).join(', ') },
      parts.map(([key, name]) => (c[key] ? h('span', { class: `state-seg ${key}`, style: `flex-grow:${c[key]}`, title: `${name}: ${c[key]} 张` }) : null)),
    ),
    h(
      'ul',
      { class: 'state-legend' },
      parts.map(([key, name, desc]) =>
        h('li', {}, h('span', { class: `state-dot ${key}` }), h('strong', {}, name), ` ${num(c[key])} 张`, h('span', { class: 'muted small' }, ` (${percent(c.total ? c[key] / c.total : 0)} · ${desc})`)),
      ),
    ),
    k.count
      ? h('p', { class: 'small' }, `估计现在记得 ${num(k.sum)} 张 (背过的 ${num(k.count)} 张, 平均把握 ${percent(k.avg)})。`, c.leech ? ` 难记卡 ${c.leech} 张 (见下面)。` : '')
      : null,
  );
}

// 一张卡片一行: 词 — 解释, 在哪个卡片集, 后面放按钮
function cardLine(item, extra, tools) {
  return h(
    'li',
    { class: 'stats-card-row' },
    h(
      'div',
      { class: 'stats-card-text' },
      h('strong', {}, stripMarks(item.card.term).slice(0, 60) || '(没有词)'),
      h('span', { class: 'muted' }, ` — ${stripMarks(item.card.def).replace(/\s+/g, ' ').slice(0, 60)}`),
      h('div', { class: 'muted small' }, h('a', { href: `#/set/${encodeURIComponent(item.set.id)}` }, item.set.title || '未命名卡片集'), extra ? ` · ${extra}` : ''),
    ),
    h('div', { class: 'row' }, tools),
  );
}

function leechSection(store, sets, redraw) {
  const list = leeches(sets);
  if (!list.length) return null;
  return section(
    `🐌 难记卡 (${list.length})`,
    h('p', { class: 'muted small' }, `复习时忘了 ${LEECH} 次以上的。光多背几遍不一定管用, 换个记法更好记: 加个例句、图片, 拆开词根词缀, 编个谐音, 或者跟长得像的词放一起比一比。不想背的可以先暂停。`),
    h(
      'ul',
      { class: 'stats-list' },
      list.slice(0, LIST_MAX).map((x) => {
        const paused = Boolean(x.set.stats[x.card.id]?.sus);
        return cardLine(x, `忘了 ${x.lapses} 次${paused ? ' · 暂停了' : ''}`, [
          h('button', { class: 'btn small', onclick: () => editCardDialog({ store, setId: x.set.id, card: x.card, onSaved: redraw }) }, '✏️ 改'),
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                store.suspend(x.set.id, [x.card.id], !paused);
                toast(paused ? '恢复了' : '暂停了');
                redraw();
              },
            },
            paused ? '恢复' : '暂停',
          ),
        ]);
      }),
    ),
    list.length > LIST_MAX ? h('p', { class: 'muted small' }, `还有 ${list.length - LIST_MAX} 张, 在卡片集页点「难记卡」看全部。`) : null,
    h('div', { class: 'row' }, h('a', { class: 'btn small', href: '#/review' }, '去复习 (「自定义学习」里能单练难记卡)')),
  );
}

function suspendedSection(store, sets, redraw) {
  const list = suspendedCards(sets);
  if (!list.length) return null;
  return section(
    `⏸ 暂停的 (${list.length})`,
    h('p', { class: 'muted small' }, '暂停了不排进复习、不当新词出, 复习记录都留着; 恢复了接着原来的进度排。'),
    h(
      'ul',
      { class: 'stats-list' },
      list.slice(0, LIST_MAX).map((x) =>
        cardLine(x, `${dateText(x.at)}暂停的`, [
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                store.suspend(x.set.id, [x.card.id], false);
                toast('恢复了');
                redraw();
              },
            },
            '恢复',
          ),
        ]),
      ),
    ),
    list.length > LIST_MAX ? h('p', { class: 'muted small' }, `还有 ${list.length - LIST_MAX} 张。`) : null,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn small',
          onclick: () => {
            if (!confirm(`${list.length} 张都恢复, 照常排进复习?`)) return;
            const bySet = new Map();
            for (const x of list) bySet.set(x.set.id, [...(bySet.get(x.set.id) ?? []), x.card.id]);
            for (const [sid, ids] of bySet) store.suspend(sid, ids, false);
            toast(`恢复了 ${list.length} 张`);
            redraw();
          },
        },
        '全部恢复',
      ),
    ),
  );
}
