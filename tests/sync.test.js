import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncOnce, parseRepo, utf8ToB64, b64ToUtf8, extOf, typeOf, DATA_PATH, expiryFromDate, knownExpiry, expiryInfo, expiryUnknown, SyncManager, loadConfig } from '../js/sync.js';
import { Store, makeCard } from '../js/store.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// 假的 GitHub 仓库: 每个文件有 sha, 写的时候 sha 对不上就冲突
function fakeRepo() {
  const files = new Map(); // path → { sha, data: string(base64) }
  let n = 0;
  const repo = {
    files,
    writes: 0,
    beforeWrite: null, // 测冲突: 写之前偷偷让「别的设备」先写一次
    async readText(path) {
      const f = files.get(path);
      return f ? { sha: f.sha, text: b64ToUtf8(f.data) } : null;
    },
    async readBlob(path) {
      const f = files.get(path);
      return f ? new Blob([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], { type: typeOf(path) }) : null;
    },
    async list(dir) {
      return [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1));
    },
    async write(path, data, sha) {
      if (repo.beforeWrite) {
        const hook = repo.beforeWrite;
        repo.beforeWrite = null;
        await hook();
      }
      const f = files.get(path);
      if ((f && f.sha !== sha) || (!f && sha)) {
        const e = new Error('conflict');
        e.kind = 'conflict';
        throw e;
      }
      repo.writes++;
      files.set(path, { sha: `sha${++n}`, data });
      return `sha${n}`;
    },
  };
  return repo;
}

function fakeMedia(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, get: async (id) => map.get(id) ?? null, put: async (blob, id) => map.set(id, blob) };
}

const device = () => new Store(memoryStorage());
const cardsOf = (store, title) => store.allSets().find((s) => s.title === title)?.cards.map((c) => c.term);

test('仓库名: 用户名/仓库名 或者网址都行', () => {
  assert.deepEqual(parseRepo('aizhang453-hash/wengu-data'), { owner: 'aizhang453-hash', repo: 'wengu-data' });
  assert.deepEqual(parseRepo(' https://github.com/a-b/c.d.git/ '), { owner: 'a-b', repo: 'c.d' });
  assert.equal(parseRepo('just-a-name'), null);
  assert.equal(parseRepo('a/b/c'), null);
});

test('中文来回转 base64 不坏; 后缀和类型', () => {
  assert.equal(b64ToUtf8(utf8ToB64('温故而知新 apple 🍎')), '温故而知新 apple 🍎');
  assert.equal(extOf('image/jpeg'), 'jpg');
  assert.equal(extOf('audio/webm;codecs=opus'), 'webm');
  assert.equal(typeOf('m_1.png'), 'image/png');
});

test('第一台设备推上去, 第二台拿下来; 再改再同步两边一样', async () => {
  const repo = fakeRepo();
  const a = device();
  const b = device();
  a.putSet({ title: '水果', cards: [makeCard('apple', '苹果')] });
  const r1 = await syncOnce({ store: a, repo, media: fakeMedia() });
  assert.equal(r1.pushed, true);
  assert.ok(repo.files.has(DATA_PATH));

  const r2 = await syncOnce({ store: b, repo, media: fakeMedia() });
  assert.equal(r2.changed, true);
  assert.deepEqual(cardsOf(b, '水果'), ['apple']);

  // B 加一张、学一张; A 同步拿到
  const set = b.allSets()[0];
  b.putSet({ ...set, cards: [...set.cards, makeCard('pear', '梨')] });
  b.recordAnswer(set.id, set.cards[0].id, true);
  await syncOnce({ store: b, repo, media: fakeMedia() });
  await syncOnce({ store: a, repo, media: fakeMedia() });
  assert.deepEqual(cardsOf(a, '水果'), ['apple', 'pear']);
  assert.equal(a.allSets()[0].stats[set.cards[0].id].right, 1);

  // 什么都没变就不再推
  const writes = repo.writes;
  const r3 = await syncOnce({ store: a, repo, media: fakeMedia() });
  assert.equal(r3.pushed, false);
  assert.equal(repo.writes, writes);
});

