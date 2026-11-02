// 游戏厅「人生草稿」的规则: 一稿就是一辈子。开局挑出身、性格、心愿, 每年遇到些事, 到了路口自己选; 走了以后算结局、打分、写评语。
// 写过的稿留下「批注」(data.arcade.draft.progress, 怎么存、怎么合在 ../arcade.js): 下一稿走到同一个路口, 能看见以前选这条路的结局;
// 有些路要前面的稿走过才会出现 (温故而知新)。
// 内容 (出身、性格、心愿、每年的事、路口、结局) 在 ./draftdata.js, 这里只管怎么跑。没有 DOM, 测试直接跑。
//
// 一稿 (life) 是能直接存成 JSON 的对象 (玩到一半关了页面, 下次接着写):
//   { v, run 第几稿, origin, trait, wish, age, stats { str 体魄, kno 学识, soc 人缘, mny 家底 }, peak 最高到过多少,
//     flags { 标记: 哪年标上的 }, n { 计数 }, done { 发生过的事: 哪年 }, marks [这稿新留下的、以后的稿能看见的记号],
//     years [{ age, base 这年开始时的属性, lines [{ t 字, k 种类 }], delta }], choices [{ id, opt, age }],
//     pending 正等着选的路口 { id, opts [能选的] } | null, wishAt 心愿哪年了的 | null, dead { age, cause, text } | null }
// 批注 (profile): { runs 写完几稿, endings [见过的结局], marks [记号], notes { '路口:选项': { run, age, end, at } }, last { age, end, at } }

import { ORIGINS, TRAITS, WISHES, EVENTS, CHOICES, ENDINGS, FILLERS } from './draftdata.js';
import { emptyDraft } from './arcade.js';

export const STATS = [
  ['str', '体魄'],
  ['kno', '学识'],
  ['soc', '人缘'],
  ['mny', '家底'],
];
export const MAX = 20;
export const OFFER = 3; // 出身、性格、心愿各给几个挑

export const emptyProfile = emptyDraft;

const clamp = (v) => Math.max(0, Math.min(MAX, Math.round(v)));
const byKey = (list, key) => list.find((x) => x.key === key) ?? null;
export const originOf = (key) => byKey(ORIGINS, key);
export const traitOf = (key) => byKey(TRAITS, key);
export const wishOf = (key) => byKey(WISHES, key);
export const endingOf = (key) => byKey(ENDINGS, key);
export const choiceOf = (id) => CHOICES.find((x) => x.id === id) ?? null;

// 前面的稿见过没有: 'end:结局' 看结局, 别的看记号
export function seenIn(profile, key) {
  if (key.startsWith('end:')) return profile.endings.includes(key.slice(4));
  return profile.marks.includes(key);
}

// 开局给挑的: 解锁了的里面随机挑几个 (解锁条件看 profile)
function offer(list, profile, rand) {
  const open = list.filter((x) => !x.unlock || x.unlock({ runs: profile.runs, seen: (k) => seenIn(profile, k) }));
  const bag = [...open];
  const out = [];
  while (out.length < OFFER && bag.length) out.push(bag.splice(Math.floor(rand() * bag.length), 1)[0].key);
  return out;
}

export function offers(profile = emptyProfile(), rand = Math.random) {
  return { origins: offer(ORIGINS, profile, rand), traits: offer(TRAITS, profile, rand), wishes: offer(WISHES, profile, rand) };
}

