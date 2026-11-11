// 每日猜词 (v1.76; 原来是学习游戏里的 Wordle, 从卡片集挑词, 用户说搬到邸报、改成每天一个词): 每天一个五个字母的英文词,
// 大家一样, 6 次猜出来。词表在 words.js (tools/words.mjs 从 SCOWL 生成), 2026-11-10 是第一天, 按次序一天一个。
// 绿: 字母对、位置也对; 黄: 有这个字母但位置不对; 灰: 没有这个字母。
// 「Wordle」是纽约时报的商标, 温故里叫「每日猜词」(用户定的)。

export const TRIES = 6;
export const LEN = 5;
export const START = '2026-11-10'; // 第一天 (这台设备的日子; v1.76 发布那天)

const pad = (n) => String(n).padStart(2, '0');
export const dayKeyOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 今天是第几天 (第一天是 0); 按这台设备的日子算, 跟纽约时报一样各地按自己的日子换词
export function dayIndex(date = new Date()) {
  const [y, m, d] = START.split('-').map(Number);
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(y, m - 1, d)) / 86400000);
}

// 第几天的词 (词表轮完了从头再来)
export function dailyWord(index, answers) {
  const n = answers.length;
  return answers[((index % n) + n) % n];
}

// 能不能拿来猜: 五个字母、在词表里
export function canGuess(word, allowed) {
  return word.length === LEN && allowed.has(word);
}

// 判一次猜的: 每个字母 'correct' | 'present' | 'absent' (同一个字母出现几次也照规矩算)
export function evaluate(guess, target) {
  const g = Array.from(guess.toLowerCase());
  const t = Array.from(target.toLowerCase());
  const result = g.map(() => 'absent');
  const left = new Map();
  t.forEach((ch, i) => {
    if (g[i] === ch) result[i] = 'correct';
    else left.set(ch, (left.get(ch) ?? 0) + 1);
  });
  g.forEach((ch, i) => {
    if (result[i] === 'correct') return;
    const n = left.get(ch) ?? 0;
    if (n > 0) {
      result[i] = 'present';
      left.set(ch, n - 1);
    }
  });
  return result;
}

// 键盘上每个字母的颜色: 取最好的那个 (绿 > 黄 > 灰)
const RANK = { absent: 1, present: 2, correct: 3 };
export function mergeKeys(keys, guess, result) {
  const next = { ...keys };
  Array.from(guess.toLowerCase()).forEach((ch, i) => {
    if (!next[ch] || RANK[result[i]] > RANK[next[ch]]) next[ch] = result[i];
  });
  return next;
}

// 成绩: 玩了几天、猜中几天、连胜 (昨天也猜中才接着算)、最长连胜、几次猜中的分布
export const emptyStats = () => ({ played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], last: null });
export function addResult(stats, day, win, tries) {
  const s = { ...emptyStats(), ...stats, dist: [...(stats?.dist ?? [0, 0, 0, 0, 0, 0])] };
  if (s.last !== null && s.last >= day) return s; // 这一天记过了
  s.played++;
  if (win) {
    s.won++;
    s.streak = s.lastWin === day - 1 ? s.streak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.dist[tries - 1]++;
    s.lastWin = day;
  } else s.streak = 0;
  s.last = day;
  return s;
}
