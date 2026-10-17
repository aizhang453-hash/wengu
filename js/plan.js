// 每天的计划: 卡片集太大, 不可能一下背完, 所以每个卡片集自己定每天学几个新词 (还没背过的卡片),
// 或者填考试日期, 自动算每天几个、考前留几天只复习。今天的复习 = 到日子的卡片 + 各卡片集今天的新词。
//   set.plan = { on, perDay, exam: 'YYYY-MM-DD' 或 '', rest: 考前几天只复习, order: 'set' 按卡片集里的顺序 | 'random', seed, at }
//   (没定过计划是 null; at 是改计划的时间, 同步时听后改的)
// 文件夹也能定计划 (像 Anki 在大牌组上定每天几个): 新词照文件夹里卡片集的顺序一个一个出 (folder.plan, 用合起来的卡片集算)。
// 复习也有上限 (每天最多几张, 所有卡片集一起算), 太多时先来最可能忘的; 今天看过、忘了又到时候的不算上限。
// 新词算「今天学的」: 第一次翻卡自评在今天 (stats.first), 在单词卡里翻的也算。

import { DAY, startOfDay, retrievability, isDue } from './srs.js';

export const DEFAULT_PER_DAY = 20;
export const MAX_PER_DAY = 500;
export const DEFAULT_REST = 3;
export const MAX_REST = 30;
export const DEFAULT_REVIEW_CAP = 200;
export const MAX_REVIEW_CAP = 9999;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export const newSeed = () => Math.random().toString(36).slice(2, 10);

export function cleanPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return {
    on: Boolean(raw.on),
    perDay: int(raw.perDay, 1, MAX_PER_DAY, DEFAULT_PER_DAY),
    exam: typeof raw.exam === 'string' && DATE.test(raw.exam) ? raw.exam : '',
    rest: int(raw.rest, 0, MAX_REST, DEFAULT_REST),
    order: raw.order === 'random' ? 'random' : 'set',
    seed: typeof raw.seed === 'string' ? raw.seed.slice(0, 20) : '',
    at: Number(raw.at) > 0 ? Number(raw.at) : 0,
  };
}

// 没定过的按默认的
export function planOf(set) {
  return set?.plan ?? cleanPlan({ perDay: DEFAULT_PER_DAY });
}

// 还没背过 (没用 FSRS 排过) 的就是新词
export const isNew = (stat) => !(Number(stat?.due) > 0);

// 「打乱」也要每次一样 (今天给的新词不能一刷新就变), 所以按种子和卡片 id 算一个数排
function hash(text) {
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619);
  return x >>> 0;
}

// 还没背过的卡片, 照计划的顺序
export function newCards(set) {
  const stats = set.stats; // 文件夹合起来的每次读都要现算, 只读一次
  const list = set.cards.filter((c) => isNew(stats[c.id]));
  const plan = planOf(set);
  if (plan.order !== 'random') return list;
  const key = new Map(list.map((c) => [c.id, hash(plan.seed + c.id)]));
  return list.sort((a, b) => key.get(a.id) - key.get(b.id));
}

