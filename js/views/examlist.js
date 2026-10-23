// 考前清单的窗口 (清单的内容在 ../examlist.js): 考试前一天、考试那天才有。
// 打的勾存在这台设备上 (换了一天、换了考试就重新来); 按数据已经做完的 (今天的复习背完了) 自己打上勾。
// 首页上面一条「明天考试 · 考前清单」, 温温也会提醒。

import { h, fill, openDialog } from '../dom.js';
import { todayAll } from './plan.js';
import { nearestExam } from '../plan.js';
import { kindStats } from '../mistakes.js';
import { LEECH, isSuspended } from '../srs.js';
import { examChecklist } from '../examlist.js';

const KEY = 'wengu:exam-list';

// 明天或者今天考试: 清单要的数; 不是这两天返回 null
export function examInfo(store, now = Date.now()) {
  const exam = nearestExam([...store.data.sets, ...store.data.folders], now);
  if (!exam || exam.days > 1) return null;
  const today = todayAll(store);
  const sets = store.allSets().filter((s) => s.kind !== 'quiz');
  let leeches = 0;
  let starred = 0;
  for (const set of sets) {
    const star = new Set(set.starred);
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (isSuspended(stat)) continue;
      if (stat?.lapses >= LEECH) leeches++;
      if (star.has(card.id)) starred++;
    }
  }
  const mistakes = store.data.mistakes;
  const top = kindStats(mistakes).filter((k) => k.left).sort((a, b) => b.left - a.left)[0] ?? null;
  return {
    ...exam,
    due: today.reviews.length + today.fresh.length,
    mistakes: mistakes.length,
    mistakesLeft: mistakes.filter((m) => !m.review?.mastered).length,
    topKind: top && top.left >= 2 ? { kind: top.kind, left: top.left } : null,
    leeches,
    starred,
  };
}

function loadDone(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return raw?.key === key && Array.isArray(raw.done) ? new Set(raw.done) : new Set();
  } catch {
    return new Set();
  }
}

function saveDone(key, done) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, done: [...done] }));
  } catch {
    // 存不了就只管这次
  }
}

// 做完了几样: { done, total }
export function examProgress(info) {
  const list = examChecklist(info);
  const done = loadDone(`${info.exam}:${info.days}`);
  const items = list.groups.flatMap((g) => g.items);
  return { done: items.filter((i) => i.done || done.has(i.id)).length, total: items.length };
}

export function openExamList(store, { onClose = null } = {}) {
  const info = examInfo(store);
  if (!info) return null;
  const key = `${info.exam}:${info.days}`;
  const list = examChecklist(info);
  const done = loadDone(key);
  const items = list.groups.flatMap((g) => g.items);
  const progress = h('p', { class: 'exam-progress' });
  const drawProgress = () => {
    const n = items.filter((i) => i.done || done.has(i.id)).length;
    fill(progress, n === items.length ? (info.days ? '都准备好了! 早点睡, 明天加油!' : '都好了, 去考吧, 加油!') : `做完了 ${n} / ${items.length}`);
    progress.classList.toggle('all', n === items.length);
  };
  const row = (item) =>
    h(
      'li',
      { class: 'exam-item' },
      h(
        'label',
        {},
        h('input', {
          type: 'checkbox',
          checked: item.done || done.has(item.id),
          disabled: item.done,
          onchange: (e) => {
            if (e.target.checked) done.add(item.id);
            else done.delete(item.id);
            saveDone(key, done);
            drawProgress();
          },
        }),
        h('span', {}, item.text),
      ),
      item.href ? h('a', { class: 'btn small', href: item.href }, '去做') : null,
    );
  drawProgress();
  return openDialog({
    title: info.days ? '考前清单' : '考试当天',
    body: h('div', { class: 'exam-list' }, h('p', {}, list.intro), progress, list.groups.map((g) => [h('h3', {}, g.name), h('ul', {}, g.items.map(row))])),
    // 关了: 首页上那一条 (不管是从哪里打开的) 的「做完了几样」跟着变
    onClose: () => {
      for (const el of document.querySelectorAll('.exam-banner')) el.redraw?.();
      onClose?.();
    },
  });
}

// 首页上面那一条
export function examBanner(store) {
  const info = examInfo(store);
  if (!info) return null;
  const sub = h('span', { class: 'muted small' });
  const draw = () => {
    const p = examProgress(info);
    sub.textContent = p.done === p.total ? '考前清单都做完了 ✓' : `考前清单: 做完了 ${p.done} / ${p.total}`;
  };
  draw();
  const el = h(
    'div',
    { class: 'exam-banner' },
    h('span', { class: 'exam-banner-icon', 'aria-hidden': 'true' }, '📝'),
    h('div', {}, h('strong', {}, info.days ? `明天考试${info.title ? ` (${info.title})` : ''}` : `今天考试, 加油!`), sub),
    h('button', { class: 'btn primary small', type: 'button', onclick: () => openExamList(store) }, '打开清单'),
  );
  el.redraw = draw;
  return el;
}
