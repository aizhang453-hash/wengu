// 多设备同步的设置页: 教怎么建仓库和密钥, 连接 / 断开, 手机扫码连接

import { h, toast } from '../dom.js';
import { loadConfig, saveConfig, parseRepo, GitHubRepo, SyncError } from '../sync.js';
import { qrSvg } from '../qr.js';

const API_OVERRIDE = 'wengu:sync-api'; // 只给测试用 (换成假的 GitHub)

function apiBase() {
  try {
    return localStorage.getItem(API_OVERRIDE) || undefined;
  } catch {
    return undefined;
  }
}

// 在 xxx.github.io 上打开的, 用户名就是 xxx
function guessOwner() {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  return m ? m[1] : '';
}

function timeAgo(t) {
  if (!t) return '还没同步过';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return new Date(t).toLocaleString();
}

// 连接: 检查仓库, 存设置, 马上同步一次
async function connect(syncer, owner, repo, token, api) {
  const gh = new GitHubRepo({ owner, repo, token, api });
  const info = await gh.check();
  if (info && info.private === false && !confirm(`仓库 ${owner}/${repo} 是公开的, 任何人都能看到你的卡片。确定用它?`)) return false;
  saveConfig({ owner, repo, token, ...(api ? { api } : {}), lastSyncAt: 0 });
  syncer.start();
  await syncer.sync();
  return true;
}

export function renderSync({ go, syncer }, sub = null, data = null) {
  // 手机扫码打开的: #/sync/connect/<仓库和密钥>
  if (sub === 'connect' && data) return renderConnectLink({ go, syncer }, data);

  const config = loadConfig();
  const root = h('section', { class: 'sync-page' });

  if (!config) {
    const repoInput = h('input', { class: 'input', value: `${guessOwner() || '你的用户名'}/wengu-data`, 'aria-label': '仓库', autocomplete: 'off', spellcheck: 'false' });
    const tokenInput = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_……', 'aria-label': '密钥', autocomplete: 'off' });
    const msg = h('p', { class: 'sync-msg', 'aria-live': 'polite' });
    const btn = h(
      'button',
      {
        class: 'btn primary',
        onclick: async () => {
          const r = parseRepo(repoInput.value);
          const token = tokenInput.value.trim();
          if (!r) return (msg.textContent = '仓库要写成「用户名/仓库名」, 比如 aizhang453-hash/wengu-data');
          if (!token) return (msg.textContent = '把密钥粘贴进来');
          btn.disabled = true;
          msg.textContent = '连接中……';
          try {
            if (await connect(syncer, r.owner, r.repo, token, apiBase())) {
              toast('连上了, 以后会自动同步');
              go('#/sync');
            } else {
              msg.textContent = '';
            }
          } catch (e) {
            msg.textContent = e instanceof SyncError ? e.message : '连接出错了';
          } finally {
            btn.disabled = false;
          }
        },
      },
      '连接',
    );
    const tokenUrl = `https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('温故同步')}&description=${encodeURIComponent('温故 (wengu) 多设备同步用, 只能改 wengu-data 这一个仓库')}&expires_in=366&contents=write`;
    root.append(
      h('a', { class: 'back', href: '#/' }, '← 首页'),
      h('h1', {}, '多设备同步'),
      h('p', {}, '卡片 (连图片、录音、学习进度) 存到你自己的 GitHub 私有仓库里。每台设备连一次, 之后打开、改动、回到页面时自动同步, 电脑和手机上都是同一份。'),
      h(
        'ol',
        { class: 'sync-steps' },
        h(
          'li',
          {},
          h('strong', {}, '建一个私有仓库 '),
          h('a', { class: 'btn small', href: 'https://github.com/new?name=wengu-data&visibility=private', target: '_blank', rel: 'noopener' }, '去建仓库 ↗'),
          h('p', { class: 'muted small' }, '名字填 wengu-data, 选 Private (私有), 勾上 Add a README file, 点 Create repository。'),
        ),
        h(
          'li',
          {},
          h('strong', {}, '建一个只能改这个仓库的密钥 '),
          h('a', { class: 'btn small', href: tokenUrl, target: '_blank', rel: 'noopener' }, '去建密钥 ↗'),
          h(
            'p',
            { class: 'muted small' },
            'Repository access 选 Only select repositories, 选 wengu-data; Permissions 里找到 Contents, 选 Read and write; 点 Generate token, 复制密钥 (github_pat_ 开头的一长串)。密钥有效期最长一年, 到期了再建一个填进来就行。',
          ),
        ),
        h('li', {}, h('strong', {}, '填在这里'), h('label', { class: 'ask-label' }, '仓库 (用户名/仓库名)'), repoInput, h('label', { class: 'ask-label' }, '密钥'), tokenInput, h('div', { class: 'row' }, btn), msg),
      ),
      h('p', { class: 'muted small' }, '密钥只存在这台设备的浏览器里, 不会发给别人, 只用来读写你那个仓库。别的设备: 在这里点「在手机上连接」扫二维码, 不用再填。'),
    );
    return { title: '多设备同步', el: root, focus: tokenInput };
  }

  // ---- 已经连上 ----
  const statusEl = h('div', { class: 'sync-status' });
  const draw = () => {
    const st = syncer.state;
    const label = { syncing: '同步中……', ok: '同步好了', error: `出错了: ${st.message}`, idle: '等着同步', off: '没开' }[st.status] ?? '';
    statusEl.className = `sync-status ${st.status}`;
    statusEl.replaceChildren(h('strong', {}, label), h('div', { class: 'muted small' }, `上次同步: ${timeAgo(loadConfig()?.lastSyncAt)}`));
  };
  draw();
  const unsub = syncer.subscribe?.(draw);

  const qrBox = h('div', { class: 'qr-box', hidden: true });
  const showQr = () => {
    const c = loadConfig();
    const payload = btoa(JSON.stringify({ r: `${c.owner}/${c.repo}`, t: c.token, ...(c.api ? { a: c.api } : {}) })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const link = `${location.origin}${location.pathname}#/sync/connect/${payload}`;
    qrBox.hidden = !qrBox.hidden;
    qrBox.replaceChildren(
      qrSvg(link, 220) ?? h('p', {}, '二维码生成不了'),
      h('p', { class: 'small' }, '用手机相机扫一下, 打开后点「连接」。'),
      h('p', { class: 'small warn' }, '⚠ 二维码里有你的密钥, 别给别人看、别截图发出去。'),
    );
  };

  const newToken = h('input', { class: 'input', type: 'password', placeholder: '新的密钥 github_pat_……', autocomplete: 'off', 'aria-label': '新的密钥' });

  root.append(
    h('a', { class: 'back', href: '#/' }, '← 首页'),
    h('h1', {}, '多设备同步'),
    h('p', {}, '连着 ', h('a', { href: `https://github.com/${config.owner}/${config.repo}`, target: '_blank', rel: 'noopener' }, `${config.owner}/${config.repo}`), '。打开、改动、回到页面时会自动同步。'),
    statusEl,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => syncer.sync() }, '立即同步'),
      h('button', { class: 'btn', onclick: showQr }, '在手机上连接'),
      h(
        'button',
        {
          class: 'btn danger',
          onclick: () => {
            if (!confirm('断开同步? 这台设备上的卡片还在, 只是不再同步。')) return;
            saveConfig(null);
            syncer.start();
            go('#/sync');
          },
        },
        '断开',
      ),
    ),
    qrBox,
    h(
      'details',
      { class: 'howto' },
      h('summary', {}, '密钥过期了 / 换密钥'),
      h('div', { class: 'row' }, newToken, h('button', {
        class: 'btn',
        onclick: async () => {
          const token = newToken.value.trim();
          if (!token) return;
          try {
            await connect(syncer, config.owner, config.repo, token, config.api);
            toast('换好了');
            go('#/sync');
          } catch (e) {
            toast(e instanceof SyncError ? e.message : '出错了');
          }
        },
      }, '换')),
    ),
  );
  return { title: '多设备同步', el: root, cleanup: () => unsub?.() };
}

