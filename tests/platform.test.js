import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE, inApp, siteBase, onIosWeb, appLink, backdropColor } from '../js/platform.js';
import { shareUrl } from '../js/share.js';
import { keyboardCovers } from '../js/dom.js';

const root = new URL('..', import.meta.url).pathname;
const page = (url, ua = 'Mozilla/5.0 (Windows NT 10.0)', extra = {}) => {
  const { origin, pathname } = new URL(url);
  return { location: { origin, pathname }, navigator: { userAgent: ua, maxTouchPoints: 0 }, ...extra };
};
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';

test('网页里: 链接用现在打开的网址', () => {
  const win = page('https://aizhang453-hash.github.io/wengu/index.html');
  assert.equal(inApp(win), false);
  assert.equal(siteBase(win), 'https://aizhang453-hash.github.io/wengu/index.html');
  assert.equal(siteBase(page('http://localhost:8000/')), 'http://localhost:8000/');
});

test('App 里: 分享、同步的链接用网站的网址 (App 里的网址别的设备打不开)', () => {
  const win = page('wengu://app/index.html', IPHONE, { wenguApp: { platform: 'ios' } });
  assert.equal(inApp(win), true);
  assert.equal(siteBase(win), SITE);
  assert.equal(shareUrl('zABC', siteBase(win)), 'https://aizhang453-hash.github.io/wengu/#/share/zABC');
});

test('「在 App 中打开」只在 iPhone / iPad 的浏览器里出现', () => {
  assert.equal(onIosWeb(page('https://x.github.io/wengu/', IPHONE)), true);
  // iPad 的 Safari 装成 Mac, 但能多点触摸
  assert.equal(onIosWeb(page('https://x.github.io/wengu/', MAC, { navigator: { userAgent: MAC, maxTouchPoints: 5 } })), true);
  assert.equal(onIosWeb(page('https://x.github.io/wengu/', MAC)), false); // 真的 Mac
  assert.equal(onIosWeb(page('https://x.github.io/wengu/')), false); // Windows
  assert.equal(onIosWeb(page('wengu://app/index.html', IPHONE, { wenguApp: {} })), false); // 已经在 App 里
  assert.equal(appLink('#/share/zABC'), 'wengu://open#/share/zABC');
});

test('弹窗后面那层灰色的颜色: 浏览器给的几种写法都认得, 透明的不调暗', () => {
  assert.deepEqual(backdropColor('rgba(20, 18, 15, 0.55)'), [20, 18, 15, 0.55]);
  assert.deepEqual(backdropColor('rgb(20 18 15 / 45%)'), [20, 18, 15, 0.45]);
  assert.deepEqual(backdropColor('rgb(0, 0, 0)'), [0, 0, 0, 1]);
  assert.equal(backdropColor('rgba(0, 0, 0, 0)'), null);
  assert.equal(backdropColor(''), null);
  assert.equal(backdropColor(undefined), null);
});

test('键盘出来了没有: 看得到的部分矮了一大截才算, 两指放大不算', () => {
  assert.equal(keyboardCovers(778, 778), false); // 电脑、没键盘
  assert.equal(keyboardCovers(778, 400), true); // iPhone 键盘出来
  assert.equal(keyboardCovers(778, 740), false); // 地址栏缩放之类的小变化
  assert.equal(keyboardCovers(778, 300, 2), false); // 两指放大了
});

test('App 的网页文件: 照 sw.js 的名单复制, 一个不少, 别的不带', { skip: process.platform === 'win32' && 'Windows 上没有 sh' }, () => {
  const out = mkdtempSync(join(tmpdir(), 'wengu-ios-'));
  try {
    execFileSync('sh', [join(root, 'ios/copy-web.sh')], {
      env: { ...process.env, SRCROOT: join(root, 'ios'), TARGET_BUILD_DIR: out, UNLOCALIZED_RESOURCES_FOLDER_PATH: 'Wengu.app' },
      stdio: 'pipe',
    });
    const web = join(out, 'Wengu.app/web');
    const list = (dir) => readdirSync(join(web, dir)).flatMap((name) => (statSync(join(web, dir, name)).isDirectory() ? list(join(dir, name)) : [join(dir, name)]));
    const copied = list('').sort();
    const sw = readFileSync(join(root, 'sw.js'), 'utf8');
    const files = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((f) => f !== './');
    assert.deepEqual(copied, [...files].sort());
    assert.equal(readFileSync(join(web, 'index.html'), 'utf8'), readFileSync(join(root, 'index.html'), 'utf8'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
