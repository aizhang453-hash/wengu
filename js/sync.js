// 多设备同步: 存在你自己的 GitHub 私有仓库里。
//   wengu.json         卡片集、文件夹、打卡、删除记录
//   media/<id>.<后缀>  图片、录音
// 每台设备填一次「仓库 + 密钥」(密钥只能改这一个仓库), 之后打开、改动、回到页面时自动同步。
// 同步: 拿下仓库里的 → 跟本机的合并 (merge.js) → 补齐图片录音 → 推上去。
// 推的时候发现别的设备刚推过 (sha 对不上), 重新拿、重新合并再推。

import { cleanData } from './store.js';
import { mergeData } from './merge.js';
import { setMediaIds, getMedia, putMedia } from './media.js';

export const CONFIG_KEY = 'wengu:sync';
export const DATA_PATH = 'wengu.json';
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
// GitHub 的回答里会带着 (github-authentication-token-expiration), 浏览器读得到就用它;
// 读不到就从连上那天按一年算 (建密钥的链接默认一年), 也可以自己改。还剩两周时提醒去换。
export const EXPIRY_HEADER = 'github-authentication-token-expiration';
const DAY = 24 * 60 * 60 * 1000;
export const GUESS_DAYS = 366;
export const WARN_DAYS = 14;

// "2026-10-12 08:15:04 UTC" / "2026-10-12 08:15:04 +0000" → 毫秒; 看不懂返回 null
export function parseExpiry(text) {
  const m = String(text ?? '')
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(UTC|GMT|Z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  let zone = (m[3] ?? 'Z').toUpperCase();
  if (zone === 'UTC' || zone === 'GMT') zone = 'Z';
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const t = Date.parse(`${m[1]}T${m[2]}${zone}`);
  return Number.isFinite(t) ? t : null;
}

// 连上 (或换密钥) 时记的过期日期: GitHub 告诉了就用, 不然按一年算
export function expiryFor({ fromGitHub = null, hint = null, now = Date.now() } = {}) {
  if (fromGitHub) return { expiresAt: fromGitHub, expirySource: 'github' };
  if (hint?.expirySource === 'never') return { expiresAt: null, expirySource: 'never' };
  if (hint?.expiresAt) return { expiresAt: hint.expiresAt, expirySource: hint.expirySource ?? 'guess' };
  return { expiresAt: now + GUESS_DAYS * DAY, expirySource: 'guess' };
}

// { at, days (还有几天, 按日历算, 0 是今天), source, warn (该提醒了), expired }; 不知道 / 不会过期返回 null
export function expiryInfo(config, now = Date.now()) {
  if (!config?.expiresAt || config.expirySource === 'never') return null;
  const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(config.expiresAt) - midnight(now)) / DAY);
  const expired = config.expiresAt <= now;
  return { at: config.expiresAt, days: Math.max(0, days), source: config.expirySource ?? 'guess', warn: days <= WARN_DAYS, expired };
}

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

async function blobToB64(blob) {
  return bytesToB64(new Uint8Array(await blob.arrayBuffer()));
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

  async call(method, path, { body = null, accept = 'application/vnd.github+json' } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.api}/repos/${this.owner}/${this.repo}${path}`, {
        method,
        cache: 'no-store',
        headers: { Authorization: `Bearer ${this.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('连不上 GitHub, 看看网络', 'network');
    }
    const expiry = parseExpiry(res.headers?.get?.(EXPIRY_HEADER));
    if (expiry) this.expiresAt = expiry;
    if (res.status === 401) throw new SyncError('密钥不对, 或者过期了', 'auth');
    if (res.status === 403) {
      if (res.headers.get('x-ratelimit-remaining') === '0') throw new SyncError('同步太频繁了, 过一会儿再试', 'rate');
      throw new SyncError('密钥没有改这个仓库的权限 (建密钥时「内容」要选「读写」)', 'auth');
    }
    if (res.status === 404) {
      if (method === 'GET') return null;
      throw new SyncError('找不到这个仓库, 或者密钥没给这个仓库的权限', 'auth');
    }
    if (res.status === 409 || res.status === 422) throw new SyncError('别的设备刚同步过', 'conflict');
    if (!res.ok) throw new SyncError(`GitHub 出错了 (${res.status}), 过一会儿再试`, 'other');
    return res;
  }

  // 检查仓库能不能用: 找得到, 而且最好是私有的
  async check() {
    const res = await this.call('GET', '');
    if (!res) throw new SyncError('找不到这个仓库, 或者密钥没给这个仓库的权限', 'auth');
    return res.json();
  }

  async readText(path) {
    const res = await this.call('GET', `/contents/${path}`);
    if (!res) return null;
    const meta = await res.json();
    if (meta.type && meta.type !== 'file') throw new SyncError(`仓库里的 ${path} 不是文件`);
    if (meta.encoding === 'base64' && meta.content) return { sha: meta.sha, text: b64ToUtf8(meta.content) };
    // 超过 1MB 的, 接口不给内容, 要用 raw 再拿一次
    const raw = await this.call('GET', `/contents/${path}`, { accept: 'application/vnd.github.raw+json' });
    return { sha: meta.sha, text: raw ? await raw.text() : '' };
  }

  async readBlob(path) {
    const res = await this.call('GET', `/contents/${path}`, { accept: 'application/vnd.github.raw+json' });
    if (!res) return null;
    return new Blob([await res.arrayBuffer()], { type: typeOf(path) });
  }

  async list(dir) {
    const res = await this.call('GET', `/contents/${dir}`);
    if (!res) return [];
    const items = await res.json();
    return Array.isArray(items) ? items.filter((x) => x.type === 'file').map((x) => x.name) : [];
  }

  async write(path, base64, sha, message) {
    const res = await this.call('PUT', `/contents/${path}`, { body: { message, content: base64, ...(sha ? { sha } : {}) } });
    return (await res.json()).content?.sha;
  }
}

