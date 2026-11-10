// 新闻 (v1.74): 拿新闻、存一份在这台设备上 (断网也能看上次的), 还有新闻页要用的小工具。页面在 views/news.js
//
// 新闻从哪来: GitHub Actions 每 15 分钟拿一次各家的新闻 (tools/news.mjs), 放在仓库 news 分支:
//   latest.json  所有新闻的标题、摘要、时间、链接 (来源: 美国之音、自由亚洲电台、中新网、卫报、NASA、BBC、NPR)
//   a/<编号>.json 能放全文的那几家 (美国之音、自由亚洲电台、卫报、NASA), 一篇一个
// 先从 GitHub 拿 (raw.githubusercontent.com), 拿不到再试 jsDelivr (同一份文件, 国内有时候更好连)。
// 在自己电脑上跑 (npm start) 时先用本地的 news/ (node tools/news.mjs 生成的)。
// 拿到的存在 IndexedDB (不放 localStorage: 那里放卡片, 空间要留着)。
// 卫报的规定: 内容最多留 24 小时。卫报的文章拿来 (got) 超过 24 小时的不显示, 这台设备上存着的也删掉

import { SITE } from './platform.js';

const [, OWNER, REPO] = /^https:\/\/([^.]+)\.github\.io\/([^/]+)\//.exec(SITE) ?? [];
export const NEWS_BASES = [`https://raw.githubusercontent.com/${OWNER}/${REPO}/news/`, `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@news/`];
export const FRESH_MS = 5 * 60 * 1000; // 五分钟内拿过的不再拿 (新闻每 15 分钟才更新一次)
export const GUARDIAN_MS = 24 * 3600 * 1000;
export const LIVE_MS = 24 * 3600 * 1000; // 快讯只列 24 小时内的
export const LANGS = { zh: '中文', en: 'English' };

// ---- 存在这台设备上 ----

const DB_NAME = 'wengu-news';
const STORE = 'kv';
let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const idbGet = (key) => idb('readonly', (s) => s.get(key)).catch(() => null);
const idbPut = (key, value) => idb('readwrite', (s) => s.put(value, key)).catch(() => {});
const idbKeys = () => idb('readonly', (s) => s.getAllKeys()).catch(() => []);
const idbDel = (keys) => (keys.length ? idb('readwrite', (s) => keys.forEach((k) => s.delete(k))).catch(() => {}) : Promise.resolve());

// 文件像不像样
export function validIndex(d) {
  return Boolean(d && d.v === 2 && d.sources && typeof d.sources === 'object' && Array.isArray(d.items) && d.items.length);
}

// 从哪几个地方拿 (按先后试)
export function newsBases(loc = globalThis.location) {
  const local = loc && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') ? [new URL('news/', loc.href).href] : [];
  return [...local, ...NEWS_BASES];
}

async function fetchJson(url, ms = 10000) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctl?.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 上次拿到的 { data, at } (没有: null)
export async function cachedIndex() {
  const rec = await idbGet('index');
  return rec && validIndex(rec.data) ? rec : null;
}

// 拿新闻: 五分钟内拿过的直接用存着的 (maxAge 可以改); 不然去拿, 拿不到就用存着的 (stale: true)。
// 返回 { data, at, stale, error }; 一次都没拿到过又没网: data 是 null
export async function loadIndex({ force = false, maxAge = FRESH_MS, now = Date.now(), bases = newsBases(), fetchOne = fetchJson } = {}) {
  const cached = await cachedIndex();
  if (!force && cached && now - cached.at < maxAge) return { ...cached, stale: false };
  let error = null;
  let older = false;
  for (const base of bases) {
    try {
      const data = await fetchOne(`${base}latest.json`);
      if (!validIndex(data)) throw new Error('格式不对');
      // 备用的地方可能还是旧的: 比存着的还旧就不要
      if (cached?.data.at && data.at && data.at < cached.data.at) {
        older = true;
        continue;
      }
      const rec = { data, at: now };
      await idbPut('index', rec);
      pruneArticles(data, now);
      return { ...rec, stale: false };
    } catch (e) {
      error = e;
    }
  }
  if (cached) return { ...cached, stale: !older, error: older ? null : error };
  return { data: null, at: 0, stale: true, error };
}

// 一篇全文: 存着的先用, 没有再去拿; 卫报的过了 24 小时不给
export async function loadArticle(id, { now = Date.now(), bases = newsBases(), fetchOne = fetchJson } = {}) {
  const ok = (a) => a && Array.isArray(a.body) && !guardianExpired(a, now);
  const saved = await idbGet(`a:${id}`);
  if (ok(saved)) return saved;
  for (const base of bases) {
    try {
      const a = await fetchOne(`${base}a/${encodeURIComponent(id)}.json`);
      if (!ok(a)) continue;
      await idbPut(`a:${id}`, a);
      return a;
    } catch {
      // 换下一个
    }
  }
  return null;
}

