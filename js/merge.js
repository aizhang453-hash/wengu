// 同步时把两台设备的数据合成一份 (两边都是 cleanData 过的):
//   卡片集的标题、说明、语言          听最后改过 (updatedAt) 的那边
//   卡片                              一张一张合: 听最后改过的那个卡片集, 但另一边新加的、后来改过的卡片 (card.edited) 不丢;
//                                     删掉的卡片记在 deleted['card:id'] 里 (没有 edited 的老卡片照旧听最后改过的那边)
//   会了 / 星标 / 学习程度            听最后学过 (progressAt) 的那边
//   每张卡片的答对答错和复习日子      一张一张比, 取最近答过 (at) 的
//   游戏最好成绩                      取更好的
//   打卡                              同一天取多的
//   删除                              一边删了就删, 除非另一边是删了以后又改过的
//   文件夹                            听最后改过的那边 (每天的计划听后改的)
//   错题                              一道一道合: 内容听最后改过的, 重做记录听最后做过的
//   翻卡自评的记录 (revlog)            两边的合起来, 哪边撤销了的 (undone) 去掉
//   每天的计划、复习上限              听后改的那边
//   小乌龟温温                        长大的进度取多的, 解锁的装扮合起来, 名字和装扮听后改的
//   游戏厅的成绩                      两边的合起来, 留最高的 5 次

import { mergeMistake, PREFIX as MISTAKE_PREFIX } from './mistakes.js';
import { mergeLogs, subtractLogs } from './revlog.js';
import { cleanPet, mergePet } from './pet.js';
import { cleanArcade, mergeArcade } from './arcade.js';

const LOWER_IS_BETTER = new Set(['match']);

function mergeBest(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (out[k] === undefined) out[k] = v;
    else out[k] = LOWER_IS_BETTER.has(k) ? Math.min(out[k], v) : Math.max(out[k], v);
  }
  return out;
}

function mergeStats(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, s] of Object.entries(b)) {
    const mine = out[id];
    if (!mine) {
      out[id] = s;
      continue;
    }
    // 最后答的、撤销的那边 (撤销了的比撤销以前同步出去的新)
    const ta = Math.max(mine.at ?? 0, mine.rev ?? 0);
    const tb = Math.max(s.at ?? 0, s.rev ?? 0);
    const main = tb > ta || (tb === ta && s.right + s.wrong > mine.right + mine.wrong) ? s : mine;
    // 暂停、明天再说: 听后改的那边 (在没同步的设备上暂停, 不会把另一台设备后来的复习盖掉)
    const fa = Number(mine.flag) || 0;
    const fb = Number(s.flag) || 0;
    const flags = fb > fa ? s : fa > fb ? mine : main;
    out[id] = flags === main ? main : withFlags(main, flags);
  }
  return out;
}

function withFlags(main, from) {
  const out = { ...main };
  for (const k of ['sus', 'bury', 'flag']) {
    if (from[k] === undefined) delete out[k];
    else out[k] = from[k];
  }
  return out;
}

// 卡片一张一张合: 两边都有的听后改的那张 (edited); 只有另一边有的, 是新加的 / 后来改过的 (有 edited, 不是删了以后的) 就留下, 接在后面
function mergeCards(content, other, deleted) {
  const theirs = new Map(other.cards.map((c) => [c.id, c]));
  const mine = new Set(content.cards.map((c) => c.id));
  const cards = content.cards.map((c) => {
    const o = theirs.get(c.id);
    return o && (o.edited ?? 0) > (c.edited ?? 0) ? o : c;
  });
  for (const c of other.cards) {
    if (mine.has(c.id) || !(c.edited > 0) || (deleted[`card:${c.id}`] ?? 0) >= c.edited) continue;
    cards.push(c);
  }
  return cards;
}

export function mergeSet(a, b, deleted = {}) {
  const content = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  const progress = (b.progressAt ?? 0) > (a.progressAt ?? 0) ? b : a;
  return {
    ...content,
    cards: mergeCards(content, content === a ? b : a, deleted),
    known: progress.known,
    starred: progress.starred,
    learn: progress.learn,
    stats: mergeStats(a.stats, b.stats),
    best: mergeBest(a.best, b.best),
    plan: (b.plan?.at ?? 0) > (a.plan?.at ?? 0) ? b.plan : a.plan,
    createdAt: Math.min(a.createdAt ?? Infinity, b.createdAt ?? Infinity),
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    progressAt: Math.max(a.progressAt ?? 0, b.progressAt ?? 0),
  };
}

// 复习上限听后改的; FSRS 参数也听后换的 (优化过的、换回默认的都算)
export function mergeSettings(a, b) {
  if (!b) return a;
  if (!a) return b;
  const general = (b.at ?? 0) > (a.at ?? 0) ? b : a;
  const changed = (x) => Math.max(x.fsrsAt ?? 0, x.fsrs?.at ?? 0);
  const params = changed(b) > changed(a) ? b : a;
  return { ...general, fsrs: params.fsrs ?? null, fsrsAt: changed(params) || undefined };
}

export function mergeFolder(a, b) {
  const newer = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  return {
    ...newer,
    best: mergeBest(a.best, b.best),
    plan: (b.plan?.at ?? 0) > (a.plan?.at ?? 0) ? b.plan : a.plan,
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
  };
}

// 两份按 id 合并; 删除记录比最后修改晚的就不要了
function mergeList(a, b, mergeOne, deleted, prefix = '') {
  const byId = new Map(a.map((x) => [x.id, x]));
  for (const x of b) byId.set(x.id, byId.has(x.id) ? mergeOne(byId.get(x.id), x, deleted) : x);
  return [...byId.values()].filter((x) => !(deleted[prefix + x.id] >= (x.updatedAt ?? 0)));
}

export function mergeData(local, remote) {
  const undone = mergeLogs(local.undone, remote.undone);
  const deleted = { ...local.deleted };
  for (const [id, t] of Object.entries(remote.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, t);
  const activity = { ...local.activity };
  for (const [day, n] of Object.entries(remote.activity ?? {})) activity[day] = Math.max(activity[day] ?? 0, n);
  return {
    version: 1,
    sets: mergeList(local.sets, remote.sets ?? [], mergeSet, deleted),
    folders: mergeList(local.folders ?? [], remote.folders ?? [], mergeFolder, deleted, 'folder:'),
    mistakes: mergeList(local.mistakes ?? [], remote.mistakes ?? [], mergeMistake, deleted, MISTAKE_PREFIX),
    activity,
    deleted,
    undone,
    revlog: subtractLogs(mergeLogs(local.revlog, remote.revlog), undone),
    settings: mergeSettings(local.settings, remote.settings),
    pet: mergePet(cleanPet(local.pet), cleanPet(remote.pet)),
    arcade: mergeArcade(cleanArcade(local.arcade), cleanArcade(remote.arcade)),
  };
}
