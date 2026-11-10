// 新闻 (v1.74): 拿新闻、存一份在这台设备上 (断网也能看上次的), 还有新闻页要用的小工具。页面在 views/news.js
//
// 新闻从哪来: GitHub Actions 每天几次从中文维基百科的「新闻动态」拿 (tools/news.mjs), 放在仓库 news 分支的 latest.json。
// 先从 GitHub 拿 (raw.githubusercontent.com), 拿不到再试 jsDelivr (同一个文件, 国内有时候更好连)。
// 在自己电脑上跑 (npm start) 时先用本地的 news/latest.json (node tools/news.mjs 生成的)。
// 拿到的存在 IndexedDB (不放 localStorage: 那里放卡片, 空间要留着)。

import { SITE } from './platform.js';

const [, OWNER, REPO] = /^https:\/\/([^.]+)\.github\.io\/([^/]+)\//.exec(SITE) ?? [];
export const NEWS_URLS = [`https://raw.githubusercontent.com/${OWNER}/${REPO}/news/latest.json`, `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@news/latest.json`];
export const FRESH_MS = 10 * 60 * 1000; // 十分钟内拿过的不再拿
export const SECTIONS = ['时政', '军事', '财经', '科技', '社会', '体育', '文娱']; // 跟 tools/news.mjs 的一样

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

// 上次拿到的 { data, at } (没有、读不出来: null)
export async function cachedNews() {
  try {
    const rec = await idb('readonly', (s) => s.get('latest'));
    return rec && validNews(rec.data) ? rec : null;
  } catch {
    return null;
  }
}

async function saveNews(rec) {
  try {
    await idb('readwrite', (s) => s.put(rec, 'latest'));
  } catch {
    // 存不了就只管这次
  }
}

// 文件像不像样: 格式对, 有新闻
export function validNews(d) {
  return Boolean(d && d.v === 1 && Array.isArray(d.stories) && d.stories.length && d.articles && typeof d.articles === 'object');
}

