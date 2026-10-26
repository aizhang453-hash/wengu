// 多设备同步: 存在你自己的 GitHub 私有仓库里。
//   wengu.json                  卡片集、文件夹、打卡、删除记录
//   media/packs/<包>.wgp        图片、录音, 一个包装好多个 (几 MB 一包; 见 encodePack)
//   media/index.json            哪个包里有哪些: { version: 1, packs: { 包: [图片录音 id] }, unused: { id: 哪天开始没用的 } }
//   media/<id>.<后缀>           v1.26 以前一个一个传的图片、录音 (还认, 不再这样传)
// 删掉的卡片集、卡片用过的图片录音, 过一个星期 (万一别的设备还要) 从仓库删掉, 好几个一起一次提交; 一包里一半以上没用了就重新打包。
// 目录里记着、文件却没了的包 (清理旧历史时正好有设备在传、手动删了) 当没传过, 有的设备会再传; 目录里没记着的包过一个星期删掉。
// 每台设备填一次「仓库 + 密钥」(密钥只能改这一个仓库), 之后打开、改动、回到页面时自动同步。
// 同步: 拿下仓库里的 → 跟本机的合并 (merge.js) → 推上去 → 补齐图片录音 (本机缺的拿下来, 仓库缺的打包传上去)。
// 卡片先推: Anki 卡组动不动上万个图片录音, 等传完才推卡片, 别的设备半天看不到 (图片录音没到之前先不显示, 下次同步再拿)。
// 推的时候发现别的设备刚推过 (sha 对不上), 重新拿、重新合并再推。
// 以前一个文件一次提交, 上万个文件 GitHub 嫌太快不让传, 列文件夹也只给前 1000 个 (以为没传过, 再传就出错), 所以改成打包。

import { cleanData, newId } from './store.js';
import { mergeData } from './merge.js';
import { usedMediaIds, getMedia, putMedia, mediaKeys } from './media.js';

export const CONFIG_KEY = 'wengu:sync';
export const DATA_PATH = 'wengu.json';
export const INDEX_PATH = 'media/index.json';
export const PACK_BYTES = 8 * 1024 * 1024; // 一包大概多大 (base64 以后 11 MB 左右, GitHub 一个文件最多 100 MB)
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 没用的图片录音过多久从仓库删掉 (别的设备一个星期没同步也来得及)
const DELETES_PER_COMMIT = 1000;
const DEFAULT_API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(message, kind = 'other') {
    super(message);
    this.kind = kind;
  }
}

// ---- 设置 (存在本机) ----
export function loadConfig(storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage?.getItem(CONFIG_KEY) ?? 'null');
    return c && c.owner && c.repo && c.token ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(config, storage = globalThis.localStorage) {
  try {
    if (config) storage?.setItem(CONFIG_KEY, JSON.stringify(config));
    else storage?.removeItem(CONFIG_KEY);
  } catch {
    // 存不了就算了
  }
}

// ---- 密钥哪天过期 ----
// 网页读不到: GitHub 回答里虽然带着 (github-authentication-token-expiration), 但不让别的网站的网页看。
// 所以不猜, 连上 (或换密钥) 时自己填 (GitHub 的密钥列表里写着 Expires on ……), 或者说「不会过期」。
// 还剩两周时提醒去换。以前的版本按一年猜过 (expirySource: 'guess'), 当作不知道。
const DAY = 24 * 60 * 60 * 1000;
export const WARN_DAYS = 14;

// 日期框里的 "2027-10-12" → 那天晚上 23:59 (本地时间); 没填 / 看不懂返回 null
export function expiryFromDate(text) {
  const m = String(text ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59).getTime();
  return Number.isFinite(t) ? t : null;
}

// 要存的过期日期: 只要自己填的和「不会过期」; 猜的、坏的都不要 (返回 {})
export function knownExpiry(e) {
  if (e?.expirySource === 'never') return { expiresAt: null, expirySource: 'never' };
  if (e?.expirySource === 'user' && Number(e.expiresAt) > 0) return { expiresAt: Number(e.expiresAt), expirySource: 'user' };
  return {};
}

