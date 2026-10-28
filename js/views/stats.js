// 统计 (像 Anki 的「统计」): #/stats 所有卡片集, #/stats/<卡片集或 folder:文件夹> 只看那里的 (算法在 ../stats.js)

import { h, fill, toast } from '../dom.js';
import { stripMarks } from '../rich.js';
import { DAY, dayKey, startOfDay, LEECH } from '../srs.js';
import { FOLDER_PREFIX } from '../store.js';
import { forecast, cardStates, knowledge, reviewsByDay, retentionStats, todayStats, leeches, suspendedCards, timeOfDay, bestTime, MATURE, MIN_BLOCK, MIN_TIME_TOTAL } from '../stats.js';
import { editCardDialog } from './cardedit.js';
import { openRetentionDialog, openCapDialog, percent, dateText } from './plan.js';

const num = (n) => Math.round(n).toLocaleString('zh-CN');
const WEEKDAYS = '一二三四五六日';
const LIST_MAX = 30; // 难记卡、暂停的一次列几张

export function renderStats({ store, go }, id = null) {
  const scope = id ? store.getSet(id) : null;
  if (id && !scope) {
    return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '卡片集不存在'), h('a', { class: 'btn primary', href: '#/stats' }, '查看全部统计')) };
  }
  const sets = id ? store.setsOf(id) : store.allSets();
  const here = `#/stats${id ? `/${encodeURIComponent(id)}` : ''}`;
  const review = `#/review${id ? `/${encodeURIComponent(id)}` : ''}`; // 只看一个卡片集的: 去复习也只复习它
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
    { class: 'input stats-scope', 'aria-label': '统计范围', onchange: (e) => go(e.target.value ? `#/stats/${encodeURIComponent(e.target.value)}` : '#/stats') },
    h('option', { value: '' }, '全部卡片集'),
    store.allFolders().map((f) => h('option', { value: FOLDER_PREFIX + f.id, selected: id === FOLDER_PREFIX + f.id }, `文件夹：${f.name || '未命名文件夹'}`)),
    store
      .allSets()
      .map((s) => h('option', { value: s.id, selected: id === s.id }, s.title || '未命名卡片集')),
  );

  const back = scope ? (scope.virtual ? `#/folder/${encodeURIComponent(scope.folderId)}` : `#/set/${encodeURIComponent(scope.id)}`) : '#/';
  return {
    title: '统计',
    el: h(
      'section',
      { class: 'stats-page' },
      h('a', { class: 'back', href: back }, `← ${scope ? scope.title || '未命名卡片集' : '首页'}`),
      h('div', { class: 'page-head' }, h('h1', {}, '统计'), picker),
      sets.some((s) => s.cards.length)
        ? [
            todaySection(store, sets, log, now, review),
            forecastSection(sets.filter((s) => store.isDaily(s)), now), // 只有每天背的才排复习
            calendarSection(sets, log, now),
            retentionSection(store, sets, log, now, redraw),
            timeSection(sets, log, now),
            cardsSection(sets, now),
            leechSection(store, sets, redraw, review),
            suspendedSection(store, sets, redraw),
          ]
        : h('p', { class: 'muted' }, '暂无卡片。'),
    ),
  };
}

const section = (title, ...children) => h('section', { class: 'stats-card' }, h('h2', {}, title), ...children);
const figure = (value, label) => h('div', { class: 'stat-fig' }, h('strong', {}, value), h('span', { class: 'muted small' }, label));

function todaySection(store, sets, log, now, review) {
  const t = todayStats(sets, log, now);
  const [today] = retentionStats(sets, log, now, [1]);
  return section(
    '今日',
    t.reviews
      ? h(
          'div',
          { class: 'stat-figs' },
          figure(num(t.reviews), '复习次数'),
          figure(num(t.fresh), '新词'),
          figure(num(t.again), '遗忘次数'),
          figure(t.minutes ? `${t.minutes} 分钟` : '< 1 分钟', '学习时长'),
          today.n ? figure(percent(today.ok / today.n), `记忆率（${today.n} 张到期）`) : null,
        )
      : h('p', { class: 'muted' }, '今日尚未复习。'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary small', href: review }, '开始复习')),
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
      bars(values, { label: (i) => (i === 0 ? '今天' : i % step === 0 ? `${i}天` : null), title: (i, v) => `${when(i)}：${v} 张`, cls: days > 30 ? 'dense' : '' }),
      h('p', { class: 'muted small' }, `今日 ${num(values[0])} 张（含已到期） · 明日 ${num(values[1] ?? 0)} 张 · 一周内 ${num(week)} 张 · ${days === 30 ? '一个月' : '三个月'}内日均 ${num(sum / days)} 张`),
    );
  }
  draw();
  return section('复习预测', h('div', { class: 'chips' }, tabs), box, h('p', { class: 'muted small' }, '不含未学的新词。同一天学习的卡片可能在同一天到期，之后的复习日期会自动错开。'));
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
    cells.push(h('span', { class: `cal-cell l${level(n)}`, title: `${key}：${n} 次` }));
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
    '学习记录',
    wrap,
    h(
      'p',
      { class: 'muted small' },
      total ? `近一年学习 ${days} 天，复习 ${num(total)} 次（含 Anki 导入），日均 ${num(total / days)} 次。颜色越深表示复习越多。` : '近一年暂无复习记录。',
    ),
  );
}

