// 国际象棋存的东西 (v1.82): 分数、存的棋局怎么清理、怎么合并 (store.js、merge.js 用; 不带规则库, 打开温故不用加载它)。
// 别的 (规则、打分、好坏) 在 chess.js。

import { cleanSkills, mergeSkills } from './chessskills.js';

export const MATE = 30000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// 引擎说的分 (从走棋的一方看) → 从白方看的打分
export function evalOf({ cp = null, mate = null }, turn) {
  const sign = turn === 'w' ? 1 : -1;
  if (mate !== null && mate !== undefined) {
    if (mate === 0) return -sign * MATE; // 走棋的一方已经被将死
    return sign * Math.sign(mate) * (MATE - Math.abs(mate));
  }
  return sign * Math.round(Number(cp) || 0);
}

// ---- 分数 ----
// 对手、教练陪下的分数: 相当于 chess.com 快棋 (rapid) 的分; 0 是「最强」(引擎全力)
export const cleanRating = (r) => (Number.isFinite(Number(r)) && Number(r) > 0 ? clamp(Math.round(Number(r)), 100, 3200) : 0);
// 下完一盘, 我的分怎么变 (跟 chess.com、Lichess 一样的 Elo 算法): score 1 赢 / 0.5 和 / 0 输; 前 10 盘变得快一些
export function nextRating(mine, games, opp, score) {
  const o = opp || 3200;
  const expect = 1 / (1 + 10 ** ((o - mine) / 400));
  const k = games < 10 ? 60 : 32;
  return clamp(Math.round(mine + k * (score - expect)), 100, 3200);
}
export const START_RATING = 800; // 还不知道水平时先按 800 分算

// ---- 存的棋局 (store.data.chess, 跟着同步) ----
// chess = {
//   user: { name: chess.com 用户名, at }, coach: { id: 讲解的教练, at },
//   elo: { rating 我大约多少分, games 算进去几盘, cc 是不是从 chess.com 的分开始的 (1), at } (没下过是 null),
//   games: { id: { id, at, src: 'cpu' 跟电脑下的 / 'cc' chess.com / 'pgn' 粘贴的, pgn, white, black, result, date: 'YYYY-MM-DD',
//            me: 'w'/'b'/'' 我是哪方, who: 对手或教练, mode: 'bot' 跟对手 / 'coach' 跟教练, rating: 对手当时的分 (0 最强), url: chess.com 的网址,
//            review: { depth, ev: [每个局面的打分], bm: [每个局面引擎最想走的], ev2: [第二想走的那步走完的打分 (没有是 null)] } }
//            删掉的留个记号 { id, at, gone: 1 } (同步时别从另一台设备又合回来; 留 90 天) },
//   skills: 技巧 (v1.85, chessskills.js) { claims: { 技巧: ['棋局编号:第几步', …] }, mastered: { 技巧: 学会的时间 } } (没有是 null),
//   current: 正在跟电脑下的 { moves: 'e2e4 e7e5 …', color 我执哪方, who, mode, rating, diff 跟教练下的难度 ('easy' 休闲 / 'even' 均势 / 'hard' 挑战), start 开始的时间, at } (没有是 null)
// }
export const GAMES_MAX = 60;
const GONE_KEEP_MS = 90 * 24 * 3600 * 1000;
const ID = /^[a-z]{1,4}[A-Za-z0-9_-]{1,40}$/;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const time = (t) => (Number.isFinite(Number(t)) && Number(t) > 0 ? Math.floor(Number(t)) : 0);
const text = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function cleanReview(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.ev) || !Array.isArray(r.bm)) return null;
  const ev = r.ev.map((x) => (Number.isFinite(Number(x)) ? clamp(Math.round(Number(x)), -MATE, MATE) : 0));
  const bm = r.bm.map((x) => (typeof x === 'string' && UCI.test(x) ? x : ''));
  const ev2 = (Array.isArray(r.ev2) ? r.ev2 : []).map((x) => (x === null || !Number.isFinite(Number(x)) ? null : clamp(Math.round(Number(x)), -MATE, MATE)));
  if (!ev.length || ev.length !== bm.length) return null;
  return { depth: clamp(Math.floor(Number(r.depth) || 0), 1, 60), ev, bm, ev2: ev2.length === ev.length ? ev2 : ev.map(() => null) };
}

