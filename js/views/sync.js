// 多设备同步的设置页: 教怎么建仓库和密钥, 连接 / 断开, 手机扫码连接

import { h, fill, toast } from '../dom.js';
import { loadConfig, saveConfig, parseRepo, GitHubRepo, SyncError, expiryFromDate, knownExpiry, expiryInfo } from '../sync.js';
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

// 去 GitHub 建密钥的链接 (名字、说明、一年有效、内容读写都填好了, GitHub 页面上还能改; 名字带上日期, 换密钥时不会跟旧的重名)
function tokenUrl(repo, name = '温故同步') {
  const q = new URLSearchParams({ name, description: `温故 (wengu) 多设备同步用, 只能改 ${repo} 这一个仓库`, expires_in: '366', contents: 'write' });
  return `https://github.com/settings/personal-access-tokens/new?${q}`;
}
const TOKENS_URL = 'https://github.com/settings/personal-access-tokens';

const dateText = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};
// 本地日期 YYYY-MM-DD (给日期框用)
const ymd = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 连接 (或者换密钥): 检查仓库, 存设置, 马上同步一次。expiry: 自己填的过期日期 (扫码时是那台设备填的)
async function connect(syncer, owner, repo, token, api, expiry = null) {
  const gh = new GitHubRepo({ owner, repo, token, api });
  const info = await gh.check();
  if (info && info.private === false && !confirm(`仓库 ${owner}/${repo} 是公开的, 任何人都能看到你的卡片。确定用它?`)) return false;
  saveConfig({ owner, repo, token, ...(api ? { api } : {}), lastSyncAt: 0, ...knownExpiry(expiry) });
  syncer.start();
  await syncer.sync();
  return true;
}

// 连接、换密钥时填「密钥哪天过期」: 网页读不到这个日期, 只能自己填; 也可以勾「不会过期」
function expiryField() {
  const date = h('input', { class: 'input', type: 'date', min: ymd(), 'aria-label': '密钥哪天过期' });
  const never = h('input', { type: 'checkbox', onchange: () => (date.disabled = never.checked) });
  const el = h(
    'div',
    { class: 'expiry-field' },
    h('div', { class: 'row' }, date, h('label', { class: 'toggle' }, never, ' 不会过期 (选的是 No expiration)')),
    h(
      'p',
      { class: 'muted small' },
      '就是建密钥时 Expiration 那里的日期。忘了的话, 在 ',
      h('a', { href: TOKENS_URL, target: '_blank', rel: 'noopener' }, 'GitHub 的密钥列表'),
      ' 里看 (Expires on ……)。网页自己读不到这个日期, 填了才能在快过期时提醒你。',
    ),
  );
  // { expiry } 或者 { error: 要说的话 }
  const read = () => {
    if (never.checked) return { expiry: { expiresAt: null, expirySource: 'never' } };
    const t = expiryFromDate(date.value);
    if (!t) return { error: '填一下密钥哪天过期 (不会过期就勾上「不会过期」)' };
    if (t < Date.now()) return { error: '这一天已经过了, 看看是不是填错了' };
    return { expiry: { expiresAt: t, expirySource: 'user' } };
  };
  return { el, read };
}

