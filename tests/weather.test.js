import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherText, parseForecast, weatherLine, searchPlaces, loadWeather, locate } from '../js/weather.js';

// Open-Meteo 的回答 (只留用得到的)
const FORECAST = { current: { temperature_2m: 9.4, weather_code: 3 }, daily: { weather_code: [61], temperature_2m_max: [13.2], temperature_2m_min: [3.6] } };

test('天气: 代码变中文、一行字怎么写', () => {
  assert.equal(weatherText(0), '晴');
  assert.equal(weatherText(3), '阴');
  assert.equal(weatherText(63), '中雨');
  assert.equal(weatherText(95), '雷阵雨');
  assert.equal(weatherText(12345), '');
  const w = parseForecast(FORECAST);
  assert.deepEqual(w, { now: { t: 9.4, code: 3 }, today: { max: 13.2, min: 3.6, code: 61 } });
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