// { at, days (还有几天, 按日历算, 0 是今天), warn (该提醒了), expired }; 不知道 / 不会过期返回 null
export function expiryInfo(config, now = Date.now()) {
  const { expiresAt } = knownExpiry(config);
  if (!expiresAt) return null;
  const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(expiresAt) - midnight(now)) / DAY);
  return { at: expiresAt, days: Math.max(0, days), warn: days <= WARN_DAYS, expired: expiresAt <= now };
}

// 连着同步, 可是不知道密钥哪天过期 (没填、以前猜的): 要提醒去填
export const expiryUnknown = (config) => Boolean(config) && !knownExpiry(config).expirySource;

// 「用户名/仓库名」或者 https://github.com/用户名/仓库名
export function parseRepo(text) {
  const m = String(text ?? '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

// ---- 字和 base64 互换 (中文要先变成 UTF-8) ----
function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function utf8ToB64(text) {
  return bytesToB64(new TextEncoder().encode(text));
}

export function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
export const extOf = (type) => EXT[String(type).split(';')[0]] ?? 'bin';
export const typeOf = (name) => TYPE[name.split('.').pop()] ?? '';

// ---- GitHub ----
export class GitHubRepo {
  constructor({ owner, repo, token, api = DEFAULT_API }, fetchImpl = globalThis.fetch?.bind(globalThis)) {
    Object.assign(this, { owner, repo, token, api: api.replace(/\/$/, ''), fetch: fetchImpl });
  }

  // timeout: 多久没回就算了 (网断了一半时不会一直「同步中」); 传、拿几 MB 的包给久一点
  async call(method, path, { body = null, accept = 'application/vnd.github+json', timeout = 60_000 } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.api}/repos/${this.owner}/${this.repo}${path}`, {
        method,
        cache: 'no-store',
        headers: { Authorization: `Bearer ${this.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: globalThis.AbortSignal?.timeout?.(timeout),
      });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new SyncError('GitHub 太久未响应，稍后自动重试', 'network');
      throw new SyncError('无法连接 GitHub，请检查网络', 'network');
    }
    if (res.status === 401) throw new SyncError('密钥无效或已过期', 'auth');
    if (res.status === 429) throw new SyncError('请求过于频繁，几分钟后自动继续', 'rate');
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') throw new SyncError('同步过于频繁，请稍后再试', 'rate');
      // 一下传太多 (secondary rate limit) 也是 403, 不是密钥的事
      const text = await res.text().catch(() => '');
      if (/rate limit|abuse/i.test(text) || res.headers.get('retry-after')) throw new SyncError('请求过于频繁，几分钟后自动继续', 'rate');
      throw new SyncError('密钥没有该仓库的写入权限（Contents 需设为 Read and write）', 'auth');
    }
    if (res.status === 404) {
      if (method === 'GET') return null;
      throw new SyncError('找不到该仓库，或密钥没有访问权限', 'auth');
    }
    if (res.status === 409) throw new SyncError('其他设备刚刚同步过', 'conflict');
    if (res.status === 422) {
      // 文件的 sha 对不上、分支不是接着上一个的: 别的设备刚推过; 别的 422 是真出错了, 说清楚
      const text = await res.text().catch(() => '');
      if (/sha|fast.?forward/i.test(text)) throw new SyncError('其他设备刚刚同步过', 'conflict');
      let message = '';
      try {
        message = JSON.parse(text).message ?? '';
      } catch {
        // 没有就算了
      }
      throw new SyncError(`GitHub 拒绝了请求（${message || 422}）`, 'other');
    }
    if (!res.ok) throw new SyncError(`GitHub 出错（${res.status}），请稍后再试`, 'other');
    return res;
  }

  // 检查仓库能不能用: 找得到, 而且最好是私有的
  async check() {
    const res = await this.call('GET', '');
    if (!res) throw new SyncError('找不到该仓库，或密钥没有访问权限', 'auth');
    return res.json();
  }

  async readText(path) {
    const res = await this.call('GET', `/contents/${path}`);
    if (!res) return null;
    const meta = await res.json();
    if (meta.type && meta.type !== 'file') throw new SyncError(`仓库中的 ${path} 不是文件`);
    if (meta.encoding === 'base64' && meta.content) return { sha: meta.sha, text: b64ToUtf8(meta.content) };
    // 超过 1MB 的, 接口不给内容, 要用 raw 再拿一次
    const raw = await this.call('GET', `/contents/${path}`, { accept: 'application/vnd.github.raw+json', timeout: 300_000 });
    return { sha: meta.sha, text: raw ? await raw.text() : '' };
  }

  async readBlob(path) {
    const res = await this.call('GET', `/contents/${path}`, { accept: 'application/vnd.github.raw+json', timeout: 600_000 });
    if (!res) return null;
    return new Blob([await res.arrayBuffer()], { type: typeOf(path) });
  }

  // 一个文件夹里的文件名。用 git trees 接口: contents 接口一个文件夹最多只给 1000 个
  async list(dir) {
    const entries = await this.tree(dir);
    return entries.filter((x) => x.type === 'blob').map((x) => x.path);
  }

  // 默认分支 (main), 记着
  async branch() {
    const key = `${this.owner}/${this.repo}`;
    if (!branches.has(key)) branches.set(key, (await this.check()).default_branch || 'main');
    return branches.get(key);
  }

  // 文件夹 dir 里的东西 (一层): [{ path, type: 'blob' | 'tree', sha }]; root: 从哪个提交 / 树开始 (默认分支最新的)。
  // 按 sha 记着 (同一个 sha 内容不会变; 只记最近几个, 上万个文件的列表很大)
  async tree(dir, root = null) {
    const get = async (ref) => {
      if (trees.has(ref)) return trees.get(ref);
      let res;
      try {
        res = await this.call('GET', `/git/trees/${encodeURIComponent(ref)}`);
      } catch (e) {
        if (e.kind === 'conflict') return []; // 仓库是空的
        throw e;
      }
      const list = res ? ((await res.json()).tree ?? []) : [];
      if (/^[0-9a-f]{40}$/.test(ref)) {
        trees.set(ref, list);
        if (trees.size > 12) trees.delete(trees.keys().next().value);
      }
      return list;
    };
    let entries = await get(root ?? (await this.branch()));
    for (const part of dir.split('/').filter(Boolean)) {
      const sub = entries.find((x) => x.path === part && x.type === 'tree');
      if (!sub) return [];
      entries = await get(sub.sha);
    }
    return entries;
  }

  // 存了几个版本 (提交): 每页一个, 看最后一页是第几页
  async commitCount() {
    let res;
    try {
      res = await this.call('GET', '/commits?per_page=1');
    } catch (e) {
      if (e.kind === 'conflict') return 0; // 空仓库
      throw e;
    }
    if (!res) return 0;
    const last = /[?&]page=(\d+)>; rel="last"/.exec(res.headers.get('link') ?? '');
    return last ? Number(last[1]) : (await res.json()).length;
  }

  // 清理旧历史: 新建一个没有上一个版本的提交 (内容跟现在一模一样), 分支换成它 (强推), 以前的版本就没了。
  // 只有一个版本的不用清, 返回 false; 这中间别的设备推过 (分支动了) 抛 conflict, 什么都不改
  async squash(message) {
    const branch = encodeURIComponent(await this.branch());
    const headOf = async () => {
      const ref = await this.call('GET', `/git/ref/heads/${branch}`);
      return ref ? (await ref.json()).object.sha : null;
    };
    const head = await headOf();
    if (!head) return false; // 空仓库
    const commit = await (await this.call('GET', `/git/commits/${head}`)).json();
    if (!commit.parents?.length) return false;
    const fresh = await (await this.call('POST', '/git/commits', { body: { message, tree: commit.tree.sha, parents: [] } })).json();
    if ((await headOf()) !== head) throw new SyncError('其他设备刚刚同步过', 'conflict');
    await this.call('PATCH', `/git/refs/heads/${branch}`, { body: { sha: fresh.sha, force: true } });
    return true;
  }

  // 一次提交改好几个文件, 不管多少个都只算一次提交 (git 的接口)。
  // changes: { 路径: null 删掉 | Uint8Array | 字 }; expect: { 路径: 现在应该是的 sha }。
  // 别的设备这中间改过 (expect 对不上、分支动了) 抛 conflict, 什么都不改。返回 { 路径: 新的 sha }
  async commit(changes, message, expect = {}) {
    const branch = encodeURIComponent(await this.branch());
    const ref = await this.call('GET', `/git/ref/heads/${branch}`);
    if (!ref) throw new SyncError('其他设备刚刚同步过', 'conflict');
    const head = (await ref.json()).object.sha;
    const base = (await (await this.call('GET', `/git/commits/${head}`)).json()).tree.sha;
    for (const [path, sha] of Object.entries(expect)) {
      const dir = path.split('/').slice(0, -1).join('/');
      const now = (await this.tree(dir, base)).find((x) => x.path === path.split('/').pop())?.sha;
      if (now !== sha) throw new SyncError('其他设备刚刚同步过', 'conflict');
    }
    const tree = [];
    const shas = {};
    for (const [path, value] of Object.entries(changes)) {
      if (value === null) {
        tree.push({ path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const content = typeof value === 'string' ? utf8ToB64(value) : bytesToB64(value);
      const blob = await (await this.call('POST', '/git/blobs', { body: { content, encoding: 'base64' }, timeout: content.length > 1e6 ? 600_000 : 60_000 })).json();
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
      shas[path] = blob.sha;
    }
    const newTree = await (await this.call('POST', '/git/trees', { body: { base_tree: base, tree } })).json();
    const newCommit = await (await this.call('POST', '/git/commits', { body: { message, tree: newTree.sha, parents: [head] } })).json();
    await this.call('PATCH', `/git/refs/heads/${branch}`, { body: { sha: newCommit.sha } }); // 不是接着上一个提交的 (别人刚推过): 422 → conflict
    return shas;
  }

  async write(path, base64, sha, message) {
    const res = await this.call('PUT', `/contents/${path}`, { body: { message, content: base64, ...(sha ? { sha } : {}) }, timeout: base64.length > 1e6 ? 600_000 : 60_000 });
    return (await res.json()).content?.sha;
  }
}

const branches = new Map(); // 仓库 → 默认分支
const trees = new Map(); // git tree 的 sha → 里面的东西

// 本机的图片录音 (测试时可以换成假的); keys: 本机有哪些 (一下拿全, 不用一个一个问)
const localMedia = { get: (id) => getMedia(id).catch(() => null), put: (blob, id) => putMedia(blob, id), keys: () => mediaKeys().catch(() => null) };

// ---- 图片录音的包 ----
// 「WGP1」+ 4 个字节的头有多长 + 头 (JSON: [{ id, type, size }]) + 一个接一个的文件
const MAGIC = [0x57, 0x47, 0x50, 0x31];

export async function encodePack(items) {
  const datas = await Promise.all(items.map(async ({ blob }) => new Uint8Array(await blob.arrayBuffer())));
  const head = new TextEncoder().encode(JSON.stringify(items.map(({ id, blob }, i) => ({ id, type: blob.type || '', size: datas[i].length }))));
  const out = new Uint8Array(8 + head.length + datas.reduce((n, d) => n + d.length, 0));
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, head.length);
  out.set(head, 8);
  let at = 8 + head.length;
  for (const d of datas) {
    out.set(d, at);
    at += d.length;
  }
  return out;
}

// 包 → [{ id, blob }]; 不是包、坏了的返回 []
export function decodePack(bytes) {
  if (bytes.length < 8 || MAGIC.some((b, i) => bytes[i] !== b)) return [];
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4);
  let head;
  try {
    head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len)));
  } catch {
    return [];
  }
  const out = [];
  let at = 8 + len;
  for (const { id, type, size } of Array.isArray(head) ? head : []) {
    if (typeof id !== 'string' || !(size >= 0) || at + size > bytes.length) break;
    out.push({ id, blob: new Blob([bytes.slice(at, at + size)], { type: String(type ?? '') }) });
    at += size;
  }
  return out;
}

