import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncOnce, parseRepo, utf8ToB64, b64ToUtf8, extOf, typeOf, DATA_PATH, INDEX_PATH, PACK_BYTES, encodePack, decodePack, GitHubRepo, expiryFromDate, knownExpiry, expiryInfo, expiryUnknown, SyncManager, loadConfig } from '../js/sync.js';
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
    // 一次提交改好几个 (GitHubRepo.commit 一样): null 删掉; expect 对不上就冲突
    async commit(changes, message, expect = {}) {
      if (repo.beforeCommit) {
        const hook = repo.beforeCommit;
        repo.beforeCommit = null;
        await hook();
      }
      for (const [path, sha] of Object.entries(expect)) {
        if (files.get(path)?.sha !== sha) throw Object.assign(new Error('conflict'), { kind: 'conflict' });
      }
      repo.commits = (repo.commits ?? 0) + 1;
      const shas = {};
      for (const [path, value] of Object.entries(changes)) {
        if (value === null) files.delete(path);
        else {
          const data = typeof value === 'string' ? utf8ToB64(value) : btoa(String.fromCharCode(...value));
          files.set(path, { sha: `sha${++n}`, data });
          shas[path] = `sha${n}`;
        }
      }
      return shas;
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
  // 打成一包, 目录里记着
  const packs = [...repo.files.keys()].filter((k) => k.startsWith('media/packs/'));
  assert.equal(packs.length, 1);
  const index = JSON.parse(b64ToUtf8(repo.files.get(INDEX_PATH).data));
  assert.deepEqual(Object.values(index.packs), [['m_img1', 'm_aud1']]);

  const mediaB = fakeMedia();
  const r2 = await syncOnce({ store: b, repo, media: mediaB });
  assert.equal(r2.downloaded, 2);
  assert.equal(await mediaB.map.get('m_img1').text(), 'PNGDATA');
  assert.equal(mediaB.map.get('m_img1').type, 'image/png');
  // 再同步不重复传
  const r3 = await syncOnce({ store: b, repo, media: mediaB });
  assert.equal(r3.uploaded + r3.downloaded, 0);
});

const bytesOf = (blob) => blob.arrayBuffer().then((b) => [...new Uint8Array(b)]);

test('图片录音的包: 打包、拆包一样; 不是包、坏了的不出错', async () => {
  const items = [
    { id: 'm_a', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) },
    { id: 'm_b', blob: new Blob([], { type: 'audio/mpeg' }) },
    { id: 'm_c', blob: new Blob(['中文'], { type: '' }) },
  ];
  const back = decodePack(await encodePack(items));
  assert.deepEqual(back.map((x) => [x.id, x.blob.type, x.blob.size]), [['m_a', 'image/jpeg', 3], ['m_b', 'audio/mpeg', 0], ['m_c', '', 6]]);
  assert.deepEqual(await bytesOf(back[0].blob), [1, 2, 3]);
  assert.deepEqual(decodePack(new Uint8Array([1, 2, 3])), []);
  const cut = (await encodePack(items)).slice(0, -2); // 少了最后两个字节: 前面的还在
  assert.deepEqual(decodePack(cut).map((x) => x.id), ['m_a', 'm_b']);
});

test('同步: 上万个图片录音 —— 卡片先推上去; 几 MB 一包; 中途 GitHub 不让传了, 下次接着传, 不重复', async () => {
  const repo = fakeRepo();
  const a = device();
  const big = (n) => new Blob([new Uint8Array(n)], { type: 'audio/mpeg' });
  const cards = Array.from({ length: 6 }, (_, i) => makeCard(`w${i}`, `d${i}`, { termAudio: `m_s${i}` }));
  a.putSet({ title: '大卡组', cards });
  const mediaA = fakeMedia(Object.fromEntries(cards.map((c, i) => [`m_s${i}`, big(Math.floor(PACK_BYTES / 2.5))])));
  // 传第二包时 GitHub 不让传了
  const write = repo.write;
  let packWrites = 0;
  repo.write = async (path, ...rest) => {
    if (path.startsWith('media/packs/') && ++packWrites === 2) throw Object.assign(new Error('GitHub 嫌传得太快了'), { kind: 'rate' });
    return write(path, ...rest);
  };
  await assert.rejects(syncOnce({ store: a, repo, media: mediaA }), /太快/);
  // 卡片已经推上去了
  assert.equal(JSON.parse(b64ToUtf8(repo.files.get(DATA_PATH).data)).sets[0].cards.length, 6);
  const r = await syncOnce({ store: a, repo, media: mediaA });
  const index = JSON.parse(b64ToUtf8(repo.files.get(INDEX_PATH).data));
  const ids = Object.values(index.packs).flat();
  assert.equal(r.uploaded, 4); // 第一包的 2 个不再传
  assert.deepEqual(ids.sort(), cards.map((_, i) => `m_s${i}`).sort());
  assert.ok(Object.keys(index.packs).length >= 3); // 一包最多大概 8 MB
  // 另一台设备一包一包拿下来
  const b = device();
  const mediaB = fakeMedia();
  const rb = await syncOnce({ store: b, repo, media: mediaB });
  assert.equal(rb.downloaded, 6);
  assert.equal(mediaB.map.get('m_s3').size, Math.floor(PACK_BYTES / 2.5));
});

