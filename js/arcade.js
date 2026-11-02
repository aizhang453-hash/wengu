// 游戏厅: 学累了玩一会儿的正经游戏 (不是拿卡片集玩的那种)。现在有弹珠台「星际远航」和文字人生模拟「人生草稿」。
// 成绩: data.arcade = { pinball: { top: [{ score, at }] 最高的 5 次, progress }, 'pinball-classic': { top }, draft: { top, progress } }; 同步、备份时两边的合起来
//   弹珠台的 progress: 养成的进度 { xp: { 队员: 经验 }, bosses: 一共渡过几场危机, landings: 着陆几次 }, 两边的取大的
//   人生草稿的 progress: 批注 { runs 写完几稿, endings [见过的结局], marks [记号], notes { '路口:选项': { run, age, end, at } }, last { age, end, at },
//     heir 传给下一稿的性格 { key ('' 是没传), at } }
//     几稿取大的, 结局、记号合在一起, 批注、上一稿、传下去的性格各取后写的

export const ARCADE = [
  { key: 'pinball', name: '星际远航 · 弹珠台', hint: '3D 太空弹珠台: 带殖民方舟穿过四个星系找新家园, 做任务、打危机, 队员会升级', href: '#/arcade/pinball' },
  { key: 'draft', name: '人生草稿', hint: '人生没有草稿，这里有。挑出身、性格和心愿，一年一年过下去，路口自己选；每一稿的结局都会留下批注。', href: '#/arcade/draft' },
];
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

// ---- 人生草稿的批注 ----
const NAME = /^[a-z][a-z0-9-]{0,31}$/; // 结局、路口、选项的名字
const MARK = /^[a-z][a-z0-9:-]{0,47}$/; // 记号: 'm:bankrupt'、'wish:shop'
const NOTE = /^[a-z][a-z0-9-]{0,31}:[a-z][a-z0-9-]{0,31}$/;

export const emptyDraft = () => ({ runs: 0, endings: [], marks: [], notes: {}, last: null, heir: null });

function cleanRecord(r) {
  if (!r || typeof r !== 'object' || !(Number(r.at) > 0) || typeof r.end !== 'string' || !NAME.test(r.end)) return null;
  return { age: Math.min(count(r.age), 200), end: r.end, at: Number(r.at) };
}

export function cleanDraftProgress(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const names = (list, re) => [...new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && re.test(x)))].slice(0, 500);
  const notes = {};
  for (const [k, v] of Object.entries(raw.notes && typeof raw.notes === 'object' ? raw.notes : {})) {
    const r = NOTE.test(k) ? cleanRecord(v) : null;
    if (r) notes[k] = { run: count(v.run), ...r };
  }
  const h = raw.heir;
  const heir = h && typeof h === 'object' && Number(h.at) > 0 && typeof h.key === 'string' && (h.key === '' || NAME.test(h.key)) ? { key: h.key, at: Number(h.at) } : null;
  const out = { runs: count(raw.runs), endings: names(raw.endings, NAME), marks: names(raw.marks, MARK), notes, last: cleanRecord(raw.last), heir };
  return out.runs || out.endings.length || out.marks.length || Object.keys(notes).length || heir ? out : null;
}

export function mergeDraftProgress(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const notes = { ...a.notes };
  for (const [k, v] of Object.entries(b.notes)) if (!notes[k] || v.at > notes[k].at) notes[k] = v;
  const newer = (x, y) => (!x || (y && y.at > x.at) ? y : x) ?? null;
  return { runs: Math.max(a.runs, b.runs), endings: [...new Set([...a.endings, ...b.endings])], marks: [...new Set([...a.marks, ...b.marks])], notes, last: newer(a.last, b.last), heir: newer(a.heir, b.heir) };
}

// 各个游戏的 progress 怎么清、怎么合 (没写的按弹珠台的)
const PROGRESS = { draft: { clean: cleanDraftProgress, merge: mergeDraftProgress, empty: emptyDraft } };
const cleanerOf = (key) => PROGRESS[key]?.clean ?? cleanProgress;
const mergerOf = (key) => PROGRESS[key]?.merge ?? mergeProgress;

export function cleanArcade(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [key, x] of Object.entries(raw)) {
    if (!KEYS.has(key) || !x || typeof x !== 'object') continue;
    const top = (Array.isArray(x.top) ? x.top : []).filter((r) => Number(r?.score) > 0 && Number(r?.at) > 0).map((r) => ({ score: Math.floor(Number(r.score)), at: Number(r.at) }));
    const progress = cleanerOf(key)(x.progress);
    if (top.length || progress) out[key] = { top: tidyTop(top), ...(progress ? { progress } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

export function mergeArcade(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const progress = mergerOf(key)(a[key]?.progress ?? null, b[key]?.progress ?? null);
    out[key] = { top: tidyTop([...(a[key]?.top ?? []), ...(b[key]?.top ?? [])]), ...(progress ? { progress } : {}) };
  }
  return out;
}

export const progressOf = (arcade, key) => arcade?.[key]?.progress ?? PROGRESS[key]?.empty() ?? { xp: {}, bosses: 0, landings: 0 };

export const bestOf = (arcade, key) => arcade?.[key]?.top[0]?.score ?? 0;

// 记一局: 返回 { arcade 新的, rank 排第几 (前 5 以外是 0), best 破纪录了没有 }; progress: 这局以后的养成进度 (跟原来的取大的)
export function addScore(arcade, key, score, at = Date.now(), progress = null) {
  if (progress) arcade = mergeArcade(arcade, { [key]: { top: [], progress: cleanerOf(key)(progress) } });
  if (!(score > 0)) return { arcade, rank: 0, best: false };
  const old = bestOf(arcade, key);
  const next = mergeArcade(arcade, { [key]: { top: [{ score: Math.floor(score), at }] } });
  const rank = next[key].top.findIndex((r) => r.at === at && r.score === Math.floor(score)) + 1;
  return { arcade: next, rank, best: score > old };
}