export function cleanIndex(raw) {
  const packs = {};
  for (const [name, ids] of Object.entries(raw?.packs ?? {})) {
    if (/^p_[\w-]+$/.test(name) && Array.isArray(ids)) packs[name] = ids.filter((id) => typeof id === 'string');
  }
  const unused = {};
  for (const [id, t] of Object.entries(raw?.unused ?? {})) if (Number(t) > 0) unused[id] = Number(t);
  return { version: 1, packs, unused };
}

async function readIndex(repo) {
  const f = await repo.readText(INDEX_PATH);
  if (!f) return { sha: undefined, index: cleanIndex(null) };
  try {
    return { sha: f.sha, index: cleanIndex(JSON.parse(f.text)) };
  } catch {
    return { sha: f.sha, index: cleanIndex(null) };
  }
}

// 记上新传的包 (别的设备同时也记了: 重新拿、合起来再写)
async function addToIndex(repo, state, name, ids) {
  for (let attempt = 0; ; attempt++) {
    const index = { ...state.index, packs: { ...state.index.packs, [name]: ids } };
    try {
      const sha = await repo.write(INDEX_PATH, utf8ToB64(JSON.stringify(index)), state.sha, '温故: 图片 / 录音的目录');
      Object.assign(state, { sha, index });
      return;
    } catch (e) {
      if (e.kind !== 'conflict' || attempt >= 3) throw e;
      Object.assign(state, await readIndex(repo));
    }
  }
}

