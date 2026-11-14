// 从 chess.com 拿自己下过的棋 (v1.82): 用它公开的接口 (https://api.chess.com/pub/…, 不用登录、不用密钥, 网页里直接问)。
//   先问这个人有哪几个月下过棋 (archives), 再拿最近一两个月的棋; 每盘有棋谱 (PGN)、双方名字和等级分、结果、什么时候下的。
// 只拿标准国际象棋 (rules: 'chess'), 别的变体 (960、三将……) 不要。

export const API = 'https://api.chess.com/pub/player';
export const NAME = /^[A-Za-z0-9_-]{3,40}$/;

const CLASS_ZH = { bullet: '子弹棋', blitz: '快棋', rapid: '中快棋', daily: '每日棋', classical: '慢棋' };

// chess.com 的结果 (win / checkmated / resigned / timeout / agreed / stalemate / repetition …) → 中文
const HOW = {
  checkmated: '被将死',
  resigned: '认输',
  timeout: '超时',
  abandoned: '弃局',
  agreed: '议和',
  stalemate: '逼和',
  repetition: '重复局面',
  insufficient: '子力不足',
  '50move': '五十步',
  timevsinsufficient: '超时但子力不足',
};

async function getJson(url, fetchFn) {
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chess.com 没回应 (${res.status})`);
  return res.json();
}

// 接口给的一盘 → 温故用的; 不是标准国际象棋、没有棋谱的: null
export function gameOf(g, name) {
  if (!g || g.rules !== 'chess' || typeof g.pgn !== 'string' || !g.white || !g.black) return null;
  const me = String(name ?? '').toLowerCase();
  const color = g.white.username?.toLowerCase() === me ? 'w' : g.black.username?.toLowerCase() === me ? 'b' : '';
  const mine = color === 'w' ? g.white : g.black;
  const other = color === 'w' ? g.black : g.white;
  const result = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '1/2-1/2';
  const loser = g.white.result === 'win' ? g.black.result : g.black.result === 'win' ? g.white.result : g.white.result;
  return {
    url: typeof g.url === 'string' ? g.url : '',
    pgn: g.pgn,
    me: color,
    white: { name: g.white.username ?? '', rating: g.white.rating ?? 0 },
    black: { name: g.black.username ?? '', rating: g.black.rating ?? 0 },
    opponent: other?.username ?? '',
    opponentRating: other?.rating ?? 0,
    myRating: mine?.rating ?? 0,
    result,
    how: HOW[loser] ?? '',
    kind: CLASS_ZH[g.time_class] ?? '',
    end: Number(g.end_time) > 0 ? Number(g.end_time) * 1000 : 0,
    accuracy: g.accuracies && color ? Number(g.accuracies[color === 'w' ? 'white' : 'black']) || null : null,
  };
}

// 最近下的棋 (新的在前, 最多 limit 盘): 先拿最近一个月的, 不够再往前拿一个月
export async function recentGames(name, { limit = 30, fetchFn = fetch } = {}) {
  const user = String(name ?? '').trim();
  if (!NAME.test(user)) throw new Error('用户名不对');
  const list = await getJson(`${API}/${encodeURIComponent(user.toLowerCase())}/games/archives`, fetchFn);
  if (!list) throw new Error('chess.com 上找不到这个用户');
  const months = (Array.isArray(list.archives) ? list.archives : []).filter((u) => typeof u === 'string' && u.startsWith(`${API}/`)).slice(-2).reverse();
  const games = [];
  for (const url of months) {
    const data = await getJson(url, fetchFn);
    for (const g of [...(data?.games ?? [])].reverse()) {
      const x = gameOf(g, user);
      if (x) games.push(x);
    }
    if (games.length >= limit) break;
  }
  return games.sort((a, b) => b.end - a.end).slice(0, limit);
}

// 这个人在 chess.com 上的分 (快棋 rapid; 没下过快棋用 blitz、再没有用每日棋); 拿不到: 0
export async function ccRating(name, { fetchFn = fetch } = {}) {
  const user = String(name ?? '').trim();
  if (!NAME.test(user)) return 0;
  const s = await getJson(`${API}/${encodeURIComponent(user.toLowerCase())}/stats`, fetchFn).catch(() => null);
  for (const k of ['chess_rapid', 'chess_blitz', 'chess_daily']) {
    const r = Number(s?.[k]?.last?.rating);
    if (r > 0) return Math.round(r);
  }
  return 0;
}