// 内容里的事、选项拿到的 c: 读属性、标记, 改属性、写一句话、掷骰子
function context(life, profile, rand, entry) {
  const c = {
    get age() {
      return life.age;
    },
    get str() {
      return life.stats.str;
    },
    get kno() {
      return life.stats.kno;
    },
    get soc() {
      return life.stats.soc;
    },
    get mny() {
      return life.stats.mny;
    },
    get peak() {
      return life.peak;
    },
    get wishDone() {
      return life.wishAt !== null;
    },
    get dead() {
      return life.dead;
    },
    origin: life.origin,
    trait: life.trait,
    wish: life.wish,
    runs: profile.runs,
    last: profile.last,
    has: (f) => Object.hasOwn(life.flags, f),
    since: (f) => (Object.hasOwn(life.flags, f) ? life.age - life.flags[f] : -1),
    flag: (...fs) => {
      for (const f of fs) if (!Object.hasOwn(life.flags, f)) life.flags[f] = life.age;
    },
    unflag: (...fs) => {
      for (const f of fs) delete life.flags[f];
    },
    count: (k) => life.n[k] ?? 0,
    inc: (k, by = 1) => (life.n[k] = (life.n[k] ?? 0) + by),
    add: (fx) => {
      for (const [k, v] of Object.entries(fx ?? {})) {
        if (!Object.hasOwn(life.stats, k)) continue;
        life.stats[k] = clamp(life.stats[k] + v);
        life.peak[k] = Math.max(life.peak[k], life.stats[k]);
      }
    },
    set: (k, v) => {
      life.stats[k] = clamp(v);
      life.peak[k] = Math.max(life.peak[k], life.stats[k]);
    },
    log: (t, k = '') => entry?.lines.push({ t, k }),
    chance: (p) => rand() < p,
    pick: (list) => list[Math.floor(rand() * list.length)],
    int: (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)),
    die: (cause, text = '') => {
      if (!life.dead) life.dead = { age: life.age, cause, text };
    },
    seen: (key) => seenIn(profile, key),
    mark: (key) => {
      if (!life.marks.includes(key)) life.marks.push(key);
    },
    did: (id) => Object.hasOwn(life.done, id),
    chose: (id, opt = null) => life.choices.some((x) => x.id === id && (opt === null || x.opt === opt)),
  };
  return c;
}

export function newLife({ origin, trait, wish }, profile = emptyProfile(), rand = Math.random) {
  const o = originOf(origin);
  const t = traitOf(trait);
  if (!o || !t || !wishOf(wish)) throw new Error('出身、性格、心愿要先选好');
  const stats = { str: 0, kno: 0, soc: 0, mny: 0 };
  for (const k of Object.keys(stats)) stats[k] = clamp((o.stats[k] ?? 0) + (t.stats?.[k] ?? 0));
  const life = {
    v: 1,
    run: profile.runs + 1,
    origin,
    trait,
    wish,
    age: 0,
    stats,
    peak: { ...stats },
    flags: {},
    n: {},
    done: {},
    marks: [],
    years: [],
    choices: [],
    pending: null,
    wishAt: null,
    dead: null,
  };
  for (const f of [...(o.flags ?? []), ...(t.flags ?? [])]) life.flags[f] = 0;
  const entry = { age: 0, base: { ...stats }, lines: [], delta: {} };
  const c = context(life, profile, rand, entry);
  c.log(typeof o.birth === 'function' ? o.birth(c) : o.birth);
  life.years.push(entry);
  return life;
}

const text = (x, c) => (typeof x === 'function' ? x(c) : x);

function fits(e, c, life) {
  const to = e.to ?? e.from;
  if (life.age < e.from || life.age > to) return false;
  if (e.once !== false && Object.hasOwn(life.done, e.id)) return false;
  return !e.if || e.if(c);
}

function runEvent(e, c, life) {
  life.done[e.id] = life.age;
  const t = text(e.text, c);
  if (t) c.log(t, e.k ?? '');
  c.add(e.fx);
  if (e.set) c.flag(...e.set);
  if (e.mark) c.mark(e.mark);
  e.do?.(c);
}

function pickWeighted(list, rand) {
  const total = list.reduce((s, e) => s + (e.w ?? 1), 0);
  let r = rand() * total;
  for (const e of list) {
    r -= e.w ?? 1;
    if (r < 0) return e;
  }
  return list[list.length - 1];
}

const band = (age) => (age <= 6 ? 'child' : age <= 12 ? 'school' : age <= 18 ? 'teen' : age <= 59 ? 'adult' : 'old');

function delta(base, stats) {
  const d = {};
  for (const [k] of STATS) if (stats[k] !== base[k]) d[k] = stats[k] - base[k];
  return d;
}

// 每年老一点: 45 岁以后体魄慢慢掉 (锻炼的、乐天的掉得慢)
function aging(c, life) {
  if (life.age < 45) return;
  let p = (life.age - 40) / 120;
  if (c.has('exercise')) p *= 0.6;
  if (life.trait === 'sunny') p *= 0.75;
  if (c.chance(p)) c.add({ str: -1 });
}

// 这一年走不走: 体魄没了就走; 50 岁以后每年有一点点可能 (越老越大, 体魄好的小一些)
function mortality(c, life, rand, natural) {
  if (life.dead) return;
  if (life.stats.str <= 0) {
    c.die('ill');
    return;
  }
  if (!natural || life.age < 50) return;
  const health = Math.max(0.5, Math.min(1.5, 1.5 - life.stats.str * 0.05));
  const p = 0.003 * 1.1 ** (life.age - 50) * health;
  if (rand() < p || life.age >= 120) c.die(life.age >= 85 ? 'old' : 'sudden');
}