// 图片录音: 本机缺的拿下来 (包里的、老的一个一个的), 仓库缺的打包传上去, 仓库里不用了的删掉。
// progress(字): 传 / 拿到哪了; dataSha: 刚推上去 (或者拿到) 的 wengu.json 的 sha (删不用的时候要它还是这个, 别的设备刚推了新的就不删)。
// 一个文件拿不下来、读不了不耽误别的。返回 { downloaded, uploaded, removed }
export async function syncMedia({ store, repo, media = localMedia, progress = () => {}, now = Date.now, dataSha = null }) {
  const needed = new Set(usedMediaIds(store.data));
  if (!needed.size && !repo.commit) return { downloaded: 0, uploaded: 0, removed: 0 };
  const keys = media.keys ? await media.keys() : null;
  const local = keys ? new Set(keys) : new Set();
  if (!keys) for (const id of needed) if (await media.get(id).catch(() => null)) local.add(id);

  // 仓库里有哪些: 先看目录 (目录里的包都是先传好文件再记的), 再列文件夹;
  // 目录里记着、文件没了的包不算 (有的设备会再传), 没记着的包是没用的 (orphans)
  const state = await readIndex(repo);
  const packFiles = new Set((await repo.list('media/packs')).map((name) => name.replace(/\.wgp$/, '')));
  const dangling = Object.keys(state.index.packs).filter((name) => !packFiles.has(name));
  const orphans = [...packFiles].filter((name) => !(name in state.index.packs) && /^p_[\w-]+$/.test(name));
  const where = new Map(); // id → { pack } | { file }: 包里的先 (一包拿一次), 没有再找老的一个一个的
  for (const [pack, ids] of Object.entries(state.index.packs)) if (packFiles.has(pack)) for (const id of ids) if (!where.has(id)) where.set(id, { pack });
  for (const name of await repo.list('media')) {
    const m = /^(m_[\w-]+)\.[a-z0-9]+$/.exec(name);
    if (m && !where.has(m[1])) where.set(m[1], { file: `media/${name}` });
  }

  // 拿下来: 一个包拿一次, 里面用得着的都存上。存不进去 (设备上没地方了) 就先不拿了
  let downloaded = 0;
  let full = false;
  const save = async (blob, id) => {
    try {
      await media.put(blob, id);
      downloaded++;
    } catch {
      full = true;
    }
  };
  const missing = [...needed].filter((id) => !local.has(id) && where.has(id));
  const byPack = new Map();
  for (const id of missing) {
    if (full) break;
    const w = where.get(id);
    if (w.file) {
      progress(`下载图片和录音 ${downloaded + 1}/${missing.length}`);
      const blob = await repo.readBlob(w.file);
      if (blob) await save(blob, id);
    } else byPack.set(w.pack, [...(byPack.get(w.pack) ?? []), id]);
  }
  for (const [pack, ids] of byPack) {
    if (full) break;
    progress(`下载图片和录音 ${downloaded + 1}/${missing.length}`);
    const blob = await repo.readBlob(`media/packs/${pack}.wgp`);
    if (!blob) continue;
    const want = new Set(ids);
    for (const item of decodePack(new Uint8Array(await blob.arrayBuffer()))) if (want.has(item.id) && !full) await save(item.blob, item.id);
  }

  // 传上去: 几 MB 一包, 传好一包记一下目录 (中途断了, 传好的不用再传)。读不了的 (坏了的) 跳过
  const toSend = [...needed].filter((id) => local.has(id) && !where.has(id));
  let uploaded = 0;
  let batch = [];
  let bytes = 0;
  const flushPack = async () => {
    if (!batch.length) return;
    let pack;
    try {
      pack = await encodePack(batch);
    } catch {
      const ok = [];
      for (const item of batch) if (await item.blob.arrayBuffer().then(() => true, () => false)) ok.push(item);
      batch = ok;
      if (!batch.length) return;
      pack = await encodePack(batch);
    }
    progress(`上传图片和录音 ${uploaded + batch.length}/${toSend.length}`);
    const name = `p_${newId()}`;
    await repo.write(`media/packs/${name}.wgp`, bytesToB64(pack), undefined, `温故: 图片 / 录音 (${batch.length} 个)`);
    await addToIndex(repo, state, name, batch.map((x) => x.id));
    uploaded += batch.length;
    batch = [];
    bytes = 0;
  };
  for (const id of toSend) {
    const blob = await media.get(id).catch(() => null);
    if (!blob) continue;
    if (bytes && bytes + blob.size > PACK_BYTES) await flushPack();
    batch.push({ id, blob });
    bytes += blob.size;
  }
  await flushPack();
  // 仓库里不用了的删掉 (needed 是刚合并好、推上去的, 是所有设备最新的); 出了问题不耽误同步, 下次再删
  let removed = 0;
  if (repo.commit) {
    try {
      removed = await cleanRemote({ repo, state, where, needed, now: now(), progress, dangling, orphans, dataSha });
    } catch {
      removed = 0;
    }
  }
  return { downloaded, uploaded, removed };
}