// 本机的图片录音 (测试时可以换成假的)
const localMedia = { get: (id) => getMedia(id).catch(() => null), put: (blob, id) => putMedia(blob, id) };

const canonical = (data) => JSON.stringify(cleanData(data));

// 同步一次。返回 { changed: 本机数据变了没有, pushed, downloaded, uploaded }
export async function syncOnce({ store, repo, media = localMedia, onApplied = null, now = Date.now }) {
  let changed = false;
  let pushed = false;
  let downloaded = 0;
  let uploaded = 0;
  for (let attempt = 0; ; attempt++) {
    const remote = await repo.readText(DATA_PATH);
    let remoteData = null;
    if (remote) {
      try {
        remoteData = cleanData(JSON.parse(remote.text));
      } catch {
        throw new SyncError(`仓库里的 ${DATA_PATH} 坏了 (不是温故的数据)`);
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

    // 图片录音: 本机缺的拿下来, 仓库缺的传上去 (先传, 别的设备拿到数据时图片已经在了)
    const needed = new Set(store.data.sets.flatMap(setMediaIds));
    if (needed.size) {
      const files = await repo.list('media');
      const remoteNames = new Map(files.map((name) => [name.replace(/\.[^.]+$/, ''), name]));
      for (const id of needed) {
        const mine = await media.get(id);
        if (!mine && remoteNames.has(id)) {
          const blob = await repo.readBlob(`media/${remoteNames.get(id)}`);
          if (blob) {
            await media.put(blob, id);
            downloaded++;
          }
        } else if (mine && !remoteNames.has(id)) {
          await repo.write(`media/${id}.${extOf(mine.type)}`, await blobToB64(mine), undefined, '温故: 图片 / 录音');
          uploaded++;
        }
      }
    }

    const out = canonical(store.data);
    if (remote && canonical(JSON.parse(remote.text)) === out) break; // 仓库里已经是最新的
    try {
      await repo.write(DATA_PATH, utf8ToB64(out), remote?.sha, `温故同步 ${new Date(now()).toISOString()}`);
      pushed = true;
      break;
    } catch (e) {
      if (e.kind === 'conflict' && attempt < 3) continue; // 别的设备刚推过: 重新拿、重新合并
      throw e;
    }
  }
  return { changed, pushed, downloaded, uploaded };
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
        const result = await syncOnce({ store: this.store, repo, onApplied: this.onApplied });
        const lastSyncAt = Date.now();
        // GitHub 告诉了密钥哪天过期 (换过密钥、在 GitHub 上续过期) 就记下来
        const expiry = repo.expiresAt && repo.expiresAt !== this.config?.expiresAt ? { expiresAt: repo.expiresAt, expirySource: 'github' } : {};
        saveConfig({ ...this.config, lastSyncAt, ...expiry }, this.storage);
        this.state.lastSyncAt = lastSyncAt;
        this.setStatus('ok');
        return result;
      } catch (e) {
        this.setStatus('error', e instanceof SyncError ? e.message : '同步出错了', e instanceof SyncError ? e.kind : 'other');
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
