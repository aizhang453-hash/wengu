import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherText, parseForecast, parseAir, weatherLine, searchPlaces, loadWeather, loadWorld, locate, windText, windLevel, windDirText, uvText, aqiText, moonPhase, lifeTips, WORLD } from '../js/weather.js';

// Open-Meteo 的回答 (只留用得到的)
// daily 的第一天是昨天 (问的时候加了 past_days=1), 第二天是今天, 再往后是以后几天
const FORECAST = {
  current: { temperature_2m: 9.4, weather_code: 3, apparent_temperature: 6.1, relative_humidity_2m: 70, wind_speed_10m: 15, wind_direction_10m: 315 },
  daily: {
    time: ['2026-11-09', '2026-11-10', '2026-11-11'],
    weather_code: [2, 61, 0],
    temperature_2m_max: [11, 13.2, 15],
    temperature_2m_min: [2, 3.6, 5],
    precipitation_probability_max: [0, 80, 10],
    wind_speed_10m_max: [10, 20, 8],
    wind_direction_10m_dominant: [0, 315, 90],
    uv_index_max: [2, 6.5, 3],
    sunrise: ['2026-11-09T06:36', '2026-11-10T06:37', '2026-11-11T06:38'],
    sunset: ['2026-11-09T16:43', '2026-11-10T16:42', '2026-11-11T16:41'],
  },
};

test('天气: 代码变中文、一行字怎么写', () => {
  assert.equal(weatherText(0), '晴');
  assert.equal(weatherText(3), '阴');
  assert.equal(weatherText(63), '中雨');
  assert.equal(weatherText(95), '雷阵雨');
  assert.equal(weatherText(12345), '');
  const w = parseForecast(FORECAST);
  assert.deepEqual(w.now, { t: 9.4, code: 3, feels: 6.1, humidity: 70, wind: 15, windDir: 315 });
  assert.deepEqual(w.today, { date: '2026-11-10', max: 13.2, min: 3.6, code: 61, rain: 80, wind: 20, windDir: 315, uv: 6.5, sunrise: '06:37', sunset: '16:42' });
  assert.deepEqual(w.yesterday, { max: 11, min: 2 });
  assert.deepEqual(w.days.map((d) => d.date), ['2026-11-11']);
  // 只有一天 (没有昨天的): 那一天就是今天
  const one = parseForecast({ current: { temperature_2m: 1, weather_code: 0 }, daily: { weather_code: [0], temperature_2m_max: [5], temperature_2m_min: [1] } });
  assert.equal(one.today.max, 5);
  assert.equal(one.yesterday, null);
  assert.equal(parseForecast({}), null);
  assert.equal(weatherLine({ name: '纽约' }, w), '纽约 阴 9° · 4°/13°');
  assert.equal(weatherLine(null, w), '');
});

test('天气: 拿天气、搜城市 (Open-Meteo); 拿不到返回 null', async () => {
  const urls = [];
  const w = await loadWeather({ lat: 40.71, lon: -74.01 }, { now: 1000, fetchJson: async (u) => (urls.push(u), FORECAST) });
  assert.equal(w.now.t, 9.4);
  assert.match(urls[0], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=40\.71&longitude=-74\.01&/);
  assert.equal(await loadWeather({ lat: 1, lon: 2 }, { fetchJson: async () => ({}) }), null);
  // 英文名问 Open-Meteo
  const found = await searchPlaces('New York', {
    fetchJson: async (u) => {
      assert.match(u, /geocoding-api\.open-meteo\.com\/v1\/search\?name=New\+York&count=8&language=en/);
      return { results: [{ name: 'New York', admin1: 'New York', country: 'United States', latitude: 40.71427, longitude: -74.00597, feature_code: 'PPL', population: 8804190 }] };
    },
  });
  assert.deepEqual(found, [{ name: 'New York', detail: 'United States', lat: 40.71, lon: -74.01 }]);
  assert.deepEqual(await searchPlaces('xx', { fetchJson: async () => ({}) }), []);
});