// 仓库里没用了的图片录音 (删掉的卡片集、卡片、错题的) 和没记在目录里的包: 先记下哪天开始没用的, 过一个星期还没用上就删掉
// (万一别的设备还要)。老的一个一个的直接删; 包: 整包都没用了删掉, 一半以上没用了重新打包 (剩下的装一个新包)。
// 好几个一起一次提交, 目录也在同一个提交里改; 提交时目录、wengu.json 都还得是刚才看到的那个 (别的设备这中间改了: 这次不删, 下次再说)。
// 目录里记着、文件没了的包 (dangling) 从目录里去掉。返回删掉了几个
async function cleanRemote({ repo, state, where, needed, now, progress, dangling = [], orphans = [], dataSha = null }) {
  const unused = { ...state.index.unused };
  let changed = dangling.length > 0;
  const orphanKeys = new Set(orphans.map((name) => `pack:${name}`));
  for (const [id, t] of Object.entries(unused)) {
    const alive = id.startsWith('pack:') ? orphanKeys.has(id) : where.has(id) && !needed.has(id);
    // 用上了、没了的不记; 时间不对的 (别的设备时钟快了) 从现在算
    if (!alive) delete unused[id];
    else if (t > now + GRACE_MS / 7) unused[id] = now;
    else continue;
    changed = true;
  }
  for (const key of [...[...where.keys()].filter((id) => !needed.has(id)), ...orphanKeys]) {
    if (!(key in unused)) {
      unused[key] = now;
      changed = true;
    }
  }
  const ripe = new Set(Object.keys(unused).filter((id) => now - unused[id] >= GRACE_MS));
  const original = { ...state.index.packs };
  for (const name of dangling) delete original[name];
  const expect = { [INDEX_PATH]: state.sha, ...(dataSha ? { [DATA_PATH]: dataSha } : {}) };
  if (!ripe.size) {
    if (!changed) return 0;
    const index = { ...state.index, packs: original, unused };
    try {
      state.sha = await repo.write(INDEX_PATH, utf8ToB64(JSON.stringify(index)), state.sha, '温故: 图片 / 录音的目录');
      state.index = index;
    } catch (e) {
      if (e.kind !== 'conflict') throw e; // 别的设备刚改了目录: 下次再记
    }
    return 0;
  }
  const deadPacks = [];
  const repack = [];
  for (const [name, ids] of Object.entries(original)) {
    const dead = ids.filter((id) => ripe.has(id)).length;
    if (dead && dead === ids.length) deadPacks.push(name);
    else if (dead && dead * 2 >= ids.length) repack.push(name);
  }
  let packs = original;
  const gone = new Set(); // 真的从仓库删掉了的
  // 提交成功了才算删掉了 (dropping: 这次删掉的 id、pack:名字)
  const commit = async (changes, message, dropping) => {
    const done = new Set([...gone, ...dropping]);
    const index = { ...state.index, packs, unused: without(unused, done) };
    const shas = await repo.commit({ ...changes, [INDEX_PATH]: JSON.stringify(index) }, message, { ...expect, [INDEX_PATH]: state.sha });
    Object.assign(state, { sha: shas[INDEX_PATH], index });
    for (const id of dropping) gone.add(id);
  };
  try {
    for (const name of repack) {
      progress('整理仓库中的图片和录音');
      const blob = await repo.readBlob(`media/packs/${name}.wgp`);
      if (!blob) continue;
      const items = decodePack(new Uint8Array(await blob.arrayBuffer()));
      const keep = items.filter((x) => !ripe.has(x.id));
      // 拆出来的少了还要用的 (下载坏了): 这包先不动
      const have = new Set(keep.map((x) => x.id));
      if (original[name].some((id) => !ripe.has(id) && !have.has(id))) continue;
      const changes = { [`media/packs/${name}.wgp`]: null };
      packs = { ...packs };
      delete packs[name];
      if (keep.length) {
        const fresh = `p_${newId()}`;
        changes[`media/packs/${fresh}.wgp`] = await encodePack(keep);
        packs[fresh] = keep.map((x) => x.id);
      }
      await commit(changes, '温故: 整理图片 / 录音', original[name].filter((id) => ripe.has(id)));
    }
    const deletes = [
      ...[...ripe].filter((id) => where.get(id)?.file).map((id) => [where.get(id).file, [id]]),
      ...deadPacks.map((name) => [`media/packs/${name}.wgp`, original[name], name]),
      ...orphans.filter((name) => ripe.has(`pack:${name}`)).map((name) => [`media/packs/${name}.wgp`, [`pack:${name}`]]),
    ];
    for (let i = 0; i < deletes.length; i += DELETES_PER_COMMIT) {
      progress('清理仓库中未使用的图片和录音');
      const chunk = deletes.slice(i, i + DELETES_PER_COMMIT);
      packs = { ...packs };
      for (const [, , pack] of chunk) if (pack) delete packs[pack];
      await commit(Object.fromEntries(chunk.map(([path]) => [path, null])), `温故: 删掉不用的图片 / 录音 (${chunk.length} 个文件)`, chunk.flatMap(([, ids]) => ids));
    }
  } catch (e) {
    if (e.kind !== 'conflict') throw e; // 别的设备正在改: 下次再删
  }
  return gone.size;
}

