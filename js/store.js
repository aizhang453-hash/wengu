import { schedule, replay, dayKey, useParameters, isLapse, cleanRetention, startOfDay, daysLater, DAY, DEFAULT_RETENTION } from './srs.js';
import { cleanDiagram } from './diagram.js';
import { cleanQuestion, cleanRuns, newQuestion } from './quiz.js';
import { cleanMistake, firstReview, reviewAfter, mergeMistake, PREFIX as MISTAKE_PREFIX } from './mistakes.js';
import { cleanLog, mergeLogs, addReview, addReviews, dropReview, fullHistory, historyOf, subtractLogs, recentLog, pack, unpack, encodeReview, GOOD, AGAIN } from './revlog.js';
import { cleanPlan, DEFAULT_REVIEW_CAP, MAX_REVIEW_CAP } from './plan.js';
import { mergeData, mergeSettings, mergeSet, mergeFolder } from './merge.js';
import { cleanPet, mergePet, bankDays } from './pet.js';

// 卡片集都存在浏览器的 localStorage 里, 不用注册、不用服务器。
// 清浏览器数据会丢, 所以首页有「导出备份」。

export const KEY = 'wengu:v1';

// 时间 + 同一毫秒里第几个 + 随机几位, 14 个字 (以前用 36 个字的 UUID; 一张卡片的 id 要存好几遍, 几千张能省不少地方)
let seq = 0;
export function newId() {
  seq = (seq + 1) % 1296;
  const random = globalThis.crypto?.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(4))].map((b) => (b % 36).toString(36)).join('') : Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return Date.now().toString(36) + seq.toString(36).padStart(2, '0') + random;
}

// activity: { 'YYYY-MM-DD': 那天答了几题 } (连续打卡用)
// deleted: { 卡片集 id 或 'folder:文件夹 id' 或 'mistake:错题 id': 删掉的时间 }  同步时告诉别的设备这个删掉了
// mistakes: 错题集 (mistakes.js)
// revlog: 每一次翻卡自评的记录 (revlog.js), 以后按自己的记录优化复习排法用
//   (v1.16 存在 log 里的混着选择题、游戏的答案, 不要了)
// undone: 撤销了的复习记录 (跟 revlog 一样存), 同步时别从另一台设备又合回来; 留 120 天
// pet: 小乌龟温温 (pet.js), 还没见过是 null
// settings: { reviewsPerDay 每天最多复习几张, retention 想记住的把握 (0.70–0.97), at 改的时间 (同步时听后改的),
//   fsrs: 按自己的记录优化过的参数 { w: [21 个数], at 哪天优化的, items 用了几道题, logLoss / rmse: [默认参数的, 这套的] }, 没优化过是 null }
function emptyData() {
  return { version: 1, sets: [], folders: [], mistakes: [], activity: {}, deleted: {}, revlog: {}, undone: {}, settings: defaultSettings(), pet: null };
}

const defaultSettings = () => ({ reviewsPerDay: DEFAULT_REVIEW_CAP, retention: DEFAULT_RETENTION, at: 0, fsrs: null });

const pair = (v) => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? v : null);

export function cleanFsrs(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.w) || raw.w.length !== 21 || !raw.w.every(Number.isFinite)) return null;
  return { w: raw.w.map(Number), at: Number(raw.at) > 0 ? Number(raw.at) : 0, items: Math.max(0, Math.floor(Number(raw.items) || 0)), logLoss: pair(raw.logLoss), rmse: pair(raw.rmse) };
}

export function cleanSettings(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;
  const cap = Math.round(Number(raw.reviewsPerDay));
  if (cap >= 1) out.reviewsPerDay = Math.min(MAX_REVIEW_CAP, cap);
  out.retention = cleanRetention(raw.retention);
  if (Number(raw.at) > 0) out.at = Number(raw.at);
  out.fsrs = cleanFsrs(raw.fsrs);
  if (raw.fsrsAt > 0) out.fsrsAt = Number(raw.fsrsAt); // 换回默认参数的时间 (同步时用)
  return out;
}

const DELETED_KEEP_MS = 120 * 24 * 60 * 60 * 1000; // 删除记录留 120 天

// 存的时候卡片上空着的图片、录音不写 (读回来 cleanSet 会补上), 几千张卡片省一成多地方
const EMPTY_MEDIA = new Set(['image', 'termAudio', 'defAudio']);
const compact = (key, value) => (value === '' && EMPTY_MEDIA.has(key) ? undefined : value);

// 改过的卡片记 edited (这张最后改的时间), 新加的也算; 删掉的记在 deleted['card:id']: 同步时一张一张合, 两台设备各加的卡片都不丢。
// (新建的卡片集不用记: 别的设备还没有)
const cardText = (c) => JSON.stringify([c.term, c.def, c.image, c.termAudio, c.defAudio, c.q ?? null]);
function stampCards(next, prev, now, deleted) {
  const old = new Map(prev.cards.map((c) => [c.id, c]));
  for (const c of next.cards) {
    const o = old.get(c.id);
    if (!o || cardText(o) !== cardText(c)) c.edited = now;
    else if (o.edited) c.edited = o.edited;
  }
  const ids = new Set(next.cards.map((c) => c.id));
  for (const id of old.keys()) if (!ids.has(id)) deleted[`card:${id}`] = now;
}

// 文件夹: { id, name, setIds: [卡片集 id...], best: {}, plan: 每天背新词的计划 (plan.js, 没定过是 null), createdAt, updatedAt }
export function makeFolder(name = '') {
  const now = Date.now();
  return { id: newId(), name, setIds: [], best: {}, plan: null, createdAt: now, updatedAt: now };
}

export const FOLDER_PREFIX = 'folder:';

// 每个卡片集 (文件夹) 在浏览器里另外记的: wengu:<哪种>:<卡片集 id 或 folder:文件夹 id>
const LOCAL_KINDS = ['cards-session', 'learn-goal', 'learn-scope', 'wordle'];
const LOCAL_KEY = new RegExp(`^wengu:(${LOCAL_KINDS.join('|')}):(.+)$`);
export const COLLAPSED_KEY = 'wengu:home-collapsed'; // 首页收起了的文件夹

