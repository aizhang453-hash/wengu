// 天气 (v1.76): 邸报页最上面一小块「纽约 多云 9° · 4°/13°」。
// v1.80: 邸报页上加一块「天气栏」, 照报纸的天气版: 今天的详细情况 (体感、降水、风、湿度、紫外线、空气质量)、未来 7 天、
//   日出日落和月相、昨天的最高最低 (报纸的「历书」)、世界大城市的天气、生活提示 (穿衣、带伞、防晒)
// 天气用 Open-Meteo (免费、不用注册、不要密钥, 网页里直接拿): https://open-meteo.com/
// 地方: 先问浏览器要位置 (用户点允许); 不给、拿不到就自己填城市 (places.js: 中文名问 OpenStreetMap, 英文名问 Open-Meteo)。
//   自动定位拿到的经纬度只留两位小数 (一公里左右), 城市名用 BigDataCloud 的免费接口从经纬度查 (查不到就叫「本地」)
// 存在这台设备上 (localStorage): 地方 wengu:weather-place, 天气 wengu:weather (半小时内不重拿)

import { findPlaces } from './places.js';

export const PLACE_KEY = 'wengu:weather-place'; // { name, lat, lon, auto }
export const DATA_KEY = 'wengu:weather'; // { lat, lon, at, v, now, today, yesterday, days, air } (见 parseForecast)
export const WORLD_KEY = 'wengu:weather-world'; // { at, cities: [...] }
const DATA_V = 2; // 存着的天气是哪一版的格式 (v1.80 加了很多; 旧的不认, 重新拿)
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

// 要拿的 (问 Open-Meteo 时一起拿; past_days=1 多拿昨天)
const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset';

// Open-Meteo 的回答 → { now: { t, code, feels, humidity, wind, windDir }, today: { date, max, min, code, rain, wind, windDir, uv, sunrise, sunset },
//   yesterday: { max, min } | null, days: [以后几天, 跟 today 一样] }。daily 的第一天是昨天 (past_days=1)
export function parseForecast(d, { pastDays = 1 } = {}) {
  const c = d?.current;
  const day = d?.daily;
  if (!c || !day?.temperature_2m_max?.length) return null;
  const pick = (i) => ({
    date: day.time?.[i] ?? '',
    max: day.temperature_2m_max[i],
    min: day.temperature_2m_min[i],
    code: day.weather_code?.[i],
    rain: day.precipitation_probability_max?.[i] ?? null,
    wind: day.wind_speed_10m_max?.[i] ?? null,
    windDir: day.wind_direction_10m_dominant?.[i] ?? null,
    uv: day.uv_index_max?.[i] ?? null,
    sunrise: String(day.sunrise?.[i] ?? '').slice(11, 16),
    sunset: String(day.sunset?.[i] ?? '').slice(11, 16),
  });
  // 第一天是昨天 (问的时候加了 past_days=1; 只有一天的话就是今天)
  const hasYesterday = pastDays > 0 && day.temperature_2m_max.length > 1;
  const first = hasYesterday ? 1 : 0;
  const days = day.time ? day.time.map((_, i) => i).filter((i) => i > first).map(pick) : [];
  return {
    now: { t: c.temperature_2m, code: c.weather_code, feels: c.apparent_temperature ?? null, humidity: c.relative_humidity_2m ?? null, wind: c.wind_speed_10m ?? null, windDir: c.wind_direction_10m ?? null },
    today: pick(first),
    yesterday: hasYesterday ? { max: day.temperature_2m_max[0], min: day.temperature_2m_min[0] } : null,
    days,
  };
}

// 空气质量 (Open-Meteo 的空气质量接口; 美国标准的 AQI 和 PM2.5)
export function parseAir(d) {
  const c = d?.current;
  return c && Number.isFinite(Number(c.us_aqi)) ? { aqi: Math.round(c.us_aqi), pm25: c.pm2_5 ?? null } : null;
}

