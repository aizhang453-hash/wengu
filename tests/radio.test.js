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

test('广播: 热门 (中文 / 全世界)、搜 (名字和种类), 都只要 https、没坏的、按听的人数排', async () => {
  const urls = [];
  const fetchJson = async (u) => (urls.push(u), [RAW]);
  assert.equal((await topStations('zh', { fetchJson }))[0].name, 'BBC World Service');
  assert.match(urls[0], /^https:\/\/de1\.api\.radio-browser\.info\/json\/stations\/search\?hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=40&language=chinese$/);
  await topStations('all', { fetchJson });
  assert.doesNotMatch(urls[1], /language=/);
  urls.length = 0;
  const found = await searchStations(' Jazz ', { fetchJson });
  assert.deepEqual(found.map((s) => s.id), ['u1']); // 名字、种类都找到同一个台: 只留一个
  assert.ok(urls.some((u) => u.includes('name=Jazz')));
  assert.ok(urls.some((u) => u.includes('tag=jazz')));
  assert.deepEqual(await searchStations('  ', { fetchJson }), []);
  // 第一个地址连不上: 换下一个
  const tried = [];
  await topStations('zh', { fetchJson: async (u) => (tried.push(u), u.startsWith(API_BASES[0]) ? Promise.reject(new Error('x')) : [RAW]) });
  assert.equal(tried.length, 2);
});