export function renderSync({ go, syncer }, sub = null, data = null) {
  // 手机扫码打开的: #/sync/connect/<仓库和密钥>
  if (sub === 'connect' && data) return renderConnectLink({ go, syncer }, data);

  const config = loadConfig();
  const root = h('section', { class: 'sync-page' });

  if (!config) {
    const repoInput = h('input', { class: 'input', value: `${guessOwner() || '你的用户名'}/wengu-data`, 'aria-label': '仓库', autocomplete: 'off', spellcheck: 'false' });
    const tokenInput = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_……', 'aria-label': '密钥', autocomplete: 'off' });
    const expiryInput = expiryField();
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
          const { expiry, error } = expiryInput.read();
          if (error) return (msg.textContent = error);
          btn.disabled = true;
          msg.textContent = '连接中……';
          try {
            if (await connect(syncer, r.owner, r.repo, token, apiBase(), expiry)) {
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
          h('a', { class: 'btn small', href: tokenUrl('wengu-data'), target: '_blank', rel: 'noopener' }, '去建密钥 ↗'),
          h(
            'p',
            { class: 'muted small' },
            'Repository access 选 Only select repositories, 选 wengu-data; Permissions 里找到 Contents, 选 Read and write; Expiration (有效期) 记一下是哪天, 下面要填; 点 Generate token, 复制密钥 (github_pat_ 开头的一长串)。到期了再建一个填进来就行。',
          ),
        ),
        h('li', {}, h('strong', {}, '填在这里'), h('label', { class: 'ask-label' }, '仓库 (用户名/仓库名)'), repoInput, h('label', { class: 'ask-label' }, '密钥'), tokenInput, h('label', { class: 'ask-label' }, '密钥哪天过期'), expiryInput.el, h('div', { class: 'row' }, btn), msg),
      ),
      h('p', { class: 'muted small' }, '密钥只存在这台设备的浏览器里, 不会发给别人, 只用来读写你那个仓库。别的设备: 在这里点「在手机上连接」扫二维码, 不用再填。'),
    );
    return { title: '多设备同步', el: root, focus: tokenInput };
  }

  // ---- 已经连上 ----
  const statusEl = h('div', { class: 'sync-status' });
  const expiryEl = h('div', { class: 'sync-expiry' });
  const draw = () => {
    const st = syncer.state;
    const label = { syncing: `同步中……${st.message ? ` ${st.message}` : ''}`, ok: '同步好了', error: `出错了: ${st.message}`, idle: '等着同步', off: '没开' }[st.status] ?? '';
    statusEl.className = `sync-status ${st.status}`;
    fill(statusEl, h('strong', {}, label), h('div', { class: 'muted small' }, `上次同步: ${timeAgo(loadConfig()?.lastSyncAt)}`));
    drawExpiry();
    // 密钥不对 / 过期了: 直接打开「换密钥」
    if (st.status === 'error' && st.kind === 'auth') renew.open = true;
  };

  // 改了过期日期: 这一页和顶上的同步图标一起重画
  const refresh = () => {
    const st = syncer.state;
    syncer.setStatus(st.status, st.message, st.kind);
  };

  // 密钥哪天过期; 快过期了提醒; 日期不对可以改
  function drawExpiry() {
    const c = loadConfig();
    if (!c) return fill(expiryEl);
    const info = expiryInfo(c);
    const editor = h(
      'details',
      { class: 'expiry-edit', open: !info && c.expirySource !== 'never' },
      h('summary', {}, info ? '日期不对?' : '填过期日期'),
      h('p', { class: 'muted small' }, '在 GitHub 的密钥列表里能看到密钥哪天过期 (Expires on ……)。'),
      h(
        'div',
        { class: 'row' },
        h('input', {
          class: 'input',
          type: 'date',
          min: ymd(),
          'aria-label': '密钥过期的日期',
          value: info ? ymd(info.at) : '',
          onchange: (e) => {
            const t = expiryFromDate(e.target.value);
            if (!t) return;
            saveConfig({ ...loadConfig(), expiresAt: t, expirySource: 'user' });
            toast('记好了');
            refresh();
          },
        }),
        h(
          'button',
          {
            class: 'btn small',
            type: 'button',
            onclick: () => {
              saveConfig({ ...loadConfig(), expiresAt: null, expirySource: 'never' });
              toast('好的, 不再提醒');
              refresh();
            },
          },
          '我的密钥不会过期',
        ),
        h('a', { class: 'btn small', href: TOKENS_URL, target: '_blank', rel: 'noopener' }, 'GitHub 密钥列表 ↗'),
      ),
    );
    if (!info) {
      const unknown = `不知道密钥哪天过期${c.expirySource === 'guess' ? ' (以前是从连上那天按一年猜的, 不一定对)' : ''}。网页自己读不到这个日期: 在 GitHub 的密钥列表里看一下, 填在下面, 快到了会提醒你。`;
      fill(expiryEl, h('div', { class: 'muted small' }, c.expirySource === 'never' ? '密钥不会过期 (你说的)。' : unknown), editor);
      return;
    }
    const line = info.expired ? `密钥 ${dateText(info.at)} 就过期了` : info.days === 0 ? `密钥今天 (${dateText(info.at)}) 过期` : `密钥 ${dateText(info.at)} 过期, 还有 ${info.days} 天`;
    fill(
      expiryEl,
      info.warn
        ? h('div', { class: 'expiry-warn' }, h('strong', {}, info.expired ? '⚠ 密钥可能已经过期了' : info.days === 0 ? '⚠ 密钥今天就过期了' : `⚠ 密钥还有 ${info.days} 天就过期了`), h('div', { class: 'small' }, '照下面「换密钥」做一下, 两分钟就好, 卡片不会丢。'))
        : null,
      h('div', { class: 'muted small' }, line),
      editor,
    );
    if (info.warn) renew.open = true;
  }

  const qrBox = h('div', { class: 'qr-box', hidden: true });
  const showQr = () => {
    const c = loadConfig();
    const known = knownExpiry(c);
    const payload = btoa(JSON.stringify({ r: `${c.owner}/${c.repo}`, t: c.token, ...(c.api ? { a: c.api } : {}), ...(known.expirySource ? { e: known.expiresAt, s: known.expirySource } : {}) }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const link = `${location.origin}${location.pathname}#/sync/connect/${payload}`;
    qrBox.hidden = !qrBox.hidden;
    fill(
      qrBox,
      qrSvg(link, 220) ?? h('p', {}, '二维码生成不了'),
      h('p', { class: 'small' }, '用手机相机扫一下, 打开后点「连接」。'),
      h('p', { class: 'small warn' }, '⚠ 二维码里有你的密钥, 别给别人看、别截图发出去。'),
    );
  };

  // ---- 换密钥: 一步步来 ----
  const newToken = h('input', { class: 'input', type: 'password', placeholder: '新的密钥 github_pat_……', autocomplete: 'off', 'aria-label': '新的密钥' });
  const newExpiry = expiryField();
  const renewMsg = h('p', { class: 'sync-msg', 'aria-live': 'polite' });
  const renewBtn = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        const token = newToken.value.trim();
        if (!token) return (renewMsg.textContent = '把新的密钥粘贴进来');
        const { expiry, error } = newExpiry.read();
        if (error) return (renewMsg.textContent = error);
        renewBtn.disabled = true;
        renewMsg.textContent = '试一下新密钥……';
        try {
          if (await connect(syncer, config.owner, config.repo, token, config.api, expiry)) {
            toast('换好了, 照常同步');
            go('#/sync');
          } else renewMsg.textContent = '';
        } catch (e) {
          renewMsg.textContent = e instanceof SyncError ? e.message : '出错了';
        } finally {
          renewBtn.disabled = false;
        }
      },
    },
    '换',
  );
  const renew = h(
    'details',
    { class: 'howto renew' },
    h('summary', {}, '密钥过期了 / 换密钥'),
    h('p', { class: 'small' }, '快过期的时候 (过期以后也行) 换一个新的, 卡片不会丢, 这段时间改的东西换好以后会一起同步上去。'),
    h(
      'ol',
      { class: 'sync-steps' },
      h(
        'li',
        {},
        h('strong', {}, '去 GitHub 建一个新密钥 '),
        h('a', { class: 'btn small', href: tokenUrl(config.repo, `温故同步 ${ymd()}`), target: '_blank', rel: 'noopener' }, '去建新密钥 ↗'),
        h('p', { class: 'muted small' }, `Repository access 选 Only select repositories, 选 ${config.repo}; Permissions 里找到 Contents, 选 Read and write; Expiration (有效期) 记一下是哪天; 点 Generate token, 复制密钥 (github_pat_ 开头的一长串)。`),
      ),
      h('li', {}, h('strong', {}, '粘贴到这里, 填上哪天过期'), newToken, newExpiry.el, h('div', { class: 'row' }, renewBtn), renewMsg),
      h(
        'li',
        {},
        h('strong', {}, '别的设备也换一下'),
        h('p', { class: 'muted small' }, '换好以后, 在这台设备上点上面的「在手机上连接」, 用另一台扫一下二维码就换好了, 不用再粘贴。'),
      ),
    ),
    h('p', { class: 'muted small' }, '旧的密钥可以在 ', h('a', { href: TOKENS_URL, target: '_blank', rel: 'noopener' }, 'GitHub 的密钥列表'), ' 里删掉 (Delete)。'),
  );

  // ---- 清理旧历史 ----
  const historyInfo = h('p', { class: 'small' }, '看一下仓库多大……');
  const historyMsg = h('p', { class: 'sync-msg', 'aria-live': 'polite' });
  let versions = 0;
  const loadHistoryInfo = async () => {
    try {
      const repo = new GitHubRepo(loadConfig());
      const [info, count] = await Promise.all([repo.check(), repo.commitCount()]);
      versions = count;
      const mb = (info.size ?? 0) / 1024;
      historyInfo.textContent = `仓库现在大约 ${mb < 1 ? '不到 1' : Math.round(mb)} MB, 存了 ${count.toLocaleString('zh-CN')} 个版本 (这个大小 GitHub 隔一阵子才更新)。`;
    } catch (e) {
      historyInfo.textContent = e instanceof SyncError ? `看不了: ${e.message}` : '看不了仓库多大';
    }
  };
  const cleanBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        if (!confirm(`只留现在这一个版本, 以前的${versions > 1 ? ` ${(versions - 1).toLocaleString('zh-CN')} 个` : ''}版本都清掉? 清了就退不回以前的版本了。现在的卡片、进度、图片录音都不动。`)) return;
        cleanBtn.disabled = true;
        historyMsg.textContent = '先同步一次, 再清理……';
        const r = await syncer.cleanHistory();
        cleanBtn.disabled = false;
        historyMsg.classList.toggle('ok', !r.error);
        historyMsg.textContent = r.error
          ? `没清理: ${r.error}`
          : r.squashed
            ? '清理好了: 只剩现在这一个版本。GitHub 一般要过几天才真正腾出地方, 那时上面的大小才会变小。'
            : '只有一个版本, 不用清理。';
        if (r.squashed) toast('旧历史清理好了');
        loadHistoryInfo();
      },
    },
    '清理旧历史',
  );
  const historyBox = h(
    'details',
    { class: 'howto history-clean', ontoggle: (e) => e.target.open && loadHistoryInfo() },
    h('summary', {}, '清理仓库的旧历史'),
    h(
      'p',
      { class: 'small' },
      '每同步一次, GitHub 就把仓库存成一个新版本, 以前的版本都留着 —— 连删掉的卡片集用过的图片录音也还在旧版本里。',
      '旧版本不会同步到电脑、平板上, 不占设备的地方, 只占 GitHub 那边的。',
    ),
    historyInfo,
    h(
      'ul',
      { class: 'small history-points' },
      h('li', {}, h('strong', {}, '清理做什么: '), '先同步一次, 再只留现在这一个版本, 以前的全部清掉。'),
      h('li', {}, h('strong', {}, '不动什么: '), '现在的卡片、进度、复习记录、图片录音都不动; 别的设备照常同步, 不用重新连。'),
      h('li', {}, h('strong', {}, '要知道: '), '清了就退不回以前的版本了 (平时用不到; 万一哪天同步把东西弄乱了, 旧版本是最后的退路)。想保险, 清之前先在首页「导出备份」。'),
      h('li', {}, h('strong', {}, '什么时候清: '), '不清也没关系, GitHub 私有仓库 1 GB 以内都没事; 删掉过大卡组、仓库到了几百 MB 再清就行。'),
    ),
    h('div', { class: 'row' }, cleanBtn),
    historyMsg,
  );

  draw();
  const unsub = syncer.subscribe?.(draw);

  root.append(
    h('a', { class: 'back', href: '#/' }, '← 首页'),
    h('h1', {}, '多设备同步'),
    h('p', {}, '连着 ', h('a', { href: `https://github.com/${config.owner}/${config.repo}`, target: '_blank', rel: 'noopener' }, `${config.owner}/${config.repo}`), '。打开、改动、回到页面时会自动同步。'),
    statusEl,
    expiryEl,
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
    renew,
    historyBox,
  );
  return { title: '多设备同步', el: root, focus: renew.open ? newToken : null, cleanup: () => unsub?.() };
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
          await connect(syncer, r.owner, r.repo, info.t, info.a, { expiresAt: info.e, expirySource: info.s });
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
