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
  if (!t) return '尚未同步';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return new Date(t).toLocaleString();
}

// 去 GitHub 建密钥的链接 (名字、说明、一年有效、内容读写都填好了, GitHub 页面上还能改; 名字带上日期, 换密钥时不会跟旧的重名)
function tokenUrl(repo, name = '温故同步') {
  const q = new URLSearchParams({ name, description: `温故（wengu）多设备同步，仅限 ${repo} 仓库`, expires_in: '366', contents: 'write' });
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
  if (info && info.private === false && !confirm(`仓库 ${owner}/${repo} 为公开仓库，任何人都能看到你的卡片。确定使用吗？`)) return false;
  saveConfig({ owner, repo, token, ...(api ? { api } : {}), lastSyncAt: 0, ...knownExpiry(expiry) });
  syncer.start();
  await syncer.sync();
  return true;
}

// 连接、换密钥时填「密钥哪天过期」: 网页读不到这个日期, 只能自己填; 也可以勾「不会过期」
function expiryField() {
  const date = h('input', { class: 'input', type: 'date', min: ymd(), 'aria-label': '密钥到期日期' });
  const never = h('input', { type: 'checkbox', onchange: () => (date.disabled = never.checked) });
  const el = h(
    'div',
    { class: 'expiry-field' },
    h('div', { class: 'row' }, date, h('label', { class: 'toggle' }, never, ' 永不过期（No expiration）')),
    h(
      'p',
      { class: 'muted small' },
      '即创建密钥时 Expiration 中的日期，可在 ',
      h('a', { href: TOKENS_URL, target: '_blank', rel: 'noopener' }, 'GitHub 的密钥列表'),
      ' 中查看（Expires on）。填写后将在到期前提醒。',
    ),
  );
  // { expiry } 或者 { error: 要说的话 }
  const read = () => {
    if (never.checked) return { expiry: { expiresAt: null, expirySource: 'never' } };
    const t = expiryFromDate(date.value);
    if (!t) return { error: '请填写密钥到期日期（或勾选「永不过期」）' };
    if (t < Date.now()) return { error: '该日期已过，请检查' };
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
    const repoInput = h('input', { class: 'input', value: `${guessOwner() || '用户名'}/wengu-data`, 'aria-label': '仓库', autocomplete: 'off', spellcheck: 'false' });
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
          if (!r) return (msg.textContent = '仓库格式应为「用户名/仓库名」');
          if (!token) return (msg.textContent = '请粘贴密钥');
          const { expiry, error } = expiryInput.read();
          if (error) return (msg.textContent = error);
          btn.disabled = true;
          msg.textContent = '正在连接……';
          try {
            if (await connect(syncer, r.owner, r.repo, token, apiBase(), expiry)) {
              toast('已连接，将自动同步');
              go('#/sync');
            } else {
              msg.textContent = '';
            }
          } catch (e) {
            msg.textContent = e instanceof SyncError ? e.message : '连接失败';
          } finally {
            btn.disabled = false;
          }
        },
      },
      '连接',
    );
    root.append(
      h('a', { class: 'back', href: '#/settings' }, '← 设置'),
      h('h1', {}, '多设备同步'),
      h('p', {}, '将卡片、图片、录音和学习进度保存到你的 GitHub 私有仓库。每台设备连接一次后，打开、修改或返回页面时会自动同步。'),
      h(
        'ol',
        { class: 'sync-steps' },
        h(
          'li',
          {},
          h('strong', {}, '创建私有仓库 '),
          h('a', { class: 'btn small', href: 'https://github.com/new?name=wengu-data&visibility=private', target: '_blank', rel: 'noopener' }, '去建仓库 ↗'),
          h('p', { class: 'muted small' }, '名称填写 wengu-data，选择 Private，勾选 Add a README file，点击 Create repository。'),
        ),
        h(
          'li',
          {},
          h('strong', {}, '创建仅限该仓库的密钥 '),
          h('a', { class: 'btn small', href: tokenUrl('wengu-data'), target: '_blank', rel: 'noopener' }, '创建密钥 ↗'),
          h(
            'p',
            { class: 'muted small' },
            'Repository access 选择 Only select repositories 并选中 wengu-data；在 Permissions 中将 Contents 设为 Read and write；记下 Expiration 日期；点击 Generate token 并复制密钥（以 github_pat_ 开头）。',
          ),
        ),
        h('li', {}, h('strong', {}, '填写信息'), h('label', { class: 'ask-label' }, '仓库（用户名/仓库名）'), repoInput, h('label', { class: 'ask-label' }, '密钥'), tokenInput, h('label', { class: 'ask-label' }, '密钥到期日期'), expiryInput.el, h('div', { class: 'row' }, btn), msg),
      ),
      h('p', { class: 'muted small' }, '密钥仅保存在本设备浏览器中，只用于读写该仓库。连接后，其他设备可通过「在手机上连接」扫码接入。'),
    );
    return { title: '多设备同步', el: root, focus: tokenInput };
  }

  // ---- 已经连上 ----
  const statusEl = h('div', { class: 'sync-status' });
  const expiryEl = h('div', { class: 'sync-expiry' });
  let lastStatus = null;
  const draw = () => {
    const st = syncer.state;
    const label = { syncing: `正在同步……${st.message ? ` ${st.message}` : ''}`, ok: '已同步', error: `同步出错：${st.message}`, idle: '等待同步', off: '未开启' }[st.status] ?? '';
    statusEl.className = `sync-status ${st.status}`;
    fill(statusEl, h('strong', {}, label), h('div', { class: 'muted small' }, `上次同步：${timeAgo(loadConfig()?.lastSyncAt)}`));
    // 只是「传到哪了」变了: 下面的不重画 (不然正在填的日期、点开的「换密钥」会被弄没)
    if (st.status === lastStatus && st.status === 'syncing') return;
    lastStatus = st.status;
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
      h('summary', {}, info ? '修改到期日期' : '填写到期日期'),
      h('p', { class: 'muted small' }, '可在 GitHub 密钥列表中查看到期日期（Expires on）。'),
      h(
        'div',
        { class: 'row' },
        h('input', {
          class: 'input',
          type: 'date',
          min: ymd(),
          'aria-label': '密钥到期日期',
          value: info ? ymd(info.at) : '',
          onchange: (e) => {
            const t = expiryFromDate(e.target.value);
            if (!t) return;
            saveConfig({ ...loadConfig(), expiresAt: t, expirySource: 'user' });
            toast('已保存');
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
              toast('已设为不再提醒');
              refresh();
            },
          },
          '密钥永不过期',
        ),
        h('a', { class: 'btn small', href: TOKENS_URL, target: '_blank', rel: 'noopener' }, 'GitHub 密钥列表 ↗'),
      ),
    );
    if (!info) {
      const unknown = `未填写密钥到期日期${c.expirySource === 'guess' ? '（此前按连接日期估算为一年，可能不准确）' : ''}。请在 GitHub 密钥列表中查看并填写，到期前将提醒。`;
      fill(expiryEl, h('div', { class: 'muted small' }, c.expirySource === 'never' ? '密钥设置为永不过期。' : unknown), editor);
      return;
    }
    const line = info.expired ? `密钥已于 ${dateText(info.at)} 过期` : info.days === 0 ? `密钥今日（${dateText(info.at)}）到期` : `密钥将于 ${dateText(info.at)} 到期，剩余 ${info.days} 天`;
    fill(
      expiryEl,
      info.warn
        ? h('div', { class: 'expiry-warn' }, h('strong', {}, info.expired ? '密钥可能已过期' : info.days === 0 ? '密钥今日到期' : `密钥将在 ${info.days} 天后到期`), h('div', { class: 'small' }, '请按下方「更换密钥」操作，数据不会丢失。'))
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
      qrSvg(link, 220) ?? h('p', {}, '无法生成二维码'),
      h('p', { class: 'small' }, '用手机相机扫描，打开后点击「连接」。'),
      h('p', { class: 'small warn' }, '二维码包含密钥，请勿分享或截图外传。'),
    );
  };

  // ---- 换密钥: 一步步来 ----
  const newToken = h('input', { class: 'input', type: 'password', placeholder: '新密钥 github_pat_……', autocomplete: 'off', 'aria-label': '新密钥' });
  const newExpiry = expiryField();
  const renewMsg = h('p', { class: 'sync-msg', 'aria-live': 'polite' });
  const renewBtn = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        const token = newToken.value.trim();
        if (!token) return (renewMsg.textContent = '请粘贴新密钥');
        const { expiry, error } = newExpiry.read();
        if (error) return (renewMsg.textContent = error);
        renewBtn.disabled = true;
        renewMsg.textContent = '正在验证新密钥……';
        try {
          if (await connect(syncer, config.owner, config.repo, token, config.api, expiry)) {
            toast('密钥已更换');
            go('#/sync');
          } else renewMsg.textContent = '';
        } catch (e) {
          renewMsg.textContent = e instanceof SyncError ? e.message : '更换失败';
        } finally {
          renewBtn.disabled = false;
        }
      },
    },
    '更换',
  );
  const renew = h(
    'details',
    { class: 'howto renew' },
    h('summary', {}, '更换密钥'),
    h('p', { class: 'small' }, '密钥到期前后均可更换，数据不会丢失，期间的修改会在更换后同步。'),
    h(
      'ol',
      { class: 'sync-steps' },
      h(
        'li',
        {},
        h('strong', {}, '在 GitHub 创建新密钥 '),
        h('a', { class: 'btn small', href: tokenUrl(config.repo, `温故同步 ${ymd()}`), target: '_blank', rel: 'noopener' }, '创建新密钥 ↗'),
        h('p', { class: 'muted small' }, `Repository access 选择 Only select repositories 并选中 ${config.repo}；在 Permissions 中将 Contents 设为 Read and write；记下 Expiration 日期；点击 Generate token 并复制密钥（以 github_pat_ 开头）。`),
      ),
      h('li', {}, h('strong', {}, '粘贴新密钥并填写到期日期'), newToken, newExpiry.el, h('div', { class: 'row' }, renewBtn), renewMsg),
      h(
        'li',
        {},
        h('strong', {}, '更新其他设备'),
        h('p', { class: 'muted small' }, '在本设备点击「在手机上连接」，用其他设备扫码即可完成更新。'),
      ),
    ),
    h('p', { class: 'muted small' }, '旧密钥可在 ', h('a', { href: TOKENS_URL, target: '_blank', rel: 'noopener' }, 'GitHub 密钥列表'), ' 中删除。'),
  );

  // ---- 清理旧历史 ----
  const historyInfo = h('p', { class: 'small' }, '正在获取仓库大小……');
  const historyMsg = h('p', { class: 'sync-msg', 'aria-live': 'polite' });
  let versions = 0;
  const loadHistoryInfo = async () => {
    try {
      const repo = new GitHubRepo(loadConfig());
      const [info, count] = await Promise.all([repo.check(), repo.commitCount()]);
      versions = count;
      const mb = (info.size ?? 0) / 1024;
      historyInfo.textContent = `仓库约 ${mb < 1 ? '< 1' : Math.round(mb)} MB，共 ${count.toLocaleString('zh-CN')} 个版本（GitHub 定期更新该数值）。`;
    } catch (e) {
      historyInfo.textContent = e instanceof SyncError ? `无法获取：${e.message}` : '无法获取仓库大小';
    }
  };
  const cleanBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        if (!confirm(`仅保留当前版本，清除此前${versions > 1 ? ` ${(versions - 1).toLocaleString('zh-CN')} 个` : '的'}版本？清除后无法恢复旧版本，当前数据不受影响。`)) return;
        cleanBtn.disabled = true;
        historyMsg.textContent = '正在同步并清理……';
        const r = await syncer.cleanHistory();
        cleanBtn.disabled = false;
        historyMsg.classList.toggle('ok', !r.error);
        historyMsg.textContent = r.error
          ? `未清理：${r.error}`
          : r.squashed
            ? '清理完成，仅保留当前版本。GitHub 通常需要数天才会释放空间。'
            : '仅有一个版本，无需清理。';
        if (r.squashed) toast('已清理历史版本');
        loadHistoryInfo();
      },
    },
    '清理历史版本',
  );
  const historyBox = h(
    'details',
    { class: 'howto history-clean', ontoggle: (e) => e.target.open && loadHistoryInfo() },
    h('summary', {}, '清理历史版本'),
    h(
      'p',
      { class: 'small' },
      '每次同步都会在 GitHub 上保存一个新版本，旧版本（包括已删除内容的图片和录音）会一直保留。',
      '旧版本不会下载到设备，只占用 GitHub 空间。',
    ),
    historyInfo,
    h(
      'ul',
      { class: 'small history-points' },
      h('li', {}, h('strong', {}, '操作：'), '同步后仅保留当前版本，清除全部旧版本。'),
      h('li', {}, h('strong', {}, '不受影响：'), '当前的卡片、进度、复习记录、图片和录音；其他设备无需重新连接。'),
      h('li', {}, h('strong', {}, '注意：'), '清理后无法恢复旧版本。建议先在「设置」中导出备份。'),
      h('li', {}, h('strong', {}, '建议：'), '仓库在 1 GB 以内无需清理；达到数百 MB 时再清理即可。'),
    ),
    h('div', { class: 'row' }, cleanBtn),
    historyMsg,
  );

  draw();
  const unsub = syncer.subscribe?.(draw);

  root.append(
    h('a', { class: 'back', href: '#/settings' }, '← 设置'),
    h('h1', {}, '多设备同步'),
    h('p', {}, '连着 ', h('a', { href: `https://github.com/${config.owner}/${config.repo}`, target: '_blank', rel: 'noopener' }, `${config.owner}/${config.repo}`), '。打开、修改或返回页面时自动同步。'),
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
            if (!confirm('断开同步？本设备的数据会保留，但不再同步。')) return;
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
    return { title: '连接', el: h('section', { class: 'empty' }, h('h1', {}, '连接链接无效'), h('a', { class: 'btn primary', href: '#/sync' }, '同步设置')) };
  }
  const msg = h('p', { class: 'sync-msg' });
  const btn = h(
    'button',
    {
      class: 'btn primary big-choice',
      onclick: async () => {
        btn.disabled = true;
        msg.textContent = '正在连接……';
        try {
          await connect(syncer, r.owner, r.repo, info.t, info.a, { expiresAt: info.e, expirySource: info.s });
          toast('已连接');
          go('#/');
        } catch (e) {
          msg.textContent = e instanceof SyncError ? e.message : '连接失败';
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
      h('p', {}, `本设备将与 ${r.owner}/${r.repo} 同步，现有数据会合并，不会丢失。`),
      h('div', { class: 'row center' }, btn, h('a', { class: 'btn', href: '#/' }, '取消')),
      msg,
    ),
  };
}
