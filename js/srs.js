// 间隔重复 (按遗忘的规律排复习): 每张卡片记
//   interval  下次隔几天
//   ease      答对时间隔变长几倍 (越容易的卡片越大)
//   due       哪天该复习 (时间戳)
// 答对: 间隔 1 天 → 3 天 → 再乘 ease (一周多、一个月……); 答错: 10 分钟后再来, 而且变「难」一点。

export const DAY = 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function schedule(prev, correct, now = Date.now()) {
  const interval = Number(prev?.interval) || 0;
  const ease = Number(prev?.ease) || 2.5;
  if (!correct) {
    return { interval: 0, ease: Math.max(1.3, +(ease - 0.2).toFixed(2)), due: now + RETRY_MS };
  }
  const next = interval < 1 ? 1 : interval < 3 ? 3 : Math.round(interval * ease);
  // 到那天一早就算该复习了
  return { interval: next, ease: Math.min(3, +(ease + 0.05).toFixed(2)), due: startOfDay(now) + next * DAY };
}

export function isDue(stat, now = Date.now()) {
  return Boolean(stat?.due) && stat.due <= now;
}

// 所有该复习的卡片: [{ set, card, due }], 越早该复习的越前
export function dueCards(sets, now = Date.now()) {
  const out = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (isDue(stat, now)) out.push({ set, card, due: stat.due });
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

// 明天 (到明天晚上为止) 要复习几张, 不算今天已经该复习的
export function dueTomorrow(sets, now = Date.now()) {
  const end = startOfDay(now) + 2 * DAY;
  let n = 0;
  for (const set of sets) {
    for (const card of set.cards) {
      const due = set.stats[card.id]?.due;
      if (due && due > now && due < end) n++;
    }
  }
  return n;
}

// ---- 连续打卡 ----

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 连续学了几天: 从今天 (今天还没学就从昨天) 往前数
export function streak(activity, now = Date.now()) {
  let t = startOfDay(now);
  if (!activity[dayKey(t)]) t -= DAY;
  let n = 0;
  // (换夏令时那天一天不是 24 小时, 用中午算日子就不会错)
  while (activity[dayKey(t + DAY / 2)]) {
    n++;
    t -= DAY;
  }
  return n;
}

// 最近几天每天答了几题 (从早到晚)
export function lastDays(activity, days = 7, now = Date.now()) {
  const out = [];
  const today = startOfDay(now);
  for (let i = days - 1; i >= 0; i--) {
    const t = today - i * DAY + DAY / 2;
    out.push({ key: dayKey(t), count: activity[dayKey(t)] ?? 0, date: new Date(t) });
  }
  return out;
}
