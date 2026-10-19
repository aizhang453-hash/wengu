// 每天的计划: 卡片集页上的「每天背新词」, 定计划的窗口, 每天最多复习几张的窗口 (算法在 ../plan.js)

import { h, fill, openDialog, toast, today } from '../dom.js';
import { planOf, newToday, todayQueue, reviewedToday, shareOf, newSeed, examTime, cleanPlan, MAX_PER_DAY, MAX_REST, MAX_REVIEW_CAP } from '../plan.js';
import { DAY, startOfDay, intervalRatio, cleanRetention, DEFAULT_RETENTION, MIN_RETENTION, MAX_RETENTION } from '../srs.js';

export function dateText(t, now = Date.now()) {
  const d = new Date(t);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${year}${d.getMonth() + 1}月${d.getDate()}日`;
}

const num = (n) => n.toLocaleString('zh-CN');

// 多久以后 (按钮上的「3 天后」): 当天的按分钟, 以后的按天, 再久按月、年
export function laterText(due, now = Date.now()) {
  if (due - now < DAY / 2 && startOfDay(due) === startOfDay(now)) return `${Math.max(1, Math.round((due - now) / 60000))} 分钟后`;
  const days = Math.max(1, Math.round((startOfDay(due) - startOfDay(now)) / DAY));
  const one = (x) => String(Math.round(x * 10) / 10);
  if (days < 31) return days === 1 ? '明天' : `${days} 天后`;
  if (days < 365) return `${one(days / 30)} 个月后`;
  return `${one(days / 365)} 年后`;
}

export const percent = (r) => `${Math.round(r * 100)}%`;

// 今天的: 「复习 34 张 + 新词 20 个」
export function todayText(reviews, fresh) {
  return [reviews ? `复习 ${num(reviews)} 张` : '', fresh ? `新词 ${num(fresh)} 个` : ''].filter(Boolean).join(' + ');
}

// 一句话说计划走到哪了 (info 是 newToday 算的)
export function planLine(info, plan) {
  if (!info.left) return info.learned ? `今天学了 ${info.learned} 个新词, 新词都背过了 🎉` : '新词都背过了 🎉 以后按复习的日子来';
  const parts = [];
  if (info.mode === 'rest') {
    parts.push(info.daysLeft === 0 ? '今天考试, 加油! 不学新词了' : `离考试还有 ${info.daysLeft} 天, 只复习, 不学新词了`);
    if (info.learned) parts.push(`今天学了 ${info.learned} 个`);
    parts.push(`还有 ${num(info.left)} 个没背过`);
    return parts.join(' · ');
  }
  if (info.mode === 'exam') parts.push(`离考试 ${info.daysLeft} 天 (${dateText(examTime(plan.exam))}), 每天 ${info.perDay} 个`);
  else parts.push(`每天 ${info.perDay} 个${info.mode === 'passed' ? ' (考试日期过了)' : ''}`);
  parts.push(`今天 ${info.learned}/${info.learned + info.today}`);
  parts.push(`还有 ${num(info.left)} 个没背过${info.finish ? `, 照这样 ${dateText(info.finish)} 学完` : ''}`);
  return parts.join(' · ');
}

// 今天要背的: 所有卡片集一起排 (每天的上限、最可能忘的先来、定了计划的卡片集和文件夹的新词)。
// cap 换成 Infinity 就是不管上限
export function todayAll(store, { cap = store.reviewCap } = {}) {
  const all = store.allSets();
  return todayQueue(all, { cap, reviewed: reviewedToday(all), groups: store.plannedFolders() });
}

// 卡片集 (或者文件夹合起来的) 今天那份: { reviews, fresh, held }
export function queueFor(store, set) {
  return shareOf(todayAll(store), set.virtual ? store.setsOf(set.id) : [set]);
}

// 卡片集页、文件夹页上的「每天背新词」
export function planPanel({ store, go }, set) {
  const info = newToday(set);
  const plan = planOf(set);
  const { reviews, fresh, held } = queueFor(store, set);
  const redraw = () => go(location.hash);
  const text = todayText(reviews.length, fresh.length);
  const href = `#/review/${encodeURIComponent(set.id)}`;
  // 今天要背的; 复习到了每天的上限还剩的, 也能接着来
  const startBtn = text
    ? h('a', { class: 'btn primary', href }, `开始今天的: ${text}`)
    : held
      ? h('a', { class: 'btn', href, title: `超过了每天最多复习 ${store.reviewCap} 张的上限` }, `复习够了, 还有 ${held} 张 · 接着复习`)
      : null;
  // 卡片集在定了计划的文件夹里: 新词从文件夹一起出, 这里就不单独定了
  const viaFolder = !set.virtual && !info.on ? store.foldersOf(set.id).find((f) => f.plan?.on) : null;
  if (viaFolder) {
    return h(
      'section',
      { class: 'plan-panel' },
      h(
        'div',
        { class: 'plan-text' },
        h('strong', {}, '📅 每天背新词'),
        h('div', { class: 'muted small' }, `跟着文件夹「${viaFolder.name || '未命名文件夹'}」的计划: 新词从文件夹里按顺序一起出。`),
      ),
      h(
        'div',
        { class: 'row' },
        h('a', { class: 'btn', href: `#/folder/${encodeURIComponent(viaFolder.id)}` }, '去文件夹'),
        startBtn,
      ),
    );
  }
  return h(
    'section',
    { class: `plan-panel${info.on ? ' on' : ''}` },
    h(
      'div',
      { class: 'plan-text' },
      h('strong', {}, info.on ? '📅 每天背新词' : '📅 每天背多少?'),
      h(
        'div',
        { class: 'muted small' },
        info.on
          ? planLine(info, plan)
          : info.left
            ? `还有 ${num(info.left)} 张没背过。定个计划, 每天给你几个新词, 跟到日子的复习一起出, 不用一下背完。${set.virtual ? '新词照文件夹里卡片集的顺序, 一个背完再下一个。' : ''}`
            : '卡片都背过了, 按复习的日子来就行。',
      ),
    ),
    h(
      'div',
      { class: 'row' },
      info.on || info.left ? h('button', { class: 'btn', onclick: () => openPlanDialog({ store, set, onSaved: redraw }) }, info.on ? '改计划' : '定计划') : null,
      startBtn ?? (info.on ? h('span', { class: 'done-chip' }, '今天的背完了 ✓') : null),
    ),
  );
}

