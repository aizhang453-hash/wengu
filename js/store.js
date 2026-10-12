// 卡片集都存在浏览器的 localStorage 里, 不用注册、不用服务器。
// 清浏览器数据会丢, 所以首页有「导出备份」。

export const KEY = 'wengu:v1';

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyData() {
  return { version: 1, sets: [], folders: [] };
}

// 文件夹: { id, name, setIds: [卡片集 id...], best: {}, createdAt, updatedAt }
export function makeFolder(name = '') {
  const now = Date.now();
  return { id: newId(), name, setIds: [], best: {}, createdAt: now, updatedAt: now };
}

export const FOLDER_PREFIX = 'folder:';

// 一个卡片集:
// { id, title, description, termLang, defLang,
//   cards: [{ id, term, def, image, termAudio, defAudio }]  (图片、录音是 media.js 里的 id, 没有就是 '')
//   known: [卡片 id...]        单词卡里标了「会了」的
//   starred: [卡片 id...]      星标
//   learn: { 卡片 id: 0|1|2 }  学习模式的程度 (没学过 / 认得了 / 掌握了)
//   stats: { 卡片 id: { right, wrong } }  学习、测试里答对答错几次
//   best: { match: 毫秒, blast: 分 }       游戏最好成绩
//   createdAt, updatedAt }
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
    createdAt: now,
    updatedAt: now,
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
    stats: cardMap(raw.stats, (v) =>
      v && typeof v === 'object' ? { right: Math.max(0, Number(v.right) || 0), wrong: Math.max(0, Number(v.wrong) || 0) } : null,
    ),
    best,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  });
}

function cleanBest(raw) {
  const best = {};
  for (const key of ['match', 'blast']) {
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
  // storage 默认是浏览器的 localStorage; 测试时换成假的
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    try {
      const text = this.storage?.getItem(KEY);
      return text ? cleanData(JSON.parse(text)) : emptyData();
    } catch {
      return emptyData();
    }
  }

  // 别的标签页改了, 重新读一遍
  reload() {
    this.data = this.load();
  }

  // 存不下 (超过浏览器给的空间) 会抛错, 交给调用的地方提示
  save() {
    this.storage?.setItem(KEY, JSON.stringify(this.data));
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
    };
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
    if (touch) clean.updatedAt = Date.now();
    const i = this.data.sets.findIndex((s) => s.id === clean.id);
    if (i === -1) this.data.sets.push(clean);
    else this.data.sets[i] = clean;
    this.save();
    return clean;
  }

  deleteSet(id) {
    this.data.sets = this.data.sets.filter((s) => s.id !== id);
    for (const f of this.data.folders) f.setIds = f.setIds.filter((sid) => sid !== id);
    this.save();
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
    if (i === -1) this.data.folders.push(clean);
    else this.data.folders[i] = clean;
    this.save();
    return clean;
  }

  deleteFolder(id) {
    this.data.folders = this.data.folders.filter((f) => f.id !== id);
    this.save();
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

  foldersOf(setId) {
    return this.data.folders.filter((f) => f.setIds.includes(setId));
  }

  // 记「会了 / 还不会」, 不算改了卡片集, 所以不动 updatedAt
  setKnown(setId, cardId, known) {
    const set = this.ownerOf(setId, cardId);
    if (!set) return;
    const has = set.known.includes(cardId);
    if (known && !has) set.known.push(cardId);
    if (!known && has) set.known = set.known.filter((id) => id !== cardId);
    this.save();
  }

  resetKnown(setId) {
    for (const set of this.setsOf(setId)) set.known = [];
    this.save();
  }

  // 学习模式的程度, 一次存好几张: { 卡片 id: 0|1|2 }
  setLevels(setId, levels) {
    for (const [id, level] of Object.entries(levels)) {
      const set = this.ownerOf(setId, id);
      if (set?.cards.some((c) => c.id === id) && [0, 1, 2].includes(level)) set.learn[id] = level;
    }
    this.save();
  }

  resetLearn(setId) {
    for (const set of this.setsOf(setId)) set.learn = {};
    this.save();
  }

  // 记一次答对 / 答错 (学习、测试用), 以后挑「老是错的」
  recordAnswer(setId, cardId, correct, { save = true } = {}) {
    const set = this.ownerOf(setId, cardId);
    if (!set || !set.cards.some((c) => c.id === cardId)) return;
    const s = (set.stats[cardId] ??= { right: 0, wrong: 0 });
    if (correct) s.right++;
    else s.wrong++;
    if (save) this.save();
  }

  // 判错了, 用户说「我答对了」: 把记的一次错改成对
  amendAnswer(setId, cardId) {
    const s = this.ownerOf(setId, cardId)?.stats[cardId];
    if (!s || s.wrong === 0) return;
    s.wrong--;
    s.right++;
    this.save();
  }

  // 游戏成绩: 配对比谁快 (越小越好), 打陨石比分高 (越大越好)。破纪录返回 true
  recordBest(setId, game, value) {
    // 合起来学时, 成绩记在文件夹上
    const folderId = String(setId).startsWith(FOLDER_PREFIX) ? String(setId).slice(FOLDER_PREFIX.length) : null;
    const set = this.data.sets.find((s) => s.id === setId) ?? (folderId ? this.getFolder(folderId) : null);
    if (!set || !(value > 0)) return false;
    const old = set.best[game];
    const better = game === 'match' ? old === undefined || value < old : old === undefined || value > old;
    if (better) {
      set.best[game] = value;
      this.save();
    }
    return better;
  }

  toggleStar(setId, cardId) {
    const set = this.ownerOf(setId, cardId);
    if (!set) return false;
    const has = set.starred.includes(cardId);
    set.starred = has ? set.starred.filter((id) => id !== cardId) : [...set.starred, cardId];
    this.save();
    return !has;
  }

  exportBackup() {
    return JSON.stringify({ app: 'wengu', ...this.data }, null, 2);
  }

  // 备份里的卡片集加进来; 同一个卡片集 (id 一样) 用备份里的替换。
  // 返回 { added, replaced }
  importBackup(text) {
    const incoming = cleanData(JSON.parse(text));
    let added = 0;
    let replaced = 0;
    for (const set of incoming.sets) {
      const i = this.data.sets.findIndex((s) => s.id === set.id);
      if (i === -1) {
        this.data.sets.push(set);
        added++;
      } else {
        this.data.sets[i] = set;
        replaced++;
      }
    }
    for (const folder of incoming.folders) {
      const i = this.data.folders.findIndex((f) => f.id === folder.id);
      if (i === -1) this.data.folders.push(folder);
      else this.data.folders[i] = folder;
    }
    this.save();
    return { added, replaced };
  }
}
