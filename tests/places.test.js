import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlaces, fromNominatim, fromOpenMeteo } from '../js/places.js';

const NOMINATIM_NY = { name: '纽约;紐約', display_name: '纽约;紐約, 纽约州;紐約州, 美国;美國', addresstype: 'city', importance: 0.88, lat: '40.7127281', lon: '-74.0060152', namedetails: { name: 'New York', 'name:en': 'New York', 'name:zh-Hans': '纽约' } };

test('找地方: 中文名问 OpenStreetMap (Nominatim), 英文名问 Open-Meteo; 一边没有问另一边', async () => {
  const urls = [];
  const fake = (byHost) => async (u) => (urls.push(u), byHost(u));
  const zh = await findPlaces('纽约', { fetchJson: fake((u) => (u.includes('nominatim') ? [NOMINATIM_NY] : { results: [] })) });
  assert.deepEqual(zh, [{ name: '纽约', detail: '纽约州，美国', lat: 40.71, lon: -74.01, big: true, en: 'New York' }]);
  assert.match(urls[0], /^https:\/\/nominatim\.openstreetmap\.org\/search\?q=%E7%BA%BD%E7%BA%A6&format=jsonv2&limit=8&namedetails=1&accept-language=zh-CN$/);
  urls.length = 0;
  // 中文名 Nominatim 没找到: 再问 Open-Meteo
  const fallback = await findPlaces('上海', { fetchJson: fake((u) => (u.includes('nominatim') ? [] : { results: [{ name: '上海', admin1: '上海', country: '中国', latitude: 31.22, longitude: 121.46, feature_code: 'PPLA', population: 24874500 }] })) });
  assert.equal(fallback[0].name, '上海');
  assert.equal(fallback[0].big, true);
  assert.equal(urls.length, 2);
  assert.deepEqual(await findPlaces('  '), []);
});

test('找地方: 「大地方」才算 (城市、州; 重要的); 小地方、山不算', () => {
  assert.equal(fromNominatim({ ...NOMINATIM_NY, importance: 0.5 }).big, false);
  assert.equal(fromNominatim({ ...NOMINATIM_NY, addresstype: 'peak' }).big, false);
  assert.equal(fromNominatim({ name: '', lat: '1', lon: '2' }), null);
  assert.equal(fromOpenMeteo({ name: 'Jazzihorn', latitude: 46, longitude: 7, feature_code: 'PK' }).big, false);
  assert.equal(fromOpenMeteo({ name: 'Al Jazzāzah', latitude: 32, longitude: 35, feature_code: 'PPL' }).big, false); // 没写人口
  assert.equal(fromOpenMeteo({ name: 'London', latitude: 51.5, longitude: -0.12, feature_code: 'PPLC', population: 8961989 }).en, 'London');
});
