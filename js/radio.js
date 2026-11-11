// 广播 (v1.78): 全世界的网络电台, 从 Radio Browser (https://www.radio-browser.info/, 大家一起维护的免费电台目录,
// 不用注册、不用密钥, 网页里直接问) 搜; 播的是电台自己的直播地址 (跟收音机一样, 不经过温故)。
// 页面在 views/radio.js, 底下的播放条在 views/radiobar.js (换页面接着响)。
// 收藏存在这台设备上 (localStorage)。
// 只要 https 的直播 (温故是 https 网页, http 的声音浏览器不让放); HLS (.m3u8) 只在能放的浏览器 (苹果的) 上列出来

export const API_BASES = ['https://de1.api.radio-browser.info', 'https://all.api.radio-browser.info'];
export const FAV_KEY = 'wengu:radio-favs'; // [电台, ...]

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就算了
  }
};

// Radio Browser 的一条 → 温故用的电台 { id, name, url, icon, place, info, hls }
export function stationOf(r) {
  const url = String(r?.url_resolved || r?.url || '');
  if (!r?.stationuuid || !/^https:\/\//i.test(url)) return null;
  const name = String(r.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const icon = /^https:\/\//i.test(r.favicon ?? '') ? r.favicon : '';
  const place = [r.state, r.country].filter((x) => x && String(x).trim()).join('，');
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

// 搜: 名字里有这几个字的, 加上标签 (jazz、news……) 是这个的
export async function searchStations(text, { limit = 40, fetchJson } = {}) {
  const q = String(text ?? '').trim();
  if (!q) return [];
  const [byName, byTag] = await Promise.all([
    getJson(`/json/stations/search?${new URLSearchParams({ ...COMMON, limit: String(limit), name: q })}`, { fetchJson }),
    getJson(`/json/stations/search?${new URLSearchParams({ ...COMMON, limit: '20', tag: q.toLowerCase() })}`, { fetchJson }).catch(() => []),
  ]);
  return stationsOf([...byName, ...byTag]);
}

// 告诉 Radio Browser 有人听了这个台 (它按这个排热门; 它请大家这么做), 不管成不成
export function countClick(id, { fetchJson } = {}) {
  getJson(`/json/url/${encodeURIComponent(id)}`, { fetchJson }).catch(() => {});
}

// ---- 收藏 ----
export const favorites = () => read(FAV_KEY, []).filter((s) => s && s.id && s.url);
export const isFavorite = (id) => favorites().some((s) => s.id === id);
// 收藏 / 取消收藏; 返回现在收没收藏
export function toggleFavorite(station) {
  const list = favorites();
  const has = list.some((s) => s.id === station.id);
  write(FAV_KEY, has ? list.filter((s) => s.id !== station.id) : [station, ...list]);
  return !has;
}