// 天气: 半小时内拿过的 (同一个地方) 直接用; 拿不到用上次的
export async function loadWeather(place, { now = Date.now(), fetchJson = getJson } = {}) {
  const cached = read(DATA_KEY);
  const same = cached && cached.v === DATA_V && cached.lat === place.lat && cached.lon === place.lon;
  if (same && now - cached.at < FRESH_MS) return cached;
  try {
    const where = { latitude: String(place.lat), longitude: String(place.lon), timezone: 'auto' };
    const q = new URLSearchParams({ ...where, current: CURRENT, daily: DAILY, past_days: '1', forecast_days: '8' });
    const [f, a] = await Promise.all([fetchJson(`https://api.open-meteo.com/v1/forecast?${q}`), fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${new URLSearchParams({ ...where, current: 'us_aqi,pm2_5' })}`).catch(() => null)]);
    const w = parseForecast(f);
    if (!w) throw new Error('格式不对');
    const rec = { v: DATA_V, lat: place.lat, lon: place.lon, at: now, ...w, air: parseAir(a) };
    write(DATA_KEY, rec);
    return rec;
  } catch {
    return same ? cached : null;
  }
}

// 搜城市 (中文、英文都行) → [{ name, detail, lat, lon }] (v1.78.2: 以前只问 Open-Meteo, 中文的「纽约」找不到)
export async function searchPlaces(q, { fetchJson = getJson } = {}) {
  return (await findPlaces(q, { fetchJson })).map(({ name, detail, lat, lon }) => ({ name, detail, lat, lon }));
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

// ---- 世界大城市的天气 (报纸天气版的城市表): 一次问完 (Open-Meteo 能一次给好几个地方), 一个小时内不重拿 ----
export const WORLD = [
  ['北京', 39.9, 116.4],
  ['上海', 31.23, 121.47],
  ['香港', 22.32, 114.17],
  ['台北', 25.03, 121.57],
  ['东京', 35.68, 139.69],
  ['首尔', 37.57, 126.98],
  ['新加坡', 1.29, 103.85],
  ['伦敦', 51.51, -0.13],
  ['巴黎', 48.86, 2.35],
  ['纽约', 40.71, -74.01],
  ['洛杉矶', 34.05, -118.24],
  ['悉尼', -33.87, 151.21],
];
export async function loadWorld({ now = Date.now(), fetchJson = getJson } = {}) {
  const cached = read(WORLD_KEY);
  if (cached?.cities?.length && now - cached.at < 60 * 60 * 1000) return cached.cities;
  try {
    const q = new URLSearchParams({ latitude: WORLD.map((c) => c[1]).join(','), longitude: WORLD.map((c) => c[2]).join(','), daily: 'weather_code,temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: '1' });
    const d = await fetchJson(`https://api.open-meteo.com/v1/forecast?${q}`);
    const list = Array.isArray(d) ? d : [d];
    const cities = WORLD.map(([name], i) => {
      const day = list[i]?.daily;
      return day?.temperature_2m_max?.length ? { name, code: day.weather_code[0], max: day.temperature_2m_max[0], min: day.temperature_2m_min[0] } : null;
    }).filter(Boolean);
    if (!cities.length) throw new Error('格式不对');
    write(WORLD_KEY, { at: now, cities });
    return cities;
  } catch {
    return cached?.cities ?? [];
  }
}

// ---- 换算: 风、紫外线、空气质量、月相、生活提示 ----

// 风向 (度) → 「西北风」; 风速 (公里/小时) → 风力几级 (蒲福风级, 报纸上写的「3 级」)
const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const has = (x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)); // null 不能当 0
export function windDirText(deg) {
  if (!has(deg)) return '';
  return `${DIRS[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8]}风`;
}
const BEAUFORT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118]; // 每一级的上限 (公里/小时)
export function windLevel(kmh) {
  if (!has(kmh)) return null;
  const i = BEAUFORT.findIndex((x) => Number(kmh) < x);
  return i === -1 ? 12 : i;
}
export function windText(kmh, deg) {
  const lv = windLevel(kmh);
  if (lv === null) return '';
  return lv === 0 ? '无风' : `${windDirText(deg)} ${lv} 级`;
}

// 紫外线指数 → 强弱 (世界卫生组织的分法)
export function uvText(uv) {
  const x = Number(uv);
  if (!has(uv)) return '';
  return x < 3 ? '弱' : x < 6 ? '中等' : x < 8 ? '强' : x < 11 ? '很强' : '极强';
}

// 空气质量指数 (美国标准的 AQI) → 等级 (美国环保署的说法)
export function aqiText(aqi) {
  const x = Number(aqi);
  if (!has(aqi)) return '';
  return x <= 50 ? '好' : x <= 100 ? '中等' : x <= 150 ? '对敏感人群不健康' : x <= 200 ? '不健康' : x <= 300 ? '很不健康' : '危险';
}

// 月相: 从一个已知的新月 (2000-01-06 18:14 UTC) 起, 每 29.53 天一轮。返回 { name, age (月龄, 天), nextFull: Date }
const SYNODIC = 29.530588853;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - NEW_MOON) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const names = ['新月', '蛾眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
  const name = names[Math.floor(((age / SYNODIC) * 8 + 0.5) % 8)];
  const toFull = (SYNODIC / 2 - age + SYNODIC) % SYNODIC;
  return { name, age, nextFull: new Date(date.getTime() + (toFull < 0.5 ? toFull + SYNODIC : toFull) * 86400000) };
}

// 生活提示 (报纸、天气预报里常有的): 按今天的最高最低温、下雨的可能、紫外线自己判断 → [['穿衣', '……'], ...]
export function lifeTips(today) {
  if (!today) return [];
  const hi = Number(today.max);
  const lo = Number(today.min);
  const wear = hi >= 28 ? '短袖' : hi >= 22 ? '短袖或薄长袖' : hi >= 16 ? '长袖、薄外套' : hi >= 10 ? '外套、毛衣' : hi >= 5 ? '厚外套' : '羽绒服，注意保暖';
  const tips = [['穿衣', hi - lo >= 10 ? `${wear}；早晚温差大` : wear]];
  const rain = Number(today.rain);
  tips.push(['带伞', today.rain === null ? '' : rain >= 50 ? '要带伞' : rain >= 30 ? '可能下雨，带把伞保险' : '不用']);
  const uv = Number(today.uv);
  tips.push(['防晒', today.uv === null ? '' : uv >= 6 ? '紫外线强，注意防晒' : uv >= 3 ? '出门久的话涂点防晒' : '不用']);
  return tips.filter(([, t]) => t);
}

// 一行字: 「纽约 多云 9° · 4°/13°」
export function weatherLine(place, w) {
  if (!place || !w) return '';
  const r = (x) => Math.round(x);
  return `${place.name} ${weatherText(w.now.code)} ${r(w.now.t)}° · ${r(w.today.min)}°/${r(w.today.max)}°`;
}