const without = (obj, ids) => Object.fromEntries(Object.entries(obj).filter(([id]) => !ids.has(id)));

const canonical = (data) => JSON.stringify(cleanData(data));

// 同步一次: 先合并、推卡片, 再补齐图片录音。返回 { changed: 本机数据变了没有, pushed, downloaded, uploaded }
export async function syncOnce({ store, repo, media = localMedia, onApplied = null, now = Date.now, progress = () => {} }) {
  let changed = false;
  let pushed = false;
  let dataSha = null; // 仓库里现在的 wengu.json (删不用的图片录音时要它没变)
  for (let attempt = 0; ; attempt++) {
    const remote = await repo.readText(DATA_PATH);
    let remoteData = null;
    if (remote) {
      try {
        remoteData = cleanData(JSON.parse(remote.text));
      } catch {
        throw new SyncError(`仓库中的 ${DATA_PATH} 已损坏（不是温故的数据）`);
      }
    }
    if (remoteData) {
      const merged = cleanData(mergeData(store.data, remoteData));
      if (canonical(merged) !== canonical(store.data)) {
        store.replaceData(merged);
        changed = true;
        onApplied?.();
      }
    }

    const out = canonical(store.data);
    if (remote && canonical(JSON.parse(remote.text)) === out) {
      dataSha = remote.sha;
      break; // 仓库里已经是最新的
    }
    try {
      dataSha = await repo.write(DATA_PATH, utf8ToB64(out), remote?.sha, `温故同步 ${new Date(now()).toISOString()}`);
      pushed = true;
      break;
    } catch (e) {
      if (e.kind === 'conflict' && attempt < 3) continue; // 别的设备刚推过: 重新拿、重新合并
      throw e;
    }
  }
  const { downloaded, uploaded, removed } = await syncMedia({ store, repo, media, progress, now, dataSha });
  return { changed, pushed, downloaded, uploaded, removed };
}

