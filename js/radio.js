// 广播 (v1.78): 全世界的网络电台, 从 Radio Browser (https://www.radio-browser.info/, 大家一起维护的免费电台目录,
// 不用注册、不用密钥, 网页里直接问) 搜; 播的是电台自己的直播地址 (跟收音机一样, 不经过温故)。
// 页面在 views/radio.js, 底下的播放条在 views/radiobar.js (换页面接着响)。
// 收藏、最近听过存在 store.data.radio, 跟着卡片同步 (v1.79)。
// 只要 https 的直播 (温故是 https 网页, http 的声音浏览器不让放); HLS (.m3u8) 只在能放的浏览器 (苹果的) 上列出来

import { findPlaces } from './places.js';

export const API_BASES = ['https://de1.api.radio-browser.info', 'https://all.api.radio-browser.info'];
export const FAV_KEY = 'wengu:radio-favs'; // v1.78 的收藏 (这台设备上): [电台, ...]; v1.79 起搬进 store.data.radio

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};

// 国家名用中文 (目录里是英文的「The United Kingdom Of Great Britain…」「Kwangtung」这种, 用户说怪): 按国家代码 (US、CN……) 让浏览器给中文名
function regionNames(lang) {
  try {
    return new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
  } catch {
    return null;
  }
}
export function countryName(code) {
  const c = String(code ?? '').toUpperCase();
  return (/^[A-Z]{2}$/.test(c) && regionNames('zh-CN')?.of(c)) || '';
}

// 搜的字是不是一个国家的名字 (中文、繁体、英文都认: 美国、美國、日本、Japan……) → 国家代码; 不是: ''
let countryIndex = null;
export function countryCodeOf(text) {
  if (!countryIndex) {
    countryIndex = new Map();
    const names = ['zh-CN', 'zh-TW', 'en'].map(regionNames).filter(Boolean);
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        for (const d of names) {
          const n = d.of(code);
          if (n && n !== code) countryIndex.set(n.toLowerCase(), code);
        }
      }
    }
  }
  return countryIndex.get(String(text ?? '').trim().toLowerCase()) ?? '';
}