function retentionSection(store, sets, log, now, redraw) {
  const rows = retentionStats(sets, log, now);
  const names = { 1: '今日', 7: '近 7 天', 30: '近 30 天', 365: '近一年' };
  const target = store.retention;
  return section(
    '记忆率',
    h('p', { class: 'muted small' }, '到期复习时仍记得的比例，不含当日重复练习和新词首次学习。'),
    h(
      'table',
      { class: 'opt-table stats-table' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '记得'), h('th', {}, '复习'), h('th', {}, '记忆率'))),
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
      `目标记忆率为 ${percent(target)}，实际记忆率接近该值即属正常。`,
      ' ',
      h('button', { class: 'link-btn', onclick: () => openRetentionDialog({ store, onSaved: redraw }) }, '修改'),
      ' · ',
      h('button', { class: 'link-btn', onclick: () => openCapDialog({ store, onSaved: redraw }) }, `每日上限 ${store.reviewCap} 张`),
    ),
  );
}

function cardsSection(sets, now) {
  const c = cardStates(sets);
  const k = knowledge(sets, now);
  const parts = [
    ['new', '新词', '未学习'],
    ['learning', '学习中', '刚遗忘，今日还需复习'],
    ['young', '巩固中', `间隔不足 ${MATURE} 天`],
    ['mature', '已掌握', `间隔 ${MATURE} 天以上`],
    ['suspended', '已暂停', '不安排复习'],
  ];
  return section(
    '卡片状态',
    h(
      'div',
      { class: 'state-bar', role: 'img', 'aria-label': parts.map(([key, name]) => `${name} ${c[key]} 张`).join(', ') },
      parts.map(([key, name]) => (c[key] ? h('span', { class: `state-seg ${key}`, style: `flex-grow:${c[key]}`, title: `${name}：${c[key]} 张` }) : null)),
    ),
    h(
      'ul',
      { class: 'state-legend' },
      parts.map(([key, name, desc]) =>
        h('li', {}, h('span', { class: `state-dot ${key}` }), h('strong', {}, name), ` ${num(c[key])} 张`, h('span', { class: 'muted small' }, `（${percent(c.total ? c[key] / c.total : 0)} · ${desc}）`)),
      ),
    ),
    k.count
      ? h('p', { class: 'small' }, `预计当前记得 ${num(k.sum)} 张（已学 ${num(k.count)} 张，平均记忆率 ${percent(k.avg)}）。`, c.leech ? `难记卡片 ${c.leech} 张，见下文。` : '')
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
      h('strong', {}, stripMarks(item.card.term).slice(0, 60) || '（空）'),
      h('span', { class: 'muted' }, ` — ${stripMarks(item.card.def).replace(/\s+/g, ' ').slice(0, 60)}`),
      h('div', { class: 'muted small' }, h('a', { href: `#/set/${encodeURIComponent(item.set.id)}` }, item.set.title || '未命名卡片集'), extra ? ` · ${extra}` : ''),
    ),
    h('div', { class: 'row' }, tools),
  );
}