// 什么时候同步: 打开时、改了以后 (等几秒攒一攒)、回到页面时、开着时每隔几分钟、离开页面时
export class SyncManager {
  constructor(store, { onStatus = () => {}, onApplied = () => {}, storage = globalThis.localStorage } = {}) {
    Object.assign(this, { store, onStatus, onApplied, storage });
    this.timer = null;
    this.running = null;
    this.again = false;
    this.state = { status: 'off', message: '', lastSyncAt: 0 };
    this.listeners = new Set();
  }

  // 页面上要跟着状态变的 (同步设置页), 返回取消订阅的函数
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get config() {
    return loadConfig(this.storage);
  }

  setStatus(status, message = '', kind = '') {
    this.state = { ...this.state, status, message, kind };
    this.onStatus(this.state);
    for (const fn of this.listeners) fn(this.state);
  }

  start() {
    const c = this.config;
    if (!c) return this.setStatus('off');
    this.state.lastSyncAt = c.lastSyncAt ?? 0;
    this.setStatus('idle');
    this.syncSoon(800);
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.config) return;
      if (document.visibilityState === 'visible' && Date.now() - this.state.lastSyncAt > 20000) this.syncSoon(300);
      if (document.visibilityState === 'hidden' && this.timer) this.syncSoon(0); // 有没推的就赶紧推
    });
    setInterval(() => {
      if (this.config && document.visibilityState === 'visible') this.syncSoon(0);
    }, 3 * 60 * 1000);
  }

  // 改了东西: 等 5 秒没再改就同步
  changed() {
    if (this.config) this.syncSoon(5000);
  }

  syncSoon(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sync();
    }, ms);
  }

  // 清理仓库的旧历史 (同步页上的按钮): 先同步一次 (仓库里是所有设备最新的), 再只留现在这一个版本。
  // 别的设备正好推了: 再同步、再清 (最多三次)。返回 { squashed: 清了没有 (只有一个版本的不用清) }, 出错返回 { error }
  async cleanHistory() {
    const c = this.config;
    if (!c) return { error: '未开启同步' };
    while (this.running) await this.running;
    this.setStatus('syncing', '清理历史版本');
    this.running = (async () => {
      try {
        const repo = new GitHubRepo(c);
        let squashed = false;
        for (let attempt = 0; ; attempt++) {
          await syncOnce({ store: this.store, repo, onApplied: this.onApplied, progress: (text) => this.setStatus('syncing', text) });
          try {
            squashed = await repo.squash('温故: 清理旧历史 (只留现在的)');
            break;
          } catch (e) {
            if (e.kind !== 'conflict' || attempt >= 2) throw e;
          }
        }
        const lastSyncAt = Date.now();
        saveConfig({ ...this.config, lastSyncAt }, this.storage);
        this.state.lastSyncAt = lastSyncAt;
        this.setStatus('ok');
        return { squashed };
      } catch (e) {
        const message = e instanceof SyncError ? e.message : '清理失败';
        this.setStatus('error', message, e instanceof SyncError ? e.kind : 'other');
        return { error: message };
      } finally {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.syncSoon(1000); // 清理的时候又改了东西: 接着同步
        }
      }
    })();
    return this.running;
  }

  async sync() {
    const c = this.config;
    if (!c) return null;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.setStatus('syncing');
    this.running = (async () => {
      try {
        const repo = new GitHubRepo(c);
        const result = await syncOnce({ store: this.store, repo, onApplied: this.onApplied, progress: (text) => this.setStatus('syncing', text) });
        const lastSyncAt = Date.now();
        saveConfig({ ...this.config, lastSyncAt }, this.storage);
        this.state.lastSyncAt = lastSyncAt;
        this.setStatus('ok');
        return result;
      } catch (e) {
        this.setStatus('error', e instanceof SyncError ? e.message : '同步出错', e instanceof SyncError ? e.kind : 'other');
        return null;
      } finally {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.syncSoon(1000);
        }
      }
    })();
    return this.running;
  }
}
