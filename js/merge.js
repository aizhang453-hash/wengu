// 同步时把两台设备的数据合成一份 (两边都是 cleanData 过的):
//   卡片内容 (标题、词、解释、语言)   听最后改过 (updatedAt) 的那边
//   会了 / 星标 / 学习程度            听最后学过 (progressAt) 的那边
//   每张卡片的答对答错和复习日子      一张一张比, 取最近答过 (at) 的
//   游戏最好成绩                      取更好的
//   题目集每次的成绩                  两边的合起来
//   打卡                              同一天取多的
//   删除                              一边删了就删, 除非另一边是删了以后又改过的
//   文件夹                            听最后改过的那边
//   错题                              一道一道合: 内容听最后改过的, 重做记录听最后做过的

import { mergeRuns } from './quiz.js';
import { mergeMistake, PREFIX as MISTAKE_PREFIX } from './mistakes.js';

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
    const ta = mine.at ?? 0;
    const tb = s.at ?? 0;
    if (tb > ta || (tb === ta && s.right + s.wrong > mine.right + mine.wrong)) out[id] = s;
  }
  return out;
}

function mergeSet(a, b) {
  const content = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  const progress = (b.progressAt ?? 0) > (a.progressAt ?? 0) ? b : a;
  return {
    ...content,
    known: progress.known,
    starred: progress.starred,
    learn: progress.learn,
    stats: mergeStats(a.stats, b.stats),
    best: mergeBest(a.best, b.best),
    runs: mergeRuns(a.runs, b.runs),
    createdAt: Math.min(a.createdAt ?? Infinity, b.createdAt ?? Infinity),
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    progressAt: Math.max(a.progressAt ?? 0, b.progressAt ?? 0),
  };
}

function mergeFolder(a, b) {
  const newer = (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
  return { ...newer, best: mergeBest(a.best, b.best), updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0) };
}

// 两份按 id 合并; 删除记录比最后修改晚的就不要了
function mergeList(a, b, mergeOne, deleted, prefix = '') {
  const byId = new Map(a.map((x) => [x.id, x]));
  for (const x of b) byId.set(x.id, byId.has(x.id) ? mergeOne(byId.get(x.id), x) : x);
  return [...byId.values()].filter((x) => !(deleted[prefix + x.id] >= (x.updatedAt ?? 0)));
}

export function mergeData(local, remote) {
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
  };
}
