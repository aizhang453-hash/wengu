// 自定义学习 (像 Anki 的 Custom Study): 今天的做完了还想背, 或者考前想多练。
//   more 再学几个新词 | nocap 接着复习超过上限的 (这两个在 views/review.js 里算)
//   ahead 提前复习: 还没到日子的里面最可能忘的先来, 照常排下次 (FSRS 会算上提前了几天)
//   forgot 今天忘了的再过一遍 | leech 难记卡 | starred 星标的: 这三个是练习, 只算答对答错, 不动复习的日子
// 都是 [{ set, card }], 卡片记在原来的卡片集上; 暂停了的不要

import { isSuspended, isBuried, retrievability, startOfDay, LEECH } from './srs.js';
import { historyOf, AGAIN } from './revlog.js';

export const CUSTOM = {
  more: '加学新词',
  nocap: '继续复习（超出上限部分）',
  ahead: '提前复习',
  forgot: '重练今日遗忘',
  leech: '练习难记卡片',
  starred: '练习星标卡片',
};

// 练习: 不动复习的日子
export const PRACTICE = new Set(['forgot', 'leech', 'starred']);

function each(sets, pick) {
  const out = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const stat = set.stats[card.id];
      if (isSuspended(stat)) continue;
      const v = pick(stat, card, set);
      if (v !== undefined && v !== false) out.push({ set, card, v });
    }
  }
  return out;
}

// 还没到日子的 (今天以后才该复习的), 现在记得的把握越低越前
export function aheadCards(sets, now = Date.now()) {
  return each(sets, (stat) => Number(stat?.due) > now && stat.interval >= 1 && !isBuried(stat, now) && retrievability(stat, now))
    .sort((a, b) => a.v - b.v)
    .map(({ set, card }) => ({ set, card }));
}

// 今天翻卡自评时忘了 (点了不会 / 忘了) 的, 先忘的先来
export function forgotToday(sets, log, now = Date.now()) {
  const today0 = startOfDay(now);
  return each(sets, (stat, card) => {
    const first = historyOf(log, card.id).find((r) => r.at >= today0 && r.rating === AGAIN);
    return first ? first.at : undefined;
  })
    .sort((a, b) => a.v - b.v)
    .map(({ set, card }) => ({ set, card }));
}

// 难记卡: 忘了 8 次以上的, 忘得多的先来
export function leechCards(sets) {
  return each(sets, (stat) => stat?.lapses >= LEECH && stat.lapses)
    .sort((a, b) => b.v - a.v)
    .map(({ set, card }) => ({ set, card }));
}

export function starredCards(sets) {
  const starred = new Map(sets.map((s) => [s.id, new Set(s.starred)]));
  return each(sets, (_, card, set) => starred.get(set.id).has(card.id)).map(({ set, card }) => ({ set, card }));
}

export function customCards(kind, sets, log, now = Date.now()) {
  if (kind === 'ahead') return aheadCards(sets, now);
  if (kind === 'forgot') return forgotToday(sets, log, now);
  if (kind === 'leech') return leechCards(sets);
  if (kind === 'starred') return starredCards(sets);
  return [];
}
