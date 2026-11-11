import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationOf, stationsOf, topStations, searchStations, API_BASES } from '../js/radio.js';

const RAW = { stationuuid: 'u1', name: '  BBC  World   Service ', url: 'http://x', url_resolved: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', favicon: 'https://bbc/icon.png', country: 'The United Kingdom Of Great Britain And Northern Ireland', state: '', codec: 'MP3', bitrate: 56, hls: 0 };

test('广播: 电台目录的一条 → 温故用的; 只要 https 的; HLS 只在能放的浏览器上要; 去掉重复的', () => {
  assert.deepEqual(stationOf(RAW), { id: 'u1', name: 'BBC World Service', url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service', icon: 'https://bbc/icon.png', place: 'The United Kingdom Of Great Britain And Northern Ireland', info: 'MP3 · 56 kbps', hls: false });
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