function chips(options, value, onpick) {
  const btns = options.map(([key, label]) =>
    h('button', { class: `chip${key === value ? ' on' : ''}`, type: 'button', 'aria-pressed': String(key === value), onclick: () => pick(key) }, label),
  );
  function pick(key) {
    btns.forEach((b, i) => {
      b.classList.toggle('on', options[i][0] === key);
      b.setAttribute('aria-pressed', String(options[i][0] === key));
    });
    onpick(key);
  }
  return h('div', { class: 'chips', role: 'group' }, btns);
}

// 框里的整数 (空着、乱填的用 fallback)
const intOf = (el, lo, hi, fallback) => {
  const n = Math.round(Number(el.value));
  return el.value.trim() === '' || !Number.isFinite(n) ? fallback : Math.min(hi, Math.max(lo, n));
};

// 在框里按回车 = 点保存
const enterTo = (save) => (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    save();
  }
};

// 定计划: 每天固定几个, 或者按考试日期算; 新词的顺序
export function openPlanDialog({ store, set, onSaved }) {
  const plan = planOf(set);
  let mode = plan.exam ? 'exam' : 'fixed';
  let order = plan.order;
  let seed = plan.seed || newSeed();
  const perDayEl = h('input', { class: 'input count', type: 'number', min: 1, max: MAX_PER_DAY, value: plan.perDay, inputmode: 'numeric', 'aria-label': '每天几个新词', oninput: () => preview(), onkeydown: enterTo(() => save()) });
  const examEl = h('input', { class: 'input count wide', type: 'date', value: plan.exam, min: today(), 'aria-label': '考试日期', oninput: () => preview(), onkeydown: enterTo(() => save()) });
  const restEl = h('input', { class: 'input count', type: 'number', min: 0, max: MAX_REST, value: plan.rest, inputmode: 'numeric', 'aria-label': '考前几天只复习', oninput: () => preview(), onkeydown: enterTo(() => save()) });
  const fixedBox = h('div', { class: 'plan-field' }, h('label', {}, '每天 ', perDayEl, ' 个新词'));
  const examBox = h(
    'div',
    { class: 'plan-field' },
    h('label', {}, '考试日期 ', examEl),
    h('label', {}, '考前 ', restEl, ' 天只复习, 不学新词'),
    h('p', { class: 'muted small' }, '按还剩多少个没背过、离考试几天, 自动算每天学几个 (每天重算一次)。考试过了以后, 按「每天固定几个」那边的个数。'),
  );
  const shuffleBtn = h('button', { class: 'btn small', type: 'button', onclick: () => ((seed = newSeed()), toast('重新打乱了'), preview()) }, '重新打乱');
  const previewEl = h('p', { class: 'plan-preview' });

  const draft = () =>
    cleanPlan({ on: true, perDay: intOf(perDayEl, 1, MAX_PER_DAY, plan.perDay), exam: mode === 'exam' ? examEl.value : '', rest: intOf(restEl, 0, MAX_REST, plan.rest), order, seed });

  function preview() {
    fixedBox.hidden = mode === 'exam';
    examBox.hidden = mode !== 'exam';
    shuffleBtn.hidden = order !== 'random';
    const p = draft();
    const info = newToday({ ...set, plan: p });
    const lines = [];
    if (mode === 'exam' && !p.exam) lines.push('选一下考试日期。');
    else if (!info.left) lines.push('卡片都背过了, 没有新词要学。');
    else if (info.mode === 'passed') lines.push('考试日期已经过了。');
    else if (info.mode === 'rest') lines.push(`离考试只有 ${info.daysLeft} 天了: 不学新词, 只复习。`);
    else {
      const head = info.mode === 'exam' ? `离考试 ${info.daysLeft} 天: 每天 ${info.perDay} 个新词` : `每天 ${info.perDay} 个新词`;
      lines.push(`${head}, 还有 ${num(info.left)} 个没背过, ${dateText(info.finish)} 学完${info.mode === 'exam' && p.rest ? `, 最后 ${p.rest} 天只复习` : ''}。`);
      if (info.perDay >= 60) lines.push('一天新词太多, 以后每天要复习的也会跟着多 (新词头几天、头几周都要再见几次), 量力而行。');
    }
    fill(previewEl, ...lines.map((t) => h('span', {}, t)));
  }

  function save() {
    const p = draft();
    if (mode === 'exam' && !p.exam) return toast('选一下考试日期');
    if (mode === 'exam' && examTime(p.exam) < examTime(today())) return toast('考试日期已经过了');
    store.setPlan(set.id, p);
    d.close();
    toast(plan.on ? '计划改好了' : '定好了, 今天的复习里就有新词了');
    onSaved?.();
  }

  const d = openDialog({
    title: '每天背新词',
    body: [
      h('p', { class: 'muted small' }, `「${set.title || '未命名卡片集'}」还有 ${num(newToday(set).left)} 张没背过。每天给你几个新词, 跟到日子的复习一起出 (今天的复习); 在单词卡里翻过、说了会不会的也算学过。`),
      h('div', { class: 'ask-label' }, '每天几个'),
      chips(
        [
          ['fixed', '每天固定几个'],
          ['exam', '按考试日期算'],
        ],
        mode,
        (m) => ((mode = m), preview()),
      ),
      fixedBox,
      examBox,
      h('div', { class: 'ask-label' }, '新词的顺序'),
      h(
        'div',
        { class: 'row' },
        chips(
          [
            ['set', set.virtual ? '按文件夹里的顺序' : '按卡片集里的顺序'],
            ['random', '随机'],
          ],
          order,
          (o) => ((order = o), preview()),
        ),
        shuffleBtn,
      ),
      previewEl,
    ],
    footer: [
      plan.on
        ? h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                store.setPlan(set.id, { on: false });
                d.close();
                toast('不按计划背了 (到日子的复习照常)');
                onSaved?.();
              },
            },
            '停用计划',
          )
        : null,
      h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
      h('button', { class: 'btn primary', onclick: save }, plan.on ? '保存' : '开始按计划背'),
    ],
  });
  preview();
  return d;
}

