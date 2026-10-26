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

// 今天的: 「复习 34 · 新词 20」
export function todayText(reviews, fresh) {
  return [reviews ? `复习 ${num(reviews)}` : '', fresh ? `新词 ${num(fresh)}` : ''].filter(Boolean).join(' · ');
}

// 一句话说计划走到哪了 (info 是 newToday 算的): 「每日 15 个 · 今日 3/15 · 剩余 1,467 个 · 距考试 131 天」
export function planLine(info, plan) {
  if (!info.left) return info.learned ? `今日已学 ${info.learned} 个新词，新词已全部学完` : '新词已全部学完';
  const parts = [];
  if (info.mode === 'rest') {
    parts.push(info.daysLeft === 0 ? '今日考试，暂停新词' : `距考试 ${info.daysLeft} 天，仅复习`);
    parts.push(`剩余 ${num(info.left)} 个`);
    return parts.join(' · ');
  }
  parts.push(`每日 ${info.perDay} 个`);
  parts.push(`今日 ${info.learned}/${info.learned + info.today}`);
  parts.push(`剩余 ${num(info.left)} 个`);
  if (info.mode === 'exam') parts.push(`距考试 ${info.daysLeft} 天`);
  else if (info.finish) parts.push(`预计${dateText(info.finish)}学完`);
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
    ? h('a', { class: 'btn primary', href }, `开始学习 · ${text}`)
    : held
      ? h('a', { class: 'btn', href, title: `已达每日复习上限 ${store.reviewCap} 张` }, `继续复习 · 剩余 ${held}`)
      : null;
  // 卡片集在定了计划的文件夹里: 新词从文件夹一起出, 这里就不单独定了
  const viaFolder = !set.virtual && !info.on ? store.foldersOf(set.id).find((f) => f.plan?.on) : null;
  if (viaFolder) {
    return h(
      'section',
      { class: 'plan-panel' },
      h('div', { class: 'plan-text' }, h('strong', {}, '每日新词'), h('div', { class: 'plan-desc' }, `按文件夹「${viaFolder.name || '未命名文件夹'}」的计划安排`)),
      h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/folder/${encodeURIComponent(viaFolder.id)}` }, '查看文件夹'), startBtn),
    );
  }
  return h(
    'section',
    { class: `plan-panel${info.on ? ' on' : ''}` },
    h(
      'div',
      { class: 'plan-text' },
      h('strong', {}, '每日新词'),
      h('div', { class: 'plan-desc' }, info.on ? planLine(info, plan) : info.left ? `尚有 ${num(info.left)} 张未学。设置计划后，每天按量安排新词。` : '全部卡片均已学习。'),
    ),
    h(
      'div',
      { class: 'row' },
      info.on || info.left ? h('button', { class: 'btn', type: 'button', onclick: () => openPlanDialog({ store, set, onSaved: redraw }) }, info.on ? '调整计划' : '设置计划') : null,
      startBtn ?? (info.on ? h('span', { class: 'done-chip' }, '今日已完成') : null),
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
  const perDayEl = h('input', { class: 'input count', type: 'number', min: 1, max: MAX_PER_DAY, value: plan.perDay, inputmode: 'numeric', 'aria-label': '每日新词数', oninput: () => preview(), onkeydown: enterTo(() => save()) });
  const examEl = h('input', { class: 'input count wide', type: 'date', value: plan.exam, min: today(), 'aria-label': '考试日期', oninput: () => preview(), onkeydown: enterTo(() => save()) });
  const restEl = h('input', { class: 'input count', type: 'number', min: 0, max: MAX_REST, value: plan.rest, inputmode: 'numeric', 'aria-label': '考前仅复习天数', oninput: () => preview(), onkeydown: enterTo(() => save()) });
  const fixedBox = h('div', { class: 'plan-field' }, h('label', {}, '每日 ', perDayEl, ' 个新词'));
  const examBox = h(
    'div',
    { class: 'plan-field' },
    h('label', {}, '考试日期 ', examEl),
    h('label', {}, '考前 ', restEl, ' 天仅复习'),
    h('p', { class: 'muted small' }, '根据剩余新词数和距考试天数，每天自动计算新词数量。考试结束后，按固定数量安排。'),
  );
  const shuffleBtn = h('button', { class: 'btn small', type: 'button', onclick: () => ((seed = newSeed()), toast('已重新打乱'), preview()) }, '重新打乱');
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
    if (mode === 'exam' && !p.exam) lines.push('请选择考试日期。');
    else if (!info.left) lines.push('全部卡片均已学习，没有新词。');
    else if (info.mode === 'passed') lines.push('考试日期已过。');
    else if (info.mode === 'rest') lines.push(`距考试 ${info.daysLeft} 天，进入复习阶段，不再安排新词。`);
    else {
      const head = info.mode === 'exam' ? `距考试 ${info.daysLeft} 天，每日 ${info.perDay} 个新词` : `每日 ${info.perDay} 个新词`;
      lines.push(`${head}，剩余 ${num(info.left)} 个，预计${dateText(info.finish)}学完${info.mode === 'exam' && p.rest ? `，最后 ${p.rest} 天仅复习` : ''}。`);
      if (info.perDay >= 60) lines.push('每日新词较多，之后的复习量也会相应增加。');
    }
    fill(previewEl, ...lines.map((t) => h('span', {}, t)));
  }

  function save() {
    const p = draft();
    if (mode === 'exam' && !p.exam) return toast('请选择考试日期');
    if (mode === 'exam' && examTime(p.exam) < examTime(today())) return toast('考试日期已过');
    store.setPlan(set.id, p);
    d.close();
    toast(plan.on ? '计划已更新' : '计划已设置，新词将出现在今日复习中');
    onSaved?.();
  }

  const d = openDialog({
    title: '每日新词计划',
    body: [
      h('p', { class: 'muted small' }, `「${set.title || '未命名卡片集'}」尚有 ${num(newToday(set).left)} 张未学。新词与到期复习一起出现在今日复习中。`),
      h('div', { class: 'ask-label' }, '每日数量'),
      chips(
        [
          ['fixed', '固定数量'],
          ['exam', '按考试日期计算'],
        ],
        mode,
        (m) => ((mode = m), preview()),
      ),
      fixedBox,
      examBox,
      h('div', { class: 'ask-label' }, '新词顺序'),
      h(
        'div',
        { class: 'row' },
        chips(
          [
            ['set', set.virtual ? '按文件夹顺序' : '按卡片集顺序'],
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
                toast('已停用计划，到期复习不受影响');
                onSaved?.();
              },
            },
            '停用计划',
          )
        : null,
      h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
      h('button', { class: 'btn primary', onclick: save }, plan.on ? '保存' : '开始计划'),
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
    'aria-label': '目标记忆率',
    oninput: () => {
      value = cleanRetention(Number(input.value) / 100);
      preview();
    },
  });
  const shown = h('strong', { class: 'retention-value' });
  const previewEl = h('p', { class: 'plan-preview' });
  const presets = [
    [0.85, '85% 节省时间'],
    [0.9, '90% 默认'],
    [0.95, '95% 考前冲刺'],
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
        ? '复习时约有九成仍记得（默认）。'
        : `复习间隔约为默认的 ${ratio.toFixed(ratio < 1 ? 2 : 1)} 倍：原本间隔 10 天的，将间隔 ${ten} 天。${ratio < 1 ? '复习更频繁，每日复习量增加。' : '每日复习量减少。'}`,
      `复习时约有 ${percent(1 - value)} 需要重新记忆。`,
    ];
    if (value >= 0.95) lines.push('设置过高会大幅增加复习量，建议仅在考前使用。');
    if (value <= 0.8) lines.push('设置过低会导致遗忘增多，建议在 85%–95% 之间。');
    fill(previewEl, ...lines.map((t) => h('span', {}, t)));
  }
  const save = () => {
    store.setRetention(value);
    d.close();
    toast(`目标记忆率已设为 ${percent(store.retention)}`);
    onSaved?.();
  };
  const d = openDialog({
    title: '目标记忆率',
    body: [
      h('p', { class: 'muted small' }, 'FSRS 据此计算复习间隔。调高则复习更频繁、记得更牢；调低则复习量减少、遗忘增多。对全部卡片集生效，已安排的复习日期不变。'),
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
    toast(`每日复习上限已设为 ${store.reviewCap} 张`);
    onSaved?.();
  };
  const input = h('input', { class: 'input count', type: 'number', min: 1, max: MAX_REVIEW_CAP, value: store.reviewCap, inputmode: 'numeric', 'aria-label': '每日复习上限', onkeydown: enterTo(save) });
  const d = openDialog({
    title: '每日复习上限',
    body: [
      h('label', { class: 'plan-field' }, '每日最多复习 ', input, ' 张'),
      h('p', { class: 'muted small' }, '到期卡片超出上限时，优先安排最易遗忘的，其余顺延。今日已复习后再次到期的不计入；新词数量在卡片集中单独设置。'),
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => d.close() }, '取消'),
      h('button', { class: 'btn primary', onclick: save }, '保存'),
    ],
  });
  input.select();
  return d;
}