test('推的时候别的设备刚好也推了: 重新拿、合并, 两边的都不丢', async () => {
  const repo = fakeRepo();
  const a = device();
  const b = device();
  a.putSet({ title: 'A 的', cards: [makeCard('a', '一')] });
  await syncOnce({ store: a, repo, media: fakeMedia() });
  await syncOnce({ store: b, repo, media: fakeMedia() });
  b.putSet({ title: 'B 的', cards: [makeCard('b', '二')] });
  a.putSet({ title: 'A 又一个', cards: [makeCard('c', '三')] });
  // A 推之前, B 抢先推了
  repo.beforeWrite = () => syncOnce({ store: b, repo, media: fakeMedia() });
  await syncOnce({ store: a, repo, media: fakeMedia() });
  await syncOnce({ store: b, repo, media: fakeMedia() });
  const titles = (s) => s.allSets().map((x) => x.title).sort();
  assert.deepEqual(titles(a), ['A 又一个', 'A 的', 'B 的']);
  assert.deepEqual(titles(b), titles(a));
});

test('一台删了, 另一台同步后也没了', async () => {
  const repo = fakeRepo();
  const a = device();
  const b = device();
  const s = a.putSet({ title: '要删的', cards: [makeCard('x', 'y')] });
  await syncOnce({ store: a, repo, media: fakeMedia() });
  await syncOnce({ store: b, repo, media: fakeMedia() });
  assert.equal(b.allSets().length, 1);
  b.deleteSet(s.id);
  await syncOnce({ store: b, repo, media: fakeMedia() });
  await syncOnce({ store: a, repo, media: fakeMedia() });
  assert.equal(a.allSets().length, 0);
});

test('图片录音: 有的传上去, 缺的拿下来', async () => {
  const repo = fakeRepo();
  const a = device();
  const b = device();
  a.putSet({ title: '有图', cards: [makeCard('cat', '猫', { image: 'm_img1', termAudio: 'm_aud1' })] });
  const mediaA = fakeMedia({ m_img1: new Blob(['PNGDATA'], { type: 'image/png' }), m_aud1: new Blob(['WEBM'], { type: 'audio/webm' }) });
  const r1 = await syncOnce({ store: a, repo, media: mediaA });
  assert.equal(r1.uploaded, 2);
  assert.ok(repo.files.has('media/m_img1.png'));
  assert.ok(repo.files.has('media/m_aud1.webm'));

  const mediaB = fakeMedia();
  const r2 = await syncOnce({ store: b, repo, media: mediaB });
  assert.equal(r2.downloaded, 2);
  assert.equal(await mediaB.map.get('m_img1').text(), 'PNGDATA');
  assert.equal(mediaB.map.get('m_img1').type, 'image/png');
  // 再同步不重复传
  const r3 = await syncOnce({ store: b, repo, media: mediaB });
  assert.equal(r3.uploaded + r3.downloaded, 0);
});

// ---- 密钥哪天过期 ----
// 网页读不到 GitHub 给的过期日期, 只记自己填的; 以前按一年猜的当作不知道

const DAY = 86400000;

test('过期日期: 日期框的日子 → 那天晚上 23:59, 没填 / 看不懂的不出错', () => {
  assert.equal(expiryFromDate('2027-10-12'), new Date(2027, 9, 12, 23, 59).getTime());
  assert.equal(expiryFromDate(''), null);
  assert.equal(expiryFromDate(null), null);
  assert.equal(expiryFromDate('明天'), null);
});

test('过期日期: 只要自己填的和「不会过期」, 猜的不要 (扫码带过来的也一样)', () => {
  const now = Date.UTC(2026, 9, 12);
  assert.deepEqual(knownExpiry({ expiresAt: now + 100 * DAY, expirySource: 'user' }), { expiresAt: now + 100 * DAY, expirySource: 'user' });
  assert.deepEqual(knownExpiry({ expiresAt: String(now), expirySource: 'user' }), { expiresAt: now, expirySource: 'user' });
  assert.deepEqual(knownExpiry({ expiresAt: 5, expirySource: 'never' }), { expiresAt: null, expirySource: 'never' });
  assert.deepEqual(knownExpiry({ expiresAt: now + 366 * DAY, expirySource: 'guess' }), {});
  assert.deepEqual(knownExpiry({ expiresAt: 'x', expirySource: 'user' }), {});
  assert.deepEqual(knownExpiry({ expiresAt: undefined, expirySource: undefined }), {});
  assert.deepEqual(knownExpiry(null), {});
});