// 从哪几个网址拿 (按先后试)
export function newsUrls(loc = globalThis.location) {
  const local = loc && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') ? [new URL('news/latest.json', loc.href).href] : [];
  return [...local, ...NEWS_URLS];
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

// 拿新闻: 十分钟内拿过的直接用存着的; 不然去拿, 拿不到就用存着的 (stale: true)。
// 返回 { data, at, stale, error }; 一次都没拿到过又没网: data 是 null
export async function loadNews({ force = false, now = Date.now(), urls = newsUrls(), fetchOne = fetchJson } = {}) {
  const cached = await cachedNews();
  if (!force && cached && now - cached.at < FRESH_MS) return { ...cached, stale: false };
  let error = null;
  let older = false;
  for (const url of urls) {
    try {
      const data = await fetchOne(url);
      if (!validNews(data)) throw new Error('格式不对');
      // 备用的网址可能还是旧的: 比存着的还旧就不要
      if (cached && cached.data.at && data.at && data.at < cached.data.at) {
        older = true;
        continue;
      }
      const rec = { data, at: now };
      await saveNews(rec);
      return { ...rec, stale: false };
    } catch (e) {
      error = e;
    }
  }
  if (cached) return { ...cached, stale: !older, error: older ? null : error };
  return { data: null, at: 0, stale: true, error };
}

// ---- 页面用的小工具 ----

const WEEKDAYS = '日一二三四五六';
// 新闻的日子都是北京时间的
export function beijingToday(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// '2026-11-08' → '11月8日 星期日'; 今天、昨天写「今天」「昨天」(long: 后面也带上日子)
export function dayLabel(date, today = beijingToday(), { long = false } = {}) {
  const [y, m, d] = date.split('-').map(Number);
  const week = `星期${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
  const plain = `${m}月${d}日 ${week}`;
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  const near = diff === 0 ? '今天' : diff === 1 ? '昨天' : null;
  if (!near) return Number(today.slice(0, 4)) === y ? plain : `${y}年${plain}`;
  return long ? `${near} · ${plain}` : near;
}

// 「3 小时前」这样的: 新闻什么时候更新的
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

export const storyHref = (s) => `#/news/s/${encodeURIComponent(s.id)}`;
export const sectionHref = (sec) => (sec ? `#/news/sec/${encodeURIComponent(sec)}` : '#/news');
export const topicHref = (t) => `#/news/topic/${encodeURIComponent(t.title)}`;
export const wikiUrl = (page) => `https://zh.wikipedia.org/zh-cn/${encodeURIComponent(String(page).replace(/ /g, '_'))}`;

export const storyOf = (data, id) => data?.stories.find((s) => s.id === id) ?? null;
export const articleOf = (data, s) => (s?.art ? (data.articles[s.art] ?? null) : null);
// 新闻的图: 头条配的图, 没有就用条目的图
export const imageOf = (data, s) => s?.img ?? articleOf(data, s)?.img ?? null;
// 小一点的图 (列表里用): 维基共享资源的缩略图网址里写着宽度, 换成 330
export const smallImage = (src) => String(src ?? '').replace(/\/960px-/, '/330px-');
// 标题: 有专门条目的用条目名; 没有的就用那一句话
export const headline = (s) => s.title ?? s.text;

// 头条 (照首页的次序)
export function topStories(data) {
  return (data?.top ?? []).map((id) => storyOf(data, id)).filter(Boolean);
}

// 按日子分组 (新的在前): [{ date, stories }]; sec: 只要这个栏目的
export function byDay(data, sec = null) {
  const out = [];
  for (const s of data?.stories ?? []) {
    if (sec && s.sec !== sec) continue;
    const last = out[out.length - 1];
    if (last && last.date === s.date) last.stories.push(s);
    else out.push({ date: s.date, stories: [s] });
  }
  return out;
}

// 有新闻的栏目 (照 SECTIONS 的次序) 和各有几条
export function sectionCounts(data) {
  const n = {};
  for (const s of data?.stories ?? []) n[s.sec] = (n[s.sec] ?? 0) + 1;
  return SECTIONS.filter((x) => n[x]).map((sec) => ({ sec, n: n[sec] }));
}

// 同一件事的别的新闻 (主条目一样的), 新的在前
export function sameEvent(data, s) {
  if (!s?.art) return [];
  return data.stories.filter((x) => x.art === s.art && x.id !== s.id);
}

// 正在发生的一件事 (专题) 和讲到它的新闻
export const topicOf = (data, title) => data?.topics?.find((t) => t.title === title) ?? null;
export function topicStories(data, t) {
  if (!t) return [];
  const names = new Set([t.title, t.name]);
  // 链接对得上的, 或者字里写着这件事的名字 (三个字以上的: 「伊朗战争」)
  return data.stories.filter((s) => names.has(s.art) || s.links.some((l) => names.has(l.page) || names.has(l.name)) || (t.name.length >= 3 && s.text.includes(t.name)));
}

// 新闻里提到的人、机构 (有简介的; 主条目不算)
export function peopleOf(data, s) {
  return (s?.links ?? []).filter((l) => l.page !== s.art && data.notes?.[l.page]).map((l) => ({ ...l, line: data.notes[l.page] }));
}

// 朗读用: 标题、导语、正文的段落, 一段一条
export function spokenParts(data, s) {
  const a = articleOf(data, s);
  const parts = [{ k: 'title', text: headline(s) }];
  if (s.title) parts.push({ k: 'lede', text: s.text });
  (a?.body ?? []).forEach((b, i) => {
    if (typeof b === 'string') parts.push({ k: i, text: b });
    else if (b.h) parts.push({ k: i, text: b.h });
    else if (b.li) parts.push({ k: i, text: b.li.filter((x) => x !== '……').join('；') });
  });
  return parts;
}
