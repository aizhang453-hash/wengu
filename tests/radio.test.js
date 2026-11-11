import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationOf, stationsOf, topStations, searchStations, API_BASES, countryName, countryCodeOf, cleanRadio, mergeRadio, withFavorite, withRecent, favoriteList, recentList, isFavorite, nearbyStations, RECENT_MAX } from '../js/radio.js';
import { Store } from '../js/store.js';

const RAW = { stationuuid: 'u1', name: '  BBC  World   Service ', url: 'http://x', url_resolved: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', favicon: 'https://bbc/icon.png', country: 'The United Kingdom Of Great Britain And Northern Ireland', state: '', codec: 'MP3', bitrate: 56, hls: 0 };

test('广播: 电台目录的一条 → 温故用的; 只要 https 的; HLS 只在能放的浏览器上要; 去掉重复的', () => {
  assert.deepEqual(stationOf(RAW), { id: 'u1', name: 'BBC World Service', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', icon: 'https://bbc/icon.png', place: 'The United Kingdom Of Great Britain And Northern Ireland', info: 'MP3 · 56 kbps', hls: false });
  assert.equal(stationOf({ ...RAW, countrycode: 'GB' }).place, '英国'); // 地方用中文的国家名
  assert.equal(stationOf({ ...RAW, url_resolved: 'http://insecure/stream' }), null); // http 的放不了
  assert.equal(stationOf({ ...RAW, name: '' }), null);
  assert.equal(stationOf({ ...RAW, favicon: 'http://x/icon.png' }).icon, ''); // http 的小图不要
  assert.equal(stationOf({ ...RAW, codec: 'UNKNOWN', bitrate: 0 }).info, '');
  const hls = { ...RAW, stationuuid: 'u2', url_resolved: 'https://ngcdn001.cnr.cn/live/zgzs/index.m3u8', hls: 1 };
  assert.deepEqual(stationsOf([RAW, hls, RAW], { hls: false }).map((s) => s.id), ['u1']);
  assert.deepEqual(stationsOf([RAW, hls], { hls: true }).map((s) => s.id), ['u1', 'u2']);
});

test('广播: 搜 (名字和种类), 只要 https、没坏的、按听的人数排; 第一个地址连不上换下一个', async () => {
  const urls = [];
  const fetchJson = async (u) => (urls.push(u), [RAW]);
  const found = await searchStations(' Jazz ', { fetchJson });
  assert.deepEqual(found.map((s) => s.id), ['u1']); // 名字、种类都找到同一个台: 只留一个
  assert.ok(urls.some((u) => /^https:\/\/de1\.api\.radio-browser\.info\/json\/stations\/search\?hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=40&name=Jazz$/.test(u)));
  assert.ok(urls.some((u) => u.includes('tag=jazz')));
  assert.deepEqual(await searchStations('  ', { fetchJson }), []);
  const tried = [];
  await searchStations('bbc', { fetchJson: async (u) => (tried.push(u), u.startsWith(API_BASES[0]) ? Promise.reject(new Error('x')) : [RAW]) });
  assert.ok(tried.some((u) => u.startsWith(API_BASES[1])));
});

test('广播: 热门是一个列表, 先中文台再全世界的, 去掉重复的', async () => {
  const urls = [];
  const zh = { ...RAW, stationuuid: 'zh1', name: '中国之声' };
  const fetchJson = async (u) => (urls.push(u), u.includes('language=chinese') ? [zh] : [RAW, zh]);
  assert.deepEqual((await topStations({ fetchJson })).map((s) => s.id), ['zh1', 'u1']);
  assert.ok(urls.some((u) => u.includes('limit=20&language=chinese')));
  assert.ok(urls.some((u) => !u.includes('language=')));
});

test('广播: 国家名 (中文、繁体、英文) → 国家代码; 国家代码 → 中文名', () => {
  assert.equal(countryCodeOf('美国'), 'US');
  assert.equal(countryCodeOf('美國'), 'US');
  assert.equal(countryCodeOf('Japan'), 'JP');
  assert.equal(countryCodeOf(' 日本 '), 'JP');
  assert.equal(countryCodeOf('jazz'), '');
  assert.equal(countryName('us'), '美国');
  assert.equal(countryName('CN'), '中国');
  assert.equal(countryName(''), '');
});

test('广播: 按地方搜 — 国家名: 这个国家的台; 城市名: 附近 60 公里的台、再按州的英文名找; 名字对得上的排最前', async () => {
  const urls = [];
  const station = (id) => ({ ...RAW, stationuuid: id });
  const fetchJson = async (u) => {
    urls.push(u);
    if (u.includes('nominatim')) return [{ name: '纽约', display_name: '纽约, 美国', addresstype: 'city', importance: 0.9, lat: '40.71', lon: '-74.01', namedetails: { 'name:en': 'New York' } }];
    if (u.includes('name=')) return [station('byname')];
    if (u.includes('geo_lat=40.71&geo_long=-74.01&geo_distance=60000')) return [station('near')];
    if (u.includes('state=New+York')) return [station('state')];
    if (u.includes('countrycode=JP')) return [station('jp')];
    return [];
  };
  assert.deepEqual((await searchStations('纽约', { fetchJson })).map((s) => s.id), ['byname', 'near', 'state']);
  urls.length = 0;
  assert.deepEqual((await searchStations('日本', { fetchJson })).map((s) => s.id), ['byname', 'jp']);
  assert.ok(!urls.some((u) => u.includes('nominatim'))); // 国家名不用找城市
});

const ST = (id, name = id) => ({ id, name, url: `https://radio/${id}`, icon: '', place: '美国', info: 'MP3', hls: false });

test('广播: 收藏、最近听过 — 后收藏的在前; 取消了留着 (同步时听后改的); 最近听过只留最新的几个', () => {
  let r = withFavorite(null, ST('a'), true, 1000);
  r = withFavorite(r, ST('b'), true, 2000);
  assert.deepEqual(favoriteList(r).map((s) => s.id), ['b', 'a']);
  r = withFavorite(r, ST('a'), false, 3000);
  assert.deepEqual(favoriteList(r).map((s) => s.id), ['b']);
  assert.equal(r.favs.a.on, 0); // 取消了还留着记录
  assert.equal(isFavorite(r, 'b'), true);
  assert.equal(withFavorite(r, { id: 'x', name: 'x', url: 'http://no' }, true), r); // http 的台存不了
  for (let i = 0; i < RECENT_MAX + 3; i++) r = withRecent(r, ST(`r${i}`), 5000 + i);
  r = withRecent(r, ST('r0'), 9000); // 又听了一次: 排到最前
  assert.deepEqual(recentList(r).map((s) => s.id), ['r0', 'r8', 'r7', 'r6', 'r5', 'r4']);
  assert.equal(cleanRadio({ favs: { a: { on: 1, at: 1, s: { id: 'b', name: 'x', url: 'https://x' } } } }), null); // id 对不上的不要
  assert.equal(cleanRadio(null), null);
});

test('广播: 两台设备的收藏合起来 — 同一个台听后改的; 最近听过合在一起按时间', () => {
  const ipad = withRecent(withFavorite(withFavorite(null, ST('a'), true, 1000), ST('b'), true, 1000), ST('x'), 1500);
  const mac = withRecent(withFavorite(null, ST('a'), false, 2000), ST('y'), 2500); // Mac 上后来取消了 a
  const m = mergeRadio(ipad, mac);
  assert.deepEqual(favoriteList(m).map((s) => s.id), ['b']);
  assert.deepEqual(recentList(m).map((s) => s.id), ['y', 'x']);
  assert.equal(mergeRadio(null, mac), mac);
});

test('广播: 收藏存进 store (跟着同步), 同步来的合进来; v1.78 存在这台设备上的收藏搬进来', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const store = new Store(storage);
  store.setRadioFav(ST('a'), true, 1000);
  store.addRadioRecent(ST('a'), 1100);
  assert.deepEqual(favoriteList(store.data.radio).map((s) => s.id), ['a']);
  const again = new Store(storage); // 重新打开还在
  assert.deepEqual(recentList(again.data.radio).map((s) => s.id), ['a']);
  // 老的收藏 (localStorage 的 wengu:radio-favs): 测试里没有浏览器的 localStorage, 换成假的
  const real = globalThis.localStorage;
  const old = new Map([['wengu:radio-favs', JSON.stringify([ST('old1'), ST('old2'), { id: 'bad' }])]]);
  globalThis.localStorage = { getItem: (k) => old.get(k) ?? null, setItem: (k, v) => old.set(k, v), removeItem: (k) => old.delete(k) };
  try {
    again.moveOldRadioFavs(5000);
    assert.deepEqual(favoriteList(again.data.radio).map((s) => s.id), ['old1', 'old2', 'a']);
    assert.equal(old.has('wengu:radio-favs'), false); // 搬完删掉
    again.moveOldRadioFavs(6000); // 再来一次: 没有了, 不变
    assert.equal(favoriteList(again.data.radio).length, 3);
  } finally {
    globalThis.localStorage = real;
  }
});

test('广播: 我附近的台 — 按经纬度找方圆 80 公里的; 没有地方就不找', async () => {
  const urls = [];
  const got = await nearbyStations({ lat: 40.71, lon: -74.01 }, { fetchJson: async (u) => (urls.push(u), [RAW]) });
  assert.equal(got[0].id, 'u1');
  assert.match(urls[0], /geo_lat=40\.71&geo_long=-74\.01&geo_distance=80000/);
  assert.deepEqual(await nearbyStations(null), []);
});
