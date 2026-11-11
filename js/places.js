// 找地方 (v1.78.2): 城市名 → 经纬度。天气换城市、广播按地方搜台都用它。
//   中文名: OpenStreetMap 的 Nominatim (https://nominatim.openstreetmap.org/, 免费不用注册; 规矩: 一秒最多一次、
//           只在用户点「找」的时候问、不能边打字边问; 地名的版权是 © OpenStreetMap 的贡献者, 显示地名的地方写出处)
//   英文名: Open-Meteo 的地名搜索 (快, 天气本来就用它)
//   一边找不到再问另一边。为什么中文不用 Open-Meteo: 它不认「纽约」, 「伦敦」先给加拿大的伦敦, 「东京」给中国的两个小地方 (2026-11-11 试的)
// 返回 [{ name, detail, lat, lon, big, en }]: big 是「大地方」(城市、省、州: 广播按地方搜台只认这种, 不然「jazz」会找到一座山);
// en 是英文名 (广播目录里很多台只写了州、省的英文名, 像 New York、Tokyo, 拿它再找一遍)

const CJK = /[㐀-鿿]/;
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

// Nominatim 的一条: 名字可能是「纽约;紐約」(简体;繁体), 取第一个
const first = (s) => String(s ?? '').split(/[;/]/)[0].trim();
export function fromNominatim(r) {
  const nd = r?.namedetails ?? {};
  const name = first(nd['name:zh-Hans'] ?? nd['name:zh-CN'] ?? r?.name); // 有简体名先用简体 (「大伦敦」不是「大倫敦」)
  if (!name || !Number.isFinite(Number(r.lat))) return null;
  const parts = String(r.display_name ?? '').split(/,\s*/).slice(1).map(first);
  const detail = [parts.at(-1), parts.length > 1 ? parts[0] : ''].filter((x) => x && x !== name).reverse().join('，');
  const big = ['city', 'town', 'state', 'province', 'region', 'municipality', 'county', 'country'].includes(r.addresstype) && Number(r.importance) >= 0.6;
  const en = first(r.namedetails?.['name:en']);
  return { name, detail, lat: round2(r.lat), lon: round2(r.lon), big, ...(en ? { en } : {}) };
}

// Open-Meteo 的一条
export function fromOpenMeteo(r) {
  if (!r?.name || !Number.isFinite(Number(r.latitude))) return null;
  return { name: r.name, detail: [r.admin1, r.country].filter((x) => x && x !== r.name).join('，'), lat: round2(r.latitude), lon: round2(r.longitude), big: /^(PPL|ADM)/.test(r.feature_code ?? '') && Number(r.population) >= 50000, ...(/^[\x20-\x7e]+$/.test(r.name) ? { en: r.name } : {}) };
}

const nominatim = async (q, fetchJson) => {
  const d = await fetchJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '8', namedetails: '1', 'accept-language': 'zh-CN' })}`);
  return (Array.isArray(d) ? d : []).map(fromNominatim).filter(Boolean);
};
const openMeteo = async (q, fetchJson) => {
  const d = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '8', language: CJK.test(q) ? 'zh' : 'en', format: 'json' })}`);
  return (d?.results ?? []).map(fromOpenMeteo).filter(Boolean);
};

export async function findPlaces(text, { fetchJson = getJson } = {}) {
  const q = String(text ?? '').trim();
  if (!q) return [];
  const [first, second] = CJK.test(q) ? [nominatim, openMeteo] : [openMeteo, nominatim];
  const got = await first(q, fetchJson).catch(() => []);
  return got.length ? got : second(q, fetchJson).catch(() => []);
}