// 一个卡片集:
// { id, title, description, termLang, defLang,
//   cards: [{ id, term, def, image, termAudio, defAudio }]  (图片、录音是 media.js 里的 id, 没有就是 '')
//   known: [卡片 id...]        单词卡里标了「会了」的
//   starred: [卡片 id...]      星标
//   learn: { 卡片 id: 0|1|2 }  学习模式的程度 (没学过 / 认得了 / 掌握了)
//   stats: { 卡片 id: { right, wrong, interval, ease, s, d, due, at, first, n, lapses, sus, bury, rev } }
//          答对答错几次, 记忆状态, 下次哪天复习 (srs.js),
//          first 第一次排进复习的时间 (算今天学了几个新词), n 从第一次起翻卡自评了几次 (看复习记录全不全),
//          lapses 背过以后又忘了几次 (8 次以上是难记卡), sus 暂停的时间 (暂停了不排复习), bury 「明天再说」到哪天 0 点,
//          rev 撤销的时间 (同步时比 at 新的听这边的), flag 暂停 / 明天再说改的时间 (同步时这两样单独听后改的)
//   best: { match: 毫秒, blast / blocks / gems / quiz: 分, wordle: 最长连胜 }  游戏最好成绩
//   kind: 'cards' 普通卡片集 | 'quiz' 题目集 (每张卡片是一道题, 卡片上多一个 q, 见 quiz.js)
//   runs: [{ at, score, correct, total, timed }]  题目集最近几次的成绩
//   plan: 每天学几个新词 (plan.js), 没定过是 null
//   createdAt, updatedAt (改了卡片), progressAt (学习进度变了, 同步时用) }
export function makeSet(fields = {}) {
  const now = Date.now();
  return {
    id: newId(),
    title: '',
    description: '',
    termLang: 'auto',
    defLang: 'auto',
    cards: [],
    known: [],
    starred: [],
    learn: {},
    stats: {},
    best: {},
    diagram: null, // 标注图 (diagram.js)
    kind: 'cards',
    runs: [],
    plan: null,
    createdAt: now,
    updatedAt: now,
    progressAt: 0,
    ...fields,
  };
}

export function makeCard(term = '', def = '', extra = {}) {
  return { id: newId(), term, def, image: '', termAudio: '', defAudio: '', ...extra };
}

const mediaId = (v) => (typeof v === 'string' && /^m_[\w-]+$/.test(v) ? v : '');

// 老数据或备份里缺的字段补上, 不认识的东西丢掉
function cleanSet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cards = Array.isArray(raw.cards)
    ? raw.cards
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          id: typeof c.id === 'string' && c.id ? c.id : newId(),
          term: String(c.term ?? ''),
          def: String(c.def ?? ''),
          image: mediaId(c.image),
          termAudio: mediaId(c.termAudio),
          defAudio: mediaId(c.defAudio),
          ...(Number(c.edited) > 0 ? { edited: Number(c.edited) } : {}), // 这张最后改的时间 (同步时一张一张合)
          ...(raw.kind === 'quiz' ? { q: cleanQuestion(c.q) ?? newQuestion() } : {}),
        }))
    : [];
  const ids = new Set(cards.map((c) => c.id));
  const onlyCards = (list) =>
    Array.isArray(list) ? [...new Set(list.filter((id) => ids.has(id)))] : [];
  const cardMap = (obj, clean) => {
    const out = {};
    if (obj && typeof obj === 'object') {
      for (const [id, v] of Object.entries(obj)) {
        if (!ids.has(id)) continue;
        const c = clean(v);
        if (c !== null) out[id] = c;
      }
    }
    return out;
  };
  const best = cleanBest(raw.best);
  return makeSet({
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    termLang: typeof raw.termLang === 'string' ? raw.termLang : 'auto',
    defLang: typeof raw.defLang === 'string' ? raw.defLang : 'auto',
    cards,
    known: onlyCards(raw.known),
    starred: onlyCards(raw.starred),
    learn: cardMap(raw.learn, (v) => ([0, 1, 2].includes(v) ? v : null)),
    stats: cardMap(raw.stats, (v) => {
      if (!v || typeof v !== 'object') return null;
      const out = { right: Math.max(0, Number(v.right) || 0), wrong: Math.max(0, Number(v.wrong) || 0) };
      if (Number(v.due) > 0) Object.assign(out, { interval: Math.max(0, Number(v.interval) || 0), ease: Number(v.ease) || 2.5, due: Number(v.due) });
      if (Number(v.s) > 0 && Number(v.d) >= 1) Object.assign(out, { s: Number(v.s), d: Math.min(10, Number(v.d)) }); // FSRS 的稳定性、难度
      if (Number(v.at) > 0) out.at = Number(v.at); // 最后一次答这张的时间 (同步时用)
      if (out.due && Number(v.first) > 0) out.first = Number(v.first);
      if (out.due && Number.isSafeInteger(v.n) && v.n > 0) out.n = v.n;
      if (Number.isSafeInteger(v.lapses) && v.lapses > 0) out.lapses = v.lapses;
      if (Number(v.sus) > 0) out.sus = Number(v.sus);
      if (Number(v.bury) > Date.now()) out.bury = Number(v.bury); // 过了那天的不用留
      if (Number(v.flag) > 0) out.flag = Number(v.flag); // 暂停、明天再说改的时间
      if (Number(v.rev) > 0) out.rev = Number(v.rev);
      return out;
    }),
    best,
    diagram: cleanDiagram(raw.diagram, ids),
    kind: raw.kind === 'quiz' ? 'quiz' : 'cards',
    runs: cleanRuns(raw.runs),
    plan: raw.kind === 'quiz' ? null : cleanPlan(raw.plan),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    progressAt: Number(raw.progressAt) || 0,
  });
}