function renderConnectLink({ go, syncer }, data) {
  let info = null;
  try {
    info = JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    info = null;
  }
  const r = parseRepo(info?.r);
  // 网址里有密钥, 马上从地址栏和历史记录里换掉
  history.replaceState(null, '', '#/sync/connect');
  if (!r || !info?.t) {
    return { title: '连接', el: h('section', { class: 'empty' }, h('h1', {}, '这个连接坏了'), h('a', { class: 'btn primary', href: '#/sync' }, '去同步设置')) };
  }
  const msg = h('p', { class: 'sync-msg' });
  const btn = h(
    'button',
    {
      class: 'btn primary big-choice',
      onclick: async () => {
        btn.disabled = true;
        msg.textContent = '连接中……';
        try {
          await connect(syncer, r.owner, r.repo, info.t, info.a);
          toast('连上了');
          go('#/');
        } catch (e) {
          msg.textContent = e instanceof SyncError ? e.message : '连接出错了';
          btn.disabled = false;
        }
      },
    },
    '连接',
  );
  return {
    title: '连接同步',
    el: h(
      'section',
      { class: 'summary sync-connect' },
      h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '☁️'),
      h('h1', {}, '连接多设备同步'),
      h('p', {}, `这台设备会跟 ${r.owner}/${r.repo} 同步。这里原来有的卡片也会合并进去, 不会丢。`),
      h('div', { class: 'row center' }, btn, h('a', { class: 'btn', href: '#/' }, '不要')),
      msg,
    ),
  };
}