export function cleanGame(g, now = Date.now()) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !ID.test(g.id) || !time(g.at)) return null;
  if (g.gone) return time(g.at) > now - GONE_KEEP_MS ? { id: g.id, at: time(g.at), gone: 1 } : null;
  const pgn = typeof g.pgn === 'string' ? g.pgn.slice(0, 20000) : '';
  if (!pgn) return null;
  const out = {
    id: g.id,
    at: time(g.at),
    src: ['cpu', 'cc', 'pgn'].includes(g.src) ? g.src : 'pgn',
    pgn,
    white: text(g.white, 40),
    black: text(g.black, 40),
    result: ['1-0', '0-1', '1/2-1/2'].includes(g.result) ? g.result : '*',
    date: /^\d{4}-\d{2}-\d{2}$/.test(g.date ?? '') ? g.date : '',
    me: g.me === 'w' || g.me === 'b' ? g.me : '',
  };
  if (g.mode === 'bot' || g.mode === 'coach') out.mode = g.mode;
  if (out.src === 'cpu') out.rating = cleanRating(g.rating);
  if (typeof g.who === 'string' && /^[a-z0-9-]{1,24}$/.test(g.who)) out.who = g.who;
  if (typeof g.url === 'string' && /^https:\/\/www\.chess\.com\/game\/[a-z]+\/\d+$/.test(g.url)) out.url = g.url;
  if (time(g.end)) out.end = time(g.end);
  const review = cleanReview(g.review);
  if (review) out.review = review;
  return out;
}

function cleanCurrent(c) {
  if (!c || typeof c !== 'object' || !time(c.at)) return null;
  const moves = String(c.moves ?? '').split(' ').filter((m) => UCI.test(m));
  return {
    moves: moves.join(' '),
    color: c.color === 'b' ? 'b' : 'w',
    who: typeof c.who === 'string' && /^[a-z0-9-]{1,24}$/.test(c.who) ? c.who : '',
    mode: c.mode === 'coach' ? 'coach' : 'bot',
    rating: cleanRating(c.rating),
    ...(c.mode === 'coach' ? { diff: ['easy', 'even', 'hard'].includes(c.diff) ? c.diff : 'even' } : {}),
    start: time(c.start) || time(c.at),
    at: time(c.at),
  };
}

const pick = (v, ok) => (v && typeof v === 'object' && time(v.at) && ok(v) ? v : null);

export function cleanChess(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const user = pick(raw.user, (u) => typeof u.name === 'string' && /^[A-Za-z0-9_-]{0,40}$/.test(u.name));
  const coach = pick(raw.coach, (c) => typeof c.id === 'string' && /^[a-z0-9-]{1,24}$/.test(c.id));
  const elo = pick(raw.elo, (e) => cleanRating(e.rating) > 0);
  const games = {};
  const list = Object.values(raw.games && typeof raw.games === 'object' ? raw.games : {})
    .map((g) => cleanGame(g, now))
    .filter(Boolean)
    .sort((a, b) => b.at - a.at);
  let kept = 0;
  for (const g of list) {
    if (games[g.id]) continue;
    if (!g.gone && kept >= GAMES_MAX) continue;
    if (!g.gone) kept++;
    games[g.id] = g;
  }
  const current = cleanCurrent(raw.current);
  const skills = cleanSkills(raw.skills);
  const out = {
    user: user ? { name: user.name, at: time(user.at) } : null,
    coach: coach ? { id: coach.id, at: time(coach.at) } : null,
    elo: elo ? { rating: cleanRating(elo.rating), games: Math.max(0, Math.floor(Number(elo.games) || 0)), ...(elo.cc ? { cc: 1 } : {}), at: time(elo.at) } : null,
    games,
    current,
    ...(skills ? { skills } : {}),
  };
  return out.user || out.coach || out.elo || Object.keys(games).length || current || skills ? out : null;
}

export function mergeChess(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const later = (x, y) => (!x ? y : !y ? x : y.at > x.at ? y : x);
  const games = { ...a.games };
  for (const [id, g] of Object.entries(b.games)) games[id] = later(games[id], g);
  return cleanChess({ user: later(a.user, b.user), coach: later(a.coach, b.coach), elo: later(a.elo, b.elo), games, current: later(a.current, b.current), skills: mergeSkills(a.skills ?? null, b.skills ?? null) });
}

// 下过、复盘过的棋, 新的在前 (删掉的不要)
export const gameList = (chess) => Object.values(chess?.games ?? {}).filter((g) => !g.gone).sort((a, b) => b.at - a.at);

// 棋局的编号: chess.com 的用它的号, 别的用时间加几个随机字
export function gameIdOf({ src, url = '', now = Date.now() }) {
  const m = /\/game\/[a-z]+\/(\d+)$/.exec(url);
  if (src === 'cc' && m) return `cc${m[1]}`;
  return `${src === 'cpu' ? 'cpu' : 'pgn'}${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

