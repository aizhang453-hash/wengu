// 国际象棋的「技巧」(v1.85, 照 chess.com 2026 年的新功能, 清单是用户 2026-11-14 看过、同意的):
// 复盘自己的棋时, 下出一步「好习惯」的棋就领 1 分; 一个技巧攒够分就学会了, 同一类的下一个技巧打开 (学一个开下一个, 用户选的)。
// 分数跨好几盘一直攒, 跟着同步 (store.data.chess.skills); 同一盘棋同一步复盘两遍不加两次。
// 这个文件不引规则库 (chessdata.js 打开温故就要用这里的 cleanSkills, 不能把规则库也带上); 认一步练到哪些技巧在 chess.js 的 skillsOfMove。

export const SKILL_CATS = [
  { key: 'basic', name: '基本功' },
  { key: 'opening', name: '开局' },
  { key: 'tactics', name: '战术' },
  { key: 'strategy', name: '战略' },
  { key: 'endgame', name: '残局' },
];

// 每一类按次序: 第一个一开始就开着, 学会一个开下一个。
// example: 点开技巧时那张小棋盘 (fen 摆好的局面, move 该走的那步, 画箭头)
export const SKILLS = [
  { id: 'recapture', cat: 'basic', name: '吃回来', need: 5, desc: '对方刚吃了你的子，你在同一格马上吃回来，子力不吃亏。', example: { fen: 'r1bqkbnr/pppp1ppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4', move: 'f3d4' } },
  { id: 'freePiece', cat: 'basic', name: '吃白给的子', need: 5, desc: '对方的马、象、车、后没人保护，吃掉它，白赚。', example: { fen: '4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', move: 'd1d5' } },
  { id: 'savePiece', cat: 'basic', name: '救子', need: 5, desc: '你的子被打了，把它挪到安全的地方，别让它白白丢掉。', example: { fen: '4k3/8/8/8/4p3/5N2/8/4K3 w - - 0 1', move: 'f3d4' } },
  { id: 'center', cat: 'opening', name: '占中心', need: 5, desc: '开局头 8 回合里，把兵走到中间的四个格子（d4、e4、d5、e5）。', example: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', move: 'e2e4' } },
  { id: 'develop', cat: 'opening', name: '出马出象', need: 10, desc: '开局头 10 回合里，把马和象从家里走出来，让它们早点干活。', example: { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', move: 'g1f3' } },
  { id: 'castle', cat: 'opening', name: '王车易位', need: 3, desc: '开局头 12 回合里王车易位，让王躲到安全的角落，车也出来了。', example: { fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', move: 'e1g1' } },
  { id: 'check', cat: 'tactics', name: '将军', need: 5, desc: '将对方的军，逼对方先顾着王（这步自己不能走坏）。', example: { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', move: 'a1a8' } },
  { id: 'fork', cat: 'tactics', name: '捉双', need: 3, desc: '一个子同时打到对方两个值钱的子，对方只能救一个。', example: { fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', move: 'b5c7' } },
  { id: 'mate', cat: 'tactics', name: '将死', need: 3, desc: '把对方的王将死，赢下这盘棋。', example: { fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', move: 'a1a8' } },
  { id: 'tradeAhead', cat: 'strategy', name: '领先时兑子', need: 3, desc: '子力比对方多的时候跟对方换子，子越少，多出来的越管用。', example: { fen: '3rk3/8/8/8/8/8/8/3RK2R w K - 0 1', move: 'd1d8' } },
  { id: 'openFile', cat: 'strategy', name: '车占开放线', need: 3, desc: '车走到一条没有兵的直线上，车在开阔的地方最厉害。', example: { fen: '4k3/pp4pp/8/8/8/8/PP4PP/R3K3 w - - 0 1', move: 'a1d1' } },
  { id: 'connectRooks', cat: 'strategy', name: '连车', need: 3, desc: '两个车之间没有别的子，它们就能互相保护。', example: { fen: '4k3/8/8/8/8/8/PPP2PPP/R1B2RK1 w - - 0 1', move: 'c1e3' } },
  { id: 'promote', cat: 'endgame', name: '兵升变', need: 3, desc: '兵走到最后一行，变成后（或者车、象、马）。', example: { fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', move: 'b7b8q' } },
  { id: 'kingActive', cat: 'endgame', name: '王出来帮忙', need: 5, desc: '子少了以后，王不用再躲，往中间走去帮忙。', example: { fen: '8/5k2/8/8/8/8/6P1/6K1 w - - 0 1', move: 'g1f2' } },
  { id: 'passedPawn', cat: 'endgame', name: '推通路兵', need: 5, desc: '前面没有对方的兵挡、旁边也没有对方的兵吃得到，这种兵往前推，离升变越来越近。', example: { fen: '8/8/4k3/8/1P6/8/8/4K3 w - - 0 1', move: 'b4b5' } },
];
export const skillOf = (id) => SKILLS.find((s) => s.id === id) ?? null;

// ---- 攒分、学会、解锁 ----
// skills = { claims: { 技巧: ['棋局编号:第几步', …] (还没学会的才记), mastered: { 技巧: 学会的时间 } }

export const emptySkills = () => ({ claims: {}, mastered: {} });

// 现在开着的技巧: 学会了的, 加上每一类第一个还没学会的
export function openSkills(state) {
  const s = state ?? emptySkills();
  const out = new Set();
  for (const c of SKILL_CATS) {
    for (const k of SKILLS.filter((x) => x.cat === c.key)) {
      out.add(k.id);
      if (!s.mastered[k.id]) break;
    }
  }
  return out;
}

// 一个技巧现在几分 (学会了的是满分)
export const skillPoints = (state, id) => (state?.mastered?.[id] ? skillOf(id).need : (state?.claims?.[id]?.length ?? 0));
export const skillClaimed = (state, id, key) => Boolean(state?.claims?.[id]?.includes(key));

// 领一分: 没开、学会了、领过的不加。返回 { state 新的, got 加没加, mastered 这下学会了没有, unlocked 新开的技巧 (没有是 null) }
export function claimSkill(state, id, key, now = Date.now()) {
  const s = state ?? emptySkills();
  const skill = skillOf(id);
  if (!skill || s.mastered[id] || !openSkills(s).has(id) || skillClaimed(s, id, key)) return { state: s, got: false, mastered: false, unlocked: null };
  const list = [...(s.claims[id] ?? []), key];
  if (list.length < skill.need) return { state: { ...s, claims: { ...s.claims, [id]: list } }, got: true, mastered: false, unlocked: null };
  const claims = { ...s.claims };
  delete claims[id];
  const next = { claims, mastered: { ...s.mastered, [id]: now } };
  const before = openSkills(s);
  const unlocked = [...openSkills(next)].find((x) => !before.has(x)) ?? null;
  return { state: next, got: true, mastered: true, unlocked };
}

// ---- 存、同步 ----
const KEY = /^[a-z]{1,4}[A-Za-z0-9_-]{1,40}:\d{1,4}$/;
export function cleanSkills(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = emptySkills();
  for (const k of SKILLS) {
    const t = Math.floor(Number(raw.mastered?.[k.id]));
    if (Number.isFinite(t) && t > 0) {
      out.mastered[k.id] = t;
      continue;
    }
    const list = [...new Set((Array.isArray(raw.claims?.[k.id]) ? raw.claims[k.id] : []).filter((x) => typeof x === 'string' && KEY.test(x)))];
    if (list.length >= k.need) out.mastered[k.id] = 1; // 合起来够了: 算学会 (时间不知道, 记 1)
    else if (list.length) out.claims[k.id] = list;
  }
  return Object.keys(out.claims).length || Object.keys(out.mastered).length ? out : null;
}

// 两台设备的合起来: 学会的取早的那个时间, 领过的分合在一起 (同一步不重复)
export function mergeSkills(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const mastered = { ...a.mastered };
  for (const [id, t] of Object.entries(b.mastered)) mastered[id] = mastered[id] ? Math.min(mastered[id], t) : t;
  const claims = {};
  for (const k of SKILLS) claims[k.id] = [...new Set([...(a.claims[k.id] ?? []), ...(b.claims[k.id] ?? [])])];
  return cleanSkills({ claims, mastered });
}