// 存着的全文: 已经不在列表里的、卫报过了 24 小时的删掉
export async function pruneArticles(data, now = Date.now()) {
  const keep = new Set(visibleItems(data, now).map((x) => `a:${x.id}`));
  const keys = await idbKeys();
  await idbDel(keys.filter((k) => String(k).startsWith('a:') && !keep.has(k)));
}

// ---- 页面用的小工具 ----

export const guardianExpired = (x, now = Date.now()) => x.src === 'guardian' && !(now - Date.parse(x.got) < GUARDIAN_MS);

// 能显示的新闻 (卫报过了 24 小时的不要), 新的在前
export function visibleItems(data, now = Date.now()) {
  return (data?.items ?? []).filter((x) => !guardianExpired(x, now));
}

// 一种语言的; src: 只要这一家
export function itemsFor(data, lang, { src = null, now = Date.now() } = {}) {
  return visibleItems(data, now).filter((x) => x.lang === lang && (!src || x.src === src));
}

// 快讯: 24 小时内的标题
export function liveItems(data, lang, now = Date.now()) {
  return itemsFor(data, lang, { now }).filter((x) => now - Date.parse(x.at) < LIVE_MS);
}

// 这种语言有哪几家 (照 sources 的次序), 各有几条
export function sourcesFor(data, lang, now = Date.now()) {
  const items = itemsFor(data, lang, { now });
  return Object.entries(data?.sources ?? {})
    .filter(([, s]) => s.lang === lang)
    .map(([id, s]) => ({ id, ...s, n: items.filter((x) => x.src === id).length }))
    .filter((s) => s.n);
}

// 首页: 头条 (最新的、能读全文、有图的一条), 下面几格 (再几条这样的), 其余的按日子列
export function frontPage(items, { cards = 4 } = {}) {
  const pics = items.filter((x) => x.full && x.img);
  const top = pics.slice(0, 1 + cards);
  const used = new Set(top.map((x) => x.id));
  return { lead: top[0] ?? null, cards: top.slice(1), rest: items.filter((x) => !used.has(x.id)) };
}

// 按日子分组 (照这台设备的时间): [{ day: 'YYYY-MM-DD', items }]
export function byDay(items) {
  const out = [];
  for (const x of items) {
    const day = localDay(x.at);
    const last = out[out.length - 1];
    if (last?.day === day) last.items.push(x);
    else out.push({ day, items: [x] });
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const clock = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const WEEKDAYS = '日一二三四五六';
// 'YYYY-MM-DD' → '今天'、'昨天'、'11月8日 星期日'
export function dayLabel(day, today = localDay(new Date().toISOString())) {
  const [y, m, d] = day.split('-').map(Number);
  const diff = Math.round((Date.UTC(...today.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0))) - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  const plain = `${m}月${d}日 星期${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
  return Number(today.slice(0, 4)) === y ? plain : `${y}年${plain}`;
}

// 「3 小时前」
export function agoText(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 2) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return `${Math.round(hr / 24)} 天前`;
}

// 列表里一条点了去哪: 能读全文的在温故里读, 其余的打开原网站
export const itemHref = (x) => (x.full ? `#/news/a/${encodeURIComponent(x.id)}` : x.u);
export const langHref = (lang) => (lang === 'en' ? '#/news/en' : '#/news');
export const liveHref = (lang) => (lang === 'en' ? '#/news/live/en' : '#/news/live');
export const itemOf = (data, id) => data?.items.find((x) => x.id === id) ?? null;

// 段落里的一段段 (字、链接、粗体……) → 纯文字 (朗读用)
export const inlineText = (parts) => (parts ?? []).map((x) => (typeof x === 'string' ? x : (x.t ?? x.b ?? x.i ?? ''))).join('');

// 朗读: 标题、导语、正文的段落、小标题、列表、引文, 一块一条 (k 是第几块, 页面上标出念到哪)
export function spokenParts(a) {
  const parts = [{ k: 'title', text: a.t }];
  if (a.lede?.length) parts.push({ k: 'lede', text: inlineText(a.lede) });
  (a.body ?? []).forEach((b, i) => {
    const text = b.p ? inlineText(b.p) : b.q ? inlineText(b.q) : b.h ? b.h : b.li ? b.li.map(inlineText).join('；') : '';
    if (text.trim()) parts.push({ k: i, text });
  });
  return parts;
}

// 快讯: 上次看到哪 (这台设备上), 新来的标一下
const SEEN_KEY = 'wengu:news-seen';
export function lastSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function markSeen(iso) {
  try {
    if (iso && iso > lastSeen()) localStorage.setItem(SEEN_KEY, iso);
  } catch {
    // 记不住就算了
  }
}