function leechSection(store, sets, redraw, review) {
  const list = leeches(sets);
  if (!list.length) return null;
  return section(
    `难记卡片（${list.length}）`,
    h('p', { class: 'muted small' }, `复习时遗忘 ${LEECH} 次以上的卡片。建议补充例句或图片、拆分词根词缀，或与形近词对比；也可暂时搁置。`),
    h(
      'ul',
      { class: 'stats-list' },
      list.slice(0, LIST_MAX).map((x) => {
        const paused = Boolean(x.set.stats[x.card.id]?.sus);
        return cardLine(x, `遗忘 ${x.lapses} 次${paused ? ' · 已暂停' : ''}`, [
          h('button', { class: 'btn small', onclick: () => editCardDialog({ store, setId: x.set.id, card: x.card, onSaved: redraw }) }, '编辑'),
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                store.suspend(x.set.id, [x.card.id], !paused);
                toast(paused ? '已恢复' : '已暂停');
                redraw();
              },
            },
            paused ? '恢复' : '暂停',
          ),
        ]);
      }),
    ),
    list.length > LIST_MAX ? h('p', { class: 'muted small' }, `另有 ${list.length - LIST_MAX} 张，可在卡片集页的「难记」中查看。`) : null,
    h('div', { class: 'row' }, h('a', { class: 'btn small', href: review }, '去复习')),
  );
}

function suspendedSection(store, sets, redraw) {
  const list = suspendedCards(sets);
  if (!list.length) return null;
  return section(
    `已暂停（${list.length}）`,
    h('p', { class: 'muted small' }, '暂停的卡片不安排复习，也不作为新词出现；复习记录保留，恢复后按原进度继续。'),
    h(
      'ul',
      { class: 'stats-list' },
      list.slice(0, LIST_MAX).map((x) =>
        cardLine(x, `${dateText(x.at)}暂停`, [
          h(
            'button',
            {
              class: 'btn small',
              onclick: () => {
                store.suspend(x.set.id, [x.card.id], false);
                toast('已恢复');
                redraw();
              },
            },
            '恢复',
          ),
        ]),
      ),
    ),
    list.length > LIST_MAX ? h('p', { class: 'muted small' }, `另有 ${list.length - LIST_MAX} 张。`) : null,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn small',
          onclick: () => {
            if (!confirm(`恢复全部 ${list.length} 张卡片？`)) return;
            const bySet = new Map();
            for (const x of list) bySet.set(x.set.id, [...(bySet.get(x.set.id) ?? []), x.card.id]);
            for (const [sid, ids] of bySet) store.suspend(sid, ids, false);
            toast(`已恢复 ${list.length} 张`);
            redraw();
          },
        },
        '全部恢复',
      ),
    ),
  );
}

// 一天里什么时候记得最牢: 每个时间段复习时记住了几成 (最近半年), 最好的比最常学的确实高才建议换时间
export function timeAdvice(r) {
  const pct = (b) => `${Math.round((b.ok / b.n) * 100)}%`;
  const range = (b) => `${b.from}–${b.to} 时`;
  if (!r.enough) return `复习记录不足（近半年 ${r.total} 次；需至少 ${MIN_TIME_TOTAL} 次，且两个时段各 ${MIN_BLOCK} 次以上）。`;
  if (r.same) return `最常学习的时段是${r.usual.name}（${range(r.usual)}），记忆率 ${pct(r.usual)}，也是记得最牢的时段。`;
  if (r.sure) return `${r.best.name}（${range(r.best)}）记忆率 ${pct(r.best)}，高于最常学习的${r.usual.name}（${pct(r.usual)}）。新词和难记卡片可安排在${r.best.name}学习。`;
  return `各时段差异不大：最高为${r.best.name} ${pct(r.best)}，最常学习的${r.usual.name}为 ${pct(r.usual)}。保持每天学习即可。`;
}

function timeSection(sets, log, now) {
  const blocks = timeOfDay(sets, log, now);
  if (!blocks.some((b) => b.n)) return null;
  const r = bestTime(blocks);
  return section(
    '学习时段',
    h('p', {}, timeAdvice(r)),
    h(
      'ul',
      { class: 'tod-list' },
      blocks
        .filter((b) => b.n)
        .map((b) => {
          const enough = b.n >= MIN_BLOCK;
          const pct = Math.round((b.ok / b.n) * 100);
          const best = r.enough && r.best === b;
          return h(
            'li',
            { class: `tod-row${enough ? '' : ' few'}${best ? ' best' : ''}` },
            h('span', { class: 'tod-name' }, b.name, h('span', { class: 'muted small' }, ` ${b.from}–${b.to} 时`)),
            h('span', { class: 'tod-bar', 'aria-hidden': 'true' }, h('span', { style: `width: ${enough ? pct : 0}%` })),
            h('span', { class: 'small' }, enough ? `${pct}% · ${num(b.n)} 次` : `${num(b.n)} 次（不足）`),
          );
        }),
    ),
    h('p', { class: 'muted small' }, '按各时段复习时的记忆率统计，不含首次学习和当日重复练习；记录越多越准确。'),
  );
}