function cleanBest(raw) {
  const best = {};
  for (const key of ['match', 'blast', 'blocks', 'gems', 'wordle', 'quiz']) {
    const v = Number(raw?.[key]);
    if (Number.isFinite(v) && v > 0) best[key] = v;
  }
  return best;
}

function cleanFolder(raw, setIds) {
  if (!raw || typeof raw !== 'object') return null;
  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: String(raw.name ?? ''),
    setIds: Array.isArray(raw.setIds) ? [...new Set(raw.setIds.filter((id) => setIds.has(id)))] : [],
    best: cleanBest(raw.best),
    plan: cleanPlan(raw.plan),
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now,
  };
}

export function cleanData(raw) {
  const data = emptyData();
  if (raw && Array.isArray(raw.sets)) {
    for (const s of raw.sets) {
      const set = cleanSet(s);
      if (set) data.sets.push(set);
    }
  }
  if (raw && raw.deleted && typeof raw.deleted === 'object') {
    const old = Date.now() - DELETED_KEEP_MS;
    for (const [id, t] of Object.entries(raw.deleted)) if (Number(t) > old) data.deleted[id] = Number(t);
  }
  if (raw && raw.activity && typeof raw.activity === 'object') {
    for (const [day, n] of Object.entries(raw.activity)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number(n) > 0) data.activity[day] = Math.floor(Number(n));
    }
  }
  data.undone = recentLog(cleanLog(raw?.undone), Date.now() - DELETED_KEEP_MS);
  // 只留还在的卡片的 (删掉的卡片集、卡片的不要), 撤销了的去掉
  const cardIds = new Set(data.sets.flatMap((s) => s.cards.map((c) => c.id)));
  const revlog = Object.fromEntries(Object.entries(cleanLog(raw?.revlog)).filter(([id]) => cardIds.has(id)));
  data.revlog = subtractLogs(revlog, data.undone);
  data.settings = cleanSettings(raw?.settings);
  data.pet = cleanPet(raw?.pet);
  if (raw && Array.isArray(raw.mistakes)) {
    const seen = new Set();
    for (const m of raw.mistakes) {
      const clean = cleanMistake(m);
      if (!clean || seen.has(clean.id)) continue;
      seen.add(clean.id);
      data.mistakes.push(clean);
    }
  }
  if (raw && Array.isArray(raw.folders)) {
    const ids = new Set(data.sets.map((s) => s.id));
    for (const f of raw.folders) {
      const folder = cleanFolder(f, ids);
      if (folder) data.folders.push(folder);
    }
  }
  return data;
}

export class Store {
  // storage 默认是浏览器的 localStorage; 测试时换成假的。
  // batch: 答题这种一秒好几次的, 攒一下过一会儿再一起存 (卡片多了存一次要几十毫秒, 手机上点一下会顿); 网页里用
  constructor(storage = globalThis.localStorage, { batch = false } = {}) {
    this.storage = storage;
    this.batch = batch;
    this.saveTimer = null;
    this.data = this.load();
    this.applyParameters();
  }

  // 一会儿再存 (batch 关着就马上存)
  saveSoon() {
    if (!this.batch) return this.save();
    this.saveTimer ??= setTimeout(() => this.save(), 400);
    return true;
  }

  // 有攒着没存的马上存 (离开页面、切到别的应用时)
  flush() {
    if (this.saveTimer) this.save();
  }

  // 排复习用存着的 FSRS 参数 (按自己的记录优化过的, 没有就默认的)。
  // recompute: 参数变了 (别的设备优化过、同步过来的), 有完整记录的卡片按新参数重算记忆状态
  applyParameters({ recompute = false } = {}) {
    const w = this.data.settings.fsrs?.w ?? null;
    useParameters(w, this.data.settings.retention);
    const key = JSON.stringify(w);
    if (recompute && this.paramKey !== undefined && key !== this.paramKey) this.recomputeMemory();
    this.paramKey = key;
  }

  // 有完整记录的卡片按现在的参数从头算一遍稳定性、难度 (排好的复习日子不动)。返回算了几张
  recomputeMemory() {
    let n = 0;
    for (const set of this.data.sets) {
      for (const card of set.cards) {
        const stat = set.stats[card.id];
        const list = fullHistory(stat, this.data.revlog, card.id);
        const r = list && replay(list);
        if (!r) continue;
        stat.s = r.s;
        stat.d = r.d;
        n++;
      }
    }
    return n;
  }

  // 读不出来 (坏了、浏览器不让读): 当成空的, 记下 loadError (这时别清图片录音, 不然全没了); 坏了的原样另存一份
  load() {
    this.loadError = false;
    let text = null;
    try {
      text = this.storage?.getItem(KEY);
      return text ? cleanData(JSON.parse(text)) : emptyData();
    } catch {
      this.loadError = true;
      try {
        if (text) this.storage?.setItem(`${KEY}:broken-${Date.now()}`, text);
      } catch {
        // 存不下就算了
      }
      return emptyData();
    }
  }

  // 别的标签页改了, 重新读一遍
  reload() {
    if (this.saveTimer) {
      // 这边还有攒着没存的 (刚答的题): 跟那边存的合起来再存, 两边的都不丢
      this.data = cleanData(mergeData(this.data, this.load()));
      this.applyParameters();
      this.save();
      return;
    }
    this.data = this.load();
    this.applyParameters();
  }

  // 同步拿回来合并好的数据, 整个换掉
  replaceData(data) {
    this.data = cleanData(data);
    this.applyParameters({ recompute: true });
    return this.save({ fromSync: true });
  }

