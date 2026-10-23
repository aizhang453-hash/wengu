// 游戏厅: 学累了玩一会儿的正经游戏 (不是拿卡片集玩的那种)。现在有弹珠台「星际远航」。
// 成绩: data.arcade = { pinball: { top: [{ score, at }] 最高的 5 次, progress }, 'pinball-classic': { top } }; 同步、备份时两边的合起来
//   progress: 养成的进度 { xp: { 队员: 经验 }, bosses: 一共渡过几场危机, landings: 着陆几次 }, 两边的取大的

export const ARCADE = [{ key: 'pinball', name: '星际远航 · 弹珠台', hint: '3D 太空弹珠台: 带殖民方舟穿过四个星系找新家园, 做任务、打危机, 队员会升级', href: '#/arcade/pinball' }];
// 游戏厅里不单独列、也要记成绩的: 弹珠台的经典模式 (没有队员加成, 排行榜分开)
const KEYS = new Set([...ARCADE.map((g) => g.key), 'pinball-classic']);
const ID = /^[a-z][a-z0-9-]{0,23}$/;
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

const count = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 0);

export function cleanProgress(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const xp = {};
  for (const [id, n] of Object.entries(raw.xp && typeof raw.xp === 'object' ? raw.xp : {})) if (ID.test(id) && count(n)) xp[id] = count(n);
  const out = { xp, bosses: count(raw.bosses), landings: count(raw.landings) };
  return Object.keys(xp).length || out.bosses || out.landings ? out : null;
}

export function mergeProgress(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const xp = { ...a.xp };
  for (const [id, n] of Object.entries(b.xp)) xp[id] = Math.max(xp[id] ?? 0, n);
  return { xp, bosses: Math.max(a.bosses, b.bosses), landings: Math.max(a.landings, b.landings) };
}

export function cleanArcade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, x] of Object.entries(raw)) {
    if (!KEYS.has(key) || !x || typeof x !== 'object') continue;
    const top = (Array.isArray(x.top) ? x.top : []).filter((r) => Number(r?.score) > 0 && Number(r?.at) > 0).map((r) => ({ score: Math.floor(Number(r.score)), at: Number(r.at) }));
    const progress = cleanProgress(x.progress);
    if (top.length || progress) out[key] = { top: tidyTop(top), ...(progress ? { progress } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

export function mergeArcade(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const progress = mergeProgress(a[key]?.progress ?? null, b[key]?.progress ?? null);
    out[key] = { top: tidyTop([...(a[key]?.top ?? []), ...(b[key]?.top ?? [])]), ...(progress ? { progress } : {}) };
  }
  return out;
}

export const progressOf = (arcade, key) => arcade?.[key]?.progress ?? { xp: {}, bosses: 0, landings: 0 };

export const bestOf = (arcade, key) => arcade?.[key]?.top[0]?.score ?? 0;

// 记一局: 返回 { arcade 新的, rank 排第几 (前 5 以外是 0), best 破纪录了没有 }; progress: 这局以后的养成进度 (跟原来的取大的)
export function addScore(arcade, key, score, at = Date.now(), progress = null) {
  if (progress) arcade = mergeArcade(arcade, { [key]: { top: [], progress: cleanProgress(progress) } });
  if (!(score > 0)) return { arcade, rank: 0, best: false };
  const old = bestOf(arcade, key);
  const next = mergeArcade(arcade, { [key]: { top: [{ score: Math.floor(score), at }] } });
  const rank = next[key].top.findIndex((r) => r.at === at && r.score === Math.floor(score)) + 1;
  return { arcade: next, rank, best: score > old };
}