test('过期日期: 还剩两周以内提醒, 过了说过期; 不会过期的、猜的、没填的不提醒', () => {
  const now = Date.UTC(2026, 9, 12);
  assert.equal(expiryInfo(null), null);
  assert.equal(expiryInfo({ expiresAt: null, expirySource: 'never' }), null);
  assert.equal(expiryInfo({ expiresAt: now + 10 * DAY, expirySource: 'guess' }, now), null);
  assert.deepEqual(expiryInfo({ expiresAt: now + 100 * DAY, expirySource: 'user' }, now), { at: now + 100 * DAY, days: 100, warn: false, expired: false });
  assert.equal(expiryInfo({ expiresAt: now + 14 * DAY, expirySource: 'user' }, now).warn, true);
  assert.equal(expiryInfo({ expiresAt: now + 15 * DAY, expirySource: 'user' }, now).warn, false);
  const gone = expiryInfo({ expiresAt: now - DAY, expirySource: 'user' }, now);
  assert.equal(gone.expired, true);
  assert.equal(gone.warn, true);
  assert.equal(gone.days, 0);
  // 按日历算: 选了 10 天后那天 (晚上 23:59 过期) 就是还有 10 天
  const noon = new Date(2026, 9, 12, 12, 0).getTime();
  assert.equal(expiryInfo({ expiresAt: expiryFromDate('2026-10-22'), expirySource: 'user' }, noon).days, 10);
  const tonight = expiryInfo({ expiresAt: expiryFromDate('2026-10-12'), expirySource: 'user' }, noon);
  assert.deepEqual([tonight.days, tonight.expired, tonight.warn], [0, false, true]);
  // 老版本存的设置没有过期日期: 不提醒
  assert.equal(expiryInfo({ owner: 'a', repo: 'b', token: 't' }, now), null);
});

test('过期日期: 连着同步但不知道哪天过期 (没填、以前猜的) 要提醒去填', () => {
  const c = { owner: 'a', repo: 'b', token: 't' };
  assert.equal(expiryUnknown(null), false);
  assert.equal(expiryUnknown(c), true);
  assert.equal(expiryUnknown({ ...c, expiresAt: 1, expirySource: 'guess' }), true);
  assert.equal(expiryUnknown({ ...c, expiresAt: 1, expirySource: 'user' }), false);
  assert.equal(expiryUnknown({ ...c, expiresAt: null, expirySource: 'never' }), false);
});

// 假的 GitHub (fetch)
function fakeFetch() {
  const files = new Map();
  let n = 0;
  return async (url, opts = {}) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    const path = new URL(url).pathname;
    const name = path.replace(/^\/repos\/[^/]+\/[^/]+\/?(contents\/)?/, '');
    const send = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers });
    if (opts.method === 'PUT') {
      const body = JSON.parse(opts.body);
      files.set(name, body.content);
      return send(201, { content: { sha: `s${++n}` } });
    }
    if (name === '') return send(200, { private: true });
    if (!files.has(name)) return send(404, { message: 'Not Found' });
    return send(200, { type: 'file', sha: 's', encoding: 'base64', content: files.get(name) });
  };
}

test('过期日期: 同步不会改掉自己填的日期, 没填的也不会给你猜一个', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch();
  try {
    for (const expiry of [{ expiresAt: Date.UTC(2027, 2, 1), expirySource: 'user' }, {}]) {
      const storage = memoryStorage();
      storage.setItem('wengu:sync', JSON.stringify({ owner: 'o', repo: 'r', token: 't', ...expiry }));
      const store = new Store(memoryStorage());
      store.putSet({ title: '水果', cards: [makeCard('apple', '苹果')] });
      const manager = new SyncManager(store, { storage });
      const result = await manager.sync();
      assert.ok(result);
      const c = loadConfig(storage);
      assert.ok(c.lastSyncAt > 0);
      assert.equal(c.expiresAt, expiry.expiresAt);
      assert.equal(c.expirySource, expiry.expirySource);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('同步出错时记下是哪种错 (密钥不对 → auth, 页面会直接打开「换密钥」)', async () => {
  const storage = memoryStorage();
  storage.setItem('wengu:sync', JSON.stringify({ owner: 'o', repo: 'r', token: 'old' }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"message":"Bad credentials"}', { status: 401 });
  try {
    const manager = new SyncManager(new Store(memoryStorage()), { storage });
    await manager.sync();
    assert.equal(manager.state.status, 'error');
    assert.equal(manager.state.kind, 'auth');
    assert.match(manager.state.message, /过期/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