test('同步: v1.26 以前一个一个传的图片还认; 两台设备同时传包, 目录不会盖掉别人的', async () => {
  const repo = fakeRepo();
  repo.files.set('media/m_old.png', { sha: 'x1', data: btoa('OLDPNG') });
  const a = device();
  const b = device();
  a.putSet({ title: '老图', cards: [makeCard('old', '老', { image: 'm_old' }), makeCard('a', 'A', { image: 'm_a1' })] });
  b.putSet({ title: '新图', cards: [makeCard('b', 'B', { image: 'm_b1' })] });
  const mediaA = fakeMedia({ m_a1: new Blob(['A1'], { type: 'image/png' }) });
  const mediaB = fakeMedia({ m_b1: new Blob(['B1'], { type: 'image/png' }) });
  const write = repo.write;
  let raced = false;
  repo.write = async (path, ...rest) => {
    // a 写目录之前, b 先传完了一包、写了目录
    if (path === INDEX_PATH && !raced) {
      raced = true;
      await syncOnce({ store: b, repo, media: mediaB });
    }
    return write(path, ...rest);
  };
  const r = await syncOnce({ store: a, repo, media: mediaA });
  assert.equal(r.downloaded, 1);
  assert.equal(await mediaA.map.get('m_old').text(), 'OLDPNG');
  const index = JSON.parse(b64ToUtf8(repo.files.get(INDEX_PATH).data));
  assert.deepEqual(Object.values(index.packs).flat().sort(), ['m_a1', 'm_b1']);
});

test('删掉的卡片集用过的图片录音: 过一天从仓库删掉 (还用着的不删); 一包一半以上没用了重新打包; 又用上了就不删', async () => {
  const HOUR = 3600e3;
  let t = Date.now();
  const clock = () => t;
  const repo = fakeRepo();
  repo.files.set('media/m_old1.png', { sha: 'x1', data: btoa('OLD1') }); // v1.26 以前一个一个传的
  repo.files.set('media/m_old2.png', { sha: 'x2', data: btoa('OLD2') });
  const a = device();
  const keep = a.putSet({ title: '留着', cards: [makeCard('k1', '', { image: 'm_k1' }), makeCard('k2', '', { image: 'm_old2' })] });
  const gone = a.putSet({ title: '要删的', cards: [makeCard('g1', '', { image: 'm_g1' }), makeCard('g2', '', { image: 'm_g2' }), makeCard('o1', '', { image: 'm_old1' })] });
  const half = a.putSet({ title: '删一半', cards: ['h1', 'h2', 'h3', 'h4'].map((w) => makeCard(w, '', { image: `m_${w}` })) });
  const blob = (s) => new Blob([s], { type: 'image/png' });
  const media = fakeMedia(Object.fromEntries(['m_k1', 'm_g1', 'm_g2', 'm_h1', 'm_h2', 'm_h3', 'm_h4'].map((id) => [id, blob(id)])));
  // 分三次传, 三个包: 「留着」的、「要删的」的、「删一半」的
  const sets = [keep, gone, half];
  for (const s of sets) {
    const only = device();
    only.putSet(a.getSet(s.id));
    await syncOnce({ store: only, repo, media, now: clock });
  }
  await syncOnce({ store: a, repo, media, now: clock });
  const index = () => JSON.parse(b64ToUtf8(repo.files.get(INDEX_PATH).data));
  const packFiles = () => [...repo.files.keys()].filter((k) => k.startsWith('media/packs/')).length;
  assert.equal(packFiles(), 3);

  a.deleteSet(gone.id);
  const halfSet = a.getSet(half.id);
  a.putSet({ ...halfSet, cards: halfSet.cards.slice(0, 1) }); // 删一半里只留 h1 (删了 3/4)
  let r = await syncOnce({ store: a, repo, media, now: clock });
  assert.equal(r.removed, 0); // 先记下, 不马上删
  assert.deepEqual(Object.keys(index().unused).sort(), ['m_g1', 'm_g2', 'm_h2', 'm_h3', 'm_h4', 'm_old1']);
  assert.ok(repo.files.has('media/m_old1.png'));

  t += 25 * HOUR;
  r = await syncOnce({ store: a, repo, media, now: clock });
  assert.equal(r.removed, 6);
  assert.ok(!repo.files.has('media/m_old1.png'));
  assert.ok(repo.files.has('media/m_old2.png')); // 还用着
  assert.equal(packFiles(), 2); // 「要删的」整包删了; 「删一半」重新打包, 只剩 h1
  assert.deepEqual(Object.values(index().packs).flat().sort(), ['m_h1', 'm_k1']);
  assert.deepEqual(index().unused, {});
  // 另一台设备还拿得到留着的
  const b = device();
  const mb = fakeMedia();
  await syncOnce({ store: b, repo, media: mb, now: clock });
  assert.deepEqual([...mb.map.keys()].sort(), ['m_h1', 'm_k1', 'm_old2']);
  assert.equal(await mb.map.get('m_h1').text(), 'm_h1');

  // 记下没用了、还没到一天又用上了 (别的设备又加回来): 不删
  const k = a.getSet(keep.id);
  a.putSet({ ...k, cards: k.cards.slice(0, 1) });
  await syncOnce({ store: a, repo, media, now: clock });
  assert.deepEqual(Object.keys(index().unused), ['m_old2']);
  a.putSet({ ...a.getSet(keep.id), cards: [...a.getSet(keep.id).cards, makeCard('back', '', { image: 'm_old2' })] });
  t += 25 * HOUR;
  r = await syncOnce({ store: a, repo, media, now: clock });
  assert.equal(r.removed, 0);
  assert.ok(repo.files.has('media/m_old2.png'));
  assert.deepEqual(index().unused, {});
});

