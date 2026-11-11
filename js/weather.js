// 天气 (v1.76): 邸报页最上面一小块「纽约 多云 9° · 4°/13°」。
// 天气用 Open-Meteo (免费、不用注册、不要密钥, 网页里直接拿): https://open-meteo.com/
// 地方: 先问浏览器要位置 (用户点允许); 不给、拿不到就自己填城市 (Open-Meteo 的地名搜索)。
//   自动定位拿到的经纬度只留两位小数 (一公里左右), 城市名用 BigDataCloud 的免费接口从经纬度查 (查不到就叫「本地」)
// 存在这台设备上 (localStorage): 地方 wengu:weather-place, 天气 wengu:weather (半小时内不重拿)

export const PLACE_KEY = 'wengu:weather-place'; // { name, lat, lon, auto }
export const DATA_KEY = 'wengu:weather'; // { lat, lon, at, now: { t, code }, today: { max, min, code } }
export const FRESH_MS = 30 * 60 * 1000;

// WMO 天气代码 → 中文
const CODES = [
  [[0], '晴'],
  [[1], '晴间多云'],
  [[2], '多云'],
  [[3], '阴'],
  [[45, 48], '雾'],
  [[51, 53, 55], '毛毛雨'],
  [[56, 57, 66, 67], '冻雨'],
  [[61, 80], '小雨'],
  [[63, 81], '中雨'],
  [[65, 82], '大雨'],
  [[71, 85], '小雪'],
  [[73], '中雪'],
  [[75, 86], '大雪'],
  [[77], '雪粒'],
  [[95], '雷阵雨'],
  [[96, 99], '雷阵雨伴有冰雹'],
];
export function weatherText(code) {
  return CODES.find(([list]) => list.includes(Number(code)))?.[1] ?? '';
}

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不了就算了
  }
};
export const savedPlace = () => read(PLACE_KEY);
export const savePlace = (place) => write(PLACE_KEY, place);

const round2 = (x) => Math.round(Number(x) * 100) / 100;

async function getJson(url, ms = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Open-Meteo 的回答 → { now: { t, code }, today: { max, min, code } }
export function parseForecast(d) {
  const c = d?.current;
  const day = d?.daily;
  if (!c || !day?.temperature_2m_max?.length) return null;
  return { now: { t: c.temperature_2m, code: c.weather_code }, today: { max: day.temperature_2m_max[0], min: day.temperature_2m_min[0], code: day.weather_code[0] } };
}

// 天气: 半小时内拿过的 (同一个地方) 直接用; 拿不到用上次的
export async function loadWeather(place, { now = Date.now(), fetchJson = getJson } = {}) {
  const cached = read(DATA_KEY);
  const same = cached && cached.lat === place.lat && cached.lon === place.lon;
  if (same && now - cached.at < FRESH_MS) return cached;
  try {
    const q = new URLSearchParams({ latitude: String(place.lat), longitude: String(place.lon), current: 'temperature_2m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '1' });
    const w = parseForecast(await fetchJson(`https://api.open-meteo.com/v1/forecast?${q}`));
    if (!w) throw new Error('格式不对');
    const rec = { lat: place.lat, lon: place.lon, at: now, ...w };
    write(DATA_KEY, rec);
    return rec;
  } catch {
    return same ? cached : null;
  }
}

// 搜城市 (中文、英文都行) → [{ name, detail, lat, lon }]
export async function searchPlaces(q, { fetchJson = getJson } = {}) {
  const d = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '8', language: 'zh', format: 'json' })}`);
  return (d?.results ?? []).map((r) => ({ name: r.name, detail: [r.admin1, r.country].filter((x) => x && x !== r.name).join('，'), lat: round2(r.latitude), lon: round2(r.longitude) }));
}

// 问浏览器要位置 → { name, lat, lon, auto: true }; 不给、拿不到: 抛错 (code 1 是用户不给)
export function locate({ geo = globalThis.navigator?.geolocation, fetchJson = getJson } = {}) {
  return new Promise((resolve, reject) => {
    if (!geo) return reject(Object.assign(new Error('这里没法定位'), { code: 2 }));
    geo.getCurrentPosition(
      async (pos) => {
        const lat = round2(pos.coords.latitude);
        const lon = round2(pos.coords.longitude);
        let name = '本地';
        try {
          const r = await fetchJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'zh' })}`, 6000);
          name = r?.city || r?.locality || r?.principalSubdivision || name;
        } catch {
          // 查不到城市名: 叫「本地」
        }
        resolve({ name, lat, lon, auto: true });
      },
      (err) => reject(err),
      { timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  });
}

// 一行字: 「纽约 多云 9° · 4°/13°」
export function weatherLine(place, w) {
  if (!place || !w) return '';
  const r = (x) => Math.round(x);
  return `${place.name} ${weatherText(w.now.code)} ${r(w.now.t)}° · ${r(w.today.min)}°/${r(w.today.max)}°`;
}
