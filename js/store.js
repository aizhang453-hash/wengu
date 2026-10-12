// 卡片集都存在浏览器的 localStorage 里, 不用注册、不用服务器。
// 清浏览器数据会丢, 所以首页有「导出备份」。

const KEY = 'wengu:v1';

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyData() {
  return { version: 1, sets: [] };
}

// 一个卡片集:
// { id, title, description, termLang, defLang, cards: [{ id, term, def }],
//   known: [卡片 id...], starred: [卡片 id...], createdAt, updatedAt }
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
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

export function makeCard(term = '', def = '') {
  return { id: newId(), term, def };
}

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
        }))
    : [];
  const ids = new Set(cards.map((c) => c.id));
  const onlyCards = (list) =>
    Array.isArray(list) ? [...new Set(list.filter((id) => ids.has(id)))] : [];
  return makeSet({
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    termLang: typeof raw.termLang === 'string' ? raw.termLang : 'auto',
    defLang: typeof raw.defLang === 'string' ? raw.defLang : 'auto',
    cards,
    known: onlyCards(raw.known),
    starred: onlyCards(raw.starred),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  });
}

export function cleanData(raw) {
  const data = emptyData();
  if (raw && Array.isArray(raw.sets)) {
    for (const s of raw.sets) {
      const set = cleanSet(s);
      if (set) data.sets.push(set);
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

  // 存不下 (超过浏览器给的空间) 会抛错, 交给调用的地方提示
  save() {
    this.storage?.setItem(KEY, JSON.stringify(this.data));
  }

  // 最近改过的在前面
  allSets() {
    return [...this.data.sets].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getSet(id) {
    return this.data.sets.find((s) => s.id === id) ?? null;
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
    this.save();
  }

  // 记「会了 / 还不会」, 不算改了卡片集, 所以不动 updatedAt
  setKnown(setId, cardId, known) {
    const set = this.getSet(setId);
    if (!set) return;
    const has = set.known.includes(cardId);
    if (known && !has) set.known.push(cardId);
    if (!known && has) set.known = set.known.filter((id) => id !== cardId);
    this.save();
  }

  resetKnown(setId) {
    const set = this.getSet(setId);
    if (!set) return;
    set.known = [];
    this.save();
  }

  toggleStar(setId, cardId) {
    const set = this.getSet(setId);
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
    this.save();
    return { added, replaced };
  }
}
