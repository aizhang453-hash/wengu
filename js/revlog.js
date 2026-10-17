// 复习记录: 每一次「翻卡自评」(看了题自己想, 翻过来自己说记不记得) 都记下来什么时候、记没记得;
// 从 Anki 搬来的复习记录也放这儿。选择题能蒙、能靠选项认出来, 游戏、Wordle 也不是真的自己想起来的, 不记。
// 排复习只看每张卡片的当前状态 (srs.js); 攒够了 (几百上千次) 以后, 拿这些记录给 FSRS 按自己的情况优化参数 (optimize.js)。
//   data.revlog = { 卡片 id: '一张卡片的记录 (压缩过的字)' }
// 一次复习是一个数: 分钟数 × 4 + (评分 - 1)。评分照 FSRS / Anki: 1 重来 (Again), 2 困难 (Hard), 3 良好 (Good), 4 简单 (Easy);
// 这里翻卡只有记得 / 忘了 (3 和 1), 从 Anki 搬来的四个都有。
// 一张卡片的记录从早到晚, 存成「第一个数, 跟上一个差多少, 差多少……」的 36 进制, 用 . 隔开 —— Anki 搬来的动不动几万次,
// 浏览器给的地方只有几 MB, 这样比直接存数字省一半。

export const MAX_PER_ITEM = 200; // 一张卡片最多留最近 200 次 (优化参数够用了)
export const AGAIN = 1;
export const GOOD = 3;
const MINUTE = 60 * 1000;

export const encodeReview = (t, rating) => Math.floor(t / MINUTE) * 4 + (rating - 1);
export const decodeReview = (code) => ({ at: Math.floor(code / 4) * MINUTE, rating: (code % 4) + 1 });

const isCode = (x) => Number.isSafeInteger(x) && x > 0;
const tidy = (list) => [...new Set(list.filter(isCode))].sort((a, b) => a - b).slice(-MAX_PER_ITEM);

// 一串数 ↔ 存着的字
export function pack(codes) {
  const list = tidy(codes);
  return list.map((c, i) => (i ? c - list[i - 1] : c).toString(36)).join('.');
}

export function unpack(text) {
  if (Array.isArray(text)) return tidy(text); // v1.17 存的是数字
  let sum = 0;
  return String(text ?? '')
    .split('.')
    .filter(Boolean)
    .map((part) => (sum += parseInt(part, 36)));
}

// 记一次 (直接改 log)
export function addReview(log, key, t, correct) {
  log[key] = pack([...unpack(log[key]), encodeReview(t, correct ? GOOD : AGAIN)]);
}

// 一下记好几次 (从 Anki 搬来的): reviews = [{ at, rating }]
export function addReviews(log, key, reviews) {
  log[key] = pack([...unpack(log[key]), ...reviews.filter((r) => r.rating >= 1 && r.rating <= 4).map((r) => encodeReview(r.at, r.rating))]);
}

// 撤销: 去掉最后一次
export function dropLastReview(log, key) {
  const list = unpack(log[key]);
  if (!list.length) return;
  list.pop();
  if (list.length) log[key] = pack(list);
  else delete log[key];
}

// 存着的、同步来的、备份里的: 只留像记录的 (v1.17 的数字数组也认, 换成压缩的)
export function cleanLog(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!key || key.length > 80 || (typeof value !== 'string' && !Array.isArray(value))) continue;
    const text = pack(unpack(value));
    if (text) out[key] = text;
  }
  return out;
}

// 两台设备的合起来: 同一张卡片两边的记录都要 (同一分钟同一个评分只算一次)
export function mergeLogs(a = {}, b = {}) {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) out[key] = pack([...unpack(out[key]), ...unpack(value)]);
  return out;
}

export function reviewCount(log) {
  return Object.values(log ?? {}).reduce((n, text) => n + unpack(text).length, 0);
}

// 一张卡片的记录, 从早到晚: [{ at, rating }] (以后给 FSRS 优化参数用)
export function historyOf(log, key) {
  return unpack(log?.[key]).map(decodeReview);
}

// 从第一次背起的完整记录 (优化参数、换参数以后重算记忆状态用), 不完整的返回 null:
// 卡片第一次排进复习的时间 (stats.first) 就是记录里的第一次, 最后一次答的 (stats.at) 就是记录里的最后一次。
// 没记 first 的 (v1.19 以前开始背的、v1.18 从 Anki 搬来的): 答过的次数跟记录一样多才算 (有记录以前就背过的会多)。
// 有记录以前就背过的 (v1.17 以前)、太久的被挤掉的 (只留 200 次)、两台设备没合好的都不算
export function fullHistory(stat, log, key) {
  if (!(stat?.at > 0)) return null;
  const list = historyOf(log, key);
  if (!list.length) return null;
  const minute = (t) => Math.floor(t / MINUTE);
  const start = stat.first > 0 ? minute(list[0].at) === minute(stat.first) : stat.right + stat.wrong === list.length;
  return start && minute(list.at(-1).at) === minute(stat.at) ? list : null;
}

// 所有卡片集里有完整记录的卡片的记录: [[{ at, rating }]]
export function fullHistories(sets, log) {
  const out = [];
  for (const set of sets) {
    for (const card of set.cards) {
      const list = fullHistory(set.stats[card.id], log, card.id);
      if (list) out.push(list);
    }
  }
  return out;
}