test('天气: 自动定位只留两位小数, 查城市名; 查不到叫「本地」; 不给位置就抛错', async () => {
  const geo = (lat, lon) => ({ getCurrentPosition: (ok) => ok({ coords: { latitude: lat, longitude: lon } }) });
  assert.deepEqual(await locate({ geo: geo(40.712776, -74.005974), fetchJson: async (u) => (assert.match(u, /latitude=40\.71&longitude=-74\.01/), { city: '纽约' }) }), { name: '纽约', lat: 40.71, lon: -74.01, auto: true });
  assert.equal((await locate({ geo: geo(1, 2), fetchJson: async () => Promise.reject(new Error('x')) })).name, '本地');
  await assert.rejects(locate({ geo: { getCurrentPosition: (ok, bad) => bad({ code: 1 }) } }), (e) => e.code === 1);
  await assert.rejects(locate({ geo: null }), (e) => e.code === 2);
});

test('天气栏的换算: 风向风力、紫外线、空气质量、生活提示', () => {
  assert.equal(windDirText(0), '北风');
  assert.equal(windDirText(315), '西北风');
  assert.equal(windDirText(-90), '西风');
  assert.equal(windLevel(0.5), 0);
  assert.equal(windLevel(15), 3); // 12–19 公里/小时是 3 级
  assert.equal(windLevel(120), 12);
  assert.equal(windText(15, 315), '西北风 3 级');
  assert.equal(windText(0, 90), '无风');
  assert.equal(windText(null, 90), '');
  assert.equal(uvText(2), '弱');
  assert.equal(uvText(6.5), '强');
  assert.equal(uvText(11), '极强');
  assert.equal(aqiText(42), '好');
  assert.equal(aqiText(120), '对敏感人群不健康');
  assert.equal(aqiText(350), '危险');
  assert.deepEqual(parseAir({ current: { us_aqi: 50.4, pm2_5: 8.2 } }), { aqi: 50, pm25: 8.2 });
  assert.equal(parseAir({}), null);
  assert.deepEqual(lifeTips({ max: 13.2, min: 2, rain: 80, uv: 6.5 }), [
    ['穿衣', '外套、毛衣；早晚温差大'],
    ['带伞', '要带伞'],
    ['防晒', '紫外线强，注意防晒'],
  ]);
  assert.deepEqual(lifeTips({ max: 30, min: 24, rain: 0, uv: 1 }), [
    ['穿衣', '短袖'],
    ['带伞', '不用'],
    ['防晒', '不用'],
  ]);
});

test('月相: 已知的满月、新月那天算得对', () => {
  // 2026-11-24 是满月, 2026-11-09 是新月 (天文年历)
  assert.equal(moonPhase(new Date('2026-11-24T12:00:00Z')).name, '满月');
  assert.equal(moonPhase(new Date('2026-11-09T12:00:00Z')).name, '新月');
  assert.equal(moonPhase(new Date('2026-11-17T12:00:00Z')).name, '上弦月');
  const next = moonPhase(new Date('2026-11-11T05:00:00Z')).nextFull;
  assert.equal(next.toISOString().slice(0, 10), '2026-11-24');
});

test('天气: 一次拿今天、7 天、昨天和空气质量; 世界大城市一次问完', async () => {
  const urls = [];
  const w = await loadWeather({ lat: 1.5, lon: 2.5 }, { now: 5000, fetchJson: async (u) => (urls.push(u), u.includes('air-quality') ? { current: { us_aqi: 30, pm2_5: 5 } } : FORECAST) });
  assert.deepEqual(w.air, { aqi: 30, pm25: 5 });
  assert.ok(urls.some((u) => u.includes('past_days=1') && u.includes('forecast_days=8'))); // 今天 + 以后 7 天
  assert.ok(urls.some((u) => u.startsWith('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=1.5&longitude=2.5')));
  // 空气质量拿不到: 天气照样有
  const noAir = await loadWeather({ lat: 3, lon: 4 }, { now: 5000, fetchJson: async (u) => (u.includes('air-quality') ? Promise.reject(new Error('x')) : FORECAST) });
  assert.equal(noAir.air, null);
  const world = await loadWorld({
    now: 5000,
    fetchJson: async (u) => {
      assert.ok(u.includes(`latitude=${encodeURIComponent(WORLD.map((c) => c[1]).join(','))}`));
      return WORLD.map((_, i) => ({ daily: { weather_code: [i % 3], temperature_2m_max: [20 + i], temperature_2m_min: [10 + i] } }));
    },
  });
  assert.equal(world.length, WORLD.length);
  assert.deepEqual(world[0], { name: '北京', code: 0, max: 20, min: 10 });
});
