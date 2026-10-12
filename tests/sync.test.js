import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncOnce, parseRepo, utf8ToB64, b64ToUtf8, extOf, typeOf, DATA_PATH } from '../js/sync.js';
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