// 考试那天 0 点
export function examTime(exam) {
  if (!DATE.test(exam ?? '')) return 0;
  const [y, m, d] = exam.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

// 这个卡片集今天学几个新词:
// { on, mode: 'fixed' 每天固定几个 | 'exam' 按考试算 | 'rest' 考前只复习 | 'passed' 考试过了 (按固定的),
//   perDay 今天该学几个, learned 今天已经学了几个, today 今天还剩几个, left 还没背过的一共几个,
//   daysLeft 离考试几天, finish 照这样哪天学完 (那天中午的时间; 学完了或者不学了是 0) }
export function newToday(set, now = Date.now()) {
  const plan = planOf(set);
  const today0 = startOfDay(now);
  let left = 0;
  let learned = 0;
  const stats = set.stats;
  for (const card of set.cards) {
    const stat = stats[card.id];
    if (isNew(stat)) left++;
    else if (stat.first >= today0) learned++;
  }
  let mode = 'fixed';
  let perDay = plan.perDay;
  let daysLeft = null;
  if (plan.exam) {
    daysLeft = Math.round((examTime(plan.exam) - today0) / DAY);
    if (daysLeft < 0) mode = 'passed';
    else if (daysLeft - plan.rest <= 0) {
      mode = 'rest';
      perDay = 0;
    } else {
      mode = 'exam';
      // 今天学了的也算在内, 不然学一个、每天该学的就变一下
      perDay = Math.max(1, Math.ceil((left + learned) / (daysLeft - plan.rest)));
    }
  }
  const today = plan.on && set.kind !== 'quiz' ? Math.max(0, Math.min(left, perDay - learned)) : 0;
  const after = left - today; // 今天学完还剩几个
  const finish = !left || !perDay ? 0 : today0 + (after ? Math.ceil(after / perDay) : 0) * DAY + DAY / 2;
  return { on: plan.on && set.kind !== 'quiz', mode, perDay, learned, today, left, daysLeft, finish };
}

// 今天复习了几张 (不算今天才学的新词), 所有卡片集一起算上限用
export function reviewedToday(sets, now = Date.now()) {
  const today0 = startOfDay(now);
  let n = 0;
  for (const set of sets) {
    for (const stat of Object.values(set.stats)) {
      if (stat.at >= today0 && !(stat.first >= today0) && Number(stat.due) > 0) n++;
    }
  }
  return n;
}

// 今天要背的: { reviews: [{ set, card }], fresh: [{ set, card, fresh: true }], held: 超过上限、明天再来的几张 }
//   cap 每天最多复习几张; reviewed 今天已经复习了几张 (所有卡片集的);
//   groups 定了计划的文件夹 (合起来的卡片集), 它们的新词也要, 卡片记在 sets 里原来的卡片集上
export function todayQueue(sets, { now = Date.now(), cap = DEFAULT_REVIEW_CAP, reviewed = 0, groups = [] } = {}) {
  const today0 = startOfDay(now);
  const again = []; // 今天看过、忘了, 十分钟后又到时候的: 不算上限
  const due = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (!isDue(stat, now)) continue;
      if (stat.at >= today0) again.push({ set, card });
      else due.push({ set, card, r: retrievability(stat, now) });
    }
  }
  due.sort((a, b) => a.r - b.r); // 最可能忘的先来
  const room = Math.max(0, cap - reviewed);
  const fresh = [];
  const seen = new Set(); // 卡片集和它所在的文件夹都定了计划的, 同一张只出一次
  const owner = groups.length ? new Map(sets.flatMap((set) => set.cards.map((c) => [c.id, set]))) : null;
  for (const set of [...sets, ...groups]) {
    const { today } = newToday(set, now);
    if (!today) continue;
    for (const card of newCards(set).slice(0, today)) {
      const home = set.virtual ? owner.get(card.id) : set;
      if (!home || seen.has(card.id)) continue;
      seen.add(card.id);
      fresh.push({ set: home, card, fresh: true });
    }
  }
  return { reviews: [...again, ...due.slice(0, room)], fresh, held: Math.max(0, due.length - room) };
}

// 新词均匀插进复习里
export function mixIn(reviews, fresh) {
  const total = reviews.length + fresh.length;
  const at = new Set(fresh.map((_, k) => Math.floor(((k + 0.5) * total) / fresh.length)));
  const out = [];
  let r = 0;
  let f = 0;
  for (let i = 0; i < total; i++) out.push((at.has(i) && f < fresh.length) || r >= reviews.length ? fresh[f++] : reviews[r++]);
  return out;
}

// 有计划在背的卡片集
export function plannedSets(sets) {
  return sets.filter((s) => s.kind !== 'quiz' && s.plan?.on);
}