test('删不用的图片录音时另一台设备正好也在改: 这次不删, 什么都不坏, 下次再删', async () => {
  let t = Date.now();
  const repo = fakeRepo();
  const a = device();
  const s = a.putSet({ title: '要删的', cards: [makeCard('g', '', { image: 'm_g' })] });
  const media = fakeMedia({ m_g: new Blob(['G'], { type: 'image/png' }) });
  await syncOnce({ store: a, repo, media, now: () => t });
  a.deleteSet(s.id);
  await syncOnce({ store: a, repo, media, now: () => t });
  t += 25 * 3600e3;
  // 提交之前, 别的设备改了目录
  repo.beforeCommit = async () => {
    const f = repo.files.get(INDEX_PATH);
    repo.files.set(INDEX_PATH, { ...f, sha: 'other' });
  };
  const r = await syncOnce({ store: a, repo, media, now: () => t });
  assert.equal(r.removed, 0);
  assert.ok([...repo.files.keys()].some((k) => k.startsWith('media/packs/')));
  const r2 = await syncOnce({ store: a, repo, media, now: () => t });
  assert.equal(r2.removed, 1);
  assert.ok(![...repo.files.keys()].some((k) => k.startsWith('media/packs/')));
});

test('GitHub: 清理旧历史 —— 只留现在的 (内容一样、没有上一个版本, 强推); 只有一个版本不用清; 这中间别人推了就不清', async () => {
  const calls = [];
  let head = 'H1';
  let parents = ['H0'];
  const routes = {
    'GET ': () => [200, { default_branch: 'main' }],
    'GET /commits?per_page=1': () => [200, [{}], { link: '<https://api.github.com/repos/o/r/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repos/o/r/commits?per_page=1&page=1250>; rel="last"' }],
    'GET /git/ref/heads/main': () => [200, { object: { sha: head } }],
    'GET /git/commits/H1': () => [200, { tree: { sha: 'TREE' }, parents }],
    'POST /git/commits': (body) => (calls.push(['commit', body.tree, body.parents]), [201, { sha: 'NEW' }]),
    'PATCH /git/refs/heads/main': (body) => (calls.push(['ref', body.sha, body.force]), [200, {}]),
  };
  const repo = new GitHubRepo({ owner: 'o', repo: 'r', token: 't' }, routeFetch(routes));
  assert.equal(await repo.commitCount(), 1250);
  assert.equal(await repo.squash('清理'), true);
  assert.deepEqual(calls, [['commit', 'TREE', []], ['ref', 'NEW', true]]);
  // 只有一个版本
  calls.length = 0;
  parents = [];
  assert.equal(await repo.squash('清理'), false);
  assert.equal(calls.length, 0);
  // 新建好提交、还没换分支的时候别的设备推了: 不换
  parents = ['H0'];
  routes['POST /git/commits'] = () => ((head = 'H2'), [201, { sha: 'NEW2' }]);
  await assert.rejects(repo.squash('清理'), (e) => e.kind === 'conflict');
  assert.ok(!calls.some((c) => c[0] === 'ref'));
});

// 假的 GitHub 接口 (fetch): routes = { '方法 路径': (body) => [状态, json] }
function routeFetch(routes) {
  return async (url, { method, body }) => {
    const path = url.replace('https://api.github.com/repos/o/r', '');
    const route = routes[`${method} ${path}`];
    const [status, json, headers = {}] = route ? route(body && JSON.parse(body)) : [404, {}];
    return { status, ok: status < 300, headers: { get: (k) => headers[k] ?? null }, json: async () => json, text: async () => JSON.stringify(json) };
  };
}