// 想记住的把握 (Anki 的 desired retention): 到该复习那天还记得的把握, 越高复习得越勤
export function openRetentionDialog({ store, onSaved }) {
  let value = store.retention;
  const input = h('input', {
    class: 'retention-range',
    type: 'range',
    min: MIN_RETENTION * 100,
    max: MAX_RETENTION * 100,
    step: 1,
    value: Math.round(value * 100),
    'aria-label': '想记住的把握',
    oninput: () => {
      value = cleanRetention(Number(input.value) / 100);
      preview();
    },
  });
  const shown = h('strong', { class: 'retention-value' });
  const previewEl = h('p', { class: 'plan-preview' });
  const presets = [
    [0.85, '85% 省时间'],
    [0.9, '90% 默认'],
    [0.95, '95% 考前'],
  ];
  const presetBtns = presets.map(([r, label]) =>
    h('button', { class: 'chip', type: 'button', onclick: () => ((value = r), (input.value = String(r * 100)), preview()) }, label),
  );
  function preview() {
    shown.textContent = percent(value);
    presetBtns.forEach((b, i) => b.classList.toggle('on', presets[i][0] === value));
    const ratio = intervalRatio(value);
    const ten = Math.max(1, Math.round(10 * ratio));
    const lines = [
      value === DEFAULT_RETENTION
        ? '到该复习那天, 大约九成还记得 (FSRS、Anki 默认的)。'
        : `隔的日子大约是 90% 时的 ${ratio.toFixed(ratio < 1 ? 2 : 1)} 倍: 现在隔 10 天的, 以后隔 ${ten} 天。${ratio < 1 ? '复习得更勤, 每天要复习的多一些。' : '每天要复习的少一些。'}`,
      `到该复习那天, 大约 ${percent(1 - value)} 想不起来 (要重新记)。`,
    ];
    if (value >= 0.95) lines.push('太高了每天要复习的会多很多 (把握从 95% 再往上, 多出来的复习越来越不划算), 考前一阵子用用就好。');
    if (value <= 0.8) lines.push('太低了忘得多, 忘了要重新记, 反而费时间。Anki 建议 85%–95%。');
    fill(previewEl, ...lines.map((t) => h('span', {}, t)));
  }
  const save = () => {
    store.setRetention(value);
    d.close();
    toast(`想记住的把握: ${percent(store.retention)} (下次复习起按这个排)`);
    onSaved?.();
  };
  const d = openDialog({
    title: '想记住的把握',
    body: [
      h('p', { class: 'muted small' }, 'FSRS 按这个算隔几天再复习: 隔到「还有这么大把握记得」的那天。调高复习得勤、记得牢; 调低每天背得少, 但忘得多。所有卡片集一起算, 已经排好的日子不动, 下次复习起按新的排。'),
      h('div', { class: 'retention-row' }, input, shown),
      h('div', { class: 'chips', role: 'group' }, presetBtns),
      previewEl,
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
      h('button', { class: 'btn primary', onclick: save }, '保存'),
    ],
  });
  preview();
  return d;
}

// 每天最多复习几张 (所有卡片集一起算)
export function openCapDialog({ store, onSaved }) {
  const save = () => {
    store.setReviewCap(intOf(input, 1, MAX_REVIEW_CAP, store.reviewCap));
    d.close();
    toast(`每天最多复习 ${store.reviewCap} 张`);
    onSaved?.();
  };
  const input = h('input', { class: 'input count', type: 'number', min: 1, max: MAX_REVIEW_CAP, value: store.reviewCap, inputmode: 'numeric', 'aria-label': '每天最多复习几张', onkeydown: enterTo(save) });
  const d = openDialog({
    title: '每天最多复习几张',
    body: [
      h('label', { class: 'plan-field' }, '每天最多复习 ', input, ' 张'),
      h('p', { class: 'muted small' }, '到日子的太多时 (比如很久没背了、刚导入 Anki 的卡组), 先来最可能忘的, 剩下的明天再来。今天看过、忘了又到时候的不算; 每天的新词另外算 (在卡片集里定)。'),
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
      h('button', { class: 'btn primary', onclick: save }, '保存'),
    ],
  });
  input.select();
  return d;
}