  // 存不下 (超过浏览器给的空间、无痕模式) 时不抛错, 调 onSaveError 提示一下, 返回 false。
  // 存好了调 onChange (同步用; 同步自己存的不算)
  save({ fromSync = false } = {}) {
    if (this.holding) return true; // transaction 里: 最后一起存
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data, compact));
      if (!fromSync) this.onChange?.();
      return true;
    } catch (e) {
      this.onSaveError?.(e);
      return false;
    }
  }

  // 一下改好几样 (导入时建好几个卡片集、文件夹、接上复习记录): 中间不存, 最后存一次;
  // 存不下就全退回去 (浏览器里、存着的都跟开始以前一样), 抛错 (error.size 一共要存多少字)
  transaction(fn) {
    this.flush();
    const before = structuredClone(this.data);
    this.holding = true;
    let result;
    try {
      result = fn();
    } catch (e) {
      this.holding = false;
      this.data = before;
      this.applyParameters();
      throw e;
    }
    this.holding = false;
    if (!this.save()) {
      const size = this.size();
      this.data = before;
      this.applyParameters();
      throw Object.assign(new Error('存不下了'), { size });
    }
    return result;
  }

  // 存起来大概多少字 (浏览器给的 localStorage 一般 500 万字左右, iPhone 上少一些)
  size() {
    try {
      return JSON.stringify(this.data, compact).length;
    } catch {
      return 0;
    }
  }

  // 最近改过的在前面
  allSets() {
    return [...this.data.sets].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // id 是「folder:文件夹 id」时, 返回把文件夹里的卡片集合起来的临时卡片集
  getSet(id) {
    if (typeof id === 'string' && id.startsWith(FOLDER_PREFIX)) return this.folderSet(id.slice(FOLDER_PREFIX.length));
    return this.data.sets.find((s) => s.id === id) ?? null;
  }

  // 合起来的卡片集: 卡片是各卡片集的; 会了 / 星标 / 学习程度每次读都从各卡片集现算,
  // 写的时候 (setKnown 这些) 记回卡片原来的卡片集
  folderSet(folderId) {
    const folder = this.getFolder(folderId);
    if (!folder) return null;
    const members = () => folder.setIds.map((sid) => this.data.sets.find((s) => s.id === sid)).filter(Boolean);
    const sets = members();
    const same = (key) => {
      const values = [...new Set(sets.map((s) => s[key]))];
      return values.length === 1 ? values[0] : 'auto';
    };
    return {
      id: FOLDER_PREFIX + folder.id,
      folderId: folder.id,
      virtual: true,
      title: folder.name || '未命名文件夹',
      description: '',
      termLang: same('termLang'),
      defLang: same('defLang'),
      cards: sets.flatMap((s) => s.cards),
      get known() {
        return members().flatMap((s) => s.known);
      },
      get starred() {
        return members().flatMap((s) => s.starred);
      },
      get learn() {
        return Object.assign({}, ...members().map((s) => s.learn));
      },
      get stats() {
        return Object.assign({}, ...members().map((s) => s.stats));
      },
      get best() {
        return folder.best;
      },
      get plan() {
        return folder.plan ?? null;
      },
    };
  }

  // 定了每天背新词计划的文件夹 (合起来的卡片集)
  plannedFolders() {
    return this.data.folders.filter((f) => f.plan?.on && f.setIds.length).map((f) => this.folderSet(f.id));
  }

  // 这张卡片的进度该记到哪个卡片集 (合起来学的时候是卡片原来的卡片集)
  ownerOf(setId, cardId) {
    const set = this.data.sets.find((s) => s.id === setId);
    if (set) return set;
    if (typeof setId === 'string' && setId.startsWith(FOLDER_PREFIX)) {
      return this.data.sets.find((s) => s.cards.some((c) => c.id === cardId)) ?? null;
    }
    return null;
  }

  // 卡片集本身, 或者文件夹里的那几个
  setsOf(setId) {
    if (typeof setId === 'string' && setId.startsWith(FOLDER_PREFIX)) {
      const folder = this.getFolder(setId.slice(FOLDER_PREFIX.length));
      return folder ? folder.setIds.map((sid) => this.data.sets.find((s) => s.id === sid)).filter(Boolean) : [];
    }
    const set = this.data.sets.find((s) => s.id === setId);
    return set ? [set] : [];
  }

  // 新建或整个替换一个卡片集; 卡片删了, 它的「会了」「星标」也跟着去掉
  putSet(set, { touch = true } = {}) {
    const clean = cleanSet(set);
    this.counts = null;
    if (touch) clean.updatedAt = Date.now();
    const i = this.data.sets.findIndex((s) => s.id === clean.id);
    const prev = this.data.sets[i];
    const deletedBefore = { ...this.data.deleted };
    if (prev) stampCards(clean, prev, Date.now(), this.data.deleted);
    if (i === -1) this.data.sets.push(clean);
    else this.data.sets[i] = clean;
    // 存不下: 退回去 (不然浏览器里有、存着的没有, 以后每次存都失败), 编辑页靠这个提示「存不下了」
    if (!this.save()) {
      if (i === -1) this.data.sets.pop();
      else this.data.sets[i] = prev;
      this.data.deleted = deletedBefore;
      throw new Error('存不下了');
    }
    return clean;
  }

  deleteSet(id) {
    this.data.sets = this.data.sets.filter((s) => s.id !== id);
    this.counts = null;
    this.data.deleted[id] = Date.now();
    for (const f of this.data.folders) f.setIds = f.setIds.filter((sid) => sid !== id);
    this.save();
    this.forgetLocal(id);
  }

  // 这个卡片集 (或文件夹) 在浏览器里另外记的东西: 单词卡背到哪了、学习目标、学哪些、Wordle 连胜
  forgetLocal(id) {
    try {
      for (const kind of LOCAL_KINDS) this.storage?.removeItem(`wengu:${kind}:${id}`);
    } catch {
      // 删不掉就算了
    }
  }

  // 已经没有了的卡片集、文件夹 (别的设备删的, 同步过来) 另外记的东西也删掉; 首页收起的文件夹也是。返回删了几个
  pruneLocal() {
    const s = this.storage;
    if (!s || typeof s.key !== 'function') return 0;
    const ids = new Set([...this.data.sets.map((x) => x.id), ...this.data.folders.map((f) => FOLDER_PREFIX + f.id)]);
    const drop = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const m = LOCAL_KEY.exec(s.key(i) ?? '');
        if (m && !ids.has(m[2])) drop.push(m[0]);
      }
      for (const key of drop) s.removeItem(key);
      const collapsed = JSON.parse(s.getItem(COLLAPSED_KEY) ?? 'null');
      if (Array.isArray(collapsed)) {
        const kept = collapsed.filter((id) => ids.has(FOLDER_PREFIX + id));
        if (kept.length < collapsed.length) s.setItem(COLLAPSED_KEY, JSON.stringify(kept));
      }
    } catch {
      // 删不掉就算了
    }
    return drop.length;
  }

  // ---- 错题集 ----
  // 最近记的在前面
  allMistakes() {
    return [...this.data.mistakes].sort((a, b) => b.createdAt - a.createdAt);
  }

  getMistake(id) {
    return this.data.mistakes.find((m) => m.id === id) ?? null;
  }

  // 新记的明天开始排进复习; 改题目不动重做记录
  putMistake(mistake, now = Date.now()) {
    const clean = cleanMistake({ ...mistake, updatedAt: now });
    const i = this.data.mistakes.findIndex((m) => m.id === clean.id);
    const prev = this.data.mistakes[i];
    if (i === -1) {
      clean.createdAt = now;
      clean.review ??= firstReview(now);
      this.data.mistakes.push(clean);
    } else {
      clean.review = prev.review;
      clean.createdAt = prev.createdAt;
      this.data.mistakes[i] = clean;
    }
    if (!this.save()) {
      // 存不下: 退回去
      if (i === -1) this.data.mistakes.pop();
      else this.data.mistakes[i] = prev;
      throw new Error('存不下了');
    }
    return clean;
  }

  deleteMistake(id) {
    this.data.mistakes = this.data.mistakes.filter((m) => m.id !== id);
    this.data.deleted[MISTAKE_PREFIX + id] = Date.now();
    this.save();
  }

  // 重做了一道: 排下次哪天, 算进今天的打卡
  recordMistake(id, correct, now = Date.now()) {
    const m = this.getMistake(id);
    if (!m) return null;
    m.review = reviewAfter(m.review, correct, now);
    this.touchActivity(now);
    this.save();
    return m.review;
  }

  // ---- 文件夹 ----
  allFolders() {
    return [...this.data.folders].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getFolder(id) {
    return this.data.folders.find((f) => f.id === id) ?? null;
  }

  putFolder(folder) {
    const clean = cleanFolder(folder, new Set(this.data.sets.map((s) => s.id)));
    clean.updatedAt = Date.now();
    const i = this.data.folders.findIndex((f) => f.id === clean.id);
    const prev = this.data.folders[i];
    if (i === -1) this.data.folders.push(clean);
    else this.data.folders[i] = clean;
    // 存不下: 退回去, 返回 null (onSaveError 已经提示了)
    if (!this.save()) {
      if (i === -1) this.data.folders.pop();
      else this.data.folders[i] = prev;
      return null;
    }
    return clean;
  }

  deleteFolder(id) {
    this.data.folders = this.data.folders.filter((f) => f.id !== id);
    this.data.deleted[FOLDER_PREFIX + id] = Date.now();
    this.save();
    this.forgetLocal(FOLDER_PREFIX + id);
  }

  // 卡片集放进 / 拿出文件夹
  setInFolder(folderId, setId, inside) {
    const folder = this.getFolder(folderId);
    if (!folder || !this.data.sets.some((s) => s.id === setId)) return;
    const has = folder.setIds.includes(setId);
    if (inside && !has) folder.setIds.push(setId);
    if (!inside && has) folder.setIds = folder.setIds.filter((sid) => sid !== setId);
    folder.updatedAt = Date.now();
    this.save();
  }

  // 文件夹里的卡片集往前 (-1) / 往后 (1) 挪一个
  moveInFolder(folderId, setId, delta) {
    const folder = this.getFolder(folderId);
    const i = folder?.setIds.indexOf(setId) ?? -1;
    const j = i + delta;
    if (i < 0 || j < 0 || j >= folder.setIds.length) return;
    [folder.setIds[i], folder.setIds[j]] = [folder.setIds[j], folder.setIds[i]];
    folder.updatedAt = Date.now();
    this.save();
  }

  foldersOf(setId) {
    return this.data.folders.filter((f) => f.setIds.includes(setId));
  }

  // 学着学着改一张卡片的字。算改了卡片集 (动 updatedAt, 同步时听这边的); 合起来学的时候改回卡片原来的卡片集
  updateCard(setId, cardId, { term, def }) {
    const set = this.ownerOf(setId, cardId);
    const card = set?.cards.find((c) => c.id === cardId);
    if (!card) return null;
    const before = { term: card.term, def: card.def, edited: card.edited, updatedAt: set.updatedAt };
    if (typeof term === 'string') card.term = term;
    if (typeof def === 'string') card.def = def;
    set.updatedAt = card.edited = Date.now();
    if (!this.save()) {
      // 存不下: 退回去 (不然看着改了、其实没存, 以后存什么都失败)
      Object.assign(card, before);
      if (!before.edited) delete card.edited;
      set.updatedAt = before.updatedAt;
      throw new Error('存不下了');
    }
    return card;
  }

  // 记「会了 / 还不会」, 不算改了卡片集, 所以不动 updatedAt
  setKnown(setId, cardId, known) {
    const set = this.ownerOf(setId, cardId);
    if (!set) return;
    const has = set.known.includes(cardId);
    if (known && !has) set.known.push(cardId);
    if (!known && has) set.known = set.known.filter((id) => id !== cardId);
    set.progressAt = Date.now();
    this.saveSoon();
  }

  resetKnown(setId) {
    for (const set of this.setsOf(setId)) Object.assign(set, { known: [], progressAt: Date.now() });
    this.save();
  }

  // 学习模式的程度, 一次存好几张: { 卡片 id: 0|1|2 }
  setLevels(setId, levels) {
    for (const [id, level] of Object.entries(levels)) {
      const set = this.ownerOf(setId, id);
      if (set?.cards.some((c) => c.id === id) && [0, 1, 2].includes(level)) {
        set.learn[id] = level;
        set.progressAt = Date.now();
      }
    }
    this.saveSoon();
  }

  resetLearn(setId) {
    for (const set of this.setsOf(setId)) Object.assign(set, { learn: {}, progressAt: Date.now() });
    this.save();
  }

  // 每天有几张要复习 (到期日子错开时挑少的那天), 所有卡片集一起: 数一遍记着 (几万张数一遍要好几毫秒, 手机上更慢),
  // 答一张改一下 (countDue); 卡片集换了、暂停了、撤销了这些就扔掉重数 (this.counts = null)。
  // 按「离今天 0 点几天」记: 今天以内的算 0, 以后的四舍五入 (不用一张张换算日期, 夏令时差一小时也还是那天)
  dayCounts(now = Date.now()) {
    const today0 = startOfDay(now);
    if (this.counts?.data !== this.data || this.counts.today0 !== today0) {
      this.counts = { data: this.data, today0, tomorrow0: daysLater(now, 1), map: new Map() };
      for (const set of this.data.sets) for (const id in set.stats) this.countDue(set.stats[id], 1);
    }
    return this.counts;
  }

  countDue(stat, delta) {
    const c = this.counts;
    if (!c || !(stat?.due > 0) || stat.sus) return;
    const day = stat.due < c.tomorrow0 ? 0 : Math.round((stat.due - c.today0) / DAY);
    c.map.set(day, (c.map.get(day) ?? 0) + delta);
  }

  // 那几天 (0 点的时间) 各有几张要复习: load([时间]) → [张数]; add(due) 又排好一张 (一下排好多张时)
  dueLoad(now = Date.now()) {
    return {
      load: (days) => {
        const c = this.dayCounts(now);
        // 有今天以前的日子 (从 Anki 搬来、早就到日子了的): 今天那格是所有积压的, 比不出哪天少, 不看
        if (days.some((t) => t < c.tomorrow0)) return null;
        return days.map((t) => c.map.get(Math.round((t - c.today0) / DAY)) ?? 0);
      },
      add: (due) => this.countDue({ due }, 1),
    };
  }

  // 翻卡自评一张, 下次哪天复习 (不记下来; 按钮上写「3 天后」用, 跟点了以后排的一样)
  nextReview(stat, cardId, correct, now = Date.now(), load = this.dueLoad(now).load) {
    return schedule(stat, correct, now, { seed: `${cardId}:${stat?.n ?? 0}:${stat?.at ?? 0}`, load });
  }

  // 两个按钮各排到哪天: { again, good } (每个是 schedule 返回的 { interval, due ... })
  previewAnswer(setId, cardId, now = Date.now()) {
    const stat = this.ownerOf(setId, cardId)?.stats[cardId];
    const { load } = this.dueLoad(now);
    return { again: this.nextReview(stat, cardId, false, now, load), good: this.nextReview(stat, cardId, true, now, load) };
  }

  // 答了一题: 记答对答错几次、今天学过 (打卡)。
  // selfRated: 翻卡自评 (单词卡、今天的复习、学习里的单词卡题) 才用 FSRS 排下次复习 (日子错开)、记进复习记录、
  // 数忘了几次 (难记卡); 选择题、打字、测试、游戏只算次数, 不动复习的日子
  recordAnswer(setId, cardId, correct, { save = true, now = Date.now(), selfRated = false } = {}) {
    const set = this.ownerOf(setId, cardId);
    if (!set || !set.cards.some((c) => c.id === cardId)) return;
    const s = (set.stats[cardId] ??= { right: 0, wrong: 0 });
    let code = null;
    if (selfRated) {
      now = this.freeTime(cardId, correct, now);
      if (isLapse(s, correct, now)) s.lapses = (s.lapses ?? 0) + 1;
      const next = this.nextReview(s, cardId, correct, now);
      this.countDue(s, -1);
      if (!(s.due > 0)) Object.assign(s, { first: now, n: 0 }); // 新词今天开始背
      Object.assign(s, next, { at: now });
      this.countDue(s, 1);
      if (s.n >= 0) s.n++;
      code = addReview(this.data.revlog, cardId, now, correct);
    }
    if (correct) s.right++;
    else s.wrong++;
    this.touchActivity(now);
    if (save) this.saveSoon();
    return code; // 记进复习记录的那一条 (撤销时用)
  }

  // 复习记录按秒记: 同一秒里同一张同样的评分 (忘了马上又忘了、撤销了马上又点) 会被当成同一次合掉、撤销掉。
  // 这一秒有了就往后挪一秒
  freeTime(cardId, correct, now) {
    const taken = new Set([...unpack(this.data.revlog[cardId]), ...unpack(this.data.undone[cardId])]);
    let t = now;
    for (let i = 0; i < 60 && taken.has(encodeReview(t, correct ? GOOD : AGAIN)); i++) t += 1000;
    return t;
  }

  // 从 Anki 搬来的复习记录: entries = [[卡片 id, [{ at, rating }], 在 Anki 里暂停了]]。按一遍 FSRS 接着 Anki 的进度排
  // (到期日子错开, 一起导入的不挤在同一天), 也记进复习记录。这里已经复习过的卡片不动排期。
  // Anki 里暂停了的这里也暂停。返回接上了几张
  importReviews(setId, entries, now = Date.now()) {
    const set = this.data.sets.find((s) => s.id === setId);
    if (!set) return 0;
    const ids = new Set(set.cards.map((c) => c.id));
    const days = this.dueLoad(now);
    let n = 0;
    let changed = false;
    for (const [cardId, reviews, suspended] of entries) {
      if (!ids.has(cardId)) continue;
      if (reviews?.length) {
        addReviews(this.data.revlog, cardId, reviews);
        if (!set.stats[cardId]?.at) {
          set.stats[cardId] = { ...replay(reviews, { seed: cardId, load: days.load }), first: reviews.reduce((t, r) => Math.min(t, r.at), Infinity), n: historyOf(this.data.revlog, cardId).length };
          if (!set.stats[cardId].lapses) delete set.stats[cardId].lapses;
          if (!suspended) days.add(set.stats[cardId].due);
        }
        n++;
        changed = true;
      }
      if (suspended && !set.stats[cardId]?.sus) {
        set.stats[cardId] = { right: 0, wrong: 0, ...set.stats[cardId], sus: now, flag: now };
        changed = true;
      }
    }
    this.counts = null;
    if (changed) this.save();
    return n;
  }

  // 暂停 / 不暂停几张卡片 (暂停了不排复习、不当新词出, 记录都留着)。返回改了几张
  suspend(setId, cardIds, on = true, now = Date.now()) {
    let n = 0;
    for (const cardId of cardIds) {
      const set = this.ownerOf(setId, cardId);
      if (!set?.cards.some((c) => c.id === cardId)) continue;
      const stat = (set.stats[cardId] ??= { right: 0, wrong: 0 });
      if (Boolean(stat.sus) === on) continue;
      if (on) stat.sus = now;
      else delete stat.sus;
      stat.flag = now;
      n++;
    }
    this.counts = null;
    if (n) this.save();
    return n;
  }

  // 今天先不背这张, 明天再说 (Anki 的「搁置」)
  bury(setId, cardId, now = Date.now()) {
    const set = this.ownerOf(setId, cardId);
    if (!set?.cards.some((c) => c.id === cardId)) return;
    Object.assign((set.stats[cardId] ??= { right: 0, wrong: 0 }), { bury: daysLater(now, 1), flag: now });
    this.counts = null;
    this.save();
  }

  // 撤销暂停、明天再说、练习里答的: 一张卡片的统计换回以前的样子 (复习记录不动)。
  // 暂停、明天再说记 flag (同步时这两样听后改的那边, 不连着复习的日子一起盖掉); 练习答的记 rev
  putStat(setId, cardId, stat, now = Date.now()) {
    const set = this.ownerOf(setId, cardId);
    if (!set) return;
    const cur = set.stats[cardId];
    const flagged = Boolean(cur?.sus) !== Boolean(stat?.sus) || Boolean(cur?.bury) !== Boolean(stat?.bury);
    set.stats[cardId] = { ...(stat ?? { right: 0, wrong: 0 }), ...(flagged ? { flag: now } : { rev: now }) };
    this.counts = null;
    this.save();
  }

  // 每天的计划 (plan.js): 改几项, 别的照旧。setId 是「folder:文件夹 id」时定在文件夹上
  setPlan(setId, changes, now = Date.now()) {
    if (typeof setId === 'string' && setId.startsWith(FOLDER_PREFIX)) {
      const folder = this.getFolder(setId.slice(FOLDER_PREFIX.length));
      if (!folder) return null;
      folder.plan = cleanPlan({ ...folder.plan, ...changes, at: now });
      this.save();
      return folder.plan;
    }
    const set = this.data.sets.find((s) => s.id === setId);
    if (!set || set.kind === 'quiz') return null;
    set.plan = cleanPlan({ ...set.plan, ...changes, at: now });
    this.save();
    return set.plan;
  }

  get reviewCap() {
    return this.data.settings.reviewsPerDay;
  }

  setReviewCap(n, now = Date.now()) {
    this.data.settings = cleanSettings({ ...this.data.settings, reviewsPerDay: n, at: now });
    this.save();
  }

  get retention() {
    return this.data.settings.retention;
  }

  // 想记住的把握 (0.70–0.97): 下次复习起按新的排 (已经排好的日子不动, 跟 Anki 一样)
  setRetention(r, now = Date.now()) {
    this.data.settings = cleanSettings({ ...this.data.settings, retention: r, at: now });
    this.applyParameters();
    this.save();
  }

  // 换 FSRS 参数 (按自己的记录优化出来的; null 换回默认的)。有完整记录的卡片按新参数重算记忆状态 (稳定性、难度),
  // 排好的复习日子不动 (下次复习起按新的排)。返回重算了几张
  setParameters(fsrs, now = Date.now()) {
    const clean = fsrs ? cleanFsrs({ ...fsrs, at: fsrs.at || now }) : null;
    this.data.settings = { ...this.data.settings, fsrs: clean, fsrsAt: now };
    this.applyParameters();
    const n = this.recomputeMemory();
    this.save();
    return n;
  }

  // 撤销时把一张卡片的统计恢复成以前的样子 (null 就是以前没有), 复习记录里去掉那一条 (code, recordAnswer 给的)。
  // 记下撤销的时间和去掉的那条, 同步时另一台设备上还没撤销的不会又合回来
  restoreStat(setId, cardId, stat, code = null, now = Date.now()) {
    const set = this.ownerOf(setId, cardId);
    if (!set) return;
    set.stats[cardId] = { ...(stat ?? { right: 0, wrong: 0 }), rev: now };
    this.counts = null;
    const dropped = dropReview(this.data.revlog, cardId, code);
    if (dropped !== null) this.data.undone[cardId] = pack([...unpack(this.data.undone[cardId]), dropped]);
    this.save();
  }

  // 撤销了那一题: 那天答的题数退回一个 (调的地方接着存)
  untouchActivity(at) {
    const key = dayKey(at);
    if (this.data.activity[key] > 1) this.data.activity[key]--;
    else delete this.data.activity[key];
  }

  // 今天学过 (连续打卡)
  touchActivity(now = Date.now()) {
    const key = dayKey(now);
    this.data.activity[key] = (this.data.activity[key] ?? 0) + 1;
    // 一年多以前的不留 (温温吃过的先记下来)
    const keys = Object.keys(this.data.activity).sort();
    if (keys.length <= 400) return;
    const gone = keys.slice(0, keys.length - 400);
    this.data.pet = bankDays(this.data.pet, gone.map((k) => [k, this.data.activity[k]]), keys[gone.length]);
    for (const k of gone) delete this.data.activity[k];
  }

  // 温温: 改名字、换装扮 (stamp: 记下改的时间, 同步时听后改的); 解锁、长大、庆祝过的直接合
  updatePet(patch, { stamp = false, now = Date.now() } = {}) {
    const old = this.data.pet ?? cleanPet({});
    this.data.pet = cleanPet({ ...old, ...patch, at: stamp ? Math.max(now, old.at + 1) : old.at });
    this.save();
    return this.data.pet;
  }

  // 判错了, 用户说「我答对了」: 把记的一次错改成对 (测试里的; 不是翻卡自评, 不动复习的日子)
  amendAnswer(setId, cardId) {
    const s = this.ownerOf(setId, cardId)?.stats[cardId];
    if (!s || s.wrong === 0) return;
    s.wrong--;
    s.right++;
    this.save();
  }

  // 游戏成绩: 配对比谁快 (越小越好), 别的越大越好。破纪录返回 true
  recordBest(setId, game, value) {
    // 合起来学时, 成绩记在文件夹上
    const folderId = String(setId).startsWith(FOLDER_PREFIX) ? String(setId).slice(FOLDER_PREFIX.length) : null;
    const set = this.data.sets.find((s) => s.id === setId) ?? (folderId ? this.getFolder(folderId) : null);
    if (!set || !(value > 0)) return false;
    const old = set.best[game];
    const better = game === 'match' ? old === undefined || value < old : old === undefined || value > old;
    if (better) set.best[game] = value;
    this.touchActivity();
    this.save();
    return better;
  }

  // 题目集答完一次: 记成绩 (留最近几次), 答了几题算进今天的打卡。限时的破纪录返回 true
  recordRun(setId, run, now = Date.now()) {
    const set = this.data.sets.find((s) => s.id === setId);
    if (!set) return false;
    set.runs = cleanRuns([{ ...run, at: now }, ...(set.runs ?? [])]);
    const better = Boolean(run.timed) && run.score > 0 && !(set.best.quiz >= run.score);
    if (better) set.best.quiz = run.score;
    for (let i = 0; i < run.total; i++) this.touchActivity(now);
    this.save();
    return better;
  }

  toggleStar(setId, cardId) {
    const set = this.ownerOf(setId, cardId);
    if (!set) return false;
    const has = set.starred.includes(cardId);
    set.starred = has ? set.starred.filter((id) => id !== cardId) : [...set.starred, cardId];
    set.progressAt = Date.now();
    this.save();
    return !has;
  }

  exportBackup() {
    return JSON.stringify({ app: 'wengu', ...this.data }, null, 2);
  }

  // 备份里的卡片集加进来; 同一个卡片集 (id 一样) 用备份里的替换。
  // 返回 { added, replaced }
  // 备份里的算刚改过的 (同步时听备份的, 不会被别的设备的旧内容、删除记录又盖掉; 删掉了的也恢复回来)。
  // 一起存: 存不下就全不要, 抛错 (error.size)
  importBackup(text, now = Date.now()) {
    const incoming = cleanData(JSON.parse(text));
    return this.transaction(() => this.mergeBackup(incoming, now));
  }

  // 这里没有的 (删掉了的、别的设备的) 加回来, 算刚改过的 (同步时不会被删除记录、别的设备又去掉);
  // 这里还有的跟备份合在一起 (跟同步一样: 后改的为准, 新加的卡片都留下), 不会把这里后来改的、背的退回去
  mergeBackup(incoming, now) {
    this.counts = null;
    let added = 0;
    let replaced = 0;
    const revive = (key, x) => {
      const t = Math.max(now, (this.data.deleted[key] ?? 0) + 1); // 比删掉的时间晚
      delete this.data.deleted[key];
      x.updatedAt = Math.max(x.updatedAt ?? 0, t);
      if ('progressAt' in x) x.progressAt = Math.max(x.progressAt ?? 0, t);
    };
    for (const set of incoming.sets) {
      const i = this.data.sets.findIndex((s) => s.id === set.id);
      if (i === -1) {
        revive(set.id, set);
        this.data.sets.push(set);
        added++;
      } else {
        this.data.sets[i] = cleanSet(mergeSet(this.data.sets[i], set, this.data.deleted));
        replaced++;
      }
    }
    // 打卡记录: 同一天取多的
    for (const [day, n] of Object.entries(incoming.activity)) {
      this.data.activity[day] = Math.max(this.data.activity[day] ?? 0, n);
    }
    const setIds = new Set(this.data.sets.map((s) => s.id));
    for (const folder of incoming.folders) {
      const i = this.data.folders.findIndex((f) => f.id === folder.id);
      if (i === -1) {
        revive(FOLDER_PREFIX + folder.id, folder);
        this.data.folders.push(folder);
      } else this.data.folders[i] = cleanFolder(mergeFolder(this.data.folders[i], folder), setIds);
    }
    this.data.undone = mergeLogs(this.data.undone, incoming.undone);
    this.data.revlog = subtractLogs(mergeLogs(this.data.revlog, incoming.revlog), this.data.undone);
    this.data.settings = mergeSettings(this.data.settings, incoming.settings);
    this.data.pet = mergePet(this.data.pet, incoming.pet);
    this.applyParameters({ recompute: true });
    for (const m of incoming.mistakes) {
      const i = this.data.mistakes.findIndex((x) => x.id === m.id);
      if (i === -1) {
        revive(MISTAKE_PREFIX + m.id, m);
        this.data.mistakes.push(m);
      } else this.data.mistakes[i] = cleanMistake(mergeMistake(this.data.mistakes[i], m));
    }
    this.save();
    return { added, replaced };
  }
}