function checkWish(c, life) {
  if (life.wishAt !== null) return;
  if (wishOf(life.wish).done(c)) {
    life.wishAt = life.age;
    c.log(`心愿达成：${wishOf(life.wish).name}`, 'wish');
  }
}

// 这一年有没有要选的路口: 年纪到了、条件满足、还没选过的第一个
function nextChoice(c, life) {
  for (const ch of CHOICES) {
    const to = ch.to ?? ch.age;
    if (life.age < ch.age || life.age > to) continue;
    if (life.choices.some((x) => x.id === ch.id)) continue;
    if (ch.if && !ch.if(c)) continue;
    const opts = ch.options.filter((o) => !o.if || o.if(c)).map((o) => o.key);
    if (opts.length) return { id: ch.id, opts };
  }
  return null;
}

// natural: 要不要掷「老了走」的骰子 (一年只掷一次, 路口选完不再掷)
function endYear(c, life, entry, rand, natural = true) {
  checkWish(c, life);
  mortality(c, life, rand, natural);
  if (life.dead) {
    entry.lines.push({ t: life.dead.text || deathLine(life.dead.cause), k: 'death' });
  } else life.pending = nextChoice(c, life);
  entry.delta = delta(entry.base, life.stats);
}

const deathLine = (cause) =>
  ({
    old: '你在睡梦中去世了。',
    ill: '你病逝了。',
    sudden: '你突发疾病去世了。',
    overwork: '你加班时猝死了。',
    accident: '你死于一场意外。',
  })[cause] ?? '你去世了。';

// 过一年。正等着选路口、已经走了的时候不动, 返回 null
export function advance(life, profile = emptyProfile(), rand = Math.random) {
  if (life.pending || life.dead) return null;
  life.age += 1;
  const entry = { age: life.age, base: { ...life.stats }, lines: [], delta: {} };
  life.years.push(entry);
  const c = context(life, profile, rand, entry);
  // 一定发生的 (上学、毕业、孩子出生这些): 条件满足就都发生
  for (const e of EVENTS) {
    if (life.dead) break;
    if (e.fixed && fits(e, c, life)) runEvent(e, c, life);
  }
  // 不常有的 (意外、大病、中彩票): 每年单独掷一次, 不跟别的事抢
  for (const e of EVENTS) {
    if (life.dead) break;
    if (e.p && fits(e, c, life) && rand() < e.p) runEvent(e, c, life);
  }
  // 再随机遇到一件; 一件都没有就写一句「平平淡淡」
  if (!life.dead) {
    const pool = EVENTS.filter((e) => !e.fixed && !e.p && fits(e, c, life));
    if (pool.length) runEvent(pickWeighted(pool, rand), c, life);
    else if (!entry.lines.length) c.log(c.pick(FILLERS[band(life.age)]));
  }
  if (!life.dead) aging(c, life);
  endYear(c, life, entry, rand);
  return entry;
}

// 选路口: key 是 pending.opts 里的一个。选完这一年接着算 (选的结果写进这一年)
export function choose(life, key, profile = emptyProfile(), rand = Math.random) {
  const p = life.pending;
  if (!p || !p.opts.includes(key)) return false;
  const ch = choiceOf(p.id);
  const opt = ch?.options.find((o) => o.key === key);
  life.pending = null;
  if (!opt) return false;
  const entry = life.years[life.years.length - 1];
  const c = context(life, profile, rand, entry);
  entry.lines.push({ t: opt.text, k: 'choice' });
  life.choices.push({ id: ch.id, opt: key, age: life.age });
  c.add(opt.fx);
  if (opt.set) c.flag(...opt.set);
  opt.do?.(c);
  endYear(c, life, entry, rand, false);
  return true;
}

// 一路过到下一个路口或者走了 (测试、「写完」用); choosePick(life, pending) 返回选哪个, 不给就停在路口
export function runUntilStop(life, profile, rand, choosePick = null, limit = 200) {
  for (let i = 0; i < limit && !life.dead; i++) {
    if (life.pending) {
      if (!choosePick) return life;
      choose(life, choosePick(life, life.pending), profile, rand);
    } else advance(life, profile, rand);
  }
  return life;
}

// ---- 走了以后 ----

