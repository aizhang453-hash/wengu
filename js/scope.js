// 学习、测试用哪些卡片: 从 Anki 搬来的卡片集动不动上千张, 不可能一下全学、全考。
//   学习: next 接着学 N 个 (照计划的顺序, 还没背过、学习里还没掌握的) | today 今天的新词 | starred 星标的 | all 全部
//   测试: studied 背过的 | today 今天背的 | starred 星标的 | all 全部

import { inPlanOrder, isNew } from './plan.js';
import { startOfDay, isSuspended } from './srs.js';

export const DEFAULT_NEXT = 20;
export const BIG_SET = 50; // 比这多的卡片集, 学习默认「接着学 20 个」, 测试默认「背过的」

export const LEARN_SCOPES = {
  next: '接着学',
  today: '今天的新词',
  starred: '星标的',
  all: '全部',
};
export const TEST_SCOPES = {
  studied: '背过的',
  today: '今天背的',
  starred: '星标的',
  all: '全部',
};

export const defaultLearnScope = (set) => ({ kind: set.cards.length > BIG_SET ? 'next' : 'all', count: DEFAULT_NEXT });
export const defaultTestScope = (set) => (set.cards.length > BIG_SET ? 'studied' : 'all');

// 卡片: kind 见上面; count 「接着学」几个; fresh 今天复习里要出的新词 (plan 排的, [卡片])
export function scopeCards(set, kind, { count = DEFAULT_NEXT, fresh = [], now = Date.now() } = {}) {
  const stats = set.stats;
  const learn = set.learn;
  const today0 = startOfDay(now);
  switch (kind) {
    case 'next':
      // 还没背过 (没排进复习)、学习里也还没掌握的, 照顺序往下 (暂停的不要)
      return inPlanOrder(set, set.cards.filter((c) => isNew(stats[c.id]) && !isSuspended(stats[c.id]) && learn[c.id] !== 2)).slice(0, Math.max(1, count));
    case 'today': {
      // 今天开始背的新词、今天复习里要出的新词 (测试再加上今天复习过的)
      const ids = new Set(fresh.map((c) => c.id));
      return set.cards.filter((c) => ids.has(c.id) || stats[c.id]?.first >= today0);
    }
    case 'reviewed': {
      const ids = new Set(fresh.map((c) => c.id));
      return set.cards.filter((c) => ids.has(c.id) || stats[c.id]?.first >= today0 || stats[c.id]?.at >= today0);
    }
    case 'studied': {
      const known = new Set(set.known);
      return set.cards.filter((c) => Number(stats[c.id]?.due) > 0 || learn[c.id] >= 1 || known.has(c.id));
    }
    case 'starred': {
      const starred = new Set(set.starred);
      return set.cards.filter((c) => starred.has(c.id));
    }
    default:
      return set.cards;
  }
}

// 每种几张 (选的时候显示)
export function scopeSizes(set, kinds, opts = {}) {
  return Object.fromEntries(kinds.map((k) => [k, scopeCards(set, k === 'today' && opts.test ? 'reviewed' : k, opts).length]));
}