test('GitHub: 文件夹里上千个文件都列得出来 (contents 接口只给 1000 个); 传太快了说清楚, 不说成密钥不对', async () => {
  const media = 'a'.repeat(40);
  const files = Array.from({ length: 1500 }, (_, i) => ({ path: `m_${i}.mp3`, type: 'blob', sha: `b${i}` }));
  const repo = new GitHubRepo(
    { owner: 'o', repo: 'r', token: 't' },
    routeFetch({
      'GET ': () => [200, { default_branch: 'main', private: true }],
      'GET /git/trees/main': () => [200, { tree: [{ path: 'media', type: 'tree', sha: media }, { path: 'wengu.json', type: 'blob', sha: 'x' }] }],
      [`GET /git/trees/${media}`]: () => [200, { tree: [...files, { path: 'packs', type: 'tree', sha: 'c'.repeat(40) }] }],
      'PUT /contents/wengu.json': () => [403, { message: 'You have exceeded a secondary rate limit.' }],
      'PUT /contents/x.json': () => [403, { message: 'Resource not accessible by personal access token' }],
    }),
  );
  assert.equal((await repo.list('media')).length, 1500);
  assert.deepEqual(await repo.list('nothing'), []);
  await assert.rejects(repo.write('wengu.json', '', 'x', ''), (e) => e.kind === 'rate');
  await assert.rejects(repo.write('x.json', '', 'x', ''), (e) => e.kind === 'auth');
  const empty = new GitHubRepo({ owner: 'o', repo: 'r', token: 't' }, routeFetch({ 'GET /git/trees/main': () => [409, { message: 'Git Repository is empty.' }] }));
  assert.deepEqual(await empty.list('media'), []); // 空仓库 (默认分支上面记着了)
});

test('GitHub: 一次提交删好几个、加一个、改目录 (git 接口); 目录被别人改了、分支动了就不提交', async () => {
  const media = 'd'.repeat(40);
  const calls = [];
  let refStatus = 200;
  const routes = {
    'GET ': () => [200, { default_branch: 'main' }],
    'GET /git/ref/heads/main': () => [200, { object: { sha: 'HEAD1' } }],
    'GET /git/commits/HEAD1': () => [200, { tree: { sha: 'e'.repeat(40) } }],
    [`GET /git/trees/${'e'.repeat(40)}`]: () => [200, { tree: [{ path: 'media', type: 'tree', sha: media }] }],
    [`GET /git/trees/${media}`]: () => [200, { tree: [{ path: 'index.json', type: 'blob', sha: 'IDX1' }] }],
    'POST /git/blobs': (body) => (calls.push(['blob', body.encoding, body.content.length]), [201, { sha: `B${calls.length}` }]),
    'POST /git/trees': (body) => (calls.push(['tree', body.base_tree, body.tree]), [201, { sha: 'T2' }]),
    'POST /git/commits': (body) => (calls.push(['commit', body.parents, body.tree]), [201, { sha: 'C2' }]),
    'PATCH /git/refs/heads/main': (body) => (calls.push(['ref', body.sha, body.force]), refStatus === 200 ? [200, {}] : [422, { message: 'Update is not a fast forward' }]),
  };
  const repo = new GitHubRepo({ owner: 'o', repo: 'r', token: 't' }, routeFetch(routes));
  const shas = await repo.commit({ 'media/m_1.png': null, 'media/packs/p_new.wgp': new Uint8Array([1, 2, 3]), 'media/index.json': '{"version":1}' }, '整理', { 'media/index.json': 'IDX1' });
  assert.deepEqual(Object.keys(shas), ['media/packs/p_new.wgp', 'media/index.json']);
  const tree = calls.find((c) => c[0] === 'tree');
  assert.equal(tree[1], 'e'.repeat(40));
  assert.deepEqual(tree[2][0], { path: 'media/m_1.png', mode: '100644', type: 'blob', sha: null });
  assert.deepEqual(calls.find((c) => c[0] === 'commit').slice(1), [['HEAD1'], 'T2']);
  assert.deepEqual(calls.at(-1), ['ref', 'C2', undefined]); // 不强推
  // 目录被别人改了: 不提交
  calls.length = 0;
  await assert.rejects(repo.commit({ 'media/index.json': '{}' }, 'x', { 'media/index.json': 'OLD' }), (e) => e.kind === 'conflict');
  assert.equal(calls.length, 0);
  // 分支动了 (不是接着最新的): 冲突
  refStatus = 422;
  await assert.rejects(repo.commit({ 'media/m_2.png': null }, 'x', {}), (e) => e.kind === 'conflict');
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