// Radio Browser 的一条 → 温故用的电台 { id, name, url, icon, place, info, hls }
// 台名照目录里写的 (各台自己、或者大家填的: 美国的台常带呼号像 WKDM, 台湾、香港的是繁体); 地方只写国家, 用中文
export function stationOf(r) {
  const url = String(r?.url_resolved || r?.url || '');
  if (!r?.stationuuid || !/^https:\/\//i.test(url)) return null;
  const name = String(r.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const icon = /^https:\/\//i.test(r.favicon ?? '') ? r.favicon : '';
  const place = countryName(r.countrycode) || String(r.country ?? '').trim();
  const info = [r.codec && r.codec !== 'UNKNOWN' ? r.codec : '', r.bitrate ? `${r.bitrate} kbps` : ''].filter(Boolean).join(' · ');
  return { id: r.stationuuid, name, url, icon, place, info, hls: Number(r.hls) === 1 || /\.m3u8(\?|$)/i.test(url) };
}

// 这个浏览器能不能放 HLS (苹果的 Safari、iPad App 能)
export const canPlayHls = (audio = globalThis.document?.createElement?.('audio')) => Boolean(audio?.canPlayType?.('application/vnd.apple.mpegurl'));

// 一串电台: 转好、去掉放不了的、去掉重复的
export function stationsOf(list, { hls = canPlayHls() } = {}) {
  const seen = new Set();
  const out = [];
  for (const r of list ?? []) {
    const s = stationOf(r);
    if (!s || (s.hls && !hls) || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

async function getJson(path, { fetchJson } = {}) {
  let error = null;
  for (const base of API_BASES) {
    try {
      if (fetchJson) return await fetchJson(`${base}${path}`);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10000);
      try {
        const res = await fetch(`${base}${path}`, { signal: ctl.signal });
        if (!res.ok) throw new Error(String(res.status));
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      error = e;
    }
  }
  throw error ?? new Error('拿不到电台');
}

// 搜到的按听的人多少排 (多的在前)
const COMMON = { hidebroken: 'true', is_https: 'true', order: 'clickcount', reverse: 'true' };

// 热门: 听的人最多的台, 一个列表 (v1.78.1: 用户不要「中文 | 全世界」分开): 先中文的、再全世界的, 去掉重复的
// (全世界混在一起排的话, 前几十个都是欧洲的音乐台, 中文台要排到三十名以后, 所以中文的放前面)
export async function topStations({ limit = 20, fetchJson } = {}) {
  const ask = (more) => getJson(`/json/stations/search?${new URLSearchParams({ ...COMMON, limit: String(limit), ...more })}`, { fetchJson });
  const [zh, all] = await Promise.all([ask({ language: 'chinese' }), ask({}).catch(() => [])]);
  return stationsOf([...zh, ...all]);
}

// 搜的字是不是一个城市、省、州 (纽约、上海、London……): 用 places.js 找经纬度; 只认大地方 (不然「jazz」会找到一座山)。不是: null
const CJK = /[\u3400-\u9fff]/;
export async function cityOf(text, { fetchJson } = {}) {
  const q = String(text ?? '').trim();
  if (q.length < 2) return null;
  const places = await findPlaces(q, fetchJson ? { fetchJson } : {}).catch(() => []);
  return places.find((p) => p.big) ?? null;
}

// 搜: 名字里有这几个字的; 是国家名的: 这个国家的台; 是城市名的: 这个城市 60 公里以内的台 (目录里写了经纬度的),
// 还按「州、省」的英文名找一遍 (目录里很多台只写了州, 像 New York、Tokyo, 没写经纬度); 再加上标签 (jazz、news……) 是这个的。
// 次序: 名字对得上的、地方对得上的、标签对得上的; 每样里按听的人多少排
export async function searchStations(text, { limit = 40, fetchJson } = {}) {
  const q = String(text ?? '').trim();
  if (!q) return [];
  const ask = (more, n = limit) => getJson(`/json/stations/search?${new URLSearchParams({ ...COMMON, limit: String(n), ...more })}`, { fetchJson });
  const country = countryCodeOf(q);
  const place = async () => {
    if (country) return ask({ countrycode: country });
    const city = await cityOf(q, { fetchJson });
    if (!city) return [];
    const stateName = city.en ?? (CJK.test(q) ? '' : q);
    const [near, state] = await Promise.all([ask({ geo_lat: String(city.lat), geo_long: String(city.lon), geo_distance: '60000' }), stateName ? ask({ state: stateName }).catch(() => []) : []]);
    return [...near, ...state];
  };
  const [byName, byPlace, byTag] = await Promise.all([ask({ name: q }), place().catch(() => []), ask({ tag: q.toLowerCase() }, 20).catch(() => [])]);
  return stationsOf([...byName, ...byPlace, ...byTag]);
}

// 告诉 Radio Browser 有人听了这个台 (它按这个排热门; 它请大家这么做), 不管成不成
export function countClick(id, { fetchJson } = {}) {
  getJson(`/json/url/${encodeURIComponent(id)}`, { fetchJson }).catch(() => {});
}

// ---- 收藏、最近听过 (v1.79: 跟着卡片一起同步到别的设备; 存在 store.data.radio) ----
// radio: { favs: { 台的 id: { on: 1 | 0, at, s: 台 } }, recent: { 台的 id: { at, s: 台 } } }, 没用过是 null
//   收藏取消了也留着 (on: 0), 同步时按 at 听后改的; 最近听过只留最新的 RECENT_MAX 个
// v1.78 的收藏存在这台设备的 localStorage (wengu:radio-favs): 第一次打开时搬进来 (oldFavorites)
export const RECENT_MAX = 6;
const time = (t) => (Number.isFinite(Number(t)) && Number(t) > 0 ? Math.floor(Number(t)) : 0);

// 存着的台只留要用的几样, 不像样的不要
export function cleanStation(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id || !/^https:\/\//i.test(s.url ?? '') || !String(s.name ?? '').trim()) return null;
  const str = (x) => String(x ?? '').slice(0, 200);
  return { id: s.id, name: str(s.name).trim(), url: String(s.url), icon: /^https:\/\//i.test(s.icon ?? '') ? String(s.icon) : '', place: str(s.place), info: str(s.info), hls: Boolean(s.hls) };
}

export function cleanRadio(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const favs = {};
  for (const [id, f] of Object.entries(raw.favs && typeof raw.favs === 'object' ? raw.favs : {})) {
    const st = cleanStation(f?.s);
    if (st && st.id === id && time(f.at)) favs[id] = { on: f.on ? 1 : 0, at: time(f.at), s: st };
  }
  const recent = Object.entries(raw.recent && typeof raw.recent === 'object' ? raw.recent : {})
    .map(([id, r]) => [id, { at: time(r?.at), s: cleanStation(r?.s) }])
    .filter(([id, r]) => r.at && r.s && r.s.id === id)
    .sort((x, y) => y[1].at - x[1].at)
    .slice(0, RECENT_MAX);
  return Object.keys(favs).length || recent.length ? { favs, recent: Object.fromEntries(recent) } : null;
}

export function mergeRadio(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const later = (x, y) => (!x ? y : !y ? x : y.at > x.at ? y : x);
  const favs = { ...a.favs };
  for (const [id, f] of Object.entries(b.favs)) favs[id] = later(favs[id], f);
  const recent = { ...a.recent };
  for (const [id, r] of Object.entries(b.recent)) recent[id] = later(recent[id], r);
  return cleanRadio({ favs, recent });
}

// 收藏 / 取消收藏: 返回新的 radio
export function withFavorite(radio, station, on, now = Date.now()) {
  const r = radio ?? { favs: {}, recent: {} };
  const st = cleanStation(station);
  if (!st) return radio;
  return cleanRadio({ ...r, favs: { ...r.favs, [st.id]: { on: on ? 1 : 0, at: Math.max(now, (r.favs[st.id]?.at ?? 0) + 1), s: st } } });
}

// 听了一个台: 记进最近听过
export function withRecent(radio, station, now = Date.now()) {
  const r = radio ?? { favs: {}, recent: {} };
  const st = cleanStation(station);
  if (!st) return radio;
  return cleanRadio({ ...r, recent: { ...r.recent, [st.id]: { at: Math.max(now, (r.recent[st.id]?.at ?? 0) + 1), s: st } } });
}

// 收藏的台, 后收藏的在前; 最近听过的, 新的在前
export const favoriteList = (radio) => Object.values(radio?.favs ?? {}).filter((f) => f.on).sort((a, b) => b.at - a.at).map((f) => f.s);
export const isFavorite = (radio, id) => Boolean(radio?.favs?.[id]?.on);
export const recentList = (radio) => Object.values(radio?.recent ?? {}).sort((a, b) => b.at - a.at).map((r) => r.s);

// v1.78 存在这台设备上的收藏 (搬进 store 以后删掉)
export function oldFavorites({ take = false } = {}) {
  const list = read(FAV_KEY, []).map(cleanStation).filter(Boolean);
  if (take) {
    try {
      localStorage.removeItem(FAV_KEY);
    } catch {
      // 删不掉就算了
    }
  }
  return list;
}

// 我附近的台: 这个地方 (邸报天气定的) 方圆 radiusKm 公里以内的台, 听的人多的在前 (目录里写了经纬度的台才找得到)
export async function nearbyStations(place, { radiusKm = 80, limit = 12, fetchJson } = {}) {
  if (!place || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) return [];
  const q = new URLSearchParams({ ...COMMON, limit: String(limit), geo_lat: String(place.lat), geo_long: String(place.lon), geo_distance: String(radiusKm * 1000) });
  return stationsOf(await getJson(`/json/stations/search?${q}`, { fetchJson }));
}
