// 复习记录: 每一次「翻卡自评」(看了题自己想, 翻过来自己说记不记得) 都记下来什么时候、记没记得。
// 只记这一种: 选择题能蒙、能靠选项认出来, 游戏、Wordle 也不是真的自己想起来的, 拿来给 FSRS 用不准。
// 现在排复习只看每张卡片的当前状态 (srs.js); 攒够了 (几百上千次) 以后, 拿这些记录给 FSRS 按自己的情况优化参数。
//   data.revlog = { 卡片 id: [记录, ...] }  (从早到晚)
// 一条记录压成一个数, 省地方 (也要同步、备份): 分钟数 × 4 + (评分 - 1)
//   评分照 FSRS / Anki: 1 忘了 (Again), 3 记得 (Good)。这里只有对 / 错, 所以只有 1 和 3

export const MAX_PER_ITEM = 200; // 一张卡片最多留最近 200 次 (优化参数够用了)
export const AGAIN = 1;
export const GOOD = 3;
const MINUTE = 60 * 1000;

export const encodeReview = (t, rating) => Math.floor(t / MINUTE) * 4 + (rating - 1);
export const decodeReview = (code) => ({ at: Math.floor(code / 4) * MINUTE, rating: (code % 4) + 1 });

const isCode = (x) => Number.isSafeInteger(x) && x > 0;
const tidy = (list) => [...new Set(list)].sort((a, b) => a - b).slice(-MAX_PER_ITEM);

// 记一次 (直接改 log)
export function addReview(log, key, t, correct) {
  log[key] = tidy([...(log[key] ?? []), encodeReview(t, correct ? GOOD : AGAIN)]);
}

// 撤销: 去掉最后一次
export function dropLastReview(log, key) {
  const list = log[key];
  if (!list?.length) return;
  list.pop();
  if (!list.length) delete log[key];
}

// 存着的、同步来的、备份里的: 只留像记录的
export function cleanLog(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, list] of Object.entries(raw)) {
    if (!key || key.length > 80 || !Array.isArray(list)) continue;
    const codes = tidy(list.filter(isCode));
    if (codes.length) out[key] = codes;
  }
  return out;
}

// 两台设备的合起来: 同一张卡片两边的记录都要 (同一分钟同一个评分只算一次)
export function mergeLogs(a = {}, b = {}) {
  const out = { ...a };
  for (const [key, list] of Object.entries(b)) out[key] = tidy([...(out[key] ?? []), ...list]);
  return out;
}

export function reviewCount(log) {
  return Object.values(log ?? {}).reduce((n, list) => n + list.length, 0);
}

// 一张卡片的记录, 从早到晚: [{ at, rating }] (以后给 FSRS 优化参数用)
export function historyOf(log, key) {
  return (log?.[key] ?? []).map(decodeReview);
}