const HIGH = { str: '身体好', kno: '学问好', soc: '人缘好', mny: '有钱' };
const LOW = { str: '身体差', kno: '书读得少', soc: '朋友少', mny: '缺钱' };
const ADVICE = { str: '下一稿多锻炼。', kno: '下一稿多读书。', soc: '下一稿多交朋友。', mny: '下一稿多攒钱。' };

export function ending(life, profile = emptyProfile()) {
  const c = context(life, profile, () => 0.5, null);
  return ENDINGS.find((e) => e.test(c)) ?? ENDINGS[ENDINGS.length - 1];
}

// 分数: 活了几岁 + 学识、人缘各两倍 + 家底 + 体魄 (走的时候的) + 心愿 80 + 结局另给的
export function score(life, end = ending(life)) {
  const s = life.stats;
  return life.age + s.kno * 2 + s.soc * 2 + s.mny + s.str + (life.wishAt !== null ? 80 : 0) + (end.pts ?? 0);
}

// 评语: 最高的一项、最低的一项、心愿, 再给下一稿一句建议 (按一辈子到过的最高值看, 不然老了都是体魄最低)
export function comment(life) {
  const order = STATS.map(([k]) => k).sort((a, b) => life.peak[b] - life.peak[a]);
  const hi = order[0];
  const lo = order[order.length - 1];
  const w = wishOf(life.wish);
  const wishText = life.wishAt !== null ? `心愿「${w.name}」已了。` : `心愿「${w.name}」未了。`;
  const advice = life.wishAt === null && w.hint ? `下一稿，${w.hint}。` : ADVICE[lo];
  return `${HIGH[hi]}，${LOW[lo]}。${wishText}${advice}`;
}

// 写完这一稿: 返回结局、分数、评语、新见到的结局和记号, 和合进去以后的批注 (存的时候跟库里的再合一次)
export function finish(life, profile = emptyProfile(), at = Date.now()) {
  if (!life.dead) throw new Error('这一稿还没写完');
  const end = ending(life, profile);
  const marks = [...life.marks];
  if (life.wishAt !== null) marks.push(`wish:${life.wish}`);
  const notes = { ...profile.notes };
  for (const x of life.choices) notes[`${x.id}:${x.opt}`] = { run: life.run, age: life.age, end: end.key, at };
  const next = {
    runs: Math.max(profile.runs, life.run),
    endings: profile.endings.includes(end.key) ? [...profile.endings] : [...profile.endings, end.key],
    marks: [...new Set([...profile.marks, ...marks])],
    notes,
    last: { age: life.age, end: end.key, at },
  };
  return {
    ending: end,
    score: score(life, end),
    comment: comment(life),
    newEnding: !profile.endings.includes(end.key),
    newMarks: marks.filter((m) => !profile.marks.includes(m)),
    profile: next,
  };
}

// 这一稿写完新解锁的出身、性格 (before / after: 写完前后的批注)
export function newlyUnlocked(before, after) {
  const open = (x, p) => !x.unlock || x.unlock({ runs: p.runs, seen: (k) => seenIn(p, k) });
  return [...ORIGINS, ...TRAITS].filter((x) => x.unlock && !open(x, before) && open(x, after));
}

// 路口上每个选项旁边的批注: 以前的稿选过这个, 后来怎么样了
export function noteFor(profile, choiceId, key) {
  const n = profile.notes[`${choiceId}:${key}`];
  if (!n) return null;
  const end = endingOf(n.end);
  return { run: n.run, age: n.age, end: end?.name ?? '' };
}

// 玩到一半存着的: 读回来时看看还对不对得上 (内容改过、存坏了就不要了)
export function restoreLife(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  if (!originOf(raw.origin) || !traitOf(raw.trait) || !wishOf(raw.wish)) return null;
  if (!Array.isArray(raw.years) || !raw.years.length || !raw.stats || !raw.peak) return null;
  for (const [k] of STATS) if (!Number.isFinite(raw.stats[k]) || !Number.isFinite(raw.peak[k])) return null;
  const life = { flags: {}, n: {}, done: {}, marks: [], choices: [], wishAt: null, dead: null, ...raw };
  if (life.pending) {
    const ch = choiceOf(life.pending.id);
    const opts = (life.pending.opts ?? []).filter((k) => ch?.options.some((o) => o.key === k));
    life.pending = opts.length ? { id: ch.id, opts } : null;
  }
  return life;
}

export { ORIGINS, TRAITS, WISHES, CHOICES, ENDINGS };
