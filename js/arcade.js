// 游戏厅: 学累了玩一会儿的正经游戏 (不是拿卡片集玩的那种)。现在有弹珠台。
// 成绩: data.arcade = { pinball: { top: [{ score, at }] 最高的 5 次 } }; 同步、备份时两边的合起来

export const ARCADE = [{ key: 'pinball', name: '弹珠台', hint: '三个球, 打亮「温故而知新」', href: '#/arcade/pinball' }];
const KEYS = new Set(ARCADE.map((g) => g.key));
export const TOP_N = 5;

function tidyTop(list) {
  const seen = new Set();
  return list
    .filter((r) => {
      const key = `${r.score}:${r.at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, TOP_N);
}

export function cleanArcade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, x] of Object.entries(raw)) {
    if (!KEYS.has(key) || !x || typeof x !== 'object') continue;
    const top = (Array.isArray(x.top) ? x.top : []).filter((r) => Number(r?.score) > 0 && Number(r?.at) > 0).map((r) => ({ score: Math.floor(Number(r.score)), at: Number(r.at) }));
    if (top.length) out[key] = { top: tidyTop(top) };
  }
  return Object.keys(out).length ? out : null;
}

export function mergeArcade(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) out[key] = { top: tidyTop([...(a[key]?.top ?? []), ...(b[key]?.top ?? [])]) };
  return out;
}

export const bestOf = (arcade, key) => arcade?.[key]?.top[0]?.score ?? 0;

// 记一局: 返回 { arcade 新的, rank 排第几 (前 5 以外是 0), best 破纪录了没有 }
export function addScore(arcade, key, score, at = Date.now()) {
  if (!(score > 0)) return { arcade, rank: 0, best: false };
  const old = bestOf(arcade, key);
  const next = mergeArcade(arcade, { [key]: { top: [{ score: Math.floor(score), at }] } });
  const rank = next[key].top.findIndex((r) => r.at === at && r.score === Math.floor(score)) + 1;
  return { arcade: next, rank, best: score > old };
}
